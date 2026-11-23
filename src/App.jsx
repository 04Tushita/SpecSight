import { useEffect, useRef, useState } from 'react';
import { useStore, actions, allStatuses, mood, get, totalTests, hint as hintOf } from './store.js';
import { CASES, SPECS, TASK } from './data.js';
import VSCode from './VSCode.jsx';
import SpecSight, { specText, variantOf } from './SpecSight.jsx';
import Mascot, { LiveMascot } from './Mascot.jsx';
import { Button, Icon, Tag, Toasts, Swap, useEsc, Kbd, COL } from './ui.jsx';
import { Player, stepsForCase } from './Recording.jsx';
import { PRBody } from './Finish.jsx';

const BASE_W = 1440;
const BASE_H = 900;
let W = BASE_W;
let H = BASE_H;

function useScale() {
  const calc = () => {
    const k = Math.min(1, window.innerWidth / BASE_W, window.innerHeight / BASE_H);
    return { k, w: Math.round(window.innerWidth / k), h: Math.round(window.innerHeight / k) };
  };
  const [s, setS] = useState(calc);
  useEffect(() => {
    const h = () => setS(calc());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  W = s.w;
  H = s.h;
  return s.k;
}

function useNow() {
  const [d, setD] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setD(new Date()), 15000);
    return () => clearInterval(id);
  }, []);
  return d;
}

// ------------------------------------------------------------------ guided steps (on by default, toggle in the menu bar)
const FLOW = ['start', 'composer', 'send', 'verify', 'clarify', 'clarify-ta', 'update3', 'sendfix', 'summary', 'createpr', 'done'];
const GUIDE = {
  start: ['Start the demo', 'You’ll play a developer whose AI agent has just been asked to fix a ticket.'],
  composer: ['Give the agent its task', 'Click the “#184527 Fix it using its specs” suggestion, or type # to attach the ticket.'],
  send: ['Send it to the agent', 'The agent reads the ticket’s specs and edits the code. Watch Source control on the left to see the changes appear live.'],
  verify: ['Check the agent’s work', 'The agent says it’s done. Click “Verify 5 specs” to let SpecSight test it against the ticket.'],
  'status-ss': ['Open SpecSight', 'Click the eye to see how the check is going.'],
  clarify: ['Spec 3 needs you', 'It’s unclear what “Email off” should do. Click “Clarify Spec 3”. The other specs keep testing.'],
  'clarify-ta': ['Say what Spec 3 means', 'Type what it should do, or press Tab to fill in a suggestion.'],
  update3: ['Update the spec', 'Only Spec 3 re-tests with your clarification.'],
  'send-dan': ['Ask the product owner', 'Send your question. Dan will reply here.'],
  'use-dan': ['Use Dan’s answer', 'Apply the product owner’s reply to Spec 3.'],
  sendfix: ['Two specs broke', 'Read why, then click “Fix by agent”. The broken specs re-test on their own.'],
  sendagent: ['Send the fix to the agent', 'Or fix it yourself in the editor, then re-test.'],
  retest: ['Re-test the fix', 'SpecSight runs only the specs that broke.'],
  summary: ['All 5 specs pass', 'Open the summary that goes with your pull request.'],
  createpr: ['Review, then send for peer review', 'Click “See changes” to compare the code side by side, or “Create pull request” to send it with the evidence.'],
  done: ['You’re done', 'The pull request is open with its Proof Capsule. Click Done to finish.'],
  'run-mine': ['Run your test case', 'SpecSight runs your steps on a sandbox copy of the app.'],
  saveastest: ['It passed', 'Add your test case to the task’s tests.'],
  addtest: ['Add it to the task', 'Your test runs with the others from now on.'],
};
function GuideToggle() {
  const on = useStore((s) => s.hints);
  return (
    <button type="button" className={`guide-tg ${on ? 'on' : ''}`} onClick={actions.toggleHints} title="Show or hide the step-by-step guide">
      <span className={`dock-sw ${on ? 'on' : ''}`} /> Guide {on ? 'on' : 'off'}
    </button>
  );
}
// visible, not mid-transition (a leaving screen still carries the old marks)
function seen(el) {
  if (el.closest('.swap-leave')) return null;
  const r = el.getBoundingClientRect();
  return r.width > 4 && r.height > 4 ? r : null;
}
function Guide() {
  const raw = useStore(hintOf);
  const on = useStore((s) => s.hints && !s.modal);
  // hold a step for a moment before showing it, so quick in-between states don't flash
  const [id, setId] = useState(null);
  useEffect(() => {
    const ms = raw ? (id ? 650 : 450) : 500;
    const t = setTimeout(() => setId(raw && GUIDE[raw] ? raw : null), ms);
    return () => clearTimeout(t);
  }, [raw]);
  const [g, setG] = useState(null);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    if (!on) return setG(null);
    let last = '';
    const tick = () => {
      const stage = document.querySelector('.stage');
      if (stage) {
        const sr = stage.getBoundingClientRect(), k = sr.width / W;
        const map = (r) => ({ x: Math.round((r.left - sr.left) / k), y: Math.round((r.top - sr.top) / k), w: Math.round(r.width / k), h: Math.round(r.height / k) });
        let box = null;
        if (id) for (const el of document.querySelectorAll('.stage .hint')) { const r = seen(el); if (r) { box = map(r); const c = el.closest('.panel, .left, .agent, .vsc-side'); const cr = c && c.getBoundingClientRect(); if (cr && cr.width / k < 460) { const m = map(cr); box.ax = m.x; box.aw = m.w; } break; } }
        const opts = [];
        const labels = new Set();
        for (const el of document.querySelectorAll('.stage [data-opt]')) {
          const r = seen(el);
          const l = el.getAttribute('data-opt');
          if (r && !labels.has(l) && !el.classList.contains('hint')) { labels.add(l); opts.push({ ...map(r), l }); }
        }
        const next = { box, opts: opts.slice(0, 3) };
        const key = JSON.stringify(next);
        if (key !== last) { last = key; setG(next); }
      }
      raf.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf.current);
  }, [id, on]);
  if (!on || !g || (!g.box && !g.opts.length)) return null;
  const box = g.box;
  const cw = 320, pad = 8, gap = 18;
  let card = null;
  if (box && id) {
    const [title, text] = GUIDE[id];
    const step = FLOW.indexOf(id);
    const estH = 150 + (g.opts.length ? 26 + g.opts.length * 22 : 0);
    // beside the target when there is room, so the card never sits on the buttons next to it
    const ax = box.ax ?? box.x, aw = box.aw ?? box.w;
    let side = ax + aw + gap + cw < W - 8 ? 'right' : ax - gap - cw > 8 ? 'left' : box.y + box.h + estH < H ? 'below' : 'above';
    if ((side === 'right' || side === 'left') && box.w > 700) side = box.y + box.h + estH < H ? 'below' : 'above';
    const cy = box.y + box.h / 2, cx = box.x + box.w / 2;
    const st = { width: cw };
    let arrow = {};
    if (side === 'right' || side === 'left') {
      const top = Math.max(40, Math.min(H - estH - 10, cy - 50));
      st.top = top;
      st.left = side === 'right' ? ax + aw + gap : ax - gap - cw;
      arrow = { top: Math.max(16, Math.min(estH - 24, cy - top)) };
    } else {
      const left = Math.max(12, Math.min(W - cw - 12, cx - cw / 2));
      st.left = left;
      st.top = side === 'below' ? box.y + box.h + gap : box.y - gap;
      arrow = { left: Math.max(18, Math.min(cw - 18, cx - left)) };
    }
    card = (
      <div key={id} className={`guide-card ${side}`} style={st}>
        <i className="guide-arrow" style={arrow} />
        <div className="guide-top">
          <span className="guide-step">{step >= 0 ? `Step ${step + 1} of ${FLOW.length}` : 'Next step'}</span>
          <button type="button" className="guide-x" onClick={actions.toggleHints}>
            Hide guide
          </button>
        </div>
        <b>{title}</b>
        <p>{text}</p>
        {g.opts.length > 0 && (
          <div className="guide-also">
            <span>You can also</span>
            {g.opts.map((o) => (
              <div key={o.l}>{o.l}</div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="guide" aria-live="polite">
      {g.opts.map((o) => (
        <div key={o.l} className="guide-opt" style={{ left: o.x - 5, top: o.y - 5, width: o.w + 10, height: o.h + 10 }}>
          <span>Optional</span>
        </div>
      ))}
      {box && id && <div className="guide-ring" style={{ left: box.x - pad, top: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2 }} />}
      {card}
    </div>
  );
}

function MenuBar() {
  const app = useStore((s) => s.app);
  const now = useNow();
  const t = now.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const name = app === 'specsight' ? 'SpecSight' : app === 'vscode' ? 'Code' : 'SpecSight';
  const menus = app === 'vscode' ? ['File', 'Edit', 'Selection', 'View', 'Go', 'Terminal', 'Window'] : ['File', 'Edit', 'View', 'Window', 'Help'];
  return (
    <div className="menubar">
      <span className="mb-apple">●</span>
      <b>{name}</b>
      {menus.map((m) => (
        <span key={m}>{m}</span>
      ))}
      <span className="mb-r">
        <GuideToggle />
        <Dock />
        <span>{t}</span>
      </span>
    </div>
  );
}

function Intro() {
  return (
    <div className="intro">
      <div className="intro-glow" />
      <div className="intro-eye">
        <Mascot mood="idle" statuses={['pass', 'pass', 'wait', 'fail', 'run']} size={260} />
      </div>
      <h1>SpecSight</h1>
      <p className="intro-tag">See if your AI agent’s code meets the specs of the task, before peer review.</p>
      <div className="intro-card">
        <div className="label ac">YOUR TASK TODAY</div>
        <p>
          You are a developer at <b>XYZ Company</b>. Task <b>#{TASK.id}</b>, “{TASK.title}”, has 5 specs. Ask the agent to fix it, then let SpecSight check its work.
        </p>
      </div>
      <div className="intro-feats">
        <span>
          <Icon name="map" size={15} /> Tests every spec on a sandbox copy
        </span>
        <span>
          <Icon name="search" size={15} /> Shows what broke and why
        </span>
        <span>
          <Icon name="list" size={15} /> Writes the PR summary, with proof
        </span>
      </div>
      <Button hint="start" onClick={actions.start} iconRight="chevRight">
        Start in VS Code
      </Button>
    </div>
  );
}

// ------------------------------------------------------------------ modals
function RecordingModal({ m }) {
  const s = useStore((x) => x);
  const isYours = m.caseId === 'yours';
  const c = CASES.find((x) => x.id === m.caseId);
  const cs = c ? s.cases[c.id] : null;
  const hasTwo = cs && cs.runs.length > 1 && (c.fails1 || c.waits);
  const [run, setRun] = useState(m.run);
  const steps = isYours ? (s.yours?.recording || []).map((x) => ({ ...x, run: 1 })) : stepsForCase(c.id, run);
  const live = cs && cs.st === 'run';
  const spec = isYours ? s.yours.spec : c.spec;
  const result = isYours ? 'Passed' : cs.st === 'run' ? 'Testing now' : cs.st === 'queued' ? 'Queued' : run === 1 && c.fails1 && (cs.runs[0] === 'fail') ? `Broke · ${c.fails1}` : run === 1 && c.waits && cs.runs[0] === 'wait' ? 'Needs clarification · a security alert still arrives' : 'Passed';
  return (
    <div className="modal-card rec-modal">
      <header className="mc-h">
        {isYours ? <span className="yours-chip static">Yours</span> : <Tag n={spec} st={result.startsWith('Broke') ? 'fail' : result.startsWith('Needs') ? 'wait' : result === 'Passed' ? 'pass' : 'run'} small />}
        <b>{isYours ? s.yours.name : c.name}</b>
        {live && <span className="live inline">● LIVE</span>}
        {hasTwo && (
          <div className="seg sm">
            <button type="button" className={run === 1 ? 'on' : ''} onClick={() => setRun(1)}>
              Run 1
            </button>
            <button type="button" className={run === 2 ? 'on' : ''} onClick={() => setRun(2)}>
              {c.waits ? 'Re-tested' : 'Run 2'}
            </button>
          </div>
        )}
        <button type="button" className="icon-btn mc-x" onClick={actions.closeModal} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </header>
      <div className="mc-body">
        <Player key={m.caseId + run} steps={steps} width={720} loop={live} />
        <aside className="mc-side">
          <div className="label">WHAT THIS TEST CHECKS</div>
          <p>{isYours ? s.yours.steps.join(' → ') : specText(s, spec)}</p>
          <div className="label">RESULT</div>
          <p className={result.startsWith('Broke') ? 'bad' : result.startsWith('Needs') ? 'waitc' : 'ok'}>{result}</p>
          <div className="label">RECORDED ON</div>
          <p className="sub">A sandbox copy of the XYZ Company app · Chrome · {isYours ? 'by you' : 'by SpecSight'}</p>
          <div className="label">STEPS</div>
          <p className="sub">Click a step or anywhere on the timeline to jump there.</p>
        </aside>
      </div>
    </div>
  );
}

function PRPage() {
  const s = useStore((x) => x);
  return (
    <div className="modal-card prpage">
      <header className="mc-h">
        <span className="sub">Azure Repos · {TASK.repo} · Pull requests</span>
        <button type="button" className="icon-btn mc-x" onClick={actions.closeModal} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </header>
      <div className="prp">
        <div className="prp-t">
          <span className="prp-badge">Active</span> !2291 · {s.summaryTitle}
        </div>
        <div className="sub">
          Alex Kim wants to merge {TASK.branch} into main · reviewers: Nina Patel, Omar Haddad
        </div>
        <div className="prp-tabs">
          <span className="on">Overview</span>
          <span>Files (1)</span>
          <span>Commits (2)</span>
        </div>
        <div className="prp-grid">
          <PRBody s={s} />
          <div className="prp-side">
            <div className="label ac">CHECKS</div>
            <div className="prp-check">
              <Mascot mood="happy" statuses={allStatuses(s)} size={28} badge={false} /> SpecSight · 5 of 5 specs verified
            </div>
            <div className="prp-check">✓ Build · passed</div>
            <div className="label ac">ACTIVITY</div>
            <p className="sub">Nina Patel was asked to review · just now</p>
            <p className="sub">Omar Haddad was asked to review · just now</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Shortcuts() {
  const rows = [
    ['F', 'Open or close the full Proof Lens map'],
    ['← →', 'Move between specs in the full map'],
    ['Esc', 'Close a recording, a menu or the full map'],
    ['P', 'Pause or resume testing'],
    ['?', 'Show these shortcuts'],
  ];
  return (
    <div className="modal-card shortcuts">
      <header className="mc-h">
        <b>Keyboard shortcuts</b>
        <button type="button" className="icon-btn mc-x" onClick={actions.closeModal} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </header>
      {rows.map(([k, t]) => (
        <div key={k} className="sc-row">
          <Kbd>{k}</Kbd>
          <span>{t}</span>
        </div>
      ))}
    </div>
  );
}

function TaskModal() {
  const s = useStore((x) => x);
  return (
    <div className="modal-card taskm">
      <header className="mc-h">
        <span className="sub">Azure DevOps · XYZ Company · Boards</span>
        <button type="button" className="icon-btn mc-x" onClick={actions.closeModal} aria-label="Close">
          <Icon name="x" size={16} />
        </button>
      </header>
      <div className="tm-body">
        <div className="tm-top">
          <span className="tm-type">Bug</span>
          <span className="mono">#{TASK.id}</span>
          <span className="tm-state">{s.phase === 'verified' ? 'Ready for review' : 'Active'}</span>
        </div>
        <h2>{TASK.title}</h2>
        <div className="sub">Assigned to you · Sprint 41 · Area: Settings</div>
        <div className="label ac">DESCRIPTION</div>
        <p>{TASK.description}</p>
        <div className="label ac">SPECS · DONE WHEN ALL 5 ARE VERIFIED</div>
        {SPECS.map((sp) => (
          <div key={sp.id} className="tm-spec">
            <Tag n={sp.id} st="idle" small />
            <span>{specText(s, sp.id)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Modals() {
  const m = useStore((s) => s.modal);
  useEsc(actions.closeModal, !!m);
  if (!m) return null;
  return (
    <div className="modal" onPointerDown={(e) => e.target === e.currentTarget && actions.closeModal()}>
      {m.kind === 'recording' && <RecordingModal m={m} />}
      {m.kind === 'prpage' && <PRPage />}
      {m.kind === 'shortcuts' && <Shortcuts />}
      {m.kind === 'task' && <TaskModal />}
    </div>
  );
}

// ------------------------------------------------------------------ demo menu (lives in the menu bar, outside the product UI)
function Dock() {
  const hints = useStore((s) => s.hints);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const h = (e) => !e.target.closest('.dock') && setOpen(false);
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [open]);
  const jumps = [
    ['agent', 'Ask the agent'],
    ['verify', 'The agent is done'],
    ['results', 'Results (2 broke)'],
    ['verified', 'All specs verified'],
    ['summary', 'PR summary'],
  ];
  const go = (fn) => () => {
    setOpen(false);
    fn();
  };
  return (
    <span className="dock">
      <button type="button" className={`dock-top ${open ? 'on' : ''}`} onClick={() => setOpen((o) => !o)}>
        Demo
      </button>
      {open && (
        <div className="dock-menu">
          <button type="button" onClick={go(actions.reset)}>
            <Icon name="restart" size={14} /> Restart from the beginning
          </button>
          <button type="button" onClick={actions.toggleHints} className="dock-row">
            <span className={`dock-sw ${hints ? 'on' : ''}`} /> Guided steps
          </button>
          <div className="dock-sep">Jump to</div>
          {jumps.map(([k, t]) => (
            <button type="button" key={k} onClick={go(() => actions.jump(k))}>
              {t}
            </button>
          ))}
          <div className="dock-sep" />
          <button type="button" onClick={go(actions.openShortcuts)}>
            <Icon name="keyboard" size={14} /> Keyboard shortcuts
          </button>
        </div>
      )}
    </span>
  );
}

export default function App() {
  const k = useScale();
  const app = useStore((s) => s.app);

  useEffect(() => {
    const h = (e) => {
      if (e.target.closest && e.target.closest('input, textarea, select')) return;
      const s = get();
      if (e.key === '?') actions.openShortcuts();
      if ((e.key === 'f' || e.key === 'F') && !s.modal && s.app === 'specsight' && s.ss.screen === 'lens' && !s.ss.fullMap && !['reading', 'opening', 'idle'].includes(s.phase)) actions.setFullMap(true);
      if ((e.key === 'p' || e.key === 'P') && (s.phase === 'testing' || s.phase === 'retesting')) actions.togglePause();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <div className="viewport">
      <div className="stage" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${k})` }}>
        <MenuBar />
        <div className="desk">
          <Swap k={app} kind={app === 'specsight' ? 'zoom' : 'fade'} ms={480}>
            {app === 'intro' && <Intro />}
            {app === 'vscode' && <VSCode />}
            {app === 'specsight' && <SpecSight />}
          </Swap>
        </div>
        <Toasts />
        <Modals />
        <Guide />
      </div>
    </div>
  );
}
