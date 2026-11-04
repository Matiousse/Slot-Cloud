"""RIG LAB — serveur de l'atelier de rig et d'animation (Vantrel).

Ouvre les rigs de TOUS les projets déclarés dans projets.json, là où ils
vivent (art/symbols/rig/<nom>/ dans chaque jeu). Chaque enregistrement garde
l'ancienne version dans historique/ : rien ne se perd.

    python3 riglab/server.py            # http://127.0.0.1:4390/
    python3 riglab/server.py 4390

Pages :
    /studio/   l'éditeur (pour Marius)
    /claude/   l'atelier de Claude (planches-contact, contrôle qualité, API)
"""
import base64
import datetime as dt
import io
import json
import mimetypes
import os
import re
import shutil
import sys
import time
import traceback
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.dirname(ROOT)
sys.path.insert(0, ROOT)

from lib import decoupe as D      # noqa: E402
from lib import recettes as R     # noqa: E402

PROJ_FILE = os.path.join(ROOT, 'projets.json')
HIST = os.path.join(ROOT, 'historique')
CAPT = os.path.join(ROOT, 'captures')
NOM_OK = re.compile(r'^[\w\-]+$')
FICHIER_OK = re.compile(r'^[\w\-. ]+\.(webp|png|jpg|jpeg|json)$', re.I)
IMG_EXT = ('.webp', '.png', '.jpg', '.jpeg')
SON_EXT = ('.ogg', '.wav', '.mp3', '.m4a', '.webm')


class Erreur(Exception):
    def __init__(self, msg, code=400):
        super().__init__(msg)
        self.code = code


# ------------------------------------------------------------------ projets


def projets():
    data = json.load(open(PROJ_FILE, encoding='utf-8'))
    out = []
    for p in data['projets']:
        d = p['dossier'] if os.path.isabs(p['dossier']) else os.path.normpath(os.path.join(ROOT, p['dossier']))
        out.append(dict(p, abs=d))
    return out


def projet(pid):
    p = next((x for x in projets() if x['id'] == pid), None)
    if not p:
        raise Erreur(f"projet inconnu : {pid}", 404)
    return p


def dossier_rigs(p):
    return os.path.join(p['abs'], p.get('rigs', 'art/symbols/rig'))


def dossier_sym(pid, sym, doit_exister=True):
    if not NOM_OK.match(sym or ''):
        raise Erreur(f"nom de symbole invalide : {sym}")
    d = os.path.join(dossier_rigs(projet(pid)), sym)
    if doit_exister and not os.path.isfile(os.path.join(d, 'rig.json')):
        raise Erreur(f"symbole introuvable : {pid}/{sym}", 404)
    return d


def lire_json(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def ecrire_json(path, obj):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def horodatage():
    return dt.datetime.now().strftime('%Y%m%d-%H%M%S-%f')[:-3]


def sauvegarde(pid, sym, fichier, note=''):
    """Copie l'état actuel d'un fichier du symbole dans l'historique."""
    src = os.path.join(dossier_sym(pid, sym, False), fichier)
    if not os.path.isfile(src):
        return None
    d = os.path.join(HIST, pid, sym)
    os.makedirs(d, exist_ok=True)
    v = horodatage()
    shutil.copy2(src, os.path.join(d, f"{v}__{fichier}"))
    if note:
        with open(os.path.join(d, f"{v}__note.txt"), 'w', encoding='utf-8') as f:
            f.write(note)
    return v


def resume_symbole(pid, sym, d):
    try:
        rig = lire_json(os.path.join(d, 'rig.json'))
    except Exception as e:  # rig illisible : on le montre quand même
        return {'nom': sym, 'erreur': str(e)}
    corps = next((p.get('src') for p in rig.get('parts', []) if p.get('name') == 'corps' and p.get('src')), None)
    corps = corps or next((p.get('src') for p in rig.get('parts', []) if p.get('src') and p.get('blend') != 'add'), None)
    m = os.path.getmtime(os.path.join(d, 'rig.json'))
    return {
        'nom': sym, 'taille': rig.get('size'),
        'anims': {n: {'dur': a.get('dur'), 'loop': bool(a.get('loop'))} for n, a in rig.get('anims', {}).items()},
        'pieces': len(rig.get('parts', [])),
        'vignette': f"/vignette/{pid}/{sym}.webp?v={int(m)}" if corps else None,
        'modifie': m,
    }


VIGN = os.path.join(ROOT, 'vignettes')


def vignette(pid, sym):
    """Image du symbole au repos, toutes pièces assemblées (sans les lueurs),
    gardée en cache dans riglab/vignettes (jamais dans le jeu)."""
    d = dossier_sym(pid, sym)
    src = os.path.join(d, 'rig.json')
    out = os.path.join(VIGN, pid, sym + '.webp')
    if os.path.isfile(out) and os.path.getmtime(out) >= os.path.getmtime(src):
        return out
    rig = lire_json(src)
    W, H = rig['size']
    img = Image.new('RGBA', (int(W), int(H)), (0, 0, 0, 0))
    for p in rig['parts']:
        f = p.get('src') or (p.get('frames') or [None])[0]
        if not f or p.get('blend') == 'add':
            continue
        path = os.path.join(d, f)
        if not os.path.isfile(path):
            continue
        piece = Image.open(path).convert('RGBA')
        ox, oy = p.get('offset', [0, 0])
        calque = Image.new('RGBA', img.size, (0, 0, 0, 0))
        calque.paste(piece, (int(ox), int(oy)))
        img = Image.alpha_composite(img, calque)
    img.thumbnail((360, 360))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    img.save(out, 'WEBP', quality=90)
    return out


def liste_projets():
    out = []
    for p in projets():
        dr = dossier_rigs(p)
        syms = []
        if os.path.isdir(dr):
            for s in sorted(os.listdir(dr)):
                d = os.path.join(dr, s)
                if os.path.isfile(os.path.join(d, 'rig.json')):
                    syms.append(resume_symbole(p['id'], s, d))
        out.append({'id': p['id'], 'nom': p['nom'], 'dossier': p['abs'], 'existe': os.path.isdir(p['abs']),
                    'symboles': syms})
    return out


# ------------------------------------------------------------------ images


def decode_image(data):
    """dataURL ou base64 → tableau RGBA."""
    if isinstance(data, str) and data.startswith('data:'):
        data = data.split(',', 1)[1]
    raw = base64.b64decode(data)
    return np.array(Image.open(io.BytesIO(raw)).convert('RGBA'))


def reduire(a, cote_max):
    H, W = a.shape[:2]
    if not cote_max or max(W, H) <= cote_max:
        return a
    f = cote_max / max(W, H)
    im = Image.fromarray(a).resize((max(1, round(W * f)), max(1, round(H * f))), Image.LANCZOS)
    return np.array(im)


def rogner_marges(a, marge=8):
    b = D.opaque(a)
    if not b:
        return a
    x0, y0, x1, y1 = b
    H, W = a.shape[:2]
    x0, y0 = max(0, x0 - marge), max(0, y0 - marge)
    x1, y1 = min(W - 1, x1 + marge), min(H - 1, y1 + marge)
    return a[y0:y1 + 1, x0:x1 + 1]


def nom_fichier_libre(d, base, ext='.webp'):
    base = re.sub(r'[^\w\-]+', '-', base).strip('-') or 'piece'
    n, i = base + ext, 2
    while os.path.exists(os.path.join(d, n)):
        n, i = f"{base}-{i}{ext}", i + 1
    return n


# ------------------------------------------------------------------ actions


def api_nouveau(b):
    """Nouveau symbole : une image (dataURL ou fichier des sources du projet)
    devient un dossier avec corps.webp et un rig de départ animé."""
    pid, sym = b['p'], b['s']
    d = dossier_sym(pid, sym, False)
    if os.path.exists(os.path.join(d, 'rig.json')) and not b.get('ecraser'):
        raise Erreur(f"le symbole {sym} existe déjà")
    if b.get('image'):
        a = decode_image(b['image'])
    elif b.get('source'):
        p = projet(pid)
        src = os.path.join(p['abs'], p.get('sources', 'art/symbols'), os.path.basename(b['source']))
        a = D.charger(src)
    else:
        raise Erreur("il faut une image")
    if b.get('rogner', True):
        a = rogner_marges(a, int(b.get('marge', 8)))
    a = reduire(a, int(b.get('cote', 640)))
    os.makedirs(d, exist_ok=True)
    D.sauver(os.path.join(d, 'corps.webp'), a)
    H, W = a.shape[:2]
    rig = R.squelette_symbole(W, H, D.opaque(a))
    if b.get('animer', True):
        rig, _ = R.appliquer(rig, 'idle', 'symbole-complet', {}, 0, {})
    ecrire_json(os.path.join(d, 'rig.json'), rig)
    return {'ok': True, 'rig': rig}


def api_calques(b):
    """Nouveau symbole depuis des CALQUES (base + pièces dessinées à part, même
    cadrage, comme ChatGPT les livre). Tout est recadré ensemble et réduit du
    même facteur ; chaque pièce est rognée à ses pixels (offset). `separer`
    éclate un calque en ses morceaux (gouttes-1, gouttes-2… de gauche à droite)."""
    from scipy import ndimage as nd
    pid, sym = b['p'], b['s']
    d = dossier_sym(pid, sym, False)
    if os.path.exists(os.path.join(d, 'rig.json')) and not b.get('ecraser'):
        raise Erreur(f"le symbole {sym} existe déjà")
    base = decode_image(b['base'])
    calques = [(c['nom'], decode_image(c['image']), bool(c.get('separer'))) for c in b.get('calques', [])]
    H0, W0 = base.shape[:2]
    for nom, a, _ in calques:
        if a.shape[:2] != (H0, W0):
            raise Erreur(f"le calque {nom} n'a pas la taille de la base ({a.shape[1]}×{a.shape[0]} au lieu de {W0}×{H0})")
    union = base[..., 3] > 8
    for _, a, _ in calques:
        union = union | (a[..., 3] > 8)
    x0, y0, x1, y1 = D.boite(union)
    m = int(b.get('marge', 8))
    x0, y0, x1, y1 = max(0, x0 - m), max(0, y0 - m), min(W0 - 1, x1 + m), min(H0 - 1, y1 + m)
    cote = int(b.get('cote', 640))
    f = min(1.0, cote / max(x1 - x0 + 1, y1 - y0 + 1))
    def prep(a):
        a = a[y0:y1 + 1, x0:x1 + 1]
        return reduire(a, cote) if f < 1 else a
    os.makedirs(d, exist_ok=True)
    corps = prep(base)
    D.sauver(os.path.join(d, 'corps.webp'), corps)
    H, W = corps.shape[:2]
    rig = R.squelette_symbole(W, H, D.opaque(corps))
    ajout = []
    for nom, a, sep in calques:
        a = prep(a)
        morceaux = [(nom, a)]
        if sep:
            lab, n = nd.label(a[..., 3] > 8)
            tailles = [(i, (lab == i).sum()) for i in range(1, n + 1)]
            gros = [i for i, t in tailles if t > 0.02 * max(t2 for _, t2 in tailles)]
            gros.sort(key=lambda i: np.nonzero(lab == i)[1].mean())
            morceaux = []
            for k, i in enumerate(gros, 1):
                mm = nd.binary_dilation(lab == i, iterations=2)
                c = a.copy(); c[~mm] = 0
                morceaux.append((f"{nom}-{k}", c))
        for nm, c in morceaux:
            bx = D.boite(c[..., 3] > 8)
            if not bx:
                continue
            c2, off = rogner_piece(c)
            D.sauver(os.path.join(d, nm + '.webp'), c2)
            part = {'name': nm, 'src': nm + '.webp', 'pivot': [int((bx[0] + bx[2]) / 2), int((bx[1] + bx[3]) / 2)], 'parent': 'haut'}
            if off != [0, 0]:
                part['offset'] = off
            ajout.append(part)
    rig['parts'].extend(ajout)
    if b.get('animer', True):
        rig, _ = R.appliquer(rig, 'idle', 'symbole-complet', {}, 0, {})
    ecrire_json(os.path.join(d, 'rig.json'), rig)
    return {'ok': True, 'rig': rig, 'facteur': round(f, 4), 'cadre': [x0, y0, x1, y1]}


def charge_source(pid, sym, fichier):
    if not FICHIER_OK.match(fichier or ''):
        raise Erreur("nom de fichier invalide")
    return D.charger(os.path.join(dossier_sym(pid, sym), fichier))


def api_masque(b):
    a = charge_source(b['p'], b['s'], b.get('source', 'corps.webp'))
    m = D.selection(a, b.get('sel', {}))
    return D.masque_png(a, m), D.boite(m)


def api_decoupe(b):
    """action : 'detacher' | 'surimpression'. Écrit la pièce (même cadrage que
    la source) et, pour détacher, le corps rebouché. Les anciennes images vont
    dans l'historique."""
    pid, sym, src = b['p'], b['s'], b.get('source', 'corps.webp')
    d = dossier_sym(pid, sym)
    a = charge_source(pid, sym, src)
    m = D.selection(a, b.get('sel', {}))
    if m.sum() < 20:
        raise Erreur("sélection vide")
    nom = nom_fichier_libre(d, b.get('nom') or 'piece')
    action = b.get('action', 'detacher')
    if action == 'surimpression':
        D.sauver(os.path.join(d, nom), D.surimpression(a, m))
        offset = None
    else:
        pc, co = D.detacher(a, m, boucher=b.get('boucher', True), assombrir=float(b.get('assombrir', .82)))
        sauvegarde(pid, sym, src, f"avant découpe de {nom}")
        # la pièce est rognée à ses pixels (+ marge) : maillage serré, fichier léger
        # (sauf projet « plein cadre » : toutes les pièces gardent le cadrage de l'image)
        if b.get('plein_cadre', projet(pid).get('plein_cadre')):
            offset = [0, 0]
        else:
            pc, offset = rogner_piece(pc)
        D.sauver(os.path.join(d, nom), pc)
        D.sauver(os.path.join(d, src), co)
    return {'ok': True, 'fichier': nom, 'boite': D.boite(m), 'centre': D.centre(m), 'action': action, 'offset': offset}


def rogner_piece(a, marge=6):
    b = D.opaque(a)
    if not b:
        return a, [0, 0]
    x0, y0, x1, y1 = b
    H, W = a.shape[:2]
    x0, y0 = max(0, x0 - marge), max(0, y0 - marge)
    x1, y1 = min(W - 1, x1 + marge), min(H - 1, y1 + marge)
    return a[y0:y1 + 1, x0:x1 + 1], [int(x0), int(y0)]


def api_rogner(b):
    """Rogne l'image d'une pièce à ses pixels visibles ; renvoie le décalage à
    ajouter à son offset (la pièce ne bouge pas à l'écran)."""
    pid, sym, f = b['p'], b['s'], b['fichier']
    a = charge_source(pid, sym, f)
    c, off = rogner_piece(a, int(b.get('marge', 6)))
    if off == [0, 0] and c.shape == a.shape:
        return {'ok': True, 'decalage': [0, 0], 'taille': [a.shape[1], a.shape[0]]}
    sauvegarde(pid, sym, f, "avant rognage")
    D.sauver(os.path.join(dossier_sym(pid, sym), f), c)
    return {'ok': True, 'decalage': off, 'taille': [c.shape[1], c.shape[0]]}


def api_lueur(b):
    pid, sym = b['p'], b['s']
    d = dossier_sym(pid, sym)
    c = b.get('couleur', '#ffd27a').lstrip('#')
    col = (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16))
    centres = b.get('centres') or [b.get('centre', [0, 0])]
    im, off = D.lueur(centres, float(b.get('rayon', 80)), col, b.get('flou'), int(b.get('alpha', 200)))
    if b.get('plein_cadre', projet(pid).get('plein_cadre')):
        # lueur posée dans une image du cadrage du symbole (coupée au bord du cadre)
        rig = lire_json(os.path.join(d, 'rig.json'))
        W, H = rig['size']
        cadre = Image.new('RGBA', (int(W), int(H)), (0, 0, 0, 0))
        cadre.paste(im, (int(off[0]), int(off[1])), im)
        im, off = cadre, [0, 0]
    nom = nom_fichier_libre(d, b.get('nom') or 'lueur')
    D.sauver(os.path.join(d, nom), im)
    return {'ok': True, 'fichier': nom, 'offset': off, 'taille': list(im.size)}


def api_image(b):
    """Ajoute une image au dossier du symbole (séquence, skin, pièce dessinée à part)."""
    pid, sym = b['p'], b['s']
    d = dossier_sym(pid, sym)
    a = decode_image(b['image'])
    base = os.path.splitext(os.path.basename(b.get('nom') or 'image'))[0]
    nom = base + '.webp' if b.get('remplacer') else nom_fichier_libre(d, base)
    if b.get('remplacer'):
        sauvegarde(pid, sym, nom, "avant remplacement")
    D.sauver(os.path.join(d, nom), a)
    return {'ok': True, 'fichier': nom, 'taille': [a.shape[1], a.shape[0]]}


def api_copier(b):
    """Copie un symbole d'un projet à l'autre (essais dans l'Atelier, puis retour au jeu)."""
    de, vers = b['de'], b['vers']
    s = dossier_sym(de['p'], de['s'])
    d = dossier_sym(vers['p'], vers.get('s') or de['s'], False)
    if os.path.exists(os.path.join(d, 'rig.json')):
        if not b.get('ecraser'):
            raise Erreur("le symbole existe déjà dans le projet de destination")
        sauvegarde(vers['p'], vers.get('s') or de['s'], 'rig.json', f"avant copie depuis {de['p']}/{de['s']}")
    os.makedirs(d, exist_ok=True)
    for f in os.listdir(s):
        if os.path.isfile(os.path.join(s, f)):
            shutil.copy2(os.path.join(s, f), os.path.join(d, f))
    return {'ok': True}


def historique(pid, sym):
    d = os.path.join(HIST, pid, sym)
    out = []
    if os.path.isdir(d):
        notes = {}
        for f in os.listdir(d):
            if f.endswith('__note.txt'):
                notes[f.split('__')[0]] = open(os.path.join(d, f), encoding='utf-8').read()
        for f in sorted(os.listdir(d), reverse=True):
            if f.endswith('__rig.json'):
                v = f.split('__')[0]
                out.append({'v': v, 'note': notes.get(v, ''), 'taille': os.path.getsize(os.path.join(d, f))})
    return out


# ------------------------------------------------------------------ HTTP


class Handler(SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    def log_message(self, *a):
        pass

    # --- réponses
    def envoie(self, code, body, ctype):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def json(self, obj, code=200):
        self.envoie(code, json.dumps(obj, ensure_ascii=False).encode(), 'application/json; charset=utf-8')

    def fichier(self, path):
        if not os.path.isfile(path):
            return self.json({'erreur': 'fichier introuvable'}, 404)
        ct = mimetypes.guess_type(path)[0] or 'application/octet-stream'
        if path.endswith('.webp'):
            ct = 'image/webp'
        if path.endswith('.mjs') or path.endswith('.js'):
            ct = 'text/javascript; charset=utf-8'
        with open(path, 'rb') as f:
            self.envoie(200, f.read(), ct)

    def corps(self):
        n = int(self.headers.get('Content-Length', 0))
        return self.rfile.read(n) if n else b''

    def corps_json(self):
        raw = self.corps()
        return json.loads(raw) if raw else {}

    # --- routes
    def do_GET(self):
        try:
            self.route_get()
        except Erreur as e:
            self.json({'erreur': str(e)}, e.code)
        except Exception as e:
            traceback.print_exc()
            self.json({'erreur': f"{type(e).__name__} : {e}"}, 500)

    def do_POST(self):
        try:
            self.route_post()
        except Erreur as e:
            self.json({'erreur': str(e)}, e.code)
        except Exception as e:
            traceback.print_exc()
            self.json({'erreur': f"{type(e).__name__} : {e}"}, 500)

    def route_get(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        path = unquote(u.path)
        if path in ('/', '/index.html'):
            self.send_response(302)
            self.send_header('Location', '/studio/')
            self.send_header('Content-Length', '0')
            self.end_headers()
            return
        if path == '/api/projets':
            return self.json(liste_projets())
        if path == '/api/rig':
            return self.json(lire_json(os.path.join(dossier_sym(q['p'], q['s']), 'rig.json')))
        if path == '/api/fichiers':
            d = dossier_sym(q['p'], q['s'])
            return self.json(sorted(f for f in os.listdir(d) if f.lower().endswith(IMG_EXT)))
        if path == '/api/historique':
            return self.json(historique(q['p'], q['s']))
        if path == '/api/version':
            if not NOM_OK.match(q.get('v', '').replace('-', '')):
                raise Erreur("version invalide")
            return self.fichier(os.path.join(HIST, q['p'], q['s'], f"{q['v']}__rig.json"))
        if path == '/api/recettes':
            return self.json(R.catalogue())
        if path == '/api/sons':
            p = projet(q['p'])
            d = os.path.join(p['abs'], p.get('audio', 'art/audio'))
            return self.json(sorted(os.path.splitext(f)[0] for f in os.listdir(d) if f.lower().endswith(SON_EXT)) if os.path.isdir(d) else [])
        if path == '/api/sources':
            p = projet(q['p'])
            d = os.path.join(p['abs'], p.get('sources', 'art/symbols'))
            return self.json(sorted(f for f in os.listdir(d) if f.lower().endswith(IMG_EXT)) if os.path.isdir(d) else [])
        if path == '/api/captures':
            os.makedirs(CAPT, exist_ok=True)
            return self.json(sorted(os.listdir(CAPT)))
        m = re.match(r'^/vignette/([\w\-]+)/([\w\-]+)\.webp$', path)
        if m:
            return self.fichier(vignette(m.group(1), m.group(2)))
        m = re.match(r'^/f/([\w\-]+)/([\w\-]+)/(.+)$', path)
        if m:
            f = os.path.basename(m.group(3))
            return self.fichier(os.path.join(dossier_sym(m.group(1), m.group(2), False), f))
        m = re.match(r'^/src/([\w\-]+)/(.+)$', path)
        if m:
            p = projet(m.group(1))
            return self.fichier(os.path.join(p['abs'], p.get('sources', 'art/symbols'), os.path.basename(m.group(2))))
        m = re.match(r'^/son/([\w\-]+)/(.+)$', path)
        if m:
            p = projet(m.group(1))
            d = os.path.join(p['abs'], p.get('audio', 'art/audio'))
            nom = os.path.basename(m.group(2))
            for ext in ('',) + SON_EXT:
                if os.path.isfile(os.path.join(d, nom + ext)):
                    return self.fichier(os.path.join(d, nom + ext))
            return self.json({'erreur': 'son introuvable'}, 404)
        m = re.match(r'^/captures/(.+)$', path)
        if m:
            return self.fichier(os.path.join(CAPT, os.path.basename(m.group(1))))
        # fichiers de l'outil (studio, claude, engine, vendor)
        if path.endswith('/'):
            path += 'index.html'
        full = os.path.normpath(os.path.join(ROOT, path.lstrip('/')))
        if not full.startswith(ROOT) or '/historique/' in full:
            return self.json({'erreur': 'interdit'}, 403)
        return self.fichier(full)

    def route_post(self):
        u = urlparse(self.path)
        q = {k: v[0] for k, v in parse_qs(u.query).items()}
        path = u.path
        if path == '/api/rig':
            d = dossier_sym(q['p'], q['s'])
            rig = self.corps_json()
            if not isinstance(rig, dict) or 'parts' not in rig or 'size' not in rig:
                raise Erreur("rig invalide")
            v = sauvegarde(q['p'], q['s'], 'rig.json', q.get('note', ''))
            ecrire_json(os.path.join(d, 'rig.json'), rig)
            return self.json({'ok': True, 'avant': v, 'modifie': os.path.getmtime(os.path.join(d, 'rig.json'))})
        if path == '/api/recette':
            b = self.corps_json()
            rig, info = R.appliquer(b['rig'], b.get('anim', 'idle'), b['recette'], b.get('params'), b.get('t0', 0), b.get('ctx'))
            return self.json({'rig': rig, 'info': info})
        if path == '/api/nouveau':
            return self.json(api_nouveau(self.corps_json()))
        if path == '/api/calques':
            return self.json(api_calques(self.corps_json()))
        if path == '/api/masque':
            png, bb = api_masque(self.corps_json())
            return self.json({'png': 'data:image/png;base64,' + base64.b64encode(png).decode(), 'boite': bb})
        if path == '/api/decoupe':
            return self.json(api_decoupe(self.corps_json()))
        if path == '/api/rogner':
            return self.json(api_rogner(self.corps_json()))
        if path == '/api/lueur':
            return self.json(api_lueur(self.corps_json()))
        if path == '/api/image':
            return self.json(api_image(self.corps_json()))
        if path == '/api/copier':
            return self.json(api_copier(self.corps_json()))
        if path == '/api/frame':
            dos = q.get('dossier', 'film')
            if not NOM_OK.match(dos):
                raise Erreur("dossier invalide")
            d = os.path.join(CAPT, '_images', dos)
            os.makedirs(d, exist_ok=True)
            raw = self.corps()
            if raw.startswith(b'data:'):
                raw = base64.b64decode(raw.split(b',', 1)[1])
            with open(os.path.join(d, f"{int(q.get('n', 0)):05d}.png"), 'wb') as f:
                f.write(raw)
            return self.json({'ok': True})
        if path == '/api/capture':
            nom = os.path.basename(q.get('nom') or f"capture-{horodatage()}.png")
            if not re.match(r'^[\w\-. ]+$', nom):
                raise Erreur("nom invalide")
            os.makedirs(CAPT, exist_ok=True)
            raw = self.corps()
            if raw.startswith(b'data:'):
                raw = base64.b64decode(raw.split(b',', 1)[1])
            with open(os.path.join(CAPT, nom), 'wb') as f:
                f.write(raw)
            return self.json({'ok': True, 'chemin': os.path.join(CAPT, nom)})
        if path == '/api/projets':
            b = self.corps_json()
            data = json.load(open(PROJ_FILE, encoding='utf-8'))
            if not NOM_OK.match(b.get('id', '')) or any(p['id'] == b['id'] for p in data['projets']):
                raise Erreur("identifiant de projet invalide ou déjà pris")
            if not os.path.isdir(b.get('dossier', '')):
                raise Erreur("dossier introuvable")
            data['projets'].append({'id': b['id'], 'nom': b.get('nom') or b['id'], 'dossier': b['dossier'],
                                    'rigs': b.get('rigs', 'art/symbols/rig'), 'sources': b.get('sources', 'art/symbols'),
                                    'audio': b.get('audio', 'art/audio')})
            ecrire_json(PROJ_FILE, data)
            return self.json({'ok': True})
        raise Erreur("route inconnue", 404)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4390
    os.makedirs(os.path.join(BASE, 'atelier', 'rigs'), exist_ok=True)
    print(f"RIG LAB sur http://127.0.0.1:{port}/studio/   (atelier de Claude : /claude/)")
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()


if __name__ == '__main__':
    main()
