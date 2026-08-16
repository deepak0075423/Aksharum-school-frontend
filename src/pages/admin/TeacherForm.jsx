import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../api/admin.api';
import { Button, Modal } from '../../components/ui/index';
import AddressFields from '../../components/ui/AddressFields';
import { isPincode } from '../../utils/indiaStates';

// Kept in step with validateTeacherIntake() in school-backend/controllers/admin.controller.js
const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE    = /^[+\d\s-]{7,15}$/;
const AADHAAR_RE  = /^\d{12}$/;
const PAN_RE      = /^[A-Z]{5}\d{4}[A-Z]$/i;
const IFSC_RE     = /^[A-Z]{4}0[A-Z0-9]{6}$/i;

const BLOOD_GROUPS  = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
const QUALIFICATIONS = ['B.A.', 'B.Sc.', 'B.Com.', 'M.A.', 'M.Sc.', 'M.Com.', 'B.Tech.', 'M.Tech.', 'Ph.D.', 'Other'];
const TEACHING_DEGREES = ['B.Ed.', 'D.El.Ed.', 'M.Ed.', 'NTT', 'Other'];

export const EMPTY_TEACHER = {
  // 1. Personal
  name: '', dob: '', gender: '', bloodGroup: '',
  fatherOrHusbandName: '', emergencyContactName: '', emergencyContactPhone: '',
  // 2. Contact — addresses are structured the same way as student intake
  phone: '', alternatePhone: '', email: '',
  currentAddress: '', currentCity: '', currentState: '', currentPincode: '', currentCountry: 'India',
  permanentAddress: '', permanentCity: '', permanentState: '', permanentPincode: '', permanentCountry: 'India',
  sameAsCurrent: false,
  // 3. Government ID
  aadhaarNumber: '', panNumber: '', uanNumber: '',
  // 4. Education
  qualification: '', qualificationOther: '', teachingDegree: '', teachingDegreeOther: '',
  // 5. Experience
  employmentType: '', totalExperience: '', previousSchool: '', lastDesignation: '',
  // 6. Bank
  bankAccountHolder: '', bankAccountNumber: '', bankIfsc: '', bankBranch: '',
  // 7. School internal
  joiningDate: '', employeeId: '', designation: '',
};

const STEPS = [
  'Personal', 'Contact', 'Government ID', 'Education', 'Experience', 'Bank', 'School',
];

const Err = ({ msg }) => msg
  ? <span style={{ fontSize: '.74rem', color: 'var(--danger)', marginTop: 3, display: 'block' }}>{msg}</span>
  : null;

const Row = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>{children}</div>
);

function Stepper({ step }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
      {STEPS.map((label, i) => {
        const n = i + 1, done = step > n, active = step === n;
        return (
          <React.Fragment key={label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', fontSize: '.7rem', fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--border)',
                color: (done || active) ? '#fff' : 'var(--text-muted)',
              }}>{done ? '✓' : n}</div>
              <span style={{
                fontSize: '.72rem', whiteSpace: 'nowrap',
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : 'var(--text-muted)',
              }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ width: 10, height: 2, background: step > n ? 'var(--success)' : 'var(--border)', borderRadius: 2 }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** File picker that shows the chosen filename and can be cleared. */
function FileField({ label, required, value, onChange, error, hint }) {
  const ref = React.useRef(null);
  return (
    <div className="form-group">
      <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
      <input ref={ref} type="file" className={`form-control${error ? ' error' : ''}`}
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={e => onChange(e.target.files?.[0] || null)} />
      {value && (
        <div style={{ fontSize: '.75rem', color: 'var(--success)', marginTop: 4 }}>
          ✓ {value.name}
          <button type="button" onClick={() => { onChange(null); if (ref.current) ref.current.value = ''; }}
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '.75rem' }}>
            remove
          </button>
        </div>
      )}
      {hint && !error && <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{hint}</span>}
      <Err msg={error} />
    </div>
  );
}

/**
 * Seven-step teacher intake. Posts multipart because of the ID scans and
 * experience paperwork; the server re-validates everything.
 */
export default function TeacherForm({ open, onClose, onCreated, designations = [] }) {
  const [step, setStep]     = useState(1);
  const [form, setForm]     = useState(EMPTY_TEACHER);
  const [files, setFiles]   = useState({});
  const [errs, setErrs]     = useState({});
  const [saving, setSaving] = useState(false);

  const set     = (key) => (e) => { setErrs(x => ({ ...x, [key]: undefined })); setForm(f => ({ ...f, [key]: e.target.value })); };
  const setFile = (key) => (file) => { setErrs(x => ({ ...x, [key]: undefined })); setFiles(f => ({ ...f, [key]: file })); };

  const reset = () => { setStep(1); setForm(EMPTY_TEACHER); setFiles({}); setErrs({}); };
  const close = () => { reset(); onClose(); };

  const validateStep = (n) => {
    const e = {};
    const need = (key, msg) => { if (!String(form[key] ?? '').trim()) e[key] = msg; };
    // Mirrors the student address rules — street, PIN, city and state all required
    const needAddress = (prefix, label) => {
      need(`${prefix}Address`, `${label} address is required`);
      if (!String(form[`${prefix}Pincode`] ?? '').trim()) e[`${prefix}Pincode`] = 'PIN code is required';
      else if (!isPincode(form[`${prefix}Pincode`]))      e[`${prefix}Pincode`] = 'PIN code must be 6 digits';
      need(`${prefix}City`,  'City is required');
      need(`${prefix}State`, 'State is required');
    };

    if (n === 1) {
      need('name', 'Full name is required');
      need('dob', 'Date of birth is required');
      need('gender', 'Gender is required');
      need('bloodGroup', 'Blood group is required');
      need('fatherOrHusbandName', "Father's / husband's name is required");
      need('emergencyContactName', 'Emergency contact name is required');
      need('emergencyContactPhone', 'Emergency contact phone is required');
      if (form.emergencyContactPhone && !PHONE_RE.test(form.emergencyContactPhone))
        e.emergencyContactPhone = 'Invalid phone number';
    }
    if (n === 2) {
      need('phone', 'Mobile number is required');
      if (form.phone && !PHONE_RE.test(form.phone)) e.phone = 'Invalid mobile number';
      if (form.alternatePhone && !PHONE_RE.test(form.alternatePhone)) e.alternatePhone = 'Invalid phone number';
      need('email', 'Email address is required');
      if (form.email && !EMAIL_RE.test(form.email)) e.email = 'Invalid email address';
      needAddress('current', 'Current residential');
      if (!form.sameAsCurrent) needAddress('permanent', 'Permanent home');
    }
    if (n === 3) {
      need('aadhaarNumber', 'Aadhaar number is required');
      if (form.aadhaarNumber && !AADHAAR_RE.test(form.aadhaarNumber.replace(/\s/g, '')))
        e.aadhaarNumber = 'Aadhaar number must be 12 digits';
      need('panNumber', 'PAN number is required');
      if (form.panNumber && !PAN_RE.test(form.panNumber.trim())) e.panNumber = 'Invalid PAN (e.g. ABCDE1234F)';
      if (!files.aadhaarFront) e.aadhaarFront = 'Aadhaar front image is required';
      if (!files.aadhaarBack)  e.aadhaarBack  = 'Aadhaar back image is required';
      if (!files.panCard)      e.panCard      = 'PAN card upload is required';
    }
    if (n === 4) {
      need('qualification', 'Highest qualification is required');
      if (form.qualification === 'Other' && !form.qualificationOther.trim())
        e.qualificationOther = 'Please type the qualification';
      if (form.teachingDegree === 'Other' && !form.teachingDegreeOther.trim())
        e.teachingDegreeOther = 'Please type the teaching degree';
    }
    if (n === 5) {
      if (!form.employmentType) e.employmentType = 'Select fresher or experienced';
      if (form.employmentType === 'experienced') {
        need('totalExperience', 'Total years of experience is required');
        need('previousSchool', 'Name of previous school is required');
        need('lastDesignation', 'Last job designation is required');
        if (!files.resignationLetter) e.resignationLetter = 'Resignation letter is required';
      }
    }
    if (n === 6) {
      need('bankAccountHolder', 'Account holder name is required');
      need('bankAccountNumber', 'Account number is required');
      if (form.bankAccountNumber && !/^\d{6,20}$/.test(form.bankAccountNumber.replace(/\s/g, '')))
        e.bankAccountNumber = 'Account number must be 6–20 digits';
      need('bankIfsc', 'IFSC code is required');
      if (form.bankIfsc && !IFSC_RE.test(form.bankIfsc.trim())) e.bankIfsc = 'Invalid IFSC (e.g. HDFC0001234)';
      need('bankBranch', 'Branch name is required');
    }
    if (n === 7) need('joiningDate', 'Date of joining is required');
    return e;
  };

  const next = async () => {
    const e = validateStep(step);
    setErrs(e);
    if (Object.keys(e).length) return toast.error(Object.values(e)[0]);

    // Catch a duplicate email before the admin fills in six more steps
    if (step === 2) {
      try {
        const res = await api.checkEmail(form.email.trim());
        if (res?.exists) {
          setErrs({ email: 'This email is already registered' });
          return toast.error('This email is already registered');
        }
      } catch { /* the server re-checks on submit */ }
    }
    setStep(s => s + 1);
  };

  const submit = async () => {
    const e = validateStep(7);
    setErrs(e);
    if (Object.keys(e).length) return toast.error(Object.values(e)[0]);

    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v === true ? 'true' : v ?? ''));
      Object.entries(files).forEach(([k, file]) => { if (file) fd.append(k, file); });

      const res = await api.createTeacher(fd);
      toast.success(`Teacher created — Employee ID ${res?.data?.employeeId || ''}`.trim());
      reset();
      onCreated?.();
      onClose();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={close} title="Add Teacher" maxWidth={620}
      footer={
        <>
          {step > 1 && <Button variant="secondary" onClick={() => { setErrs({}); setStep(s => s - 1); }}>← Back</Button>}
          {step === 1 && <Button variant="secondary" onClick={close}>Cancel</Button>}
          {step < STEPS.length
            ? <Button onClick={next}>Next →</Button>
            : <Button onClick={submit} loading={saving}>Create Teacher</Button>}
        </>
      }>
      <Stepper step={step} />

      {/* 1 ── Personal ─────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div>
          <div className="form-group">
            <label className="form-label required">Full Name</label>
            <input className={`form-control${errs.name ? ' error' : ''}`} autoFocus
              placeholder="Anita Sharma" value={form.name} onChange={set('name')} />
            <Err msg={errs.name} />
          </div>
          <Row>
            <div className="form-group">
              <label className="form-label required">Date of Birth</label>
              <input type="date" className={`form-control${errs.dob ? ' error' : ''}`}
                max={new Date().toISOString().slice(0, 10)} value={form.dob} onChange={set('dob')} />
              <Err msg={errs.dob} />
            </div>
            <div className="form-group">
              <label className="form-label required">Gender</label>
              <select className={`form-control${errs.gender ? ' error' : ''}`} value={form.gender} onChange={set('gender')}>
                <option value="">Select</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
              <Err msg={errs.gender} />
            </div>
            <div className="form-group">
              <label className="form-label required">Blood Group</label>
              <select className={`form-control${errs.bloodGroup ? ' error' : ''}`} value={form.bloodGroup} onChange={set('bloodGroup')}>
                <option value="">Select</option>
                {BLOOD_GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <Err msg={errs.bloodGroup} />
            </div>
            <div className="form-group">
              <label className="form-label required">Father's / Husband's Name</label>
              <input className={`form-control${errs.fatherOrHusbandName ? ' error' : ''}`}
                value={form.fatherOrHusbandName} onChange={set('fatherOrHusbandName')} />
              <Err msg={errs.fatherOrHusbandName} />
            </div>
          </Row>
          <Row>
            <div className="form-group">
              <label className="form-label required">Emergency Contact Name</label>
              <input className={`form-control${errs.emergencyContactName ? ' error' : ''}`}
                value={form.emergencyContactName} onChange={set('emergencyContactName')} />
              <Err msg={errs.emergencyContactName} />
            </div>
            <div className="form-group">
              <label className="form-label required">Emergency Contact Phone</label>
              <input type="tel" className={`form-control${errs.emergencyContactPhone ? ' error' : ''}`}
                placeholder="+91 98765 43210" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} />
              <Err msg={errs.emergencyContactPhone} />
            </div>
          </Row>
        </div>
      )}

      {/* 2 ── Contact ──────────────────────────────────────────────────────── */}
      {step === 2 && (
        <div>
          <Row>
            <div className="form-group">
              <label className="form-label required">Mobile Number</label>
              <input type="tel" className={`form-control${errs.phone ? ' error' : ''}`} autoFocus
                placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} />
              <Err msg={errs.phone} />
            </div>
            <div className="form-group">
              <label className="form-label">Secondary Phone Number</label>
              <input type="tel" className={`form-control${errs.alternatePhone ? ' error' : ''}`}
                placeholder="Optional" value={form.alternatePhone} onChange={set('alternatePhone')} />
              <Err msg={errs.alternatePhone} />
            </div>
          </Row>
          <div className="form-group">
            <label className="form-label required">Email Address</label>
            <input type="email" className={`form-control${errs.email ? ' error' : ''}`}
              placeholder="teacher@school.com" value={form.email} onChange={set('email')} />
            <Err msg={errs.email} />
          </div>
          <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '4px 0 8px' }}>Current Residential Address</div>
          <AddressFields prefix="current" form={form} setForm={setForm} errs={errs} setErrs={setErrs} />

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', cursor: 'pointer', marginBottom: 10 }}>
            <input type="checkbox" checked={form.sameAsCurrent}
              onChange={e => {
                const on = e.target.checked;
                setErrs(x => ({
                  ...x,
                  permanentAddress: undefined, permanentPincode: undefined,
                  permanentCity: undefined,    permanentState: undefined,
                }));
                setForm(f => ({
                  ...f,
                  sameAsCurrent: on,
                  // Copy the whole block, not just the street line
                  permanentAddress: on ? f.currentAddress : f.permanentAddress,
                  permanentCity:    on ? f.currentCity    : f.permanentCity,
                  permanentState:   on ? f.currentState   : f.permanentState,
                  permanentPincode: on ? f.currentPincode : f.permanentPincode,
                  permanentCountry: on ? f.currentCountry : f.permanentCountry,
                }));
              }} />
            Permanent address is the same as the current address
          </label>

          {!form.sameAsCurrent && (
            <>
              <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '4px 0 8px' }}>Permanent Home Address</div>
              <AddressFields prefix="permanent" form={form} setForm={setForm} errs={errs} setErrs={setErrs} />
            </>
          )}
        </div>
      )}

      {/* 3 ── Government ID & tax ──────────────────────────────────────────── */}
      {step === 3 && (
        <div>
          <div className="form-group">
            <label className="form-label required">Aadhaar Card Number</label>
            <input className={`form-control${errs.aadhaarNumber ? ' error' : ''}`} autoFocus
              inputMode="numeric" placeholder="12 digits" value={form.aadhaarNumber}
              onChange={e => { setErrs(x => ({ ...x, aadhaarNumber: undefined })); setForm(f => ({ ...f, aadhaarNumber: e.target.value.replace(/[^\d\s]/g, '') })); }} />
            <Err msg={errs.aadhaarNumber} />
          </div>
          <Row>
            <FileField label="Aadhaar — Front" required value={files.aadhaarFront}
              onChange={setFile('aadhaarFront')} error={errs.aadhaarFront} />
            <FileField label="Aadhaar — Back" required value={files.aadhaarBack}
              onChange={setFile('aadhaarBack')} error={errs.aadhaarBack} />
          </Row>
          <Row>
            <div className="form-group">
              <label className="form-label required">PAN Card Number</label>
              <input className={`form-control${errs.panNumber ? ' error' : ''}`} placeholder="ABCDE1234F"
                value={form.panNumber}
                onChange={e => { setErrs(x => ({ ...x, panNumber: undefined })); setForm(f => ({ ...f, panNumber: e.target.value.toUpperCase() })); }} />
              <Err msg={errs.panNumber} />
            </div>
            <FileField label="PAN Card Upload" required value={files.panCard}
              onChange={setFile('panCard')} error={errs.panCard} />
          </Row>
          <div className="form-group">
            <label className="form-label">UAN / PF Account Number</label>
            <input className="form-control" placeholder="Optional — from a previous job"
              value={form.uanNumber} onChange={set('uanNumber')} />
          </div>
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: 0 }}>
            Accepted uploads: PDF, JPG or PNG, up to 5 MB each.
          </p>
        </div>
      )}

      {/* 4 ── Education ────────────────────────────────────────────────────── */}
      {step === 4 && (
        <div>
          <div className="form-group">
            <label className="form-label required">Highest Qualification</label>
            <select className={`form-control${errs.qualification ? ' error' : ''}`} autoFocus
              value={form.qualification} onChange={set('qualification')}>
              <option value="">Select</option>
              {QUALIFICATIONS.map(q => <option key={q} value={q}>{q}</option>)}
            </select>
            <Err msg={errs.qualification} />
          </div>
          {form.qualification === 'Other' && (
            <div className="form-group">
              <label className="form-label required">Other Qualification</label>
              <input className={`form-control${errs.qualificationOther ? ' error' : ''}`} autoFocus
                placeholder="Type the qualification" value={form.qualificationOther} onChange={set('qualificationOther')} />
              <Err msg={errs.qualificationOther} />
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Professional Teaching Degree</label>
            <select className="form-control" value={form.teachingDegree} onChange={set('teachingDegree')}>
              <option value="">None / not applicable</option>
              {TEACHING_DEGREES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          {form.teachingDegree === 'Other' && (
            <div className="form-group">
              <label className="form-label required">Other Teaching Degree</label>
              <input className={`form-control${errs.teachingDegreeOther ? ' error' : ''}`} autoFocus
                placeholder="Type the degree" value={form.teachingDegreeOther} onChange={set('teachingDegreeOther')} />
              <Err msg={errs.teachingDegreeOther} />
            </div>
          )}
        </div>
      )}

      {/* 5 ── Work experience ──────────────────────────────────────────────── */}
      {step === 5 && (
        <div>
          <div className="form-group">
            <label className="form-label required">Fresher or Experienced</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[['fresher', 'Fresher'], ['experienced', 'Experienced']].map(([value, label]) => (
                <button key={value} type="button"
                  onClick={() => { setErrs(x => ({ ...x, employmentType: undefined })); setForm(f => ({ ...f, employmentType: value })); }}
                  style={{
                    flex: 1, padding: '9px 0', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 600, fontSize: '.85rem',
                    border: `1px solid ${form.employmentType === value ? 'var(--primary)' : 'var(--border)'}`,
                    background: form.employmentType === value ? 'var(--primary)' : 'var(--bg-card)',
                    color: form.employmentType === value ? '#fff' : 'var(--text)',
                  }}>
                  {label}
                </button>
              ))}
            </div>
            <Err msg={errs.employmentType} />
          </div>

          {form.employmentType === 'experienced' && (
            <>
              <Row>
                <div className="form-group">
                  <label className="form-label required">Total Years of Experience</label>
                  <input className={`form-control${errs.totalExperience ? ' error' : ''}`}
                    placeholder="e.g. 5 years" value={form.totalExperience} onChange={set('totalExperience')} />
                  <Err msg={errs.totalExperience} />
                </div>
                <div className="form-group">
                  <label className="form-label required">Last Job Designation / Post</label>
                  <input className={`form-control${errs.lastDesignation ? ' error' : ''}`}
                    value={form.lastDesignation} onChange={set('lastDesignation')} />
                  <Err msg={errs.lastDesignation} />
                </div>
              </Row>
              <div className="form-group">
                <label className="form-label required">Name of Previous School</label>
                <input className={`form-control${errs.previousSchool ? ' error' : ''}`}
                  value={form.previousSchool} onChange={set('previousSchool')} />
                <Err msg={errs.previousSchool} />
              </div>
              <FileField label="Resignation Letter (last company)" required
                value={files.resignationLetter} onChange={setFile('resignationLetter')} error={errs.resignationLetter} />
              <Row>
                <FileField label="Experience Certificate" hint="Optional"
                  value={files.experienceCertificate} onChange={setFile('experienceCertificate')} />
                <FileField label="Joining Letter (last company)" hint="Optional"
                  value={files.joiningLetter} onChange={setFile('joiningLetter')} />
              </Row>
            </>
          )}
        </div>
      )}

      {/* 6 ── Bank ─────────────────────────────────────────────────────────── */}
      {step === 6 && (
        <div>
          <div className="form-group">
            <label className="form-label required">Bank Account Holder Name</label>
            <input className={`form-control${errs.bankAccountHolder ? ' error' : ''}`} autoFocus
              value={form.bankAccountHolder} onChange={set('bankAccountHolder')} />
            <Err msg={errs.bankAccountHolder} />
          </div>
          <Row>
            <div className="form-group">
              <label className="form-label required">Bank Account Number</label>
              <input className={`form-control${errs.bankAccountNumber ? ' error' : ''}`} inputMode="numeric"
                value={form.bankAccountNumber} onChange={set('bankAccountNumber')} />
              <Err msg={errs.bankAccountNumber} />
            </div>
            <div className="form-group">
              <label className="form-label required">IFSC Code</label>
              <input className={`form-control${errs.bankIfsc ? ' error' : ''}`} placeholder="HDFC0001234"
                value={form.bankIfsc}
                onChange={e => { setErrs(x => ({ ...x, bankIfsc: undefined })); setForm(f => ({ ...f, bankIfsc: e.target.value.toUpperCase() })); }} />
              <Err msg={errs.bankIfsc} />
            </div>
          </Row>
          <div className="form-group">
            <label className="form-label required">Bank Branch Name</label>
            <input className={`form-control${errs.bankBranch ? ' error' : ''}`}
              value={form.bankBranch} onChange={set('bankBranch')} />
            <Err msg={errs.bankBranch} />
          </div>
        </div>
      )}

      {/* 7 ── School internal ──────────────────────────────────────────────── */}
      {step === 7 && (
        <div>
          <Row>
            <div className="form-group">
              <label className="form-label required">Date of Joining</label>
              <input type="date" className={`form-control${errs.joiningDate ? ' error' : ''}`} autoFocus
                value={form.joiningDate} onChange={set('joiningDate')} />
              <Err msg={errs.joiningDate} />
            </div>
            <div className="form-group">
              <label className="form-label">Designation</label>
              <select className="form-control" value={form.designation} onChange={set('designation')}>
                <option value="">— Select —</option>
                {designations.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </Row>
          <div className="form-group">
            <label className="form-label">Employee ID / Teacher ID</label>
            <input className="form-control" placeholder="Auto-generated if left blank"
              value={form.employeeId} onChange={set('employeeId')} />
            <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              Follows the Employee ID format set in School Settings.
            </span>
          </div>
          <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 8 }}>
            A one-time password will be emailed to the teacher. They must set a new password on first login.
          </p>
        </div>
      )}
    </Modal>
  );
}
