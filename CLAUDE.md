# Reimei Games — mémoire du studio

- L'utilisateur parle français : réponds en français, objectivement.
- Studio : **Reimei Games** (黎明, l'aube). Intro commune : `Reimei Games/intro/`. Chaque slot : `Reimei Games/slots/<jeu>/`
  (projet autonome : maths Stake Engine dans `math/`, règles dans `shared/`, voir son README).
- Jeux : `raijin-overload` (RTP 96,10 %), `kitsune-rising` (maths 96,70 %, base de Pizza Rush), `pizza-rush` (RTP 96,00 % dans les 7 modes, choix de l'utilisateur ;
  jeu jouable : PixiJS + rigs Rig Lab + son généré ; style cartoon Brawl Stars contours noirs ; images de l'utilisateur
  sur le Drive « Casino/Pizza Rush », on ne travaille que dans ce dossier Casino). Démo en ligne : artifact « Pizza Rush ».
- Tony (perso Pizza Rush) : la tête ne change jamais, seuls les traits du visage sont permutés ; les bras ne bougent
  JAMAIS (ils sont dans le corps) ; casquette d'origine (pas de casquette reconstruite).
- Interface Pizza Rush : pas de barre en bas ; commandes en panneaux « verre fumé » biseautés (liseré blanc fin, bords en
  biais, comme la référence donnée par l'utilisateur) : achat bonus avec le logo Reimei Games en bas à gauche AU MÊME NIVEAU que le spin en bas
  à droite (+/− et turbo/auto autour). Police : Titan One (titres, chiffres, boutons) + Fredoka (textes), toutes deux OFL,
  choisies sur la référence de l'utilisateur (avant : Modak). Polices : toujours sous licence libre (OFL).
  Écran bonus = 6 vignettes comme la référence (Crack the Pig) : TIP BOOST 2x, ORDER BOOST 10x, GUARANTEED RUSH 4x (modes qui
  restent actifs), LUNCH RUSH BONUS 100x, DINNER RUSH BONUS 200x (5 FS, wild garanti), MYSTERY ORDER 300x/spin ; l'Ante est supprimé.
  Décor : intérieur de la pizzeria avec vitrines, fond VIDÉO en boucle (passants), Tony debout sur un tabouret entre la colonne de gauche et le cadre.
- Tony est joué par des VIDÉOS Google Flow (repos + 7 réactions : gain, grosgain, presque, perte, bonus, rush, suspense ; voir `anims/LISEZMOI.md`, outil `atelier/pizza-rush/tony_videos.py`). Ancienne note : vidéo de respiration détourée en planches de sprites
  (`atelier/pizza-rush/tony_video.py`, 12 i/s, boucle aller-retour). Le rig Rig Lab de Tony reste dans le code (désactivé).
- « Lancer en local » = l'utilisateur ne voit pas le localhost du conteneur : construire et publier en artifact.

## Ressources (fouille GitHub, licences commerciales OK)
Avant de créer quoi que ce soit, regarder `Reimei Games/tools/ressources/` : docs officielles Stake Engine (RGS, format des
maths, mots du mode social), techniques de son synthétisé (réverbération, rouleaux spatialisés), bonnes pratiques de
rouleaux, 175 fiches de maths slotopol, et `prompts-slots.md` (prompts d'images testés). N'utiliser que du CC0/MIT/OFL/CC BY.

## Animations de symboles : toujours avec Rig Lab
L'utilisateur veut que **toutes les animations de symboles et de personnages des slots** soient faites avec **Rig Lab 2**
(`Reimei Games/tools/RigLab/`). Le conteneur cloud est éphémère : à chaque nouvelle session, avant d'animer,
installe-le avec `sh "Reimei Games/tools/RigLab/installer-linux.sh"` (≈ 2 min), puis suis `Reimei Games/tools/RigLab/CLAUDE.md`
(commandes `./rl`, lois d'animation, boucle planche → contrôle → vidéo). Les rigs d'un jeu vivent dans le jeu
(`Reimei Games/slots/<jeu>/anims/<symbole>/`), déclarés dans `riglab/projets.json`.
