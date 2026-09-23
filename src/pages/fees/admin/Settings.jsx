/**
 * Fees → Settings (mockup 10). Eight tabs of settings and a rail: whether the
 * module is healthy, quick actions (backup, copy from another year, export,
 * reset) and system information.
 *
 * Every switch here changes something: a setting that only matters to the
 * automatic late fine — which does not exist yet — is shown disabled and says
 * so, rather than a switch that does nothing when flipped.
 *
 * Edits are held in a buffer over the server's copy and sent together by Save
 * Changes; switching tab keeps them.
 */
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  getFeeSettingsFull, updateFeeSettings, resetFeeSettings, downloadFeeBackup, getFeeAuditLogs, getFeeAccess,
  reminderHistory,
} from '../../../api/fees.api';
import { Confirm } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  FeHead, Btn, Card, Mark, Select, Toggle, Badge, StatusBadge, Glyph, Pager, Loading, Empty, DateInput,
  fmtDateTime, isoDay, yearOptions, MODE, COUNTER_MODES, saveFile,
} from './feeUI';
import { CopyYearDialog } from './feeForms';
import { describe } from './feeHistory';
import Tabs from '../../../components/ui/Tabs';

const TABS = [
  ['general', 'General', 'settings'], ['payment', 'Payment Settings', 'creditCard'], ['receipt', 'Receipt & Invoice', 'fileDoc'],
  ['notifications', 'Notifications', 'bell'], ['year', 'Academic Year', 'calendar'], ['integrations', 'Integrations', 'externalLink'],
  ['permissions', 'Permissions', 'shieldCheck'], ['audit', 'Audit Logs', 'history'],
];
const CURRENCIES = [
  ['INR', '₹', 'Indian Rupee'], ['USD', '$', 'US Dollar'], ['AED', 'د.إ', 'UAE Dirham'], ['GBP', '£', 'British Pound'],
  ['EUR', '€', 'Euro'], ['NPR', 'रू', 'Nepalese Rupee'], ['LKR', 'Rs', 'Sri Lankan Rupee'], ['BDT', '৳', 'Bangladeshi Taka'],
];
const ENTITIES = [['', 'Everything'], ['FeeStructure', 'Structures'], ['FeeHead', 'Fee heads'], ['FeeCategory', 'Categories'],
  ['FeeConcession', 'Concessions'], ['FineRule', 'Fine rules'], ['FeePayment', 'Payments'], ['FeeSettings', 'Settings']];

const Section = ({ glyph = 'gear', title, sub, children }) => (
  <Card className="fe-sec">
    <div className="fe-sec__head"><Mark glyph={glyph} tone="indigo" size={48} /><div><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div></div>
    {children}
  </Card>
);
const Labelled = ({ label, children, hint }) => (
  <label className="fe-field"><span className="fe-field__label">{label}</span>{children}{hint ? <span className="fe-form__hint">{hint}</span> : null}</label>
);
/** A switch under its title, with a caption (the General grid). */
const SwitchBox = ({ title, desc, checked, onChange, disabled }) => (
  <div className="fe-sw"><span className="fe-sw__t">{title}</span><Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} /><span className="fe-sw__d">{desc}</span></div>
);
/** A switch beside its title (the Rounding and Display rows). */
const SwitchRow = ({ title, desc, checked, onChange, disabled }) => (
  <div className="fe-swrow"><Toggle checked={checked} onChange={onChange} disabled={disabled} label={title} /><div><span className="fe-sw__t">{title}</span><span className="fe-sw__d">{desc}</span></div></div>
);
const Days = ({ value, onChange }) => (
  <span className="fe-affix"><input className="fe-input" type="number" min="0" value={value ?? ''} onChange={e => onChange(e.target.value)} /><span>days</span></span>
);
const DateField = (props) => <DateInput {...props} />;

/** A list of day-offsets, edited as chips. "3, 7" = two reminders. */
function DayChips({ value = [], onChange, label, hint }) {
  const [draft, setDraft] = useState('');
  const days = Array.isArray(value) ? value : [];
  const add = () => {
    const n = Math.round(Number(draft));
    if (!Number.isFinite(n) || n < 1 || n > 90) { toast.error('Enter a number of days between 1 and 90'); return; }
    if (days.includes(n)) { setDraft(''); return; }
    onChange([...days, n].sort((a, b) => a - b));
    setDraft('');
  };
  return (
    <Labelled label={label} hint={hint}>
      <div className="fe-daychips">
        {days.map(d => (
          <span key={d} className="fe-daychip">{d} {d === 1 ? 'day' : 'days'}
            <button type="button" onClick={() => onChange(days.filter(x => x !== d))} aria-label={`Remove ${d} days`}>
              <Icon name="close" size={13} />
            </button>
          </span>
        ))}
        <input className="fe-daychip__in" type="number" min="1" max="90" value={draft} placeholder="add…"
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          onBlur={() => draft && add()} />
      </div>
    </Labelled>
  );
}

/**
 * Reminders that send themselves. Off until a school turns it on, because it
 * writes to real parents — so the section says plainly what will go out and
 * how often before anything is switched on.
 */
function AutoReminders({ f, setIn, sym }) {
  const a = f.autoReminders || {};
  const on = a.enabled === true;
  const before = Array.isArray(a.beforeDays) ? a.beforeDays : [];
  const after = Array.isArray(a.afterDays) ? a.afterDays : [];
  const nothing = on && !a.onDueDay && !before.length && !after.length;
  const count = (a.onDueDay !== false ? 1 : 0) + before.length + after.length;
  const hour = Number.isFinite(Number(a.sendHour)) ? Number(a.sendHour) : 9;
  const hourLabel = `${String(hour).padStart(2, '0')}:00`;

  return (
    <Section glyph="clockRing" title="Automatic Reminders" sub="Chasing unpaid months without anyone pressing anything">
      <SwitchRow title="Send reminders automatically" checked={on} onChange={setIn('autoReminders', 'enabled')}
        desc="Off by default. Once on, families are written to without anyone reviewing each message." />

      {on ? (
        <>
          <div className="fe-sgrid fe-sgrid--2" style={{ marginTop: 14 }}>
            <DayChips label="Before a month falls due" value={before} onChange={setIn('autoReminders', 'beforeDays')}
              hint="Notice ahead of the due date, so a family can plan." />
            <DayChips label="After it is still unpaid" value={after} onChange={setIn('autoReminders', 'afterDays')}
              hint="Nudges once the due date has passed." />
          </div>
          <div className="fe-sgrid fe-sgrid--3" style={{ marginTop: 14 }}>
            <Labelled label="Smallest amount worth chasing" hint="Anything below this is left alone.">
              <span className="fe-affix fe-affix--pre"><span>{sym}</span>
                <input className="fe-input" type="number" min="0" value={a.minAmount ?? 0}
                  onChange={e => setIn('autoReminders', 'minAmount')(e.target.value)} /></span>
            </Labelled>
            <Labelled label="Send at" hint="The school's local time.">
              <Select value={String(hour)} onChange={v => setIn('autoReminders', 'sendHour')(Number(v))}
                options={Array.from({ length: 24 }, (_, i) => ({ value: String(i), label: `${String(i).padStart(2, '0')}:00` }))} />
            </Labelled>
            <Labelled label="Also by email" hint="As well as in the app.">
              <span className="fe-togglerow"><Toggle checked={a.emailParents !== false} onChange={setIn('autoReminders', 'emailParents')} label="Email parents" />
                {a.emailParents !== false ? 'Email and app' : 'App only'}</span>
            </Labelled>
          </div>
          <div style={{ marginTop: 14 }}>
            <SwitchRow title="On the day it falls due" desc="One reminder on the due date itself"
              checked={a.onDueDay !== false} onChange={setIn('autoReminders', 'onDueDay')} />
          </div>

          {nothing ? (
            <div className="fe-note fe-note--red" style={{ marginTop: 14 }}>
              <span className="fe-note__i"><Glyph name="alertTri" size={24} /></span>
              <div><strong>Nothing would be sent</strong>
                <div className="fe-note__b">Choose at least one moment — before the due date, on it, or after it. Saving without one is refused.</div></div>
            </div>
          ) : (
            <div className="fe-note fe-note--blue" style={{ marginTop: 14 }}>
              <span className="fe-note__i"><Glyph name="info" size={24} /></span>
              <div><strong>What this will do</strong>
                <div className="fe-note__b">
                  Each unpaid month earns up to {count} reminder{count === 1 ? '' : 's'}
                  {before.length ? `, ${before.map(d => `${d} day${d === 1 ? '' : 's'} before`).join(' and ')}` : ''}
                  {a.onDueDay !== false ? `${before.length ? ',' : ','} on the day` : ''}
                  {after.length ? ` and ${after.map(d => `${d} day${d === 1 ? '' : 's'} after`).join(' and ')}` : ''}
                  {' '}— sent around {hourLabel}. A family is never chased twice for the same month at the same moment, however often the job runs.
                </div></div>
            </div>
          )}
        </>
      ) : (
        <p className="fe-form__hint" style={{ marginTop: 12 }}>
          While this is off, reminders only go out when someone sends them from the dashboard or Student Fees.
        </p>
      )}
      <ReminderHistory />
    </Section>
  );
}

/** What has actually been sent — by hand and by the job. */
function ReminderHistory() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const { data, meta, loading } = useFetch(() => (open ? reminderHistory({ page, limit: 10 }) : Promise.resolve({ data: [] })), [open, page]);
  const rows = data || [];
  const KIND = (k) => (k === 'manual' ? 'By hand' : k === 'due' ? 'On the due day'
    : k.startsWith('before-') ? `${k.slice(7)} days before` : k.startsWith('after-') ? `${k.slice(6)} days after` : k);
  return (
    <div style={{ marginTop: 18 }}>
      <Btn variant="link" onClick={() => setOpen(o => !o)}>
        {open ? 'Hide' : 'Show'} what has been sent <Icon name={open ? 'chevronDown' : 'chevronRight'} size={15} />
      </Btn>
      {open ? (
        loading && !rows.length ? <Loading rows={3} /> : rows.length ? (
          <>
            <table className="fe-mini" style={{ marginTop: 10 }}>
              <thead><tr><th>Student</th><th>For</th><th>Amount</th><th>Why</th><th>Sent</th><th>By</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r._id}>
                    <td>{r.student.name}<br /><small>{r.classLabel}</small></td>
                    <td>{r.monthKey || 'Balance'}</td>
                    <td>{r.amount}</td>
                    <td>{KIND(r.kind)}{r.auto ? <Badge tone="indigo"> auto</Badge> : null}</td>
                    <td>{fmtDateTime(r.at)}</td>
                    <td>{r.by}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={10} count={rows.length}
              noun="reminders" onPage={setPage} />
          </>
        ) : <p className="fe-form__hint" style={{ marginTop: 10 }}>No reminder has been sent yet.</p>
      ) : null}
    </div>
  );
}

function AuditLogs({ initialEntity }) {
  const [entity, setEntity] = useState(initialEntity || '');
  const [page, setPage] = useState(1);
  const { data, meta, loading } = useFetch(() => getFeeAuditLogs({ entityType: entity || undefined, page, limit: 15 }), [entity, page]);
  return (
    <Card>
      <div className="fe-cardhead"><div className="fe-cardhead__t"><h3>Audit Logs</h3><span>Every change made to fees, newest first</span></div>
        <div style={{ width: 170 }}><Select compact value={entity} onChange={v => { setEntity(v); setPage(1); }} options={ENTITIES.map(([value, label]) => ({ value, label }))} /></div>
      </div>
      <div className="fe-tablewrap">
        <table className="fe-table fe-table--tight">
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Record</th><th>Change</th></tr></thead>
          <tbody>{(data || []).map(r => {
            const d = describe({ ...r, detail: null });
            return (
              <tr key={r._id}>
                <td className="fe-num">{fmtDateTime(r.at)}</td>
                <td>{r.by}<div className="fe-muted" style={{ fontSize: '.74rem' }}>{r.role.replace('_', ' ')}</div></td>
                <td><Badge tone="indigo">{r.entity}</Badge></td>
                <td>{r.name || <span className="fe-muted">—</span>}</td>
                <td>{d.title}{d.detail ? <span className="fe-muted"> — {d.detail}</span> : null}</td>
              </tr>
            );
          })}</tbody>
        </table>
        {loading && !data ? <Loading rows={5} /> : null}
        {!loading && !(data || []).length ? <Empty title="No changes recorded" hint="The log starts from the Sep 2026 update." /> : null}
      </div>
      <Pager page={page} pages={meta?.pages || 1} total={meta?.total || 0} limit={15} count={(data || []).length} noun="entries" onPage={setPage} />
    </Card>
  );
}

export default function FeesSettings() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(t => t[0] === params.get('tab')) ? params.get('tab') : 'general';
  const setTab = (k) => { const n = new URLSearchParams(params); n.set('tab', k); n.delete('entity'); setParams(n, { replace: true }); };
  const { data, refetch } = useFetch(getFeeSettingsFull);
  const { data: access } = useFetch(() => (tab === 'permissions' ? getFeeAccess() : Promise.resolve(null)), [tab]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [copying, setCopying] = useState(false);

  // Leaving with unsaved changes asks first.
  const dirty = Object.keys(edits).length > 0;
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const s = data?.settings || {};
  // What the form shows: the server's copy with the edits laid over it; the
  // grouped settings merge key by key.
  const f = {
    ...s, ...edits,
    display: { ...(s.display || {}), ...(edits.display || {}) },
    notifications: { ...(s.notifications || {}), ...(edits.notifications || {}) },
    receipt: { ...(s.receipt || {}), ...(edits.receipt || {}) },
    autoReminders: { ...(s.autoReminders || {}), ...(edits.autoReminders || {}) },
  };
  const set = (k) => (v) => setEdits(e => ({ ...e, [k]: v }));
  const setIn = (group, k) => (v) => setEdits(e => ({ ...e, [group]: { ...(e[group] || {}), [k]: v } }));
  const modes = Array.isArray(f.acceptedModes) ? f.acceptedModes : COUNTER_MODES;
  const sym = f.currencySymbol || '₹';

  const save = async () => {
    setSaving(true);
    try { await updateFeeSettings(edits); toast.success('Settings saved'); setEdits({}); refetch(); }
    catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };
  const doReset = async () => {
    try { await resetFeeSettings(); toast.success('Settings reset to their defaults'); setEdits({}); setConfirm(null); refetch(); }
    catch (e) { toast.error(e.message); }
  };
  const backup = async (only) => {
    try { const blob = await downloadFeeBackup(only ? { only } : undefined); saveFile(blob, `fees-${only ? 'settings' : 'backup'}-${isoDay(new Date())}.json`, 'application/json'); }
    catch (e) { toast.error(e.message); }
  };

  const st = data?.status;
  const info = data?.info || {};
  if (!data) return <div className="fe-page"><FeHead title="Settings" subtitle="Configure fee module settings, preferences and integrations" /><Loading rows={8} /></div>;

  return (
    <div className="fe-page">
      <FeHead title="Settings" subtitle="Configure fee module settings, preferences and integrations">
        <Btn variant="outline" icon="refresh" onClick={() => setConfirm('reset')}>Reset to Default</Btn>
        <Btn variant="primary" icon="save" onClick={() => (dirty ? save() : toast('No changes to save'))} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Btn>
      </FeHead>

      <Tabs variant="pill" value={tab} onChange={setTab} label="Settings sections"
        items={TABS.map(([key, label, icon]) => ({ key, label, icon }))} />

      <div className="fe-settings">
        <div style={{ minWidth: 0 }}>
          {tab === 'general' ? (
            <>
              <Section title="General Settings" sub="Basic configuration for the fees module">
                <div className="fe-sgrid fe-sgrid--3">
                  <Labelled label="Default Currency">
                    <Select value={f.currency} onChange={v => { const c = CURRENCIES.find(x => x[0] === v); setEdits(e => ({ ...e, currency: v, currencySymbol: c?.[1] || e.currencySymbol })); }}
                      options={CURRENCIES.map(([code, symbol, name]) => ({ value: code, label: `${code} (${symbol}) - ${name}` }))} />
                  </Labelled>
                  <Labelled label="Fee Collection Start Date"><DateField value={isoDay(f.collectionStart)} onChange={set('collectionStart')} /></Labelled>
                  <Labelled label="Fee Collection End Date"><DateField value={isoDay(f.collectionEnd)} onChange={set('collectionEnd')} /></Labelled>
                  <Labelled label="Default Due Date (Days after generation)" hint="Not used yet — no automatic late fines">
                    <Days value={f.defaultDueDays} onChange={set('defaultDueDays')} />
                  </Labelled>
                  <Labelled label="Grace Period (Days)" hint="Default for new late-payment rules">
                    <Days value={f.defaultGraceDays} onChange={set('defaultGraceDays')} />
                  </Labelled>
                  <Labelled label="Default Academic Year" hint="Every fees screen opens on this year">
                    <Select value={f.defaultAcademicYear || ''} onChange={v => set('defaultAcademicYear')(v || null)} all="The active year" options={yearOptions(data.years)} />
                  </Labelled>
                  <SwitchBox title="Allow Partial Payments" desc="Students can pay fees in multiple installments" checked={f.allowPartialPayments} onChange={set('allowPartialPayments')} />
                  <SwitchBox title="Auto Generate Receipt" desc="Automatically open the receipt after a payment is recorded" checked={f.autoGenerateReceipt} onChange={set('autoGenerateReceipt')} />
                  <SwitchBox title="Show Previous Dues" desc="Display previous year dues in student fees" checked={f.showPreviousDues} onChange={set('showPreviousDues')} />
                </div>
              </Section>
              <Section glyph="calculator" title="Rounding & Calculation Settings" sub="Configure amount calculation and rounding preferences">
                <div className="fe-sgrid fe-sgrid--4">
                  <Labelled label="Rounding Method">
                    <Select value={f.roundingRule} onChange={set('roundingRule')} options={[{ value: 'none', label: 'No Rounding' }, { value: 'round', label: 'Nearest Rupee' }, { value: 'ceil', label: 'Always Round Up' }, { value: 'floor', label: 'Always Round Down' }]} />
                  </Labelled>
                  <Labelled label="Decimal Places">
                    <Select value={String(f.decimalPlaces ?? 0)} onChange={v => set('decimalPlaces')(Number(v))} options={[{ value: '0', label: '0 (No Decimals)' }, { value: '2', label: '2 (Paise)' }]} />
                  </Labelled>
                  <Labelled label="Late Fee Calculation" hint="Default for new rules">
                    <Select value={f.lateFeeCalculation} onChange={set('lateFeeCalculation')} options={[{ value: 'per_day', label: 'Per Day' }, { value: 'flat', label: 'Flat' }]} />
                  </Labelled>
                  <Labelled label="Apply Fine on">
                    <Select value={f.fineAppliesOn} onChange={set('fineAppliesOn')} disabled options={[{ value: 'total_due', label: 'Total Due Amount' }, { value: 'per_head', label: 'Each Fee Head' }]} />
                  </Labelled>
                </div>
                <div className="fe-sgrid fe-sgrid--2" style={{ marginTop: 18 }}>
                  <SwitchRow title="Include Concession in Fine Calculation" desc="Calculate fine after applying concession — takes effect with automatic late fines" checked={f.includeConcessionInFine} onChange={set('includeConcessionInFine')} disabled />
                  <SwitchRow title="Auto Adjust Advance Payments" desc="Advance amounts always count against later dues on the ledger" checked disabled onChange={() => {}} />
                </div>
                <p className="fe-form__hint" style={{ marginTop: 14 }}>Rounding applies to what the system works out — percentage concessions and per-day fines — not to amounts you type.</p>
              </Section>
              <Section glyph="eye" title="Display Settings" sub="Configure what students and parents see in their fee book">
                <div className="fe-sgrid fe-sgrid--4">
                  <SwitchRow title="Show Fee Head Details to Parents" desc="Display detailed breakup in parent portal" checked={f.display.feeHeadDetails !== false} onChange={setIn('display', 'feeHeadDetails')} />
                  <SwitchRow title="Show Concession Details" desc="Show applied concessions in the fee book" checked={f.display.concessionDetails !== false} onChange={setIn('display', 'concessionDetails')} />
                  <SwitchRow title="Show Fine Details" desc="Show fine charges in the fee book" checked={f.display.fineDetails !== false} onChange={setIn('display', 'fineDetails')} />
                  <SwitchRow title="Show Previous Year Dues" desc="Display previous academic year pending dues" checked={f.display.previousYearDues !== false} onChange={setIn('display', 'previousYearDues')} />
                </div>
              </Section>
            </>
          ) : tab === 'payment' ? (
            <>
              <Section glyph="card" title="Counter Payments" sub="The modes the office may record a payment in">
                <div className="fe-sgrid fe-sgrid--3">
                  {COUNTER_MODES.map(m => (
                    <SwitchRow key={m} title={MODE[m]} desc={m === 'upi' ? 'UPI transfers checked at the counter' : m === 'bank_transfer' ? 'NEFT / IMPS / net banking' : m === 'dd' ? 'Demand drafts' : `${MODE[m]} at the counter`}
                      checked={modes.includes(m)} onChange={on => set('acceptedModes')(on ? [...new Set([...modes, m])] : modes.filter(x => x !== m))} />
                  ))}
                </div>
              </Section>
              <Section glyph="rupee" title="Limits" sub="Checked every time a payment is recorded">
                <div className="fe-sgrid fe-sgrid--3">
                  <Labelled label="Smallest payment accepted" hint="0 = no minimum">
                    <span className="fe-affix fe-affix--pre"><span>{sym}</span><input className="fe-input" type="number" min="0" value={f.minPaymentAmount ?? 0} onChange={e => set('minPaymentAmount')(e.target.value)} /></span>
                  </Labelled>
                  <SwitchBox title="Allow Partial Payments" desc="Off: the office must collect the full amount due" checked={f.allowPartialPayments} onChange={set('allowPartialPayments')} />
                </div>
              </Section>
              <Section glyph="wallet" title="Online Payments" sub="Students and parents paying from their own fee book">
                <p style={{ margin: 0, fontSize: '.9rem' }}>Online fee payment is <b>{st?.gateway?.on ? `live through ${st.gateway.provider === 'razorpay' ? 'Razorpay' : 'Stripe'}` : 'off'}</b>.
                  {' '}The gateway is set up once for the whole school, in <Link to="/admin/school-settings?section=payments">School Settings → Payments</Link>, shared with every module that takes payments.</p>
              </Section>
            </>
          ) : tab === 'receipt' ? (
            <>
              <Section glyph="receipt" title="Receipt Numbering" sub="Every completed payment gets the next number">
                <div className="fe-sgrid fe-sgrid--3">
                  <Labelled label="Receipt Prefix" hint="Letters, digits, / and - (up to 10)"><input className="fe-input" value={f.receiptPrefix || ''} onChange={e => set('receiptPrefix')(e.target.value.toUpperCase())} /></Labelled>
                  <Labelled label="Next receipt"><input className="fe-input" disabled value={`${f.receiptPrefix || 'REC'}-${String((s.lastReceiptNumber || 0) + 1).padStart(6, '0')}`} /></Labelled>
                </div>
              </Section>
              <Section glyph="docFill" title="Receipt Text" sub="Printed on the PDF receipt students and parents download">
                <div className="fe-sgrid fe-sgrid--2">
                  <Labelled label="Header"><input className="fe-input" value={f.receipt.header || ''} onChange={e => setIn('receipt', 'header')(e.target.value)} placeholder="e.g. Affiliated to CBSE, No. 1234" /></Labelled>
                  <Labelled label="Footer"><input className="fe-input" value={f.receipt.footer || ''} onChange={e => setIn('receipt', 'footer')(e.target.value)} placeholder="Thank you for your payment." /></Labelled>
                </div>
                <div style={{ marginTop: 14 }}><Labelled label="Note"><textarea className="fe-textarea" value={f.receipt.customNotes || ''} onChange={e => setIn('receipt', 'customNotes')(e.target.value)} /></Labelled></div>
                <p className="fe-form__hint" style={{ marginTop: 12 }}>The look of the receipt the office prints — colours, logo, signature — is set in <Link to="/admin/school-settings?section=receipts">School Settings → Receipts</Link>.</p>
              </Section>
            </>
          ) : tab === 'notifications' ? (
            <>
            <Section glyph="bell" title="Notifications" sub="What students and parents are told, in the app and by email">
              <div className="fe-sgrid fe-sgrid--2">
                <SwitchRow title="Payment received" desc="When the office records a payment" checked={f.notifications.paymentReceived !== false} onChange={setIn('notifications', 'paymentReceived')} />
                <SwitchRow title="Payment approved or rejected" desc="When a payment a family submitted is decided" checked={f.notifications.paymentDecision !== false} onChange={setIn('notifications', 'paymentDecision')} />
                <SwitchRow title="Also send by email" desc="Through the school's own mail server, as well as in the app" checked={f.notifications.emailParents !== false} onChange={setIn('notifications', 'emailParents')} />
              </div>
              <p className="fe-form__hint" style={{ marginTop: 14 }}>Reminders can also be sent by hand at any time, from the dashboard or Student Fees.</p>
            </Section>
            <AutoReminders f={f} setIn={setIn} sym={sym} />
            </>
          ) : tab === 'year' ? (
            <Section glyph="calendar" title="Academic Year" sub="Which year the fees screens open on, and carrying structures forward">
              <div className="fe-sgrid fe-sgrid--3">
                <Labelled label="Default Academic Year"><Select value={f.defaultAcademicYear || ''} onChange={v => set('defaultAcademicYear')(v || null)} all="The active year" options={yearOptions(data.years)} /></Labelled>
                <Labelled label="Fee Collection Start Date"><DateField value={isoDay(f.collectionStart)} onChange={set('collectionStart')} /></Labelled>
                <Labelled label="Fee Collection End Date"><DateField value={isoDay(f.collectionEnd)} onChange={set('collectionEnd')} /></Labelled>
              </div>
              <table className="fe-mini" style={{ marginTop: 18 }}>
                <thead><tr><th>Year</th><th>Runs</th><th>Status</th></tr></thead>
                <tbody>{data.years.map(y => <tr key={y._id}><td>{y.yearName}{data.defaultYear?._id === y._id ? <Badge tone="indigo"> default</Badge> : null}</td><td>{isoDay(y.startDate)} → {isoDay(y.endDate)}</td><td><StatusBadge status={y.status === 'active' ? 'active' : 'inactive'} /></td></tr>)}</tbody>
              </table>
              <div style={{ marginTop: 14 }}><Btn variant="soft" icon="copy" onClick={() => setCopying(true)}>Copy structures from another year</Btn></div>
            </Section>
          ) : tab === 'integrations' ? (
            <Section glyph="gear" title="Integrations" sub="Services the fees module works through">
              <div className="fe-kv"><span>Payment gateway</span><b>{st?.gateway?.on ? `${st.gateway.provider} · live` : 'Off'} — <Link to="/admin/school-settings?section=payments">configure</Link></b></div>
              <div className="fe-kv"><span>Email (receipts, reminders, reports)</span><b><Link to="/admin/school-settings?section=mail">School mail server</Link></b></div>
              <div className="fe-kv"><span>Receipt designs</span><b><Link to="/admin/school-settings?section=receipts">School Settings → Receipts</Link></b></div>
              <div className="fe-kv"><span>Exports</span><b>Excel (.xlsx) and CSV from every list</b></div>
            </Section>
          ) : tab === 'permissions' ? (
            <Section glyph="shield" title="Permissions" sub="Who can run the fees module">
              {!access ? <Loading rows={3} /> : (
                <>
                  <p style={{ margin: '0 0 10px', fontSize: '.9rem' }}>School admins always can ({access.admins.length}): {access.admins.map(a => a.name).join(', ') || '—'}.</p>
                  <table className="fe-mini">
                    <thead><tr><th>Designation</th><th>Fees access</th></tr></thead>
                    <tbody>{access.designations.map(d => <tr key={d._id}><td>{d.name}</td><td><Badge tone={d.level === 'admin' ? 'green' : d.level === 'user' ? 'blue' : 'slate'}>{d.level === 'admin' ? 'Manages fees' : d.level === 'user' ? 'Uses fees' : 'No access'}</Badge></td></tr>)}</tbody>
                  </table>
                  <p className="fe-form__hint" style={{ marginTop: 12 }}>Change these on <Link to="/admin/designations">Designations</Link>.</p>
                </>
              )}
            </Section>
          ) : <AuditLogs initialEntity={params.get('entity')} />}
        </div>

        <aside className="fe-split__rail">
          <Card className="fe-status">
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
              <Mark glyph="cloudCheck" tone="green" size={50} />
              <div style={{ flex: 1 }}><h3 style={{ margin: '2px 0 4px', fontSize: '1.08rem' }}>Module Status</h3>
                <p style={{ margin: 0, fontSize: '.84rem', color: '#64748b' }}>{st?.moduleOn ? (st.operational ? 'Fees module is active and working properly' : 'Fees module is on, but needs attention') : 'Fees module is switched off for this school'}</p></div>
              <Badge tone={st?.moduleOn ? 'green' : 'slate'}>{st?.moduleOn ? 'Active' : 'Off'}</Badge>
            </div>
            <div className={`fe-status__ok${st?.operational ? '' : ' is-bad'}`}>
              <span style={{ color: st?.operational ? '#16a34a' : '#ea580c', display: 'inline-flex' }}><Glyph name={st?.operational ? 'checkCircle' : 'bang'} size={34} /></span>
              <div><strong>{st?.operational ? 'All systems operational' : 'Something needs attention'}</strong><span>Last checked: {fmtDateTime(st?.checkedAt)}</span></div>
            </div>
            <ul className="fe-status__checks">
              {(st?.checks || []).filter(c => !c.ok || c.key === 'gateway').map(c => (
                <li key={c.key}><Icon name={c.ok ? 'checkCircle' : 'alert'} size={15} style={{ color: c.ok ? '#16a34a' : '#ea580c' }} />{c.label}</li>
              ))}
            </ul>
          </Card>
          <Card className="fe-status">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <Mark glyph="bolt" tone="amber" size={38} glyphSize={20} /><h3 style={{ margin: 0, fontSize: '1.08rem' }}>Quick Actions</h3>
            </div>
            <div className="fe-qlist">
              <button type="button" className="fe-qitem" onClick={() => backup()}><Mark glyph="download" tone="indigo" size={40} glyphSize={20} /><div><strong>Backup Fee Data</strong><span>Download all fee configurations</span></div></button>
              <button type="button" className="fe-qitem" onClick={() => setCopying(true)}><Mark glyph="upload" tone="amber" size={40} glyphSize={20} /><div><strong>Import Settings</strong><span>Copy structures from another academic year</span></div></button>
              <button type="button" className="fe-qitem" onClick={() => backup('settings')}><Mark glyph="download" tone="green" size={40} glyphSize={20} /><div><strong>Export Settings</strong><span>Download current configuration</span></div></button>
              <button type="button" className="fe-qitem fe-qitem--danger" onClick={() => setConfirm('reset')}><Mark glyph="stop" tone="red" size={40} glyphSize={20} /><div><strong>Reset All Settings</strong><span>This will reset all settings to default</span></div></button>
            </div>
          </Card>
          <Card className="fe-status">
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
              <span style={{ color: '#2563eb', display: 'inline-flex' }}><Glyph name="info" size={36} /></span><h3 style={{ margin: 0, fontSize: '1.12rem' }}>System Information</h3>
            </div>
            <dl className="fe-sysinfo">
              <dt>App Version</dt><dd>v{info.version}</dd>
              <dt>Last Updated</dt><dd>{info.lastUpdated ? fmtDateTime(info.lastUpdated) : '—'}</dd>
              <dt>Updated By</dt><dd>{info.updatedBy || '—'}</dd>
              <dt>Total Fee Heads</dt><dd>{info.heads}</dd>
              <dt>Total Categories</dt><dd>{info.categories}</dd>
              <dt>Total Concessions</dt><dd>{info.concessions}</dd>
              <dt>Total Fine Rules</dt><dd>{info.fineRules}</dd>
              <dt>Next Receipt</dt><dd>{info.nextReceipt}</dd>
            </dl>
          </Card>
        </aside>
      </div>

      <Confirm open={confirm === 'reset'} onClose={() => setConfirm(null)} onConfirm={doReset} title="Reset all settings" confirmLabel="Reset"
        message="Put every fees setting back to its default? Receipt numbering carries on from where it is, so no receipt number is reused. Structures, heads, concessions and payments are not touched." />
      <CopyYearDialog open={copying} onClose={() => setCopying(false)} years={data.years} defaultTo={data.defaultYear?._id} />
    </div>
  );
}
