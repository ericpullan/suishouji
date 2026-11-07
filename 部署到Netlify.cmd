@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============================================
echo   随手记 - 部署到 Netlify（含语音函数）
echo ============================================
echo.
echo 部署前，请先在 Netlify 后台添加两个环境变量：
echo    BAIDU_API_KEY     = 百度应用的 API Key
echo    BAIDU_SECRET_KEY  = 百度应用的 Secret Key
echo.
echo 位置：Site configuration - Environment variables
echo （Scope 选 All scopes，保存即可）
echo.
pause

echo.
echo [1/3] 登录 Netlify（会自动打开浏览器）...
call npx --yes netlify-cli login
if errorlevel 1 goto fail

echo.
echo [2/3] 选择你的 Netlify 站点...
call npx --yes netlify-cli link
if errorlevel 1 goto fail

echo.
echo [3/3] 发布网页和语音函数...
call npx --yes netlify-cli deploy --prod --dir .
if errorlevel 1 goto fail

echo.
echo 部署完成。
echo 验证地址：https://你的站点名.netlify.app/.netlify/functions/asr
echo 应显示 {"ready":true}
echo.
pause
exit /b 0

:fail
echo.
echo 出错了，请把上面的提示截图发给 Claude。
pause
exit /b 1
