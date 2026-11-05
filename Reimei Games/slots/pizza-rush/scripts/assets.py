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
# Décor intérieur avec vitrines sur la rue (Gemini). On efface le texte raté « FLOGR » du sachet de l'étagère.
fondsrc = np.asarray(Image.open(os.path.join(SRC, 'decor', 'fond-interieur.jpg')).convert('RGB')).copy()
x0, y0, x1, y1 = 381, 336, 424, 369                                      # les lettres seules (sans le bord du sachet)
masque = np.zeros(fondsrc.shape[:2], np.uint8)
masque[y0:y1, x0:x1] = (fondsrc[y0:y1, x0:x1].astype(np.int16).sum(2) < 330).astype(np.uint8) * 255
masque[344:369, 424:430] = (fondsrc[344:369, 424:430].astype(np.int16).sum(2) < 330).astype(np.uint8) * 255  # fin du R
masque = cv2.dilate(masque, np.ones((3, 3), np.uint8))
fondsrc = cv2.inpaint(fondsrc, masque, 3, cv2.INPAINT_TELEA)
Image.fromarray(fondsrc).crop((x0 - 30, y0 - 30, x1 + 30, y1 + 30)).resize((488, 296)).save(os.path.join(JEU, 'sources', 'decor', '_controle-texte.png'))
im = Image.fromarray(fondsrc)
im.resize((1920, round(1920 * im.height / im.width)), Image.LANCZOS).save(os.path.join(IMG, 'fond.webp'), quality=88)
# fond animé (vidéo des passants, Google Flow) : boucle sans raccord (la dernière seconde se fond dans la première),
# 1600×900, sans son, WebM VP9 + MP4 H.264. Fabriquée une fois avec ffmpeg (commande dans anims/LISEZMOI.md).
for ext in ('webm', 'mp4'):
    shutil.copy(os.path.join(SRC, 'decor', f'_fond-boucle.{ext}'), os.path.join(IMG, f'fond.{ext}'))
for vieux in ('fond-jour.webp', 'fond-nuit.webp'):
    if os.path.exists(os.path.join(IMG, vieux)): os.remove(os.path.join(IMG, vieux))

# ---- tabouret de Tony (Gemini, fond magenta) : détouré, rogné, 600 px de haut ; « assise » = hauteur relative du
# dessus du coussin où Tony pose les pieds (mesurée sur l'image).
tab = np.asarray(Image.open(os.path.join(SRC, 'decor', 'tabouret.jpg')).convert('RGB'))
a = tab.astype(np.int16); r, g, b = a[..., 0], a[..., 1], a[..., 2]
fondm = (g < np.minimum(r, b) - 70) & (np.abs(r - b) < 90)
m = (~fondm).astype(np.uint8)
m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
m = (lab == 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))).astype(np.uint8)
alpha = np.clip((cv2.GaussianBlur(m.astype(np.float32), (0, 0), 1.0) - 0.2) / 0.6, 0, 1)
rgb = tab.copy()
bordt = (alpha > 0) & (cv2.erode(m, np.ones((7, 7), np.uint8)) == 0)
rgb[bordt] = cv2.erode(tab, np.ones((5, 5), np.uint8))[bordt]
tabr = rogner(np.dstack([rgb, (alpha * 255).astype(np.uint8)]), 2)
ys = np.nonzero(tabr[..., 3] > 128)[0]
tim = Image.fromarray(tabr)
tim = tim.resize((round(600 * tim.width / tim.height), 600), Image.LANCZOS)
tim.save(os.path.join(IMG, 'tabouret.png'), optimize=True)
print('tabouret', tim.size)

# ---- logo
logo = rogner(cle_verte(np.asarray(Image.open(os.path.join(SRC, 'Pizza_Rush_game_logo_eeeb4730.jpg')).convert('RGB'))))
Image.fromarray(logo).resize((900, round(900 * logo.shape[0] / logo.shape[1])), Image.LANCZOS).save(os.path.join(IMG, 'logo.png'))

# ---- cadre d'origine (rouge laqué et or, store, ampoules, fromage) choisi par l'utilisateur.
# Son ouverture est très large (2,3:1) : on rallonge seulement les montants unis (y 180-380) pour des cases presque
# carrées ; coins, store, emblème, ampoules et coulures restent intacts.
src = np.asarray(Image.open(os.path.join(SRC, 'Cadre_origine_rouge_or.webp')).convert('RGB')).astype(np.float32)
Y_INS, AJOUT = 270, 236
bande = np.median(src[220:330], axis=0, keepdims=True)            # ligne type des montants (sans bruit)
src = np.concatenate([src[:Y_INS], np.repeat(bande, AJOUT, axis=0), src[Y_INS:]], axis=0)
r, g, b = src[..., 0], src[..., 1], src[..., 2]
# fond magenta + ombre intérieure violet foncé : ce sont du magenta assombri → noir semi-transparent
fondlike = (g < np.minimum(r, b) - 45) & (np.abs(r - b) < 70)
n, lab = cv2.connectedComponents(fondlike.astype(np.uint8), connectivity=4)
ids = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
H, W = fondlike.shape
cy, cx = H // 2, W // 2
ids.add(lab[cy, cx])                                                   # l'ouverture
fond = np.isin(lab, list(ids)) & (lab > 0)
alpha = np.ones((H, W), np.float32)
rgb = src.copy()
lum = np.maximum(r, b) / 255.0
alpha[fond] = np.clip(1 - lum[fond], 0, 1) ** 1.2                      # magenta pur → 0 ; ombre sombre → opaque noir
rgb[fond] = 0
# liseré : pixels du cadre teintés de magenta au bord → on retire la part de magenta
bord = (~fond) & (cv2.dilate(fond.astype(np.uint8), np.ones((3, 3), np.uint8)) > 0)
rgb[bord, 1] = np.maximum(rgb[bord, 1], np.minimum(rgb[bord, 0], rgb[bord, 2]) * 0.55)
cad = np.dstack([np.clip(rgb, 0, 255), alpha * 255]).astype(np.uint8)
cad = rogner(cad, 2)
op = (cad[..., 3] < 40).astype(np.uint8)
n, lab, st, _ = cv2.connectedComponentsWithStats(op)
best = None
for j in range(1, n):
    x, y, ww, hh, area = st[j]
    if x > 0 and y > 0 and x + ww < cad.shape[1] and y + hh < cad.shape[0]:
        if best is None or area > st[best, 4]: best = j
fx, fy, fw, fh = [int(v) for v in st[best, :4]]
im = Image.fromarray(cad)
im.save(os.path.join(IMG, 'cadre.png'), optimize=True)
json.dump({'taille': [im.width, im.height], 'fenetre': [fx, fy, fw, fh]}, open(os.path.join(IMG, 'cadre.json'), 'w'))
print('cadre', im.width, im.height, 'fenêtre', fx, fy, fw, fh, 'case', round(fw / 5), 'x', round(fh / 4))

# ---- rigs Rig Lab (symboles + Tony)
dst = os.path.join(PUB, 'anims')
if os.path.isdir(dst): shutil.rmtree(dst)
shutil.copytree(os.path.join(JEU, 'anims'), dst, ignore=shutil.ignore_patterns('*.md'))
print('rigs', sorted(os.listdir(dst)))
