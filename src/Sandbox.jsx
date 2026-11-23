import { useEffect, useRef, useState } from 'react';
import { useStore, actions, get, SERVER_DEFAULTS } from './store.js';
import { CODE, TASK, SPECS, CASES, lineOf, fmt } from './data.js';
import Mascot from './Mascot.jsx';
import XyzApp, { FW } from './XyzApp.jsx';
import CodeView, { linesFor } from './Code.jsx';
import { Button, Icon, Tag, COL, Spinner, Triangle } from './ui.jsx';
import { Thumb } from './Recording.jsx';

// ------------------------------------------------------------------ ideas & conditions
export const IDEAS = [
  { id: 'email', title: 'A new user turns off email, saves and refreshes', expect: 'Email notifications is still off after the refresh.', spec: 2, setup: { role: 'new', network: 'normal' }, conds: [['email', false], ['saved', true], ['error', false]],
    todo: [['Turn off Email notifications', (a) => a.type === 'toggle' && a.key === 'email'], ['Click Save changes', (a) => a.type === 'save'], ['Refresh the page', (a) => a.type === 'refresh']] },
  { id: 'admin', title: 'An admin turns off Product updates, saves and refreshes', expect: 'Product updates is still off after the refresh.', spec: 2, setup: { role: 'admin', network: 'normal' }, conds: [['updates', false], ['saved', true], ['error', false]],
    todo: [['Turn off Product updates', (a) => a.type === 'toggle' && a.key === 'updates'], ['Click Save changes', (a) => a.type === 'save'], ['Refresh the page', (a) => a.type === 'refresh']] },
  { id: 'offline', title: 'Save while offline', expect: 'An error is shown and Product updates stays on screen.', spec: 4, setup: { role: 'new', network: 'offline' }, conds: [['error', true], ['updates', true], ['saved', false]],
    todo: [['Turn on Product updates', (a) => a.type === 'toggle' && a.key === 'updates'], ['Click Save changes', (a) => a.type === 'save']] },
];
const CONDS = {
  email: { label: 'Email notifications', on: 'On', off: 'Off' },
  updates: { label: 'Product updates', on: 'On', off: 'Off' },
  error: { label: 'Error message', on: 'Shown', off: 'Not shown' },
  saved: { label: 'Changes saved', on: 'Yes', off: 'No' },
};
const actual = (F, key) => (key === 'email' ? F.email : key === 'updates' ? F.updates : key === 'error' ? F.banner === 'error' : F.lastSaveOk === true);
const word = (key, v) => (v ? CONDS[key].on : CONDS[key].off).toLowerCase();

// ------------------------------------------------------------------ the app's rules (the agent's fixed code)
const CUR = { email: [1022, 271], updates: [1022, 345], save: [356, 501], reload: [97, 22], open: [640, 300] };
function startState(setup) {
  const server = { admin: { ...SERVER_DEFAULTS.admin }, new: { ...SERVER_DEFAULTS.new } };
  const prefs = setup.role === 'out' ? { email: true, updates: false } : server[setup.role];
  return { server, lastSaveOk: null, app: { role: setup.role, network: setup.network, browser: 'Chrome', ...prefs, banner: null, toast: null, saving: false, reload: false } };
}
function apply(st, a) {
  const app = { ...st.app, toast: null, saving: false, reload: false };
  let server = st.server,
    lastSaveOk = st.lastSaveOk;
  if (a.type === 'role') {
    app.role = a.value;
    app.banner = null;
    if (a.value !== 'out') Object.assign(app, server[a.value]);
  } else if (a.type === 'network') app.network = a.value;
  else if (a.type === 'browser') app.browser = a.value;
  else if (a.type === 'toggle') {
    app[a.key] = !app[a.key];
    app.banner = null;
  } else if (a.type === 'save') {
    if (app.role !== 'out') {
      if (app.network === 'offline') {
        app.banner = 'error';
        lastSaveOk = false;
      } else {
        server = { ...server, [app.role]: { email: app.email, updates: app.updates } };
        app.banner = null;
        app.toast = 'Changes saved';
        lastSaveOk = true;
      }
    }
  } else if (a.type === 'refresh') {
    app.banner = null;
    if (app.role !== 'out') Object.assign(app, server[app.role]);
  }
  return { app, server, lastSaveOk };
}
const shot = (app, cursor, label, extra = {}) => ({ label, cursor, app: { ...app, offline: app.network === 'offline' }, ...extra });
export function replay(setup, list) {
  let st = startState(setup);
  const snaps = [shot(st.app, CUR.open, setupLabel(setup))];
  for (const a of list) {
    if (a.type === 'save') snaps.push(shot({ ...st.app, saving: true }, CUR.save, 'Click Save changes'));
    if (a.type === 'refresh') snaps.push(shot({ ...st.app, reload: true }, CUR.reload, 'Refresh the page'));
    st = apply(st, a);
    snaps.push(shot(st.app, a.cursor || CUR.open, a.result || a.label));
  }
  return { snaps, final: { ...st.app, lastSaveOk: st.lastSaveOk } };
}
const setupLabel = (s) => `${s.role === 'admin' ? 'Signed in as an admin' : s.role === 'out' ? 'Signed out' : 'Signed in as a new user'}${s.network === 'offline' ? ', offline' : s.network === 'slow' ? ', slow network' : ''}`;

// ------------------------------------------------------------------ code lines each action runs
const L = (needle, from) => lineOf(CODE.fixed, needle, from ? lineOf(CODE.fixed, from) : 0);
const LINES = {
  email: () => [L('onEmailChange={setEmail}'), L('email={email}')],
  updates: () => [L('onUpdatesChange={setUpdates}'), L('updates={updates}')],
  save: () => Array.from({ length: 9 }, (_, i) => L('async function handleSave') + i),
  fail: () => [L('} catch {'), L("setStatus('error')"), L("status === 'error'")],
  refresh: () => Array.from({ length: 7 }, (_, i) => L('useEffect(() => {') + i),
  out: () => [L('if (!session.user) {', 'async function handleSave'), L('<Banner tone="info"'), L('Sign in to manage')],
};
const linesFor_ = (a, st) => (a.type === 'toggle' ? LINES[a.key]() : a.type === 'save' ? (st.app.network === 'offline' ? LINES.fail() : LINES.save()) : a.type === 'refresh' ? LINES.refresh() : a.type === 'role' && a.value === 'out' ? LINES.out() : []);

// ------------------------------------------------------------------ live sandbox api
const sb = () => get().sandbox;
function record(a) {
  const s = sb();
  const cur = { app: s.app, server: s.server, lastSaveOk: s.lastSaveOk };
  const next = apply(cur, a);
  actions.sandbox({ ...next, actions: [...s.actions, { ...a, t: Date.now() - s.startedAt }], lines: linesFor_(a, cur), linesAt: Date.now() });
}
const api = {
  role(v) {
    if (sb().app.role === v) return;
    record({ type: 'role', value: v, label: v === 'out' ? 'Sign out' : v === 'admin' ? 'Sign in as an admin' : 'Sign in as a new user', cursor: CUR.open });
  },
  network(v) {
    if (sb().app.network === v) return;
    record({ type: 'network', value: v, label: v === 'offline' ? 'Go offline' : v === 'slow' ? 'Switch to a slow network' : 'Go back online', cursor: CUR.open });
  },
  browser(v) {
    if (sb().app.browser === v) return;
    record({ type: 'browser', value: v, label: `Switch to ${v}`, cursor: CUR.open });
  },
  toggle(key) {
    const on = !sb().app[key];
    record({ type: 'toggle', key, label: `Turn ${on ? 'on' : 'off'} ${key === 'email' ? 'Email notifications' : 'Product updates'}`, cursor: CUR[key] });
  },
  save() {
    const s = sb();
    if (s.app.saving || s.app.role === 'out') return;
    actions.sandbox({ app: { ...s.app, saving: true, toast: null, banner: null }, lines: LINES.save(), linesAt: Date.now() });
    const ms = s.app.network === 'slow' ? 1800 : 650;
    setTimeout(() => {
      const now = sb();
      if (!now) return;
      const offline = now.app.network === 'offline';
      record({ type: 'save', label: 'Click Save changes', result: offline ? 'Save failed: the error is shown' : 'Saved on the server', cursor: CUR.save });
    }, ms);
  },
  refresh() {
    const s = sb();
    if (s.app.reload) return;
    actions.sandbox({ app: { ...s.app, reload: true, toast: null } });
    setTimeout(() => sb() && record({ type: 'refresh', label: 'Refresh the page', result: 'Page reloaded from the server', cursor: CUR.reload }), 700);
  },
  pickIdea(id) {
    const idea = IDEAS.find((x) => x.id === id);
    const st = startState(idea.setup);
    actions.sandbox({ idea: id, expect: idea.expect, spec: idea.spec, name: idea.title, setup: idea.setup, step: 2, ...st, actions: [], verify: null, startedAt: Date.now(), lines: [], conds: idea.conds.map(([key, val]) => ({ key, val, on: true })) });
  },
  restart() {
    const s = sb();
    actions.sandbox({ ...startState(s.setup), actions: [], verify: null, startedAt: Date.now(), lines: [] });
  },
  undo() {
    const s = sb();
    const list = s.actions.slice(0, -1);
    const { final } = replay(s.setup, list);
    const st = startState(s.setup);
    let cur = st;
    for (const a of list) cur = apply(cur, a);
    actions.sandbox({ ...cur, actions: list, lines: [] });
    void final;
  },
  setCond(i, patch) {
    const s = sb();
    actions.sandbox({ conds: s.conds.map((c, j) => (j === i ? { ...c, ...patch } : c)), verify: null });
  },
  verify() {
    actions.sandbox({ step: 3 });
    const s = sb();
    const { snaps, final } = replay(s.setup, s.actions);
    actions.sandbox({ verify: { running: true, i: 0, snaps, final } });
    let i = 0;
    const id = setInterval(() => {
      const now = sb();
      if (!now || !now.verify) return clearInterval(id);
      i++;
      if (i < snaps.length) {
        actions.sandbox({ verify: { ...now.verify, i } });
        return;
      }
      clearInterval(id);
      const results = now.conds.filter((c) => c.on).map((c) => ({ ...c, got: actual(final, c.key), ok: actual(final, c.key) === c.val }));
      actions.sandbox({ verify: { ...now.verify, running: false, done: true, results, passed: results.length > 0 && results.every((r) => r.ok) } });
    }, 850);
  },
};

// ------------------------------------------------------------------ your own test case
// The developer describes a case (in words, or from options). SpecSight turns it into
// steps, runs them on a sandbox copy with the agent's code and checks the outcome.
const KEY_NAME = { email: 'Email notifications', updates: 'Product updates' };
const ROLE_WORD = { admin: 'an admin', new: 'a new user', out: 'a signed-out user' };

// The agent's 14 tests ran as an admin, on Chrome, on a normal network.
function coverage(t) {
  const why = [];
  if (t.setup.role === 'new') why.push('The agent only tested as an admin, not as a new user.');
  if (t.setup.browser !== 'Chrome') why.push(`The agent only tested on Chrome, not ${t.setup.browser}.`);
  if (t.setup.network === 'slow') why.push('The agent never tested on a slow network.');
  const types = t.actions.map((a) => a.type);
  const toggledEmail = t.actions.some((a) => a.type === 'toggle' && a.key === 'email');
  if (toggledEmail && t.setup.network !== 'offline' && types.includes('save') && types.includes('refresh')) why.push('The agent checked saving after a refresh with Product updates only, not Email.');
  if (t.setup.network !== 'offline' && types.includes('refresh') && !types.includes('save') && t.actions.some((a) => a.type === 'toggle')) why.push('The agent never refreshed with unsaved changes.');
  if (t.actions.some((a) => a.type === 'role' && a.value === 'out') && t.setup.role !== 'out') why.push('The agent never signed out and back in during a test.');
  if (why.length) return { fresh: true, why };
  let like = null;
  if (t.setup.role === 'out') like = 's5a';
  else if (t.setup.network === 'offline') like = 's4a';
  else if (types.includes('refresh') && types.includes('save')) like = 's2d';
  else if (types.includes('refresh')) like = 's2b';
  else if (types.includes('save')) like = 's2c';
  else like = t.actions.some((a) => a.key === 'email') ? 's1a' : 's1b';
  return { fresh: false, like: CASES.find((c) => c.id === like) };
}
// Why a failed case may still be the right behaviour.
function explain(t) {
  const types = t.actions.map((a) => a.type);
  const iSave = types.lastIndexOf('save');
  const iRef = types.lastIndexOf('refresh');
  if (t.setup.role === 'out') return 'Signed-out users can’t change settings, so the page asks them to sign in. That matches Spec 5.';
  if (t.setup.network === 'offline' && iSave >= 0 && iRef > iSave) return 'The save failed because the app was offline, so nothing reached the server. After the refresh the page loads the last saved choice. Spec 4 only asks that the choice stays on screen until then.';
  if (iRef >= 0 && (iSave < 0 || iSave < types.findLastIndex((x) => x === 'toggle'))) return 'The change was never saved, so the refresh loads the saved choice from the server. That is the expected behaviour.';
  return null;
}
function specFor(t) {
  const types = t.actions.map((a) => a.type);
  if (t.setup.role === 'out') return 5;
  if (t.setup.network === 'offline' && types.includes('save')) return 4;
  if (t.expect.some((e) => e.key === 'error')) return 4;
  if (types.includes('refresh') || types.includes('save')) return 2;
  return 1;
}

// Build the runnable test from a setup, a list of intents and expectations.
function build(setup, intents, expect) {
  let st = startState(setup);
  const acts = [];
  const notes = [];
  for (const it of intents) {
    if (it.type === 'set') {
      if (st.app.role === 'out') {
        if (!acts.length) {
          const a = { type: 'open', label: 'Open the notification settings', result: 'Asked to sign in, no settings shown', cursor: CUR.open };
          acts.push(a);
          notes.push('Signed-out users are asked to sign in, so there is nothing to turn on or off.');
        }
        continue;
      }
      if (st.app[it.key] === it.value) {
        notes.push(`${KEY_NAME[it.key]} is already ${it.value ? 'on' : 'off'} for ${ROLE_WORD[setup.role]}, so this step is skipped.`);
        continue;
      }
      const a = { type: 'toggle', key: it.key, label: `Turn ${it.value ? 'on' : 'off'} ${KEY_NAME[it.key]}`, cursor: CUR[it.key] };
      acts.push(a);
      st = apply(st, a);
    } else if (it.type === 'save') {
      const off = st.app.network === 'offline';
      const a = { type: 'save', label: 'Click Save changes', result: st.app.role === 'out' ? 'Nothing to save while signed out' : off ? 'Save failed: the error is shown' : 'Saved on the server', cursor: CUR.save };
      acts.push(a);
      st = apply(st, a);
    } else if (it.type === 'refresh') {
      const a = { type: 'refresh', label: it.label || 'Refresh the page', result: 'Page reloaded from the server', cursor: CUR.reload };
      acts.push(a);
      st = apply(st, a);
    } else if (it.type === 'relogin') {
      const back = st.app.role;
      if (back === 'out') continue;
      for (const a of [
        { type: 'role', value: 'out', label: 'Sign out', cursor: CUR.open },
        { type: 'role', value: back, label: 'Sign back in', cursor: CUR.open },
      ]) {
        acts.push(a);
        st = apply(st, a);
      }
    }
  }
  const t = { setup, actions: acts, expect, notes };
  t.spec = specFor(t);
  return t;
}

// ---- plain-words reader
function readWords(raw) {
  const text = ' ' + raw.toLowerCase().replace(/[’']/g, "'") + ' ';
  const setup = {
    role: /\b(signed[- ]out|logged[- ]out|not signed in|not logged in|guest|without signing in)\b/.test(text) ? 'out' : /\badmin/.test(text) ? 'admin' : 'new',
    network: /\b(offline|no internet|no connection|loses? (the )?connection|network (is )?down|wi-?fi (is )?off)\b/.test(text) ? 'offline' : /\bslow\b/.test(text) ? 'slow' : 'normal',
    browser: /\bsafari\b/.test(text) ? 'Safari' : /\bfirefox\b/.test(text) ? 'Firefox' : 'Chrome',
  };
  const cut = text.search(/\b(should|expect|expected|must|make sure|check that|then (it|the page|the app) (shows|says)|is still|are still|stays?|remains?|keeps?)\b/);
  // the expectation starts at the clause holding the keyword ("Email should still be off")
  const from = cut > 0 ? Math.max(...['.', ',', ';', ' and ', ' then ', ' after that '].map((x) => text.lastIndexOf(x, cut) + (text.lastIndexOf(x, cut) >= 0 ? x.length : 0)), 0) : -1;
  const doPart = cut > 0 ? text.slice(0, from) : text;
  const expPart = cut > 0 ? text.slice(from) : '';
  const KEY = '(email(?: notifications?)?|emails|product updates?|updates)';
  const keyOf = (w) => (w.startsWith('email') ? 'email' : 'updates');
  const found = [];
  const push = (i, it) => found.push({ i, it });
  let m;
  const r1 = new RegExp(`\\b(?:turns?|turned|turning|switch(?:es|ed)?|toggles?|toggled|sets?|puts?)\\s+(on|off)?\\s*(?:the\\s+|their\\s+|his\\s+|her\\s+|my\\s+)?${KEY}\\s*(on|off)?`, 'g');
  while ((m = r1.exec(doPart))) push(m.index, { type: 'set', key: keyOf(m[2]), value: (m[1] || m[3] || 'on') === 'on' });
  const r2 = new RegExp(`\\b(?:enables?|enabled|disables?|disabled|unchecks?|checks?)\\s+(?:the\\s+)?${KEY}`, 'g');
  while ((m = r2.exec(doPart))) push(m.index, { type: 'set', key: keyOf(m[1]), value: !/dis|uncheck/.test(m[0]) });
  const r3 = /\b(sav(?:e|es|ed|ing)|hits? save|clicks? save|submits?)\b/g;
  while ((m = r3.exec(doPart))) if (!/\b(without|not|never|don't|doesn't|no)\s+(\w+\s+)?$/.test(doPart.slice(Math.max(0, m.index - 16), m.index))) push(m.index, { type: 'save' });
  const r4 = /\b(refresh(?:es|ed|ing)?|reload(?:s|ed|ing)?|comes? back|goes back to the page|reopens?|opens? (?:it |the page )?(?:again|in a new tab)|new tab|closes? the tab)\b/g;
  while ((m = r4.exec(doPart))) push(m.index, { type: 'refresh', label: /tab/.test(m[0]) ? 'Open the page in a new tab' : /back|reopen|again/.test(m[0]) ? 'Come back to the page' : 'Refresh the page' });
  const r5 = /\b(signs?|logs?|signed|logged) out and (?:signs?|logs?)? ?(?:back )?in\b/g;
  while ((m = r5.exec(doPart))) push(m.index, { type: 'relogin' });
  if (!found.length && cut > 0) {
    // "Email stays off after a refresh": the steps are inside the expectation
    const rest = text.slice(from);
    if ((m = /\b(refresh(?:es|ed|ing)?|reload(?:s|ed|ing)?|comes? back|coming back|reopen(?:s|ed|ing)?|new tab)\b/.exec(rest))) push(1000 + m.index, { type: 'refresh', label: /tab/.test(m[0]) ? 'Open the page in a new tab' : 'Refresh the page' });
    if (/\b(sav(e|es|ed|ing))\b/.test(rest) && !/\bwithout sav/.test(rest)) push(999, { type: 'save' });
  }
  found.sort((a, b) => a.i - b.i);
  const intents = [];
  for (const f of found) {
    const last = intents[intents.length - 1];
    if (last && last.type === f.it.type && f.it.type !== 'set') continue;
    intents.push(f.it);
  }

  const expect = [];
  const add = (key, val) => !expect.some((e) => e.key === key) && expect.push({ key, val });
  const e1 = new RegExp(`${KEY}[^.,;]{0,24}?\\b(on|off|enabled|disabled)\\b`, 'g');
  while ((m = e1.exec(expPart))) add(keyOf(m[1]), m[2] === 'on' || m[2] === 'enabled');
  const e2 = new RegExp(`\\b(on|off)\\b[^.,;]{0,10}?${KEY}`, 'g');
  while ((m = e2.exec(expPart))) add(keyOf(m[2]), m[1] === 'on');
  if (/\berror\b/.test(expPart)) add('error', !/\b(no|not|without|never)\b[^.,;]{0,20}\berror|\berror[^.,;]{0,12}\b(not|never)\b/.test(expPart));
  if (/\b(saved message|says saved|shows saved|"saved"|be saved|gets saved|is saved|are saved|saves?)\b/.test(expPart) && !expect.some((e) => e.key === 'error')) add('saved', !/\b(not|never|isn't|aren't|doesn't)\b[^.,;]{0,12}\bsav/.test(expPart));
  if (!expect.some((e) => e.key === 'email' || e.key === 'updates') && /\b(same|choices?|choice|settings?|preferences?|what (i|they|he|she) (set|chose))\b/.test(expPart)) {
    for (const it of intents) if (it.type === 'set') add(it.key, it.value);
  }
  // no "should": read an outcome from whatever comes after the last step ("... reload. updates on")
  if (!expect.length && found.length) {
    const tail = doPart.slice(found[found.length - 1].i + 4).replace(/^[a-z]*/, '');
    const t1 = new RegExp(`${KEY}[^.,;]{0,24}?\\b(on|off)\\b`, 'g');
    while ((m = t1.exec(tail))) add(keyOf(m[1]), m[2] === 'on');
  }
  // implied: the setting they expect must first be set, and kept means saved before a refresh
  const sets = intents.filter((x) => x.type === 'set');
  const exp = expect.filter((e) => e.key === 'email' || e.key === 'updates');
  if (!sets.length && exp.length && setup.role !== 'out') {
    intents.unshift(...exp.map((e) => ({ type: 'set', key: e.key, value: e.val })));
    const ri = intents.findIndex((x) => x.type === 'refresh');
    if (ri > 0 && !intents.some((x) => x.type === 'save') && !/\bwithout sav|\bnot sav|\bdon't sav/.test(text)) intents.splice(ri, 0, { type: 'save' });
  }
  // a change and a refresh with no stated outcome: they want the change kept
  if (!expect.length && sets.length && intents.some((x) => x.type === 'refresh') && /\b(still|stay|stays|kept|keep|keeps|remain|remains|persist|persists|same)\b/.test(text)) for (const it of sets) add(it.key, it.value);
  return { setup, intents, expect };
}

// ---- options builder
const OPT = {
  role: [['admin', 'an admin'], ['new', 'a new user'], ['out', 'a signed-out user']],
  browser: [['Chrome', 'Chrome'], ['Safari', 'Safari'], ['Firefox', 'Firefox']],
  network: [['normal', 'a normal connection'], ['slow', 'a slow connection'], ['offline', 'no connection']],
  verb: [['off', 'turns off'], ['on', 'turns on']],
  key: [['email', 'Email notifications'], ['updates', 'Product updates']],
  then: [['save-refresh', 'saves, then refreshes'], ['save', 'saves'], ['refresh', 'refreshes without saving'], ['save-relogin', 'saves, signs out and back in'], ['save-tab', 'saves, then opens a new tab']],
  ekey: [['same', 'the same setting'], ['email', 'Email notifications'], ['updates', 'Product updates'], ['error', 'an error message'], ['saved', 'the “Saved” message']],
  eval: [['on', 'on'], ['off', 'off']],
  eshow: [['shown', 'shown'], ['hidden', 'not shown']],
};
export const DEFAULT_OPTS = { role: 'admin', browser: 'Chrome', network: 'normal', verb: 'off', key: 'email', then: 'save-refresh', ekey: 'same', eval: 'off', eshow: 'shown' };
function fromOptions(o) {
  const setup = { role: o.role, network: o.network, browser: o.browser };
  const intents = [{ type: 'set', key: o.key, value: o.verb === 'on' }];
  if (o.then.startsWith('save')) intents.push({ type: 'save' });
  if (o.then === 'save-refresh' || o.then === 'refresh') intents.push({ type: 'refresh' });
  if (o.then === 'save-tab') intents.push({ type: 'refresh', label: 'Open the page in a new tab' });
  if (o.then === 'save-relogin') intents.push({ type: 'relogin' });
  const ek = o.ekey === 'same' ? o.key : o.ekey;
  const val = ek === 'error' || ek === 'saved' ? o.eshow === 'shown' : o.ekey === 'same' ? o.verb === 'on' : o.eval === 'on';
  return { setup, intents, expect: [{ key: ek, val }] };
}
const label = (list, v) => (list.find((x) => x[0] === v) || [, v])[1];
function optionsSentence(o) {
  const ek = o.ekey === 'same' ? KEY_NAME[o.key] : label(OPT.ekey, o.ekey);
  const state = o.ekey === 'error' || o.ekey === 'saved' ? label(OPT.eshow, o.eshow) : o.ekey === 'same' ? o.verb : o.eval;
  return `${cap(label(OPT.role, o.role))} on ${o.browser} with ${label(OPT.network, o.network)} ${label(OPT.verb, o.verb)} ${KEY_NAME[o.key]} and ${label(OPT.then, o.then)}. ${ek} should be ${state}.`;
}
const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
const expWord = (e) => `${e.key === 'error' ? 'Error message' : e.key === 'saved' ? '“Saved” message' : KEY_NAME[e.key]} ${e.key === 'error' || e.key === 'saved' ? (e.val ? 'is shown' : 'is not shown') : e.val ? 'is on' : 'is off'}`;
const gotWord = (key, v) => (key === 'error' || key === 'saved' ? (v ? 'shown' : 'not shown') : v ? 'on' : 'off');

function draftOf(s) {
  if (s.mode === 'options') return build(...Object.values(fromOptions(s.opts)));
  if (!s.text || s.text.trim().length < 8) return null;
  const r = readWords(s.text);
  return build(r.setup, r.intents, r.expect);
}

function nameOf(t) {
  const who = { admin: 'Admin', new: 'New user', out: 'Signed out' }[t.setup.role];
  const extra = [t.setup.browser !== 'Chrome' && t.setup.browser, t.setup.network === 'slow' && 'slow network', t.setup.network === 'offline' && 'offline'].filter(Boolean);
  const last = [...t.actions].reverse().find((a) => a.type !== 'toggle');
  const after = !last ? '' : last.type === 'refresh' ? (/tab/.test(last.label) ? ' in a new tab' : ' after a refresh') : last.type === 'save' ? ' after saving' : last.type === 'role' ? ' after signing back in' : '';
  return `${[who, ...extra].join(', ')}: ${t.expect.map(expWord).join(', ')}${after}`;
}
export const MINE_EXAMPLE = 'A new user on Safari turns off email notifications, saves and refreshes the page. Email should still be off.';
const mine = {
  run(t, title) {
    const { snaps, final } = replay(t.setup, t.actions);
    actions.sandbox({ run: { running: true, i: 0, snaps, final, test: t, title } });
    const step = () => {
      const now = sb();
      if (!now || !now.run || now.run.snaps !== snaps) return;
      const i = now.run.i + 1;
      if (i < snaps.length) {
        actions.sandbox({ run: { ...now.run, i } });
        setTimeout(step, t.setup.network === 'slow' && /Save/.test(snaps[i].label) ? 1500 : 950);
        return;
      }
      const results = t.expect.map((e) => ({ ...e, got: actual(final, e.key), ok: actual(final, e.key) === e.val }));
      actions.sandbox({ run: { ...now.run, running: false, done: true, results, passed: results.every((r) => r.ok) } });
    };
    setTimeout(step, 900);
  },
  edit() {
    actions.sandbox({ run: null });
  },
  add() {
    const r = sb().run;
    actions.saveForm({ name: r.title, spec: r.test.spec, steps: r.snaps.slice(1).map((x) => x.label), every: true, include: true });
    actions.addTest(r.snaps);
  },
};

function Pick({ k, opts, list }) {
  return (
    <span className="pick">
      <select value={opts[k]} onChange={(e) => actions.sandbox({ opts: { ...opts, [k]: e.target.value }, run: null })}>
        {list.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <span className="pick-v">{label(list, opts[k])}</span>
      <Icon name="chevDown" size={12} />
    </span>
  );
}

function Builder({ opts }) {
  const ek = opts.ekey;
  return (
    <div className="builder">
      <div className="b-row">
        <span className="b-k">Who</span>
        <span className="b-v">
          <Pick k="role" opts={opts} list={OPT.role} /> on <Pick k="browser" opts={opts} list={OPT.browser} /> with <Pick k="network" opts={opts} list={OPT.network} />
        </span>
      </div>
      <div className="b-row">
        <span className="b-k">Does</span>
        <span className="b-v">
          <Pick k="verb" opts={opts} list={OPT.verb} /> <Pick k="key" opts={opts} list={OPT.key} /> and <Pick k="then" opts={opts} list={OPT.then} />
        </span>
      </div>
      <div className="b-row">
        <span className="b-k">Expects</span>
        <span className="b-v">
          <Pick k="ekey" opts={opts} list={OPT.ekey} /> to be{' '}
          {ek === 'error' || ek === 'saved' ? <Pick k="eshow" opts={opts} list={OPT.eshow} /> : ek === 'same' ? <b className="pick-fixed">{opts.verb}</b> : <Pick k="eval" opts={opts} list={OPT.eval} />}
        </span>
      </div>
    </div>
  );
}

function Understood({ t }) {
  const roleLine = `${cap(ROLE_WORD[t.setup.role])} · ${t.setup.browser} · ${t.setup.network === 'offline' ? 'offline' : t.setup.network + ' network'}`;
  return (
    <div className="und">
      <div className="und-row">
        <span className="und-k">Setup</span>
        <span>{roleLine}</span>
      </div>
      <div className="und-row">
        <span className="und-k">Steps</span>
        {t.actions.length ? (
          <ol>
            {t.actions.map((a, i) => (
              <li key={i}>{a.label}</li>
            ))}
          </ol>
        ) : (
          <span className="und-miss">Say what they do, for example turn something on or off, save, refresh</span>
        )}
      </div>
      <div className="und-row">
        <span className="und-k">Expect</span>
        {t.expect.length ? (
          <span>{t.expect.map(expWord).join(' · ')}</span>
        ) : (
          <span className="und-miss">Say what should happen at the end, for example “Email should still be off”</span>
        )}
      </div>
      {t.notes.map((n, i) => (
        <div key={i} className="und-note">
          {n}
        </div>
      ))}
    </div>
  );
}

// Rough check that typed text is a test case and not random keys: mostly real-looking words, and at least one word about this app.
const APP_WORDS = /\b(email|e-mail|mail|notif\w*|update\w*|product|setting\w*|preference\w*|choice\w*|toggle\w*|turn\w*|switch\w*|off|sav\w*|refresh\w*|reload\w*|sign\w*|log\w*|user\w*|admin\w*|offline|network|slow|wifi|browser|page|tab\w*|stay\w*|error\w*|fail\w*|show\w*|should|expect\w*|click\w*|open\w*|close\w*|check\w*|uncheck\w*|enable\w*|disable\w*|security|alert\w*|message\w*|account\w*|safari|chrome|firefox|mobile|phone)\b/i;
export function invalidCase(text) {
  const s = (text || '').trim();
  if (s.length < 4) return null;
  const words = s.match(/[A-Za-z]+/g) || [];
  if (!words.length) return 'That doesn’t look like a test case. Use words to describe it.';
  const wordlike = (w) => {
    const x = w.toLowerCase();
    if (x.length > 16) return false;
    if (x.length > 2 && !/[aeiouy]/.test(x)) return false;
    if (/([a-z])\1\1/.test(x)) return false;
    if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(x)) return false;
    return true;
  };
  const ok = words.filter(wordlike).length / words.length;
  if (ok < 0.7 || !APP_WORDS.test(s)) return 'Invalid input: this doesn’t read like a test case for this app. Describe who does it, the steps, and what should happen, for example “Turn Email off, save and refresh. Email should stay off.”';
  return null;
}

export function TryIt() {
  const s = useStore((x) => x.sandbox);
  const box = useRef(null);
  const ta = useRef(null);
  const [w, setW] = useState(760);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.min(e.contentRect.width, (e.contentRect.height * FW) / 800)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [!!(s && s.run)]);
  useEffect(() => {
    if (s && s.mode === 'words' && ta.current && !s.run) ta.current.focus();
  }, [s && s.mode]);
  // judge the text only once the person pauses typing, so half-typed words don't flash a warning
  const [badShown, setBadShown] = useState(null);
  const txt = s ? s.text : '';
  useEffect(() => {
    const now = invalidCase(txt);
    if (!now) return setBadShown(null);
    const tm = setTimeout(() => setBadShown(invalidCase(txt)), 700);
    return () => clearTimeout(tm);
  }, [txt]);
  if (!s) return null;
  const mode = s.mode || 'words';
  const opts = s.opts || DEFAULT_OPTS;
  const r = s.run;
  const t = r ? r.test : draftOf({ ...s, mode, opts });
  const ready = t && t.actions.length > 0 && t.expect.length > 0;
  const bad = mode === 'words' ? badShown : null;
  const hasInput = mode === 'options' || ((s.text || '').trim().length > 0 && !bad);
  const go = () => {
    if (r && r.running) return;
    if (!ready) {
      actions.sandbox({ nudge: Date.now() });
      if (ta.current) ta.current.focus();
      return;
    }
    mine.run(t, nameOf(t));
  };
  const missing = !t ? 'Write a little more: who does it, what they do, and what should happen.' : !t.actions.length ? 'Add what they do, for example “turns off email, saves and refreshes”.' : !t.expect.length ? 'Add what should happen at the end, for example “email should still be off”.' : null;
  const nudged = s.nudge && Date.now() - s.nudge < 4000 && missing;
  const cov = t && ready && !bad ? coverage(t) : null;
  const snap = r ? r.snaps[Math.min(r.i, r.snaps.length - 1)] : null;

  return (
    <div className="mine">
      <div className="panel mine-l">
        <div className="mine-h">
          <span className="label ac">TRY YOUR OWN TEST CASE</span>
          <h3>What do you want to check?</h3>
          <p className="sub">Describe a case the agent might have missed. SpecSight runs it on a sandbox copy of the app with the agent’s code and tells you if it holds.</p>
        </div>
        <div className="seg wide mine-mode">
          <button type="button" className={mode === 'words' ? 'on' : ''} onClick={() => actions.sandbox({ mode: 'words', run: null })}>
            <Icon name="edit" size={14} /> Write it
          </button>
          <button type="button" className={mode === 'options' ? 'on' : ''} onClick={() => actions.sandbox({ mode: 'options', opts, run: null })}>
            <Icon name="list" size={14} /> Choose options
          </button>
        </div>
        {mode === 'words' ? (
          <div className="mine-write">
            <textarea
              ref={ta}
              className={bad ? 'invalid' : ''}
              aria-invalid={bad ? 'true' : undefined}
              value={s.text || ''}
              placeholder={MINE_EXAMPLE}
              onChange={(e) => actions.sandbox({ text: e.target.value, run: null })}
              onKeyDown={(e) => {
                if (e.key === 'Tab' && !s.text) {
                  e.preventDefault();
                  actions.sandbox({ text: MINE_EXAMPLE, run: null });
                  return;
                }
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  go();
                }
              }}
            />
            {!s.text ? (
              <span className="cl-ex">
                Example text for this demo · press <kbd className="kbd">Tab</kbd> to use it, or type your own
              </span>
            ) : bad ? (
              <div className="mine-invalid" role="alert">
                <Triangle size={14} /> <span>{bad}</span>
              </div>
            ) : (
              <div className="mine-tip sub">Mention who (admin, new user, signed out), the browser or network if it matters, the steps, and what you expect.</div>
            )}
          </div>
        ) : (
          <Builder opts={opts} />
        )}
        {t && !bad && (
          <div className="mine-und">
            <span className="label">SPECSIGHT WILL RUN</span>
            <Understood t={t} />
          </div>
        )}
        <div className="mine-foot">
          {nudged && (
            <div className="mine-miss" key={s.nudge}>
              {missing}
            </div>
          )}
          <Button hint="run-mine" wide icon="play" disabled={!hasInput || (r && r.running)} onClick={go}>
            {r && r.running ? 'Running…' : 'Run my test case'}
          </Button>
          {mode === 'words' && <span className="sub mine-k">or press ⌘ Enter</span>}
        </div>
      </div>

      <div className="panel mine-r">
        {!r ? (
          <div className="mine-empty">
            <Mascot mood={ready ? 'curious' : 'idle'} statuses={['pass', 'pass', 'pass', 'pass', 'pass']} size={120} badge={false} />
            <b>{ready ? 'Ready to run' : 'Your test case runs here'}</b>
            <p className="sub">{ready ? 'SpecSight will run your steps on a fresh sandbox copy and compare the result with what you expect.' : 'You don’t click through the app. SpecSight does the steps for you and shows you what happened.'}</p>
            {cov && (
              <div className={`cov ${cov.fresh ? 'new' : ''}`}>
                {cov.fresh ? (
                  <>
                    <b>New case</b>
                    {cov.why.slice(0, 2).map((x, i) => (
                      <span key={i} className="cov-l">
                        {x}
                      </span>
                    ))}
                  </>
                ) : (
                  <>
                    <b>Similar to the agent’s test</b> “{cov.like.name}” (Spec {cov.like.spec}). Running it again with your setup still helps.
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mine-run">
            <div className="mine-run-h">
              {r.running ? (
                <span className="mine-status">
                  <Spinner size={13} color={COL.sky} /> Running step {Math.max(1, Math.min(r.i, r.snaps.length - 1))} of {r.snaps.length - 1} on a sandbox copy
                </span>
              ) : (
                <span className={`mine-status ${r.passed ? 'ok' : explain(r.test) ? 'meh' : 'bad'}`}>{r.passed ? 'Your test case passed' : explain(r.test) ? 'Not what you expected, but the specs allow it' : 'Your test case failed'}</span>
              )}
              <Tag n={r.test.spec} st={r.done ? (r.passed ? 'pass' : explain(r.test) ? 'wait' : 'fail') : 'run'} small />
            </div>
            <div className="mine-stage" ref={box}>
              <div className={`ty-appframe replay ${r.done ? 'done' : ''}`}>
                <XyzApp app={snap.app} scale={w / FW} cursor={r.running ? snap.cursor : null} caption={r.running ? { text: snap.label } : null} />
              </div>
            </div>
            <div className="mine-steps">
              {r.snaps.map((x, i) => (
                <span key={i} className={`strip-i ${i < r.i || r.done ? 'done' : i === r.i ? 'on' : ''}`}>
                  <b>{i === 0 ? '·' : i}</b>
                  {x.label}
                </span>
              ))}
            </div>
            {r.done && (
              <div className="mine-result">
                <div className="mine-checks">
                  {r.results.map((x) => (
                    <div key={x.key} className={`mcheck ${x.ok ? 'ok' : explain(r.test) ? 'meh' : 'bad'}`}>
                      <span className="mcheck-i">{x.ok ? <Icon name="check" size={12} sw={3} /> : '!'}</span>
                      <span>
                        <b>{expWord(x)}</b>
                        <small>
                          Expected {gotWord(x.key, x.val)}, got {gotWord(x.key, x.got)}
                        </small>
                      </span>
                    </div>
                  ))}
                </div>
                {(() => {
                  const ex = !r.passed && explain(r.test);
                  if (ex)
                    return (
                      <div className="cov res">
                        <b>This is expected</b> {ex}
                      </div>
                    );
                  const c = coverage(r.test);
                  return c.fresh ? (
                    <div className="cov new res">
                      {r.passed ? <b>Worth keeping</b> : <b>The agent missed this</b>} {c.why[0]}
                    </div>
                  ) : null;
                })()}
                <div className="mine-act">
                  {r.passed ? (
                    <>
                      <Button hint="saveastest" onClick={mine.add} icon="plus">
                        Add to the task’s tests
                      </Button>
                      <span className="sub">It runs again every time the code changes.</span>
                    </>
                  ) : (
                    <span className="sub mine-why">{explain(r.test) ? 'The app behaved as the specs say, so your expectation needs a change.' : 'The app did not do what you expected. If your expectation is right, this is a gap in the agent’s code.'}</span>
                  )}
                  <Button kind="secondary" onClick={mine.edit} icon="edit">
                    {r.passed ? 'Try another case' : 'Change my test case'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ------------------------------------------------------------------ save it as a test
export function SaveTest() {
  const f = useStore((x) => x.saveForm);
  const s = useStore((x) => x.sandbox);
  if (!f || !s || !s.verify) return null;
  const snaps = s.verify.snaps;
  const shown = snaps.filter((_, i) => i > 0).slice(-4);
  const setStep = (i, val) => actions.saveForm({ steps: f.steps.map((x, j) => (j === i ? val : x)) });
  return (
    <div className="savetest">
      <div className="panel st-left">
        <div className="st-h">
          <span className="label ac">YOUR VERIFIED TEST</span>
          <b>{f.name || 'My test'}</b>
        </div>
        <div className="st-grid">
          {shown.map((x, i) => (
            <div key={i} className="st-shot">
              <Thumb steps={[x]} width={392} />
              <div>
                <span>{x.label}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="checks">
          <div className="label ac">CHECKED ON A FRESH COPY</div>
          {s.verify.results.map((r) => (
            <div key={r.key} className="chk ok">
              <span className="chk-i">
                <Icon name="check" size={11} sw={3} />
              </span>
              {CONDS[r.key].label}: {word(r.key, r.val)}
            </div>
          ))}
        </div>
      </div>
      <div className="panel st-form">
        <div className="label ac">SAVE YOUR STEPS AS A TEST</div>
        <label className="fld">
          <span>Name</span>
          <input value={f.name} placeholder="Name your test" onChange={(e) => actions.saveForm({ name: e.target.value })} />
        </label>
        <div className="fld">
          <span>Belongs to</span>
          <div className="spec-pick">
            {SPECS.map((x) => (
              <button type="button" key={x.id} className={`sp ${f.spec === x.id ? 'on' : ''}`} onClick={() => actions.saveForm({ spec: x.id })} title={x.text}>
                Spec {x.id} {f.spec === x.id && <Icon name="check" size={11} sw={2.6} />}
              </button>
            ))}
          </div>
        </div>
        <div className="fld">
          <span>Steps (you can edit them)</span>
          <div className="steps-ed">
            {f.steps.map((x, i) => (
              <div key={i} className="se">
                <span className="se-n">{i + 1}</span>
                <input value={x} onChange={(e) => setStep(i, e.target.value)} />
                <button type="button" className="se-x" onClick={() => actions.saveForm({ steps: f.steps.filter((_, j) => j !== i) })} aria-label="Remove step">
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="fld">
          <span>Run it</span>
          <div className="seg wide">
            <button type="button" className={f.every ? 'on' : ''} onClick={() => actions.saveForm({ every: true })}>
              Every time this code changes
            </button>
            <button type="button" className={!f.every ? 'on' : ''} onClick={() => actions.saveForm({ every: false })}>
              Only this time
            </button>
          </div>
        </div>
        <label className="cb">
          <input type="checkbox" checked={f.include} onChange={(e) => actions.saveForm({ include: e.target.checked })} />
          <span>Include it in the Proof Capsule and the PR summary</span>
        </label>
        <div className="what">
          <div className="label ac">WHAT HAPPENS WHEN YOU ADD IT</div>
          <div>
            <b>Saved</b> with task #{TASK.id}, next to the agent’s 14 tests
          </div>
          <div>
            <b>Runs</b> {f.every ? 'again every time the agent changes the code' : 'once, now'}
          </div>
          <div>
            <b>Warns</b> you before peer review if this case ever breaks
          </div>
        </div>
        <div className="st-actions">
          <Button hint="addtest" onClick={() => actions.addTest(snaps)}>
            Add to the task’s tests
          </Button>
        </div>
      </div>
    </div>
  );
}
