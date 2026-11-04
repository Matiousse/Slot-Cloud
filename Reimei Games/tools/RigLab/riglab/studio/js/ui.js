/* Petits composants d'interface : champs numériques à glisser, menus,
   fenêtres, sections repliables, notifications. */
import { svg, ic } from './icons.js';

export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}

/* ---------------- notifications ---------------- */
let toastT;
export function toast(msg, kind = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast ' + kind; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), kind === 'err' ? 4200 : 2200);
}

/* ---------------- menu contextuel ---------------- */
export function menu(x, y, items) {
  const m = document.getElementById('menu');
  m.innerHTML = '';
  for (const it of items) {
    if (!it) continue;
    if (it === '-') { m.append(el('hr')); continue; }
    if (it.head) { m.append(el('div', { class: 'mh', text: it.head })); continue; }
    const b = el('button', { class: it.danger ? 'danger' : '', disabled: it.disabled },
      it.icon ? el('span', { class: 'ic', html: svg(it.icon) }) : el('span', { class: 'ic' }),
      el('span', { text: it.label }), it.key ? el('span', { class: 'k', text: it.key }) : null);
    b.onclick = () => { closeMenu(); it.fn && it.fn(); };
    m.append(b);
  }
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
  setTimeout(() => addEventListener('pointerdown', outside, { capture: true }), 0);
}
function outside(e) { if (!document.getElementById('menu').contains(e.target)) closeMenu(); }
export function closeMenu() { document.getElementById('menu').hidden = true; removeEventListener('pointerdown', outside, { capture: true }); }

/* ---------------- fenêtre ---------------- */
export function modal({ title, text = '', fields = [], ok = 'Valider', cancel = 'Annuler', danger = false, extra = null }) {
  return new Promise((resolve) => {
    const back = document.getElementById('modal'), box = document.getElementById('modalBox');
    box.innerHTML = '';
    box.append(el('h2', { text: title }));
    if (text) box.append(el('p', { html: text }));
    const inputs = {};
    for (const f of fields) {
      let inp;
      if (f.type === 'select') {
        inp = el('select', { class: 'sel' }, ...f.options.map((o) => el('option', { value: o.value ?? o, selected: (o.value ?? o) === f.value }, o.label ?? o)));
      } else if (f.type === 'file') {
        inp = el('input', { type: 'file', accept: f.accept || 'image/*', class: 'txt', style: 'padding-top:6px' });
      } else {
        inp = el('input', { class: 'txt', value: f.value ?? '', placeholder: f.placeholder || '', type: f.type || 'text', spellcheck: 'false' });
      }
      inputs[f.id] = inp;
      box.append(el('div', { class: 'field' }, el('label', { text: f.label }), inp, f.help ? el('span', { class: 'note-p', text: f.help }) : null));
    }
    if (extra) box.append(extra);
    const done = (v) => { back.hidden = true; removeEventListener('keydown', key, true); resolve(v); };
    const collect = () => { const o = {}; for (const [k, i] of Object.entries(inputs)) o[k] = i.type === 'file' ? i.files[0] : i.value; return o; };
    const bOk = el('button', { class: 'btn ' + (danger ? 'danger' : 'primary'), text: ok, onclick: () => done(collect()) });
    box.append(el('div', { class: 'acts' }, cancel ? el('button', { class: 'btn ghost', text: cancel, onclick: () => done(null) }) : null, bOk));
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(null); } if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); e.stopPropagation(); done(collect()); } };
    addEventListener('keydown', key, true);
    back.hidden = false;
    back.onpointerdown = (e) => { if (e.target === back) done(null); };
    setTimeout(() => (Object.values(inputs)[0] || bOk).focus(), 30);
  });
}
export const ask = async (title, label, value = '', text = '') => { const r = await modal({ title, text, fields: [{ id: 'v', label, value }] }); return r ? r.v.trim() : null; };
export const confirmBox = async (title, text, ok = 'Confirmer', danger = true) => !!(await modal({ title, text, ok, danger }));

/* ---------------- sections repliables ---------------- */
const closed = new Set(JSON.parse((() => { try { return localStorage.getItem('riglab.closed') || '[]'; } catch (e) { return '[]'; } })()));
export function section(id, title, build, { actions = null, startClosed = false } = {}) {
  const isClosed = closed.has(id) || (startClosed && !closed.has('!' + id));
  const body = el('div', { class: 'sb' });
  const head = el('div', { class: 'sh' }, el('span', { class: 'car' }), el('h4', { text: title }), actions ? el('div', { class: 'sh-act', onclick: (e) => e.stopPropagation() }, actions) : null);
  const s = el('div', { class: 'sec' + (isClosed ? ' closed' : '') }, head, body);
  head.onclick = () => {
    s.classList.toggle('closed');
    const c = s.classList.contains('closed');
    closed.delete(id); closed.delete('!' + id);
    if (c) closed.add(id); else if (startClosed) closed.add('!' + id);
    try { localStorage.setItem('riglab.closed', JSON.stringify([...closed])); } catch (e) { /* rien */ }
  };
  build(body);
  return s;
}

/* pendant un glisser, les panneaux ne se redessinent pas (sinon l'élément
   saisi disparaît sous le curseur) ; ils le font au relâcher */
export const busy = { v: false, after: null };
export function busyStart() { busy.v = true; }
export function busyEnd() { busy.v = false; const f = busy.after; busy.after = null; if (f) f(); }

/* ---------------- champ numérique à glisser (avec losange de clé) ----------------
   opts : label, value, step, min, max, digits, onInput(v) (aperçu en direct),
          onChange(v) (valeur finale), keyState ('keyed' | 'animated' | ''),
          onKey() (clic sur le losange), title */
export function numRow(o) {
  const digits = o.digits ?? (o.step < .01 ? 3 : o.step < 1 ? 2 : 0);
  const fmt = (v) => (Number.isFinite(v) ? (+v.toFixed(digits)).toString() : '0');
  const inp = el('input', { class: 'num', value: fmt(o.value), spellcheck: 'false' });
  const lab = el('span', { class: 'pl', text: o.label, title: o.title || 'Glisser pour changer la valeur (Maj : plus vite, Alt : plus fin)' });
  const kd = o.onKey ? el('button', { class: 'kd', title: 'Clé : poser / retirer' }, el('i')) : el('span');
  const row = el('div', { class: 'prow ' + (o.keyState || '') }, lab, inp, kd);
  const clamp = (v) => Math.max(o.min ?? -Infinity, Math.min(o.max ?? Infinity, v));
  let cur = o.value;
  lab.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const x0 = e.clientX, v0 = cur;
    lab.setPointerCapture(e.pointerId);
    busyStart();
    document.body.style.cursor = 'ew-resize';
    const mv = (ev) => {
      const f = ev.shiftKey ? 10 : ev.altKey ? .1 : 1;
      cur = clamp(v0 + Math.round((ev.clientX - x0) / 2) * (o.step || 1) * f);
      inp.value = fmt(cur); o.onInput && o.onInput(cur);
    };
    const up = () => { lab.removeEventListener('pointermove', mv); lab.removeEventListener('pointerup', up); document.body.style.cursor = ''; if (cur !== v0) o.onChange && o.onChange(cur); busyEnd(); };
    lab.addEventListener('pointermove', mv); lab.addEventListener('pointerup', up);
  });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') inp.blur();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      cur = clamp(cur + (e.key === 'ArrowUp' ? 1 : -1) * (o.step || 1) * (e.shiftKey ? 10 : 1));
      inp.value = fmt(cur); o.onChange && o.onChange(cur);
    }
    e.stopPropagation();
  });
  inp.addEventListener('change', () => {
    let v = inp.value.replace(',', '.');
    try { v = Function(`"use strict";return (${v})`)(); } catch (e) { v = NaN; }
    if (!Number.isFinite(v)) { inp.value = fmt(cur); return; }
    cur = clamp(v); inp.value = fmt(cur); o.onChange && o.onChange(cur);
  });
  inp.addEventListener('focus', () => inp.select());
  if (o.onKey) kd.onclick = () => o.onKey();
  return row;
}

export function selRow(label, options, value, onChange) {
  const s = el('select', { class: 'sel' }, ...options.map((o) => el('option', { value: o.value ?? o, selected: String(o.value ?? o) === String(value) }, o.label ?? o)));
  s.onchange = () => onChange(s.value);
  return el('div', { class: 'srow' }, el('label', { text: label }), s);
}
export function switchRow(label, on, onChange, help) {
  const b = el('button', { class: 'switch' + (on ? ' on' : ''), title: help || '' });
  b.onclick = () => { b.classList.toggle('on'); onChange(b.classList.contains('on')); };
  return el('div', { class: 'srow' }, el('label', { text: label }), b);
}
export function colorRow(label, value, onChange, keyState, onKey) {
  const i = el('input', { type: 'color', class: 'color-in', value: normHex(value) });
  i.oninput = () => onChange(i.value, false);
  i.onchange = () => onChange(i.value, true);
  const kd = onKey ? el('button', { class: 'kd' }, el('i')) : el('span');
  if (onKey) kd.onclick = onKey;
  return el('div', { class: 'prow ' + (keyState || '') }, el('span', { class: 'pl', text: label }), i, kd);
}
export function normHex(v) {
  if (typeof v === 'number') return '#' + v.toString(16).padStart(6, '0');
  if (!v) return '#ffffff';
  return v.startsWith('#') ? v.slice(0, 7) : '#' + v;
}
export function textRow(label, value, onChange) {
  const i = el('input', { class: 'txt', value: value ?? '', spellcheck: 'false' });
  i.onchange = () => onChange(i.value);
  i.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); };
  return el('div', { class: 'srow' }, el('label', { text: label }), i);
}
export { ic, svg };
