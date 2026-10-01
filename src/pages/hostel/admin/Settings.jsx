/**
 * Hostel → Settings (Sep 2026 redesign, to the user's mockup).
 *
 * Every rule the module enforces is set here and nowhere else — capacity,
 * gender, curfew, approvals, fines, SLAs, who hears about what (spec §28). Each
 * control maps 1:1 to a HostelSettings column; the server checks every value
 * again (ranges, times, the lists' allowed entries) and only the module's
 * admins may save, since these rules govern every hostel in the school.
 *
 * "General" shows every section at once, as the mockup does; the other tabs
 * show one section. Nothing is saved until Save Settings is pressed.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHead, Glyph, words, count as fmtCount } from './hsUI';
import { Kpis, Kpi, LineTabs, Btn, Popover, Ico } from './hsList';
import { stamp } from './hsTags';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SESSIONS = ['morning', 'evening', 'night', 'roll_call'];
const DOCS = ['id_proof', 'medical', 'parent_authorization', 'undertaking', 'agreement', 'admission', 'academic', 'photo', 'fee_receipt', 'other'];
const NOTIFY = ['notifyParentOnLeave', 'notifyParentOnOutpass', 'notifyParentOnLateReturn', 'notifyParentOnIncident',
  'notifyParentOnDiscipline', 'notifyOnFeeDue', 'notifyOnVisitor', 'emailNotifications'];
const TABS = [
  ['general', 'General', 'grid'], ['timings', 'Timings & Curfew', 'clock'], ['leave', 'Leave & Outpass', 'calendar'],
  ['fees', 'Fees & Fines', 'wallet'], ['admission', 'Admission', 'fileDoc'], ['attendance', 'Attendance', 'checkSquare'],
  ['complaints', 'Complaints & Mess', 'chat'], ['notifications', 'Notifications', 'bell'], ['advanced', 'Advanced', 'settings'],
];
/** "21:00" → "09:00 PM". */
const ampm = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return '—';
  const h = +m[1];
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

/* ── controls ─────────────────────────────────────────────────────────────── */
const Toggle = ({ on, onChange, label }) => (
  <button type="button" role="switch" aria-checked={!!on} aria-label={label} className={`hs-toggle${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}><i /></button>
);

/** Chips for a list setting, with a picker for what is not chosen yet. */
function Chips({ value = [], options, onChange, label, show = words }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const rest = options.filter((o) => !value.includes(o));
  return (
    <div className="hs-chipsel" ref={ref}>
      <div className="hs-chipsel__box">
        {value.length ? value.map((v) => (
          <span key={v} className="hs-chipsel__chip">{show(v)}
            <button type="button" aria-label={`Remove ${show(v)}`} onClick={() => onChange(value.filter((x) => x !== v))}><Ico name="close" size={12} /></button>
          </span>
        )) : <span className="hs-muted">None</span>}
        <button type="button" className="hs-chipsel__more" aria-haspopup="menu" aria-expanded={open} aria-label={`Add to ${label}`} disabled={!rest.length} onClick={() => setOpen((o) => !o)}>
          <Ico name="chevronDown" size={15} />
        </button>
      </div>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} label={label}>
        <div className="hs-menu2" role="menu">
          {rest.map((o) => (
            <button key={o} type="button" role="menuitem" className="hs-menu2__item" onClick={() => { onChange([...value, o]); setOpen(false); }}><span>{show(o)}</span></button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

function Card({ icon, tone, title, sub, children, className = '' }) {
  return (
    <section className={`hs-card hs-scard ${className}`}>
      <header className="hs-scard__head">
        <span className={`hs-scard__ico hs-pt-${tone}`}><Glyph name={icon} size={26} /></span>
        <div><h2>{title}</h2><p>{sub}</p></div>
      </header>
      <div className="hs-scard__body">{children}</div>
    </section>
  );
}

export default function Settings() {
  const { data, loading, refetch } = useFetch(api.getSettings, []);
  const { data: meta } = useFetch(api.getMeta, []);
  const { data: beds } = useFetch(() => api.getBoard('hostels', { limit: 1 }), []);
  const [form, setForm] = useState(null);
  const [tab, setTab] = useState('general');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm(data.data ?? data); }, [data]);
  const saved = data?.data ?? data;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = useMemo(() => !!form && !!saved && Object.keys(form).some((k) => JSON.stringify(form[k] ?? null) !== JSON.stringify(saved[k] ?? null)), [form, saved]);

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      for (const k of ['_id', 'school', 'createdAt', 'updatedAt', 'updatedBy']) delete payload[k];
      await api.updateSettings(payload);
      toast.success('Hostel settings saved');
      refetch();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  if (loading || !form) return <div className="hs-page"><p className="hs-muted" style={{ padding: 40 }}>Loading the settings…</p></div>;

  // Small builders, so each card reads like the form it is.
  const num = (k, label, hint, { min = 0, max, step = 1, wide } = {}) => (
    <label className={`hs-srow${wide ? ' is-wide' : ''}`} key={k}>
      <span>{label}</span>
      <span className="hs-srow__ctl">
        <input className="form-control" type="number" min={min} max={max} step={step} value={form[k] ?? ''}
          onChange={(e) => set(k, e.target.value === '' ? '' : Number(e.target.value))} />
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
  const time = (k, label, hint) => (
    <label className="hs-srow" key={k}>
      <span>{label}</span>
      <span className="hs-srow__ctl">
        <input className="form-control" type="time" value={form[k] || ''} onChange={(e) => set(k, e.target.value)} />
        {hint ? <small>{hint}</small> : null}
      </span>
    </label>
  );
  const flip = (k, label, hint, { right, dot } = {}) => (
    <div className={`hs-sflip${right ? ' is-right' : ''}`} key={k}>
      {right ? null : <Toggle on={form[k]} onChange={(v) => set(k, v)} label={label} />}
      <span>{dot ? <i className={`hs-sflip__dot hs-dot-${dot}`} /> : null}<span className="hs-sflip__label">{label}</span>{hint ? <small>{hint}</small> : null}</span>
      {right ? <Toggle on={form[k]} onChange={(v) => set(k, v)} label={label} /> : null}
    </div>
  );
  const chips = (k, label, options, hint, show) => (
    <div className="hs-srow is-stack" key={k}>
      <span>{label}</span>
      <span className="hs-srow__ctl"><Chips value={form[k] || []} options={options} onChange={(v) => set(k, v)} label={label} show={show} />{hint ? <small>{hint}</small> : null}</span>
    </div>
  );

  const cards = {
    capacity: (
      <Card key="capacity" icon="bedSolid" tone="indigo" title="Capacity & Allocation" sub="Define hostel and room capacity rules and allocation policies.">
        {num('maxHostelCapacity', 'Maximum hostel capacity', '0 means each hostel’s own capacity applies')}
        {num('maxRoomCapacity', 'Maximum room capacity', 'A room cannot be created above this limit', { min: 1, max: 100 })}
        {flip('enforceGenderRestriction', 'Enforce gender restriction', 'Check before every allocation')}
        {flip('allowOvercapacityAllocation', 'Allow allocation beyond capacity', 'Off keeps rooms and hostels within their limits')}
        {flip('autoAllocateOnApproval', 'Auto-allocate a bed on admission approval')}
        {flip('allowTransferBetweenHostels', 'Allow transfers between hostels')}
        {flip('transferRequiresApproval', 'Transfers need approval', 'A warden’s room change waits for a hostel administrator; administrators move residents directly')}
      </Card>
    ),
    timings: (
      <Card key="timings" icon="clockSolid" tone="violet" title="Timings & Curfew" sub="Configure hostel entry/exit timings, curfew and visitor hours." className="hs-scard--two">
        <div>
          {time('entryTime', 'Hostel entry time')}
          {time('exitTime', 'Hostel exit time')}
          {time('curfewTime', 'Curfew time', 'Movement after this is flagged and the warden alerted')}
        </div>
        <div>
          {time('visitorFrom', 'Visitors allowed from')}
          {time('visitorTo', 'Visitors allowed until')}
          {chips('visitorDays', 'Visiting days', DAYS, 'None chosen means any day', (d) => d)}
          {num('maxOutpassHours', 'Maximum outpass length (hours)', '', { min: 1, max: 72 })}
        </div>
      </Card>
    ),
    leave: (
      <Card key="leave" icon="plane" tone="green" title="Leave & Outpass Rules" sub="Configure leave and outpass request rules.">
        {flip('leaveRequiresParentApproval', 'Leave needs parent consent', '', { right: true, dot: 'lavender' })}
        {flip('outpassRequiresParentApproval', 'Outpass needs parent consent', 'A student’s pass waits for a parent, and must name a guardian contact', { right: true, dot: 'green' })}
        {flip('allowConcurrentLeaveAndOutpass', 'Allow leave and outpass at the same time', 'Off refuses an outpass while a student is on leave', { right: true, dot: 'amber' })}
        {num('maxLeaveDaysPerRequest', 'Maximum leave days per request', '', { min: 1, max: 365 })}
        {num('minLeaveNoticeDays', 'Minimum notice (days)', '', { max: 60 })}
        {num('maxOpenLeavesPerStudent', 'Open leave requests per student', '', { min: 1, max: 20 })}
      </Card>
    ),
    fees: (
      <Card key="fees" icon="rupee" tone="amber" title="Fees & Fines" sub="Set late-return and violation fines and fee posting rules." className="hs-scard--grid">
        {num('feeDueDayOfMonth', 'Fee due day of month', '', { min: 1, max: 28 })}
        {num('lateFeePerDay', 'Late fee per day (₹)')}
        {num('lateReturnGraceMinutes', 'Late-return grace (minutes)', '', { max: 600 })}
        {num('overdueAlertAfterMinutes', 'Mark overdue after (minutes)', '', { max: 1440 })}
        {num('curfewViolationFine', 'Curfew violation fine (₹)')}
        {num('lateFeeGraceDays', 'Late fee grace (days)', '', { max: 60 })}
        {num('securityDepositAmount', 'Security deposit (₹)', 'Billed once when a bed is given, settled at checkout. 0 takes none')}
        {num('lateReturnFine', 'Late-return fine (₹)', 'Above zero raises an invoice')}
        <div className="is-span">{flip('postToFeeLedger', 'Post hostel charges to the school fee ledger', 'Keeps the student’s overall fee position in one place')}</div>
        <div className="is-span">{flip('prorateFirstMonth', 'Bill the first month by the day', 'Someone who moves in part-way through a month pays for the days they stayed; off bills the whole month')}</div>
        <div className="is-span">{flip('autoApplyLateFees', 'Apply late fees automatically', 'Keeps the late fee on overdue invoices up to date every half hour; off leaves it to the Apply Late Fees button')}</div>
        {/* Stored as "charge teachers", shown the way a school thinks of it. */}
        <div className="is-span">
          <div className="hs-sflip">
            <Toggle on={!form.chargeTeachers} onChange={(v) => set('chargeTeachers', !v)} label="Hostel is free for teachers" />
            <span>
              <span className="hs-sflip__label">Hostel is free for teachers</span>
              <small>{form.chargeTeachers
                ? 'Off — teachers who live in the hostel are billed by the fee plans marked for teachers, and pay online or at the office like students'
                : 'On — a teacher can be given a bed, and no fee plan bills them'}</small>
            </span>
          </div>
        </div>
      </Card>
    ),
    admission: (
      <Card key="admission" icon="doc" tone="pink" title="Admission Settings" sub="Control hostel admission and document requirements.">
        {flip('admissionRequiresApproval', 'Applications need approval', '', { right: true, dot: 'lavender' })}
        {flip('allowStudentSelfApplication', 'Students may apply themselves', '', { right: true, dot: 'pink' })}
        {flip('allowParentApplication', 'Parents may apply', '', { right: true, dot: 'blue' })}
        {chips('requiredAdmissionDocuments', 'Required documents', DOCS, 'An application missing any of these cannot be approved without saying “approve anyway”')}
      </Card>
    ),
    attendance: (
      <Card key="attendance" icon="checkCircle" tone="green" title="Attendance Settings" sub="Configure hostel attendance rules.">
        {chips('attendanceSessions', 'Roll-call sessions', SESSIONS, 'The roll calls taken each day')}
        {flip('attendanceCorrectionNeedsApproval', 'Corrections need approval')}
        {num('attendanceCorrectionWindowDays', 'Correction window (days)', 'How far back a mark may be corrected', { max: 90 })}
        {flip('rollCallIncludesTeachers', 'Call teachers at roll call', 'Off leaves staff who live in the hostel off the attendance register')}
      </Card>
    ),
    complaints: (
      <Card key="complaints" icon="megaphone" tone="red" title="Complaints & Mess" sub="SLA and rules for complaints and mess attendance.">
        {num('complaintSlaHours', 'Complaint SLA (hours)', '', { min: 1, max: 720 })}
        {flip('complaintAutoEscalate', 'Escalate complaints that breach the SLA')}
        {flip('messAttendanceRequired', 'Meal attendance is required', 'A meal that ends with nothing recorded is chased with the mess in-charge the same day')}
        {num('messLeaveNoticeHours', 'Mess leave notice (hours)', 'How far ahead a resident must say they will skip a meal', { max: 168 })}
      </Card>
    ),
    notifications: (
      <Card key="notifications" icon="bell" tone="amber" title="Notifications" sub="Choose who gets notified about hostel activities." className="hs-scard--flips">
        {flip('notifyParentOnLeave', 'Parents on leave updates')}
        {flip('notifyParentOnDiscipline', 'Parents on disciplinary action')}
        {flip('notifyParentOnOutpass', 'Parents on outpass updates')}
        {flip('notifyOnFeeDue', 'Fee reminders')}
        {flip('notifyParentOnLateReturn', 'Parents on late return')}
        {flip('notifyOnVisitor', 'Visitor notifications')}
        {flip('notifyParentOnIncident', 'Parents on incidents')}
        {flip('emailNotifications', 'Send email as well as in-app')}
      </Card>
    ),
    advanced: (
      <Card key="advanced" icon="settings" tone="slate" title="Advanced" sub="The rules the everyday sections leave out.">
        {time('outpassFrom', 'Outpasses from', 'The earliest an outpass may start')}
        {time('outpassTo', 'Outpasses until', 'The latest an outpass may end')}
        {flip('autoGenerateMonthlyFees', 'Generate monthly fees automatically', 'Raises this month’s invoice for every monthly fee plan, once per resident; new residents are picked up within half an hour')}
        <label className="hs-srow">
          <span>Escalate breached complaints to</span>
          <span className="hs-srow__ctl">
            <select className="form-control" value={form.complaintEscalateTo || ''} onChange={(e) => set('complaintEscalateTo', e.target.value || null)}>
              <option value="">The hostel’s warden</option>
              {(meta?.staff || []).map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </span>
        </label>
        <p className="hs-muted">
          Changes apply to what happens next: requests already made keep the rules they were made under — a leave that needed parent
          consent still does if you switch it off now. Last saved {stamp(saved?.updatedAt) || 'never — these are the defaults'}.
        </p>
      </Card>
    ),
  };
  const TAB_CARDS = {
    timings: ['timings'], leave: ['leave'], fees: ['fees'], admission: ['admission'], attendance: ['attendance'],
    complaints: ['complaints'], notifications: ['notifications'], advanced: ['advanced'],
  };
  const hostels = meta?.hostels || [];
  const capacity = (beds?.data ?? beds)?.tiles?.beds;
  const onCount = NOTIFY.filter((k) => form[k]).length;

  return (
    <div className="hs-page hs-settings">
      <PageHead title="Hostel Settings" subtitle="Configure rules, timings, limits and notifications for hostel management. Changes apply across all hostels unless overridden.">
        {dirty ? (
          <span className="hs-settings__dirty">Unsaved changes
            <button type="button" className="hs-linkbtn" onClick={() => setForm(saved)}>Discard</button>
          </span>
        ) : null}
        <Btn kind="primary" icon="save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Settings'}</Btn>
      </PageHead>

      <Kpis cols={4}>
        <Kpi tone="indigo" icon="bedSolid" value={hostels.length} label="Hostels" note="Applying these settings" />
        <Kpi tone="green" icon="group" value={capacity ?? '—'} label="Total Capacity" note="Across all hostels" />
        <Kpi tone="violet" icon="clockSolid" value={`${ampm(form.entryTime)} – ${ampm(form.exitTime)}`} valueSize="1.15rem" label="Hostel Timings" note="Entry and exit time" />
        <Kpi tone="red" icon="bell" value={fmtCount(onCount)} label="Active Notifications" note={`${onCount} of ${NOTIFY.length} currently enabled`} />
      </Kpis>

      <LineTabs rule value={tab} onChange={setTab} label="Settings sections"
        items={TABS.map(([key, label, icon]) => ({ key, label, icon }))} />

      {tab === 'general' ? (
        <>
          <div className="hs-sgrid hs-sgrid--top">{cards.capacity}{cards.timings}</div>
          <div className="hs-sgrid">{cards.leave}{cards.fees}{cards.admission}</div>
          <div className="hs-sgrid">{cards.attendance}{cards.complaints}{cards.notifications}</div>
          <div className="hs-sgrid hs-sgrid--one">{cards.advanced}</div>
        </>
      ) : (
        <div className="hs-sgrid hs-sgrid--one">{(TAB_CARDS[tab] || []).map((k) => cards[k])}</div>
      )}
    </div>
  );
}
