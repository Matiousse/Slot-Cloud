# Reimei Games — mémoire du studio

- L'utilisateur parle français : réponds en français, objectivement.
- Studio : **Reimei Games** (黎明, l'aube). Intro commune : `Reimei Games/intro/`. Chaque slot : `Reimei Games/slots/<jeu>/`
  (projet autonome : maths Stake Engine dans `math/`, règles dans `shared/`, voir son README).
- Jeux : `raijin-overload` (RTP 96,10 %), `kitsune-rising` (RTP 96,70 %, maths prêtes ; thème en cours de refonte
  en « PIZZA RUSH », style cartoon Brawl Stars avec contours noirs, images générées par l'utilisateur sur Google).

## Animations de symboles : toujours avec Rig Lab
L'utilisateur veut que **toutes les animations de symboles et de personnages des slots** soient faites avec **Rig Lab 2**
(`Reimei Games/tools/RigLab/`). Le conteneur cloud est éphémère : à chaque nouvelle session, avant d'animer,
installe-le avec `sh "Reimei Games/tools/RigLab/installer-linux.sh"` (≈ 2 min), puis suis `Reimei Games/tools/RigLab/CLAUDE.md`
(commandes `./rl`, lois d'animation, boucle planche → contrôle → vidéo). Les rigs d'un jeu vivent dans le jeu
(`Reimei Games/slots/<jeu>/anims/<symbole>/`), déclarés dans `riglab/projets.json`.
