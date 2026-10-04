#requires -Version 7.0
param([string]$Base = 'http://127.0.0.1:2035', [string]$Rsshub = 'http://127.0.0.1:1200')

$ErrorActionPreference = 'Stop'
$proxy = 'http://127.0.0.1:7897'
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$headers = @{ Origin = $Base }
function Post($name, $body) {
	return (Invoke-RestMethod -Uri "$Base/api/manage/$name" -Method Post -Headers $headers -ContentType 'application/json' -Body ($body | ConvertTo-Json -Depth 20 -Compress) -Proxy $proxy -WebSession $session).result
}
foreach ($action in @('save-rss-settings', 'check-rsshub', 'zhihu-login-start', 'zhihu-login-status', 'zhihu-login-pointer', 'zhihu-login-complete', 'zhihu-login-cancel')) {
	try { Post $action @{} | Out-Null; throw '未登录访问配置操作被允许' }
	catch { if ([int]$_.Exception.Response.StatusCode -ne 401) { throw } }
}
Post 'login' @{ username = 'admin'; password = 'test-password-123456' } | Out-Null
$initial = Invoke-RestMethod -Uri "$Base/api/manage/rss" -Proxy $proxy -WebSession $session
if ($initial.configuration.cookieConfigured -or $initial.configuration.fetchProxyConfigured) { throw '仅对 Cookie 和网站下载代理均为空的隔离实例运行此烟测' }
foreach ($action in @('save-rss-settings', 'check-rsshub', 'zhihu-login-start', 'zhihu-login-status', 'zhihu-login-pointer', 'zhihu-login-complete', 'zhihu-login-cancel')) {
	try { Invoke-RestMethod -Uri "$Base/api/manage/$action" -Method Post -Headers @{ Origin = 'https://invalid.example' } -ContentType 'application/json' -Body '{}' -Proxy $proxy -WebSession $session | Out-Null; throw '非法来源被允许' }
	catch { if ([int]$_.Exception.Response.StatusCode -ne 403) { throw } }
}
try {
	$loaded = Post 'save-rss-settings' @{ url = $Rsshub; zhihuCookies = 'd_c0=settings-smoke-cookie'; fetchProxy = 'http://smoke-user:settings-smoke-proxy@127.0.0.1:7897' }
	if (-not $loaded.applied -or -not $loaded.configuration.cookieConfigured) { throw 'RSSHub 未加载新配置' }
	$masked = Invoke-RestMethod -Uri "$Base/api/manage/rss" -Proxy $proxy -WebSession $session
	if (($masked | ConvertTo-Json -Depth 20) -match 'settings-smoke-cookie|settings-smoke-proxy|smoke-user') { throw '敏感配置被回显' }
	foreach ($action in @('data', 'backup')) {
		$result = Invoke-WebRequest -Uri "$Base/api/manage/$action" -Proxy $proxy -WebSession $session
		if ($result.Content -match 'settings-smoke-cookie|settings-smoke-proxy') { throw 'Cookie 或代理凭据进入普通数据/备份' }
	}
	foreach ($invalid in @(@{ zhihuCookies = "d_c0=value`r`nX-Injected: value" }, @{ fetchProxy = 'file:///private' })) {
		$invalid.url = $Rsshub
		try { Post 'save-rss-settings' $invalid | Out-Null; throw '非法配置被允许' }
		catch { if ([int]$_.Exception.Response.StatusCode -ne 400) { throw } }
	}
	$preserved = Post 'save-rss-settings' @{ url = $Rsshub; zhihuCookies = ''; fetchProxy = '' }
	if (-not $preserved.configuration.cookieConfigured -or -not $preserved.configuration.fetchProxyConfigured) { throw '空字段覆盖了已保存配置' }
	$cleared = Post 'save-rss-settings' @{ url = $Rsshub; clearCookie = $true; clearFetchProxy = $true }
	if (-not $cleared.applied -or $cleared.configuration.cookieConfigured -or $cleared.configuration.fetchProxyConfigured) { throw '配置清空或重新加载失败' }
	if (-not (Post 'check-rsshub' @{ url = $Rsshub }).applied) { throw '配置状态错误' }
	Write-Output 'RSS_SETTINGS_SMOKE_OK: auth, CSRF, validation, masked secrets, excluded backups, preserve/clear and Docker runtime application'
} finally {
	Post 'save-rss-settings' @{ url = $Rsshub; clearCookie = $true; clearFetchProxy = $true } | Out-Null
	Post 'save-rsshub' @{ url = $initial.rsshubUrl } | Out-Null
}
