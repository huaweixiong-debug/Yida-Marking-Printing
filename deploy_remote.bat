@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   重汽三码合一程序 - 远程电脑首次部署
echo ============================================================
echo.
echo 步骤 1/3：初始化数据库
echo ============================================================
python src\main.py --init-db
if %errorlevel% neq 0 (
    echo [FAIL] 数据库初始化失败，请检查 Python 是否已安装。
    pause
    exit /b 1
)
echo [OK] 数据库初始化完成。
echo.

echo 步骤 2/3：联机前自检
echo ============================================================
python src\main.py --selfcheck
if %errorlevel% neq 0 (
    echo [WARN] 自检有提示，请查看上方输出。
)
echo.

echo 步骤 3/3：创建输出目录
echo ============================================================
if not exist "output\laser" mkdir "output\laser"
echo   output\laser -- 就绪 ^(激光 TXT 输出^)
if not exist "output\labels" mkdir "output\labels"
echo   output\labels -- 就绪 ^(标签 ZPL 输出^)

echo.
echo ============================================================
echo   部署完成！
echo.
echo   下一步：双击 run.bat 启动程序
echo   选 [1] 随时重新自检
echo   选 [2] 正常启动
echo ============================================================
pause
