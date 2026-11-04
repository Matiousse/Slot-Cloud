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
visages, rig, animations. Os : socle (pieds) → bassin → haut (buste) → cou → tête ; bras aux épaules
(sous les manches). Expressions : la tête ne change JAMAIS ; seuls les traits (yeux, sourcils, bouche) sont posés dessus (`visage-*`, calés sur le nez,
peau repeinte sous les traits neutres) et permutés d'une image à l'autre, avec un petit écrasement de la tête.
Visages : yeux fermés (clignement), rire, choc, triste, clin d'œil.

| clip | durée | quand | événements |
|---|---|---|---|
| `idle` | 2400 ms, boucle | toujours | — (clignement à 1640 ms) |
| `gain` | 1370 ms | petit gain | `gain` 300 |
| `grosgain` | 1700 ms | gros gain / big win (saut, bras immobiles) | `gain` 0, `impact` 760 (atterrissage) |
| `presque` | 1500 ms | 2 scatters, raté de peu | `choc` 80 |
| `perte` | 1500 ms | série de pertes (pas à chaque spin) | — |
| `bonus` | 1500 ms | déclenchement des free spins (petit saut + clin d'œil, bras immobiles) | `bonus` 340 |
Revenir à `idle` après chaque clip (mix 160 ms).
