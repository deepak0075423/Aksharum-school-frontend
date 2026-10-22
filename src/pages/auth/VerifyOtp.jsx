import React, { useEffect, useState } from 'react';
import { Navigate, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { forgotPassword, verifyOtp } from '../../api/auth.api';
import Icon from '../../components/ui/icons';
import AuthShell, { Badge, Field, opensAt } from './authShell';
import { codePageState } from './resetCodes';

/** 42 → "0:42" */
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function VerifyOtp() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const email     = location.state?.email || '';
  const [otp, setOtp]         = useState('');
  const [loading, setLoading] = useState(false);

  // Asking for another code: 60 seconds after the last one, three in a row,
  // then not for a day. The server decides (services/resetCodeLimit); this
  // page shows where the person stands. Kept in the history entry too, so a
  // reload picks the countdown up where it was.
  const [codes, setCodes]         = useState(() => ({ ...codePageState(email, null), ...location.state }));
  const [resending, setResending] = useState(false);
  const [now, setNow]             = useState(Date.now());

  const wait = Math.max(0, Math.ceil((codes.resendAt - now) / 1000));
  const counting = wait > 0;
  useEffect(() => {
    if (!counting) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [counting]);

  const remember = (next) => {
    setCodes(next);
    setNow(Date.now());
    navigate(location.pathname, { replace: true, state: next });
  };

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

  // Right here — the page used to send the person back to the email form.
  const resend = async () => {
    setResending(true);
    try {
      const res = await forgotPassword({ email });
      setOtp('');
      remember(codePageState(email, res));
      toast.success('A new code is on its way. Use the newest one — earlier codes no longer work.');
    } catch (err) {
      const d = err.data || {};
      if (d.code === 'OTP_WAIT' || d.code === 'OTP_LIMIT') remember(codePageState(email, d));
      else toast.error(err.message || 'Could not send a new code');
    } finally {
      setResending(false);
    }
  };

  const usedUp = codes.sendsLeft === 0;
  const until  = usedUp ? opensAt(codes.availableAt) : null;

  // Opened on its own (a new tab, a typed address): there is no address to
  // check a code against or send one to, so start where the address is asked.
  if (!email) return <Navigate to="/forgot-password" replace />;

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
          <input data-text="otp"
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

      <div className="au-back au-resend" aria-live="polite">
        {usedUp ? (
          <p>
            You have asked for all {codes.maxSends} codes.
            {until ? <> You can ask for a new one after <b className="au-when">{until}</b>.</> : ' You can ask for a new one in 24 hours.'}
          </p>
        ) : (
          <>
            <p>
              Didn’t get it?{' '}
              {counting
                ? <>You can resend the code in <b className="au-resend__clock">{clock(wait)}</b></>
                : (
                  <button type="button" className="au-linkbtn" onClick={resend} disabled={resending}>
                    {resending ? 'Sending…' : 'Resend code'}
                  </button>
                )}
            </p>
            {codes.sendsLeft != null && (
              <p className="au-resend__left">
                You can ask for {codes.sendsLeft} more {codes.sendsLeft === 1 ? 'code' : 'codes'}.
              </p>
            )}
          </>
        )}
      </div>
    </AuthShell>
  );
}
