# Reprendre Pizza Rush en local avec Claude Code

Tout le studio est dans ce dépôt GitHub : **Matiousse/Slot-Cloud**, branche **`claude/tender-dijkstra-agumtz`**.
Il contient le jeu, les maths Stake (96,00 %), les vidéos de Tony, le décor, les sons, Rig Lab et la mémoire du studio
(`CLAUDE.md`, lue automatiquement par Claude Code à l'ouverture du dossier).

## Sur Mac : la marche à suivre complète (Terminal : Cmd + Espace, tape « Terminal », Entrée)

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
(mot de passe du Mac demandé, rien ne s'affiche quand tu le tapes ; à la fin, copie-colle les 2 lignes « Next steps »)
```
brew install git node gh ffmpeg python
gh auth login
gh repo clone Matiousse/Slot-Cloud -- --depth 1 -b claude/tender-dijkstra-agumtz
npm install -g @anthropic-ai/claude-code
cd Slot-Cloud
claude
```
Pour `gh auth login` : GitHub.com → HTTPS → Yes (authenticate Git) → Login with a web browser.
Les fois suivantes : ouvrir le Terminal, puis `cd Slot-Cloud` et `claude`.

## 1. Ce qu'il faut sur ton ordinateur (une seule fois)

| Outil | Mac | Windows |
|---|---|---|
| Git | `xcode-select --install` | https://git-scm.com/download/win |
| Node.js 22 (LTS) | https://nodejs.org | https://nodejs.org |
| Python 3.12 et ffmpeg | installés par Rig Lab (étape 3) | installés par Rig Lab (étape 3) |
| Claude Code | `npm install -g @anthropic-ai/claude-code` | `npm install -g @anthropic-ai/claude-code` |

## 2. Récupérer la slot

Dans un Terminal (Mac) ou PowerShell (Windows), dans le dossier où tu veux la mettre :

```
git clone --depth 1 -b claude/tender-dijkstra-agumtz https://github.com/Matiousse/Slot-Cloud.git
cd Slot-Cloud
```

Le dépôt est privé : Git te demandera de te connecter à GitHub (fenêtre du navigateur). Environ 550 Mo à télécharger.
Sans Git : sur github.com, ouvre le dépôt, choisis la branche `claude/tender-dijkstra-agumtz`, puis **Code → Download ZIP**.

## 3. Lancer Claude Code et coller le prompt

```
claude
```

Puis colle ce message :

```
Salut ! On reprend en local le studio Reimei Games que tu as construit avec moi dans une session cloud.
Lis d'abord CLAUDE.md (mémoire du studio), puis "Reimei Games/slots/pizza-rush/README.md" et
"Reimei Games/slots/pizza-rush/anims/LISEZMOI.md".

Ensuite, prépare tout pour travailler ici :
1. Dans "Reimei Games/slots/pizza-rush" : npm install, puis npm run dev, et donne-moi le lien
   (http://localhost:5210) pour que j'ouvre le jeu dans mon navigateur.
2. Installe Rig Lab : "Reimei Games/tools/RigLab/installer.command" sur Mac, ou installer.bat sur Windows
   (Python, ffmpeg, Chrome de test). Vérifie-le comme le dit son CLAUDE.md.
3. Vérifie les maths sans tout regénérer : npm run math:verify doit afficher ALL CHECKS PASSED à 96,00 %.

On est sur mon ordinateur : je vois localhost, donc plus besoin de publier un artifact pour me montrer le jeu.
Quand c'est prêt, résume-moi en quelques lignes où on en est et ce qu'on peut faire ensuite.
```

## 4. Bon à savoir

- **Le jeu en local** : `npm run dev` dans `Reimei Games/slots/pizza-rush`, puis http://localhost:5210 (démo hors ligne,
  10 000 € de solde fictif). Ajoute `?nointro=1` pour passer l'intro, `?demo_force=film` pour le scénario de démonstration.
- **Les maths** : `npm run math:verify` (1 min) vérifie les fichiers Stake ; `npm run math` les regénère (≈ 10 min).
  Les fichiers à envoyer à Stake sont dans `Reimei Games/slots/pizza-rush/math/publish_files/`.
- **Tes images Google Drive** (« Casino/Pizza Rush ») : en local, Claude n'y a accès que si tu lui ajoutes le connecteur
  Google Drive ; sinon, glisse les fichiers directement dans la conversation.
- **Sauvegarder** : demande à Claude de faire un commit et un push sur la branche, pour retrouver ton travail partout
  (y compris dans une prochaine session cloud).
- **La démo en ligne** (artifact « Pizza Rush ») reste en place ; une session locale ne la met pas à jour toute seule.
