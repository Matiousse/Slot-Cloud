# Capitaine Perroquet : pack de prompts ChatGPT (symbole haut, univers pirate cartoon)

Comment sont faites les images de Cybersaurus (relevé sur l'atlas) :
- **Un seul style pour tout.** Contour noir très épais et régulier, 2 à 3 tons francs par couleur, reflets blancs durs en traits. Formes rondes et massives, aucun petit détail inutile.
- **La carte est une seule image.** Le fond et le cadre font une image (≈ 747 × 733 px pour une case de 728 × 724), plus une ombre : la même silhouette, remplie en noir.
- **Le personnage est découpé en environ 35 pièces :**
  - la tête avec le haut de la mâchoire ;
  - la mâchoire du bas à part, grande, avec ses dents ;
  - le torse en un seul bloc ;
  - les bras et les jambes en 2 ou 3 segments ;
  - chaque griffe et chaque orteil à part (3 par main, 3 par pied) ;
  - la queue en une pièce, déformée par un maillage ;
  - les accessoires à part.
- **Les bouts de chaque segment sont arrondis en gélule**, et le bout qui s'emboîte passe SOUS la pièce voisine. Quand ça tourne, on ne voit jamais de trou.
- **Le côté caché est plus sombre** (la jambe du fond, par exemple).
- **Les effets sont des séquences additives à part** (flamme de 42 images, éclair de 20 images, halo). Dans Rig Lab, on les fait plutôt en procédural.

Ordre : prompt 1, puis 2, 3 et 4 **dans la même conversation**, pour que ChatGPT garde le même personnage.

---

## Prompt 1 : la référence (le personnage entier, en pose de rig)

```
Crée l'illustration d'un personnage pour une machine à sous mobile, univers pirate cartoon : CAPITAINE PERROQUET.

PERSONNAGE : un ara rouge écarlate, gros et trapu, très expressif, l'air fier et un peu fou. Grosse tête ronde, énorme bec crochu jaune d'or et ivoire (le bec du haut couvre celui du bas), un seul œil visible, grand, rond et vif, l'autre caché par un cache-œil noir à lanière. Sur la tête, un grand tricorne de capitaine noir-brun à galon doré, avec une tête de mort ivoire au centre et une longue plume blanche qui dépasse vers l'arrière. Trois mèches de plumes rouges sortent sous le chapeau. Le corps porte une redingote bleu marine courte, à gros boutons dorés et revers rouges, une ceinture de cuir marron à grosse boucle dorée, et un jabot blanc. L'aile du côté visible sort de la manche comme un bras : l'aile est rouge, ses grandes plumes du bout sont bleues et jaunes, et elles tiennent un sabre d'abordage courbe (lame argent, garde dorée). L'aile du côté caché se devine derrière le corps. Une patte jaune à trois gros doigts griffus ; l'autre jambe est une JAMBE DE BOIS. La queue est faite de trois longues plumes (rouge, bleue, jaune), en éventail vers le bas et l'arrière.

STYLE (à garder identique sur toutes les images de cette conversation) : illustration 2D de jeu mobile haut de gamme, cel-shading franc, contour noir très épais et parfaitement régulier (8 px sur 1024 px), 3 tons par couleur (base, ombre franche, petit reflet blanc dur en trait), lumière du haut à gauche, formes rondes et massives, très lisible à 120 px de large, couleurs saturées. Palette stricte : rouge ara #E0302A, rouge ombre #9A1420, jaune or #FFC228, ivoire du bec #F4E7C4, bleu plume #2E7BE0, bleu marine #1E2A5A, noir-brun du chapeau #2A1F2A, doré #F2B630, argent de la lame #CFD8E0, bois #8A5A32. Pas de photoréalisme, pas de rendu 3D, pas de dégradé de fond, pas d'ombre portée au sol, pas de texte.

POSE DE RIG (très important, le personnage sera découpé et animé) : debout, de trois-quarts, tourné vers la droite. L'aile qui tient le sabre est écartée du corps, le sabre levé vers le haut à droite. Les deux jambes sont écartées, bien séparées. Les trois plumes de la queue sont étalées et ne se chevauchent presque pas. Le bec est fermé. Aucune partie ne passe devant le torse, aucun membre n'en croise un autre. Les articulations (épaule, coude de l'aile, poignet, hanches, genou, cheville, base de la queue, nuque) sont nettes et lisibles.

CADRAGE : personnage entier, rien n'est coupé par le bord, il occupe 85 % de la hauteur d'une image carrée 1024 × 1024, centré.

Fond entièrement transparent, PNG avec canal alpha. Pas de damier dessiné, pas de couleur de fond, pas de cadre.
```

---

## Prompt 2 : LA PALETTE (toutes les pièces détachées, sur une seule planche)

```
À partir du Capitaine Perroquet que tu viens de dessiner, garde EXACTEMENT le même design, les mêmes couleurs, le même contour et la même échelle. Fais-moi sa PLANCHE DE PIÈCES DÉTACHÉES pour l'animer en squelette 2D (comme Spine) : chaque pièce est dessinée seule, entière, isolée, sur une grande planche.

FORMAT : image paysage 1536 × 1024. Fond entièrement transparent, PNG avec canal alpha (pas de damier, pas de couleur). Les pièces sont rangées en grille, environ 6 colonnes et 5 lignes. Chacune est centrée dans sa case, avec au moins 40 px de vide transparent tout autour. AUCUNE pièce n'en touche ni n'en chevauche une autre. Pas de texte, pas d'étiquettes, pas de numéros, pas de flèches.

STYLE : le même que sur la référence, mot pour mot. Illustration 2D de jeu mobile haut de gamme, cel-shading franc, contour noir très épais et parfaitement régulier, 3 tons par couleur (base, ombre franche, petit reflet blanc dur en trait), lumière du haut à gauche, formes rondes et massives, couleurs saturées. Palette stricte : rouge ara #E0302A, rouge ombre #9A1420, jaune or #FFC228, ivoire du bec #F4E7C4, bleu plume #2E7BE0, bleu marine #1E2A5A, noir-brun du chapeau #2A1F2A, doré #F2B630, argent #CFD8E0, bois #8A5A32. Pas de rendu 3D, pas d'ombre portée.

RÈGLES DE DÉCOUPE (valables pour toutes les pièces) :
- Chaque pièce est COMPLÈTE : dessine aussi la partie qui était cachée par la pièce voisine sur la référence. Rien n'est coupé ni troué.
- Le bout qui s'emboîte sous la pièce voisine est prolongé de 15 % et arrondi en gélule. Ce bout prolongé garde son contour noir sur les côtés, mais pas sur l'extrémité qui sera cachée.
- Chaque pièce garde l'orientation et la taille qu'elle a sur la référence (même échelle partout).
- Les pièces du côté caché sont un ton plus sombres.

LES PIÈCES (32) :

TÊTE
1. La tête seule : crâne rond rouge, joues et l'œil visible, avec le BEC DU HAUT attaché. Sans le chapeau, sans le bec du bas, sans le cache-œil. Le bas du cou est prolongé de 25 % vers le bas, peau lisse.
2. Le bec du bas seul, entier, ivoire et jaune, ouvert au maximum de sa forme naturelle, prolongé vers l'arrière là où il s'emboîte sous la tête.
3. L'intérieur du bec : une amande sombre (bordeaux très foncé) avec une petite langue rose, sans contour extérieur épais. Il remplit l'ouverture quand le bec s'ouvre.
4. L'œil ouvert seul : blanc de l'œil + iris doré + pupille noire + reflet blanc. Même taille que sur la référence.
5. L'œil fermé : la même zone, paupière rouge fermée en arc, avec un petit trait de cils noirs. Exactement le même cadrage que la pièce 4, pour remplacer l'une par l'autre.
6. La pupille seule (petit disque noir avec reflet), pour qu'elle puisse bouger dans l'œil.
7. Le cache-œil noir avec sa lanière, seul.
8. Le tricorne seul, entier (galon doré, tête de mort ivoire), sans la plume.
9. La plume blanche du chapeau, seule, longue et souple.
10, 11, 12. Les trois mèches de plumes rouges du dessus de la tête, chacune séparée.

CORPS
13. Le torse en un seul bloc : redingote bleu marine, revers rouges, boutons dorés, jabot blanc, ventre rouge visible entre les pans. Sans les ailes, sans les jambes, sans la ceinture. Le haut est prolongé sous la tête, le bas sous la ceinture.
14. La ceinture de cuir avec sa grosse boucle dorée, seule, légèrement plus large que le torse.
15. Le pan arrière de la redingote (les basques), seul : il flottera derrière.

AILE DU CÔTÉ VISIBLE (le « bras » qui tient le sabre)
16. Le haut de l'aile (épaule + manche bleu marine à revers rouge), avec un bout rond côté épaule.
17. L'avant-aile (plumes rouges du milieu), avec un bout rond côté coude.
18, 19, 20. Les trois grandes plumes du bout de l'aile (bleue, jaune, bleue), chacune séparée : ce sont les « doigts » qui tiennent le sabre.
21. Le sabre d'abordage seul, en entier : lame courbe argent avec un reflet blanc, garde dorée en coquille, poignée de cuir.

AILE DU CÔTÉ CACHÉ
22. L'aile complète du côté caché, entière, repliée, un ton plus sombre.

JAMBES
23. La cuisse emplumée rouge de la vraie patte, bout rond en haut.
24. La patte jaune (tarse) avec le pied, sans les doigts.
25, 26, 27. Les trois doigts griffus de la patte, chacun séparé (doigt jaune + griffe gris foncé).
28. La cuisse emplumée de l'autre jambe, un ton plus sombre.
29. La jambe de bois seule : pilon de bois tourné, cerclé de laiton, bout arrondi en haut.

QUEUE
30, 31, 32. Les trois longues plumes de la queue (rouge, bleue, jaune), chacune séparée, entière, droite, base arrondie.

Vérifie avant de livrer : 32 pièces, aucune ne se touche, fond transparent, même style que la référence.
```

> Si ChatGPT tasse tout ou oublie des pièces, coupe la demande en deux : « pièces 1 à 16 », puis « pièces 17 à 32 », avec exactement le même texte de STYLE et de RÈGLES.

---

## Prompt 3 : la carte (fond + cadre) et son ombre

```
Toujours dans le même style, mot pour mot (contour noir épais régulier, cel-shading 3 tons, lumière du haut à gauche, couleurs saturées, pas de 3D), dessine la CARTE DE FOND du symbole du Capitaine Perroquet, seule, sans le personnage.

FORMAT : carré 1024 × 1024. Fond transparent autour de la carte, PNG avec canal alpha.

LA CARTE : un rectangle aux coins arrondis qui occupe 92 % de l'image.
- Le CADRE : des planches de bois de navire, marron chaud #8A5A32 aux veines plus sombres, épaisses de 6 % de la largeur. Gros rivets de laiton doré #F2B630 aux quatre coins, et un bout de cordage enroulé en travers de chaque coin.
- Le FOND, dans le cadre : un ciel de lagon turquoise #3EC6D8, qui descend vers le bleu profond #1E6FA8 en bas, en aplats francs, avec deux nuages ronds blancs cartoon en haut à gauche. Une ligne d'océan bleu foncé en bas, avec trois vagues stylisées à crête blanche. Une petite île à palmier très simplifiée, en silhouette à peine plus foncée, dans le coin bas gauche. Le centre reste calme et peu détaillé : le personnage sera posé dessus.

Pas de texte, pas de personnage, pas de logo.
```

Puis, juste après :

```
Exactement la même silhouette que la carte précédente, même taille, même position, remplie d'un NOIR UNI sans aucun détail : c'est l'ombre portée de la carte. Fond transparent autour, PNG avec canal alpha.
```

Et la copie qui servira au flash additif du gain :

```
Exactement le même cadre de bois que la carte précédente, même taille, même position, mais SEUL (le fond du milieu est transparent) et entièrement BLANC UNI, sans contour noir ni détail : il servira de lumière qui s'allume sur le cadre. Fond transparent, PNG avec canal alpha.
```

---

## Prompt 4 : les formes d'effets (une planche)

```
Même style cartoon (couleurs saturées, formes nettes, mais SANS contour noir pour ces effets lumineux). Planche paysage 1536 × 1024, fond entièrement transparent, PNG avec canal alpha, 6 éléments bien séparés (60 px de vide entre chacun), sans texte :
1. Une pièce d'or de pirate vue de face (doublon, tête de mort gravée, reflet blanc dur), AVEC contour noir comme le personnage.
2. La même pièce vue presque de profil (fine ellipse), avec contour noir.
3. Un éclat d'étincelle blanche à 4 branches très fines.
4. Une bouffée de fumée de poudre cartoon : 5 boules grises claires, ombre douce en bas.
5. Un éclair de choc d'épée : un arc blanc en croissant, épais au milieu, effilé aux bouts, halo jaune pâle.
6. Une éclaboussure d'eau cartoon : une couronne de gouttes bleu turquoise à reflets blancs.
```

---

## Ce que je ferai avec dans Rig Lab

| Pièce | Pivot | Rig |
|---|---|---|
| tête (+ bec du haut) | nuque | suit l'os pilote à 0.9 ; clé `img` œil ouvert / fermé (clignement) |
| bec du bas | charnière sous l'œil | s'ouvre de 0 à 19° au gain (le perroquet crie) |
| tricorne, plume, 3 mèches | base de chacun | `physique` (la plume et les mèches traînent quand la tête bouge) |
| torse | ventre | maillage pondéré sur bassin et poitrine (`mesh.weights: "os"`, `ajuste`) |
| basques | ceinture | `physique` lente (flottent derrière) |
| haut d'aile → avant-aile → 3 plumes → sabre | épaule, coude, poignet | suit le pilote à 0.7 puis 0.5 ; le sabre fait un moulinet au gain ; recette « Fouet » sur les plumes |
| patte, 3 doigts | hanche, cheville, base des doigts | IK, pied planté |
| jambe de bois | genou | petit tapotement au land |
| 3 plumes de queue | base | chaîne « Fouet » + `physique` sur la dernière |
| carte, ombre, cadre blanc | centre | double pic au gain, flash or additif |
| pièces d'or, fumée, éclair | — | particules (pluie de doublons au gain), éclat additif du sabre |
