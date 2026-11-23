import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, actions, specStatus, caseCounts, get } from './store.js';
import { SPECS, CASES, CODE, SPEC_LINES, lineOf, fmt } from './data.js';
import Lens from './Lens.jsx';
import CodeView from './Code.jsx';
import { Button, Icon, Tag, Triangle, Spinner, COL, statusColor, statusWord, useEsc, openRecordingFor } from './ui.jsx';
import { useLensProps, specLabel, specText, ClarifyPanel, variantOf, statusLine } from './SpecSight.jsx';

const LEGEND = [
  ['pass', 'Passed', 'Every test case of this spec passed.'],
  ['fail', 'Broke', 'At least one test case failed. A fix is ready.'],
  ['wait', 'Needs clarification', 'The spec is unclear. Add context from the Product Owner.'],
  ['run', 'Testing', 'Being tested now on a sandbox copy.'],
  ['idle', 'Not tested', 'Waiting to be tested.'],
];

export default function FullMap() {
  const p = useLensProps();
  const s = p.s;
  const sel = s.ss.mapSelected;
  const ref = useRef(null);
  const [clip, setClip] = useState(null);
  const [entered, setEntered] = useState(false);
  const leaving = useStore((x) => !!x.ss.fmClosing);
  const line = useStore(statusLine);
  const lensBox = useRef(null);
  const [k, setK] = useState(1.4);
  useEffect(() => {
    if (!lensBox.current) return;
    const ro = new ResizeObserver(([e]) => setK(Math.max(0.8, Math.min(1.7, (e.contentRect.width - 40) / 648, (e.contentRect.height - 20) / 420))));
    ro.observe(lensBox.current);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const body = ref.current && ref.current.parentElement;
    const lp = body && body.querySelector('.lens-panel');
    if (lp && body) {
      const b = body.getBoundingClientRect();
      const r = lp.getBoundingClientRect();
      const k = b.width / body.offsetWidth;
      setClip({ t: (r.top - b.top) / k, l: (r.left - b.left) / k, r: (b.right - r.right) / k, b: (b.bottom - r.bottom) / k });
    } else setClip({ t: 0, l: 0, r: 0, b: 0 });
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true)));
    return () => cancelAnimationFrame(id);
  }, []);

  const [back, setBack] = useState(null);
  useLayoutEffect(() => {
    if (!leaving || !ref.current || !lensBox.current) return;
    const body = ref.current.parentElement;
    const lp = body && body.querySelector('.lens-panel .lens, .lens-panel');
    if (!lp) return;
    const K = body.getBoundingClientRect().width / body.offsetWidth || 1;
    const fl = lensBox.current.querySelector('.lens') || lensBox.current;
    const a = fl.getBoundingClientRect();
    const r = lp.getBoundingClientRect();
    const sc = Math.min(r.width / a.width, r.height / a.height);
    const dx = (r.left + r.width / 2 - (a.left + a.width / 2)) / K;
    const dy = (r.top + r.height / 2 - (a.top + a.height / 2)) / K;
    setBack(`translate(${dx}px, ${dy}px) scale(${sc})`);
  }, [leaving]);
  const exit = () => actions.closeFullMap();
  useEsc(exit);
  useEffect(() => {
    const h = (e) => {
      if (e.target.closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') actions.selectOnMap((get().ss.mapSelected % 5) + 1);
      if (e.key === 'ArrowLeft') actions.selectOnMap(((get().ss.mapSelected + 3) % 5) + 1);
      if (e.key === 'f' || e.key === 'F') exit();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const open = entered && !leaving;
  const c = clip || { t: 0, l: 0, r: 0, b: 0 };
  const style = { clipPath: open ? 'inset(0px 0px 0px 0px round 0px)' : `inset(${c.t}px ${c.r}px ${c.b}px ${c.l}px round 16px)` };

  return (
    <div className={`fullmap ${open || leaving ? 'open' : ''} ${leaving ? 'closing' : ''}`} ref={ref} style={{ ...style, '--fm-back': back || undefined }}>
      <div className="fm-main">
        <div className="fm-top">
          <div>
            <div className="label ac">PROOF LENS · FULL MAP</div>
            <div className="fm-line">{line}</div>
          </div>
          <div className="fm-tools">
            <Button kind="secondary" small icon="collapse" onClick={exit} title="Back to all panels (F or Esc)">
              Minimize map
            </Button>
            <Button kind="secondary" small iconRight="external" onClick={actions.fullMapToVSCode}>
              Open in VS Code
            </Button>
          </div>
        </div>
        <div className="fm-lens" ref={lensBox}>
          <Lens
            o={p.o}
            statuses={p.statuses}
            labels={p.labels}
            iris={p.iris}
            lash={p.lash}
            tagsVisible={p.tags}
            count={`${p.v} / 5`}
            countSub="specs verified"
            onTag={(n) => actions.selectOnMap(n)}
            focus={sel}
            scale={k}
            progress={p.progress}
          />
          <div className="fm-legend">
            {LEGEND.map(([st, t, tip]) => (
              <span key={st} className="lgc" tabIndex={0}>
                <Tag n="" st={st} small label={t} />
                <span className="lgc-tip">{tip}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="fm-strip">
          {[1, 2, 3, 4, 5].map((n) => (
            <div key={n} className={`fm-grp ${sel === n ? 'on' : ''}`}>
              <button type="button" className="fm-grp-h" onClick={() => actions.selectOnMap(n)}>
                Spec {n}
              </button>
              <div className="fm-pills">
                {CASES.filter((x) => x.spec === n).map((x) => {
                  const cs = s.cases[x.id];
                  return (
                    <button
                      type="button"
                      key={x.id}
                      className={`fm-pill st-${cs.st}`}
                      title={x.name}
                      onClick={() => {
                        actions.selectOnMap(n);
                        if (cs.st !== 'queued') actions.openRecording(x.id, variantOf(cs));
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <SpecDrawer n={sel} s={s} />
    </div>
  );
}

function SpecDrawer({ n, s }) {
  const st = specStatus(s, n);
  const cc = caseCounts(s, n);
  const code = s.code === 'fixed' ? CODE.fixed : CODE.v1;
  const lines = [...new Set(SPEC_LINES[n].map((needle) => lineOf(code, needle)).filter((x) => x > 0))].sort((a, b) => a - b);
  const all = code.replace(/\n$/, '').split('\n');
  const snippet = lines.map((ln) => ({ n: ln, text: all[ln - 1] }));
  const marks = {};
  lines.forEach((ln) => (marks[ln] = st === 'fail' && /setStatus\('saved'\)/.test(all[ln - 1]) ? 'fail' : st === 'run' ? 'run' : null));
  const waiting = st === 'wait' && !s.clarified;
  return (
    <aside className="fm-drawer" key={n}>
      <div className="fd-nav">
        <button type="button" className="icon-btn" onClick={() => actions.selectOnMap(((n + 3) % 5) + 1)} aria-label="Previous spec">
          <Icon name="chevLeft" size={15} />
        </button>
        <span className="sub">
          Spec {n} of 5 · use ← → to move
        </span>
        <button type="button" className="icon-btn" onClick={() => actions.selectOnMap((n % 5) + 1)} aria-label="Next spec">
          <Icon name="chevRight" size={15} />
        </button>
      </div>
      <div className="fd-head">
        <Tag n={n} st={st} />
        <span className="fd-word" style={{ color: statusColor(st) }}>
          {statusWord(st)}
        </span>
      </div>
      <h3>{specLabel(s, n)}</h3>
      <p className="fd-text">{specText(s, n)}</p>
      {waiting ? (
        <ClarifyPanel compact />
      ) : (
        <>
          <div className="label">TEST CASES · {cc.pass} OF {cc.total} PASSED</div>
          <div className="fd-cases">
            {CASES.filter((x) => x.spec === n).map((x) => {
              const cs = s.cases[x.id];
              return (
                <button type="button" key={x.id} className={`fd-case st-${cs.st}`} disabled={cs.st === 'queued'} onClick={() => actions.openRecording(x.id, variantOf(cs))}>
                  <span className="fd-ic">
                    {cs.st === 'pass' && <Icon name="check" size={12} sw={3} />}
                    {cs.st === 'fail' && <Triangle size={13} color={COL.fail} mark="#0F0B1C" />}
                    {cs.st === 'wait' && '?'}
                    {cs.st === 'run' && <Spinner size={11} color={COL.sky} />}
                  </span>
                  <span className="fd-cn">
                    {x.name}
                    {cs.st === 'fail' && x.fails1 && <small>{x.fails1}</small>}
                    {cs.runs.includes('fail') && cs.st === 'pass' && <small className="ok">Broke in Run 1, passed in Run 2</small>}
                  </span>
                  <span className="mono sub">{cs.st === 'queued' ? 'queued' : cs.st === 'run' ? 'now' : fmt(cs.dur || 0)}</span>
                </button>
              );
            })}
          </div>
          <div className="label">LINES INVOLVED · NotificationSettings.tsx</div>
          <CodeView lines={snippet} marks={marks} mode="plain" className="fd-code" fontSize={12} lineH={19} />
        </>
      )}
      <div className="fd-actions">
        {st === 'fail' && s.phase === 'results' && (
          <>
            <Button wide onClick={actions.sendFix}>
              Fix by agent
            </Button>
            <Button wide kind="secondary" onClick={() => actions.investigate(n)}>
              Investigate in VS Code
            </Button>
          </>
        )}
        {(st === 'pass' || st === 'fixed') && (
          <Button wide kind="secondary" onClick={() => openRecordingFor(n)} icon="play">
            Open recordings
          </Button>
        )}
        {st === 'run' && (
          <Button wide kind="secondary" onClick={() => openRecordingFor(n)} icon="play">
            Watch live
          </Button>
        )}
      </div>
    </aside>
  );
}
