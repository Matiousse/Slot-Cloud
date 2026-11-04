---
name: slot-ui
description: Interface d'une machine à sous — barre de commande, écran d'achat de bonus, écran de règles obligatoire, bandeaux contextuels, et la liste de ce qu'un opérateur exige de voir affiché. À charger quand on construit ou révise l'interface d'une slot.
---

# Interface de slot

## 0. Ce que font les studios — OBSERVÉ en jeu

Trois slots de trois studios différents, ouvertes et jouées. Seuls sont
retenus les principes présents chez **au moins deux** d'entre eux : ce sont
des conventions du métier, pas la signature d'un studio. Ne jamais reprendre
l'agencement exact d'un studio en particulier.

1. **Un écran d'intro** : logo, indicateur de **volatilité** (5 étoiles),
   **trois cartes de feature** (illustration, titre, deux lignes), gain
   maximum en gros, « PRESS TO CONTINUE ». C'est là qu'on explique la
   mécanique — **jamais en permanence à côté du plateau**, ça alourdit.
2. **Un personnage en scène**, en pied, qui **déborde sur le cadre** et
   réagit au jeu. Les trois studios en ont un. C'est le point fort le plus
   universel.
3. **Le plateau posé au sol** : une dalle, une ombre portée — il a une place
   physique dans le décor au lieu de flotter.
4. **Une interface sobre** : barre fine, solde, mise, un grand bouton de
   rotation. Elle ne se bat pas avec la scène.
5. **Un étalonnage unifié + une couleur d'accent** : toute la scène baigne
   dans une teinte dominante, et une seule couleur vive signale ce qui
   compte (bouton actif, wild, logo).
6. **Chaque catégorie de symbole a sa couleur** : bas gris ou discrets, hauts
   vifs, scatter d'une couleur unique. (Choix d'art : à décider avec
   l'artiste avant de produire les symboles.)

## 1. Ce qui est obligatoire

Un opérateur refuse un jeu à qui il manque :

- règles détaillées **accessibles depuis le jeu**
- coût et action de **chaque mode**
- **RTP et gain maximum par mode**
- table complète des gains
- valeurs et comportement des symboles spéciaux
- conditions de déclenchement du bonus
- guide des boutons
- réglage de mise couvrant **tous** les niveaux fournis par le serveur
- solde, gain final, progression des gains multiples
- son coupable, confirmation avant lancement automatique

Ce n'est pas de la décoration : c'est la première liste vérifiée.

## 2. Barre de commande

Menu · achat de bonus · compteurs (solde, gain) · mise (− valeur +) · turbo ·
lancer. Le bouton de lancement est le plus gros élément de l'écran.

Détails qui comptent :
- la barre a une **hauteur fixe**, le plateau se calcule sur ce qui reste
- une image de barre décorée sur ses bords s'étire en `border-image` 3 tranches
- donner `position:relative; z-index:1` aux enfants, sinon un pseudo-élément
  absolu les repeint et les compteurs disparaissent

## 3. Écran d'achat

Une carte par mode : illustration, nom, ce qu'on obtient en une ligne, prix.
Confirmation avant débit. Le prix affiché est **le prix réel** du mode, lu
depuis la configuration, jamais écrit en dur.

## 4. Contextuel

Ce qui ne sert que pendant une feature n'apparaît que pendant la feature. Un
bandeau de suivi visible en jeu de base est du bruit.

## 5. Langue et termes

Anglais obligatoire, et un paramètre de langue inconnu ne doit rien casser.
En mode social, respecter les termes autorisés — voir `stake-engine`, la
correspondance se fait par **racine** : `costs` et `paylines` passent à
travers un filtre par mot entier.

Formulations qui passent : PLAY, play amount, GET BONUS, ACTIVATE, FEATURE,
FREE SPINS, TOTAL WIN.

## 6. Mise en page

Le plateau ne touche jamais les bords. Portrait, paysage et mini-player sans
déformation. Tester au moins un format large et court : c'est là que la barre
du bas sort de l'écran.
