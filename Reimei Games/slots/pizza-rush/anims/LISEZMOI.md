# Pizza Rush : rigs des symboles (Rig Lab 2)

Fabriqués par `Reimei Games/tools/RigLab/atelier/pizza-rush/construit.py` (refaire tout : une commande) à partir des
images détourées `art/symboles/<CODE>.png` (détourage : `atelier/pizza-rush/detoure.py`, case 640 px, sol commun à 90 %).
Les lettres ont toutes la même hauteur. Moteur nécessaire dans le jeu : **v3** (reflet) → `./rl moteur pizza-rush`.

| code | symbole | repos (boucle) | gain (1370 ms) |
|---|---|---|---|
| L5 | 10 | 2200 ms | pop + ondule comme de la gélatine + reflet |
| L4 | J | 2600 ms | idem, ondule dans l'autre sens |
| L3 | Q | 2400 ms | idem |
| L2 | K | 2900 ms | idem, autre sens |
| L1 | A | 3000 ms | idem |
| H4 | pizza | 2700 ms | lancée comme par un pizzaiolo : saute, se retourne en l'air, retombe |
| H3 | scooter | 2050 ms | wheelie sur la roue arrière, retombe (événement `impact` à 1040 ms) |
| H2 | pile de boîtes | 2850 ms | la tour vacille et s'amortit |
| H1 | pot TIPS | 2500 ms | on secoue les pièces du pot |
| WD | wild | 2300 ms | pop + reflet doré |
| SC | scatter téléphone | 2750 ms | il sonne : deux sonneries |

Clips communs : `idle` (boucle), `land` 730 ms (impact à t=0), `win` 1370 ms (événement `gain` à 0), `remove` 330 ms, `eclat` 600 ms.
Scatter en plus : `suspense` (boucle 2 s, pendant l'attente du dernier rouleau) → `declenche` 1200 ms (événement
`declenche` à 330 ms) → `danse` (boucle 2 s, pendant la présentation du bonus).
Rotation des clés : radians (Pixi). Nombres décimaux : toujours avec le zéro (`0.92`, pas `.92`).

## Tony (personnage, à côté des rouleaux) : `anims/tony/`
Tout se refait avec `sh atelier/pizza-rush/tony_tout.sh` (depuis RigLab) : détourage, calques découpés dans la référence,
visages, rig, animations. Os : socle (pieds) → bassin → haut (buste) → cou → tête. Les bras font partie du corps et ne sont JAMAIS animés
(demande : aucune coupe à l'épaule) ; le corps se plie en maillage avec le buste. Expressions : la tête ne change JAMAIS ; seuls les traits (yeux, sourcils, bouche) sont posés dessus (`visage-*`, calés sur le nez,
peau repeinte sous les traits neutres) et permutés d'une image à l'autre, avec un petit écrasement de la tête.
Visages : yeux fermés (clignement), rire, choc, triste, clin d'œil.

| clip | durée | quand | événements |
|---|---|---|---|
| `idle` | 2400 ms, boucle | toujours | — (clignement à 1640 ms) |
| `gain` | 1370 ms | petit gain | `gain` 300 |
| `grosgain` | 1700 ms | gros gain / big win (saut) | `gain` 0, `impact` 760 (atterrissage) |
| `presque` | 1500 ms | 2 scatters, raté de peu | `choc` 80 |
| `perte` | 1500 ms | série de pertes (pas à chaque spin) | — |
| `bonus` | 1500 ms | déclenchement des free spins (petit saut + clin d'œil) | `bonus` 340 |
Revenir à `idle` après chaque clip (mix 160 ms).

## Tony en vidéo (version utilisée par le jeu) : `anims/tony-video/`
8 vidéos Google Flow (`sources/tony/`) détourées ensemble par `atelier/pizza-rush/tony_transitions.py` (un seul recadrage :
même taille, pieds au même endroit), 12 i/s, 400 px de haut, 27 planches WebP.

**Raccords invisibles.** Toutes les vidéos Flow partent de la même image (la pose pivot P) mais Tony s'en éloigne vite :
un fondu montrait deux Tony superposés. Maintenant toutes les animations passent par P et chaque raccord est une vraie
séquence de mouvement calculée par flux optique (5 ou 6 images) :
repos ──sortie (toutes les 12 images)──▶ P ──entrée──▶ réaction ──retour──▶ P ──▶ repos (image 0 = P).
Une réaction attend au plus 1 s la prochaine sortie du repos. Suspense et perte peuvent être coupés (sorties chaque
seconde, bras le long du corps) ; les autres vont au bout. Priorité des demandes : bonus > grosgain > rush > gain >
presque > perte > suspense. `src/game/tony-video.ts` joue ce graphe, une seule image à la fois, sans fondu.

| réaction | extrait de la vidéo | quand |
|---|---|---|
| `gain` | 0,4–8,6 s (montée et retour ×2) | gain de ×3 à ×15 au jeu de base, hors Rush Hour |
| `grosgain` | 4–9,1 s | big win (≥ ×15), fin de free spins |
| `presque` | 0,5–8,6 s (montée ×2) | 2 scatters sans déclenchement |
| `perte` | 1,5–7 s | toutes les 6 pertes d'affilée |
| `bonus` | 0,3–7,8 s (applaudit) | déclenchement / relance des free spins |
| `rush` | 3–7,1 s | Rush Hour |
| `suspense` | 1,5–7,7 s | anticipation (2 scatters, rouleaux suivants) |

Refaire : extraire chaque vidéo en PNG à 12 i/s (`ffmpeg -i x.mp4 -vf fps=12 dossier/%04d.png`) puis
`tony_transitions.py anims/tony-video 400 repos:resp gain:gain:1.5:6.0:0.4:8.0 grosgain:grosgain:4:6.8
presque:presque:3:8:0.5 perte:perte:1.5:6.5 bonus:bonus:1.5:7 rush:rush:3:6.5 suspense:suspense:1.5:7.5`.
Démo du scénario : `?demo_force=film`.

## Fond animé (passants derrière les vitrines)
Source : `sources/decor/fond-anime.mp4` (Google Flow, 10 s). La vidéo brute tremble (caméra qui flotte de 1-2 px et
décor redessiné à chaque image) : `atelier/pizza-rush/fond_stabilise.py` reconstruit le fond à partir de l'IMAGE FIXE et
ne prend de la vidéo, recalée image par image, que ce qui bouge vraiment (rue dans les vitrines, porte, feu : ~8 % de
l'image). Puis boucle sans raccord (la dernière seconde se fond dans la première) :
```
ffmpeg -i fond-anime.mp4 images/%04d.png
fond_stabilise.py public/img/fond.webp images stab 1600
F="[0:v]split[a][b];[a]trim=start=1:end=9.95,setpts=PTS-STARTPTS[A];[b]trim=start=0:end=1,setpts=PTS-STARTPTS[B];[A][B]xfade=transition=fade:duration=1:offset=7.95,format=yuv420p"
ffmpeg -framerate 24 -i stab/%04d.png -filter_complex "$F" -an -c:v libvpx-vp9 -b:v 0 -crf 36 -row-mt 1 _fond-boucle.webm
ffmpeg -framerate 24 -i stab/%04d.png -filter_complex "$F" -an -c:v libx264 -crf 24 -preset slow -movflags +faststart _fond-boucle.mp4
```
`scripts/assets.py` les copie en `public/img/fond.webm|mp4` ; le jeu prend le WebM (ou le MP4 sur Safari) et retombe sur
`img/fond.webp` si la vidéo ne charge pas. `?film=1` : la vidéo suit l'horloge de la page (tournages image par image).
Tony est debout sur `img/tabouret.png` (`Stage.placeTony`).
