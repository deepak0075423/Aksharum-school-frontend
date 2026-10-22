import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { forgotPassword } from '../../api/auth.api';
import { isEmail } from '../../utils/validators';
import Icon from '../../components/ui/icons';
import AuthShell, { Badge, Field, opensAt } from './authShell';
import { codePageState } from './resetCodes';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  // Sent here from a locked sign-in, the address is already known.
  const [email, setEmail]     = useState(location.state?.email || '');
  const [loading, setLoading] = useState(false);
  // A refusal worth keeping on screen until the address changes: no account
  // uses it, the account cannot sign in, or its three codes are used up.
  const [problem, setProblem] = useState(null);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Please enter your email');
    if (!isEmail(email)) return toast.error('Please enter a valid email address');
    setLoading(true);
    setProblem(null);
    try {
      const res = await forgotPassword({ email });
      toast.success('Code sent to your email');
      navigate('/verify-otp', { state: codePageState(email, res) });
    } catch (err) {
      const d = err.data || {};
      if (d.code === 'OTP_WAIT') {
        // A code went out under a minute ago and is still good — go and use it.
        toast(`We just sent a code to ${email} — check your inbox.`, { icon: '✉️' });
        navigate('/verify-otp', { state: codePageState(email, d) });
      } else if (['ACCOUNT_NOT_FOUND', 'ACCOUNT_UNAVAILABLE', 'OTP_LIMIT'].includes(d.code)) {
        setProblem({ code: d.code, message: err.message, availableAt: d.availableAt || null });
      } else {
        toast.error(err.message || 'Failed to send OTP');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell variant="secure">
      <header className="au-head au-head--badge">
        <Badge icon="key" />
        <h2>Forgot Your Password?</h2>
        <p>Enter the email address on your account and we’ll send you a one-time code to reset it.</p>
      </header>

      {problem && <ResetProblem {...problem} email={email} />}

      <form onSubmit={onSubmit} noValidate>
        <Field id="fp-email" label="Email Address" icon="mail" required>
          <input data-text="email"
            id="fp-email"
            type="email"
            className={`form-control${problem?.code === 'ACCOUNT_NOT_FOUND' ? ' is-bad' : ''}`}
            placeholder="you@school.com"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setProblem(null); }}
            autoComplete="email"
            autoFocus
          />
        </Field>

        <button type="submit" className="au-btn au-btn--primary au-btn--tall" disabled={loading}>
          {loading
            ? <><span className="au-spin" aria-hidden="true" /> Sending…</>
            : <><Icon name="mail" size={20} /> Send Code <Icon name="arrowRight" size={20} /></>}
        </button>
      </form>

      <p className="au-back"><Link to="/login"><Icon name="arrowLeft" size={16} /> Back to sign in</Link></p>
    </AuthShell>
  );
}

/** Why no code was sent, in words the person can act on. */
function ResetProblem({ code, message, availableAt, email }) {
  if (code === 'ACCOUNT_NOT_FOUND') {
    return (
      <div className="au-alert au-alert--error" role="alert">
        <Icon name="alert" size={20} className="au-alert__icon" />
        <div>
          <strong>No account found</strong>
          <p>There is no account with <b>{email}</b>. Check the address, or ask your school office which email they have for you.</p>
        </div>
      </div>
    );
  }
  if (code === 'OTP_LIMIT') {
    const when = opensAt(availableAt);
    return (
      <div className="au-alert" role="alert">
        <Icon name="clock" size={20} className="au-alert__icon" />
        <div>
          <strong>Too many codes asked for</strong>
          <p>{when ? <>You have already asked for 3 codes. You can ask for a new one after <b className="au-when">{when}</b>.</> : message}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="au-alert au-alert--error" role="alert">
      <Icon name="lock" size={20} className="au-alert__icon" />
      <div>
        <strong>This account can’t sign in</strong>
        <p>{message}</p>
      </div>
    </div>
  );
}
