@echo off
cd /d "%~dp0"
echo ============================
echo   重汽三码合一程序
echo ============================
echo.
echo [1] 联机前自检
echo [2] 启动程序
echo [3] 初始化数据库（首次）
echo.
set /p choice=请选择 (1/2/3):
if "%choice%"=="1" python src\main.py --selfcheck
if "%choice%"=="2" python src\main.py
if "%choice%"=="3" python src\main.py --init-db
pause
