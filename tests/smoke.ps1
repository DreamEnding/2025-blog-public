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
Post 'login' @{ username = $Username; password = $Password } | Out-Null
$initial = Invoke-RestMethod -Uri "$Base/api/manage/data" -Proxy $proxy -WebSession $session
if ($initial.sections.Count -lt 5) { throw '初始栏目数量错误' }
$sectionId = [int](Post 'create-section' @{ name = '测试分组'; kind = 'docs'; parent_id = [int]$initial.sections[0].id })
$entryId = [int](Post 'create-entry' @{ section_id = $sectionId; title = '测试文档' })
Post 'save-entry' @{ id = $entryId; section_id = $sectionId; title = '测试文档'; summary = '摘要'; body = '# 开始`n`n旧版公开正文'; position = 0 } | Out-Null
$hidden = Invoke-WebRequest -Uri "$Base/docs/$entryId" -Proxy $proxy -SkipHttpErrorCheck
if ($hidden.StatusCode -ne 404) { throw '草稿公开了' }
Post 'publish-entry' @{ id = $entryId } | Out-Null
$published = Invoke-WebRequest -Uri "$Base/docs/$entryId" -Proxy $proxy
if ($published.StatusCode -ne 200 -or $published.Content -notmatch '测试文档') { throw '发布失败' }
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
$imagePath = Join-Path $env:TEMP 'docs-smoke.png'
[IO.File]::WriteAllBytes($imagePath, [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lXcAAAAASUVORK5CYII='))
try {
	$cookie = $session.Cookies.GetCookies($Base) | Where-Object Name -eq 'site_admin' | Select-Object -First 1
	$upload = curl.exe --silent --show-error --proxy $proxy --cookie "site_admin=$($cookie.Value)" --header "Origin: $Base" --form "file=@$imagePath;type=image/png" "$Base/api/manage/upload" | ConvertFrom-Json
	if (-not $upload.url) { throw '图片上传失败' }
	$image = Invoke-WebRequest -Uri "$Base$($upload.url)" -Proxy $proxy
	if ($image.StatusCode -ne 200) { throw '图片读取失败' }
} finally { Remove-Item -LiteralPath $imagePath -Force }
$backup = Invoke-RestMethod -Uri "$Base/api/manage/backup" -Proxy $proxy -WebSession $session
if ($backup.entries.Count -ne ($initial.entries.Count + 1) -or $backup.images.PSObject.Properties.Count -lt 1) { throw '备份内容不完整' }
Post 'withdraw-entry' @{ id = $entryId } | Out-Null
$hidden = Invoke-WebRequest -Uri "$Base/docs/$entryId" -Proxy $proxy -SkipHttpErrorCheck
if ($hidden.StatusCode -ne 404) { throw '撤回失败' }
Post 'delete-entry' @{ id = $entryId } | Out-Null
Post 'delete-section' @{ id = $sectionId } | Out-Null
Post 'restore-backup' @{ confirm = '覆盖全部数据'; backup = $backup } | Out-Null
$restored = Invoke-RestMethod -Uri "$Base/api/manage/data" -Proxy $proxy -WebSession $session
if ($restored.entries.Count -ne ($initial.entries.Count + 1) -or $restored.sections.Count -ne ($initial.sections.Count + 1)) { throw '备份恢复失败' }
Write-Output 'SMOKE_OK: auth, draft, publish, search, restore version, upload, withdraw, backup restore'
