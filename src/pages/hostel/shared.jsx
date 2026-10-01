import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Badge, Button } from '../../components/ui/index';
import api from '../../api/axios';
import { feeReceiptPath, refundVoucherPath } from '../../api/hostel.api';

/**
 * Shared presentation helpers for the hostel screens.
 *
 * Status colour is decided in exactly one place, so a bed that is "occupied"
 * looks the same on the room grid, the occupancy map and every table.
 */
export const STATUS_TONE = {
  // beds / rooms
  available: 'success', occupied: 'primary', partially_occupied: 'info',
  full: 'primary', reserved: 'warning', maintenance: 'danger', inactive: 'muted',
  // workflow
  draft: 'muted', applied: 'info', pending: 'warning', pending_approval: 'warning',
  parent_approved: 'info', approved: 'success', rejected: 'danger', waitlisted: 'warning',
  cancelled: 'muted', completed: 'success', active: 'success', transferred: 'info',
  vacated: 'muted', returned: 'success', overdue: 'danger',
  // attendance
  present: 'success', absent: 'danger', late: 'warning', excused: 'info', on_leave: 'info',
  // tickets
  open: 'warning', assigned: 'info', in_progress: 'info', resolved: 'success',
  reopened: 'warning', closed: 'muted', on_hold: 'muted',
  // fees
  partial: 'warning', paid: 'success', refunded: 'muted',
  // visitors
  checked_in: 'success', checked_out: 'muted', blocked: 'danger',
  // assets
  in_room: 'success', issued: 'info', under_repair: 'warning', damaged: 'danger',
  replaced: 'muted', disposed: 'muted',
  // incidents
  reported: 'warning', investigating: 'info', action_taken: 'info',
  // severity / priority
  low: 'muted', medium: 'info', high: 'warning', urgent: 'danger', critical: 'danger',
  minor: 'muted', moderate: 'warning', major: 'danger',
};

export const label = (v) => String(v || '').replace(/_/g, ' ');

export const StatusBadge = ({ value, tone }) =>
  value ? <Badge variant={tone || STATUS_TONE[value] || 'muted'}>{label(value)}</Badge> : <span>—</span>;

/**
 * Opens a screen's "new" form when it is reached from the Dashboard's New menu
 * (`?new=1`, or `?new=floor` where a screen has two forms), then takes the
 * parameter off the URL — so Back, a refresh or a shared link does not open
 * the form again. `ready` holds it until whatever the form defaults from has
 * loaded: the academic years for an admission, the buildings for a floor.
 *
 * The parameter comes off a tick AFTER the form opens, and only if this copy
 * of the page is still mounted then. AppLayout re-keys the page after every
 * change of path, in an effect, so a page reached by a link is mounted once,
 * thrown away and mounted again; a copy that removed the parameter before it
 * was thrown away left its replacement nothing to open.
 *
 * `extra` names parameters that travel with `new` to prefill the form
 * (`?new=1&student=…&incident=…`): the opener gets them as its second argument
 * and they come off the URL in the same step as `new`, for the same reason.
 */
export function useNewFromLink(ready, open, extra = []) {
  const [params, setParams] = useSearchParams();
  const want = params.get('new');
  const done = useRef(null);
  const opener = useRef(open);
  opener.current = open;
  const extraKey = extra.join(',');

  useEffect(() => {
    if (!want) { done.current = null; return undefined; }
    if (!ready) return undefined;
    if (done.current !== want) {
      done.current = want;
      opener.current(want, Object.fromEntries(extraKey.split(',').filter(Boolean).map((k) => [k, params.get(k) || ''])));
    }
    const t = setTimeout(() => setParams((p) => {
      const n = new URLSearchParams(p); n.delete('new'); extraKey.split(',').filter(Boolean).forEach((k) => n.delete(k)); return n;
    }, { replace: true }), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want, ready, setParams, extraKey]);
}

/** yyyy-mm-dd for <input type="date">, in local time. */
export const di = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export const dt = (v) => (v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const dd = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—');
export const money = (v) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Number(v || 0));
export const today = () => di(new Date());

/** Small labelled field for detail panels. */
export const Field = ({ label: l, children, wide }) => (
  <div style={{ gridColumn: wide ? '1 / -1' : undefined }}>
    <div style={{ fontSize: '.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.03em' }}>{l}</div>
    <div style={{ fontSize: '.86rem', marginTop: 2 }}>{children ?? '—'}</div>
  </div>
);

export const FieldGrid = ({ children, cols = 3 }) => (
  <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols === 2 ? 200 : 150}px, 1fr))`, gap: 14 }}>
    {children}
  </div>
);

/** Filter bar wrapper — the same spacing on every list screen. */
export const Filters = ({ children }) => (
  <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>{children}</div>
);

/** A bed tile on the room / occupancy grid. */
export const BED_COLOR = {
  available: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
  occupied: { bg: '#e0e7ff', border: '#4f46e5', text: '#3730a3' },
  reserved: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  maintenance: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  inactive: { bg: '#f1f5f9', border: '#cbd5e1', text: '#64748b' },
};

export const BedTile = ({ bed, onClick, compact }) => {
  const c = BED_COLOR[bed.status] || BED_COLOR.inactive;
  return (
    <button
      type="button"
      onClick={() => onClick?.(bed)}
      title={`Bed ${bed.bedNumber} — ${label(bed.status)}${bed.student?.name ? ` · ${bed.student.name}` : ''}`}
      style={{
        background: c.bg, border: `1.5px solid ${c.border}`, color: c.text,
        borderRadius: 8, padding: compact ? '6px 8px' : '10px 12px',
        cursor: onClick ? 'pointer' : 'default', textAlign: 'left',
        minWidth: compact ? 62 : 108, fontFamily: 'inherit',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: compact ? '.75rem' : '.85rem' }}>🛏 {bed.bedNumber}</div>
      {!compact && (
        <div style={{ fontSize: '.7rem', marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {bed.student?.name || label(bed.status)}
        </div>
      )}
    </button>
  );
};

export const BedLegend = () => (
  <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '.75rem', color: 'var(--text-muted)' }}>
    {Object.entries(BED_COLOR).map(([k, c]) => (
      <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 11, height: 11, borderRadius: 3, background: c.bg, border: `1.5px solid ${c.border}` }} />
        {label(k)}
      </span>
    ))}
  </div>
);


/** Where uploaded hostel files are served from. */
export const UPLOADS_BASE =
  import.meta.env.VITE_UPLOADS_URL
  || (import.meta.env.VITE_API_URL || '').replace(/\/api\/?$/, '')
  || '';

/**
 * Open an uploaded hostel file.
 *
 * The files are private: the folder is not served to the public, so a plain
 * link to it is refused. The file is asked for with the caller's login — the
 * server decides whether it is theirs to read — and shown from memory.
 */
export async function openHostelFile(stored) {
  if (!stored) return;
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(`${api.defaults.baseURL}/hostel/files/${encodeURIComponent(stored)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || 'Could not open the file');
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) tab.location.href = url; else window.location.assign(url);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    tab?.close();
    toast.error(err?.message || 'Could not open the file');
  }
}

/** A link to an uploaded file, by its stored name. `max` trims a long name. */
export function FileLink({ name, max = 26, className = 'hs-filelink', style, children }) {
  if (!name) return null;
  return (
    <a href="#file" className={className} style={style} title={name}
      onClick={(e) => { e.preventDefault(); openHostelFile(name); }}>
      {children ?? (name.length > max ? `${name.slice(0, max)}…` : name)}
    </a>
  );
}

/**
 * Attachment picker.
 *
 * Uploads each file as it is chosen and hands the caller the stored filenames,
 * which is exactly what the complaint / incident / maintenance records keep in
 * their `attachments` array. `upload` is the API function to use, so the same
 * control serves the administrative screens and the resident portal.
 */
export function Attachments({ value = [], onChange, upload, entityType, entityId, disabled }) {
  const [busy, setBusy] = useState(false);
  const ref = useRef();

  const pick = async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        if (entityType) fd.append('entityType', entityType);
        if (entityId) fd.append('entityId', entityId);
        const res = await upload(fd);
        added.push((res.data ?? res).storedName);
      }
      onChange([...value, ...added]);
      toast.success(`${added.length} file(s) attached`);
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); if (ref.current) ref.current.value = ''; }
  };

  return (
    <div className="form-group">
      <label className="form-label">Attachments</label>
      {!!value.length && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
          {value.map((f, i) => (
            <div key={f + i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', fontSize: '.82rem',
            }}>
              <FileLink name={f} className=""
                style={{ color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📎 {f}
              </FileLink>
              {!disabled && (
                <button type="button" onClick={() => onChange(value.filter((x) => x !== f))}
                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '.76rem' }}>
                  remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {!disabled && (
        <>
          <input ref={ref} type="file" multiple className="form-control" onChange={pick} disabled={busy}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" />
          <div className="form-hint">{busy ? 'Uploading…' : 'Photos or documents, up to 5 MB each'}</div>
        </>
      )}
    </div>
  );
}

/**
 * A scannable pass.
 *
 * The image is rendered server-side and arrives as a data URI, so there is no
 * QR library in this app — see school-backend/utils/qrcode.js for why.
 */
export function PassQr({ image, token, caption, size = 220 }) {
  if (!image && !token) return null;
  return (
    <div style={{ textAlign: 'center' }}>
      {image ? (
        <img src={image} alt="Gate pass QR code" width={size} height={size}
          style={{ imageRendering: 'pixelated', borderRadius: 12, border: '1px solid var(--border)', background: '#fff' }} />
      ) : (
        <div style={{
          background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 16,
          fontFamily: 'monospace', fontSize: '.7rem', wordBreak: 'break-all', maxWidth: size, margin: '0 auto',
        }}>{token}</div>
      )}
      {caption && <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 10 }}>{caption}</div>}
    </div>
  );
}

/**
 * Opens a hostel fee receipt in a new tab. The document is fetched with the
 * caller's token and written into the tab — a plain link carries no token.
 * `invoice` pins an old, repeated receipt number to the right resident.
 */
export const openHostelReceipt = (receiptNumber, invoice) => openDocument(feeReceiptPath(receiptNumber, invoice), 'receipt');
/** The voucher for a refund, the same way. */
export const openRefundVoucher = (voucherNumber) => openDocument(refundVoucherPath(voucherNumber), 'voucher');

async function openDocument(path, what) {
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(`${api.defaults.baseURL}${path}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || `Could not open the ${what}`);
    }
    const html = await res.text();
    if (!tab) { toast.error(`Allow pop-ups to view the ${what}`); return; }
    tab.document.write(html);
    tab.document.close();
  } catch (err) {
    tab?.close();
    toast.error(err?.message || `Could not open the ${what}`);
  }
}
