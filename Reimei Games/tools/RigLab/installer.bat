@echo off
chcp 65001 >nul
rem RIG LAB — installation sur Windows. Double-clique ce fichier.
rem Installe : Python + modules (dans .venv, ici), Node + playwright-core, le Chrome de rendu, ffmpeg, les skills Claude.
cd /d "%~dp0"
echo == RIG LAB : installation dans %CD%

where winget >nul 2>nul || (echo winget manque : installe "App Installer" depuis le Microsoft Store puis relance. & pause & exit /b 1)

where python >nul 2>nul || winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
where node   >nul 2>nul || winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
where ffmpeg >nul 2>nul || winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
echo.
echo Si quelque chose vient d'etre installe, FERME cette fenetre et relance installer.bat (Windows doit recharger le PATH).
echo.

if not exist ".venv\Scripts\python.exe" python -m venv .venv
".venv\Scripts\python.exe" -m pip install -q --upgrade pip
".venv\Scripts\python.exe" -m pip install -q pillow numpy scipy opencv-python-headless
".venv\Scripts\python.exe" -c "import PIL, numpy, scipy, cv2; print('  OK modules Python')"

pushd riglab\tools
call npm install --silent
call npx --yes playwright-core install chromium
popd

if not exist "%USERPROFILE%\.claude\skills" mkdir "%USERPROFILE%\.claude\skills"
for /d %%s in (skills\*) do if not exist "%USERPROFILE%\.claude\skills\%%~nxs" xcopy /e /i /q "%%s" "%USERPROFILE%\.claude\skills\%%~nxs" >nul
echo   OK skills Claude

echo == test
call rl.bat projets
call rl.bat controle atelier/roi win
echo.
echo C'est pret. Ouvre ce dossier dans Claude Code et dis : "lis CLAUDE.md et demarre".
echo L'editeur : rl.bat projets lance le serveur, puis http://127.0.0.1:4390/studio/
pause
