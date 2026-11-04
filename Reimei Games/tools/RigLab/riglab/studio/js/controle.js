/* CONTRÔLE QUALITÉ : la même analyse que l'atelier de Claude, en direct.
   La note de l'animation ouverte se met à jour après chaque modification. */
import * as PIXI from '../../vendor/pixi.min.mjs';
import { analyser } from '../../engine/analyse.js';
import { S, bus, anim } from './store.js';
import { el, svg, toast } from './ui.js';
import { toggle as toggleRecettes } from './recettes.js';

let last = null, timer = 0, sheetOpen = false;

export function initControle() {
  document.getElementById('bControle').onclick = () => { sheetOpen = !(sheetOpen && !document.getElementById('sheet').hidden); if (sheetOpen) { run(); show(); } else document.getElementById('sheet').hidden = true; };
  for (const ev of ['rig', 'anim', 'open']) bus.on(ev, schedule);
}
function schedule() { clearTimeout(timer); timer = setTimeout(run, 700); }
function run() {
  if (!S.rig || !anim() || S.mode === 'decoupe') return;
  try {
    const seed = Math.random; let s = 7; Math.random = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    last = analyser(PIXI, S.rig, S.tex, S.anim);
    Math.random = seed;
    S.notes[S.anim] = last.note;
    bus.emit('notes');
  } catch (e) { console.warn('analyse', e); last = null; }
  pill();
  if (sheetOpen && !document.getElementById('sheet').hidden && document.getElementById('sheet').dataset.k === 'controle') show();
}
function pill() {
  const b = document.getElementById('bControle'), t = document.getElementById('noteTxt');
  b.classList.remove('good', 'mid', 'bad');
  if (!last) { t.textContent = 'Contrôle'; return; }
  const n = last.note;
  b.classList.add(n >= 8.5 ? 'good' : n >= 6.5 ? 'mid' : 'bad');
  t.textContent = `${n.toFixed(1)} / 10`;
}
function show() {
  const sh = document.getElementById('sheet');
  sh.dataset.k = 'controle';
  sh.innerHTML = '';
  sh.append(el('div', { class: 'sheet-h' }, el('span', { class: 'ic', style: 'color:var(--ok);width:20px;height:20px', html: svg('check') }),
    el('h2', { text: `Contrôle · ${S.anim}` }), el('button', { class: 'icon-btn sm', html: svg('x'), onclick: () => { sh.hidden = true; sheetOpen = false; } })));
  const b = el('div', { class: 'sheet-b' });
  if (!last) { b.append(el('p', { class: 'note-p', text: 'Rien à analyser.' })); sh.append(b); sh.hidden = false; return; }
  const col = last.note >= 8.5 ? 'var(--ok)' : last.note >= 6.5 ? 'var(--warn)' : 'var(--err)';
  b.append(el('div', { style: 'display:flex;align-items:baseline;gap:10px;margin:2px 0 10px' },
    el('b', { style: `font:750 34px var(--ui);color:${col}`, text: last.note.toFixed(1) }), el('span', { style: 'color:var(--txt3)', text: '/ 10' }),
    el('span', { style: 'margin-left:auto;color:var(--txt3);font-size:11.5px', text: `${last.cles} clés · ${last.duree} ms${last.boucle ? ' · boucle' : ''}` })));
  b.append(el('p', { class: 'note-p', text: 'Les lois studio : rien de linéaire, rien de simultané, rien sans anticipation, rien ne s\'arrête net. Clique un point pour aller à l\'instant concerné.' }));
  const ICON = { erreur: ['x', 'var(--err)'], attention: ['bolt', 'var(--warn)'], info: ['more', 'var(--txt3)'], ok: ['check', 'var(--ok)'] };
  for (const p of last.points) {
    const [ic, c] = ICON[p.niveau];
    const row = el('div', { class: 'rcard', style: 'cursor:' + (p.t !== undefined ? 'pointer' : 'default') },
      el('div', { class: 'rh', style: 'align-items:flex-start' }, el('span', { class: 'ri', style: `color:${c};width:26px;height:26px`, html: svg(ic) }),
        el('div', { class: 'rt' }, el('b', { text: p.titre, style: 'white-space:normal' }), p.detail ? el('span', { text: p.detail, style: 'white-space:normal' }) : null)));
    if (p.t !== undefined) row.onclick = () => { S.playing = false; bus.emit('playstate'); S.t = Math.round(p.t); if (p.piece) S.sel = [p.piece]; bus.emit('sel'); bus.emit('time'); };
    if (/Recette « ([^»]+) »/.test(p.detail || '')) {
      row.querySelector('.rt').append(el('button', { class: 'btn sm accent', style: 'margin-top:7px', html: svg('spark') + 'Ouvrir les recettes', onclick: (e) => { e.stopPropagation(); toggleRecettes(true); } }));
    }
    b.append(row);
  }
  sh.append(b);
  sh.hidden = false;
}
export function lastReport() { return last; }
void toast;
