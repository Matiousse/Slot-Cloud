#!/usr/bin/env python3
"""rl — Rig Lab en ligne de commande, pour Claude.

Un symbole se désigne par projet/symbole (ex. atelier/roi, last-rites/bouc).
Le serveur est lancé tout seul s'il ne tourne pas (port 4390).

VOIR
  rl projets                              projets et symboles
  rl voir P/S                             pièces (arbre), animations, fonctions v3
  rl anim P/S ANIM                        toutes les clés d'une animation, lisibles
  rl recettes                             catalogue des recettes et leurs réglages
  rl prompts FICHE.json [--sortie pack.md]  pack de prompts ChatGPT (référence en pose de rig, pièces cachées,
        variantes, effets, fond + cadre, plan de rig) — format de la fiche : riglab/lib/prompts.py

JUGER (rendu dans un Chrome sans fenêtre → PNG dans riglab/captures/)
  rl planche P/S ANIM [--n 12] [--taille 220]    planche-contact + trajectoires + courbes
        [--temps 380,640,900 --taille 420]      images précises, en grand (pour traquer les coutures)
  rl courbes P/S ANIM                            courbes seules
  rl controle P/S [ANIM]                         rapport qualité (note /10 et points)
  rl tout P/S                                    planche de chaque animation + contrôle
  rl enchainement script.json [--sortie nom.mp4]  vidéo : plusieurs rigs enchaînés sur une scène (titres de gains…)
  rl grille PROJET s1,s2,… [--anim idle] [--duree 10000] [--cols 6]   vidéo : les symboles côte à côte, départs au hasard
  rl video P/S [--seq "win:0,idle:1400"] [--fin 3000] [--vitesse 0.35] [--taille 720] [--sortie nom.mp4]
        vidéo MP4 60 i/s rendue image par image (par défaut : un tour du jeu, arrivée → gain → disparition → arrivée)

MODIFIER (chaque écriture garde l'ancienne version dans l'historique)
  rl recette P/S ANIM RECETTE [cle=valeur …] [--t0 MS] [--sel a,b]
  rl cle P/S ANIM PIECE T prop=val … [ease=outBack|[.2,1.8,.4,1]]   pose/complète une clé
  rl suppr P/S ANIM PIECE T [prop …]             retire une clé (ou des propriétés)
  rl anim-set P/S ANIM dur=1370 loop=0 mix=100   réglages d'une animation
  rl renommer P/S ANCIEN NOUVEAU                 renomme une animation
  rl dupliquer P/S ANIM NOUVEAU
  rl piece P/S PIECE cle=valeur …                 réglages d'une pièce (pivot=[x,y], spring={…}, shine={…}, parent=…)
  rl rig P/S cle=valeur …                          réglage global (emitters.braises={…}, mix=140, ik=[…], mixes.win>idle=200)
  rl evenement P/S ANIM T [name=son] [emit=braises n=12] [rate=braises,20]   ajoute un événement
  rl json P/S                                     chemin du rig.json (édition directe)
  rl lot P/S [fichier]                            plusieurs opérations, un seul enregistrement (lignes lues
        dans le fichier ou sur l'entrée standard) :
          cle ANIM PIECE T prop=val … [ease=…]    suppr ANIM PIECE T [prop …]
          recette ANIM RECETTE [cle=val …] [t0=MS] [sel=a,b]
          evenement ANIM T name=… | emit=… n=… | rate=nom,val
          anim ANIM dur=… loop=0|1 mix=…          piece PIECE cle=val …        rig cle=val …
          vider ANIM PIECE [prop …]               (retire la piste, ou ces propriétés)
          ajouter NOM pivot=[x,y] [parent=…] [src=…] [avant=PIECE] …   renommer ANCIEN NOUVEAU
          effacer-anims                            (retire toutes les clés de toutes les animations)
          deplacer PIECE avant=AUTRE | apres=AUTRE (ordre de dessin)
        # commentaire
  rl nouveau P/S IMAGE [--cote 640]               nouveau symbole animé depuis une image
  rl calques P/S BASE.png CALQUE.png:nom … [--separer nom] [--cote 640]
        nouveau symbole depuis des calques de même cadrage (ChatGPT) ; --separer éclate un calque en morceaux

DÉCOUPER (coordonnées en pixels de l'image du symbole)
  rl masque P/S [--poly "x,y x,y …"] [--baguette x,y] [--tol 32] [--diffuse] [--inter] [--contour 6] [--source corps.webp]
        → PNG de contrôle (image + sélection en rose) dans riglab/captures/
  rl decoupe P/S NOM (mêmes options) [--surimpression] [--parent haut]   détache (trou rebouché) ou surimpression
  rl lueur P/S NOM --centres "x,y x,y" [--rayon 70] [--couleur #ffcf6e] [--alpha 200] [--parent haut]
  rl rogner P/S PIECE                              rogne l'image d'une pièce à ses pixels (maillage serré)
  rl copier P/S Q[/S2] [--ecraser]                copie un symbole vers un autre projet
  rl historique P/S | rl restaurer P/S VERSION
  rl moteur PROJET                                installe le moteur v3 dans le jeu (proto/symbol-rig.js)
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.realpath(__file__))
ROOT = os.path.dirname(HERE)
PORT = int(os.environ.get('RIGLAB_PORT', 4390))
URL = f"http://127.0.0.1:{PORT}"
sys.path.insert(0, ROOT)


def serveur():
    try:
        urllib.request.urlopen(URL + '/api/recettes', timeout=2).read()
        return
    except Exception:
        pass
    log = open(os.path.join(ROOT, 'captures', 'serveur.log'), 'a')
    subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py'), str(PORT)], stdout=log, stderr=log,
                     start_new_session=True)
    for _ in range(200):          # 30 s : le premier lancement compile numpy / scipy / opencv
        time.sleep(.15)
        try:
            urllib.request.urlopen(URL + '/api/recettes', timeout=1).read()
            return
        except Exception:
            pass
    sys.exit("le serveur Rig Lab ne démarre pas (voir riglab/captures/serveur.log)")


def api(path, body=None):
    serveur()
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(URL + path, data=data, method='POST' if data is not None else 'GET',
                                 headers={'Content-Type': 'application/json'})
    try:
        return json.loads(urllib.request.urlopen(req, timeout=120).read())
    except urllib.error.HTTPError as e:
        try:
            msg = json.loads(e.read()).get('erreur')
        except Exception:
            msg = str(e)
        sys.exit(f"erreur : {msg}")


def ps(arg):
    if '/' not in arg:
        sys.exit(f"désigner le symbole par projet/symbole (reçu « {arg} »)")
    p, s = arg.split('/', 1)
    return p, s


def lire(p, s):
    return api(f"/api/rig?p={p}&s={s}")


def ecrire(p, s, rig, note=''):
    from urllib.parse import quote
    return api(f"/api/rig?p={p}&s={s}&note={quote(note)}", rig)


def valeur(v):
    try:
        return json.loads(v)
    except Exception:
        return v


def kv(args):
    out = {}
    for a in args:
        if '=' not in a:
            sys.exit(f"attendu cle=valeur, reçu « {a} »")
        k, v = a.split('=', 1)
        out[k] = valeur(v)
    return out


def options(args, noms):
    reste, opt = [], {}
    i = 0
    while i < len(args):
        if args[i].startswith('--') and args[i][2:] in noms:
            opt[args[i][2:]] = args[i + 1] if noms[args[i][2:]] else True
            i += 2 if noms[args[i][2:]] else 1
        else:
            reste.append(args[i])
            i += 1
    return reste, opt


def rendu(query, delai=180000):
    serveur()
    out = subprocess.run(['node', os.path.join(HERE, 'rendu.mjs'), f"{URL}/claude/?{query}", str(delai)],
                         capture_output=True, text=True, cwd=HERE)
    try:
        return json.loads(out.stdout.strip().splitlines()[-1])
    except Exception:
        sys.exit(f"rendu impossible :\n{out.stdout}\n{out.stderr}")


# ------------------------------------------------------------------ affichage


def fmt(v):
    if isinstance(v, float):
        return f"{v:.4g}"
    if isinstance(v, list) and len(v) > 6:
        return f"[{len(v)} valeurs]"
    return json.dumps(v, ensure_ascii=False) if not isinstance(v, (int, str)) else str(v)


def arbre(rig):
    enfants = {}
    for p in rig['parts']:
        enfants.setdefault(p.get('parent'), []).append(p)
    lignes = []

    def f(parent, niv):
        for p in enfants.get(parent, []):
            genre = ('séquence' if p.get('frames') else 'peau' if p.get('mesh', {}).get('bones') else
                     'maillage' if p.get('mesh') else 'lueur' if p.get('blend') == 'add' else 'image' if p.get('src') else 'os')
            extra = [x for x in ('spring', 'jiggle', 'wiggle', 'shine', 'clip') if p.get(x)]
            if p.get('mesh', {}).get('follow'):
                extra.append('suit ' + p['mesh']['follow'])
            lignes.append(f"{'  ' * niv}{p['name']:<14} {genre:<9} pivot {p['pivot']}" + (f"  [{', '.join(extra)}]" if extra else ''))
            f(p['name'], niv + 1)
    f(None, 0)
    return '\n'.join(lignes)


def cmd_voir(p, s):
    rig = lire(p, s)
    print(f"{p}/{s}  taille {rig['size']}  mix {rig.get('mix', 120)} ms  z = ordre de la liste")
    print(arbre(rig))
    print('\nanimations :')
    for n, a in rig.get('anims', {}).items():
        nk = sum(len(t) for t in a.get('tracks', {}).values())
        print(f"  {n:<14} {a['dur']:>5} ms {'boucle' if a.get('loop') else '      '}  {len(a.get('tracks', {}))} pistes, {nk} clés, {len(a.get('events', []))} évén.")
    for x in ('emitters', 'ik', 'constraints', 'skins', 'mixes'):
        if rig.get(x):
            print(f"{x} : {', '.join(rig[x]) if isinstance(rig[x], dict) else json.dumps(rig[x], ensure_ascii=False)}")


def cmd_anim(p, s, anim):
    rig = lire(p, s)
    a = rig['anims'].get(anim)
    if not a:
        sys.exit(f"pas d'animation « {anim} » (il y a : {', '.join(rig['anims'])})")
    print(f"{anim} : {a['dur']} ms, {'boucle' if a.get('loop') else 'une fois'}, mix {a.get('mix', rig.get('mix', 120))} ms")
    for part, tr in a.get('tracks', {}).items():
        print(f"\n  {part}")
        for k in tr:
            props = '  '.join(f"{x}={fmt(v)}" for x, v in k.items() if x not in ('t', 'ease'))
            e = k.get('ease')
            print(f"    {k['t']:>5}  {props}" + (f"   ~{fmt(e)}" if e is not None else ''))
    if a.get('events'):
        print('\n  événements')
        for e in a['events']:
            print(f"    {e['t']:>5}  " + '  '.join(f"{x}={fmt(v)}" for x, v in e.items() if x != 't'))


def cmd_recettes():
    for r in api('/api/recettes'):
        print(f"\n{r['id']:<16} {r['nom']}  [{r['famille']}]" + (f"  idéal : {r['ideal']}" if r.get('ideal') else ''))
        print(f"  {r['desc']}")
        for q in r['params']:
            print(f"    {q['id']}={q.get('defaut')}  ({q['nom']}{', ' + q['unite'] if q.get('unite') else ''})")


def cmd_rendu(p, s, faire, anim=None, n=12, taille=220, temps=None, cols=None, sortie=None):
    q = f"p={p}&s={s}&faire={faire}&n={n}&taille={taille}" + (f"&anim={anim}" if anim else '')
    if temps:
        q += f"&temps={temps}&cols={cols or len(temps.split(','))}"
    elif cols:
        q += f"&cols={cols}"
    if sortie:
        q += f"&sortie={sortie}"
    r = rendu(q)
    if not r.get('ok'):
        sys.exit(f"échec : {r.get('erreur')}\n{r.get('console', '')}")
    for f in r.get('fichiers', []):
        print(f)
    if r.get('rapport'):
        for an, rep in r['rapport'].items():
            print(f"\n{an} — {rep['note']}/10  ({rep.get('duree')} ms, {rep.get('cles')} clés)")
            for pt in rep['points']:
                sym = {'erreur': '✖', 'attention': '▲', 'info': '·', 'ok': '✓'}[pt['niveau']]
                print(f"  {sym} {pt['titre']}" + (f" — {pt['detail']}" if pt.get('detail') else ''))
    if r.get('console'):
        print('console :', r['console'])


def cmd_cle(p, s, anim, part, t, props):
    rig = lire(p, s)
    from lib.recettes import ecrire as poser
    if part not in [x['name'] for x in rig['parts']]:
        sys.exit(f"pièce inconnue : {part}")
    q = {'t': int(float(t))}
    q.update(props)
    if anim not in rig['anims']:
        sys.exit(f"animation inconnue : {anim}")
    poser(rig, anim, part, [q])
    ecrire(p, s, rig, f"clé {anim}/{part}@{t}")
    print(f"clé posée : {anim}/{part} à {t} ms : {props}")


def selection(o):
    sel = {'contour': int(o.get('contour', 6)), 'mode': 'inter' if o.get('inter') else 'union'}
    if o.get('poly'):
        sel['poly'] = [[float(v) for v in pt.split(',')] for pt in o['poly'].split()]
    if o.get('baguette'):
        x, y = o['baguette'].split(',')
        sel['baguette'] = {'x': float(x), 'y': float(y), 'tol': int(o.get('tol', 32)), 'contigu': not o.get('diffuse')}
    return sel


OPT_DEC = {'poly': 1, 'baguette': 1, 'tol': 1, 'diffuse': 0, 'inter': 0, 'contour': 1, 'source': 1, 'surimpression': 0, 'parent': 1}


def cmd_masque(p, s, o):
    import base64
    import io
    from PIL import Image
    r = api('/api/masque', {'p': p, 's': s, 'source': o.get('source', 'corps.webp'), 'sel': selection(o)})
    from server import dossier_sym
    img = Image.open(os.path.join(dossier_sym(p, s), o.get('source', 'corps.webp'))).convert('RGBA')
    fond = Image.new('RGBA', img.size, (24, 26, 34, 255))
    fond.alpha_composite(img)
    m = Image.open(io.BytesIO(base64.b64decode(r['png'].split(',', 1)[1]))).convert('RGBA')
    fond.alpha_composite(m)
    out = os.path.join(ROOT, 'captures', f"masque-{p}-{s}.png")
    fond.save(out)
    print(out)
    print('boîte :', r.get('boite'))


def cmd_decoupe(p, s, nom, o):
    rig = lire(p, s)
    if any(x['name'] == nom for x in rig['parts']):
        sys.exit(f"la pièce {nom} existe déjà")
    src = o.get('source', 'corps.webp')
    action = 'surimpression' if o.get('surimpression') else 'detacher'
    res = api('/api/decoupe', {'p': p, 's': s, 'source': src, 'sel': selection(o), 'nom': nom, 'action': action})
    base = next((x for x in rig['parts'] if x.get('src') == src), None)
    i = rig['parts'].index(base) if base else len(rig['parts']) - 1
    if action == 'detacher':
        parent = o.get('parent') or ('haut' if any(x['name'] == 'haut' for x in rig['parts']) else (base or {}).get('parent'))
        np_ = {'name': nom, 'src': res['fichier'], 'pivot': res['centre']}
        if res.get('offset') and res['offset'] != [0, 0]:
            np_['offset'] = res['offset']
        if parent:
            np_['parent'] = parent
    else:
        np_ = {'name': nom, 'src': res['fichier'], 'pivot': list(base['pivot'])}
        if base.get('parent'):
            np_['parent'] = base['parent']
        if base.get('mesh'):
            np_['mesh'] = dict(json.loads(json.dumps(base['mesh'])), follow=base['name'])
    rig['parts'].insert(i + 1, np_)
    ecrire(p, s, rig, f"découpe {nom}")
    print(f"{action} : {nom} ({res['fichier']}), boîte {res['boite']}, pivot {np_['pivot']}")


def cmd_lueur(p, s, nom, o):
    rig = lire(p, s)
    centres = [[float(v) for v in pt.split(',')] for pt in o['centres'].split()]
    res = api('/api/lueur', {'p': p, 's': s, 'nom': nom, 'centres': centres, 'rayon': float(o.get('rayon', 70)),
                             'couleur': o.get('couleur', '#ffcf6e'), 'alpha': int(o.get('alpha', 200))})
    cx = round(sum(c[0] for c in centres) / len(centres))
    cy = round(sum(c[1] for c in centres) / len(centres))
    parent = o.get('parent') or ('haut' if any(x['name'] == 'haut' for x in rig['parts']) else rig['parts'][0]['name'])
    rig['parts'].append({'name': nom, 'src': res['fichier'], 'pivot': [cx, cy], 'parent': parent, 'blend': 'add', 'offset': res['offset']})
    for a in rig['anims'].values():
        a.setdefault('tracks', {}).setdefault(nom, [{'t': 0, 'alpha': .25}])
    ecrire(p, s, rig, f"lueur {nom}")
    print(f"lueur {nom} : {res['fichier']}, offset {res['offset']}")


def cmd_lot(rig, texte):
    import shlex
    from lib.recettes import ecrire as poser
    n = 0
    for no, ligne in enumerate(texte.splitlines(), 1):
        ligne = ligne.strip()
        if not ligne or ligne.startswith('#'):
            continue
        w = shlex.split(ligne)
        op, args = w[0], w[1:]
        try:
            if op == 'cle':
                anim, pc, t = args[0], args[1], int(float(args[2]))
                if pc not in [x['name'] for x in rig['parts']]:
                    raise ValueError(f"pièce inconnue {pc}")
                q = {'t': t}
                q.update(kv(args[3:]))
                poser(rig, anim, pc, [q])
            elif op == 'suppr':
                anim, pc, t = args[0], args[1], int(float(args[2]))
                tr = rig['anims'][anim]['tracks'].get(pc, [])
                k = next((x for x in tr if abs(x['t'] - t) < 1), None)
                if k:
                    for x in (args[3:] or [x for x in list(k) if x != 't']):
                        k.pop(x, None)
                    if not [x for x in k if x not in ('t', 'ease')]:
                        tr.remove(k)
            elif op == 'vider':
                anim, pc = args[0], args[1]
                tr = rig['anims'][anim].get('tracks', {})
                if len(args) > 2:
                    for k in tr.get(pc, []):
                        for x in args[2:]:
                            k.pop(x, None)
                    tr[pc] = [k for k in tr.get(pc, []) if [x for x in k if x not in ('t', 'ease')]]
                else:
                    tr.pop(pc, None)
            elif op == 'recette':
                anim, rid = args[0], args[1]
                prm = kv(args[2:])
                t0 = float(prm.pop('t0', 0))
                sel = prm.pop('sel', '')
                sel = sel.split(',') if isinstance(sel, str) and sel else sel or []
                r = api('/api/recette', {'rig': rig, 'anim': anim, 'recette': rid, 'params': prm, 't0': t0, 'ctx': {'sel': sel}})
                rig.clear()
                rig.update(r['rig'])
            elif op == 'evenement':
                anim, t = args[0], int(float(args[1]))
                ev = {'t': t}
                for k2, v in kv(args[2:]).items():
                    ev[k2] = [str(v).split(',')[0], float(str(v).split(',')[1])] if k2 == 'rate' else v
                rig['anims'][anim].setdefault('events', []).append(ev)
                rig['anims'][anim]['events'].sort(key=lambda e: e['t'])
            elif op == 'anim':
                an = rig['anims'].setdefault(args[0], {'dur': 1000, 'loop': False, 'tracks': {}})
                for k2, v in kv(args[1:]).items():
                    an[k2] = bool(v) if k2 == 'loop' else v
            elif op == 'piece':
                pt = next(x for x in rig['parts'] if x['name'] == args[0])
                for k2, v in kv(args[1:]).items():
                    if v is None:
                        pt.pop(k2, None)
                    else:
                        pt[k2] = v
            elif op == 'ajouter':
                nom, prm = args[0], kv(args[1:])
                if any(x['name'] == nom for x in rig['parts']):
                    raise ValueError(f"{nom} existe déjà")
                avant = prm.pop('avant', None)
                np_ = {'name': nom, **prm}
                if avant:
                    i = next(i for i, x in enumerate(rig['parts']) if x['name'] == avant)
                    rig['parts'].insert(i, np_)
                else:
                    rig['parts'].append(np_)
            elif op == 'renommer':
                old, new = args[0], args[1]
                for q in rig['parts']:
                    if q['name'] == old:
                        q['name'] = new
                    if q.get('parent') == old:
                        q['parent'] = new
                    if q.get('clip') == old:
                        q['clip'] = new
                    m = q.get('mesh') or {}
                    if m.get('follow') == old:
                        m['follow'] = new
                    for b in m.get('bones', []):
                        if isinstance(b, dict) and b.get('name') == old:
                            b['name'] = new
                for an in rig['anims'].values():
                    if old in an.get('tracks', {}):
                        an['tracks'][new] = an['tracks'].pop(old)
                for e in (rig.get('emitters') or {}).values():
                    if e.get('part') == old:
                        e['part'] = new
            elif op == 'deplacer':
                nom, prm = args[0], kv(args[1:])
                pt = next(x for x in rig['parts'] if x['name'] == nom)
                rig['parts'].remove(pt)
                ref = prm.get('avant') or prm.get('apres')
                i = next(i for i, x in enumerate(rig['parts']) if x['name'] == ref)
                rig['parts'].insert(i if 'avant' in prm else i + 1, pt)
            elif op == 'effacer-anims':
                for an in rig['anims'].values():
                    an['tracks'] = {}
                    an['events'] = []
            elif op == 'rig':
                for k2, v in kv(args).items():
                    cible, *chemin = k2.split('.', 1)
                    if chemin:
                        rig.setdefault(cible, {})[chemin[0]] = v
                    else:
                        rig[cible] = v
            else:
                raise ValueError(f"opération inconnue {op}")
            n += 1
        except SystemExit:
            raise
        except Exception as e:
            sys.exit(f"ligne {no} « {ligne} » : {e}")
    return n


def cmd_suppr(p, s, anim, part, t, props):
    rig = lire(p, s)
    tr = rig['anims'][anim]['tracks'].get(part, [])
    t = int(float(t))
    k = next((x for x in tr if abs(x['t'] - t) < 1), None)
    if not k:
        sys.exit("pas de clé à cet instant")
    if props:
        for x in props:
            k.pop(x, None)
        if not [x for x in k if x not in ('t', 'ease')]:
            tr.remove(k)
    else:
        tr.remove(k)
    ecrire(p, s, rig, f"suppression {anim}/{part}@{t}")
    print("fait")


def main():
    a = sys.argv[1:]
    if not a or a[0] in ('-h', '--help', 'aide'):
        print(__doc__)
        return
    c = a[0]
    if c == 'projets':
        for pr in api('/api/projets'):
            print(f"{pr['id']:<12} {pr['nom']:<14} {len(pr['symboles'])} symbole(s) : {', '.join(x['nom'] for x in pr['symboles'])}")
    elif c == 'voir':
        cmd_voir(*ps(a[1]))
    elif c == 'anim':
        cmd_anim(*ps(a[1]), a[2])
    elif c == 'prompts':
        # pack de prompts ChatGPT pour fabriquer un symbole riggable (lib/prompts.py)
        reste, o = options(a[1:], {'sortie': 1})
        if not reste:
            sys.exit("rl prompts FICHE.json [--sortie pack.md]   (exemple de fiche : riglab/lib/prompts.py)")
        from lib.prompts import depuis_fichier
        texte = depuis_fichier(reste[0])
        out = o.get('sortie') or os.path.join(ROOT, 'captures', 'prompts-' + os.path.splitext(os.path.basename(reste[0]))[0] + '.md')
        with open(out, 'w', encoding='utf-8') as fh:
            fh.write(texte)
        print(out)
    elif c == 'recettes':
        cmd_recettes()
    elif c in ('planche', 'courbes', 'controle', 'tout'):
        reste, o = options(a[1:], {'n': 1, 'taille': 1, 'temps': 1, 'cols': 1, 'sortie': 1})
        p, s = ps(reste[0])
        cmd_rendu(p, s, c, reste[1] if len(reste) > 1 else None, o.get('n', 12), o.get('taille', 220), o.get('temps'), o.get('cols'), o.get('sortie'))
    elif c == 'video':
        reste, o = options(a[1:], {'seq': 1, 'fin': 1, 'vitesse': 1, 'taille': 1, 'sortie': 1})
        p, s = ps(reste[0])
        import shutil
        dossier = f"{p}-{s}".replace('/', '-')
        dimg = os.path.join(ROOT, 'captures', '_images', dossier)
        shutil.rmtree(dimg, ignore_errors=True)
        q = f"p={p}&s={s}&faire=video&dossier={dossier}&taille={o.get('taille', 720)}&vitesse={o.get('vitesse', 1)}"
        if o.get('seq'):
            q += f"&seq={o['seq']}&fin={o.get('fin', 3000)}"
        r2 = rendu(q, 900000)
        if not r2.get('ok'):
            sys.exit(f"échec : {r2.get('erreur')}")
        out = os.path.join(ROOT, 'captures', o.get('sortie') or f"{p}-{s}{'-lent' if float(o.get('vitesse', 1)) < 1 else ''}.mp4")
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '60', '-i', os.path.join(dimg, '%05d.png'),
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '15', '-preset', 'slow', '-movflags', '+faststart', out], check=True)
        shutil.rmtree(dimg, ignore_errors=True)
        print(out, f"({r2['video']['images']} images à 60 i/s)")
    elif c == 'enchainement':
        reste, o = options(a[1:], {'sortie': 1})
        import shutil
        src = reste[0]
        nom_script = 'enchainement-' + os.path.basename(src)
        shutil.copy2(src, os.path.join(ROOT, 'captures', nom_script))
        dimg = os.path.join(ROOT, 'captures', '_images', 'enchainement')
        shutil.rmtree(dimg, ignore_errors=True)
        r2 = rendu(f"faire=enchainement&script={nom_script}&dossier=enchainement", 1800000)
        if not r2.get('ok'):
            sys.exit(f"échec : {r2.get('erreur')}")
        out = os.path.join(ROOT, 'captures', o.get('sortie') or 'enchainement.mp4')
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '60', '-i', os.path.join(dimg, '%05d.png'),
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-preset', 'slow', '-movflags', '+faststart', out], check=True)
        shutil.rmtree(dimg, ignore_errors=True)
        print(out, f"({r2['enchainement']['images']} images à 60 i/s)")
    elif c == 'grille':
        reste, o = options(a[1:], {'anim': 1, 'duree': 1, 'cellule': 1, 'cols': 1, 'sortie': 1})
        p, noms = reste[0], reste[1]
        import shutil
        dimg = os.path.join(ROOT, 'captures', '_images', 'grille')
        shutil.rmtree(dimg, ignore_errors=True)
        q = f"faire=grille&p={p}&noms={noms}&anim={o.get('anim', 'idle')}&duree={o.get('duree', 10000)}&cellule={o.get('cellule', 240)}&cols={o.get('cols', 6)}&dossier=grille"
        r2 = rendu(q, 1800000)
        if not r2.get('ok'):
            sys.exit(f"échec : {r2.get('erreur')}")
        out = os.path.join(ROOT, 'captures', o.get('sortie') or f"grille-{p}.mp4")
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', '60', '-i', os.path.join(dimg, '%05d.png'),
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', out], check=True)
        shutil.rmtree(dimg, ignore_errors=True)
        print(out, f"({r2['grille']['images']} images à 60 i/s)")
    elif c == 'recette':
        reste, o = options(a[1:], {'t0': 1, 'sel': 1})
        p, s = ps(reste[0])
        rig = lire(p, s)
        r = api('/api/recette', {'rig': rig, 'anim': reste[1], 'recette': reste[2], 'params': kv(reste[3:]),
                                 't0': float(o.get('t0', 0)), 'ctx': {'sel': (o.get('sel') or '').split(',') if o.get('sel') else []}})
        ecrire(p, s, r['rig'], f"recette {reste[2]} sur {reste[1]}")
        print(r['info'])
    elif c == 'cle':
        p, s = ps(a[1])
        cmd_cle(p, s, a[2], a[3], a[4], kv(a[5:]))
    elif c == 'suppr':
        p, s = ps(a[1])
        cmd_suppr(p, s, a[2], a[3], a[4], a[5:])
    elif c == 'anim-set':
        p, s = ps(a[1])
        rig = lire(p, s)
        an = rig['anims'].setdefault(a[2], {'dur': 1000, 'loop': False, 'tracks': {}})
        for k2, v in kv(a[3:]).items():
            an[k2] = bool(v) if k2 == 'loop' else v
        ecrire(p, s, rig, f"réglages {a[2]}")
        print(f"{a[2]} : dur {an['dur']} ms, loop {an.get('loop')}, mix {an.get('mix', '—')}")
    elif c == 'renommer':
        p, s = ps(a[1])
        rig = lire(p, s)
        rig['anims'][a[3]] = rig['anims'].pop(a[2])
        ecrire(p, s, rig, f"renomme {a[2]} → {a[3]}")
        print("fait")
    elif c == 'dupliquer':
        p, s = ps(a[1])
        rig = lire(p, s)
        rig['anims'][a[3]] = json.loads(json.dumps(rig['anims'][a[2]]))
        ecrire(p, s, rig, f"duplique {a[2]} → {a[3]}")
        print("fait")
    elif c == 'piece':
        p, s = ps(a[1])
        rig = lire(p, s)
        pt = next((x for x in rig['parts'] if x['name'] == a[2]), None)
        if not pt:
            sys.exit("pièce inconnue")
        for k2, v in kv(a[3:]).items():
            if v is None:
                pt.pop(k2, None)
            else:
                pt[k2] = v
        ecrire(p, s, rig, f"pièce {a[2]}")
        print(json.dumps(pt, ensure_ascii=False))
    elif c == 'rig':
        p, s = ps(a[1])
        rig = lire(p, s)
        for k2, v in kv(a[2:]).items():
            cible, *chemin = k2.split('.', 1)
            if chemin:
                d = rig.setdefault(cible, {})
                if v is None:
                    d.pop(chemin[0], None)
                else:
                    d[chemin[0]] = v
            elif v is None:
                rig.pop(cible, None)
            else:
                rig[cible] = v
        ecrire(p, s, rig, 'réglages du rig')
        print('fait')
    elif c == 'evenement':
        p, s = ps(a[1])
        rig = lire(p, s)
        ev = {'t': int(float(a[3]))}
        for k2, v in kv(a[4:]).items():
            ev[k2] = v.split(',') if k2 == 'rate' and isinstance(v, str) else v
        if 'rate' in ev:
            ev['rate'] = [ev['rate'][0], float(ev['rate'][1])]
        rig['anims'][a[2]].setdefault('events', []).append(ev)
        rig['anims'][a[2]]['events'].sort(key=lambda e: e['t'])
        ecrire(p, s, rig, f"événement {a[2]}@{a[3]}")
        print('événement ajouté :', ev)
    elif c == 'lot':
        p, s = ps(a[1])
        texte = open(a[2]).read() if len(a) > 2 else sys.stdin.read()
        rig = lire(p, s)
        n = cmd_lot(rig, texte)
        ecrire(p, s, rig, f"lot de {n} opérations")
        print(f"{n} opération(s) appliquée(s) et enregistrée(s)")
    elif c == 'json':
        p, s = ps(a[1])
        from server import dossier_sym
        print(os.path.join(dossier_sym(p, s), 'rig.json'))
    elif c == 'nouveau':
        reste, o = options(a[1:], {'cote': 1, 'plein-cadre': 0, 'sans-anim': 0})
        p, s = ps(reste[0])
        import base64
        with open(reste[1], 'rb') as f:
            data = 'data:image/png;base64,' + base64.b64encode(f.read()).decode()
        pc = bool(o.get('plein-cadre'))
        r = api('/api/nouveau', {'p': p, 's': s, 'image': data, 'cote': 0 if pc else int(o.get('cote', 640)), 'rogner': not pc,
                                 'animer': not o.get('sans-anim')})
        print(f"créé : {p}/{s}, taille {r['rig']['size']}, animations {', '.join(r['rig']['anims'])}")
    elif c == 'masque':
        reste, o = options(a[1:], OPT_DEC)
        cmd_masque(*ps(reste[0]), o)
    elif c == 'decoupe':
        reste, o = options(a[1:], OPT_DEC)
        p, s = ps(reste[0])
        cmd_decoupe(p, s, reste[1], o)
    elif c == 'lueur':
        reste, o = options(a[1:], {'centres': 1, 'rayon': 1, 'couleur': 1, 'alpha': 1, 'parent': 1})
        p, s = ps(reste[0])
        cmd_lueur(p, s, reste[1], o)
    elif c == 'rogner':
        p, s = ps(a[1])
        rig = lire(p, s)
        pt = next((x for x in rig['parts'] if x['name'] == a[2]), None)
        if not pt or not pt.get('src'):
            sys.exit("pièce sans image")
        if pt.get('mesh', {}).get('follow') or pt.get('mesh', {}).get('bones'):
            sys.exit("pièce qui suit un maillage ou une peau : on ne la rogne pas (elle doit garder le cadrage du corps)")
        r2 = api('/api/rogner', {'p': p, 's': s, 'fichier': pt['src']})
        off = pt.get('offset', [0, 0])
        pt['offset'] = [off[0] + r2['decalage'][0], off[1] + r2['decalage'][1]]
        ecrire(p, s, rig, f"rogner {a[2]}")
        print(f"{a[2]} : image {r2['taille']}, offset {pt['offset']}")
    elif c == 'calques':
        reste, o = options(a[1:], {'cote': 1, 'separer': 1, 'ecraser': 0})
        p, s = ps(reste[0])
        import base64

        def b64(f):
            with open(f, 'rb') as fh:
                return 'data:image/png;base64,' + base64.b64encode(fh.read()).decode()
        sep = set((o.get('separer') or '').split(','))
        cal = []
        for spec in reste[2:]:
            f, _, nom = spec.rpartition(':')
            cal.append({'nom': nom, 'image': b64(f), 'separer': nom in sep})
        r2 = api('/api/calques', {'p': p, 's': s, 'base': b64(reste[1]), 'calques': cal, 'cote': int(o.get('cote', 640)), 'ecraser': bool(o.get('ecraser'))})
        print(f"créé : {p}/{s}, taille {r2['rig']['size']}, facteur {r2['facteur']}, cadre {r2['cadre']}")
        print('pièces :', ', '.join(x['name'] for x in r2['rig']['parts']))
    elif c == 'copier':
        reste, o = options(a[1:], {'ecraser': 0})
        p, s = ps(reste[0])
        q, _, s2 = reste[1].partition('/')
        api('/api/copier', {'de': {'p': p, 's': s}, 'vers': {'p': q, 's': s2 or s}, 'ecraser': bool(o.get('ecraser'))})
        print(f"copié vers {q}/{s2 or s}")
    elif c == 'historique':
        p, s = ps(a[1])
        for v in api(f"/api/historique?p={p}&s={s}"):
            print(f"{v['v']}  {v['note']}")
    elif c == 'restaurer':
        p, s = ps(a[1])
        rig = api(f"/api/version?p={p}&s={s}&v={a[2]}")
        ecrire(p, s, rig, f"restauration de {a[2]}")
        print("restauré")
    elif c == 'moteur':
        from server import projet
        pr = projet(a[1])
        cible = os.path.join(pr['abs'], 'proto', 'symbol-rig.js')
        if not os.path.isfile(cible):
            sys.exit(f"pas de proto/symbol-rig.js dans {pr['abs']}")
        import shutil
        sauv = cible + f".avant-v3-{time.strftime('%Y%m%d-%H%M%S')}"
        shutil.copy2(cible, sauv)
        shutil.copy2(os.path.join(ROOT, 'engine', 'symbol-rig.js'), cible)
        print(f"moteur v3 installé dans {cible}\nancien gardé : {sauv}")
    else:
        print(__doc__)
        sys.exit(f"commande inconnue : {c}")


if __name__ == '__main__':
    main()
