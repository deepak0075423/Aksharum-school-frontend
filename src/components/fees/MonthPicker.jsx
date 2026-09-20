/**
 * Pick the months to pay — used by the student/parent fee book and by the
 * office's Record Payment dialog, so a family and the counter choose months
 * the same way.
 *
 * Months are paid in order: ticking a month ticks every unpaid month before
 * it, and unticking one unticks every month after it. That is not a nicety —
 * money always settles the oldest month first on the ledger, so a selection
 * with a gap would buy something other than what it says. Anything owed
 * besides months (fines, other charges) is always included, first.
 *
 * Two kinds of month are never offered: one whose charge was cancelled (a
 * structure switched off and written back), and one already covered by a
 * payment the office has yet to approve — asking for it again would take the
 * money twice. A month part-covered that way offers only the rest.
 *
 * The server works the amount out again from the months it is sent
 * (feesStudent.controller.monthsPayment); `amountFor` here only shows it.
 *
 * props: months (the fee book's monthlySchedule), otherDue, count (how many
 * unpaid months are ticked), onCount, sym.
 */
import React from 'react';

const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmt = (n, sym) => `${sym}${round(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/** What is left to pay on a month: the server's figure, net of anything awaiting approval. */
const owing = (m) => (m.payable != null ? m.payable : m.amountDue) || 0;
export const unpaidMonths = (months = []) => months.filter(m => m.payStatus !== 'cancelled' && owing(m) > 0.004);
/** Months already charged and unpaid — what "pay what is due" means. */
export const dueCount = (months = []) => unpaidMonths(months).filter(m => m.chargedAmount > 0).length;
export const amountFor = (months, otherDue, count) =>
  round((otherDue || 0) + unpaidMonths(months).slice(0, count).reduce((s, m) => s + owing(m), 0));
export const keysFor = (months, count) => unpaidMonths(months).slice(0, count).map(m => m.monthKey);

export default function MonthPicker({ months = [], otherDue = 0, count, onCount, sym = '₹', maxHeight = 280 }) {
  const list = unpaidMonths(months);
  if (!list.length && !(otherDue > 0)) {
    return <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--text-muted, #64748b)' }}>Nothing left to pay this year.</p>;
  }
  const row = { display: 'grid', gridTemplateColumns: '20px minmax(0,1fr) auto', gap: 10, alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid #eef1f6', cursor: 'pointer', fontSize: '.86rem' };
  return (
    <div style={{ border: '1px solid #e6eaf1', borderRadius: 10, maxHeight, overflowY: 'auto' }} role="group" aria-label="Months to pay">
      {otherDue > 0 ? (
        <div style={{ ...row, cursor: 'default', background: '#fff7ed' }}>
          <input type="checkbox" checked readOnly disabled style={{ accentColor: '#4f46e5' }} />
          <span><b>Fines &amp; other charges</b><br /><small style={{ color: '#9a3412' }}>Always paid first</small></span>
          <b>{fmt(otherDue, sym)}</b>
        </div>
      ) : null}
      {list.map((m, i) => {
        const on = i < count;
        const names = [...new Set((m.items || []).filter(x => !x.cancelled).map(x => x.name))].join(', ');
        const tag = m.awaiting > 0 ? 'Part awaiting approval'
          : m.chargedAmount > 0 ? (m.amountPaid > 0 ? 'Part paid' : 'Due')
            : 'In advance';
        const tone = m.awaiting > 0 ? '#b45309' : m.chargedAmount > 0 ? '#dc2626' : '#475569';
        return (
          <label key={m.monthKey} style={{ ...row, background: on ? '#f5f3ff' : '#fff' }}>
            <input type="checkbox" checked={on} style={{ accentColor: '#4f46e5', width: 16, height: 16 }}
              onChange={() => onCount(on ? i : i + 1)} aria-label={m.monthLabel} />
            <span style={{ minWidth: 0 }}>
              <b>{m.monthLabel}</b> <small style={{ color: tone, fontWeight: 600 }}>· {tag}</small>
              <br /><small style={{ color: '#64748b' }}>{names}
                {m.amountPaid > 0 ? ` · ${fmt(m.amountPaid, sym)} already paid` : ''}
                {m.awaiting > 0 ? ` · ${fmt(m.awaiting, sym)} waiting for the office to approve` : ''}</small>
            </span>
            <b>{fmt(owing(m), sym)}</b>
          </label>
        );
      })}
    </div>
  );
}
