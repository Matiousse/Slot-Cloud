---
name: slot-feel
description: Le ressenti d'une slot — rythme du spin, anticipation, présentation des gains, escalade des grosses victoires, timings d'animation en millisecondes, erreurs de mise en scène qui font paraître un jeu amateur. À charger dès qu'on anime une grille, met en scène un gain, un déclenchement de bonus ou un max win.
---

# Le game feel d'une slot

Ce qui sépare un jeu de studio d'un prototype, ce n'est presque jamais l'art.
C'est le **rythme**.

## 1. Règles de rythme

- **Rien ne dure plus que sa valeur.** Un petit gain ne mérite pas la même
  mise en scène qu'un gros. Trois paliers au minimum.
- **Le parallèle bat la file.** Plusieurs gains simultanés s'allument **tous
  en même temps**, balayés de gauche à droite. Les jouer l'un après l'autre
  rend le jeu interminable — c'est le premier reproche des joueurs.
- **Le joueur doit pouvoir couper.** Turbo, et un clic qui saute l'animation.
- **Le silence existe.** Un tour perdant doit être court et sec.

## 2. Mettre en valeur une combinaison

La séquence qui marche :

    0 ms     toute la grille passe en gris/sombre
    110 ms   les cases gagnantes s'allument, une par pas
    +150 ms  par pas : éclat, léger agrandissement, note qui monte
    +340 ms  pause avant le compteur

Éclairer les symboles **un par un** lit mieux qu'une ligne tracée par-dessus.
Une ligne de connexion dessinée au-dessus des symboles est à la fois fragile
techniquement et un marqueur visuel très reconnaissable d'un autre studio.

## 3. Anticipation

L'anticipation ne se déclenche pas sur le résultat, mais sur **l'approche** :
deux symboles bonus posés, le troisième rouleau ralentit. Couper la musique,
monter une tension, puis résoudre. Sans anticipation, un bonus tombe à plat.

## 4. Escalade

Une grosse victoire monte par **paliers nommés**, pas en une fois. Le
compteur accélère, marque un temps à chaque palier, et le joueur a le temps
de comprendre où il en est. Un compteur qui défile d'un bloc ne procure rien.

## 5. Erreurs qui trahissent l'amateur

- Le plateau collé aux bords de la fenêtre. Il lui faut de l'air — et c'est
  là que descendent les bandeaux de suivi.
- Un compteur affiché avant le choix du joueur qui montre déjà le résultat du
  choix (typiquement « 12 » à côté d'un bouton « COLLECT 8 »).
- Des animations qui se jouent pendant qu'on ne peut plus rien cliquer, sans
  indication.
- Une grille qui déborde de son cadre : utiliser `minmax(0,1fr)`, car
  `1fr` respecte la taille intrinsèque des images.
- Un pseudo-élément absolu qui repeint par-dessus ses frères non positionnés :
  donner `position:relative; z-index:1` aux enfants.

## 6. Vérifier en regardant

Lire le code dit ce qui **devrait** s'afficher, jamais ce qui s'affiche.
Ouvrir la page, mesurer les rectangles réels dans le DOM, prendre une capture.
Beaucoup de défauts de cadrage ne se voient qu'à certaines proportions de
fenêtre : tester au moins un format large et court.
