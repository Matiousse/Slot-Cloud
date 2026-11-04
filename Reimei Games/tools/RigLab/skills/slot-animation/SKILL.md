---
name: slot-animation
description: Animation de machine à sous au niveau studio — courbes d'accélération, anticipation, action secondaire, chronogrammes précis en millisecondes pour l'arrêt des rouleaux, l'allumage d'une combinaison, le déclenchement du bonus, la roue de gamble et la grosse victoire. À charger dès qu'on anime quoi que ce soit dans une slot, ou quand une animation paraît plate, raide ou amateur.
---

# Animer une slot

Ce qui sépare un 1/10 d'un 9/10 n'est presque jamais le dessin. C'est
**la courbe, le décalage et le rebond**. Une animation linéaire, simultanée
et sans dépassement paraît morte quel que soit l'art.

## 0. Ce que font les studios — MESURÉ

Relevé sur des slots publiées (squelettes Spine de deux studios majeurs).
Ce sont des **structures et des durées**, pas du contenu.

### a. DÉBUT → BOUCLE → FIN pour chaque moment fort

Aucun temps fort n'est une animation d'un seul tenant. Il a une entrée, une
boucle qu'on peut tenir aussi longtemps que la logique le demande, et une
sortie propre.

| moment | début | boucle | fin |
|---|---|---|---|
| feature / bonus | 1,33 s | 3,67 s | 1,0 s |
| max win | 1,17 s | 3,67 s | 0,83 s |
| anticipation | 0,67 s | 2,0 s | 0,67 s |
| palier de gain | 0,5 s | tenue | 0,33 s |
| pop-up (tours en plus) | 0,5 s | 1,0 s | 0,5 s |

Pourquoi : le compteur d'une grosse victoire n'a pas une durée fixe. La
boucle tourne tant qu'il compte, la sortie part quand il a fini.

### b. Chaque symbole a ses propres états

Un seul squelette pour tous les symboles (un « skin » par symbole), avec :

| état | durée | rôle |
|---|---|---|
| `idle` | 1,03 s en boucle | le symbole respire au repos — jamais figé |
| `land` | 0,73 s | la pose, avec écrasement et stabilisation |
| `drop_1..5` | 0,77 s | une chute par rangée |
| `win` | **1,37 s** | une vraie célébration sur le symbole lui-même |
| `remove` | 0,33 s | la disparition |

Un gain n'est donc pas « le symbole grossit » : c'est une animation d'1,4 s
propre au symbole.

### c. Le décor est vivant — et il réagit

Le fond n'est pas une image. Bougies qui vacillent (boucle 4 s), nuages qui
dérivent (boucle **50 s**), lumière qui respire (4 s), particules en
suspension. Et **le décor a ses propres états d'anticipation** (rayons
rouges, fumée : début/boucle/fin) et de gain (lumière de victoire). Toute la
scène réagit, pas seulement les rouleaux.

### d. Le personnage ne se répète jamais

25 animations pour un personnage, dont une douzaine de variantes de repos
(clignement ×2, grattage, secousse, assis, danse). Une séquence « regarde
les rouleaux » (début → 4 attentes → retour). Des réactions (saut,
surprise). C'est la variété du repos qui le rend vivant.

### e. Courbes et textures

- **90 % des clés en courbe de Bézier**, le reste en pas à pas (pour les
  effets image par image). Rien de linéaire.
- Atlas de **4096 × 4096**, compressés en **AVIF / WebP**.

## 1. Les quatre lois

**a. Rien de linéaire.** Une entrée décélère, une sortie accélère, un impact
dépasse puis revient.

    entrée        cubic-bezier(.22, 1.4, .4, 1)      dépasse de ~12 %
    sortie        cubic-bezier(.4, 0, 1, 1)
    impact        cubic-bezier(.2, 1.8, .4, 1)       dépasse fort
    glissement    cubic-bezier(.12, .72, .12, 1)     longue fin lente

**b. Rien de simultané.** Ce qui part ensemble paraît mécanique. Décaler de
**30 à 60 ms** par élément. Une colonne de six symboles qui tombe ensemble est
plate ; décalée de 45 ms elle devient vivante.

**c. Rien sans anticipation.** Avant de monter, descendre un peu. Avant de
frapper, reculer. 80 à 120 ms suffisent, et c'est ce qui donne le poids.

**d. Rien ne s'arrête net.** Après l'arrivée, une oscillation qui s'éteint en
deux temps décroissants. Un arrêt sec sans rebond se lit comme un bug.

## 2. Chronogrammes

### Arrêt d'un rouleau
    0      le rouleau ralentit
    +120   le symbole dépasse sa position de 8 à 14 %
    +90    il revient, rebond de 4 %
    +60    stabilisé
    décalage entre colonnes : 52 ms, et 34 ms en turbo

### Anticipation (deux bonus posés)
    0      la musique se coupe, un bourdon monte
    +200   le rouleau restant passe en vitesse lente
    +400   halo pulsant sur ce rouleau, le reste s'assombrit
    résolution : impact fort si gagné, soupir descendant sinon
Sans anticipation, un bonus tombe à plat quel que soit ce qui suit.

### Allumage d'une combinaison
    0      toute la grille passe en sombre        180 ms
    +110   premier pas : éclat radial, agrandissement 1.07, note qui monte
    +150   pas suivant — TOUS les sentiers avancent ENSEMBLE
    ...    une note par pas, un demi-ton plus haut à chaque fois
    +340   pause, puis le compteur
Les symboles s'allument **un par un**. Ne jamais tracer une ligne par-dessus :
c'est fragile techniquement et c'est une signature visuelle d'un autre studio.

### Destruction / transformation d'un symbole
    0      onde de choc au point d'impact, secousse du plateau 6 px
    +420   les cases visées partent en fumée, décalées de 45 ms
    +480   elles reviennent transformées, entrée avec dépassement
    +520   le suivi se met à jour, tampon de la croix avec rotation -18°

### Obtention du bonus
    0      les symboles déclencheurs pulsent ensemble, 3 fois
    +600   le plateau recule et s'assombrit
    +250   le titre entre en dépassement depuis 0.4 d'échelle
    +400   les braises montent, le sous-titre apparaît en fondu
    +900   les boutons montent du bas, décalés de 80 ms
Le titre ne doit jamais apparaître en fondu simple. Il **arrive**.

### Roue de gamble
    0      la roue apparaît en dépassement, le curseur tremble
    +500   départ, 5 à 6 tours complets
    3400   fin sur cubic-bezier(.12,.72,.12,1) — la longue fin lente est
           tout le suspense, elle doit durer au moins 900 ms
    +400   verdict : flash vert + montée, ou secousse rouge + descente
Poser l'angle final **au hasard dans le secteur imposé par le serveur**,
jamais au centre du secteur : un arrêt toujours centré se remarque.

### Grosse victoire
Par paliers nommés. Le compteur accélère, marque un temps à chaque palier,
change de couleur et d'échelle. Un compteur qui défile d'un bloc ne procure
rien. Prévoir une sortie anticipée au clic.

## 3. Action secondaire

C'est elle qui fait « studio ». Pour chaque temps fort, ajouter **une** chose
qui n'était pas demandée : poussière qui retombe après un impact, braises qui
dérivent, léger recadrage de la caméra, ombre qui s'étire, cadre qui vibre.

Une seule. Deux, c'est du bruit.

## 4. Performance

Animer **uniquement** `transform` et `opacity`. Regrouper les effets
simultanés en une animation de conteneur plutôt qu'une par case. Couper le
décoratif quand l'onglet est masqué. Viser 60 images par seconde pendant la
séquence la plus lourde, pas pendant un tour perdant.

## 5. Le turbo

Un **facteur de durée** unique porté par le bus d'événements, pas des
constantes divisées un peu partout. Chaque abonné reçoit sa durée. Un clic
pendant la présentation coupe les abonnés et laisse le moteur finir.

## 6. Juger

Filmer, puis regarder image par image. Les trois questions :
- est-ce que quelque chose dépasse puis revient ?
- est-ce que les éléments sont décalés ?
- est-ce qu'il se passe quelque chose **avant** le temps fort ?

Trois non = 1/10, quel que soit le dessin.
