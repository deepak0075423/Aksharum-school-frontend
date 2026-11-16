import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/employeeDirectory.api';
import { PageHeader, Badge, Button, Confirm, Empty, Spinner, Modal, Select } from '../../components/ui/index';
import { toggleTeacher } from '../../api/admin.api';
import TeacherDependencyDialog from '../../components/TeacherDependencyDialog';
import { fatherOrHusbandLabel } from '../../utils/fatherOrHusband';
import {
  Avatar, KV, Section, Restricted, Meter, Chips, ErrorState, Skeleton,
  Field, Block, MailIcon, PhoneIcon, PinIcon, CalendarIcon, UserIcon,
  BuildingIcon, BookIcon, BadgeIcon,
  fmtDate, fileUrl, STATUS_TONE, STATUS_LABEL, VERIFY_TONE, STAGE_LABEL, STAGE_TONE, serviceText, useDirectoryBase,
} from './parts';
import { DOC_STATE, DocState } from './documentParts';
import {
  Completion, Crumbs, FactCard, PhotoCard, PhotoLightbox, ProfileHeader, ProfileTabs,
  QuickActions, SummaryTiles,
} from './employeeProfileParts';
import { experienceText } from '../../utils/validators';

// The tabs a viewer sees are decided by the payload: a block the caller may not
// read is not present in the response at all, so there is nothing to hide here.

const ROLE_TONE = { class_teacher: 'primary', vice_class_teacher: 'info', subject_teacher: 'muted' };


// ─────────────────────────────────────────────────────────────────────────────
//  Compact profile — a teacher looking up a colleague.
//
//  Everything the payload carries for this tier fits on one screen, so there
//  are no tabs and nothing to scroll past: the record on the left, the
//  reporting chain on the right. The restricted blocks are not hidden here,
//  they were never sent (see projectRow / visibilityFor on the server).
// ─────────────────────────────────────────────────────────────────────────────
function CompactProfile({ data, base, navigate }) {
  const o = data.overview || {};
  const assignments = data.subjectsClasses?.assignments || [];
  const teaches = assignments.filter((a) => a.role === 'subject_teacher');
  const workplace = o.workplace || {};

  return (
    <div className="page">
      <PageHeader
        title="Employee Directory"
        subtitle="Manage and browse your organization's employee information"
        action={<Button variant="secondary" onClick={() => navigate(`${base}/employees`)}>← Back</Button>}
      />

      <div className="ed-panel">
          <div className="ed-hero">
            <Avatar name={o.name} src={o.profileImage} size={84} />
            <div style={{ minWidth: 0 }}>
              <div className="ed-hero__name">{o.name}</div>
              <div className="ed-hero__role">
                {o.designation || <span className="ed-none">No designation recorded</span>}
              </div>
              <div className="ed-hero__id">
                Employee ID: {o.employeeId || <span className="ed-none">not set</span>}
              </div>
              {o.classTeacherOf?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Badge variant="primary">Class Teacher · {o.classTeacherOf.join(', ')}</Badge>
                </div>
              )}
            </div>
          </div>

          <Block icon={<PhoneIcon size={17} />} title="Contact Information">
            <div className="ed-facts">
              <Field icon={<MailIcon />} label="Email"
                value={<a href={`mailto:${o.officialEmail}`}>{o.officialEmail}</a>} />
              <Field icon={<PhoneIcon />} label="Mobile" value={o.officialPhone} blank="Not recorded" />
            </div>
          </Block>

          <Block icon={<CalendarIcon size={17} />} title="Employment Details">
            <div className="ed-facts">
              <Field icon={<CalendarIcon />} label="Date of Joining"
                value={o.joiningDate ? fmtDate(o.joiningDate) : ''} blank="Not recorded" />
              <Field icon={<BuildingIcon />} label="Department" value={o.department} blank="Not set" />
              <Field icon={<BadgeIcon />} label="Qualification"
                value={[...new Set((data.education?.qualifications || [])
                  .map((q) => q.qualification).filter(Boolean))].join(', ')}
                blank="Not recorded" />
            </div>
          </Block>

          <Block icon={<BookIcon size={17} />} title="Subjects & Classes">
            <div className="ed-facts">
              <Field icon={<BookIcon />} label="Subjects"
                value={o.subjects?.length ? <Chips items={o.subjects} /> : ''} blank="No subjects assigned" />
              <Field icon={<PinIcon />} label="Classes & Sections"
                value={o.classes?.length ? <Chips items={o.classes.map((c) => c.label)} /> : ''}
                blank="No classes assigned" />
            </div>
            {teaches.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                {teaches.map((a, i) => (
                  <span key={i} className="badge badge-info">
                    {a.subject} → {[a.className, a.sectionName].filter(Boolean).join(' ')}
                  </span>
                ))}
              </div>
            )}
          </Block>

          <Block icon={<PinIcon size={17} />} title="Location & Responsibilities">
            <div className="ed-facts">
              <Field icon={<BuildingIcon />} label="Workplace"
                value={[workplace.name, workplace.city].filter(Boolean).join(' · ')} blank="Not set" />
              <Field icon={<UserIcon />} label="Responsibilities"
                value={data.responsibilities?.length
                  ? <Chips items={data.responsibilities.map((r) => r.label)} /> : ''}
                blank="None assigned" />
            </div>
          </Block>
      </div>

      <p className="text-muted text-sm" style={{ marginTop: 16, textAlign: 'center' }}>
        🔒 Personal, contact, document and payroll details are visible only to the employee and to administrators.
      </p>
    </div>
  );
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { base, canOpen } = useDirectoryBase();
  const [tab, setTab] = useState('overview');
  const [photo, setPhoto] = useState('');          // the photograph, opened over the page
  const [depTarget, setDepTarget] = useState(null); // deactivation, via the dependency check
  const [toggling, setToggling] = useState(false);
  const [printing, setPrinting] = useState(false);

  const { data, loading, error, refetch } = useFetch(() => api.getEmployee(id), [id]);
  // One read of the filter lists for every tab that needs them (departments,
  // managers, years, classes) — not one per tab.
  const { data: meta } = useFetch(api.getMeta, []);
  // Another person's page starts on their overview.
  useEffect(() => { setTab('overview'); }, [id]);

  // Only the FIRST load replaces the page: saving a tab refetches the record,
  // and swapping everything for a skeleton would throw the reader off the tab
  // they were working on.
  if (loading && !data) {
    return (
      <div className="page">
        <style>{'@keyframes edPulse{0%,100%{opacity:1}50%{opacity:.45}}'}</style>
        <div className="card"><div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <Skeleton h={72} w={72} r={36} />
          <div style={{ flex: 1 }}>
            <Skeleton w="35%" h={20} />
            <Skeleton w="55%" style={{ marginTop: 10 }} />
          </div>
        </div></div>
        <div className="card" style={{ marginTop: 16 }}><div className="card-body">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} style={{ marginBottom: 12 }} />)}
        </div></div>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="page">
        <PageHeader title="Employee" action={<Link className="btn btn-secondary" to={`${base}/employees`}>← Back</Link>} />
        <ErrorState error={error} onRetry={refetch} title="Could not load this employee" />
      </div>
    );
  }

  const o   = data.overview || {};
  const vis = data.visibility || {};
  const viewer = data.viewer || {};
  const modules = data.modules || {};

  // "Me" is one screen everywhere: your own record lives on /profile, which
  // renders the same panel and blocks as this page plus Edit and Change
  // Password. Sending you there keeps a single view of yourself.
  if (viewer.isSelf) return <Navigate to="/profile" replace />;

  // A colleague lookup gets the one-screen record; an administrator opening
  // someone else's file gets the full tabbed profile.
  if (!viewer.isAdmin) {
    return <CompactProfile data={data} base={base} navigate={navigate} />;
  }

  // The account itself — the wizard, deactivation — is the school
  // administrator's (Admin → Teachers). A teacher who administers the directory
  // works on everything else here.
  const canManage = !!viewer.canManageAccounts;

  // A tab is offered only when its block was sent. Access was decided on the
  // server (visibilityFor) — this just draws what came back.
  const TABS = [
    { key: 'overview',      label: 'Overview',          icon: 'grid' },
    { key: 'personal',      label: 'Personal',          icon: 'user' },
    { key: 'contact',       label: 'Contact',           icon: 'phone' },
    { key: 'employment',    label: 'Employment',        icon: 'badge' },
    { key: 'education',     label: 'Education',         icon: 'bookOpen' },
    { key: 'assignments',   label: 'Subjects & Classes', icon: 'book' },
    { key: 'responsibilities', label: 'Responsibilities', icon: 'clipboard' },
    { key: 'timetable',     label: 'Timetable',  icon: 'clock',       show: modules.timetable },
    { key: 'attendance',    label: 'Attendance', icon: 'checkSquare', show: modules.attendance && vis.attendance },
    { key: 'leave',         label: 'Leave',      icon: 'umbrella',    show: modules.leave && vis.leave },
    { key: 'documents',     label: 'Documents',  icon: 'files',       show: vis.documents },
    { key: 'governmentIds', label: 'Government IDs', icon: 'idCard',  show: vis.governmentId },
    { key: 'bank',          label: 'Bank / Payroll', icon: 'banknote', show: vis.bank || vis.payroll },
    { key: 'verification',  label: 'Verification',  icon: 'checkCircle' },
    { key: 'history',       label: 'History',       icon: 'clock' },
  ].filter((t) => t.show !== false);

  // Editing an employee is the seven-step wizard, which lives on Teachers with
  // the row shape it was built for. Sending the admin there with the person
  // already found is the honest way in — this page does not keep a second copy
  // of that form.
  const editRecord = () => navigate(
    `/admin/teachers?search=${encodeURIComponent(o.name)}&edit=${encodeURIComponent(id)}`,
  );

  // Deactivating goes through the dependency check, exactly as it does on the
  // Teachers list: a class teacher or a timetable holder cannot simply vanish.
  // Activating has nothing to check.
  const toggleAccount = async () => {
    const active = o.employmentStatus !== 'inactive' && o.isActive !== false;
    if (active) { setDepTarget({ _id: id, name: o.name, isActive: true }); return; }
    setToggling(true);
    try {
      await toggleTeacher(id);
      toast.success(`${o.name} activated`);
      refetch();
    } catch (err) { toast.error(err.message || 'Could not update the account'); }
    finally { setToggling(false); }
  };

  const downloadPdf = async () => {
    setPrinting(true);
    toast.loading('Building the PDF…', { id: 'eppdf' });
    try {
      await api.downloadProfilePdf(id, o.name);
      toast.success('Downloaded', { id: 'eppdf' });
    } catch (err) { toast.error(err.message || 'Could not build the PDF', { id: 'eppdf' }); }
    finally { setPrinting(false); }
  };

  return (
    <div className="page eppg">
      <Crumbs base={base} name={o.name} />

      <ProfileHeader o={o} base={base} modules={modules} canManage={canManage}
        onEdit={editRecord} onToggle={toggleAccount} toggling={toggling}
        onPdf={downloadPdf} printing={printing} />

      <SummaryTiles o={o} />

      <ProfileTabs tabs={TABS} active={tab} onPick={setTab} />

      {tab === 'overview' && (
        <Overview data={data} base={base} modules={modules} onGo={setTab} canManage={canManage}
          onEdit={editRecord} onToggle={toggleAccount} toggling={toggling}
          onPhoto={() => setPhoto(fileUrl(o.profileImage))} />
      )}
      {tab === 'personal'      && (vis.personal ? <Personal p={data.personal} /> : <Restricted what="personal information" />)}
      {tab === 'contact'       && (vis.contact ? <Contact c={data.contact} /> : <ContactLimited o={o} />)}
      {tab === 'employment'    && <Employment data={data} id={id} onSaved={refetch} base={base} meta={meta} />}
      {tab === 'education'     && <Education e={data.education} id={id} isAdmin={viewer.isAdmin} hasProfile={data.hasProfile !== false} onSaved={refetch} />}
      {tab === 'assignments'   && <Assignments a={data.subjectsClasses} id={id} years={meta?.academicYears || []} />}
      {tab === 'responsibilities' && <Responsibilities list={data.responsibilities} id={id} isAdmin={viewer.isAdmin} onChanged={refetch} meta={meta} />}
      {tab === 'timetable'     && <TimetableTab id={id} fullLink={canOpen('timetable') ? '/admin/timetable' : ''} />}
      {tab === 'attendance'    && (vis.attendance ? <AttendanceTab id={id} fullLink={canOpen('attendance') ? '/admin/attendance' : ''} /> : <Restricted what="attendance" />)}
      {tab === 'leave'         && (vis.leave ? <LeaveTab id={id} fullLink={canOpen('leave') ? '/admin/leave' : ''} /> : <Restricted what="leave" />)}
      {tab === 'documents'     && (vis.documents
        ? <Documents docs={data.documents} id={id} name={o.name} canUpload={viewer.isAdmin && data.hasProfile !== false} onChanged={refetch} />
        : <Restricted what="employee documents" />)}
      {tab === 'governmentIds' && (vis.governmentId ? <GovernmentIds g={data.governmentIds} id={id} canReveal={viewer.canReveal} /> : <Restricted what="government ID information" />)}
      {tab === 'bank'          && <BankPayroll data={data} id={id} payrollLink={canOpen('payroll') ? '/admin/payroll/assignments' : ''} />}
      {tab === 'verification'  && <Verification list={data.verification || []} id={id} base={base} />}
      {tab === 'history'       && <History id={id} />}

      <PhotoLightbox src={photo} name={o.name} onClose={() => setPhoto('')} />

      <TeacherDependencyDialog
        open={!!depTarget}
        teacher={depTarget}
        action="deactivate"
        onClose={() => setDepTarget(null)}
        onDone={() => { setDepTarget(null); refetch(); }}
      />
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

/** A date as a date box wants it, in the reader's own day (never shifted by the time zone). */
const dayValue = (d) => {
  if (!d) return '';
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

/** Somebody named as a manager, with a flag when that account has been switched off. */
const ManagerLink = ({ m, base }) => {
  if (!m) return '';
  const label = <>{m.name}{m.designation ? ` · ${m.designation}` : ''}</>;
  return (
    <>
      {m.isSchoolAdmin ? label : <Link to={`${base}/employees/${m._id}`}>{label}</Link>}
      {m.inactive && <span className="badge badge-warning" style={{ marginLeft: 6 }} title="This account is deactivated — choose a new reporting manager">Deactivated</span>}
    </>
  );
};

/**
 * The overview: what an administrator reads before opening anything else.
 *
 * The record on the left, and on the right the three things they act on — how
 * complete the file is, who this is, and what can be done to the account. The
 * completion card is the useful one: it names what is missing and opens the tab
 * that fixes it, rather than showing a percentage nobody can act on.
 */
const Overview = ({ data, base, modules, onGo, onEdit, onToggle, toggling, onPhoto, canManage }) => {
  const o = data.overview || {};
  const e = data.employment || {};
  return (
    <div className="epgrid">
      <div className="epgrid__main">
        <FactCard icon="user" tone="indigo" title="Basic information" rows={[
          ['Full name', o.name],
          ['Employee ID', o.employeeId],
          ['Designation', o.designation],
          ['Department', o.department],
          ['Employee type', o.staffType === 'teaching' ? 'Teaching staff' : o.staffType ? 'Non-teaching staff' : ''],
          ['Employment status', <>
            <Badge variant={STATUS_TONE[o.employmentStatus] || 'muted'}>
              {STATUS_LABEL[o.employmentStatus] || 'Unknown'}
            </Badge>
            {e.employmentStage && (
              <span style={{ marginLeft: 6 }}><Badge variant={STAGE_TONE[e.employmentStage] || 'muted'}>{STAGE_LABEL[e.employmentStage]}</Badge></span>
            )}
          </>],
          ['Date of joining', o.joiningDate ? `${fmtDate(o.joiningDate)}${serviceText(o.joiningDate, e.exitDate) ? ` · ${serviceText(o.joiningDate, e.exitDate)}` : ''}` : ''],
          ['Official email', o.officialEmail],
          ['Official mobile', o.officialPhone],
          ['Reporting manager', o.reportingManager ? <ManagerLink m={o.reportingManager} base={base} /> : ''],
        ]} />

        <FactCard icon="book" tone="blue" title="Teaching load" rows={[
          ['Subjects', o.subjects?.length ? <Chips items={o.subjects} /> : ''],
          ['Classes & sections', o.classes?.length
            ? <Chips items={(o.classes || []).map((c) => c.label)} /> : ''],
          ['Class teacher of', o.classTeacherOf?.length
            ? <Chips items={o.classTeacherOf} /> : ''],
          ['Responsibilities', data.responsibilities?.length
            ? <Chips items={data.responsibilities.map((r) => (r.department ? `${r.label} · ${r.department}` : r.label))} /> : ''],
        ]} />
      </div>

      <aside className="epgrid__side">
        <Completion completion={data.profileCompletion} onGo={onGo} />
        <PhotoCard o={o} onOpen={onPhoto} />
        <QuickActions o={o} base={base} modules={modules} canManage={canManage}
          onEdit={onEdit} onToggle={onToggle} toggling={toggling} />
      </aside>
    </div>
  );
};

const Personal = ({ p = {} }) => (
  <Section title="Personal Information" subtitle="From the employee's own record">
    <KV label="Full Name" value={p.fullName} />
    <KV label="Date of Birth" value={p.dob ? fmtDate(p.dob) : ''} />
    <KV label="Gender" value={p.gender} />
    <KV label="Blood Group" value={p.bloodGroup} />
    <KV label={fatherOrHusbandLabel(p.gender)} value={p.fatherOrHusbandName} />
    <KV label="Emergency Contact Name" value={p.emergencyContactName} />
    <KV label="Emergency Contact Phone" value={p.emergencyContactPhone} />
  </Section>
);

const addr = (a) => {
  if (!a) return '';
  return [a.line, a.city, a.state, a.pincode, a.country].filter(Boolean).join(', ');
};

const Contact = ({ c = {} }) => (
  <Section title="Contact Information">
    <KV label="Mobile Number" value={c.phone} />
    <KV label="Secondary Phone" value={c.alternatePhone} />
    <KV label="Email Address" value={c.email} />
    <KV label="Current Residential Address" value={addr(c.currentAddress)} />
    <KV label="Permanent Address" value={addr(c.permanentAddress)} />
    <KV label="Emergency Contact" value={[c.emergencyContact?.name, c.emergencyContact?.phone].filter(Boolean).join(' · ')} />
  </Section>
);

// A teacher looking at a peer gets the official channels only — the private
// address and emergency contact were never sent.
const ContactLimited = ({ o }) => (
  <Section title="Contact Information" subtitle="Official contact details only">
    <KV label="Official Email" value={o.officialEmail} />
    <KV label="Official Mobile" value={o.officialPhone} />
    <p className="text-muted text-sm" style={{ marginTop: 14 }}>
      🔒 Home address, personal numbers and emergency contacts are restricted to administrators and the employee themselves.
    </p>
  </Section>
);

const STAGES = Object.entries(STAGE_LABEL).map(([value, label]) => ({ value, label }));
const LEFT = ['notice', 'resigned', 'terminated', 'retired'];

function Employment({ data, id, onSaved, base, meta }) {
  const e = data.employment || {};
  const viewer = data.viewer || {};
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  // The form opens on what is on file — including a staff type somebody chose.
  // It used to open on "derive from assignments" every time, so saving a
  // department change quietly threw an explicit Teaching / Non-Teaching away.
  const start = () => {
    setForm({
      department: e.department || '',
      staffType: e.staffTypeSource === 'set' ? (e.staffType || '') : '',
      reportingManager: e.reportingManager?._id || '',
      employmentStage: e.employmentStage || '',
      probationEndDate: dayValue(e.probationEndDate),
      confirmationDate: dayValue(e.confirmationDate),
      exitDate: dayValue(e.exitDate),
      exitReason: e.exitReason || '',
    });
    setOpen(true);
  };
  const put = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      await api.updateEmployment(id, form);
      toast.success('Employment details updated');
      setOpen(false);
      onSaved();
    } catch (err) { toast.error(err.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  const departments = (meta?.filters?.departments || []).filter((d) => d !== 'Unassigned');
  const leaving = form && LEFT.includes(form.employmentStage);

  return (
    <>
      <Section
        title="Employment Information"
        action={viewer.isAdmin && data.hasProfile !== false && <Button size="sm" variant="secondary" onClick={start}>Edit employment</Button>}
      >
        <KV label="Employee ID" value={e.employeeId} mono />
        <KV label="Date of Joining" value={e.joiningDate ? fmtDate(e.joiningDate) : ''} />
        <KV label="Length of Service" value={serviceText(e.joiningDate, e.exitDate)} />
        <KV label="Designation" value={e.designation} />
        <KV label="Department" value={e.department} />
        <KV label="Employee Type" value={<>
          {e.staffType === 'teaching' ? 'Teaching' : 'Non-Teaching'}
          {e.staffTypeSource === 'derived' && <span className="text-muted" style={{ fontWeight: 400 }}> · read from the academic assignments</span>}
        </>} />
        <KV label="Account" value={<Badge variant={STATUS_TONE[e.employmentStatus]}>{STATUS_LABEL[e.employmentStatus]}</Badge>} />
        <KV label="Employment Stage" value={e.employmentStage
          ? <Badge variant={STAGE_TONE[e.employmentStage] || 'muted'}>{STAGE_LABEL[e.employmentStage]}</Badge> : ''} />
        {e.probationEndDate && <KV label="Probation Ends" value={fmtDate(e.probationEndDate)} />}
        {e.confirmationDate && <KV label="Confirmed On" value={fmtDate(e.confirmationDate)} />}
        {e.exitDate && <KV label="Last Working Day" value={fmtDate(e.exitDate)} />}
        {e.exitReason && <KV label="Reason for Leaving" value={e.exitReason} />}
        {e.employmentType !== undefined && <KV label="Fresher / Experienced" value={e.employmentType ? (e.employmentType === 'fresher' ? 'Fresher' : 'Experienced') : ''} />}
        {e.totalExperience !== undefined && <KV label="Total Experience" value={experienceText(e.totalExperience)} />}
        {e.previousSchool !== undefined && <KV label="Previous School" value={e.previousSchool} />}
        {e.lastDesignation !== undefined && <KV label="Previous Designation" value={e.lastDesignation} />}
        <KV label="Reporting Manager" value={e.reportingManager ? <ManagerLink m={e.reportingManager} base={base} /> : ''} />
        <KV label="Campus / Branch" value={<span className="text-muted">Not configured in this ERP</span>} />
      </Section>

      {form && (
        <Modal open={open} onClose={() => setOpen(false)} title="Edit employment"
          footer={<>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={save}>Save</Button>
          </>}>
          <Select label="Department" value={departments.includes(form.department) ? form.department : (form.department ? '__other' : '')}
            onChange={(ev) => setForm((f) => ({ ...f, department: ev.target.value === '__other' ? f.department : ev.target.value }))}>
            <option value="">No department (unassigned)</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            {form.department && !departments.includes(form.department) && <option value="__other">{form.department}</option>}
          </Select>
          <p className="form-hint" style={{ marginTop: -6, marginBottom: 12 }}>
            A new department is added on the <Link to={`${base}/departments`}>Departments</Link> page, then chosen here.
          </p>
          <Select label="Employee type" value={form.staffType} onChange={put('staffType')}>
            <option value="">Read it from the academic assignments</option>
            <option value="teaching">Teaching</option>
            <option value="non_teaching">Non-Teaching</option>
          </Select>
          <Select label="Reporting manager" value={form.reportingManager} onChange={put('reportingManager')}>
            <option value="">None</option>
            {(meta?.filters?.managers || []).filter((m) => m._id !== id).map((m) => (
              <option key={m._id} value={m._id}>{m.label}{m.designation ? ` — ${m.designation}` : ''}</option>
            ))}
            {/* Still on file but no longer selectable (deactivated): shown so it is not silently cleared. */}
            {form.reportingManager && !(meta?.filters?.managers || []).some((m) => m._id === form.reportingManager) && (
              <option value={form.reportingManager}>{e.reportingManager?.name || 'Current manager'} (deactivated)</option>
            )}
          </Select>
          <Select label="Employment stage" value={form.employmentStage} onChange={put('employmentStage')}>
            <option value="">Not stated</option>
            {STAGES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </Select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="ep-prob">Probation ends</label>
              <input id="ep-prob" type="date" className="form-control" value={form.probationEndDate} onChange={put('probationEndDate')} />
            </div>
            <div className="form-group">
              <label className="form-label" htmlFor="ep-conf">Confirmed on</label>
              <input id="ep-conf" type="date" className="form-control" value={form.confirmationDate} onChange={put('confirmationDate')} />
            </div>
          </div>
          {(leaving || form.exitDate) && (
            <>
              <div className="form-group">
                <label className={`form-label${leaving && form.employmentStage !== 'notice' ? ' required' : ''}`} htmlFor="ep-exit">Last working day</label>
                <input id="ep-exit" type="date" className="form-control" value={form.exitDate} onChange={put('exitDate')} />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="ep-why">Reason for leaving</label>
                <input id="ep-why" data-text="sentence" className="form-control" maxLength={300} value={form.exitReason} onChange={put('exitReason')}
                  placeholder="e.g. Relocating to another city" />
              </div>
              <p className="form-hint">This records where the employment stands. It does not switch the account off — deactivate the employee when they have actually left.</p>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

const BLANK_Q = { qualification: '', specialization: '', institution: '', passingYear: '', grade: '' };

function Education({ e, id, isAdmin, hasProfile, onSaved }) {
  const list = e?.qualifications || [];
  const extras = list.filter((q) => q.kind === 'additional');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  const start = () => {
    setRows(extras.length
      ? extras.map((q) => ({ qualification: q.qualification, specialization: q.specialization || '', institution: q.institution || '', passingYear: q.passingYear || '', grade: q.grade || '' }))
      : [{ ...BLANK_Q }]);
    setOpen(true);
  };
  const put = (i, k) => (ev) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: ev.target.value } : x)));
  const save = async () => {
    // A row left completely empty is a row nobody meant to add.
    const filled = rows.filter((r) => Object.values(r).some((v) => String(v).trim()));
    if (filled.some((r) => !String(r.qualification).trim())) { toast.error('Each qualification needs its name'); return; }
    setBusy(true);
    try {
      await api.updateQualifications(id, filled);
      toast.success('Qualifications saved');
      setOpen(false);
      onSaved();
    } catch (err) { toast.error(err.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  const KIND = { highest: 'Highest qualification', teaching_degree: 'Teaching degree', additional: 'Additional' };

  return (
    <>
      <Section title="Education"
        subtitle="The highest qualification and the teaching degree come from the teacher form; any others are added here. Certificates are on the Documents tab."
        action={isAdmin && hasProfile && (
          <Button size="sm" variant="secondary" onClick={start}>{extras.length ? 'Edit other qualifications' : '+ Add a qualification'}</Button>
        )}>
        {list.length === 0
          ? <Empty icon="🎓" title="No qualification on file" message="Add the highest qualification on the teacher record, or another one here." />
          : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr>
                  <th>Qualification</th><th>Type</th><th>Specialization</th><th>Institution</th>
                  <th>Year</th><th>Grade</th>
                </tr></thead>
                <tbody>
                  {list.map((q, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{q.qualification}</td>
                      <td>{KIND[q.kind] || 'Additional'}</td>
                      <td className="text-muted">{q.specialization || '—'}</td>
                      <td className="text-muted">{q.institution || '—'}</td>
                      <td className="text-muted">{q.passingYear || '—'}</td>
                      <td className="text-muted">{q.grade || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Section>

      <Modal open={open} onClose={() => setOpen(false)} title="Other qualifications" maxWidth={720}
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </>}>
        {rows.map((r, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="form-group">
                <label className="form-label required">Qualification</label>
                <input data-text="title" className="form-control" maxLength={80} value={r.qualification} onChange={put(i, 'qualification')} placeholder="e.g. M.Sc." />
              </div>
              <div className="form-group">
                <label className="form-label">Specialization</label>
                <input data-text="title" className="form-control" maxLength={80} value={r.specialization} onChange={put(i, 'specialization')} placeholder="e.g. Physics" />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Institution</label>
                <input data-text="title" className="form-control" maxLength={120} value={r.institution} onChange={put(i, 'institution')} placeholder="University or board" />
              </div>
              <div className="form-group">
                <label className="form-label">Passing year</label>
                <input type="number" className="form-control" min={1950} max={new Date().getFullYear()} step={1} value={r.passingYear} onChange={put(i, 'passingYear')} />
              </div>
              <div className="form-group">
                <label className="form-label">Grade / percentage</label>
                <input data-text="code" className="form-control" maxLength={30} value={r.grade} onChange={put(i, 'grade')} placeholder="e.g. 72% or A" />
              </div>
            </div>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}>Remove this one</button>
          </div>
        ))}
        {rows.length < 10 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRows((x) => [...x, { ...BLANK_Q }])}>+ Another qualification</button>
        )}
      </Modal>
    </>
  );
}

function Assignments({ a, id, years }) {
  // The profile carries the active year. Another year is read on its own.
  const [year, setYear] = useState('');
  const [other, setOther] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!year || year === a?.academicYearId) { setOther(null); return undefined; }
    let alive = true;
    setBusy(true);
    api.getAssignments(id, year)
      .then((res) => { if (alive) setOther(res?.data ?? res); })
      .catch((err) => { if (alive) { toast.error(err.message || 'Could not load that year'); setYear(''); } })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [year, id, a?.academicYearId]);

  const shown = other || a || {};
  const rows = shown.assignments || [];
  return (
    <Section title="Subjects & Classes"
      subtitle={shown.academicYear ? `Academic year ${shown.academicYear}` : 'Current academic assignments'}
      action={years.length > 1 && (
        <select className="form-control" style={{ width: 'auto' }} aria-label="Academic year"
          value={year || a?.academicYearId || ''} onChange={(ev) => setYear(ev.target.value)}>
          {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}{y.active ? ' (current)' : ''}</option>)}
        </select>
      )}>
      {busy ? <Spinner />
        : rows.length === 0
          ? <Empty icon="📚" title="No academic assignments" message={`This employee was not assigned to any subject or section in ${shown.academicYear || 'this academic year'}.`} />
          : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Role</th><th>Subject</th><th>Class</th><th>Section</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td><Badge variant={ROLE_TONE[r.role]}>{r.roleLabel}</Badge></td>
                      <td>{r.subject || <span className="text-muted">—</span>}</td>
                      <td>{r.className || <span className="text-muted">—</span>}</td>
                      <td>{r.sectionName || <span className="text-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
    </Section>
  );
}

const BLANK_R = { type: 'hod', title: '', department: '', class: '', section: '', subject: '', fromDate: '', toDate: '', notes: '' };

function Responsibilities({ list = [], id, isAdmin, onChanged, meta }) {
  const [editing, setEditing] = useState(null);   // null | 'new' | the responsibility being changed
  const [form, setForm] = useState(BLANK_R);
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(null);     // { kind: 'end' | 'remove', row }
  const opts = meta?.filters || {};

  const start = (row) => {
    setForm(row ? {
      type: row.type, title: row.title || '', department: row.department || '',
      class: row.classId || '', section: row.sectionId || '', subject: row.subjectId || '',
      fromDate: dayValue(row.fromDate), toDate: dayValue(row.toDate), notes: row.notes || '',
    } : BLANK_R);
    setEditing(row || 'new');
  };
  const put = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));

  const save = async () => {
    setBusy(true);
    try {
      if (editing === 'new') await api.createResponsibility({ ...form, employee: id });
      else await api.updateResponsibility(editing._id, form);
      toast.success(editing === 'new' ? 'Responsibility assigned' : 'Responsibility updated');
      setEditing(null);
      onChanged();
    } catch (err) { toast.error(err.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  const confirm = async () => {
    setBusy(true);
    try {
      if (asking.kind === 'end') await api.updateResponsibility(asking.row._id, { end: true });
      else await api.removeResponsibility(asking.row._id);
      toast.success(asking.kind === 'end' ? 'Ended today' : 'Removed');
      setAsking(null);
      onChanged();
    } catch (err) { toast.error(err.message || 'Could not do that'); }
    finally { setBusy(false); }
  };

  const sections = form.class ? (opts.sections || []).filter((x) => x.classId === form.class) : [];

  return (
    <>
      <Section
        title="Responsibilities"
        subtitle="Class Teacher and Vice Class Teacher come from the section record; the rest are assigned here"
        action={isAdmin && <Button size="sm" variant="secondary" onClick={() => start(null)}>+ Assign</Button>}
      >
        {list.length === 0
          ? <Empty icon="🎖️" title="No additional responsibilities" message="HOD, coordinator and similar roles this employee holds now appear here." />
          : list.map((r) => (
            <div key={r._id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>{r.label}</div>
                <div className="text-muted text-sm">
                  {[r.department, [r.className, r.sectionName].filter(Boolean).join(' '), r.subjectName].filter(Boolean).join(' · ') || 'School-wide'}
                  {r.fromDate && ` · from ${fmtDate(r.fromDate)}`}
                  {r.toDate && ` · until ${fmtDate(r.toDate)}`}
                </div>
                {r.notes && <div className="text-muted text-sm" style={{ marginTop: 2 }}>{r.notes}</div>}
              </div>
              {isAdmin && (
                <span style={{ display: 'flex', gap: 6 }}>
                  <Button size="sm" variant="secondary" onClick={() => start(r)}>Edit</Button>
                  <Button size="sm" variant="secondary" onClick={() => setAsking({ kind: 'end', row: r })}>End</Button>
                  <Button size="sm" variant="danger" onClick={() => setAsking({ kind: 'remove', row: r })}>Remove</Button>
                </span>
              )}
            </div>
          ))}
      </Section>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Assign a responsibility' : 'Change this responsibility'}
        footer={<>
          <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          <Button loading={busy} onClick={save}>{editing === 'new' ? 'Assign' : 'Save'}</Button>
        </>}>
        <Select label="Responsibility" required value={form.type} onChange={put('type')}>
          {(opts.responsibilityTypes || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <div className="form-group">
          <label className={`form-label${form.type === 'other' ? ' required' : ''}`}>Title</label>
          <input data-text="title" className="form-control" maxLength={80}
            placeholder={form.type === 'other' ? 'What the responsibility is' : 'Leave blank to use the responsibility name'}
            value={form.title} onChange={put('title')} />
        </div>
        <Select label="Department" value={form.department} onChange={put('department')}>
          <option value="">Not tied to a department</option>
          {(opts.departments || []).filter((d) => d !== 'Unassigned').map((d) => <option key={d} value={d}>{d}</option>)}
          {form.department && !(opts.departments || []).includes(form.department) && <option value={form.department}>{form.department}</option>}
        </Select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Select label="Class" value={form.class} onChange={(ev) => setForm((f) => ({ ...f, class: ev.target.value, section: '' }))}>
            <option value="">Any class</option>
            {(opts.classes || []).map((c) => <option key={c._id} value={c._id}>{c.label}</option>)}
          </Select>
          <Select label="Section" value={form.section} onChange={put('section')} disabled={!form.class}>
            <option value="">{form.class ? 'Any section' : 'Pick a class first'}</option>
            {sections.map((x) => <option key={x._id} value={x._id}>{x.label}</option>)}
          </Select>
        </div>
        <Select label="Subject" value={form.subject} onChange={put('subject')}>
          <option value="">Any subject</option>
          {(opts.subjects || []).map((x) => <option key={x._id} value={x._id}>{x.label}</option>)}
        </Select>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group">
            <label className="form-label" htmlFor="rs-from">Held from</label>
            <input id="rs-from" type="date" className="form-control" value={form.fromDate} onChange={put('fromDate')} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="rs-to">Until</label>
            <input id="rs-to" type="date" className="form-control" value={form.toDate} min={form.fromDate || undefined} onChange={put('toDate')} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="rs-notes">Notes</label>
          <input id="rs-notes" data-text="sentence" className="form-control" maxLength={300} value={form.notes} onChange={put('notes')}
            placeholder="Seen by the directory's administrators only" />
        </div>
      </Modal>

      <Confirm open={!!asking} onClose={() => setAsking(null)} onConfirm={confirm} loading={busy}
        title={asking?.kind === 'end' ? 'End this responsibility?' : 'Remove this responsibility?'}
        confirmLabel={asking?.kind === 'end' ? 'End it today' : 'Remove'}
        message={asking?.kind === 'end'
          ? `${asking?.row?.label} will end today. It stays in the history, and the post is free for someone else.`
          : `${asking?.row?.label} will be removed as if it had never been assigned. To record that it has finished, use End instead.`} />
    </>
  );
}

function TimetableTab({ id, fullLink }) {
  const { data, loading, error, refetch } = useFetch(() => api.getTimetable(id), [id]);
  if (loading) return <Section title="Timetable"><Spinner /></Section>;
  if (error) return <Section title="Timetable"><ErrorState error={error} onRetry={refetch} /></Section>;

  const days = data?.days || [];
  const week = data?.week || {};
  const today = data?.today || {};
  const covering = data?.cover?.covering || [];
  const coveredBy = data?.cover?.coveredBy || [];
  const coverLine = (c, word) => (
    <div key={c._id} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
      <span className="badge badge-muted">{fmtDate(c.date)} · P{c.periodNumber}</span>
      <span style={{ flex: 1, fontWeight: 500 }}>{c.subject || '—'} · {[c.className, c.sectionName].filter(Boolean).join(' ')}</span>
      {c.with && <span className="text-muted text-sm">{word} {c.with}</span>}
    </div>
  );

  return (
    <>
      <Section
        title="Today's Timetable"
        subtitle={today.day || 'No school today'}
        action={fullLink && <Link className="btn btn-secondary btn-sm" to={fullLink}>Open the Timetable module</Link>}
      >
        {(today.periods || []).length === 0
          ? <Empty icon="🗓️" title="No periods today" message="Nothing is scheduled for this employee today." />
          : (today.periods).map((p) => (
            <div key={p.periodNumber} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <span className="badge badge-primary">P{p.periodNumber}</span>
              <span style={{ flex: 1, fontWeight: 500 }}>{p.subject || '—'}</span>
              <span className="text-muted text-sm">{[p.className, p.sectionName].filter(Boolean).join(' ')}</span>
              {p.room && <span className="badge badge-muted">{p.room}</span>}
            </div>
          ))}
      </Section>

      {(covering.length > 0 || coveredBy.length > 0) && (
        <Section title="Cover in the next seven days" subtitle="From the substitutions the Timetable module has arranged">
          {covering.length > 0 && <p className="text-muted text-sm" style={{ margin: '0 0 4px' }}>Taking these periods for a colleague</p>}
          {covering.map((c) => coverLine(c, 'for'))}
          {coveredBy.length > 0 && <p className="text-muted text-sm" style={{ margin: '12px 0 4px' }}>Their own periods, taken by someone else</p>}
          {coveredBy.map((c) => coverLine(c, 'covered by'))}
        </Section>
      )}

      <Section title="Weekly Timetable" subtitle={`${data?.totalPeriodsPerWeek || 0} periods a week${data?.academicYear ? ` · ${data.academicYear}` : ''}`}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Day</th><th>Periods</th><th>Free periods</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{d}</td>
                  <td>
                    {(week[d] || []).length === 0
                      ? <span className="text-muted">No periods</span>
                      : <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
                        {week[d].map((p) => (
                          <span key={`${p.periodNumber}-${p.sectionId}`} className="badge badge-info" title={p.room || ''}>
                            P{p.periodNumber} {p.subject} · {[p.className, p.sectionName].filter(Boolean).join(' ')}
                          </span>
                        ))}
                      </span>}
                  </td>
                  <td><Chips items={(data?.freePeriods?.[d] || []).map((n) => `P${n}`)} empty="—" max={8} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

const RANGES = [
  { value: '30d',  label: 'Last 30 days' },
  { value: '6m',   label: 'Last six months' },
  { value: 'year', label: 'This academic year' },
];

function AttendanceTab({ id, fullLink }) {
  const [range, setRange] = useState('6m');
  const { data, loading, error, refetch } = useFetch(() => api.getAttendance(id, { range }), [id, range]);
  const picker = (
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      <select className="form-control" style={{ width: 'auto' }} aria-label="Attendance period" value={range} onChange={(ev) => setRange(ev.target.value)}>
        {RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      {fullLink && <Link className="btn btn-secondary btn-sm" to={fullLink}>Open Attendance</Link>}
    </span>
  );
  if (loading && !data) return <Section title="Attendance Summary" action={picker}><Spinner /></Section>;
  if (error) return <Section title="Attendance Summary" action={picker}><ErrorState error={error} onRetry={refetch} /></Section>;

  return (
    <Section
      title="Attendance Summary"
      subtitle={`${data.range?.label || 'Selected period'} · ${fmtDate(data.range?.from)} to ${fmtDate(data.range?.to)}. Summary only — the full register lives in the Attendance module.`}
      action={picker}
    >
      <div className="stat-grid" style={{ marginBottom: 16, opacity: loading ? 0.55 : 1 }}>
        <div className="stat-card"><div className="stat-card__info">
          <div className="stat-card__value">{data.percent == null ? '—' : `${data.percent}%`}</div>
          <div className="stat-card__label">Attendance</div>
        </div></div>
        <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.present}</div><div className="stat-card__label">Present</div></div></div>
        <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.absent}</div><div className="stat-card__label">Absent</div></div></div>
        <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.halfDay}</div><div className="stat-card__label">Half Day</div></div></div>
        <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.leave}</div><div className="stat-card__label">Leave</div></div></div>
      </div>
      {data.marked === 0
        ? <Empty icon="✅" title="Nothing marked in this period" message="No attendance has been recorded for this employee between these dates." />
        : (
          <>
            <Meter value={data.percent || 0} />
            <p className="text-muted text-sm" style={{ marginTop: 8 }}>{data.marked} day{data.marked === 1 ? '' : 's'} marked. A half day counts as half a day present.</p>
          </>
        )}
    </Section>
  );
}

function LeaveTab({ id, fullLink }) {
  const { data, loading, error, refetch } = useFetch(() => api.getLeave(id), [id]);
  if (loading) return <Section title="Leave"><Spinner /></Section>;
  if (error) return <Section title="Leave"><ErrorState error={error} onRetry={refetch} /></Section>;
  const inYear = data.balanceYear ? ` in ${data.balanceYear}` : '';

  return (
    <>
      <Section
        title="Leave Summary"
        subtitle={`${data.balanceYear ? `Balances and requests for ${data.balanceYear}. ` : ''}Summary only — applications and approvals live in the Leave module`}
        action={fullLink && <Link className="btn btn-secondary btn-sm" to={fullLink}>Open Leave</Link>}
      >
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.taken}</div><div className="stat-card__label">Days taken{inYear}</div></div></div>
          <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.pendingRequests}</div><div className="stat-card__label">Pending requests</div></div></div>
          <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.approvedRequests}</div><div className="stat-card__label">Approved{inYear}</div></div></div>
          <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.rejectedRequests}</div><div className="stat-card__label">Rejected{inYear}</div></div></div>
        </div>
        {(data.balances || []).length === 0
          ? <Empty icon="🏖️" title="No leave balances" message="No leave types have been allocated to this employee for this year." />
          : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Leave Type</th><th>Allocated</th><th>Used</th><th>Pending</th><th>Lapsed</th><th>Remaining</th></tr></thead>
                <tbody>
                  {data.balances.map((b, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{b.leaveType}</td>
                      <td>{b.allocated + b.carriedForward}{b.carriedForward ? <span className="text-muted text-sm"> ({b.carriedForward} carried)</span> : null}</td>
                      <td>{b.used}</td>
                      <td>{b.pending}</td>
                      <td>{b.expired || '—'}</td>
                      <td><strong>{b.remaining}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Section>
      {(data.upcoming || []).length > 0 && (
        <Section title="On leave now and coming up">
          {data.upcoming.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{l.leaveType}{l.ongoing && <span className="badge badge-warning" style={{ marginLeft: 8 }}>On leave now</span>}</span>
              <span className="text-muted text-sm">{fmtDate(l.fromDate)} → {fmtDate(l.toDate)} · {l.totalDays}d</span>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

const CATEGORY_LABEL = { identity: 'Identity', education: 'Education', employment: 'Employment', compliance: 'Checks & Fitness', bank: 'Bank', other: 'Other' };
const CATEGORY_ORDER = ['identity', 'education', 'employment', 'compliance', 'bank', 'other'];
const ACCEPT = '.pdf,.jpg,.jpeg,.png';

/**
 * Every document slot the record has — on file or not — so the office can see
 * what is missing and put a paper handed in at the desk straight onto the
 * record. Uploading is not accepting: the file still goes through review.
 */
function Documents({ docs = [], id, name, canUpload, onChanged }) {
  const input = useRef(null);
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState('');

  const pick = (doc) => { setTarget(doc); input.current?.click(); };
  const upload = async (file) => {
    if (!file || !target) return;
    if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) { toast.error('Choose a PDF, JPG or PNG file'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('That file is over 5 MB — choose a smaller one'); return; }
    setBusy(target.key);
    try {
      await api.uploadEmployeeDocument(id, target.key, file);
      toast.success(`${target.label} uploaded for ${name} — it is now waiting for review`);
      onChanged();
    } catch (err) { toast.error(err.message || 'The file could not be uploaded'); }
    finally { setBusy(''); }
  };

  const byCat = docs.reduce((m, d) => { (m[d.category] ||= []).push(d); return m; }, {});
  const cats = [...CATEGORY_ORDER.filter((c) => byCat[c]), ...Object.keys(byCat).filter((c) => !CATEGORY_ORDER.includes(c))];
  if (docs.length === 0) {
    return <Section title="Documents"><Empty icon="📄" title="No documents to show" message="This employee has no staff record yet — complete it on the teacher form first." /></Section>;
  }
  return (
    <>
      <input ref={input} type="file" accept={ACCEPT} hidden
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; upload(f); }} />
      {cats.map((cat) => (
        <Section key={cat} title={`${CATEGORY_LABEL[cat] || cat} Documents`}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Document</th><th>Uploaded</th><th>Status</th><th>Decided by</th><th>Action</th></tr></thead>
              <tbody>
                {byCat[cat].map((d) => (
                  <tr key={d.key}>
                    <td style={{ fontWeight: 600 }}>
                      {d.label}
                      <span className="text-muted text-sm" style={{ fontWeight: 400, marginLeft: 6 }}>{d.required ? 'Required' : 'Optional'}</span>
                      {d.sensitive && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Sensitive</span>}
                    </td>
                    <td className="text-muted">{d.fileName ? (d.uploadedAt ? fmtDate(d.uploadedAt) : 'On file') : '—'}</td>
                    <td>
                      <DocState state={DOC_STATE[d.verificationStatus] ? d.verificationStatus : 'pending'} />
                      {d.rejectionComment && (d.verificationStatus === 'rejected' || d.verificationStatus === 'resubmitted') && (
                        <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                          {d.verificationStatus === 'resubmitted' ? 'Rejected before: ' : 'Reason: '}&ldquo;{d.rejectionComment}&rdquo;
                        </div>
                      )}
                    </td>
                    <td className="text-muted">
                      {d.verificationStatus === 'verified'
                        ? `${d.verifiedBy || 'The office'}${d.verifiedAt ? ` · ${fmtDate(d.verifiedAt)}` : ''}`
                        : '—'}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                        {d.url && <a className="btn btn-secondary btn-sm" href={fileUrl(d.url)} target="_blank" rel="noreferrer">View</a>}
                        {canUpload && (
                          <Button size="sm" variant={d.fileName ? 'secondary' : 'primary'} loading={busy === d.key} disabled={!!busy} onClick={() => pick(d)}>
                            {d.fileName ? 'Replace' : 'Upload'}
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
      <p className="text-muted text-sm">PDF, JPG or PNG, up to 5 MB. A file uploaded here still has to be accepted on the Verification page; replacing one that was already accepted puts its section back to pending.</p>
    </>
  );
}

/**
 * Masked values arrive masked. Revealing is a deliberate action that costs one
 * request, is checked again on the server, and is written to the audit log.
 */
function RevealField({ label, masked, field, id, canReveal }) {
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);

  // Hiding needs no request: the value was only ever held in this screen.
  // Revealing again asks the server again, and is logged again.
  const hide = () => setValue(null);

  const reveal = async () => {
    setBusy(true);
    try {
      const res = await api.revealField(id, field);
      setValue((res.data ?? res).value);
      toast.success(`${label} revealed — this has been logged`);
    } catch (err) { toast.error(err.message || 'Could not reveal'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)', alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ color: 'var(--text-muted)', fontSize: '.83rem', minWidth: 190 }}>{label}</span>
      <span style={{ flex: 1, fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace', letterSpacing: '.06em', fontWeight: 600 }}>
        {value ?? (masked || <span className="text-muted" style={{ fontWeight: 400, fontFamily: 'inherit' }}>Not on file</span>)}
      </span>
      {masked && canReveal && value == null && (
        <Button size="sm" variant="secondary" loading={busy} onClick={reveal}>👁 Reveal</Button>
      )}
      {value != null && (
        <>
          <span className="badge badge-warning">Logged</span>
          <Button size="sm" variant="secondary" onClick={hide}>🙈 Hide</Button>
        </>
      )}
    </div>
  );
}

const GovernmentIds = ({ g = {}, id, canReveal }) => (
  <Section title="Government ID Information" subtitle="Values are masked. Revealing one is recorded in the audit log, and shows on the History tab.">
    <RevealField label="Aadhaar Number" masked={g.aadhaarNumber} field="aadhaarNumber" id={id} canReveal={canReveal} />
    <RevealField label="PAN Number"     masked={g.panNumber}     field="panNumber"     id={id} canReveal={canReveal} />
    <RevealField label="UAN / PF Number" masked={g.uanNumber}    field="uanNumber"     id={id} canReveal={canReveal} />
    <KV label="Verification" value={<Badge variant={VERIFY_TONE[g.verificationStatus]}>{g.verificationStatus}</Badge>} />
    <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
      {g.aadhaarFront && <a className="btn btn-secondary btn-sm" href={fileUrl(g.aadhaarFront)} target="_blank" rel="noreferrer">Aadhaar — Front</a>}
      {g.aadhaarBack  && <a className="btn btn-secondary btn-sm" href={fileUrl(g.aadhaarBack)}  target="_blank" rel="noreferrer">Aadhaar — Back</a>}
      {g.panDocument  && <a className="btn btn-secondary btn-sm" href={fileUrl(g.panDocument)}  target="_blank" rel="noreferrer">PAN Document</a>}
    </div>
  </Section>
);

const BankPayroll = ({ data, id, payrollLink }) => {
  const b = data.bank;
  const p = data.payroll;
  const viewer = data.viewer || {};
  if (!b && !data.visibility?.payroll) return <Restricted what="bank and payroll information" />;
  return (
    <>
      {b ? (
        <Section title="Bank Information" subtitle="The account number is masked. Revealing it is recorded in the audit log.">
          <KV label="Account Holder Name" value={b.accountHolder} />
          <RevealField label="Account Number" masked={b.accountNumber} field="bankAccountNumber" id={id} canReveal={!!viewer.canRevealBank} />
          <KV label="IFSC" value={b.ifsc} mono />
          <KV label="Bank Branch" value={b.branch} />
          <KV label="Verification" value={<Badge variant={VERIFY_TONE[b.verificationStatus]}>{b.verificationStatus}</Badge>} />
        </Section>
      ) : (
        <Section title="Bank Information"><Restricted what="bank details" /></Section>
      )}
      {data.visibility?.payroll && data.modules?.payroll && (
        <Section title="Payroll" subtitle="Read from the Payroll module"
          action={payrollLink && <Link className="btn btn-secondary btn-sm" to={payrollLink}>Open Payroll</Link>}>
          {p ? (
            <>
              <KV label="Annual CTC" value={`₹ ${Number(p.annualCtc || 0).toLocaleString('en-IN')}`} />
              <KV label="Effective From" value={fmtDate(p.effectiveDate)} />
              <KV label="Revisions" value={p.revisions} />
            </>
          ) : <Empty icon="💵" title="No salary assigned" message="This employee has no active salary assignment in the Payroll module." />}
        </Section>
      )}
    </>
  );
};

/**
 * Where each section stands. Read-only: a section is signed off on the
 * Verification page, where its values and scans are on screen first — the rule
 * that somebody looked before signing holds only if there is one place to sign.
 */
function Verification({ list = [], id, base }) {
  const done = list.filter((v) => v.status === 'verified').length;
  return (
    <Section title="Verification Status"
      subtitle={`${done} of ${list.length} sections signed off`}
      action={<Link className="btn btn-primary btn-sm" to={`${base}/verification?employee=${id}`}>Review &amp; verify</Link>}>
      {list.map((v) => (
        <div key={v.section} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 200px', fontWeight: 500 }}>{v.label}</span>
          <Badge variant={VERIFY_TONE[v.status]}>{v.status === 'verified' ? 'Verified' : v.status === 'rejected' ? 'Rejected' : 'Pending'}</Badge>
          {v.verifiedBy && <span className="text-muted text-sm">by {v.verifiedBy} · {fmtDate(v.verifiedAt)}</span>}
          {v.status !== 'verified' && v.note && <span className="text-muted text-sm" style={{ flexBasis: '100%' }}>{v.note}</span>}
        </div>
      ))}
    </Section>
  );
}

const fmtWhen = (d) => {
  const x = new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  return x.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** What has been done to this record, newest first — including every full read of a masked number. */
function History({ id }) {
  const { data, loading, error, refetch } = useFetch(() => api.getHistory(id), [id]);
  if (loading) return <Section title="History"><Spinner /></Section>;
  if (error) return <Section title="History"><ErrorState error={error} onRetry={refetch} /></Section>;
  const events = data?.events || [];
  return (
    <Section title="History" subtitle="Placements, sign-offs, document decisions and every time a masked number was read in full — newest first">
      {events.length === 0
        ? <Empty icon="🕘" title="Nothing recorded yet" message="Changes made to this record from the directory appear here." />
        : events.map((ev) => (
          <div key={ev._id} style={{ display: 'flex', gap: 12, padding: '9px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'baseline' }}>
            <span className="text-muted text-sm" style={{ minWidth: 150 }}>{fmtWhen(ev.at)}</span>
            <span style={{ flex: '1 1 320px' }}>
              {ev.text}
              {ev.sensitive && <span className="badge badge-warning" style={{ marginLeft: 8 }}>Sensitive read</span>}
            </span>
            <span className="text-muted text-sm">{ev.bySelf ? 'The employee' : ev.by}</span>
          </div>
        ))}
    </Section>
  );
}
