# RAIJIN OVERLOAD — machine à sous 3D pour Stake Engine

Néo-Edo, 2099. Sous un orage éternel, **Raijin**, dieu du tonnerre réincarné en méca-samouraï
géant, garde un sanctuaire de rouleaux. À chaque **Thunder Wild**, il frappe les rouleaux d'un
éclair : le rouleau entier devient sauvage avec un multiplicateur, et les multiplicateurs **se
multiplient entre eux**. Trois jeux bonus, une chasse au bonus x5 et un gain max de **10 000x**.

- Grille 5×5, 20 lignes fixes, volatilité très élevée
- **RTP 96,10 % sur tous les modes** (vérifié indépendamment, écart entre modes 0,000000 %)
- Gain maximum : **10 000x** la mise (atteignable dans tous les modes)
- 100 % 3D temps réel (three.js / WebGL2), sons 100 % synthétisés (aucun fichier externe)

## Fonctionnalités

| Feature | Règle |
|---|---|
| **THUNDER WILD** | Tombe sur les rouleaux 2, 3, 4. Raijin le foudroie : il s'étend sur tout le rouleau, remplace tous les symboles sauf BONUS et révèle un multiplicateur x2 à x100. Plusieurs Thunder Wilds sur une même ligne gagnante → multiplicateurs **multipliés**. |
| **WILD** | Rouleaux 2 à 5, remplace tous les symboles sauf BONUS. |
| **BONUS (tambours de Raijin)** | 3 / 4 / 5 tambours n'importe où → 10 tours gratuits : |
| ↳ **OVERCHARGE** (3) | Au moins un Thunder Wild à chaque tour gratuit. |
| ↳ **THUNDER LOCK** (4) | Commence avec un Thunder Wild collant ; tous les Thunder Wilds restent collés jusqu'à la fin avec leur multiplicateur. |
| ↳ **GOD MODE** (5) | Thunder Wild collant dès le départ + multiplicateurs boostés. |
| Relance | 3 tambours ou plus pendant les tours gratuits : +5 tours. |
| **THUNDER HUNT** (ante) | La mise coûte **3x** (ex. 0,30 € pour 0,10 €) et le bonus tombe **5x plus souvent** (1/227 → 1/45). |
| Achat bonus | OVERCHARGE **100x** · THUNDER LOCK **400x**. |

## Maths (fichiers Stake Engine)

Les fichiers à téléverser sont dans `math/publish_files/` :

```
index.json                       # 4 modes : base, ante, bonus, super
lookUpTable_<mode>_0.csv         # id, poids uint64, payoutMultiplier (sans en-tête)
books_<mode>.jsonl.zst           # un "book" (liste d'événements) par simulation
```

| Mode (`name`) | Coût | RTP | Fréquence de gain | Bonus | Gain max (10 000x) | Books |
|---|---:|---:|---:|---:|---:|---:|
| `base` | 1x | 96,10 % | 31,2 % | 1 / 227 | 1 / 307 685 | 126 998 |
| `ante` (Thunder Hunt) | 3x | 96,10 % | 32,4 % | 1 / 45 | 1 / 64 886 | 126 998 |
| `bonus` (Overcharge) | 100x | 96,10 % | 100 % | — | 1 / 1 869 | 100 000 |
| `super` (Thunder Lock) | 400x | 96,10 % | 99,7 % | — | 1 / 286 | 100 000 |

Détail complet (distribution des gains par tranche, écart-type…) : [`math/REPORT.md`](math/REPORT.md).

Méthode : le vrai moteur du jeu (`shared/engine.ts`) simule des dizaines de millions de parties
(24 M tours de base, 8 M + 4 M + 1,5 M bonus), échantillonnées par strates de gain (queues
sur-représentées, chaque book garde sa probabilité naturelle), puis une correction exacte fixe
le RTP de chaque mode à 96,100000 %. Un vérificateur indépendant (`math/verify.ts`) rejoue
**chaque** book (lignes recalculées depuis la grille, multiplicateurs, collants, compteurs de
tours gratuits, plafond 10 000x) et contrôle les règles Stake (RTP 90–98 %, écart ≤ 0,5 %,
≥ 100 000 simulations par mode, gain max plus fréquent que 1 / 10 M, poids entiers uint64).

```bash
npm install
npm run math          # régénère (≈5 min, déterministe) + vérifie tout
npm run math:verify   # vérification seule
```

## Front-end

```bash
npm install
npm run dev           # jeu en local (mode démo automatique sans session Stake)
npm run build         # build statique dans dist/ à téléverser sur le CDN Stake Engine
npm run build:demo    # démo autonome en un seul fichier HTML (dist-demo/index.html)
```

- Intégration RGS complète : `/wallet/authenticate`, `/wallet/play`, `/wallet/end-round`,
  `/bet/event` (reprise de partie), replay (`replay=true&game=&version=&mode=&event=`),
  montants à 6 décimales, paliers de mise du RGS (`betLevels`, `minBet`, `maxBet`, `stepBet`),
  devises Stake (dont XGC/XSC), drapeaux de juridiction (turbo, autoplay, achat bonus,
  slam-stop, espace, RTP affiché, chrono de session, position nette, durée minimale de round,
  vocabulaire social casino).
- Langues : en (référence), fr, es, de, pt ; toute autre `lang` retombe proprement sur l'anglais.
- Aucune ressource externe : polices (OFL) et code sont empaquetés ; textures, modèles 3D et
  sons sont générés de façon procédurale.
- Démo locale : `?demo_force=t1|t2|t3|storm|big` force une feature (démo uniquement).

## Déposer sur Stake Engine

1. `npm run math:verify` → doit afficher `ALL CHECKS PASSED`.
2. Téléverser le contenu de `math/publish_files/` comme fichiers maths du jeu.
3. `npm run build` → téléverser le contenu de `dist/` comme front-end (chemins relatifs).
4. Remplir la fiche : nom, description courte (ci-dessous), RTP 96,10 %, gain max 10 000x,
   volatilité très élevée, modes et coûts (tableau ci-dessus).

**Texte de présentation (blurb)** — *"Raijin has awoken. In a rain-soaked neo-Edo, the thunder
god returns as a colossal samurai mech and strikes the reels with lightning. Thunder Wilds
expand into towering pillars with multipliers up to x100 that multiply together, three bonus
games escalate from OVERCHARGE to THUNDER LOCK and GOD MODE, and THUNDER HUNT makes the bonus
five times more likely. Win up to 10,000x."*

## Guide de l'interface (UI guide)

| Élément | Rôle |
|---|---|
| Bouton central (disque tonnerre) | Lancer un tour ; re-cliquer pendant la rotation arrête les rouleaux (slam-stop). Barre d'espace sur ordinateur. |
| − / + | Changer la mise (paliers fournis par le RGS). |
| AUTO | Jeu automatique (10 à ∞ tours, arrêt optionnel au bonus). |
| TURBO | Animations accélérées. |
| ACHAT BONUS | Menu d'achat (Overcharge 100x, Thunder Lock 400x) avec confirmation. |
| THUNDER HUNT | Interrupteur de la mise ante (3x, bonus x5). |
| ☰ | Infos : règles, table de paiement (montants à la mise courante), lignes, RTP et gain max par mode, réglages son/musique/turbo. |
| Toucher l'écran | Accélère les animations en cours. |

## Arborescence

```
shared/        règles, rouleaux, moteur (commun maths + front)
math/          générateur et vérificateur des fichiers Stake, rapport
src/scene/     scène 3D (personnage, décor, cabine, symboles, rouleaux, effets)
src/game/      déroulé des parties (lecture des books)
src/net/       client RGS Stake + démo hors-ligne
src/ui/        interface HTML (barre de contrôle, menus, bannières)
src/audio/     moteur audio procédural (taiko, shamisen, tonnerre, méca)
docs/          bible artistique
dev/           banc de test 3D + outil de capture
```
