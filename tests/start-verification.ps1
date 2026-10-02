#requires -Version 7.0

param([switch]$CheckOnly)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$nextCli = Join-Path $projectDir 'node_modules/next/dist/bin/next'
$buildId = Join-Path $projectDir '.next/BUILD_ID'

Get-Command node -ErrorAction Stop | Out-Null
if (-not (Test-Path -LiteralPath $nextCli)) { throw '未安装依赖，请先运行 pnpm install。' }
if (-not (Test-Path -LiteralPath $buildId)) { throw '没有生产构建，请先运行 pnpm build。' }

$verificationId = [guid]::NewGuid().ToString('N')
$verificationDataDir = Join-Path ([IO.Path]::GetTempPath()) "chream-verify-$verificationId"
$secretPartOne = [guid]::NewGuid().ToString('N')
$secretPartTwo = [guid]::NewGuid().ToString('N')
$verificationSecret = [string]::Concat($secretPartOne, $secretPartTwo)

if ($CheckOnly) {
	if (-not [IO.Path]::IsPathFullyQualified($verificationDataDir) -or $verificationSecret.Length -lt 32) { throw '测试环境配置无效。' }
	Write-Output 'VERIFICATION_PREFLIGHT_OK: PowerShell 7, Node, production build, isolated data path'
	return
}

New-Item -ItemType Directory -Path $verificationDataDir | Out-Null
$env:DATA_DIR = $verificationDataDir
$env:ADMIN_USERNAME = 'admin'
$env:ADMIN_PASSWORD = 'test-password-123456'
$env:SESSION_SECRET = $verificationSecret
$env:SITE_URL = 'http://127.0.0.1:2035'
$env:HTTP_PROXY = 'http://127.0.0.1:7897'
$env:HTTPS_PROXY = $env:HTTP_PROXY

Set-Location -LiteralPath $projectDir
Write-Output "隔离测试数据：$verificationDataDir"
Write-Output '验收地址：http://127.0.0.1:2035；停止服务请按 Ctrl+C。'
& node $nextCli start --port 2035 --hostname 127.0.0.1
if ($LASTEXITCODE -ne 0) { throw "测试服务启动失败，退出码：$LASTEXITCODE" }
