---
name: slot-sound-bank
description: Construire la banque sonore complète d'une machine à sous — le catalogue des 120 fichiers attendus, les variations, la synthèse procédurale hors ligne pour que tout soit original et libre de droits, l'encodage et le budget. À charger quand il faut créer, générer, nommer ou intégrer les sons d'une slot.
---

# La banque sonore

Une slot correcte contient **100 à 150 fichiers**. En dessous, elle sonne
pauvre et répétitive au bout de dix tours.

## 1. Pourquoi on synthétise plutôt qu'on télécharge

- **Aucune requête externe** n'est permise depuis le build : tout est livré.
- Un SFX repris d'un autre jeu est reconnaissable à l'oreille. C'est
  exactement ce qui fait repérer un reskin.
- Un son synthétisé hors ligne est **original, gratuit, et à toi**, sans
  licence à documenter autrement que « généré par nos outils ».

Outillage : `numpy` + `scipy` pour la synthèse, `soundfile` pour écrire,
`sox` pour les effets, `fluidsynth` + soundfont pour les éléments joués,
`ffmpeg` pour encoder.

## 2. L'architecture d'une slot professionnelle — MESURÉE

Relevé sur une slot de studio majeur publiée (110 événements nommés). Ce sont
des **proportions et des durées**, pas du contenu : elles ne sont à personne,
et elles disent où va le budget.

**Tout est livré en UN SEUL fichier** (17,5 min d'audio concaténé) plus une
carte des segments. Une seule requête réseau, lecture par décalage.

### Où va l'effort — dans cet ordre

| poste | ce qu'on trouve | leçon |
|---|---|---|
| **Voix du personnage** | **22 variantes** d'une même réplique, 5,4–7,5 s | le plus gros investissement : une réplique qui se répète tue le personnage |
| **Musique** | **3 stems par état**, de longueur *identique* (base 33,9 s ×3, bonus 54,4 s ×3, phase spéciale 23,0 s ×3) | même longueur = synchronisés, on monte/baisse les couches sans coupure |
| **Ambiance** | une boucle (40,6 s) **+ des événements ponctuels tirés au hasard par-dessus** (grincements ×6, 5,7–8,9 s) | c'est ça qui empêche d'entendre la boucle recommencer |
| **Paliers de gain** | **7 paliers nommés** : start, big, mega, super, epic, max, out — chacun ~2,5–3 s, le max 4,4 s | pas 3 paliers : 7 |
| **Compteur de gain** | **UN fichier long qui monte** (12,4 s) + un départ (0,55 s) + un arrêt (3,5 s) | on ne joue PAS des tics séparés : on lance la montée, on la coupe à la fin du compte, on joue l'arrêt |
| **Symboles** | pose ×7 variantes, **1,3–1,6 s** chacune | la pose a une traîne longue, pas un clic de 70 ms |
| **Gain de combinaison** | 5 variantes à durée **croissante** 1,31 → 1,85 s | l'index suit la taille ou l'étape du gain |
| **Arrêt de rouleau** | 6 variantes, **0,08–0,16 s** | là, oui, très court |
| **Tours gratuits** | pose scatter ×5 (~1,7 s), intro 5,3 s, fin de mélodie 3,1 s, relance 2,5 s, gain 5,7 s | |
| **Personnage** | un son **par clip d'animation** (frappe courte, montée longue, montée courte…) | le son est écrit pour l'animation, pas l'inverse |
| **Multiplicateur** | apparition petit 3,2 s / grand 4,2 s, activation ×3 | deux tailles d'apparition |
| **Anticipation** | un seul fichier long, 13,6 s | on le lance et on le coupe à la résolution |
| **Entrée en jeu** | 2 variantes, 6,7 s | |
| **Interface** | **3 sons seulement** : clic 0,13 s, niveau de mise 0,24 s, achat 0,94 s | l'interface n'est PAS où va le budget |

### Les quatre erreurs que cette mesure corrige

1. **Compteur en tics séparés** → faux. Un fichier long qui monte, coupé à la
   fin, puis un son d'arrêt.
2. **Une douzaine de sons d'interface** → faux. Trois suffisent.
3. **Pose de symbole de 70 ms** → faux. 1,3–1,6 s avec traîne.
4. **Trois paliers de gain** → faux. Sept, nommés.

### Catalogue cible pour Bone Trail

    MUSIQUE        base l0/l1/l2 · chasse l0/l1/l2 · fanfare          7
    AMBIANCE       boucle base, boucle chasse, 8 ponctuels             10
    ROULEAUX       départ, lancement, arrêt ×6                          8
    SYMBOLES       pose ×7, connexion ×8 (gamme), destruction ×4       19
    GAINS          combinaison ×5 croissante, compteur départ/montée/  15
                   arrêt, total intro/outro/petit/grand/pièces
    PALIERS        start, big, mega, super, epic, max, out              7
    CHASSEUR       apparition, frappe courte, frappe longue, proie     10
                   prise ×4, transformation ×3
    CHASSE         pose scatter ×5, intro, fin de mélodie, relance,     9
                   gain
    ROUE           apparition, départ, montée longue, arrêt, gagné,     7
                   perdu, choix
    ANTICIPATION   montée longue coupable                               1
    ENTRÉE         ×2                                                   2
    INTERFACE      clic, niveau de mise, achat                          3
    VOIX           (si personnage parlant) réplique ×20+              20+

Environ **120 sons**, répartis là où l'oreille les entend.

## 3. Variations — non négociable

Tout son joué plus d'une fois par manche existe en **3 ou 4 variantes**
tirées au hasard. À défaut, le décaler en hauteur à chaque répétition.

Le son de connexion est le pire piège : joué huit fois d'affilée à l'identique,
il ruine la séquence. Une **gamme qui monte d'un demi-ton par pas** règle le
problème et donne le rythme en même temps.

## 4. Recettes de synthèse

    impact / frappe      bruit filtré passe-bas + sinus descendant 90→40 Hz,
                         enveloppe 2 ms d'attaque, 300 ms de chute
    tic de compteur      carré très court, 25 ms, hauteur montante
    pose de symbole      triangle 160 Hz + clic, 60 ms
    connexion            triangle, fréquence = base × 2^(pas/12)
    destruction          bruit blanc à enveloppe descendante + pitch down
    transformation       sinus montant + harmonique, 250 ms, réverbe courte
    tic de roue          carré 5 ms, hauteur qui monte puis ralentit
    victoire             accord majeur arpégé, 3 voix, attaque douce
    perte                quinte descendante, saturation légère
    riser                bruit filtré dont la coupure monte sur 2 s

Toujours : fondu d'entrée et de sortie de 3 à 5 ms, sinon un clic se produit.
Normaliser à −3 dBFS crête, sauf les boucles à −9.

## 5. Encodage et budget

    SFX courts     OGG Vorbis qualité 4, mono, 44,1 kHz
    boucles        OGG Vorbis qualité 6, stéréo
    total          viser moins de 4 Mo

    ffmpeg -i s.wav -c:a libvorbis -q:a 4 -ac 1 s.ogg

Prévoir un repli AAC/M4A pour Safari si le runtime en a besoin.

## 6. Mixage

Ducking de la musique pendant un gain. Priorités : gain > bonus > rouleaux >
interface. Limiter les voix simultanées, sinon le haut-parleur d'un téléphone
sature. Tester au casque **et** sur un téléphone : l'aigu qui porte au casque
disparaît sur un petit haut-parleur.

## 7. Brancher

Chaque son s'abonne au bus (`slot-events`). Aucun appel de son depuis une
fonction d'affichage. Retirer tout le module audio doit laisser le jeu
parfaitement jouable — c'est le test de la séparation.
