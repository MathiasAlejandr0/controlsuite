@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:3100"
call npm start
