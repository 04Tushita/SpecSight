import { useEffect, useRef, useState } from 'react';

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// Smoothly follows a numeric target (critically damped feel).
export function useSpring(target, speed = 8) {
  const [v, setV] = useState(target);
  const cur = useRef(target);
  useEffect(() => {
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const next = cur.current + (target - cur.current) * (1 - Math.exp(-speed * dt));
      cur.current = Math.abs(next - target) < 0.0005 ? target : next;
      setV(cur.current);
      if (cur.current !== target) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, speed]);
  return v;
}

// Time in ms since mount (optionally only while `on`).
export function useClock(on = true) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    let raf;
    const start = performance.now() - t;
    const tick = (now) => {
      setT(now - start);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);
  return t;
}

// Counts up to a number.
export function useCount(target, ms = 600) {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const a = from.current;
    if (a === target) return;
    let raf;
    const st = performance.now();
    const tick = (now) => {
      const k = clamp((now - st) / ms, 0, 1);
      setV(Math.round(lerp(a, target, ease(k))));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// Cubic bezier helpers for the lens / eye.
export const bez = (t, p0, p1, p2, p3) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};
export const pt = (t, P) => [bez(t, P[0][0], P[1][0], P[2][0], P[3][0]), bez(t, P[0][1], P[1][1], P[2][1], P[3][1])];
export const sample = (P, t0, t1, n = 24) => {
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(pt(t0 + ((t1 - t0) * i) / n, P));
  return pts;
};
export const poly = (pts) => 'M ' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L ');
