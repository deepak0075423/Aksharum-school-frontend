/**
 * The applicant's account on a school's portal: sign in, register (with the
 * emailed 6-digit code), and reset a forgotten password. Sessions are the
 * app's ordinary ones (AuthContext) — an applicant is a `guest` account.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { pub } from '../../../api/admission.api';
import { useAuth } from '../../../contexts/AuthContext';
import PhoneInput from '../../../components/ui/PhoneInput';
import { PasswordInput, PasswordStrength } from '../../../components/ui/index';
import { passwordError } from '../../../utils/validators';
import { usePortal, useApplicantHere } from './PortalShell';
import { Btn, Field, Input, Note, Ico, Check } from '../admUI';
import { useHumanCheck } from './Captcha';
import { errMsg } from '../meta';

function Side() {
  const { data } = usePortal();
  return (
    <aside className="adm-authwrap__side">
      <h2>{data.portal.title || 'Admissions'}</h2>
      <p style={{ opacity: 0.92 }}>{data.portal.tagline || `Apply to ${data.school.name} online.`}</p>
      <ul>
        <li><Ico name="checkCircle" size={18} />Save your application and come back to it any time</li>
        <li><Ico name="checkCircle" size={18} />Upload documents and see when they are checked</li>
        <li><Ico name="checkCircle" size={18} />Exam dates, results and offers in one place</li>
      </ul>
    </aside>
  );
}

/** Six boxes for a code (emailed or texted); paste fills them all. */
export function CodeBoxes({ value, onChange, disabled }) {
  const refs = useRef([]);
  const digits = (value || '').padEnd(6, ' ').slice(0, 6).split('');
  const put = (i, ch) => {
    const next = digits.slice();
    next[i] = ch;
    onChange(next.join('').replace(/\s/g, ''));
  };
  return (
    <div className="adm-otp" onPaste={(e) => {
      const t = (e.clipboardData.getData('text') || '').replace(/\D/g, '').slice(0, 6);
      if (t) { e.preventDefault(); onChange(t); refs.current[Math.min(5, t.length)]?.focus(); }
    }}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el; }} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} aria-label={`Digit ${i + 1}`}
          maxLength={1} value={d.trim()} disabled={disabled}
          onChange={(e) => { const ch = e.target.value.replace(/\D/g, '').slice(-1); put(i, ch || ' '); if (ch && i < 5) refs.current[i + 1]?.focus(); }}
          onKeyDown={(e) => { if (e.key === 'Backspace' && !digits[i].trim() && i > 0) refs.current[i - 1]?.focus(); }} />
      ))}
    </div>
  );
}

function useCountdown(seconds) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => { setLeft(seconds); }, [seconds]);
  useEffect(() => {
    if (left <= 0) return undefined;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return [left, setLeft];
}

const goHome = (nav, slug) => nav(`/${slug}/dashboard`, { replace: true });

export function PortalLogin() {
  const { slug, data } = usePortal();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const here = useApplicantHere();
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (here) goHome(nav, slug); }, [here]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await pub.login(slug, f);
      signIn(r.token, r.refreshToken, r.user);
      goHome(nav, slug);
    } catch (err) { setError(errMsg(err, 'Could not sign in')); } finally { setBusy(false); }
  };
  return (
    <div className="adm-authwrap">
      <Side />
      <form className="adm-authcard" onSubmit={go} noValidate>
        <h1>{data.portal.loginText?.title || 'Welcome back'}</h1>
        <p>{data.portal.loginText?.subtitle || 'Sign in to continue your application.'}</p>
        {error ? <Note tone="red" icon="alert">{error}</Note> : null}
        <Field label="Email" required><Input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" required><PasswordInput className="adm-input" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <div className="adm-row adm-row--between"><Link to={`/${slug}/forgot-password`} className="adm-linkbtn">Forgot password?</Link></div>
        <Btn type="submit" kind="primary" size="lg" busy={busy} disabled={!f.email || !f.password}>Sign in</Btn>
        {data.portal.status === 'open' ? <p className="adm-muted" style={{ fontSize: '.86rem', textAlign: 'center' }}>New here? <Link to={`/${slug}/register`}>Create an applicant account</Link></p> : null}
      </form>
    </div>
  );
}

export function PortalRegister() {
  const { slug, data } = usePortal();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const here = useApplicantHere();
  const [step, setStep] = useState('details');
  const [f, setF] = useState({ name: '', email: '', phone: '', password: '', confirm: '', consent: false });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [left, setLeft] = useCountdown(0);
  const human = useHumanCheck(data.portal.captcha);
  useEffect(() => { if (here) goHome(nav, slug); }, [here]); // eslint-disable-line react-hooks/exhaustive-deps
  const source = new URLSearchParams(window.location.search).get('src') || new URLSearchParams(window.location.search).get('utm_source') || '';

  const pwErr = f.password ? passwordError(f.password) : null;
  const mismatch = f.confirm && f.confirm !== f.password;
  const ready = f.name && f.email && f.phone && f.password && !pwErr && !mismatch && f.consent;

  const send = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await pub.register(slug, { name: f.name, email: f.email, phone: f.phone, password: f.password, consent: f.consent, source, ...human.body });
      setInfo(r.message);
      setLeft(r.resendIn || 60);
      setStep('code');
    } catch (err) { setError(errMsg(err)); if (err?.data?.retryAfter) setLeft(err.data.retryAfter); } finally { setBusy(false); human.reset(); }
  };
  const resend = async () => {
    setBusy(true); setError('');
    try { const r = await pub.resend(slug, { email: f.email }); setLeft(r.resendIn || 60); toast.success('A new code is on its way'); setCode(''); } catch (err) { setError(errMsg(err)); if (err?.data?.retryAfter) setLeft(err.data.retryAfter); } finally { setBusy(false); }
  };
  const verify = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await pub.verify(slug, { email: f.email, code });
      if (r.token) {
        signIn(r.token, r.refreshToken, r.user);
        toast.success(r.message || 'Your account is ready');
        goHome(nav, slug);
      } else {
        setStep('done');
        setInfo(r.message);
      }
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  if (step === 'done') {
    return (
      <div className="adm-authcard" style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1>Email verified</h1>
        <Note tone="indigo" icon="info">{info}</Note>
        <Btn kind="primary" onClick={() => nav(`/${slug}/login`)}>Go to sign in</Btn>
      </div>
    );
  }

  return (
    <div className="adm-authwrap">
      <Side />
      {step === 'details' ? (
        <form className="adm-authcard" onSubmit={send} noValidate>
          <h1>{data.portal.registerText?.title || 'Create your applicant account'}</h1>
          <p>{data.portal.registerText?.subtitle || 'One account lets you apply and track every step.'}</p>
          {data.portal.status !== 'open' ? <Note tone="amber" icon="alert">{data.portal.closedMessage || 'Registrations are closed.'}</Note> : null}
          {error ? <Note tone="red" icon="alert">{error}</Note> : null}
          <Field label="Your full name" required hint="The parent or guardian applying — or the student, for senior classes."><Input data-text="name" autoComplete="name" value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
          <Field label="Email" required hint="We send a code here to verify it."><Input type="email" autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Mobile number" required><PhoneInput className="adm-input" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="Password" required error={pwErr}>
            <PasswordInput className="adm-input" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </Field>
          {f.password ? <PasswordStrength password={f.password} /> : null}
          <Field label="Confirm password" required error={mismatch ? 'The passwords do not match' : null}>
            <PasswordInput className="adm-input" autoComplete="new-password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} />
          </Field>
          <div className="adm-privacy" tabIndex={0} aria-label="Privacy notice">{data.portal.privacyNotice}</div>
          <Check checked={f.consent} onChange={(v) => setF({ ...f, consent: v })}>I have read the privacy notice and agree to the school using my details to process the admission.</Check>
          {human.widget}
          <Btn type="submit" kind="primary" size="lg" busy={busy} disabled={!ready || !human.ready || data.portal.status !== 'open'}>Continue</Btn>
          <p className="adm-muted" style={{ fontSize: '.86rem', textAlign: 'center' }}>Already registered? <Link to={`/${slug}/login`}>Sign in</Link></p>
        </form>
      ) : (
        <form className="adm-authcard" onSubmit={verify} noValidate>
          <h1>Check your email</h1>
          <p>{info || `We sent a 6-digit code to ${f.email}.`}</p>
          {error ? <Note tone="red" icon="alert">{error}</Note> : null}
          <CodeBoxes value={code} onChange={setCode} disabled={busy} />
          <Btn type="submit" kind="primary" size="lg" busy={busy} disabled={code.length !== 6}>Verify and continue</Btn>
          <div className="adm-row adm-row--between" style={{ fontSize: '.86rem' }}>
            <button type="button" className="adm-linkbtn" onClick={() => { setStep('details'); setCode(''); setError(''); }}>Change details</button>
            <button type="button" className="adm-linkbtn" disabled={left > 0 || busy} onClick={resend}>{left > 0 ? `Send a new code in ${left}s` : 'Send a new code'}</button>
          </div>
          <p className="adm-muted" style={{ fontSize: '.8rem' }}>Not in your inbox? Check spam or promotions. The code expires in a few minutes.</p>
        </form>
      )}
    </div>
  );
}

export function PortalForgot() {
  const { slug, data } = usePortal();
  const human = useHumanCheck(data.portal.captcha);
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [left, setLeft] = useCountdown(0);
  const send = async (e) => {
    e?.preventDefault();
    setBusy(true); setError('');
    try { const r = await pub.forgot(slug, { email, ...human.body }); setInfo(r.message); setLeft(r.resendIn || 60); setStep('code'); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); human.reset(); }
  };
  const reset = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await pub.reset(slug, { email, code, password: pw });
      toast.success('Your password has been changed');
      if (r.token) { signIn(r.token, r.refreshToken, r.user); nav(`/${slug}/dashboard`, { replace: true }); } else nav(`/${slug}/login`);
    } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };
  return (
    <div className="adm-authcard" style={{ maxWidth: 480, margin: '0 auto', width: '100%' }}>
      <h1>Reset your password</h1>
      {error ? <Note tone="red" icon="alert">{error}</Note> : null}
      {step === 'email' ? (
        <form onSubmit={send} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="adm-muted">Enter the email you registered with. We will send a code to reset the password.</p>
          <Field label="Email" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          {human.widget}
          <Btn type="submit" kind="primary" busy={busy} disabled={!email || !human.ready}>Send code</Btn>
        </form>
      ) : (
        <form onSubmit={reset} noValidate style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p className="adm-muted">{info}</p>
          <CodeBoxes value={code} onChange={setCode} disabled={busy} />
          <Field label="New password" required error={pw ? passwordError(pw) : null}><PasswordInput className="adm-input" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          {pw ? <PasswordStrength password={pw} /> : null}
          <Note tone="gray" icon="info">This is the password for every Aksharum account that uses this email.</Note>
          <Btn type="submit" kind="primary" busy={busy} disabled={code.length !== 6 || !!passwordError(pw)}>Set new password</Btn>
          {left <= 0 ? human.widget : null}
          <button type="button" className="adm-linkbtn" disabled={left > 0 || busy || !human.ready} onClick={send}>{left > 0 ? `Send a new code in ${left}s` : 'Send a new code'}</button>
        </form>
      )}
      <p className="adm-muted" style={{ fontSize: '.86rem', textAlign: 'center' }}><Link to={`/${slug}/login`}>Back to sign in</Link></p>
    </div>
  );
}
