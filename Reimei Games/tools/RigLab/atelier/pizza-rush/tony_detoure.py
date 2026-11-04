"""Tony : détourage des images Gemini (fond magenta, parfois dégradé vers un sol gris).
Fond = pixels « entre magenta et gris » (rouge ≈ bleu, vert pas au-dessus) reliés au bord ; le trait noir arrête le remplissage.
Usage : tony_detoure.py ENTREE.jpg SORTIE.png [--garder N]  (N = nb de grosses composantes gardées, défaut 1)"""
import sys
import numpy as np, cv2
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
garder = int(sys.argv[sys.argv.index('--garder') + 1]) if '--garder' in sys.argv else 1
img = np.asarray(Image.open(src).convert('RGB')); a = img.astype(np.int16)
r, g, b = a[..., 0], a[..., 1], a[..., 2]
lum = a.mean(2)
fondlike = (np.abs(r - b) < 30) & (g <= np.minimum(r, b) + 6) & (lum > 90)
fondlike |= (np.abs(r - g) < 12) & (np.abs(g - b) < 12) & (lum > 120) & (lum < 225)   # sol gris
fondlike = cv2.morphologyEx(fondlike.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
n, lab = cv2.connectedComponents(fondlike, connectivity=4)
bord = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
fond = np.isin(lab, list(bord))
# trous fermés de magenta franc (entre bras et corps…)
mag = ((r > 200) & (b > 200) & (g < 90)).astype(np.uint8)
n2, lab2, st2, _ = cv2.connectedComponentsWithStats(mag, connectivity=4)
for i in range(1, n2):
    if st2[i, cv2.CC_STAT_AREA] > 400: fond |= lab2 == i
sujet = (~fond).astype(np.uint8)
n3, lab3, st3, _ = cv2.connectedComponentsWithStats(sujet, connectivity=8)
ordre = sorted(range(1, n3), key=lambda i: -st3[i, cv2.CC_STAT_AREA])[:garder]
sujet = np.isin(lab3, ordre).astype(np.uint8)
inv = 1 - sujet
n4, lab4, st4, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
for i in range(1, n4):
    if st4[i, cv2.CC_STAT_AREA] < 300: sujet[lab4 == i] = 1
alpha = cv2.GaussianBlur(sujet.astype(np.float32), (0, 0), 0.9)
alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
rgb = img.copy()
sombre = cv2.erode(img, np.ones((5, 5), np.uint8))
frange = (alpha > 0) & (cv2.erode(sujet, np.ones((5, 5), np.uint8)) == 0)
rgb[frange] = sombre[frange]
Image.fromarray(np.dstack([rgb, (alpha * 255).astype(np.uint8)]), 'RGBA').save(dst)
ys, xs = np.nonzero(alpha > 0.05); print(dst, 'boite', xs.min(), ys.min(), xs.max(), ys.max())
