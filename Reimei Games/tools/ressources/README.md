# Ressources du studio (fouille GitHub du 04/11/2026)

Tout ce qui est ici est **utilisable commercialement** (licence notée à côté). Rien de « usage personnel ».
Ce qui a été écarté et pourquoi est listé en bas.

| Dossier | Quoi | Licence | À quoi ça nous sert |
|---|---|---|---|
| `stake-engine/` | Docs officielles Stake Engine : `RGS.md` (API wallet, devises, langues, codes d'erreur), `data_format.md` (format exact des fichiers de maths), `ui.md`, `mots-social-casino.ts` (mots officiels du mode social), `exemple-ways-math-sdk/` (jeu « ways » de référence du math-sdk) | MIT (Stake Engine) | Vérifier chaque jeu contre le contrat officiel avant envoi |
| `audio-synthese/` | Bandes-son 100 % synthétisées (WebAudio) de deux slots finies (`the-dynasty`, `samurai`) + `sfxr.js`/`riffwave.js` (générateur de bruitages, export WAV) | MIT (APEXSLOTS) / Unlicense (jsfxr) | Techniques reprises : réverbération Schroeder, arrêts de rouleaux spatialisés gauche→droite qui montent l'accord, figure de comptage pendant le défilement des gains, son coupé mémorisé, instruments physiques (FM, cordes pincées) |
| `rouleaux/` | Bonnes pratiques de `pixi-reels` (moteur de rouleaux PixiJS v8) | MIT | Spin lancé avant la réponse serveur, son branché sur les événements, arrêt instantané (slam stop), tests sans affichage |
| `maths-reference/slotopol-yaml/` | 175 fiches de maths de vraies machines (bandes de rouleaux, paytables, RTP calculés exactement) | MIT (slotopol) | Points de comparaison pour calibrer volatilité, fréquence de bonus, longueur des bandes |
| `prompts-slots.md` | Bibliothèque de prompts d'images pour slots, testée sur Pizza Rush | à nous | Copier-coller pour Gemini / ChatGPT |

## Dépôts à connaître (non copiés en entier, trop gros)
- **StakeEngine/math-sdk** (MIT) : moteur de maths officiel en Python + optimiseur Rust. Nos maths TypeScript produisent
  déjà le même format ; utile si un jeu demande l'optimiseur de distribution.
- **StakeEngine/web-sdk** (MIT) : front officiel Svelte 5 + PixiJS 8 (apps `ways`, `lines`, `cluster`, `scatter`).
  Notre front PixiJS est indépendant mais respecte les mêmes règles.
- **Z1000k/open-source-slots** (code et sons MIT, art CC BY 4.0 avec crédit « Art by APEXSLOTS ») : 12 slots complètes.
- **schmooky/pixi-reels** (MIT) : moteur de rouleaux avec cascades, mégaways, symboles Spine.
- **slotopol/server** (MIT) : serveur de maths de centaines de jeux.

## Ce qu'on en a tiré tout de suite (Pizza Rush)
- Mode social casino aussi activé par l'URL `?social=true` (pas seulement par la juridiction) ; mots officiels :
  BET → SPIN, BUY BONUS → PLAY BONUS.
- Son : réverbération, panoramique par rouleau, arrêts qui montent l'accord, comptage musical, son coupé mémorisé.

## Écarté
- Kingthings Bloone (police) : gratuite seulement en usage personnel → remplacée par Modak (OFL).
- Pack sons casino de Kenney (CC0) : site bloqué par le réseau du conteneur ; à télécharger à la main si besoin
  (opengameart.org « 54 casino sound effects »), sinon inutile car nos sons sont générés.
- Listes de prompts Midjourney génériques (aucune spécifique aux slots sur GitHub) : nos prompts testés sont meilleurs.
- Spine : éditeur payant ; Rig Lab couvre nos besoins.
