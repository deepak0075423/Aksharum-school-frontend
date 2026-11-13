/**
 * Video Learning — the pieces its screens share.
 *
 * Every screen of the module (Super Admin, School Admin, Teacher, Student) is
 * built from the admin list frame (pages/admin/listParts) plus the handful of
 * things here that are the module's own: a book cover, a video thumbnail, a
 * progress bar, status wording, and time formatting. Styles: styles/videos.css.
 */
import React, { useEffect, useRef, useState } from 'react';
import '../../styles/videos.css';
import Icon from '../../components/ui/icons';
import { Badge, Spinner, Alert, Button } from '../../components/ui/index';
import { fileUrl } from '../admin/listParts';

// ── Words and numbers ────────────────────────────────────────────────────────

/** 725 → "12:05", 3725 → "1:02:05". */
export const clock = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
};
/** 3900 → "1 h 5 min", 300 → "5 min", 40 → "under a minute". */
export const spent = (sec) => {
  const m = Math.round((Number(sec) || 0) / 60);
  if (!sec) return '0 min';
  if (m < 1) return 'under a minute';
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`;
};
/** "12:05" or "1:02:05" → seconds; '' when it is not a time. */
export const parseClock = (text) => {
  const t = String(text || '').trim();
  if (!/^\d{1,3}(:\d{1,2}){0,2}$/.test(t)) return '';
  return t.split(':').map(Number).reduce((total, part) => total * 60 + part, 0);
};
export const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const dayTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
export const bytes = (n) => {
  const b = Number(n) || 0;
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return b ? `${Math.max(1, Math.round(b / 1024))} KB` : '—';
};
/** A value for <input type="datetime-local"> in the reader's own time zone. */
export const toLocalInput = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
export const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;
export const errText = (e) => e?.message || 'Something went wrong. Please try again.';

/** A picture's address, whether it was uploaded (/uploads/…), made by processing (/api/…) or lives elsewhere (https://…). */
export const mediaUrl = (path) => (path ? fileUrl(path) : '');

// ── Status wording — one table, so a status reads the same on every screen ────

const STATUS = {
  // books / chapters / subjects / boards
  active:      ['success', 'Active'],     inactive:    ['muted', 'Inactive'],   archived:   ['warning', 'Archived'],
  // video processing
  draft:       ['muted', 'No file yet'],  uploading:   ['info', 'Uploading'],   queued:     ['info', 'Queued'],
  processing:  ['info', 'Processing'],    ready:       ['success', 'Ready'],    failed:     ['danger', 'Failed'],
  // requests
  pending:     ['warning', 'Pending'],    under_review: ['info', 'Under review'], approved:  ['success', 'Approved'],
  rejected:    ['danger', 'Rejected'],    in_progress: ['info', 'In progress'], completed:  ['success', 'Completed'],
  // releases
  scheduled:   ['info', 'Scheduled'],     expired:     ['muted', 'Expired'],    unpublished: ['warning', 'Unpublished'],
  revoked:     ['danger', 'Revoked'],
  // a student's progress
  not_started: ['muted', 'Not started'],  locked:      ['muted', 'Locked'],     available:  ['primary', 'Available'],
  nothing_released: ['muted', 'Nothing released'], ended: ['muted', 'Ended'],
};
export const statusWord = (s) => (STATUS[s] || [null, String(s || '').replace(/_/g, ' ')])[1];
export const StatusBadge = ({ status, children }) => {
  const [variant, word] = STATUS[status] || ['muted', String(status || '').replace(/_/g, ' ')];
  return <Badge variant={variant}>{children || word}</Badge>;
};

// ── Pictures ─────────────────────────────────────────────────────────────────

const TINTS = ['indigo', 'blue', 'green', 'amber', 'purple', 'pink', 'teal', 'orange'];
const tintOf = (text) => TINTS[[...String(text || '')].reduce((n, c) => n + c.charCodeAt(0), 0) % TINTS.length];
const initials = (text) => String(text || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/** A book's cover, or its initials on a tint when it has none. */
export const Cover = ({ src, title, size }) => {
  const [broken, setBroken] = useState(false);
  const url = mediaUrl(src);
  return (
    <span className={`vl-cover${size ? ` vl-cover--${size}` : ''} tint-${tintOf(title)}`} aria-hidden>
      {url && !broken ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials(title)}
    </span>
  );
};

/** A video's thumbnail with its length, and how much of it has been watched. */
export const Thumb = ({ src, durationSec, percent, size }) => {
  const [broken, setBroken] = useState(false);
  const url = mediaUrl(src);
  return (
    <span className={`vl-thumb${size ? ` vl-thumb--${size}` : ''}`} aria-hidden>
      {url && !broken ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> : <Icon name="film" size={size === 'sm' ? 18 : 26} />}
      {durationSec ? <span className="vl-thumb__time">{clock(durationSec)}</span> : null}
      {percent > 0 ? <span className="vl-thumb__bar"><span style={{ width: `${Math.min(100, percent)}%` }} /></span> : null}
    </span>
  );
};

/** A progress bar with its figure beside it. */
export const Meter = ({ percent = 0, small, label }) => {
  const p = Math.max(0, Math.min(100, Math.round(Number(percent) || 0)));
  return (
    <div className="vl-meter" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Progress'}>
      <div className={`vl-bar${small ? ' vl-bar--sm' : ''}${p >= 100 ? ' vl-bar--done' : ''}`}><span style={{ width: `${p}%` }} /></div>
      <span className="vl-pct">{p}%</span>
    </div>
  );
};

// ── Page furniture ───────────────────────────────────────────────────────────

export const Head = ({ title, subtitle, children }) => (
  <header className="vl-head">
    <div>
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="vl-head__acts">{children}</div> : null}
  </header>
);

export const Panel = ({ title, subtitle, action, flush, children }) => (
  <section className="vl-card">
    {(title || action) && (
      <div className="vl-card__head">
        <div className="vl-grow">
          {title ? <h2>{title}</h2> : null}
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {action}
      </div>
    )}
    <div className={`vl-card__body${flush ? ' vl-card__body--flush' : ''}`}>{children}</div>
  </section>
);

/** What a screen shows while it waits, when it failed (with a way to try again), or its content. */
export const Loadable = ({ loading, error, onRetry, children }) => {
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;
  if (error) {
    return (
      <Alert variant="danger">
        {error}{' '}
        {onRetry ? <button type="button" className="vl-link" onClick={onRetry}>Try again</button> : null}
      </Alert>
    );
  }
  return children;
};

/** A value typed in a search box, once the typing has paused. */
export function useDebounced(value, ms = 300) {
  const [out, setOut] = useState(value);
  useEffect(() => { const t = setTimeout(() => setOut(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return out;
}

/** True until the component unmounts — for setting state after an await. */
export function useAlive() {
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return alive;
}

/**
 * A picture chooser that uploads at once and hands back the stored address.
 * `upload(file)` does the upload and resolves to `{ data: { url } }`.
 */
export function ImageField({ label, value, onChange, upload, hint, shape = 'cover' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef(null);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError('Choose a JPG, PNG or WebP picture'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('The picture must be 5 MB or smaller'); return; }
    setBusy(true); setError('');
    try { const res = await upload(file); onChange(res?.data?.url || ''); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };
  return (
    <div className="form-group">
      {label ? <label className="form-label">{label}</label> : null}
      <div className="vl-row">
        {shape === 'cover' ? <Cover src={value} title={label} /> : <Thumb src={value} size="sm" />}
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={pick} />
        <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => ref.current?.click()}>
          <Icon name="upload" size={14} /> {value ? 'Replace' : 'Upload'}
        </Button>
        {value ? <Button type="button" variant="secondary" size="sm" onClick={() => onChange('')}>Remove</Button> : null}
      </div>
      {hint && !error ? <div className="form-hint">{hint}</div> : null}
      {error ? <div className="form-error">{error}</div> : null}
    </div>
  );
}

/** Save a blob the API answered with (an export, an attachment). */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export { Icon };
