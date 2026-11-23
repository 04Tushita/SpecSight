import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, actions, hint as hintSel } from './store.js';

export const COL = {
  pass: '#86D4C2',
  fail: '#FF8F7E',
  wait: '#F6C177',
  run: '#8B5CF6',
  sky: '#7DD3FC',
  ac: '#C4B5FD',
  idle: '#8C84B0',
  tx: '#F5F3FF',
  sub: '#BDB7D6',
};
export const statusColor = (st) => ({ pass: COL.pass, fixed: COL.pass, fail: COL.fail, wait: COL.wait, run: COL.run, idle: COL.idle, queued: COL.idle })[st] || COL.idle;
export const statusWord = (st) => ({ pass: 'verified', fixed: 'fixed in Run 2', fail: 'broke', wait: 'needs clarification', run: 'testing now', idle: 'not tested yet', queued: 'queued' })[st];

// ------------------------------------------------------------- icons
const P = (d, extra = {}) => ({ d, ...extra });
const ICONS = {
  check: [P('M4 10.5l3.5 3.5L16 6')],
  x: [P('M5 5l10 10M15 5L5 15')],
  chevDown: [P('M5 8l5 5 5-5')],
  chevUp: [P('M5 12l5-5 5 5')],
  chevRight: [P('M8 5l5 5-5 5')],
  chevLeft: [P('M12 5l-5 5 5 5')],
  expand: [P('M12 3h5v5M8 17H3v-5M17 3l-6 6M3 17l6-6')],
  collapse: [P('M16 9h-5V4M4 11h5v5M11 9l6-6M9 11l-6 6')],
  play: [P('M7 4.5v11l9-5.5z', { fill: 'currentColor', stroke: 'none' })],
  pause: [P('M6 4h3v12H6zM11 4h3v12h-3z', { fill: 'currentColor', stroke: 'none' })],
  send: [P('M3 10l14-6-6 14-2-6z')],
  sparkle: [P('M10 2l1.8 5.2L17 9l-5.2 1.8L10 16l-1.8-5.2L3 9l5.2-1.8z', { fill: 'currentColor', stroke: 'none' })],
  external: [P('M11 3h6v6M17 3l-8 8M14 11v5H4V6h5')],
  copy: [P('M7 7h9v9H7z M4 13V4h9')],
  download: [P('M10 3v10M6 9l4 4 4-4M4 16h12')],
  refresh: [P('M16 10a6 6 0 1 1-1.8-4.3M16 3v4h-4')],
  files: [P('M5 3h6l4 4v10H5z M11 3v4h4')],
  search: [P('M9 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM13.5 13.5L17 17')],
  git: [P('M6 4v12M6 8a4 4 0 0 0 4 4h2M14 12a2 2 0 1 0 0 .1M6 4a1.5 1.5 0 1 0 0 .1M6 16a1.5 1.5 0 1 0 0 .1')],
  debug: [P('M6 4l10 6-10 6z')],
  ext: [P('M4 4h5v5H4zM11 4h5v5h-5zM4 11h5v5H4zM13.5 11v5M11 13.5h5')],
  bulb: [P('M7 14h6M8 17h4M10 3a5 5 0 0 0-3 9c.7.6 1 1.3 1 2h4c0-.7.3-1.4 1-2a5 5 0 0 0-3-9z')],
  folder: [P('M3 6h5l2 2h7v8H3z')],
  dot: [P('M10 10m-3 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0', { fill: 'currentColor', stroke: 'none' })],
  bell: [P('M5 14V9a5 5 0 0 1 10 0v5l1.5 2h-13zM8.5 17.5a1.6 1.6 0 0 0 3 0')],
  user: [P('M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3.5 17a6.5 6.5 0 0 1 13 0')],
  keyboard: [P('M3 6h14v9H3zM6 9h1M9 9h1M12 9h1M6 12h8')],
  restart: [P('M4 10a6 6 0 1 0 1.8-4.3M4 3v4h4')],
  map: [P('M3 10c2.5-4 11.5-4 14 0-2.5 4-11.5 4-14 0z M10 10m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0')],
  list: [P('M7 6h10M7 10h10M7 14h10M3.5 6h.1M3.5 10h.1M3.5 14h.1')],
  edit: [P('M4 16l1-4 8-8 3 3-8 8zM12 5l3 3')],
  clock: [P('M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM10 6v4l3 2')],
  message: [P('M3 4h14v10H8l-4 3v-3H3z')],
  link: [P('M8.5 11.5l3-3M7 9l-2 2a2.8 2.8 0 0 0 4 4l2-2M13 11l2-2a2.8 2.8 0 0 0-4-4L9 7')],
  plus: [P('M10 4v12M4 10h12')],
  lock: [P('M5 9h10v8H5zM7 9V6a3 3 0 0 1 6 0v3')],
  wifiOff: [P('M3 7a11 11 0 0 1 14 0M6 10.5a6.5 6.5 0 0 1 8 0M9 14a2 2 0 0 1 2 0M3 3l14 14')],
};
export function Icon({ name, size = 16, sw = 1.7, style, className }) {
  const paths = ICONS[name] || [];
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {paths.map((p, i) => <path key={i} {...p} />)}
    </svg>
  );
}

export function Triangle({ size = 13, color = '#0F0B1C', mark = COL.fail }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 13" aria-hidden="true" style={{ flex: 'none' }}>
      <path d="M7 0.8 L13.4 12.2 L0.6 12.2 Z" fill={color} strokeLinejoin="round" />
      <rect x="6.25" y="4.2" width="1.5" height="4.3" rx="0.7" fill={mark} />
      <rect x="6.25" y="9.4" width="1.5" height="1.5" rx="0.7" fill={mark} />
    </svg>
  );
}

// ------------------------------------------------------------- buttons
export function Button({ kind = 'primary', children, onClick, hint, opt, disabled, icon, iconRight, small, wide, style, title, className = '' }) {
  const on = useHintFor(hint);
  return (
    <button
      type="button"
      title={title}
      data-opt={opt || undefined}
      className={`btn btn-${kind} ${small ? 'btn-sm' : ''} ${wide ? 'btn-wide' : ''} ${on ? 'hint' : ''} ${className}`}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={style}
    >
      {icon && <Icon name={icon} size={small ? 14 : 16} />}
      <span>{children}</span>
      {iconRight && <Icon name={iconRight} size={small ? 14 : 16} />}
    </button>
  );
}
export function useHintFor(id) {
  return useStore((s) => (id ? hintSel(s) === id : false));
}

// ------------------------------------------------------------- spec tag
export function Tag({ n, st = 'idle', onClick, small, ring, label, style, className = '' }) {
  const cls = `tag tag-${st} ${small ? 'tag-sm' : ''} ${ring ? 'tag-ring' : ''} ${onClick ? 'tag-click' : ''} ${className}`;
  const inner = (
    <>
      <span>{label || `Spec ${n}`}</span>
      {(st === 'pass' || st === 'fixed') && <Icon name="check" size={small ? 11 : 12} sw={2.2} />}
      {st === 'fail' && <Triangle size={small ? 11 : 13} />}
      {st === 'wait' && <span className="tag-q">?</span>}
      {st === 'run' && <span className="tag-dot" />}
    </>
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} style={style}>
      {inner}
    </button>
  ) : (
    <span className={cls} style={style}>
      {inner}
    </span>
  );
}

// ------------------------------------------------------------- toasts
export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.tone}`}>
          <span className="toast-dot" />
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------- swap transition
export function Swap({ k, children, className = '', kind = 'fade', ms = 320 }) {
  const last = useRef({ k, el: children });
  const [leaving, setLeaving] = useState([]);
  useLayoutEffect(() => {
    if (last.current.k !== k) {
      const gone = last.current;
      setLeaving((l) => [...l.filter((x) => x.k !== k && x.k !== gone.k), gone]);
      setTimeout(() => setLeaving((l) => l.filter((x) => x !== gone)), ms);
    }
    last.current = { k, el: children };
  });
  return (
    <div className={`swap ${className}`}>
      {leaving
        .filter((x) => x.k !== k)
        .map((x) => (
          <div key={'l-' + x.k} className={`swap-item swap-${kind} swap-leave`} style={{ animationDuration: ms + 'ms' }} aria-hidden="true">
            {x.el}
          </div>
        ))}
      <div key={'a-' + k} className={`swap-item swap-${kind} swap-enter`} style={{ animationDuration: ms + 'ms' }}>
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- misc
export function Kbd({ children }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function useEsc(fn, on = true) {
  useEffect(() => {
    if (!on) return;
    const h = (e) => e.key === 'Escape' && fn();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [fn, on]);
}

export function Spinner({ size = 14, color = COL.ac }) {
  return <span className="spinner" style={{ width: size, height: size, borderColor: color, borderRightColor: 'transparent' }} />;
}

export function Panel({ children, className = '', style, title, right, ...rest }) {
  return (
    <section className={`panel ${className}`} style={style} {...rest}>
      {(title || right) && (
        <header className="panel-head">
          {title && <span className="label">{title}</span>}
          {right && <div className="panel-right">{right}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export const openRecordingFor = (specId) => {
  const map = { 1: 's1b', 2: 's2d', 3: 's3c', 4: 's4a', 5: 's5a' };
  actions.openRecording(map[specId]);
};

// ------------------------------------------------------------- back button
export function BackButton({ onClick, children = 'Back', className = '' }) {
  return (
    <button type="button" className={`back-btn ${className}`} onClick={onClick}>
      <Icon name="chevLeft" size={16} sw={2.2} />
      {children}
    </button>
  );
}

// ------------------------------------------------------------- drag-to-resize handle
const stageScale = () => {
  const st = document.querySelector('.stage');
  return st ? st.getBoundingClientRect().width / st.offsetWidth : 1;
};
export function Sash({ dir = 'x', value, onChange, min = 0, max = 9999, invert = false, title = 'Drag to resize' }) {
  const [on, setOn] = useState(false);
  return (
    <div
      className={`sash sash-${dir} ${on ? 'on' : ''}`}
      title={title}
      onDoubleClick={() => onChange(null)}
      onPointerDown={(e) => {
        e.preventDefault();
        const k = stageScale();
        const start = dir === 'x' ? e.clientX : e.clientY;
        const v0 = value;
        setOn(true);
        document.body.classList.add('dragging');
        document.body.style.cursor = dir === 'x' ? 'col-resize' : 'row-resize';
        const mv = (ev) => {
          const d = ((dir === 'x' ? ev.clientX : ev.clientY) - start) / k;
          onChange(Math.max(min, Math.min(max, v0 + (invert ? -d : d))));
        };
        const up = () => {
          setOn(false);
          document.body.classList.remove('dragging');
          document.body.style.cursor = '';
          window.removeEventListener('pointermove', mv);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', mv);
        window.addEventListener('pointerup', up);
      }}
    />
  );
}
