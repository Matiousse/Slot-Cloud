---
name: slot-events
description: Architecture événementielle d'une slot — le bus qui sépare strictement math, gameplay et présentation, la liste des événements standards, le contrat de chaque abonné (animation, VFX, SFX, musique, interface), et les règles qui empêchent la présentation de contaminer le moteur. À charger dès qu'on écrit ou refactorise la boucle de jeu, ou qu'on branche une animation, un son ou un effet sur un moment de jeu.
---

# Le bus d'événements

La règle qui tient tout : **aucun système de présentation n'est appelé
directement par le gameplay**. Le moteur émet, les autres écoutent.

    MATH (serveur)  ──trace d'événements──▶  GAMEPLAY  ──▶  BUS
                                                             │
                              ┌──────────────┬───────────────┼───────────────┐
                              ▼              ▼               ▼               ▼
                          ANIMATION         VFX             SFX          INTERFACE

Ce qu'on gagne : remplacer toutes les animations, tous les sons ou tous les
effets sans toucher une ligne de math. Et pouvoir jouer la même manche en
mode turbo, en replay ou en capture, juste en changeant les abonnés.

## Les événements standards

    SPIN_START          la manche part, la mise est débitée
    REEL_START          les rouleaux tournent
    REEL_STOP           un rouleau s'arrête        {reel}
    SYMBOL_LAND         un symbole se pose         {cell, symbol}
    ANTICIPATION        un rouleau ralentit        {reel, reason}
    WIN_FOUND           le moteur a trouvé les gains {wins[], total}
    WIN_PATH_START      une combinaison commence   {path, symbol}
    WIN_TICK            un pas de la combinaison   {cell, step}
    WIN_RESOLVED        la combinaison est payée   {amount}
    MULTIPLIER_CHANGE   un multiplicateur bouge    {cell, from, to}
    BIG_WIN             palier franchi             {tier, amount}
    BONUS_TRIGGER       le bonus est décroché      {scatters}
    BONUS_CHOICE        le joueur doit trancher    {options[]}
    BONUS_START         la série démarre           {spins, state}
    BONUS_SPIN          un tour de la série        {spinsLeft}
    BONUS_END           la série se termine        {total}
    JACKPOT             le plafond est atteint
    SPIN_END            la manche est soldée       {win}

Un jeu n'en utilise qu'une partie. Ne pas en inventer sans raison : un nom
non standard est un abonné que personne ne retrouvera.

## Contrat des abonnés

- Un abonné **ne modifie jamais** la charge de l'événement.
- Un abonné **ne décide rien** : il ne peut pas changer un gain, un compteur
  ou l'état de la manche. S'il en a besoin, c'est que le moteur doit émettre
  l'information.
- Un abonné peut être **asynchrone**. Le gameplay attend la fin des abonnés
  avant d'émettre l'événement suivant quand le rythme le demande
  (`await bus.emit(...)`), et n'attend pas quand l'effet est décoratif.
- Un abonné **peut être absent**. Le jeu doit tourner sans son, sans VFX et
  sans animation. C'est le test qui prouve la séparation.

## Le turbo et le saut

Le turbo n'est pas un multiplicateur de vitesse éparpillé dans le code : c'est
**un facteur de durée porté par le bus**. Chaque abonné lit la durée qu'on lui
donne. Un clic pendant la présentation coupe les abonnés en cours et laisse le
moteur finir — jamais l'inverse.

## Erreurs qui cassent la séparation

- Lire le solde ou le gain depuis un abonné d'animation.
- Décider d'un palier de grosse victoire dans la couche de présentation :
  c'est le moteur qui émet `BIG_WIN {tier}`.
- Déclencher un son depuis la fonction qui peint la grille.
- Faire dépendre la math du temps écoulé côté client.
