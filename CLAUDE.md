# Reimei Games — mémoire du studio

- L'utilisateur parle français : réponds en français, objectivement.
- Studio : **Reimei Games** (黎明, l'aube). Intro commune : `Reimei Games/intro/`. Chaque slot : `Reimei Games/slots/<jeu>/`
  (projet autonome : maths Stake Engine dans `math/`, règles dans `shared/`, voir son README).
- Jeux : `raijin-overload` (RTP 96,10 %), `kitsune-rising` (maths 96,70 %, base de Pizza Rush), `pizza-rush` (RTP 96,70 %,
  jeu jouable : PixiJS + rigs Rig Lab + son généré ; style cartoon Brawl Stars contours noirs ; images de l'utilisateur
  sur le Drive « Casino/Pizza Rush », on ne travaille que dans ce dossier Casino). Démo en ligne : artifact « Pizza Rush ».
- Tony (perso Pizza Rush) : la tête ne change jamais, seuls les traits du visage sont permutés ; les bras ne bougent
  JAMAIS (ils sont dans le corps) ; casquette d'origine (pas de casquette reconstruite).
- « Lancer en local » = l'utilisateur ne voit pas le localhost du conteneur : construire et publier en artifact.

## Animations de symboles : toujours avec Rig Lab
L'utilisateur veut que **toutes les animations de symboles et de personnages des slots** soient faites avec **Rig Lab 2**
(`Reimei Games/tools/RigLab/`). Le conteneur cloud est éphémère : à chaque nouvelle session, avant d'animer,
installe-le avec `sh "Reimei Games/tools/RigLab/installer-linux.sh"` (≈ 2 min), puis suis `Reimei Games/tools/RigLab/CLAUDE.md`
(commandes `./rl`, lois d'animation, boucle planche → contrôle → vidéo). Les rigs d'un jeu vivent dans le jeu
(`Reimei Games/slots/<jeu>/anims/<symbole>/`), déclarés dans `riglab/projets.json`.
