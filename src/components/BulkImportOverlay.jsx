import React from 'react';
import { Spinner } from './ui/index';

/**
 * The blocking progress panel shown while a bulk import streams.
 *
 * Both the student and teacher imports run row-by-row over SSE and report the
 * same four numbers, so they share this panel — the two used to drift apart
 * every time one of them was touched.
 *
 * `progress` is the client's running tally:
 *   { total, current, currentName, created, updated, errorCount }
 */
export default function BulkImportOverlay({ open, title, progress }) {
  if (!open) return null;

  const total   = progress?.total ?? 0;
  const current = progress?.current ?? 0;
  const errors  = progress?.errorCount ?? 0;
  const pct     = total > 0 ? Math.round((current / total) * 100) : 0;

  const tiles = [
    { n: progress?.created ?? 0, label: 'Created', tone: 'success' },
    { n: progress?.updated ?? 0, label: 'Updated', tone: null },
    { n: errors,                 label: 'Errors',  tone: errors > 0 ? 'danger' : null },
    { n: total,                  label: 'Total',   tone: null },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999, padding: 20,
      background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      pointerEvents: 'all',
    }}>
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
        padding: '26px 28px', width: '100%', maxWidth: 460, boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Spinner size="sm" />
          <h3 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h3>
        </div>

        {/* Progress bar — only once the sheet has been read and a row count is known */}
        {total > 0 ? (
          <>
            <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 99, height: 8, marginBottom: 8, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, background: 'var(--primary)', width: `${pct}%`, transition: 'width .2s' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 14 }}>
              <span>Processing {current} of {total}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
            </div>
          </>
        ) : (
          <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: 14 }}>Reading the sheet…</div>
        )}

        {progress?.currentName && (
          <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Processing <strong style={{ color: 'var(--text)' }}>{progress.currentName}</strong>…
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {tiles.map(({ n, label, tone }) => (
            <div key={label} style={{
              background: tone === 'success' ? 'var(--success-light,#f0fdf4)'
                        : tone === 'danger'  ? 'var(--danger-light,#fef2f2)' : 'var(--bg)',
              border: `1px solid ${tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)', padding: '10px 6px', textAlign: 'center',
            }}>
              <div style={{
                fontSize: '1.4rem', fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums',
                color: tone === 'success' ? 'var(--success)' : tone === 'danger' ? 'var(--danger)' : 'var(--text)',
              }}>{n}</div>
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 16, marginBottom: 0, textAlign: 'center' }}>
          Please wait — do not close or refresh this page.
        </p>
      </div>
    </div>
  );
}
