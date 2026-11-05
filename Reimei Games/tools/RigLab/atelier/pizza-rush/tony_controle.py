"""Vidéo de contrôle des raccords de Tony : enchaîne exactement les images que le jeu affiche
(repos → sortie vers P → entrée → réaction → retour → repos) pour chaque réaction, sur le décor, en gros plan.
Usage : tony_controle.py DOSSIER_TONY_VIDEO DECOR.webp SORTIE.mp4"""
import sys, json, subprocess, os, tempfile
import numpy as np
from PIL import Image

D, DECOR, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
meta = json.load(open(os.path.join(D, 'tony-video.json')))
W, H, seg = meta['w'], meta['h'], meta['segments']
planches = {}


def img(c):
    s, x, y = c
    if s not in planches: planches[s] = Image.open(os.path.join(D, f'planche-{s}.webp')).convert('RGBA')
    return planches[s].crop((x, y, x + W, y + H))


fond = Image.open(DECOR).convert('RGBA')
fond = fond.crop((0, int(fond.height * .3), int(fond.width * .45), fond.height)).resize((W * 2, H * 2 + 120))

repos = seg['repos']
sorties = {int(k): v for k, v in meta['sortiesRepos'].items()}
liste = []                                                  # (cellule, étiquette)
pos = 0
for nom, r in meta['reactions'].items():
    # un peu de repos, puis la prochaine sortie
    k0 = pos
    for _ in range(14):
        liste.append((repos[pos], 'repos')); pos = (pos + 1) % len(repos)
    while pos not in sorties: liste.append((repos[pos], 'repos')); pos = (pos + 1) % len(repos)
    liste.append((repos[pos], 'repos'))
    liste += [(c, 'raccord') for c in seg[sorties[pos]]]
    liste += [(c, 'raccord') for c in seg[r['entree']]]
    liste += [(c, nom) for c in seg[r['corps']]]
    liste += [(c, 'raccord') for c in seg[r['retour']]]
    pos = 0
liste += [(repos[i], 'repos') for i in range(14)]

tmp = tempfile.mkdtemp()
for i, (c, lab) in enumerate(liste):
    fr = fond.copy()
    t = img(c).resize((W * 2, H * 2), Image.LANCZOS)
    fr.alpha_composite(t, (0, 60))
    fr.convert('RGB').save(os.path.join(tmp, f'{i:05d}.png'))
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '12', '-i', os.path.join(tmp, '%05d.png'),
                '-vf', 'fps=30', '-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUT], check=True)
print('images', len(liste), '→', OUT)
