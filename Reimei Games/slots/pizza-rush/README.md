# PIZZA RUSH (Reimei Games)

Slot 5×4, 1024 ways, **RTP 96,70 %** dans les 4 modes (base 1x, ante 3x = bonus ×5, bonus 100x, super 300x), gain max 10 000x.
Style cartoon Brawl Stars, contours noirs. Héros : Tony le livreur.

- **Rush Hour** (jeu de base) : Tony passe en scooter et pose 1 à 4 wilds (parts dorées) sur les rouleaux 2 à 5.
- **Free spins** : 3/4/5 scatters (téléphone) → Lunch / Dinner / Midnight Rush (10/12/15 tours).
- **Pot à pourboires** : chaque wild en free spins ajoute un pourboire, multiplicateur x1 → x100, jamais remis à zéro ; pot plein = +5 tours.

## Lancer
```
npm run dev                 # http://localhost:5210  (mode démo hors ligne)
?demo_force=rush|big|t1|t2|t3   force une fonction en démo ; ?nointro=1 saute l'intro
npm run build               # dist/ (à déposer sur Stake Engine comme front)
```
Sur Stake : `?sessionID=…&rgs_url=…&lang=…` → connexion RGS réelle (authenticate / play / end-round / replay).

## Dossiers
- `shared/` règles et moteur de maths · `math/` génération + vérification (`npm run math`) → `math/publish_files/` (fichiers Stake)
- `src/` le jeu (PixiJS v8 + moteur Rig Lab, son 100 % généré par le code) · `public/` images préparées (`scripts/assets.py`)
- `sources/` images d'origine (Drive Casino/Pizza Rush) · `art/` détourages · `anims/` rigs Rig Lab (symboles + Tony)
