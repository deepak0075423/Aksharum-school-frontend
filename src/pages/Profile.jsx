import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useModules } from '../contexts/ModulesContext';
import api from '../api/axios';
import { getEmployee } from '../api/employeeDirectory.api';
import { Button, Modal, Spinner, Badge } from '../components/ui/index';
import AddressFields from '../components/ui/AddressFields';
import { isPhone } from '../utils/validators';
import {
  Avatar, Field, Block, Chips, MailIcon, PhoneIcon, PinIcon, CalendarIcon,
  UserIcon, BuildingIcon, BookIcon, BadgeIcon, fmtDate, fileUrl,
} from './directory/parts';

// ─────────────────────────────────────────────────────────────────────────────
//  My Profile.
//
//  This is the same screen as an employee's page in the Employee Directory —
//  the same panel, blocks and fields — so a teacher sees one consistent record
//  of themselves wherever they open it. The difference is that this one is
//  theirs: it carries Edit and Change Password.
//
//  The employee half is fetched from the directory when the caller has an
//  employee record and the module is on. Everyone else (students, parents,
//  super admin) gets the account half only, in the same layout.
// ─────────────────────────────────────────────────────────────────────────────

// Matches the server's uploadProfile limits: images only, up to 5 MB.
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

const ROLE_LABEL = {
  super_admin: 'Super Admin', school_admin: 'School Admin',
  teacher: 'Teacher', student: 'Student', parent: 'Parent',
};

export default function Profile() {
  const { user, reload } = useAuth();
  const { isEnabled } = useModules();

  const [emp, setEmp]         = useState(null);   // directory record, when there is one
  const [empLoading, setEmpL] = useState(true);
  const [editOpen, setEdit]   = useState(false);
  const [pwOpen, setPwOpen]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [pwSaving, setPwSav]  = useState(false);

  const [form, setForm] = useState({ name: '', phone: '' });
  // The chosen file plus a local preview, and a flag for "clear my photo".
  const [photo, setPhoto] = useState({ file: null, preview: '', remove: false });
  // The employee fields a member of staff may correct about themselves. The
  // server keeps the authoritative whitelist — designation, department,
  // employee ID, joining date, government IDs, bank details and every uploaded
  // document stay with the administrator.
  const [empForm, setEmpForm] = useState(null);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });

  // Only staff have an employee record, and only when the school runs the module.
  const isStaff = user?.role === 'teacher' || user?.role === 'school_admin';
  // Login returns the account as `id`; /auth/me returns the raw row as `_id`.
  // A reloaded tab hits the second shape, so accept either.
  const userId = user?.id || user?._id || '';
  useEffect(() => {
    let alive = true;
    if (!userId || !isStaff || !isEnabled('employeeDirectory')) { setEmpL(false); return; }
    getEmployee(userId)
      .then((res) => { if (alive) setEmp(res?.data ?? res); })
      // A missing or forbidden record is not an error here — the account half
      // of this page stands on its own.
      .catch(() => {})
      .finally(() => { if (alive) setEmpL(false); });
    return () => { alive = false; };
  }, [userId, isStaff, isEnabled]);

  const openEdit = async () => {
    setForm({ name: user.name || '', phone: user.phone || '' });
    setPhoto({ file: null, preview: '', remove: false });
    setEmpForm(null);
    setEdit(true);
    if (!isStaff) return;
    try {
      const res = await api.get('/profile/employee');
      const d = res?.data ?? res;
      if (d?.editable) {
        const e = { ...d.editable };
        if (e.dob) e.dob = new Date(e.dob).toISOString().slice(0, 10);
        setEmpForm(e);
      }
    } catch { /* the account half still edits fine on its own */ }
  };

  const setEmpField = (key) => (ev) =>
    setEmpForm((f) => ({ ...f, [key]: ev?.target ? ev.target.value : ev }));

  const saveProfile = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    if (form.phone && !isPhone(form.phone)) return toast.error('Please enter a valid phone number');
    if (empForm?.alternatePhone && !isPhone(empForm.alternatePhone))
      return toast.error('Secondary phone is not valid');
    if (empForm?.emergencyContactPhone && !isPhone(empForm.emergencyContactPhone))
      return toast.error('Emergency contact phone is not valid');

    setSaving(true);
    try {
      // Multipart because the photo rides along; the text fields arrive as
      // strings, which is what the endpoint already reads.
      const fd = new FormData();
      fd.append('name', form.name.trim());
      fd.append('phone', form.phone || '');
      if (photo.file) fd.append('profileImage', photo.file);
      if (photo.remove) fd.append('removeProfileImage', 'true');
      await api.put('/profile/update', fd);
      // The employment half goes to its own whitelisted endpoint — the account
      // update above must never become a way to write employee fields.
      if (empForm) await api.put('/profile/employee', empForm);
      toast.success('Profile updated');
      setEdit(false);
      reload();
      // Re-read the employee half so the page shows what was just saved.
      if (userId && isStaff && isEnabled('employeeDirectory')) {
        getEmployee(userId).then((r) => setEmp(r?.data ?? r)).catch(() => {});
      }
    } catch (err) { toast.error(err.message || 'Could not save'); }
    finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (pwForm.newPassword.length < 8) return toast.error('New password must be at least 8 characters');
    if (pwForm.newPassword !== pwForm.confirm) return toast.error('Passwords do not match');
    setPwSav(true);
    try {
      await api.post('/auth/reset-password', {
        currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword,
      });
      toast.success('Password changed');
      setPwForm({ currentPassword: '', newPassword: '', confirm: '' });
      setPwOpen(false);
    } catch (err) { toast.error(err.message || 'Could not change password'); }
    finally { setPwSav(false); }
  };

  if (!user) return <div className="loading-page"><Spinner /></div>;

  const o = emp?.overview || {};
  const contact = emp?.contact || {};
  const personal = emp?.personal || {};
  const assignments = emp?.subjectsClasses?.assignments || [];
  const teaches = assignments.filter((a) => a.role === 'subject_teacher');
  const completion = emp?.profileCompletion;

  const addr = (a) => (!a ? '' : [a.line, a.city, a.state, a.pincode].filter(Boolean).join(', '));

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>My Profile</h1>
          <p className="text-muted">Your account and employment record</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setPwOpen(true)}>🔒 Change Password</Button>
          <Button onClick={openEdit}>✏️ Edit Profile</Button>
        </div>
      </div>

      {empLoading && isStaff ? (
        <div className="ed-panel" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <div className="ed-panel">
          {/* Identity — the same hero the directory uses */}
          <div className="ed-hero">
            {/* Photo first. The emoji avatar is legacy — it can no longer be
                set, and uploading a photo clears it, so it only shows for an
                account that picked one before. */}
            {!user.profileImage && user.profileIcon
              ? <div style={{
                  width: 84, height: 84, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--bg)', border: '2px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 38,
                }}>{user.profileIcon}</div>
              : <Avatar name={user.name} src={user.profileImage} size={84} />}
            <div style={{ minWidth: 0 }}>
              <div className="ed-hero__name">{user.name}</div>
              <div className="ed-hero__role">
                {o.designation || <span className="ed-none">{ROLE_LABEL[user.role] || user.role}</span>}
                {o.department ? ` · ${o.department}` : ''}
              </div>
              {o.employeeId !== undefined && (
                <div className="ed-hero__id">
                  Employee ID: {o.employeeId || <span className="ed-none">not set</span>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap' }}>
                <Badge variant="primary">{ROLE_LABEL[user.role] || user.role}</Badge>
                {o.classTeacherOf?.length > 0 && (
                  <Badge variant="info">Class Teacher · {o.classTeacherOf.join(', ')}</Badge>
                )}
              </div>
            </div>
          </div>

          {completion && (
            <div style={{ marginTop: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: 5 }}>
                <span className="text-muted">Profile completion</span><strong>{completion.percent}%</strong>
              </div>
              <div style={{ height: 8, borderRadius: 999, background: 'var(--bg)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${completion.percent}%`, borderRadius: 999,
                  background: completion.percent >= 90 ? 'var(--success)' : completion.percent >= 60 ? 'var(--warning)' : 'var(--danger)',
                }} />
              </div>
              {completion.missing?.length > 0 && (
                <div style={{ marginTop: 9, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <span className="text-muted text-sm">Missing:</span>
                  {completion.missing.slice(0, 8).map((m) => (
                    <span key={m.key} className="badge badge-warning">{m.label}</span>
                  ))}
                  {completion.missing.length > 8 && (
                    <span className="badge badge-muted">+{completion.missing.length - 8} more</span>
                  )}
                </div>
              )}
            </div>
          )}

          <Block icon={<PhoneIcon size={17} />} title="Contact Information">
            <div className="ed-facts">
              <Field icon={<MailIcon />} label="Email" value={user.email} />
              <Field icon={<PhoneIcon />} label="Mobile" value={user.phone} blank="Not recorded" />
              {contact.alternatePhone !== undefined && (
                <Field icon={<PhoneIcon />} label="Secondary Phone" value={contact.alternatePhone} blank="Not recorded" />
              )}
              {personal.emergencyContactName !== undefined && (
                <Field icon={<UserIcon />} label="Emergency Contact"
                  value={[personal.emergencyContactName, personal.emergencyContactPhone].filter(Boolean).join(' · ')}
                  blank="Not recorded" />
              )}
              {contact.currentAddress && (
                <Field icon={<PinIcon />} label="Current Address" value={addr(contact.currentAddress)} blank="Not recorded" />
              )}
              {contact.permanentAddress && (
                <Field icon={<PinIcon />} label="Permanent Address" value={addr(contact.permanentAddress)} blank="Not recorded" />
              )}
            </div>
          </Block>

          <Block icon={<CalendarIcon size={17} />} title="Account Details">
            <div className="ed-facts">
              <Field icon={<BadgeIcon />} label="Role" value={ROLE_LABEL[user.role] || user.role} />
              <Field icon={<BuildingIcon />} label="School" value={user.school?.name} blank="—" />
              <Field icon={<CalendarIcon />} label="Member Since"
                value={user.createdAt ? fmtDate(user.createdAt) : ''} blank="—" />
              <Field icon={<UserIcon />} label="Status"
                value={<Badge variant={user.isActive !== false ? 'success' : 'danger'}>
                  {user.isActive !== false ? 'Active' : 'Inactive'}
                </Badge>} />
            </div>
          </Block>

          {emp && (
            <>
              <Block icon={<BuildingIcon size={17} />} title="Employment Details">
                <div className="ed-facts">
                  <Field icon={<CalendarIcon />} label="Date of Joining"
                    value={o.joiningDate ? fmtDate(o.joiningDate) : ''} blank="Not recorded" />
                  <Field icon={<BuildingIcon />} label="Department" value={o.department} blank="Not set" />
                  <Field icon={<BadgeIcon />} label="Qualification"
                    value={[...new Set((emp.education?.qualifications || []).map((q) => q.qualification).filter(Boolean))].join(', ')}
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

              {personal.dob !== undefined && (
                <Block icon={<UserIcon size={17} />} title="Personal Information">
                  <div className="ed-facts">
                    <Field icon={<CalendarIcon />} label="Date of Birth"
                      value={personal.dob ? fmtDate(personal.dob) : ''} blank="Not recorded" />
                    <Field icon={<UserIcon />} label="Gender" value={personal.gender} blank="Not recorded" />
                    <Field icon={<BadgeIcon />} label="Blood Group" value={personal.bloodGroup} blank="Not recorded" />
                    <Field icon={<UserIcon />} label="Father's / Husband's Name"
                      value={personal.fatherOrHusbandName} blank="Not recorded" />
                  </div>
                </Block>
              )}
            </>
          )}

          {emp?.documents?.length > 0 && (
            <Block icon={<BadgeIcon size={17} />} title="My Documents">
              <div className="ed-facts">
                {emp.documents.map((d) => (
                  <Field key={d.key} icon={<BadgeIcon />} label={d.label}
                    value={d.url
                      ? <a href={fileUrl(d.url)} target="_blank" rel="noreferrer">View / Download</a>
                      : ''}
                    blank="Restricted" />
                ))}
              </div>
            </Block>
          )}

          {emp?.governmentIds && (
            <Block icon={<BadgeIcon size={17} />} title="Government IDs">
              <div className="ed-facts">
                <Field icon={<BadgeIcon />} label="Aadhaar Number" value={emp.governmentIds.aadhaarNumber} blank="Not on file" />
                <Field icon={<BadgeIcon />} label="PAN Number" value={emp.governmentIds.panNumber} blank="Not on file" />
                <Field icon={<BadgeIcon />} label="UAN / PF Number" value={emp.governmentIds.uanNumber} blank="Not on file" />
              </div>
              <p className="text-muted text-sm" style={{ marginTop: 12 }}>
                Shown masked. Contact your school administrator to correct these details.
              </p>
            </Block>
          )}

          {emp?.bank && (
            <Block icon={<BuildingIcon size={17} />} title="Bank Details">
              <div className="ed-facts">
                <Field icon={<UserIcon />} label="Account Holder" value={emp.bank.accountHolder} blank="Not on file" />
                <Field icon={<BadgeIcon />} label="Account Number" value={emp.bank.accountNumber} blank="Not on file" />
                <Field icon={<BuildingIcon />} label="IFSC" value={emp.bank.ifsc} blank="Not on file" />
                <Field icon={<PinIcon />} label="Branch" value={emp.bank.branch} blank="Not on file" />
              </div>
            </Block>
          )}

          {isStaff && !emp && !empLoading && (
            <Block icon={<BuildingIcon size={17} />} title="Employment Details">
              <p className="text-muted text-sm">
                No employee record is linked to this account yet. Ask your school administrator
                to complete it and the details will appear here.
              </p>
            </Block>
          )}
        </div>
      )}

      {/* ── Edit ─────────────────────────────────────────────────────────── */}
      <Modal open={editOpen} onClose={() => setEdit(false)} title="Edit profile"
        maxWidth={empForm ? 720 : 520}
        footer={<>
          <Button variant="secondary" onClick={() => setEdit(false)}>Cancel</Button>
          <Button loading={saving} onClick={saveProfile}>Save changes</Button>
        </>}>
        <div className="form-group">
          <label className="form-label required">Full Name</label>
          <input className="form-control" value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input className="form-control" value={user.email} disabled
            style={{ background: 'var(--bg)', cursor: 'not-allowed', opacity: .7 }} />
          <span className="form-hint">Email cannot be changed</span>
        </div>
        <div className="form-group">
          <label className="form-label">Phone Number</label>
          <input type="tel" className="form-control" value={form.phone} placeholder="+91 98765 43210"
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Profile Photo</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            {photo.preview || (user.profileImage && !photo.remove)
              ? <img
                  src={photo.preview || fileUrl(user.profileImage)}
                  alt="Profile preview"
                  style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }}
                />
              : <Avatar name={form.name || user.name} size={72} />}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>
                {user.profileImage && !photo.remove ? 'Change photo' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';           // re-picking the same file still fires
                    if (!file) return;
                    if (!PHOTO_TYPES.includes(file.type)) return toast.error('Choose a JPG, PNG, WebP or GIF image');
                    if (file.size > PHOTO_MAX_BYTES) return toast.error('Image must be 5 MB or smaller');
                    setPhoto({ file, preview: URL.createObjectURL(file), remove: false });
                  }}
                />
              </label>
              {(photo.preview || (user.profileImage && !photo.remove)) && (
                <Button size="sm" variant="secondary"
                  onClick={() => setPhoto({ file: null, preview: '', remove: true })}>
                  Remove
                </Button>
              )}
            </div>
          </div>
          <span className="form-hint">JPG, PNG, WebP or GIF, up to 5 MB.</span>
        </div>

        {/* ── The employee half ──────────────────────────────────────────
            Only the facts an employee owns about themselves. The server
            enforces the same list, so nothing here can reach designation,
            department, employee ID, joining date, IDs, bank or documents. */}
        {empForm && (
          <>
            <h3 style={{ fontSize: '.95rem', fontWeight: 700, margin: '22px 0 4px' }}>Personal</h3>
            <p className="form-hint" style={{ marginBottom: 14 }}>
              Designation, department, employee ID, joining date, government IDs, bank details
              and documents are maintained by your school administrator.
            </p>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Date of Birth</label>
                <input type="date" className="form-control" max={new Date().toISOString().slice(0, 10)}
                  value={empForm.dob || ''} onChange={setEmpField('dob')} />
              </div>
              <div className="form-group">
                <label className="form-label">Gender</label>
                <select className="form-control" value={empForm.gender || ''} onChange={setEmpField('gender')}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Blood Group</label>
                <select className="form-control" value={empForm.bloodGroup || ''} onChange={setEmpField('bloodGroup')}>
                  <option value="">Select</option>
                  {['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row form-row-3">
              <div className="form-group">
                <label className="form-label">Father&apos;s / Husband&apos;s Name</label>
                <input className="form-control" value={empForm.fatherOrHusbandName || ''}
                  onChange={setEmpField('fatherOrHusbandName')} />
              </div>
              <div className="form-group">
                <label className="form-label">Emergency Contact Name</label>
                <input className="form-control" value={empForm.emergencyContactName || ''}
                  onChange={setEmpField('emergencyContactName')} />
              </div>
              <div className="form-group">
                <label className="form-label">Emergency Contact Phone</label>
                <input type="tel" className="form-control" value={empForm.emergencyContactPhone || ''}
                  onChange={setEmpField('emergencyContactPhone')} />
              </div>
            </div>

            <h3 style={{ fontSize: '.95rem', fontWeight: 700, margin: '18px 0 12px' }}>Contact</h3>
            <div className="form-group">
              <label className="form-label">Secondary Phone</label>
              <input type="tel" className="form-control" placeholder="Optional"
                value={empForm.alternatePhone || ''} onChange={setEmpField('alternatePhone')} />
            </div>
            <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '4px 0 8px' }}>Current Address</div>
            <AddressFields prefix="current" form={empForm} setForm={setEmpForm}
              errs={{}} setErrs={() => {}} required={false} />
            <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '10px 0 8px' }}>Permanent Address</div>
            <AddressFields prefix="permanent" form={empForm} setForm={setEmpForm}
              errs={{}} setErrs={() => {}} required={false} />

            <h3 style={{ fontSize: '.95rem', fontWeight: 700, margin: '18px 0 12px' }}>Education</h3>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Highest Qualification</label>
                <input className="form-control" placeholder="e.g. M.Sc."
                  value={empForm.qualification || ''} onChange={setEmpField('qualification')} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Teaching Degree</label>
                <input className="form-control" placeholder="e.g. B.Ed."
                  value={empForm.teachingDegree || ''} onChange={setEmpField('teachingDegree')} />
              </div>
            </div>
          </>
        )}
      </Modal>

      {/* ── Password ─────────────────────────────────────────────────────── */}
      <Modal open={pwOpen} onClose={() => setPwOpen(false)} title="Change password" maxWidth={440}
        footer={<>
          <Button variant="secondary" onClick={() => setPwOpen(false)}>Cancel</Button>
          <Button loading={pwSaving} onClick={changePassword}>Change password</Button>
        </>}>
        <div className="form-group">
          <label className="form-label required">Current Password</label>
          <input type="password" className="form-control" value={pwForm.currentPassword}
            onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label required">New Password</label>
          <input type="password" className="form-control" minLength={8} placeholder="Minimum 8 characters"
            value={pwForm.newPassword}
            onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label required">Confirm New Password</label>
          <input type="password" className="form-control" value={pwForm.confirm}
            onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))} />
          {pwForm.confirm && pwForm.newPassword !== pwForm.confirm && (
            <span className="form-error">Passwords do not match</span>
          )}
        </div>
      </Modal>
    </div>
  );
}
