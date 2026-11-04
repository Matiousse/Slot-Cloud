---
name: slot-verify
description: Procédure complète de vérification avant publication d'une slot — les six portes à franchir, dans l'ordre, avec les commandes et les pièges de chacune. À invoquer avant toute soumission, ou quand l'utilisateur demande si le jeu est publiable.
---

# Vérifier avant de publier

Six portes. Aucune n'est optionnelle. Chacune affiche **combien d'unités elle
a examinées** — un succès sur zéro fichier est le piège classique.

## Porte 1 — RTP exact

Pour chaque mode, relire `lookUpTable_<mode>.csv` et vérifier par **égalité
entière** :

    Σ(w_i × p_i) == RTP_centiemes × cost × Σ(w_i)

Afficher les deux membres. Un écart, même d'une unité, se corrige par le
solveur diophantien sur deux poids — jamais par un arrondi.

Vérifier aussi que la somme des poids vaut bien 10^12 par mode.

## Porte 2 — Relecture indépendante des livres

Un vérificateur qui **ne partage aucun code** avec le générateur :
- rejoue la géométrie de chaque combinaison case par case
- recalcule les gains avec multiplicateurs
- contrôle la cohérence des compteurs de tours d'une série
- confirme que le gain du livre égale le gain recalculé

Rapporter le nombre de livres relus et le nombre d'écarts.

## Porte 3 — Termes restreints

Scanner tout le texte **affiché** : HTML, chaînes JS en majuscules, libellés
servis par l'API. Correspondance par **racine** pour les termes confirmés,
par **mot entier** pour les mots surveillés (sinon « Close » déclenche sur
« lose »).

Afficher le **nombre de chaînes analysées**. Piège réel : un filtre
`if '/out' in chemin` avait exclu tout le projet, qui vivait sous
`.../outputs/...`. Comparer les **noms** de dossier.

## Porte 4 — Réseau

Aucune requête sortante depuis le build. Chercher `http://`, `https://`,
`fonts.googleapis`, `cdn.`, `fetch(` vers un domaine. Les polices externes
sont un motif de refus explicite.

L'URL du serveur vient des paramètres de lancement, jamais en dur.

## Porte 5 — Plafond

Pour chaque mode : le gain maximum est-il **atteignable**, et à quelle
probabilité ? Le calculer exactement (chaîne de Markov) plutôt que d'espérer
le voir sortir en simulation. Un mode dont le plafond est inatteignable est
un défaut de conception.

## Porte 6 — Provenance

Chaque asset — image, son, police, fragment de code — doit avoir une origine
documentée dans le README. Rien d'emprunté à un autre studio, SFX et courbes
d'animation compris : ce sont eux qui font repérer un reskin.

---

## Rapport final

Un tableau : porte, unités examinées, résultat. Pas de « tout est bon » sans
les chiffres en face.
