"""Pizza Rush : détourage des symboles livrés sur fond gris uni (Google).
Enlève le fond relié au bord + l'ombre portée grise, les étincelles et petits nuages isolés,
les trous de fond fermés (A, Q, 10…), nettoie la frange grise, cadre toute la famille pareil.
Usage : .venv/bin/python atelier/pizza-rush/detoure.py SOURCES SORTIE"""
import sys, os, json
import numpy as np, cv2
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

SYMS = {  # code : (fichier, famille)
    'L5': ('Purple_number_ten_symbol_1e7a56a3.jpg', 'bas'),
    'L4': ('Blue_bubble_letter_J_0943a75e.jpg', 'bas'),
    'L3': ('Green_letter_Q_symbol_1f3f40aa.jpg', 'bas'),
    'L2': ('Glossy_3D_bubble_letter_K_8bea74a9.jpg', 'bas'),
    'L1': ('Red_bubble_letter_A_312d8987.jpg', 'bas'),
    'H4': ('Cartoon_pepperoni_pizza_icon_6f2b6e36.jpg', 'haut'),
    'H3': ('Red_delivery_scooter_icon_69223840.jpg', 'haut'),
    'H2': ('Stack_of_pizza_boxes_icon_85d16647.jpg', 'haut'),
    'H1': ('Glass_tip_jar_icon_rendering_6055a0fd.jpg', 'haut'),
    'WD': ('Golden_pizza_slice_wild_symbol_d689e858.jpg', 'special'),
    'SC': ('Retro_rotary_telephone_scatter_s_921c0fe8.jpg', 'special'),
}
COTE = 640                      # case carrée du rig
# taille du sujet dans la case : les lettres à HAUTEUR égale, les autres à la plus grande dimension
CIBLE = {'bas': ('h', 0.66), 'haut': ('max', 0.80), 'special': ('max', 0.84)}
SOL = 0.90                      # ligne de sol commune (bas du sujet)

def detoure(path, halo=False, ombre_min=50, trait_max=48, trou_min=300):
    img = np.asarray(Image.open(path).convert('RGB'))
    a = img.astype(np.int16)
    H, W, _ = a.shape
    bord = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(bord, axis=0)
    chroma = a.max(2) - a.min(2)
    lum = a.mean(2)
    # « fond » = gris sans couleur, plus clair que le trait noir (inclut l'ombre portée)
    fondlike = (chroma < 26) & (lum > ombre_min) & (lum < 225)
    if halo:  # halo lumineux clair autour du sujet (WILD) : on le mange aussi depuis le bord
        fondlike |= (lum > 115) & (chroma < 100)
    fondlike = cv2.morphologyEx(fondlike.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab = cv2.connectedComponents(fondlike, connectivity=4)
    touche = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fond = np.isin(lab, list(touche))
    # trous fermés : vraie couleur de fond, assez grands
    proche = (np.abs(a - bg).max(2) < 14).astype(np.uint8)
    n2, lab2, st2, _ = cv2.connectedComponentsWithStats(proche, connectivity=4)
    for i in range(1, n2):
        if st2[i, cv2.CC_STAT_AREA] > trou_min:
            fond |= lab2 == i
    sujet = (~fond).astype(np.uint8)
    # silhouette tracée par le trait noir : récupère les parties grises (chromes, verre) que le fond a mangées
    trait = ((lum < trait_max) & (chroma < 70)).astype(np.uint8)
    trait = cv2.morphologyEx(trait, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    plein = trait.copy(); h0, w0 = plein.shape
    ff = np.zeros((h0 + 2, w0 + 2), np.uint8); cv2.floodFill(plein, ff, (0, 0), 2)
    dedans = (plein != 2)
    sujet |= (dedans & ~(np.abs(a - bg).max(2) < 14)).astype(np.uint8)
    # coupe les ponts fins (étincelle collée) : érosion → composantes → on regonfle dans le masque d'origine
    er = cv2.erode(sujet, np.ones((9, 9), np.uint8))
    n5, lab5, st5, _ = cv2.connectedComponentsWithStats(er, connectivity=8)
    if n5 > 1:
        big = st5[1:, cv2.CC_STAT_AREA].max()
        ok = np.isin(lab5, [i for i in range(1, n5) if st5[i, cv2.CC_STAT_AREA] > 0.02 * big]).astype(np.uint8)
        sujet &= cv2.dilate(ok, np.ones((13, 13), np.uint8))
    # garder le sujet principal (vire étincelles, petits nuages, pièces volantes)
    n3, lab3, st3, _ = cv2.connectedComponentsWithStats(sujet, connectivity=8)
    if n3 > 1:
        big = st3[1:, cv2.CC_STAT_AREA].max()
        keep = [i for i in range(1, n3) if st3[i, cv2.CC_STAT_AREA] > 0.02 * big]
        sujet = np.isin(lab3, keep).astype(np.uint8)
    # trous internes minuscules (bruit) rebouchés
    inv = (1 - sujet).astype(np.uint8)
    n4, lab4, st4, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
    for i in range(1, n4):
        if st4[i, cv2.CC_STAT_AREA] < 400:
            sujet[lab4 == i] = 1
    # alpha adouci (1 px) + frange : les pixels du bord prennent la couleur du trait voisin
    alpha = cv2.GaussianBlur(sujet.astype(np.float32), (0, 0), 0.9)
    alpha = np.clip((alpha - 0.15) / 0.7, 0, 1)
    rgb = img.copy()
    sombre = cv2.erode(img, np.ones((5, 5), np.uint8))
    frange = (alpha > 0) & (cv2.erode(sujet, np.ones((5, 5), np.uint8)) == 0)
    rgb[frange] = sombre[frange]
    rgba = np.dstack([rgb, (alpha * 255).astype(np.uint8)])
    ys, xs = np.nonzero(rgba[..., 3] > 8)
    return rgba[ys.min():ys.max() + 1, xs.min():xs.max() + 1]

rapport = {}
for code, (f, fam) in SYMS.items():
    opts = {'WD': dict(halo=True), 'H3': dict(ombre_min=110, trait_max=100, trou_min=4000)}.get(code, {})
    c = detoure(os.path.join(SRC, f), **opts)
    h, w = c.shape[:2]
    mode, frac = CIBLE[fam]
    s = frac * COTE / (h if mode == 'h' else max(h, w))
    if w * s > 0.92 * COTE: s = 0.92 * COTE / w      # ne dépasse jamais la case
    nw, nh = round(w * s), round(h * s)
    im = Image.fromarray(c, 'RGBA').resize((nw, nh), Image.LANCZOS)
    case = Image.new('RGBA', (COTE, COTE), (0, 0, 0, 0))
    case.alpha_composite(im, ((COTE - nw) // 2, round(SOL * COTE) - nh))
    case.save(os.path.join(OUT, f'{code}.png'))
    rapport[code] = {'source': f, 'taille': [nw, nh]}
    print(code, f, (nw, nh))
json.dump(rapport, open(os.path.join(OUT, 'detourage.json'), 'w'), indent=1)
