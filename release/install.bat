@echo off
chcp 65001 > nul
echo ==========================================
echo   OpenClaw Feishu 插件 - 一键安装脚本
echo ==========================================
echo.

:: 检查 Node.js
node --version > nul 2>&1
if errorlevel 1 (
    echo [31m❌ 错误：未检测到 Node.js，请先安装 Node.js[0m
    echo    下载地址：https://nodejs.org/
    pause
    exit /b 1
)
echo [32m✅ Node.js 已安装[0m

:: 检查 openclaw
openclaw --version > nul 2>&1
if errorlevel 1 (
    echo [31m❌ 错误：未检测到 OpenClaw CLI[0m
    echo    请先安装：npm install -g openclaw
    pause
    exit /b 1
)
echo [32m✅ OpenClaw 已安装[0m

:: 获取 OpenClaw 工作目录
for /f "tokens=*" %%a in ('openclaw config get agents.defaults.workspace') do set WORKSPACE=%%a
if "%WORKSPACE%"=="" set WORKSPACE=%USERPROFILE%\.openclaw\workspace
echo [36m📁 OpenClaw 工作目录：%WORKSPACE%[0m

:: 创建插件目录
set PLUGIN_DIR=%WORKSPACE%\plugins\openclaw-feishu
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"

:: 复制文件
echo [36m📦 正在安装插件文件...[0m
xcopy /E /I /Y "%~dp0dist" "%PLUGIN_DIR%\dist" > nul
xcopy /E /I /Y "%~dp0skills" "%PLUGIN_DIR%\skills" > nul
xcopy /E /I /Y "%~dp0examples" "%PLUGIN_DIR%\examples" > nul
copy /Y "%~dp0package.json" "%PLUGIN_DIR%\package.json" > nul
copy /Y "%~dp0openclaw.plugin.json" "%PLUGIN_DIR%\openclaw.plugin.json" > nul
copy /Y "%~dp0README.md" "%PLUGIN_DIR%\README.md" > nul
copy /Y "%~dp0INSTALL.md" "%PLUGIN_DIR%\INSTALL.md" > nul
copy /Y "%~dp0LICENSE" "%PLUGIN_DIR%\LICENSE" > nul

:: 安装依赖
echo [36m📦 正在安装依赖...[0m
cd /d "%PLUGIN_DIR%"
npm install --production

if errorlevel 1 (
    echo [31m❌ 依赖安装失败[0m
    pause
    exit /b 1
)

echo [32m✅ 依赖安装成功[0m

:: 创建身份映射表模板目录
set RULES_DIR=%WORKSPACE%\rules
if not exist "%RULES_DIR%" mkdir "%RULES_DIR%"

:: 复制示例身份映射表（如果不存在）
if not exist "%RULES_DIR%\feishu-identity.yaml" (
    copy /Y "%~dp0examples\feishu-identity.yaml" "%RULES_DIR%\feishu-identity.yaml" > nul
    echo [32m✅ 已创建默认身份映射表：%RULES_DIR%\feishu-identity.yaml[0m
    echo [33m⚠️  请编辑此文件，配置您的用户权限[0m
) else (
    echo [36mℹ️  身份映射表已存在，跳过创建[0m
)

echo.
echo ==========================================
echo   [32m✅ 安装成功！[0m
echo ==========================================
echo.
echo 📋 下一步配置：
echo    1. 编辑 %RULES_DIR%\feishu-identity.yaml 配置用户权限
echo    2. 运行 openclaw config set channels.feishu.appId "your_app_id"
echo    3. 运行 openclaw config set channels.feishu.appSecret "your_app_secret"
echo    4. 运行 openclaw config set channels.feishu.enabled true
echo    5. 重启 OpenClaw
echo.
echo 📖 详细文档：%PLUGIN_DIR%\INSTALL.md
echo.
pause
