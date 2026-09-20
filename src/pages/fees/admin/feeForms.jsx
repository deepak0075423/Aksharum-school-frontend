/**
 * Every dialog and drawer the admin Fees screens open. Each posts exactly the
 * field names its controller reads — the old pages sent `amount` / `isOptional`
 * to a handler expecting `defaultAmount` / `type`, so creating a fee head,
 * category, concession or fine rule silently saved something else.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/fees.api';
import { Modal, Confirm } from '../../../components/ui/index';
import { Drawer, DrawerFoot } from '../../admin/listParts';
import MonthPicker, { dueCount, amountFor, keysFor, unpaidMonths } from '../../../components/fees/MonthPicker';
import Icon from '../../../components/ui/icons';
import {
  Btn, Select, Search, Toggle, Badge, StatusBadge, DUE_STATUS, STATUS, Avatar, Mark, money, fmtDate, fmtDateTime, isoDay,
  FREQUENCY, FREQUENCY_OPTIONS, MODE, COUNTER_MODES, ELIGIBILITY, FINE_APPLIES, yearOptions, parseCsv, saveFile, toCsv,
  openHtmlWindow, plural, Empty, Loading, Glyph, DateInput, Note,
} from './feeUI';

const err = (e) => toast.error(e?.message || 'Something went wrong');

/* ── Small form pieces ────────────────────────────────────────────────────── */

export const Field = ({ label, children, hint, required }) => (
  <label className="fe-field">
    <span className="fe-field__label">{label}{required ? <span style={{ color: '#dc2626' }}> *</span> : null}</span>
    {children}
    {hint ? <span className="fe-form__hint">{hint}</span> : null}
  </label>
);
export const Input = (props) => <input className="fe-input" {...props} />;
export const Money = ({ value, onChange, disabled, sym = '₹', ...rest }) => (
  <span className="fe-affix fe-affix--pre"><span>{sym}</span>
    <input className="fe-input" type="number" min="0" step="0.01" value={value} disabled={disabled}
      onChange={e => onChange(e.target.value)} {...rest} /></span>
);
export const SegCtl = ({ value, onChange, items }) => (
  <div className="fe-segctl">
    {items.map(i => <button key={i.value} type="button" className={value === i.value ? 'is-on' : ''} onClick={() => onChange(i.value)}>{i.label}</button>)}
  </div>
);
const Foot = ({ onClose, saving, label = 'Save', form, disabled, onClick, cancelLabel = 'Cancel' }) => (
  <>
    <Btn variant="outline" onClick={onClose}>{cancelLabel}</Btn>
    <Btn variant="primary" type={form ? 'submit' : 'button'} form={form} onClick={onClick} disabled={saving || disabled}>
      {saving ? 'Saving…' : label}
    </Btn>
  </>
);
const Title = ({ glyph, tone, title, sub }) => (
  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <Mark glyph={glyph} tone={tone} size={40} />
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.25 }}>
      <span>{title}</span>{sub ? <small style={{ fontSize: '.8rem', fontWeight: 400, color: '#64748b' }}>{sub}</small> : null}
    </span>
  </span>
);

/** Look students up by name / admission number, with what each owes. */
function StudentPicker({ value, onChange, yearId }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  useEffect(() => {
    if (value) return undefined;
    const t = setTimeout(async () => {
      try {
        const res = await api.getStudentFeeList({ q: q || undefined, limit: 8, academicYearId: yearId });
        setHits(res?.data?.rows || []);
      } catch { setHits([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, value, yearId]);
  if (value) {
    return (
      <div className="fe-picked">
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar name={value.name} />
          <span><b>{value.name}</b><br /><small style={{ color: '#64748b' }}>{[value.admissionNumber, value.classLabel].filter(Boolean).join(' · ')}</small></span>
        </span>
        <Btn variant="link" onClick={() => onChange(null)}>Change</Btn>
      </div>
    );
  }
  return (
    <div>
      <Search value={q} onChange={setQ} placeholder="Search by name or admission no." />
      {hits.length ? (
        <div className="fe-stuhit">
          {hits.map(s => (
            <button key={s._id} type="button" onClick={() => onChange(s)}>
              <Avatar name={s.name} size={28} />
              <span style={{ flex: 1 }}><b>{s.name}</b> <small style={{ color: '#64748b' }}>{[s.admissionNumber, s.classLabel].filter(Boolean).join(' · ')}</small></span>
              {s.due > 0 ? <small style={{ color: '#dc2626' }}>{money(s.due)} due</small> : <small style={{ color: '#15803d' }}>No dues</small>}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ── Record payment ───────────────────────────────────────────────────────── */

/**
 * Counter collection. Shows what the picked student owes before anyone types
 * an amount, offers only the modes Settings allows, and — when "auto generate
 * receipt" is on — opens the receipt as soon as it is saved.
 */
export function RecordPaymentDialog({ open, onClose, onDone, meta, student: preset }) {
  const [student, setStudent] = useState(preset || null);
  const [card, setCard] = useState(null);
  // Collect by months (the default when the student has a fee book), or a
  // free amount. `count` is how many unpaid months are ticked, in order.
  const [byMonths, setByMonths] = useState(true);
  const [count, setCount] = useState(0);
  const [form, setForm] = useState({ amount: '', paymentMode: '', feeHeadId: '', transactionRef: '', paymentDate: isoDay(new Date()), remarks: '' });
  const [saving, setSaving] = useState(false);
  const modes = meta?.settings?.acceptedModes || COUNTER_MODES;
  const sym = meta?.settings?.currencySymbol || '₹';
  useEffect(() => { if (open) { setStudent(preset || null); setForm(f => ({ ...f, amount: '', transactionRef: '', remarks: '', paymentMode: modes[0] || 'cash', paymentDate: isoDay(new Date()) })); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!student) { setCard(null); return; }
    api.getStudentFeeCard(student._id).then(r => {
      const c = r?.data || null;
      setCard(c);
      const months = c?.schedule?.months || [];
      setByMonths(unpaidMonths(months).length > 0 || (c?.schedule?.otherDue || 0) > 0);
      setCount(dueCount(months));           // start on what is due now
    }).catch(() => setCard(null));
  }, [student]);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const due = card?.totals?.due || 0;
  const sched = card?.schedule;
  const monthsMode = byMonths && sched && (unpaidMonths(sched.months).length > 0 || sched.otherDue > 0);
  const monthsTotal = monthsMode ? amountFor(sched.months, sched.otherDue, count) : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!student) return toast.error('Choose a student');
    if (monthsMode ? !(monthsTotal > 0) : !(Number(form.amount) > 0)) return toast.error(monthsMode ? 'Tick at least one month' : 'Enter an amount above 0');
    setSaving(true);
    const body = monthsMode
      ? { ...form, amount: undefined, feeHeadId: undefined, studentId: student._id, months: keysFor(sched.months, count) }
      : { ...form, studentId: student._id, feeHeadId: form.feeHeadId || undefined };
    try {
      if (meta?.settings?.autoGenerateReceipt !== false) {
        let paid = null;
        await openHtmlWindow(async () => {
          const res = await api.recordPayment(body);
          paid = res?.data;
          return api.getReceiptsHtml([paid._id]);
        });
        toast.success(`Payment recorded — receipt ${paid?.receiptNumber || ''}`);
      } else {
        const res = await api.recordPayment(body);
        toast.success(`Payment recorded — receipt ${res?.data?.receiptNumber || ''}`);
      }
      onDone?.();
      onClose();
    } catch (e2) { err(e2); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={600}
      title={<Title glyph="wallet" tone="indigo" title="Record Payment" sub="Counter collection — cash, card, UPI, cheque" />}
      footer={<Foot onClose={onClose} saving={saving} label="Record Payment" form="fe-pay-form" />}>
      <form id="fe-pay-form" className="fe-form" onSubmit={submit}>
        <Field label="Student" required><StudentPicker value={student} onChange={setStudent} yearId={meta?.year?._id} /></Field>
        {card ? (
          <div className="fe-owed">
            <div><small>Total fees</small><b>{money(card.totals.total, { sym })}</b></div>
            <div><small>Paid</small><b>{money(card.totals.paid, { sym })}</b></div>
            <div><small>Due now</small><b style={{ color: due > 0 ? '#dc2626' : '#15803d' }}>{money(due, { sym })}</b></div>
          </div>
        ) : null}
        {monthsMode ? (
          <Field label="Months to collect" hint={<>Ticking a month includes every unpaid month before it. <button type="button" className="fe-link" onClick={() => setByMonths(false)}>Enter an amount instead</button></>}>
            <MonthPicker months={sched.months} otherDue={sched.otherDue} count={count} onCount={setCount} sym={sym} maxHeight={220} />
          </Field>
        ) : sched && unpaidMonths(sched.months).length ? (
          <span className="fe-form__hint"><button type="button" className="fe-link" onClick={() => setByMonths(true)}>Collect by months instead</button></span>
        ) : null}
        <div className="fe-form__row">
          {monthsMode ? (
            <Field label="Amount" hint={`${count} month${count === 1 ? '' : 's'}${sched.otherDue > 0 ? ' + other charges' : ''}`}>
              <Money value={monthsTotal} onChange={() => {}} disabled sym={sym} />
            </Field>
          ) : (
            <Field label="Amount" required hint={due > 0 ? <button type="button" className="fe-link" onClick={() => set('amount')(String(due))}>Collect the full {money(due, { sym })}</button> : null}>
              <Money value={form.amount} onChange={set('amount')} sym={sym} placeholder="0" />
            </Field>
          )}
          <Field label="Payment Mode" required>
            <Select value={form.paymentMode} onChange={set('paymentMode')} options={modes.map(m => ({ value: m, label: MODE[m] || m }))} />
          </Field>
        </div>
        {meta?.settings?.allowPartialPayments === false && due > 0 ? (
          <span className="fe-form__hint">Part payments are switched off in Settings — the office must collect the full amount due.</span>
        ) : null}
        <div className="fe-form__row">
          {monthsMode ? (
            <Field label="Receipt lines"><span className="fe-form__hint" style={{ margin: 0 }}>One line per month, naming its fee heads.</span></Field>
          ) : (
            <Field label="Fee Head" hint="Printed on the receipt. Leave blank for a general payment.">
              <Select value={form.feeHeadId} onChange={set('feeHeadId')} all="General fee payment"
                options={(meta?.heads || []).filter(h => h.isActive).map(h => ({ value: h._id, label: h.name }))} />
            </Field>
          )}
          <Field label="Payment Date"><DateInput value={form.paymentDate} max={isoDay(new Date())} onChange={set('paymentDate')} /></Field>
        </div>
        <div className="fe-form__row">
          <Field label="Reference No." hint="UPI / cheque / card slip number"><Input value={form.transactionRef} onChange={set('transactionRef')} /></Field>
          <Field label="Remarks"><Input value={form.remarks} onChange={set('remarks')} /></Field>
        </div>
      </form>
    </Modal>
  );
}

/* ── Student fee drawer ───────────────────────────────────────────────────── */

/**
 * Put a student on a different fee structure — a class change part-way through
 * the year, or a correction. What the old structure charged stays on their
 * account: it is the record of what they were billed. The new one charges from
 * the month chosen here.
 */
export function MoveStructureDialog({ open, onClose, onDone, studentId, student, current, structures = [], year, sym = '₹' }) {
  const [form, setForm] = useState({ structureId: '', fromMonth: '' });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const months = yearMonthKeys(year);
  useEffect(() => {
    if (!open) return;
    setResult(null);
    const now = monthKeyOf(new Date());
    setForm({ structureId: '', fromMonth: months.includes(now) ? now : (months[0] || '') });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.moveStudentStructure(studentId, form);
      setResult(r?.data || {});
      onDone?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const options = structures.filter(st => String(st._id) !== String(current?._id))
    .map(st => ({ value: st._id, label: st.label ? `${st.name} — ${st.label}` : st.name }));

  return (
    <Modal open={open} onClose={onClose} maxWidth={520}
      title={<Title glyph="layers" tone="indigo" title="Change fee structure" sub={student?.name} />}
      footer={result
        ? <Btn variant="primary" onClick={onClose}>Done</Btn>
        : <Foot onClose={onClose} saving={busy} label="Move student" onClick={submit} disabled={!form.structureId || !form.fromMonth} />}>
      <div className="fe-form">
        {!result ? (
          <>
            <div className="fe-kv"><span>On now</span><b>{current?.name || 'No structure'}</b></div>
            {options.length ? (
              <>
                <Select label="Move to" value={form.structureId} onChange={v => setForm(f => ({ ...f, structureId: v }))} all="Choose a structure…" options={options} />
                <Select label="Charge from" value={form.fromMonth} onChange={v => setForm(f => ({ ...f, fromMonth: v }))}
                  options={months.map(m => ({ value: m, label: monthName(m) }))} />
                <Note glyph="info" tone="blue" title="What this does">
                  Everything the old structure charged stays on the account — pay it or cancel it there.
                  The new structure charges from {monthName(form.fromMonth)} onwards, and anything already due by today is posted straight away.
                </Note>
              </>
            ) : (
              <Note glyph="alertTri" tone="amber" title="No other structure to move to">
                This academic year has no other structure switched on. Create one first, in Fees → Structures.
              </Note>
            )}
          </>
        ) : (
          <Note glyph="checkCircle" tone="green" title="Moved">
            Now on <b>{result.structure}</b> from {monthName(result.fromMonth)}
            {result.from ? <>, off <b>{result.from}</b></> : null}.
            {result.charged > 0 ? ` ${money(result.charged, { sym, space: true })} charged for the months due so far.` : ' Nothing was due yet.'}
          </Note>
        )}
      </div>
    </Modal>
  );
}

export function StudentDrawer({ studentId, onClose, onChanged, meta, onCollect, concessions = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState('');
  const [fine, setFine] = useState({ ruleId: '', days: '', remarks: '' });
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [moving, setMoving] = useState(false);
  const [reminders, setReminders] = useState(null);
  const sym = meta?.settings?.currencySymbol || '₹';
  const load = () => {
    if (!studentId) return;
    setLoading(true);
    api.getStudentFeeCard(studentId, { academicYearId: meta?.year?._id }).then(r => setData(r?.data || null)).catch(err).finally(() => setLoading(false));
  };
  useEffect(() => { setData(null); setPick(''); setFine({ ruleId: '', days: '', remarks: '' }); load(); }, [studentId]); // eslint-disable-line react-hooks/exhaustive-deps
  // When this family was last chased, so the office is not sending blind.
  const loadReminders = React.useCallback(() => {
    if (!studentId) return;
    api.reminderHistory({ studentId, limit: 3 }).then(r => setReminders(r?.data || [])).catch(() => setReminders([]));
  }, [studentId]);
  useEffect(() => { setReminders(null); loadReminders(); }, [loadReminders]);

  const remind = async () => {
    setBusy(true);
    try {
      const r = await api.sendFeeReminders({ studentIds: [studentId] });
      toast.success(r?.data?.sent ? 'Reminder sent to the family' : 'Nothing is owed — no reminder sent');
      loadReminders();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  const assign = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await api.assignStudentConcession(studentId, { concessionId: pick });
      toast.success(r?.data?.credited > 0 ? `Concession applied — ${money(r.data.credited, { sym })} taken off` : 'Concession assigned — it will apply when fees are charged');
      setPick(''); load(); onChanged?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const remove = async () => {
    try {
      const r = await api.removeStudentConcession(studentId, removing._id);
      toast.success(r?.data?.reversed > 0 ? `Concession withdrawn — ${money(r.data.reversed, { sym })} added back` : 'Concession withdrawn');
      setRemoving(null); load(); onChanged?.();
    } catch (e) { err(e); }
  };
  const charge = async () => {
    setBusy(true);
    try {
      const r = await api.chargeFine(studentId, fine);
      toast.success(`Fine of ${money(r?.data?.amount, { sym })} charged`);
      setFine({ ruleId: '', days: '', remarks: '' }); load(); onChanged?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  const openReceipt = (id) => openHtmlWindow(() => api.getReceiptsHtml([id])).catch(err);

  const rule = data?.otherFines?.find(r => r._id === fine.ruleId);
  const held = new Set((data?.concessions || []).map(c => String(c.concessionId)));
  const t = data?.totals;
  return (
    <Drawer open={!!studentId} onClose={onClose}>
      <div className="ldrawer__head">
        <Avatar name={data?.student?.name || '…'} size={52} />
        <div className="ldrawer__id">
          <h3>{data?.student?.name || 'Loading…'}</h3>
          <p>{[data?.student?.admissionNumber, data?.student?.classLabel, data?.year?.yearName].filter(Boolean).join(' · ')}</p>
        </div>
        <button type="button" className="lact" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className="ldrawer__body">
        {loading && !data ? <Loading rows={6} /> : data ? (
          <>
            <div className="fe-dsec">
              <h4>This year</h4>
              <div className="fe-dtotals">
                <div><small>Charged</small><b>{money(t.charged, { sym })}</b></div>
                <div><small>Concession</small><b>{money(t.waived, { sym })}</b></div>
                <div><small>Fines</small><b>{money(t.fine, { sym })}</b></div>
                <div><small>Total fees</small><b>{money(t.total, { sym })}</b></div>
                <div><small>Paid</small><b style={{ color: '#15803d' }}>{money(t.paid, { sym })}</b></div>
                <div><small>{t.advance > 0 ? 'Advance' : 'Due'}</small><b style={{ color: t.due > 0 ? '#dc2626' : '#15803d' }}>{money(t.advance > 0 ? t.advance : t.due, { sym })}</b></div>
              </div>
              <p className="fe-form__hint" style={{ marginTop: 10 }}>
                {data.structure ? <>Charged from <b>{data.structure.name}</b>.</> : 'No fee structure has charged this student yet.'}
                {' '}
                {/* A class change mid-year, or a correction. What the old
                    structure charged stays — it is what they were billed. */}
                <button type="button" className="fe-link" onClick={() => setMoving(true)}>
                  {data.structure ? 'Move to another structure' : 'Put them on a structure'}
                </button>
              </p>
            </div>

            <div className="fe-dsec">
              <h4>Concessions</h4>
              {data.concessions.length ? (
                <table className="fe-mini"><tbody>
                  {data.concessions.map(c => (
                    <tr key={c._id}>
                      <td><b style={{ color: '#0f172a' }}>{c.name}</b><br /><small>{c.concessionType === 'percentage' ? `${c.value}%` : money(c.value, { sym })} · since {fmtDate(c.since)}</small></td>
                      <td>{money(c.credited, { sym })}<br /><button type="button" className="fe-link" style={{ color: '#dc2626', fontSize: '.8rem' }} onClick={() => setRemoving(c)}>Withdraw</button></td>
                    </tr>
                  ))}
                </tbody></table>
              ) : <p className="fe-form__hint">None.</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <div style={{ flex: 1 }}>
                  <Select value={pick} onChange={setPick} all="Give a concession…"
                    options={concessions.filter(c => c.status === 'active' && !held.has(String(c._id))).map(c => ({ value: c._id, label: `${c.name} (${c.concessionType === 'percentage' ? `${c.value}%` : money(c.value, { sym })})` }))} />
                </div>
                <Btn variant="soft" onClick={assign} disabled={!pick || busy}>Assign</Btn>
              </div>
            </div>

            <div className="fe-dsec">
              <h4>Reminders</h4>
              {reminders === null ? <p className="fe-form__hint">Looking…</p>
                : reminders.length ? (
                  <table className="fe-mini"><tbody>
                    {reminders.map(r => (
                      <tr key={r._id}>
                        <td><b style={{ color: '#0f172a' }}>{r.monthKey || 'Balance'}</b><br />
                          <small>{r.auto ? 'Sent automatically' : `Sent by ${r.by}`}</small></td>
                        <td>{fmtDate(r.at)}<br /><small>{money(r.amount, { sym })}</small></td>
                      </tr>
                    ))}
                  </tbody></table>
                ) : <p className="fe-form__hint">This family has never been reminded.</p>}
              <div style={{ marginTop: 10 }}>
                <Btn variant="soft" icon="send" onClick={remind} disabled={busy || !(t?.due > 0)}>
                  {t?.due > 0 ? 'Send a reminder now' : 'Nothing owed'}
                </Btn>
              </div>
            </div>

            <div className="fe-dsec">
              <h4>Charge a fine</h4>
              {data.otherFines.length ? (
                <div className="fe-form" style={{ gap: 8 }}>
                  <Select value={fine.ruleId} onChange={v => setFine(f => ({ ...f, ruleId: v }))} all="Choose a fine…"
                    options={data.otherFines.map(r => ({ value: r._id, label: `${r.name} — ${r.fineType === 'flat' ? money(r.flatAmount, { sym }) : `${money(r.perDayAmount, { sym })} per day`}` }))} />
                  {rule?.fineType === 'per_day' ? <Input type="number" min="1" placeholder="Number of days" value={fine.days} onChange={e => setFine(f => ({ ...f, days: e.target.value }))} /> : null}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Input placeholder="Note (optional)" value={fine.remarks} onChange={e => setFine(f => ({ ...f, remarks: e.target.value }))} />
                    <Btn variant="soft" onClick={charge} disabled={!fine.ruleId || busy}>Charge</Btn>
                  </div>
                </div>
              ) : <p className="fe-form__hint">No "other fine" rules are switched on. Add one in Fine Rules.</p>}
            </div>

            <div className="fe-dsec">
              <h4>Payments</h4>
              {data.payments.length ? (
                <table className="fe-mini">
                  <thead><tr><th>Date</th><th>Mode</th><th>Status</th><th>Amount</th></tr></thead>
                  <tbody>
                    {data.payments.map(p => (
                      <tr key={p._id}>
                        <td>{fmtDate(p.date)}<br /><small>{p.receiptNumber || 'No receipt'}</small></td>
                        <td>{MODE[p.mode] || p.mode}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td>{money(p.amount, { sym })}{p.status === 'completed' ? <><br /><button type="button" className="fe-link" style={{ fontSize: '.78rem' }} onClick={() => openReceipt(p._id)}>Receipt</button></> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="fe-form__hint">No payments this year.</p>}
            </div>

            <div className="fe-dsec">
              <h4>Ledger</h4>
              {data.ledger.length ? (
                <table className="fe-mini">
                  <thead><tr><th>Date</th><th>Entry</th><th>Amount</th></tr></thead>
                  <tbody>
                    {data.ledger.slice(0, 25).map(e => (
                      <tr key={e._id}>
                        <td>{fmtDate(e.at)}</td>
                        <td>{e.description}</td>
                        <td style={{ color: e.entryType === 'credit' ? '#15803d' : '#0f172a' }}>{e.entryType === 'credit' ? '−' : '+'}{money(e.amount, { sym })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : <p className="fe-form__hint">Nothing on the ledger this year.</p>}
            </div>
          </>
        ) : <Empty title="Could not load this student" />}
      </div>
      <DrawerFoot>
        <Btn variant="outline" onClick={onClose}>Close</Btn>
        <Btn variant="primary" icon="plus" onClick={() => onCollect?.(data?.student ? { ...data.student, _id: studentId } : null)} disabled={!data}>Collect Fee</Btn>
      </DrawerFoot>
      <MoveStructureDialog open={moving} onClose={() => setMoving(false)} studentId={studentId}
        student={data?.student} current={data?.structure} structures={meta?.structures || []} year={meta?.year} sym={sym}
        onDone={() => { load(); onChanged?.(); }} />
      <Confirm open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} title="Withdraw concession"
        confirmLabel="Withdraw"
        message={removing ? `Withdraw "${removing.name}" from ${data?.student?.name}? The ${money(removing.credited, { sym })} it took off is added back to what they owe.` : ''} />
    </Drawer>
  );
}

/* ── Fee structure ────────────────────────────────────────────────────────── */

const blankStructure = { name: '', academicYearId: '', level: 'class', classId: '', sectionId: '', dueDay: '', effectiveFrom: '', description: '', isActive: true, items: {} };

/* Month windows — the same rules as services/feeSchedule on the server. */
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthKeyOf = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const addMonth = (k, n) => monthKeyOf(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)) - 1 + n, 1));
export const monthName = (k) => (k ? `${MON_SHORT[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}` : '—');
const STEP = { recurring: 1, quarterly: 3, half_yearly: 6, yearly: 0, one_time: 0 };
export const isPeriodicType = (t) => (STEP[t] || 0) > 0;
/** Every month of an academic year, first to last. */
export function yearMonthKeys(year) {
  if (!year?.startDate || !year?.endDate) return [];
  const first = monthKeyOf(year.startDate), last = monthKeyOf(year.endDate);
  const out = [];
  for (let k = first, i = 0; k <= last && i < 36; k = addMonth(k, 1), i++) out.push(k);
  return out;
}
/** How many times a head charges inside its window. */
export function chargeCount(type, start, end) {
  const step = STEP[type] || 0;
  if (!start) return 0;
  if (!step) return 1;
  let n = 0;
  for (let k = start; k <= (end || start) && n < 36; k = addMonth(k, step)) n++;
  return n;
}
const EVERY = { recurring: 'every month', quarterly: 'every 3 months', half_yearly: 'every 6 months' };

/**
 * Create, edit, or copy a structure. `source` is the row being edited (mode
 * edit) or copied (mode copy). Fixed heads charge their own amount; only a
 * variable head is priced here.
 *
 * Every head is charged in a window of months inside the structure's
 * academic year: a monthly, quarterly or half-yearly head asks when it starts
 * and its last month (never past the year's last month); a one-time or yearly
 * head asks for the month it is charged in. Once a structure has charged
 * month by month, a head's start is fixed — its months are already numbered
 * on the ledger — but its last month and amount can still change.
 */
export function StructureDialog({ open, onClose, onSaved, meta, source, mode = 'create', years = [], classesFor }) {
  const [form, setForm] = useState(blankStructure);
  const [classes, setClasses] = useState(meta?.classes || []);
  const [saving, setSaving] = useState(false);
  const sym = meta?.settings?.currencySymbol || '₹';
  const year = years.find(y => y._id === form.academicYearId) || meta?.year || null;
  const monthsOfYear = yearMonthKeys(year);
  const firstMonth = monthsOfYear[0], lastMonth = monthsOfYear[monthsOfYear.length - 1];
  const lockedStarts = mode === 'edit' && source?.periodic;

  useEffect(() => {
    if (!open) return;
    if (source) {
      const items = {};
      (source.items || []).forEach(i => {
        if (!i.isActive) return;
        const keepWindow = mode === 'edit';
        items[i.feeHead._id] = { amount: String(i.amount), startMonth: keepWindow ? i.startMonth : null, endMonth: keepWindow ? i.endMonth : null, _id: i._id };
      });
      setForm({
        name: mode === 'copy' ? `${source.name} (copy)` : source.name,
        academicYearId: mode === 'edit' ? source.academicYear?._id : (meta?.year?._id || ''),
        level: source.level, classId: source.class?._id || '', sectionId: source.section?._id || '',
        dueDay: source.dueDay || '', effectiveFrom: source.effectiveFrom ? isoDay(source.effectiveFrom) : '',
        description: source.description || '', isActive: mode === 'edit' ? source.isActive : true, items,
      });
    } else setForm({ ...blankStructure, academicYearId: meta?.year?._id || '' });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  // Classes belong to a year: reload them when the year changes.
  useEffect(() => {
    if (!open || !form.academicYearId) return;
    if (form.academicYearId === meta?.year?._id) { setClasses(meta?.classes || []); return; }
    (classesFor ? classesFor(form.academicYearId) : api.getFeesMeta({ academicYearId: form.academicYearId }).then(r => r?.data?.classes))
      .then(c => setClasses(c || [])).catch(() => setClasses([]));
  }, [open, form.academicYearId]); // eslint-disable-line react-hooks/exhaustive-deps

  // A window left empty (a copy, a new head, a year change) runs the whole
  // year — from the charging-start month when there is one.
  const defaultStart = (() => {
    const eff = form.effectiveFrom ? form.effectiveFrom.slice(0, 7) : null;
    return eff && monthsOfYear.includes(eff) ? eff : firstMonth;
  })();
  const windowOf = (h, it) => {
    let start = it.startMonth && monthsOfYear.includes(it.startMonth) ? it.startMonth : defaultStart;
    let end = isPeriodicType(h.type) ? (it.endMonth && monthsOfYear.includes(it.endMonth) ? it.endMonth : lastMonth) : start;
    if (end < start) end = start;
    return { start, end };
  };

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const setItem = (id, patch) => setForm(f => ({ ...f, items: { ...f.items, [id]: { ...f.items[id], ...patch } } }));
  const heads = (meta?.heads || []).filter(h => h.isActive || form.items[h._id] !== undefined);
  const cls = classes.find(c => c._id === form.classId);
  const lines = heads.filter(h => form.items[h._id]).map(h => {
    const it = form.items[h._id];
    const w = windowOf(h, it);
    const n = chargeCount(h.type, w.start, w.end);
    return { h, it, w, n, subtotal: (Number(it.amount) || 0) * n };
  });
  const total = lines.reduce((s, l) => s + l.subtotal, 0);
  const toggleHead = (h) => setForm(f => {
    const items = { ...f.items };
    if (items[h._id] !== undefined) delete items[h._id]; else items[h._id] = { amount: String(h.defaultAmount || 0), startMonth: null, endMonth: null };
    return { ...f, items };
  });
  const charged = mode === 'edit' && source?.demandGeneratedAt;

  const submit = async (e) => {
    e.preventDefault();
    const items = lines.map(({ h, it, w }) => ({
      ...(mode === 'edit' && it._id ? { _id: it._id } : {}),
      feeHead: h._id, amount: Number(it.amount) || 0, startMonth: w.start, endMonth: w.end,
    }));
    const body = {
      name: form.name, level: form.level, classId: form.level === 'class' ? form.classId : undefined,
      sectionId: form.level === 'section' ? form.sectionId : undefined, dueDay: form.dueDay || null,
      effectiveFrom: form.effectiveFrom || null, description: form.description, isActive: form.isActive,
      items: mode === 'edit' ? items.map(i => {
        const was = source.items.find(x => x.feeHead._id === i.feeHead);
        return was ? { ...i, _id: was._id } : i;
      }) : items,
    };
    if (mode !== 'edit') body.academicYearId = form.academicYearId;
    if (!body.name.trim()) return toast.error('Give the structure a name');
    if (!items.length) return toast.error('Add at least one fee head');
    setSaving(true);
    try {
      if (mode === 'edit') await api.updateFeeStructure(source._id, body);
      else await api.createFeeStructure(body);
      toast.success(mode === 'edit' ? 'Structure saved' : 'Structure created');
      onSaved?.(); onClose();
    } catch (e2) { err(e2); } finally { setSaving(false); }
  };

  const monthOpts = (from, to) => monthsOfYear.filter(k => (!from || k >= from) && (!to || k <= to)).map(k => ({ value: k, label: monthName(k) }));

  return (
    <Modal open={open} onClose={onClose} maxWidth={780}
      title={<Title glyph="gradCap" tone="indigo" title={mode === 'edit' ? 'Edit Fee Structure' : mode === 'copy' ? 'Copy Fee Structure' : 'Create Fee Structure'} sub="What one class or section is charged, head by head, month by month" />}
      footer={<Foot onClose={onClose} saving={saving} label={mode === 'edit' ? 'Save Changes' : 'Create Structure'} form="fe-st-form" />}>
      <form id="fe-st-form" className="fe-form" onSubmit={submit}>
        <div className="fe-form__row">
          <Field label="Structure Name" required><Input value={form.name} onChange={set('name')} placeholder="e.g. Class 10 - Regular" /></Field>
          <Field label="Academic Year" required hint={year ? `Runs ${monthName(firstMonth)} – ${monthName(lastMonth)}; no fee head can go past ${monthName(lastMonth)}.` : null}>
            <Select value={form.academicYearId} onChange={set('academicYearId')} options={yearOptions(years)} disabled={mode === 'edit'} />
          </Field>
        </div>
        <div className="fe-form__row--3 fe-form__row">
          <Field label="Applies To">
            <SegCtl value={form.level} onChange={v => !charged && setForm(f => ({ ...f, level: v, sectionId: '' }))} items={[{ value: 'class', label: 'Whole class' }, { value: 'section', label: 'One section' }]} />
          </Field>
          <Field label="Class" required>
            <Select value={form.classId} onChange={v => setForm(f => ({ ...f, classId: v, sectionId: '' }))} all="Choose a class" disabled={!!charged}
              options={classes.map(c => ({ value: c._id, label: c.className }))} />
          </Field>
          {form.level === 'section' ? (
            <Field label="Section" required>
              <Select value={form.sectionId} onChange={set('sectionId')} all="Choose a section" disabled={!cls || !!charged}
                options={(cls?.sections || []).map(s => ({ value: s._id, label: `Section ${s.sectionName}` }))} />
            </Field>
          ) : <span />}
        </div>
        {charged ? <span className="fe-form__hint">Fees have already been charged from this structure, so who it applies to is fixed.</span> : null}
        <div className="fe-form__row--3 fe-form__row">
          <Field label="Due Day (of month)" hint="Fees fall due on this day each month"><Input type="number" min="1" max="31" value={form.dueDay} onChange={set('dueDay')} placeholder="e.g. 10" /></Field>
          <Field label="Charging Starts" hint="Upcoming until this date"><DateInput value={form.effectiveFrom} onChange={set('effectiveFrom')} placeholder="When charged" /></Field>
          <Field label="Status"><span className="fe-togglerow"><Toggle checked={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} />{form.isActive ? 'Active' : 'Inactive'}</span></Field>
        </div>
        <Field label="Fee Heads" required>
          {heads.length ? (
            <div className="fe-headpick fe-headpick--months">
              {heads.map(h => {
                const it = form.items[h._id];
                const on = it !== undefined;
                const fixed = h.amountType === 'fixed';
                const line = lines.find(l => l.h._id === h._id);
                const periodic = isPeriodicType(h.type);
                const startLocked = lockedStarts && !!it?._id;
                return (
                  <div key={h._id} className={`fe-headpick__row${on ? ' is-on' : ''}`}>
                    <input type="checkbox" className="fe-check" checked={on} onChange={() => toggleHead(h)} />
                    <span><b>{h.name}</b><small>{FREQUENCY[h.type] || h.type} · {fixed ? 'Fixed amount' : 'Variable'}
                      {h.isActive === false ? <em style={{ color: '#b45309', fontStyle: 'normal' }}> · switched off, charging nothing</em> : null}</small></span>
                    <Money value={on ? it.amount : (h.defaultAmount || 0)} disabled={!on || fixed} sym={sym}
                      onChange={v => setItem(h._id, { amount: v })} />
                    {on && line ? (
                      <div className="fe-window">
                        {periodic ? (
                          <>
                            <label>From
                              <Select compact value={line.w.start} disabled={startLocked} onChange={v => setItem(h._id, { startMonth: v, ...(line.w.end < v ? { endMonth: v } : {}) })}
                                options={monthOpts(null, lastMonth)} />
                            </label>
                            <label>Last month
                              <Select compact value={line.w.end} onChange={v => setItem(h._id, { endMonth: v })} options={monthOpts(line.w.start, lastMonth)} />
                            </label>
                            <span className="fe-window__sum">
                              {line.n} charge{line.n === 1 ? '' : 's'}, {EVERY[h.type]} · <b>{money(line.subtotal, { sym })}</b>
                              {startLocked ? <em> · start fixed — already charged</em> : null}
                            </span>
                          </>
                        ) : (
                          <>
                            <label>Charged in
                              <Select compact value={line.w.start} disabled={startLocked} onChange={v => setItem(h._id, { startMonth: v, endMonth: v })} options={monthOpts(null, lastMonth)} />
                            </label>
                            <span className="fe-window__sum">once · <b>{money(line.subtotal, { sym })}</b></span>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : <span className="fe-form__hint">No fee heads yet — add them on the Fee Heads tab first.</span>}
        </Field>
        <div className="fe-total"><span>Total for the year</span><span>{money(total, { sym, space: true })}</span></div>
        <Field label="Description"><textarea className="fe-textarea" value={form.description} onChange={set('description')} /></Field>
      </form>
    </Modal>
  );
}

export function StructureDrawer({ row, onClose, onEdit, onAct, meta }) {
  const sym = meta?.settings?.currencySymbol || '₹';
  if (!row) return null;
  return (
    <Drawer open={!!row} onClose={onClose}>
      <div className="ldrawer__head">
        <Mark glyph="gradCap" tone="indigo" size={52} />
        <div className="ldrawer__id">
          <h3>{row.name}</h3>
          <p>{row.academicYear?.yearName} · {row.class?.className || '—'} · {row.level === 'section' ? `Section ${row.section?.sectionName}` : 'All Sections'}</p>
          <div className="ldrawer__tags"><StatusBadge status={row.status} /></div>
        </div>
        <button type="button" className="lact" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className="ldrawer__body">
        <div className="fe-dsec">
          <h4>Fee heads</h4>
          <table className="fe-mini">
            <thead><tr><th>Head</th><th>Months</th><th>Each</th><th>Year</th></tr></thead>
            <tbody>
              {row.items.filter(i => i.isActive).map(i => (
                <tr key={i._id}>
                  <td>{i.feeHead.name}<br /><small>{FREQUENCY[i.feeHead.type] || '—'}</small></td>
                  <td>{isPeriodicType(i.feeHead.type) ? `${monthName(i.startMonth)} – ${monthName(i.endMonth)}` : monthName(i.startMonth)}<br /><small>{i.charges} charge{i.charges === 1 ? '' : 's'}</small></td>
                  <td>{money(i.amount, { sym })}</td>
                  <td>{money(i.amount * (i.charges || 0), { sym })}</td>
                </tr>
              ))}
              <tr><td><b>Total for the year</b></td><td /><td /><td><b>{money(row.totalAmount, { sym })}</b></td></tr>
            </tbody>
          </table>
          {!row.periodic && row.demandGeneratedAt ? (
            <p className="fe-form__hint" style={{ marginTop: 10, color: '#b45309' }}>
              This structure was charged before month-by-month charging existed: each head was charged once, as one amount.
              Generate demand again to charge the months since — the earlier charge counts as each head's first month.
            </p>
          ) : null}
        </div>
        <div className="fe-dsec">
          <h4>Charging</h4>
          <div className="fe-kv"><span>Due day</span><b>{row.dueDay ? `Day ${row.dueDay} of each month` : 'Not set'}</b></div>
          <div className="fe-kv"><span>Charging starts</span><b>{row.effectiveFrom ? fmtDate(row.effectiveFrom) : 'When demand is generated'}</b></div>
          <div className="fe-kv"><span>Demand generated</span><b>{row.demandGeneratedAt ? fmtDateTime(row.demandGeneratedAt) : 'Not yet'}</b></div>
          <div className="fe-kv"><span>Students charged</span><b>{row.charged.students} · {money(row.charged.amount, { sym })}</b></div>
          {row.chargedThrough ? <div className="fe-kv"><span>Charged up to</span><b>{monthName(row.chargedThrough)}</b></div> : null}
          {/* Why a month is missing from the accounts, said plainly. */}
          {row.deactivatedAt ? <div className="fe-kv"><span>Switched off</span><b>{fmtDate(row.deactivatedAt)} — nothing has been charged since</b></div> : null}
          {row.skippedMonths?.length ? (
            <div className="fe-kv"><span>Months never charged</span><b>{row.skippedMonths.map(monthName).join(', ')}</b></div>
          ) : null}
          {row.description ? <p className="fe-form__hint" style={{ marginTop: 10 }}>{row.description}</p> : null}
        </div>
      </div>
      <DrawerFoot>
        <Btn variant="outline" icon="pencil" onClick={() => onEdit(row)}>Edit</Btn>
        <Btn variant="outline" onClick={() => onAct(row.isActive ? 'deactivate' : 'activate', row)}>{row.isActive ? 'Switch Off' : 'Switch On'}</Btn>
        <Btn variant="primary" onClick={() => onAct('demand', row)} disabled={!row.isActive}>Generate Demand</Btn>
      </DrawerFoot>
    </Drawer>
  );
}

/* ── Undoing a payment ────────────────────────────────────────────────────── */

/**
 * Cancel a payment that should never have been recorded — a counter mistake, a
 * cheque that bounced. The receipt number is kept (receipts are never reused),
 * the amount goes back on the account as owed, and the months it covered open
 * again. The family is told, with the reason typed here.
 */
export function VoidPaymentDialog({ payment, onClose, onDone, sym = '₹' }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason(''); }, [payment?._id]);
  if (!payment) return null;
  const submit = async () => {
    setBusy(true);
    try {
      await api.voidPayment(payment._id, { reason: reason.trim() });
      toast.success('Payment cancelled');
      onDone?.(); onClose();
    } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <Modal open={!!payment} onClose={onClose} maxWidth={500}
      title={<Title glyph="xCircle" tone="red" title="Cancel this payment" sub={`${money(payment.amount, { sym, space: true })} · ${payment.student?.name || ''}`} />}
      /* "Cancel" beside "Cancel payment" would be two opposite buttons with the same word. */
      footer={<Foot onClose={onClose} saving={busy} cancelLabel="Keep payment" label="Cancel payment" onClick={submit} disabled={!reason.trim()} />}>
      <div className="fe-form">
        <div className="fe-impact">
          <div><small>Receipt</small><b>{payment.receiptNumber || '—'}</b></div>
          <div><small>Paid by</small><b>{MODE[payment.mode] || payment.mode}</b></div>
        </div>
        <Field label="Why is it being cancelled?" required hint="The family sees this. Say enough that the office can answer if they ring.">
          <textarea className="fe-input" rows={3} maxLength={200} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Cheque returned unpaid, entered against the wrong student…" />
        </Field>
        <Note glyph="alertTri" tone="amber" title="What this does">
          {money(payment.amount, { sym, space: true })} goes back onto the account as owed and the months it settled become payable again.
          The receipt number stays with the cancelled payment, so nothing is reused. Refunding the money itself is a separate matter for the office.
        </Note>
      </div>
    </Modal>
  );
}

/* ── A structure's lifecycle ──────────────────────────────────────────────── */

/** A radio row: the choice, what it means, picked by clicking anywhere on it. */
const Choice = ({ on, onPick, title, children, tone }) => (
  <label className={`fe-choice${on ? ' is-on' : ''}${tone ? ` fe-choice--${tone}` : ''}`}>
    <input type="radio" checked={on} onChange={onPick} />
    <span><b>{title}</b>{children ? <small>{children}</small> : null}</span>
  </label>
);

/**
 * Switching a structure off or on, charging it, and deleting it — each one
 * says what it is about to do to real accounts before it does it, because
 * none of them can be undone by clicking the other way.
 *
 * `action` is 'deactivate' | 'activate' | 'demand' | 'delete'.
 */
export function StructureLifecycleDialog({ action, row, onClose, onDone, sym = '₹' }) {
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [cancelUnpaid, setCancelUnpaid] = useState(false);
  const [catchUp, setCatchUp] = useState(false);
  const [newFrom, setNewFrom] = useState('start');

  useEffect(() => {
    if (!row) return;
    setImpact(null); setResult(null); setCancelUnpaid(false); setCatchUp(false); setNewFrom('start');
    api.structureImpact(row._id).then(r => setImpact(r?.data || null)).catch(() => setImpact({}));
  }, [row?._id, action]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) return null;
  const where = `${row.class?.className || 'this class'}${row.level === 'section' ? ` · Section ${row.section?.sectionName}` : ''}`;
  const missed = impact?.missedMonths || [];
  const canDelete = impact ? (impact.charged || 0) <= 0 : false;

  const run = async () => {
    setBusy(true);
    try {
      if (action === 'delete') {
        await api.deleteFeeStructure(row._id);
        toast.success(`"${row.name}" deleted`);
        onDone?.(); onClose();
      } else if (action === 'demand') {
        const r = await api.generateDemand(row._id, { newFrom });
        setResult(r?.data || {});
        onDone?.();
      } else if (action === 'deactivate') {
        const r = await api.toggleFeeStructure(row._id, { cancelUnpaid });
        setResult({ ...(r?.data || {}), off: true });
        onDone?.();
      } else {
        const r = await api.toggleFeeStructure(row._id, { catchUp });
        setResult({ ...(r?.data || {}), on: true });
        onDone?.();
      }
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  const head = {
    deactivate: { glyph: 'pause', tone: 'red', title: 'Switch this structure off', sub: row.name },
    activate: { glyph: 'bolt', tone: 'green', title: 'Switch this structure back on', sub: row.name },
    demand: { glyph: 'users', tone: 'indigo', title: 'Charge the months so far', sub: row.name },
    delete: { glyph: 'trash', tone: 'red', title: 'Delete this structure', sub: row.name },
  }[action] || {};
  const label = { deactivate: 'Switch off', activate: 'Switch on', demand: 'Charge students', delete: 'Delete structure' }[action];

  return (
    <Modal open={!!row} onClose={onClose} maxWidth={560}
      title={<Title glyph={head.glyph} tone={head.tone} title={head.title} sub={head.sub} />}
      footer={result
        ? <Btn variant="primary" onClick={onClose}>Done</Btn>
        : <Foot onClose={onClose} saving={busy} label={label} onClick={run} disabled={!impact || (action === 'delete' && !canDelete)} />}>
      <div className="fe-form">
        {!impact ? <Loading rows={3} /> : null}

        {impact && !result ? (
          <div className="fe-impact">
            <div><small>Students on it now</small><b>{plural(impact.onRoll || 0, 'student')}</b></div>
            <div><small>Charged so far</small><b>{money(impact.charged, { sym, space: true })}</b></div>
            <div><small>Of that, still unpaid</small><b className={impact.unpaid > 0 ? 'is-due' : ''}>{money(impact.unpaid, { sym, space: true })}</b></div>
            <div><small>Still to charge this year</small><b>{impact.monthsToCome ? `${money(impact.toCome, { sym, space: true })} · ${plural(impact.monthsToCome, 'month')}` : 'Nothing left'}</b></div>
          </div>
        ) : null}

        {/* Switching off. */}
        {impact && !result && action === 'deactivate' ? (
          <>
            <p className="fe-form__hint" style={{ margin: 0 }}>
              Nobody new is resolved to it and no further month is charged. What it has already charged stays on each student’s account — that is the record of what they were billed.
            </p>
            <Choice on={!cancelUnpaid} onPick={() => setCancelUnpaid(false)} title="Keep the charges already made">
              Families still owe the {money(impact.unpaid, { sym, space: true })} outstanding. Use this when a structure is simply ending.
            </Choice>
            <Choice on={cancelUnpaid} onPick={() => setCancelUnpaid(true)} tone="red" title="Cancel the unpaid charges as well">
              Writes off {money(impact.unpaid, { sym, space: true })} across {plural(impact.students || 0, 'student')}. Money already paid is untouched, and so is any month a family has paid for while the office has yet to approve it. Use this when the structure was a mistake.
            </Choice>
          </>
        ) : null}

        {/* Switching back on. */}
        {impact && !result && action === 'activate' ? (
          missed.length ? (
            <>
              <p className="fe-form__hint" style={{ margin: 0 }}>
                It was off for {plural(missed.length, 'month')} — {missed.map(monthName).join(', ')}.
              </p>
              <Choice on={!catchUp} onPick={() => setCatchUp(false)} title="Start again from this month">
                Those months are never charged. Charging carries on from now.
              </Choice>
              <Choice on={catchUp} onPick={() => setCatchUp(true)} tone="amber" title="Charge the months it was off for too">
                Every student on it is billed for {missed.map(monthName).join(', ')} as well, on top of this month.
              </Choice>
            </>
          ) : (
            <p className="fe-form__hint" style={{ margin: 0 }}>
              Charging resumes: anything due up to this month is posted now, and each new month as it arrives.
            </p>
          )
        ) : null}

        {/* Charging. */}
        {impact && !result && action === 'demand' ? (
          <>
            <p className="fe-form__hint" style={{ margin: 0 }}>
              Charges every student in {where} for each month that has come and is not charged yet, and applies their concessions. After this, each new month is charged as it arrives.
            </p>
            <Choice on={newFrom === 'start'} onPick={() => setNewFrom('start')} title="From the start of each fee head">
              A student joining mid-year is still billed for the earlier months of the year.
            </Choice>
            <Choice on={newFrom === 'current'} onPick={() => setNewFrom('current')} title="From this month, for students new to this structure">
              Students already being charged carry on unchanged; someone added now starts from {monthName(monthKeyOf(new Date()))}.
            </Choice>
          </>
        ) : null}

        {/* Deleting. */}
        {impact && !result && action === 'delete' ? (
          canDelete ? (
            <Note glyph="alertTri" tone="amber" title="This cannot be undone">
              It has charged nobody, so deleting it leaves no trace on any account. Its class and section assignments go with it.
            </Note>
          ) : (
            <Note glyph="alertTri" tone="red" title="This one cannot be deleted">
              It has already charged {money(impact.charged, { sym, space: true })}, so it is the record of what those families were billed for. Switch it off instead.
            </Note>
          )
        ) : null}

        {/* What happened. */}
        {result ? (
          <Note glyph="checkCircle" tone="green" title="Done">
            {action === 'demand' ? (
              <>
                {plural(result.generated || 0, 'student')} charged {money(result.amount, { sym, space: true })}
                {result.concession > 0 ? `, less ${money(result.concession, { sym, space: true })} in concessions` : ''}
                {result.newStudents ? ` · ${plural(result.newStudents, 'student')} new to this structure` : ''}.
                {result.skipped?.otherStructure ? <><br />{plural(result.skipped.otherStructure, 'student')} skipped — already charged by another structure.</> : null}
                {result.skipped?.sectionStructure ? <><br />{plural(result.skipped.sectionStructure, 'student')} skipped — their section has a structure of its own.</> : null}
              </>
            ) : null}
            {action === 'deactivate' ? (
              <>Switched off.{result.cancelled ? ` ${money(result.cancelled.amount, { sym, space: true })} of unpaid charges cancelled for ${plural(result.cancelled.students, 'student')}.` : ' What it charged stays on the accounts it charged.'}</>
            ) : null}
            {action === 'activate' ? (
              <>
                Switched on.
                {result.skipped?.length ? ` ${plural(result.skipped.length, 'month')} it was off for will never be charged.` : ''}
                {result.charged?.entries ? ` ${plural(result.charged.students, 'student')} charged ${money(result.charged.amount, { sym, space: true })} for the months due so far.` : ''}
              </>
            ) : null}
          </Note>
        ) : null}
      </div>
    </Modal>
  );
}

/* ── Fee head ─────────────────────────────────────────────────────────────── */

/**
 * Switching a fee head off or on. Off is not cosmetic: the head stops charging
 * in every structure that carries it, so this says which structures and how
 * much before it happens. What it charged before stays on those accounts.
 */
export function HeadLifecycleDialog({ action, row, onClose, onDone, sym = '₹' }) {
  const [impact, setImpact] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [catchUp, setCatchUp] = useState(false);

  useEffect(() => {
    if (!row) return;
    setImpact(null); setResult(null); setCatchUp(false);
    api.feeHeadImpact(row._id).then(r => setImpact(r?.data || null)).catch(() => setImpact({}));
  }, [row?._id, action]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!row) return null;
  const off = action === 'deactivate';
  const missed = impact?.missedMonths || [];
  const used = impact?.structures || [];

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.toggleFeeHead(row._id, off ? {} : { catchUp });
      setResult(r?.data || {});
      onDone?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={!!row} maxWidth={560} onClose={onClose}
      title={<Title glyph={off ? 'pause' : 'bolt'} tone={off ? 'red' : 'green'}
        title={off ? 'Switch this fee head off' : 'Switch this fee head back on'} sub={row.name} />}
      footer={result
        ? <Btn variant="primary" onClick={onClose}>Done</Btn>
        : <Foot onClose={onClose} saving={busy} label={off ? 'Switch off' : 'Switch on'} onClick={run} disabled={!impact} />}>
      <div className="fe-form">
        {!impact ? <Loading rows={3} /> : null}

        {impact && !result ? (
          <div className="fe-impact">
            <div><small>Structures charging it</small><b>{used.length ? plural(used.length, 'structure') : 'None'}</b></div>
            <div><small>Students charged so far</small><b>{plural(impact.students || 0, 'student')}</b></div>
            <div><small>Charged so far</small><b>{money(impact.charged, { sym, space: true })}</b></div>
            <div><small>Still to charge this year</small><b>
              {impact.monthsToCome ? `${money(impact.toCome, { sym, space: true })} \u00b7 ${plural(impact.monthsToCome, 'month')}` : 'Nothing left'}
            </b></div>
          </div>
        ) : null}

        {impact && !result && off ? (
          <>
            <p className="fe-form__hint" style={{ margin: 0 }}>
              It stops charging everywhere at once{used.length ? ` — including ${used.slice(0, 3).join(', ')}${used.length > 3 ? ` and ${used.length - 3} more` : ''}` : ''}.
              What it has already charged stays on those accounts; nobody is refunded by switching a head off.
            </p>
            <Note glyph="alertTri" tone="amber" title="It also leaves the pickers">
              A switched-off head cannot be added to a new structure. One already on a structure stays there, charging nothing, until you take it off or switch it back on.
            </Note>
          </>
        ) : null}

        {impact && !result && !off ? (
          missed.length ? (
            <>
              <p className="fe-form__hint" style={{ margin: 0 }}>
                It was off for {plural(missed.length, 'month')} — {missed.map(monthName).join(', ')}.
              </p>
              <Choice on={!catchUp} onPick={() => setCatchUp(false)} title="Start charging again from this month">
                Those months are never charged for this head.
              </Choice>
              <Choice on={catchUp} onPick={() => setCatchUp(true)} tone="amber" title="Charge the months it was off for too">
                Every student on a structure carrying it is billed for {missed.map(monthName).join(', ')} as well.
              </Choice>
            </>
          ) : (
            <p className="fe-form__hint" style={{ margin: 0 }}>
              Charging resumes: anything due up to this month is posted now, and each new month as it arrives.
            </p>
          )
        ) : null}

        {result ? (
          <Note glyph="checkCircle" tone="green" title="Done">
            {off ? 'Switched off — it charges nothing from now on.' : (
              <>
                Switched on.
                {result.skipped?.length ? ` ${plural(result.skipped.length, 'month')} it was off for will never be charged.` : ''}
                {result.charged?.entries ? ` ${plural(result.charged.students, 'student')} charged ${money(result.charged.amount, { sym, space: true })} for the months due so far.` : ' Nothing was outstanding to post.'}
              </>
            )}
          </Note>
        ) : null}
      </div>
    </Modal>
  );
}


export function HeadDialog({ open, onClose, onSaved, meta, head }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const editing = !!head?._id;   // a head without an id is a pre-filled new one
  useEffect(() => {
    if (!open) return;
    setForm(head ? {
      name: head.name, categoryId: head.category?._id || '', type: head.type, amountType: head.amountType || 'fixed',
      defaultAmount: String(head.defaultAmount ?? ''), description: head.description || '', isActive: head.isActive,
    } : { name: '', categoryId: '', type: 'recurring', amountType: 'fixed', defaultAmount: '', description: '', isActive: true });
  }, [open, head]);
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, defaultAmount: form.defaultAmount === '' ? 0 : Number(form.defaultAmount) };
      if (editing) await api.updateFeeHead(head._id, body); else await api.createFeeHead(body);
      toast.success(editing ? 'Fee head saved' : 'Fee head added');
      onSaved?.(); onClose();
    } catch (e2) { err(e2); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} maxWidth={560}
      title={<Title glyph="layers" tone="indigo" title={editing ? 'Edit Fee Head' : 'Add Fee Head'} sub="One component a fee structure can charge" />}
      footer={<Foot onClose={onClose} saving={saving} label={editing ? 'Save Changes' : 'Add Fee Head'} form="fe-head-form" />}>
      <form id="fe-head-form" className="fe-form" onSubmit={submit}>
        <Field label="Fee Head Name" required><Input value={form.name || ''} onChange={set('name')} placeholder="e.g. Tuition Fee" /></Field>
        <div className="fe-form__row">
          <Field label="Category">
            <Select value={form.categoryId} onChange={set('categoryId')} all="No category"
              options={(meta?.categories || []).filter(c => c.isActive || c._id === form.categoryId).map(c => ({ value: c._id, label: c.name }))} />
          </Field>
          <Field label="Frequency" required hint="How often a structure charges it">
            <Select value={form.type} onChange={set('type')} options={FREQUENCY_OPTIONS} />
          </Field>
        </div>
        <div className="fe-form__row">
          <Field label="Type" hint={form.amountType === 'fixed' ? 'Every structure charges the default amount' : 'Each structure sets its own amount'}>
            <SegCtl value={form.amountType} onChange={set('amountType')} items={[{ value: 'fixed', label: 'Fixed Amount' }, { value: 'variable', label: 'Variable' }]} />
          </Field>
          <Field label="Default Amount"><Money value={form.defaultAmount ?? ''} onChange={set('defaultAmount')} sym={meta?.settings?.currencySymbol} /></Field>
        </div>
        <Field label="Description"><textarea className="fe-textarea" value={form.description || ''} onChange={set('description')} /></Field>
        <Field label="Status"><span className="fe-togglerow"><Toggle checked={form.isActive} onChange={set('isActive')} />{form.isActive ? 'Active' : 'Inactive'}</span></Field>
      </form>
    </Modal>
  );
}

const IMPORT_COLUMNS = ['name', 'category', 'frequency', 'amount', 'type', 'description'];

export function ImportHeadsDialog({ open, onClose, onDone }) {
  const [rows, setRows] = useState([]);
  const [file, setFile] = useState('');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => { if (open) { setRows([]); setFile(''); setResult(null); } }, [open]);
  const read = (f) => {
    if (!f) return;
    setFile(f.name);
    const r = new FileReader();
    r.onload = () => {
      const table = parseCsv(String(r.result || ''));
      if (table.length < 2) { toast.error('The file has no rows under its header'); setRows([]); return; }
      const head = table[0].map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
      const idx = (k) => head.findIndex(h => h === k || (k === 'amount' && h.startsWith('default')) || (k === 'type' && h === 'amounttype'));
      setRows(table.slice(1).map(cells => Object.fromEntries(IMPORT_COLUMNS.map(k => [k, (cells[idx(k)] ?? '').trim()]))));
    };
    r.readAsText(f);
  };
  const submit = async () => {
    setSaving(true);
    try {
      const res = await api.importFeeHeads(rows.map(r => ({ ...r, amountType: r.type })));
      setResult(res?.data);
      if (res?.data?.created) { toast.success(`${plural(res.data.created, 'fee head')} imported`); onDone?.(); }
    } catch (e) { err(e); } finally { setSaving(false); }
  };
  const template = () => saveFile(toCsv(IMPORT_COLUMNS.map(k => ({ key: k, label: k })), [
    { name: 'Tuition Fee', category: 'Academic', frequency: 'Monthly', amount: 12000, type: 'Fixed', description: 'Monthly tuition' },
    { name: 'Admission Fee', category: 'One Time Charges', frequency: 'One Time', amount: 15000, type: 'Fixed', description: '' },
  ]), 'fee-heads-template.csv');
  return (
    <Modal open={open} onClose={onClose} maxWidth={640}
      title={<Title glyph="upload" tone="indigo" title="Import Fee Heads" sub="From a CSV file — one head per row" />}
      footer={result ? <Btn variant="primary" onClick={onClose}>Done</Btn> : <Foot onClose={onClose} saving={saving} label={`Import ${rows.length || ''}`} onClick={submit} disabled={!rows.length} />}>
      <div className="fe-form">
        <p className="fe-form__hint" style={{ margin: 0 }}>Columns: <b>name</b>, category, frequency (Monthly, Quarterly, Half-Yearly, Yearly, One Time), amount, type (Fixed / Variable), description. A category that does not exist yet is created. Names already in use are skipped.</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <label className="fe-btn fe-btn--outline" style={{ cursor: 'pointer' }}>
            <Icon name="upload" size={17} />Choose CSV
            <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={e => read(e.target.files?.[0])} />
          </label>
          <span className="fe-form__hint" style={{ margin: 0 }}>{file || 'No file chosen'}</span>
          <Btn variant="link" onClick={template} style={{ marginLeft: 'auto' }}>Download template</Btn>
        </div>
        {rows.length && !result ? (
          <div className="fe-headpick" style={{ maxHeight: 240 }}>
            <table className="fe-mini"><thead><tr><th>Name</th><th>Category</th><th>Frequency</th><th>Amount</th></tr></thead>
              <tbody>{rows.slice(0, 50).map((r, i) => <tr key={i}><td>{r.name || <span style={{ color: '#dc2626' }}>missing</span>}</td><td>{r.category || '—'}</td><td>{r.frequency || 'Monthly'}</td><td>{r.amount || 0}</td></tr>)}</tbody>
            </table>
          </div>
        ) : null}
        {result ? (
          <div className="fe-note fe-note--blue"><span className="fe-note__i"><Glyph name="info" size={24} /></span>
            <div className="fe-note__b">
              {plural(result.created, 'fee head')} created · {plural(result.skipped.length, 'row')} skipped · {plural(result.errors.length, 'error')}
              {result.errors.length ? <ul>{result.errors.slice(0, 8).map(e => <li key={e.line}>Line {e.line}: {e.message}</li>)}</ul> : null}
              {result.skipped.length ? <ul>{result.skipped.slice(0, 8).map(e => <li key={e.line}>Line {e.line}: {e.name} {e.reason}</li>)}</ul> : null}
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

/* ── Category ─────────────────────────────────────────────────────────────── */

export function CategoryDialog({ open, onClose, onSaved, category }) {
  const [form, setForm] = useState({ name: '', description: '', isActive: true });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setForm(category ? { name: category.name, description: category.description || '', isActive: category.isActive } : { name: '', description: '', isActive: true }); }, [open, category]);
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (category) {
        await api.updateFeeCategory(category._id, { name: form.name, description: form.description });
        if (form.isActive !== category.isActive) await api.toggleFeeCategory(category._id);
      } else await api.createFeeCategory(form);
      toast.success(category ? 'Category saved' : 'Category added');
      onSaved?.(); onClose();
    } catch (e2) { err(e2); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} maxWidth={520}
      title={<Title glyph="grid" tone="indigo" title={category ? 'Edit Category' : 'Add Category'} sub="A group of fee heads" />}
      footer={<Foot onClose={onClose} saving={saving} label={category ? 'Save Changes' : 'Add Category'} form="fe-cat-form" />}>
      <form id="fe-cat-form" className="fe-form" onSubmit={submit}>
        <Field label="Category Name" required><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Academic Fees" /></Field>
        <Field label="Description"><textarea className="fe-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></Field>
        <Field label="Status"><span className="fe-togglerow"><Toggle checked={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} />{form.isActive ? 'Active' : 'Inactive'}</span></Field>
      </form>
    </Modal>
  );
}

/* ── Concession ───────────────────────────────────────────────────────────── */

export function ConcessionDialog({ open, onClose, onSaved, meta, concession }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setForm(concession ? {
      name: concession.name, concessionType: concession.concessionType, value: String(concession.value),
      applicableTo: concession.applicableTo, applicableHeads: concession.applicableHeads.map(h => String(h._id)),
      eligibility: concession.eligibility, validFrom: isoDay(concession.validFrom), validTo: isoDay(concession.validTo),
      description: concession.description || '', isActive: concession.isActive,
    } : { name: '', concessionType: 'percentage', value: '', applicableTo: 'all', applicableHeads: [], eligibility: 'selected',
      validFrom: isoDay(meta?.year?.startDate), validTo: isoDay(meta?.year?.endDate), description: '', isActive: true });
  }, [open, concession]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const toggleHead = (id) => setForm(f => ({ ...f, applicableHeads: f.applicableHeads.includes(id) ? f.applicableHeads.filter(x => x !== id) : [...f.applicableHeads, id] }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { ...form, validFrom: form.validFrom || null, validTo: form.validTo || null };
      if (concession) await api.updateConcession(concession._id, body); else await api.createConcession(body);
      toast.success(concession ? 'Concession saved' : 'Concession added');
      onSaved?.(); onClose();
    } catch (e2) { err(e2); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} maxWidth={620}
      title={<Title glyph="percent" tone="green" title={concession ? 'Edit Concession' : 'Add Concession'} sub="A scholarship, discount or waiver" />}
      footer={<Foot onClose={onClose} saving={saving} label={concession ? 'Save Changes' : 'Add Concession'} form="fe-con-form" />}>
      <form id="fe-con-form" className="fe-form" onSubmit={submit}>
        <Field label="Concession Name" required><Input value={form.name || ''} onChange={set('name')} placeholder="e.g. Merit Scholarship" /></Field>
        <div className="fe-form__row">
          <Field label="Type"><SegCtl value={form.concessionType} onChange={set('concessionType')} items={[{ value: 'percentage', label: 'Percentage' }, { value: 'fixed', label: 'Fixed Amount' }]} /></Field>
          <Field label={form.concessionType === 'percentage' ? 'Discount (%)' : 'Discount Amount'} required
            hint={form.concessionType === 'fixed' ? 'Taken once off the fee heads it covers' : null}>
            {form.concessionType === 'percentage'
              ? <span className="fe-affix"><input className="fe-input" type="number" min="0" max="100" value={form.value || ''} onChange={set('value')} /><span>%</span></span>
              : <Money value={form.value || ''} onChange={set('value')} sym={meta?.settings?.currencySymbol} />}
          </Field>
        </div>
        <div className="fe-form__row">
          <Field label="For" hint="Picks the students the assign dialog offers">
            <Select value={form.eligibility} onChange={set('eligibility')} options={Object.entries(ELIGIBILITY).map(([value, label]) => ({ value, label }))} />
          </Field>
          <Field label="Covers">
            <SegCtl value={form.applicableTo} onChange={set('applicableTo')} items={[{ value: 'all', label: 'All fee heads' }, { value: 'specific_heads', label: 'Chosen heads' }]} />
          </Field>
        </div>
        {form.applicableTo === 'specific_heads' ? (
          <div className="fe-picker" style={{ maxHeight: 180 }}>
            {(meta?.heads || []).map(h => (
              <label key={h._id}><input type="checkbox" className="fe-check" checked={form.applicableHeads?.includes(String(h._id))} onChange={() => toggleHead(String(h._id))} /><span>{h.name}</span><small>{FREQUENCY[h.type]}</small></label>
            ))}
          </div>
        ) : null}
        <div className="fe-form__row">
          <Field label="Valid From"><DateInput value={form.validFrom || ''} onChange={set('validFrom')} /></Field>
          <Field label="Valid To"><DateInput value={form.validTo || ''} min={form.validFrom || undefined} onChange={set('validTo')} placeholder="No end date" /></Field>
        </div>
        <Field label="Description"><textarea className="fe-textarea" value={form.description || ''} onChange={set('description')} /></Field>
        <Field label="Status"><span className="fe-togglerow"><Toggle checked={form.isActive} onChange={set('isActive')} />{form.isActive ? 'Active' : 'Inactive'}</span></Field>
      </form>
    </Modal>
  );
}

/**
 * Give a concession to many students at once. The list is narrowed by the
 * scheme's "for" group where the school records it (girls, siblings, new
 * admissions); students already holding it are shown ticked and locked.
 */
export function AssignConcessionDialog({ open, onClose, onDone, meta, concession, concessions = [] }) {
  const [cid, setCid] = useState('');
  const [q, setQ] = useState('');
  const [classId, setClassId] = useState('');
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const sym = meta?.settings?.currencySymbol || '₹';
  useEffect(() => { if (open) { setCid(concession?._id || ''); setPicked(new Set()); setQ(''); setClassId(''); } }, [open, concession]);
  useEffect(() => {
    if (!open || !cid) { setData(null); return undefined; }
    const t = setTimeout(() => {
      api.getConcessionCandidates(cid, { q: q || undefined, classId: classId || undefined, academicYearId: meta?.year?._id })
        .then(r => setData(r?.data || null)).catch(err);
    }, 250);
    return () => clearTimeout(t);
  }, [open, cid, q, classId]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = data?.rows || [];
  const free = rows.filter(r => !r.held);
  const allOn = free.length > 0 && free.every(r => picked.has(r._id));
  const scheme = concessions.find(c => String(c._id) === String(cid)) || concession;
  const submit = async () => {
    setSaving(true);
    try {
      const r = await api.assignConcession(cid, { studentIds: [...picked] });
      const d = r?.data || {};
      toast.success(`${plural(d.assigned, 'student')} given ${scheme?.name || 'the concession'}${d.credited ? ` · ${money(d.credited, { sym })} taken off` : ''}`);
      onDone?.(); onClose();
    } catch (e) { err(e); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} maxWidth={620}
      title={<Title glyph="users" tone="blue" title="Assign Concession" sub="Applied at once to fees already charged, and to every later demand" />}
      footer={<Foot onClose={onClose} saving={saving} label={`Assign to ${picked.size || ''}`} onClick={submit} disabled={!picked.size || !cid} />}>
      <div className="fe-form">
        {!concession ? (
          <Field label="Concession">
            <Select value={cid} onChange={v => { setCid(v); setPicked(new Set()); }} all="Choose a concession"
              options={concessions.filter(c => c.status !== 'inactive').map(c => ({ value: c._id, label: c.name }))} />
          </Field>
        ) : null}
        {cid ? (
          <>
            {data ? <span className="fe-form__hint" style={{ margin: 0 }}>
              {data.narrowed ? `Showing ${ELIGIBILITY[data.eligibility].toLowerCase()} only.` : `This scheme is for ${ELIGIBILITY[data.eligibility].toLowerCase()} — the school does not record that, so every student is listed; pick them yourself.`}
            </span> : null}
            <div className="fe-form__row">
              <Search value={q} onChange={setQ} placeholder="Search by name or admission no." />
              <Select value={classId} onChange={setClassId} all="All Classes" options={(meta?.classes || []).map(c => ({ value: c._id, label: c.className }))} />
            </div>
            <div className="fe-picker">
              {free.length ? (
                <label style={{ background: '#f8fafc' }}>
                  <input type="checkbox" className="fe-check" checked={allOn} onChange={() => setPicked(allOn ? new Set() : new Set([...picked, ...free.map(r => r._id)]))} />
                  <span><b>Select all {free.length}</b></span><small>{picked.size} picked</small>
                </label>
              ) : null}
              {rows.map(r => (
                <label key={r._id} className={r.held ? 'is-held' : ''}>
                  <input type="checkbox" className="fe-check" checked={r.held || picked.has(r._id)} disabled={r.held}
                    onChange={() => setPicked(p => { const n = new Set(p); if (n.has(r._id)) n.delete(r._id); else n.add(r._id); return n; })} />
                  <span>{r.name} <small>{r.admissionNumber}</small></span>
                  <small>{r.held ? 'Already has it' : r.classLabel}</small>
                </label>
              ))}
              {data && !rows.length ? <Empty title="No students match" /> : null}
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}

export function ConcessionDrawer({ row, onClose, onEdit, onAssign, meta, onChanged }) {
  const [data, setData] = useState(null);
  const [removing, setRemoving] = useState(null);
  const sym = meta?.settings?.currencySymbol || '₹';
  const load = () => row && api.getConcessionBeneficiaries(row._id, { academicYearId: meta?.year?._id }).then(r => setData(r?.data || null)).catch(err);
  useEffect(() => { setData(null); load(); }, [row?._id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!row) return null;
  const remove = async () => {
    try {
      await api.removeStudentConcession(removing.studentId, removing._id);
      toast.success('Concession withdrawn'); setRemoving(null); load(); onChanged?.();
    } catch (e) { err(e); }
  };
  return (
    <Drawer open={!!row} onClose={onClose}>
      <div className="ldrawer__head">
        <Mark glyph="percent" tone="green" size={52} />
        <div className="ldrawer__id">
          <h3>{row.name}</h3>
          <p>{row.concessionType === 'percentage' ? `${row.value}% off` : `${money(row.value, { sym })} off`} · {ELIGIBILITY[row.eligibility]}</p>
          <div className="ldrawer__tags"><StatusBadge status={row.status} /></div>
        </div>
        <button type="button" className="lact" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className="ldrawer__body">
        <div className="fe-dsec">
          <h4>Scheme</h4>
          <div className="fe-kv"><span>Covers</span><b>{row.applicableTo === 'all' ? 'All fee heads' : row.applicableHeads.map(h => h.name).join(', ')}</b></div>
          <div className="fe-kv"><span>Valid</span><b>{row.validFrom || row.validTo ? `${fmtDate(row.validFrom)} – ${fmtDate(row.validTo)}` : 'No end date'}</b></div>
          <div className="fe-kv"><span>Taken off this year</span><b>{money(row.amount, { sym })}</b></div>
          {row.description ? <p className="fe-form__hint" style={{ marginTop: 10 }}>{row.description}</p> : null}
        </div>
        <div className="fe-dsec">
          <h4>Beneficiaries ({data?.rows?.length ?? row.beneficiaries})</h4>
          {!data ? <Loading rows={3} /> : data.rows.length ? (
            <table className="fe-mini"><tbody>
              {data.rows.map(b => (
                <tr key={b._id}>
                  <td><b style={{ color: '#0f172a' }}>{b.name}</b><br /><small>{[b.admissionNumber, b.classLabel].filter(Boolean).join(' · ')}</small></td>
                  <td>{money(b.credited, { sym })}<br /><button type="button" className="fe-link" style={{ color: '#dc2626', fontSize: '.78rem' }} onClick={() => setRemoving(b)}>Withdraw</button></td>
                </tr>
              ))}
            </tbody></table>
          ) : <p className="fe-form__hint">Nobody holds it this year.</p>}
        </div>
      </div>
      <DrawerFoot>
        <Btn variant="outline" icon="pencil" onClick={() => onEdit(row)}>Edit</Btn>
        <Btn variant="primary" icon="userPlus" onClick={() => onAssign(row)} disabled={row.status === 'inactive'}>Assign Students</Btn>
      </DrawerFoot>
      <Confirm open={!!removing} onClose={() => setRemoving(null)} onConfirm={remove} title="Withdraw concession" confirmLabel="Withdraw"
        message={removing ? `Withdraw ${row.name} from ${removing.name}? The ${money(removing.credited, { sym })} it took off is added back.` : ''} />
    </Drawer>
  );
}

/* ── Fine rule ────────────────────────────────────────────────────────────── */

export function FineRuleDialog({ open, onClose, onSaved, meta, rule, copy }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const settings = meta?.settings || {};
  useEffect(() => {
    if (!open) return;
    const src = rule;
    setForm(src ? {
      name: copy ? `${src.name} (copy)` : src.name, ruleType: src.ruleType, fineType: src.fineType,
      amount: String(src.fineType === 'flat' ? src.flatAmount : src.perDayAmount), gracePeriodDays: String(src.gracePeriodDays || 0),
      maxCap: src.maxCap ? String(src.maxCap) : '', appliesTo: src.appliesTo, classes: src.classes.map(c => String(c._id)),
      description: src.description || '', isActive: copy ? true : src.isActive,
    } : { name: '', ruleType: 'late_payment', fineType: settings.lateFeeCalculation === 'flat' ? 'flat' : 'per_day', amount: '',
      gracePeriodDays: String(settings.defaultGraceDays ?? 5), maxCap: '', appliesTo: 'all', classes: [], description: '', isActive: true });
  }, [open, rule, copy]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v?.target ? v.target.value : v }));
  const submit = async (e) => {
    e.preventDefault();
    const body = {
      name: form.name, ruleType: form.ruleType, fineType: form.fineType,
      flatAmount: form.fineType === 'flat' ? form.amount : 0, perDayAmount: form.fineType === 'per_day' ? form.amount : 0,
      gracePeriodDays: form.ruleType === 'late_payment' ? form.gracePeriodDays : 0, maxCap: form.maxCap || 0,
      appliesTo: form.appliesTo, classes: form.appliesTo === 'classes' ? form.classes : [], description: form.description, isActive: form.isActive,
    };
    setSaving(true);
    try {
      if (rule && !copy) await api.updateFineRule(rule._id, body); else await api.createFineRule(body);
      toast.success(rule && !copy ? 'Fine rule saved' : 'Fine rule added');
      onSaved?.(); onClose();
    } catch (e2) { err(e2); } finally { setSaving(false); }
  };
  const sym = settings.currencySymbol || '₹';
  return (
    <Modal open={open} onClose={onClose} maxWidth={620}
      title={<Title glyph="rupee" tone="red" title={rule && !copy ? 'Edit Fine Rule' : 'Add Fine Rule'} sub="A late-payment fine, or a penalty the office charges by hand" />}
      footer={<Foot onClose={onClose} saving={saving} label={rule && !copy ? 'Save Changes' : 'Add Fine Rule'} form="fe-fine-form" />}>
      <form id="fe-fine-form" className="fe-form" onSubmit={submit}>
        <Field label="Rule Name" required><Input value={form.name || ''} onChange={set('name')} placeholder="e.g. Late Fee - Monthly" /></Field>
        <div className="fe-form__row">
          <Field label="Type"><SegCtl value={form.ruleType} onChange={set('ruleType')} items={[{ value: 'late_payment', label: 'Late Payment' }, { value: 'other', label: 'Other Fine' }]} /></Field>
          <Field label="Calculation"><SegCtl value={form.fineType} onChange={set('fineType')} items={[{ value: 'per_day', label: 'Per day' }, { value: 'flat', label: 'Fixed' }]} /></Field>
        </div>
        <div className="fe-form__row--3 fe-form__row">
          <Field label={form.fineType === 'flat' ? 'Amount' : 'Amount per day'} required><Money value={form.amount || ''} onChange={set('amount')} sym={sym} /></Field>
          {form.ruleType === 'late_payment'
            ? <Field label="Grace Period"><span className="fe-affix"><input className="fe-input" type="number" min="0" value={form.gracePeriodDays || ''} onChange={set('gracePeriodDays')} /><span>days</span></span></Field>
            : <span />}
          <Field label="Maximum" hint="0 = no cap"><Money value={form.maxCap || ''} onChange={set('maxCap')} sym={sym} /></Field>
        </div>
        <Field label="Applicable To">
          <Select value={form.appliesTo} onChange={set('appliesTo')} options={Object.entries(FINE_APPLIES).map(([value, label]) => ({ value, label }))} />
        </Field>
        {form.appliesTo === 'classes' ? (
          <div className="fe-picker" style={{ maxHeight: 170 }}>
            {(meta?.classes || []).map(c => (
              <label key={c._id}><input type="checkbox" className="fe-check" checked={form.classes?.includes(String(c._id))}
                onChange={() => setForm(f => ({ ...f, classes: f.classes.includes(String(c._id)) ? f.classes.filter(x => x !== String(c._id)) : [...f.classes, String(c._id)] }))} />
                <span>{c.className}</span><small /></label>
            ))}
          </div>
        ) : null}
        <Field label="Description"><textarea className="fe-textarea" value={form.description || ''} onChange={set('description')} /></Field>
        <Field label="Status"><span className="fe-togglerow"><Toggle checked={form.isActive} onChange={set('isActive')} />{form.isActive ? 'Active' : 'Inactive'}</span></Field>
      </form>
    </Modal>
  );
}

/** Charge an "other" fine to a student picked here. */
export function ChargeFineDialog({ open, onClose, onDone, meta, rules = [] }) {
  const [student, setStudent] = useState(null);
  const [form, setForm] = useState({ ruleId: '', days: '', remarks: '' });
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setStudent(null); setForm({ ruleId: rules[0]?._id || '', days: '', remarks: '' }); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const rule = rules.find(r => r._id === form.ruleId);
  const sym = meta?.settings?.currencySymbol || '₹';
  const submit = async () => {
    if (!student) return toast.error('Choose a student');
    setSaving(true);
    try {
      const r = await api.chargeFine(student._id, form);
      toast.success(`${money(r?.data?.amount, { sym })} fine charged to ${student.name}`);
      onDone?.(); onClose();
    } catch (e) { err(e); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} maxWidth={540}
      title={<Title glyph="rupee" tone="red" title="Charge a Fine" sub="A penalty the office charges by hand" />}
      footer={<Foot onClose={onClose} saving={saving} label="Charge Fine" onClick={submit} disabled={!form.ruleId} />}>
      <div className="fe-form">
        <Field label="Student" required><StudentPicker value={student} onChange={setStudent} yearId={meta?.year?._id} /></Field>
        <Field label="Fine" required>
          <Select value={form.ruleId} onChange={v => setForm(f => ({ ...f, ruleId: v }))} all={rules.length ? undefined : 'No other-fine rules are active'}
            options={rules.map(r => ({ value: r._id, label: `${r.name} — ${r.fineType === 'flat' ? money(r.flatAmount, { sym }) : `${money(r.perDayAmount, { sym })} per day`}` }))} />
        </Field>
        {rule?.fineType === 'per_day' ? <Field label="Days" required><Input type="number" min="1" value={form.days} onChange={e => setForm(f => ({ ...f, days: e.target.value }))} /></Field> : null}
        <Field label="Note"><Input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} placeholder="Printed on the ledger" /></Field>
      </div>
    </Modal>
  );
}

/* ── Reminders, copying years, reports ────────────────────────────────────── */

/**
 * Send a reminder by hand. It shows who it will reach and who has already
 * been chased today before anything goes out — a reminder is an email to a
 * real parent, and sending the same one twice in an afternoon is how a school
 * stops being listened to.
 */
export function ReminderDialog({ open, onClose, onSent, meta, studentIds, preset = {} }) {
  const [form, setForm] = useState({ classId: '', sectionId: '', message: '' });
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { if (open) { setForm({ classId: preset.classId || '', sectionId: preset.sectionId || '', message: '' }); setPreview(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Who this would reach, refreshed whenever the group changes.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      api.reminderPreview({
        classId: form.classId || undefined, sectionId: form.sectionId || undefined,
        studentIds: studentIds?.length ? studentIds.join(',') : undefined,
      }).then(r => { if (alive) setPreview(r?.data || null); })
        .catch(() => { if (alive) setPreview(null); })
        .finally(() => { if (alive) setLoading(false); });
    }, 200);
    return () => { alive = false; clearTimeout(t); };
  }, [open, form.classId, form.sectionId, JSON.stringify(studentIds)]); // eslint-disable-line react-hooks/exhaustive-deps

  const cls = (meta?.classes || []).find(c => c._id === form.classId);
  const sym = meta?.settings?.currencySymbol || '₹';
  const n = preview?.students ?? 0;

  const submit = async () => {
    setSaving(true);
    try {
      const r = await api.sendFeeReminders({ ...form, classId: form.classId || undefined, sectionId: form.sectionId || undefined, studentIds });
      const sent = r?.data?.sent || 0;
      toast.success(sent ? `Reminder sent for ${plural(sent, 'student')} (and their parents)` : 'Nobody in this group owes anything');
      onSent?.();
      onClose();
    } catch (e) { err(e); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={560}
      title={<Title glyph="bell" tone="amber" title="Send Fee Reminder" sub="To every student who owes money, and their parents" />}
      footer={<Foot onClose={onClose} saving={saving} label={n ? `Send to ${plural(n, 'student')}` : 'Send Reminder'} onClick={submit} disabled={loading || !n} />}>
      <div className="fe-form">
        {studentIds?.length ? <p className="fe-form__hint" style={{ margin: 0 }}>{plural(studentIds.length, 'selected student')} — only those with dues are reminded.</p> : (
          <div className="fe-form__row">
            <Select label="Class" value={form.classId} onChange={v => setForm(f => ({ ...f, classId: v, sectionId: '' }))} all="All Classes" options={(meta?.classes || []).map(c => ({ value: c._id, label: c.className }))} />
            <Select label="Section" value={form.sectionId} onChange={v => setForm(f => ({ ...f, sectionId: v }))} all="All Sections" disabled={!cls} options={(cls?.sections || []).map(s => ({ value: s._id, label: `Section ${s.sectionName}` }))} />
          </div>
        )}

        <div className="fe-impact">
          <div><small>Will be reminded</small><b>{loading ? '…' : plural(n, 'student')}</b></div>
          <div><small>Owed between them</small><b>{loading ? '…' : money(preview?.amount, { sym, space: true })}</b></div>
        </div>

        {preview?.remindedToday > 0 ? (
          <Note glyph="alertTri" tone="amber" title={`${plural(preview.remindedToday, 'family has', 'families have')} already been reminded today`}>
            Sending again now means a second message about the same money. It may be what you want after a phone call — it is worth knowing first.
          </Note>
        ) : null}

        {preview?.rows?.length ? (
          <div className="fe-headpick" style={{ maxHeight: 190 }}>
            <table className="fe-mini">
              <thead><tr><th>Student</th><th>Due</th><th>Last reminded</th></tr></thead>
              <tbody>
                {preview.rows.map(r => (
                  <tr key={r._id}>
                    <td>{r.name}<br /><small>{r.classLabel}</small></td>
                    <td>{money(r.due, { sym })}</td>
                    <td>{r.lastReminded ? fmtDate(`${r.lastReminded}T00:00:00`) : <span className="fe-muted">Never</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {n > preview.rows.length ? <p className="fe-form__hint" style={{ margin: '6px 0 0' }}>…and {plural(n - preview.rows.length, 'more student')}.</p> : null}
          </div>
        ) : null}

        <Field label="Add a note (optional)" hint="Each reminder already states the amount due.">
          <textarea className="fe-textarea" maxLength={300} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
        </Field>
      </div>
    </Modal>
  );
}

export function CopyYearDialog({ open, onClose, onDone, years = [], defaultTo }) {
  const [form, setForm] = useState({ fromYearId: '', toYearId: '' });
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!open) return;
    setResult(null);
    const to = defaultTo || years.find(y => y.status === 'active')?._id || years[0]?._id || '';
    setForm({ toYearId: to, fromYearId: years.find(y => y._id !== to)?._id || '' });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    setSaving(true);
    try {
      const r = await api.copyStructures(form);
      setResult(r?.data);
      if (r?.data?.created) { toast.success(`${plural(r.data.created, 'structure')} copied`); onDone?.(); }
    } catch (e) { err(e); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} maxWidth={520}
      title={<Title glyph="upload" tone="amber" title="Copy Structures From Another Year" sub="Classes are matched by number, sections by name" />}
      footer={result ? <Btn variant="primary" onClick={onClose}>Done</Btn> : <Foot onClose={onClose} saving={saving} label="Copy Structures" onClick={submit} disabled={!form.fromYearId || !form.toYearId || form.fromYearId === form.toYearId} />}>
      <div className="fe-form">
        <div className="fe-form__row">
          <Select label="Copy from" value={form.fromYearId} onChange={v => setForm(f => ({ ...f, fromYearId: v }))} options={yearOptions(years)} />
          <Select label="Into" value={form.toYearId} onChange={v => setForm(f => ({ ...f, toYearId: v }))} options={yearOptions(years)} />
        </div>
        <p className="fe-form__hint" style={{ margin: 0 }}>Copies start switched on and have charged nobody. A structure whose class does not exist in the target year, or whose name is already used there, is skipped.</p>
        {result ? (
          <div className="fe-note fe-note--blue"><span className="fe-note__i"><Glyph name="info" size={24} /></span>
            <div className="fe-note__b">{plural(result.created, 'structure')} copied{result.skipped.length ? `, ${result.skipped.length} skipped:` : '.'}
              {result.skipped.length ? <ul>{result.skipped.slice(0, 10).map(s => <li key={s.name}>{s.name} — {s.reason}</li>)}</ul> : null}</div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

export const REPORT_TABS = [
  ['collection', 'Collection Overview'], ['class', 'Class Wise'], ['category', 'Category Wise'], ['mode', 'Payment Mode'],
  ['dues', 'Dues Report'], ['concession', 'Concession Report'], ['fine', 'Fine Report'], ['custom', 'Custom Report'],
];
const REPORT_NAME = Object.fromEntries(REPORT_TABS);

export function EmailReportDialog({ open, onClose, type, filters, defaultTo = '' }) {
  const [to, setTo] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) setTo(defaultTo); }, [open, defaultTo]);
  const submit = async () => {
    setSaving(true);
    try {
      const r = await api.emailReport({ type, filters, to });
      toast.success(`Report emailed to ${plural(r?.data?.sent || 0, 'address', 'addresses')}`);
      onClose();
    } catch (e) { err(e); } finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} maxWidth={500}
      title={<Title glyph="receipt" tone="blue" title="Email Report" sub={REPORT_NAME[type] || 'Report'} />}
      footer={<Foot onClose={onClose} saving={saving} label="Send" onClick={submit} disabled={!to.trim()} />}>
      <div className="fe-form">
        <Field label="Send to" hint="Separate addresses with commas. Sent through the school's own email settings.">
          <textarea className="fe-textarea" value={to} onChange={e => setTo(e.target.value)} placeholder="accounts@school.edu, principal@school.edu" />
        </Field>
        <p className="fe-form__hint" style={{ margin: 0 }}>The email carries the report as a table with the same filters as the screen.</p>
      </div>
    </Modal>
  );
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function ScheduleDialog({ open, onClose, type }) {
  const [list, setList] = useState(null);
  const [form, setForm] = useState({ type: type || 'collection', frequency: 'weekly', day: '1', recipients: '' });
  const [saving, setSaving] = useState(false);
  const load = () => api.getReportSchedules().then(r => setList(r?.data || [])).catch(err);
  useEffect(() => { if (open) { load(); setForm(f => ({ ...f, type: type || f.type })); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    setSaving(true);
    try {
      await api.addReportSchedule({ ...form, day: Number(form.day) });
      toast.success('Report scheduled'); setForm(f => ({ ...f, recipients: '' })); load();
    } catch (e) { err(e); } finally { setSaving(false); }
  };
  const remove = async (id) => { try { await api.removeReportSchedule(id); load(); } catch (e) { err(e); } };
  return (
    <Modal open={open} onClose={onClose} maxWidth={620}
      title={<Title glyph="calendar" tone="blue" title="Scheduled Reports" sub="Emailed automatically, once on the chosen day" />}
      footer={<Btn variant="outline" onClick={onClose}>Close</Btn>}>
      <div className="fe-form">
        {list === null ? <Loading rows={2} /> : list.length ? (
          <table className="fe-mini">
            <thead><tr><th>Report</th><th>When</th><th>To</th><th /></tr></thead>
            <tbody>{list.map(s => (
              <tr key={s._id}>
                <td>{REPORT_NAME[s.type]}{s.lastError ? <><br /><small style={{ color: '#dc2626' }}>Last send failed: {s.lastError}</small></> : null}</td>
                <td>{s.frequency === 'weekly' ? `Every ${WEEKDAYS[s.day]}` : `Day ${s.day} of each month`}<br /><small>{s.lastSentAt ? `Last sent ${fmtDate(s.lastSentAt)}` : 'Not sent yet'}</small></td>
                <td style={{ textAlign: 'left' }}>{s.recipients.join(', ')}</td>
                <td><button type="button" className="fe-link" style={{ color: '#dc2626' }} onClick={() => remove(s._id)}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <p className="fe-form__hint" style={{ margin: 0 }}>No reports are scheduled yet.</p>}
        <div className="fe-form__row--3 fe-form__row" style={{ borderTop: '1px solid #eef1f6', paddingTop: 14 }}>
          <Select label="Report" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))} options={REPORT_TABS.map(([value, label]) => ({ value, label }))} />
          <Select label="Frequency" value={form.frequency} onChange={v => setForm(f => ({ ...f, frequency: v, day: v === 'weekly' ? '1' : '1' }))} options={[{ value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
          <Select label={form.frequency === 'weekly' ? 'Day' : 'Day of month'} value={form.day} onChange={v => setForm(f => ({ ...f, day: v }))}
            options={form.frequency === 'weekly' ? WEEKDAYS.map((d, i) => ({ value: String(i), label: d })) : Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} />
        </div>
        <Field label="Email to"><Input value={form.recipients} onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))} placeholder="accounts@school.edu" /></Field>
        <div><Btn variant="primary" icon="plus" onClick={add} disabled={saving || !form.recipients.trim()}>Add Schedule</Btn></div>
        <p className="fe-form__hint" style={{ margin: 0 }}>A scheduled report covers the current academic year and goes out once that day, after 7 AM.</p>
      </div>
    </Modal>
  );
}

/** Kept here so the list pages can show a tidy "5 selected" strip. */
export const SelectionStrip = ({ count, onClear, children }) => (count ? (
  <div className="fe-note fe-note--blue" style={{ alignItems: 'center', marginBottom: 12, padding: '8px 14px' }}>
    <span style={{ fontWeight: 600, color: '#0f172a' }}>{count} selected</span>
    <span style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>{children}<Btn variant="link" onClick={onClear}>Clear</Btn></span>
  </div>
) : null);

export { STATUS, DUE_STATUS, Badge };
