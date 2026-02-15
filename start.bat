@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ========================================
echo    WhichClaw Development Server
echo ========================================
echo.

REM 清理旧的 PID 文件
if exist ".whichclaw.pid" del ".whichclaw.pid"

REM 编译（与 npm run dev 一致的流程）
echo [*] 复制配置文件...
call npx node scripts/copy-config.mjs
echo [*] 编译 Tools 代码...
call npx node scripts/build-tools.mjs
echo [*] 编译 Electron 主进程...
call npx node scripts/build-main.mjs
if %errorlevel% neq 0 (
    echo [X] 编译失败！
    pause
    exit /b 1
)
echo [✓] 编译完成

echo.
echo [*] 启动开发服务器...

REM 在新窗口启动 Vite
start "WhichClaw-Vite" cmd /c "npx vite"

REM 等待 Vite 启动
echo [*] 等待 Vite 服务器...
timeout /t 3 /nobreak >nul

REM 启动 Electron
start "WhichClaw-Electron" cmd /c "npx electron ."

echo.
echo ========================================
echo [✓] WhichClaw 开发服务器已启动！
echo     Vite: http://localhost:5173
echo     使用 stop.bat 来停止所有服务
echo ========================================
timeout /t 2 >nul
