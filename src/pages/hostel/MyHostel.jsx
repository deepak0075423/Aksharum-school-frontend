import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as hostelApi from '../../api/hostel.api';
import { useAuth } from '../../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Spinner } from '../../components/ui/index';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../components/ui/Drawer';
import { PassQr, Attachments, dt, today, openHostelFile } from './shared';
import { PageHead, Mark } from './admin/hsUI';
import { Btn, LineTabs, fmtDate, fmtTime } from './admin/hsList';
import {
  Status, ChildSwitch, ResidentHero, HeadlineKpis, OverviewTab, AttendanceTab, LeaveTab, OutpassTab, VisitorsTab, MessTab,
  ComplaintsTab, RecordTab, ApplicationCard, NotResident, HistoryCard, awaitingParent,
} from './residentParts';
import { FormModal, FormSection, Grid, Fld, RadioCards, FileDrop, PersonCard, SummaryCard, InfoNote, ReviewList, ConfirmDialog, dmy, ampm } from './admin/hsForm';
import PhoneInput from '../../components/ui/PhoneInput';
import { words } from './admin/hsUI';
import MyHostelFees from './MyHostelFees';

const LEAVE_TYPES = ['home', 'weekend', 'short', 'medical', 'emergency', 'holiday', 'other'];
/** The outpass form's four cards; "Other" opens the rest of the types. */
const KINDS = [['day', 'Day Out'], ['night', 'Overnight'], ['weekend', 'Weekend'], ['other', 'Other']];
const KIND_LABEL = { day: 'Day Out', night: 'Overnight', weekend: 'Weekend' };
const OTHER_TYPES = ['medical', 'emergency', 'academic', 'market', 'other'];
const ROOM_TYPES = ['single', 'double', 'triple', 'four_bed', 'dormitory'];
const ID_TYPES = ['aadhaar', 'pan', 'driving_license', 'voter_id', 'passport', 'other'];
const VISITOR_TYPES = ['Parent', 'Guardian', 'Relative', 'Friend', 'Other'];

const TABS = [
  { key: 'overview', label: 'Overview' }, { key: 'attendance', label: 'Attendance' }, { key: 'leave', label: 'Leave' },
  { key: 'outpass', label: 'Outpass' }, { key: 'visitors', label: 'Visitors' }, { key: 'mess', label: 'Mess' },
  { key: 'fees', label: 'Fees' }, { key: 'complaints', label: 'Complaints' }, { key: 'record', label: 'Record' },
];

const blankLeave = { leaveType: 'home', span: 'multiple', fromDate: '', toDate: '', reason: '', destination: '', guardianName: '', guardianPhone: '', guardianRelation: '', attachments: [] };
const blankOutpass = () => ({ kind: 'day', outpassType: 'day', purpose: '', destination: '', departureDate: today(), expectedDepartureTime: '', expectedReturnDate: today(), expectedReturnTime: '', guardianName: '', guardianPhone: '', guardianRelation: '', attachments: [] });
const blankVisitor = { visitorName: '', mobile: '', relationship: '', visitorCount: 1, purpose: '', scheduledAt: '', idProofType: '', idProofNumber: '' };
const blankComplaint = { category: 'room', priority: 'medium', subject: '', description: '', attachments: [] };
const blankApply = { hostel: '', academicYear: '', preferredRoomType: '', joiningDate: '', expectedLeavingDate: '', reason: '', medicalInfo: '', specialRequirements: '',
  guardianName: '', guardianPhone: '', guardianRelation: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '' };
const joinWho = (name, relation, phone) => [name, relation && `(${relation})`, phone].filter(Boolean).join(' ');
const when = (d, t) => [dmy(d), ampm(t)].filter(Boolean).join(', ');
/** "Room 101", whether the school stored "101" or "Room 101". */
const roomNo = (n) => (n ? (/^room\b/i.test(String(n)) ? String(n) : `Room ${n}`) : '');
const COMPLAINT_CATS = ['room', 'mess', 'cleaning', 'security', 'maintenance', 'food', 'facilities', 'internet', 'other'];

/**
 * The resident's own hostel screen, shared by the student and parent portals —
 * and by a teacher who lives in the hostel, who is a resident like any other.
 * `role` decides which API surface is used; everything a parent sees is scoped
 * server-side to the children on their profile.
 */
export default function MyHostel({ role = 'student' }) {
  const api = role === 'parent' ? hostelApi.parent : role === 'teacher' ? hostelApi.teacher : hostelApi.student;
  const staff = role === 'teacher';
  const { user } = useAuth();

  // The open tab lives in the address (?tab=fees), so a notification or the
  // dashboard can link straight to it and Back returns to the previous one.
  const [sp, setSp] = useSearchParams();
  const tab = TABS.some((t) => t.key === sp.get('tab')) ? sp.get('tab') : 'overview';
  const setTab = (t) => setSp((prev) => { const n = new URLSearchParams(prev); if (t === 'overview') n.delete('tab'); else n.set('tab', t); return n; });
  const [ask, setAsk] = useState(null);             // { kind: 'leave' | 'outpass' | 'reopen', row } — waiting on a yes
  const [detail, setDetail] = useState(null);       // { kind: 'leave' | 'outpass' | 'complaint', row }
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoad] = useState(true);
  const [children, setChildren] = useState([]);
  const [child, setChild] = useState('');
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);
  const [lists, setLists] = useState({});
  const [available, setAvailable] = useState([]);
  const [years, setYears] = useState([]);
  const [pass, setPass] = useState(null);

  const [leaveForm, setLeaveForm] = useState(blankLeave);
  const [outForm, setOutForm] = useState(blankOutpass);
  const [visitorForm, setVisitorForm] = useState(blankVisitor);
  const [complaintForm, setComplaintForm] = useState(blankComplaint);
  const [applyForm, setApplyForm] = useState(blankApply);
  const [roomForm, setRoomForm] = useState({ reason: '', preference: '' });
  const [skipping, setSkipping] = useState('');     // "2026-10-03:lunch" while that cell is saving
  const setL = (k, v) => setLeaveForm((f) => ({ ...f, [k]: v }));
  const setO = (k, v) => setOutForm((f) => ({ ...f, [k]: v }));
  const setV = (k, v) => setVisitorForm((f) => ({ ...f, [k]: v }));
  const setC = (k, v) => setComplaintForm((f) => ({ ...f, [k]: v }));
  const setA = (k, v) => setApplyForm((f) => ({ ...f, [k]: v }));

  // Parents pick which child they are looking at.
  useEffect(() => {
    if (role !== 'parent') return;
    hostelApi.parent.children()
      .then((r) => {
        const list = r.data ?? r;
        setChildren(list);
        if (list.length && !child) setChild(list[0]._id);
      })
      .catch(() => setChildren([]));
  }, [role]); // eslint-disable-line

  const q = role === 'parent' && child ? { student: child } : undefined;

  const load = useCallback(async () => {
    if (role === 'parent' && !child) return;
    setLoad(true);
    try {
      const r = await api.myHostel(q);
      setData(r.data ?? r);
    } catch (err) {
      if (err.status !== 404) toast.error(err.message);
      setData(null);
    } finally { setLoad(false); }
  }, [role, child]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  // Each tab pulls only what it needs.
  const loadTab = useCallback(async (t) => {
    const fetchers = {
      attendance: () => api.attendance(q),
      leave: () => api.leaves(q),
      outpass: () => api.outpasses(q),
      visitors: () => api.visitors(q),
      complaints: () => api.complaints(q),
      mess: () => api.mess(q),
      record: () => api.record(q),
    };
    if (!fetchers[t]) return;
    try {
      const r = await fetchers[t]();
      setLists((l) => ({ ...l, [t]: r.data ?? r }));
    } catch (err) { toast.error(err.message); }
  }, [api, child]); // eslint-disable-line
  useEffect(() => { loadTab(tab); }, [tab, loadTab]);

  // Each form opens blank, with the guardian from the parent's profile filled in.
  const withGuardian = (f) => ({ ...f, guardianName: data?.guardian?.name || '', guardianPhone: data?.guardian?.phone || '', guardianRelation: data?.guardian?.relation || '' });
  const openForm = (kind) => {
    if (kind === 'leave') setLeaveForm(withGuardian(blankLeave));
    if (kind === 'outpass') setOutForm(withGuardian(blankOutpass()));
    if (kind === 'visitor') setVisitorForm(blankVisitor);
    if (kind === 'complaint') setComplaintForm(blankComplaint);
    setModal(kind);
  };
  // A parent's upload is filed against the child they are looking at.
  const upload = (fd) => { if (q?.student) fd.append('student', q.student); return api.uploadAttachment(fd); };

  const openApply = async () => {
    setApplyForm(withGuardian(blankApply));
    setModal('apply');
    try {
      const r = await api.hostels(q);
      const d = r.data ?? r;
      setAvailable(d.hostels || []);
      setYears(d.academicYears || []);
      setApplyForm((f) => ({
        ...f,
        academicYear: (d.academicYears || []).find((y) => y.status === 'active')?._id
          || d.academicYears?.[0]?._id || '',
      }));
    } catch { setAvailable([]); setYears([]); }
  };

  const submit = async (kind) => {
    setSaving(true);
    try {
      if (kind === 'leave') {
        const { span, ...body } = leaveForm;
        await api.applyLeave({ ...body, toDate: span === 'single' ? body.fromDate : body.toDate, ...(q || {}) });
        toast.success('Leave requested'); loadTab('leave');
      }
      if (kind === 'outpass') {
        const { kind: k, ...body } = outForm;
        await api.applyOutpass({ ...body, outpassType: k === 'other' ? body.outpassType : k, ...(q || {}) });
        toast.success('Outpass requested'); loadTab('outpass');
      }
      if (kind === 'visitor') { await api.requestVisitor({ ...visitorForm, ...(q || {}) }); toast.success('Visitor pre-registered'); loadTab('visitors'); }
      if (kind === 'complaint') { await api.raiseComplaint({ ...complaintForm, ...(q || {}) }); toast.success('Complaint raised'); loadTab('complaints'); }
      if (kind === 'apply') { await api.apply({ ...applyForm, ...(q || {}) }); toast.success('Application filed'); load(); }
      setModal(null);
      if (kind !== 'apply') load();             // the headline figures move with every request
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const cancelLeave = async (id) => {
    try { await api.actOnLeave(id, { action: 'cancel' }); toast.success('Cancelled'); loadTab('leave'); }
    catch (err) { toast.error(err.message); }
  };
  const consent = async (id, approve) => {
    try {
      await api.actOnLeave(id, { action: approve ? 'parent_approve' : 'parent_reject' });
      toast.success(approve ? 'Consent recorded' : 'Declined');
      loadTab('leave');
    } catch (err) { toast.error(err.message); }
  };
  /** A parent agrees to, or declines, a child's outpass (where the school asks for consent). */
  const consentOutpass = async (id, approve) => {
    try {
      await hostelApi.parent.actOnOutpass(id, { action: approve ? 'parent_approve' : 'parent_reject', ...(q || {}) });
      toast.success(approve ? 'Consent recorded — the warden can now approve it' : 'Outpass declined');
      setDetail(null); loadTab('outpass'); load();
    } catch (err) { toast.error(err.message); }
  };
  /** "I will not be at this meal", or taking that back. */
  const skipMeal = async (date, meal, undo) => {
    setSkipping(`${date}:${meal}`);
    try {
      await api.skipMeal({ date, meal, undo, ...(q || {}) });
      toast.success(undo ? 'You are back on the list for that meal' : 'The mess has been told');
      await loadTab('mess');
    } catch (err) { toast.error(err.message); } finally { setSkipping(''); }
  };
  const requestRoomChange = async () => {
    setSaving(true);
    try {
      await api.roomChange({ ...roomForm, ...(q || {}) });
      toast.success('Room change requested — the hostel office will decide');
      setModal(null); load();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const cancelOutpass = async (id) => {
    try { await api.cancelOutpass(id); toast.success('Cancelled'); loadTab('outpass'); }
    catch (err) { toast.error(err.message); }
  };
  /** The destructive ones wait for a yes (see the ConfirmDialog at the foot of the page). */
  const doAsk = async () => {
    const { kind, row } = ask;
    setBusy(true);
    try {
      if (kind === 'leave') await cancelLeave(row._id);
      if (kind === 'outpass') await cancelOutpass(row._id);
      if (kind === 'reopen') {
        await api.actOnComplaint(row._id, { action: 'reopen', comment: 'Reopened by resident' });
        toast.success('Complaint reopened'); loadTab('complaints');
      }
      setAsk(null); setDetail(null); load();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  /** A reply or a rating on the resident's own complaint; the open panel shows the result. */
  const complaintAct = async (row, body, done) => {
    setBusy(true);
    try {
      const r = await api.actOnComplaint(row._id, body);
      setDetail({ kind: 'complaint', row: { ...row, ...(r.data ?? r), assignedTo: row.assignedTo } });
      setReply(''); toast.success(done); loadTab('complaints');
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const showPass = async (id) => {
    try { const r = await api.outpassPass(id); setPass(r.data ?? r); }
    catch (err) { toast.error(err.message); }
  };

  if (loading && !data) return <div className="hs-page hsr"><div className="hsr-loading"><Spinner /></div></div>;

  const who = role === 'parent' ? (children.find((c) => c._id === child)?.name || 'your child') : 'you';
  const st = data?.student;
  const stClass = [st?.profile?.currentClass?.className, st?.profile?.currentSection?.sectionName].filter(Boolean).join(' - ');
  const person = (badge, extra) => (st ? (
    <PersonCard name={st.name} photo={st.profileImage} badge={badge}
      meta={staff ? [st.staff?.employeeId, st.staff?.designation || 'Teacher', extra]
        : [st.profile?.admissionNumber && `Adm. No. ${st.profile.admissionNumber}`, stClass, extra]} />
  ) : null);

  // ── Not a resident ─────────────────────────────────────────────────────────
  if (!data?.resident) {
    const pending = (data?.admissions || []).find((a) => ['applied', 'pending_approval', 'waitlisted'].includes(a.status));
    return (
      <div className="hs-page hsr">
        <PageHead title="Hostel" subtitle={role === 'parent' ? `Hostel accommodation for ${who}.` : staff ? 'Staff accommodation in the school hostel.' : 'Your hostel accommodation.'}>
          {role === 'parent' && children.length > 1 ? <ChildSwitch kids={children} value={child} onChange={setChild} /> : null}
        </PageHead>
        <div className="hsr-body">
          {pending ? <ApplicationCard application={pending} /> : <NotResident staff={staff} canApply={!!data?.canApply} onApply={openApply} />}
          {data?.admissions?.length ? <HistoryCard rows={data.admissions} /> : null}
          {/* Someone who has moved out may still owe, or want a receipt. */}
          <MyHostelFees student={q?.student} payerName={user?.name} who={who} hideWhenEmpty />
        </div>

        <FormModal open={modal === 'apply'} onClose={() => setModal(null)} busy={saving} onSubmit={() => submit('apply')}
          icon="fileDoc" title="New Hostel Application"
          subtitle={role === 'parent' ? `Apply for hostel accommodation for ${who}.` : 'Apply for hostel accommodation with all required details.'}
          submitLabel="Submit Application" submitIcon="check"
          steps={[
            { key: 'stay', title: 'Hostel & Stay', sub: 'Hostel, year and dates', icon: 'oBuilding' },
            { key: 'contacts', title: 'Contacts', sub: 'Guardian and emergency details', icon: 'phone' },
            { key: 'health', title: 'Health & Requirements', sub: 'Medical info and special needs', icon: 'oHeart' },
            { key: 'review', title: 'Review', sub: 'Verify and submit application', icon: 'oCheckRound' },
          ]}>
          <FormSection step="stay" icon="oBuilding" title="Hostel & Stay" sub="Choose the hostel and academic year, and when the stay begins.">
            {person('Applicant', null)}
            <Grid cols={2}>
              <Fld label="Hostel" required icon="oBuilding" hintTone={available.length ? undefined : 'bad'}
                hint={available.length ? 'Only hostels you are eligible for are listed' : 'No hostel is open to applications right now'}>
                <select value={applyForm.hostel} onChange={(e) => setA('hostel', e.target.value)}>
                  <option value="">Select hostel</option>
                  {available.map((h) => <option key={h._id} value={h._id}>{h.name} — {h.availableBeds} bed{h.availableBeds === 1 ? '' : 's'} free</option>)}
                </select>
              </Fld>
              <Fld label="Academic Year" required icon="calendar">
                <select value={applyForm.academicYear} onChange={(e) => setA('academicYear', e.target.value)}>
                  <option value="">Select year</option>
                  {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
                </select>
              </Fld>
              <Fld label="Joining Date" optional icon="calendar"><input type="date" value={applyForm.joiningDate} onChange={(e) => setA('joiningDate', e.target.value)} /></Fld>
              <Fld label="Expected Leaving Date" icon="calendar" hint="Leave blank if not known">
                <input type="date" min={applyForm.joiningDate || undefined} value={applyForm.expectedLeavingDate} onChange={(e) => setA('expectedLeavingDate', e.target.value)} />
              </Fld>
              <Fld label="Preferred Room Type" icon="oBed">
                <select value={applyForm.preferredRoomType} onChange={(e) => setA('preferredRoomType', e.target.value)}>
                  <option value="">No preference</option>
                  {ROOM_TYPES.map((t) => <option key={t} value={t}>{words(t)}</option>)}
                </select>
              </Fld>
              <Fld label="Reason for Applying" optional icon="fileDoc">
                <input value={applyForm.reason} maxLength={200} placeholder="e.g. Lives far from school" onChange={(e) => setA('reason', e.target.value)} />
              </Fld>
            </Grid>
          </FormSection>
          <FormSection step="contacts" icon="phone" title="Contacts" sub="The guardian is filled in from the parent's record; change it if needed.">
            <Grid cols={3}>
              <Fld label="Guardian Name" icon="user"><input value={applyForm.guardianName} maxLength={80} placeholder="Enter guardian name" onChange={(e) => setA('guardianName', e.target.value)} /></Fld>
              <Fld label="Guardian Phone" icon="phone"><PhoneInput value={applyForm.guardianPhone} placeholder="Enter phone number" onChange={(e) => setA('guardianPhone', e.target.value)} /></Fld>
              <Fld label="Relation" icon="users"><input value={applyForm.guardianRelation} maxLength={30} placeholder="e.g. Father, Mother" onChange={(e) => setA('guardianRelation', e.target.value)} /></Fld>
              <Fld label="Emergency Contact" icon="user"><input value={applyForm.emergencyContactName} maxLength={80} placeholder="Enter name" onChange={(e) => setA('emergencyContactName', e.target.value)} /></Fld>
              <Fld label="Emergency Phone" icon="phone"><PhoneInput value={applyForm.emergencyContactPhone} placeholder="Enter phone number" onChange={(e) => setA('emergencyContactPhone', e.target.value)} /></Fld>
              <Fld label="Relation" icon="users"><input value={applyForm.emergencyContactRelation} maxLength={30} placeholder="e.g. Uncle, Aunt" onChange={(e) => setA('emergencyContactRelation', e.target.value)} /></Fld>
            </Grid>
            {!data?.guardian ? <InfoNote tone="amber">No parent is linked to this student yet, so there was nothing to fill in. Enter the guardian here.</InfoNote> : null}
          </FormSection>
          <FormSection step="health" icon="oHeart" title="Health & Special Requirements" sub="Anything the warden should know.">
            <Grid cols={2}>
              <Fld label="Medical Information" icon="oHeart" count={[applyForm.medicalInfo.length, 500]}>
                <textarea rows={2} maxLength={500} value={applyForm.medicalInfo} placeholder="Any medical conditions, allergies or regular medication" onChange={(e) => setA('medicalInfo', e.target.value)} />
              </Fld>
              <Fld label="Special Requirements" optional icon="fileDoc" count={[applyForm.specialRequirements.length, 500]}>
                <textarea rows={2} maxLength={500} value={applyForm.specialRequirements} placeholder="Dietary needs, accessibility, etc." onChange={(e) => setA('specialRequirements', e.target.value)} />
              </Fld>
            </Grid>
          </FormSection>
          <FormSection step="review" icon="oCheckRound" title="Review" sub="Verify the application before it is submitted.">
            <ReviewList groups={[
              { title: 'Hostel & stay', step: 0, rows: [['Student', st?.name], ['Hostel', available.find((h) => h._id === applyForm.hostel)?.name],
                ['Academic year', years.find((y) => y._id === applyForm.academicYear)?.yearName], ['Joining', dmy(applyForm.joiningDate)], ['Leaving', dmy(applyForm.expectedLeavingDate)],
                ['Room type', applyForm.preferredRoomType ? words(applyForm.preferredRoomType) : 'No preference'], ['Reason', applyForm.reason]] },
              { title: 'Contacts', step: 1, rows: [['Guardian', joinWho(applyForm.guardianName, applyForm.guardianRelation, applyForm.guardianPhone)],
                ['Emergency', joinWho(applyForm.emergencyContactName, applyForm.emergencyContactRelation, applyForm.emergencyContactPhone)]] },
              { title: 'Health', step: 2, rows: [['Medical', applyForm.medicalInfo], ['Special requirements', applyForm.specialRequirements]] },
            ]} />
            <InfoNote>The hostel office reviews every application. You will be told when it is approved and a bed is allotted.</InfoNote>
          </FormSection>
        </FormModal>
      </div>
    );
  }

  // ── Resident ───────────────────────────────────────────────────────────────
  const c = data.current;
  const rules = data.rules || {};
  const leaveDays = (() => {
    const f = leaveForm.fromDate; const t = leaveForm.span === 'single' ? f : leaveForm.toDate;
    const n = f && t ? Math.round((new Date(t) - new Date(f)) / 864e5) + 1 : 0;
    return n > 0 ? n : 0;
  })();
  const outType = outForm.kind === 'other' ? words(outForm.outpassType) : KIND_LABEL[outForm.kind];
  const roomLine = [c.hostel?.name, roomNo(c.room?.roomNumber)].filter(Boolean).join(' · ');
  // A student names a guardian; a member of staff, someone to reach in an emergency.
  const contact = staff ? 'Emergency Contact' : 'Guardian';
  const stats = data.stats || {};
  const tabItems = TABS.map((t) => ({
    ...t,
    count: { leave: stats.pendingLeaves, outpass: stats.openOutpasses, fees: stats.dueInvoices, complaints: stats.openComplaints }[t.key] || undefined,
    tone: t.key === 'fees' && stats.overdueInvoices ? 'bad' : t.key === 'complaints' ? 'warn' : 'info',
  }));
  const openFile = (doc) => openHostelFile(doc.storedName);

  return (
    <div className="hs-page hsr">
      <PageHead title={role === 'parent' ? `${who}'s Hostel` : 'My Hostel'}
        subtitle={role === 'parent' ? 'Room, attendance, leave, fees and everything else about your child\'s stay.' : 'Your room, attendance, leave, fees and everything else about your stay.'}>
        {role === 'parent' && children.length > 1 ? <ChildSwitch kids={children} value={child} onChange={setChild} /> : null}
        <Btn icon="umbrella" onClick={() => openForm('leave')}>Request Leave</Btn>
        <Btn kind="primary" icon="logOut" onClick={() => openForm('outpass')}>Request Outpass</Btn>
      </PageHead>

      <ResidentHero st={st} c={c} staff={staff} />
      <HeadlineKpis stats={stats} onTab={setTab} />
      <LineTabs items={tabItems} value={tab} onChange={setTab} rule label="Hostel sections" />

      <div className="hsr-body">
        {tab === 'overview' && <OverviewTab data={data} who={who} onRoomChange={() => { setRoomForm({ reason: '', preference: '' }); setModal('roomChange'); }} />}
        {tab === 'attendance' && <AttendanceTab att={lists.attendance} />}
        {tab === 'leave' && <LeaveTab rows={lists.leave} role={role} onNew={() => openForm('leave')} onConsent={consent}
          onCancel={(row) => setAsk({ kind: 'leave', row })} onOpen={(row) => setDetail({ kind: 'leave', row })} />}
        {tab === 'outpass' && <OutpassTab rows={lists.outpass} role={role} onNew={() => openForm('outpass')} onPass={showPass} onConsent={consentOutpass}
          onCancel={(row) => setAsk({ kind: 'outpass', row })} onOpen={(row) => setDetail({ kind: 'outpass', row })} />}
        {tab === 'visitors' && <VisitorsTab data={lists.visitors} rules={rules} onNew={() => openForm('visitor')} />}
        {tab === 'mess' && <MessTab data={lists.mess} onSkip={skipMeal} busy={skipping} />}
        {tab === 'fees' && <MyHostelFees student={q?.student} payerName={user?.name} who={who} onChanged={load} />}
        {tab === 'complaints' && <ComplaintsTab rows={lists.complaints} onNew={() => openForm('complaint')}
          onReopen={(row) => setAsk({ kind: 'reopen', row })} onOpen={(row) => setDetail({ kind: 'complaint', row })} />}
        {tab === 'record' && <RecordTab data={lists.record} who={who} onFile={openFile} />}
      </div>

      {/* ── Request forms ─────────────────────────────────────────────────── */}
      <FormModal open={modal === 'leave'} onClose={() => setModal(null)} busy={saving} onSubmit={() => submit('leave')}
        icon="calendar" title="File Hostel Leave"
        subtitle={role === 'parent' ? `Request hostel leave for ${who}.` : 'Request leave from the hostel with all required details.'}
        submitLabel="Submit Leave" submitIcon="check"
        steps={[
          { key: 'details', title: 'Leave Details', sub: 'Basic leave information', icon: 'fileDoc' },
          { key: 'more', title: 'Additional Information', sub: 'Destination and contact details', icon: 'mapPin' },
          { key: 'docs', title: 'Documents', sub: 'Upload supporting documents', icon: 'paperclip' },
          { key: 'review', title: 'Review', sub: 'Verify and submit', icon: 'oCheckRound' },
        ]}>
        <InfoNote>
          Leave requests are approved by the warden{role === 'parent' ? '; a request filed by a parent needs no separate parent consent' : ''}.
          Your allocation and the hostel&apos;s leave rules are checked when you submit.
        </InfoNote>
        <FormSection step="details" icon="calendar" title="Leave Details" sub="Choose the kind of leave and the dates.">
          {person('Resident', roomLine)}
          <Grid cols={2}>
            <Fld label="Leave Type" required icon="home">
              <select value={leaveForm.leaveType} onChange={(e) => setL('leaveType', e.target.value)}>
                {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t === 'home' ? 'Home Leave' : words(t)}</option>)}
              </select>
            </Fld>
            <RadioCards half label="Leave Duration" value={leaveForm.span} onChange={(v) => setLeaveForm((f) => ({ ...f, span: v, toDate: v === 'single' ? '' : f.toDate }))}
              options={[['single', 'Single Day'], ['multiple', 'Multiple Days']]} />
            <Fld label="From Date" required icon="calendar"><input type="date" value={leaveForm.fromDate} onChange={(e) => setL('fromDate', e.target.value)} /></Fld>
            <Fld label="To Date" required={leaveForm.span === 'multiple'} icon="calendar" hint={leaveDays ? `${leaveDays} day${leaveDays === 1 ? '' : 's'}` : ''}>
              <input type="date" disabled={leaveForm.span === 'single'} min={leaveForm.fromDate || undefined}
                value={leaveForm.span === 'single' ? leaveForm.fromDate : leaveForm.toDate} onChange={(e) => setL('toDate', e.target.value)} />
            </Fld>
          </Grid>
          <Fld label="Reason for Leave" required count={[leaveForm.reason.length, 500]}>
            <textarea rows={2} maxLength={500} value={leaveForm.reason} placeholder="Enter reason for leave (e.g., vacation, family function, medical, etc.)" onChange={(e) => setL('reason', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection step="more" icon="mapPin" title={`Destination & ${contact} Details`} sub="Where you will be staying, and who to contact.">
          <Fld label="Destination / Address" required count={[leaveForm.destination.length, 200]}>
            <textarea rows={2} maxLength={200} value={leaveForm.destination} placeholder="Enter destination address" onChange={(e) => setL('destination', e.target.value)} />
          </Fld>
          <Grid cols={3}>
            <Fld label={`${contact} Name`} required={!staff} icon="user"><input value={leaveForm.guardianName} maxLength={80} placeholder={`Enter ${contact.toLowerCase()} name`} onChange={(e) => setL('guardianName', e.target.value)} /></Fld>
            <Fld label={`${contact} Phone`} required={!staff} icon="phone"><PhoneInput value={leaveForm.guardianPhone} placeholder="Enter phone number" onChange={(e) => setL('guardianPhone', e.target.value)} /></Fld>
            <Fld label="Relation" required={!staff} icon="users"><input value={leaveForm.guardianRelation} maxLength={30} placeholder={staff ? 'e.g. Spouse, Brother' : 'e.g. Father, Mother, Uncle'} onChange={(e) => setL('guardianRelation', e.target.value)} /></Fld>
          </Grid>
        </FormSection>
        <FormSection step="docs" icon="paperclip" title={<>Supporting Documents <small className="hsf-opt">(Optional)</small></>} sub="Upload any relevant documents (e.g., parent consent, medical note).">
          <FileDrop value={leaveForm.attachments} onChange={(v) => setL('attachments', v)} entityType="HostelLeave" upload={upload} />
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Verify the leave before it is submitted.">
          <ReviewList groups={[
            { title: 'Leave', step: 0, rows: [['Type', leaveForm.leaveType === 'home' ? 'Home Leave' : words(leaveForm.leaveType)],
              ['Dates', leaveForm.fromDate ? `${dmy(leaveForm.fromDate)}${leaveForm.span === 'multiple' && leaveForm.toDate ? ` – ${dmy(leaveForm.toDate)}` : ''}` : ''],
              ['Days', leaveDays || ''], ['Reason', leaveForm.reason]] },
            { title: `Destination & ${contact.toLowerCase()}`, step: 1, rows: [['Destination', leaveForm.destination], [contact, joinWho(leaveForm.guardianName, leaveForm.guardianRelation, leaveForm.guardianPhone)]] },
            { title: 'Documents', step: 2, rows: [['Files', leaveForm.attachments.length ? `${leaveForm.attachments.length} attached` : 'None']] },
          ]} />
        </FormSection>
      </FormModal>

      <FormModal open={modal === 'outpass'} onClose={() => setModal(null)} busy={saving} onSubmit={() => submit('outpass')}
        icon="oExit" title="New Outpass Request"
        subtitle={role === 'parent' ? `Request an outpass for ${who}.` : 'Request permission to leave the hostel for a few hours or a night.'}
        submitLabel="Submit Request" submitIcon="check"
        steps={[
          { key: 'details', title: 'Outpass Details', sub: 'Set purpose, type and timing', icon: 'calendar' },
          { key: 'dest', title: 'Destination & Contact', sub: 'Where you are going', icon: 'mapPin' },
          { key: 'docs', title: 'Documents', sub: 'Upload supporting documents', icon: 'paperclip' },
          { key: 'review', title: 'Review', sub: 'Verify and submit', icon: 'oCheckRound' },
        ]}
        aside={<>
          <SummaryCard icon="fileDoc" title="Outpass Summary" sub="Review the details before submitting" rows={[
            ['Student', st?.name], ['Room', roomLine], ['Outpass Type', outType],
            ['Departure', when(outForm.departureDate, outForm.expectedDepartureTime)], ['Expected Return', when(outForm.expectedReturnDate, outForm.expectedReturnTime)],
            ['Destination', outForm.destination], [contact, outForm.guardianName], ['Purpose', outForm.purpose],
          ]} />
          <InfoNote title="Hostel Rules">
            {rules.outpassFrom && rules.outpassTo ? `Outpasses may start between ${ampm(rules.outpassFrom)} and ${ampm(rules.outpassTo)}` : 'Outpasses follow the hostel timings'}
            {rules.maxOutpassHours ? ` and last up to ${rules.maxOutpassHours} hour${rules.maxOutpassHours === 1 ? '' : 's'}` : ''}. The warden approves each request.
          </InfoNote>
        </>}>
        <FormSection step="details" icon="calendar" title="Outpass Details" sub="Choose the type, the timing and the reason.">
          {person('Resident', roomLine)}
          <RadioCards label="Outpass Type" required cols={4} value={outForm.kind} options={KINDS}
            onChange={(v) => setOutForm((f) => ({ ...f, kind: v, outpassType: v === 'other' ? 'other' : v, expectedReturnDate: v === 'day' ? f.departureDate : f.expectedReturnDate }))} />
          {outForm.kind === 'other' ? (
            <Grid cols={2}>
              <Fld label="Kind of Outpass" required icon="oTag">
                <select value={outForm.outpassType} onChange={(e) => setO('outpassType', e.target.value)}>
                  {OTHER_TYPES.map((v) => <option key={v} value={v}>{v === 'other' ? 'Personal' : words(v)}</option>)}
                </select>
              </Fld>
            </Grid>
          ) : null}
          <Grid cols={4} className="is-compact">
            <Fld label="Departure Date" required>
              <input type="date" min={today()} value={outForm.departureDate} onChange={(e) => { const v = e.target.value; setOutForm((f) => ({ ...f, departureDate: v, expectedReturnDate: f.kind === 'day' || !f.expectedReturnDate || f.expectedReturnDate < v ? v : f.expectedReturnDate })); }} />
            </Fld>
            <Fld label="Departure Time" required><input type="time" value={outForm.expectedDepartureTime} onChange={(e) => setO('expectedDepartureTime', e.target.value)} /></Fld>
            <Fld label="Expected Return Date" required>
              <input type="date" min={outForm.departureDate || undefined} disabled={outForm.kind === 'day'} value={outForm.expectedReturnDate} onChange={(e) => setO('expectedReturnDate', e.target.value)} />
            </Fld>
            <Fld label="Expected Return Time" required><input type="time" value={outForm.expectedReturnTime} onChange={(e) => setO('expectedReturnTime', e.target.value)} /></Fld>
          </Grid>
          <Fld label="Purpose / Reason" required count={[outForm.purpose.length, 500]}>
            <textarea rows={2} maxLength={500} value={outForm.purpose} placeholder="Enter reason for outpass (e.g., family function, medical, personal work, etc.)" onChange={(e) => setO('purpose', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection step="dest" icon="mapPin" title={`Destination & ${contact} Details`} sub="Where you are going, and who to contact.">
          <Fld label="Destination / Address" required count={[outForm.destination.length, 200]}>
            <textarea rows={2} maxLength={200} value={outForm.destination} placeholder="Enter full destination address" onChange={(e) => setO('destination', e.target.value)} />
          </Fld>
          <Grid cols={3}>
            <Fld label={`${contact} Name`} required={!staff} icon="user"><input value={outForm.guardianName} maxLength={80} placeholder={`Enter ${contact.toLowerCase()} name`} onChange={(e) => setO('guardianName', e.target.value)} /></Fld>
            <Fld label={`${contact} Phone`} required={!staff} icon="phone"><PhoneInput value={outForm.guardianPhone} placeholder="Enter phone number" onChange={(e) => setO('guardianPhone', e.target.value)} /></Fld>
            <Fld label="Relation" required={!staff} icon="users"><input value={outForm.guardianRelation} maxLength={30} placeholder={staff ? 'e.g. Spouse, Brother' : 'e.g. Father, Mother, Uncle'} onChange={(e) => setO('guardianRelation', e.target.value)} /></Fld>
          </Grid>
        </FormSection>
        <FormSection step="docs" icon="paperclip" title={<>Supporting Documents <small className="hsf-opt">(Optional)</small></>} sub="Upload any relevant documents (e.g., parent consent, medical note).">
          <FileDrop value={outForm.attachments} onChange={(v) => setO('attachments', v)} entityType="HostelOutpass" upload={upload} />
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Verify the outpass before it is submitted.">
          <ReviewList groups={[
            { title: 'Outpass', step: 0, rows: [['Type', outType], ['Departure', when(outForm.departureDate, outForm.expectedDepartureTime)],
              ['Return', when(outForm.expectedReturnDate, outForm.expectedReturnTime)], ['Purpose', outForm.purpose]] },
            { title: `Destination & ${contact.toLowerCase()}`, step: 1, rows: [['Destination', outForm.destination], [contact, joinWho(outForm.guardianName, outForm.guardianRelation, outForm.guardianPhone)]] },
            { title: 'Documents', step: 2, rows: [['Files', outForm.attachments.length ? `${outForm.attachments.length} attached` : 'None']] },
          ]} />
        </FormSection>
      </FormModal>

      <datalist id="hs-my-visitor-types">{VISITOR_TYPES.map((x) => <option key={x} value={x} />)}</datalist>
      <FormModal open={modal === 'visitor'} onClose={() => setModal(null)} busy={saving} onSubmit={() => submit('visitor')} width={680}
        icon="walker" title="Pre-register a Visitor" subtitle="Tell the hostel who is coming; the warden still approves each visit."
        submitLabel="Register Visitor" submitIcon="check">
        <InfoNote>
          Visitors are received {(rules.visitorDays || []).join(', ') || 'any day'}
          {rules.visitorFrom && rules.visitorTo ? ` between ${ampm(rules.visitorFrom)} and ${ampm(rules.visitorTo)}` : ''}.
        </InfoNote>
        <FormSection icon="user" title="Visitor Details" sub="The person the gate should expect.">
          <Grid cols={2}>
            <Fld label="Visitor Name" required icon="user"><input value={visitorForm.visitorName} maxLength={80} placeholder="Full name" onChange={(e) => setV('visitorName', e.target.value)} /></Fld>
            <Fld label="Mobile" icon="phone"><PhoneInput value={visitorForm.mobile} placeholder="Enter mobile number" onChange={(e) => setV('mobile', e.target.value)} /></Fld>
            <Fld label="Relationship" icon="users"><input list="hs-my-visitor-types" value={visitorForm.relationship} maxLength={30} placeholder="e.g. Parent" onChange={(e) => setV('relationship', e.target.value)} /></Fld>
            <Fld label="Expected At" icon="clock" hint="Checked against visiting hours">
              <input type="datetime-local" value={visitorForm.scheduledAt} onChange={(e) => setV('scheduledAt', e.target.value)} />
            </Fld>
          </Grid>
          <Grid cols={3}>
            <Fld label="Number of Visitors" icon="users"><input type="number" min="1" max="20" value={visitorForm.visitorCount} onChange={(e) => setV('visitorCount', e.target.value)} /></Fld>
            <Fld label="ID Type" optional icon="idCard">
              <select value={visitorForm.idProofType} onChange={(e) => setV('idProofType', e.target.value)}>
                <option value="">— none —</option>
                {ID_TYPES.map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
            <Fld label="ID Number" icon="oHash"><input value={visitorForm.idProofNumber} maxLength={30} disabled={!visitorForm.idProofType} onChange={(e) => setV('idProofNumber', e.target.value)} /></Fld>
          </Grid>
          <Fld label="Purpose" optional count={[visitorForm.purpose.length, 200]}>
            <textarea rows={2} maxLength={200} value={visitorForm.purpose} placeholder="e.g. Weekend visit, dropping off books" onChange={(e) => setV('purpose', e.target.value)} />
          </Fld>
        </FormSection>
      </FormModal>

      <FormModal open={modal === 'complaint'} onClose={() => setModal(null)} busy={saving} onSubmit={() => submit('complaint')} width={680}
        icon="chatSolid" title="Raise a Complaint" subtitle="Report a problem with your room, the mess or the hostel; it is tracked until it is resolved."
        submitLabel="Raise Complaint" submitIcon="check">
        <FormSection icon="chat" title="Complaint" sub="What is wrong, and how urgent it is.">
          <Grid cols={2}>
            <Fld label="Category" required icon="oTag">
              <select value={complaintForm.category} onChange={(e) => setC('category', e.target.value)}>
                {COMPLAINT_CATS.map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
            <Fld label="Priority" required icon="alert">
              <select value={complaintForm.priority} onChange={(e) => setC('priority', e.target.value)}>
                {['low', 'medium', 'high', 'urgent'].map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
          </Grid>
          <Fld label="Subject" optional icon="chat"><input value={complaintForm.subject} maxLength={100} placeholder="e.g. Water leaking in the bathroom" onChange={(e) => setC('subject', e.target.value)} /></Fld>
          <Fld label="Description" required count={[complaintForm.description.length, 1000]}>
            <textarea rows={4} maxLength={1000} value={complaintForm.description} placeholder="What is wrong, since when, and anything else that helps" onChange={(e) => setC('description', e.target.value)} />
          </Fld>
        </FormSection>
        <FormSection icon="paperclip" title={<>Attachments <small className="hsf-opt">(Optional)</small></>} sub="A photo of the problem helps it get fixed faster.">
          <FileDrop value={complaintForm.attachments} onChange={(v) => setC('attachments', v)} entityType="HostelComplaint" upload={upload} />
        </FormSection>
      </FormModal>

      {/* ── Ask to change room ────────────────────────────────────────────── */}
      <FormModal open={modal === 'roomChange'} onClose={() => setModal(null)} busy={saving} onSubmit={requestRoomChange} width={560}
        icon="repeat" title="Request a Room Change" subtitle="Say why. The hostel office decides, and chooses the bed."
        submitLabel="Send Request">
        <FormSection>
          <Fld label="Why would you like to move?" required count={[roomForm.reason.length, 500]}>
            <textarea rows={4} maxLength={500} required value={roomForm.reason} placeholder="e.g. the room is next to the generator and too noisy to study"
              onChange={(e) => setRoomForm((f) => ({ ...f, reason: e.target.value }))} />
          </Fld>
          <Fld label="Any preference" optional count={[roomForm.preference.length, 200]}>
            <input maxLength={200} value={roomForm.preference} placeholder="e.g. a lower floor, or with a classmate"
              onChange={(e) => setRoomForm((f) => ({ ...f, preference: e.target.value }))} />
          </Fld>
          <InfoNote>One request at a time. You are told as soon as it is decided{role === 'parent' ? '' : ', and so are your parents'}.</InfoNote>
        </FormSection>
      </FormModal>

      {/* ── The gate pass ─────────────────────────────────────────────────── */}
      <FormModal open={!!pass} onClose={() => setPass(null)} width={460} icon="qr" title="Gate Pass"
        subtitle={pass ? [pass.outpassNumber, pass.student?.name, roomNo(pass.room)].filter(Boolean).join(' · ') : ''}
        cancelLabel="Close" hideSubmit={!pass?.qrImage} submitLabel="Download PNG" submitIcon="download"
        onSubmit={() => { const x = document.createElement('a'); x.href = pass.qrImage; x.download = `${pass.outpassNumber || 'gate-pass'}.png`; x.click(); }}>
        {pass ? (
          <div className="hsf-center">
            <PassQr image={pass.qrImage} token={pass.qrToken} size={240} caption={pass.expectedReturnAt ? `Show this code at the gate. Back by ${dt(pass.expectedReturnAt)}.` : 'Show this code at the gate.'} />
            <div style={{ marginTop: 10 }}><Status value={pass.status} /></div>
          </div>
        ) : null}
      </FormModal>

      {/* ── One request, in full ──────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => { setDetail(null); setReply(''); }} label="Details">
        {detail?.kind === 'leave' ? (() => { const x = detail.row; return (
          <>
            <DrawerHead mark={<Mark name="beach" tone="blue" size={52} glyph={26} />} name={x.leaveNumber}
              sub={`${x.leaveType === 'home' ? 'Home leave' : words(x.leaveType)} · ${x.totalDays} day${x.totalDays === 1 ? '' : 's'}`}
              tags={<Status value={x.status} />} onClose={() => setDetail(null)} />
            <DrawerBody>
              <DrawerSection title="Leave">
                <DrawerFields fields={[['From', fmtDate(x.fromDate)], ['To', fmtDate(x.toDate)], ['Reason', x.reason], ['Destination', x.destination],
                  [contact, joinWho(x.guardianName, x.guardianRelation, x.guardianPhone)], ['Applied on', fmtDate(x.createdAt)]]} />
              </DrawerSection>
              <DrawerSection title="Approval">
                <DrawerFields fields={[
                  ['Parent consent', !x.parentApprovalRequired ? 'Not required' : x.parentApprovedAt ? `${fmtDate(x.parentApprovedAt)}, ${fmtTime(x.parentApprovedAt)}` : 'Waiting'],
                  ['Warden', x.wardenApprovedAt ? `${x.wardenApprovedBy?.name ? `${x.wardenApprovedBy.name} · ` : ''}${fmtDate(x.wardenApprovedAt)}` : x.status === 'rejected' ? '' : 'Waiting'],
                  ['Rejected', x.status === 'rejected' ? (x.rejectionReason || 'No reason was given') : ''],
                  ['Left', x.departedAt ? `${fmtDate(x.departedAt)}, ${fmtTime(x.departedAt)}` : ''], ['Returned', x.returnedAt ? `${fmtDate(x.returnedAt)}, ${fmtTime(x.returnedAt)}` : ''],
                ]} />
              </DrawerSection>
              {x.attachments?.length ? <DrawerSection title={`Documents (${x.attachments.length})`}><Attachments value={x.attachments} disabled /></DrawerSection> : null}
            </DrawerBody>
            {['pending', 'parent_approved', 'approved'].includes(x.status) ? <DrawerFoot><Btn kind="danger" onClick={() => setAsk({ kind: 'leave', row: x })}>Cancel Leave</Btn></DrawerFoot> : null}
          </>
        ); })() : null}
        {detail?.kind === 'outpass' ? (() => { const x = detail.row; return (
          <>
            <DrawerHead mark={<Mark name="passes" tone="violet" size={52} glyph={26} />} name={x.outpassNumber}
              sub={KIND_LABEL[x.outpassType] || words(x.outpassType)} tags={<Status value={x.status} />} onClose={() => setDetail(null)} />
            <DrawerBody>
              <DrawerSection title="Outpass">
                <DrawerFields fields={[['Leaving', when(x.departureDate, x.expectedDepartureTime)], ['Back by', x.expectedReturnAt ? `${fmtDate(x.expectedReturnAt)}, ${fmtTime(x.expectedReturnAt)}` : ampm(x.expectedReturnTime)],
                  ['Purpose', x.purpose], ['Destination', x.destination], [contact, joinWho(x.guardianName, x.guardianRelation, x.guardianPhone)]]} />
              </DrawerSection>
              <DrawerSection title="At the gate">
                <DrawerFields fields={[
                  ['Parent consent', !x.parentApprovalRequired ? '' : x.parentApprovedAt ? `Given ${fmtDate(x.parentApprovedAt)}, ${fmtTime(x.parentApprovedAt)}` : x.status === 'pending' ? 'Waiting for a parent' : 'Not given'],
                  ['Approved', x.approvedAt ? `${x.approvedBy?.name ? `${x.approvedBy.name} · ` : ''}${fmtDate(x.approvedAt)}` : x.status === 'pending' ? (awaitingParent(x) ? 'After parent consent' : 'Waiting for the warden') : ''],
                  ['Rejected', x.status === 'rejected' ? (x.rejectionReason || 'No reason was given') : ''],
                  ['Went out', x.actualDepartureAt ? `${fmtDate(x.actualDepartureAt)}, ${fmtTime(x.actualDepartureAt)}` : ''],
                  ['Came back', x.actualReturnAt ? `${fmtDate(x.actualReturnAt)}, ${fmtTime(x.actualReturnAt)}` : ''],
                  ['Late by', x.lateReturnMinutes > 0 ? `${x.lateReturnMinutes} min` : ''],
                ]} />
              </DrawerSection>
              {x.attachments?.length ? <DrawerSection title={`Documents (${x.attachments.length})`}><Attachments value={x.attachments} disabled /></DrawerSection> : null}
            </DrawerBody>
            <DrawerFoot>
              {role === 'parent' && awaitingParent(x) ? <Btn kind="primary" icon="check" onClick={() => consentOutpass(x._id, true)}>Give Consent</Btn> : null}
              {role === 'parent' && awaitingParent(x) ? <Btn onClick={() => consentOutpass(x._id, false)}>Decline</Btn> : null}
              {role !== 'parent' && ['approved', 'active', 'overdue'].includes(x.status) ? <Btn kind="primary" icon="qr" onClick={() => showPass(x._id)}>Show Gate Pass</Btn> : null}
              {['pending', 'approved'].includes(x.status) ? <Btn kind="danger" onClick={() => setAsk({ kind: 'outpass', row: x })}>Cancel Outpass</Btn> : null}
            </DrawerFoot>
          </>
        ); })() : null}
        {detail?.kind === 'complaint' ? (() => { const x = detail.row; return (
          <>
            <DrawerHead mark={<Mark name="chatSolid" tone="amber" size={52} glyph={26} />} name={x.ticketNumber}
              sub={[words(x.category), `${words(x.priority)} priority`].join(' · ')} tags={<Status value={x.status} />} onClose={() => setDetail(null)} />
            <DrawerBody>
              <DrawerSection title="Complaint">
                <DrawerFields fields={[['Subject', x.subject], ['Description', x.description], ['Raised on', fmtDate(x.createdAt)],
                  ['Assigned to', x.assignedTo?.name], ['Due by', x.dueAt ? fmtDate(x.dueAt) : ''], ['Resolved on', x.resolvedAt ? fmtDate(x.resolvedAt) : ''],
                  ['Resolution', x.resolution]]} />
              </DrawerSection>
              {x.comments?.length ? (
                <DrawerSection title={`Updates (${x.comments.length})`}>
                  <ol className="hsr-tl">
                    {x.comments.map((cm, i) => <li key={cm._id || i} className="is-in"><span><b>{cm.byName || cm.authorName || 'Hostel office'}</b> — {cm.text || cm.comment}</span><small>{cm.at || cm.createdAt ? `${fmtDate(cm.at || cm.createdAt)}, ${fmtTime(cm.at || cm.createdAt)}` : ''}</small></li>)}
                  </ol>
                </DrawerSection>
              ) : null}
              {x.attachments?.length ? <DrawerSection title={`Attachments (${x.attachments.length})`}><Attachments value={x.attachments} disabled /></DrawerSection> : null}
              {['resolved', 'closed'].includes(x.status) ? (
                <DrawerSection title="How well was it resolved?">
                  <div className="hsr-stars" role="radiogroup" aria-label="Rating">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={x.rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}`} disabled={busy}
                        className={n <= (x.rating || 0) ? 'is-on' : ''} onClick={() => complaintAct(x, { action: 'rate', rating: n }, 'Thanks — rating saved')}>★</button>
                    ))}
                    <span>{x.rating ? `${x.rating} of 5` : 'Tap a star to rate'}</span>
                  </div>
                </DrawerSection>
              ) : null}
              {x.status !== 'rejected' ? (
                <DrawerSection title="Reply to the hostel office">
                  <textarea className="form-control" rows={2} maxLength={500} value={reply} placeholder="Add a detail, or answer a question from the office" onChange={(e) => setReply(e.target.value)} />
                  <div className="hsr-reply"><Btn kind="primary" size="sm" icon="send" disabled={busy || !reply.trim()} onClick={() => complaintAct(x, { action: 'comment', comment: reply.trim() }, 'Reply sent')}>Send Reply</Btn></div>
                </DrawerSection>
              ) : null}
            </DrawerBody>
            {['resolved', 'closed'].includes(x.status) ? <DrawerFoot><Btn icon="refresh" onClick={() => setAsk({ kind: 'reopen', row: x })}>Reopen Complaint</Btn></DrawerFoot> : null}
          </>
        ); })() : null}
      </Drawer>

      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} onConfirm={doAsk} busy={busy}
        tone={ask?.kind === 'reopen' ? 'primary' : 'danger'} icon={ask?.kind === 'reopen' ? 'refresh' : undefined}
        title={ask?.kind === 'leave' ? 'Cancel Leave Request' : ask?.kind === 'outpass' ? 'Cancel Outpass' : 'Reopen Complaint'}
        confirmLabel={ask?.kind === 'leave' ? 'Cancel Leave' : ask?.kind === 'outpass' ? 'Cancel Outpass' : 'Reopen'}
        cancelLabel={ask?.kind === 'reopen' ? 'Cancel' : 'Keep It'}
        message={ask?.kind === 'leave' ? `Cancel ${ask.row.leaveNumber}? The warden is told, and it cannot be undone — you would file a new request.`
          : ask?.kind === 'outpass' ? `Cancel ${ask?.row.outpassNumber}? Its gate pass stops working straight away.`
          : `Reopen ${ask?.row.ticketNumber}? It goes back to the hostel office as unresolved.`} />
    </div>
  );
}
