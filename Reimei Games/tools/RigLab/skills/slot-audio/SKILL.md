---
name: slot-audio
description: Audio d'une machine à sous — taxonomie des SFX, musique en couches qui réagit à l'état du jeu, mixage et ducking, budget mobile, et les contraintes de licence et de réseau qui décident si un son est publiable. À charger dès qu'on conçoit, génère ou intègre du son dans une slot.
---

# Le son d'une slot

Une slot muette paraît cassée. C'est le dernier poste traité et le premier
remarqué.

## 1. Contraintes avant toute création

- **Aucune requête réseau depuis le build.** Tous les fichiers sont livrés
  avec le jeu. Un son chargé depuis un service externe fait refuser la
  soumission.
- **Licence vérifiée et documentée.** Un SFX repris d'un autre jeu est
  identifiable à l'oreille : c'est exactement ce qui a fait repérer un reskin
  publiquement. Générer ou acheter, jamais emprunter.
- Formats : un seul, compressé, court. Prévoir un budget total et s'y tenir.

## 2. Taxonomie minimale

    INTERFACE   survol, appui, ouverture de panneau, fermeture
    ROULEAUX    départ, tic, arrêt, accélération, anticipation
    SYMBOLES    pose, allumage, connexion, destruction, transformation
    GAINS       trois paliers au moins, puis grosse victoire, puis plafond
    BONUS       déclenchement, entrée, tour, fin
    COMPTEUR    tic de défilement, et son de fin distinct

## 3. Variation obligatoire

Tout son qui se répète plusieurs fois dans une même manche doit exister en
**trois ou quatre variantes** tirées au hasard, ou être décalé en hauteur à
chaque répétition. Un son de connexion identique dix fois d'affilée est le
marqueur sonore d'un prototype.

Une gamme qui monte à chaque pas d'une combinaison fait le travail à elle
seule : elle donne le rythme *et* évite la répétition.

## 4. Musique en couches

Une boucle unique ne suffit pas. Découper en stems et les activer selon
l'état :

    percussion + basse            jeu de base
    + nappe tendue                anticipation
    + mélodie                     bonus
    + cuivres / montée            grosse victoire

Les couches partagent le même tempo et la même grille, donc elles entrent et
sortent sans coupure. Une transition se fait sur la mesure, jamais à l'instant
de l'événement.

## 5. Mixage

- **Ducking** : la musique baisse pendant un gain, remonte après.
- **Priorités** : un son de gain passe devant un son d'interface. Limiter le
  nombre de voix simultanées, sinon le mobile sature et grésille.
- **Coupable** : un bouton son obligatoire, et le respect du mode silencieux.
- Tester au casque **et** sur un haut-parleur de téléphone : l'aigu qui porte
  au casque disparaît sur un téléphone.

## 6. Brancher sans coupler

Les sons s'abonnent au bus d'événements (voir `slot-events`). Aucun appel de
son depuis la fonction qui peint la grille : le jeu doit tourner entièrement
sans le module audio.
