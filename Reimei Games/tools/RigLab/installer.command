#!/bin/bash
# RIG LAB — installation sur Mac. Double-clique ce fichier (ou : bash installer.command dans un terminal).
# Installe : Python + modules (dans .venv, ici), Node + playwright-core, le Chrome de rendu, ffmpeg, les skills Claude.
cd "$(dirname "$0")" || exit 1
ICI="$(pwd)"
ok()  { printf '  \033[32mOK\033[0m %s\n' "$1"; }
ko()  { printf '  \033[31mMANQUE\033[0m %s\n' "$1"; }
echo "== RIG LAB : installation dans $ICI"

# 1. Homebrew (pour installer le reste proprement)
if ! command -v brew >/dev/null 2>&1; then
  for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [ -x "$b" ] && eval "$("$b" shellenv)"; done
fi
if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew n'est pas installé. Installe-le (une ligne, il demande ton mot de passe) puis relance ce fichier :"
  echo '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  exit 1
fi
ok "Homebrew"

# 2. Python 3, Node, ffmpeg
PYB="$(brew --prefix)/bin/python3"
[ -x "$PYB" ] || { echo "  installation de python…"; brew install python; }
[ -x "$PYB" ] && ok "python3 ($("$PYB" --version))" || { ko "python3"; exit 1; }
for f in node:node ffmpeg:ffmpeg; do
  pk=${f%%:*}; cmd=${f##*:}
  command -v "$cmd" >/dev/null 2>&1 || { echo "  installation de $pk…"; brew install "$pk"; }
  command -v "$cmd" >/dev/null 2>&1 && ok "$cmd" || ko "$cmd"
done

# 3. Les modules Python, dans un environnement à part (.venv) : rien n'est touché sur le reste du Mac
[ -x .venv/bin/python ] || "$PYB" -m venv .venv
.venv/bin/python -m pip install -q --upgrade pip
.venv/bin/python -m pip install -q pillow numpy scipy opencv-python-headless
.venv/bin/python -c "import PIL, numpy, scipy, cv2" && ok "modules Python (pillow, numpy, scipy, opencv)" || ko "modules Python"

# 4. playwright-core + le Chrome sans fenêtre qui rend les planches et les vidéos
( cd riglab/tools && npm install --silent && npx --yes playwright-core install chromium ) && ok "Chrome de rendu" || ko "Chrome de rendu"

# 5. Les skills de Claude (lois d'animation, personnages, art ChatGPT…) : copiés sans écraser les tiens
mkdir -p "$HOME/.claude/skills"
for s in skills/*; do n=$(basename "$s"); [ -e "$HOME/.claude/skills/$n" ] || cp -R "$s" "$HOME/.claude/skills/$n"; done
ok "skills Claude dans ~/.claude/skills"

# 6. Test : on ouvre un rig d'exemple et on rend une planche
chmod +x rl
echo "== test"
./rl projets && ./rl controle atelier/roi win | tail -3 && ./rl planche atelier/roi win >/dev/null && ok "Rig Lab marche (planche dans riglab/captures/)" || ko "le test a échoué : ouvre ce dossier dans Claude Code et dis-lui de réparer l'installation"
echo
echo "C'est prêt. Ouvre ce dossier dans Claude Code (appli Claude → Code → choisir le dossier) et dis : « lis CLAUDE.md et démarre »."
echo "L'éditeur pour toi : ./rl projets lance le serveur, puis http://127.0.0.1:4390/studio/"
