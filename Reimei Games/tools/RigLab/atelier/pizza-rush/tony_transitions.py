"""Tony (vidéos Google Flow) → planches de sprites avec TRANSITIONS INVISIBLES entre les animations.

Problème : chaque vidéo Flow part de la même image (la pose « pivot » P) mais Tony s'en éloigne vite (tête, bras, appui).
Couper d'une vidéo à l'autre, ou faire un fondu, montre donc un saut ou deux Tony superposés.
Solution : toutes les animations passent par P, et chaque raccord est une vraie image de mouvement calculée par flux
optique (on déforme la pose A vers la pose B, puis on mélange), comme une interpolation d'images :
  - repos : la respiration entière en aller-retour ; toutes les 12 images (1 s) une « sortie » de 5 images rejoint P ;
  - réaction : P → (entrée, 5 images) → l'action → (retour, 6 images) → P ; on reprend le repos à son image 0 (= P) ;
  - suspense et perte : peuvent être interrompus, ils ont aussi une sortie vers P toutes les 12 images.
Les points de coupe sont choisis automatiquement près de la pose P (écart mesuré), dans les fenêtres données.

Usage : tony_transitions.py SORTIE HAUTEUR repos:dossier  nom:dossier:debut_s:fin_min_s[:depart_naturel_s[:fin_naturelle_s]] [...]
(depart_naturel / fin_naturelle : la réaction part / finit là, près de P ; la montée et le retour sont joués en ×2)
(images PNG extraites à 12 i/s : ffmpeg -i x.mp4 -vf fps=12 dossier/%04d.png)"""
import sys, os, glob, json
import numpy as np, cv2
from PIL import Image

OUT, HT = sys.argv[1], int(sys.argv[2])
FPS, PAS_SORTIE, N_ENTREE, N_RETOUR, N_SORTIE = 12, 12, 7, 7, 6
INTERRUPTIBLES = {'suspense', 'perte'}   # bras le long du corps : une autre réaction peut les couper (sortie vers P chaque seconde)
# (gain et rush gardent le bras levé ou tendu jusqu'à la fin : une sortie en plein geste laisserait un bras fantôme)
os.makedirs(OUT, exist_ok=True)


def cle(path):
    img = np.asarray(Image.open(path).convert('RGB'))
    a = img.astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fond = (g < np.minimum(r, b) - 70) & (np.abs(r - b) < 90)
    fond |= (a.min(2) > 200) & (g < np.minimum(r, b) - 25)            # poussières claires rosées
    sujet = (~fond).astype(np.uint8)
    sujet = cv2.morphologyEx(sujet, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(sujet, connectivity=8)
    sujet = (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)   # Tony = la plus grande tache
    inv = 1 - sujet
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    for j in range(1, n):
        if st[j, cv2.CC_STAT_AREA] < 40: sujet[lab == j] = 1            # seulement les trous minuscules (bruit) :
                                                                       # un vrai jour entre les doigts reste transparent
    alpha = cv2.GaussianBlur(sujet.astype(np.float32), (0, 0), 1.0)
    alpha = np.clip((alpha - 0.2) / 0.6, 0, 1)
    rgb = img.copy()
    bord = (alpha > 0) & (cv2.erode(sujet, np.ones((7, 7), np.uint8)) == 0)
    rgb[bord] = cv2.erode(img, np.ones((5, 5), np.uint8))[bord]        # le liseré prend la couleur du trait noir
    return np.dstack([rgb, (alpha * 255).astype(np.uint8)])


# ---- 1. détourage de chaque vidéo entière (zone utile seulement, pour la mémoire)
specs = []
for arg in sys.argv[3:]:
    p = arg.split(':')
    specs.append((p[0], p[1], float(p[2]) if len(p) > 2 else None, float(p[3]) if len(p) > 3 else None,
                  float(p[4]) if len(p) > 4 and p[4] else None, float(p[5]) if len(p) > 5 else None))
brut = {}
for nom, d, *_ in specs:
    imgs = []
    for f in sorted(glob.glob(os.path.join(d, '*.png'))):
        fr = cle(f)
        ys, xs = np.nonzero(fr[..., 3] > 10)
        b = [xs.min(), ys.min(), xs.max() + 1, ys.max() + 1]
        imgs.append((b, fr[b[1]:b[3], b[0]:b[2]].copy()))
    brut[nom] = imgs
    print(nom, len(imgs), 'images détourées', flush=True)

# ---- 2. recadrage commun + mise à la taille du jeu
box = None
for imgs in brut.values():
    for b, _ in imgs:
        box = b if box is None else [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
x0, y0, x1, y1 = box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4
W, H = round((x1 - x0) * HT / (y1 - y0)), HT
clips = {}
for nom, imgs in brut.items():
    out = []
    for b, fr in imgs:
        full = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
        full.paste(Image.fromarray(fr), (b[0] - x0, b[1] - y0))
        out.append(np.asarray(full.resize((W, H), Image.LANCZOS)).astype(np.float32) / 255)
    clips[nom] = out
del brut
print('cadre commun', x0, y0, x1, y1, '→', W, H, flush=True)

repos = specs[0][0]
P = clips[repos][0]                                  # la pose pivot (image de départ commune des vidéos Flow)


def ecart(a, b):
    return float(np.abs(a[..., :3] * a[..., 3:] - b[..., :3] * b[..., 3:]).mean() + np.abs(a[..., 3] - b[..., 3]).mean())


# ---- 3. images de transition par flux optique
dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)


def gris(a):
    c = a[..., :3] * a[..., 3:] + 0.5 * (1 - a[..., 3:])             # sur fond gris moyen : la silhouette reste lisible
    return cv2.cvtColor((c * 255).astype(np.uint8), cv2.COLOR_RGB2GRAY)


# Visage (fractions de la vignette, pose P) : les traits ne se MÉLANGENT jamais (deux paires d'yeux superposées = bizarre).
# Dans cette zone, l'image passe d'un coup de A à B au milieu du mouvement, comme un clignement ; le reste se déforme en douceur.
VISAGE = (0.385, 0.2375, 0.85, 0.525)
YEUX = (0.449, 0.27, 0.769, 0.43)


def zone(box):
    x0, y0, x1, y1 = box
    return slice(round(y0 * H), round(y1 * H)), slice(round(x0 * W), round(x1 * W))


FACE = np.zeros((H, W), np.float32)
FACE[zone(VISAGE)] = 1
FACE = cv2.GaussianBlur(FACE, (0, 0), 5)[..., None]


def yeux(a, b):
    """écart dans la zone des yeux (yeux mi-clos, regard ailleurs…)"""
    z = zone(YEUX)
    return float(np.abs(a[z][..., :3] * a[z][..., 3:] - b[z][..., :3] * b[z][..., 3:]).mean())


OUVERT = (slice(round(.22 * H), round(.5 * H)), slice(round(.38 * W), round(.85 * W)))


def blanc(a):
    """surface de blanc des yeux : mesure l'ouverture des yeux, quelle que soit la position de la tête"""
    f = a[OUVERT]
    return float(((f[..., :3].min(-1) > 0.88) & (f[..., 3] > 0.5)).sum())


B_P = None


def yeux_ok(a):
    """yeux ouverts comme dans la pose P (ni fermés, ni mi-clos, ni écarquillés)"""
    return 0.82 * B_P <= blanc(a) <= 1.25 * B_P


def cout(a):
    """proximité avec la pose P ; une image aux yeux pas « normaux » n'est jamais un point de raccord"""
    return ecart(a, P) + (0 if yeux_ok(a) else 10)


def morph(A, B, n):
    """n images intermédiaires de A vers B (A et B exclus), avec une courbe douce (accélère puis freine)."""
    ga, gb = gris(A), gris(B)
    fab = dis.calc(ga, gb, None)                     # A(x) ≈ B(x + fab)
    fba = dis.calc(gb, ga, None)                     # B(x) ≈ A(x + fba)
    gy, gx = np.mgrid[0:H, 0:W].astype(np.float32)
    pa = np.dstack([A[..., :3] * A[..., 3:], A[..., 3:]])            # prémultiplié : pas de halo
    pb = np.dstack([B[..., :3] * B[..., 3:], B[..., 3:]])
    res = []
    for i in range(1, n + 1):
        u = i / (n + 1)
        t = u * u * (3 - 2 * u)
        wa = cv2.remap(pa, gx + t * fba[..., 0], gy + t * fba[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        wb = cv2.remap(pb, gx + (1 - t) * fab[..., 0], gy + (1 - t) * fab[..., 1], cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT)
        m = (1 - t) * wa + t * wb
        m = m * (1 - FACE) + (wa if t < 0.5 else wb) * FACE     # visage : bascule nette, jamais de mélange
        al = np.clip(m[..., 3:], 0, 1)
        rgb = np.where(al > 1e-3, m[..., :3] / np.maximum(al, 1e-3), 0)
        res.append(np.dstack([np.clip(rgb, 0, 1), al]))
    return res


B_P = blanc(P)
seq = {}                                             # nom de segment → liste d'images
seq['repos'] = clips[repos]
sorties = {}
idle = clips[repos]


def points_de_sortie(frames, debut=1, fin=None):
    """une sortie par seconde environ, placée sur la meilleure image de la fenêtre (pose proche de P, yeux ouverts)"""
    fin = len(frames) - 1 if fin is None else fin
    out = []
    for c in range(PAS_SORTIE, fin + 1, PAS_SORTIE):
        cand = [i for i in range(c - 5, c + 7) if debut <= i < fin]
        if cand: out.append(min(cand, key=lambda i: cout(frames[i])))
    return sorted(set(out))


for k in points_de_sortie(idle, 1, len(idle)):
    sorties[k] = f'repos>P@{k}'
    seq[sorties[k]] = morph(idle[k], P, N_SORTIE)
print('sorties du repos :', list(sorties), flush=True)

reactions = {}
for nom, _, debut, fin_min, naturel, fin_nat in specs[1:]:
    fr = clips[nom]
    n = len(fr)
    # début : près de P, juste avant l'action (on pénalise ce qui part trop tôt) ; fin : près de P, après l'action
    i_deb = min(range(max(1, round((debut - 1.2) * FPS)), round(debut * FPS) + 1),
                key=lambda i: cout(fr[i]) + 0.004 * (round(debut * FPS) - i))
    f0 = round((fin_nat if fin_nat is not None else fin_min) * FPS)
    i_fin = min(range(f0, n), key=lambda i: cout(fr[i]) + 0.003 * (i - f0))
    if not yeux_ok(fr[i_fin]):     # aucun raccord yeux ouverts après f0 : on cherche aussi un peu avant (jamais dans l'action)
        i_fin = min(range(round(fin_min * FPS), n), key=lambda i: cout(fr[i]) + 0.003 * abs(i - f0))
    print(nom, 'écart à P (1 image sur 3) :', ' '.join(f'{ecart(f, P):.2f}' for f in fr[::3]), flush=True)
    if fin_nat is None:
        corps = fr[i_deb:i_fin + 1]
    else:   # le geste finit à fin_min ; le retour naturel de Flow vers le repos est joué en ×2
        i_act = round(fin_min * FPS)
        corps = fr[i_deb:i_act] + fr[i_act:i_fin + 1:2]
    if naturel is not None:
        # départ plus tôt, là où la vidéo est encore proche de P ; la montée de Flow jusqu'à l'action est jouée en ×2
        c0 = round(naturel * FPS)
        i_nat = min(range(max(0, c0 - 4), c0 + 5), key=lambda i: cout(fr[i]))
        corps = fr[i_nat:i_deb:2] + corps
        i_deb = i_nat
    seq[f'P>{nom}'] = morph(P, corps[0], N_ENTREE)
    seq[nom] = corps
    seq[f'{nom}>P'] = morph(corps[-1], P, N_RETOUR)
    info = {'entree': f'P>{nom}', 'corps': nom, 'retour': f'{nom}>P', 'sorties': {}}
    if nom in INTERRUPTIBLES:                        # interruptible : sortie vers P toutes les 12 images
        for j in points_de_sortie(corps, 1, len(corps) - 1):
            info['sorties'][j] = f'{nom}>P@{j}'
            seq[info['sorties'][j]] = morph(corps[j], P, N_SORTIE)
    reactions[nom] = info
    print(f'{nom}: yeux début {blanc(corps[0]) / B_P:.2f} fin {blanc(corps[-1]) / B_P:.2f} ; '
          f'{i_deb / FPS:.2f}s → {i_fin / FPS:.2f}s ({len(corps)} images), écart entrée {ecart(P, corps[0]):.3f} '
          f'sortie {ecart(corps[-1], P):.3f}', flush=True)

# ---- 4. planches
cols, rows = 2048 // W, 2048 // H
per = cols * rows
sheets, cells, k = [], {}, 0
for nom, frames in seq.items():
    cells[nom] = []
    for fr in frames:
        si, c = divmod(k, per)
        if si >= len(sheets): sheets.append(Image.new('RGBA', (cols * W, rows * H), (0, 0, 0, 0)))
        sheets[si].paste(Image.fromarray((fr * 255 + 0.5).astype(np.uint8)), ((c % cols) * W, (c // cols) * H))
        cells[nom].append([si, (c % cols) * W, (c // cols) * H])
        k += 1
for f in glob.glob(os.path.join(OUT, 'planche-*.webp')): os.remove(f)
for i, sh in enumerate(sheets): sh.save(os.path.join(OUT, f'planche-{i}.webp'), quality=75, method=6)
json.dump({'fps': FPS, 'w': W, 'h': H, 'planches': len(sheets), 'repos': 'repos',
           'sortiesRepos': {str(k): v for k, v in sorties.items()}, 'reactions': reactions, 'segments': cells},
          open(os.path.join(OUT, 'tony-video.json'), 'w'))
print('total', k, 'images, taille', W, H, ',', len(sheets), 'planches', flush=True)
