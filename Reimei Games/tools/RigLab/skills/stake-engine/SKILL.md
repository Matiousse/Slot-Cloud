---
name: stake-engine
description: Le contrat de publication Stake Engine — format des fichiers math (books/lookUpTable/index), RTP exact à l'entier près, termes interdits en mode social, API RGS et ce qu'elle permet ou non, checklist de vérification avant upload. À charger dès qu'on construit, vérifie ou publie un jeu destiné à Stake Engine, même si l'utilisateur ne nomme pas la plateforme.
---

# Publier sur Stake Engine

Tout ce qui suit vient de soumissions réelles et de retours de vérification.
Ne rien contourner : chaque point a déjà coûté un refus.

## 1. Le format des fichiers math

Par mode : `books_<mode>.jsonl.zst`, `lookUpTable_<mode>.csv`, plus un
`index.json` global.

- `lookUpTable` : `id,weight,payout` sans en-tête. `payout` est en **centièmes
  de la mise** (un x1.00 s'écrit `100`).
- Somme des poids par mode : **10^12**. C'est la convention, s'y tenir.
- Un livre = **une manche complète**, avec un `payoutMultiplier` unique.

> "All possible game-outcomes must be contained within compressed game-files…
> summarizing **a single game-round** by a simulation number, probability of
> selection, and **final payout multiplier**."

## 2. Le RTP doit être exact, pas approché

Vérifier par **égalité entière**, jamais par tolérance flottante :

    Σ(weight_i × payout_i) == RTP_en_centiemes × cost × Σ(weight_i)

Si l'égalité ne tombe pas, ajuster deux poids par un solveur diophantien
(Euclide étendu) plutôt que de bricoler un arrondi :

    (target - p_i)·a + (target - p_j)·b = excess

## 3. L'API RGS et ce qu'elle ne fait pas

`/wallet/authenticate` → `/wallet/play {amount, sessionID, mode}` →
`/wallet/end-round`. `/bet/event` **ne sert qu'à reprendre après une
déconnexion**, pas à faire remonter une décision de joueur.

**Conséquence de design, souvent découverte trop tard :** aucun choix pris en
cours de manche ne peut changer le résultat. Le gain est figé au démarrage.
Un gamble, un pick-me ou un choix de variante de bonus doivent donc :
- soit être un **mode** choisi avant l'appel à `/play` ;
- soit **couper la manche** : la première paie et se clôt, le choix du joueur
  en ouvre une seconde dont le mode porte son choix.

Si plusieurs choix sont offerts, ils doivent avoir **exactement la même
valeur**, sinon le RTP dépend du joueur et on ne peut plus annoncer un taux
fixe.

## 4. Les termes interdits (mode social)

Correspondance par **racine**, pas par mot entier — c'est ce qui laisse passer
`costs` et `paylines` :

    bet, wager, gambl, jackpot, cash, money, deposit, withdraw, casino,
    stake, odds, payline, cost, purchas, price, credit, payout, real money

À surveiller en **mot entier** (sinon « Close » déclenche sur « lose ») :

    buy, spend, paid, chance, luck, risk, lose, loss

Remplacements qui sont passés : PLAY, play amount, GET BONUS, ACTIVATE,
FEATURE, TRAIL/TRACKS, FREE SPINS, TOTAL WIN.

**Piège de scanner :** filtrer les dossiers par `'/out' in chemin` exclut tout
si le projet vit sous `.../outputs/...`. Comparer les **noms** de dossier.

## 5. Ce que le jeu doit montrer

Règles accessibles, coût et action de chaque mode, RTP et max par mode, table
complète des gains, valeurs des symboles spéciaux, conditions de bonus, guide
des boutons, tous les niveaux de mise du RGS, solde, gain final, son coupable,
confirmation avant autoplay. Mobile et mini-player sans déformer la grille.

## 6. Réseau

**Aucune requête externe.** Polices Google, analytics, CDN tiers : refus
immédiat. Tout est livré dans le build. L'URL du RGS vient des paramètres de
lancement, jamais en dur.

Montants RGS : entiers à **six décimales** (1 unité = 1 000 000).

## 7. Provenance

Ne jamais réutiliser code, SFX, art ou courbes d'animation d'un autre studio.
Une slot a déjà été publiquement identifiée comme reskin sur le Discord Stake
Engine à cause de ses SFX et de son rendu de lignes de connexion. Documenter
la provenance de chaque asset dans le README.

## Checklist avant upload

1. RTP par égalité entière sur chaque mode
2. Scan des termes par racine sur tout le texte affiché (HTML, JS, libellés API)
3. Relecture indépendante des livres : rejouer la géométrie des gains case par
   case, recalculer les gains, vérifier la cohérence des compteurs de tours
4. Aucune requête réseau sortante
5. Max win atteignable dans chaque mode, et sa probabilité mesurée
6. Provenance de chaque asset
