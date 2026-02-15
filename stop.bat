@echo off
chcp 65001 >nul
echo 正在停止 WhichClaw 开发服务器...
echo.

REM 1. 关闭 Electron 进程
echo [*] 关闭 Electron 窗口...
taskkill /F /IM electron.exe 2>nul
if %errorlevel% equ 0 (
    echo [✓] 已关闭 Electron
) else (
    echo [!] 未找到 Electron 进程
)

REM 2. 关闭所有 Node.js 进程（包括 Vite 和后端）
echo [*] 关闭所有 Node.js 进程...
taskkill /F /IM node.exe 2>nul
if %errorlevel% equ 0 (
    echo [✓] 已关闭所有 Node.js 进程
) else (
    echo [!] 未找到 Node.js 进程
)

REM 3. 清理 PID 文件（如果存在）
if exist ".whichclaw.pid" (
    del ".whichclaw.pid"
    echo [✓] 已清理 PID 文件
)

echo.
echo ========================================
echo 所有 WhichClaw 开发进程已停止！
echo ========================================
timeout /t 2 >nul
