@echo off
REM Regula - starts the canonical backend (stdlib only, no install).
cd /d "%~dp0"
python backend\serve.py %*
