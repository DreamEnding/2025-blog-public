#requires -Version 7.0
param([string]$Base = 'http://127.0.0.1:2035')

$ErrorActionPreference = 'Stop'
$proxy = 'http://127.0.0.1:7897'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$headers = @{ Origin = $Base }
function Post($name, $body) {
	return (Invoke-RestMethod -Uri "$Base/api/manage/$name" -Method Post -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 40 -Compress) -Proxy $proxy -WebSession $session).result
}
foreach ($action in @('rss', 'images')) {
	try { Invoke-RestMethod -Uri "$Base/api/manage/$action" -Proxy $proxy | Out-Null; throw '未登录读取被允许' }
	catch { if ([int]$_.Exception.Response.StatusCode -ne 401) { throw } }
}
foreach ($action in @('save-rsshub', 'save-rss-settings', 'check-rsshub', 'save-subscription', 'delete-subscription', 'refresh-subscription', 'preview-rss-item', 'import-rss-item', 'import-image', 'localize-images')) {
	try { Post $action @{} | Out-Null; throw '未登录写入被允许' }
	catch { if ([int]$_.Exception.Response.StatusCode -ne 401) { throw } }
}
Post 'login' @{ username = 'admin'; password = 'test-password-123456' } | Out-Null
$initial = Invoke-RestMethod -Uri "$Base/api/manage/backup" -Proxy $proxy -WebSession $session
try {
	Post 'save-rsshub' @{ url = 'http://127.0.0.1:2037' } | Out-Null
	$subscriptionId = [int](Post 'save-subscription' @{ name = '摘录流程验收'; url = '/feed' })
	Post 'refresh-subscription' @{ id = $subscriptionId } | Out-Null
	Post 'refresh-subscription' @{ id = $subscriptionId } | Out-Null
	$rss = Invoke-RestMethod -Uri "$Base/api/manage/rss?subscription=$subscriptionId" -Proxy $proxy -WebSession $session
	if ($rss.items.Count -ne 1 -or $rss.items[0].author -ne '验收作者') { throw '候选列表错误' }
	$itemId = [int]$rss.items[0].id
	$preview = Post 'preview-rss-item' @{ id = $itemId }
	if ($preview.body -notmatch '```python' -or $preview.body -notmatch '\$E=mc\^2\$' -or $preview.body -notmatch '来源：') { throw 'Markdown 转换或来源错误' }
	$result = Post 'import-rss-item' @{ id = $itemId }
	$entryId = [int]$result.id
	if ($result.warnings.Count -ne 1) { throw '图片失败未反馈' }
	$duplicate = Post 'import-rss-item' @{ id = $itemId }
	if ($duplicate.id -ne $entryId -or -not $duplicate.existing) { throw '重复导入错误' }
	$hidden = Invoke-WebRequest -Uri "$Base/articles/$entryId" -Proxy $proxy -SkipHttpErrorCheck
	if ($hidden.StatusCode -ne 404) { throw '导入草稿被公开' }
	Post 'publish-entry' @{ id = $entryId } | Out-Null
	$public = Invoke-WebRequest -Uri "$Base/articles/$entryId" -Proxy $proxy
	if ($public.Content -notmatch 'Hello, RSSHub' -or $public.Content -notmatch '<table>' -or $public.Content -notmatch 'katex') { throw '公开正文格式错误' }
	$all = Invoke-RestMethod -Uri "$Base/api/manage/data" -Proxy $proxy -WebSession $session
	$draft = $all.entries | Where-Object id -eq $entryId
	$draft.body = '编辑后的新草稿'
	Post 'save-entry' $draft | Out-Null
	Post 'import-rss-item' @{ id = $itemId } | Out-Null
	$all = Invoke-RestMethod -Uri "$Base/api/manage/data" -Proxy $proxy -WebSession $session
	if (($all.entries | Where-Object id -eq $entryId).body -ne '编辑后的新草稿') { throw '重复导入覆盖编辑内容' }
	$backup = Invoke-RestMethod -Uri "$Base/api/manage/backup" -Proxy $proxy -WebSession $session
	if ($backup.version -ne 4 -or $backup.rssItems.Count -ne 1) { throw 'RSS 备份不完整' }
	Post 'delete-subscription' @{ id = $subscriptionId } | Out-Null
	Post 'restore-backup' @{ confirm = '覆盖全部数据'; backup = $backup } | Out-Null
	$rss = Invoke-RestMethod -Uri "$Base/api/manage/rss?subscription=$subscriptionId" -Proxy $proxy -WebSession $session
	if ($rss.items[0].entry_id -ne $entryId -or $rss.rsshubUrl -ne 'http://127.0.0.1:2037') { throw '订阅及来源关联恢复失败' }
	Post 'withdraw-entry' @{ id = $entryId } | Out-Null
	$hidden = Invoke-WebRequest -Uri "$Base/articles/$entryId" -Proxy $proxy -SkipHttpErrorCheck
	if ($hidden.StatusCode -ne 404) { throw '下架后仍可访问' }
	$siteRss = Invoke-WebRequest -Uri "$Base/rss.xml" -Proxy $proxy
	if ($siteRss.Content -match 'RSSHub 技术文章摘录验收') { throw '下架文章仍在本站 RSS' }
	Post 'publish-entry' @{ id = $entryId } | Out-Null
	$legacy = $initial | ConvertTo-Json -Depth 40 | ConvertFrom-Json
	$legacy.version = 3
	$legacy.PSObject.Properties.Remove('rssSubscriptions')
	$legacy.PSObject.Properties.Remove('rssItems')
	Post 'restore-backup' @{ confirm = '覆盖全部数据'; backup = $legacy } | Out-Null
	$restored = Invoke-RestMethod -Uri "$Base/api/manage/rss" -Proxy $proxy -WebSession $session
	if ($restored.subscriptions.Count -ne 0) { throw '旧备份恢复失败' }
	Write-Output 'RSS_SMOKE_OK: auth, feed refresh, Markdown preview, image warnings, import, deduplication, draft isolation, publish, edit, backup v4/v3, withdraw and republish'
} finally {
	Post 'restore-backup' @{ confirm = '覆盖全部数据'; backup = $initial } | Out-Null
}
