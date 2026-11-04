# Bibliothèque de prompts pour slots (Gemini / ChatGPT)

Testés sur PIZZA RUSH. Règles qui ont fait la différence :
1. **Un bloc STYLE recopié mot pour mot** dans chaque prompt de la série (sinon le style dérive).
2. **Fond magenta pur #FF00FF** (détourage propre ; jamais vert si le jeu contient du vert, jamais de « damier transparent »).
3. **Tout dans la même conversation**, l'image de référence jointe à chaque fois (calques, expressions, variantes).
4. **Refuser** toute image zoomée, décalée, avec du texte parasite ou des étincelles : regénérer.
5. Toujours demander **ce qui sera caché** (le bout du bras sous la manche, la casquette entière…).

Remplace les `<…>`.

---

## Bloc STYLE (exemple Pizza Rush, à adapter au thème)
```
STYLE: 2D mobile slot game art in the style of Brawl Stars / Clash Royale, cartoon, thick uniform BLACK OUTLINE on every
shape, flat cel-shading with 2 tones per colour plus one small hard highlight, light from top-left, saturated colours.
NOT 3D, NOT Pixar, NOT photorealistic, no soft gradients, no sparkles, no glow, no cast shadow, no text unless asked.
```

## Symbole bas (lettre / chiffre)
```
[STYLE]
A single slot symbol: the letter <A> as a chunky glossy bubble letter, <red> with a darker <red> side, one hard white
highlight, thick black outline, one small themed detail on it (<a basil leaf>). Front view, centered, the letter is 64% of
the image height, bottom at 82%. Plain flat magenta background #FF00FF. Square 1024x1024. Nothing else in the image.
```
Série : même prompt, change seulement la lettre, la couleur et le détail (10 violet, J bleu, Q vert, K orange, A rouge).

## Symbole haut (objet du thème)
```
[STYLE]
A single slot symbol: <a cartoon pepperoni pizza>, iconic and readable at 120 px, slightly tilted toward the viewer,
chunky shapes. Centered, largest dimension 64% of the image, bottom at 82%. Plain flat magenta background #FF00FF.
Square 1024x1024. Same scale and framing as the previous symbols.
```

## Wild
```
[STYLE]
A WILD slot symbol: <a golden pizza slice> with the word "WILD" in chunky cartoon letters across it (white with red
outline then black outline). Premium, glossy gold. Centered, 70% of the image, plain flat magenta #FF00FF, 1024x1024.
```

## Scatter / Bonus
```
[STYLE]
A BONUS scatter slot symbol: <a retro red rotary telephone> with the word "BONUS" in chunky yellow cartoon letters on a
<ticket coming out of its right side>. Centered, 70% of the image, plain flat magenta #FF00FF, 1024x1024.
```

## Logo du jeu
```
[STYLE]
Game logo "<PIZZA RUSH>" in huge chunky glossy cartoon letters, <melted cheese dripping from the top word>, the second word
<orange with speed lines>, a small themed object <pizza box> tucked in the corner. Centered, wide, plain flat magenta #FF00FF.
```

## Personnage : référence en « pose de rig »
```
[STYLE]
CHARACTER: <Tony, a cheerful young pizza delivery boy: spiky black hair under a red baseball cap…>.
FRAMING: front three-quarter view facing slightly right, whole body, centered, head top at 12% of the image height,
feet at 90%. 16:9. Plain flat magenta background #FF00FF.
Reference pose for animation rigging: relaxed, arms held away from the body (a hand's width of magenta between each arm
and the torso), elbows slightly bent, open hands, legs slightly apart, small smile, eyes open. Nothing crosses in front of
anything else. He holds nothing.
```

## Personnage : calques (même conversation, référence jointe)
```
Use the attached full-body reference image. Keep the image EXACTLY the same size, framing and scale: do NOT zoom, do NOT
crop, do NOT move anything. Show ONLY: <the head WITHOUT the cap, with the neck extended 20% downward>. Everything else is
flat magenta #FF00FF. The part that was hidden behind other pieces is fully drawn, black outline closed all around.
```
Si une pièce est refusée (souvent le bras du côté éloigné) : faire le bras miroir de l'autre côté (Rig Lab le gère).

## Personnage : expressions (sur la tête seule)
```
Same image as the head piece, EXACTLY the same framing. The ONLY change: <big open-mouth laugh>.
```
Liste utile : yeux fermés (clignement), rire, choc (bouche en O), triste + goutte de sueur, clin d'œil.
Dans Rig Lab, on ne garde que les TRAITS (yeux, sourcils, bouche) posés sur une seule tête : la tête ne change jamais.

## Cadre des rouleaux
```
[STYLE]
A premium slot machine reel frame for <PIZZA RUSH>: <glossy red lacquered wood with polished gold trim and gold corner
brackets, a row of warm light bulbs along the top, a small checkered awning on top, a pizza peel crossed with a rolling
pin as the top-center emblem, melted cheese dripping on the corners>.
PROPORTIONS: the border is THIN: the opening takes 84% of the frame width and 80% of its height. ONE single rounded
rectangle opening, 1.5 times wider than tall, NO grid, NO lines inside. Decorations never cover the opening.
BACKGROUND: the opening and everything around the frame are flat pure magenta #FF00FF. Centered, front view, symmetric,
90% of the image width. 16:9.
```
Si l'ouverture sort trop large : on rallonge les montants unis dans le code (fait sur Pizza Rush).

## Décor (un seul fond)
```
[STYLE but: background art, slightly lower contrast and darker than the symbols, no characters, no text]
SCENE: <inside a cosy Italian pizzeria at golden evening light: brick wood-fired oven with fire on the LEFT, a red
delivery scooter on the RIGHT, string lights, hanging garlic and chili, basil plants, checkered tablecloths>.
COMPOSITION: wide 16:9. The CENTER (55% of the width, 25%-80% of the height) is a calm plain wall: the reels cover it.
Busy details only on the left and right edges and at the very top. Floor visible at the bottom.
```

## Bannières / textes (si on veut des titres dessinés plutôt que la police du jeu)
```
[STYLE]
The words "<BIG WIN>" in huge chunky glossy cartoon letters, <gold to orange gradient>, thick black outline, a few
<pizza slices> flying around, plain flat magenta #FF00FF, wide.
```

## Pièges vus en vrai
- Gemini ajoute souvent du texte (« ONLY » sur un tableau) malgré l'interdiction : vérifier et effacer.
- Gemini zoome sur la pièce demandée : ajouter « Do NOT zoom in, do NOT crop: same scale as the full-body image ».
- Les cadres sortent avec le bas raté (flou) : vérifier le bas avant d'accepter.
- Les ombres portées grises et les étincelles gênent le détourage : « no cast shadow, no sparkles ».
