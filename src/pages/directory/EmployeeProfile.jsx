import React, { useState } from 'react';
import { Link, Navigate, useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/employeeDirectory.api';
import { PageHeader, Badge, Button, Empty, Spinner, Modal, Select } from '../../components/ui/index';
import {
  Avatar, KV, Section, Restricted, Meter, Chips, ErrorState, Skeleton, Blank,
  Field, Block, MailIcon, PhoneIcon, PinIcon, CalendarIcon, UserIcon,
  BuildingIcon, BookIcon, BadgeIcon,
  fmtDate, fileUrl, STATUS_TONE, STATUS_LABEL, VERIFY_TONE, useDirectoryBase,
} from './parts';

// The tabs a viewer sees are decided by the payload: a block the caller may not
// read is not present in the response at all, so there is nothing to hide here.

const ROLE_TONE = { class_teacher: 'primary', vice_class_teacher: 'info', subject_teacher: 'muted' };

// ─────────────────────────────────────────────────────────────────────────────
//  Compact profile — a teacher looking up a colleague.
//
//  Everything the payload carries for this tier fits on one screen, so there
//  are no tabs and nothing to scroll past: an identity band and a grid of the
//  facts a colleague actually needs. The restricted blocks are not hidden here,
//  they were never sent (see projectRow / visibilityFor on the server).
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  Compact profile — a teacher looking up a colleague.
//
//  Everything the payload carries for this tier fits on one screen, so there
//  are no tabs and nothing to scroll past: an identity band and a grid of the
//  facts a colleague actually needs. The restricted blocks are not hidden here,
//  they were never sent (see projectRow / visibilityFor on the server).
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  Compact profile — a teacher looking up a colleague.
//
//  Everything the payload carries for this tier fits on one screen, so there
//  are no tabs and nothing to scroll past: an identity band and a grid of the
//  facts a colleague actually needs. The restricted blocks are not hidden here,
//  they were never sent (see projectRow / visibilityFor on the server).
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
//  Compact profile — a teacher looking up a colleague.
//
//  Everything the payload carries for this tier fits on one screen, so there
//  are no tabs and nothing to scroll past: an identity band and a grid of the
//  facts a colleague actually needs. The restricted blocks are not hidden here,
//  they were never sent (see projectRow / visibilityFor on the server).
// ─────────────────────────────────────────────────────────────────────────────

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
  const { base } = useDirectoryBase();
  const [tab, setTab] = useState('overview');

  const { data, loading, error, refetch } = useFetch(() => api.getEmployee(id), [id]);

  if (loading) {
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
  if (error) {
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

  const TABS = [
    { key: 'overview',      label: 'Overview' },
    { key: 'personal',      label: 'Personal',          show: true },
    { key: 'contact',       label: 'Contact',           show: true },
    { key: 'employment',    label: 'Employment' },
    { key: 'education',     label: 'Education' },
    { key: 'assignments',   label: 'Subjects & Classes' },
    { key: 'responsibilities', label: 'Responsibilities' },
    { key: 'timetable',     label: 'Timetable',  show: modules.timetable },
    { key: 'attendance',    label: 'Attendance', show: modules.attendance && vis.attendance },
    { key: 'leave',         label: 'Leave',      show: modules.leave && vis.leave },
    { key: 'documents',     label: 'Documents',  show: vis.documents },
    { key: 'governmentIds', label: 'Government IDs', show: vis.governmentId },
    { key: 'bank',          label: 'Bank / Payroll', show: vis.bank || vis.payroll },
    { key: 'verification',  label: 'Verification' },
  ].filter((t) => t.show !== false);

  return (
    <div className="page">
      <PageHeader
        title={o.name}
        subtitle={[o.designation, o.department].filter(Boolean).join(' · ') || 'Employee profile'}
        action={<Button variant="secondary" onClick={() => navigate(`${base}/employees`)}>← Back to directory</Button>}
      />

      {/* ── Identity card ───────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <Avatar name={o.name} src={o.profileImage} size={72} />
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{o.name}</h2>
              <Badge variant={STATUS_TONE[o.employmentStatus]}>{STATUS_LABEL[o.employmentStatus]}</Badge>
              {viewer.isSelf && <Badge variant="info">This is you</Badge>}
            </div>
            <div className="text-muted text-sm" style={{ marginTop: 4 }}>
              {o.employeeId && <span style={{ fontFamily: 'ui-monospace,monospace' }}>{o.employeeId}</span>}
              {o.designation && <> · {o.designation}</>}
              {o.department && <> · {o.department}</>}
            </div>
            <div className="text-sm" style={{ marginTop: 6, wordBreak: 'break-all' }}>
              ✉️ {o.officialEmail} {o.officialPhone && <>· 📞 {o.officialPhone}</>}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {modules.chat && !viewer.isSelf && <Link className="btn btn-secondary btn-sm" to="/chat">💬 Chat</Link>}
            <a className="btn btn-secondary btn-sm" href={`mailto:${o.officialEmail}`}>✉️ Email</a>
            {o.officialPhone && <a className="btn btn-secondary btn-sm" href={`tel:${o.officialPhone.replace(/\s/g, '')}`}>📞 Call</a>}
          </div>
        </div>
        {data.profileCompletion && (
          <div className="card-footer" style={{ display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 5 }}>
              <span className="text-muted">Profile completion</span>
              <strong>{data.profileCompletion.percent}%</strong>
            </div>
            <Meter value={data.profileCompletion.percent} />
            {data.profileCompletion.missing.length > 0 && (
              <div style={{ marginTop: 8, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                <span className="text-muted text-sm">Missing:</span>
                {data.profileCompletion.missing.slice(0, 8).map((m) => (
                  <span key={m.key} className="badge badge-warning">{m.label}</span>
                ))}
                {data.profileCompletion.missing.length > 8 && (
                  <span className="badge badge-muted">+{data.profileCompletion.missing.length - 8} more</span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="tabs" style={{ flexWrap: 'wrap' }}>
        {TABS.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && <Overview data={data} base={base} />}
      {tab === 'personal'      && (vis.personal ? <Personal p={data.personal} /> : <Restricted what="personal information" />)}
      {tab === 'contact'       && (vis.contact ? <Contact c={data.contact} /> : <ContactLimited o={o} />)}
      {tab === 'employment'    && <Employment data={data} id={id} onSaved={refetch} base={base} />}
      {tab === 'education'     && <Education e={data.education} canSeeDocs={vis.education} />}
      {tab === 'assignments'   && <Assignments a={data.subjectsClasses} />}
      {tab === 'responsibilities' && <Responsibilities list={data.responsibilities} id={id} isAdmin={viewer.isAdmin} onChanged={refetch} />}
      {tab === 'timetable'     && <TimetableTab id={id} base={base} />}
      {tab === 'attendance'    && (vis.attendance ? <AttendanceTab id={id} /> : <Restricted what="attendance" />)}
      {tab === 'leave'         && (vis.leave ? <LeaveTab id={id} /> : <Restricted what="leave" />)}
      {tab === 'documents'     && (vis.documents ? <Documents docs={data.documents} /> : <Restricted what="employee documents" />)}
      {tab === 'governmentIds' && (vis.governmentId ? <GovernmentIds g={data.governmentIds} id={id} canReveal={viewer.canReveal} /> : <Restricted what="government ID information" />)}
      {tab === 'bank'          && <BankPayroll data={data} id={id} />}
      {tab === 'verification'  && <Verification list={data.verification} id={id} isAdmin={viewer.isAdmin} onChanged={refetch} />}
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const Overview = ({ data, base }) => {
  const o = data.overview || {};
  return (
    <Section title="Overview">
      <KV label="Full Name" value={o.name} />
      <KV label="Employee ID" value={o.employeeId} mono />
      <KV label="Teacher ID" value={o.teacherId || o.employeeId} mono />
      <KV label="Designation" value={o.designation} />
      <KV label="Department" value={o.department} />
      <KV label="Employee Type" value={o.staffType === 'teaching' ? 'Teaching' : 'Non-Teaching'} />
      <KV label="Employment Status" value={<Badge variant={STATUS_TONE[o.employmentStatus]}>{STATUS_LABEL[o.employmentStatus]}</Badge>} />
      <KV label="Date of Joining" value={fmtDate(o.joiningDate)} />
      <KV label="Official Email" value={o.officialEmail} />
      <KV label="Official Mobile" value={o.officialPhone} />
      <KV label="Subjects" value={<Chips items={o.subjects} />} />
      <KV label="Classes & Sections" value={<Chips items={(o.classes || []).map((c) => c.label)} />} />
      <KV label="Class Teacher of" value={<Chips items={o.classTeacherOf} empty="Not a class teacher" />} />
      <KV label="Reporting Manager" value={o.reportingManager
        ? <Link to={`${base}/employees/${o.reportingManager._id}`}>{o.reportingManager.name}{o.reportingManager.designation ? ` · ${o.reportingManager.designation}` : ''}</Link>
        : ''} />
    </Section>
  );
};

const Personal = ({ p = {} }) => (
  <Section title="Personal Information" subtitle="From the employee's own record">
    <KV label="Full Name" value={p.fullName} />
    <KV label="Date of Birth" value={fmtDate(p.dob)} />
    <KV label="Gender" value={p.gender} />
    <KV label="Blood Group" value={p.bloodGroup} />
    <KV label="Father's / Husband's Name" value={p.fatherOrHusbandName} />
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

function Employment({ data, id, onSaved, base }) {
  const e = data.employment || {};
  const viewer = data.viewer || {};
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ department: e.department || '', staffType: '', reportingManager: e.reportingManager?._id || '' });
  const [busy, setBusy] = useState(false);
  const { data: meta } = useFetch(api.getMeta, []);

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

  return (
    <>
      <Section
        title="Employment Information"
        action={viewer.isAdmin && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Edit placement</Button>}
      >
        <KV label="Employee ID" value={e.employeeId} mono />
        <KV label="Teacher ID" value={e.teacherId || e.employeeId} mono />
        <KV label="Date of Joining" value={fmtDate(e.joiningDate)} />
        <KV label="Designation" value={e.designation} />
        <KV label="Department" value={e.department} />
        <KV label="Employee Type" value={e.staffType === 'teaching' ? 'Teaching' : 'Non-Teaching'} />
        <KV label="Employment Status" value={<Badge variant={STATUS_TONE[e.employmentStatus]}>{STATUS_LABEL[e.employmentStatus]}</Badge>} />
        {e.employmentType !== undefined && <KV label="Fresher / Experienced" value={e.employmentType ? (e.employmentType === 'fresher' ? 'Fresher' : 'Experienced') : ''} />}
        {e.totalExperience !== undefined && <KV label="Total Experience" value={e.totalExperience} />}
        {e.previousSchool !== undefined && <KV label="Previous School" value={e.previousSchool} />}
        {e.lastDesignation !== undefined && <KV label="Previous Designation" value={e.lastDesignation} />}
        <KV label="Reporting Manager" value={e.reportingManager
          ? <Link to={`${base}/employees/${e.reportingManager._id}`}>{e.reportingManager.name}</Link> : ''} />
        <KV label="Campus / Branch" value={<span className="text-muted">Not configured in this ERP</span>} />
      </Section>

      <Modal open={open} onClose={() => setOpen(false)} title="Edit employment placement"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy} onClick={save}>Save</Button>
        </>}>
        <div className="form-group">
          <label className="form-label">Department</label>
          <input className="form-control" list="ed-departments" value={form.department}
            onChange={(ev) => setForm((f) => ({ ...f, department: ev.target.value }))}
            placeholder="e.g. Mathematics" />
          <datalist id="ed-departments">
            {(meta?.filters?.departments || []).map((d) => <option key={d} value={d} />)}
          </datalist>
          <span className="form-hint">Stored on the employee's own record — no separate department master is created.</span>
        </div>
        <Select label="Employee type" value={form.staffType} onChange={(ev) => setForm((f) => ({ ...f, staffType: ev.target.value }))}>
          <option value="">Derive from academic assignments</option>
          <option value="teaching">Teaching</option>
          <option value="non_teaching">Non-Teaching</option>
        </Select>
        <Select label="Reporting manager" value={form.reportingManager} onChange={(ev) => setForm((f) => ({ ...f, reportingManager: ev.target.value }))}>
          <option value="">None</option>
          {(meta?.filters?.managers || []).filter((m) => m._id !== id).map((m) => (
            <option key={m._id} value={m._id}>{m.label}{m.designation ? ` — ${m.designation}` : ''}</option>
          ))}
        </Select>
      </Modal>
    </>
  );
}

const Education = ({ e, canSeeDocs }) => {
  const list = e?.qualifications || [];
  return (
    <Section title="Education" subtitle={e?.supportsMultiple ? undefined : 'The employee record stores one highest qualification and one teaching degree'}>
      {list.length === 0
        ? <Empty icon="🎓" title="No qualification on file" message="Add it on the teacher record and it will appear here." />
        : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr>
                <th>Qualification</th><th>Type</th><th>Specialization</th><th>Institution</th>
                <th>Year</th><th>Grade</th>{canSeeDocs && <th>Certificate</th>}<th>Verification</th>
              </tr></thead>
              <tbody>
                {list.map((q, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 600 }}>{q.qualification}</td>
                    <td>{q.kind === 'teaching_degree' ? 'Teaching degree' : 'Highest qualification'}</td>
                    <td className="text-muted">{q.specialization || '—'}</td>
                    <td className="text-muted">{q.institution || '—'}</td>
                    <td className="text-muted">{q.passingYear || '—'}</td>
                    <td className="text-muted">{q.grade || '—'}</td>
                    {canSeeDocs && <td className="text-muted">{q.certificate ? <a href={fileUrl(q.certificate)} target="_blank" rel="noreferrer">View</a> : 'Not uploaded'}</td>}
                    <td><Badge variant={VERIFY_TONE[q.verificationStatus]}>{q.verificationStatus}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </Section>
  );
};

const Assignments = ({ a }) => {
  const rows = a?.assignments || [];
  return (
    <Section title="Subjects & Classes" subtitle={a?.academicYear ? `Academic year ${a.academicYear}` : 'Current academic assignments'}>
      {rows.length === 0
        ? <Empty icon="📚" title="No academic assignments" message="This employee is not assigned to any subject or section in the current academic year." />
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
};

function Responsibilities({ list = [], id, isAdmin, onChanged }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'hod', title: '', department: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const { data: meta } = useFetch(api.getMeta, []);

  const add = async () => {
    setBusy(true);
    try {
      await api.createResponsibility({ ...form, employee: id });
      toast.success('Responsibility assigned');
      setOpen(false);
      onChanged();
    } catch (err) { toast.error(err.message || 'Could not assign'); }
    finally { setBusy(false); }
  };
  const remove = async (rid) => {
    try { await api.removeResponsibility(rid); toast.success('Removed'); onChanged(); }
    catch (err) { toast.error(err.message || 'Could not remove'); }
  };

  return (
    <>
      <Section
        title="Responsibilities"
        subtitle="Class Teacher and Vice Class Teacher come from the section record; the rest are assigned here"
        action={isAdmin && <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>+ Assign</Button>}
      >
        {list.length === 0
          ? <Empty icon="🎖️" title="No additional responsibilities" message="HOD, coordinator and similar roles assigned to this employee appear here." />
          : list.map((r) => (
            <div key={r._id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{r.label}</div>
                <div className="text-muted text-sm">
                  {[r.department, r.className, r.sectionName, r.subjectName].filter(Boolean).join(' · ') || 'School-wide'}
                  {r.fromDate && ` · from ${fmtDate(r.fromDate)}`}
                </div>
              </div>
              {isAdmin && <Button size="sm" variant="danger" onClick={() => remove(r._id)}>Remove</Button>}
            </div>
          ))}
      </Section>

      <Modal open={open} onClose={() => setOpen(false)} title="Assign a responsibility"
        footer={<>
          <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={busy} onClick={add}>Assign</Button>
        </>}>
        <Select label="Responsibility" required value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
          {(meta?.filters?.responsibilityTypes || []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <div className="form-group">
          <label className="form-label">Custom title</label>
          <input className="form-control" placeholder="Leave blank to use the responsibility name"
            value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Department / scope</label>
          <input className="form-control" placeholder="e.g. Science"
            value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
        </div>
      </Modal>
    </>
  );
}

function TimetableTab({ id, base }) {
  const { data, loading, error, refetch } = useFetch(() => api.getTimetable(id), [id]);
  if (loading) return <Section title="Timetable"><Spinner /></Section>;
  if (error) return <Section title="Timetable"><ErrorState error={error} onRetry={refetch} /></Section>;

  const days = data?.days || [];
  const week = data?.week || {};
  const today = data?.today || {};

  return (
    <>
      <Section
        title="Today's Timetable"
        subtitle={today.day || 'Today'}
        action={<Link className="btn btn-secondary btn-sm" to={base.startsWith('/admin') ? '/admin/timetable' : '/teacher/timetable'}>View Full Timetable</Link>}
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

      <Section title="Weekly Timetable" subtitle={`${data?.totalPeriodsPerWeek || 0} periods a week${data?.academicYear ? ` · ${data.academicYear}` : ''}`}>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Day</th><th>Periods</th><th>Free</th></tr></thead>
            <tbody>
              {days.map((d) => (
                <tr key={d}>
                  <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{d}</td>
                  <td>
                    {(week[d] || []).length === 0
                      ? <span className="text-muted">No periods</span>
                      : <span style={{ display: 'inline-flex', gap: 5, flexWrap: 'wrap' }}>
                        {week[d].map((p) => (
                          <span key={p.periodNumber} className="badge badge-info" title={p.room || ''}>
                            P{p.periodNumber} {p.subject} · {[p.className, p.sectionName].filter(Boolean).join(' ')}
                          </span>
                        ))}
                      </span>}
                  </td>
                  <td><Chips items={(data?.freePeriods?.[d] || []).map((n) => `P${n}`)} empty="—" max={6} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}

function AttendanceTab({ id }) {
  const { data, loading, error, refetch } = useFetch(() => api.getAttendance(id), [id]);
  if (loading) return <Section title="Attendance"><Spinner /></Section>;
  if (error) return <Section title="Attendance"><ErrorState error={error} onRetry={refetch} /></Section>;

  return (
    <Section
      title="Attendance Summary"
      subtitle="Summary only — the full register lives in the Attendance module"
      action={<Link className="btn btn-secondary btn-sm" to="/admin/attendance">View Attendance</Link>}
    >
      <div className="stat-grid" style={{ marginBottom: 16 }}>
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
        ? <Empty icon="✅" title="Nothing marked yet" message="No attendance has been recorded for this employee in the selected range." />
        : <Meter value={data.percent || 0} />}
    </Section>
  );
}

function LeaveTab({ id }) {
  const { data, loading, error, refetch } = useFetch(() => api.getLeave(id), [id]);
  if (loading) return <Section title="Leave"><Spinner /></Section>;
  if (error) return <Section title="Leave"><ErrorState error={error} onRetry={refetch} /></Section>;

  return (
    <>
      <Section
        title="Leave Summary"
        subtitle="Summary only — applications and approvals live in the Leave module"
        action={<Link className="btn btn-secondary btn-sm" to="/admin/leave">View Leave Details</Link>}
      >
        <div className="stat-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.taken}</div><div className="stat-card__label">Days Taken</div></div></div>
          <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.pendingRequests}</div><div className="stat-card__label">Pending Requests</div></div></div>
          <div className="stat-card"><div className="stat-card__info"><div className="stat-card__value">{data.approvedRequests}</div><div className="stat-card__label">Approved</div></div></div>
        </div>
        {(data.balances || []).length === 0
          ? <Empty icon="🏖️" title="No leave balances" message="No leave types have been allocated to this employee." />
          : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Leave Type</th><th>Allocated</th><th>Used</th><th>Pending</th><th>Remaining</th></tr></thead>
                <tbody>
                  {data.balances.map((b, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{b.leaveType}</td>
                      <td>{b.allocated + b.carriedForward}</td>
                      <td>{b.used}</td>
                      <td>{b.pending}</td>
                      <td><strong>{b.remaining}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Section>
      {(data.upcoming || []).length > 0 && (
        <Section title="Upcoming Leave">
          {data.upcoming.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <span>{l.leaveType}</span>
              <span className="text-muted text-sm">{fmtDate(l.fromDate)} → {fmtDate(l.toDate)} · {l.totalDays}d</span>
            </div>
          ))}
        </Section>
      )}
    </>
  );
}

const CATEGORY_LABEL = { identity: 'Identity', employment: 'Employment', education: 'Education', other: 'Other' };

const Documents = ({ docs = [] }) => {
  const byCat = docs.reduce((m, d) => { (m[d.category] ||= []).push(d); return m; }, {});
  if (docs.length === 0) {
    return <Section title="Documents"><Empty icon="📄" title="No documents on file" message="Documents uploaded on the employee's record appear here." /></Section>;
  }
  return (
    <>
      {Object.entries(byCat).map(([cat, list]) => (
        <Section key={cat} title={`${CATEGORY_LABEL[cat] || cat} Documents`}>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Document Type</th><th>Uploaded</th><th>Verification</th><th>Verified By</th><th>Expiry</th><th>Action</th></tr></thead>
              <tbody>
                {list.map((d) => (
                  <tr key={d.key}>
                    <td style={{ fontWeight: 600 }}>
                      {d.label}{d.sensitive && <span className="badge badge-warning" style={{ marginLeft: 6 }}>Sensitive</span>}
                    </td>
                    <td className="text-muted">{fmtDate(d.uploadedAt)}</td>
                    <td><Badge variant={VERIFY_TONE[d.verificationStatus]}>{d.verificationStatus}</Badge></td>
                    <td className="text-muted">{d.verifiedBy || '—'}</td>
                    <td className="text-muted">{d.expiresAt ? fmtDate(d.expiresAt) : '—'}</td>
                    <td>{d.url
                      ? <a className="btn btn-secondary btn-sm" href={fileUrl(d.url)} target="_blank" rel="noreferrer">View / Download</a>
                      : <span className="text-muted text-sm">Restricted</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ))}
    </>
  );
};

/**
 * Masked values arrive masked. Revealing is a deliberate action that costs one
 * request, is checked again on the server, and is written to the audit log.
 */
function RevealField({ label, masked, field, id, canReveal }) {
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);

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
      {value != null && <span className="badge badge-warning">Logged</span>}
    </div>
  );
}

const GovernmentIds = ({ g = {}, id, canReveal }) => (
  <Section title="Government ID Information" subtitle="Values are masked. Revealing one is recorded in the audit log.">
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

const BankPayroll = ({ data, id }) => {
  const b = data.bank;
  const p = data.payroll;
  const viewer = data.viewer || {};
  if (!b && !data.visibility?.payroll) return <Restricted what="bank and payroll information" />;
  return (
    <>
      {b ? (
        <Section title="Bank Information" subtitle="The account number is masked. Revealing it needs administrative access to Payroll and is logged.">
          <KV label="Account Holder Name" value={b.accountHolder} />
          <RevealField label="Account Number" masked={b.accountNumber} field="bankAccountNumber" id={id} canReveal={viewer.canReveal && viewer.canViewPayroll} />
          <KV label="IFSC" value={b.ifsc} mono />
          <KV label="Bank Branch" value={b.branch} />
          <KV label="Verification" value={<Badge variant={VERIFY_TONE[b.verificationStatus]}>{b.verificationStatus}</Badge>} />
        </Section>
      ) : (
        <Section title="Bank Information"><Restricted what="bank details" /></Section>
      )}
      {data.visibility?.payroll && (
        <Section title="Payroll" subtitle="Read from the Payroll module"
          action={<Link className="btn btn-secondary btn-sm" to="/admin/payroll/assignments">Open Payroll</Link>}>
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

function Verification({ list = [], id, isAdmin, onChanged }) {
  const [busy, setBusy] = useState('');
  const setStatus = async (sectionKey, status) => {
    setBusy(sectionKey);
    try { await api.setVerification(id, { section: sectionKey, status }); toast.success('Verification updated'); onChanged(); }
    catch (err) { toast.error(err.message || 'Could not update'); }
    finally { setBusy(''); }
  };
  return (
    <Section title="Verification Status" subtitle={isAdmin ? 'Sign each section off once the paperwork has been checked' : 'Set by your school administrator'}>
      {list.map((v) => (
        <div key={v.section} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <span style={{ flex: '1 1 200px', fontWeight: 500 }}>{v.label}</span>
          <Badge variant={VERIFY_TONE[v.status]}>{v.status === 'verified' ? 'Verified' : v.status === 'rejected' ? 'Rejected' : 'Pending'}</Badge>
          {v.verifiedBy && <span className="text-muted text-sm">by {v.verifiedBy} · {fmtDate(v.verifiedAt)}</span>}
          {isAdmin && (
            <span style={{ display: 'flex', gap: 6 }}>
              <Button size="sm" variant="success" loading={busy === v.section} onClick={() => setStatus(v.section, 'verified')}>Verify</Button>
              <Button size="sm" variant="secondary" onClick={() => setStatus(v.section, 'pending')}>Reset</Button>
              <Button size="sm" variant="danger" onClick={() => setStatus(v.section, 'rejected')}>Reject</Button>
            </span>
          )}
        </div>
      ))}
    </Section>
  );
}
