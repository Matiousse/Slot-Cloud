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
8 vidéos Google Flow (`sources/tony/`) détourées ensemble par `atelier/pizza-rush/tony_videos.py` (un seul recadrage
pour toutes : même taille, pieds au même endroit), 12 i/s, hauteur 400 px, 19 planches WebP. `src/game/tony-video.ts`
les joue : `repos` boucle en aller-retour, chaque réaction se joue une fois puis revient au repos (fondu 250 ms).

| animation | source (s) | quand |
|---|---|---|
| `repos` | Tony_flow_respiration 0–10 | toujours |
| `gain` | tony-gain 1,5–6,5 | gain ≥ ×3 |
| `grosgain` | tony-grosgain 4–7,5 | big win (≥ ×15), fin de free spins |
| `presque` | tony-presque 3–8,5 | 2 scatters sans déclenchement |
| `perte` | tony-perte 1,5–7 | toutes les 6 pertes d'affilée |
| `bonus` | tony-bonus 1,5–7,5 (applaudit) | déclenchement / relance des free spins |
| `rush` | tony-rush 3–7 | Rush Hour |
| `suspense` | tony-suspense 1,5–8 | anticipation (2 scatters, rouleaux suivants) |

Refaire : extraire chaque vidéo en PNG à 12 i/s (`ffmpeg -i x.mp4 -vf fps=12 dossier/%04d.png`) puis
`tony_videos.py anims/tony-video 400 repos:dossier:0:10 gain:dossier:1.5:6.5 …`. Démo du scénario : `?demo_force=film`.
