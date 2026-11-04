"""Tony : expressions = TRAITS SEULS (yeux, sourcils, bouche) posés sur la tête neutre.
1. Recalage de chaque expression sur la tête neutre par les repères fixes : largeur du visage (échelle, x) et oreille (y).
2. Traits = pixels non-peau dans le visage (le nez reste celui de la neutre).
3. Calque visage-<expr> = peau neutre repeinte (inpainting) sur la zone des traits neutres + traits de l'expression,
   bord adouci dans la peau → en fondu, seuls les traits changent ; cheveux, oreilles, contour ne bougent jamais.
Sortie : calques/visage-<expr>.png, calques/tete-vierge.png, ../controle-visages.jpg"""
import os, sys
import numpy as np, cv2
from PIL import Image

C = sys.argv[1]
lire = lambda n: np.asarray(Image.open(os.path.join(C, n)).convert('RGBA')).copy()
tete = lire('tete.png'); H, W = tete.shape[:2]
NEZ = np.array([1530, 607]); R_NEZ = 40
GRAINE = (1385, 655)                          # joue gauche (peau) dans toutes les têtes

def peau(a):
    r, g, b, al = [a[..., i].astype(int) for i in range(4)]
    return (al > 200) & (r > 190) & (g > 110) & (g < 230) & (b > 75) & (b < 210) & (r - b > 30)

def composantes(a):
    m = cv2.morphologyEx(peau(a).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return cv2.connectedComponentsWithStats(m, connectivity=4)

def visage(a, graine):
    n, lab, st, cen = composantes(a)
    i = lab[graine[1], graine[0]]
    f = (lab == i).astype(np.uint8)
    cnts, _ = cv2.findContours(f, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    plein = np.zeros_like(f); cv2.drawContours(plein, cnts, -1, 1, -1)
    return plein.astype(bool)

ZONE = (1318, 395, 1720, 772)   # zone des traits (exclut oreille et contours du visage)
BOITE_NEZ = (1488, 568, 1578, 642)
ECHELLE_TRAITS = 0.92
def nez(a):
    g = lambda im: cv2.cvtColor(np.ascontiguousarray(im[..., :3]), cv2.COLOR_RGB2GRAY)
    x0, y0, x1, y1 = BOITE_NEZ
    tpl = g(tete)[y0:y1, x0:x1]
    sx0, sy0 = x0 - 70, y0 - 30
    zone = g(a)[sy0:y1 + 120, sx0:x1 + 70]
    res = cv2.matchTemplate(zone, tpl, cv2.TM_CCOEFF_NORMED)
    _, v, _, loc = cv2.minMaxLoc(res)
    return np.array([sx0 + loc[0] + (x1 - x0) / 2, sy0 + loc[1] + (y1 - y0) / 2]), v

fn = visage(tete, GRAINE)
NEZ_N, _ = nez(tete)
ys, xs = np.nonzero(fn)
Ln, Rn = np.percentile(xs, 0.5), np.percentile(xs, 99.5)
peau_n = np.median(tete[fn & peau(tete)][:, :3], 0)
yy, xx = np.mgrid[0:H, 0:W]
pres_nez = (xx - NEZ_N[0]) ** 2 + (yy - NEZ_N[1]) ** 2 < R_NEZ ** 2
interieur = cv2.erode(fn.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
interieur &= (xx >= ZONE[0]) & (xx <= ZONE[2]) & (yy >= ZONE[1]) & (yy <= ZONE[3])

def traits(a, f):
    """pixels des traits : dans le visage (rétréci), pas de la peau, pas le nez"""
    t = interieur & f & ~peau(a) & (a[..., 3] > 128) & ~pres_nez
    t = cv2.morphologyEx(t.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(t)
    return np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 60])

tn = traits(tete, fn)
# tête vierge : traits neutres repeints en peau (inpainting sur une zone un peu élargie)
zone_n = cv2.dilate(tn.astype(np.uint8), np.ones((21, 21), np.uint8)).astype(bool) & interieur
# remplissage lissé (convolution normalisée) : la couleur vient de la peau voisine, ombrage et joues compris, sans traînées
valide = (fn & ~zone_n & peau(tete)).astype(np.float32)
src = tete[..., :3].astype(np.float32) * valide[..., None]
lisse = np.zeros((H, W, 3), np.float32); reste = np.ones((H, W), bool)
for sig, seuil in ((10, .25), (18, .25), (32, .2), (60, .1), (110, .02), (220, 1e-4)):           # multi-échelle : petite échelle près des bords, grande au centre des grands trous
    num = np.dstack([cv2.GaussianBlur(src[..., i], (0, 0), sig) for i in range(3)])
    den = cv2.GaussianBlur(valide, (0, 0), sig)
    ok = reste & (den > seuil)
    lisse[ok] = num[ok] / den[ok][:, None]
    reste &= ~ok
lisse = cv2.GaussianBlur(lisse, (0, 0), 3)
f = cv2.GaussianBlur(zone_n.astype(np.float32), (0, 0), 2.0)[..., None] * zone_n[..., None] + 0
f = np.clip(cv2.GaussianBlur(zone_n.astype(np.float32), (0, 0), 2.5), 0, 1)[..., None] * fn[..., None]
vierge = tete.copy()
vierge[..., :3] = (tete[..., :3] * (1 - f) + lisse * f).astype(np.uint8)
Image.fromarray(vierge, 'RGBA').save(os.path.join(C, 'tete-vierge.png'))

ctl = []
for expr in ['yeux-fermes', 'rire', 'choc', 'triste', 'clin']:
    e0 = lire(f'tete-{expr}.png')
    ne, score = nez(e0)
    fe = visage(e0, GRAINE)
    s = ECHELLE_TRAITS
    tx, ty = NEZ_N[0] - s * ne[0], NEZ_N[1] - s * ne[1]
    M = np.array([[s, 0, tx], [0, s, ty]], np.float32)
    e = cv2.warpAffine(e0, M, (W, H), flags=cv2.INTER_CUBIC)
    fe2 = cv2.warpAffine(fe.astype(np.uint8), M, (W, H), flags=cv2.INTER_NEAREST).astype(bool)
    fe2_in = cv2.erode(fe2.astype(np.uint8), np.ones((15, 15), np.uint8)).astype(bool)
    te = traits(e, fe2_in)
    # goutte de sueur (bleue) : gardée entière même hors du visage
    r, g, b = [e[..., i].astype(int) for i in range(3)]
    goutte = (b > 190) & (r < 190) & (b - r > 40) & (e[..., 3] > 128)
    goutte = cv2.dilate(goutte.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool) & (e[..., 3] > 60)
    # teinte : peau de l'expression ramenée sur la neutre
    pe = np.median(e[fe2 & peau(e)][:, :3], 0); gain = peau_n / np.maximum(pe, 1)
    rgb_e = np.clip(e[..., :3].astype(np.float32) * gain, 0, 255).astype(np.uint8)
    # zone du calque : traits neutres + traits expression (+ marge de peau), dans le visage
    zone = (zone_n | cv2.dilate(te.astype(np.uint8), np.ones((25, 25), np.uint8)).astype(bool)) & interieur
    a = cv2.GaussianBlur(zone.astype(np.float32), (0, 0), 4.0) * interieur
    a = np.maximum(a, cv2.GaussianBlur(te.astype(np.float32), (0, 0), 0.8) * interieur)
    out = np.zeros_like(tete)
    out[..., :3] = vierge[..., :3]                                       # fond = peau neutre repeinte
    te_doux = np.clip(cv2.GaussianBlur(cv2.dilate(te.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32), (0, 0), 1.0), 0, 1)
    out[..., :3] = (out[..., :3] * (1 - te_doux[..., None]) + rgb_e * te_doux[..., None]).astype(np.uint8)
    out[..., 3] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    out[goutte] = np.dstack([rgb_e, e[..., 3:4]])[goutte]
    Image.fromarray(out, 'RGBA').save(os.path.join(C, f'visage-{expr}.png'))
    ctl.append(out)
    print(expr, 'nez', ne.round(1), 'score', round(float(score), 3), 'neutre', NEZ_N.round(1))

box = (1250, 330, 1720, 800)
fond = lambda: Image.new('RGBA', (box[2] - box[0], box[3] - box[1]), (40, 30, 60, 255))
w, h = box[2] - box[0], box[3] - box[1]
pl = Image.new('RGB', (4 * w // 2 * 2, 2 * h))
imgs = [Image.fromarray(tete), Image.fromarray(vierge)] + [None] * 5
cells = []
t = fond(); t.alpha_composite(Image.fromarray(tete).crop(box)); cells.append(t)
t = fond(); t.alpha_composite(Image.fromarray(vierge).crop(box)); cells.append(t)
for o in ctl:
    t = fond(); t.alpha_composite(Image.fromarray(tete).crop(box)); t.alpha_composite(Image.fromarray(o).crop(box)); cells.append(t)
pl = Image.new('RGB', (4 * w, 2 * h))
for i, c in enumerate(cells): pl.paste(c.convert('RGB'), ((i % 4) * w, (i // 4) * h))
pl.resize((4 * w * 3 // 4, 2 * h * 3 // 4)).save(os.path.join(C, '..', 'controle-visages.jpg'), quality=90)
