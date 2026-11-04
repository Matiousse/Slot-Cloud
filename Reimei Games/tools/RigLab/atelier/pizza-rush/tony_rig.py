"""Tony : squelette + animations, sur le rig créé par `rl calques` (voir LISEZMOI du jeu).
Usage (dossier RigLab) : .venv/bin/python atelier/pizza-rush/tony_rig.py"""
import os, json, math, subprocess, sys

RL = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
RIG = os.path.abspath(os.path.join(RL, '..', '..', 'slots', 'pizza-rush', 'anims', 'tony', 'rig.json'))
# facteur et cadre donnés par `rl calques` (« facteur 0.6424, cadre [908, 86, …] ») : passés en arguments
F, OX, OY = float(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])
cv = lambda x, y: [round((x - OX) * F), round((y - OY) * F)]
r = lambda deg: round(math.radians(deg), 4)        # rot du moteur en radians

rig = json.load(open(RIG))
P = {p['name']: p for p in rig['parts']}
VARIANTES = ['visage-yeux-fermes', 'visage-rire', 'visage-choc', 'visage-triste', 'visage-clin']
COU = cv(1395, 735)
os_ = lambda nom, piv, parent: {'name': nom, 'pivot': piv, 'parent': parent}
parts = [P['socle'], os_('bassin', cv(1400, 1010), 'socle'),
         {**P['haut'], 'pivot': cv(1400, 860), 'parent': 'bassin'},
         os_('cou', COU, 'haut')]
for b, piv in [('bras-d', cv(1282, 792)), ('bras-g', cv(1542, 798))]:
    parts.append({**P[b], 'pivot': piv, 'parent': 'haut'})
parts.append({**P['tete'], 'pivot': COU, 'parent': 'cou'})
for v in VARIANTES: parts.append({**P[v], 'pivot': COU, 'parent': 'cou', 'alpha': 0})
c = P['corps']; c['mesh'] = {'grid': [8, 12], 'falloff': 2.5,
     'bones': [{'name': 'socle', 'radius': 260}, {'name': 'bassin', 'radius': 200}, {'name': 'haut', 'radius': 200}]}
parts.append(c)
parts.append({**P['casquette'], 'pivot': cv(1330, 250), 'parent': 'cou'})
parts.append({**P['meches'], 'pivot': COU, 'parent': 'cou'})
rig['parts'] = parts
rig['anims'] = {}
rig['mix'] = 160
json.dump(rig, open(RIG, 'w'), indent=1)

L = []
DUR = {}
def anim(n, dur, loop): DUR[n] = dur; L.append(f"anim {n} dur={dur} loop={loop}")
def k(a, p, t, ease=None, **v):
    L.append(f"cle {a} {p} {t} " + " ".join(f"{x}={y}" for x, y in v.items()) + (f" ease={ease}" if ease else ""))
def visage(a, expr, t0, t1=None, pop=True):
    """Changement d'expression comme dans Spine : la tête ne change jamais, seuls les traits sont permutés
    d'une image à l'autre (pas de fondu = pas de visage fantôme), accompagné d'un petit écrasement de la tête."""
    p = 'visage-' + expr.replace('tete-', '')
    k(a, p, 0, alpha=0); k(a, p, t0, alpha=0); k(a, p, t0 + 1, alpha=1)
    if t1 is not None: k(a, p, t1, alpha=1); k(a, p, t1 + 1, alpha=0)
    if pop:
        for t in [t0] + ([t1] if t1 is not None else []):
            POPS.setdefault(a, []).append(t)
POPS = {}
def poser_pops():
    for a, ts in POPS.items():
        for t in ts:
            if t + 270 > DUR[a] - 20: continue          # pas la place : pas d'écrasement (le clip ne s'allonge jamais)
            k(a, 'cou', max(t - 30, 0), sx=1, sy=1)
            k(a, 'cou', t + 40, 'inOutSine', sx=1.035, sy=0.955)
            k(a, 'cou', t + 150, '[0.2,1.8,0.4,1]', sx=0.99, sy=1.015)
            k(a, 'cou', t + 260, 'inOutSine', sx=1, sy=1)
IN = '[0.22,1.4,0.4,1]'; OUT = '[0.4,0,1,1]'; IMP = '[0.2,1.8,0.4,1]'; S = 'inOutSine'; GL = '[0.12,0.72,0.12,1]'

# ---------------- idle : respire, la tête suit avec retard, les bras balancent, clignement
anim('idle', 2400, 1)
for t, sy, y in [(0, 1, 0), (1200, 1.018, -3), (2400, 1, 0)]: k('idle', 'haut', t, S, sy=sy, y=y)
for t, rot in [(0, 0), (700, 1.5), (1900, -1.2), (2400, 0)]: k('idle', 'cou', t, S, rot=r(rot))
for t, rot in [(0, 0), (1260, -2.5), (2400, 0)]: k('idle', 'bras-d', t, S, rot=r(rot))
for t, rot in [(0, 0), (1300, 2.5), (2400, 0)]: k('idle', 'bras-g', t, S, rot=r(rot))
visage('idle', 'tete-yeux-fermes', 1640, 1780, pop=False)

# ---------------- gain (petit) : 1370 ms, rebond + bras levé, sourire jusqu'aux oreilles
A = 'gain'; anim(A, 1370, 0)
k(A, 'socle', 0, sx=1, sy=1); k(A, 'socle', 110, S, sx=1.05, sy=0.93); k(A, 'socle', 300, IMP, sx=0.97, sy=1.06)
k(A, 'socle', 520, S, sx=1, sy=1); k(A, 'socle', 1370, sx=1, sy=1)
k(A, 'haut', 0, y=0); k(A, 'haut', 110, S, y=6); k(A, 'haut', 300, IN, y=-14); k(A, 'haut', 1100, S, y=-6); k(A, 'haut', 1370, S, y=0)
k(A, 'bras-d', 0, rot=0); k(A, 'bras-d', 140, S, rot=r(-6)); k(A, 'bras-d', 360, IN, rot=r(34))
k(A, 'bras-d', 560, S, rot=r(28)); k(A, 'bras-d', 760, S, rot=r(35)); k(A, 'bras-d', 960, S, rot=r(30)); k(A, 'bras-d', 1370, S, rot=0)
k(A, 'bras-g', 0, rot=0); k(A, 'bras-g', 180, S, rot=r(4)); k(A, 'bras-g', 400, IN, rot=r(-12)); k(A, 'bras-g', 1370, S, rot=0)
k(A, 'cou', 0, rot=0); k(A, 'cou', 330, IN, rot=r(-5)); k(A, 'cou', 1000, S, rot=r(-3)); k(A, 'cou', 1370, S, rot=0)
visage(A, 'tete-rire', 300, 1180)
L.append(f"evenement {A} 300 name=gain")

# ---------------- grosgain : saut bras en l'air, la casquette décolle et retombe
A = 'grosgain'; anim(A, 1700, 0)
k(A, 'socle', 0, y=0, sx=1, sy=1); k(A, 'socle', 120, S, sx=1.08, sy=0.88)
k(A, 'socle', 260, '[0.3,1.5,0.5,1]', y=-90, sx=0.94, sy=1.1); k(A, 'socle', 520, GL, y=-120, sx=1, sy=1)
k(A, 'socle', 760, OUT, y=0, sx=1, sy=1); k(A, 'socle', 820, IMP, sx=1.08, sy=0.9); k(A, 'socle', 980, S, sx=0.98, sy=1.03)
k(A, 'socle', 1120, S, sx=1, sy=1); k(A, 'socle', 1700, sx=1, sy=1)
for b, sgn in [('bras-d', 1), ('bras-g', -1)]:
    d = 40 if b == 'bras-g' else 0
    k(A, b, 0, rot=0); k(A, b, 120 + d, S, rot=r(-8 * sgn)); k(A, b, 320 + d, IN, rot=r(40 * sgn))
    k(A, b, 620 + d, S, rot=r(34 * sgn)); k(A, b, 860 + d, IMP, rot=r(42 * sgn)); k(A, b, 1200 + d, S, rot=r(36 * sgn)); k(A, b, 1700, S, rot=0)
k(A, 'casquette', 0, y=0, rot=0); k(A, 'casquette', 300, y=0, rot=0); k(A, 'casquette', 470, GL, y=-26, rot=r(-6))
k(A, 'casquette', 640, OUT, y=0, rot=r(2)); k(A, 'casquette', 720, IMP, y=4, rot=0); k(A, 'casquette', 880, S, y=0)
k(A, 'cou', 0, rot=0); k(A, 'cou', 280, IN, rot=r(-6)); k(A, 'cou', 800, IMP, rot=r(3)); k(A, 'cou', 1000, S, rot=0)
visage(A, 'tete-rire', 240)
L.append(f"evenement {A} 0 name=gain"); L.append(f"evenement {A} 760 name=impact")

# ---------------- presque : le choc, il recule, la casquette s'envole et retombe sur sa tête
A = 'presque'; anim(A, 1500, 0)
k(A, 'socle', 0, x=0, sx=1, sy=1); k(A, 'socle', 90, S, x=6, sx=1.03, sy=0.95); k(A, 'socle', 260, IMP, x=-14, sx=0.96, sy=1.06)
k(A, 'socle', 600, S, x=-10, sx=1, sy=1); k(A, 'socle', 1500, S, x=0)
k(A, 'haut', 0, rot=0); k(A, 'haut', 260, IMP, rot=r(-4)); k(A, 'haut', 1000, S, rot=r(-2)); k(A, 'haut', 1500, S, rot=0)
k(A, 'bras-d', 0, rot=0); k(A, 'bras-d', 250, IMP, rot=r(22)); k(A, 'bras-d', 900, S, rot=r(16)); k(A, 'bras-d', 1500, S, rot=0)
k(A, 'bras-g', 0, rot=0); k(A, 'bras-g', 290, IMP, rot=r(-22)); k(A, 'bras-g', 940, S, rot=r(-16)); k(A, 'bras-g', 1500, S, rot=0)
k(A, 'casquette', 0, y=0, x=0, rot=0); k(A, 'casquette', 180, y=0, x=0, rot=0)
k(A, 'casquette', 400, GL, y=-34, x=-6, rot=r(-9)); k(A, 'casquette', 620, OUT, y=0, x=0, rot=r(3))
k(A, 'casquette', 700, IMP, y=4, rot=r(-2)); k(A, 'casquette', 860, S, y=0, rot=0)
visage(A, 'tete-choc', 80, 1300)
L.append(f"evenement {A} 80 name=choc")

# ---------------- perte : soupir, il s'affaisse puis se reprend
A = 'perte'; anim(A, 1500, 0)
k(A, 'haut', 0, y=0, sy=1, rot=0); k(A, 'haut', 200, S, y=-4, sy=1.03); k(A, 'haut', 600, OUT, y=10, sy=0.96, rot=r(2))
k(A, 'haut', 700, IMP, y=8, sy=0.97); k(A, 'haut', 1150, S, y=6, sy=0.975); k(A, 'haut', 1500, S, y=0, sy=1, rot=0)
k(A, 'cou', 0, rot=0); k(A, 'cou', 620, OUT, rot=r(5)); k(A, 'cou', 720, IMP, rot=r(4)); k(A, 'cou', 1500, S, rot=0)
k(A, 'bras-d', 0, rot=0); k(A, 'bras-d', 640, S, rot=r(-9)); k(A, 'bras-d', 1500, S, rot=0)
k(A, 'bras-g', 0, rot=0); k(A, 'bras-g', 680, S, rot=r(9)); k(A, 'bras-g', 1500, S, rot=0)
visage(A, 'tete-triste', 150, 1380)

# ---------------- bonus : clin d'œil + bras levé, petit saut
A = 'bonus'; anim(A, 1500, 0)
k(A, 'socle', 0, y=0, sx=1, sy=1); k(A, 'socle', 110, S, sx=1.06, sy=0.92); k(A, 'socle', 280, IN, y=-40, sx=0.97, sy=1.05)
k(A, 'socle', 540, OUT, y=8, sx=1.06, sy=0.92); k(A, 'socle', 640, IMP, y=-5, sx=0.98, sy=1.03); k(A, 'socle', 780, S, y=0, sx=1, sy=1); k(A, 'socle', 1500, sx=1, sy=1)
k(A, 'bras-g', 0, rot=0); k(A, 'bras-g', 150, S, rot=r(6)); k(A, 'bras-g', 380, IN, rot=r(-40))
for i, t in enumerate(range(560, 1160, 150)): k(A, 'bras-g', t, S, rot=r(-34 if i % 2 == 0 else -42))
k(A, 'bras-g', 1500, S, rot=0)
k(A, 'bras-d', 0, rot=0); k(A, 'bras-d', 400, S, rot=r(10)); k(A, 'bras-d', 1500, S, rot=0)
k(A, 'cou', 0, rot=0); k(A, 'cou', 320, IN, rot=r(6)); k(A, 'cou', 1200, S, rot=r(4)); k(A, 'cou', 1500, S, rot=0)
visage(A, 'tete-clin', 340, 1250)
L.append(f"evenement {A} 340 name=bonus")

poser_pops()
r_ = subprocess.run(['./rl', 'lot', 'pizza-rush/tony'], cwd=RL, input="\n".join(L) + "\n", text=True, capture_output=True)
print(r_.stdout[-600:], r_.stderr[-600:])
if r_.returncode: sys.exit(1)
