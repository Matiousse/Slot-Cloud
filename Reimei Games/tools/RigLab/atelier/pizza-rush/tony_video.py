"""Tony vidéo (Google Flow) → planches de sprites pour le jeu.
Fond magenta retiré, poussières blanches supprimées (on ne garde que Tony), liseré rose nettoyé, recadrage commun,
12 images/s (cadence « sur deux » des dessins animés), planches WebP 2048 px.
Usage : tony_video.py DOSSIER_IMAGES_PNG SORTIE_DOSSIER [hauteur=440]"""
import sys, os, glob, json
import numpy as np, cv2
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
HT = int(sys.argv[3]) if len(sys.argv) > 3 else 440
os.makedirs(OUT, exist_ok=True)
fs = sorted(glob.glob(os.path.join(SRC, '*.png')))

def cle(path):
    img = np.asarray(Image.open(path).convert('RGB'))
    a = img.astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fond = (g < np.minimum(r, b) - 70) & (np.abs(r - b) < 90)
    fond |= (a.min(2) > 200) & (g < np.minimum(r, b) - 25)            # poussières claires rosées
    sujet = (~fond).astype(np.uint8)
    sujet = cv2.morphologyEx(sujet, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(sujet, connectivity=8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))                  # Tony = la plus grande tache
    sujet = (lab == i).astype(np.uint8)
    inv = 1 - sujet
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    for j in range(1, n):
        if st[j, cv2.CC_STAT_AREA] < 600: sujet[lab == j] = 1           # petits trous rebouchés
    alpha = cv2.GaussianBlur(sujet.astype(np.float32), (0, 0), 1.0)
    alpha = np.clip((alpha - 0.2) / 0.6, 0, 1)
    rgb = img.copy()
    bord = (alpha > 0) & (cv2.erode(sujet, np.ones((7, 7), np.uint8)) == 0)
    sombre = cv2.erode(img, np.ones((5, 5), np.uint8))
    rgb[bord] = sombre[bord]                                           # le liseré prend la couleur du trait noir
    return np.dstack([rgb, (alpha * 255).astype(np.uint8)])

frames = [cle(f) for f in fs]
box = None
for fr in frames:
    ys, xs = np.nonzero(fr[..., 3] > 10)
    b = [xs.min(), ys.min(), xs.max(), ys.max()]
    box = b if box is None else [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
x0, y0, x1, y1 = box[0] - 4, box[1] - 4, box[2] + 5, box[3] + 5
s = HT / (y1 - y0)
W, H = round((x1 - x0) * s), HT
cols, rows = 2048 // W, 2048 // H
per = cols * rows
sheets, meta = [], []
for k, fr in enumerate(frames):
    im = Image.fromarray(fr[y0:y1, x0:x1]).resize((W, H), Image.LANCZOS)
    si, c = divmod(k, per)
    if si >= len(sheets): sheets.append(Image.new('RGBA', (cols * W, rows * H), (0, 0, 0, 0)))
    sheets[si].paste(im, ((c % cols) * W, (c // cols) * H))
    meta.append([si, (c % cols) * W, (c // cols) * H])
for i, sh in enumerate(sheets): sh.save(os.path.join(OUT, f'planche-{i}.webp'), quality=88, method=6)
json.dump({'fps': 12, 'w': W, 'h': H, 'planches': len(sheets), 'frames': meta, 'boucle': 'aller-retour'},
          open(os.path.join(OUT, 'tony-video.json'), 'w'))
print('frames', len(frames), 'taille', W, H, 'planches', len(sheets), 'par planche', per)
