/**
 * Audit rows (FeeAuditLog, via the activity endpoints) as readable lines —
 * the History tabs, the concessions' Recent Activity and Settings → Audit
 * Logs all print them the same way.
 */
import React from 'react';
import { Loading, fmtDateTime, ago, money, plural, Mark } from './feeUI';

/** Model field → the words the screens use for it. */
const FIELD = {
  name: 'name', description: 'description', category: 'category', type: 'frequency', amountType: 'fixed/variable',
  defaultAmount: 'default amount', isActive: 'status', isArchived: 'archive', items: 'fee heads', totalAmount: 'total',
  dueDay: 'due day', effectiveFrom: 'charging start', level: 'applies to', class: 'class', section: 'section',
  concessionType: 'type', value: 'discount', applicableTo: 'coverage', applicableHeads: 'fee heads', eligibility: 'eligibility',
  validFrom: 'start date', validTo: 'end date', ruleType: 'rule type', fineType: 'calculation', flatAmount: 'amount',
  perDayAmount: 'amount per day', gracePeriodDays: 'grace period', maxCap: 'maximum', appliesTo: 'applies to', classes: 'classes',
  receiptPrefix: 'receipt prefix', roundingRule: 'rounding', decimalPlaces: 'decimal places', acceptedModes: 'payment modes',
  display: 'display settings', notifications: 'notifications', allowPartialPayments: 'part payments', autoGenerateReceipt: 'auto receipt',
  showPreviousDues: 'previous dues', collectionStart: 'collection start', collectionEnd: 'collection end', defaultDueDays: 'due days',
  defaultGraceDays: 'grace days', defaultAcademicYear: 'default year', lateFeeCalculation: 'late fee calculation',
  fineAppliesOn: 'fine basis', includeConcessionInFine: 'concession in fine', autoAdjustAdvance: 'advance adjustment',
  minPaymentAmount: 'minimum payment', currency: 'currency', currencySymbol: 'currency symbol', receipt: 'receipt text',
};

/** One audit row as { title, detail }. */
export function describe(h) {
  const d = h.detail || {};
  switch (h.action) {
    case 'created': return { title: 'Created' };
    case 'updated': return { title: 'Updated', detail: h.changed?.length ? h.changed.map(k => FIELD[k] || k).join(', ') : '' };
    case 'activated': return { title: 'Switched on' };
    case 'deactivated': return { title: 'Switched off' };
    case 'archived': return { title: 'Archived' };
    case 'restored': return { title: 'Restored' };
    case 'assigned': return { title: `${plural(d.students || 0, 'student')} assigned`, detail: d.credited ? `${money(d.credited)} taken off` : '' };
    case 'unassigned': return { title: 'Withdrawn from a student', detail: d.reversed ? `${money(d.reversed)} added back` : '' };
    case 'fine_charged': return { title: `Charged to ${d.name || 'a student'}`, detail: d.amount ? money(d.amount) : '' };
    case 'demand_generated': return { title: `Demand generated for ${plural(d.generated || 0, 'student')}`, detail: d.concession ? `${money(d.concession)} concessions applied` : '' };
    case 'imported': return { title: `${plural(d.created || 0, 'fee head')} imported` };
    case 'copied': return { title: `Copied ${d.from} → ${d.to}`, detail: `${d.created} created, ${d.skipped} skipped` };
    case 'reset': return { title: 'Reset to defaults' };
    case 'approved': return { title: 'Payment approved', detail: d.receiptNumber || '' };
    case 'rejected': return { title: 'Payment rejected', detail: d.amount ? money(d.amount) : '' };
    case 'report_emailed': return { title: 'Report emailed', detail: d.report || '' };
    case 'reminders_sent': return { title: `Reminders sent for ${plural(d.students || 0, 'student')}` };
    case 'schedule_added': return { title: 'Report scheduled' };
    case 'schedule_removed': return { title: 'Scheduled report removed' };
    case 'backup_downloaded': return { title: 'Backup downloaded' };
    case 'settings_exported': return { title: 'Settings exported' };
    default: return { title: String(h.action || 'Changed').replace(/_/g, ' ') };
  }
}

export function History({ rows }) {
  if (!rows) return <Loading rows={3} />;
  if (!rows.length) return <p className="fe-form__hint">No changes recorded yet. History starts from the Sep 2026 update.</p>;
  return (
    <ul className="fe-history">
      {rows.map(h => {
        const { title, detail } = describe(h);
        return (
          <li key={h._id}><i />
            <div>
              <strong>{title}</strong>{detail ? <span style={{ color: '#64748b', fontSize: '.82rem' }}> — {detail}</span> : null}
              <p>{h.by} · {fmtDateTime(h.at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const ACTIVITY_LOOK = {
  created: ['plusCircle', 'green'], updated: ['pencil', 'blue'], assigned: ['users', 'red'], unassigned: ['users', 'slate'],
  deactivated: ['pause', 'amber'], activated: ['checkCircle', 'green'],
};

/** The concessions rail: icon, what happened, to which scheme, how long ago. */
export function Activity({ rows }) {
  if (!rows) return <Loading rows={3} />;
  if (!rows.length) return <p className="fe-form__hint">Nothing has changed yet.</p>;
  const titles = { created: 'New concession created', updated: 'Concession updated', deactivated: 'Concession deactivated', activated: 'Concession activated' };
  return (
    <ul className="fe-activity">
      {rows.map(a => {
        const [glyph, tone] = ACTIVITY_LOOK[a.action] || ['docFill', 'indigo'];
        const title = a.action === 'assigned' ? `${plural(a.students || 0, 'student')} assigned` : a.action === 'unassigned' ? 'Student withdrawn' : (titles[a.action] || describe(a).title);
        return (
          <li key={a._id}>
            <Mark glyph={glyph} tone={tone} size={38} glyphSize={18} />
            <div><strong>{title}</strong><span>{a.name}</span></div>
            <time title={fmtDateTime(a.at)}>{ago(a.at)}</time>
          </li>
        );
      })}
    </ul>
  );
}
