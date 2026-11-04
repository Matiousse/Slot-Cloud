---
name: slot-studio
description: Chef d'orchestre pour la création d'une machine à sous complète — quelle discipline intervient quand, l'ordre dans lequel une slot se construit, la bible de design à remplir, et le partage des rôles avec ChatGPT qui fournit les images. À charger quand on démarre une nouvelle slot, qu'on planifie une feature, ou quand la demande touche plusieurs métiers à la fois.
---

# Studio de slot

Ce skill décide **qui intervient et dans quel ordre**. Les détails sont dans
les skills spécialisées : `stake-engine`, `slot-math`, `slot-feel`,
`slot-art`.

## L'ordre qui évite de tout refaire

1. **Mécanique** — ce que le joueur fait, ce qu'il espère, pourquoi il
   relance. Une phrase. Si elle ressemble à un jeu existant, recommencer.
2. **Contrainte plateforme** — vérifier tout de suite ce que le RGS permet
   (`stake-engine`). Un choix en cours de manche, par exemple, est
   impossible ; le découvrir après l'interface coûte tout le travail.
3. **Math** — table des gains, valeur des features par chaîne de Markov, prix
   des achats, calibrage de la volatilité (`slot-math`). Les prix et
   fréquences sont **déduits**, pas choisis.
4. **Prototype jouable** — grille, tirage côté serveur, trace d'événements.
   Le client ne connaît jamais la math.
5. **Ressenti** — rythme, anticipation, escalade (`slot-feel`).
6. **Art** — prompts, nettoyage, intégration (`slot-art`).
7. **Son** — dernier, mais pas optionnel : une slot muette paraît cassée.
8. **Vérification indépendante** puis checklist de publication.

## La bible à remplir

Boucle de jeu · grille · symboles · table des gains · modèle math · RTP ·
volatilité · fréquence des features · design du bonus · présentation des
gains · anticipation · animation · VFX · audio · musique · interface ·
performance mobile · QA.

Un point non écrit est un point non décidé.

## Partage avec ChatGPT

ChatGPT fait **les images**, rien d'autre. Ici : les prompts, le découpage,
le nettoyage, l'intégration, l'animation, la math, le code, la QA.

Quand un asset manque, écrire un prompt complet prêt à coller (`slot-art`),
pas une description approximative.

## Deux réflexes

- **Originalité.** Ne jamais reprendre SFX, courbes d'animation, rendu de
  connexions ou structure de feature d'un studio existant. Les joueurs
  identifient un reskin en quelques heures.
- **Regarder, pas déduire.** Lire le code dit ce qui devrait s'afficher.
  Ouvrir la page et mesurer dit ce qui s'affiche.
