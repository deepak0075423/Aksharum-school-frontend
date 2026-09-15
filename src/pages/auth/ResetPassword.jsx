import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { resetPassword } from '../../api/auth.api';
import { useAuth } from '../../contexts/AuthContext';
import { passwordError } from '../../utils/validators';
import AuthBrand from '../../components/layout/AuthBrand';
import { PasswordInput, PasswordStrength, PasswordMatch } from '../../components/ui/index';
import { passwordStrength, matchState } from '../../utils/passwordStrength';

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
    <div className="auth-page">
      <div className="auth-card">
        <AuthBrand compact />
        <div className="auth-logo">
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔐</div>
          <h1>Set Your Password</h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '.9rem' }}>
            {isFirst
              ? 'You logged in with a one-time password. Set a permanent password to continue.'
              : 'Choose a new password for your account.'}
          </p>
        </div>

        {isFirst && (
          <div className="alert alert-warning" style={{ marginBottom: 20, fontSize: '.85rem' }}>
            This is your first login. You must set a new password before you can access the system.
          </div>
        )}

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label required">New Password</label>
            <PasswordInput placeholder="Min 8 characters" autoFocus autoComplete="new-password"
              aria-describedby="pw-strength" aria-invalid={form.newPassword && !strength.ok ? true : undefined}
              value={form.newPassword} onChange={(e) => setForm(f => ({ ...f, newPassword: e.target.value }))} />
            <PasswordStrength id="pw-strength" password={form.newPassword} />
          </div>
          <div className="form-group">
            <label className="form-label required">Confirm New Password</label>
            <PasswordInput placeholder="Repeat new password" autoComplete="new-password"
              className={match === 'mismatch' ? 'is-bad' : match === 'match' ? 'is-good' : ''}
              aria-describedby="pw-match" aria-invalid={match === 'mismatch' || undefined}
              value={form.confirm} onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))} />
            <PasswordMatch id="pw-match" password={form.newPassword} confirm={form.confirm} />
          </div>
          <button type="submit" className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={loading || !ready}>
            {loading ? '⏳ Saving…' : '💾 Set Password & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
