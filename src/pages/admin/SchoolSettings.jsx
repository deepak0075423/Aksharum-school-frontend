/**
 * Admin → School Settings.
 *
 * Seven unrelated settings screens share this route: the school's profile, the
 * two numbering formats, the working week, the mail server, the payment gateway
 * and the receipt designs. They used to be one 3,000-pixel column; they are now
 * sections of one page, switched by the nav under the header.
 *
 * The sections are NOT separate pages — every panel stays mounted, so switching
 * away and back never loses half-typed input.
 *
 * Saving is deliberately not one button. The profile, the formats and the
 * working week are one record and one request, so the header's Save covers all
 * three and says when something is waiting on it. The mail server, the gateway
 * and the receipt designs are separate records with their own validation and
 * their own credentials, so each keeps its own Save — and each panel says so.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getSchoolSettings, updateSchoolSettings, getSmtpSettings, updateSmtpSettings,
  testSmtpSettings, previewAdmissionNumber, previewEmployeeId,
} from '../../api/admin.api';
import PaymentGatewayCard from '../../components/settings/PaymentGatewayCard';
import ReceiptDesignCard from '../../components/settings/ReceiptDesignCard';
import { useModules } from '../../contexts/ModulesContext';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Button, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { isEmail, isPhone, isURL } from '../../utils/validators';
import { schoolLogoUrl } from '../../utils/branding';
import { Crumbs, PageFoot } from './listParts';
import {
  Check, FormatBuilder, Legend, LogoField, Panel, Radio, SaturdayPreview,
  SaveBar, SectionSave, SelfSaveNote, SettingsNav,
} from './settingsParts';

const EMPTY_SMTP = {
  enabled: false, host: '', port: 587, secure: false,
  user: '', pass: '', fromName: '', fromEmail: '', hasPassword: false,
};

const EMPTY = {
  code: '', email: '', phone: '', website: '',
  admissionNumberFormat: '{INITIALS}{YYYY}{####}',
  employeeIdFormat: '{INITIALS}{####}',
  leaveSettings: { saturdayWorking: true, saturdayMode: 'all', saturdayHalfDay: false },
};

// {SEQ} is accepted by both formatters (see utils/admissionNumber.js) and the
// server's own error message names it, but no screen ever offered it.
const ADMISSION_TOKENS = ['{INITIALS}', '{CODE}', '{YYYY}', '{YY}', '{MM}', '{DD}', '{CLASS}', '{CLASSNO}', '{####}', '{SEQ}'];
const EMPLOYEE_TOKENS  = ['{INITIALS}', '{CODE}', '{YYYY}', '{YY}', '{MM}', '{DD}', '{####}', '{SEQ}'];

const ADMISSION_LEGEND = [
  ['{INITIALS}', 'First letter of each word in the school name'],
  ['{CODE}',     'The school code set above'],
  ['{YYYY}',     'Academic year start, 4 digits'],
  ['{YY}',       'Academic year start, 2 digits'],
  ['{MM}',       'Month of admission'],
  ['{DD}',       'Date of admission'],
  ['{CLASS}',    'Class name without spaces — Class 5 → CLASS5'],
  ['{CLASSNO}',  'Class number — Class 5 → 5'],
  ['{####}',     'Running number, one digit per #'],
  ['{SEQ}',      'Running number with no leading zeros'],
];

const EMPLOYEE_LEGEND = [
  ['{INITIALS}', 'First letter of each word in the school name'],
  ['{CODE}',     'The school code set above'],
  ['{YYYY}',     'Academic year start, 4 digits'],
  ['{YY}',       'Academic year start, 2 digits'],
  ['{MM}',       'Month of joining'],
  ['{DD}',       'Date of joining'],
  ['{####}',     'Running number, one digit per #'],
  ['{SEQ}',      'Running number with no leading zeros'],
];

export default function SchoolSettings() {
  // Which modules this school runs — the gateway and receipt panels only offer
  // the ones it actually has. `ready` matters: isEnabled fails open while the
  // module list is loading, so asking it too early says yes to everything.
  const { isEnabled, ready: modulesReady } = useModules();
  const { user, reload } = useAuth();

  const [section, setSection] = useState('general');

  const [form,    setForm]    = useState(EMPTY);
  const [saved,   setSaved]   = useState(EMPTY);   // what the server last confirmed
  const [name,    setName]    = useState('');
  const [logo,    setLogo]    = useState('');
  const [preview, setPreview] = useState(null);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [admPreview, setAdmPreview] = useState(null);   // { samples[], next } | { error }
  const [empPreview, setEmpPreview] = useState(null);
  const admTimer = useRef(null);
  const empTimer = useRef(null);
  const logoRef  = useRef();

  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState({});

  const [smtp,        setSmtp]        = useState(EMPTY_SMTP);
  const [smtpSaving,  setSmtpSaving]  = useState(false);
  const [smtpTesting, setSmtpTesting] = useState(false);

  useEffect(() => {
    getSmtpSettings()
      .then((res) => {
        const d = res.data?.data ?? res.data ?? res;
        setSmtp({ ...EMPTY_SMTP, ...d, pass: '' });
      })
      .catch(() => {});
    getSchoolSettings()
      .then((res) => {
        const d = res.data?.data ?? res.data;
        setName(d.name || '');
        setLogo(d.logo || '');
        const next = {
          admissionNumberFormat: d.admissionNumberFormat || '{INITIALS}{YYYY}{####}',
          employeeIdFormat:      d.employeeIdFormat      || '{INITIALS}{####}',
          code:    d.code    || '',
          email:   d.email   || '',
          phone:   d.phone   || '',
          website: d.website || '',
          leaveSettings: {
            saturdayWorking: d.leaveSettings?.saturdayWorking !== false,
            saturdayMode:    d.leaveSettings?.saturdayMode    || 'all',
            saturdayHalfDay: !!d.leaveSettings?.saturdayHalfDay,
          },
        };
        setForm(next);
        setSaved(next);
      })
      .catch(() => toast.error('Failed to load school settings'))
      .finally(() => setLoading(false));
  }, []);

  // ── The one record this page's Save covers ─────────────────────────────────
  const logoChanged = !!preview || removeLogo;
  const dirty = logoChanged || JSON.stringify(form) !== JSON.stringify(saved);

  const discard = () => {
    setForm(saved);
    setErrors({});
    setPreview(null);
    setRemoveLogo(false);
    if (logoRef.current) logoRef.current.value = '';
  };

  const set   = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const setLS = (key, val) => setForm((f) => ({ ...f, leaveSettings: { ...f.leaveSettings, [key]: val } }));

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRemoveLogo(false);          // picking a file overrides a pending removal
    setPreview(URL.createObjectURL(file));
  };

  // Marks the logo for deletion; applied when the form is saved, like every
  // other field on this page.
  const handleLogoRemove = () => {
    setPreview(null);
    setRemoveLogo(true);
    if (logoRef.current) logoRef.current.value = '';
  };

  // ── Live previews: ask the server what the next number would look like ─────
  useEffect(() => {
    const format = form.admissionNumberFormat;
    clearTimeout(admTimer.current);
    if (!format?.trim()) { setAdmPreview(null); return undefined; }
    admTimer.current = setTimeout(async () => {
      try { setAdmPreview((await previewAdmissionNumber(format.trim()))?.data || null); }
      catch (err) { setAdmPreview({ error: err.message }); }
    }, 400);
    return () => clearTimeout(admTimer.current);
  }, [form.admissionNumberFormat]);

  useEffect(() => {
    const format = form.employeeIdFormat;
    clearTimeout(empTimer.current);
    if (!format?.trim()) { setEmpPreview(null); return undefined; }
    empTimer.current = setTimeout(async () => {
      try { setEmpPreview((await previewEmployeeId(format.trim()))?.data || null); }
      catch (err) { setEmpPreview({ error: err.message }); }
    }, 400);
    return () => clearTimeout(empTimer.current);
  }, [form.employeeIdFormat]);

  // ── Save ───────────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (form.code && !/^[A-Za-z0-9_-]{2,20}$/.test(form.code.trim()))
      e.code = 'Code must be 2–20 letters, numbers, hyphens or underscores';
    if (form.email && !isEmail(form.email)) e.email = 'Enter a valid email address';
    if (form.phone && !isPhone(form.phone)) e.phone = 'Enter a valid phone number';
    if (form.website && !isURL(form.website)) e.website = 'The website must start with http:// or https://';
    return e;
  };

  // Which section a field belongs to, so a validation failure can send the
  // admin to the panel holding it rather than to a message about a box they
  // cannot see.
  const SECTION_OF = { code: 'general', email: 'general', phone: 'general', website: 'general' };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0];
      setSection(SECTION_OF[first] || 'general');
      toast.error(errs[first]);
      return;
    }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('code',    form.code);
      fd.append('email',   form.email);
      fd.append('phone',   form.phone);
      fd.append('website', form.website);
      fd.append('admissionNumberFormat', form.admissionNumberFormat || '');
      fd.append('employeeIdFormat',      form.employeeIdFormat || '');
      fd.append('leaveSettings', JSON.stringify(form.leaveSettings));
      if (logoRef.current?.files?.[0]) fd.append('logo', logoRef.current.files[0]);
      else if (removeLogo) fd.append('removeLogo', 'true');

      const res = await updateSchoolSettings(fd);
      const d   = res.data?.data ?? res.data;
      setLogo(d.logo || '');
      setPreview(null);
      setRemoveLogo(false);
      if (logoRef.current) logoRef.current.value = '';
      setSaved(form);
      reload();   // refresh user.school so the sidebar logo/name update immediately
      toast.success('School settings saved');
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSaving(false);
    }
  };

  // ── SMTP: its own record, its own save ─────────────────────────────────────
  const setSmtpF = (key, val) => setSmtp((s) => ({ ...s, [key]: val }));

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
        enabled: smtp.enabled, host: smtp.host, port: smtp.port, secure: smtp.secure,
        user: smtp.user, pass: smtp.pass /* blank = keep existing */,
        fromName: smtp.fromName, fromEmail: smtp.fromEmail,
      });
      if (smtp.pass) setSmtp((s) => ({ ...s, pass: '', hasPassword: true }));
      toast.success('SMTP settings saved');
    } catch (err) { toast.error(err?.message || 'Failed to save SMTP settings'); }
    finally { setSmtpSaving(false); }
  };

  const handleSmtpTest = async () => {
    setSmtpTesting(true);
    try {
      const res = await testSmtpSettings(user?.email);
      const d = res.data ?? res;
      toast.success(`Test email sent to ${d?.to || user?.email}`);
    } catch (err) { toast.error(err?.message || 'Test email failed'); }
    finally { setSmtpTesting(false); }
  };

  // ── Sections ───────────────────────────────────────────────────────────────
  // Payments and receipts only exist for a school that charges for something.
  const money = modulesReady && (isEnabled('fees') || isEnabled('library'));

  const tabs = useMemo(() => [
    { key: 'general',  label: 'General',      icon: 'building' },
    { key: 'identity', label: 'Numbering',    icon: 'idCard' },
    { key: 'days',     label: 'Working Days', icon: 'calendarDays' },
    { key: 'mail',     label: 'Email',        icon: 'mail' },
    ...(money ? [
      { key: 'payments', label: 'Payments', icon: 'creditCard' },
      { key: 'receipts', label: 'Receipts', icon: 'files' },
    ] : []),
  ], [money]);

  // A section that disappears when the module list lands must not leave the
  // page showing nothing.
  useEffect(() => {
    if (!tabs.some((t) => t.key === section)) setSection('general');
  }, [tabs, section]);

  const err  = (key) => (errors[key] ? <div className="form-error">{errors[key]}</div> : null);
  // `hidden` rather than unmounting: a panel that is switched away from keeps
  // whatever was typed into it.
  const hide = (key) => (section === key ? undefined : true);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const { saturdayWorking, saturdayMode, saturdayHalfDay } = form.leaveSettings;
  const logoSrc = preview || (removeLogo ? null : schoolLogoUrl({ logo }));

  return (
    <div className="page listpg setpg">
      <Crumbs here="School Settings" />

      <header className="sethero">
        <div className="sethero__id">
          <h1>School Settings</h1>
          <p>Your school&rsquo;s profile, how it numbers people, the week it works, and how it takes money.</p>
        </div>
        <SaveBar dirty={dirty} saving={saving} onSave={handleSubmit} onReset={discard} />
      </header>

      <SettingsNav tabs={tabs} active={section} onPick={setSection} />

      {/* One form across the first three sections: they are one record and one
          request. The panels stay mounted so nothing typed is lost on a switch. */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="setgrid" hidden={hide('general')}>
          <Panel icon="school" tone="indigo" title="School profile"
            desc="What appears on the sidebar, on emails and at the top of every receipt.">
            <LogoField
              src={logoSrc}
              inputRef={logoRef}
              onPick={handleLogoChange}
              onRemove={handleLogoRemove}
              removePending={removeLogo}
              onUndo={() => setRemoveLogo(false)}
            />

            <div className="form-group">
              <label className="form-label">School name</label>
              <input className="form-control" value={name} disabled />
              <div className="form-hint">Only a super-admin can change the school name.</div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">School code</label>
                <input className={`form-control${errors.code ? ' error' : ''}`} value={form.code}
                  onChange={(e) => set('code', e.target.value)} placeholder="SCH001" />
                {err('code')}
                <div className="form-hint">Used by the <span className="setmono">{'{CODE}'}</span> token in numbering.</div>
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className={`form-control${errors.phone ? ' error' : ''}`} value={form.phone}
                  onChange={(e) => set('phone', e.target.value)} placeholder="+91 98765 43210" />
                {err('phone')}
              </div>
            </div>

            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className={`form-control${errors.email ? ' error' : ''}`} value={form.email}
                  onChange={(e) => set('email', e.target.value)} placeholder="school@example.com" />
                {err('email')}
              </div>
              <div className="form-group">
                <label className="form-label">Website</label>
                <input type="url" className={`form-control${errors.website ? ' error' : ''}`} value={form.website}
                  onChange={(e) => set('website', e.target.value)} placeholder="https://www.school.edu" />
                {err('website')}
              </div>
            </div>
          </Panel>
        </div>

        <div className="setgrid setgrid--2" hidden={hide('identity')}>
          <Panel icon="student" tone="blue" title="Admission numbers"
            desc="Given to a student added without one. Numbering continues from the highest already issued.">
            <FormatBuilder
              id="admission-format"
              value={form.admissionNumberFormat}
              tokens={ADMISSION_TOKENS}
              placeholder="{INITIALS}{YYYY}{####}"
              preview={admPreview}
              nextLabel="next issued"
              onChange={(v) => set('admissionNumberFormat', v)}
              legend={(
                <Legend items={ADMISSION_LEGEND} footnote={
                  <>Anything else you type — slashes, dashes, spaces — is kept as-is. The running number
                  continues per pattern, so <span className="setmono">{'{CLASS}'}</span> numbers each class
                  separately and <span className="setmono">{'{DD}'}</span> restarts the count each day.</>
                } />
              )}
            />
          </Panel>

          <Panel icon="teacher" tone="green" title="Employee &amp; teacher IDs"
            desc="Given to a teacher added without one. Kept separate from admission numbers.">
            <FormatBuilder
              id="employee-format"
              value={form.employeeIdFormat}
              tokens={EMPLOYEE_TOKENS}
              placeholder="{INITIALS}{####}"
              preview={empPreview}
              nextLabel="next issued"
              onChange={(v) => set('employeeIdFormat', v)}
              legend={(
                <Legend items={EMPLOYEE_LEGEND} footnote={
                  <><span className="setmono">{'{CLASS}'}</span> and <span className="setmono">{'{CLASSNO}'}</span> are
                  not available here — a teacher is not tied to a class. The running number continues per
                  pattern, so <span className="setmono">{'{YYYY}'}</span> restarts the count each academic year.</>
                } />
              )}
            />
          </Panel>

          <SectionSave dirty={dirty} saving={saving} onSave={handleSubmit}
            hint="Both formats are saved with the rest of your school settings." />
        </div>

        <div className="setgrid setgrid--2" hidden={hide('days')}>
          <Panel icon="calendarDays" tone="purple" title="The working week"
            desc="Monday to Friday are always working days. Saturday is the one a school decides for itself.">
            <Check
              checked={saturdayWorking}
              onChange={(v) => setLS('saturdayWorking', v)}
              title="Saturday is a working day"
              desc="Turn this off if every Saturday is a weekly off."
            />

            {saturdayWorking && (
              <>
                <div className="setsub">Which Saturdays?</div>
                <Radio name="saturdayMode" value="all" current={saturdayMode} onChange={(v) => setLS('saturdayMode', v)}
                  title="All Saturdays" desc="Every Saturday of the month" />
                <Radio name="saturdayMode" value="1_3_5" current={saturdayMode} onChange={(v) => setLS('saturdayMode', v)}
                  title="1st, 3rd & 5th Saturday" desc="The odd-numbered Saturdays of each month" />
                <Radio name="saturdayMode" value="2_4" current={saturdayMode} onChange={(v) => setLS('saturdayMode', v)}
                  title="2nd & 4th Saturday" desc="The even-numbered Saturdays of each month" />

                <div className="setsub">Length of the day</div>
                <Check
                  indent
                  checked={saturdayHalfDay}
                  onChange={(v) => setLS('saturdayHalfDay', v)}
                  title="Working Saturdays are half days"
                  desc="Counts as 0.5 of a day when leave is deducted."
                />
              </>
            )}
          </Panel>

          <Panel icon="eye" tone="amber" title="This month, as configured"
            desc="The rule applied to a real month — the three options are easy to mix up.">
            <SaturdayPreview settings={form.leaveSettings} />
          </Panel>

          <SectionSave dirty={dirty} saving={saving} onSave={handleSubmit}
            hint="The working week is saved with the rest of your school settings." />
        </div>
      </form>

      {/* ── Sections that own their own record, and their own Save ─────────── */}
      <div className="setgrid" hidden={hide('mail')}>
        <Panel icon="mail" tone="teal" title="Email (SMTP)"
          desc="With this on, every email to your students, parents and staff is sent from your school's own mailbox.">
          <SelfSaveNote>
            The mail server holds its own credentials and is saved with the button below, not with the
            page&rsquo;s Save.
          </SelfSaveNote>

          <Check
            checked={smtp.enabled}
            onChange={(v) => setSmtpF('enabled', v)}
            title="Use our school's own mail server"
            desc="When off, the platform's default mail server sends everything."
          />

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">SMTP host</label>
              <input className="form-control" value={smtp.host}
                onChange={(e) => setSmtpF('host', e.target.value)} placeholder="smtp.gmail.com" />
            </div>
            <div className="form-group">
              <label className="form-label">Port</label>
              <input type="number" className="form-control" value={smtp.port}
                onChange={(e) => setSmtpF('port', e.target.value)} placeholder="587" />
            </div>
          </div>

          <Check
            checked={smtp.secure}
            onChange={(v) => setSmtpF('secure', v)}
            title="Use SSL/TLS"
            desc="For port 465. Leave off for STARTTLS on port 587."
          />

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Username</label>
              <input className="form-control" value={smtp.user} autoComplete="off"
                onChange={(e) => setSmtpF('user', e.target.value)} placeholder="mail@yourschool.edu" />
            </div>
            <div className="form-group">
              <label className="form-label">
                Password {smtp.hasPassword && !smtp.pass ? '— saved, leave blank to keep' : ''}
              </label>
              <input type="password" className="form-control" value={smtp.pass} autoComplete="new-password"
                onChange={(e) => setSmtpF('pass', e.target.value)}
                placeholder={smtp.hasPassword ? '••••••••' : 'App password'} />
            </div>
          </div>

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">From name</label>
              <input className="form-control" value={smtp.fromName}
                onChange={(e) => setSmtpF('fromName', e.target.value)} placeholder={name || 'School name'} />
            </div>
            <div className="form-group">
              <label className="form-label">From email</label>
              <input type="email" className="form-control" value={smtp.fromEmail}
                onChange={(e) => setSmtpF('fromEmail', e.target.value)} placeholder="Defaults to the username" />
            </div>
          </div>

          <div className="setactions">
            <span className="form-hint">
              Save first, then test — the message goes to your own account, {user?.email}.
            </span>
            <Button variant="secondary" type="button" loading={smtpTesting}
              onClick={handleSmtpTest} disabled={!smtp.enabled && !smtp.hasPassword}>
              <Icon name="mail" size={15} /> Send test email
            </Button>
            <Button type="button" loading={smtpSaving} onClick={handleSmtpSave}>Save mail settings</Button>
          </div>
        </Panel>
      </div>

      {/* Both live here rather than inside a module: fees and library fines
          charge through the same merchant account, and a school configures it
          once. Each card hides itself when no module needs it. */}
      {money && (
        <>
          <div className="setgrid" hidden={hide('payments')}>
            <SelfSaveNote>
              The gateway keeps its own keys and is saved from inside the panel.
            </SelfSaveNote>
            <PaymentGatewayCard />
          </div>

          <div className="setgrid" hidden={hide('receipts')}>
            <SelfSaveNote>
              Each receipt design is saved from inside the panel, per module.
            </SelfSaveNote>
            <ReceiptDesignCard availableModules={{ fees: isEnabled('fees'), library: isEnabled('library') }} />
          </div>
        </>
      )}

      {!modulesReady && (
        <Alert variant="info">Checking which modules your school runs…</Alert>
      )}

      <PageFoot schoolName={name} />
    </div>
  );
}
