"""Fond animé de Pizza Rush SANS tremblement.

La vidéo Flow « tremble » : la caméra flotte d'environ 1 à 2 px et, surtout, chaque image est redessinée légèrement
(murs, bois, objets qui frémissent). On reconstruit donc le fond à partir de l'IMAGE FIXE (parfaitement immobile) et on ne
prend de la vidéo que ce qui bouge VRAIMENT (passants, feu) : dans les zones vitrines / porte / four, on mesure l'écart type
de chaque pixel sur toute la vidéo recalée et on ne garde que les endroits qui bougent (bord adouci). Chaque image vidéo
est recalée sur l'image fixe (ECC affine) avant d'être collée.

Usage : fond_stabilise.py IMAGE_FIXE DOSSIER_IMAGES_VIDEO DOSSIER_SORTIE [largeur=1600]
Ensuite : boucle sans raccord + encodage (commande dans anims/LISEZMOI.md)."""
import sys, os, glob
import numpy as np, cv2

FIXE, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
LARG = int(sys.argv[4]) if len(sys.argv) > 4 else 1600
os.makedirs(OUT, exist_ok=True)

still = cv2.imread(FIXE)
HAUT = round(LARG * still.shape[0] / still.shape[1] / 2) * 2
base = cv2.resize(still, (LARG, HAUT), interpolation=cv2.INTER_AREA).astype(np.float32)

# Zones où la vidéo peut apparaître (fractions de l image fixe) : vitre de gauche, vitrines de droite, porte, feu.
# (pas le bandeau vitré du haut : les casseroles et lampes qui tanguent devant tremblaient)
ZONES = [
    (0.167, 0.309, 0.334, 0.600),   # vitre de gauche (rue, passants)
    (0.727, 0.120, 1.000, 0.720),   # vitrines de droite
    (0.797, 0.350, 0.877, 0.828),   # porte vitrée
    (0.028, 0.575, 0.102, 0.740),   # feu du four
]
zones = np.zeros((HAUT, LARG), np.float32)
for x0, y0, x1, y1 in ZONES:
    zones[round(y0 * HAUT):round(y1 * HAUT), round(x0 * LARG):round(x1 * LARG)] = 1

# recalage : on cherche la transformation affine qui amène chaque image vidéo sur l'image fixe (à 960 px, rapide)
W = 960
H = round(W * HAUT / LARG)
ref = cv2.cvtColor(cv2.resize(still, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 100, 1e-5)
fs = sorted(glob.glob(os.path.join(SRC, '*.png')))


def recaler(fr, w0):
    g = cv2.cvtColor(cv2.resize(fr, (W, H), interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY).astype(np.float32)
    try:
        _, w = cv2.findTransformECC(ref, g, w0, cv2.MOTION_AFFINE, crit, None, 5)
    except cv2.error:
        w = w0
    m = w.copy()
    m[:, 2] *= LARG / W                               # même transformation à la taille de sortie
    vid = cv2.resize(fr, (LARG, HAUT), interpolation=cv2.INTER_AREA)
    return w, cv2.warpAffine(vid, m, (LARG, HAUT), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)


# passe 1 : recalage + écart type de chaque pixel (où ça bouge vraiment)
warps, s1, s2, w = [], 0, 0, np.eye(2, 3, dtype=np.float32)
for f in fs:
    w, vid = recaler(cv2.imread(f), w)
    warps.append(w)
    g = cv2.GaussianBlur(cv2.cvtColor(vid, cv2.COLOR_BGR2GRAY).astype(np.float32), (0, 0), 2)
    s1, s2 = s1 + g, s2 + g * g
std = np.sqrt(np.maximum(s2 / len(fs) - (s1 / len(fs)) ** 2, 0))
bouge = cv2.dilate((std > 6).astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (31, 31))).astype(np.float32)
masque = cv2.GaussianBlur(bouge * zones, (0, 0), 8)[..., None]
cv2.imwrite(os.path.join(OUT, '_masque.png'), (masque[..., 0] * 255).astype(np.uint8))

# passe 2 : image fixe partout, vidéo recalée seulement là où ça bouge
for k, f in enumerate(fs):
    m = warps[k]
    _, vid = recaler(cv2.imread(f), m)
    out = base * (1 - masque) + vid.astype(np.float32) * masque
    cv2.imwrite(os.path.join(OUT, f'{k + 1:04d}.png'), np.clip(out, 0, 255).astype(np.uint8))
print('images', len(fs), 'taille', LARG, HAUT, 'part animée', round(float(masque.mean()) * 100, 1), '%')
