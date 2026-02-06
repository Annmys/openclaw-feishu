# 打包脚本 - 创建发布版本
param(
    [string]$Version = "0.2.0"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw Feishu 插件 - 打包脚本" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$releaseDir = Join-Path $scriptDir "release"
$distDir = Join-Path $scriptDir "dist"

# 检查编译输出
if (-not (Test-Path $distDir)) {
    Write-Host "❌ 错误：未找到编译输出 dist 目录" -ForegroundColor Red
    Write-Host "   请先运行：npm run build" -ForegroundColor Yellow
    exit 1
}

# 确保 release 目录存在
if (-not (Test-Path $releaseDir)) {
    New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
}

# 清理旧文件
Write-Host "🧹 清理旧文件..." -ForegroundColor Blue
Remove-Item -Path "$releaseDir\*" -Recurse -Force -ErrorAction SilentlyContinue

# 复制编译输出
Write-Host "📦 复制编译文件..." -ForegroundColor Blue
Copy-Item -Path $distDir -Destination "$releaseDir\dist" -Recurse -Force
Copy-Item -Path "$scriptDir\skills" -Destination "$releaseDir\skills" -Recurse -Force
Copy-Item -Path "$scriptDir\package.json" -Destination "$releaseDir\package.json" -Force
Copy-Item -Path "$scriptDir\openclaw.plugin.json" -Destination "$releaseDir\openclaw.plugin.json" -Force
Copy-Item -Path "$scriptDir\README.md" -Destination "$releaseDir\README.md" -Force
Copy-Item -Path "$scriptDir\LICENSE" -Destination "$releaseDir\LICENSE" -Force

# 创建发布版 package.json
$packageJson = @"
{
  "name": "@Annmys/openclaw-feishu",
  "version": "$Version",
  "type": "module",
  "description": "OpenClaw飞书插件 - 中央权限版 | 支持动态Agent创建与主控监控",
  "license": "MIT",
  "files": ["dist", "skills", "openclaw.plugin.json"],
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "openclaw": {
    "extensions": ["./dist/index.js"],
    "channel": {
      "id": "feishu",
      "label": "Feishu",
      "selectionLabel": "Feishu/Lark (飞书)",
      "docsPath": "/channels/feishu",
      "docsLabel": "feishu",
      "blurb": "飞书/Lark enterprise messaging with central auth.",
      "aliases": ["lark"],
      "order": 70
    }
  },
  "dependencies": {
    "@larksuiteoapi/node-sdk": "^1.56.1",
    "@sinclair/typebox": "^0.34.48",
    "js-yaml": "^4.1.0",
    "zod": "^4.3.6"
  },
  "peerDependencies": {
    "openclaw": ">=2026.1.29"
  }
}
"@
$packageJson | Out-File -FilePath "$releaseDir\package.json" -Encoding UTF8

# 创建安装脚本
Write-Host "📝 创建安装脚本..." -ForegroundColor Blue

# install.bat
$installBat = @'
@echo off
chcp 65001 > nul
echo ==========================================
echo   OpenClaw Feishu 插件 - 一键安装脚本
echo ==========================================
echo.
node --version > nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未检测到 Node.js，请先安装 Node.js
    pause
    exit /b 1
)
echo ✅ Node.js 已安装
openclaw --version > nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未检测到 OpenClaw CLI
    echo    请先安装：npm install -g openclaw
    pause
    exit /b 1
)
echo ✅ OpenClaw 已安装
for /f "tokens=*" %%a in ('openclaw config get agents.defaults.workspace') do set WORKSPACE=%%a
if "%WORKSPACE%"=="" set WORKSPACE=%USERPROFILE%\.openclaw\workspace
echo 📁 工作目录：%WORKSPACE%
set PLUGIN_DIR=%WORKSPACE%\plugins\openclaw-feishu
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"
echo 📦 安装插件...
xcopy /E /I /Y "%~dp0dist" "%PLUGIN_DIR%\dist" > nul
xcopy /E /I /Y "%~dp0skills" "%PLUGIN_DIR%\skills" > nul
copy /Y "%~dp0package.json" "%PLUGIN_DIR%" > nul
copy /Y "%~dp0openclaw.plugin.json" "%PLUGIN_DIR%" > nul
cd /d "%PLUGIN_DIR%"
npm install --production
if errorlevel 1 (
    echo ❌ 安装失败
    pause
    exit /b 1
)
echo ✅ 安装成功！
echo.
echo 请配置：openclaw config set channels.feishu.appId "xxx"
pause
'@
$installBat | Out-File -FilePath "$releaseDir\install.bat" -Encoding UTF8

# 复制现有 install.ps1
Copy-Item -Path "$scriptDir\release\install.ps1" -Destination "$releaseDir\install.ps1" -Force
Copy-Item -Path "$scriptDir\release\README-INSTALL.md" -Destination "$releaseDir\README-INSTALL.md" -Force

# 打包成 ZIP
$zipFile = "$scriptDir\openclaw-feishu-v$Version.zip"
Write-Host "📦 创建 ZIP 包..." -ForegroundColor Blue

# 使用 Compress-Archive
if (Test-Path $zipFile) {
    Remove-Item $zipFile -Force
}
Compress-Archive -Path "$releaseDir\*" -DestinationPath $zipFile -Force

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  ✅ 打包完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📦 文件：$zipFile" -ForegroundColor Yellow
Write-Host "📦 大小：$([math]::Round((Get-Item $zipFile).Length / 1MB, 2)) MB" -ForegroundColor Yellow
Write-Host ""
Write-Host "🚀 使用方法：" -ForegroundColor Cyan
Write-Host "   1. 解压 $zipFile" -ForegroundColor White
Write-Host "   2. 运行 install.bat 或 install.ps1" -ForegroundColor White
Write-Host ""
