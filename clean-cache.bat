@echo off
echo 正在清理 Electron 缓存...

REM 清理 Electron 用户数据缓存
set CACHE_DIR=%APPDATA%\WhichClaw
if exist "%CACHE_DIR%" (
    echo [*] 删除缓存目录: %CACHE_DIR%
    rd /s /q "%CACHE_DIR%"
    echo [✓] 缓存已清理
) else (
    echo [!] 未找到缓存目录
)

REM 清理临时缓存
set TEMP_CACHE=%TEMP%\WhichClaw
if exist "%TEMP_CACHE%" (
    echo [*] 删除临时缓存: %TEMP_CACHE%
    rd /s /q "%TEMP_CACHE%"
    echo [✓] 临时缓存已清理
)

echo.
echo ========================================
echo 缓存清理完成！
echo 现在可以重新启动应用了
echo ========================================
pause
