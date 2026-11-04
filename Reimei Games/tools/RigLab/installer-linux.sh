#!/bin/sh
# RIG LAB — installation Linux (sessions cloud Claude Code). Tout s'installe dans ce dossier,
# sauf les skills copiés dans ~/.claude/skills. Python 3, Node et ffmpeg doivent déjà exister.
set -e
cd "$(dirname "$0")"
[ -x .venv/bin/python ] || python3 -m venv .venv
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q pillow numpy scipy opencv-python-headless
# Chrome de rendu : on réutilise le Chromium déjà présent dans l'environnement (PLAYWRIGHT_BROWSERS_PATH)
# en prenant la version de playwright-core qui lui correspond, au lieu d'en télécharger un autre.
( cd riglab/tools && npm install --silent --no-save playwright-core@1.56.1 )
mkdir -p "$HOME/.claude/skills"
for s in skills/*; do n=$(basename "$s"); [ -e "$HOME/.claude/skills/$n" ] || cp -R "$s" "$HOME/.claude/skills/$n"; done
chmod +x rl
./rl projets && ./rl controle atelier/roi win | tail -2
echo "Rig Lab prêt."
