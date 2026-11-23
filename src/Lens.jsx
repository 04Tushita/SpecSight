import { useEffect, useRef } from 'react';
import { pt, sample, poly } from './anim.js';
import { Tag, statusColor, COL } from './ui.jsx';

export const LW = 648;
export const LH = 420;
const CY = 212;
const L = 96;
const R = 552;

export function lensGeometry(o) {
  const topC = CY + 58 - 200 * o;
  const botC = CY + 58 + 84 * o;
  const top = [[L, CY], [205, topC], [443, topC], [R, CY]];
  const bot = [[L, CY], [205, botC], [443, botC], [R, CY]];
  const P = { 1: [L, CY], 2: pt(0.5, top), 3: [R, CY], 4: pt(2 / 3, bot), 5: pt(1 / 3, bot) };
  const shape = `M${L} ${CY} C205 ${topC} 443 ${topC} ${R} ${CY} C443 ${botC} 205 ${botC} ${L} ${CY} Z`;
  return { top, bot, P, shape, topC, botC };
}

const SEGS = [
  [1, 2, 'top', 0, 0.5],
  [2, 3, 'top', 0.5, 1],
  [3, 4, 'bot', 1, 2 / 3],
  [4, 5, 'bot', 2 / 3, 1 / 3],
  [5, 1, 'bot', 1 / 3, 0],
];
const ok = (s) => s === 'pass' || s === 'fixed';

export default function Lens({
  o = 1,
  statuses,
  labels = [],
  iris = 0.3,
  lash = 0.3,
  count,
  countSub,
  popover,
  onTag,
  onClose,
  renderPopover,
  focus,
  showLabels = true,
  tagsVisible = 1,
  scale = 1,
  hintTag,
  progress = null,
}) {
  const g = lensGeometry(o);
  const wrap = useRef(null);

  useEffect(() => {
    if (!popover || !onClose) return;
    const h = (e) => {
      if (!wrap.current) return;
      if (e.target.closest('.lens-pop') || e.target.closest('.lens-tag')) return;
      onClose();
    };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [popover, onClose]);

  const segs = SEGS.map(([a, b, cu, t0, t1]) => {
    const A = statuses[a - 1],
      B = statuses[b - 1];
    let col = '#5B5770',
      w = 1.6,
      dash = null,
      glow = false,
      flow = false;
    if (ok(A) && ok(B)) {
      col = COL.pass;
      w = 2.6;
      glow = true;
    } else if (A === 'fail' || B === 'fail') {
      col = COL.fail;
      w = 2;
      dash = '7 6';
    } else if (A === 'wait' || B === 'wait') {
      col = COL.wait;
      w = 2;
      dash = '3 6';
    } else if (A === 'run' || B === 'run') {
      col = COL.sky;
      w = 2;
      dash = '10 8';
      flow = true;
    }
    return { d: poly(sample(cu === 'top' ? g.top : g.bot, t0, t1, 22)), col, w, dash, glow, flow, key: `${a}-${b}` };
  });

  // Iris: one segment per spec
  const ir = 80;
  const ring = (a0, a1) => {
    const r2 = ir * 0.8;
    const p = (a, r) => [324 + Math.cos(a) * r, CY + Math.sin(a) * r];
    const [x0, y0] = p(a0, ir),
      [x1, y1] = p(a1, ir),
      [x2, y2] = p(a1, r2),
      [x3, y3] = p(a0, r2);
    return `M${x0} ${y0} A${ir} ${ir} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r2} ${r2} 0 0 0 ${x3} ${y3} Z`;
  };
  const irisArcs = statuses.map((st, i) => {
    const a0 = ((-90 + i * 72 + 5) * Math.PI) / 180,
      a1 = ((-90 + (i + 1) * 72 - 5) * Math.PI) / 180;
    const done = st === 'pass' || st === 'fixed' || st === 'fail' || st === 'wait';
    const f = done ? 1 : progress ? Math.max(0, Math.min(1, progress[i] || 0)) : st === 'idle' ? 1 : 0.5;
    return { track: ring(a0, a1), d: f > 0.02 ? ring(a0, a0 + (a1 - a0) * f) : null, c: st === 'idle' ? COL.idle : statusColor(st), run: st === 'run' };
  });

  // Lashes on the upper lid (down when closed)
  const lashes = [];
  for (let i = 1; i <= 7; i++) {
    const t = 0.14 + i * 0.09;
    if (Math.abs(t - 0.5) < 0.05) continue;
    const [x, y] = pt(t, g.top);
    const [x2, y2] = pt(t + 0.002, g.top);
    let nx = y2 - y,
      ny = -(x2 - x);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    const dir = o < 0.2 ? -1 : 1;
    lashes.push(`M${x + nx * 6 * dir} ${y + ny * 6 * dir} L${x + nx * 18 * dir + (t - 0.5) * 8} ${y + ny * 18 * dir}`);
  }

  const tagBox = (n) => {
    const [x, y] = g.P[n];
    return { x, y };
  };

  return (
    <div className="lens" ref={wrap} style={{ width: LW * scale, height: LH * scale }}>
      <div className="lens-inner" style={{ transform: `scale(${scale})` }}>
        <svg width={LW} height={LH} className="lens-svg">
          <defs>
            <filter id="lglow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="5" />
            </filter>
            <filter id="lblur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="22" />
            </filter>
            <clipPath id="lensclip">
              <path d={g.shape} />
            </clipPath>
            <radialGradient id="lensfill" cx="50%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#1B1530" />
              <stop offset="100%" stopColor="#09080E" />
            </radialGradient>
          </defs>
          <ellipse cx={324} cy={CY} rx={250} ry={40 + 70 * o} fill="#7C3AED" opacity={0.14} filter="url(#lblur)" />
          {/* faint outer rings */}
          <path d={lensGeometry(Math.min(1, o * 1.16)).shape.replace(/96 212/g, '66 212').replace(/552 212/g, '582 212')} fill="none" stroke="#C4B5FD" opacity={0.08 * o} />
          <path d={g.shape} fill="url(#lensfill)" />
          <g clipPath="url(#lensclip)">
            <circle cx={324} cy={CY} r={86} fill="#050507" opacity={0.6} filter="url(#lblur)" />
            <g opacity={iris}>
              <circle cx={324} cy={CY} r={ir + 14} fill="#8B5CF6" opacity={0.18} filter="url(#lblur)" />
              {irisArcs.map((a, i) => (
                <g key={i}>
                  <path d={a.track} fill={statuses[i] === "idle" ? "rgba(140,132,176,0.45)" : "#2E2B3B"} />
                  {a.d && <path d={a.d} fill={a.c} className={`iris-arc ${a.run ? 'iris-run' : ''}`} />}
                </g>
              ))}
              <circle cx={324} cy={CY} r={ir * 0.62} fill="none" stroke="#4A4562" strokeWidth={1} />
            </g>
          </g>
          {/* lid outline */}
          <path d={poly(sample(g.top, 0, 1, 40))} fill="none" stroke="#8B5CF6" strokeWidth={12} opacity={0.35 * (1 - o * 0.5)} filter="url(#lglow)" />
          {segs.map((s) => (
            <g key={s.key}>
              {s.glow && <path d={s.d} fill="none" stroke={s.col} strokeWidth={8} opacity={0.35} filter="url(#lglow)" />}
              <path d={s.d} fill="none" stroke={s.col} strokeWidth={s.w} strokeDasharray={s.dash || undefined} strokeLinecap="round" className={s.flow ? 'seg-flow' : ''} style={{ transition: 'stroke 400ms' }} />
            </g>
          ))}
          <g opacity={lash}>
            {lashes.map((d, i) => (
              <path key={i} d={d} stroke="#8C84B0" strokeWidth={2} strokeLinecap="round" />
            ))}
          </g>
        </svg>

        {count != null && (
          <div className={`lens-count ${o < 0.9 ? 'small' : ''}`} style={{ top: o < 0.9 ? CY - 11 : CY - 36 }}>
            <div className="lens-count-n">{count}</div>
            {countSub && <div className="lens-count-sub">{countSub}</div>}
          </div>
        )}

        {showLabels &&
          [1, 2, 3, 4, 5].map((n) => {
            const { x, y } = tagBox(n);
            const st = statuses[n - 1];
            const above = n <= 3;
            const lw = n === 2 ? 220 : 172;
            const left = Math.max(6, Math.min(LW - lw - 6, x - lw / 2));
            return (
              <div
                key={n}
                className={`lens-label ${st === 'fail' ? 'is-fail' : st === 'wait' ? 'is-wait' : ''}`}
                style={{ left, width: lw, top: above ? y - 20 : y + 20, transform: above ? 'translateY(-100%)' : 'none', opacity: tagsVisible * Math.max(0, Math.min(1, (o - 0.88) / 0.1)) }}
              >
                <span>{labels[n - 1]}</span>
              </div>
            );
          })}

        {[1, 2, 3, 4, 5].map((n) => {
          const { x, y } = tagBox(n);
          const st = statuses[n - 1];
          return (
            <div key={n} className={`lens-tag ${hintTag === n ? 'hint' : ''}`} style={{ left: x, top: y, opacity: tagsVisible }}>
              <Tag n={n} st={st} ring={focus === n || popover === n} onClick={onTag ? () => onTag(n) : undefined} />
            </div>
          );
        })}

        {popover && renderPopover && (
          <LensPopover n={popover} g={g} labelsShown={showLabels}>
            {renderPopover(popover)}
          </LensPopover>
        )}
      </div>
    </div>
  );
}

function LensPopover({ n, g, children }) {
  const [x, y] = g.P[n];
  let style;
  if (n === 1) style = { right: LW - x + 52, top: y, transform: 'translateY(-50%)' };
  else if (n === 3) style = { left: x + 52, top: y, transform: 'translateY(-50%)' };
  else if (n === 2) style = { left: x + 56, top: y + 4, transform: 'translateY(-50%)' };
  else style = { left: x, top: y + 66, transform: 'translateX(-50%)' };
  return (
    <div className={`lens-pop lens-pop-${n}`} style={style}>
      {children}
    </div>
  );
}
