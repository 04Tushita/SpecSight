import { useRef, useSyncExternalStore } from 'react';
import { CASES, RUN1_LANES, RUN2_LANES, DAN_REPLY, TASK } from './data.js';

// ------------------------------------------------------------------ tiny store
const initialCases = () => Object.fromEntries(CASES.map((c) => [c.id, { st: 'queued', run: 0, runs: [] }]));

export const initialState = () => ({
  app: 'intro', // intro | vscode | specsight
  // VS Code
  vsc: {
    stage: 'prompt', // prompt | working | done | investigate | final
    chat: [],
    agentSteps: [],
    typedLines: 0, // how many agent-changed lines are already typed into the editor
    file: 'NotificationSettings.tsx',
    toast: null, // verify | minimized | retest | sent | null
    investigateSpec: 2,
    quickFix: false,
    editorFixing: false,
    showChanges: 0, // bumps when the summary asks VS Code to open every change side by side
  },
  code: 'original', // original | v1 | fixed
  fixedBy: null, // agent | you
  fixAnim: 0, // 0..1 while the agent rewrites handleSave inside SpecSight
  // SpecSight
  ss: {
    screen: 'reading', // reading | lens | tryit | savetest | summary | capsule | pr
    right: 'code', // code | clarify | ask
    fullMap: false,
    popover: null, // spec id
    mapSelected: 1,
    logOpen: true,
    filter: 'all',
    creating: null, // null | 0..4 (PR creation progress)
    fromCapsule: 'summary',
  },
  phase: 'idle', // idle | reading | opening | testing | results | fixing | retesting | verified
  specsRead: 0,
  eye: 0, // 0 closed -> 1 lens
  cases: initialCases(),
  run: 0,
  clock: 0,
  paused: false,
  clarified: false,
  clarifyText: '',
  clarifySource: 'Talked with Dan (Product Owner)',
  dan: 'none', // none | composing | waiting | typing | replied
  danMsg: 'Hi Dan, quick one on #184527: should “Email off” also stop security alerts?',
  yours: null, // { name, spec, steps, justAdded }
  sandbox: null,
  saveForm: null,
  summaryTitle: `Fix: notification preferences now persist (#${TASK.id})`,
  sealedAt: null,
  modal: null, // { kind:'recording', caseId, run } | { kind:'shortcuts' }
  toasts: [],
  hints: true,
  epoch: 0,
});

let state = initialState();
const listeners = new Set();
export const get = () => state;
export const set = (patch) => {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const setIn = (key, patch) => set((s) => ({ [key]: { ...s[key], ...(typeof patch === 'function' ? patch(s[key]) : patch) } }));
export const setVsc = (p) => setIn('vsc', p);
export const setSs = (p) => setIn('ss', p);
const subscribe = (l) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const shallowEqual = (a, b) => {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  const ka = Object.keys(a),
    kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
};
// Selectors may return new arrays/objects; cache them so React sees a stable snapshot.
export function useStore(selector = (s) => s) {
  const cache = useRef(null);
  const sel = useRef(selector);
  sel.current = selector;
  const getSnapshot = () => {
    const c = cache.current;
    if (c && c.state === state) return c.value;
    const v = sel.current(state);
    if (c && shallowEqual(c.value, v)) {
      cache.current = { state, value: c.value };
      return c.value;
    }
    cache.current = { state, value: v };
    return v;
  };
  return useSyncExternalStore(subscribe, getSnapshot);
}

// ------------------------------------------------------------------ helpers
class Cancelled extends Error {}
export function wait(ms) {
  const ep = state.epoch;
  return new Promise((resolve, reject) => {
    let left = ms;
    let last = performance.now();
    const id = setInterval(() => {
      if (state.epoch !== ep) {
        clearInterval(id);
        reject(new Cancelled());
        return;
      }
      const now = performance.now();
      if (!state.paused) left -= now - last;
      last = now;
      if (left <= 0) {
        clearInterval(id);
        resolve();
      }
    }, 30);
  });
}
const guard = (fn) => async (...a) => {
  try {
    await fn(...a);
  } catch (e) {
    if (!(e instanceof Cancelled)) console.error(e);
  }
};

let toastId = 0;
export function toast(text, tone = 'info', ms = 3200) {
  const id = ++toastId;
  set((s) => ({ toasts: [...s.toasts, { id, text, tone }] }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

const setCase = (id, patch) => set((s) => ({ cases: { ...s.cases, [id]: { ...s.cases[id], ...patch } } }));

// ------------------------------------------------------------------ derived
export function specStatus(s, specId) {
  const cs = CASES.filter((c) => c.spec === specId).map((c) => s.cases[c.id]);
  if (cs.every((c) => c.st === 'queued')) return 'idle';
  if (cs.some((c) => c.st === 'run')) return 'run';
  if (cs.some((c) => c.st === 'fail')) return 'fail';
  if (cs.some((c) => c.st === 'wait')) return 'wait';
  if (cs.some((c) => c.st === 'queued')) return 'run';
  const wasFixed = cs.some((c) => c.runs.includes('fail'));
  return wasFixed ? 'fixed' : 'pass';
}
export const allStatuses = (s) => [1, 2, 3, 4, 5].map((i) => specStatus(s, i));
export const countVerified = (s) => allStatuses(s).filter((x) => x === 'pass' || x === 'fixed').length;
export const caseCounts = (s, spec) => {
  const cs = CASES.filter((c) => c.spec === spec).map((c) => s.cases[c.id]);
  return { total: cs.length, pass: cs.filter((c) => c.st === 'pass').length, fail: cs.filter((c) => c.st === 'fail').length, wait: cs.filter((c) => c.st === 'wait').length, done: cs.filter((c) => ['pass', 'fail', 'wait'].includes(c.st)).length };
};
export const totalTests = (s) => CASES.length + (s.yours ? 1 : 0);

export function mood(s) {
  if (s.app === 'intro') return 'idle';
  if (s.app === 'vscode') {
    if (s.vsc.stage === 'working') return 'focus';
    if (s.vsc.stage === 'done') return 'curious';
    if (s.vsc.stage === 'investigate') return s.code === 'fixed' ? 'happy' : 'worried';
    if (s.vsc.stage === 'final') return 'wink';
    return 'idle';
  }
  if (s.ss.screen === 'pr') return 'wink';
  if (s.phase === 'reading' || s.phase === 'opening') return 'squint';
  if (s.phase === 'verified') return 'happy';
  const st = allStatuses(s);
  if (s.phase === 'fixing' || s.phase === 'retesting') return 'focus';
  if (st.includes('wait') && s.ss.right !== 'clarify') return 'curious';
  if (s.phase === 'results' && st.includes('fail')) return 'worried';
  return 'focus';
}

export function hint(s) {
  if (!s.hints || s.modal) return null;
  if (s.app === 'intro') return 'start';
  if (s.app === 'vscode') {
    const v = s.vsc;
    if (v.stage === 'prompt') return v.hasTask ? 'send' : 'composer';
    if (v.stage === 'done') return v.toast === 'verify' ? 'verify' : v.toast || s.phase !== 'idle' ? 'status-ss' : null;
    if (v.stage === 'investigate') return s.code === 'fixed' ? 'retest' : 'sendagent';
    return null;
  }
  const ss = s.ss;
  if (ss.fullMap) return null;
  if (ss.screen === 'tryit') {
    const sb = s.sandbox;
    if (!sb) return null;
    if (sb.run?.done) return sb.run.passed ? 'saveastest' : null;
    return null;
  }
  if (ss.screen === 'savetest') return 'addtest';
  if (ss.screen === 'summary') return 'createpr';
  if (ss.screen === 'pr') return 'done';
  if (ss.screen !== 'lens') return null;
  const st = allStatuses(s);
  if (st[2] === 'wait' && !s.clarified) {
    if (ss.right === 'clarify') return s.clarifyText.trim().length >= 10 ? 'update3' : 'clarify-ta';
    if (ss.right === 'ask') return s.dan === 'replied' ? 'use-dan' : s.dan === 'none' ? 'send-dan' : null;
    return 'clarify';
  }
  if (s.phase === 'results') return 'sendfix';
  if (s.phase === 'verified') return 'summary';
  return null;
}

// ------------------------------------------------------------------ simulation
let extras = [];
let clockTimer = null;
function startClock() {
  stopClock();
  let last = performance.now();
  clockTimer = setInterval(() => {
    const now = performance.now();
    if (!state.paused) set((s) => ({ clock: s.clock + (now - last) }));
    last = now;
  }, 200);
}
function stopClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
}

async function runCase(id, dur, runNo) {
  const c = CASES.find((x) => x.id === id);
  setCase(id, { st: 'run', run: runNo, startedAt: state.clock });
  await wait(dur);
  let st = 'pass';
  if (c.waits && !state.clarified) st = 'wait';
  else if (c.fails1 && state.code !== 'fixed') st = 'fail';
  set((s) => ({ cases: { ...s.cases, [id]: { ...s.cases[id], st, endedAt: s.clock, dur, runs: [...s.cases[id].runs, st] } } }));
  if (st === 'wait') toast('Spec 3 needs clarification. The other specs keep testing.', 'wait');
}

async function runLanes(lanes, runNo) {
  extras = [];
  set({ run: runNo });
  startClock();
  await Promise.all(lanes.map(async (lane, li) => {
    if (runNo === 1 && li) await wait(li * 1500);
    for (const [id, dur] of lane) await runCase(id, dur, runNo);
  }));
  while (extras.length) {
    const e = extras;
    extras = [];
    await Promise.all(e);
  }
  stopClock();
}

function finalize() {
  const st = allStatuses(state);
  if (st.every((x) => x === 'pass' || x === 'fixed')) {
    set({ phase: 'verified', sealedAt: Date.now() });
    toast('All 5 specs verified. Proof Capsule sealed.', 'pass', 4200);
  } else {
    set({ phase: 'results' });
    if (st.includes('fail')) toast(`${st.filter((x) => x === 'fail').length} specs broke. A fix is ready.`, 'fail');
  }
}

export const actions = {
  reset() {
    stopClock();
    const hints = state.hints;
    state = { ...initialState(), hints, epoch: state.epoch + 1 };
    listeners.forEach((l) => l());
  },
  start() {
    set({ app: 'vscode' });
  },
  toggleHints() {
    set((s) => ({ hints: !s.hints }));
  },
  togglePause() {
    set((s) => ({ paused: !s.paused }));
  },

  // ---------------- agent in VS Code
  sendPrompt: guard(async (text, hasTask) => {
    if (state.vsc.stage !== 'prompt') return;
    const userMsg = { who: 'you', text, task: hasTask };
    if (!hasTask && !/184527/.test(text)) {
      setVsc((v) => ({ chat: [...v.chat, userMsg] }));
      await wait(500);
      setVsc((v) => ({ chat: [...v.chat, { who: 'agent', text: 'Which task should I work on? Type # to pick one from Azure DevOps.' }], askTask: true }));
      return;
    }
    setVsc((v) => ({ chat: [...v.chat, userMsg], stage: 'working', agentSteps: [], askTask: false }));
    const step = async (label, ms, detail) => {
      setVsc((v) => ({ agentSteps: [...v.agentSteps, { label, done: false, detail }] }));
      await wait(ms);
      setVsc((v) => ({ agentSteps: v.agentSteps.map((x, i) => (i === v.agentSteps.length - 1 ? { ...x, done: true } : x)) }));
    };
    await wait(400);
    await step(`Reading task #${TASK.id} in Azure DevOps`, 1100, '5 specs found');
    await step('Searching the code for notification preferences', 1000, '3 files: NotificationSettings.tsx, SettingsForm.tsx, preferences.ts');
    setVsc((v) => ({ agentSteps: [...v.agentSteps, { label: 'Editing NotificationSettings.tsx', done: false }] }));
    set({ code: 'v1' });
    for (let i = 1; i <= 9; i++) {
      await wait(260);
      setVsc({ typedLines: i });
    }
    setVsc((v) => ({ agentSteps: v.agentSteps.map((x, i) => (i === v.agentSteps.length - 1 ? { ...x, done: true, detail: '+9 −1' } : x)) }));
    await step('Running npm run typecheck', 900, 'No type errors');
    await wait(300);
    setVsc((v) => ({
      stage: 'done',
      chat: [...v.chat, { who: 'agent', text: 'Done. NotificationSettings now loads the saved preferences when the page opens, and Save shows its status.', diff: true }],
    }));
    await wait(900);
    setVsc({ toast: 'verify' });
  }),
  minimizeVerify() {
    setVsc({ toast: 'minimized' });
  },
  showVerify() {
    setVsc({ toast: 'verify' });
  },
  openFile(file) {
    setVsc({ file });
  },

  // ---------------- open SpecSight & run 1
  verify: guard(async () => {
    setVsc({ toast: null });
    set((s) => ({ app: 'specsight', phase: 'reading', specsRead: 0, eye: 0, ss: { ...s.ss, screen: 'reading' } }));
    for (let i = 1; i <= 5; i++) {
      await wait(520);
      set({ specsRead: i });
    }
    await wait(500);
    set({ phase: 'opening' });
    await wait(1900);
    set((s) => ({ phase: 'testing', ss: { ...s.ss, screen: 'lens' } }));
    await wait(1100);
    await runLanes(RUN1_LANES, 1);
    finalize();
  }),

  // ---------------- popovers & map
  togglePopover(id) {
    setSs((ss) => ({ popover: ss.popover === id ? null : id }));
  },
  closePopover() {
    setSs({ popover: null });
  },
  setFullMap(on) {
    if (on) setSs({ fullMap: true, fmClosing: false, popover: null });
    else actions.closeFullMap();
  },
  closeFullMap() {
    if (!state.ss.fullMap || state.ss.fmClosing) return;
    setSs({ fmClosing: true });
    setTimeout(() => setSs({ fullMap: false, fmClosing: false }), 480);
  },
  fullMapToVSCode() {
    setSs({ fullMap: false, fmClosing: false, popover: null });
    actions.toVSCode();
  },
  toVSCode() {
    set({ app: 'vscode' });
    setVsc((v) => ({ toast: null, stage: v.stage === 'investigate' || v.stage === 'final' ? v.stage : v.stage === 'prompt' || v.stage === 'working' ? v.stage : 'done' }));
  },
  seeChanges() {
    actions.toVSCode();
    setVsc({ showChanges: Date.now() });
  },
  back() {
    const b = backTarget(state);
    if (b) b.go();
  },
  openTask() {
    set({ modal: { kind: 'task' } });
  },
  selectOnMap(id) {
    setSs({ mapSelected: id });
  },

  // ---------------- clarify Spec 3
  openClarify() {
    setSs({ right: 'clarify', popover: null, screen: 'lens' });
  },
  closeRight() {
    setSs({ right: 'code' });
  },
  setClarifyText(t) {
    set({ clarifyText: t });
  },
  setClarifySource(t) {
    set({ clarifySource: t });
  },
  pasteDan() {
    set({ clarifyText: DAN_REPLY });
  },
  openAskDan() {
    setSs({ right: 'ask' });
    if (state.dan === 'none') set({ dan: 'composing' });
  },
  setDanMsg(t) {
    set({ danMsg: t });
  },
  sendDan: guard(async () => {
    set({ dan: 'waiting' });
    await wait(1400);
    set({ dan: 'typing' });
    await wait(1800);
    set({ dan: 'replied' });
    toast('Dan replied', 'info');
  }),
  useDanReply() {
    set({ clarifyText: DAN_REPLY, clarifySource: 'Dan’s reply in SpecSight' });
    setSs({ right: 'clarify' });
  },
  updateSpec3: guard(async () => {
    if (state.clarified) return;
    set({ clarified: true });
    setSs({ right: 'code' });
    toast('Spec 3 updated. Re-testing it now.', 'info');
    const p = runCase('s3c', 1800, Math.max(1, state.run));
    if (state.phase === 'testing' || state.phase === 'retesting') {
      extras.push(p);
      await p;
    } else {
      startClock();
      await p;
      stopClock();
      finalize();
    }
  }),

  // ---------------- fix
  sendFix: guard(async () => {
    if (state.phase !== 'results' || state.code === 'fixed') return;
    set((s) => ({ app: 'specsight', phase: 'fixing', fixAnim: 0, ss: { ...s.ss, screen: 'lens', right: 'code', popover: null } }));
    setVsc({ stage: 'done', toast: null });
    for (let i = 1; i <= 20; i++) {
      await wait(110);
      set({ fixAnim: i / 20 });
    }
    set({ code: 'fixed', fixedBy: state.fixedBy || 'agent' });
    toast('The agent fixed handleSave(). Re-testing only Spec 2 and Spec 4.', 'info');
    await retestRun();
  }),
  investigate(spec = 2) {
    setVsc({ stage: 'investigate', investigateSpec: spec, file: 'NotificationSettings.tsx', toast: null, quickFix: false });
    set((s) => ({ app: 'vscode', ss: { ...s.ss, popover: null } }));
  },
  setInvestigateSpec(n) {
    setVsc({ investigateSpec: n });
  },
  toggleQuickFix() {
    setVsc((v) => ({ quickFix: !v.quickFix }));
  },
  applyFixYourself: guard(async () => {
    setVsc({ quickFix: false, editorFixing: true });
    for (let i = 1; i <= 16; i++) {
      await wait(70);
      set({ fixAnim: i / 16 });
    }
    set({ code: 'fixed', fixedBy: 'you' });
    setVsc({ editorFixing: false, toast: 'retest' });
  }),
  sendFromVSCode() {
    set((s) => ({ app: 'specsight', ss: { ...s.ss, screen: 'lens' } }));
    actions.sendFix();
  },
  retestFromVSCode: guard(async () => {
    setVsc({ toast: null, stage: 'done' });
    set((s) => ({ app: 'specsight', ss: { ...s.ss, screen: 'lens', right: 'code' } }));
    await wait(400);
    await retestRun();
  }),
  backToSpecSight() {
    setVsc({ stage: 'done', toast: null });
    set({ app: 'specsight' });
  },

  // ---------------- try it yourself
  openTryIt() {
    set({ sandbox: newSandbox() });
    setSs({ screen: 'tryit', popover: null });
  },
  sandbox(patch) {
    set((s) => ({ sandbox: { ...s.sandbox, ...(typeof patch === 'function' ? patch(s.sandbox) : patch) } }));
  },
  openSaveTest() {
    const sb = state.sandbox;
    set({ saveForm: { name: sb.name || 'My test', spec: sb.spec, steps: sb.actions.map((x) => x.label), every: true, include: true } });
    setSs({ screen: 'savetest' });
  },
  saveForm(patch) {
    set((s) => ({ saveForm: { ...s.saveForm, ...patch } }));
  },
  backToTryIt() {
    setSs({ screen: 'tryit' });
  },
  addTest: guard(async (recording = []) => {
    const f = state.saveForm;
    set({ yours: { name: f.name || 'My test', spec: f.spec, steps: f.steps, justAdded: true, every: f.every, include: f.include, recording } });
    setSs({ screen: 'lens', filter: 'all', logOpen: true });
    toast(`Your test was added to task #${TASK.id}. It runs on every change.`, 'pass', 4200);
    await wait(3600);
    set((s) => ({ yours: s.yours && { ...s.yours, justAdded: false } }));
  }),
  backToLens() {
    setSs({ screen: 'lens' });
  },

  // ---------------- summary, capsule, PR
  openSummary() {
    setSs({ screen: 'summary', popover: null, fullMap: false });
  },
  openCapsule(from = 'summary') {
    setSs({ screen: 'capsule', fromCapsule: from, popover: null, fullMap: false });
  },
  setTitle(t) {
    set({ summaryTitle: t });
  },
  createPR: guard(async () => {
    for (let i = 0; i <= 4; i++) {
      setSs({ creating: i });
      await wait(i === 0 ? 300 : 650);
    }
    setSs({ creating: null, screen: 'pr' });
  }),
  done: guard(async () => {
    set({ app: 'vscode' });
    setVsc({ stage: 'final', toast: null });
    await wait(700);
    setVsc({ toast: 'sent' });
  }),

  // ---------------- modals
  openRecording(caseId, run) {
    const r = run || state.cases[caseId]?.run || 1;
    set({ modal: { kind: 'recording', caseId, run: r } });
  },
  openYours() {
    set({ modal: { kind: 'recording', caseId: 'yours', run: 1 } });
  },
  openPRPage() {
    set({ modal: { kind: 'prpage' } });
  },
  openShortcuts() {
    set({ modal: { kind: 'shortcuts' } });
  },
  closeModal() {
    set({ modal: null });
  },

  setFilter(f) {
    setSs({ filter: f });
  },
  toggleLog() {
    setSs((ss) => ({ logOpen: !ss.logOpen }));
  },

  // ---------------- presenter jumps
  jump(to) {
    actions.reset();
    const done = (ids, st = 'pass', run = 1) => Object.fromEntries(ids.map((id) => [id, { st, run, runs: [st], dur: 1500, endedAt: 9000 }]));
    const all = CASES.map((c) => c.id);
    if (to === 'agent') set({ app: 'vscode' });
    if (to === 'verify') {
      set({ app: 'vscode', code: 'v1' });
      setVsc({ stage: 'done', typedLines: 9, toast: 'verify', chat: [{ who: 'you', text: 'Fix this using its 5 specs.', task: true }, { who: 'agent', text: 'Done. NotificationSettings now loads the saved preferences when the page opens, and Save shows its status.', diff: true }], agentSteps: agentDoneSteps });
    }
    if (to === 'results' || to === 'verified' || to === 'summary') {
      const cases = { ...done(all) };
      cases.s2d = { st: 'fail', run: 1, runs: ['fail'], dur: 3400 };
      cases.s4a = { st: 'fail', run: 1, runs: ['fail'], dur: 2600 };
      cases.s3c = { st: 'wait', run: 1, runs: ['wait'], dur: 1200 };
      set((s) => ({ app: 'specsight', code: 'v1', phase: 'results', run: 1, clock: 10400, cases, eye: 1, ss: { ...s.ss, screen: 'lens' } }));
      setVsc({ stage: 'done', typedLines: 9, chat: [], agentSteps: agentDoneSteps });
    }
    if (to === 'verified' || to === 'summary') {
      const cases = { ...state.cases };
      for (const id of ['s2a', 's2b', 's2c', 's2d', 's4a', 's4b']) cases[id] = { ...cases[id], st: 'pass', run: 2, runs: [...cases[id].runs, 'pass'] };
      cases.s3c = { ...cases.s3c, st: 'pass', runs: ['wait', 'pass'] };
      set({ code: 'fixed', fixedBy: 'agent', phase: 'verified', run: 2, cases, clarified: true, clarifyText: DAN_REPLY, sealedAt: Date.now() });
    }
    if (to === 'summary') setSs({ screen: 'summary' });
  },
};

const agentDoneSteps = [
  { label: `Reading task #${TASK.id} in Azure DevOps`, done: true, detail: '5 specs found' },
  { label: 'Searching the code for notification preferences', done: true, detail: '3 files: NotificationSettings.tsx, SettingsForm.tsx, preferences.ts' },
  { label: 'Editing NotificationSettings.tsx', done: true, detail: '+9 −1' },
  { label: 'Running npm run typecheck', done: true, detail: 'No type errors' },
];

async function retestRun() {
  set({ phase: 'retesting' });
  // Reset only the cases of Spec 2 and Spec 4.
  set((s) => {
    const cases = { ...s.cases };
    for (const c of CASES) if (c.spec === 2 || c.spec === 4) cases[c.id] = { ...cases[c.id], st: 'queued' };
    return { cases };
  });
  await wait(300);
  await runLanes(RUN2_LANES, 2);
  finalize();
}

// ------------------------------------------------------------------ sandbox
export const SERVER_DEFAULTS = { admin: { email: true, updates: true }, new: { email: true, updates: false } };
export function newSandbox() {
  return {
    step: 1,
    mode: 'words',
    text: '',
    opts: null,
    run: null,
    idea: null,
    expect: '',
    name: '',
    spec: 2,
    setup: { role: 'new', network: 'normal' },
    app: { role: 'new', network: 'normal', browser: 'Chrome', email: true, updates: false, banner: null, toast: null, saving: false, reload: false },
    server: { admin: { ...SERVER_DEFAULTS.admin }, new: { ...SERVER_DEFAULTS.new } },
    lastSaveOk: null,
    actions: [],
    conds: [],
    verify: null,
    lines: [],
    linesAt: 0,
    startedAt: Date.now(),
  };
}

// Where the big Back button goes.
export function backTarget(s) {
  if (s.app !== 'specsight') return null;
  const ss = s.ss;
  if (ss.fullMap) return { label: 'All panels', go: actions.closeFullMap };
  if (ss.screen === 'lens' || ss.screen === 'reading') {
    if (ss.right === 'clarify' || ss.right === 'ask') return { label: ss.right === 'ask' ? 'Clarify Spec 3' : 'Code', go: ss.right === 'ask' ? actions.openClarify : actions.closeRight };
    return { label: 'VS Code', go: actions.toVSCode };
  }
  if (ss.screen === 'tryit') {
    if (s.sandbox?.run?.done) return { label: 'Edit test case', go: () => actions.sandbox({ run: null }) };
    return { label: 'Proof Lens', go: actions.backToLens };
  }
  if (ss.screen === 'savetest') return { label: 'Your test', go: actions.backToTryIt };
  if (ss.screen === 'summary') return { label: 'Proof Lens', go: actions.backToLens };
  if (ss.screen === 'capsule') return ss.fromCapsule === 'summary' ? { label: 'Summary', go: actions.openSummary } : { label: 'Proof Lens', go: actions.backToLens };
  if (ss.screen === 'pr') return { label: 'Summary', go: actions.openSummary };
  return null;
}
if (typeof window !== 'undefined') window.__ss = { actions, get: () => state };
