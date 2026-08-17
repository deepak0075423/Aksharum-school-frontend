import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../api/admin.api';
import { Button, Modal, Spinner } from '../../components/ui/index';
import AddressFields from '../../components/ui/AddressFields';
import { isPincode } from '../../utils/indiaStates';

// Kept in step with validateStudentProfile() / resolveNewParent() in
// school-backend/controllers/admin.controller.js
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE   = /^[+\d\s-]{7,15}$/;
const AADHAAR_RE = /^\d{12}$/;
const PAN_RE     = /^[A-Z]{5}\d{4}[A-Z]$/i;

const BLOOD_GROUPS = ['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'];
const CATEGORIES   = ['General', 'OBC', 'SC', 'ST', 'EWS'];
// Same list the School model uses for its own board
const BOARDS       = ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge (IGCSE)', 'NIOS', 'Other'];
const MEDIUMS      = ['English', 'Hindi', 'Marathi', 'Gujarati', 'Bengali', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Urdu', 'Other'];

// Uploads are served from the backend ROOT, while VITE_API_URL points at /api
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');
const docUrl   = (file) => (file ? `${API_BASE}/uploads/student-docs/${file}` : '');

const STEPS = ['Basic', 'Personal', 'Address', 'Documents', 'Previous School', 'Enrolment', 'Parents'];

const EMPTY_PARENT_BLOCK = {
  name: '', email: '', phone: '', occupation: '', organization: '', designation: '',
  qualification: '', annualIncome: '', aadhaarNumber: '', panNumber: '',
};

const EMPTY_NEW_PARENT = {
  accountFor: 'Father',
  father:   { ...EMPTY_PARENT_BLOCK },
  mother:   { ...EMPTY_PARENT_BLOCK },
  guardian: { ...EMPTY_PARENT_BLOCK, relation: '' },
};

export const EMPTY_STUDENT = {
  // 1. Basic
  name: '', email: '', phone: '', password: '',
  // 2. Personal
  dob: '', gender: '', bloodGroup: '', category: '', religion: '', nationality: 'Indian',
  emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
  // 3. Address — `address`/`city`/… is the current address, as the API expects
  address: '', city: '', state: '', pincode: '', country: 'India',
  permanentAddress: '', permanentCity: '', permanentState: '', permanentPincode: '', permanentCountry: 'India',
  sameAsCurrent: true,
  // 4. Documents
  aadhaarNumber: '',
  // 5. Previous school
  isTransferStudent: false,
  previousSchoolName: '', previousSchoolContact: '',
  previousSchoolAddress: '', previousSchoolCity: '', previousSchoolState: '',
  previousSchoolPincode: '', previousSchoolCountry: 'India',
  previousSchoolMedium: '', previousSchoolMediumOther: '',
  previousSchoolBoard: '', previousSchoolBoardOther: '', previousSchoolStateBoardName: '',
  previousClass: '', previousAcademicYear: '', previousSchoolLeavingDate: '',
  tcNumber: '', tcDate: '',
  // 6. Enrolment
  classId: '', currentSection: '', rollNumber: '', admissionNumber: '',
  // 7. Parent / guardian
  parentId: '', parentName: '', parentQuery: '', parentMode: 'search',
  newParent: EMPTY_NEW_PARENT,
};

const Err = ({ msg }) => msg
  ? <span style={{ fontSize: '.74rem', color: 'var(--danger)', marginTop: 3, display: 'block' }}>{msg}</span>
  : null;

const Row = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>{children}</div>
);

const Hint = ({ children }) => (
  <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>{children}</p>
);

function Stepper({ step }) {
  return (
    <div className="stepper">
      {STEPS.map((label, i) => {
        const n = i + 1, done = step > n, active = step === n;
        return (
          <React.Fragment key={label}>
            <div className="stepper__step">
              <div className="stepper__dot" style={{
                background: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--border)',
                color: (done || active) ? '#fff' : 'var(--text-muted)',
              }}>{done ? '✓' : n}</div>
              <span className={`stepper__label${active ? ' stepper__label--active' : ''}`} style={{
                fontWeight: active ? 600 : 400,
                color: active ? 'var(--text)' : 'var(--text-muted)',
              }}>{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="stepper__bar" style={{ background: step > n ? 'var(--success)' : 'var(--border)' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * File picker showing the chosen filename, plus a link to whatever is already
 * on file so an edit never forces a needless re-upload.
 */
function FileField({ label, required, value, existing, onChange, error, hint }) {
  const ref = useRef(null);
  return (
    <div className="form-group">
      <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
      <input ref={ref} type="file" className={`form-control${error ? ' error' : ''}`}
        accept=".pdf,.jpg,.jpeg,.png"
        onChange={e => onChange(e.target.files?.[0] || null)} />
      {value ? (
        <div style={{ fontSize: '.75rem', color: 'var(--success)', marginTop: 4 }}>
          ✓ {value.name}
          <button type="button" onClick={() => { onChange(null); if (ref.current) ref.current.value = ''; }}
            style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '.75rem' }}>
            remove
          </button>
        </div>
      ) : existing ? (
        <div style={{ fontSize: '.75rem', marginTop: 4 }}>
          <a href={docUrl(existing)} target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>
            📎 View file on record
          </a>
          <span style={{ color: 'var(--text-muted)' }}> — choose a file to replace it</span>
        </div>
      ) : null}
      {hint && !error && <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{hint}</span>}
      <Err msg={error} />
    </div>
  );
}

/** Select whose "Other" choice reveals a free-text field. */
function SelectOrOther({ label, required, options, value, otherValue, onChange, onOtherChange, error, otherError }) {
  return (
    <>
      <div className="form-group">
        <label className={`form-label${required ? ' required' : ''}`}>{label}</label>
        <select className={`form-control${error ? ' error' : ''}`} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">Select</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <Err msg={error} />
      </div>
      {value === 'Other' && (
        <div className="form-group">
          <label className="form-label required">{label} — please specify</label>
          <input className={`form-control${otherError ? ' error' : ''}`}
            value={otherValue} onChange={e => onOtherChange(e.target.value)} />
          <Err msg={otherError} />
        </div>
      )}
    </>
  );
}

// ── Parent / guardian panel ───────────────────────────────────────────────────
function ParentPanel({ form, setForm, errs, setErrs, files, setFile, existingParent }) {
  const [results, setResults] = useState([]);
  const [looking, setLooking] = useState(false);
  const timer = useRef(null);

  // The same parent account can be linked to any number of students, so the
  // search lists every match and the admin picks one explicitly.
  const handleQuery = (val) => {
    setForm(f => ({ ...f, parentQuery: val, parentId: '', parentName: '' }));
    setResults([]);
    clearTimeout(timer.current);
    if (!val.trim()) return;
    timer.current = setTimeout(async () => {
      setLooking(true);
      try {
        const res  = await api.parentLookup(val.trim());
        setResults(Array.isArray(res?.data) ? res.data : (res?.data ? [res.data] : []));
      } catch {}
      finally { setLooking(false); }
    }, 500);
  };

  const np       = form.newParent;
  const setNP    = (patch) => setForm(f => ({ ...f, newParent: { ...f.newParent, ...patch } }));
  const setBlock = (role, key, val) => {
    setErrs(e => ({ ...e, [`${role}${key[0].toUpperCase()}${key.slice(1)}`]: undefined }));
    setForm(f => ({ ...f, newParent: { ...f.newParent, [role]: { ...f.newParent[role], [key]: val } } }));
  };

  // Father and mother are always captured. The guardian block only applies when
  // neither parent is the legal guardian.
  const roles = np.accountFor === 'Guardian' ? ['father', 'mother', 'guardian'] : ['father', 'mother'];

  return (
    <>
      <div style={{ display: 'flex', marginBottom: 18, borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--border)' }}>
        {[['search', '🔍  Link Existing Parent'], ['create', '➕  Enter Parent Details']].map(([mode, label]) => (
          <button key={mode} type="button"
            onClick={() => { setResults([]); setForm(f => ({ ...f, parentMode: mode, parentQuery: '', parentId: '', parentName: '' })); setErrs({}); }}
            style={{
              flex: 1, padding: '10px 0', border: 'none', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600,
              background: form.parentMode === mode ? 'var(--primary)' : 'var(--bg)',
              color:      form.parentMode === mode ? '#fff' : 'var(--text-muted)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {form.parentMode === 'search' && (
        <>
          <div className="form-group">
            <label className="form-label required">Search by name, email or phone</label>
            <div style={{ position: 'relative' }}>
              <input className={`form-control${errs.parentQuery ? ' error' : ''}`}
                value={form.parentQuery} onChange={e => handleQuery(e.target.value)}
                placeholder="Type to search…" autoFocus />
              {looking && (
                <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
                  <Spinner size="sm" />
                </span>
              )}
            </div>
            <Err msg={errs.parentQuery} />
          </div>
          {form.parentId ? (
            <div style={{ padding: '12px 16px', background: '#d1fae5', border: '1px solid #6ee7b7', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#065f46', fontSize: '.9rem' }}>✅ Parent linked</div>
                <div style={{ color: '#047857', fontSize: '.82rem', marginTop: 2 }}>{form.parentName}</div>
              </div>
              <button type="button" onClick={() => { setResults([]); setForm(f => ({ ...f, parentId: '', parentName: '', parentQuery: '' })); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065f46', fontSize: '.9rem' }}>✕</button>
            </div>
          ) : results.length > 0 ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
              {results.map(p => (
                <div key={p._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{p.name}</div>
                    <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>{p.email}{p.phone ? ` · ${p.phone}` : ''}</div>
                    {p.children?.length > 0 && (
                      <div style={{ fontSize: '.74rem', color: 'var(--primary)' }}>
                        {p.children.length} child{p.children.length !== 1 ? 'ren' : ''}: {p.children.join(', ')}
                      </div>
                    )}
                  </div>
                  <button type="button" className="btn btn-primary btn-sm"
                    onClick={() => { setForm(f => ({ ...f, parentId: p._id, parentName: p.name })); setErrs(e => ({ ...e, parentQuery: undefined })); }}>
                    Link
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '12px 16px', background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', fontSize: '.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
              {form.parentQuery.trim() && !looking
                ? 'No parent matched that search.'
                : 'Search above to link an existing parent account — one parent can be linked to several students.'}
              <br />
              <button type="button" onClick={() => setForm(f => ({ ...f, parentMode: 'create' }))}
                style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 600, fontSize: '.82rem' }}>
                Parent not found? Enter their details →
              </button>
            </div>
          )}
        </>
      )}

      {form.parentMode === 'create' && (
        <>
          <div className="form-group">
            <label className="form-label required">Who is the student's guardian?</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {[['Father', 'Father'], ['Mother', 'Mother'], ['Guardian', 'Someone else']].map(([value, label]) => (
                <button key={value} type="button" onClick={() => { setErrs({}); setNP({ accountFor: value }); }}
                  style={{
                    padding: '7px 16px', borderRadius: 'var(--radius)', cursor: 'pointer',
                    fontSize: '.82rem', fontWeight: 600,
                    border: `1px solid ${np.accountFor === value ? 'var(--primary)' : 'var(--border)'}`,
                    background: np.accountFor === value ? 'var(--primary)' : 'var(--bg-card)',
                    color:      np.accountFor === value ? '#fff' : 'var(--text)',
                  }}>
                  {label}
                </button>
              ))}
            </div>
            <Hint>
              Father's and mother's details are always recorded. The guardian gets the login account —
              they are the only one who needs an email address.
            </Hint>
          </div>

          {roles.map(role => {
            const label   = role === 'guardian' ? 'Guardian' : role[0].toUpperCase() + role.slice(1);
            const isOwner = np.accountFor === (role === 'guardian' ? 'Guardian' : label);
            const err     = (key) => errs[`${role}${key[0].toUpperCase()}${key.slice(1)}`];
            const text    = (key, labelText, opts = {}) => (
              <div className="form-group" style={opts.full ? { gridColumn: 'span 2' } : undefined}>
                <label className={`form-label${opts.required ? ' required' : ''}`}>{labelText}</label>
                <input type={opts.type || 'text'} className={`form-control${err(key) ? ' error' : ''}`}
                  placeholder={opts.placeholder} inputMode={opts.inputMode}
                  value={np[role][key] ?? ''}
                  onChange={e => setBlock(role, key, opts.upper ? e.target.value.toUpperCase() : e.target.value)} />
                <Err msg={err(key)} />
              </div>
            );

            return (
              <div key={role} style={{
                border: `1px solid ${isOwner ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: 14,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <strong style={{ fontSize: '.85rem' }}>{label}'s Details</strong>
                  {isOwner && (
                    <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#fff', background: 'var(--primary)',
                      borderRadius: 99, padding: '2px 8px' }}>GUARDIAN · LOGIN ACCOUNT</span>
                  )}
                </div>
                <Row>
                  {text('name', `${label}'s Name`, { required: true, full: true })}
                  {role === 'guardian' && text('relation', 'Relation with the Student', { required: true, full: true, placeholder: 'e.g. Uncle, Grandmother' })}
                  <div className="form-group">
                    <label className={`form-label${isOwner ? ' required' : ''}`}>Email</label>
                    <input type="email" className={`form-control${err('email') ? ' error' : ''}`}
                      placeholder={isOwner ? 'name@email.com' : 'Optional'}
                      value={np[role].email} onChange={e => setBlock(role, 'email', e.target.value)} />
                    <Err msg={err('email')} />
                  </div>
                  {text('phone', 'Mobile Number', { required: true, type: 'tel', placeholder: '+91 98765 43210' })}
                  {text('occupation', 'Occupation', { required: true, placeholder: 'e.g. Engineer' })}
                  {text('organization', 'Organization', { placeholder: 'Company / employer' })}
                  {text('designation', 'Designation', { placeholder: 'e.g. Manager' })}
                  {text('qualification', 'Qualification', { placeholder: 'e.g. B.Com.' })}
                  {text('annualIncome', 'Annual Income', { placeholder: 'e.g. 600000', inputMode: 'numeric' })}
                  {text('aadhaarNumber', 'Aadhaar Card Number', { required: true, placeholder: '12 digits', inputMode: 'numeric' })}
                  {text('panNumber', 'PAN Card Number', { placeholder: 'ABCDE1234F', upper: true })}
                </Row>
                <Row>
                  <FileField label="Aadhaar — Front" hint="Optional"
                    value={files[`${role}AadhaarFront`]} existing={existingParent?.[role]?.aadhaarFrontFile}
                    onChange={setFile(`${role}AadhaarFront`)} />
                  <FileField label="Aadhaar — Back" hint="Optional"
                    value={files[`${role}AadhaarBack`]} existing={existingParent?.[role]?.aadhaarBackFile}
                    onChange={setFile(`${role}AadhaarBack`)} />
                  <FileField label="PAN Card" hint="Optional"
                    value={files[`${role}PanCard`]} existing={existingParent?.[role]?.panCardFile}
                    onChange={setFile(`${role}PanCard`)} />
                  <FileField label="Passport Size Photo" hint="Optional"
                    value={files[`${role}Photo`]} existing={existingParent?.[role]?.photoFile}
                    onChange={setFile(`${role}Photo`)} />
                </Row>
              </div>
            );
          })}

          <Hint>
            A one-time password is emailed to the {np.accountFor === 'Guardian' ? 'guardian' : np.accountFor.toLowerCase()}.
            If that email already belongs to a parent, the student is linked to that existing account.
          </Hint>
        </>
      )}
    </>
  );
}

/**
 * Seven-step student intake, used for both admission and editing. Posts
 * multipart because of the certificates and ID scans; the server re-validates
 * everything it receives.
 */
export default function StudentForm({ open, student, onClose, onSaved }) {
  const isEdit = !!student;

  const [step, setStep]     = useState(1);
  const [form, setForm]     = useState(EMPTY_STUDENT);
  const [files, setFiles]   = useState({});
  const [errs, setErrs]     = useState({});
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading]   = useState(false);
  const [classes, setClasses]   = useState([]);
  const [docs, setDocs]         = useState(null);          // files already on record
  const [existingParent, setEP] = useState(null);

  const set     = (key) => (e) => { setErrs(x => ({ ...x, [key]: undefined })); setForm(f => ({ ...f, [key]: e.target.value })); };
  const setFile = (key) => (file) => { setErrs(x => ({ ...x, [key]: undefined })); setFiles(f => ({ ...f, [key]: file })); };

  const reset = () => { setStep(1); setForm(EMPTY_STUDENT); setFiles({}); setErrs({}); setDocs(null); setEP(null); };
  const close = () => { reset(); onClose(); };

  useEffect(() => {
    if (!open) return;
    api.getClassesWithSections().then(res => setClasses(res?.data || [])).catch(() => {});
  }, [open]);

  // Prefill on edit
  useEffect(() => {
    if (!open) return;
    if (!student) { reset(); return; }
    setStep(1); setFiles({}); setErrs({});
    setForm({ ...EMPTY_STUDENT, name: student.name || '', email: student.email || '', phone: student.phone || '' });
    setLoading(true);
    api.getStudent(student._id).then(res => {
      const d  = res?.data ?? res;
      const p  = d?.profile  ?? {};
      const pp = d?.parentProfile ?? null;
      setDocs(p);
      setEP(pp);
      // A stored value that is not one of the presets came from "Other"
      const orOther = (value, options) => (value && !options.includes(value) ? ['Other', value] : [value || '', '']);
      const [medium, mediumOther] = orOther(p.previousSchoolMedium, MEDIUMS);
      const [board,  boardOther]  = orOther(p.previousSchoolBoard,  BOARDS);
      const block = (role) => ({
        ...EMPTY_PARENT_BLOCK,
        ...(role === 'guardian' ? { relation: '' } : {}),
        ...Object.fromEntries(Object.entries(pp?.[role] || {}).filter(([k]) => k in EMPTY_PARENT_BLOCK || k === 'relation')),
      });
      setForm(f => ({
        ...f,
        dob: p.dob ? String(p.dob).slice(0, 10) : '',
        gender: p.gender || '', bloodGroup: p.bloodGroup || '', category: p.category || '',
        religion: p.religion || '', nationality: p.nationality || 'Indian',
        emergencyContactName: p.emergencyContactName || '',
        emergencyContactPhone: p.emergencyContactPhone || '',
        emergencyContactRelation: p.emergencyContactRelation || '',
        address: p.address || '', city: p.city || '', state: p.state || '',
        pincode: p.pincode || '', country: p.country || 'India',
        permanentAddress: p.permanentAddress || '', permanentCity: p.permanentCity || '',
        permanentState: p.permanentState || '', permanentPincode: p.permanentPincode || '',
        permanentCountry: p.permanentCountry || 'India',
        sameAsCurrent: !!p.sameAsCurrent,
        aadhaarNumber: p.aadhaarNumber || '',
        isTransferStudent: !!p.isTransferStudent,
        previousSchoolName: p.previousSchoolName || '', previousSchoolContact: p.previousSchoolContact || '',
        previousSchoolAddress: p.previousSchoolAddress || '', previousSchoolCity: p.previousSchoolCity || '',
        previousSchoolState: p.previousSchoolState || '', previousSchoolPincode: p.previousSchoolPincode || '',
        previousSchoolCountry: p.previousSchoolCountry || 'India',
        previousSchoolMedium: medium, previousSchoolMediumOther: mediumOther,
        previousSchoolBoard: board,  previousSchoolBoardOther: boardOther,
        previousSchoolStateBoardName: p.previousSchoolStateBoardName || '',
        previousClass: p.previousClass || '', previousAcademicYear: p.previousAcademicYear || '',
        previousSchoolLeavingDate: p.previousSchoolLeavingDate ? String(p.previousSchoolLeavingDate).slice(0, 10) : '',
        tcNumber: p.tcNumber || '', tcDate: p.tcDate ? String(p.tcDate).slice(0, 10) : '',
        classId: p.currentSection?.class?._id || p.currentClass || '',
        currentSection: p.currentSection?._id || '',
        rollNumber: p.rollNumber || '', admissionNumber: p.admissionNumber || '',
        parentId: p.parent?._id || '', parentName: p.parent?.name || '', parentQuery: p.parent?.name || '',
        parentMode: 'search',
        newParent: {
          accountFor: pp?.relationship || 'Father',
          father: block('father'), mother: block('mother'), guardian: block('guardian'),
        },
      }));
    }).catch(() => {}).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, student?._id]);

  const sections = classes.find(c => c._id === form.classId)?.sections || [];

  // ── Validation ──────────────────────────────────────────────────────────────
  const validateStep = (n) => {
    const e = {};
    const need = (key, msg) => { if (!String(form[key] ?? '').trim()) e[key] = msg; };
    const needAddress = (prefix, label) => {
      const k = (base) => (prefix ? prefix + base[0].toUpperCase() + base.slice(1) : base);
      need(k('address'), `${label} address is required`);
      if (!String(form[k('pincode')] ?? '').trim()) e[k('pincode')] = 'PIN code is required';
      else if (!isPincode(form[k('pincode')]))      e[k('pincode')] = 'PIN code must be 6 digits';
      need(k('city'),  'City is required');
      need(k('state'), 'State is required');
    };

    if (n === 1) {
      need('name', 'Full name is required');
      if (!isEdit) {
        need('email', 'Email is required');
        if (form.email && !EMAIL_RE.test(form.email)) e.email = 'Invalid email address';
      }
      if (form.phone && !PHONE_RE.test(form.phone)) e.phone = 'Invalid phone number';
      if (isEdit && form.password && form.password.length < 6) e.password = 'Min 6 characters';
    }
    if (n === 2) {
      need('dob', 'Date of birth is required');
      if (form.dob && Number.isNaN(new Date(form.dob).getTime())) e.dob = 'Invalid date of birth';
      need('gender', 'Gender is required');
      need('bloodGroup', 'Blood group is required');
      need('category', 'Category is required');
      need('nationality', 'Nationality is required');
      need('emergencyContactName', 'Emergency contact name is required');
      need('emergencyContactPhone', 'Emergency contact phone is required');
      if (form.emergencyContactPhone && !PHONE_RE.test(form.emergencyContactPhone))
        e.emergencyContactPhone = 'Invalid phone number';
      need('emergencyContactRelation', 'Relation with the student is required');
    }
    if (n === 3) {
      needAddress('', 'Current');
      if (!form.sameAsCurrent) needAddress('permanent', 'Permanent');
    }
    if (n === 4) {
      if (!files.photo && !docs?.photoFile) e.photo = "Student's passport size photo is required";
      need('aadhaarNumber', 'Aadhaar number is required');
      if (form.aadhaarNumber && !AADHAAR_RE.test(form.aadhaarNumber.replace(/\s/g, '')))
        e.aadhaarNumber = 'Aadhaar number must be 12 digits';
      if (!files.aadhaarFront     && !docs?.aadhaarFrontFile)     e.aadhaarFront     = 'Aadhaar front image is required';
      if (!files.aadhaarBack      && !docs?.aadhaarBackFile)      e.aadhaarBack      = 'Aadhaar back image is required';
      if (!files.birthCertificate && !docs?.birthCertificateFile) e.birthCertificate = 'Birth certificate is required';
    }
    if (n === 5 && form.isTransferStudent) {
      need('previousSchoolName', 'Previous school name is required');
      needAddress('previousSchool', 'Previous school');
      need('previousSchoolMedium', 'Previous school medium is required');
      if (form.previousSchoolMedium === 'Other' && !form.previousSchoolMediumOther.trim())
        e.previousSchoolMediumOther = 'Please type the medium';
      need('previousSchoolBoard', 'Previous school board is required');
      if (form.previousSchoolBoard === 'Other' && !form.previousSchoolBoardOther.trim())
        e.previousSchoolBoardOther = 'Please type the board';
      if (form.previousSchoolBoard === 'State Board' && !form.previousSchoolStateBoardName.trim())
        e.previousSchoolStateBoardName = 'Name of the state board is required';
      need('previousClass', 'Previous class is required');
      need('previousAcademicYear', 'Previous academic year is required');
      need('previousSchoolLeavingDate', 'Leaving date is required');
      need('previousSchoolContact', 'Previous school contact is required');
      if (form.previousSchoolContact && !PHONE_RE.test(form.previousSchoolContact))
        e.previousSchoolContact = 'Invalid contact number';
      need('tcNumber', 'TC number is required');
      need('tcDate', 'TC date is required');
      if (!files.tc && !docs?.tcFile) e.tc = 'Transfer Certificate upload is required';
    }
    if (n === 6) need('classId', 'Class is required');
    if (n === 7) {
      if (form.parentMode === 'search' && !form.parentId) {
        e.parentQuery = 'Click "Link" on a search result to attach a parent, or switch to entering their details';
      }
      if (form.parentMode === 'create') {
        const np    = form.newParent;
        const roles = np.accountFor === 'Guardian' ? ['father', 'mother', 'guardian'] : ['father', 'mother'];
        roles.forEach(role => {
          const b     = np[role] || {};
          const label = role[0].toUpperCase() + role.slice(1);
          const key   = (k) => `${role}${k[0].toUpperCase()}${k.slice(1)}`;
          if (!b.name?.trim())       e[key('name')]       = `${label}'s name is required`;
          if (!b.phone?.trim())      e[key('phone')]      = `${label}'s phone is required`;
          else if (!PHONE_RE.test(b.phone)) e[key('phone')] = 'Invalid phone';
          if (!b.occupation?.trim()) e[key('occupation')] = `${label}'s occupation is required`;
          if (!b.aadhaarNumber?.trim()) e[key('aadhaarNumber')] = `${label}'s Aadhaar number is required`;
          else if (!AADHAAR_RE.test(b.aadhaarNumber.replace(/\s/g, ''))) e[key('aadhaarNumber')] = 'Aadhaar must be 12 digits';
          if (b.panNumber?.trim() && !PAN_RE.test(b.panNumber.trim())) e[key('panNumber')] = 'Invalid PAN (e.g. ABCDE1234F)';
          if (role === 'guardian' && !b.relation?.trim()) e[key('relation')] = "Guardian's relation to the student is required";
          const isOwner = np.accountFor === (role === 'guardian' ? 'Guardian' : label);
          if (isOwner) {
            if (!b.email?.trim()) e[key('email')] = `${label}'s email is required for the login account`;
            else if (!EMAIL_RE.test(b.email)) e[key('email')] = 'Invalid email';
          } else if (b.email && !EMAIL_RE.test(b.email)) {
            e[key('email')] = 'Invalid email';
          }
        });
      }
    }
    return e;
  };

  const next = async () => {
    const e = validateStep(step);
    setErrs(e);
    if (Object.keys(e).length) return toast.error(Object.values(e)[0]);

    // Catch a duplicate email before the admin fills in six more steps
    if (step === 1 && !isEdit) {
      setChecking(true);
      try {
        const res = await api.checkEmail(form.email.trim());
        if (res?.exists) {
          setErrs({ email: 'This email is already registered' });
          return toast.error('This email is already registered');
        }
      } catch { /* the server re-checks on submit */ }
      finally { setChecking(false); }
    }
    setStep(s => s + 1);
  };

  const submit = async () => {
    // Every step is re-checked so a jumped-over problem cannot slip through
    const all = {};
    for (let n = 1; n <= STEPS.length; n++) Object.assign(all, validateStep(n));
    setErrs(all);
    if (Object.keys(all).length) {
      const firstBadStep = [1, 2, 3, 4, 5, 6, 7].find(n => Object.keys(validateStep(n)).length);
      setStep(firstBadStep);
      return toast.error(Object.values(all)[0]);
    }

    const pick = (value, other) => (value === 'Other' ? String(other || '').trim() : String(value || '').trim());
    const profile = {
      dob: form.dob, gender: form.gender, bloodGroup: form.bloodGroup, category: form.category,
      religion: form.religion, nationality: form.nationality,
      emergencyContactName: form.emergencyContactName,
      emergencyContactPhone: form.emergencyContactPhone,
      emergencyContactRelation: form.emergencyContactRelation,
      address: form.address, city: form.city, state: form.state,
      pincode: form.pincode, country: form.country || 'India',
      permanentAddress: form.permanentAddress, permanentCity: form.permanentCity,
      permanentState: form.permanentState, permanentPincode: form.permanentPincode,
      permanentCountry: form.permanentCountry || 'India',
      sameAsCurrent: form.sameAsCurrent,
      aadhaarNumber: form.aadhaarNumber,
      isTransferStudent: form.isTransferStudent,
      previousSchoolName: form.previousSchoolName,
      previousSchoolAddress: form.previousSchoolAddress,
      previousSchoolCity: form.previousSchoolCity,
      previousSchoolState: form.previousSchoolState,
      previousSchoolPincode: form.previousSchoolPincode,
      previousSchoolCountry: form.previousSchoolCountry || 'India',
      previousSchoolContact: form.previousSchoolContact,
      previousSchoolMedium: pick(form.previousSchoolMedium, form.previousSchoolMediumOther),
      previousSchoolBoard:  pick(form.previousSchoolBoard,  form.previousSchoolBoardOther),
      previousSchoolStateBoardName: form.previousSchoolStateBoardName,
      previousClass: form.previousClass,
      previousAcademicYear: form.previousAcademicYear,
      previousSchoolLeavingDate: form.previousSchoolLeavingDate,
      tcNumber: form.tcNumber, tcDate: form.tcDate,
      currentClass: form.classId,
      currentSection: form.currentSection || '',
      rollNumber: form.rollNumber, admissionNumber: form.admissionNumber,
    };

    const fd = new FormData();
    fd.append('name', form.name.trim());
    fd.append('phone', form.phone.trim());
    if (!isEdit) fd.append('email', form.email.trim());
    if (isEdit && form.password) fd.append('password', form.password);
    // Enrolment and identity fields the controller reads off the body directly
    fd.append('rollNumber', form.rollNumber);
    fd.append('admissionNumber', form.admissionNumber);
    fd.append('currentClass', form.classId);
    fd.append('currentSection', form.currentSection || '');
    fd.append('profile', JSON.stringify(profile));
    if (form.parentMode === 'search') fd.append('parentId', form.parentId || '');
    else fd.append('newParent', JSON.stringify(form.newParent));
    Object.entries(files).forEach(([k, file]) => { if (file) fd.append(k, file); });

    setSaving(true);
    try {
      if (isEdit) await api.updateStudentForm(student._id, fd);
      else        await api.createStudentForm(fd);
      toast.success(isEdit ? 'Student updated' : 'Student created — login OTP emailed');
      reset();
      onSaved?.();
      onClose();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const isLast = step === STEPS.length;

  return (
    <Modal open={open} onClose={close} title={isEdit ? 'Edit Student' : 'Add Student'} maxWidth={640}
      footer={
        <>
          {step > 1 && <Button variant="secondary" onClick={() => { setErrs({}); setStep(s => s - 1); }}>← Back</Button>}
          {step === 1 && <Button variant="secondary" onClick={close}>Cancel</Button>}
          {isLast
            ? <Button onClick={submit} loading={saving}>{isEdit ? 'Save Changes' : 'Create Student'}</Button>
            : <Button onClick={next} loading={checking}>Next →</Button>}
        </>
      }>
      <Stepper step={step} />

      {loading ? (
        <div style={{ padding: '32px 0', display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : (
        <>
          {/* 1 ── Basic ──────────────────────────────────────────────────── */}
          {step === 1 && (
            <div>
              <div className="form-group">
                <label className="form-label required">Full Name</label>
                <input className={`form-control${errs.name ? ' error' : ''}`} autoFocus
                  placeholder="Aarav Sharma" value={form.name} onChange={set('name')} />
                <Err msg={errs.name} />
              </div>
              <Row>
                <div className="form-group">
                  <label className={`form-label${isEdit ? '' : ' required'}`}>Email Address</label>
                  <input type="email" className={`form-control${errs.email ? ' error' : ''}`}
                    placeholder="student@school.com" value={form.email} onChange={set('email')}
                    disabled={isEdit} style={isEdit ? { background: 'var(--bg)', cursor: 'not-allowed' } : undefined} />
                  <Err msg={errs.email} />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="tel" className={`form-control${errs.phone ? ' error' : ''}`}
                    placeholder="+91 98765 43210" value={form.phone} onChange={set('phone')} />
                  <Err msg={errs.phone} />
                </div>
              </Row>
              {isEdit ? (
                <div className="form-group">
                  <label className="form-label">New Password</label>
                  <input type="password" className={`form-control${errs.password ? ' error' : ''}`}
                    placeholder="Leave blank to keep current" value={form.password} onChange={set('password')} />
                  <Err msg={errs.password} />
                </div>
              ) : (
                <Hint>A one-time password will be emailed to the student. They must set a new password on first login.</Hint>
              )}
            </div>
          )}

          {/* 2 ── Personal ───────────────────────────────────────────────── */}
          {step === 2 && (
            <div>
              <Row>
                <div className="form-group">
                  <label className="form-label required">Date of Birth</label>
                  <input type="date" className={`form-control${errs.dob ? ' error' : ''}`} autoFocus
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
                  <label className="form-label required">Category</label>
                  <select className={`form-control${errs.category ? ' error' : ''}`} value={form.category} onChange={set('category')}>
                    <option value="">Select</option>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <Err msg={errs.category} />
                </div>
                <div className="form-group">
                  <label className="form-label">Religion</label>
                  <input className="form-control" placeholder="Optional" value={form.religion} onChange={set('religion')} />
                </div>
                <div className="form-group">
                  <label className="form-label required">Nationality</label>
                  <input className={`form-control${errs.nationality ? ' error' : ''}`}
                    placeholder="Indian" value={form.nationality} onChange={set('nationality')} />
                  <Err msg={errs.nationality} />
                </div>
              </Row>

              <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '10px 0 8px' }}>Emergency Contact</div>
              <div className="form-group">
                <label className="form-label required">Contact Name</label>
                <input className={`form-control${errs.emergencyContactName ? ' error' : ''}`}
                  placeholder="Who should the school call first?" value={form.emergencyContactName} onChange={set('emergencyContactName')} />
                <Err msg={errs.emergencyContactName} />
              </div>
              <Row>
                <div className="form-group">
                  <label className="form-label required">Contact Phone</label>
                  <input type="tel" className={`form-control${errs.emergencyContactPhone ? ' error' : ''}`}
                    placeholder="+91 98765 43210" value={form.emergencyContactPhone} onChange={set('emergencyContactPhone')} />
                  <Err msg={errs.emergencyContactPhone} />
                </div>
                <div className="form-group">
                  <label className="form-label required">Relation with the Student</label>
                  <input className={`form-control${errs.emergencyContactRelation ? ' error' : ''}`}
                    placeholder="e.g. Uncle, Neighbour" value={form.emergencyContactRelation} onChange={set('emergencyContactRelation')} />
                  <Err msg={errs.emergencyContactRelation} />
                </div>
              </Row>
            </div>
          )}

          {/* 3 ── Address ────────────────────────────────────────────────── */}
          {step === 3 && (
            <div>
              <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '0 0 8px' }}>Current Address</div>
              <AddressFields form={form} setForm={setForm} errs={errs} setErrs={setErrs} />

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
                      permanentAddress: on ? f.address : f.permanentAddress,
                      permanentCity:    on ? f.city    : f.permanentCity,
                      permanentState:   on ? f.state   : f.permanentState,
                      permanentPincode: on ? f.pincode : f.permanentPincode,
                      permanentCountry: on ? f.country : f.permanentCountry,
                    }));
                  }} />
                Permanent address is the same as the current address
              </label>

              {!form.sameAsCurrent && (
                <>
                  <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '4px 0 8px' }}>Permanent Address</div>
                  <AddressFields prefix="permanent" form={form} setForm={setForm} errs={errs} setErrs={setErrs} />
                </>
              )}
            </div>
          )}

          {/* 4 ── Documents ──────────────────────────────────────────────── */}
          {step === 4 && (
            <div>
              <FileField label="Student Passport Size Photo" required value={files.photo}
                existing={docs?.photoFile} onChange={setFile('photo')} error={errs.photo}
                hint="Also used as the student's profile picture" />
              <div className="form-group">
                <label className="form-label required">Aadhaar Card Number</label>
                <input className={`form-control${errs.aadhaarNumber ? ' error' : ''}`} autoFocus
                  inputMode="numeric" placeholder="12 digits" value={form.aadhaarNumber}
                  onChange={e => { setErrs(x => ({ ...x, aadhaarNumber: undefined })); setForm(f => ({ ...f, aadhaarNumber: e.target.value.replace(/[^\d\s]/g, '') })); }} />
                <Err msg={errs.aadhaarNumber} />
              </div>
              <Row>
                <FileField label="Aadhaar — Front" required value={files.aadhaarFront}
                  existing={docs?.aadhaarFrontFile} onChange={setFile('aadhaarFront')} error={errs.aadhaarFront} />
                <FileField label="Aadhaar — Back" required value={files.aadhaarBack}
                  existing={docs?.aadhaarBackFile} onChange={setFile('aadhaarBack')} error={errs.aadhaarBack} />
              </Row>
              <FileField label="Birth Certificate" required value={files.birthCertificate}
                existing={docs?.birthCertificateFile} onChange={setFile('birthCertificate')} error={errs.birthCertificate} />
              <Row>
                <FileField label="Caste Certificate" hint="Optional — if applicable" value={files.casteCertificate}
                  existing={docs?.casteCertificateFile} onChange={setFile('casteCertificate')} />
                <FileField label="Disability Certificate" hint="Optional — if applicable" value={files.disabilityCertificate}
                  existing={docs?.disabilityCertificateFile} onChange={setFile('disabilityCertificate')} />
              </Row>
              <FileField label="Medical Certificate" hint="Optional" value={files.medicalCertificate}
                existing={docs?.medicalCertificateFile} onChange={setFile('medicalCertificate')} />
              <Hint>Accepted uploads: PDF, JPG or PNG, up to 5 MB each.</Hint>
            </div>
          )}

          {/* 5 ── Previous school ────────────────────────────────────────── */}
          {step === 5 && (
            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={form.isTransferStudent}
                  onChange={e => { setErrs({}); setForm(f => ({ ...f, isTransferStudent: e.target.checked })); }} />
                The student is transferring in from another school
              </label>

              {!form.isTransferStudent ? (
                <div style={{ padding: '14px 16px', background: 'var(--bg)', border: '1px dashed var(--border)',
                  borderRadius: 'var(--radius)', fontSize: '.82rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Tick the box above for a transfer admission to record the previous school,
                  Transfer Certificate and migration certificate.
                </div>
              ) : (
                <>
                  <div className="form-group">
                    <label className="form-label required">Previous School Name</label>
                    <input className={`form-control${errs.previousSchoolName ? ' error' : ''}`} autoFocus
                      value={form.previousSchoolName} onChange={set('previousSchoolName')} />
                    <Err msg={errs.previousSchoolName} />
                  </div>
                  <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '4px 0 8px' }}>Previous School Address</div>
                  <AddressFields prefix="previousSchool" form={form} setForm={setForm} errs={errs} setErrs={setErrs} />

                  <Row>
                    <SelectOrOther label="Previous School Medium" required options={MEDIUMS}
                      value={form.previousSchoolMedium} otherValue={form.previousSchoolMediumOther}
                      onChange={v => { setErrs(x => ({ ...x, previousSchoolMedium: undefined })); setForm(f => ({ ...f, previousSchoolMedium: v })); }}
                      onOtherChange={v => { setErrs(x => ({ ...x, previousSchoolMediumOther: undefined })); setForm(f => ({ ...f, previousSchoolMediumOther: v })); }}
                      error={errs.previousSchoolMedium} otherError={errs.previousSchoolMediumOther} />
                    <SelectOrOther label="Previous School Board" required options={BOARDS}
                      value={form.previousSchoolBoard} otherValue={form.previousSchoolBoardOther}
                      onChange={v => { setErrs(x => ({ ...x, previousSchoolBoard: undefined })); setForm(f => ({ ...f, previousSchoolBoard: v })); }}
                      onOtherChange={v => { setErrs(x => ({ ...x, previousSchoolBoardOther: undefined })); setForm(f => ({ ...f, previousSchoolBoardOther: v })); }}
                      error={errs.previousSchoolBoard} otherError={errs.previousSchoolBoardOther} />
                    {form.previousSchoolBoard === 'State Board' && (
                      <div className="form-group">
                        <label className="form-label required">Name of the State Board</label>
                        <input className={`form-control${errs.previousSchoolStateBoardName ? ' error' : ''}`}
                          placeholder="e.g. Maharashtra State Board of Secondary and Higher Secondary Education"
                          value={form.previousSchoolStateBoardName} onChange={set('previousSchoolStateBoardName')} />
                        <Err msg={errs.previousSchoolStateBoardName} />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label required">Previous Class</label>
                      <input className={`form-control${errs.previousClass ? ' error' : ''}`}
                        placeholder="e.g. Class 5" value={form.previousClass} onChange={set('previousClass')} />
                      <Err msg={errs.previousClass} />
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Previous Academic Year</label>
                      <input className={`form-control${errs.previousAcademicYear ? ' error' : ''}`}
                        placeholder="e.g. 2025-26" value={form.previousAcademicYear} onChange={set('previousAcademicYear')} />
                      <Err msg={errs.previousAcademicYear} />
                    </div>
                    <div className="form-group">
                      <label className="form-label required">School Leaving Date</label>
                      <input type="date" className={`form-control${errs.previousSchoolLeavingDate ? ' error' : ''}`}
                        max={new Date().toISOString().slice(0, 10)}
                        value={form.previousSchoolLeavingDate} onChange={set('previousSchoolLeavingDate')} />
                      <Err msg={errs.previousSchoolLeavingDate} />
                    </div>
                    <div className="form-group">
                      <label className="form-label required">Previous School Contact</label>
                      <input type="tel" className={`form-control${errs.previousSchoolContact ? ' error' : ''}`}
                        placeholder="+91 20 1234 5678" value={form.previousSchoolContact} onChange={set('previousSchoolContact')} />
                      <Err msg={errs.previousSchoolContact} />
                    </div>
                  </Row>

                  <div style={{ fontWeight: 600, fontSize: '.85rem', margin: '10px 0 8px' }}>Transfer Certificate</div>
                  <Row>
                    <div className="form-group">
                      <label className="form-label required">TC Number</label>
                      <input className={`form-control${errs.tcNumber ? ' error' : ''}`}
                        value={form.tcNumber} onChange={set('tcNumber')} />
                      <Err msg={errs.tcNumber} />
                    </div>
                    <div className="form-group">
                      <label className="form-label required">TC Date</label>
                      <input type="date" className={`form-control${errs.tcDate ? ' error' : ''}`}
                        value={form.tcDate} onChange={set('tcDate')} />
                      <Err msg={errs.tcDate} />
                    </div>
                  </Row>
                  <Row>
                    <FileField label="Transfer Certificate (TC)" required value={files.tc}
                      existing={docs?.tcFile} onChange={setFile('tc')} error={errs.tc} />
                    <FileField label="Migration Certificate" hint="Optional — usually only on a board change"
                      value={files.migrationCertificate} existing={docs?.migrationCertificateFile}
                      onChange={setFile('migrationCertificate')} />
                  </Row>
                </>
              )}
            </div>
          )}

          {/* 6 ── Enrolment ──────────────────────────────────────────────── */}
          {step === 6 && (
            <div>
              <Row>
                <div className="form-group">
                  <label className="form-label required">Class</label>
                  <select className={`form-control${errs.classId ? ' error' : ''}`} value={form.classId} autoFocus
                    onChange={e => { setErrs(x => ({ ...x, classId: undefined })); setForm(f => ({ ...f, classId: e.target.value, currentSection: '' })); }}>
                    <option value="">Select Class</option>
                    {classes.map(c => <option key={c._id} value={c._id}>{c.className}</option>)}
                  </select>
                  <Err msg={errs.classId} />
                </div>
                <div className="form-group">
                  <label className="form-label">Section</label>
                  <select className="form-control" value={form.currentSection} onChange={set('currentSection')} disabled={!form.classId}>
                    <option value="">Assign later</option>
                    {sections.map(s => <option key={s._id} value={s._id}>{s.sectionName}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Roll Number</label>
                  <input className="form-control" placeholder="Assigned from the section later"
                    value={form.rollNumber} onChange={set('rollNumber')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Admission Number</label>
                  <input className="form-control" placeholder="Auto-generated if left blank"
                    value={form.admissionNumber} onChange={set('admissionNumber')} />
                </div>
              </Row>
              <Hint>The admission number follows the format set in School Settings.</Hint>
            </div>
          )}

          {/* 7 ── Parents / guardian ─────────────────────────────────────── */}
          {step === 7 && (
            <ParentPanel form={form} setForm={setForm} errs={errs} setErrs={setErrs}
              files={files} setFile={setFile} existingParent={existingParent} />
          )}
        </>
      )}
    </Modal>
  );
}
