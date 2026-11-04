---
name: slot-performance
description: Performance et contraintes mobiles d'une slot — budget d'images par seconde, poids des assets, mémoire, gestion du DOM ou du canvas, mise en page qui tient en portrait comme en paysage, et les réglages de juridiction à respecter. À charger quand le jeu rame, quand on prépare la version mobile, ou avant une soumission.
---

# Performance et mobile

## 1. Budgets

- **60 images par seconde** sur un téléphone de milieu de gamme, y compris
  pendant une grosse victoire avec particules.
- Poids total du build : le plus bas possible, chaque image optimisée.
- Mémoire : décharger ce qui n'est pas à l'écran. Une série de tours gratuits
  ne doit pas accumuler d'éléments.

## 2. Mise en page

- Le plateau **ne touche jamais** les bords de la fenêtre. Il lui faut de
  l'air en haut pour les bandeaux, en bas pour la barre de commande.
- Calculer la taille du plateau à partir de la **zone disponible** après la
  barre, pas de la fenêtre entière. Sinon la barre sort de l'écran sur les
  fenêtres courtes.
- Grille : `minmax(0,1fr)` et non `1fr`, qui respecte la taille intrinsèque
  des images et fait déborder la grille de son cadre.
- Tester portrait, paysage, mini-player, et au moins un format large et court.
  La grille ne doit jamais se déformer.

## 3. Animation

- Animer `transform` et `opacity`. Tout le reste force un recalcul de mise en
  page à chaque image.
- Une animation par élément, pas une par case multipliée par le nombre de
  cases : regrouper les effets simultanés.
- Couper les animations décoratives quand l'onglet n'est pas visible.

## 4. Juridiction

L'authentification renvoie des réglages à respecter : turbo désactivé, plein
écran désactivé, mode social. Le jeu doit s'y plier sans casser sa mise en
page ni ses textes.

## 5. Mesurer, pas supposer

Profiler pendant la séquence la plus lourde (grosse victoire + particules +
compteur), pas pendant un tour perdant. Relever les images par seconde
réelles, pas l'impression.
