"""PROMPTS — le pack de prompts ChatGPT pour fabriquer un symbole riggable (14/10/2026).

Méthode tirée de Cybersaurus (Paperclip) et du skill slot-art :
  1. une ILLUSTRATION DE RÉFÉRENCE en pose de rig (membres écartés du corps, rien ne se croise) ;
  2. on la découpe dans Rig Lab (rl masque / rl decoupe : le trou est rebouché) ;
  3. on demande à part, DANS LA MÊME CONVERSATION, les pièces cachées que la découpe ne peut pas inventer
     (intérieur de la gueule, mâchoire entière, membre du côté caché, cou prolongé sous le torse) ;
  4. les variantes d'image (yeux fermés, gueule ouverte) pour les clés « img » ;
  5. les formes d'effets (flamme, éclair, fumée) : une forme par prompt, la séquence se fait dans Rig Lab ;
  6. le fond et le cadre de la case.
Le bloc STYLE est recopié MOT POUR MOT dans chaque prompt : c'est la seule façon d'avoir une série cohérente.

Fiche d'entrée (JSON) :
{
  "nom": "Dino rouge", "gabarit": "bipede" | "quadrupede" | "volant" | "objet" | "lettre",
  "sujet": "T-rex robot rouge cracheur de feu, armure, œil carré ambre, mâchoire à dents d'ivoire",
  "vue": "trois-quarts, tourné vers la droite",
  "palette": ["rouge cramoisi #D0202A", "rouge sombre #8E1018", "ivoire #F2E6C2", "gris acier #5B6670", "ambre #FFC21A"],
  "fond": "fond violet avec montagnes stylisées, cadre doré à rivets",
  "fx": ["flamme", "etincelle"],             (facultatif)
  "variantes": ["yeux fermés", "gueule grande ouverte"],   (facultatif)
  "style": "…"                                (facultatif : remplace le bloc STYLE par défaut)
}
"""
import json

STYLE_DEFAUT = (
    "STYLE : illustration 2D de jeu mobile, cel-shading franc, contour noir épais et régulier (environ 6 px pour une image de "
    "1024 px), trois tons par couleur (base, ombre, petit reflet dur), lumière venant du haut à gauche, couleurs saturées, "
    "matières lisibles (métal brossé, plastique laqué). Palette : {palette}. Lisible à 120 px de large. Pas de "
    "photoréalisme, pas de rendu 3D, pas de dégradé de fond, pas d'ombre portée au sol, pas de texte, pas de signature."
)

FOND_TRANSPARENT = "Fond entièrement transparent, PNG avec canal alpha (pas de damier dessiné, pas de couleur de fond)."

# pièces de chaque gabarit : (nom, description, pivot, rôle dans le rig)
GABARITS = {
    'bipede': {
        'pose': "debout de trois-quarts, bras écartés du torse d'une main de largeur, jambes légèrement écartées, queue tendue "
                "vers l'arrière et vers le bas, gueule fermée, aucun membre ne passe devant le torse ni devant un autre membre",
        'cachees': [
            ('machoire', "la mâchoire inférieure entière, avec toutes ses dents, vue de trois-quarts comme sur la référence, "
                         "prolongée de 15 % vers l'arrière là où elle s'emboîte sous le crâne", 'charnière de la mâchoire, sous l\'oreille',
             'enfant de la tête ; tourne de 0 à 19° pour ouvrir la gueule (gain)'),
            ('interieur-gueule', "l'intérieur de la gueule seul : palais, langue, fond sombre, sans dents, forme d'amande "
                                 "qui remplit l'ouverture de la gueule grande ouverte", 'centre de la gueule',
             'derrière la mâchoire et la tête, visible seulement gueule ouverte'),
            ('cou-prolonge', "le cou seul, prolongé de 25 % vers le bas sous la ligne du torse, peau lisse sans petits traits, "
                             "bord bas coupé net et sans contour (il sera caché sous le torse)", 'base du crâne',
             'évite le trou entre tête et torse quand la tête tourne'),
            ('bras-cote-cache', "le bras du côté caché (épaule, avant-bras, main) en entier, même pose que celui du côté visible "
                                "mais vu en miroir et un ton plus sombre", 'épaule', 'dessiné derrière le torse'),
            ('jambe-cote-cachee', "la jambe du côté caché en entier (cuisse, tibia, pied), un ton plus sombre", 'hanche',
             'dessinée derrière le bassin, pied tenu au sol par IK'),
        ],
        'decoupe': [
            ('tete', 'base du crâne (sur le cou)', 'enfant du torse ; suit l\'os pilote à 0.9'),
            ('torse', 'nombril / centre du ventre', 'corps : maillage pondéré sur 2 à 4 os (`mesh.weights: "os"`)'),
            ('bras-haut', 'épaule', 'suit le pilote à 0.5'), ('avant-bras', 'coude', 'décalé de 33 à 67 ms sur le bras'),
            ('main-griffes', 'poignet', 'décalée de 67 ms sur l\'avant-bras'),
            ('cuisse', 'hanche', 'IK à deux os vers la cible du pied'), ('tibia', 'genou', ''), ('pied', 'cheville', 'enfant de la cible IK : reste planté'),
            ('queue-1', 'raccord avec le bassin', 'chaîne de 3 à 6 os, recette « Fouet »'), ('queue-2', 'premier tiers', ''),
            ('queue-bout', 'deuxième tiers', '`physique` : inertie 0.5, raideur 100, amortissement 8'),
        ],
    },
    'quadrupede': {
        'pose': "de profil trois-quarts, les quatre pattes bien séparées et visibles, tête dans l'axe du corps, queue courte "
                "tendue, aucune patte ne croise une autre",
        'cachees': [
            ('pattes-cote-cache', "les deux pattes du côté caché, entières, un ton plus sombre", 'épaule / hanche', 'derrière le corps'),
            ('dessous-carapace', "le dessous du corps qui apparaît quand le corps se soulève, plat, sans détail", 'centre', 'sous le corps'),
            ('machoire', "la mâchoire inférieure entière, prolongée vers l'arrière", 'charnière', 'gueule qui s\'ouvre au gain'),
        ],
        'decoupe': [('tete', 'nuque', 'suit le pilote à 0.9'), ('corps', 'centre de gravité', 'maillage pondéré'),
                    ('patte-avant', 'épaule', 'IK vers le sol'), ('patte-arriere', 'hanche', 'IK vers le sol'),
                    ('accessoire-dos', 'point de fixation', '`physique` légère (canons, antennes)'),
                    ('queue', 'raccord', 'chaîne à fouet')],
    },
    'volant': {
        'pose': "en vol de trois-quarts, ailes déployées à l'horizontale bien détachées du corps, pattes repliées, bec fermé",
        'cachees': [
            ('aile-cote-cache', "l'aile du côté caché, entière, déployée, un ton plus sombre", 'épaule', 'derrière le corps'),
            ('bec-inferieur', "la partie inférieure du bec, entière", 'charnière du bec', 'bec qui s\'ouvre'),
        ],
        'decoupe': [('tete', 'nuque', ''), ('corps', 'centre', 'maillage'), ('aile', 'épaule', 'battement + plumes en chaîne'),
                    ('plumes-bout', 'base des plumes', '`physique`'), ('queue', 'croupion', 'fouet')],
    },
    'objet': {
        'pose': "de face, légèrement en contre-plongée, centré, toutes les parties mobiles séparées par un petit jour",
        'cachees': [
            ('couvercle-ouvert', "la même pièce mobile en position ouverte", 'charnière', 'variante pour une clé « img »'),
            ('interieur', "l'intérieur qui apparaît quand ça s'ouvre (lumière, contenu)", 'centre', 'derrière la pièce mobile'),
        ],
        'decoupe': [('base', 'bas, au centre', 'holder ; écrasement au land'), ('partie-haute', 'haut du socle', 'suit la base avec retard'),
                    ('ornements', 'point de fixation', 'pendants : `physique` ou ressort'), ('gemme', 'centre', 'battement + reflet')],
    },
    'lettre': {
        'pose': "lettre mécanique en volume, vue de face légèrement de trois-quarts, épaisseur visible, pièces mécaniques "
                "(vérins, plaques, lumières) bien distinctes",
        'cachees': [
            ('lumieres', "les seules lumières/néons de la lettre, sur fond transparent, au même cadrage", 'centre',
             'copie additive qui s\'allume au gain (flash)'),
        ],
        'decoupe': [('lettre', 'bas de la lettre', 'maillage 8×8 pondéré bas/haut, écrasement'), ('plaque-haute', 'charnière', 'saute au gain'),
                    ('lumieres', 'centre', 'additif')],
    },
}

FX = {
    'flamme': ("une seule langue de flamme stylisée, cartoon, base large en bas et pointe en haut, jaune au cœur, orange puis rouge "
               "au bord, contour coloré (pas noir), légère courbe en S", "Dans Rig Lab : pièce en maillage (`mesh` avec `wave`) ou "
               "séquence ; 3 variantes de silhouette suffisent pour une boucle crédible."),
    'eclair': ("un éclair électrique stylisé en zigzag, cœur blanc, halo cyan, trois ramifications fines, extrémités pointues",
               "Pièce additive (`blend: add`), allumée en palier 2 images sur 3 (clé `visible` en step)."),
    'fumee': ("une bouffée de fumée cartoon ronde composée de 4 à 5 boules, gris clair, ombre douce en bas, sans contour noir",
              "Particules Rig Lab (`tex` = cette image) avec `scaleEnd` et `fadeOut`."),
    'etincelle': ("une étoile d'éclat à quatre branches très fines, blanche, cœur lumineux", "Particules ou pièce additive qui tourne."),
    'impact': ("un anneau d'onde de choc stylisé, blanc et cyan, épais d'un côté, fin de l'autre", "Pièce additive qui grandit de ×0.3 à ×1.6 en s'effaçant."),
    'lueur': None, 'rayon': None,  # mieux faits dans Rig Lab : rl lueur / reflet (shine)
}


def _style(f):
    if f.get('style'):
        return f['style']
    return STYLE_DEFAUT.format(palette=', '.join(f.get('palette') or ['à choisir et à garder identique pour toute la série']))


def _bloc(titre, corps):
    return f"### {titre}\n\n```\n{corps.strip()}\n```\n"


def generer(f):
    g = GABARITS.get(f.get('gabarit', 'bipede'), GABARITS['bipede'])
    nom, sujet, vue = f.get('nom', 'Symbole'), f.get('sujet', ''), f.get('vue', 'trois-quarts')
    S = _style(f)
    out = [f"# Pack de prompts — {nom}\n",
           "Ordre : référence, puis pièces cachées et variantes dans la MÊME conversation ChatGPT (il garde le design), "
           "puis effets et fond. Vérifier chaque PNG : vrai canal alpha, pas de damier peint (sinon nettoyage : skill slot-art).\n"]

    out.append("## 1. Illustration de référence (pose de rig)\n")
    out.append(_bloc('Référence', f"""
Illustration complète d'un personnage de machine à sous : {sujet}. Vue : {vue}.

{S}

POSE DE RIG : {g['pose']}. Le personnage est entier, rien n'est coupé par le bord, il occupe 80 % de la hauteur d'une
image carrée de 1024 × 1024. Les articulations (épaules, coudes, hanches, genoux, nuque) sont bien lisibles : elles seront
découpées et tournées. Pas de cadre, pas de fond.

{FOND_TRANSPARENT}
"""))

    out.append("## 2. Pièces que la découpe ne peut pas inventer\n")
    out.append("À demander APRÈS la référence, dans la même conversation. Chaque pièce sur son propre PNG.\n")
    for n, desc, pivot, role in g['cachees']:
        out.append(_bloc(f"{n}  ·  pivot : {pivot}  ·  {role}", f"""
À partir du personnage de l'image de référence, garde exactement le même design, les mêmes couleurs et le même contour.
Dessine seulement : {desc}.

{S}

DÉCOUPE : la pièce seule, entière, sans le reste du corps. Prolonge de 10 à 15 % la zone qui s'emboîte sous la pièce
voisine (elle sera cachée dessous) ; ce bord de coupe reste net, sans contour noir. Même échelle que la référence.

{FOND_TRANSPARENT}
"""))

    if f.get('variantes'):
        out.append("## 3. Variantes d'image (clés « img » dans Rig Lab)\n")
        for v in f['variantes']:
            out.append(_bloc(v, f"""
Reprends exactement la tête du personnage de référence, même cadrage, même taille, même angle, mêmes couleurs, et change
seulement ceci : {v}. Tout le reste de l'image est identique au pixel près, pour pouvoir remplacer une image par l'autre.

{S}

{FOND_TRANSPARENT}
"""))

    fx = [x for x in (f.get('fx') or []) if x in FX]
    if fx:
        out.append("## 4. Formes d'effets (une forme par prompt)\n")
        out.append("ChatGPT ne sait pas faire une séquence de 40 images cohérente : on demande la forme, Rig Lab fait le mouvement.\n")
        for x in fx:
            if FX[x] is None:
                out.append(f"- **{x}** : à faire dans Rig Lab (`rl lueur`, recette « Reflet qui balaie »), plus propre qu'une image.\n")
                continue
            desc, conseil = FX[x]
            out.append(_bloc(x, f"""
Un élément d'effet visuel de jeu, seul : {desc}.

{S}

Centré, occupe 70 % d'une image carrée de 512 × 512. Aucun autre élément.

{FOND_TRANSPARENT}
"""))
            out.append(f"_{conseil}_\n")

    out.append("## 5. Fond et cadre de la case\n")
    out.append(_bloc('Fond + cadre', f"""
La carte de fond d'un symbole de machine à sous : {f.get('fond', 'fond coloré simple avec un cadre à rivets')}.

{S}

Format carré 1024 × 1024 (la case du jeu, 728 × 724, est presque carrée). Le cadre fait 5 % de l'épaisseur sur chaque bord, le fond
remplit l'intérieur, rien au centre (le personnage sera posé par-dessus). Coins nets.
"""))
    out.append(_bloc('Ombre du cadre', """
Exactement la même silhouette que la carte de fond précédente, remplie d'un noir uni, sans aucun détail : ce sera l'ombre
portée de la carte. Même taille, même cadrage.

Fond entièrement transparent, PNG avec canal alpha.
"""))

    out.append("## 6. Plan de découpe et de rig (Rig Lab)\n")
    out.append("| pièce | pivot (articulation qui la porte) | rôle |\n|---|---|---|\n")
    for n, pivot, role in g['decoupe']:
        out.append(f"| {n} | {pivot} | {role} |\n")
    for n, _, pivot, role in g['cachees']:
        out.append(f"| {n} | {pivot} | {role} |\n")
    out.append("""
Ensuite :
```
./rl nouveau atelier/NOM reference.png
./rl decoupe atelier/NOM tete --poly "…"  (une pièce à la fois, pivot réglé à l'articulation : ./rl piece … pivot=[x,y])
./rl recette atelier/NOM idle personnage-complet corps=torse tete=tete machoire=machoire haut=tete,bras-haut chaine=queue-1,queue-2,queue-bout
./rl controle atelier/NOM && ./rl video atelier/NOM
```
""")
    return ''.join(out)


def depuis_fichier(chemin):
    with open(chemin, encoding='utf-8') as fh:
        return generer(json.load(fh))
