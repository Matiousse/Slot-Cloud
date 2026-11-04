"""PARTICULES DESSINÉES — des textures cartoon (remplissage blanc, ombre grise,
contour noir) que le moteur teinte à la couleur voulue : le blanc prend la
couleur, le noir reste noir. Jamais de point flou « IA ».

    from lib.particules import tout
    tout('/chemin/du/dossier')          # écrit les textures en WebP sans perte
"""
import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as nd

K = 4                       # dessin à 4× puis réduction : bords nets et doux
NOIR = (27, 17, 22, 255)
BLANC = (255, 255, 255, 255)
OMBRE = (206, 206, 214, 255)


def _fin(img, taille):
    return img.resize(taille, Image.LANCZOS)


def _forme(taille, dessine, contour=3.2, ombre=True, reflet=True):
    """dessine(draw, w, h, fill) trace la forme remplie. On en tire : le contour
    noir (forme élargie), l'ombre (moitié bas-droite), un petit reflet."""
    w, h = taille[0] * K, taille[1] * K
    m = Image.new('L', (w, h), 0)
    dessine(ImageDraw.Draw(m), w, h, 255)
    mk = np.array(m) > 127
    c = int(contour * K)
    grand = nd.binary_dilation(mk, iterations=c)
    out = np.zeros((h, w, 4), np.uint8)
    out[grand] = NOIR
    out[mk] = BLANC
    if ombre:
        yy, xx = np.mgrid[:h, :w]
        ys, xs = np.nonzero(mk)
        cx, cy = xs.mean(), ys.mean()
        # l'ombre : le côté opposé à la lumière (haut-gauche), à l'intérieur
        interieur = nd.binary_erosion(mk, iterations=max(1, int(1.2 * K)))
        dec = nd.shift(interieur.astype(float), (-2.2 * K, -2.2 * K), order=0) > .5
        zone = mk & ~dec
        out[zone] = OMBRE
    if reflet:
        ys, xs = np.nonzero(mk)
        x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
        rw, rh = (x1 - x0) * .16, (y1 - y0) * .12
        rx, ry = x0 + (x1 - x0) * .3, y0 + (y1 - y0) * .28
        r = Image.new('L', (w, h), 0)
        ImageDraw.Draw(r).ellipse([rx - rw, ry - rh, rx + rw, ry + rh], fill=255)
        rr = (np.array(r) > 127) & nd.binary_erosion(mk, iterations=2 * K)
        out[rr] = BLANC
    return _fin(Image.fromarray(out), taille)


def confetti_rect(t=(44, 26)):
    return _forme(t, lambda d, w, h, f: d.rounded_rectangle([w * .14, h * .2, w * .86, h * .8], radius=h * .12, fill=f), contour=2.6, reflet=False)


def confetti_ruban(t=(56, 34)):
    def dess(d, w, h, f):
        pts = []
        for i in range(21):
            u = i / 20
            x = w * (.1 + .8 * u)
            y = h * (.5 + .22 * math.sin(u * math.pi * 2))
            pts.append((x, y))
        d.line(pts, fill=f, width=int(h * .26), joint='curve')
        for p in (pts[0], pts[-1]):
            d.ellipse([p[0] - h * .13, p[1] - h * .13, p[0] + h * .13, p[1] + h * .13], fill=f)
    return _forme(t, dess, contour=2.4, reflet=False)


def miette(t=(40, 36), graine=3):
    rng = np.random.default_rng(graine)

    def dess(d, w, h, f):
        n = 7
        pts = []
        for i in range(n):
            a = i / n * math.pi * 2 + rng.uniform(-.25, .25)
            r = rng.uniform(.28, .4)
            pts.append((w / 2 + math.cos(a) * w * r, h / 2 + math.sin(a) * h * r))
        d.polygon(pts, fill=f)
    return _forme(t, dess, contour=2.6)


def goutte(t=(40, 54)):
    def dess(d, w, h, f):
        d.ellipse([w * .18, h * .38, w * .82, h * .9], fill=f)
        d.polygon([(w * .5, h * .08), (w * .22, h * .6), (w * .78, h * .6)], fill=f)
    return _forme(t, dess, contour=2.8)


def etincelle(t=(48, 48)):
    def dess(d, w, h, f):
        cx, cy = w / 2, h / 2
        pts = []
        for i in range(8):
            a = i * math.pi / 4 - math.pi / 2
            r = (w * .44) if i % 2 == 0 else (w * .14)
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r))
        d.polygon(pts, fill=f)
    return _forme(t, dess, contour=2.4, ombre=False, reflet=False)


def eclaboussure(t=(52, 46), graine=5):
    rng = np.random.default_rng(graine)

    def dess(d, w, h, f):
        d.ellipse([w * .22, h * .24, w * .78, h * .76], fill=f)
        for i in range(5):
            a = i / 5 * math.pi * 2 + rng.uniform(-.3, .3)
            r = w * rng.uniform(.25, .3)
            x, y = w / 2 + math.cos(a) * r, h / 2 + math.sin(a) * r
            s = w * rng.uniform(.06, .09)
            d.ellipse([x - s, y - s, x + s, y + s], fill=f)
    return _forme(t, dess, contour=2.6)


def bulle(t=(52, 52)):
    """Bulle de soda : cercle clair presque transparent, contour foncé, reflet."""
    w, h = t[0] * K, t[1] * K
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    e = 3.4 * K
    d.ellipse([e, e, w - e, h - e], fill=(255, 255, 255, 175), outline=(60, 34, 30, 255), width=int(2.2 * K))
    d.ellipse([w * .24, h * .2, w * .46, h * .4], fill=(255, 255, 255, 255))
    d.arc([w * .16, h * .16, w * .84, h * .84], 20, 80, fill=(255, 255, 255, 255), width=int(2.2 * K))
    return _fin(img, t)


def popcorn_depuis(src_png, taille=112):
    """Pop-corn dessiné, repris d'une image (le point du « ! » du logo) : la chair
    crème et jaune est gardée, le contour noir est retracé net et régulier."""
    a = np.array(Image.open(src_png).convert('RGBA'))
    r, g, b, al = [a[..., i].astype(int) for i in range(4)]
    chair = (al > 40) & (r > 150) & (g > 110) & (b < 245) & ~((r > 140) & (g < 90))
    chair = nd.binary_fill_holes(nd.binary_closing(chair, iterations=2))
    lab, n = nd.label(chair)
    tailles = np.bincount(lab.ravel()); tailles[0] = 0
    chair = lab == tailles.argmax()
    ep = max(3, int(round(min(a.shape[:2]) * .045)))
    tour = nd.binary_dilation(chair, iterations=ep)
    out = np.zeros_like(a)
    out[tour] = NOIR
    out[chair] = a[chair]
    out[chair, 3] = 255
    im = Image.fromarray(out)
    bx = im.getbbox()
    im = im.crop(bx)
    s = taille / max(im.size)
    return im.resize((max(1, round(im.size[0] * s)), max(1, round(im.size[1] * s))), Image.LANCZOS)


def tout(dossier, popcorn_src=None):
    os.makedirs(dossier, exist_ok=True)
    faites = {
        'p-confetti.webp': confetti_rect(), 'p-ruban.webp': confetti_ruban(), 'p-miette.webp': miette(),
        'p-goutte.webp': goutte(), 'p-etincelle.webp': etincelle(), 'p-eclabousse.webp': eclaboussure(),
        'p-bulle.webp': bulle(),
    }
    if popcorn_src:
        faites['p-popcorn.webp'] = popcorn_depuis(popcorn_src)
    for nom, im in faites.items():
        im.save(os.path.join(dossier, nom), 'WEBP', lossless=True)
    return list(faites)
