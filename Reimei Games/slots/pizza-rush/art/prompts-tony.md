# Tony en calques : prompts pour Gemini (Google)

Objectif : un Tony **découpé en pièces** (style Brawl Stars, contours noirs) pour que Rig Lab l'anime comme dans Spine :
bras, tête, casquette et boîte bougent chacun de leur côté, sans couture.

## Règles (sinon les pièces ne se superposent pas)
1. **Tout dans la MÊME conversation**, en joignant à chaque fois l'image de référence validée (étape 1).
2. Le bloc STYLE est recopié **mot pour mot** dans chaque prompt.
3. Fond **magenta pur #FF00FF** partout (pas de vert : ses baskets et son tablier ont des taches proches).
4. Format **16:9, 2752×1536** comme tes images actuelles, Tony **au même endroit et à la même taille** sur toutes.
5. Si une pièce sort décalée ou d'une autre taille : regénère-la, ne l'accepte pas.

## Bloc STYLE (à coller au début de chaque prompt)
```
STYLE: 2D mobile game character in the style of Brawl Stars / Clash Royale, chibi proportions (big head, ~3 heads tall),
thick uniform BLACK OUTLINE on every shape (about 8 px at this resolution), flat cel-shading with 2 tones per colour plus
one small hard highlight, light from top-left, saturated colours. NOT 3D, NOT Pixar, no soft gradients, no sparkles,
no glow, no cast shadow, no text. Plain flat magenta background #FF00FF filling the whole image.
CHARACTER (always identical): Tony, a cheerful young pizza delivery boy: spiky black hair sticking out under a red baseball
cap worn slightly tilted, big brown eyes, small red nose blush, red-and-white striped polo shirt, white apron with two small
tomato-sauce stains, blue jeans rolled once at the ankle, red-and-white sneakers.
FRAMING (always identical): front three-quarter view facing slightly to the right, whole body visible, character centred,
head top at 12% of the image height, feet bottom at 90% of the image height.
```

## Étape 1 : la référence en « pose de rig »
```
[STYLE]
Reference sheet pose for animation rigging: Tony stands relaxed in a neutral T-pose-like stance: arms held away from the
body (a hand's width of magenta between each arm and the torso), elbows slightly bent, open hands, legs slightly apart,
feet flat. Mouth closed in a small smile, eyes open. NOTHING crosses in front of anything else: no arm in front of the
torso, no hand in front of the apron. He holds nothing.
```
➡️ Quand elle est parfaite (contours noirs, proportions, couleurs), c'est **LA référence**. Garde-la, toutes les suites partent d'elle.

## Étape 2 : les pièces (une image par pièce, même conversation, référence jointe)
Gabarit à utiliser pour chaque ligne du tableau :
```
[STYLE]
Same image as the reference, EXACTLY the same framing, size and position. Show ONLY: <PIÈCE>. Everything else is flat
magenta #FF00FF. The part that was hidden behind other pieces is fully drawn, with its black outline closed all around.
```

| # | <PIÈCE> à coller | à quoi ça sert |
|---|---|---|
| 1 | `the head WITHOUT the cap (hair complete on top, spiky), with the neck extended 20% downward below the collar line` | la tête tourne et hoche autour du cou |
| 2 | `the red cap alone, including the part normally hidden by the hair` | la casquette s'envole (perte, choc) |
| 3 | `the torso alone: striped polo and apron, from the neck to the hips, shoulders rounded and complete under where the arms attach` | le buste respire et pilote tout le corps |
| 4 | `the right arm alone (upper arm, forearm and open hand), the shoulder end rounded like a capsule` | le bras droit (pouce levé, salut) |
| 5 | `the left arm alone (upper arm, forearm and open hand), the shoulder end rounded like a capsule` | le bras gauche (porte la boîte) |
| 6 | `both legs alone (jeans and sneakers), the hip ends rounded and extended 15% upward under where the torso was` | les jambes plient au saut et à l'atterrissage |

## Étape 3 : les variantes du visage (tête seule, comme la pièce 1)
```
[STYLE]
Same image as piece 1 (the head without the cap), EXACTLY the same framing. The ONLY change: <EXPRESSION>.
```
- `both eyes closed, relaxed` → clignement
- `big open-mouth laugh, eyes squeezed happy` → gros gain
- `shocked: eyes wide, small pupils, mouth open in an O` → raté de peu
- `tired and sad: half-closed eyes, mouth wavy, one sweat drop` → perte
- `confident wink with the right eye, grin` → déclenchement du bonus

## Étape 4 : les accessoires (chacun seul, fond magenta, même échelle que la référence)
- `a closed cardboard pizza box held flat, same size as in Tony's hands, red pizza logo on the lid`
- `the same pizza box with the lid open, a pepperoni pizza inside`
- `his red delivery scooter alone, side three-quarter view facing right, same scale as Tony` (pour le bonus)

## Ce que j'en fais ensuite (Rig Lab)
Recalage de chaque pièce sur la référence, puis rig : bassin → buste (pilote) → tête (+ casquette, visages permutés) /
bras (épaule, coude) / jambes. Les animations prévues :
- repos (respire, cligne, ajuste sa casquette) ;
- petit gain (pouce levé) et gros gain (saut, bras en l'air) ;
- raté de peu (choc, la casquette s'envole) et perte (soupir) ;
- entrée du bonus (clin d'œil puis il part en scooter).
