import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, actions, setVsc, get, allStatuses, toast } from './store.js';
import { CODE, OTHER_FILES, TASK, SPECS, AGENT_LINES_V1, AGENT_LINES_FIX, lineOf } from './data.js';
import CodeView, { linesFor, tokenize } from './Code.jsx';
import { LiveMascot } from './Mascot.jsx';
import { Button, Icon, Tag, Triangle, Spinner, useHintFor, COL, Sash, BackButton, statusWord } from './ui.jsx';
import { Thumb, stepsForCase } from './Recording.jsx';

const EXTRA = {
  'Banner.tsx': `import type { ReactNode } from 'react';

type Props = {
  tone: 'info' | 'error';
  action?: string;
  children: ReactNode;
};

export function Banner({ tone, action, children }: Props) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={\`banner banner-\${tone}\`}>
      <p>{children}</p>
      {action && <a href="/sign-in">{action}</a>}
    </div>
  );
}
`,
  'Toggle.tsx': `type Props = {
  label: string;
  hint: string;
  checked: boolean;
  onChange?: (on: boolean) => void;
  disabled?: boolean;
  badge?: string;
};

export function Toggle({ label, hint, checked, onChange, disabled, badge }: Props) {
  return (
    <label className="toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{hint}</small>
      </span>
      {badge && <em>{badge}</em>}
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
      />
    </label>
  );
}
`,
};
const FILES = { ...OTHER_FILES, ...EXTRA };
const TREE = [
  { name: 'xyz-web', depth: 0, folder: true },
  { name: 'src', depth: 1, folder: true },
  { name: 'auth', depth: 2, folder: true },
  { name: 'useSession.ts', depth: 3 },
  { name: 'lib', depth: 2, folder: true },
  { name: 'preferences.ts', depth: 3 },
  { name: 'settings', depth: 2, folder: true },
  { name: 'NotificationSettings.tsx', depth: 3, main: true },
  { name: 'SettingsForm.tsx', depth: 3 },
  { name: 'ui', depth: 2, folder: true },
  { name: 'Banner.tsx', depth: 3 },
  { name: 'Toggle.tsx', depth: 3 },
];
const PATH = { 'useSession.ts': 'src › auth', 'preferences.ts': 'src › lib', 'NotificationSettings.tsx': 'src › settings', 'SettingsForm.tsx': 'src › settings', 'Banner.tsx': 'src › ui', 'Toggle.tsx': 'src › ui' };

// ------------------------------------------------------------------ editor lines
function useEditorLines() {
  const code = useStore((s) => s.code);
  const stage = useStore((s) => s.vsc.stage);
  const typed = useStore((s) => s.vsc.typedLines);
  const fixing = useStore((s) => s.vsc.editorFixing);
  const fixAnim = useStore((s) => s.fixAnim);
  return useMemo(() => {
    if (code === 'original') return { lines: linesFor(CODE.original), marks: {} };
    if (stage === 'working' && code === 'v1') {
      const v1 = linesFor(CODE.v1);
      const orig = CODE.original.split('\n');
      const out = [];
      v1.forEach((l) => {
        const k = AGENT_LINES_V1.indexOf(l.n) + 1;
        if (k === 0) return out.push({ ...l, key: 'v' + l.n });
        if (k <= typed) return out.push({ ...l, key: 'v' + l.n, agent: true, fresh: k === typed });
        if (l.n === 1) return out.push({ text: orig[0], n: 1, key: 'v1' });
      });
      const lines = out.map((l, i) => ({ ...l, n: i + 1 }));
      const marks = {};
      lines.forEach((l) => l.agent && (marks[l.n] = 'agent'));
      return { lines, marks, typingLine: lines.find((l) => l.fresh)?.n };
    }
    if (fixing) {
      const fx = linesFor(CODE.fixed);
      const shown = Math.round(fixAnim * AGENT_LINES_FIX.length);
      const v1 = linesFor(CODE.v1);
      const hs = lineOf(CODE.v1, 'async function handleSave');
      // Replace the 3 body lines of handleSave progressively.
      const head = v1.slice(0, hs);
      const tail = v1.slice(hs + 3);
      const body = fx.filter((l) => AGENT_LINES_FIX.includes(l.n)).slice(0, shown).map((l) => ({ ...l, agent: true }));
      const rest = shown < AGENT_LINES_FIX.length ? v1.slice(hs, hs + 3).slice(Math.min(3, Math.ceil(shown / 3))) : [];
      const lines = [...head, ...body, ...rest, ...tail].map((l, i) => ({ ...l, key: 'f' + i, n: i + 1 }));
      const marks = {};
      lines.forEach((l) => l.agent && (marks[l.n] = 'agent'));
      return { lines, marks, typingLine: lines.filter((l) => l.agent).pop()?.n };
    }
    const src = code === 'fixed' ? CODE.fixed : CODE.v1;
    const lines = linesFor(src);
    const marks = {};
    if (code === 'v1') AGENT_LINES_V1.forEach((n) => (marks[n] = 'agent'));
    else {
      const fx = CODE.fixed;
      [1, 2].forEach((n) => (marks[n] = 'agent'));
      const a = lineOf(fx, 'useEffect(() => {');
      for (let i = 0; i < 7; i++) marks[a + i] = 'agent';
      AGENT_LINES_FIX.forEach((n) => (marks[n] = 'agent'));
    }
    return { lines, marks };
  }, [code, stage, typed, fixing, fixAnim]);
}

// Investigate annotations, resolved against the v1 code.
function investigateMarks(spec) {
  const c = CODE.v1;
  const L = (s, from) => lineOf(c, s, from ? lineOf(c, from) : 0);
  const saved = L("setStatus('saved')", 'async function handleSave');
  const saving = L("setStatus('saving')", 'async function handleSave');
  if (spec === 2) {
    return {
      marks: { [L('const [updates, setUpdates]')]: 'step', [L('loadPreferences(session.user.id)')]: 'step', [L('setUpdates(prefs.updates)')]: 'fail', [L('async function handleSave')]: 'step', [saved]: 'fail' },
      notes: [
        { n: L('const [updates, setUpdates]'), badge: '1', text: 'The user turns on Product updates' },
        { n: L('async function handleSave'), badge: '2', text: 'Clicking “Save changes” runs this' },
        { n: L('loadPreferences(session.user.id)'), badge: '3', text: 'After a refresh, the old choice loads here' },
        { n: L('setUpdates(prefs.updates)'), badge: '4', tone: 'fail', text: 'Product updates is set back to off' },
        { n: saved, badge: '!', tone: 'fail', text: 'Shows “Saved”, but nothing was saved' },
      ],
      missingAfter: saving,
      scroll: L('const [updates, setUpdates]'),
    };
  }
  return {
    marks: { [L('const [updates, setUpdates]')]: 'step', [L('async function handleSave')]: 'step', [saved]: 'fail', [L("status === 'error'")]: 'fail' },
    notes: [
      { n: L('const [updates, setUpdates]'), badge: '2', text: 'Offline, the user turns on Product updates' },
      { n: L('async function handleSave'), badge: '3', text: 'Clicking “Save changes” runs this' },
      { n: saved, badge: '4', tone: 'fail', text: 'Shows “Saved” even though nothing was sent' },
      { n: L("status === 'error'"), badge: '!', tone: 'fail', text: 'So the error banner can never show' },
    ],
    missingAfter: saving,
    scroll: L('async function handleSave') - 6,
  };
}

// ------------------------------------------------------------------ helpers
const persisted = {};
function usePersist(key, init) {
  const [v, setV] = useState(key in persisted ? persisted[key] : init);
  const set = (x) => {
    const next = typeof x === 'function' ? x(persisted[key] ?? v) : x;
    persisted[key] = next;
    setV(next);
  };
  return [v, set];
}
export function diffLines(a, b) {
  const A = a.replace(/\n$/, '').split('\n'),
    B = b.replace(/\n$/, '').split('\n');
  const n = A.length,
    m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      out.push({ t: ' ', text: A[i] });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      out.push({ t: '+', text: B[j] });
      j++;
    } else {
      out.push({ t: '-', text: A[i] });
      i++;
    }
  }
  return out;
}
const currentCode = (code) => (code === 'fixed' ? CODE.fixed : code === 'v1' ? CODE.v1 : CODE.original);
const allFiles = (code) => ({ 'NotificationSettings.tsx': currentCode(code), ...FILES });

// ------------------------------------------------------------------ changes (source control)
const TEST_FILE = 'NotificationSettings.e2e.test.ts';
const PATH_OF = (f) => (f === TEST_FILE ? 'src › settings' : PATH[f] || 'src');
function yoursTest(y) {
  const steps = (y.steps || []).filter(Boolean);
  return [
    `// Added from SpecSight: your own test case for Spec ${y.spec || 1}`,
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test('${String(y.name || 'My test').replace(/'/g, "\\'")}', async ({ page }) => {`,
    `  await page.goto('/settings/notifications');`,
    ...steps.map((s) => `  // ${s}`),
    `  await expect(page.getByRole('status')).toBeVisible();`,
    `});`,
  ].join('\n');
}
// Every file that differs from main right now, read live from the editor so the counts move while the agent types.
function useChanges(code, ed, docs) {
  const yours = useStore((s) => s.yours);
  return useMemo(() => {
    const out = [];
    const mainDoc = docs['NotificationSettings.tsx|' + code];
    const mainNow = mainDoc ? mainDoc.join('\n') : ed.lines.map((l) => l.text).join('\n');
    const push = (file, before, after, st) => {
      if (before === after) return;
      const d = diffLines(before, after);
      out.push({ file, before, after, st, add: d.filter((x) => x.t === '+').length, del: d.filter((x) => x.t === '-').length });
    };
    push('NotificationSettings.tsx', CODE.original, mainNow, 'M');
    Object.keys(docs).forEach((k) => !k.includes('|') && FILES[k] != null && push(k, FILES[k], docs[k].join('\n'), 'M'));
    if (yours && yours.include !== false) push(TEST_FILE, '', yoursTest(yours), 'A');
    return out;
  }, [code, ed, docs, yours]);
}

// Side-by-side diff, like VS Code: main on the left, the working tree on the right, rows kept aligned.
function pairRows(before, after) {
  const d = before === '' ? after.split('\n').map((text) => ({ t: '+', text })) : diffLines(before, after);
  const rows = [];
  let ln = 0, rn = 0, i = 0;
  while (i < d.length) {
    if (d[i].t === ' ') {
      rows.push({ l: { n: ++ln, text: d[i].text }, r: { n: ++rn, text: d[i].text } });
      i++;
      continue;
    }
    const dels = [], adds = [];
    while (i < d.length && d[i].t !== ' ') (d[i].t === '-' ? dels : adds).push(d[i++].text);
    const k = Math.max(dels.length, adds.length);
    for (let j = 0; j < k; j++) {
      const L = j < dels.length ? dels[j] : null, Rt = j < adds.length ? adds[j] : null;
      let wl = null, wr = null;
      if (L != null && Rt != null) {
        let a = 0;
        while (a < L.length && a < Rt.length && L[a] === Rt[a]) a++;
        let b = 0;
        while (b < L.length - a && b < Rt.length - a && L[L.length - 1 - b] === Rt[Rt.length - 1 - b]) b++;
        wl = [a, L.length - b];
        wr = [a, Rt.length - b];
      }
      rows.push({ l: L != null ? { n: ++ln, text: L, k: 'del', w: wl } : null, r: Rt != null ? { n: ++rn, text: Rt, k: 'add', w: wr } : null, hunk: j === 0 });
    }
  }
  return rows;
}
function DiffText({ text, w }) {
  const toks = tokenize(text);
  const out = [];
  let pos = 0;
  toks.forEach(([s, c], i) => {
    const a = pos, b = pos + s.length;
    pos = b;
    if (!w || w[1] <= a || w[0] >= b || w[0] === w[1]) return out.push(<span key={i} className={'tk-' + c}>{s}</span>);
    const x = Math.max(a, w[0]) - a, y = Math.min(b, w[1]) - a;
    if (x > 0) out.push(<span key={i + 'a'} className={'tk-' + c}>{s.slice(0, x)}</span>);
    out.push(<span key={i + 'b'} className={'tk-' + c + ' wd'}>{s.slice(x, y)}</span>);
    if (y < s.length) out.push(<span key={i + 'c'} className={'tk-' + c}>{s.slice(y)}</span>);
  });
  return <>{out}</>;
}
function SideBySide({ ch, live, onBack }) {
  const rows = useMemo(() => pairRows(ch.before, ch.after), [ch.before, ch.after]);
  const hunks = rows.map((r, i) => (r.hunk ? i : -1)).filter((i) => i >= 0);
  const box = useRef(null);
  const [hi, setHi] = useState(0);
  const go = (k) => {
    if (!hunks.length) return;
    const n = (k + hunks.length) % hunks.length;
    setHi(n);
    const el = box.current?.querySelector(`[data-row="${hunks[n]}"]`);
    if (el) box.current.scrollTo({ top: el.offsetTop - 60, behavior: 'smooth' });
  };
  useEffect(() => {
    if (!live || !box.current) return;
    const last = [...box.current.querySelectorAll('.sbs-row.ch')].pop();
    if (last) box.current.scrollTo({ top: last.offsetTop - box.current.clientHeight / 2, behavior: 'smooth' });
  }, [live, ch.after]);
  const side = (k) => (
    <div className="sbs-col">
      {rows.map((r, i) => {
        const c = r[k];
        return (
          <div key={i} data-row={i} className={`sbs-row ${c ? c.k || '' : 'gap'} ${r.l?.k || r.r?.k ? 'ch' : ''}`}>
            <span className="sbs-n">{c ? c.n : ''}</span>
            <span className="sbs-g">{c && c.k === 'add' ? '+' : c && c.k === 'del' ? '−' : ''}</span>
            <span className="sbs-t">{c ? <DiffText text={c.text} w={c.w} /> : ''}</span>
          </div>
        );
      })}
    </div>
  );
  return (
    <div className="sbs">
      <div className="sbs-bar">
        <span className="sbs-h l">
          <span className="sbs-pill">BEFORE</span>
          <b>main</b>
          <small>{ch.st === 'A' ? 'file did not exist' : 'original code'}</small>
        </span>
        <span className="sbs-h r">
          <span className="sbs-pill">AFTER</span>
          <b>{TASK.branch}</b>
          <small>your changes</small>
          {live && <span className="sbs-live"><i /> agent is editing</span>}
        </span>
        <span className="sbs-tools">
          <span className="scm-n"><span className="plus">+{ch.add}</span> <span className="minus">−{ch.del}</span></span>
          <span className="sub">{hunks.length ? `${Math.min(hi + 1, hunks.length)} of ${hunks.length} changes` : 'No changes'}</span>
          <button type="button" className="sbs-btn" onClick={() => go(hi - 1)} title="Previous change" aria-label="Previous change">↑</button>
          <button type="button" className="sbs-btn" onClick={() => go(hi + 1)} title="Next change" aria-label="Next change">↓</button>
          {onBack && (
            <button type="button" className="sbs-back" onClick={onBack}>
              <span aria-hidden="true">←</span> Back to the summary
            </button>
          )}
        </span>
      </div>
      <div className="sbs-body" ref={box}>
        {side('l')}
        {side('r')}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ main window
export default function VSCode() {
  const v = useStore((s) => s.vsc);
  const code = useStore((s) => s.code);
  const phase = useStore((s) => s.phase);
  const [tabs, setTabs] = usePersist('tabs', ['NotificationSettings.tsx']);
  const [view, setView] = usePersist('view', 'explorer');
  const [sideW, setSideW] = usePersist('sideW', 230);
  const [rightW, setRightW] = usePersist('rightW', 380);
  const [panel, setPanel] = usePersist('panel', null); // null | problems | output | terminal
  const [panelH, setPanelH] = usePersist('panelH', 210);
  const [term, setTerm] = usePersist('term', []);
  const [goto, setGoto] = useState(null);
  const [docs, setDocs] = usePersist('docs', {});
  const [dirty, setDirty] = usePersist('dirty', {});
  const file = v.file;
  const investigating = v.stage === 'investigate';
  const ed = useEditorLines();
  const changes = useChanges(code, ed, docs);
  const agentLive = v.stage === 'working' || v.editorFixing;

  const open = (f, line) => {
    if (!tabs.includes(f)) setTabs((t) => [...t, f]);
    actions.openFile(f);
    setGoto(line ? { f, line, k: Math.random() } : null);
  };
  const close = (f) => {
    const t = tabs.filter((x) => x !== f);
    setTabs(t.length ? t : ['NotificationSettings.tsx']);
    if (file === f) actions.openFile(t[t.length - 1] || 'NotificationSettings.tsx');
  };
  const runInTerminal = (cmd) => {
    setPanel('terminal');
    const add = (lines) => setTerm((t) => [...t, ...lines]);
    add([{ k: 'cmd', t: cmd }]);
    const out = TERMINAL[cmd.trim()] ? TERMINAL[cmd.trim()](get()) : [{ k: 'err', t: `${cmd.split(' ')[0]}: try npm test, npm run dev, git status or clear` }];
    if (cmd.trim() === 'clear') return setTerm([]);
    out.forEach((l, i) => setTimeout(() => add([l]), 180 + i * 140));
  };

  const openAllChanges = (list = changes) => {
    if (!list.length) return toast('No changes to show yet', 'info');
    const ids = list.map((c) => 'diff:' + c.file);
    setTabs((t) => [...t.filter((x) => !x.startsWith('diff:')), ...ids]);
    actions.openFile(ids[0]);
    setView('scm');
    if (sideW < 120) setSideW(230);
    if (rightW > 320) setRightW(300);
  };
  const [seenChanges, setSeenChanges] = usePersist('seenChanges', 0);
  useEffect(() => {
    if (v.showChanges && v.showChanges !== seenChanges) {
      setSeenChanges(v.showChanges);
      openAllChanges();
    }
  }, [v.showChanges]);
  const isDiff = file.startsWith('diff:');
  const diffCh = isDiff ? changes.find((c) => c.file === file.slice(5)) || { file: file.slice(5), before: CODE.original, after: CODE.original, st: 'M', add: 0, del: 0 } : null;
  const main = file === 'NotificationSettings.tsx';
  const inv = investigating && main && code !== 'fixed' && !v.editorFixing ? investigateMarks(v.investigateSpec) : null;
  const problems = code === 'v1' ? 1 : 0;

  let lines, marks, notes = [], typingLine, insertAfter = null, scrollTo = null, plain = false;
  if (isDiff) {
    lines = [];
    marks = {};
  } else if (main) {
    ({ lines, marks, typingLine } = ed);
    if (inv) {
      marks = inv.marks;
      notes = inv.notes;
      plain = true;
      scrollTo = inv.scroll;
      insertAfter = {
        n: inv.missingAfter,
        el: (
          <div className="missing">
            <div className="missing-box">
              <div className="missing-code">+ await savePreferences(session.user.id, &#123; email, updates &#125;);</div>
              <div className="missing-why">Missing: this call is never made, so nothing is sent to the server</div>
            </div>
            <div className="missing-tags">
              <Triangle size={15} color={COL.fail} mark="#0F0B1C" />
              <Tag n={2} st="fail" small />
              <Tag n={4} st="fail" small />
              <span className="missing-both">both broke here</span>
            </div>
          </div>
        ),
      };
    }
    if (v.stage === 'working') scrollTo = typingLine;
    if (v.editorFixing) {
      plain = true;
      scrollTo = typingLine;
    }
  } else {
    lines = linesFor(FILES[file] || '');
    marks = {};
  }
  const docKey = file + (main ? '|' + code : '');
  const canEdit = !isDiff && v.stage !== 'working' && !v.editorFixing;
  if (canEdit && docs[docKey]) {
    lines = docs[docKey].map((text, i) => ({ text, n: i + 1, key: 'e' + i }));
    marks = {};
    notes = [];
    insertAfter = null;
    scrollTo = null;
  }
  const onEdit = canEdit
    ? (texts) => {
        setDocs((d) => ({ ...d, [docKey]: texts }));
        setDirty((x) => ({ ...x, [file]: true }));
      }
    : null;
  useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty[file]) {
          setDirty((x) => ({ ...x, [file]: false }));
          toast(`Saved ${file}`, 'pass', 2200);
        }
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
  if (goto && goto.f === file && !inv) {
    marks = { ...marks, [goto.line]: 'step' };
    scrollTo = goto.line;
  }

  const ACTS = [
    ['explorer', 'files', 'Explorer'],
    ['search', 'search', 'Search'],
    ['scm', 'git', 'Source control'],
    ['run', 'debug', 'Run and debug'],
    ['ext', 'ext', 'Extensions'],
  ];

  return (
    <div className="vsc">
      <div className="vsc-title">
        <span className="vsc-title-t">
          {isDiff ? `${file.slice(5)} (Working Tree)` : file} — {TASK.repo}
        </span>
      </div>
      <div className="vsc-body">
        <nav className="vsc-act">
          {ACTS.map(([k, ic, t]) => (
            <button type="button" key={k} data-opt={k === 'scm' && agentLive && !(view === 'scm' && sideW > 0) ? 'Open Source control to watch the agent’s changes live' : undefined} className={`act ${view === k && sideW > 0 ? 'on' : ''}`} title={t} onClick={() => (view === k && sideW > 0 ? setSideW(0) : (setView(k), sideW < 120 && setSideW(230)))}>
              <Icon name={ic} size={21} />
              {k === 'scm' && changes.length > 0 && <span className={`act-badge ${agentLive ? 'live' : ''}`}>{changes.length}</span>}
            </button>
          ))}
          <button
            type="button"
            className={`act act-ss ${useHintFor('status-ss') ? 'hint' : ''}`}
            onClick={() => {
              if (v.stage === 'done' && phase === 'idle') actions.showVerify();
              else if (phase !== 'idle') actions.backToSpecSight();
              else setView('ext');
            }}
          >
            <LiveMascot size={26} badge={false} />
          </button>
        </nav>

        {sideW > 0 && (
          <aside className="vsc-side" style={{ width: sideW }}>
            {view === 'explorer' && <Explorer file={file} open={open} code={code} />}
            {view === 'search' && <SearchView code={code} open={open} />}
            {view === 'scm' && <ScmView changes={changes} live={agentLive} open={open} openAll={openAllChanges} file={file} />}
            {view === 'run' && <RunView run={runInTerminal} />}
            {view === 'ext' && <ExtView />}
          </aside>
        )}
        <Sash dir="x" value={sideW} min={0} max={420} onChange={(x) => setSideW(x == null ? 230 : x < 120 ? 0 : x)} />

        <div className="vsc-col">
          <section className="vsc-editor">
            <div className="tabs">
              {tabs.map((t) => (
                <div key={t} className={`tab ${t === file ? 'on' : ''}`} onClick={() => actions.openFile(t)}>
                  <span className={`ficon tsx ${t.startsWith('diff:') ? 'dif' : ''}`}>{t.startsWith('diff:') ? '±' : 'TS'}</span>
                  {t.startsWith('diff:') ? `${t.slice(5)} (Working Tree)` : t}
                  {(dirty[t] || (t === 'NotificationSettings.tsx' && code !== 'original')) && <span className={`tab-dot ${dirty[t] ? 'dirty' : ''}`} />}
                  {tabs.length > 1 && (
                    <button type="button" className="tab-x" onClick={(e) => {
                      e.stopPropagation();
                      close(t);
                    }} aria-label="Close tab">
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="crumbs">
              {isDiff ? `${PATH_OF(file.slice(5))} › ${file.slice(5)} · main ↔ Working Tree` : `${PATH[file]} › ${file}`}
              {main && inv && <span> › handleSave</span>}
            </div>
            {isDiff ? (
              <SideBySide ch={diffCh} live={agentLive && diffCh.file === 'NotificationSettings.tsx'} onBack={phase === 'verified' ? actions.backToSpecSight : null} />
            ) : (
            <CodeView
              lines={lines}
              mode={plain ? 'plain' : 'color'}
              marks={marks}
              notes={notes}
              insertAfter={insertAfter}
              scrollTo={scrollTo}
              typingLine={typingLine}
              className="vsc-code"
              noteX={470}
              onEdit={onEdit}
              lightbulbAt={inv ? inv.missingAfter : null}
              bulbOpen={v.quickFix}
              onBulb={actions.toggleQuickFix}
              bulbMenu={
                <div className="bulb-menu">
                  <button type="button" onClick={actions.applyFixYourself}>
                    <Icon name="sparkle" size={13} /> Apply SpecSight fix: call savePreferences() before “Saved”
                  </button>
                  <button type="button" onClick={actions.toggleQuickFix}>
                    Ignore for now
                  </button>
                </div>
              }
            />
            )}
            {code === 'v1' && main && v.stage !== 'working' && !investigating && !panel && (
              <button type="button" className="squiggle-hint" onClick={() => setPanel('problems')}>
                ⚠ <b>savePreferences</b> is defined but never used. <span>@typescript-eslint/no-unused-vars · line 2</span>
              </button>
            )}
          </section>
          {panel && (
            <>
              <Sash dir="y" value={panelH} min={90} max={520} invert onChange={(x) => setPanelH(x == null ? 210 : x)} />
              <BottomPanel tab={panel} setTab={setPanel} h={panelH} term={term} run={runInTerminal} open={open} problems={problems} />
            </>
          )}
        </div>

        <Sash dir="x" value={rightW} min={300} max={640} invert onChange={(x) => setRightW(x == null ? 380 : x)} />
        <div className="vsc-right" style={{ width: rightW }}>
          {investigating ? <InvestigatePanel /> : <AgentPanel />}
        </div>
      </div>

      <StatusBar problems={problems} onProblems={() => setPanel(panel === 'problems' ? null : 'problems')} />
      <VscToasts />
    </div>
  );
}

// ------------------------------------------------------------------ side views
const FOLDERS = ['xyz-web', 'src', 'auth', 'lib', 'settings', 'ui'];
function Explorer({ file, open, code }) {
  const [shut, setShut] = usePersist('shut', []);
  const hidden = new Set();
  let skipDepth = null;
  TREE.forEach((t) => {
    if (skipDepth != null && t.depth > skipDepth) hidden.add(t.name);
    else skipDepth = null;
    if (t.folder && shut.includes(t.name) && skipDepth == null) skipDepth = t.depth;
  });
  return (
    <>
      <div className="side-h">EXPLORER</div>
      {TREE.filter((t) => !hidden.has(t.name)).map((t) => {
        const isOpen = !t.folder && file === t.name;
        const closed = shut.includes(t.name);
        return (
          <button
            type="button"
            key={t.name}
            className={`tree ${t.folder ? 'folder' : 'file'} ${isOpen ? 'on' : ''}`}
            style={{ paddingLeft: 10 + t.depth * 12 }}
            onClick={() => (t.folder ? setShut((s) => (s.includes(t.name) ? s.filter((x) => x !== t.name) : [...s, t.name])) : open(t.name))}
          >
            {t.folder ? <span className={`caret ${closed ? 'shut' : ''}`}>⌄</span> : <span className={`ficon ${t.name.endsWith('x') ? 'tsx' : 'ts'}`}>TS</span>}
            <span className="tree-n">{t.name}</span>
            {t.main && code !== 'original' && <span className="tree-m">M</span>}
          </button>
        );
      })}
    </>
  );
}

function SearchView({ code, open }) {
  const [q, setQ] = usePersist('q', 'savePreferences');
  const files = allFiles(code);
  const res = [];
  if (q.trim().length >= 2) {
    const ql = q.toLowerCase();
    for (const [f, src] of Object.entries(files)) {
      const hits = src
        .split('\n')
        .map((t, i) => ({ t, n: i + 1 }))
        .filter((x) => x.t.toLowerCase().includes(ql));
      if (hits.length) res.push({ f, hits });
    }
  }
  const total = res.reduce((a, b) => a + b.hits.length, 0);
  const mark = (t) => {
    const i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return t;
    return (
      <>
        {t.slice(0, i).trimStart()}
        <mark>{t.slice(i, i + q.length)}</mark>
        {t.slice(i + q.length)}
      </>
    );
  };
  return (
    <>
      <div className="side-h">SEARCH</div>
      <div className="side-pad">
        <input className="side-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" autoFocus />
        <div className="side-note">{q.trim().length < 2 ? 'Type to search the code' : `${total} ${total === 1 ? 'result' : 'results'} in ${res.length} ${res.length === 1 ? 'file' : 'files'}`}</div>
      </div>
      {res.map((r) => (
        <div key={r.f} className="sr">
          <div className="sr-f">
            <span className="ficon tsx">TS</span> {r.f} <span className="sr-c">{r.hits.length}</span>
          </div>
          {r.hits.map((h) => (
            <button type="button" key={h.n} className="sr-l" onClick={() => open(r.f, h.n)}>
              <span className="mono">{h.n}</span> <span className="sr-t">{mark(h.t)}</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

function ScmView({ changes, live, open, openAll, file }) {
  const phase = useStore((s) => s.phase);
  const verified = phase === 'verified';
  const [msg, setMsg] = usePersist('commitMsg', '');
  const [gate, setGate] = useState(false);
  const [committed, setCommitted] = usePersist('committed', null);
  const sig = changes.map((c) => c.file + ':' + c.after.length).join('|');
  const list = committed === sig ? [] : changes;
  const add = list.reduce((a, c) => a + c.add, 0), del = list.reduce((a, c) => a + c.del, 0);
  const commit = () => {
    setCommitted(sig);
    setGate(false);
    setMsg('');
    toast(`Committed ${list.length} file${list.length === 1 ? '' : 's'} to ${TASK.branch}`, 'pass');
  };
  return (
    <>
      <div className="side-h scm-hd">
        SOURCE CONTROL
        {list.length > 0 && (
          <button type="button" className="scm-ic" onClick={() => openAll(list)} title="Open all changes side by side" aria-label="Open all changes">
            <Icon name="git" size={14} />
          </button>
        )}
      </div>
      <div className="side-pad">
        <textarea className="side-input ta" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder={verified ? `Fix: notification preferences now persist (#${TASK.id})` : `Message (commit on ${TASK.branch})`} />
        <Button wide small disabled={!list.length || live} onClick={() => (verified ? commit() : setGate(true))} icon="check">
          {live ? 'Agent is still editing…' : 'Commit'}
        </Button>
        {gate && (
          <div className="gate">
            <div className="gate-h">
              <LiveMascot size={26} badge={false} /> <b>5 specs not verified yet</b>
            </div>
            <p>SpecSight has not checked these changes against task #{TASK.id}.</p>
            <div className="gate-a">
              <Button small onClick={() => (setGate(false), phase === 'idle' ? actions.verify() : actions.backToSpecSight())}>
                {phase === 'idle' ? 'Verify 5 specs' : 'Open SpecSight'}
              </Button>
              <Button small kind="secondary" onClick={commit}>
                Commit anyway
              </Button>
            </div>
          </div>
        )}
        {verified && (
          <div className="scm-ok">
            <Icon name="check" size={13} sw={2.6} /> SpecSight: 5 of 5 specs verified
          </div>
        )}
      </div>
      <div className="side-sub scm-sub">
        CHANGES <span className="scm-count">{list.length}</span>
        {list.length > 0 && <span className="scm-n tot"><span className="plus">+{add}</span> <span className="minus">−{del}</span></span>}
      </div>
      {live && (
        <div className="scm-live">
          <i /> The agent is editing. Changes appear here as it types.
        </div>
      )}
      {list.length ? (
        list.map((c) => (
          <button type="button" key={c.file} className={`tree file scm-file ${file === 'diff:' + c.file ? 'on' : ''} ${live && c.file === 'NotificationSettings.tsx' ? 'pulse' : ''}`} style={{ paddingLeft: 14 }} onClick={() => open('diff:' + c.file)} title="Open changes side by side">
            <span className="ficon tsx">TS</span>
            <span className="tree-n">
              {c.file}
              <small>{PATH_OF(c.file).replace(/ › /g, '/')}</small>
            </span>
            <span className="scm-n">
              <span className="plus">+{c.add}</span> {c.del > 0 && <span className="minus">−{c.del}</span>}
            </span>
            <span className={`tree-m ${c.st === 'A' ? 'a' : ''}`}>{c.st}</span>
          </button>
        ))
      ) : (
        <div className="side-note pad">{committed ? 'Committed. Nothing new to commit.' : 'No changes yet. Ask the agent to fix the task and its edits show up here live.'}</div>
      )}
    </>
  );
}

const TERMINAL = {
  'npm test': (s) => [
    { t: '> xyz-web@2.4.0 test' },
    { t: '> vitest run src/settings' },
    { t: '' },
    { k: 'ok', t: ' ✓ src/settings/NotificationSettings.test.tsx (6 tests) 412ms' },
    { k: 'ok', t: ' ✓ src/settings/SettingsForm.test.tsx (4 tests) 188ms' },
    { t: '' },
    { k: 'ok', t: ' Test Files  2 passed (2)' },
    { k: 'ok', t: '      Tests  10 passed (10)' },
    { t: '   Duration  1.31s' },
    ...(s.code !== 'fixed' ? [{ t: '' }, { k: 'ss', t: 'SpecSight: these unit tests mock savePreferences(), so they cannot see that Save never calls it. SpecSight tests the real app against the 5 specs.' }] : []),
  ],
  'npm run dev': () => [{ t: '> xyz-web@2.4.0 dev' }, { t: '> vite' }, { t: '' }, { k: 'ok', t: '  VITE v5.4.10  ready in 412 ms' }, { t: '  ➜  Local:   http://localhost:5173/' }],
  'git status': (s) => [{ t: `On branch ${TASK.branch}` }, ...(s.code === 'original' ? [{ t: 'nothing to commit, working tree clean' }] : [{ t: 'Changes not staged for commit:' }, { k: 'err', t: '        modified:   src/settings/NotificationSettings.tsx' }])],
  clear: () => [],
};

function RunView({ run }) {
  const [ran, setRan] = usePersist('ranTests', false);
  const code = useStore((s) => s.code);
  return (
    <>
      <div className="side-h">RUN AND DEBUG</div>
      <div className="side-pad">
        <button type="button" className="run-cfg" onClick={() => (run('npm test'), setRan(true))}>
          <Icon name="play" size={13} /> <span className="rc-t">Run unit tests<small className="mono">npm test</small></span>
        </button>
        <button type="button" className="run-cfg" onClick={() => run('npm run dev')}>
          <Icon name="play" size={13} /> <span className="rc-t">Start the dev server<small className="mono">npm run dev</small></span>
        </button>
        <button type="button" className="run-cfg" onClick={() => run('git status')}>
          <Icon name="git" size={13} /> <span className="rc-t">Show what changed<small className="mono">git status</small></span>
        </button>
        {ran && code !== 'fixed' && (
          <div className="gate">
            <div className="gate-h">
              <LiveMascot size={26} badge={false} /> <b>10 unit tests passed</b>
            </div>
            <p>They mock savePreferences(), so they cannot catch that Save never calls it. SpecSight tests the real app against the 5 specs instead.</p>
          </div>
        )}
      </div>
    </>
  );
}

function ExtView() {
  const [opts, setOpts] = usePersist('extOpts', { offer: true, only: true, capsule: true, po: true });
  const T = (k, t) => (
    <label className="ext-opt">
      <input type="checkbox" checked={opts[k]} onChange={() => setOpts((o) => ({ ...o, [k]: !o[k] }))} /> {t}
    </label>
  );
  return (
    <>
      <div className="side-h">EXTENSIONS</div>
      <div className="side-pad">
        <div className="ext ext-main">
          <LiveMascot size={40} />
          <div>
            <b>SpecSight</b>
            <span>Checks AI-written code against your task’s specs before peer review.</span>
          </div>
        </div>
        <div className="ext-opts">
          {T('offer', 'Offer to verify when the agent finishes')}
          {T('only', 'Re-test only what changed')}
          {T('capsule', 'Add the Proof Capsule to pull requests')}
          {T('po', 'Ask the Product Owner from SpecSight')}
        </div>
        <div className="side-sub">INSTALLED</div>
        {[
          ['ES', 'ESLint', 'Finds problems in JavaScript and TypeScript', '#4B32C3'],
          ['P', 'Prettier', 'Formats your code', '#1A2B34'],
          ['A', 'Azure Boards', 'Links commits and pull requests to work items', '#0078D4'],
        ].map(([i, n, d, c]) => (
          <div key={n} className="ext">
            <span className="ext-i" style={{ background: c }}>
              {i}
            </span>
            <div>
              <b>{n}</b>
              <span>{d}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function BottomPanel({ tab, setTab, h, term, run, open, problems }) {
  const [cmd, setCmd] = useState('');
  const box = useRef(null);
  const statuses = useStore(allStatuses);
  const phase = useStore((s) => s.phase);
  useEffect(() => {
    box.current && (box.current.scrollTop = 99999);
  }, [term.length, tab]);
  const out = [
    phase !== 'idle' && `[SpecSight] Read 5 specs from Azure DevOps task #${TASK.id}`,
    phase !== 'idle' && '[SpecSight] Testing on a sandbox copy of the XYZ Company app',
    ...statuses.map((s, i) => (s !== 'idle' ? `[SpecSight] Spec ${i + 1}: ${statusWord(s)}` : null)),
  ].filter(Boolean);
  return (
    <div className="bpanel" style={{ height: h }}>
      <div className="bp-tabs">
        {[
          ['problems', `PROBLEMS ${problems ? problems : ''}`],
          ['output', 'OUTPUT'],
          ['terminal', 'TERMINAL'],
        ].map(([k, t]) => (
          <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
            {t}
          </button>
        ))}
        <button type="button" className="bp-x" onClick={() => setTab(null)} aria-label="Close panel">
          ×
        </button>
      </div>
      <div className="bp-body" ref={box} onClick={() => tab === 'terminal' && box.current.querySelector('input')?.focus()}>
        {tab === 'problems' &&
          (problems ? (
            <button type="button" className="prob" onClick={() => open('NotificationSettings.tsx', 2)}>
              <span className="warn">⚠</span> 'savePreferences' is defined but never used. <span className="sub">@typescript-eslint/no-unused-vars · NotificationSettings.tsx [Ln 2]</span>
            </button>
          ) : (
            <div className="sub">No problems have been detected in the workspace.</div>
          ))}
        {tab === 'output' && (out.length ? out.map((l, i) => <div key={i} className="mono">{l}</div>) : <div className="sub">SpecSight has no output yet.</div>)}
        {tab === 'terminal' && (
          <>
            {term.map((l, i) => (
              <div key={i} className={`mono tl-${l.k || 'n'}`}>
                {l.k === 'cmd' ? <span className="tl-p">~/xyz-web $ </span> : null}
                {l.t || ' '}
              </div>
            ))}
            <form
              className="term-in mono"
              onSubmit={(e) => {
                e.preventDefault();
                if (cmd.trim()) run(cmd);
                setCmd('');
              }}
            >
              <span className="tl-p">~/xyz-web $ </span>
              <input value={cmd} onChange={(e) => setCmd(e.target.value)} spellCheck={false} aria-label="Terminal input" placeholder={term.length ? '' : 'npm test'} />
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ status bar
function StatusBar({ problems, onProblems }) {
  const v = useStore((s) => s.vsc);
  const phase = useStore((s) => s.phase);
  const statuses = useStore(allStatuses);
  const hintOn = useHintFor('status-ss');
  const verified = statuses.filter((x) => x === 'pass' || x === 'fixed').length;
  let ss = 'SpecSight';
  if (v.toast === 'minimized' || (v.stage === 'done' && phase === 'idle' && !v.toast)) ss = 'SpecSight · 5 specs not verified';
  if (phase === 'verified' || v.stage === 'final') ss = `SpecSight ✓ ${verified}/5 verified`;
  if (v.stage === 'investigate') ss = get().code === 'fixed' ? 'SpecSight · re-test Spec 2 and Spec 4' : `SpecSight · Spec ${v.investigateSpec} broke`;
  return (
    <footer className="vsc-status">
      <span className="sb-remote">&gt;&lt;</span>
      <span>⑂ {TASK.branch}</span>
      <button type="button" className="sb-prob" onClick={onProblems}>
        ⊗ 0 <span className={problems ? 'warn' : ''}>⚠ {problems}</span>
      </button>
      <button type="button" className={`sb-ss ${v.toast === 'minimized' ? 'pulse' : ''} ${hintOn ? 'hint' : ''}`} onClick={() => (phase === 'idle' && v.stage === 'done' ? actions.showVerify() : phase !== 'idle' ? actions.backToSpecSight() : null)}>
        <LiveMascot size={18} badge={false} follow={false} /> {ss}
      </button>
      <span className="sb-r">Ln 26, Col 5 &nbsp; Spaces: 2 &nbsp; UTF-8 &nbsp; TypeScript JSX</span>
    </footer>
  );
}

// ------------------------------------------------------------------ notifications
function VscToasts() {
  const t = useStore((s) => s.vsc.toast);
  if (!t || t === 'minimized') return null;
  return (
    <div className="vsc-toast" key={t}>
      <div className="vt-head">
        <LiveMascot size={40} />
        <div>
          <div className="vt-title">SpecSight</div>
          {t === 'verify' && <div className="vt-text">The agent changed NotificationSettings.tsx. Check it against the 5 specs of #{TASK.id} before peer review?</div>}
          {t === 'retest' && <div className="vt-text">You changed handleSave(). Re-test Spec 2 and Spec 4? The other specs stay verified.</div>}
          {t === 'sent' && <div className="vt-text">Sent for peer review. Pull request #2291 is open with the summary and the Proof Capsule. 5 of 5 specs verified.</div>}
        </div>
        {t !== 'sent' && (
          <button type="button" className="vt-x" onClick={actions.minimizeVerify} aria-label="Hide">
            ×
          </button>
        )}
      </div>
      <div className="vt-actions">
        {t === 'verify' && (
          <>
            <Button small kind="secondary" onClick={actions.minimizeVerify}>
              Not now
            </Button>
            <Button small hint="verify" onClick={actions.verify}>
              Verify 5 specs
            </Button>
          </>
        )}
        {t === 'retest' && (
          <Button small hint="retest" onClick={actions.retestFromVSCode}>
            Re-test in SpecSight
          </Button>
        )}
        {t === 'sent' && (
          <>
            <Button small kind="secondary" iconRight="external" onClick={actions.openPRPage}>
              Open pull request
            </Button>
            <Button small onClick={actions.reset}>
              Start again
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ agent chat
const TASKS = [{ id: TASK.id, title: TASK.title, state: 'Active', specs: 5 }];

function AgentPanel() {
  const v = useStore((s) => s.vsc);
  const [text, setText] = useState('');
  const [task, setTask] = useState(false);
  const [menu, setMenu] = useState(false);
  const [typing, setTyping] = useState(false);
  const ta = useRef(null);
  const list = useRef(null);
  const sendHint = useHintFor('send');
  const compHint = useHintFor('composer');
  const working = v.stage === 'working';

  useEffect(() => {
    setVsc({ hasTask: task });
  }, [task]);
  useEffect(() => {
    if (v.askTask) setMenu(true);
  }, [v.askTask]);
  useEffect(() => {
    list.current && list.current.scrollTo({ top: 99999, behavior: 'smooth' });
  }, [v.chat.length, v.agentSteps.length, v.agentSteps]);

  const typeIn = (full, withTask) => {
    if (typing) return;
    setTyping(true);
    if (withTask) setTask(true);
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setText(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(id);
        setTyping(false);
        ta.current && ta.current.focus();
      }
    }, 22);
  };
  const onChange = (e) => {
    const val = e.target.value;
    setText(val);
    const hash = /#\d*$/.test(val);
    setMenu(hash);
  };
  const pick = () => {
    setTask(true);
    setText((t) => t.replace(/#\d*$/, '').trimEnd());
    setMenu(false);
    ta.current && ta.current.focus();
  };
  const send = () => {
    if (working || typing) return;
    const msg = text.trim() || (task ? 'Fix this task.' : '');
    if (!msg && !task) return;
    actions.sendPrompt(msg, task || /184527/.test(msg));
    setText('');
    if (task || /184527/.test(msg)) setTask(false);
  };

  return (
    <aside className="agent">
      <div className="agent-h">
        <span className="label">AGENT</span>
        <span className="agent-model">xyz-web · Agent mode</span>
      </div>
      <div className="agent-list" ref={list}>
        {v.chat.length === 0 && !working && (
          <div className="agent-empty">
            <div className="agent-empty-t">What should we build?</div>
            <div className="agent-empty-s">Type # to attach a task from Azure DevOps. The agent reads its specs and changes the code.</div>
          </div>
        )}
        {v.chat.map((c, i) =>
          c.who === 'you' ? (
            <div key={i} className="msg you">
              {c.task && (
                <div className="msg-task">
                  <span className="mt-id">#{TASK.id}</span> {TASK.title}
                </div>
              )}
              {c.text}
            </div>
          ) : (
            <div key={i} className="msg agent-msg">
              {c.text}
              {c.diff && (
                <div className="diffcard">
                  <span className="ficon tsx">TS</span> NotificationSettings.tsx <span className="plus">+9</span> <span className="minus">−1</span>
                </div>
              )}
            </div>
          ),
        )}
        {(working || v.agentSteps.length > 0) && v.chat.length > 0 && v.chat[v.chat.length - 1].who === 'you' && (
          <div className="steps">
            {v.agentSteps.map((s, i) => (
              <div key={i} className={`astep ${s.done ? 'done' : ''}`}>
                <span className="astep-i">{s.done ? <Icon name="check" size={13} sw={2.4} /> : <Spinner size={12} />}</span>
                <div>
                  <div>{s.label}</div>
                  {s.detail && s.done && <div className="astep-d">{s.detail}</div>}
                </div>
              </div>
            ))}
            {working && (
              <div className="thinking">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`composer ${compHint ? 'hint' : ''} ${working ? 'off' : ''}`}>
        {menu && (
          <div className="task-menu">
            <div className="tm-h">Azure DevOps · assigned to you</div>
            {TASKS.map((t) => (
              <button type="button" key={t.id} className="tm-i" onClick={pick}>
                <span className="mt-id">#{t.id}</span>
                <span className="tm-t">{t.title}</span>
                <span className="tm-m">{t.specs} specs · {t.state}</span>
              </button>
            ))}
          </div>
        )}
        {task && (
          <div className="task-chip">
            <div className="tc-top">
              <span className="mt-id">#{TASK.id}</span>
              <b>{TASK.title}</b>
              <button type="button" className="tc-x" onClick={() => setTask(false)} aria-label="Remove task">
                ×
              </button>
            </div>
            <div className="tc-d">{TASK.description}</div>
            <div className="tc-specs">
              {SPECS.map((s) => (
                <span key={s.id}>
                  <b>Spec {s.id}</b> {s.text}
                </span>
              ))}
            </div>
          </div>
        )}
        <textarea
          ref={ta}
          value={text}
          disabled={working}
          placeholder={working ? 'The agent is working…' : task ? 'Add anything the agent should know…' : 'Ask the agent… Type # to add a task'}
          onChange={onChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (menu) pick();
              else send();
            }
            if (e.key === 'Escape') setMenu(false);
          }}
        />
        <div className="composer-foot">
          {!task && !working && v.chat.length === 0 && (
            <div className="sugs">
              <button type="button" className="sug" onClick={() => typeIn('Fix this. Make sure it meets all 5 specs in the task.', true)}>
                #{TASK.id} Fix it using its specs
              </button>
              <button type="button" className="sug" onClick={() => {
                setText('#');
                setMenu(true);
                ta.current && ta.current.focus();
              }}>
                # Pick a task
              </button>
            </div>
          )}
          <button type="button" className={`send ${sendHint ? 'hint' : ''}`} onClick={send} disabled={working || (!text.trim() && !task)} aria-label="Send">
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ investigate panel
const INV = {
  2: {
    title: 'Choices stay after a refresh',
    expected: 'Product updates is still on after the refresh.',
    happened: 'It is off again. No save request was sent.',
    caseId: 's2d',
    wrong: [
      ['1', 'sky', 'The user turns on Product updates.'],
      ['2', 'sky', 'Save runs, but nothing is sent to the server.'],
      ['3', 'sky', 'After a refresh, the old choice loads.'],
      ['4', 'fail', 'Product updates is off again.'],
    ],
  },
  4: {
    title: 'A failed save shows an error',
    expected: 'Saving while offline shows the error and keeps the choices.',
    happened: 'It showed “Changes saved”. No error appeared.',
    caseId: 's4a',
    wrong: [
      ['1', 'sky', 'The browser goes offline.'],
      ['2', 'sky', 'The user turns on Product updates.'],
      ['3', 'sky', 'Save runs, but never calls the server.'],
      ['4', 'fail', 'Nothing can fail, so it shows “Saved”.'],
    ],
  },
};

function InvestigatePanel() {
  const v = useStore((s) => s.vsc);
  const code = useStore((s) => s.code);
  const spec = v.investigateSpec;
  const d = INV[spec];
  const steps = stepsForCase(d.caseId, 1);
  const fixed = code === 'fixed';
  return (
    <aside className="inv">
      <div className="inv-h">
        <LiveMascot size={24} badge={false} />
        <span className="label">SPECSIGHT · INVESTIGATE</span>
      </div>
      <div className="inv-task">
        #{TASK.id} · {TASK.title}
      </div>
      <div className="inv-tabs">
        {[2, 4].map((n) => (
          <button type="button" key={n} className={`inv-tab ${spec === n ? 'on' : ''}`} onClick={() => actions.setInvestigateSpec(n)}>
            <Tag n={n} st={fixed ? 'fixed' : 'fail'} small />
          </button>
        ))}
        <span className="inv-same">Same cause</span>
      </div>
      <div className="inv-title">{d.title}</div>
      {fixed ? (
        <div className="inv-fixed">
          <div className="inv-fixed-t">
            <Icon name="check" size={16} sw={2.4} /> Fixed in the editor
          </div>
          <p>handleSave() now calls savePreferences() before it shows “Saved”, and shows the error banner if saving fails.</p>
          <p>Spec 1, 3 and 5 stay verified. Only Spec 2 and Spec 4 need to run again.</p>
        </div>
      ) : (
        <>
          <div className="inv-row">
            <span className="label">EXPECTED</span>
            <p>{d.expected}</p>
          </div>
          <div className="inv-row">
            <span className="label bad">HAPPENED</span>
            <p>{d.happened}</p>
          </div>
          <div className="label inv-l">RECORDING · {steps.length} STEPS</div>
          <div className="inv-thumbs">
            {steps.map((s, i) => (
              <button type="button" key={i} className={`inv-thumb ${s.broke ? 'broke' : ''}`} onClick={() => actions.openRecording(d.caseId, 1)}>
                <Thumb steps={[s]} width={128} />
                <span className={`it-n ${s.broke ? 'bad' : ''}`}>{i + 1}</span>
                <span className="it-l">{s.label}</span>
              </button>
            ))}
          </div>
          <div className="label inv-l">WHAT WENT WRONG</div>
          <div className="inv-wrong">
            {d.wrong.map(([n, tone, t]) => (
              <div key={n}>
                <span className={`nb nb-${tone}`}>{n}</span>
                {t}
              </div>
            ))}
          </div>
          <div className="fixbox">
            <div className="label ac">
              <Icon name="sparkle" size={12} /> SUGGESTED FIX · BOTH SPECS
            </div>
            <p>Call savePreferences() before showing “Saved”. If it fails, show the error banner and keep the choices.</p>
          </div>
        </>
      )}
      <div className="inv-actions">
        {fixed ? (
          <Button hint="retest" onClick={actions.retestFromVSCode} wide>
            Re-test Spec 2 and Spec 4
          </Button>
        ) : (
          <>
            <Button hint="sendagent" onClick={actions.sendFromVSCode}>
              Fix by agent
            </Button>
            <Button kind="secondary" onClick={actions.applyFixYourself} disabled={v.editorFixing}>
              {v.editorFixing ? 'Fixing…' : 'Fix it myself'}
            </Button>
          </>
        )}
      </div>
      <BackButton className="inv-back" onClick={actions.backToSpecSight}>
        Back to SpecSight
      </BackButton>
    </aside>
  );
}
