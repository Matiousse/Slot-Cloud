"""Tony : fabrique les calques du rig, tous au cadrage de la référence (2752x1536).
Entrée : art/tony/reference.png, tete.png, brut-<expr>.png (détourés par tony_detoure.py)
Sortie : art/tony/calques/*.png + controle.png
Bras : coupés à l'ourlet de la manche (la manche reste sur le buste, le haut du bras est prolongé dessous).
Casquette : prise dans la référence, trous rebouchés ; les mèches qui passaient devant deviennent un calque à part."""
import os, sys, json
import numpy as np, cv2
from PIL import Image

T = sys.argv[1]                      # dossier art/tony
OUT = os.path.join(T, 'calques'); os.makedirs(OUT, exist_ok=True)
lire = lambda n: np.asarray(Image.open(os.path.join(T, n)).convert('RGBA')).copy()
def sauver(nom, a): Image.fromarray(a, 'RGBA').save(os.path.join(OUT, nom + '.png'))
def poly(shape, pts):
    m = np.zeros(shape[:2], np.uint8); cv2.fillPoly(m, [np.array(pts, np.int32)], 1); return m.astype(bool)
def garde_plus_grand(a, ouv=7):
    m = (a[..., 3] > 40).astype(np.uint8)
    m2 = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((ouv, ouv), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m2, connectivity=8)
    if n > 1:
        i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA]))
        keep = cv2.dilate((lab == i).astype(np.uint8), np.ones((ouv + 2, ouv + 2), np.uint8)).astype(bool)
        a[~keep] = 0
    return a

ref = lire('reference.png'); H, W = ref.shape[:2]
info = {'taille': [W, H]}

# ---------------------------------------------------------------- bras
COUPE_Y_TETE = 722
BRAS = {  # nom : (polygone = manche + bras + main, coupé sur la couture d'épaule, pivot = haut de la couture)
    'bras-d': [(880, 800), (1160, 770), (1245, 738), (1300, 738), (1314, 790), (1306, 860), (1288, 912), (1240, 918),
               (1215, 935), (1170, 980), (1100, 1200), (880, 1200)],
    'bras-g': [(1528, 760), (1920, 760), (1920, 1130), (1640, 1130), (1560, 1000), (1534, 930), (1530, 905), (1526, 830)],
}
PIVOTS = {'bras-d': (1282, 792), 'bras-g': (1542, 798)}
corps = ref.copy()
corps[:COUPE_Y_TETE] = 0
for nom, pts in BRAS.items():
    m = poly(ref.shape, pts)
    bras = np.zeros_like(ref); bras[m] = ref[m]
    sauver(nom, bras)
    # épaule fixe sur le buste : le haut de la manche (près de la couture) reste en place sous le bras qui tourne
    px, py = PIVOTS[nom]
    yy0, xx0 = np.mgrid[0:H, 0:W]
    epaule = m & ((xx0 - px) ** 2 + (yy0 - py) ** 2 < 62 ** 2)
    corps[m & ~epaule] = 0
    info[nom] = {'pivot': list(PIVOTS[nom])}
# le menton de la référence dépasse sous la coupe : on repère son contour noir (première ligne sombre sous la peau),
# on lisse cette courbe (polynôme) et on retire tout au-dessus + l'épaisseur du trait. La tête fournit son propre menton.
lumc = corps[..., :3].astype(int).mean(2)
xs, ys = [], []
for x in range(1200, 1650):
    c0 = corps[COUPE_Y_TETE + 1, x].astype(int)
    if c0[3] < 128 or not (c0[0] > 170 and c0[1] > 100 and c0[0] - c0[2] > 40): continue
    d = np.nonzero(lumc[COUPE_Y_TETE:830, x] < 70)[0]
    if len(d): xs.append(x); ys.append(COUPE_Y_TETE + d[0])
xs, ys = np.array(xs), np.array(ys)
med = np.median(ys); ok = np.abs(ys - med) < 40
coef = np.polyfit(xs[ok], ys[ok], 2)
x0, x1 = xs[ok].min() - 12, xs[ok].max() + 12
for x in range(int(x0), int(x1) + 1):
    yc = int(round(np.polyval(coef, x))) + 11
    corps[COUPE_Y_TETE:yc, x] = 0
info['menton'] = {'x': [int(x0), int(x1)], 'coef': [float(c) for c in coef]}
sauver('corps', corps)

# ---------------------------------------------------------------- tête + casquette + mèches
tete = garde_plus_grand(lire('tete.png'))
COU_BAS = 860
yy1 = np.arange(H)[:, None]
cx_cou = 1440
bout = (yy1 > COU_BAS) | ((yy1 > COU_BAS - 40) & ((np.arange(W)[None, :] - cx_cou) ** 2 / 90.0 ** 2 + (yy1 - (COU_BAS - 40)) ** 2 / 40.0 ** 2 > 1) & (yy1 > COU_BAS - 40))
tete[bout] = 0
sauver('tete', tete)
r, g, b, al = [ref[..., i].astype(int) for i in range(4)]
zone_cas = poly(ref.shape, [(1080, 60), (1600, 60), (1600, 150), (1420, 230), (1300, 330), (1180, 420), (1080, 420)])
rouge = zone_cas & (r > 140) & (g < 100) & (b < 110) & (al > 128)
rouge = cv2.morphologyEx(rouge.astype(np.uint8), cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
n, lab, st, _ = cv2.connectedComponentsWithStats(rouge)
rouge = np.isin(lab, [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] > 800]).astype(np.uint8)
DOME_X1 = 1585
# casquette COMPLÈTE : sur la référence elle est à moitié cachée par les mèches ; on reconstruit sa forme
# (enveloppe convexe des parties rouges visibles), on repeint les parties cachées dans son rouge, contour noir fermé.
pts = np.argwhere(rouge > 0)[:, ::-1].astype(np.int32)
# le dôme doit couvrir le dessus des cheveux (sinon les mèches passent « à travers ») : on ajoute le haut de la
# chevelure de la tête, colonne par colonne, sur la largeur de la casquette
ta = lire('tete.png')[..., 3] > 128
xr0, xr1 = pts[:, 0].min(), pts[:, 0].max()
dome = []
for x in range(xr0, DOME_X1):
    ys_ = np.nonzero(ta[:, x])[0]
    if len(ys_): dome.append((x, max(ys_[0] - 10, 0)))
if dome:
    xd, yd = dome[-1]
    dome.append((xd, yd + 95))          # épaisseur de la calotte côté arrière : les mèches de derrière sortent dessous
    pts = np.vstack([pts, np.array(dome, np.int32)])
hull = cv2.convexHull(pts)
silh = np.zeros((H, W), np.uint8); cv2.fillPoly(silh, [hull], 1)
silh = (cv2.GaussianBlur(silh.astype(np.float32), (0, 0), 14) > 0.5)             # coins arrondis
# style des symboles : aplat + ombre franche en bas + petit reflet dur en haut, contour noir
vis = rouge.astype(bool) & silh
vr = ref[vis][:, :3].astype(float); lum_r = vr.mean(1)
base = np.median(vr[lum_r >= np.percentile(lum_r, 70)], 0)      # le rouge vif de la casquette d'origine (pas ses ombres)
ombre = base * np.array([0.68, 0.55, 0.75])
clair = np.minimum(base * np.array([1.08, 1.6, 1.5]), 255)
dessous = np.zeros_like(silh); dessous[:-38] = silh[38:]; band_ombre = silh & ~dessous      # 38 px au-dessus du bord bas
dessus = np.zeros_like(silh); dessus[30:] = silh[:-30]
xs_c = np.nonzero(silh.any(0))[0]; xmid = (xs_c.min() + xs_c.max()) / 2
band_clair = cv2.erode(silh.astype(np.uint8), np.ones((25, 25), np.uint8)).astype(bool) & ~dessus
band_clair &= (np.arange(W)[None, :] < xmid)
cas = np.zeros_like(ref)
cas[silh, :3] = base.astype(np.uint8)
cas[band_ombre, :3] = ombre.astype(np.uint8)
cas[band_clair, :3] = clair.astype(np.uint8)
cas[silh, 3] = 255
cnts, _ = cv2.findContours(silh.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
cv2.drawContours(cas, cnts, -1, (20, 14, 20, 255), 12, cv2.LINE_AA)
# couture de la calotte (trait rouge foncé), comme une vraie casquette
x0c, x1c = xs_c.min(), xs_c.max()
yc = [np.nonzero(silh[:, x])[0] for x in (int(x0c + 0.55 * (x1c - x0c)),)]
cx = int(x0c + 0.55 * (x1c - x0c)); ytop, ybot = yc[0][0], yc[0][-1]
cv2.ellipse(cas, (cx + 60, ybot + 10), (110, ybot - ytop), 0, 200, 262, (int(ombre[0]), int(ombre[1]), int(ombre[2]), 255), 7, cv2.LINE_AA)
a_ = cv2.GaussianBlur((cas[..., 3] > 0).astype(np.float32), (0, 0), 0.8); cas[..., 3] = (np.clip(a_ * 1.3, 0, 1) * 255).astype(np.uint8)
sauver('casquette', cas)

# ---------------------------------------------------------------- expressions recalées sur la tête
gris = lambda a: cv2.cvtColor(np.ascontiguousarray(a[..., :3]), cv2.COLOR_RGB2GRAY).astype(np.float32) * (a[..., 3:4][..., 0] / 255.0)
def haut_boite(a, frac=0.55):
    ys, xs = np.nonzero(a[..., 3] > 128); y0 = ys.min(); h = ys.max() - y0
    sel = ys < y0 + frac * h
    return xs[sel].min(), y0, xs[sel].max()
tx0, ty0, tx1 = haut_boite(tete)
for expr in ['yeux-fermes', 'rire', 'choc', 'triste', 'clin']:
    e = garde_plus_grand(lire(f'brut-{expr}.png'))
    ex0, ey0, ex1 = haut_boite(e)
    s = (tx1 - tx0) / (ex1 - ex0)
    M = np.array([[s, 0, tx0 - s * ex0], [0, s, ty0 - s * ey0]], np.float32)
    try:  # affinage : l'ECC aligne les contours (chevelure, oreille) au pixel près
        crit = (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6)
        k = 0.25
        A = cv2.resize(gris(tete), None, fx=k, fy=k)
        Bw = cv2.warpAffine(e, M, (W, H), flags=cv2.INTER_AREA)
        B = cv2.resize(gris(Bw), None, fx=k, fy=k)
        _, M2 = cv2.findTransformECC(A, B, np.eye(2, 3, dtype=np.float32), cv2.MOTION_AFFINE, crit, None, 5)
        M2[:, 2] /= k
        M3 = np.vstack([M2, [0, 0, 1]]) ; M1 = np.vstack([M, [0, 0, 1]])
        Mf = np.linalg.inv(M3) @ M1 if False else None
        # findTransformECC donne B(x) ≈ A(W x) : on compose pour ramener e sur la tête
        Wf = cv2.invertAffineTransform(M2)
        Mtot = (np.vstack([Wf, [0, 0, 1]]) @ M1)[:2]
    except cv2.error:
        Mtot = M
    al = cv2.warpAffine(e, Mtot.astype(np.float32), (W, H), flags=cv2.INTER_AREA)
    sauver('tete-' + expr, al)
    info['tete-' + expr] = {'echelle': round(float(s), 4)}
json.dump(info, open(os.path.join(OUT, 'calques.json'), 'w'), indent=1)

# ---------------------------------------------------------------- contrôle : remontage + superpositions
fond = np.zeros((H, W, 4), np.uint8); fond[...] = (40, 30, 60, 255)
img = Image.fromarray(fond)
for n in ['bras-d', 'bras-g', 'tete', 'corps', 'casquette']:
    img.alpha_composite(Image.open(os.path.join(OUT, n + '.png')))
box = (820, 40, 2000, 1520)
pl = Image.new('RGB', (1180 * 4 // 2, 1480 // 2), (0, 0, 0))
pl.paste(img.crop(box).convert('RGB').resize((590, 740)), (0, 0))
r0 = Image.fromarray(fond); r0.alpha_composite(Image.fromarray(ref)); pl.paste(r0.crop(box).convert('RGB').resize((590, 740)), (590, 0))
ex = Image.fromarray(fond.copy())
for n in ['bras-d', 'bras-g', 'tete-rire', 'corps']:
    ex.alpha_composite(Image.open(os.path.join(OUT, n + '.png')))
pl.paste(ex.crop(box).convert('RGB').resize((590, 740)), (1180, 0))
pl.save(os.path.join(T, 'controle.jpg'), quality=88)
print('ok', info)
