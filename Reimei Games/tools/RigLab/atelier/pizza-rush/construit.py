"""Pizza Rush : construit les 11 rigs de symboles de zéro (Rig Lab 2).
Usage (depuis le dossier RigLab) : .venv/bin/python atelier/pizza-rush/construit.py [CODE …]
Chaque symbole : image détourée (art/symboles/CODE.png, case 640) → ./rl nouveau --plein-cadre → personnalité par ./rl lot."""
import sys, os, shutil, subprocess
import math
import numpy as np
from PIL import Image

ICI = os.path.dirname(os.path.abspath(__file__))
RL = os.path.abspath(os.path.join(ICI, '..', '..'))
JEU = os.path.abspath(os.path.join(RL, '..', '..', 'slots', 'pizza-rush'))
ART = os.path.join(JEU, 'art', 'symboles')

def r(deg):
    """rot du moteur = radians (Pixi) : on écrit en degrés."""
    return round(math.radians(deg), 4)

def bbox(code):
    a = np.asarray(Image.open(os.path.join(ART, code + '.png')))[..., 3] > 20
    ys, xs = np.nonzero(a)
    return xs.min(), ys.min(), xs.max(), ys.max()

def rl(*args, entree=None):
    r = subprocess.run(['./rl', *args], cwd=RL, input=entree, text=True, capture_output=True)
    if r.returncode: sys.exit(f"échec rl {args[:2]} :\n{r.stdout}\n{r.stderr}")
    return r.stdout

def idle(periode, bob, rot):
    """Repos « canette qui flotte » : monte/descend + léger balancement décalé d'un quart, boucle parfaite."""
    p = periode; q = p / 4
    return f"""anim idle dur={p} loop=1
vider idle haut
cle idle haut 0 y=0 sx=1 rot=0
cle idle haut {q:.0f} rot={r(rot)} ease=inOutSine
cle idle haut {p/2:.0f} y={-bob} sx=1.012 rot=0 ease=inOutSine
cle idle haut {3*q:.0f} rot={r(-rot)} ease=inOutSine
cle idle haut {p} y=0 sx=1 rot=0 ease=inOutSine
"""

REFLET = """vider win corps
recette win reflet piece=corps duree=650 angle=20 t0=300
"""

def lettre(sens):
    # gain : pop de la recette + la lettre ondule comme de la gélatine pendant la tenue
    a = 6 * sens
    return f"""cle win haut 300 rot=0
cle win haut 430 rot={r(a)} ease=[0.22,1.4,0.4,1]
cle win haut 600 rot={r(-a*0.6)} ease=inOutSine
cle win haut 780 rot={r(a*0.3)} ease=inOutSine
cle win haut 960 rot=0 ease=inOutSine
"""

def perso(code, b):
    x0, y0, x1, y1 = b; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2; h = y1 - y0
    if code == 'H4':   # pizza lancée par le pizzaiolo : saute, se retourne en l'air, retombe
        return f"""ajouter centre pivot=[{cx:.0f},{cy:.0f}] avant=socle
piece socle parent=centre
cle win centre 0 y=0 sx=1
cle win centre 260 y=0 sx=1
cle win centre 300 y=6 ease=[0.4,0,0.6,1]
cle win centre 560 y={-0.16*h:.0f} ease=[0.12,0.72,0.12,1]
cle win centre 820 y=0 ease=[0.4,0,1,1]
cle win centre 900 y=4 ease=[0.2,1.8,0.4,1]
cle win centre 1000 y=0 ease=inOutSine
recette win piece-tourne piece=centre tours=1 duree=560 t0=300
"""
    if code == 'H3':   # scooter : wheelie sur la roue arrière
        rx, ry = x1 - 0.2 * (x1 - x0), y1 - 4
        return f"""ajouter roue pivot=[{rx:.0f},{ry:.0f}] avant=socle
piece socle parent=roue
cle win roue 0 rot=0 x=0
cle win roue 280 rot=0 x=0
cle win roue 340 rot={r(-2)} x=4 ease=[0.4,0,0.6,1]
cle win roue 520 rot={r(16)} x=-10 ease=[0.22,1.4,0.4,1]
cle win roue 860 rot={r(13)} x=-8 ease=inOutSine
cle win roue 1040 rot=0 x=0 ease=[0.4,0,1,1]
cle win roue 1120 rot={r(-1.5)} ease=[0.2,1.8,0.4,1]
cle win roue 1250 rot=0 ease=inOutSine
evenement win 1040 name=impact
"""
    if code == 'H2':   # pile de boîtes : la tour vacille
        return "recette win balancier piece=haut angle=7 oscillations=3 duree=900 t0=300\n"
    if code == 'H1':   # pot à pourboires : on secoue les pièces
        return "recette win secousse piece=haut force=1.6 freq=16 duree=520 t0=320\n"
    if code == 'WD':   # wild : plus gros pop
        return ""
    if code == 'SC':   # téléphone : il SONNE (deux sonneries)
        out = []
        for t0 in (300, 760):
            for i in range(9):
                amp = 5 * (1 - i / 9)
                out.append(f"cle win haut {t0 + i*28} rot={r(amp if i % 2 else -amp)} ease=inOutSine")
            out.append(f"cle win haut {t0 + 9*28} rot=0 ease=inOutSine")
        return "\n".join(out) + "\n"
    return ""

SCATTER = """anim suspense dur=2000 loop=1
cle suspense socle 0 sx=1.04 sy=1.04
cle suspense socle 1000 sx=1.07 sy=1.07 ease=inOutSine
cle suspense socle 2000 sx=1.04 sy=1.04 ease=inOutSine
recette suspense tension piece=haut force=0.5 duree=2000
anim declenche dur=1200 loop=0
cle declenche socle 0 sx=1.04 sy=1.04
cle declenche socle 110 sx=1.1 sy=0.92 ease=inOutSine
cle declenche socle 330 sx=1.28 sy=1.28 ease=[0.2,1.8,0.4,1]
cle declenche socle 520 sx=1.16 sy=1.16 ease=inOutSine
cle declenche socle 700 sx=1.21 sy=1.21 ease=inOutSine
cle declenche socle 980 sx=1.08 sy=1.08 ease=inOutSine
cle declenche socle 1200 sx=1.1 sy=1.1 ease=inOutSine
evenement declenche 330 name=declenche
anim danse dur=2000 loop=1
cle danse socle 0 sx=1.1 sy=1.1 rot=0
cle danse socle 500 sx=1.13 sy=1.06 rot=0.07 ease=inOutSine
cle danse socle 1000 sx=1.1 sy=1.12 rot=0 ease=inOutSine
cle danse socle 1500 sx=1.13 sy=1.06 rot=-0.07 ease=inOutSine
cle danse socle 2000 sx=1.1 sy=1.1 rot=0 ease=inOutSine
"""

# période de repos (ms), montée (px), balancement (°) : tous différents pour ne jamais bouger en rythme
REPOS = {'L5': (2200, 5, 1.2), 'L4': (2600, 5, -1.4), 'L3': (2400, 4, 1.0), 'L2': (2900, 5, -1.2), 'L1': (3000, 4, 1.3),
         'H4': (2700, 6, 1.5), 'H3': (2050, 3, 0.8), 'H2': (2850, 4, -1.0), 'H1': (2500, 5, 1.2),
         'WD': (2300, 8, 1.8), 'SC': (2750, 5, -1.5)}

codes = sys.argv[1:] or list(REPOS)
for code in codes:
    d = os.path.join(JEU, 'anims', code)
    if os.path.isdir(d): shutil.rmtree(d)
    rl('nouveau', f'pizza-rush/{code}', os.path.join(ART, code + '.png'), '--plein-cadre')
    b = bbox(code)
    lot = idle(*REPOS[code]) + REFLET
    if code.startswith('L'):
        lot += lettre(1 if code in ('L5', 'L3', 'L1') else -1)
    lot += perso(code, b)
    if code == 'SC': lot += SCATTER
    rl('lot', f'pizza-rush/{code}', entree=lot)
    print(code, 'ok')
