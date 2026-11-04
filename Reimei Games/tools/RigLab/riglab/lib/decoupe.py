"""DÉCOUPE — sélection et extraction des pièces d'un symbole.

Trois façons de tirer une pièce d'une image :
  - détacher : la pièce part dans sa propre image, le trou qu'elle laisse
    dans le corps est REBOUCHÉ (inpainting) pour qu'un mouvement ne découvre
    jamais du vide ;
  - surimpression : copie des pixels d'une zone, de la taille de l'image,
    qui se déforme comme le corps (lettres, gemmes : on les fait briller ou
    gonfler sans aucune couture) ;
  - lueur : halo doux, dans une image plus grande que le cadre.

Sélection : lasso (polygone) et/ou baguette magique (couleur proche d'un
point cliqué, contiguë ou non), élargie de `contour` pixels pour emporter
le trait noir autour.
"""
import io

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd


def charger(path):
    return np.array(Image.open(path).convert('RGBA'))


def sauver(path, img):
    """Toujours en WebP sans perte (même dessin, même alpha, bien plus léger)."""
    im = img if isinstance(img, Image.Image) else Image.fromarray(img.astype(np.uint8))
    if path.lower().endswith('.png'):
        im.save(path)
    else:
        im.save(path, 'WEBP', lossless=True, method=4)


def disque(r):
    r = max(1, int(r))
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return x * x + y * y <= r * r


def poly_masque(shape, pts):
    m = Image.new('L', (shape[1], shape[0]), 0)
    if pts and len(pts) >= 3:
        ImageDraw.Draw(m).polygon([(float(p[0]), float(p[1])) for p in pts], fill=255)
    return np.array(m) > 0


def baguette(a, x, y, tol=32, contigu=True):
    """Pixels de couleur proche du point (x, y)."""
    H, W = a.shape[:2]
    x, y = int(max(0, min(W - 1, x))), int(max(0, min(H - 1, y)))
    rgb = a[..., :3].astype(np.int32)
    ref = rgb[y, x]
    d = np.abs(rgb - ref).max(axis=2)
    m = (d <= tol) & (a[..., 3] > 16)
    if contigu:
        lab, _ = nd.label(m)
        if lab[y, x] == 0:
            return np.zeros_like(m)
        m = lab == lab[y, x]
    return nd.binary_fill_holes(m)


def selection(a, sel):
    """sel = { poly: [[x,y]…], baguette: {x, y, tol, contigu}, contour: px,
               mode: 'union' | 'inter' }"""
    op = a[..., 3] > 0
    c = int(sel.get('contour', 0) or 0)
    grow = (lambda x: nd.binary_dilation(x, structure=disque(c))) if c > 0 else (lambda x: x)
    lasso = poly_masque(a.shape, sel['poly']) if sel.get('poly') and len(sel['poly']) >= 3 else None
    w = None
    if sel.get('baguette'):
        b = sel['baguette']
        w = baguette(a, b.get('x', 0), b.get('y', 0), b.get('tol', 32), b.get('contigu', True))
    if lasso is None and w is None:
        return np.zeros(a.shape[:2], bool)
    if w is None:                      # lasso seul : on a tracé autour de la pièce
        m = grow(lasso)
    elif lasso is None:                # baguette seule : la couleur + son trait noir
        m = grow(w)
    elif sel.get('mode') == 'inter':   # la couleur, mais seulement dans le lasso
        m = grow(w & lasso) & lasso
    else:
        m = grow(w) | lasso
    return m & op


def masque_png(a, m, couleur=(255, 64, 110)):
    """Aperçu : la sélection en couleur semi-transparente, contour marqué."""
    H, W = m.shape
    o = np.zeros((H, W, 4), np.uint8)
    o[m] = couleur + (110,)
    bord = m & ~nd.binary_erosion(m, structure=disque(2))
    o[bord] = (255, 255, 255, 230)
    buf = io.BytesIO()
    Image.fromarray(o).save(buf, 'PNG')
    return buf.getvalue()


def detacher(a, m, boucher=True, ferme=30, assombrir=0.82):
    """Retourne (pièce, corps). Le trou du corps est rebouché par inpainting,
    avec une opacité qui ne dépasse pas la silhouette du reste."""
    pc = a.copy()
    pc[~m] = 0
    co = a.copy()
    if not boucher:
        co[m] = 0
        return pc, co
    reste = (a[..., 3] > 0) & ~m
    # l'opacité sous la pièce : la silhouette du reste, fermée (on ne comble
    # que les creux entourés, jamais ce qui dépasse vers l'extérieur)
    plein = nd.binary_closing(reste, structure=disque(ferme), iterations=1) | reste
    plein = nd.binary_fill_holes(plein)
    rgb = cv2.cvtColor(a[..., :3].astype(np.uint8), cv2.COLOR_RGB2BGR)
    trou = m.astype(np.uint8) * 255
    trou = cv2.dilate(trou, np.ones((5, 5), np.uint8))
    fill = cv2.inpaint(rgb, trou, 9, cv2.INPAINT_TELEA)
    fill = cv2.cvtColor(fill, cv2.COLOR_BGR2RGB)
    # les pixels rebouchés sont assombris : ce qui est « derrière » est dans l'ombre
    co[m, :3] = (fill[m] * assombrir).astype(np.uint8)
    co[m, 3] = np.where(plein[m], 255, 0)
    al = co[..., 3].astype(float)
    al[m] = cv2.GaussianBlur(al, (0, 0), 1.2)[m]
    co[..., 3] = al.astype(np.uint8)
    return pc, co


def surimpression(a, m):
    """Copie des pixels d'une zone (pour un flash ou un gonflement sur place)."""
    o = a.copy()
    o[~m] = 0
    return o


def lueur(centres, rayon, couleur, flou=None, alpha=200):
    """Lueur douce (un ou plusieurs centres), dans une image assez grande pour
    ne jamais être coupée. Retourne (image, offset)."""
    flou = flou or rayon * 0.45
    pad = int(rayon + flou * 2.4)
    xs = [p[0] for p in centres]
    ys = [p[1] for p in centres]
    x0, y0 = int(min(xs) - pad), int(min(ys) - pad)
    g = Image.new('RGBA', (int(max(xs) - x0 + pad), int(max(ys) - y0 + pad)), (0, 0, 0, 0))
    d = ImageDraw.Draw(g)
    for x, y in centres:
        d.ellipse([x - x0 - rayon, y - y0 - rayon, x - x0 + rayon, y - y0 + rayon], fill=tuple(couleur) + (int(alpha),))
    return g.filter(ImageFilter.GaussianBlur(flou)), [x0, y0]


def boite(m):
    ys, xs = np.nonzero(m)
    if not len(xs):
        return None
    return [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]


def centre(m):
    ys, xs = np.nonzero(m)
    if not len(xs):
        return None
    return [int(xs.mean()), int(ys.mean())]


def opaque(a):
    """Boîte des pixels visibles de l'image."""
    return boite(a[..., 3] > 8)
