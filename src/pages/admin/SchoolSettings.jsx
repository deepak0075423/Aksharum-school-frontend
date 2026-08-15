import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getSchoolSettings, updateSchoolSettings, getSmtpSettings, updateSmtpSettings, testSmtpSettings } from '../../api/admin.api';
import { PageHeader, Button, Spinner } from '../../components/ui/index';
import { useAuth } from '../../contexts/AuthContext';
import { isEmail, isPhone, isURL } from '../../utils/validators';
import { schoolLogoUrl } from '../../utils/branding';

const EMPTY_SMTP = {
  enabled: false, host: '', port: 587, secure: false,
  user: '', pass: '', fromName: '', fromEmail: '', hasPassword: false,
};

const EMPTY = {
  code: '', email: '', phone: '', website: '',
  leaveSettings: {
    saturdayWorking: true,
    saturdayMode: 'all',
    saturdayHalfDay: false,
  },
};

export default function SchoolSettings() {
  const [form,    setForm]    = useState(EMPTY);
  const [name,    setName]    = useState('');
  const [logo,    setLogo]    = useState('');
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState({});
  const [smtp,        setSmtp]        = useState(EMPTY_SMTP);
  const [smtpSaving,  setSmtpSaving]  = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const { user, reload } = useAuth();
  const logoRef = useRef();

  useEffect(() => {
    getSmtpSettings()
      .then(res => {
        const d = res.data?.data ?? res.data ?? res;
        setSmtp({ ...EMPTY_SMTP, ...d, pass: '' });
      })
      .catch(() => {});
    getSchoolSettings()
      .then(res => {
        const d = res.data?.data ?? res.data;
        setName(d.name || '');
        setLogo(d.logo || '');
        setForm({
          code:    d.code    || '',
          email:   d.email   || '',
          phone:   d.phone   || '',
          website: d.website || '',
          leaveSettings: {
            saturdayWorking: d.leaveSettings?.saturdayWorking !== false,
            saturdayMode:    d.leaveSettings?.saturdayMode    || 'all',
            saturdayHalfDay: !!d.leaveSettings?.saturdayHalfDay,
          },
        });
      })
      .catch(() => toast.error('Failed to load school settings'))
      .finally(() => setLoading(false));
  }, []);

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const setLS = (key, val) => setForm(f => ({
    ...f,
    leaveSettings: { ...f.leaveSettings, [key]: val },
  }));
  const setSmtpF = (key, val) => setSmtp(s => ({ ...s, [key]: val }));

  const handleSmtpSave = async () => {
    if (smtp.enabled && (!smtp.host.trim() || !smtp.user.trim()))
      return toast.error('Host and username are required to enable SMTP');
    if (smtp.enabled && !smtp.pass && !smtp.hasPassword)
      return toast.error('Password is required to enable SMTP');
    const port = Number(smtp.port);
    if (smtp.port !== '' && (Number.isNaN(port) || port < 1 || port > 65535))
      return toast.error('SMTP port must be a number between 1 and 65535');
    if (smtp.fromEmail && !isEmail(smtp.fromEmail))
      return toast.error('From email must be a valid email address');
    setSmtpSaving(true);
    try {
      await updateSmtpSettings({
        enabled:   smtp.enabled,
        host:      smtp.host,
        port:      smtp.port,
        secure:    smtp.secure,
        user:      smtp.user,
        pass:      smtp.pass,           // blank = keep existing
        fromName:  smtp.fromName,
        fromEmail: smtp.fromEmail,
      });
      if (smtp.pass) setSmtp(s => ({ ...s, pass: '', hasPassword: true }));
      toast.success('SMTP settings saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to save SMTP settings');
    } finally { setSmtpSaving(false); }
  };

  const handleSmtpTest = async () => {
    setSmtpTesting(true);
    try {
      const res = await testSmtpSettings(user?.email);
      const d = res.data ?? res;
      toast.success(`Test email sent to ${d?.to || user?.email}`);
    } catch (err) {
      toast.error(err?.message || 'Test email failed');
    } finally { setSmtpTesting(false); }
  };

  const validateForm = () => {
    const e = {};
    if (form.code && !/^[A-Za-z0-9_-]{2,20}$/.test(form.code.trim()))
      e.code = 'Code must be 2-20 letters, numbers, hyphens or underscores';
    if (form.email && !isEmail(form.email)) e.email = 'Please enter a valid email address';
    if (form.phone && !isPhone(form.phone)) e.phone = 'Please enter a valid phone number';
    if (form.website && !isURL(form.website)) e.website = 'Website must be a valid URL starting with http:// or https://';
    return e;
  };

  const fieldError = (key) => errors[key]
    ? <span style={{ color: 'var(--danger, #dc2626)', fontSize: '.78rem', marginTop: 4, display: 'block' }}>{errors[key]}</span>
    : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validateForm();
    setErrors(errs);
    if (Object.keys(errs).length) return toast.error(Object.values(errs)[0]);
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('code',    form.code);
      fd.append('email',   form.email);
      fd.append('phone',   form.phone);
      fd.append('website', form.website);
      fd.append('leaveSettings', JSON.stringify(form.leaveSettings));
      if (logoRef.current?.files?.[0]) fd.append('logo', logoRef.current.files[0]);
      const res = await updateSchoolSettings(fd);
      const d   = res.data?.data ?? res.data;
      setLogo(d.logo || '');
      setPreview(null);
      if (logoRef.current) logoRef.current.value = '';
      reload();   // refresh user.school so the sidebar logo/name update immediately
      toast.success('Settings saved');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="page">
      <div style={{ padding: 64, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
    </div>
  );

  const { saturdayWorking, saturdayMode, saturdayHalfDay } = form.leaveSettings;
  const logoSrc = preview || schoolLogoUrl({ logo });

  return (
    <div className="page">
      <PageHeader title="School Settings" subtitle="Update your school profile and working-day configuration" />

      <form onSubmit={handleSubmit} style={{ maxWidth: 680 }}>

        {/* ── School Profile ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><strong>School Profile</strong></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Logo */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Logo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {logoSrc ? (
                  <img src={logoSrc} alt="logo" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', padding: 4 }} />
                ) : (
                  <div style={{ width: 72, height: 72, borderRadius: 8, border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>🏫</div>
                )}
                <div>
                  <input ref={logoRef} type="file" accept="image/*" className="form-control" style={{ maxWidth: 300 }} onChange={handleLogoChange} />
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 4 }}>JPG, PNG, SVG — max 5 MB</div>
                </div>
              </div>
            </div>

            {/* Name (read-only) */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">School Name</label>
              <input className="form-control" value={name} disabled style={{ background: 'var(--bg-muted)', cursor: 'not-allowed' }} />
              <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>Only a super-admin can change the school name.</span>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">School Code</label>
                <input className={`form-control${errors.code ? ' error' : ''}`} value={form.code} onChange={e => set('code', e.target.value)} placeholder="e.g. SCH001" />
                {fieldError('code')}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Phone</label>
                <input className={`form-control${errors.phone ? ' error' : ''}`} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" />
                {fieldError('phone')}
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Email</label>
              <input type="email" className={`form-control${errors.email ? ' error' : ''}`} value={form.email} onChange={e => set('email', e.target.value)} placeholder="school@example.com" />
              {fieldError('email')}
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Website URL</label>
              <input type="url" className={`form-control${errors.website ? ' error' : ''}`} value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://www.school.edu" />
              {fieldError('website')}
            </div>

          </div>
        </div>

        {/* ── Working Day Configuration ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header"><strong>Working Day Configuration</strong></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>

            {/* Saturday working toggle */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={saturdayWorking}
                onChange={e => setLS('saturdayWorking', e.target.checked)}
                style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
              />
              <div>
                <div style={{ fontWeight: 600 }}>Saturday is a working day</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Uncheck if all Saturdays are off</div>
              </div>
            </label>

            {/* Saturday mode — shown only when saturday is working */}
            {saturdayWorking && (
              <div className="form-group" style={{ marginBottom: 0, paddingLeft: 30 }}>
                <label className="form-label">Which Saturdays are working?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                  {[
                    { value: 'all',   label: 'All Saturdays',         desc: 'Every Saturday is a working day' },
                    { value: '1_3_5', label: '1st, 3rd & 5th Saturday', desc: 'Odd Saturdays of each month' },
                    { value: '2_4',   label: '2nd & 4th Saturday',    desc: 'Even Saturdays of each month' },
                  ].map(opt => (
                    <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="saturdayMode"
                        value={opt.value}
                        checked={saturdayMode === opt.value}
                        onChange={() => setLS('saturdayMode', opt.value)}
                        style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }}
                      />
                      <div>
                        <span style={{ fontWeight: 500 }}>{opt.label}</span>
                        <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginLeft: 6 }}>— {opt.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Saturday half day — shown only when saturday is working */}
            {saturdayWorking && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', paddingLeft: 30 }}>
                <input
                  type="checkbox"
                  checked={saturdayHalfDay}
                  onChange={e => setLS('saturdayHalfDay', e.target.checked)}
                  style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Working Saturdays are half days</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Counts as 0.5 day when deducting leave</div>
                </div>
              </label>
            )}

          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button type="submit" loading={saving}>Save Settings</Button>
        </div>

      </form>

      {/* ── Email (SMTP) Settings ── */}
      <div className="card" style={{ maxWidth: 680, marginTop: 20 }}>
        <div className="card-header">
          <strong>Email (SMTP) Settings</strong>
          <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: 2 }}>
            When enabled, all emails to your students, parents and staff are sent from your school's own mailbox.
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={smtp.enabled}
              onChange={e => setSmtpF('enabled', e.target.checked)}
              style={{ width: 18, height: 18, accentColor: 'var(--primary)', cursor: 'pointer' }}
            />
            <div>
              <div style={{ fontWeight: 600 }}>Use our school's SMTP server</div>
              <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                When off, the platform's default mail server is used
              </div>
            </div>
          </label>

          <div className="form-row form-row-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">SMTP Host</label>
              <input className="form-control" value={smtp.host}
                onChange={e => setSmtpF('host', e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Port</label>
              <input type="number" className="form-control" value={smtp.port}
                onChange={e => setSmtpF('port', e.target.value)} placeholder="587" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={smtp.secure}
              onChange={e => setSmtpF('secure', e.target.checked)}
              style={{ width: 16, height: 16, accentColor: 'var(--primary)', cursor: 'pointer' }} />
            <span style={{ fontSize: '.85rem' }}>Use SSL/TLS (port 465). Leave off for STARTTLS (port 587).</span>
          </label>

          <div className="form-row form-row-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Username</label>
              <input className="form-control" value={smtp.user} autoComplete="off"
                onChange={e => setSmtpF('user', e.target.value)} placeholder="mail@yourschool.edu" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Password {smtp.hasPassword && !smtp.pass ? '(saved — leave blank to keep)' : ''}</label>
              <input type="password" className="form-control" value={smtp.pass} autoComplete="new-password"
                onChange={e => setSmtpF('pass', e.target.value)}
                placeholder={smtp.hasPassword ? '••••••••' : 'App password'} />
            </div>
          </div>

          <div className="form-row form-row-2">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">From Name</label>
              <input className="form-control" value={smtp.fromName}
                onChange={e => setSmtpF('fromName', e.target.value)} placeholder={name || 'School name'} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">From Email</label>
              <input type="email" className="form-control" value={smtp.fromEmail}
                onChange={e => setSmtpF('fromEmail', e.target.value)} placeholder="Defaults to username" />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" type="button" loading={smtpTesting}
              onClick={handleSmtpTest} disabled={!smtp.enabled && !smtp.hasPassword}>
              Send Test Email
            </Button>
            <Button type="button" loading={smtpSaving} onClick={handleSmtpSave}>Save SMTP Settings</Button>
          </div>

          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
            💡 Save settings first, then use "Send Test Email" — a test message is sent to your account email ({user?.email}).
          </div>
        </div>
      </div>
    </div>
  );
}
