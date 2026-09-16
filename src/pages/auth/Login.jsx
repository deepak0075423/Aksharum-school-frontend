import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { takePendingNotification } from '../../utils/notificationLink';
import toast from 'react-hot-toast';
import { login, googleConfig, googleLogin } from '../../api/auth.api';
import { isEmail } from '../../utils/validators';
import { useAuth } from '../../contexts/AuthContext';
import { PasswordInput } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { loadGoogle, googleReady, requestGoogleCode } from '../../utils/googleSignIn';
import AuthShell, { Brand, Field, GoogleMark } from './authShell';
import { roleHome } from './roleHome';

export default function Login() {
  // A session ended by its school being deactivated leaves the reason behind so
  // the login screen can explain it, rather than showing a bare form.
  useEffect(() => {
    const notice = sessionStorage.getItem('authNotice');
    if (notice) { toast.error(notice, { duration: 6000 }); sessionStorage.removeItem('authNotice'); }
  }, []);

  const { signIn }   = useAuth();
  const navigate     = useNavigate();
  const [form, setForm]       = useState({ email: '', password: '' });
  const [loading, setLoading] = useState(false);

  const onChange = (e) => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

  /** The same landing whichever way the person signed in. */
  const finish = (res) => {
    // Several posts behind one address — a teacher at two schools, a parent
    // with children at two, a teacher who is also a parent. Nothing is signed
    // in until they say which one, so the ticket and the list are carried to
    // the chooser in navigation state rather than stored anywhere.
    if (res?.requiresSelection) {
      return navigate('/choose-account', { replace: true, state: {
        selectionToken: res.selectionToken,
        accounts:       res.accounts,
        name:           res.name,
        email:          res.email,
      } });
    }
    if (!res?.user) throw new Error('Unexpected server response. Check API configuration.');
    signIn(res.token, res.refreshToken, res.user);
    toast.success(`Welcome, ${res.user.name}!`);
    if (res.user.isFirstLogin) navigate('/reset-password');
    else {
      // Someone who arrived from a notification link while signed out gets
      // taken to that notification, not dropped on their dashboard.
      const pending = takePendingNotification();
      navigate(pending ? `/n/${pending}` : (roleHome[res.user.role] || '/'));
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) return toast.error('Please fill all fields');
    if (!isEmail(form.email)) return toast.error('Please enter a valid email address');
    setLoading(true);
    try {
      finish(await login(form));
    } catch (err) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // ── Sign in with Google ────────────────────────────────────────────────────
  // Shown only when the server has it configured. Google's script is fetched as
  // soon as that is known, so the popup can open straight from the click.
  const [google, setGoogle]     = useState({ enabled: false, clientId: null, ready: false });
  const [googleBusy, setGBusy]  = useState(false);

  useEffect(() => {
    let live = true;
    googleConfig()
      .then((cfg) => {
        if (!live || !cfg?.enabled || !cfg.clientId) return;
        setGoogle({ enabled: true, clientId: cfg.clientId, ready: googleReady() });
        loadGoogle()
          .then(() => live && setGoogle((g) => ({ ...g, ready: true })))
          .catch(() => live && setGoogle((g) => ({ ...g, failed: true })));
      })
      .catch(() => { /* no Google button — the password form is unaffected */ });
    return () => { live = false; };
  }, []);

  const onGoogle = () => {
    if (!google.ready) {
      toast.error(google.failed ? 'Google sign-in could not be reached. Use your email and password.' : 'Google sign-in is still loading…');
      return;
    }
    setGBusy(true);
    requestGoogleCode(google.clientId)
      .then((code) => googleLogin(code))
      .then(finish)
      .catch((err) => { if (!err?.cancelled) toast.error(err.message || 'Google sign-in failed'); })
      .finally(() => setGBusy(false));
  };

  const busy = loading || googleBusy;

  return (
    <AuthShell variant="welcome">
      <Brand layout="stack" />

      <header className="au-head">
        <h2>Welcome Back</h2>
        <p>Sign in to your account to continue</p>
      </header>

      <form onSubmit={onSubmit} noValidate>
        <Field id="login-email" label="Email Address" icon="mail" required>
          <input
            id="login-email"
            name="email"
            type="email"
            className="form-control"
            placeholder="you@school.com"
            value={form.email}
            onChange={onChange}
            autoComplete="email"
            autoFocus
          />
        </Field>

        <Field id="login-password" label="Password" icon="lock" required>
          <PasswordInput
            id="login-password"
            name="password"
            placeholder="Enter your password"
            value={form.password}
            onChange={onChange}
            autoComplete="current-password"
          />
        </Field>

        <div className="au-forgot">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>

        <button type="submit" className="au-btn au-btn--primary" disabled={busy}>
          {loading
            ? <><span className="au-spin" aria-hidden="true" /> Signing in…</>
            : <><Icon name="logIn" size={20} /> Sign In</>}
        </button>
      </form>

      {google.enabled && (
        <>
          <div className="au-or"><span>Or continue with</span></div>
          <button type="button" className="au-btn au-btn--google" onClick={onGoogle} disabled={busy}>
            {googleBusy ? <span className="au-spin au-spin--dark" aria-hidden="true" /> : <GoogleMark />}
            Sign in with Google
          </button>
        </>
      )}

      {/* Each phrase in its own element: as bare text either side of the dot,
          hiding the dot on a phone ran them together ("AksharumKeep"). */}
      <p className="au-foot">
        <span className="au-foot__part"><Icon name="shield" size={16} /> Protected by Aksharum</span>
        <i aria-hidden="true">•</i>
        <span className="au-foot__part">Keep your account secure</span>
      </p>
    </AuthShell>
  );
}
