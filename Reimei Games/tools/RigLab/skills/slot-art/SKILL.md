---
name: slot-art
description: Pipeline d'art pour une slot quand les images sont générées par ChatGPT — structure d'un prompt qui rend des assets cohérents et détourables, nettoyage du damier de transparence peint dans l'image, découpe, intégration d'un cadre et de ses marges, barre d'interface étirable. À charger dès qu'il faut demander, nettoyer ou intégrer un asset graphique de slot.
---

# Pipeline d'art de slot

L'art vient de ChatGPT à partir de prompts écrits ici. Le seul moyen d'avoir
une série cohérente est de **réutiliser le même bloc STYLE mot pour mot**
dans chaque prompt, et de ne faire varier que le SUBJECT.

## 1. Structure d'un prompt qui marche

    [TYPE] ... on a fully transparent background. PNG with alpha.

    STYLE: <bloc identique pour toute la série — technique, épaisseur du
    contour, nombre de tons, direction de la lumière, palette nommée,
    interdits : no photorealism, no 3D render, no drop shadow on the ground>

    SUBJECT: <ce qui change>

    COMPOSITION / PROPORTIONS: <cadrage, rapport largeur/hauteur, ce qui doit
    rester VIDE parce qu'on posera le texte ou l'icône par-dessus en code>

    <interdits finaux : no text, no frame, no background>

Points qui changent tout :
- **Rappeler le fond transparent à chaque fois**, et quand même vérifier.
- Dire ce qui doit rester **vide** : un bouton dont le centre est vide se
  réutilise pour quatre fonctions, un bouton avec une icône dessinée est jeté.
- Pour une barre étirable : « la décoration reste dans les tiers gauche et
  droit, le tiers central doit être plat et uniforme ».
- Pour un cadre : donner la taille de la **fenêtre transparente** en
  pourcentage, et exiger qu'elle soit complètement vide.
- Exiger la lisibilité à la taille réelle : « readable at 60 pixels wide ».

## 2. Le damier de transparence peint dans l'image

Piège fréquent : l'image rendue n'a **aucun canal alpha utile**, le damier de
transparence est *dessiné* dedans. Détection et nettoyage :

1. Si `alpha.min > 250`, il n'y a pas de transparence du tout.
2. Le damier est un gris clair très peu saturé : `min(r,g,b) > 185` et
   `max−min < 14`. Un crème chaud (os, ivoire) passe à travers ce test, donc
   le sujet n'est pas attaqué.
3. **Remplissage par diffusion depuis les bords**, pas un remplacement global,
   sinon on troue l'intérieur du sujet.
4. Pour un **cadre**, le damier est enfermé dans la fenêtre : lancer une
   diffusion supplémentaire **depuis le centre**.
5. Éroder d'un pixel pour manger le liseré, puis recadrer sur l'alpha.

## 3. Intégrer un cadre

Ne jamais estimer les marges à l'œil. Mesurer la **fenêtre transparente
réelle** : pour plusieurs lignes et colonnes, prendre la plus longue plage
d'alpha nul, garder l'intersection. En tirer les insets en pourcentage.

Vérifier ensuite que le rapport de la fenêtre correspond à la grille :
`fenêtre_l/fenêtre_h` contre `colonnes/lignes`. S'il diffère, garder des
cases aux bonnes proportions et centrer dans la fenêtre plutôt que d'étirer.

## 4. Barre d'interface étirable

Une image dont seuls les bords sont décorés s'étire proprement en
`border-image` 3 tranches :

    border-style:solid; border-width:0 <bord> ;
    border-image:url(barre.png) 0 <bord_px> 0 <bord_px> fill /
                 0 <bord> / 0 stretch

Penser à donner `position:relative; z-index:1` aux enfants de la barre, sinon
un pseudo-élément absolu les repeint.

## 5. Vérifier

Après intégration, **regarder** : ouvrir la page, mesurer les rectangles du
DOM, capturer. Un asset peut être parfait et mal posé.
