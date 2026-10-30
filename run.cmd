@echo off
REM Regula - one command, no install, no build step.
cd /d "%~dp0"
python app\serve.py %*
