import { useEffect, useRef, useState } from 'react';
import { Triangle } from './ui.jsx';

const KW = new Set(['import', 'from', 'export', 'return', 'if', 'else', 'async', 'await', 'try', 'catch', 'throw', 'default', 'new']);
const KW2 = new Set(['const', 'let', 'function', 'type', 'true', 'false', 'null', 'undefined', 'typeof']);
const C = { kw: '#C586C0', kw2: '#569CD6', str: '#CE9178', cm: '#6A9955', fn: '#DCDCAA', cls: '#4EC9B0', tag: '#569CD6', attr: '#9CDCFE', id: '#9CDCFE', pun: '#D4D4D4', num: '#B5CEA8', txt: '#D4D4D4' };

const JSX_TEXT = /^\s*[A-Za-z][A-Za-z ,.'’!?]*[.!?]?\s*$/;
export function tokenize(line) {
  const out = [];
  if (JSX_TEXT.test(line) && !/^\s*(import|export|return|const|let|if|type|async|await|try|catch|function)\b/.test(line) && / /.test(line.trim())) return [[line, 'txt']];
  let i = 0;
  let inText = false;
  while (i < line.length) {
    const rest = line.slice(i);
    let m;
    if (inText && (m = rest.match(/^[^<{]+/))) {
      out.push([m[0], 'txt']);
      inText = false;
    } else if ((m = rest.match(/^\s+/))) {
      out.push([m[0], 'pun']);
    } else if ((m = rest.match(/^\/\/.*/))) {
      out.push([m[0], 'cm']);
    } else if ((m = rest.match(/^(['"`])(?:\\.|(?!\1)[^\\])*\1?/))) {
      out.push([m[0], 'str']);
    } else if ((m = rest.match(/^<\/?(?=[A-Za-z])/))) {
      out.push([m[0], 'pun']);
      i += m[0].length;
      const n = line.slice(i).match(/^[A-Za-z][\w.]*/);
      if (n) {
        out.push([n[0], /^[A-Z]/.test(n[0]) ? 'cls' : 'tag']);
        i += n[0].length;
      }
      continue;
    } else if ((m = rest.match(/^[A-Za-z_$][\w$]*/))) {
      const w = m[0];
      const nx = line[i + w.length];
      const nx2 = line[i + w.length + 1];
      let c = 'id';
      if (KW.has(w)) c = 'kw';
      else if (KW2.has(w)) c = 'kw2';
      else if (/^[A-Z]/.test(w)) c = 'cls';
      else if (nx === '(') c = 'fn';
      else if (nx === '=' && nx2 !== '=' && nx2 !== '>') c = 'attr';
      out.push([w, c]);
    } else if ((m = rest.match(/^\d+/))) {
      out.push([m[0], 'num']);
    } else {
      m = [rest[0]];
      out.push([rest[0], 'pun']);
      if (rest[0] === '>' && line[i - 1] !== '=' && /<[A-Za-z]/.test(line.slice(0, i)) && /^[A-Za-z]/.test(line.slice(i + 1))) inText = true;
    }
    i += m[0].length;
  }
  return out;
}

// lines: [{ text, n }], marks: { [n]: 'agent'|'run'|'fail'|'step' }, notes: [{ n, text, tone, badge }]
export default function CodeView({
  lines,
  mode = 'color',
  marks = {},
  notes = [],
  insertAfter = null,
  scrollTo = null,
  fontSize = 13,
  lineH = 20,
  className = '',
  typingLine = null,
  onLineClick,
  lightbulbAt = null,
  onBulb,
  bulbOpen,
  bulbMenu,
  noteX = 470,
  onEdit = null,
}) {
  const box = useRef(null);
  const [edit, setEdit] = useState(null); // { i, caret }
  const input = useRef(null);
  useEffect(() => {
    if (!edit || !input.current) return;
    input.current.focus();
    input.current.setSelectionRange(edit.caret, edit.caret);
    caretNow.current = edit.caret;
  }, [edit && edit.i, edit && edit.k]);
  const caretNow = useRef(0);
  useEffect(() => {
    if (!onEdit) setEdit(null);
  }, [onEdit]);
  // keep focus if the row re-rendered under the caret
  useEffect(() => {
    if (edit && input.current && document.activeElement !== input.current) {
      input.current.focus();
      input.current.setSelectionRange(caretNow.current, caretNow.current);
    }
  });
  const texts = () => lines.map((l) => l.text);
  const keyDown = (e, i) => {
    const el = e.currentTarget;
    const pos = el.selectionStart;
    const t = texts();
    if (e.key === 'Enter') {
      e.preventDefault();
      const indent = (t[i].match(/^\s*/) || [''])[0];
      const a = t[i].slice(0, pos), b = t[i].slice(pos);
      t.splice(i, 1, a, indent + b.replace(/^\s+/, ''));
      onEdit(t);
      setEdit({ i: i + 1, caret: indent.length, k: Math.random() });
    } else if (e.key === 'Backspace' && pos === 0 && el.selectionEnd === 0 && i > 0) {
      e.preventDefault();
      const c = t[i - 1].length;
      t.splice(i - 1, 2, t[i - 1] + t[i]);
      onEdit(t);
      setEdit({ i: i - 1, caret: c, k: Math.random() });
    } else if (e.key === 'ArrowUp' && i > 0) {
      e.preventDefault();
      setEdit({ i: i - 1, caret: Math.min(pos, t[i - 1].length), k: Math.random() });
    } else if (e.key === 'ArrowDown' && i < t.length - 1) {
      e.preventDefault();
      setEdit({ i: i + 1, caret: Math.min(pos, t[i + 1].length), k: Math.random() });
    } else if (e.key === 'Tab') {
      e.preventDefault();
      t[i] = t[i].slice(0, pos) + '  ' + t[i].slice(el.selectionEnd);
      onEdit(t);
      setEdit({ i, caret: pos + 2, k: Math.random() });
    } else if (e.key === 'Escape') {
      setEdit(null);
    }
  };
  useEffect(() => {
    if (scrollTo == null || !box.current) return;
    const idx = lines.findIndex((l) => l.n === scrollTo);
    if (idx < 0) return;
    const y = idx * lineH;
    const el = box.current;
    if (y > el.scrollTop + lineH && y < el.scrollTop + el.clientHeight - lineH * 3) return;
    el.scrollTo({ top: Math.max(0, y - el.clientHeight / 3), behavior: 'smooth' });
  }, [scrollTo, lines, lineH]);

  return (
    <div className={`code ${className}`} ref={box} style={{ fontSize, '--lh': lineH + 'px' }}>
      <div className="code-inner">
        {lines.map((l, li) => {
          const mk = marks[l.n];
          const editing = onEdit && edit && edit.i === li;
          const ns = notes.filter((x) => x.n === l.n);
          return (
            <div key={onEdit ? 'r' + li : l.key || l.n}>
              <div
                className={`code-line ${mk ? 'mk-' + mk : ''} ${typingLine === l.n ? 'typing' : ''} ${l.fresh ? 'fresh' : ''} ${onEdit ? 'editable' : ''} ${editing ? 'editing' : ''}`}
                onClick={(e) => {
                  if (onEdit && !editing) {
                    const lt = e.currentTarget.querySelector('.lt');
                    const r = lt.getBoundingClientRect();
                    const cw = l.text.length ? r.width / l.text.length : 1;
                    const caret = Math.max(0, Math.min(l.text.length, Math.round((e.clientX - r.left) / cw)));
                    setEdit({ i: li, caret, k: Math.random() });
                  }
                  onLineClick && onLineClick(l.n);
                }}
              >
                <span className="ln">{l.n}</span>
                <span className="lt">
                  {editing ? (
                    <input
                      ref={input}
                      className="line-input"
                      value={l.text}
                      spellCheck={false}
                      style={{ width: `${Math.max(l.text.length + 3, 12)}ch` }}
                      onChange={(e) => {
                        const t = texts();
                        t[li] = e.target.value;
                        caretNow.current = e.target.selectionStart;
                        onEdit(t);
                      }}
                      onKeyDown={(e) => keyDown(e, li)}
                      onBlur={() => setTimeout(() => setEdit((x) => (x && x.i === li ? null : x)), 0)}
                    />
                  ) : mode === 'plain' ? (
                    <span style={{ color: '#E6E1F5' }}>{l.text || ' '}</span>
                  ) : l.text ? (
                    tokenize(l.text).map(([t, c], i) => (
                      <span key={i} style={{ color: C[c] }}>
                        {t}
                      </span>
                    ))
                  ) : (
                    ' '
                  )}
                </span>
                {noteX !== 'below' && ns.map((x, i) => (
                  <span key={i} className={`code-note note-${x.tone || 'sky'}`} style={{ left: noteX }}>
                    {x.badge === '!' ? <Triangle size={15} color="#FF8F7E" mark="#0F0B1C" /> : x.badge ? <span className={`note-badge nb-${x.tone || 'sky'}`}>{x.badge}</span> : null}
                    <span className="note-text">{x.text}</span>
                  </span>
                ))}
                {lightbulbAt === l.n && (
                  <button type="button" className={`bulb ${bulbOpen ? 'on' : ''}`} onClick={onBulb} title="Quick fix">
                    💡
                  </button>
                )}
              </div>
              {noteX === 'below' &&
                ns.map((x, i) => (
                  <div key={'b' + i} className={`code-note-below note-${x.tone || 'sky'}`}>
                    {x.badge === '!' ? <Triangle size={14} color="#FF8F7E" mark="#0F0B1C" /> : x.badge ? <span className={`note-badge nb-${x.tone || 'sky'}`}>{x.badge}</span> : null}
                    <span className="note-text">{x.text}</span>
                  </div>
                ))}
              {lightbulbAt === l.n && bulbOpen && bulbMenu}
              {insertAfter && insertAfter.n === l.n && insertAfter.el}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Build visible lines for the agent's typing animation in VS Code.
export function linesFor(code) {
  return code.replace(/\n$/, '').split('\n').map((text, i) => ({ text, n: i + 1 }));
}
