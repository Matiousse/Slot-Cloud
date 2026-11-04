"""RECETTES — les gestes d'animation « studio », prêts à poser.

Chaque recette écrit des clés dans une animation, pour une ou plusieurs
pièces, à partir de la tête de lecture. Elles appliquent les quatre lois
(rien de linéaire, rien de simultané, rien sans anticipation, rien ne
s'arrête net) avec les durées mesurées sur les studios (land 730 ms,
win 1370 ms, remove 330 ms).

Les mêmes recettes servent à l'éditeur (menu Recettes) et à Claude
(rl.py recette …).
"""
import copy
import math

from .courbes import DEFAULTS, ENTREE, GLISSE, IMPACT, SORTIE, lire, valeur

TRANSFORM = ('rot', 'x', 'y', 'sx', 'sy', 'skx', 'sky')
RECETTES = []


def k(t, **v):
    v['t'] = int(round(t))
    return v


def recette(id, nom, famille, desc, params, ideal=None, boucle=False):
    def deco(fn):
        RECETTES.append({'id': id, 'nom': nom, 'famille': famille, 'desc': desc,
                         'params': params, 'ideal': ideal, 'boucle': boucle, 'fn': fn})
        return fn
    return deco


def catalogue():
    return [{x: r[x] for x in r if x != 'fn'} for r in RECETTES]


# ------------------------------------------------------------------ écriture


def anim_de(rig, nom, dur=None, loop=None):
    a = rig.setdefault('anims', {}).get(nom)
    if a is None:
        a = rig['anims'][nom] = {'dur': int(dur or 1000), 'loop': bool(loop), 'tracks': {}}
    a.setdefault('tracks', {})
    return a


def ecrire(rig, anim, part, keys):
    """Pose des clés dans la piste d'une pièce. Dans la plage couverte par les
    nouvelles clés, les anciennes valeurs des MÊMES propriétés sont
    remplacées ; le reste de la piste est gardé."""
    if not keys:
        return
    a = anim_de(rig, anim)
    tr = a['tracks'].setdefault(part, [])
    props = set()
    for q in keys:
        props |= {p for p in q if p not in ('t', 'ease')}
    tmin, tmax = min(q['t'] for q in keys), max(q['t'] for q in keys)
    for e in tr:
        if tmin - .5 <= e['t'] <= tmax + .5:
            for p in props:
                e.pop(p, None)
                if isinstance(e.get('ease'), dict):
                    e['ease'].pop(p, None)
    tr[:] = [e for e in tr if any(p not in ('t', 'ease') for p in e)]
    for q in keys:
        e = next((x for x in tr if abs(x['t'] - q['t']) < .5), None)
        if e is None:
            tr.append(dict(q))
            continue
        autres = [p for p in e if p not in ('t', 'ease')]
        neuves = [p for p in q if p not in ('t', 'ease')]
        for p in neuves:
            e[p] = q[p]
        if not autres:
            if 'ease' in q:
                e['ease'] = q['ease']
            else:
                e.pop('ease', None)
            continue
        # la clé porte déjà d'autres propriétés : une courbe par propriété
        old = e.get('ease')
        if not isinstance(old, dict):
            old = {'*': old} if old is not None else {}
        for p in neuves:
            old[p] = q.get('ease', 'inOutQuad')
        if all(v == old.get('*') for p, v in old.items() if p != '*') and '*' in old:
            old = old['*']
        e['ease'] = old
    tr.sort(key=lambda x: x['t'])
    if tmax > a.get('dur', 0):
        a['dur'] = int(math.ceil(tmax))


def evenement(rig, anim, **ev):
    a = anim_de(rig, anim)
    evs = a.setdefault('events', [])
    if not any(abs(e['t'] - ev['t']) < 1 and e.get('name') == ev.get('name') and e.get('emit') == ev.get('emit') for e in evs):
        evs.append(ev)
    evs.sort(key=lambda e: e['t'])


def echelle(keys, f, t0=0):
    return [dict(q, t=int(round(t0 + (q['t'] - 0) * f))) for q in keys]


# ------------------------------------------------------------------ pièces


def noms(rig):
    return [p['name'] for p in rig['parts']]


def partie(rig, nom):
    return next((p for p in rig['parts'] if p['name'] == nom), None)


def racine(rig):
    for n in ('socle', 'root', 'racine'):
        if partie(rig, n):
            return n
    for p in rig['parts']:
        if not p.get('parent'):
            return p['name']
    return rig['parts'][0]['name']


def resoudre(rig, v, ctx, multi=False):
    """Traduit les valeurs spéciales : 'sel' (pièce choisie), 'racine',
    'corps', 'haut', 'lueurs', 'aucune'."""
    sel = [s for s in (ctx.get('sel') or []) if partie(rig, s)]
    if multi:
        if v in (None, '', 'sel'):
            return sel
        if v == 'lueurs':
            return [p['name'] for p in rig['parts'] if p.get('blend') == 'add']
        if isinstance(v, str):
            v = [x.strip() for x in v.split(',') if x.strip()]
        return [x for x in v if partie(rig, x)]
    if v in (None, '', 'aucune'):
        return None
    if v == 'sel':
        return sel[0] if sel else racine(rig)
    if v == 'racine':
        return racine(rig)
    if v in ('corps', 'haut'):
        if partie(rig, v):
            return v
        return None if v == 'haut' else (sel[0] if sel else racine(rig))
    return v if partie(rig, v) else None


def H(rig):
    return rig['size'][1]


# ------------------------------------------------------------------ paramètres

def P_piece(defaut='sel', nom='Pièce'):
    return {'id': 'piece', 'nom': nom, 'type': 'piece', 'defaut': defaut}


def P_ms(id, nom, defaut, mn=0, mx=5000, pas=10):
    return {'id': id, 'nom': nom, 'type': 'nombre', 'unite': 'ms', 'defaut': defaut, 'min': mn, 'max': mx, 'pas': pas}


def P_num(id, nom, defaut, mn, mx, pas, unite=''):
    return {'id': id, 'nom': nom, 'type': 'nombre', 'unite': unite, 'defaut': defaut, 'min': mn, 'max': mx, 'pas': pas}


# ================================================================== GESTES


@recette('pose', 'Arrivée écrasée', 'Gestes',
         "Le symbole tombe, s'écrase au choc (110 ms), rebondit en deux temps décroissants et se pose. Mesuré : 730 ms.",
         [P_piece('racine', 'Os du bas'), {'id': 'haut', 'nom': 'Os du haut', 'type': 'piece', 'defaut': 'haut'},
          P_num('chute', 'Chute', 7, 0, 30, .5, '% haut.'), P_num('ecrase', 'Écrasement', 13, 0, 30, .5, '%'),
          P_ms('duree', 'Durée', 730, 300, 2000)], ideal='land')
def r_pose(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'racine'), ctx)
    h = resoudre(rig, p.get('haut', 'haut'), ctx)
    f = p.get('duree', 730) / 730
    ch = H(rig) * p.get('chute', 7) / 100
    e = p.get('ecrase', 13) / 100
    ec = H(rig) * 0.095 * e / .13
    ecrire(rig, anim, b, echelle([
        k(0, y=-ch, sx=.97, sy=1.04), k(110, y=0, sx=1, sy=1, ease='inQuad'),
        k(170, sx=1 + e * .77, sy=1 - e, ease='outQuad'), k(320, sx=1 - e * .23, sy=1 + e * .3, ease='inOutQuad'),
        k(470, sx=1 + e * .08, sy=1 - e * .08), k(730, sx=1, sy=1, ease='outQuad')], f, t0))
    if h and h != b:
        ecrire(rig, anim, h, echelle([
            k(0, y=-ec * .3, sx=1), k(110, y=0, sx=1), k(190, y=ec, sx=1.09, ease='outQuad'),
            k(350, y=-ec * .32, sx=.97, ease='inOutQuad'), k(510, y=ec * .08, sx=1.01),
            k(730, y=0, sx=1, ease='outQuad')], f, t0))
    evenement(rig, anim, t=int(t0 + 110 * f), name='pose')
    return f"arrivée posée sur {b}" + (f" et {h}" if h and h != b else '')


@recette('gain', 'Gain qui explose', 'Gestes',
         "Anticipation (écrasement 120 ms), pop avec gros dépassement, tenue qui vit, retour. Mesuré : 1370 ms.",
         [P_piece('racine', 'Os du bas'), {'id': 'haut', 'nom': 'Os du haut', 'type': 'piece', 'defaut': 'haut'},
          {'id': 'flash', 'nom': 'Pièce qui s\'allume', 'type': 'piece', 'defaut': 'corps'},
          P_num('pop', 'Agrandissement', 12, 0, 40, .5, '%'), P_ms('duree', 'Durée', 1370, 600, 3000)], ideal='win')
def r_gain(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'racine'), ctx)
    h = resoudre(rig, p.get('haut', 'haut'), ctx)
    fl = resoudre(rig, p.get('flash', 'corps'), ctx)
    f = p.get('duree', 1370) / 1370
    pop = 1 + p.get('pop', 12) / 100
    ec = H(rig) * .095
    ecrire(rig, anim, b, echelle([
        k(0, sx=1, sy=1), k(120, sx=1.05, sy=.94, ease='outQuad'), k(290, sx=pop, sy=pop, ease='outBackBig'),
        k(1100, sx=pop - .02, sy=pop - .02), k(1370, sx=1, sy=1, ease='inOutCubic')], f, t0))
    if h and h != b:
        ecrire(rig, anim, h, echelle([
            k(0, y=0), k(120, y=ec * .55, ease='outQuad'), k(300, y=-ec * .5, ease=IMPACT),
            k(620, y=-ec * .12), k(1000, y=-ec * .2), k(1370, y=0, ease='inOutCubic')], f, t0))
    if fl:
        ecrire(rig, anim, fl, echelle([k(0, flash=0), k(290, flash=.35, ease='outQuad'), k(700, flash=.05), k(1370, flash=0)], f, t0))
    evenement(rig, anim, t=int(t0), name='gain')
    return f"gain posé sur {b}"


@recette('saut', 'Saut', 'Gestes',
         "S'écrase pour prendre son élan, s'étire en montant, flotte au sommet, s'étire en tombant, s'écrase à l'atterrissage, se pose.",
         [P_piece('racine'), P_num('hauteur', 'Hauteur', 12, 1, 60, .5, '% haut.'), P_ms('duree', 'Durée', 900, 400, 3000)])
def r_saut(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'racine'), ctx)
    f = p.get('duree', 900) / 900
    h = H(rig) * p.get('hauteur', 12) / 100
    ecrire(rig, anim, b, echelle([
        k(0, y=0, sx=1, sy=1), k(120, y=0, sx=1.12, sy=.86, ease='outQuad'),
        k(260, y=-h * .7, sx=.9, sy=1.12, ease='outCubic'), k(420, y=-h, sx=1, sy=1, ease='outQuad'),
        k(600, y=0, sx=.95, sy=1.06, ease='inQuad'), k(680, y=0, sx=1.14, sy=.86, ease='outQuad'),
        k(800, sx=.97, sy=1.03, ease='inOutQuad'), k(900, y=0, sx=1, sy=1, ease='outQuad')], f, t0))
    return f"saut posé sur {b}"


@recette('balancier', 'Balancier', 'Gestes',
         "Un élan à contresens, puis des oscillations qui s'éteignent (cloche, pendule, enseigne).",
         [P_piece('sel'), P_num('angle', 'Angle', 24, 1, 90, 1, '°'), P_num('oscillations', 'Oscillations', 4, 1, 10, 1),
          P_ms('duree', 'Durée', 1400, 300, 5000)])
def r_balancier(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'sel'), ctx)
    d = p.get('duree', 1400)
    A = math.radians(p.get('angle', 24))
    n = int(p.get('oscillations', 4))
    ks = [k(t0, rot=0), k(t0 + d * .1, rot=A * .3, ease='outQuad')]
    for i in range(n):
        t = t0 + d * (.1 + (i + 1) * .82 / (n + .5))
        ks.append(k(t, rot=(-1) ** (i + 1) * A * .62 ** i, ease='inOutSine'))
    ks.append(k(t0 + d, rot=0, ease='outQuad'))
    ecrire(rig, anim, b, ks)
    return f"balancier sur {b}"


@recette('secousse', 'Secousse', 'Gestes',
         "Tremblement qui s'amortit (impact, colère, choc).",
         [P_piece('racine'), P_num('force', 'Force', 1.5, .1, 10, .1, '% haut.'), P_num('freq', 'Fréquence', 22, 4, 40, 1, 'Hz'),
          P_ms('duree', 'Durée', 420, 100, 3000)])
def r_secousse(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'racine'), ctx)
    d = p.get('duree', 420)
    F = H(rig) * p.get('force', 1.5) / 100
    per = 1000 / p.get('freq', 22) / 2
    n = max(2, int(d / per))
    ks = [k(t0, x=0, rot=0)]
    for i in range(1, n):
        u = i / n
        a = (1 - u) ** 1.5
        s = 1 if i % 2 else -1
        ks.append(k(t0 + i * per, x=s * F * a, rot=-s * .03 * a, ease='inOutSine'))
    ks.append(k(t0 + d, x=0, rot=0, ease='outQuad'))
    ecrire(rig, anim, b, ks)
    return f"secousse sur {b}"


@recette('piece-tourne', 'Pièce qui tourne', 'Gestes',
         "Rotation sur elle-même comme une pièce de monnaie (l'échelle x passe par zéro).",
         [P_piece('sel'), P_num('tours', 'Tours', 1, 1, 6, 1), P_ms('duree', 'Durée', 800, 200, 4000)])
def r_piece_tourne(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'sel'), ctx)
    n = int(p.get('tours', 1))
    d = p.get('duree', 800)
    # 1 → -1 → 1 en inOutSine : c'est exactement un cosinus (le plus rapide
    # quand la pièce est vue par la tranche, comme une vraie pièce)
    ks = [k(t0, sx=1)] + [k(t0 + d * i / (2 * n), sx=-1 if i % 2 else 1, ease='inOutSine') for i in range(1, 2 * n + 1)]
    ecrire(rig, anim, b, ks)
    return f"{n} tour(s) sur {b}"


# ================================================================== BOUCLES


def _boucle(rig, anim, dur):
    a = anim_de(rig, anim, dur, True)
    a['loop'] = True
    a['dur'] = int(dur)


@recette('respiration', 'Respiration', 'Boucles',
         "Le symbole respire au repos : jamais figé, jamais agité. Boucle parfaite (clés identiques au début et à la fin).",
         [P_piece('haut'), P_num('ampleur', 'Ampleur', 1.2, .1, 6, .1, '%'), P_ms('duree', 'Durée', 2800, 800, 8000)],
         ideal='idle', boucle=True)
def r_respiration(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'haut'), ctx)
    d = p.get('duree', 2800)
    a = p.get('ampleur', 1.2) / 100
    _boucle(rig, anim, d)
    ecrire(rig, anim, b, [k(0, y=0, sx=1), k(d / 2, y=-H(rig) * a * .67, sx=1 + a, ease='inOutSine'),
                          k(d, y=0, sx=1, ease='inOutSine')])
    return f"respiration sur {b} ({d} ms)"


@recette('flottement', 'Flottement', 'Boucles',
         "Monte et descend doucement en se balançant (objet magique, fantôme, lueur).",
         [P_piece('racine'), P_num('hauteur', 'Hauteur', 2, .2, 10, .1, '% haut.'), P_num('angle', 'Balancement', 1.5, 0, 10, .1, '°'),
          P_ms('duree', 'Durée', 3000, 800, 8000)], ideal='idle', boucle=True)
def r_flottement(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'racine'), ctx)
    d = p.get('duree', 3000)
    A = H(rig) * p.get('hauteur', 2) / 100
    r = math.radians(p.get('angle', 1.5))
    _boucle(rig, anim, d)
    ecrire(rig, anim, b, [k(0, y=0), k(d / 2, y=-A, ease='inOutSine'), k(d, y=0, ease='inOutSine')])
    ecrire(rig, anim, b, [k(0, rot=0), k(d / 4, rot=r, ease='inOutSine'), k(3 * d / 4, rot=-r, ease='inOutSine'),
                          k(d, rot=0, ease='inOutSine')])
    return f"flottement sur {b}"


@recette('battement', 'Battement de cœur', 'Boucles',
         "Double pulsation (boum-boum) puis repos. Pour une gemme, un cœur, un orbe.",
         [P_piece('sel'), P_num('force', 'Force', 8, 1, 30, .5, '%'), P_ms('duree', 'Durée', 1100, 500, 4000)], boucle=True)
def r_battement(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'sel'), ctx)
    d = p.get('duree', 1100)
    f = p.get('force', 8) / 100
    _boucle(rig, anim, d)
    ecrire(rig, anim, b, [k(0, sx=1, sy=1), k(90, sx=1 + f, sy=1 + f, ease='outQuad'), k(200, sx=1, sy=1, ease='inQuad'),
                          k(300, sx=1 + f * .6, sy=1 + f * .6, ease='outQuad'), k(450, sx=1, sy=1, ease='inOutQuad'),
                          k(d, sx=1, sy=1)])
    return f"battement sur {b}"


@recette('lueur', 'Lueur qui respire', 'Boucles',
         "L'opacité d'une lueur monte et descend en boucle.",
         [{'id': 'pieces', 'nom': 'Lueurs', 'type': 'pieces', 'defaut': 'lueurs'},
          P_num('min', 'Minimum', 20, 0, 100, 1, '%'), P_num('max', 'Maximum', 60, 0, 100, 1, '%'),
          P_ms('duree', 'Durée', 2800, 500, 8000)], ideal='idle', boucle=True)
def r_lueur(rig, anim, t0, p, ctx):
    ps = resoudre(rig, p.get('pieces', 'lueurs'), ctx, multi=True)
    d = p.get('duree', 2800)
    a, b = p.get('min', 20) / 100, p.get('max', 60) / 100
    _boucle(rig, anim, d)
    for i, n in enumerate(ps):
        ecrire(rig, anim, n, [k(0, alpha=a), k(d / 2, alpha=b, ease='inOutSine'), k(d, alpha=a, ease='inOutSine')])
    return f"lueur sur {', '.join(ps) or 'aucune pièce'}"


@recette('tension', 'Tension', 'Boucles',
         "Micro-tremblement nerveux qui tient la pose (anticipation d'un bonus).",
         [P_piece('racine'), P_num('force', 'Force', .6, .1, 4, .1, '% haut.'), P_ms('duree', 'Durée', 600, 200, 3000)], boucle=True)
def r_tension(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'racine'), ctx)
    d = p.get('duree', 600)
    F = H(rig) * p.get('force', .6) / 100
    motif = [(0, 0, 0), (.11, 1, -.4), (.23, -.7, .8), (.36, .9, .3), (.5, -1, -.6), (.61, .5, .9), (.74, -.8, -.2), (.87, .6, .5), (1, 0, 0)]
    _boucle(rig, anim, d)
    ecrire(rig, anim, b, [k(u * d, x=F * x, y=F * y * .5, ease='inOutSine') for u, x, y in motif])
    return f"tension sur {b}"


# ================================================================== EFFETS


@recette('reflet', 'Reflet qui balaie', 'Effets',
         "Une bande de lumière traverse la pièce, seulement sur ses pixels (or, gemme, métal). Demande le moteur v3 dans le jeu.",
         [P_piece('corps'), P_ms('duree', 'Durée', 650, 200, 3000), P_num('angle', 'Angle', 20, -80, 80, 1, '°'),
          P_num('largeur', 'Largeur', 16, 4, 50, 1, '%'), P_num('force', 'Force', 85, 10, 100, 1, '%'),
          {'id': 'couleur', 'nom': 'Couleur', 'type': 'couleur', 'defaut': '#fff4d6'}])
def r_reflet(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'corps'), ctx)
    pt = partie(rig, b)
    pt['shine'] = {'angle': p.get('angle', 20), 'width': p.get('largeur', 16) / 100,
                   'strength': p.get('force', 85) / 100, 'color': p.get('couleur', '#fff4d6')}
    d = p.get('duree', 650)
    ecrire(rig, anim, b, [k(t0, shine=0), k(t0 + d, shine=1, ease=GLISSE)])
    return f"reflet sur {b}"


@recette('eclat', 'Éclat', 'Effets',
         "Flash bref et petit pop : le moment où quelque chose se déclenche.",
         [P_piece('corps'), P_num('force', 'Force', 50, 5, 100, 1, '%'), P_ms('duree', 'Durée', 450, 150, 2000)])
def r_eclat(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'corps'), ctx)
    d = p.get('duree', 450)
    f = p.get('force', 50) / 100
    ecrire(rig, anim, b, [k(t0, flash=0), k(t0 + d * .22, flash=f, ease='outQuad'), k(t0 + d, flash=0, ease='inOutQuad')])
    return f"éclat sur {b}"


@recette('disparition', 'Disparition', 'Gestes',
         "Petit pop qui s'allume puis rétrécit et s'efface. Mesuré : 330 ms.",
         [P_piece('racine'), {'id': 'flash', 'nom': 'Pièce qui s\'allume', 'type': 'piece', 'defaut': 'corps'},
          P_ms('duree', 'Durée', 330, 150, 1500)], ideal='remove')
def r_disparition(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'racine'), ctx)
    fl = resoudre(rig, p.get('flash', 'corps'), ctx)
    f = p.get('duree', 330) / 330
    ecrire(rig, anim, b, echelle([k(0, sx=1, sy=1, alpha=1), k(90, sx=1.12, sy=1.12, ease='outQuad'),
                                  k(330, sx=.15, sy=.15, alpha=0, ease='inCubic')], f, t0))
    if fl and fl != b:
        ecrire(rig, anim, fl, echelle([k(0, flash=0), k(90, flash=.8, ease='outQuad'), k(250, flash=.2)], f, t0))
    return f"disparition sur {b}"


@recette('vague', 'Vague', 'Effets',
         "Les pièces gonflent l'une après l'autre (lettres d'un WILD, gemmes d'une couronne). Décalage de 30 à 60 ms : jamais ensemble.",
         [{'id': 'pieces', 'nom': 'Pièces (dans l\'ordre)', 'type': 'pieces', 'defaut': 'sel'},
          P_ms('decalage', 'Décalage', 45, 10, 300), P_num('echelle', 'Gonflement', 22, 2, 60, 1, '%'),
          P_ms('montee', 'Montée', 160, 40, 800), P_ms('descente', 'Descente', 260, 40, 1200),
          {'id': 'flash', 'nom': 'Flash', 'type': 'nombre', 'unite': '%', 'defaut': 30, 'min': 0, 'max': 100, 'pas': 1}])
def r_vague(rig, anim, t0, p, ctx):
    ps = resoudre(rig, p.get('pieces', 'sel'), ctx, multi=True)
    s = 1 + p.get('echelle', 22) / 100
    m, dsc, dec = p.get('montee', 160), p.get('descente', 260), p.get('decalage', 45)
    fl = p.get('flash', 30) / 100
    for i, n in enumerate(ps):
        t = t0 + i * dec
        ks = [k(t, sx=1, sy=1), k(t + m, sx=s, sy=s, ease=IMPACT), k(t + m + dsc, sx=1, sy=1, ease='outQuad')]
        if fl:
            for q, v in zip(ks, (0, fl, 0)):
                q['flash'] = v
        ecrire(rig, anim, n, ks)
    return f"vague sur {len(ps)} pièce(s)"


# ================================================================== OUTILS STUDIO


def _num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


@recette('anticipation', 'Anticipation', 'Outils studio',
         "Avant le prochain mouvement de la pièce, un petit recul dans l'autre sens (80 à 120 ms). C'est ce qui donne le poids.",
         [P_piece('sel'), P_ms('avance', 'Durée du recul', 100, 40, 400), P_num('force', 'Force', 25, 5, 80, 1, '%')])
def r_anticipation(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'sel'), ctx)
    tr = anim_de(rig, anim)['tracks'].get(b) or []
    nxt = next((q for q in tr if q['t'] > t0 + 1 and any(x in q for x in TRANSFORM)), None)
    if not nxt:
        return f"aucun mouvement après {int(t0)} ms sur {b}"
    a = min(p.get('avance', 100), (nxt['t'] - t0) * .45)
    f = p.get('force', 25) / 100
    k0, k1 = k(t0), k(t0 + a, ease='outQuad')
    for x in TRANSFORM:
        if x in nxt and _num(nxt[x]):
            v0 = valeur(rig, anim, b, x, t0)
            dv = nxt[x] - v0
            if abs(dv) < 1e-4:
                continue
            k0[x] = v0
            k1[x] = v0 - dv * f
    if len(k1) <= 2:
        return "rien à anticiper"
    ecrire(rig, anim, b, [k0, k1])
    # l'arrivée part avec une entrée qui dépasse un peu
    q = next(q for q in anim_de(rig, anim)['tracks'][b] if abs(q['t'] - nxt['t']) < .5)
    if 'ease' not in q:
        q['ease'] = ENTREE
    return f"anticipation de {int(a)} ms avant {nxt['t']} ms sur {b}"


@recette('amorti', 'Amorti', 'Outils studio',
         "La pièce dépasse sa position d'arrivée (8 à 14 %), revient avec un rebond de 4 %, puis se stabilise. Rien ne s'arrête net.",
         [P_piece('sel'), P_num('depasse', 'Dépassement', 12, 2, 40, 1, '%'), P_ms('retour', 'Retour', 90, 30, 400),
          P_ms('stabilise', 'Stabilisation', 60, 20, 400)])
def r_amorti(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'sel'), ctx)
    tr = anim_de(rig, anim)['tracks'].get(b) or []
    arr = None
    for q in tr:  # la clé d'arrivée : celle sous la tête de lecture, sinon la précédente
        if q['t'] <= t0 + 1 and any(x in q for x in TRANSFORM):
            arr = q
    if not arr:
        return f"pas de clé d'arrivée avant {int(t0)} ms sur {b}"
    os_ = p.get('depasse', 12) / 100
    r1, r2 = p.get('retour', 90), p.get('stabilise', 60)
    ka, kr, ks_ = k(arr['t'], ease=arr.get('ease', ENTREE)), k(arr['t'] + r1, ease='inOutQuad'), k(arr['t'] + r1 + r2, ease='outQuad')
    for x in TRANSFORM:
        if x in arr and _num(arr[x]):
            v1 = arr[x]
            v0 = valeur(rig, anim, b, x, arr['t'] - 1) if arr['t'] > 0 else v1
            prev = [q for q in tr if q['t'] < arr['t'] and x in q]
            if prev:
                v0 = prev[-1][x]
            dv = v1 - v0
            if abs(dv) < 1e-4:
                continue
            ka[x] = v1 + dv * os_
            kr[x] = v1 - dv * os_ * .33
            ks_[x] = v1
    if len(ka) <= 2:
        return "rien à amortir"
    if isinstance(ka['ease'], dict):
        ka['ease'] = ENTREE
    ecrire(rig, anim, b, [ka, kr, ks_])
    return f"amorti après {arr['t']} ms sur {b}"


@recette('decaler', 'Décaler (chevauchement)', 'Outils studio',
         "Décale les clés des pièces choisies de quelques dizaines de ms chacune : ce qui part ensemble paraît mécanique.",
         [{'id': 'pieces', 'nom': 'Pièces (dans l\'ordre)', 'type': 'pieces', 'defaut': 'sel'}, P_ms('pas', 'Décalage par pièce', 40, 5, 300)])
def r_decaler(rig, anim, t0, p, ctx):
    ps = resoudre(rig, p.get('pieces', 'sel'), ctx, multi=True)
    a = anim_de(rig, anim)
    pas = p.get('pas', 40)
    for i, n in enumerate(ps):
        tr = a['tracks'].get(n) or []
        for q in tr:
            if q['t'] >= t0 and q['t'] > 0:
                q['t'] = int(min(a['dur'], q['t'] + i * pas))
        # deux clés au même instant : on fusionne (la plus tardive gagne)
        fus = {}
        for q in sorted(tr, key=lambda x: x['t']):
            fus.setdefault(q['t'], {}).update(q)
        a['tracks'][n] = [fus[t] for t in sorted(fus)]
    return f"{len(ps)} pièce(s) décalée(s) de {pas} ms chacune"


@recette('fermer-boucle', 'Fermer la boucle', 'Outils studio',
         "Recopie la valeur du début à la fin pour chaque propriété animée : la boucle se referme sans saut.",
         [])
def r_fermer(rig, anim, t0, p, ctx):
    a = anim_de(rig, anim)
    d = a['dur']
    n = 0
    for part, tr in a.get('tracks', {}).items():
        props = {x for q in tr for x in q if x not in ('t', 'ease')}
        for x in props:
            v0 = lire(tr, x, 0)
            if v0 is None:
                continue
            last = [q for q in tr if x in q][-1]
            if last['t'] >= d - .5 and last[x] == v0:
                continue
            ecrire(rig, anim, part, [k(d, **{x: copy.deepcopy(v0)}, ease='inOutSine')])
            n += 1
    a['loop'] = True
    return f"boucle fermée ({n} propriété(s) recalée(s))"


@recette('duree', 'Changer la durée', 'Outils studio',
         "Étire ou resserre toute l'animation (clés et événements) à la nouvelle durée.",
         [P_ms('duree', 'Nouvelle durée', 1000, 50, 20000)])
def r_duree(rig, anim, t0, p, ctx):
    a = anim_de(rig, anim)
    f = p.get('duree', 1000) / max(1, a['dur'])
    for tr in a.get('tracks', {}).values():
        for q in tr:
            q['t'] = int(round(q['t'] * f))
    for e in a.get('events', []):
        e['t'] = int(round(e['t'] * f))
    a['dur'] = int(p.get('duree', 1000))
    return f"durée : {a['dur']} ms (×{f:.2f})"


# ================================================================== PACKS


@recette('symbole-complet', 'Symbole complet', 'Packs',
         "Les cinq états d'un symbole de slot d'un coup : repos (boucle), arrivée 730 ms, gain 1370 ms, disparition 330 ms, éclat (piste 1). Remplace ces animations.",
         [P_piece('racine', 'Os du bas'), {'id': 'haut', 'nom': 'Os du haut', 'type': 'piece', 'defaut': 'haut'},
          {'id': 'corps', 'nom': 'Corps (flash)', 'type': 'piece', 'defaut': 'corps'},
          P_num('pop', 'Gain : agrandissement', 12, 0, 40, .5, '%'), P_ms('repos', 'Durée du repos', 2800, 1000, 6000)])
def r_symbole(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'racine'), ctx)
    h = resoudre(rig, p.get('haut', 'haut'), ctx) or b
    c = resoudre(rig, p.get('corps', 'corps'), ctx)
    for n in ('idle', 'land', 'win', 'remove', 'eclat'):
        rig.setdefault('anims', {}).pop(n, None)
    anim_de(rig, 'idle', p.get('repos', 2800), True)
    anim_de(rig, 'land', 730)
    anim_de(rig, 'win', 1370)
    anim_de(rig, 'remove', 330)
    anim_de(rig, 'eclat', 600)
    r_respiration(rig, 'idle', 0, {'piece': h, 'duree': p.get('repos', 2800), 'ampleur': 1.2}, ctx)
    r_pose(rig, 'land', 0, {'piece': b, 'haut': h if h != b else 'aucune'}, ctx)
    r_gain(rig, 'win', 0, {'piece': b, 'haut': h if h != b else 'aucune', 'flash': c or 'aucune', 'pop': p.get('pop', 12)}, ctx)
    r_disparition(rig, 'remove', 0, {'piece': b, 'flash': c or 'aucune'}, ctx)
    if c:
        ecrire(rig, 'eclat', c, [k(0, flash=0), k(120, flash=.45, ease='outQuad'), k(600, flash=0)])
    # les lueurs restent à leur niveau de repos, respirent au repos et s'allument au gain
    lueurs = [q['name'] for q in rig['parts'] if q.get('blend') == 'add']
    if lueurs:
        r_lueur(rig, 'idle', 0, {'pieces': lueurs, 'min': 15, 'max': 35, 'duree': p.get('repos', 2800)}, ctx)
        for g in lueurs:
            ecrire(rig, 'land', g, [k(0, alpha=.2), k(150, alpha=.8, ease='outQuad'), k(730, alpha=.2)])
            ecrire(rig, 'win', g, [k(0, alpha=.2), k(300, alpha=1, ease='outQuad'), k(1000, alpha=.8), k(1370, alpha=.2)])
            ecrire(rig, 'remove', g, [k(0, alpha=.3), k(90, alpha=1), k(330, alpha=0)])
    rig['mix'] = rig.get('mix', 140)
    return "repos, arrivée, gain, disparition et éclat créés"


# ================================================================== PERSONNAGE (niveau Cybersaurus, 14/10/2026)
# Valeurs relevées image par image dans les symboles Spine de Cybersaurus (Paperclip) : land 667 ms porté par le
# CORPS (le holder ne bouge pas, les pieds restent plantés), win en double pic d'échelle, un os pilote qui entraîne
# tête / épaules / bras par fractions dégressives, des chaînes décalées de 33 à 100 ms, des séquences d'effets
# démarrées en cours de route. Rotations en radians, positions en pixels de l'image (y vers le bas).

D2R = math.pi / 180


def _chaine(rig, anim, pieces, t0, f, motif, pas, croissance, depart=0):
    """Pose le même motif de rotation sur une chaîne de pièces, chacune décalée de `pas` ms et plus ample de
    `croissance` (une queue, une mèche, une antenne : le bout part en dernier et va plus loin)."""
    D = motif[-1][0] * f
    for i, n in enumerate(pieces):
        a = (1 + croissance) ** i
        r = min(depart + i * pas, D * .4)
        # le bout part plus tard mais finit en même temps : l'animation garde sa durée
        ecrire(rig, anim, n, [k(t0 + r + u * f * (D - r) / D if D else t0, rot=v * a * D2R, ease=e) for u, v, e in motif])


def _fraction(p, j):
    return round(max(.1, p.get('premier', .9) - j * p.get('baisse', .2)), 3)


@recette('pilote', 'Os pilote', 'Personnage',
         "Crée un os pilote et des contraintes « transform » : les pièces suivent son mouvement par fractions dégressives "
         "(Cybersaurus : tête 0.9, épaules 0.7, bras 0.5, 0.3). On anime UN os, tout le haut du corps se décale tout seul. "
         "IMPORTANT : entraîner l'os du HAUT DU CORPS sur lequel la peau du torse est pondérée (torse-haut), pas la tête ni "
         "un bras posés dessus, sinon ils se décollent du corps.",
         [{'id': 'pieces', 'nom': 'Pièces entraînées (de la plus liée à la moins liée)', 'type': 'pieces', 'defaut': 'sel'},
          P_num('premier', 'Fraction de la première', .9, .1, 1, .05), P_num('baisse', 'Baisse par pièce', .2, 0, .5, .05),
          P_num('rotation', 'Suit aussi la rotation', 0, 0, 1, .05)])
def r_pilote(rig, anim, t0, p, ctx):
    ps = resoudre(rig, p.get('pieces', 'sel'), ctx, multi=True)
    if not ps:
        return "aucune pièce choisie"
    nom, i = 'pilote', 2
    while partie(rig, nom) and not partie(rig, nom).get('pilote'):
        nom, i = f'pilote{i}', i + 1
    p0 = partie(rig, ps[0])
    if not partie(rig, nom):
        neuf = {'name': nom, 'pivot': list(p0['pivot']), 'pilote': True}
        if p0.get('parent'):
            neuf['parent'] = p0['parent']
        rig['parts'].insert(rig['parts'].index(p0), neuf)
    cs = [c for c in rig.get('constraints', []) if not (c.get('type') == 'transform' and c.get('cible') == nom)]
    for j, n in enumerate(ps):
        fr = _fraction(p, j)
        c = {'type': 'transform', 'nom': nom + '-' + n, 'part': n, 'cible': nom, 'x': fr, 'y': fr}
        if p.get('rotation'):
            c['rot'] = round(fr * p['rotation'], 3)
        cs.append(c)
    rig['constraints'] = cs
    return "os « %s » : %s" % (nom, ', '.join('%s %.2f' % (n, _fraction(p, j)) for j, n in enumerate(ps)))


@recette('arrivee-perso', "Arrivée d'un personnage", 'Personnage',
         "Le corps s'étire, s'écrase puis rebondit (×1.05 → ×0.91 → ×1.05) pendant que la tête, le pilote et les chaînes "
         "suivent avec 33 à 100 ms de retard. Le holder ne bouge pas : les pieds restent plantés. Mesuré : 667 ms.",
         [{'id': 'corps', 'nom': 'Corps', 'type': 'piece', 'defaut': 'corps'}, {'id': 'tete', 'nom': 'Tête', 'type': 'piece', 'defaut': 'aucune'},
          {'id': 'pilote', 'nom': 'Os pilote', 'type': 'piece', 'defaut': 'aucune'},
          {'id': 'chaine', 'nom': 'Chaîne (queue, bras… du début au bout)', 'type': 'pieces', 'defaut': ''},
          P_num('force', 'Force', 100, 20, 200, 5, '%'), P_ms('pas', 'Décalage dans la chaîne', 40, 10, 150),
          P_ms('duree', 'Durée', 667, 300, 1500)], ideal='land')
def r_arrivee_perso(rig, anim, t0, p, ctx):
    c = resoudre(rig, p.get('corps', 'corps'), ctx)
    te = resoudre(rig, p.get('tete'), ctx)
    pi = resoudre(rig, p.get('pilote'), ctx)
    ch = resoudre(rig, p.get('chaine'), ctx, multi=True) if p.get('chaine') else []
    f = p.get('duree', 667) / 667
    F = p.get('force', 100) / 100
    h = H(rig)

    def s(v):
        return 1 + (v - 1) * F
    if c:
        ecrire(rig, anim, c, echelle([
            k(0, sx=1, sy=1, rot=0, y=0), k(133, sx=s(.97), sy=s(1.05), rot=5.8 * D2R * F, y=-h * .02 * F, ease=ENTREE),
            k(267, sx=s(1.06), sy=s(.91), ease='inOutQuad'), k(367, rot=-7.8 * D2R * F, ease='inOutQuad'),
            k(433, y=-h * .015 * F, ease='inOutQuad'), k(500, sx=s(.98), sy=s(1.05), ease='inOutQuad'),
            k(667, sx=1, sy=1, rot=0, y=0, ease='outQuad')], f, t0))
    if te:
        ecrire(rig, anim, te, echelle([k(0, rot=0, skx=0), k(233, rot=8.9 * D2R * F, skx=.15 * F, ease='inOutQuad'),
                                       k(500, rot=-4.7 * D2R * F, skx=-.14 * F, ease='inOutQuad'), k(667, rot=0, skx=0, ease='outQuad')], f, t0))
    if pi:
        ecrire(rig, anim, pi, echelle([k(0, y=0), k(200, y=-h * .02 * F, ease='inOutQuad'), k(433, y=h * .025 * F, ease='inOutQuad'),
                                       k(667, y=0, ease='outQuad')], f, t0))
    if ch:
        _chaine(rig, anim, ch, t0, f, [(0, 0, 'inOutQuad'), (200, 14.5 * F, ENTREE), (433, 2.4 * F, 'inOutQuad'), (667, 0, 'outQuad')],
                p.get('pas', 40) * f, .15, p.get('pas', 40) * f)
    evenement(rig, anim, t=int(t0), name='pose')
    return "arrivée sur %s" % c + (", tête %s" % te if te else '') + (", pilote %s" % pi if pi else '') + (", chaîne de %d" % len(ch) if ch else '')


@recette('gain-perso', "Gain d'un personnage", 'Personnage',
         "Mini-anticipation (33 ms), premier pic d'échelle (×1.2 à 100 ms), montée lente jusqu'au second pic (×1.28 à 533 ms), "
         "retour sec en 134 ms. Le cadre a son propre pic, la tête plonge, la mâchoire s'ouvre, la chaîne fouette. Mesuré : 667 ms.",
         [P_piece('racine', 'Holder (tout le symbole)'), {'id': 'cadre', 'nom': 'Cadre', 'type': 'piece', 'defaut': 'aucune'},
          {'id': 'corps', 'nom': 'Corps', 'type': 'piece', 'defaut': 'corps'}, {'id': 'tete', 'nom': 'Tête', 'type': 'piece', 'defaut': 'aucune'},
          {'id': 'machoire', 'nom': 'Mâchoire', 'type': 'piece', 'defaut': 'aucune'}, {'id': 'pilote', 'nom': 'Os pilote', 'type': 'piece', 'defaut': 'aucune'},
          {'id': 'chaine', 'nom': 'Chaîne (queue…)', 'type': 'pieces', 'defaut': ''},
          {'id': 'flash', 'nom': 'Lueur du cadre (additive)', 'type': 'piece', 'defaut': 'aucune'},
          P_num('pic1', 'Premier pic', 20, 0, 50, 1, '%'), P_num('pic2', 'Second pic', 28, 0, 60, 1, '%'),
          P_ms('duree', 'Durée', 667, 400, 2000)], ideal='win')
def r_gain_perso(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'racine'), ctx)
    ca, co, te, ma, pi, fl = (resoudre(rig, p.get(x), ctx) for x in ('cadre', 'corps', 'tete', 'machoire', 'pilote', 'flash'))
    ch = resoudre(rig, p.get('chaine'), ctx, multi=True) if p.get('chaine') else []
    f = p.get('duree', 667) / 667
    p1, p2 = 1 + p.get('pic1', 20) / 100, 1 + p.get('pic2', 28) / 100
    h = H(rig)
    ecrire(rig, anim, b, echelle([k(0, sx=1, sy=1), k(100, sx=p1, sy=p1, ease='outCubic'), k(300, sx=p1 - .02, sy=p1 - .02, ease='inOutQuad'),
                                  k(533, sx=p2, sy=p2, ease='inOutQuad'), k(667, sx=1, sy=1, ease='inOutCubic')], f, t0))
    if ca and ca != b:
        ecrire(rig, anim, ca, echelle([k(0, sx=1, sy=1), k(100, sx=1.03, sy=1.03, ease='outQuad'), k(367, sx=1.08, sy=1.08, ease='inOutQuad'),
                                       k(533, sx=1.06, sy=1.06, ease='inOutQuad'), k(667, sx=1, sy=1, ease='inOutCubic')], f, t0))
    if co:
        ecrire(rig, anim, co, echelle([k(0, rot=0, y=0), k(33, rot=6.7 * D2R, ease='outQuad'), k(283, rot=-1.4 * D2R, y=-h * .025, ease=ENTREE),
                                       k(533, rot=0, y=-h * .015, ease='inOutQuad'), k(667, rot=0, y=0, ease='inOutCubic')], f, t0))
    if pi:
        ecrire(rig, anim, pi, echelle([k(0, y=0), k(50, y=h * .02, ease='outQuad'), k(333, y=-h * .03, ease=ENTREE),
                                       k(667, y=0, ease='inOutCubic')], f, t0))
    if te:
        ecrire(rig, anim, te, echelle([k(0, rot=0, skx=0), k(117, rot=-9.7 * D2R, skx=-.1, ease=IMPACT), k(500, rot=-6 * D2R, skx=-.05, ease='inOutQuad'),
                                       k(667, rot=0, skx=0, ease='inOutCubic')], f, t0))
    if ma:
        ecrire(rig, anim, ma, echelle([k(0, rot=0), k(133, rot=19 * D2R, ease=IMPACT), k(533, rot=16 * D2R, ease='inOutQuad'),
                                       k(667, rot=0, ease='inOutCubic')], f, t0))
    if ch:
        _chaine(rig, anim, ch, t0, f, [(0, 0, 'inOutQuad'), (33, 22, 'outQuad'), (233, -8, 'inOutQuad'), (450, 4, 'inOutQuad'), (667, 0, 'outQuad')],
                33 * f, .1, 50 * f)
    if fl:
        ecrire(rig, anim, fl, echelle([k(0, alpha=0), k(100, alpha=.61, ease='outQuad'), k(533, alpha=.5, ease='inOutQuad'),
                                       k(667, alpha=0, ease='inQuad')], f, t0))
    evenement(rig, anim, t=int(t0), name='gain')
    return "gain sur %s (pics ×%.2f puis ×%.2f)" % (b, p1, p2)


def _ease_de(q, prop):
    e = q.get('ease')
    if isinstance(e, dict):
        return e.get(prop, e.get('*', 'inOutQuad'))
    return e if e is not None else 'inOutQuad'


@recette('fouet', 'Fouet (chaîne décalée)', 'Personnage',
         "Recopie la rotation de la première pièce sur les suivantes, chacune plus tard et plus ample : une queue, une mèche, "
         "des doigts. Fonctionne aussi en boucle (le décalage fait le tour). Cybersaurus : 33 à 100 ms par os.",
         [{'id': 'pieces', 'nom': 'Chaîne (du début au bout)', 'type': 'pieces', 'defaut': 'sel'},
          P_ms('pas', 'Décalage par os', 67, 10, 300), P_num('croissance', 'Amplitude en plus par os', 15, -50, 100, 5, '%')])
def r_fouet(rig, anim, t0, p, ctx):
    ps = resoudre(rig, p.get('pieces', 'sel'), ctx, multi=True)
    if len(ps) < 2:
        return "il faut au moins deux pièces"
    a = anim_de(rig, anim)
    src = [q for q in a['tracks'].get(ps[0], []) if 'rot' in q]
    if len(src) < 2:
        return "%s n'a pas de rotation clée à recopier" % ps[0]
    d, boucle = a['dur'], a.get('loop')
    for i, n in enumerate(ps[1:], 1):
        dec, amp = p.get('pas', 67) * i, (1 + p.get('croissance', 15) / 100) ** i
        vus = {}
        for q in src:
            t = (q['t'] + dec) % d if boucle else q['t'] + dec
            if t <= d:
                vus[int(round(t))] = k(t, rot=q['rot'] * amp, ease=_ease_de(q, 'rot'))
        bord = (valeur(rig, anim, ps[0], 'rot', (-dec) % d) if boucle else (src[0]['rot'])) * amp
        vus[0] = k(0, rot=bord, ease='inOutSine')
        if boucle:
            vus[int(d)] = k(d, rot=bord, ease='inOutSine')
        ecrire(rig, anim, n, [vus[t] for t in sorted(vus)])
    return "fouet sur %d pièces (+%d ms par os)" % (len(ps), p.get('pas', 67))


@recette('sequence-fx', "Séquence d'effet", 'Effets',
         "Une séquence d'images (flamme, éclair, fumée) qui démarre à l'image choisie, se joue une fois, s'allume en 33 ms, "
         "grandit en s'éteignant puis se cache. Cybersaurus : flamme de 42 images lancée à l'image 15.",
         [P_piece('sel', 'Pièce à séquence (frames)'), P_num('debut', 'Image de départ', 15, 0, 200, 1),
          P_num('fps', 'Images par seconde', 50, 5, 120, 1), P_ms('duree', 'Durée visible', 567, 100, 3000),
          P_num('grandit', "Agrandissement en s'éteignant", 140, 0, 300, 5, '%')])
def r_sequence_fx(rig, anim, t0, p, ctx):
    b = resoudre(rig, p.get('piece', 'sel'), ctx)
    pt = partie(rig, b) if b else None
    if not pt or not pt.get('frames'):
        return "%s n'a pas de séquence d'images (frames)" % b
    pt['seq'] = dict(pt.get('seq', {}), fps=p.get('fps', 50), mode='une-fois', fin='cache')
    d = p.get('duree', 567)
    g = 1 + p.get('grandit', 140) / 100
    ecrire(rig, anim, b, [k(t0, seq=int(p.get('debut', 15)), alpha=0), k(t0 + 33, alpha=1, ease='outQuad'),
                          k(t0 + d * .82, alpha=1, sx=1 + (g - 1) * .3, sy=1 + (g - 1) * .3, ease='inOutQuad'),
                          k(t0 + d, alpha=0, sx=g, sy=g, ease='inQuad')])
    return "séquence sur %s : image %d, %d i/s, %d ms" % (b, int(p.get('debut', 15)), p.get('fps', 50), d)


@recette('flash-cadre', 'Flash du cadre', 'Effets',
         "Une copie additive du cadre (ou d'une pièce) s'allume au premier impact, reste pendant le pic et s'éteint au retour. "
         "Teinte or par défaut (Cybersaurus : 1 / 0.77 / 0.1, alpha 0.61).",
         [P_piece('lueurs', 'Pièce additive'), P_num('force', 'Force', 61, 5, 100, 1, '%'), P_ms('pic', 'Moment du pic', 100, 0, 1500),
          P_ms('duree', 'Durée', 667, 150, 3000), {'id': 'couleur', 'nom': 'Teinte', 'type': 'couleur', 'defaut': '#ffc41a'}])
def r_flash_cadre(rig, anim, t0, p, ctx):
    v = p.get('piece', 'lueurs')
    ps = resoudre(rig, v, ctx, multi=True) if v == 'lueurs' else [resoudre(rig, v, ctx)]
    ps = [x for x in ps if x]
    d, pic, fo, col = p.get('duree', 667), p.get('pic', 100), p.get('force', 61) / 100, p.get('couleur', '#ffc41a')
    for n in ps:
        ecrire(rig, anim, n, [k(t0, alpha=0, tint=col), k(t0 + pic, alpha=fo, ease='outQuad'), k(t0 + d * .8, alpha=fo * .8, ease='inOutQuad'),
                              k(t0 + d, alpha=0, ease='inQuad')])
    return "flash sur %s" % (', '.join(ps) or 'aucune pièce')


@recette('passes-lumiere', 'Passes de lumière', 'Effets',
         "Une traînée lumineuse traverse le symbole, revient d'un saut, repart : une passe toutes les 333 ms, fondu de 67 ms "
         "à chaque bout. Deux pièces déphasées de 33 ms font une pluie continue (Cybersaurus, même au repos).",
         [{'id': 'pieces', 'nom': 'Traînées', 'type': 'pieces', 'defaut': 'sel'}, P_num('dx', 'Déplacement x', -50, -150, 150, 1, '% haut.'),
          P_num('dy', 'Déplacement y', 50, -150, 150, 1, '% haut.'), P_ms('periode', 'Période', 333, 100, 3000),
          P_ms('traversee', 'Traversée', 300, 50, 3000), P_ms('dephasage', 'Déphasage entre traînées', 33, 0, 1000)])
def r_passes(rig, anim, t0, p, ctx):
    ps = resoudre(rig, p.get('pieces', 'sel'), ctx, multi=True)
    d = anim_de(rig, anim)['dur']
    h = H(rig)
    dx, dy = h * p.get('dx', -50) / 100, h * p.get('dy', 50) / 100
    per = p.get('periode', 333)
    tr = min(p.get('traversee', 300), per - 10)
    fo = min(67, tr / 3)
    for i, n in enumerate(ps):
        ks, t = [], t0 + i * p.get('dephasage', 33)
        while t + tr <= d + .5:
            ks += [k(t, x=0, y=0, alpha=0, ease='step'), k(t + fo, alpha=1, ease='outQuad'), k(t + tr - fo, alpha=1, ease='inOutQuad'),
                   k(t + tr, x=dx, y=dy, alpha=0, ease=GLISSE)]
            t += per
        if anim_de(rig, anim).get('loop') and ks:
            ks.append(k(d, x=0, y=0, alpha=0, ease='step'))
        ecrire(rig, anim, n, ks)
    return "%d traînée(s), une passe toutes les %d ms" % (len(ps), per)


@recette('teinte-symbole', 'Teinte du symbole', 'Effets',
         "Teinte tout le symbole d'un coup (piste « @symbole ») : assombrir puis revenir, virer au blanc, à l'or. Le jeu peut "
         "aussi le faire par code : sym.setTeinte(0x7a8c90, 150) pour un non-gagnant (Cybersaurus).",
         [{'id': 'couleur', 'nom': 'Teinte', 'type': 'couleur', 'defaut': '#7a8c90'}, P_ms('entree', "Fondu d'entrée", 120, 0, 2000),
          P_ms('tenue', 'Tenue', 600, 0, 10000), P_ms('sortie', 'Fondu de sortie', 200, 0, 2000)])
def r_teinte(rig, anim, t0, p, ctx):
    col = p.get('couleur', '#7a8c90')
    e, te, s = p.get('entree', 120), p.get('tenue', 600), p.get('sortie', 200)
    ecrire(rig, anim, '@symbole', [k(t0, tint='#ffffff'), k(t0 + e, tint=col, ease='inOutQuad'), k(t0 + e + te, tint=col, ease='inOutQuad'),
                                   k(t0 + e + te + s, tint='#ffffff', ease='inOutQuad')])
    return "teinte %s sur tout le symbole" % col


@recette('physique-anim', "Physique propre à l'animation", 'Personnage',
         "Pendant cette animation, la physique de ces pièces change (plus vive, plus molle) puis revient à la normale. "
         "Cybersaurus passe la flamme en inertie 0.2 / amortissement 0.8 pendant le gain.",
         [{'id': 'pieces', 'nom': 'Pièces à physique', 'type': 'pieces', 'defaut': 'sel'}, P_num('inertie', 'Inertie', .2, 0, 1, .05),
          P_num('raideur', 'Raideur (0 = inchangée)', 0, 0, 400, 5), P_num('amortissement', 'Amortissement (0 = inchangé)', 0, 0, 40, .5),
          P_num('reinit', 'Repartir du repos au début (0/1)', 0, 0, 1, 1)])
def r_physique_anim(rig, anim, t0, p, ctx):
    ps = [n for n in resoudre(rig, p.get('pieces', 'sel'), ctx, multi=True) if partie(rig, n).get('physique')]
    if not ps:
        return "aucune de ces pièces n'a de physique (régler d'abord « physique » sur la pièce)"
    a = anim_de(rig, anim)
    ov = a.setdefault('physique', {})
    for n in ps:
        o = {'inertie': p.get('inertie', .2)}
        if p.get('raideur'):
            o['raideur'] = p['raideur']
        if p.get('amortissement'):
            o['amortissement'] = p['amortissement']
        ov[n] = o
    if p.get('reinit'):
        a['physiqueReinit'] = True
    return "physique de %s réglée pour %s" % (anim, ', '.join(ps))


@recette('personnage-complet', 'Personnage complet', 'Packs',
         "Repos 2 s, arrivée 667 ms et gain 667 ms d'un personnage, aux mesures de Cybersaurus : os pilote, corps qui s'écrase, "
         "tête et chaîne décalées, double pic, flash du cadre. Remplace idle, land et win.",
         [P_piece('racine', 'Holder'), {'id': 'corps', 'nom': 'Corps', 'type': 'piece', 'defaut': 'corps'},
          {'id': 'tete', 'nom': 'Tête', 'type': 'piece', 'defaut': 'aucune'}, {'id': 'machoire', 'nom': 'Mâchoire', 'type': 'piece', 'defaut': 'aucune'},
          {'id': 'cadre', 'nom': 'Cadre', 'type': 'piece', 'defaut': 'aucune'}, {'id': 'flash', 'nom': 'Lueur du cadre', 'type': 'piece', 'defaut': 'aucune'},
          {'id': 'haut', 'nom': 'Os du haut du corps entraîné par le pilote (torse-haut)', 'type': 'pieces', 'defaut': ''},
          {'id': 'chaine', 'nom': 'Chaîne (queue…)', 'type': 'pieces', 'defaut': ''}])
def r_personnage(rig, anim, t0, p, ctx):
    for n in ('idle', 'land', 'win'):
        rig.setdefault('anims', {}).pop(n, None)
    anim_de(rig, 'idle', 2000, True)['loop'] = True
    anim_de(rig, 'land', 667)
    anim_de(rig, 'win', 667)
    pi = None
    if p.get('haut'):
        r_pilote(rig, 'idle', 0, {'pieces': p['haut'], 'premier': .9, 'baisse': .2}, ctx)
        pi = next((q['name'] for q in rig['parts'] if q.get('pilote')), None)
    co, te = resoudre(rig, p.get('corps', 'corps'), ctx), resoudre(rig, p.get('tete'), ctx)
    h = H(rig)
    # repos : respiration lente, la tête balaie, le pilote fait suivre épaules et bras avec retard
    if co:
        ecrire(rig, 'idle', co, [k(0, y=0, sx=1, sy=1), k(767, y=-h * .018, ease='inOutSine'), k(967, sx=1.03, sy=1.03, ease='inOutSine'),
                                 k(2000, y=0, sx=1, sy=1, ease='inOutSine')])
    if te:
        ecrire(rig, 'idle', te, [k(0, rot=0), k(300, rot=-4.3 * D2R, ease='inOutSine'), k(1033, rot=6 * D2R, ease='inOutSine'),
                                 k(1600, rot=-2.8 * D2R, ease='inOutSine'), k(2000, rot=0, ease='inOutSine')])
    if pi:
        ecrire(rig, 'idle', pi, [k(0, y=0), k(1000, y=-h * .02, ease='inOutSine'), k(2000, y=0, ease='inOutSine')])
    ch = resoudre(rig, p.get('chaine'), ctx, multi=True) if p.get('chaine') else []
    if ch:
        ecrire(rig, 'idle', ch[0], [k(0, rot=0), k(500, rot=3.5 * D2R, ease='inOutSine'), k(1500, rot=-4.5 * D2R, ease='inOutSine'),
                                    k(2000, rot=0, ease='inOutSine')])
        r_fouet(rig, 'idle', 0, {'pieces': ch, 'pas': 100, 'croissance': 40}, ctx)
    r_arrivee_perso(rig, 'land', 0, {'corps': co or 'aucune', 'tete': te or 'aucune', 'pilote': pi or 'aucune', 'chaine': ch, 'duree': 667}, ctx)
    r_gain_perso(rig, 'win', 0, {'piece': p.get('piece', 'racine'), 'cadre': p.get('cadre'), 'corps': co or 'aucune', 'tete': te or 'aucune',
                                 'machoire': p.get('machoire'), 'pilote': pi or 'aucune', 'chaine': ch, 'flash': p.get('flash'), 'duree': 667}, ctx)
    rig['mix'] = rig.get('mix', 140)
    return "repos 2000 ms, arrivée 667 ms, gain 667 ms" + (", pilote « %s »" % pi if pi else '')


# ------------------------------------------------------------------ entrée


def appliquer(rig, anim, rid, params=None, t0=0, ctx=None):
    r = next((x for x in RECETTES if x['id'] == rid), None)
    if not r:
        raise ValueError(f"recette inconnue : {rid}")
    ctx = ctx or {}
    p = {q['id']: q.get('defaut') for q in r['params']}
    donnes = {x: v for x, v in (params or {}).items() if v is not None}
    a = (rig.get('anims') or {}).get(anim)
    # durée par défaut trop longue pour ce qui reste de l'animation : on la
    # resserre plutôt que de rallonger l'animation sans le dire
    if a and not r['boucle'] and 'duree' in p and 'duree' not in donnes and rid not in ('duree', 'symbole-complet'):
        reste = a.get('dur', 0) - float(t0 or 0)
        if reste >= 100 and p['duree'] > reste:
            p['duree'] = int(reste)
    p.update(donnes)
    rig = copy.deepcopy(rig)
    if anim not in rig.get('anims', {}) and rid != 'symbole-complet':
        anim_de(rig, anim, 1000)
    info = r['fn'](rig, anim, float(t0 or 0), p, ctx)
    return rig, info


def squelette_symbole(W, H, bbox):
    """Rig de départ d'un nouveau symbole : os du bas (socle) et du haut, corps
    en maillage pondéré sur les deux (écrasement « gélatine »)."""
    x0, y0, x1, y1 = bbox or (0, 0, W, H)
    cx = (x0 + x1) / 2
    h = y1 - y0
    socle = [int(cx), int(y1 - h * .06)]
    haut = [int(cx), int(y0 + h * .42)]
    R = int(max(W, H) * .33)
    skin = {'grid': [8, 8], 'bones': [{'name': 'socle', 'radius': R}, {'name': 'haut', 'radius': R}], 'falloff': 2.5}
    return {
        'size': [W, H], 'mix': 140,
        'parts': [{'name': 'socle', 'pivot': socle}, {'name': 'haut', 'pivot': haut, 'parent': 'socle'},
                  {'name': 'corps', 'src': 'corps.webp', 'pivot': socle, 'parent': 'socle', 'mesh': skin}],
        'emitters': {}, 'anims': {},
    }
