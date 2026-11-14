@echo off
cd /d "%~dp0"
echo Installing packages (first time only)...
python -m pip install -q -r requirements.txt
echo.
echo FireCensus API starting at http://127.0.0.1:8000/docs
echo Keep this window open. Close it to stop the server.
echo.
python -m uvicorn app:app --port 8000
pause
