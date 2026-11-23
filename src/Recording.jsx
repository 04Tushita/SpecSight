import { useEffect, useRef, useState } from 'react';
import XyzApp, { FW, FH } from './XyzApp.jsx';
import { STEP_MS, fmt, recSteps, CASES } from './data.js';
import { Icon, Triangle, COL } from './ui.jsx';
import { clamp, ease } from './anim.js';

export function Player({ steps, width = 760, autoplay = true, chapters = null, startAt = 0, onChapter, compact = false, loop = false, seek }) {
  const total = Math.max(1, steps.length) * STEP_MS;
  const [t, setT] = useState(startAt);
  const [playing, setPlaying] = useState(autoplay);
  const [hoverX, setHoverX] = useState(null);
  const bar = useRef(null);
  const tRef = useRef(startAt);

  useEffect(() => {
    tRef.current = startAt;
    setT(startAt);
  }, [startAt]);
  useEffect(() => {
    if (!seek || !seek.n) return;
    tRef.current = seek.t;
    setT(seek.t);
    setPlaying(true);
  }, [seek]);

  useEffect(() => {
    if (!playing) return;
    let raf;
    let last = performance.now();
    const tick = (now) => {
      tRef.current += now - last;
      last = now;
      if (tRef.current >= total) {
        if (loop) tRef.current = 0;
        else {
          tRef.current = total - 1;
          setPlaying(false);
        }
      }
      setT(tRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, total, loop]);

  const idx = clamp(Math.floor(t / STEP_MS), 0, steps.length - 1);
  const k = clamp((t - idx * STEP_MS) / (STEP_MS * 0.45), 0, 1);
  const cur = steps[idx] || { app: {}, cursor: [640, 300] };
  const prev = steps[idx - 1] || cur;
  const c0 = prev.cursor || [640, 300],
    c1 = cur.cursor || c0;
  const e = ease(k);
  const cursor = [c0[0] + (c1[0] - c0[0]) * e, c0[1] + (c1[1] - c0[1]) * e];
  const appState = k < 0.6 && idx > 0 ? { ...prev.app, focus: cur.app.focus } : cur.app;
  const chapterIdx = chapters ? chapters.findIndex((c) => t >= c.start && t < c.end) : -1;

  useEffect(() => {
    if (onChapter && chapterIdx >= 0) onChapter(chapterIdx);
  }, [chapterIdx, onChapter]);

  const seekTo = (clientX) => {
    const r = bar.current.getBoundingClientRect();
    const f = clamp((clientX - r.left) / r.width, 0, 0.9999);
    tRef.current = f * total;
    setT(tRef.current);
  };
  const scale = width / FW;

  return (
    <div className={`player ${compact ? 'player-compact' : ''}`} style={{ width }}>
      <div className="player-screen" onClick={() => setPlaying((p) => !p)}>
        <XyzApp app={appState} scale={scale} cursor={cursor} caption={{ text: cur.label, tone: cur.broke ? 'broke' : cur.wait ? 'wait' : '' }} />
        {!playing && (
          <div className="player-paused">
            <Icon name="play" size={34} />
          </div>
        )}
        {cur.run && <div className={`player-run ${cur.broke ? 'broke' : ''}`}>Run {cur.run}{cur.chapterLabel ? ' · ' + cur.chapterLabel : ''}</div>}
      </div>
      <div className="player-controls">
        <button type="button" className="icon-btn" onClick={() => {
          if (!playing && tRef.current >= total - 2) {
            tRef.current = 0;
            setT(0);
          }
          setPlaying((p) => !p);
        }} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={16} />
        </button>
        <div
          className="player-bar"
          ref={bar}
          onPointerDown={(e) => {
            seekTo(e.clientX);
            const mv = (ev) => seekTo(ev.clientX);
            const up = () => {
              window.removeEventListener('pointermove', mv);
              window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', mv);
            window.addEventListener('pointerup', up);
          }}
          onPointerMove={(e) => {
            const r = bar.current.getBoundingClientRect();
            setHoverX(clamp((e.clientX - r.left) / r.width, 0, 1));
          }}
          onPointerLeave={() => setHoverX(null)}
        >
          {chapters
            ? chapters.map((c, i) => (
                <span key={i} className={`pb-seg pb-${c.tone}`} style={{ left: `${(c.start / total) * 100}%`, width: `calc(${((c.end - c.start) / total) * 100}% - 3px)` }} />
              ))
            : steps.map((s, i) => <span key={i} className={`pb-seg pb-${s.broke ? 'fail' : s.wait ? 'wait' : 'pass'}`} style={{ left: `${(i / steps.length) * 100}%`, width: `calc(${100 / steps.length}% - 3px)` }} />)}
          {steps.map((s, i) =>
            s.broke || s.wait ? (
              <span key={'m' + i} className="pb-mark" style={{ left: `${((i + 0.5) / steps.length) * 100}%` }}>
                {s.broke ? <Triangle size={12} color={COL.fail} mark="#0F0B1C" /> : <span className="pb-q">?</span>}
              </span>
            ) : null,
          )}
          <span className="pb-head" style={{ left: `${(t / total) * 100}%` }} />
          {hoverX != null && (
            <span className="pb-tip" style={{ left: `${hoverX * 100}%` }}>
              {fmt(hoverX * total)}
            </span>
          )}
        </div>
        <span className="mono player-time">
          {fmt(t)} / {fmt(total)}
        </span>
      </div>
      {!compact && (
        <div className="player-steps">
          {steps.map((s, i) => (
            <button
              type="button"
              key={i}
              className={`ps ${i === idx ? 'on' : ''} ${s.broke ? 'broke' : ''} ${s.wait ? 'wait' : ''}`}
              onClick={() => {
                tRef.current = i * STEP_MS + 10;
                setT(tRef.current);
              }}
            >
              <span className="ps-n">{s.broke ? <Triangle size={12} color={COL.fail} mark="#0F0B1C" /> : s.wait ? '?' : chapters ? '' : i + 1}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Small static (or live, cycling) thumbnail of a recording.
export function Thumb({ steps, live = false, width = 104, step: forced }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setI((x) => (x + 1) % steps.length), 1500);
    return () => clearInterval(id);
  }, [live, steps.length]);
  const s = steps[forced != null ? forced : live ? i : steps.length - 1] || steps[0];
  if (!s) return <div className="thumb" style={{ width, height: width * (FH / FW) }} />;
  return (
    <div className="thumb" style={{ width, height: width * (FH / FW) }}>
      <XyzApp app={s.app} scale={width / FW} />
      {live && <span className="live">● LIVE</span>}
    </div>
  );
}

export function stepsForCase(caseId, run) {
  const c = CASES.find((x) => x.id === caseId);
  if (!c) return [];
  return recSteps(c.rec, run).map((s) => ({ ...s, run }));
}
