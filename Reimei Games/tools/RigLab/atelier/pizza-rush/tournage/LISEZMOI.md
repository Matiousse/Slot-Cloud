# Tournage des vidéos de démonstration (Pizza Rush)

Image par image, horloge virtuelle de Playwright : fluide et à vitesse réelle même sans carte graphique.

1. `npx vite build` (dans le jeu), puis fabriquer la copie « toutes images clés » du fond, réservée au tournage :
   `ffmpeg -i sources/decor/_fond-boucle.mp4 -an -c:v libvpx-vp9 -g 1 -b:v 0 -crf 34 -row-mt 1 -deadline realtime -cpu-used 8 dist/img/fond-film.webm`
2. Servir `dist` avec **`serveur.cjs`** (requêtes partielles Range). Pas `python -m http.server` : sans Range, le navigateur
   ne peut pas se déplacer dans la vidéo du fond et le décor reste figé sur sa première image.
   `node serveur.cjs <dist> 5305 &`
3. `SPINS=11 node film.cjs "http://127.0.0.1:5305/index.html?demo_force=film&nointro=1&film=1" dossier_images`
   (`SPINS=0 MAX=11 FIN=10000` : 10 s au repos), puis `ffmpeg -framerate 30 -i dossier/f%05d.png … sortie.mp4`.
