import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resetPassword } from '../../api/auth.api';
import { useAuth } from '../../contexts/AuthContext';
import { passwordError } from '../../utils/validators';
import { PasswordInput, PasswordStrength, PasswordMatch } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { passwordStrength, matchState } from '../../utils/passwordStrength';
import AuthShell, { Badge, Field, Note } from './authShell';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { user, reload } = useAuth();
  const [form, setForm]       = useState({ newPassword: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const isFirst = user?.isFirstLogin !== false; // true for first-login, fallback safe

  // Scored on every keystroke; the button waits until both are satisfied.
  const strength = passwordStrength(form.newPassword);
  const match    = matchState(form.newPassword, form.confirm);
  const ready    = strength.ok && match === 'match';

  const onSubmit = async (e) => {
    e.preventDefault();
    const pwErr = passwordError(form.newPassword);
    if (pwErr) return toast.error(pwErr);
    if (form.newPassword !== form.confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await resetPassword({ newPassword: form.newPassword });
      toast.success('Password set! Please log in again.');
      await reload();
      navigate('/login');
    } catch (err) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell variant="secure">
      <header className="au-head au-head--badge">
        <Badge icon="lock" />
        <h2>Set Your New Password</h2>
        <p>
          {isFirst
            ? 'You logged in with a one-time password. Please set a new password to continue to your account.'
            : 'Choose a new password for your account.'}
        </p>
      </header>

      {isFirst && (
        <Note>This is your first login. You must set a new password before you can access the system.</Note>
      )}

      <form onSubmit={onSubmit} noValidate>
        <Field id="rp-new" label="New Password" required
          after={<PasswordStrength id="pw-strength" password={form.newPassword} />}>
          <PasswordInput id="rp-new" placeholder="Enter a new password" autoFocus autoComplete="new-password"
            aria-describedby="pw-strength" aria-invalid={form.newPassword && !strength.ok ? true : undefined}
            value={form.newPassword} onChange={(e) => setForm(f => ({ ...f, newPassword: e.target.value }))} />
        </Field>

        <Field id="rp-confirm" label="Confirm New Password" required
          after={<PasswordMatch id="pw-match" password={form.newPassword} confirm={form.confirm} />}>
          <PasswordInput id="rp-confirm" placeholder="Repeat the new password" autoComplete="new-password"
            className={match === 'mismatch' ? 'is-bad' : match === 'match' ? 'is-good' : ''}
            aria-describedby="pw-match" aria-invalid={match === 'mismatch' || undefined}
            value={form.confirm} onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))} />
        </Field>

        <button type="submit" className="au-btn au-btn--primary au-btn--tall" disabled={loading || !ready}>
          {loading
            ? <><span className="au-spin" aria-hidden="true" /> Saving…</>
            : <><Icon name="lock" size={20} /> Set Password &amp; Continue <Icon name="arrowRight" size={20} /></>}
        </button>
      </form>
    </AuthShell>
  );
}
