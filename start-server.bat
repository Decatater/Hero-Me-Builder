@echo off
echo Starting PHP server on 0.0.0.0:8000...
echo.
echo Server will be accessible at:
echo   - http://localhost:8000
echo   - http://127.0.0.1:8000
echo   - http://[your-local-ip]:8000
echo.
echo Press Ctrl+C to stop the server
echo.
php -S 0.0.0.0:8000
