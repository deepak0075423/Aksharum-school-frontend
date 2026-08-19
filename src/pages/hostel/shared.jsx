import React, { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Badge, Button } from '../../components/ui/index';

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

export const fileUrl = (stored) => (stored ? `${UPLOADS_BASE}/uploads/hostel-docs/${stored}` : '');

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
              <a href={fileUrl(f)} target="_blank" rel="noreferrer"
                style={{ color: 'var(--primary)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                📎 {f}
              </a>
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
