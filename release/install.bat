@echo off
chcp 65001 > nul
echo ==========================================
echo   OpenClaw Feishu 插件 - 一键安装脚本
echo ==========================================
echo.

:: 检查 Node.js
node --version > nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未检测到 Node.js，请先安装 Node.js
    echo    下载地址：https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js 已安装

:: 检查 openclaw
openclaw --version > nul 2>&1
if errorlevel 1 (
    echo ❌ 错误：未检测到 OpenClaw CLI
    echo    请先安装 OpenClaw：npm install -g openclaw
    pause
    exit /b 1
)
echo ✅ OpenClaw 已安装

:: 获取 OpenClaw 工作目录
for /f "tokens=*" %%a in ('openclaw config get agents.defaults.workspace') do set WORKSPACE=%%a
if "%WORKSPACE%"=="" set WORKSPACE=%USERPROFILE%\.openclaw\workspace
echo 📁 OpenClaw 工作目录：%WORKSPACE%

:: 创建插件目录
set PLUGIN_DIR=%WORKSPACE%\plugins\openclaw-feishu
if not exist "%PLUGIN_DIR%" mkdir "%PLUGIN_DIR%"

:: 复制文件
echo 📦 正在安装插件文件...
xcopy /E /I /Y "%~dp0dist" "%PLUGIN_DIR%\dist" > nul
xcopy /E /I /Y "%~dp0skills" "%PLUGIN_DIR%\skills" > nul
copy /Y "%~dp0package.json" "%PLUGIN_DIR%\package.json" > nul
copy /Y "%~dp0openclaw.plugin.json" "%PLUGIN_DIR%\openclaw.plugin.json" > nul

:: 安装依赖
echo 📦 正在安装依赖...
cd /d "%PLUGIN_DIR%"
npm install --production

if errorlevel 1 (
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

:: 创建身份映射表模板目录
set RULES_DIR=%WORKSPACE%\rules
if not exist "%RULES_DIR%" mkdir "%RULES_DIR%"

:: 创建默认身份映射表（如果不存在）
if not exist "%RULES_DIR%\feishu-identity.yaml" (
    echo --- > "%RULES_DIR%\feishu-identity.yaml"
    echo # 飞书身份映射表 >> "%RULES_DIR%\feishu-identity.yaml"
    echo # 请在此配置用户权限等级（L1/L2/L3/L0） >> "%RULES_DIR%\feishu-identity.yaml"
    echo verified_users: {} >> "%RULES_DIR%\feishu-identity.yaml"
    echo channels: >> "%RULES_DIR%\feishu-identity.yaml"
    echo "  feishu_groups: {}" >> "%RULES_DIR%\feishu-identity.yaml"
    echo ✅ 已创建默认身份映射表：%RULES_DIR%\feishu-identity.yaml
)

echo.
echo ==========================================
echo   ✅ 安装成功！
echo ==========================================
echo.
echo 📋 下一步配置：
echo    1. 编辑 %RULES_DIR%\feishu-identity.yaml 配置用户权限
echo    2. 运行 openclaw config set channels.feishu.appId "your_app_id"
echo    3. 运行 openclaw config set channels.feishu.appSecret "your_app_secret"
echo    4. 运行 openclaw config set channels.feishu.enabled true
echo    5. 重启 OpenClaw
echo.
pause
