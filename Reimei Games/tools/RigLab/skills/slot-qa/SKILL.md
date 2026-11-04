---
name: slot-qa
description: Vérification d'une slot — relecture indépendante des livres, preuve de la lecture du plateau, diff des clés d'événements contre des captures réelles, simulation massive, pièges de scanners qui donnent de faux succès. À charger avant toute publication, ou dès qu'un comportement de jeu ne correspond pas à ce que la math annonce.
---

# Vérifier une slot

## 1. Le vérificateur ne partage rien avec le générateur

Il relit les fichiers produits, jamais les objets en mémoire. Il **réimplémente**
l'évaluation des gains. Un bug partagé entre générateur et vérificateur est
invisible par construction.

Ce qu'il contrôle :
- géométrie de chaque combinaison, case par case (sauts de colonne, sauts de
  ligne, chemins entièrement composés de wilds qui ne doivent rien payer)
- recalcul des gains avec multiplicateurs
- cohérence des compteurs de tours d'une série
- égalité entière du RTP
- max win atteignable et sa probabilité

## 2. Prouver la lecture du plateau

Un plateau encodé en chaîne se lit **par colonnes** ou **par lignes**, et se
tromper produit un jeu qui a l'air de marcher. Ne pas supposer : prendre des
manches réellement capturées, rejouer les deux hypothèses, compter.

Un résultat honnête ressemble à : *lecture par lignes reproduit 0 gain sur 18,
lecture par colonnes 18 sur 18*. Tout ce qui est moins net n'est pas une preuve.

## 3. Diff des clés d'événements

Quand le moteur officiel plante sur une manche, comparer **l'ensemble des clés**
de chaque événement produit avec celles d'une capture de référence
(`fixtures/`). Les schémas partiels sont la première cause de gel : un objet de
gain auquel manque le détail des combinaisons fait échouer l'animation, et
l'erreur remonte très loin de sa cause.

Vérifier aussi les événements **absents** : un compteur de tours incohérent
vient souvent d'un événement de relance jamais émis.

## 4. Scanners : se méfier des succès

Un scanner qui annonce « 0 problème » doit d'abord prouver **combien de
fichiers il a analysés**. Piège réel : un filtre `if '/out' in chemin` excluait
la totalité du projet, parce qu'il vivait sous `.../outputs/...`. Le scan
annonçait un succès sur 0 fichier.

Toujours afficher le nombre d'unités examinées à côté du résultat.

## 5. Simulation massive

Lancer 1 à 10 millions de manches et comparer à la spécification : RTP,
fréquence de gain, volatilité, gain moyen, maximum observé, fréquence du bonus,
distribution. Un écart sur la **médiane** est aussi parlant qu'un écart sur la
moyenne.

## 6. Regarder le jeu

Aucune relecture de code ne remplace l'ouverture de la page. Mesurer les
rectangles réels du DOM, capturer, tester au moins un format de fenêtre large
et court. Beaucoup de défauts n'existent qu'à certaines proportions.
