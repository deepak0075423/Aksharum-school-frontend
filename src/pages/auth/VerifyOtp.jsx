import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { verifyOtp } from '../../api/auth.api';
import Icon from '../../components/ui/icons';
import AuthShell, { Badge, Field } from './authShell';

export default function VerifyOtp() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const email     = location.state?.email || '';
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return toast.error('Enter the 6-digit OTP');
    setLoading(true);
    try {
      const res = await verifyOtp({ email, otp });
      toast.success('OTP verified');
      navigate('/new-password', { state: { resetToken: res.resetToken } });
    } catch (err) {
      toast.error(err.message || 'Invalid OTP');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell variant="secure">
      <header className="au-head au-head--badge">
        <Badge icon="mail" />
        <h2>Check Your Email</h2>
        <p>
          We sent a 6-digit code to {email ? <strong>{email}</strong> : 'your email'}. Enter it below to continue.
        </p>
      </header>

      <form onSubmit={onSubmit} noValidate>
        <Field id="otp-code" label="6-Digit Code" required>
          <input
            id="otp-code"
            type="text"
            className="form-control au-otp"
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
          />
        </Field>

        <button type="submit" className="au-btn au-btn--primary au-btn--tall" disabled={loading || otp.length !== 6}>
          {loading
            ? <><span className="au-spin" aria-hidden="true" /> Verifying…</>
            : <><Icon name="checkCircle" size={20} /> Verify Code <Icon name="arrowRight" size={20} /></>}
        </button>
      </form>

      <p className="au-back">
        Didn’t get it? <Link to="/forgot-password">Send a new code</Link>
      </p>
    </AuthShell>
  );
}
