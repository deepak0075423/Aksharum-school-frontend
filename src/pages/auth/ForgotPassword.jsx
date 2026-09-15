import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { forgotPassword } from '../../api/auth.api';
import { isEmail } from '../../utils/validators';
import Icon from '../../components/ui/icons';
import AuthShell, { Badge, Field } from './authShell';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Please enter your email');
    if (!isEmail(email)) return toast.error('Please enter a valid email address');
    setLoading(true);
    try {
      await forgotPassword({ email });
      toast.success('OTP sent to your email');
      navigate('/verify-otp', { state: { email } });
    } catch (err) {
      toast.error(err.message || 'Failed to send OTP');
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

      <form onSubmit={onSubmit} noValidate>
        <Field id="fp-email" label="Email Address" icon="mail" required>
          <input
            id="fp-email"
            type="email"
            className="form-control"
            placeholder="you@school.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
