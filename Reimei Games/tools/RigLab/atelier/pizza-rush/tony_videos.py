"""Toutes les vidéos de Tony (Google Flow) → planches de sprites communes pour le jeu.
Même détourage que tony_video.py, mais UN SEUL recadrage pour toutes les vidéos (Tony garde la même taille et les pieds
au même endroit d'une animation à l'autre). Chaque vidéo est coupée autour de son action.
Usage : tony_videos.py SORTIE HAUTEUR nom:dossier_png:debut_s:fin_s [...]   (images extraites à 12 i/s)"""
import sys, os, glob, json
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))

OUT, HT = sys.argv[1], int(sys.argv[2])
FPS = 12
os.makedirs(OUT, exist_ok=True)


def cle(path):
    import cv2
    img = np.asarray(Image.open(path).convert('RGB'))
    a = img.astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    fond = (g < np.minimum(r, b) - 70) & (np.abs(r - b) < 90)
    fond |= (a.min(2) > 200) & (g < np.minimum(r, b) - 25)
    sujet = (~fond).astype(np.uint8)
    sujet = cv2.morphologyEx(sujet, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(sujet, connectivity=8)
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
    sujet = (lab == i).astype(np.uint8)
    inv = 1 - sujet
    n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    for j in range(1, n):
        if st[j, cv2.CC_STAT_AREA] < 600: sujet[lab == j] = 1
    alpha = cv2.GaussianBlur(sujet.astype(np.float32), (0, 0), 1.0)
    alpha = np.clip((alpha - 0.2) / 0.6, 0, 1)
    rgb = img.copy()
    bord = (alpha > 0) & (cv2.erode(sujet, np.ones((7, 7), np.uint8)) == 0)
    sombre = cv2.erode(img, np.ones((5, 5), np.uint8))
    rgb[bord] = sombre[bord]
    return np.dstack([rgb, (alpha * 255).astype(np.uint8)])


clips = []
for spec in sys.argv[3:]:
    nom, d, t0, t1 = spec.split(':')
    fs = sorted(glob.glob(os.path.join(d, '*.png')))
    fs = fs[round(float(t0) * FPS):round(float(t1) * FPS)]
    imgs = []
    for f in fs:
        fr = cle(f)
        ys, xs = np.nonzero(fr[..., 3] > 10)
        b = [xs.min(), ys.min(), xs.max() + 1, ys.max() + 1]
        imgs.append((b, fr[b[1]:b[3], b[0]:b[2]].copy()))   # on ne garde que la zone utile (mémoire)
    clips.append((nom, imgs))
    print(nom, len(fs), 'images', flush=True)

box = None
for _, frames in clips:
    for b, _ in frames:
        box = b if box is None else [min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3])]
x0, y0, x1, y1 = box[0] - 4, box[1] - 4, box[2] + 4, box[3] + 4
print('cadre commun', x0, y0, x1, y1, flush=True)
s = HT / (y1 - y0)
W, H = round((x1 - x0) * s), HT
cols, rows = 2048 // W, 2048 // H
per = cols * rows
sheets, anims, k = [], {}, 0
for nom, frames in clips:
    anims[nom] = []
    for b, fr in frames:
        full = Image.new('RGBA', (x1 - x0, y1 - y0), (0, 0, 0, 0))
        full.paste(Image.fromarray(fr), (b[0] - x0, b[1] - y0))
        im = full.resize((W, H), Image.LANCZOS)
        si, c = divmod(k, per)
        if si >= len(sheets): sheets.append(Image.new('RGBA', (cols * W, rows * H), (0, 0, 0, 0)))
        sheets[si].paste(im, ((c % cols) * W, (c // cols) * H))
        anims[nom].append([si, (c % cols) * W, (c // cols) * H])
        k += 1
for i, sh in enumerate(sheets): sh.save(os.path.join(OUT, f'planche-{i}.webp'), quality=75, method=6)
json.dump({'fps': FPS, 'w': W, 'h': H, 'planches': len(sheets), 'repos': clips[0][0], 'anims': anims},
          open(os.path.join(OUT, 'tony-video.json'), 'w'))
print('total', k, 'taille', W, H, 'planches', len(sheets), 'par planche', per)
