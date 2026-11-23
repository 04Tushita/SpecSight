import { useEffect, useMemo, useRef, useState } from 'react';
import { backTarget } from './store.js';
import { useStore, actions, allStatuses, countVerified, caseCounts, specStatus, mood, get, totalTests } from './store.js';
import { CLARIFY_EXAMPLE } from './data.js';
import { SPECS, CASES, TASK, CODE, AGENT_LINES_V1, AGENT_LINES_FIX, SPEC_LINES, lineOf, fmt, DAN_REPLY } from './data.js';
import Lens from './Lens.jsx';
import { LiveMascot } from './Mascot.jsx';
import CodeView, { linesFor } from './Code.jsx';
import { Button, Icon, Tag, Triangle, Spinner, Swap, statusColor, statusWord, COL, useHintFor, openRecordingFor, BackButton, Sash } from './ui.jsx';
import { Thumb, stepsForCase } from './Recording.jsx';
import FullMap from './FullMap.jsx';
import { TryIt, SaveTest } from './Sandbox.jsx';
import { Summary, Capsule, PRCreated, Creating } from './Finish.jsx';
import { useSpring } from './anim.js';

export const specLabel = (s, n) => (n === 3 && s.clarified ? SPECS[2].clarifiedLabel : SPECS[n - 1].label);
export const specText = (s, n) => (n === 3 && s.clarified ? SPECS[2].clarifiedText : SPECS[n - 1].text);
export const variantOf = (cs) => (cs && cs.st === 'pass' && cs.runs.length > 1 ? 2 : 1);

export function statusLine(s) {
  const st = allStatuses(s);
  const v = countVerified(s);
  const fails = st.filter((x) => x === 'fail').length;
  const sc = s.ss.screen;
  if (sc === 'tryit') {
    const r = s.sandbox?.run;
    if (r?.running) return 'Try your own test case  ·  running it on a sandbox copy';
    if (r?.done) return `Try your own test case  ·  ${r.passed ? 'it passed' : 'it failed'}`;
    return 'Try your own test case  ·  write it or choose options';
  }
  if (sc === 'savetest') return 'Try your own test case  ·  saving it as a test';
  if (sc === 'summary') return `#${TASK.id}  ·  Summary and Proof Capsule  ·  ${v} of 5 specs verified`;
  if (sc === 'capsule') return 'Proof Capsule  ·  every recording, playable in a browser';
  if (sc === 'pr') return `#${TASK.id}  ·  Pull request opened  ·  waiting for peer review`;
  if (s.phase === 'reading') return `Reading the 5 specs of task #${TASK.id}`;
  if (s.phase === 'opening') return '5 specs found  ·  opening the Proof Lens';
  if (s.phase === 'testing') return st[2] === 'wait' && !s.clarified ? 'Testing continues  ·  Spec 3 needs clarification' : 'Verifying 5 specs  ·  the agent is testing a sandbox copy of the XYZ Company app';
  if (s.phase === 'fixing') return 'The agent is fixing handleSave()';
  if (s.phase === 'retesting') return 'Re-testing Spec 2 and Spec 4  ·  the other specs stay verified';
  if (s.phase === 'verified') return s.yours?.justAdded ? 'Your test was added  ·  all 5 specs verified  ·  ready for peer review' : 'All 5 specs verified  ·  Proof Capsule sealed  ·  ready for peer review';
  if (s.phase === 'results') {
    const parts = [`${v} of 5 specs verified`];
    if (fails) parts.push(`${fails} broke`);
    if (st[2] === 'wait') parts.push('Spec 3 needs clarification');
    else if (s.clarified) parts.push('Spec 3 clarified');
    return parts.join('  ·  ');
  }
  return '';
}

// ------------------------------------------------------------------ window
export default function SpecSight() {
  const screen = useStore((s) => s.ss.screen);
  const fullMap = useStore((s) => s.ss.fullMap);
  const creating = useStore((s) => s.ss.creating);
  const k = screen === 'reading' ? 'lens' : screen;
  return (
    <div className="ss">
      <HeaderBar />
      <div className="ss-body">
        <Swap k={k} kind="rise" ms={380}>
          {k === 'lens' && <Main />}
          {k === 'tryit' && <TryIt />}
          {k === 'savetest' && <SaveTest />}
          {k === 'summary' && <Summary />}
          {k === 'capsule' && <Capsule />}
          {k === 'pr' && <PRCreated />}
        </Swap>
        {fullMap && <FullMap />}
        {creating != null && <Creating step={creating} />}
      </div>
    </div>
  );
}

function HeaderBar() {
  const line = useStore(statusLine);
  const phase = useStore((s) => s.phase);
  const screen = useStore((s) => s.ss.screen);
  const fullMap = useStore((s) => s.ss.fullMap);
  const clock = useStore((s) => s.clock);
  const paused = useStore((s) => s.paused);
  const back = useStore((s) => backTarget(s)?.label);
  const running = phase === 'testing' || phase === 'retesting';
  return (
    <header className="ss-bar">
      {back && (
        <BackButton onClick={actions.back}>
          <span>Back</span>
          <span className="back-to">{back}</span>
        </BackButton>
      )}
      <LiveMascot size={40} />
      <b className="ss-name">SpecSight</b>
      <span className="ss-div" />
      <span className="ss-line" key={line}>
        {line}
      </span>
      <span className="ss-bar-r">
        {running && (
          <span className={`ss-run ${paused ? 'paused' : ''}`}>
            <span className="ss-run-dot" />
            {paused ? 'Paused' : 'Testing'} · <span className="mono">{fmt(clock)}</span>
          </span>
        )}
      </span>
    </header>
  );
}

// ------------------------------------------------------------------ main lens screen
let rightWidth = 416;
function Main() {
  const logOpen = useStore((s) => s.ss.logOpen);
  const [rw, setRw] = useState(rightWidth);
  return (
    <div className={`main ${logOpen ? '' : 'log-closed'}`}>
      <LeftColumn />
      <div className="center">
        <LensPanel />
        <TestLog />
      </div>
      <Sash dir="x" value={rw} min={340} max={640} invert onChange={(x) => setRw((rightWidth = x == null ? 416 : x))} />
      <div className="right-wrap" style={{ width: rw }}>
        <RightColumn />
      </div>
    </div>
  );
}

function TaskCard() {
  return (
    <div className="panel card task">
      <div className="label ac">TASK #{TASK.id}</div>
      <div className="task-t">{TASK.title}</div>
      <div className="task-m">
        {TASK.source} · 5 specs
      </div>
      <div className="task-d">Done when all 5 specs are verified</div>
      <button type="button" className="link" onClick={actions.openTask}>
        Open task ↗
      </button>
    </div>
  );
}

function LeftColumn() {
  const phase = useStore((s) => s.phase);
  const specsRead = useStore((s) => s.specsRead);
  const statuses = useStore(allStatuses);
  const clarified = useStore((s) => s.clarified);
  const right = useStore((s) => s.ss.right);
  const paused = useStore((s) => s.paused);
  const fixAnim = useStore((s) => s.fixAnim);
  const yours = useStore((s) => s.yours);
  const clarifyText = useStore((s) => s.clarifyText);
  const fails = statuses.filter((x) => x === 'fail');
  const waiting = statuses[2] === 'wait' && !clarified;
  const reading = phase === 'reading' || phase === 'opening';
  return (
    <div className="left">
      <TaskCard />
      {reading && (
        <div className="panel card">
          <div className="label ac">{phase === 'opening' ? '5 SPECS FOUND' : 'READING THE SPECS'}</div>
          <div className="read-list">
            {SPECS.map((s, i) => (
              <div key={s.id} className={`read-row ${i < specsRead ? 'in' : ''}`}>
                <Tag n={s.id} st="idle" small />
                <span>{s.text}</span>
              </div>
            ))}
          </div>
          <div className="card-foot">
            From {TASK.source} · {specsRead} of 5 read
          </div>
        </div>
      )}
      {!reading && waiting && (
        <div className={`panel card c-wait ${fails.length ? 'compact' : ''}`}>
          <div className="label wait">NEEDS CLARIFICATION</div>
          <Tag n={3} st="wait" small onClick={() => actions.togglePopover(3)} />
          {!fails.length && <p>“Email off” might not mean every email. Add the missing context while the rest is tested.</p>}
          {fails.length > 0 && <p>Does “Email off” stop every email?</p>}
          {right === 'clarify' || right === 'ask' ? (
            <div className="card-note">
              <Spinner size={12} color={COL.wait} /> {right === 'ask' ? 'Asking Dan…' : 'Adding context on the right'}
            </div>
          ) : (
            <Button hint="clarify" onClick={actions.openClarify} kind={fails.length ? 'secondary' : 'primary'} small={fails.length > 0}>
              Clarify Spec 3
            </Button>
          )}
        </div>
      )}
      {phase === 'results' && fails.length > 0 && (
        <div className="panel card c-fail">
          <div className="label bad">NEEDS A FIX</div>
          {statuses[1] === 'fail' && (
            <div className="fix-item">
              <Tag n={2} st="fail" small onClick={() => actions.togglePopover(2)} />
              <p>Product updates came back off after a refresh.</p>
            </div>
          )}
          {statuses[3] === 'fail' && (
            <div className="fix-item">
              <Tag n={4} st="fail" small onClick={() => actions.togglePopover(4)} />
              <p>Saving offline showed no error.</p>
            </div>
          )}
          <div className="sep" />
          <div className="label ac">
            <Icon name="sparkle" size={12} /> SUGGESTED FIX · BOTH SPECS
          </div>
          <p className="fix-text">Call savePreferences() before showing “Saved”, and show the error if it fails.</p>
          <Button hint="sendfix" wide onClick={actions.sendFix}>
            Fix by agent
          </Button>
          <Button kind="secondary" wide opt="Investigate in VS Code first, if you’d rather fix it yourself" onClick={() => actions.investigate(2)}>
            Investigate in VS Code first
          </Button>
        </div>
      )}
      {phase === 'fixing' && (
        <div className="panel card c-run">
          <div className="label ac">THE AGENT IS FIXING</div>
          <p>Rewriting handleSave() so it saves before showing “Saved”, and shows the error if saving fails.</p>
          <div className="progress">
            <span style={{ width: `${fixAnim * 100}%` }} />
          </div>
          <div className="card-foot">NotificationSettings.tsx · {Math.round(fixAnim * 8)} of 8 lines</div>
        </div>
      )}
      {phase === 'retesting' && (
        <div className="panel card c-run">
          <div className="label ac">RE-TESTING ONLY WHAT CHANGED</div>
          <div className="retest-row">
            <Tag n={2} st={statuses[1]} small />
            <Tag n={4} st={statuses[3]} small />
          </div>
          <p>Spec 1, 3 and 5 stay verified from Run 1.</p>
        </div>
      )}
      {phase === 'verified' && clarified && (
        <div className="panel card">
          <div className="label ac">SPEC 3 CLARIFIED</div>
          <div className="who">
            <span className="avatar">D</span>
            <div>
              <b>Context added by you</b>
              <span>{get().clarifySource}</span>
            </div>
          </div>
          <blockquote>“{clarifyText || DAN_REPLY}”</blockquote>
          <div className="row-c">
            <Tag n={3} st="pass" small /> <span className="sub">updated and verified</span>
          </div>
        </div>
      )}
      <div className="left-fill" />
      {phase === 'testing' && (
        <Button kind="secondary" wide onClick={actions.togglePause} icon={paused ? 'play' : 'pause'}>
          {paused ? 'Resume testing' : 'Pause'}
        </Button>
      )}
      {phase === 'verified' && (
        <div className="left-actions">
          <Button kind="secondary" wide opt="Try your own test case, to check something the agent might have missed" onClick={actions.openTryIt}>
            Try your own test case
          </Button>
          <Button hint="summary" wide onClick={actions.openSummary}>
            See the PR summary
          </Button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ lens panel
export function popoverContent(s, n) {
  const st = specStatus(s, n);
  const cc = caseCounts(s, n);
  const failCase = CASES.find((c) => c.spec === n && s.cases[c.id].st === 'fail');
  const runCase = CASES.find((c) => c.spec === n && s.cases[c.id].st === 'run');
  let l1, l2, link, act;
  if (st === 'idle') {
    l1 = specText(s, n);
    l2 = `${cc.total} test cases queued`;
    link = 'Open in full map';
    act = () => {
      actions.selectOnMap(n);
      actions.setFullMap(true);
    };
  } else if (st === 'run') {
    l1 = `${cc.done} of ${cc.total} test cases done`;
    l2 = 'Recording live';
    link = 'Watch live';
    act = () => actions.openRecording(runCase ? runCase.id : CASES.find((c) => c.spec === n).id);
  } else if (st === 'wait') {
    l1 = 'Email off might not mean every email';
    l2 = `${cc.wait} of ${cc.total} test cases waiting`;
    link = 'Clarify Spec 3';
    act = actions.openClarify;
  } else if (st === 'fail') {
    l1 = `${cc.pass} of ${cc.total} test cases passed`;
    l2 = n === 2 ? 'Broke at step 4: off again after refresh' : 'Broke at step 4: “Saved” shown, no error';
    link = 'Open recordings';
    act = () => actions.openRecording(failCase.id, 1);
  } else if (st === 'fixed') {
    l1 = 'Broke in Run 1, fixed in Run 2';
    l2 = `${cc.total} of ${cc.total} test cases passed`;
    link = 'Open recordings';
    act = () => openRecordingFor(n);
  } else {
    l1 = n === 3 && s.clarified ? 'Clarified: security alerts always sent' : specText(s, n);
    l2 = `${cc.total} of ${cc.total} test cases passed`;
    link = 'Open recordings';
    act = () => openRecordingFor(n);
  }
  return (
    <div className={`pop pop-${st}`}>
      <div className="pop-t">
        <span className="pop-dot" style={{ background: statusColor(st) }} />
        Spec {n} · {statusWord(st)}
      </div>
      <div className="pop-l">{l1}</div>
      <div className="pop-l">{l2}</div>
      <button type="button" className="pop-link" style={{ color: st === 'wait' ? COL.wait : COL.ac }} onClick={act}>
        {link} ›
      </button>
    </div>
  );
}

export function useLensProps() {
  const s = useStore((x) => x);
  const statuses = allStatuses(s);
  const v = countVerified(s);
  const phase = s.phase;
  const target = phase === 'reading' ? 0 : phase === 'opening' ? 0.55 : 1;
  const o = useSpring(target, phase === 'opening' ? 2.6 : 3.2);
  const irisT = phase === 'opening' ? 1 : phase === 'reading' ? 0 : 0.85;
  const iris = useSpring(irisT, 3);
  const lash = useSpring(phase === 'reading' || phase === 'opening' ? 1 : 0.3, 3);
  const tags = useSpring(phase === 'reading' ? 0 : 1, 4);
  const labels = [1, 2, 3, 4, 5].map((n) => specLabel(s, n));
  const progress = [1, 2, 3, 4, 5].map((n) => {
    const c = caseCounts(s, n);
    return c.total ? c.done / c.total : 0;
  });
  return { s, statuses, v, o, iris, lash, tags, labels, phase, progress };
}

function LensPanel() {
  const { s, statuses, v, o, iris, lash, tags, labels, phase, progress } = useLensProps();
  const stage = useRef(null);
  const [k, setK] = useState(1);
  useEffect(() => {
    if (!stage.current) return;
    const ro = new ResizeObserver(([e]) => setK(Math.max(0.6, Math.min(1.35, (e.contentRect.width - 20) / 648, (e.contentRect.height - 6) / 420))));
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, []);
  const popover = s.ss.popover;
  const hint3 = useHintFor('clarify');
  const reading = phase === 'reading';
  const opening = phase === 'opening';
  const waiting = statuses[2] === 'wait' && !s.clarified;
  return (
    <div className="panel lens-panel">
      <header className="panel-head">
        <span className="label">PROOF LENS</span>
        <div className="panel-right">
          {(phase === 'testing' || phase === 'retesting') && <span className="mono sub">{fmt(s.clock)}</span>}
          {!reading && !opening && (
            <button type="button" className="bar-btn map-btn" data-opt="Full map: every spec and every test in one view" onClick={() => actions.setFullMap(true)} title="Full map (F)">
              <Icon name="expand" size={14} /> Full map
            </button>
          )}
        </div>
      </header>
      <div className="lens-stage" ref={stage}>
        <Lens
          scale={k}
          progress={progress}
          o={o}
          statuses={statuses}
          labels={labels}
          iris={iris}
          lash={lash}
          tagsVisible={tags}
          showLabels={!reading && !opening}
          count={reading ? null : opening ? '5/5' : `${v} / 5`}
          countSub={opening ? null : 'specs verified'}
          popover={popover}
          onTag={(n) => actions.togglePopover(n)}
          onClose={actions.closePopover}
          renderPopover={(n) => popoverContent(s, n)}
          focus={waiting && !popover ? 3 : null}
          hintTag={hint3 ? 3 : null}
        />
        {(reading || opening) && (
          <div className="lens-caption">
            <div className="lc-t">{reading ? 'Reading the specs' : 'Opening the lens'}</div>
            <div className="lc-s">{reading ? 'The lens opens when all 5 are read' : 'All 5 specs read · testing starts next'}</div>
            {reading && (
              <div className="dots5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={i < s.specsRead ? 'on' : ''} />
                ))}
              </div>
            )}
          </div>
        )}
        {phase === 'fixing' && (
          <div className="lens-banner">
            <Spinner size={13} /> The agent is rewriting handleSave()…
          </div>
        )}
        {phase === 'retesting' && (
          <div className="lens-banner">
            <Spinner size={13} color={COL.sky} /> Run 2 · re-testing Spec 2 and Spec 4
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ test log
function TestLog() {
  const s = useStore((x) => x);
  const open = s.ss.logOpen;
  const filter = s.ss.filter;
  const list = useRef(null);
  const reading = s.phase === 'reading' || s.phase === 'opening';
  const items = CASES.map((c) => ({ c, cs: s.cases[c.id] })).filter(({ cs }) => cs.st !== 'queued' || cs.runs.length);
  const counts = {
    all: items.length + (s.yours ? 1 : 0),
    fail: items.filter((x) => x.cs.st === 'fail').length,
    pass: items.filter((x) => x.cs.st === 'pass').length,
    fixed: items.filter((x) => x.cs.runs.includes('fail') && x.cs.st === 'pass').length,
  };
  let shown = items;
  if (filter === 'fail') shown = items.filter((x) => x.cs.st === 'fail');
  if (filter === 'pass') shown = items.filter((x) => x.cs.st === 'pass');
  if (filter === 'fixed') shown = items.filter((x) => x.cs.runs.includes('fail') && x.cs.st === 'pass');
  if (filter === 'yours') shown = [];
  shown = [...shown].sort((a, b) => {
    const r = (x) => (x.cs.st === 'run' ? 0 : x.cs.st === 'fail' ? 1 : x.cs.st === 'wait' ? 2 : 3);
    return r(a) - r(b) || (b.cs.endedAt || 0) - (a.cs.endedAt || 0);
  });
  const running = items.filter((x) => x.cs.st === 'run').length;
  const queued = CASES.filter((c) => s.cases[c.id].st === 'queued' && !s.cases[c.id].runs.length).slice(0, 2);
  const label = reading
    ? s.phase === 'opening'
      ? `Starting ${CASES.length} tests`
      : 'Starts after the specs are read'
    : running
      ? `${running} running now · ${items.filter((x) => x.cs.st !== 'run').length} recorded`
      : `${totalTests(s)} tests · ${s.run} ${s.run === 1 ? 'run' : 'runs'}`;
  const F = (id, t) => (
    <button type="button" className={`chip ${filter === id ? 'on' : ''}`} onClick={() => actions.setFilter(id)}>
      {t}
    </button>
  );
  return (
    <div className={`panel log ${open ? '' : 'closed'}`}>
      <header className="panel-head">
        <span className="label">TEST LOG</span>
        <span className="sub log-count">{label}</span>
        <div className="panel-right">
          {!reading && counts.all > 0 && open && (
            <div className="chips">
              {F('all', `All ${counts.all}`)}
              {counts.fail > 0 && F('fail', `Broke ${counts.fail}`)}
              {counts.fixed > 0 && F('fixed', `Fixed ${counts.fixed}`)}
              {counts.pass > 0 && !counts.fixed && F('pass', `Passed ${counts.pass}`)}
              {s.yours && F('yours', 'Yours 1')}
            </div>
          )}
          <button type="button" className="icon-btn round" onClick={actions.toggleLog} aria-label={open ? 'Collapse the test log' : 'Expand the test log'}>
            <Icon name={open ? 'chevDown' : 'chevUp'} size={15} sw={2} />
          </button>
        </div>
      </header>
      <div className="log-cards" ref={list}>
        {reading
          ? [0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="lcard skeleton">
                <span>queued</span>
              </div>
            ))
          : (
            <>
              {s.yours && (filter === 'all' || filter === 'yours') && (
                <button type="button" className={`lcard yours ${s.yours.justAdded ? 'just' : ''}`} onClick={actions.openYours}>
                  <Thumb steps={s.yours.recording || []} width={104} />
                  <span className="yours-chip">Yours</span>
                  <div className="lc-tags">
                    <Tag n={s.yours.spec} st="pass" small />
                  </div>
                  <div className="lc-name">{s.yours.name}</div>
                  <div className="lc-time mono">{fmt((s.yours.recording?.length || 3) * 1400)}</div>
                </button>
              )}
              {shown.map(({ c, cs }, i) => (
                <button type="button" key={c.id} data-opt={i === 0 && cs.st !== 'queued' ? 'Click any test card to watch its recording' : undefined} className={`lcard st-${cs.st}`} onClick={() => actions.openRecording(c.id, variantOf(cs))}>
                  <Thumb steps={stepsForCase(c.id, variantOf(cs))} live={cs.st === 'run'} width={104} />
                  <div className="lc-tags">
                    <Tag n={c.spec} st={cs.st === 'pass' && cs.runs.includes('fail') ? 'fixed' : cs.st === 'queued' ? 'idle' : cs.st} small />
                    {cs.run === 2 && <span className="run2">Run 2</span>}
                  </div>
                  <div className="lc-name">{c.name}</div>
                  <div className="lc-time mono">{cs.st === 'run' ? 'now' : fmt(cs.dur || 0)}</div>
                </button>
              ))}
              {s.phase === 'testing' &&
                queued.map((c) => (
                  <div key={c.id} className="lcard skeleton">
                    <span>Next: Spec {c.spec}</span>
                  </div>
                ))}
              {filter === 'yours' && !s.yours && <div className="log-empty">No tests of yours yet.</div>}
            </>
          )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ right column
function RightColumn() {
  const right = useStore((s) => s.ss.right);
  return (
    <div className="right">
      <Swap k={right} kind="slide" ms={300}>
        {right === 'code' && <CodePanel />}
        {right === 'clarify' && <ClarifyPanel />}
        {right === 'ask' && <AskDanPanel />}
      </Swap>
    </div>
  );
}

export function useSpecSightCode() {
  const s = useStore((x) => x);
  return useMemo(() => {
    const st = allStatuses(s);
    const reading = s.phase === 'reading' || s.phase === 'opening';
    if (s.phase === 'fixing') {
      const v1 = linesFor(CODE.v1);
      const fx = linesFor(CODE.fixed);
      const hs = lineOf(CODE.v1, 'async function handleSave');
      const shown = Math.round(s.fixAnim * AGENT_LINES_FIX.length);
      const body = fx.filter((l) => AGENT_LINES_FIX.includes(l.n)).slice(0, shown).map((l) => ({ ...l, agent: true }));
      const rest = shown < AGENT_LINES_FIX.length ? v1.slice(hs, hs + 3).slice(Math.min(3, Math.ceil(shown / 3))) : [];
      const lines = [...v1.slice(0, hs), ...body, ...rest, ...v1.slice(hs + 3)].map((l, i) => ({ ...l, key: 'x' + i, n: i + 1 }));
      const marks = {};
      lines.forEach((l) => l.agent && (marks[l.n] = 'agent'));
      return { lines, marks, mode: 'plain', notes: [], scroll: lines.filter((l) => l.agent).pop()?.n || hs, sub: 'The agent is rewriting handleSave()', legend: 'agent' };
    }
    const code = s.code === 'fixed' ? CODE.fixed : CODE.v1;
    const lines = linesFor(code);
    const marks = {};
    const notes = [];
    let scroll = null;
    let sub = 'The code the agent wrote';
    let legend = null;
    if (!reading) {
      const running = [1, 2, 3, 4, 5].filter((n) => st[n - 1] === 'run');
      if (running.length) {
        legend = 'run';
        sub = 'Lines the tests are running through';
        for (const n of running) for (const needle of SPEC_LINES[n]) {
          const ln = lineOf(code, needle);
          if (ln > 0) marks[ln] = 'run';
        }
        scroll = lineOf(code, 'async function handleSave') - 4;
      } else if (st.includes('fail')) {
        legend = 'fail';
        sub = 'Spec 2 and Spec 4 both broke here';
        const ln = lineOf(code, "setStatus('saved')", lineOf(code, 'async function handleSave'));
        marks[ln] = 'fail';
        notes.push({ n: ln, tone: 'fail', badge: '!', text: 'Shows “Saved” without calling savePreferences()' });
        scroll = ln - 6;
      } else if (s.code === 'fixed') {
        legend = 'agent';
        sub = 'Every line behind the 5 specs is verified';
        AGENT_LINES_FIX.forEach((n) => (marks[n] = 'agent'));
        scroll = AGENT_LINES_FIX[0] - 4;
      } else {
        AGENT_LINES_V1.forEach((n) => (marks[n] = 'agent'));
        legend = 'agent';
      }
    }
    return { lines, marks, notes, scroll, sub, legend, mode: reading ? 'color' : 'plain' };
  }, [s]);
}

function CodePanel() {
  const c = useSpecSightCode();
  const fixedBy = useStore((s) => s.fixedBy);
  return (
    <div className="panel codep">
      <header className="codep-h">
        <div>
          <div className="codep-f">src/settings/NotificationSettings.tsx</div>
          <div className="sub">{c.sub}</div>
        </div>
        <div className="codep-r">
          <Button kind="secondary" small iconRight="external" onClick={() => (get().phase === 'results' && allStatuses(get()).includes('fail') ? actions.investigate(2) : actions.toVSCode())}>
            Open in VS Code
          </Button>
          {c.legend && (
            <span className={`legend lg-${c.legend}`}>
              {c.legend === 'run' ? 'Lines running now' : c.legend === 'fail' ? 'Where it broke' : fixedBy === 'you' ? 'Changed by you' : 'Changed by the agent'}
            </span>
          )}
        </div>
      </header>
      <CodeView lines={c.lines} marks={c.marks} notes={c.notes} mode={c.mode} scrollTo={c.scroll} className="ss-code" fontSize={12.5} lineH={20} noteX="below" />
    </div>
  );
}

// ------------------------------------------------------------------ clarify
export function ClarifyPanel({ compact = false }) {
  const text = useStore((s) => s.clarifyText);
  const source = useStore((s) => s.clarifySource);
  const hintTa = useHintFor('clarify-ta');
  const ok = text.trim().length >= 10;
  const preview = !text.trim()
    ? '“Email off” stops every email.'
    : /security|alert|sign-in|password/i.test(text)
      ? '“Email off” stops every email except security alerts.'
      : `“Email off” stops every email. (${text.trim().slice(0, 60)}${text.trim().length > 60 ? '…' : ''})`;
  return (
    <div className={`panel clarify ${compact ? 'compact' : ''}`}>
      <header className="cl-h">
        <Tag n={3} st="wait" small />
        <span className="wait-t">Needs clarification</span>
        {!compact && (
          <button type="button" className="icon-btn" onClick={actions.closeRight} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        )}
      </header>
      <div className="cl-q">Does “Email off” stop every email?</div>
      <div className="label">WHAT THE AGENT FOUND</div>
      <p className="cl-p">With email turned off, a security alert email still arrived after a new sign-in.</p>
      {!compact && (
        <div className="cl-thumbs">
          {stepsForCase('s3c', 1).slice(0, 2).map((st, i) => (
            <button type="button" key={i} className="cl-thumb" onClick={() => actions.openRecording('s3c', 1)}>
              <Thumb steps={[st]} width={176} />
              <span>{i === 0 ? 'Email off' : 'Security alert arrives'}</span>
            </button>
          ))}
        </div>
      )}
      <div className="label">ADD THE MISSING CONTEXT</div>
      <div className="cl-ta">
        <textarea
          className={hintTa ? 'hint' : ''}
          value={text}
          onChange={(e) => actions.setClarifyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab' && !text) {
              e.preventDefault();
              actions.setClarifyText(CLARIFY_EXAMPLE);
            }
          }}
          placeholder={CLARIFY_EXAMPLE}
        />
        {!text && (
          <span className="cl-ex">
            Example text for this demo · press <kbd className="kbd">Tab</kbd> to use it, or type your own
          </span>
        )}
      </div>
      <div className="cl-src">
        <span className="sub">Where it came from</span>
        <select value={source} onChange={(e) => actions.setClarifySource(e.target.value)}>
          <option>Talked with Dan (Product Owner)</option>
          <option>Dan’s reply in SpecSight</option>
          <option>Refinement meeting notes · Monday</option>
          <option>Email from Dan · yesterday</option>
          <option>My own understanding</option>
        </select>
      </div>
      <div className="label">SPEC 3 WILL READ</div>
      <div className="cl-prev">{preview}</div>
      <p className="sub cl-note">Spec 3 is re-tested with the rest of the run. Nothing waits.</p>
      <div className="cl-actions">
        <Button hint="update3" onClick={actions.updateSpec3} disabled={!ok}>
          Update Spec 3
        </Button>
        <Button kind="secondary" small icon="message" opt="Ask the product owner instead of answering yourself" onClick={actions.openAskDan}>
          Ask Dan (Product Owner) instead
        </Button>
      </div>
    </div>
  );
}

function AskDanPanel() {
  const dan = useStore((s) => s.dan);
  const msg = useStore((s) => s.danMsg);
  const hintSend = useHintFor('send-dan');
  const hintUse = useHintFor('use-dan');
  return (
    <div className="panel ask">
      <header className="cl-h">
        <Tag n={3} st="wait" small />
        <span className="wait-t">Ask the Product Owner</span>
        <button type="button" className="icon-btn" onClick={actions.closeRight} aria-label="Close">
          <Icon name="x" size={14} />
        </button>
      </header>
      <div className="ask-to">
        <span className="avatar">D</span>
        <div>
          <b>Dan Reyes</b>
          <span>Product Owner · usually replies in a few minutes</span>
        </div>
      </div>
      <div className="ask-thread">
        {dan !== 'composing' && dan !== 'none' && <div className="bub me">{msg}</div>}
        {dan === 'waiting' && <div className="ask-status">Sent · the rest of the specs keep testing</div>}
        {dan === 'typing' && (
          <div className="bub dan typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {dan === 'replied' && <div className="bub dan">{DAN_REPLY}</div>}
      </div>
      {dan === 'composing' && (
        <div className="ask-compose">
          <textarea value={msg} onChange={(e) => actions.setDanMsg(e.target.value)} />
          <p className="sub">SpecSight attaches the recording of Spec 3 so Dan can see what happened.</p>
          <Button hint="send-dan" onClick={actions.sendDan} icon="send" disabled={msg.trim().length < 5}>
            Send to Dan
          </Button>
        </div>
      )}
      {dan === 'replied' && (
        <div className="ask-compose">
          <Button hint="use-dan" onClick={actions.useDanReply}>
            Use Dan’s reply as context
          </Button>
        </div>
      )}
      <Button kind="secondary" className="ask-back" icon="edit" onClick={actions.openClarify}>
        Add the context myself
      </Button>
    </div>
  );
}
