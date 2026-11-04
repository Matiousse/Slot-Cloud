"""Courbes et lecture des pistes, identiques au moteur (engine/symbol-rig.js).

Sert aux recettes (lire la valeur d'une pièce à un instant pour poser une
anticipation ou un amorti) et aux contrôles côté Python.
"""
import math

C1 = 1.70158


def _back(c):
    return lambda p: 1 + (c + 1) * (p - 1) ** 3 + c * (p - 1) ** 2


def _bounce(p):
    n, d = 7.5625, 2.75
    if p < 1 / d:
        return n * p * p
    if p < 2 / d:
        p -= 1.5 / d
        return n * p * p + .75
    if p < 2.5 / d:
        p -= 2.25 / d
        return n * p * p + .9375
    p -= 2.625 / d
    return n * p * p + .984375


EASE = {
    'linear': lambda p: p,
    'step': lambda p: 0 if p < 1 else 1,
    'inQuad': lambda p: p * p,
    'outQuad': lambda p: 1 - (1 - p) * (1 - p),
    'inOutQuad': lambda p: 2 * p * p if p < .5 else 1 - (-2 * p + 2) ** 2 / 2,
    'inCubic': lambda p: p ** 3,
    'outCubic': lambda p: 1 - (1 - p) ** 3,
    'inOutCubic': lambda p: 4 * p ** 3 if p < .5 else 1 - (-2 * p + 2) ** 3 / 2,
    'inQuart': lambda p: p ** 4,
    'outQuart': lambda p: 1 - (1 - p) ** 4,
    'inOutSine': lambda p: -(math.cos(math.pi * p) - 1) / 2,
    'inBack': lambda p: 2.70158 * p ** 3 - 1.70158 * p * p,
    'outBack': _back(C1),
    'outBackBig': _back(2.6),
    'outElastic': lambda p: p if p in (0, 1) else 2 ** (-10 * p) * math.sin((p * 10 - .75) * (2 * math.pi / 3)) + 1,
    'outBounce': _bounce,
}

# Courbes « studio » (loi a : rien de linéaire)
ENTREE = [0.22, 1.4, 0.4, 1]        # dépasse de ~12 %
SORTIE = [0.4, 0, 1, 1]
IMPACT = [0.2, 1.8, 0.4, 1]         # dépasse fort
GLISSE = [0.12, 0.72, 0.12, 1]      # longue fin lente


def bezier(x1, y1, x2, y2):
    cx = 3 * x1
    bx = 3 * (x2 - x1) - cx
    ax = 1 - cx - bx
    cy = 3 * y1
    by = 3 * (y2 - y1) - cy
    ay = 1 - cy - by

    def X(s):
        return ((ax * s + bx) * s + cx) * s

    def Y(s):
        return ((ay * s + by) * s + cy) * s

    def dX(s):
        return (3 * ax * s + 2 * bx) * s + cx

    def f(p):
        s = p
        for _ in range(8):
            e = X(s) - p
            d = dX(s)
            if abs(e) < 1e-5 or abs(d) < 1e-6:
                break
            s -= e / d
        if s < 0 or s > 1:
            lo, hi, s = 0.0, 1.0, p
            for _ in range(30):
                if X(s) < p:
                    lo = s
                else:
                    hi = s
                s = (lo + hi) / 2
        return Y(s)
    return f


def ease_fn(e):
    if isinstance(e, (list, tuple)):
        return bezier(*e)
    return EASE.get(e, EASE['inOutQuad'])


def ease_of(k, prop):
    e = k.get('ease')
    if isinstance(e, dict):
        return e.get(prop, e.get('*'))
    return e


STEPPED = {'frame', 'z', 'visible'}
DEFAULTS = {'rot': 0, 'x': 0, 'y': 0, 'sx': 1, 'sy': 1, 'skx': 0, 'sky': 0, 'alpha': 1,
            'flash': 0, 'wig': 1, 'bend': 0, 'wave': 0, 'bulge': 0, 'bulge2': 0, 'bulge3': 0,
            'bulge4': 0, 'taper': 0}


def _hex(c):
    return c if isinstance(c, int) else int(str(c).lstrip('#'), 16)


def lire(track, prop, t):
    """Valeur d'une piste à t (ms), None si la propriété n'y est pas clée."""
    prev = None
    for k in track or []:
        if prop not in k:
            continue
        if k['t'] >= t:
            if prev is None:
                return k[prop]
            ez = ease_of(k, prop)
            if prop in STEPPED or ez == 'step':
                return k[prop] if k['t'] == t else prev[prop]
            p = max(0.0, min(1.0, (t - prev['t']) / max(1, k['t'] - prev['t'])))
            e = ease_fn(ez)(p)
            if prop == 'tint':
                a, b = _hex(prev[prop]), _hex(k[prop])
                ch = [round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * e) for s in (16, 8, 0)]
                return '#%02x%02x%02x' % tuple(ch)
            if prop == 'ffd':
                n = max(len(prev[prop]), len(k[prop]))
                return [(prev[prop][i] if i < len(prev[prop]) else 0) + ((k[prop][i] if i < len(k[prop]) else 0) - (prev[prop][i] if i < len(prev[prop]) else 0)) * e for i in range(n)]
            return prev[prop] + (k[prop] - prev[prop]) * e
        prev = k
    return prev[prop] if prev is not None else None


def valeur(rig, anim, part, prop, t):
    """Valeur effective (défaut si non clée)."""
    tr = rig.get('anims', {}).get(anim, {}).get('tracks', {}).get(part)
    v = lire(tr, prop, t)
    if v is None:
        return DEFAULTS.get(prop, 0)
    return v
