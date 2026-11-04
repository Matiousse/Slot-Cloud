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

# ---- fond unique (les free spins le teintent en « nuit » dans le code)
im = Image.open(os.path.join(SRC, 'Italian_pizzeria_interior_backgr_4b6c9118.jpg')).convert('RGB')
im.resize((1920, round(1920 * im.height / im.width)), Image.LANCZOS).save(os.path.join(IMG, 'fond.webp'), quality=88)
for vieux in ('fond-jour.webp', 'fond-nuit.webp'):
    if os.path.exists(os.path.join(IMG, vieux)): os.remove(os.path.join(IMG, vieux))

# ---- logo
logo = rogner(cle_verte(np.asarray(Image.open(os.path.join(SRC, 'Pizza_Rush_game_logo_eeeb4730.jpg')).convert('RGB'))))
Image.fromarray(logo).resize((900, round(900 * logo.shape[0] / logo.shape[1])), Image.LANCZOS).save(os.path.join(IMG, 'logo.png'))

# ---- cadre (rouge laqué et or) : Gemini a raté le bas → on garde le haut, on prolonge les côtés avec leur moulure
# exacte et on génère le bas et ses coins arrondis à partir de cette moulure (même rayon que les coins du haut).
def cle_magenta(a):
    a = a.astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]
    d = (np.minimum(r, b) - g) / 255.0                      # ~1 sur le magenta pur, ~0 sur le cadre
    alpha = np.clip((0.62 - d) / 0.30, 0, 1)
    M = np.array([255, 0, 255], np.float32)
    rgb = np.where(alpha[..., None] > 0.02, (a - (1 - alpha[..., None]) * M) / np.maximum(alpha[..., None], 0.02), 0)
    out = np.zeros(a.shape[:2] + (4,), np.uint8)
    out[..., :3] = np.clip(rgb, 0, 255); out[..., 3] = (alpha * 255).astype(np.uint8)
    return out

src = np.asarray(Image.open(os.path.join(SRC, 'Slot_machine_frame_design_b0c0cb17.jpg')).convert('RGB'))
H0, W0 = src.shape[:2]
GARDE = 900                 # le haut est propre jusqu'ici
X_IN_G, X_IN_D = 335, 2417  # bords intérieurs de l'ouverture (mesurés ; le cadre va de 147 à 2605, centré sur 1376)
Y_OUV = 428                 # haut de l'ouverture
OUV_H = 1600                # hauteur voulue de l'ouverture → cases presque carrées
EP = 190                    # épaisseur de la moulure des côtés
R = 150                     # rayon des coins intérieurs (comme en haut)
y_bas = Y_OUV + OUV_H
H = y_bas + EP + 14
MAG = np.array([255, 0, 255], np.uint8)
cad = np.empty((H, W0, 3), np.uint8); cad[:] = MAG
cad[:GARDE] = src[:GARDE]
lignes = src[650:880]
prof_g = np.median(lignes[:, X_IN_G - EP:X_IN_G], axis=0).astype(np.uint8)[::-1]        # k = 0 au bord intérieur → extérieur
prof_d = np.median(lignes[:, X_IN_D + 1:X_IN_D + 1 + EP], axis=0).astype(np.uint8)       # idem côté droit
for y in range(GARDE, y_bas - R):
    cad[y, X_IN_G - EP:X_IN_G] = prof_g[::-1]
    cad[y, X_IN_D + 1:X_IN_D + 1 + EP] = prof_d
# bas droit : moulure tournée (k = distance au bord intérieur bas)
prof_b = ((prof_g.astype(np.float32) + prof_d.astype(np.float32)) / 2).astype(np.uint8)
for k in range(EP):
    cad[y_bas + k, X_IN_G + R:X_IN_D + 1 - R] = prof_b[k]
# coins arrondis : la moulure « tourne » autour du centre du coin
for (cx, prof, sens) in ((X_IN_G + R, prof_g, -1), (X_IN_D + 1 - R, prof_d, 1)):
    cy = y_bas - R
    ys, xs = np.mgrid[cy:y_bas + EP, cx - (R + EP) if sens < 0 else cx:cx + 1 if sens < 0 else cx + R + EP]
    dist = np.hypot(xs - cx, ys - cy)
    k = np.round(dist - R).astype(int)
    ok = (k >= 0) & (k < EP) & (ys >= cy)
    cad[ys[ok], xs[ok]] = prof[k[ok]]
cad = cle_magenta(cad)
cad = rogner(cad, 2)
mask = (cad[..., 3] < 30).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(mask)
best = None
for j in range(1, n):
    x, y, ww, hh, area = st[j]
    if x > 0 and y > 0 and x + ww < cad.shape[1] and y + hh < cad.shape[0]:
        if best is None or area > st[best, 4]: best = j
fx, fy, fw, fh = [int(v) for v in st[best, :4]]
ECH = 0.42
im = Image.fromarray(cad); im = im.resize((round(im.width * ECH), round(im.height * ECH)), Image.LANCZOS)
im.save(os.path.join(IMG, 'cadre.png'), optimize=True)
fx, fy, fw, fh = [round(v * ECH) for v in (fx, fy, fw, fh)]
json.dump({'taille': [im.width, im.height], 'fenetre': [fx, fy, fw, fh]}, open(os.path.join(IMG, 'cadre.json'), 'w'))
print('cadre', im.width, im.height, 'fenêtre', fx, fy, fw, fh, 'case', round(fw / 5), 'x', round(fh / 4))

# ---- rigs Rig Lab (symboles + Tony)
dst = os.path.join(PUB, 'anims')
if os.path.isdir(dst): shutil.rmtree(dst)
shutil.copytree(os.path.join(JEU, 'anims'), dst, ignore=shutil.ignore_patterns('*.md'))
print('rigs', sorted(os.listdir(dst)))
