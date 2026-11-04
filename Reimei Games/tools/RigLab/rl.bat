@echo off
rem Rig Lab : la ligne de commande (Windows). Utilise le Python de .venv cree par installer.bat
set "ICI=%~dp0"
if exist "%ICI%.venv\Scripts\python.exe" (
  "%ICI%.venv\Scripts\python.exe" "%ICI%riglab\tools\rl.py" %*
) else (
  python "%ICI%riglab\tools\rl.py" %*
)
