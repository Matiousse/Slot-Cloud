---
name: slot-character
description: Personnage 2D animé pour une slot — découpe en pièces, placement des pivots, hiérarchie d'os, ordre de dessin, jeu d'animations attendu, et choix d'outil selon la licence (Spine, Rive, os en code). À charger quand on veut un personnage qui réagit aux gains, au bonus ou à la perte.
---

# Personnage 2D de slot

Un personnage qui réagit est le plus gros gain de présence par euro dépensé.
Il transforme une grille en jeu.

## 1. Choisir l'outil — la licence décide

| outil | licence | verdict |
|---|---|---|
| **Os en code** | le tien | **par défaut** : zéro dépendance, zéro risque, marche en DOM puis en PixiJS |
| **Rive** | runtimes MIT, éditeur gratuit | bon si tu veux un éditeur visuel ; vérifier les conditions commerciales de ton offre |
| **Spine** | payant, par siège | standard du métier, à n'envisager qu'une fois le jeu rentable |
| **spine-animation-ai** | **PolyForm Noncommercial** | **interdit** en commercial. Vérifié. |

Pour un premier jeu : **os en code**. Une hiérarchie de transforms imbriqués
fait 90 % du travail d'un Spine, et le résultat t'appartient entièrement.

## 2. Demander les pièces à ChatGPT

Ne jamais demander « un personnage ». Demander **les pièces séparées**, même
style, même éclairage, chacune sur fond transparent :

    tete            (avec le cou, qui sera caché par le torse)
    machoire        (si la bouche doit s'ouvrir)
    torse
    bassin
    bras_haut_G / bras_bas_G / main_G
    bras_haut_D / bras_bas_D / main_D
    cuisse_G / jambe_G / pied_G
    cuisse_D / jambe_D / pied_D
    accessoire      (arme, torche, masque…)

Exiger dans le prompt : **chevauchement** de 10 à 15 % à chaque articulation,
sinon un trou apparaît dès que ça tourne. Et une pose neutre, bras écartés,
de face ou de trois quarts — jamais une pose dynamique.

## 3. Pivots

Le pivot de chaque pièce se place **au centre de l'articulation qui la porte**,
pas au centre de l'image. Un avant-bras pivote au coude. Une erreur de pivot
se voit immédiatement : le membre glisse au lieu de tourner.

En CSS : `transform-origin`. En PixiJS : `anchor` ou `pivot`.

## 4. Hiérarchie

    bassin
    ├── torse
    │   ├── tete
    │   │   └── machoire
    │   ├── bras_haut_G → bras_bas_G → main_G → accessoire
    │   └── bras_haut_D → bras_bas_D → main_D
    ├── cuisse_G → jambe_G → pied_G
    └── cuisse_D → jambe_D → pied_D

Chaque enfant hérite de la rotation de son parent. C'est toute la magie d'un
squelette : tourner le torse emmène la tête et les bras.

## 5. Ordre de dessin

Le membre du côté opposé à la caméra passe **derrière** le torse. Si une
animation fait passer un bras devant puis derrière, l'ordre doit changer en
cours de route — le prévoir dès le montage, c'est le piège classique.

## 6. Jeu d'animations pour une slot

    repos               boucle, respiration, clignement aléatoire
    attente_longue      après 15 s sans action, il s'ennuie
    lancement           réaction brève au départ du tour
    presque             déception quand l'anticipation échoue
    gain_petit          hochement
    gain_moyen          poing levé
    gain_gros           célébration, 2 s minimum
    plafond             célébration longue, unique
    bonus_entree        pose de présentation
    bonus_boucle        attitude différente du repos
    bonus_sortie
    perte               épaules qui tombent, court

La **respiration** au repos est l'animation la plus importante : sans elle le
personnage est un autocollant. Torse qui monte de 2 %, 3 secondes de cycle,
décalé d'une légère rotation de tête.

## 7. Principes

- Le corps ne bouge jamais d'un bloc : décaler chaque os de 30 à 60 ms
  (c'est ce qui crée le fouetté).
- Une animation part d'une **anticipation** inverse : se baisser avant de
  sauter, reculer le bras avant de frapper.
- L'accessoire continue après la main : il a de l'inertie.
- Les yeux bougent avant la tête.

## 8. Brancher

Le personnage s'abonne au bus (`slot-events`) : il écoute `WIN_RESOLVED`,
`BIG_WIN`, `BONUS_START`, `SPIN_END`. Il **ne lit jamais** l'état du jeu
directement. Le retirer entièrement doit laisser le jeu jouable.

## 9. Qualite studio sans Spine (etabli sur Bone Trail, 2026-09-22)

Recherche : les outils publics "Claude + Spine" ne font que des os rigides
(spine-animation-ai est en plus interdit en commercial, PolyForm NC) ;
spine_anim_mcp et rigc (MIT) produisent du Spine sans maillage pondere ni
physique. Spine Professional coute 379 $ (Enterprise au-dela de 500 k$ de CA).
Le meme calcul s'ecrit directement dans Pixi, sans licence :

- **Maillages ponderes (skinning lineaire)** : chaque piece est un MeshPlane
  dont les points suivent 1 a 3 os selon des poids peints par une fonction des
  coordonnees de l'image ; v' = somme w_i * (Monde_i * Liaison_i^-1) * v.
  Les coudes plient le dessin au lieu de tourner d'un bloc.
- **Os-ressorts** (cape en chaine de 3, jupe, meches) : inertie pilotee par
  l'acceleration de l'attache + l'acceleration angulaire du parent, plus un
  ressort d'etirement pour les rebonds verticaux.
- **Rotules** : les pieces generees separement ont des faces de coupe plates.
  Ombrer le disque d'epaule du torse (croissant cel) et le poser PAR-DESSUS le
  haut du bras, pivot au centre du disque, haut du bras efface en fondu.
- **Cou** : fondre le bas du cou colonne par colonne, seulement sous le
  contour du torse (un fondu uniforme laisse voir le ciel au travers).
- **Accessoire plante** : IK a deux os (epaule -> poignet -> bout) pour que le
  bout reste exactement au sol quand le corps bouge ; verrou relache (0..1)
  pendant les gestes qui le levent.
- **Expressions** : variantes de la tete (clignement, joie, deception), meme
  cadrage ; demander des prompts d'edition ChatGPT a partir de la tete.
- Verifier chaque pose en capture 2x (snap 3840x2160), les raccords ne se
  jugent qu'en gros plan.
- **D'abord l'illustration complete** : si les pieces decoupees ont perdu un
  element qui couvrait une articulation (epaulettes, col, manchette), le
  reprendre sur l'illustration d'origine et le poser par-dessus (Bone Trail :
  les epaulettes de feuilles ont regle les epaules la ou ombrage et fondus
  avaient echoue).
- **Cou** (correction du point precedent) : ni fondu seul ni recoloriage des
  contours ne suffisent quand la coupe du cou tombe pile sur le contour du
  torse. Il faut une longueur de recouvrement : prolonger le cou vers le bas
  avec sa peau lissee (sans les petits traits), bords arretes au torse, puis
  le fondre sur la poitrine, et tester la tete penchee dans les deux sens.
- **Asseoir un perso vu de face** (Bone Trail, TOTAL WIN) : des jambes droites
  posees sur un rebord se lisent "debout". Il faut : (1) couper l'image des
  jambes en deux pieces, jupe DEVANT, bas des jambes DERRIERE (recouvrement
  en fondu de ~15 px) ; (2) tasser le giron (os 'lap', sy ~0.58) ; (3) faire
  remonter les tibias sous la jupe jusqu'a cacher les genoux ; (4) un os par
  tibia, pieds un peu ecartes, balancement alterne + petit coup de pied (sy) ;
  (5) le siege juste sous la ceinture, sur le rebord. Mieux encore : une
  image de jambes assises dediee.
