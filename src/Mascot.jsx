import { useEffect, useId, useRef, useState } from 'react';
import { useStore, allStatuses, mood as moodOf } from './store.js';
import { statusColor } from './ui.jsx';

// The SpecSight eye. Its iris has one segment per spec (a status read-out);
// its lids give it moods: blink, squint, curious, worried, happy, wink.
const MOODS = {
  idle: { o: 0.92, s: 0, tilt: 0, pupil: 1 },
  focus: { o: 0.8, s: 0, tilt: 0, pupil: 0.9, look: [0.55, 0.2] },
  squint: { o: 0.3, s: 0, tilt: 0, pupil: 0.85, scan: true },
  curious: { o: 1, s: 0, tilt: 0.7, pupil: 1.2 },
  worried: { o: 0.82, s: 0, tilt: -0.6, pupil: 0.8 },
  happy: { o: 0.82, s: 0.45, tilt: 0, pupil: 1.12 },
  wink: { o: 0.82, s: 0.45, tilt: 0, pupil: 1.12 },
};

let mouse = { x: -1, y: -1 };
if (typeof window !== 'undefined') {
  window.addEventListener('pointermove', (e) => {
    mouse = { x: e.clientX, y: e.clientY };
  });
}

export default function Mascot({ mood = 'idle', statuses = ['idle', 'idle', 'idle', 'idle', 'idle'], size = 32, follow = true, onClick, title = 'SpecSight', className = '', badge = true }) {
  const id = useId().replace(/:/g, '');
  const ref = useRef(null);
  const cur = useRef({ o: 0.9, s: 0, tilt: 0, pupil: 1, lx: 0, ly: 0 });
  const [p, setP] = useState(cur.current);
  const blinkUntil = useRef(0);
  const boopUntil = useRef(0);
  const hover = useRef(false);
  const moodRef = useRef(mood);
  const [pop, setPop] = useState(0);

  useEffect(() => {
    if (mood === 'wink') blinkUntil.current = performance.now() + 520;
    if (mood !== moodRef.current) setPop((x) => x + 1);
    moodRef.current = mood;
  }, [mood]);

  useEffect(() => {
    let raf;
    let last = performance.now();
    let nextBlink = last + 1500 + Math.random() * 3000;
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const m = MOODS[now < boopUntil.current ? 'happy' : moodRef.current] || MOODS.idle;
      if (now > nextBlink) {
        blinkUntil.current = now + 140;
        nextBlink = now + 2600 + Math.random() * 3800;
      }
      let lx = 0,
        ly = 0;
      if (m.scan) lx = Math.sin(now / 380) * 0.8;
      else if (m.look) [lx, ly] = m.look;
      else if (follow && ref.current && mouse.x >= 0) {
        const r = ref.current.getBoundingClientRect();
        const dx = mouse.x - (r.left + r.width / 2);
        const dy = mouse.y - (r.top + r.height / 2);
        const d = Math.max(1, Math.hypot(dx, dy));
        const k = Math.min(1, d / 260);
        lx = (dx / d) * k;
        ly = (dy / d) * k;
      }
      const blinking = now < blinkUntil.current;
      const target = { o: blinking ? 0.04 : m.o, s: m.s, tilt: m.tilt, pupil: m.pupil + (hover.current ? 0.22 : 0), lx, ly };
      const c = cur.current;
      const k = 1 - Math.exp(-(blinking ? 40 : 10) * dt);
      const next = {};
      let moved = false;
      for (const key of Object.keys(target)) {
        next[key] = c[key] + (target[key] - c[key]) * k;
        if (Math.abs(next[key] - c[key]) > 0.0008) moved = true;
      }
      cur.current = next;
      if (moved) setP(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [follow]);

  const { o, s, tilt, pupil, lx, ly } = p;
  const cy = 32;
  const upY1 = cy - 30 * o + tilt * 5;
  const upY2 = cy - 30 * o - tilt * 9;
  const loY = cy + 24 * o * (1 - s) - 15 * s * Math.min(1, o * 1.6);
  const upper = `M6 ${cy} C 28 ${upY1} 72 ${upY2} 94 ${cy}`;
  const lower = `M6 ${cy} C 28 ${loY} 72 ${loY} 94 ${cy}`;
  const shape = `${upper} C 72 ${loY} 28 ${loY} 6 ${cy} Z`;
  const ix = 50 + lx * 15;
  const iy = cy + ly * 7 - s * 4;

  const arcs = statuses.map((st, i) => {
    const a0 = ((-90 + i * 72 + 6) * Math.PI) / 180;
    const a1 = ((-90 + (i + 1) * 72 - 6) * Math.PI) / 180;
    const R = 17.5,
      r = 12.6;
    const P = (a, rad) => [ix + Math.cos(a) * rad, iy + Math.sin(a) * rad];
    const [x0, y0] = P(a0, R),
      [x1, y1] = P(a1, R),
      [x2, y2] = P(a1, r),
      [x3, y3] = P(a0, r);
    return { d: `M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1} L${x2} ${y2} A${r} ${r} 0 0 0 ${x3} ${y3} Z`, c: statusColor(st), idle: st === 'idle' || st === 'queued' };
  });

  const lashes = [];
  if (size >= 28) {
    const B = (t, a, b, c2, d) => {
      const u = 1 - t;
      return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c2 + t * t * t * d;
    };
    for (const t of [0.22, 0.36, 0.5, 0.64, 0.78]) {
      const x = B(t, 6, 28, 72, 94),
        y = B(t, cy, upY1, upY2, cy);
      const x2 = B(t + 0.01, 6, 28, 72, 94),
        y2 = B(t + 0.01, cy, upY1, upY2, cy);
      let nx = y2 - y,
        ny = -(x2 - x);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }
      const dir = o < 0.22 ? -1 : 1;
      const len = 6.5;
      lashes.push(`M${x + nx * 2 * dir} ${y + ny * 2 * dir} L${x + nx * (2 + len) * dir + (t - 0.5) * 4} ${y + ny * (2 + len) * dir}`);
    }
  }
  const brow = mood === 'curious' ? `M60 ${upY2 - 9} Q 74 ${upY2 - 15} 86 ${upY2 - 8}` : mood === 'worried' ? `M58 ${upY2 - 12} Q 72 ${upY2 - 9} 84 ${upY2 - 4}` : null;

  return (
    <span
      ref={ref}
      className={`mascot mascot-${mood} ${onClick ? 'mascot-click' : ''} ${className}`}
      style={{ width: size, height: size * 0.64 }}
      title={title}
      onPointerEnter={() => (hover.current = true)}
      onPointerLeave={() => (hover.current = false)}
      onClick={(e) => {
        boopUntil.current = performance.now() + 900;
        blinkUntil.current = performance.now() + 160;
        onClick && onClick(e);
      }}
    >
      <svg viewBox="0 0 100 64" width={size} height={size * 0.64} style={{ overflow: 'visible' }}>
        <defs>
          <clipPath id={`clip${id}`}>
            <path d={shape} />
          </clipPath>
        </defs>
        <path d={shape} fill="#100D1A" />
        <g clipPath={`url(#clip${id})`}>
          <circle cx={ix} cy={iy} r={22} fill="#8B5CF6" opacity={0.18} />
          {arcs.map((a, i) => (
            <path key={i} d={a.d} fill={a.c} opacity={a.idle ? 0.75 : 1} />
          ))}
          <circle cx={ix} cy={iy} r={7.6 * pupil} fill="#050507" />
          <circle cx={ix - 3.4} cy={iy - 4} r={2.5} fill="#fff" opacity={0.9} />
          <circle cx={ix + 3.6} cy={iy + 3} r={1.1} fill="#fff" opacity={0.5} />
        </g>
        <path d={upper} fill="none" stroke="#C4B5FD" strokeWidth={size < 28 ? 4.2 : 2.8} strokeLinecap="round" />
        <path d={lower} fill="none" stroke="#8C84B0" strokeWidth={size < 28 ? 3 : 1.8} strokeLinecap="round" />
        {lashes.map((d, i) => (
          <path key={i} d={d} stroke="#8C84B0" strokeWidth={2} strokeLinecap="round" />
        ))}
        {brow && size >= 28 && <path d={brow} fill="none" stroke="#C4B5FD" strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />}
      </svg>
    </span>
  );
}

// Connected to the app state (mood + live iris).
export function LiveMascot({ size = 40, onClick, badge = true, follow = true }) {
  const statuses = useStore(allStatuses);
  const m = useStore(moodOf);
  return <Mascot mood={m} statuses={statuses} size={size} onClick={onClick} badge={badge && size >= 30} follow={follow} />;
}
