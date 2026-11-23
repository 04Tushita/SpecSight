import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, actions, allStatuses, countVerified, get, toast, totalTests } from './store.js';
import { SPECS, TASK, CODE, STEP_MS, fmt, CASES } from './data.js';
import { Button, Icon, Tag, Triangle, Spinner, COL, statusColor } from './ui.jsx';
import { Player, stepsForCase } from './Recording.jsx';
import Mascot, { LiveMascot } from './Mascot.jsx';
import { specText } from './SpecSight.jsx';

const CAPSULE_URL = `specsight.app/c/${TASK.id}-7f2`;

// ------------------------------------------------------------------ diff stats
function diffCount(a, b) {
  const A = a.replace(/\n$/, '').split('\n'),
    B = b.replace(/\n$/, '').split('\n');
  const n = A.length,
    m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const common = dp[0][0];
  return { add: m - common, del: n - common };
}
export const DIFF = diffCount(CODE.original, CODE.fixed);

// ------------------------------------------------------------------ summary data
function rows(s) {
  const st = allStatuses(s);
  const r = SPECS.map((sp) => {
    const x = st[sp.id - 1];
    const result = x === 'fixed' ? 'Fixed in Run 2' : sp.id === 3 && s.clarified ? 'Clarified' : x === 'pass' ? 'Passed' : x === 'fail' ? 'Broke' : x === 'wait' ? 'Needs clarification' : 'Not tested';
    return { n: sp.id, st: x, text: specText(s, sp.id), result };
  });
  return r;
}
function markdown(s) {
  const r = rows(s);
  const v = countVerified(s);
  const lines = [
    `## ${s.summaryTitle}`,
    '',
    `Verified with SpecSight: ${v} of 5 specs, ${totalTests(s)} tests, ${s.run} runs.`,
    '',
    '| Spec | What it checks | Result |',
    '| --- | --- | --- |',
    ...r.map((x) => `| Spec ${x.n} | ${x.text} | ${x.result} |`),
  ];
  if (s.yours) lines.push(`| Yours | ${s.yours.name} | Passed |`);
  lines.push('', '**What changed:** `handleSave()` now saves before showing “Saved”, and shows an error if saving fails.', `**Files:** NotificationSettings.tsx (+${DIFF.add} −${DIFF.del})`);
  if (s.clarified) lines.push('**Spec 3 clarified with Dan (Product Owner):** security alerts are always sent, even with email off.');
  lines.push(`**Proof Capsule:** https://${CAPSULE_URL}`);
  return lines.join('\n');
}
const plain = (s) => markdown(s).replace(/^## /, '').replace(/\*\*/g, '').replace(/`/g, '').replace(/\| --- \| --- \| --- \|\n/, '').replace(/^\| (.*) \|$/gm, (m, x) => x.split(' | ').join('  ·  '));

// Saves a file. Inside claude.ai the page asks the viewer through the downloads
// capability; when run as a plain file it falls back to a normal link.
let dlNs;
async function downloadsNs() {
  if (dlNs !== undefined) return dlNs;
  try {
    dlNs = window.claude && window.claude.use ? await Promise.race([window.claude.use('downloads'), new Promise((r) => setTimeout(() => r(null), 3000))]) : null;
  } catch (e) {
    dlNs = null;
  }
  return dlNs;
}
if (typeof window !== 'undefined') setTimeout(downloadsNs, 0);
async function download(name, blob) {
  const ns = await downloadsNs();
  if (ns) {
    try {
      await ns.save({ filename: name, data: blob });
      return 'saved';
    } catch (e) {
      if (e && e.code === 'declined') return 'declined';
      if (e && e.code === 'rate_limited') return 'busy';
      return 'failed';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
  return 'saved';
}
async function copyText(t) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e2) {}
    ta.remove();
    return ok;
  }
}

// ---- a real .docx, built by hand (stored zip, no compression)
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (b) => {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function zip(files) {
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let off = 0;
  for (const [name, text] of files) {
    const nb = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(8, 0, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, data.length, true);
    c.setUint32(24, data.length, true);
    c.setUint16(28, nb.length, true);
    c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const size = central.reduce((a, x) => a + x.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, size, true);
  e.setUint32(16, off, true);
  return new Blob([...parts, ...central, new Uint8Array(e.buffer)]);
}
function makeDocx(paras) {
  const x = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = paras
    .map(({ t, h, bold }) => `<w:p>${h ? '<w:pPr><w:spacing w:after="160"/></w:pPr>' : ''}<w:r><w:rPr>${h || bold ? '<w:b/>' : ''}${h ? '<w:sz w:val="32"/>' : '<w:sz w:val="22"/>'}<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr><w:t xml:space="preserve">${x(t)}</w:t></w:r></w:p>`)
    .join('');
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'],
    ['word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`],
  ]);
}
const ascii = (t) => t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[·•]/g, '-').replace(/−/g, '-').replace(/…/g, '...').replace(/[^\x20-\x7E]/g, '');
function makePdf(lines) {
  const esc = (t) => ascii(t).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  let y = 780;
  let content = 'BT\n';
  lines.forEach(({ t, size = 11, bold }) => {
    const wrap = [];
    let cur = '';
    const max = size > 14 ? 52 : 88;
    for (const w of ascii(t).split(' ')) {
      if ((cur + ' ' + w).trim().length > max) {
        wrap.push(cur);
        cur = w;
      } else cur = (cur + ' ' + w).trim();
    }
    wrap.push(cur);
    for (const l of wrap) {
      content += `/${bold ? 'F2' : 'F1'} ${size} Tf 1 0 0 1 56 ${y} Tm (${esc(l)}) Tj\n`;
      y -= size + 7;
    }
    y -= 4;
  });
  content += 'ET';
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => {
    offs.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}
function makePng(s) {
  const W = 1200,
    H = 720;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#0B0A10';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#C4B5FD';
  g.font = '600 18px Inter, sans-serif';
  g.fillText('SPECSIGHT  ·  PR SUMMARY', 60, 70);
  g.fillStyle = '#F5F3FF';
  g.font = '600 34px Inter, sans-serif';
  g.fillText(s.summaryTitle, 60, 122);
  g.font = '400 20px Inter, sans-serif';
  g.fillStyle = '#BDB7D6';
  g.fillText(`${countVerified(s)} of 5 specs verified  ·  ${totalTests(s)} tests  ·  ${s.run} runs`, 60, 160);
  rows(s).forEach((r, i) => {
    const y = 220 + i * 70;
    g.fillStyle = '#15141B';
    g.fillRect(60, y - 36, W - 120, 56);
    g.fillStyle = statusColor(r.st);
    g.beginPath();
    g.roundRect(80, y - 24, 96, 32, 16);
    g.fill();
    g.fillStyle = '#0B0A10';
    g.font = '600 16px Inter, sans-serif';
    g.fillText(`Spec ${r.n}`, 98, y - 2);
    g.fillStyle = '#F5F3FF';
    g.font = '400 19px Inter, sans-serif';
    g.fillText(r.text, 200, y - 2);
    g.fillStyle = r.result === 'Broke' ? COL.fail : r.result === 'Clarified' ? COL.wait : COL.pass;
    g.font = '600 17px Inter, sans-serif';
    g.fillText(r.result, W - 260, y - 2);
  });
  g.fillStyle = '#C4B5FD';
  g.font = '500 18px Inter, sans-serif';
  g.fillText('Proof Capsule  ·  ' + CAPSULE_URL, 60, 640);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
async function doExport(kind) {
  const s = get();
  try {
    const done = (st, name) =>
      st === 'saved' ? toast(`Downloaded ${name}`, 'pass') : st === 'declined' ? toast('Download cancelled', 'wait') : st === 'busy' ? toast('A download is already waiting for you to confirm', 'wait') : toast('This view can’t save files. Try Copy instead.', 'fail');
    if (kind === 'text') {
      const ok = await copyText(plain(s));
      toast(ok ? 'Copied the summary as text' : 'Couldn’t copy here. Try a download instead.', ok ? 'pass' : 'fail');
    } else if (kind === 'md') {
      const ok = await copyText(markdown(s));
      toast(ok ? 'Copied the summary as Markdown' : 'Couldn’t copy here. Try a download instead.', ok ? 'pass' : 'fail');
    } else if (kind === 'word') {
      const paras = markdown(s)
        .split('\n')
        .filter((l) => l.trim() && !/^\| --- /.test(l))
        .map((l) => (l.startsWith('## ') ? { t: l.slice(3), h: true } : l.startsWith('|') ? { t: l.split('|').map((c) => c.trim()).filter(Boolean).join('  ·  ') } : { t: l.replace(/\*\*(.*?)\*\*/g, '$1').replace(/`/g, ''), bold: /^\*\*/.test(l) }));
      const name = `pr-summary-${TASK.id}.docx`;
      done(await download(name, makeDocx(paras)), name);
    } else if (kind === 'pdf') {
      const r = rows(s);
      const lines = [{ t: s.summaryTitle, size: 18, bold: true }, { t: `Verified with SpecSight: ${countVerified(s)} of 5 specs, ${totalTests(s)} tests, ${s.run} runs.` }, ...r.map((x) => ({ t: `Spec ${x.n}: ${x.text}  -  ${x.result}` })), { t: 'What changed: handleSave() now saves before showing "Saved", and shows an error if saving fails.' }, { t: `Proof Capsule: https://${CAPSULE_URL}`, bold: true }];
      const name = `pr-summary-${TASK.id}.pdf`;
      done(await download(name, makePdf(lines)), name);
    } else if (kind === 'png') {
      const name = `pr-summary-${TASK.id}.png`;
      done(await download(name, await makePng(s)), name);
    }
  } catch (e) {
    toast('Your browser blocked this. Try another format.', 'fail');
  }
}

// ------------------------------------------------------------------ summary
export function Summary() {
  const s = useStore((x) => x);
  const [menu, setMenu] = useState(false);
  const r = rows(s);
  const v = countVerified(s);
  const items = capsuleItems(s);
  useEffect(() => {
    if (!menu) return;
    const h = (e) => !e.target.closest('.export') && setMenu(false);
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [menu]);
  return (
    <div className="summary">
      <div className="panel sum-card">
        <div className="sum-h">
          <span className="label ac">PR SUMMARY</span>
          <span className="sub">Written from your test log. You can edit it before the pull request opens.</span>
        </div>
        <label className="sum-title">
          <input value={s.summaryTitle} onChange={(e) => actions.setTitle(e.target.value)} aria-label="Pull request title" />
          <Icon name="edit" size={15} />
        </label>
        <div className="sum-grid">
          <div>
            <div className="label">SPECS · {v} OF 5 VERIFIED</div>
            <div className="sum-rows">
              {r.map((x) => (
                <div key={x.n} className="sum-row">
                  <Tag n={x.n} st={x.st} small />
                  <span className="sum-t">{x.text}</span>
                  <span className={`pill pill-${x.result === 'Fixed in Run 2' ? 'fixed' : x.result === 'Clarified' ? 'wait' : x.st}`}>{x.result}</span>
                </div>
              ))}
              {s.yours && (
                <div className="sum-row">
                  <span className="yours-chip static">Yours</span>
                  <span className="sum-t">{s.yours.name}</span>
                  <span className="pill pill-pass">Passed</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <div className="label">WHAT CHANGED</div>
            <div className="sum-box">
              <p>handleSave() now saves before showing “Saved”, and shows an error if saving fails.</p>
              <span className="filechip mono">
                NotificationSettings.tsx <span className="plus">+{DIFF.add}</span> <span className="minus">−{DIFF.del}</span>
              </span>
            </div>
            <div className="label" style={{ marginTop: 16 }}>
              TESTS
            </div>
            <div className="tiles">
              <div>
                <b>{totalTests(s)}</b>
                <span>tests</span>
              </div>
              <div>
                <b>{s.run}</b>
                <span>runs</span>
              </div>
              <div>
                <b style={{ color: COL.fail }}>2</b>
                <span>fixed</span>
              </div>
              <div>
                <b style={{ color: COL.wait }}>{s.clarified ? 1 : 0}</b>
                <span>clarified</span>
              </div>
              <div>
                <b style={{ color: COL.ac }}>{v}/5</b>
                <span>specs</span>
              </div>
            </div>
          </div>
        </div>
        <button type="button" className="capbar" onClick={() => actions.openCapsule('summary')}>
          <Mascot mood="happy" statuses={allStatuses(s)} size={34} badge={false} />
          <div className="capbar-t">
            <b>Proof Capsule</b>
            <span className="sub">
              {CAPSULE_URL} · {items.reduce((a, b) => a + 1, 0)} recordings · opens in any browser
            </span>
          </div>
          <div className="capbar-line">
            {items.map((it, i) => (
              <span key={i} className={`cl-seg cl-${it.tone}`} style={{ flex: it.steps.length }} />
            ))}
          </div>
          <span className="link" data-opt="Watch the test recordings in the Proof Capsule">Watch the recordings ›</span>
        </button>
        <div className="sum-foot">
          <span className="sub">Opens a pull request with this summary in its description.</span>
          <div className="export">
            <Button kind="secondary" iconRight={menu ? 'chevUp' : 'chevDown'} onClick={() => setMenu((m) => !m)}>
              Export
            </Button>
            {menu && (
              <div className="menu">
                {[
                  ['COPY', [['text', 'Copy as text', 'Paste it anywhere', 'copy'], ['md', 'Copy as Markdown', 'For the pull request or a wiki', 'copy']]],
                  ['DOWNLOAD', [['word', 'Word document', 'pr-summary.docx', 'download'], ['pdf', 'PDF', 'pr-summary.pdf', 'download'], ['png', 'Image', 'pr-summary.png, for slides or chat', 'download']]],
                ].map(([g, items], gi) => (
                  <div key={g}>
                    {gi > 0 && <div className="menu-div" />}
                    <div className="menu-g">{g}</div>
                    {items.map(([k, t, d, ic]) => (
                      <button
                        type="button"
                        key={k}
                        className="menu-i"
                        onClick={() => {
                          setMenu(false);
                          doExport(k);
                        }}
                      >
                        <Icon name={ic} size={16} />
                        <span>
                          <b>{t}</b>
                          <small>{d}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <Button kind="secondary" icon="git" onClick={actions.seeChanges}>
            See changes
          </Button>
          <Button hint="createpr" onClick={actions.createPR} disabled={v < 5}>
            Create pull request
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Creating({ step }) {
  const steps = [`Pushing ${TASK.branch}`, 'Opening the pull request', 'Adding the summary and the Proof Capsule', 'Requesting reviewers: Nina Patel, Omar Haddad'];
  return (
    <div className="creating">
      <div className="creating-box">
        <Mascot mood="focus" statuses={['pass', 'fixed', 'pass', 'fixed', 'pass']} size={56} />
        <div className="creating-t">Creating the pull request</div>
        {steps.map((t, i) => (
          <div key={i} className={`cr-step ${i < step ? 'done' : i === step ? 'on' : ''}`}>
            <span>{i < step ? <Icon name="check" size={13} sw={2.6} /> : i === step ? <Spinner size={12} /> : null}</span>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ capsule
export function capsuleItems(s) {
  const items = [];
  const st = allStatuses(s);
  const add = (spec, caseId, run, label, tone) => {
    const steps = stepsForCase(caseId, run).map((x) => ({ ...x, run, chapterLabel: label }));
    items.push({ spec, caseId, run, label, tone, steps });
  };
  const fixed = s.code === 'fixed';
  add(1, 's1b', 1, 'passed', 'pass');
  add(2, 's2d', 1, 'broke', 'fail');
  if (fixed && (st[1] === 'fixed' || st[1] === 'pass')) add(2, 's2d', 2, 'fixed', 'pass');
  add(3, 's3c', 1, 'needed clarification', 'wait');
  if (s.clarified && st[2] === 'pass') {
    const steps = stepsForCase('s3c', 2).map((x) => ({ ...x, run: 1, chapterLabel: 'clarified, re-tested' }));
    items.push({ spec: 3, caseId: 's3c', run: 1, label: 'clarified', tone: 'pass', steps });
  }
  add(4, 's4a', 1, 'broke', 'fail');
  if (fixed && (st[3] === 'fixed' || st[3] === 'pass')) add(4, 's4a', 2, 'fixed', 'pass');
  add(5, 's5a', 1, 'passed', 'pass');
  if (s.yours) items.push({ spec: 'yours', caseId: 'yours', run: 1, label: 'yours', tone: 'pass', steps: (s.yours.recording || []).map((x) => ({ ...x, run: 1, chapterLabel: 'your test' })) });
  return items;
}

export function Capsule() {
  const s = useStore((x) => x);
  const items = useMemo(() => capsuleItems(s), [s.code, s.clarified, s.yours, s.cases]);
  const [seek, setSeek] = useState({ t: 0, n: 0 });
  const [chap, setChap] = useState(0);
  const { chapters, steps } = useMemo(() => {
    let acc = 0;
    const chapters = items.map((it) => {
      const start = acc;
      acc += it.steps.length * STEP_MS;
      return { start, end: acc, tone: it.tone, it };
    });
    return { chapters, steps: items.flatMap((it) => it.steps) };
  }, [items]);
  const from = s.ss.fromCapsule;
  const go = (t) => setSeek((x) => ({ t, n: x.n + 1 }));
  const st = allStatuses(s);
  const perSpec = [1, 2, 3, 4, 5].map((n) => items.find((x) => x.spec === n));
  return (
    <div className="capsule">
      <div className="panel cap-left">
        <div className="label ac">TASK #{TASK.id}</div>
        <div className="task-t sm">{TASK.title}</div>
        <div className="cap-legend">
          <div>
            <span className="lg-dot" style={{ background: COL.pass }} /> Step passed
          </div>
          <div>
            <Triangle size={13} color={COL.fail} mark="#0F0B1C" /> Step broke in Run 1{s.code === 'fixed' ? ', fixed in Run 2' : ''}
          </div>
          <div>
            <span className="lg-q">?</span> Step needed clarification
          </div>
        </div>
        <div className="label">SPECS · STEP BY STEP</div>
        {perSpec.map((it, i) => {
          const n = i + 1;
          const c = chapters.find((x) => x.it === it);
          return (
            <div key={n} className={`track ${chapters[chap]?.it.spec === n ? 'on' : ''}`}>
              <button type="button" className="track-h" onClick={() => go(c.start + 5)}>
                <Tag n={n} st={st[n - 1]} small />
                <span>{SPECS[n - 1].label}</span>
              </button>
              <div className="track-line">
                {it.steps.map((x, k) => (
                  <button type="button" key={k} className="tdot" onClick={() => go(c.start + k * STEP_MS + 5)} title={x.label}>
                    {x.broke ? <Triangle size={15} color={COL.fail} mark="#0F0B1C" /> : x.wait ? <span className="lg-q sm">?</span> : <span className="lg-dot" />}
                    <small>{k + 1}</small>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <div className="panel cap-main">
        <div className="cap-h">
          <div>
            <h2>
              Proof Capsule · {s.phase === 'verified' ? 'sealed automatically' : 'in progress'}
            </h2>
            <span className="sub">
              #{TASK.id} · every recording, playable in a browser · click anywhere on the timeline
            </span>
          </div>
        </div>
        <div className="cap-body">
          <Player steps={steps} width={620} chapters={chapters} seek={seek} onChapter={setChap} compact autoplay />
          <div className="cap-chapters">
            <div className="label">CHAPTERS</div>
            {chapters.map((c, i) => (
              <button type="button" key={i} className={`chap ${chap === i ? 'on' : ''}`} onClick={() => go(c.start + 5)}>
                {c.it.spec === 'yours' ? <span className="yours-chip static">Yours</span> : <Tag n={c.it.spec} st={c.tone === 'fail' ? 'fail' : c.tone === 'wait' ? 'wait' : 'pass'} small />}
                <span className="chap-t">
                  <b>{c.it.spec === 'yours' ? s.yours.name : CASES.find((x) => x.id === c.it.caseId).name}</b>
                  <small className={c.tone}>Run {c.it.run} · {c.it.label}</small>
                </span>
                <span className="mono sub">{fmt(c.start)}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="cap-foot">
          <div className="cap-sum">
            <b>{countVerified(s)} / 5 specs verified</b>
            <span className="sub">
              {steps.length} steps · {items.length} recordings · {CAPSULE_URL}
            </span>
          </div>
          <Button
            kind="secondary"
            icon="link"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText('https://' + CAPSULE_URL);
                toast('Capsule link copied', 'pass');
              } catch {
                toast('https://' + CAPSULE_URL, 'info');
              }
            }}
          >
            Copy capsule link
          </Button>
          <Button onClick={from === 'summary' ? actions.openSummary : actions.backToLens}>{from === 'summary' ? 'Back to the summary' : 'Back to the Proof Lens'}</Button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ PR
export function PRBody({ s }) {
  const r = rows(s);
  return (
    <div className="prdesc">
      <div className="prd-t">{s.summaryTitle}</div>
      <div className="prd-s">
        Verified with SpecSight · {countVerified(s)} of 5 specs · {totalTests(s)} tests · {s.run} runs
      </div>
      {r.map((x) => (
        <div key={x.n} className="prd-row">
          <Tag n={x.n} st={x.st} small />
          <span>{x.text}</span>
          <span className={`prd-res ${x.result === 'Broke' ? 'bad' : x.result === 'Clarified' ? 'wait' : x.result.startsWith('Fixed') ? 'bad2' : 'ok'}`}>{x.result === 'Clarified' ? 'Clarified with Dan' : x.result}</span>
        </div>
      ))}
      {s.yours && (
        <div className="prd-row">
          <span className="yours-chip static">Yours</span>
          <span>{s.yours.name}</span>
          <span className="prd-res ok">Passed</span>
        </div>
      )}
      <p className="prd-p">What changed: handleSave() now saves before showing “Saved”, and shows an error if saving fails.</p>
      <p className="prd-link">Proof Capsule · {CAPSULE_URL}</p>
    </div>
  );
}

export const REVIEWERS = [
  ['N', 'Nina Patel', '#F472B6', 'Owns the settings area · reviewed this file last'],
  ['O', 'Omar Haddad', '#60A5FA', 'Wrote preferences.ts · knows the save API'],
  ['L', 'Lena Brooks', '#FBBF24', 'Product QA for notifications'],
];
function Reviewers() {
  const [req, setReq] = useState({ 'Nina Patel': true, 'Omar Haddad': true, 'Lena Brooks': false });
  return (
    <div className="revs">
      {REVIEWERS.map(([a, n, c, why]) => (
        <div key={n} className="rev">
          <span className="avatar" style={{ background: c }}>
            {a}
          </span>
          <div className="rev-t">
            <b>{n}</b>
            <span>{why}</span>
          </div>
          <button type="button" className={`rev-b ${req[n] ? 'on' : ''}`} onClick={() => setReq((r) => ({ ...r, [n]: !r[n] }))}>
            {req[n] ? 'Requested ✓' : 'Request'}
          </button>
        </div>
      ))}
      <span className="sub rev-note">Suggested from who owns and last changed these files</span>
    </div>
  );
}

export function PRCreated() {
  const s = useStore((x) => x);
  return (
    <div className="prc">
      <div className="panel prc-card">
        <div className="prc-h">
          <span className="prc-ok">
            <Icon name="check" size={22} sw={2.6} />
          </span>
          <div>
            <h2>Pull request #2291 is open</h2>
            <span className="sub">
              {TASK.branch} → main · Azure Repos · just now
            </span>
          </div>
        </div>
        <div className="prc-grid">
          <div>
            <div className="label ac">DESCRIPTION · FROM YOUR SUMMARY</div>
            <PRBody s={s} />
          </div>
          <div className="prc-side">
            <div className="label ac">RECOMMENDED REVIEWERS</div>
            <Reviewers />
            <div className="label ac">CHECKS</div>
            <div className="rev">
              <span className="okdot">
                <Icon name="check" size={12} sw={3} />
              </span>
              <div>
                <b>SpecSight</b>
                <span>5 of 5 specs verified</span>
              </div>
            </div>
            <div className="rev">
              <span className="okdot">
                <Icon name="check" size={12} sw={3} />
              </span>
              <div>
                <b>Build</b>
                <span>passed in 3 min</span>
              </div>
            </div>
            <div className="label ac">LINKED</div>
            <p className="sub">Task #{TASK.id} · Azure DevOps</p>
            <p className="sub">Moved to “In review”</p>
          </div>
        </div>
        <div className="prc-foot">
          <Button kind="secondary" iconRight="external" onClick={() => actions.openPRPage()}>
            Open pull request
          </Button>
          <Button hint="done" onClick={actions.done}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
