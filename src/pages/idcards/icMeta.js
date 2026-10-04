/**
 * The ID Card module's vocabulary on the web (Oct 2026) — statuses, kinds,
 * dates, photo links and the two ways a PDF leaves the page (saved or
 * printed). Mirrors school-backend services/idCardRules.
 */

export const KINDS = ['student', 'teacher', 'staff', 'parent'];

export const KIND = {
  student: { label: 'Student', plural: 'Students', cards: 'Student ID Cards', icon: 'student', tone: 'blue', path: 'students', who: 'student' },
  teacher: { label: 'Teacher', plural: 'Teachers', cards: 'Teacher ID Cards', icon: 'teacher', tone: 'emerald', path: 'teachers', who: 'teacher' },
  staff:   { label: 'Staff', plural: 'Staff', cards: 'Staff ID Cards', icon: 'briefcase', tone: 'amber', path: 'staff', who: 'employee' },
  parent:  { label: 'Parent', plural: 'Parents', cards: 'Parent ID Cards', icon: 'users', tone: 'violet', path: 'parents', who: 'parent' },
};

/**
 * Every status a card (or a holder row) can show. `tone` picks the badge
 * colours; `hint` is what the status means, for tooltips and the drawer.
 */
export const STATUS = {
  pending:   { label: 'Pending',   tone: 'amber',  hint: 'No card issued yet' },
  generated: { label: 'Generated', tone: 'indigo', hint: 'Issued ahead for an academic year that has not begun' },
  active:    { label: 'Active',    tone: 'green',  hint: 'In force — verifies as valid' },
  expired:   { label: 'Expired',   tone: 'slate',  hint: 'Its academic year is over' },
  blocked:   { label: 'Blocked',   tone: 'red',    hint: 'Suspended — does not verify until activated' },
  lost:      { label: 'Lost',      tone: 'rose',   hint: 'Reported lost — never valid again' },
  damaged:   { label: 'Damaged',   tone: 'orange', hint: 'Reported damaged — never valid again' },
  reissued:  { label: 'Reissued',  tone: 'violet', hint: 'Replaced by a newer card' },
  cancelled: { label: 'Cancelled', tone: 'gray',   hint: 'Withdrawn for good' },
  none:      { label: 'No card',   tone: 'slate',  hint: 'No card was issued for this year' },
};
export const statusOf = (s) => STATUS[s] || { label: s || '—', tone: 'slate', hint: '' };

/** The words stamped across a card that is not in force. */
export const STAMP = {
  expired: 'Expired', blocked: 'Blocked', lost: 'Reported lost', damaged: 'Damaged', reissued: 'Replaced', cancelled: 'Cancelled',
};

export const REISSUE_REASON = { lost: 'Lost', damaged: 'Damaged', details: 'Details changed', other: 'Reissued' };

/* ── Dates ─────────────────────────────────────────────────────────────────── */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const valid = (d) => { const x = d ? new Date(d) : null; return x && !Number.isNaN(x.getTime()) ? x : null; };

/** A stored day (UTC midnight of the day meant) — a year's last day, a date of birth. */
export const fmtDay = (d) => {
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) d = `${d}T00:00:00Z`;
  const x = valid(d);
  return x ? `${String(x.getUTCDate()).padStart(2, '0')} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}` : '';
};
/** An instant — when something was done — on the reader's calendar. */
export const fmtDate = (d) => {
  const x = valid(d);
  return x ? `${String(x.getDate()).padStart(2, '0')} ${MON[x.getMonth()]} ${x.getFullYear()}` : '';
};
export const fmtTime = (d) => {
  const x = valid(d);
  return x ? x.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '';
};
export const fmtStamp = (d) => {
  const x = valid(d);
  return x ? `${fmtDate(x)}, ${fmtTime(x)}` : '';
};
/** "3 min ago", "yesterday", else the date. */
export function ago(d) {
  const x = valid(d);
  if (!x) return '';
  const s = (Date.now() - x.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} days ago`;
  return fmtDate(x);
}

export const count = (n) => (Number.isFinite(+n) ? +n : 0).toLocaleString('en-IN');
export const plural = (n, one, many) => `${count(n)} ${+n === 1 ? one : (many || `${one}s`)}`;

/* ── Files ─────────────────────────────────────────────────────────────────── */

// Uploads are served from the backend ROOT; VITE_API_URL ends in /api.
const ROOT = String(import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
/** "/uploads/x.png" → a URL the browser can load (or '' for nothing). */
export const fileUrl = (p) => {
  if (!p) return '';
  if (/^(https?:|data:|blob:)/.test(p)) return p;
  return `${ROOT}${p.startsWith('/') ? '' : '/'}${p}`;
};

export const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

/** The message a refused request carried — a PDF request's error body arrives as a Blob. */
export async function errorText(e, fallback = 'Something went wrong') {
  const d = e?.data;
  if (d instanceof Blob) {
    try { const j = JSON.parse(await d.text()); return j.message || fallback; } catch { return fallback; }
  }
  return e?.message && e.message !== 'Something went wrong' ? e.message : (d?.message || fallback);
}

/** Save a PDF the server made. */
export function saveBlob(data, filename) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Print a PDF the server made. The browser's own PDF viewer prints it at true
 * size — in a hidden frame where it can, else in a new tab with its toolbar.
 */
export function printBlob(data) {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: 'application/pdf' }));
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
  frame.src = url;
  const fallback = () => { window.open(url, '_blank', 'noopener'); };
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      fallback();
    }
    setTimeout(() => { frame.remove(); URL.revokeObjectURL(url); }, 60000);
  };
  document.body.appendChild(frame);
}

/** "id-card-aarav-sharma-st2627-00042.pdf" */
export const pdfName = (card) => `id-card-${String(card?.snapshot?.name || 'card').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${String(card?.number || '').toLowerCase()}.pdf`;

/** The line under a holder's name, as their card says it. */
export function subLine(card) {
  const s = card?.snapshot || {};
  if (card?.kind === 'student') return [s.className, s.sectionName].filter(Boolean).join(' – ') || 'Student';
  if (card?.kind === 'parent') return s.relationship || 'Parent';
  return s.designation || (card?.kind === 'teacher' ? 'Teacher' : 'Staff');
}
