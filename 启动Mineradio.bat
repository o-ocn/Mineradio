@echo off
cd /d "%~dp0"
title Mineradio
start "" "%~dp0node_modules\electron\dist\electron.exe" .
