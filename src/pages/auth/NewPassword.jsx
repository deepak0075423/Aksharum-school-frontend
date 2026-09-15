import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { newPassword } from '../../api/auth.api';
import { passwordError } from '../../utils/validators';
import { PasswordInput, PasswordStrength, PasswordMatch } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { passwordStrength, matchState } from '../../utils/passwordStrength';
import AuthShell, { Badge, Field } from './authShell';

export default function NewPassword() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const resetToken = location.state?.resetToken || '';
  const [form, setForm]     = useState({ password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  // Scored on every keystroke; the button waits until both are satisfied.
  const strength = passwordStrength(form.password);
  const match    = matchState(form.password, form.confirm);
  const ready    = strength.ok && match === 'match';

  const onSubmit = async (e) => {
    e.preventDefault();
    const pwErr = passwordError(form.password);
    if (pwErr) return toast.error(pwErr);
    if (form.password !== form.confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await newPassword({ resetToken, password: form.password });
      toast.success('Password reset successfully! Please login.');
      navigate('/login');
    } catch (err) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell variant="secure">
      <header className="au-head au-head--badge">
        <Badge icon="lock" />
        <h2>Set Your New Password</h2>
        <p>Your email is verified. Choose a strong new password to finish resetting your account.</p>
      </header>

      <form onSubmit={onSubmit} noValidate>
        <Field id="np-new" label="New Password" required
          after={<PasswordStrength id="pw-strength" password={form.password} />}>
          <PasswordInput id="np-new" placeholder="Enter a new password" autoComplete="new-password" autoFocus
            aria-describedby="pw-strength" aria-invalid={form.password && !strength.ok ? true : undefined}
            value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} />
        </Field>

        <Field id="np-confirm" label="Confirm New Password" required
          after={<PasswordMatch id="pw-match" password={form.password} confirm={form.confirm} />}>
          <PasswordInput id="np-confirm" placeholder="Repeat the new password" autoComplete="new-password"
            className={match === 'mismatch' ? 'is-bad' : match === 'match' ? 'is-good' : ''}
            aria-describedby="pw-match" aria-invalid={match === 'mismatch' || undefined}
            value={form.confirm} onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))} />
        </Field>

        <button type="submit" className="au-btn au-btn--primary au-btn--tall" disabled={loading || !ready}>
          {loading
            ? <><span className="au-spin" aria-hidden="true" /> Saving…</>
            : <><Icon name="lock" size={20} /> Set Password <Icon name="arrowRight" size={20} /></>}
        </button>
      </form>

      <p className="au-back"><Link to="/login"><Icon name="arrowLeft" size={16} /> Back to sign in</Link></p>
    </AuthShell>
  );
}
