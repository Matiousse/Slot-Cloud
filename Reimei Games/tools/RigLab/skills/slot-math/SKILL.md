---
name: slot-math
description: Méthodes de mathématiques de machine à sous — viser un RTP exact, évaluer une feature par chaîne de Markov au lieu de Monte-Carlo, échantillonnage stratifié, pondération par inclinaison exponentielle, prix d'un bonus-buy, calibrage de la volatilité et de la rareté du max win. À charger dès qu'on conçoit, calibre ou vérifie l'économie d'une slot.
---

# Mathématiques de slot

## 1. Ne jamais simuler ce qui se résout

Une série de tours gratuits est presque toujours une **chaîne de Markov** sur
un petit état (niveau atteint, tours restants). La résoudre exactement bat
Monte-Carlo de très loin : la queue est trop lourde pour que la moyenne
empirique converge.

Recette :
1. Mesurer par MC seulement les **moyennes par état** (gain moyen d'un tour à
   chaque niveau) — peu de quantités, donc beaucoup d'échantillons chacune.
2. Résoudre la chaîne par récurrence.

Si un état **absorbe** (max win atteint, qui *remplace* le total au lieu de
s'y ajouter), suivre deux quantités :
- `P(état)` : probabilité d'absorption
- `G(état)` : gain accumulé sur les trajectoires qui n'absorbent **pas**

    V = P·MAXWIN + G
    G = Σ branches [ (1 - P_suite)·gain_branche + G_suite ]

Ça donne aussi la probabilité exacte du max win, gratuitement.

## 2. Le RTP se vise à l'entier près

Voir la skill `stake-engine` : égalité entière, puis correction diophantienne
sur deux poids. Ne jamais accepter « 95,997 % ≈ 96 % ».

## 3. Inclinaison exponentielle

Pour amener un pool de livres à une moyenne cible **sans perdre son support** :

    w_i ∝ exp(−λ · p_i)

et bissection sur λ jusqu'à la moyenne visée. Tous les résultats restent
possibles, seule leur fréquence bouge. Incliner **vers le bas** est sûr ;
incliner vers le haut concentre le poids sur la queue et déforme le ressenti —
préférer alors régénérer le pool avec un paramétrage plus généreux.

## 4. Échantillonnage stratifié

Pour un déclenchement par N symboles bonus, stratifier sur le **nombre de
symboles** avec les probabilités binomiales exactes, plutôt que d'espérer que
l'échantillon tombe juste. Les cas rares sont alors représentés proprement.

## 5. Prix d'un bonus-buy

Le prix n'est **pas** un choix : `prix = valeur_mesurée / RTP`. Si la valeur
mesurée change après recalibrage, le prix change. Vendre une feature à 200
quand elle vaut 307, c'est un RTP de 153 %.

Si on veut un prix rond, garder le prix et **incliner le pool vers le bas**
pour absorber l'écart — jamais l'inverse.

## 6. Calibrer la volatilité

Une feature où chaque réussite **rallonge** la série s'auto-alimente et
s'emballe. Balayer un facteur commun sur la courbe de déclenchement et
regarder trois chiffres ensemble :

- la rareté du **max win** (pour un x100 000, viser 1 sur 5 à 50 millions)
- la **médiane**, très en dessous de la moyenne dans une bonne slot
- la part de features qui **ne donnent rien** — c'est elle qui donne du poids
  aux autres ; 30–45 % est sain

## 7. Choix du joueur et RTP

Si le joueur choisit entre plusieurs options, **toutes doivent avoir la même
valeur**. Sinon le RTP dépend du joueur et le taux annoncé devient faux.

Quand une échelle de récompenses imposée ne tient pas l'équité, ne pas
changer les nombres promis au joueur : ajouter une **seconde dimension de
récompense** (avance de progression, symboles déjà acquis, multiplicateur de
départ) et recalculer. Le joueur garde ses chiffres, la math retombe juste.

## 8. Vérification indépendante

Le vérificateur ne doit **pas** réutiliser le générateur. Il relit les
fichiers, rejoue la géométrie des gains case par case, recalcule les gains
avec multiplicateurs, contrôle la cohérence des compteurs, et refait
l'égalité entière du RTP. Un bug partagé entre générateur et vérificateur ne
se voit jamais.
