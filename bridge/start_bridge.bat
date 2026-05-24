@echo off
chcp 65001 >nul
cd /d "%~dp0\.."
echo === Lmc1Bridge Stub ===
echo 启动 32位 bridge 进程...
echo.
tools\py32\python.exe bridge\bridge_stub.py --port 9701
pause
