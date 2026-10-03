#requires -Version 7.0

$ErrorActionPreference = 'Stop'
$buildDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.next/standalone'
if (-not (Test-Path -LiteralPath (Join-Path $buildDir 'server.js'))) { throw '请先完成生产构建。' }
foreach ($name in @('data', 'data-smoke', 'data-restore-test', '.git', 'AGENTS.md', 'HANDOFF.md')) {
	if (Test-Path -LiteralPath (Join-Path $buildDir $name)) { throw "构建产物包含本地私有文件：$name" }
}
if (Get-ChildItem -LiteralPath $buildDir -Force -Filter '.env*') { throw '构建产物包含环境配置文件。' }
Write-Output 'BUILD_SAFETY_OK: no local databases, test data, environment files or handoff notes'
