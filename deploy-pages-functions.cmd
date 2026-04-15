@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0deploy-pages-functions.ps1" %*
