param(
	[string]$Base = 'http://127.0.0.1:2025',
	[string]$Username = $(if ($env:ADMIN_USERNAME) { $env:ADMIN_USERNAME } else { 'admin' }),
	[string]$Password = $(if ($env:ADMIN_PASSWORD) { $env:ADMIN_PASSWORD } else { 'test-password-123456' })
)

$ErrorActionPreference = 'Stop'
$proxy = 'http://127.0.0.1:7897'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$headers = @{ Origin = $Base }

function Post($name, $body) {
	$result = Invoke-RestMethod -Uri "$Base/api/manage/$name" -Method Post -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 30 -Compress) -Proxy $proxy -WebSession $session
	return $result.result
}

$landing = Invoke-WebRequest -Uri $Base -Proxy $proxy -WebSession $session
$docs = Invoke-WebRequest -Uri "$Base/docs" -Proxy $proxy -WebSession $session
if ($landing.StatusCode -ne 200 -or $docs.StatusCode -ne 200 -or $docs.Content -notmatch 'API 文档') { throw '首页或文档入口失败' }
try { Invoke-RestMethod -Uri "$Base/api/manage/data" -Proxy $proxy -WebSession $session | Out-Null; throw '未登录访问被允许' } catch { if ([int]$_.Exception.Response.StatusCode -ne 401) { throw } }
foreach ($protectedAction in @('save-entry', 'publish-entry', 'upload', 'restore-backup')) {
	try { Post $protectedAction @{} | Out-Null; throw "$protectedAction 未登录写入被允许" } catch { if ([int]$_.Exception.Response.StatusCode -ne 401) { throw } }
}
Post 'login' @{ username = $Username; password = $Password } | Out-Null
foreach ($invalidOrigin in @('https://invalid.example', 'null', '')) {
	$invalidHeaders = if ($invalidOrigin) { @{ Origin = $invalidOrigin } } else { @{} }
	try { Invoke-RestMethod -Uri "$Base/api/manage/save-entry" -Method Post -Headers $invalidHeaders -ContentType 'application/json' -Body '{}' -Proxy $proxy -WebSession $session | Out-Null; throw '非法来源写入被允许' } catch { if ([int]$_.Exception.Response.StatusCode -ne 403) { throw } }
}
$initial = Invoke-RestMethod -Uri "$Base/api/manage/data" -Proxy $proxy -WebSession $session
$initialBackup = Invoke-RestMethod -Uri "$Base/api/manage/backup" -Proxy $proxy -WebSession $session
if ($initial.sections.Count -ne 3) { throw '初始栏目数量错误' }
$sectionId = [int]($initial.sections | Where-Object name -eq 'AI 技术分享').id
$tutorialId = [int]($initial.sections | Where-Object name -eq '使用教程').id
try { Post 'create-entry' @{ section_id = $tutorialId; title = '第二篇教程' } | Out-Null; throw '教程单篇限制未生效' } catch { if ([int]$_.Exception.Response.StatusCode -ne 400) { throw } }
$entryId = [int](Post 'create-entry' @{ section_id = $sectionId; title = '测试文档' })
Post 'save-entry' @{ id = $entryId; section_id = $sectionId; title = '测试文档'; summary = '摘要'; body = "## 开始`n`n旧版公开正文"; position = 0 } | Out-Null
$anonymousAdmin = Invoke-WebRequest -Uri "$Base/admin" -Proxy $proxy
$anonymousWriter = Invoke-WebRequest -Uri "$Base/write" -Proxy $proxy
if ($anonymousAdmin.Content -match '旧版公开正文' -or $anonymousWriter.Content -match '旧版公开正文') { throw '后台初始数据泄露给未登录访问者' }
$hidden = Invoke-WebRequest -Uri "$Base/articles/$entryId" -Proxy $proxy -SkipHttpErrorCheck
if ($hidden.StatusCode -ne 404) { throw '草稿公开了' }
Post 'publish-entry' @{ id = $entryId } | Out-Null
$published = Invoke-WebRequest -Uri "$Base/articles/$entryId" -Proxy $proxy
if ($published.StatusCode -ne 200 -or $published.Content -notmatch '测试文档') { throw '发布失败' }
if ($published.Content -notmatch '<h2 id="开始">开始</h2>' -or $published.Content -notmatch '<p>旧版公开正文</p>') { throw '正文未服务端渲染' }
if ($published.Content -notmatch '<html[^>]+lang="zh-CN"' -or $published.Content -notmatch '<title>测试文档 \| Chream</title>') { throw '页面语言或标题错误' }
Post 'save-entry' @{ id = $entryId; section_id = $sectionId; title = '测试文档'; summary = '新版摘要'; body = '新版草稿正文'; position = 0 } | Out-Null
$search = Invoke-WebRequest -Uri "$Base/search?q=%E6%96%B0%E7%89%88" -Proxy $proxy
if ($search.Content -match '新版摘要') { throw '草稿进入搜索' }
$record = Invoke-RestMethod -Uri "$Base/api/manage/data" -Proxy $proxy -WebSession $session
if (($record.entries | Where-Object id -eq $entryId).public_body -notmatch '旧版公开正文') { throw '保存草稿修改了公开版' }
Post 'publish-entry' @{ id = $entryId } | Out-Null
$search = Invoke-WebRequest -Uri "$Base/search?q=%E6%96%B0%E7%89%88" -Proxy $proxy
if ($search.Content -notmatch '新版草稿正文') { throw '新发布内容未进入搜索' }
Post 'restore-entry' @{ id = $entryId } | Out-Null
$record = Invoke-RestMethod -Uri "$Base/api/manage/data" -Proxy $proxy -WebSession $session
if (($record.entries | Where-Object id -eq $entryId).public_body -notmatch '旧版公开正文') { throw '恢复失败' }
$imagePath = Join-Path $env:TEMP "docs-smoke-$([guid]::NewGuid()).png"
[IO.File]::WriteAllBytes($imagePath, [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII='))
try {
	$cookie = $session.Cookies.GetCookies($Base) | Where-Object Name -eq 'site_admin' | Select-Object -First 1
	$invalidUpload = curl.exe --silent --show-error --proxy $proxy --cookie "site_admin=$($cookie.Value)" --header "Origin: $Base" --form "file=@$imagePath;type=image/svg+xml" "$Base/api/manage/upload" | ConvertFrom-Json
	if (-not $invalidUpload.error -or $invalidUpload.url) { throw 'SVG 上传未被拒绝' }
	$upload = curl.exe --silent --show-error --proxy $proxy --cookie "site_admin=$($cookie.Value)" --header "Origin: $Base" --form "file=@$imagePath;type=image/png" "$Base/api/manage/upload" | ConvertFrom-Json
	if (-not $upload.url) { throw '图片上传失败' }
	$image = Invoke-WebRequest -Uri "$Base$($upload.url)" -Proxy $proxy
	if ($image.StatusCode -ne 200) { throw '图片读取失败' }
} finally { Remove-Item -LiteralPath $imagePath -Force }
Post 'save-settings' @{ name = '烟测站点'; username = '烟测作者'; intro = '烟测站点介绍'; logo = $upload.url; consoleUrl = ''; apiKeyUrl = ''; analyticsId = ''; githubUrl = ''; email = ''; juejinUrl = '' } | Out-Null
$config = Invoke-RestMethod -Uri "$Base/api/legacy?path=src/config/site-content.json" -Proxy $proxy
if ($config.meta.title -ne '烟测站点' -or $config.logo -ne $upload.url) { throw '后台设置未同步首页配置' }
$tutorial = Invoke-WebRequest -Uri "$Base/tutorials" -Proxy $proxy
if ($tutorial.Content -notmatch '<title>Nexus AI 使用教程 \| 烟测站点</title>' -or $tutorial.Content -notmatch '<h2 id="准备工作">准备工作</h2>') { throw '站点设置或教程首屏未生效' }
$backup = Invoke-RestMethod -Uri "$Base/api/manage/backup" -Proxy $proxy -WebSession $session
if ($backup.entries.Count -ne ($initial.entries.Count + 1) -or $backup.images.PSObject.Properties.Count -lt 1) { throw '备份内容不完整' }
Post 'withdraw-entry' @{ id = $entryId } | Out-Null
$hidden = Invoke-WebRequest -Uri "$Base/articles/$entryId" -Proxy $proxy -SkipHttpErrorCheck
if ($hidden.StatusCode -ne 404) { throw '撤回失败' }
Post 'delete-entry' @{ id = $entryId } | Out-Null
Post 'restore-backup' @{ confirm = '覆盖全部数据'; backup = $backup } | Out-Null
$restored = Invoke-RestMethod -Uri "$Base/api/manage/data" -Proxy $proxy -WebSession $session
if ($restored.entries.Count -ne ($initial.entries.Count + 1) -or $restored.sections.Count -ne 3) { throw '备份恢复失败' }
$invalidBackup = $backup | ConvertTo-Json -Depth 30 | ConvertFrom-Json
$duplicateTutorial = $initial.entries | Where-Object section_id -eq $tutorialId | ConvertTo-Json -Depth 30 | ConvertFrom-Json
$duplicateTutorial.id = 999999
$invalidBackup.entries += $duplicateTutorial
try { Post 'restore-backup' @{ confirm = '覆盖全部数据'; backup = $invalidBackup } | Out-Null; throw '重复教程备份被允许' } catch { if ([int]$_.Exception.Response.StatusCode -ne 400) { throw } }
Post 'restore-backup' @{ confirm = '覆盖全部数据'; backup = $initialBackup } | Out-Null
Write-Output 'SMOKE_OK: auth, CSRF, private admin SSR, single tutorial, draft, publish, SSR, metadata, search, settings, restore version, upload type checks, withdraw, backup restore'
