import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/teacher.api';
import { Button, Modal, Confirm, Spinner, Empty } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { IconAction, MenuItem, RowActions, RowMenu } from '../admin/listParts';
import {
  CardHead, CompOffDrawer, DateRange, DialogHead, DialogNote, DropZone, FilterRow,
  FilterSelect, FormStep, InfoPanels, LeaveStat, LeaveStats, LedgerDrawer, Pager,
  RulesNote, STATUS, ShowingCount, SignOffStep, StatusBadge, SubTabs, SummaryLine,
  ThSub, WORK_TYPES, fmtDate, fmtHours, hoursBetween, weekdayOf,
  PhoneTable, WorkDateCell, EarnedCell, LayoutToggle, LeaveFoot, useLeaveTable, DocLink,
} from '../admin/leaveParts';

// Mounted as the "Comp Off" tab of pages/teacher/Leave.jsx — Comp Off stays
// inside Leave Management rather than becoming its own nav item.

const todayStr = () => new Date().toISOString().slice(0, 10);


const DAY_LABEL = {
  holiday: '🎉 Holiday', weekly_off: '🗓️ Weekly Off', sunday: '☀️ Sunday',
  working_day: '💼 Working Day', unknown: '❔ Unclassified',
};

// The six ledger entry types, in words and in the badge tones the rest of the
// module uses.
const ENTRY_LABEL = {
  EARNED: 'Earned', USED: 'Used', EXPIRED: 'Expired',
  CANCELLED: 'Cancelled', REVERSED: 'Reversed', ADJUSTMENT: 'Adjustment',
};
const ENTRY_TONE = {
  EARNED: 'approved', REVERSED: 'approved', USED: 'pending',
  EXPIRED: 'cancelled', CANCELLED: 'rejected', ADJUSTMENT: 'pending',
};

const EMPTY_FORM = { workDate: '', checkIn: '', checkOut: '', compOffDays: '', reason: '' };

export default function TeacherCompOff() {
  const [sub, setSub] = useState('overview');
  // The whole history in one call (the server caps it) — the tab filters and
  // pages it on screen. The default page of 20 used to hide everything older.
  const { data, loading, refetch } = useFetch(() => api.getMyCompOff({ limit: 500 }));

  const enabled  = data?.enabled !== false;
  const balance  = data?.balance;
  const drafts   = data?.drafts   || [];
  const requests = data?.requests || [];
  const policy   = data?.policy;

  // ── Apply (scenarios 1 & 2) ───────────────────────────────────────────────
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const docRef = useRef();
  const [docName, setDocName] = useState('');

  // The engine's figure when it has one, otherwise worked out from the times as
  // they are typed — so the box moves with the form rather than with the
  // network.
  const hoursWorked = preview?.workedHours > 0
    ? preview.workedHours
    : hoursBetween(form.checkIn, form.checkOut);
  // No times typed and nothing in the register: the claim has no hours, and
  // the server refuses it — say so before Submit.
  const fromAttendance = preview?.hoursSource === 'attendance';

  // "Fetch from Attendance" (Nov 26 2026): only where the SCHOOL runs the
  // Attendance module (the comp off answer says so — the user's own module
  // map is their designation's access, which a teacher without attendance
  // rights reads as off) — and it FILLS the times from the register; it used
  // to clear what you typed.
  const attendanceOn = data?.attendanceModule === true;
  const [fetchingAtt, setFetchingAtt] = useState(false);
  const hhmm = (t) => {
    const m = String(t || '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)?$/i);
    if (!m) return '';
    let h = Number(m[1]);
    if (m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  };
  const fetchFromAttendance = async () => {
    if (!form.workDate) { toast.error('Pick the work date first'); return; }
    setFetchingAtt(true);
    try {
      const res = await api.previewCompOffDate({ date: form.workDate });
      const d = res?.data ?? res;
      const inT = hhmm(d?.checkIn); const outT = hhmm(d?.checkOut);
      if (d?.hoursSource === 'attendance' && inT && outT) {
        setForm((f) => ({ ...f, checkIn: inT, checkOut: outT }));
        toast.success(`Times taken from your attendance: ${inT} – ${outT}`);
      } else {
        toast.error('No check-in and check-out is recorded in attendance for this date');
      }
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setFetchingAtt(false); }
  };

  // Live verdict from the same engine that will judge the submission, so the
  // employee is never surprised by a rejection they could have seen coming.
  useEffect(() => {
    if (!modal || !form.workDate) { setPreview(null); return; }
    let cancelled = false;
    api.previewCompOffDate({
      date: form.workDate,
      checkIn: form.checkIn || undefined,
      checkOut: form.checkOut || undefined,
    })
      .then(res => { if (!cancelled) setPreview(res?.data ?? res); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [modal, form.workDate, form.checkIn, form.checkOut]);

  const handleApply = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const file = docRef.current?.files?.[0];
      // The route has always run `uploadLeaveDoc.single('document')`, but this
      // form posted a plain object — so a supporting document could never
      // actually reach it. Multipart only when there is a file; a JSON body is
      // smaller and the server reads either.
      if (file) {
        const fd = new FormData();
        fd.append('workDate', form.workDate);
        if (form.checkIn)  fd.append('checkIn',  form.checkIn);
        if (form.checkOut) fd.append('checkOut', form.checkOut);
        fd.append('reason', form.reason);
        fd.append('document', file);
        await api.applyCompOff(fd);
      } else {
        // compOffDays is deliberately not sent: the policy works it out from
        // the hours, which is what the summary panel showed before submitting.
        await api.applyCompOff({
          workDate: form.workDate,
          checkIn:  form.checkIn  || undefined,
          checkOut: form.checkOut || undefined,
          reason:   form.reason,
        });
      }
      toast.success('Comp Off applied — awaiting approval');
      setModal(false); setForm(EMPTY_FORM); setPreview(null); setDocName('');
      if (docRef.current) docRef.current.value = '';
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  // ── Ready-to-apply drafts (scenario 3) ────────────────────────────────────
  const [applyDraft, setApplyDraft] = useState(null);
  const [draftReason, setDraftReason] = useState('');
  const [draftLoad, setDraftLoad] = useState(false);

  const submitDraft = async () => {
    setDraftLoad(true);
    try {
      await api.submitCompOffDraft(applyDraft._id, { reason: draftReason });
      toast.success('Applied — awaiting approval');
      setApplyDraft(null); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDraftLoad(false); }
  };

  // Withdrawing (or dismissing a suggested draft) asks first — one press on a
  // menu item used to take the claim out of the queue with no way back.
  const [withdrawItem, setWithdrawItem] = useState(null);
  const [withdrawLoad, setWithdrawLoad] = useState(false);
  const cancelRequest = (r) => setWithdrawItem(r);
  const confirmWithdraw = async () => {
    const r = withdrawItem;
    if (!r) return;
    setWithdrawLoad(true);
    try {
      await api.cancelCompOff(r._id);
      toast.success(r.isDraft ? 'Suggestion dismissed' : 'Comp Off request withdrawn');
      setWithdrawItem(null);
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setWithdrawLoad(false); }
  };

  // ── The list ────────────────────────────────────────────────────────────────
  // Everything arrives in one call, so the filters and the pager are worked out
  // here rather than being a round trip each — an employee's own Comp Off
  // history is a handful of rows, not a table.
  const [fStatus, setFStatus] = useState('');
  const [fType,   setFType]   = useState('');
  const [fFrom,   setFFrom]   = useState('');
  const [fTo,     setFTo]     = useState('');
  const [page,    setPage]    = useState(1);
  const [detail,  setDetail]  = useState(null);
  const view = useLeaveTable('my-compoff', { onReset: () => setPage(1) });
  const PAGE = view.limit;

  const anyFilter = !!(fStatus || fType || fFrom || fTo);
  const clearFilters = () => { setFStatus(''); setFType(''); setFFrom(''); setFTo(''); setPage(1); };
  const onFilter = (setter) => (v) => { setPage(1); setter(v); };

  const filtered = requests.filter((r) => {
    if (fStatus && r.status !== fStatus) return false;
    if (fType   && r.dayCategory !== fType) return false;
    const d = r.workDate ? String(r.workDate).slice(0, 10) : '';
    if (fFrom && d < fFrom) return false;
    if (fTo   && d > fTo)   return false;
    return true;
  });
  const pages   = Math.max(1, Math.ceil(filtered.length / PAGE));
  const pageNow = Math.min(page, pages);
  const shown   = filtered.slice((pageNow - 1) * PAGE, pageNow * PAGE);

  if (loading && !data) return <div className="lvtable__state"><Spinner /></div>;

  if (!enabled) {
    return (
      <section className="card lvcard">
        <div className="lvtable__state">
          <Empty icon="🕓" title="Comp Off is not available" message={data?.reason} />
        </div>
      </section>
    );
  }

  return (
    <>
      <LeaveStats>
        <LeaveStat valueFirst icon="calendarDays" tone="green" value={balance?.remaining ?? 0}
          label="Available" caption="Can be applied" />
        <LeaveStat valueFirst icon="checkCircle" tone="indigo" value={balance?.totalAllocated ?? 0}
          label="Earned" caption="From extra working days" />
        <LeaveStat valueFirst icon="logOut" tone="slate" value={balance?.used ?? 0}
          label="Used" caption="Already availed" />
        <LeaveStat valueFirst icon="clock" tone="amber" value={balance?.pending ?? 0}
          label="Pending" caption="Awaiting approval" />
        <LeaveStat valueFirst icon="closeCircle" tone="red" value={balance?.expired ?? 0}
          label="Expired" caption="No longer valid" />
      </LeaveStats>

      {/* ── Ready to apply — raised for you from approved attendance ── */}
      {drafts.length > 0 && (
        <section className="card lvcard lvdrafts">
          <CardHead icon="sparkle" title={`Ready to apply (${drafts.length})`}
            subtitle="Your approved attendance on these days qualifies. Your balance is credited only after an approver signs off." />
          <div className="lvdraftgrid">
            {drafts.map((d) => (
              <div className="lvdraft" key={d._id}>
                <div className="lvdraft__head">
                  <div>
                    <b>{fmtDate(d.workDate)}</b>
                    <small>{WORK_TYPES[d.dayCategory] || d.dayCategory}{d.dayLabel ? ` · ${d.dayLabel}` : ''}</small>
                  </div>
                  <div className="lvdraft__days">
                    <strong>{d.compOffDays}</strong>
                    <small>day{Number(d.compOffDays) === 1 ? '' : 's'}</small>
                  </div>
                </div>
                <p className="lvdraft__hours">
                  {d.checkIn || '—'} → {d.checkOut || '—'} · {d.workedHours} hour(s)
                </p>
                <div className="lvdraft__acts">
                  <Button onClick={() => { setDraftReason(d.reason || ''); setApplyDraft(d); }}>Apply</Button>
                  <Button variant="secondary" onClick={() => cancelRequest({ ...d, status: 'pending', isDraft: true })}>Dismiss</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="lvtabrow">
        <SubTabs value={sub} onChange={setSub} tabs={[
          { value: 'overview', label: 'My Requests', icon: 'fileCheck' },
          { value: 'ledger',   label: 'Ledger',      icon: 'clipboard' },
        ]} />
        <Button onClick={() => { setForm(EMPTY_FORM); setDocName(''); setModal(true); }}>
          <Icon name="plus" size={16} /> Apply Comp Off
        </Button>
      </div>

      {sub === 'overview' && (
        <section className="card lvcard">
          <FilterRow>
            <FilterSelect label="Filter by status" value={fStatus} all="All Statuses"
              options={['draft', 'pending', 'approved', 'rejected', 'cancelled', 'expired']
                .map((v) => ({ value: v, label: STATUS[v]?.label || v }))}
              onChange={onFilter(setFStatus)} />
            <DateRange from={fFrom} to={fTo} onFrom={onFilter(setFFrom)} onTo={onFilter(setFTo)} />
            <FilterSelect label="Filter by work type" value={fType} all="All Work Types"
              options={Object.entries(WORK_TYPES).map(([v, l]) => ({ value: v, label: l }))}
              onChange={onFilter(setFType)} />
            <span className="lvfilters__sep" />
            <Button variant="secondary" onClick={clearFilters} disabled={!anyFilter}>
              <Icon name="refresh" size={16} /> Reset
            </Button>
            <LayoutToggle value={view.cards ? 'card' : view.layout} onChange={view.setLayout} />
          </FilterRow>

          {!shown.length ? (
            <div className="lvtable__state">
              <Empty icon="🕓"
                title={anyFilter ? 'No requests match' : 'No Comp Off requests yet'}
                message={anyFilter
                  ? 'Try another status, work type or date range.'
                  : 'Claim a day you worked outside your normal schedule and it appears here.'}
                action={anyFilter
                  ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
                  : <Button onClick={() => { setForm(EMPTY_FORM); setDocName(''); setModal(true); }}>+ Apply Comp Off</Button>} />
            </div>
          ) : (
            <PhoneTable title="Work Date" side="Status" keep={['Comp Off', 'Credited On']} {...view.table}>
              <table className="lvtable">
                <thead>
                  <tr>
                    <th className="lvt-num">#</th>
                    {/* The second line of each cell is named under the heading,
                        so a two-line cell does not have to be decoded. */}
                    <ThSub sub="Reason">Work Date</ThSub>
                    <ThSub sub="Days" className="lvt-total">Comp Off</ThSub>
                    <th className="lvt-status">Status</th>
                    <ThSub sub="Valid Till" className="lvt-applied">Credited On</ThSub>
                    <th className="lvt-reason">Admin Comment</th>
                    <th className="lvt-acts">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    // data-focus-id so a comp-off notification can flag the request it
                    // names — see hooks/useFocusHighlight.js.
                    <tr key={r._id} data-focus-id={r._id}>
                      <td className="lvt-num">{(pageNow - 1) * PAGE + i + 1}</td>
                      <td>
                        <div className="lvperiod">
                          <span>{fmtDate(r.workDate)}</span>
                          <small>
                            {WORK_TYPES[r.dayCategory] || r.dayCategory}
                            {r.reason ? ` · ${r.reason}` : ''}
                          </small>
                          <DocLink name={r.document} />
                        </div>
                      </td>
                      <td className="lvt-total">
                        {r.compOffDays} day{Number(r.compOffDays) === 1 ? '' : 's'}
                      </td>
                      <td className="lvt-status">
                        <div className="lvstatuscell">
                          <StatusBadge status={r.status} />
                          <SignOffStep request={r} />
                        </div>
                      </td>
                      <td className="lvt-applied">
                        {r.creditedDays > 0 ? (
                          <div className="lvperiod">
                            <span>{fmtDate(r.creditedAt || r.approvedAt)}</span>
                            {/* The expiry is the thing to act on — credited days
                                that lapse unused are simply lost. */}
                            {r.expiresAt && <small>Valid till {fmtDate(r.expiresAt)}</small>}
                          </div>
                        ) : <span className="lvmuted">—</span>}
                      </td>
                      <td className="lvt-reason">
                        {r.adminComment
                          ? <div className="lvreason" title={r.adminComment}><span>{r.adminComment}</span></div>
                          : <span className="lvmuted">—</span>}
                      </td>
                      <td className="lvt-acts">
                        <RowActions>
                          <IconAction icon="eye" label="View this Comp Off request"
                            onClick={() => setDetail(r)} />
                          {/* No "View full request" here — the eye beside it
                              already opens the whole record. */}
                          {r.status === 'pending' && (
                            <RowMenu>
                              <MenuItem icon="close" danger onClick={() => cancelRequest(r)}>
                                Withdraw request
                              </MenuItem>
                            </RowMenu>
                          )}
                        </RowActions>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PhoneTable>
          )}

          <LeaveFoot view={view} page={pageNow} count={shown.length} total={filtered.length}
            pages={filtered.length ? pages : 0} onPage={setPage} />
        </section>
      )}

      {sub === 'ledger' && <MyLedger />}

      <InfoPanels items={[
        { icon: 'info', tone: 'indigo', title: 'How Comp Off Works',
          text: 'Extra working days (e.g., on holidays or special events) are credited as Comp Off, which can be availed later.' },
        { icon: 'calendarDays', tone: 'blue', title: 'Validity',
          text: policy?.validityDays > 0
            ? `Comp Off is valid for ${policy.validityDays} days from the day it is credited. Expired Comp Off cannot be used.`
            : 'Comp Off is valid till the specified date. Expired Comp Off cannot be used.' },
        { icon: 'files', tone: 'green', title: 'Need Help?',
          text: 'If you find any discrepancy, please contact the school admin.' },
      ]} />

      <CompOffDrawer
        request={detail}
        onClose={() => setDetail(null)}
        onWithdraw={(r) => { setDetail(null); cancelRequest(r); }}
      />

      {/* ── Apply modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} maxWidth={900}
        title={<DialogHead icon="clock" title="Apply for Comp Off"
          subtitle="Convert your eligible working hours into a comp off leave." />}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="co-form" type="submit" loading={saving}
            disabled={preview ? preview.eligible === false : false}>
            <Icon name="arrowRight" size={16} /> Submit for Approval
          </Button>
        </>}>
        <DialogNote>Comp off will be credited as per school policy and subject to approval.</DialogNote>

        <div className="lvapply">
          <form id="co-form" className="lvapply__form" onSubmit={handleApply} noValidate>

            <FormStep n={1} title="Work Details" note="Enter the date and hours you worked.">
              <label className="lvfield">
                <span className="lvfield__label">Work Date <i>*</i></span>
                <input type="date" className="form-control" required value={form.workDate}
                  max={policy?.advanceCompOffAllowed ? undefined : todayStr()}
                  onChange={(e) => setForm((f) => ({ ...f, workDate: e.target.value }))} />
                {/* Which day of the week it was is half the reason a claim is
                    valid at all — a Saturday earns, a Tuesday usually does not. */}
                {form.workDate && <span className="lvfield__hint">{weekdayOf(form.workDate)}</span>}
              </label>

              <div className="lvpolrow lvpolrow--2">
                <label className="lvfield">
                  <span className="lvfield__label">Check In</span>
                  <input type="time" className="form-control" value={form.checkIn}
                    onChange={(e) => setForm((f) => ({ ...f, checkIn: e.target.value }))} />
                </label>
                <label className="lvfield">
                  <span className="lvfield__label">Check Out</span>
                  <input type="time" className="form-control" value={form.checkOut}
                    onChange={(e) => setForm((f) => ({ ...f, checkOut: e.target.value }))} />
                </label>
              </div>

              <div className="lvhours">
                <span className="lvhours__mark"><Icon name="clock" size={20} /></span>
                <div className="lvhours__body">
                  <small>Total Hours Worked</small>
                  <b>{fmtHours(hoursWorked)}</b>
                </div>
                {/* The hours work themselves out from the times; this only
                    fetches the times your attendance recorded for the date. */}
                {attendanceOn && (
                  <Button type="button" variant="secondary" loading={fetchingAtt}
                    disabled={!form.workDate} onClick={fetchFromAttendance}>
                    <Icon name="clock" size={15} /> Fetch from Attendance
                  </Button>
                )}
              </div>
              <p className="lvfield__hint">
                {form.checkIn || form.checkOut
                  ? 'The hours are worked out from these times, and decide what this day earns under the school policy.'
                  : fromAttendance
                    ? `From your attendance for this date: ${preview.checkIn} – ${preview.checkOut}. Enter times above to override it.`
                    : attendanceOn
                      ? 'No attendance is recorded for this date — enter the times you worked.'
                      : 'Enter the times you worked — the hours are worked out from them.'}
              </p>

              {preview && preview.eligible === false && (
                <div className="lvnotice lvnotice--warn lvnotice--flat">
                  <Icon name="alert" size={15} />
                  <span>{preview.message}</span>
                </div>
              )}
            </FormStep>

            <FormStep n={2} title={<>Reason <i className="lvstar" aria-label="required">*</i></>} note="Tell us what you worked on that day.">
              <textarea className="form-control" rows={3} required maxLength={200}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                placeholder="E.g. Annual day preparation, extra classes, exam duty, etc." />
              <div className="lvcount">
                <span />
                <span>{form.reason.length} / 200</span>
              </div>
            </FormStep>

            <FormStep n={3} title={<>Supporting Document <i className="lvopt">(Optional)</i></>}
              note="Upload any relevant document (e.g. duty order, event schedule).">
              <DropZone
                inputRef={docRef}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                hint="PDF, Word, or image (JPG, PNG) — max 5 MB"
                fileName={docName}
                onPick={() => setDocName(docRef.current?.files?.[0]?.name || '')}
              />
            </FormStep>
          </form>

          <aside className="lvapply__side">
            <div className="lvsumhead">
              <span className="lvsumhead__mark"><Icon name="calendarDays" size={20} /></span>
              <b>Comp Off Summary</b>
            </div>

            <div className="lvsumlines">
              <SummaryLine label="Work Date"
                value={form.workDate
                  ? `${fmtDate(form.workDate)} (${weekdayOf(form.workDate).slice(0, 3)})`
                  : '—'} />
              <SummaryLine label="Check In"  value={form.checkIn  || (fromAttendance ? preview.checkIn : '—')} />
              <SummaryLine label="Check Out" value={form.checkOut || (fromAttendance ? preview.checkOut : '—')} />
              <SummaryLine label="Total Hours" value={fmtHours(hoursWorked)} />
              {/* The engine's own verdict, not a guess — the same call that
                  will judge the submission. */}
              <SummaryLine lead label="Eligible Comp Off"
                value={preview?.compOffDays != null
                  ? `${preview.compOffDays} day${preview.compOffDays === 1 ? '' : 's'}`
                  : '—'} />
            </div>
            <p className="lvsumnote">Based on school policy</p>

            {policy && (
              <RulesNote title="Important" items={[
                policy.halfDayHours > 0 && `Minimum ${policy.halfDayHours} hours = Half day comp off`,
                policy.fullDayHours > 0 && `Minimum ${policy.fullDayHours} hours = Full day comp off`,
                policy.applyWithinDays > 0 && `Apply within ${policy.applyWithinDays} days of the work date`,
                policy.approval?.twoLevel
                  ? 'Needs two sign-offs before anything is credited'
                  : 'Subject to approval by the school admin',
                policy.validityDays > 0
                  ? `Credited days lapse after ${policy.validityDays} days`
                  : 'Comp off expiry as per school policy',
              ]} />
            )}
          </aside>
        </div>
      </Modal>

      {/* ── Draft confirmation ── */}
      <Modal open={!!applyDraft} onClose={() => setApplyDraft(null)} title="Apply for Comp Off"
        footer={<>
          <Button variant="secondary" onClick={() => setApplyDraft(null)}>Cancel</Button>
          <Button onClick={submitDraft} loading={draftLoad}>Apply</Button>
        </>}>
        {applyDraft && (
          <div>
            <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '12px 16px', fontSize: '.85rem', marginBottom: 12, lineHeight: 1.8 }}>
              <div><strong>Date:</strong> {fmtDate(applyDraft.workDate)}</div>
              <div><strong>Day:</strong> {DAY_LABEL[applyDraft.dayCategory] || applyDraft.dayCategory}{applyDraft.dayLabel ? ` — ${applyDraft.dayLabel}` : ''}</div>
              <div><strong>Attendance:</strong> {applyDraft.checkIn || '—'} → {applyDraft.checkOut || '—'}</div>
              <div><strong>Hours worked:</strong> {applyDraft.workedHours}</div>
              <div><strong>Comp Off:</strong> {applyDraft.compOffDays} day(s)</div>
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <textarea className="form-control" rows={3} value={draftReason}
                onChange={e => setDraftReason(e.target.value)} />
            </div>
            <div className="alert alert-info" style={{ fontSize: '.82rem' }}>
              Applying sends this for approval. Your Comp Off balance is credited only once it is approved.
            </div>
          </div>
        )}
      </Modal>

      {/* ── Withdraw / dismiss, asked first ── */}
      <Confirm open={!!withdrawItem} onClose={() => { if (!withdrawLoad) setWithdrawItem(null); }}
        onConfirm={confirmWithdraw} loading={withdrawLoad}
        title={withdrawItem?.isDraft ? 'Dismiss this suggestion?' : 'Withdraw Comp Off request?'}
        confirmLabel={withdrawItem?.isDraft ? 'Dismiss' : 'Withdraw'}
        message={withdrawItem
          ? (withdrawItem.isDraft
            ? `Dismiss the suggested Comp Off for ${fmtDate(withdrawItem.workDate)}? It will not be sent for approval.`
            : `Withdraw your Comp Off request for ${fmtDate(withdrawItem.workDate)}`
              + `${withdrawItem.compOffDays ? ` (${withdrawItem.compOffDays} day${Number(withdrawItem.compOffDays) === 1 ? '' : 's'})` : ''}?`
              + ' It leaves the approval queue and no days are credited for it.')
          : ''} />
    </>
  );
}

// ── My ledger ───────────────────────────────────────────────────────────────
/**
 * The employee's own Comp Off ledger.
 *
 * Every movement of every day, in order — what was credited, what was spent,
 * what lapsed, and what the balance stood at afterwards. It answers the one
 * question the requests list cannot: "why is my figure what it is?"
 */
function MyLedger() {
  const { data, loading } = useFetch(() => api.getMyCompOffLedger());
  const [fType, setFType] = useState('');
  const [page,  setPage]  = useState(1);
  const [detail, setDetail] = useState(null);
  const view = useLeaveTable('my-compoff-ledger', { onReset: () => setPage(1) });
  const PAGE = view.limit;

  if (loading && !data) return <div className="lvtable__state"><Spinner /></div>;
  if (data?.enabled === false) {
    return (
      <section className="card lvcard">
        <div className="lvtable__state">
          <Empty icon="🕓" title="Comp Off is not available" message={data.reason} />
        </div>
      </section>
    );
  }

  const all = data?.entries || [];
  // The whole year arrives in one call (the endpoint caps at 200), so the
  // filter and the pager are worked out here rather than being a round trip.
  const rows    = fType ? all.filter((e) => e.entryType === fType) : all;
  const pages   = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageNow = Math.min(page, pages);
  const shown   = rows.slice((pageNow - 1) * PAGE, pageNow * PAGE);

  // Only the kinds this employee actually has, so the filter never offers one
  // that would empty the table.
  const kinds = [...new Set(all.map((e) => e.entryType))];

  return (
    <section className="card lvcard">
      <CardHead icon="clipboard" title="Comp Off Ledger"
        subtitle={`Every credit, spend and expiry${data?.academicYear ? ` in ${data.academicYear}` : ''}, newest first.`}>
        {kinds.length > 1 && (
          <FilterSelect label="Filter by entry type" value={fType} all="All entry types"
            options={kinds.map((v) => ({ value: v, label: ENTRY_LABEL[v] || v }))}
            onChange={(v) => { setFType(v); setPage(1); }} />
        )}
        <LayoutToggle value={view.cards ? 'card' : view.layout} onChange={view.setLayout} />
      </CardHead>

      {!shown.length ? (
        <div className="lvtable__state">
          <Empty icon="📒"
            title={fType ? 'No entries of that kind' : 'Nothing in your ledger yet'}
            message={fType
              ? 'Try another entry type.'
              : 'The first entry is written the moment a Comp Off request of yours is approved.'}
            action={fType
              ? <Button variant="secondary" onClick={() => { setFType(''); setPage(1); }}>Clear filter</Button>
              : null} />
        </div>
      ) : (
        <PhoneTable title="Entry" keep={['When', 'Days', 'Balance After']} {...view.table}>
          <table className="lvtable">
            <thead>
              <tr>
                <th className="lvt-num">#</th>
                <th className="lvt-applied">When</th>
                <th className="lvt-dept">Entry</th>
                <th className="lvt-cell">Days</th>
                <th className="lvt-total">Balance After</th>
                <ThSub sub="Valid Till" className="lvt-dept">Lot</ThSub>
                <th className="lvt-reason">Description</th>
                <th className="lvt-acts">Actions</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r._id} data-focus-id={r._id}>
                  <td className="lvt-num">{(pageNow - 1) * PAGE + i + 1}</td>
                  <td className="lvt-applied">{fmtDate(r.createdAt)}</td>
                  <td className="lvt-dept">
                    <span className={`lvbadge is-${ENTRY_TONE[r.entryType] || 'cancelled'}`}>
                      {ENTRY_LABEL[r.entryType] || r.entryType}
                    </span>
                  </td>
                  {/* The sign is the whole meaning of a ledger row — +1 and −1
                      are opposite facts, so it is never dropped. */}
                  <td className="lvt-cell">
                    <strong className={r.delta >= 0 ? 'lvup' : 'lvdown'}>
                      {r.delta >= 0 ? '+' : ''}{r.delta}
                    </strong>
                  </td>
                  <td className="lvt-total">{r.balanceAfter}</td>
                  <td className="lvt-dept">
                    {r.entryType === 'EARNED' || r.remainingDays > 0
                      ? <span className="lvlot">
                          {r.remainingDays}/{r.days} left
                          {r.expiresAt ? <small>{fmtDate(r.expiresAt)}</small> : null}
                        </span>
                      : <span className="lvmuted">—</span>}
                  </td>
                  <td className="lvt-reason">
                    <div className="lvreason" title={r.description || ''}>
                      <span>{r.description || '—'}</span>
                    </div>
                  </td>
                  <td className="lvt-acts">
                    <RowActions>
                      <IconAction icon="eye"
                        label={`View this ${(ENTRY_LABEL[r.entryType] || r.entryType).toLowerCase()} entry`}
                        onClick={() => setDetail(r)} />
                    </RowActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </PhoneTable>
      )}

      <LeaveFoot view={view} page={pageNow} count={shown.length} total={rows.length}
        noun="entry" plural="entries" pages={rows.length ? pages : 0} onPage={setPage} />

      <LedgerDrawer
        entry={detail}
        labels={ENTRY_LABEL}
        tones={ENTRY_TONE}
        onClose={() => setDetail(null)}
      />
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Approvals queue — only rendered for designation-based approvers
//  (e.g. a Principal), who are teachers and so have no admin screen.
// ════════════════════════════════════════════════════════════════════════════
export function TeacherCompOffApprovals() {
  // Approvers by designation, on the same kit as the office's queue. The
  // server only answers an approver, never lists one's own claims, and marks
  // each row it lets this user decide (`canDecide`).
  const [status, setStatus] = useState('pending');
  const [page,   setPage]   = useState(1);
  const view = useLeaveTable('compoff-approvals', { onReset: () => setPage(1) });
  const PAGE_SIZE = view.limit;
  const { data, loading, refetch } = useFetch(
    () => api.getCompOffApprovals({ status: status || undefined, page, limit: PAGE_SIZE }),
    [status, page, PAGE_SIZE],
  );
  const [detail,  setDetail]  = useState(null);
  const [action,  setAction]  = useState(null);   // { type, request }
  const [comment, setComment] = useState('');
  const [busy,    setBusy]    = useState(false);
  const items = data?.items || [];

  const ask = (type, request) => { setComment(''); setAction({ type, request }); };
  const run = async () => {
    setBusy(true);
    try {
      const { type, request } = action;
      if (type === 'approve') {
        const res = await api.approveCompOff(request._id, { comment });
        const d = res?.data ?? res;
        toast.success(d.pendingLevels > 0
          ? `Approval recorded — ${d.pendingLevels} more sign-off needed before crediting`
          : `Approved — ${d.credited} day(s) credited`);
      } else {
        await api.rejectCompOff(request._id, { comment });
        toast.success('Rejected — no balance credited');
      }
      setAction(null); setDetail(null); setComment(''); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setBusy(false); }
  };

  if (loading && !data) return <div className="lvtable__state"><Spinner /></div>;
  if (data?.enabled === false) {
    return (
      <section className="card lvcard">
        <div className="lvtable__state"><Empty icon="🕓" title="Comp Off is not available" message={data.reason} /></div>
      </section>
    );
  }
  const rejecting = action?.type === 'reject';

  return (
    <>
      <section className="card lvcard">
        <CardHead icon="checkSquare" title="Comp Off Approvals"
          subtitle="Claims for days worked, from colleagues whose comp off you approve" />
        <FilterRow>
          <FilterSelect label="Filter by status" value={status} all="All statuses"
            options={[
              { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' }, { value: 'cancelled', label: 'Cancelled' },
              { value: 'expired', label: 'Expired' },
            ]}
            onChange={(v) => { setPage(1); setStatus(v); }} />
          <LayoutToggle value={view.cards ? 'card' : view.layout} onChange={view.setLayout} />
        </FilterRow>

        {!items.length ? (
          <div className="lvtable__state">
            <Empty icon="✅" title={status === 'pending' ? 'Nothing waiting for you' : 'No claims match'}
              message={status === 'pending' ? 'New comp off claims land here.' : 'Try another status.'} />
          </div>
        ) : (
          <PhoneTable title="Employee" side="Status" keep={['Work Date', 'Comp Off']} {...view.table}>
            <table className="lvtable">
              <thead>
                <tr>
                  <th className="lvt-num">#</th>
                  <th>Employee</th>
                  <th>Work Date</th>
                  <th>Day</th>
                  <th>Comp Off</th>
                  <th>Status</th>
                  <th>Reason</th>
                  <th className="lvt-acts">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r, i) => (
                  <tr key={r._id} data-focus-id={r._id}>
                    <td className="lvt-num">{((data?.page || page) - 1) * PAGE_SIZE + i + 1}</td>
                    <td>
                      <div className="lvwho"><div>
                        <b>{r.teacher?.name || '—'}</b>
                        {r.teacher?.employeeId ? <small>{r.teacher.employeeId}</small> : null}
                      </div></div>
                    </td>
                    <td><WorkDateCell request={r} /></td>
                    <td>{DAY_LABEL[r.dayCategory] || r.dayCategory || '—'}</td>
                    <td><EarnedCell request={r} /></td>
                    <td><StatusBadge status={r.status} /><SignOffStep request={r} /></td>
                    <td className="lvt-reason"><div className="lvreason" title={r.reason || ''}><span>{r.reason || '—'}</span></div></td>
                    <td className="lvt-acts">
                      <div className="lvrowacts">
                        {r.status === 'pending' && r.canDecide !== false && (
                          <div className="lvacts">
                            <button type="button" className="lvbtn lvbtn--approve" onClick={() => ask('approve', r)}>Approve</button>
                            <button type="button" className="lvbtn lvbtn--reject" onClick={() => ask('reject', r)}>Reject</button>
                          </div>
                        )}
                        <RowActions>
                          <IconAction icon="eye" label="View claim" onClick={() => setDetail(r)} />
                        </RowActions>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PhoneTable>
        )}
        <LeaveFoot view={view} page={data?.page || page} count={items.length} total={data?.total ?? items.length}
          noun="claim" pages={items.length ? (data?.pages || 1) : 0} onPage={setPage} />
      </section>

      <CompOffDrawer request={detail ? { ...detail, canWithdraw: false } : null} onClose={() => setDetail(null)}
        onDecide={(kind, r) => { if (kind === 'approve' || kind === 'reject') ask(kind, r); }} busy={busy} />

      <Modal open={!!action} onClose={() => setAction(null)}
        title={action?.type === 'approve' ? 'Approve Comp Off' : 'Reject Comp Off'}
        footer={<>
          <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button variant={action?.type === 'approve' ? 'success' : 'danger'} onClick={run} loading={busy}
            disabled={rejecting && !comment.trim()}>
            {action?.type === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </>}>
        {action && (
          <>
            <div className="lvdec__card">
              <b>{action.request.teacher?.name}</b>
              <span>{fmtDate(action.request.workDate)} · {action.request.compOffDays} day(s)</span>
              {action.request.workedHours > 0 && <span>{action.request.workedHours} hour(s) worked</span>}
              {action.request.reason ? <em>“{action.request.reason}”</em> : null}
            </div>
            <label className="lvdec__label" htmlFor="co-decision-comment">
              {rejecting ? <>Reason <i className="lvstar" aria-label="required">*</i></> : <>Comment <span>(optional)</span></>}
            </label>
            <textarea id="co-decision-comment" className="form-control" rows={3} value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={rejecting ? 'Why is this being rejected?' : 'Anything the employee should know…'} />
          </>
        )}
      </Modal>
    </>
  );
}
