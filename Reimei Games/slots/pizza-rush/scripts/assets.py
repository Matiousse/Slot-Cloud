"""Prépare public/ à partir des sources (Drive) et des rigs Rig Lab. Relançable.
Lancer avec le Python de Rig Lab : ../../tools/RigLab/.venv/bin/python -I scripts/assets.py"""
import os, sys, shutil, json
import numpy as np, cv2
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__)); JEU = os.path.dirname(ICI)
SRC = os.path.join(JEU, 'sources'); PUB = os.path.join(JEU, 'public'); IMG = os.path.join(PUB, 'img')
os.makedirs(IMG, exist_ok=True)

def cle_verte(a):
    """fond vert (chroma) → transparent, avec retrait du liseré vert"""
    a = a.astype(np.int16); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    vert = (g > 140) & (g - np.maximum(r, b) > 55)
    m = (~vert).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    keep = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 400]
    m = np.isin(lab, keep).astype(np.uint8)
    alpha = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 0.8)
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    rgb = a.copy()
    spill = rgb[..., 1] > np.maximum(rgb[..., 0], rgb[..., 2])
    rgb[..., 1] = np.where(spill, np.maximum(rgb[..., 0], rgb[..., 2]), rgb[..., 1])
    out[..., :3] = np.clip(rgb, 0, 255); out[..., 3] = (np.clip(alpha * 1.2, 0, 1) * 255).astype(np.uint8)
    return out

def rogner(a, marge=4):
    ys, xs = np.nonzero(a[..., 3] > 8)
    return a[max(ys.min() - marge, 0):ys.max() + marge, max(xs.min() - marge, 0):xs.max() + marge]

# ---- fonds : pizzeria de jour (jeu de base), de nuit (free spins)
for nom, f in [('fond-jour', 'Italian_pizzeria_interior_slot_b_2b4b56c3.jpg'), ('fond-nuit', 'Busy_pizzeria_interior_at_night_3793b4bc.jpg')]:
    im = Image.open(os.path.join(SRC, f)).convert('RGB')
    im.resize((1920, round(1920 * im.height / im.width)), Image.LANCZOS).save(os.path.join(IMG, nom + '.webp'), quality=86)

# ---- logo
logo = rogner(cle_verte(np.asarray(Image.open(os.path.join(SRC, 'Pizza_Rush_game_logo_eeeb4730.jpg')).convert('RGB'))))
Image.fromarray(logo).resize((900, round(900 * logo.shape[0] / logo.shape[1])), Image.LANCZOS).save(os.path.join(IMG, 'logo.png'))

# ---- cadre : vert retiré, intérieur rendu transparent, bande neutre retirée au milieu (cases presque carrées)
cad = cle_verte(np.asarray(Image.open(os.path.join(SRC, 'Slot_machine_reel_frame_79634ed9.jpg')).convert('RGB')))
rgb = cad[..., :3].astype(int)
sombre = (rgb.mean(2) < 95) & (rgb[..., 2] >= rgb[..., 0]) & (cad[..., 3] > 0)
sombre = cv2.morphologyEx(sombre.astype(np.uint8), cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(sombre)
grandes = [j for j in range(1, n) if st[j, cv2.CC_STAT_AREA] > 20000]          # les 20 cases de la grille peinte
pts = np.argwhere(np.isin(lab, grandes))[:, ::-1].astype(np.int32)
hull = cv2.convexHull(pts)
inter = np.zeros(cad.shape[:2], np.uint8); cv2.fillPoly(inter, [hull], 1)
inter = cv2.erode(inter, np.ones((7, 7), np.uint8))
cad[inter.astype(bool), 3] = 0
x0, y0, w, h = cv2.boundingRect(hull)
COUPE = (1310, 1820)                                   # bande de bois neutre (entre les notes et le basilic)
F = 48                                                  # fondu sur 48 px : pas de couture visible dans le bois
g = cad[:, :COUPE[0] + F].astype(np.float32); d = cad[:, COUPE[1]:].astype(np.float32)
t = np.linspace(0, 1, F)[None, :, None]
mix = g[:, -F:] * (1 - t) + d[:, :F] * t
cad = np.concatenate([g[:, :-F], mix, d[:, F:]], axis=1).astype(np.uint8)
retire = COUPE[1] - COUPE[0]
cad = rogner(cad, 2)
ys, xs = np.nonzero(cad[..., 3] > 8)
ox = 0; oy = 0
# recalcule la fenêtre intérieure dans l'image finale
mask = (cad[..., 3] == 0).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(mask)
# composante la plus grande qui ne touche pas le bord = intérieur
best = None
for j in range(1, n):
    x, y, ww, hh, area = st[j]
    if x > 0 and y > 0 and x + ww < cad.shape[1] and y + hh < cad.shape[0]:
        if best is None or area > st[best, 4]: best = j
fx, fy, fw, fh = [int(v) for v in st[best, :4]]
ECH = 0.62                                              # taille d'affichage (le cadre fait ~1070 px de large à l'écran)
im = Image.fromarray(cad); im = im.resize((round(im.width * ECH), round(im.height * ECH)), Image.LANCZOS)
im.save(os.path.join(IMG, 'cadre.png'), optimize=True)
cad = np.asarray(im); fx, fy, fw, fh = [round(v * ECH) for v in (fx, fy, fw, fh)]
json.dump({'taille': [cad.shape[1], cad.shape[0]], 'fenetre': [fx, fy, fw, fh]}, open(os.path.join(IMG, 'cadre.json'), 'w'))
print('cadre', cad.shape[1], cad.shape[0], 'fenêtre', fx, fy, fw, fh, 'rapport', round(fw / fh, 3))

# ---- rigs Rig Lab (symboles + Tony)
dst = os.path.join(PUB, 'anims')
if os.path.isdir(dst): shutil.rmtree(dst)
shutil.copytree(os.path.join(JEU, 'anims'), dst, ignore=shutil.ignore_patterns('*.md'))
print('rigs', sorted(os.listdir(dst)))
