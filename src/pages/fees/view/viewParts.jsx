/**
 * The pieces the family's fee screens are built from — a student looking at
 * their own fees and a parent looking at one child's. Both render the same
 * three tabs (Fee Schedule, Payment History, Receipts); only who is being
 * looked at changes, so there is one set of parts and one page.
 *
 * The office's kit (pages/fees/admin/feeUI) supplies the tiles, tables,
 * badges and pager — this is the same module, so it wears the same clothes.
 * What lives here is only what a family needs and the office does not: the
 * rail you pay from, the list of ways to pay, and the receipt preview.
 */
import React from 'react';
import Icon from '../../../components/ui/icons';
import { Btn, Glyph, Mark, money, fmtDate, plural } from '../admin/feeUI';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';

/* ── Chrome ───────────────────────────────────────────────────────────────── */

/**
 * The fee book's tabs are page state, not routes, so only their names reach
 * the layout's breadcrumb — a step that switched a tab could not be a link,
 * and a trail whose steps do different things depending on the page is exactly
 * what this rebuild set out to remove.
 */
export const Crumbs = ({ trail = [] }) => {
  usePageCrumbs(trail.map(c => ({ label: c.label })));
  return null;
};

export const ViewHead = ({ title, subtitle, children }) => (
  <div className="fv-head">
    <div className="fv-head__t">
      <h2>{title}</h2>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="fv-head__a">{children}</div> : null}
  </div>
);

export const Promo = ({ children }) => (
  <div className="fv-promo">
    <span className="fv-promo__i"><Glyph name="gradCap" size={42} /></span>
    <p>{children}</p>
  </div>
);

export const Note = ({ tone = 'info', glyph = 'info', title, children, action }) => (
  <div className={`fv-note fv-note--${tone}`}>
    <span className="fv-note__i"><Glyph name={glyph} size={22} /></span>
    <span className="fv-note__b"><strong>{title}</strong><span>{children}</span></span>
    {action || null}
  </div>
);

export const RailCard = ({ title, action, children }) => (
  <section className="fv-rcard">
    {title ? <div className="fv-rcard__h"><h3>{title}</h3>{action || null}</div> : null}
    <div className="fv-rcard__b">{children}</div>
  </section>
);

/* ── How a payment is described ───────────────────────────────────────────── */

/** Icon, tint and wording for each way a fee can be paid. */
export const MODE_LOOK = {
  upi:           { glyph: 'rupee', bg: '#ecfdf5', ink: '#059669', label: 'UPI' },
  card:          { glyph: 'card', bg: '#eff6ff', ink: '#2563eb', label: 'Card' },
  online:        { glyph: 'bolt', bg: '#eef2ff', ink: '#4f46e5', label: 'Online' },
  bank_transfer: { glyph: 'cash', bg: '#f5f3ff', ink: '#7c3aed', label: 'Net Banking' },
  cash:          { glyph: 'cash', bg: '#fffbeb', ink: '#b45309', label: 'Cash' },
  cheque:        { glyph: 'doc', bg: '#f8fafc', ink: '#475569', label: 'Cheque' },
  dd:            { glyph: 'doc', bg: '#f8fafc', ink: '#475569', label: 'Demand Draft' },
};
export const modeLook = (m) => MODE_LOOK[m] || { glyph: 'rupee', bg: '#f8fafc', ink: '#475569', label: (m || '—').replace('_', ' ') };

export const ModeCell = ({ mode }) => {
  const l = modeLook(mode);
  return (
    <span className="fv-modecell">
      <i style={{ background: l.bg, color: l.ink }}><Glyph name={l.glyph} size={15} /></i>
      {l.label}
    </span>
  );
};

/**
 * The months a payment settled. Payments made before months were recorded
 * against them say what their receipt lines say instead of pretending to know.
 */
export function monthsCovered(p) {
  if (Array.isArray(p.months) && p.months.length) return p.months.map(monthName).join(', ');
  const named = (p.lines || []).map(l => l.feeName).filter(n => n && n !== 'Fee Payment');
  return named.length ? named.join(', ') : '—';
}

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthName = (k) => (k ? `${MON[Number(String(k).slice(5, 7)) - 1]} ${String(k).slice(0, 4)}` : '—');
export const monthShort = (k) => (k ? `${MON[Number(String(k).slice(5, 7)) - 1].slice(0, 3)} ${String(k).slice(0, 4)}` : '—');

/** "Sep 2026 – Jan 2027", or one month on its own. */
export const monthRange = (keys = []) => {
  const sorted = [...keys].filter(Boolean).sort();
  if (!sorted.length) return '—';
  return sorted.length === 1 ? monthShort(sorted[0]) : `${monthShort(sorted[0])} – ${monthShort(sorted[sorted.length - 1])}`;
};

/* ── The rail you pay from ────────────────────────────────────────────────── */

/**
 * The months ticked for payment, what they come to, and the button that
 * starts it. Months are settled oldest first, so removing one removes every
 * month after it — the same rule the picker and the server both keep.
 */
export const SelectedMonths = ({ months = [], otherDue = 0, sym, onDrop, onClear, onPay, busy, payLabel = 'Proceed to Pay' }) => {
  const total = (otherDue || 0) + months.reduce((s, m) => s + (m.payable != null ? m.payable : m.amountDue), 0);
  return (
    <RailCard title={`Selected Months (${months.length})`}
      action={months.length ? <button type="button" className="fe-link" onClick={onClear}>Clear All</button> : null}>
      {otherDue > 0 ? (
        <div className="fv-pick">
          <span><b>Fines &amp; other charges</b><br /><small style={{ color: '#b45309' }}>Always paid first</small></span>
          <b>{money(otherDue, { sym, space: true })}</b>
        </div>
      ) : null}
      {months.length ? months.map((m, i) => (
        <div className="fv-pick" key={m.monthKey}>
          <span>{m.monthLabel}</span>
          <b>{money(m.payable != null ? m.payable : m.amountDue, { sym, space: true })}</b>
          <button type="button" aria-label={`Remove ${m.monthLabel}`} onClick={() => onDrop(i)}><Icon name="close" size={15} /></button>
        </div>
      )) : (
        <p className="fe-form__hint" style={{ margin: '4px 0 0' }}>
          Tick the months you want to pay. Ticking one includes every unpaid month before it.
        </p>
      )}
      {months.length || otherDue > 0 ? (
        <>
          <div className="fv-total"><span>Total Amount</span><b>{money(total, { sym, space: true })}</b></div>
          <div style={{ marginTop: 12 }}>
            <Btn variant="primary" onClick={onPay} disabled={busy || total <= 0}>{payLabel} <Icon name="arrowRight" size={16} /></Btn>
          </div>
        </>
      ) : null}
    </RailCard>
  );
};

/**
 * What the school accepts. Every online route goes through the same checkout,
 * so these open it rather than pretending to be three different journeys;
 * with the gateway switched off they say so instead of leading nowhere.
 */
export const PaymentMethods = ({ online, onPay, onOffline }) => (
  <RailCard title="Payment Methods">
    {[
      { key: 'card', glyph: 'card', bg: '#eff6ff', ink: '#2563eb', title: 'Credit / Debit Card', sub: 'Visa, MasterCard, RuPay' },
      { key: 'upi', glyph: 'rupee', bg: '#ecfdf5', ink: '#059669', title: 'UPI', sub: 'Google Pay, PhonePe, Paytm' },
      { key: 'netbanking', glyph: 'cash', bg: '#f5f3ff', ink: '#7c3aed', title: 'Net Banking', sub: 'All major banks supported' },
    ].map(m => (
      <button type="button" key={m.key} className="fv-method" onClick={onPay} disabled={!online}
        title={online ? 'Opens the secure checkout' : 'Online payment is switched off for this school'}>
        <span className="fv-method__i" style={{ background: m.bg, color: m.ink }}><Glyph name={m.glyph} size={19} /></span>
        <span className="fv-method__b"><strong>{m.title}</strong><span>{m.sub}</span></span>
        <Icon name="chevronRight" size={16} />
      </button>
    ))}
    <button type="button" className="fv-method" onClick={onOffline}>
      <span className="fv-method__i" style={{ background: '#fffbeb', color: '#b45309' }}><Glyph name="receipt" size={19} /></span>
      <span className="fv-method__b"><strong>Paid another way</strong><span>Cash, cheque or bank transfer</span></span>
      <Icon name="chevronRight" size={16} />
    </button>
  </RailCard>
);

export const SecureNote = ({ gateway }) => (
  <div className="fv-safe">
    <span className="fv-safe__i"><Glyph name="shield" size={26} /></span>
    <span>
      <strong>Secure Payments</strong>
      <span>Your payments are encrypted and secure.{gateway && gateway !== 'none' ? ` Powered by ${gateway[0].toUpperCase()}${gateway.slice(1)}.` : ''}</span>
    </span>
  </div>
);

export const RecentPayment = ({ payment, sym, onOpen }) => {
  if (!payment) return null;
  const l = modeLook(payment.paymentMode);
  return (
    <RailCard title="Recent Payment">
      <button type="button" className="fv-recent" style={{ width: '100%', cursor: onOpen ? 'pointer' : 'default', textAlign: 'left' }}
        onClick={onOpen} disabled={!onOpen}>
        <span className="fv-recent__i"><Glyph name="checkCircle" size={30} /></span>
        <span className="fv-recent__b">
          <strong>{money(payment.amount, { sym, space: true })}</strong>
          <span>{fmtDate(payment.paymentDate)}</span>
          <span>{l.label} payment</span>
        </span>
        {onOpen ? <Icon name="chevronRight" size={16} /> : null}
      </button>
    </RailCard>
  );
};

/* ── Receipt preview ──────────────────────────────────────────────────────── */

/**
 * What the printed receipt says, shown beside the list so a family can check
 * one without opening it. The printable copy still comes from the server —
 * this is a preview, and says so by offering to open the real one.
 */
export function ReceiptPreview({ payment, student, school, year, sym, onClose, onOpen, onPrint, onShare }) {
  if (!payment) return null;
  const lines = (payment.lines || []).filter(l => l.feeName);
  return (
    <RailCard title="Receipt Preview" action={onClose ? <button type="button" className="fe-ibtn" onClick={onClose} aria-label="Close preview"><Icon name="close" size={16} /></button> : null}>
      <div className="fv-receipt">
        <div className="fv-receipt__top">
          <span className="fv-receipt__who">
            <Mark glyph="gradCap" tone="indigo" size={34} />
            <span>
              <strong>{school?.name || 'School'}</strong>
              {school?.address ? <span>{school.address}</span> : null}
              {school?.phone ? <span>Phone: {school.phone}</span> : null}
            </span>
          </span>
          <span className="fv-receipt__tag">
            <b>Fee Receipt</b>
            <span>{payment.receiptNumber || 'Not issued yet'}</span>
            <span className={`fe-badge fe-b-${payment.paymentStatus === 'completed' ? 'green' : payment.paymentStatus === 'pending' ? 'amber' : 'slate'}`}>
              {payment.paymentStatus === 'completed' ? 'Paid' : payment.paymentStatus === 'pending' ? 'Awaiting approval' : 'Cancelled'}
            </span>
          </span>
        </div>
        <hr />
        <dl>
          <dt>Student Name</dt><dd>{student?.name || '—'}</dd>
          {student?.admissionNumber ? <><dt>Admission No.</dt><dd>{student.admissionNumber}</dd></> : null}
          {student?.className ? <><dt>Class</dt><dd>{student.className}</dd></> : null}
          {student?.sectionName ? <><dt>Section</dt><dd>{student.sectionName}</dd></> : null}
          <dt>Academic Year</dt><dd>{year?.yearName || '—'}</dd>
        </dl>
        <hr />
        <table>
          <thead><tr><th>Fee Details</th><th>Amount ({sym})</th></tr></thead>
          <tbody>
            {lines.length ? lines.map((l, i) => (
              <tr key={`${l.feeName}-${i}`}><td>{l.feeName}</td><td>{money(l.amount, { sym: '' })}</td></tr>
            )) : <tr><td>Fee payment</td><td>{money(payment.amount, { sym: '' })}</td></tr>}
          </tbody>
        </table>
        <div className="fv-receipt__tot"><span>Total Paid</span><span>{money(payment.amount, { sym, space: true })}</span></div>
        <hr />
        <dl>
          <dt>Payment Mode</dt><dd>{modeLook(payment.paymentMode).label}</dd>
          {payment.transactionRef ? <><dt>Transaction ID</dt><dd>{payment.transactionRef}</dd></> : null}
          <dt>Payment Date</dt><dd>{fmtDate(payment.paymentDate)}</dd>
        </dl>
        <p className="fv-receipt__note">This is a computer generated receipt and does not require a signature.</p>
        <div className="fv-receipt__ty"><b>Thank You!</b><span>For your continued support</span></div>
      </div>
      <div className="fv-racts">
        <Btn variant="primary" icon="download" onClick={onOpen} disabled={payment.paymentStatus !== 'completed'}>Download</Btn>
        <Btn variant="outline" icon="send" onClick={onShare} disabled={payment.paymentStatus !== 'completed'}>Share</Btn>
        <Btn variant="outline" icon="externalLink" onClick={onPrint} disabled={payment.paymentStatus !== 'completed'}>Print</Btn>
      </div>
    </RailCard>
  );
}

/* ── Small readings of the fee book ───────────────────────────────────────── */

/** Every month a family can still pay, oldest first. */
export const payableMonths = (months = []) =>
  months.filter(m => m.payStatus !== 'cancelled' && (m.payable != null ? m.payable : m.amountDue) > 0.004);

/** Months that are charged and unpaid — what "pending" means on these screens. */
export const pendingMonths = (months = []) => payableMonths(months).filter(m => m.chargedAmount > 0);

/** Months fully settled. */
export const paidMonths = (months = []) => months.filter(m => m.payStatus === 'paid');

export const summarise = (months = []) => {
  const pending = pendingMonths(months);
  const paid = paidMonths(months);
  return {
    total: months.length,
    paid: paid.length, pending: pending.length,
    paidAmount: paid.reduce((s, m) => s + m.amountPaid, 0),
    pendingAmount: payableMonths(months).reduce((s, m) => s + (m.payable != null ? m.payable : m.amountDue), 0),
    paidRange: monthRange(paid.map(m => m.monthKey)),
    pendingRange: monthRange(pending.map(m => m.monthKey)),
  };
};

export { plural };
