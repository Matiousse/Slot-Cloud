# KITSUNE RISING — Reimei Games

Kyo, le renard-esprit à neuf queues, pille un temple à l'aube. Slot 5×4, **1024 façons de gagner**, pour Stake Engine.

**État** : maths terminées et vérifiées. Le front (graphismes Gemini + animations) reste à faire.

## Règles

| Élément | Règle |
|---|---|
| Grille | 5 rouleaux × 4 rangées, 1024 façons, gains de gauche à droite sur rouleaux adjacents |
| Wild (masque kitsune) | Rouleaux 2 à 5, remplace tout sauf la lanterne |
| **Fox Fire** (jeu de base) | Sur 8,5 % des tours, Kyo transforme 1 à 4 symboles des rouleaux 2 à 5 en Wilds |
| Scatter (lanterne sacrée) | 3 / 4 / 5 lanternes → bonus FOX HUNT / SPIRIT FLAME / NINE TAILS |
| **Nine Tails** (tours gratuits) | Chaque Wild qui tombe allume une queue de Kyo. Multiplicateur selon les queues allumées : x1, x2, x3, x4, x6, x8, x12, x20, x40, x100 (9 queues). Jamais remis à zéro pendant le bonus. La 9e queue donne +5 tours (une fois) |
| FOX HUNT (3) | 10 tours, 0 queue au départ |
| SPIRIT FLAME (4) | 12 tours, 3 queues au départ (x4) |
| NINE TAILS (5) | 15 tours, 5 queues au départ (x8) |
| Relance | 3 lanternes ou plus en tours gratuits : +5 tours |
| Ante (`ante`) | 3x la mise, bonus 5x plus fréquent |
| Achats | FOX HUNT 100x (`bonus`), SPIRIT FLAME 300x (`super`) |
| Gain max | 10 000x la mise |

## Maths (fichiers Stake : `math/publish_files/`)

| Mode | Coût | RTP | Fréquence de gain | Bonus | Gain max |
|---|---:|---:|---:|---:|---:|
| `base` | 1x | 96,70 % | 60,5 % | 1 / 217 | 1 / 4,25 M |
| `ante` | 3x | 96,70 % | 61,2 % | 1 / 43 | 1 / 851 k |
| `bonus` | 100x | 96,70 % | 100 % | — | 1 / 216 k |
| `super` | 300x | 96,70 % | 100 % | — | 1 / 297 k |

Plus de 100 000 books par mode, vérification indépendante de chaque book : `math/REPORT.md`.
Pour atteindre le gain max à la fréquence exigée par Stake (plus d'une fois sur 10 M) en mode base et ante,
la tranche 10 000x des bonus reçoit une part fixe (comme le quota « wincap » du Math SDK officiel), puis la
moyenne est recalée exactement : le RTP n'est pas modifié.

```bash
npm install
npm run math          # régénère (~7 min, déterministe) + vérifie
npm run math:verify
```
