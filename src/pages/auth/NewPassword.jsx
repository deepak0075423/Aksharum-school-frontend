import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { newPassword } from '../../api/auth.api';
import { passwordError } from '../../utils/validators';
import AuthBrand from '../../components/layout/AuthBrand';
import { PasswordInput, PasswordStrength, PasswordMatch } from '../../components/ui/index';
import { passwordStrength, matchState } from '../../utils/passwordStrength';

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
    <div className="auth-page">
      <div className="auth-card">
        <AuthBrand compact />
        <div className="auth-logo">
          <div style={{ fontSize: '2.5rem', marginBottom: 8 }}>🔒</div>
          <h1>New Password</h1>
          <p>Choose a strong new password</p>
        </div>

        <form onSubmit={onSubmit}>
          <div className="form-group">
            <label className="form-label required">New Password</label>
            <PasswordInput placeholder="Min 8 characters" autoComplete="new-password"
              aria-describedby="pw-strength" aria-invalid={form.password && !strength.ok ? true : undefined}
              value={form.password} onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))} autoFocus />
            <PasswordStrength id="pw-strength" password={form.password} />
          </div>
          <div className="form-group">
            <label className="form-label required">Confirm Password</label>
            <PasswordInput placeholder="Repeat password" autoComplete="new-password"
              className={match === 'mismatch' ? 'is-bad' : match === 'match' ? 'is-good' : ''}
              aria-describedby="pw-match" aria-invalid={match === 'mismatch' || undefined}
              value={form.confirm} onChange={(e) => setForm(f => ({ ...f, confirm: e.target.value }))} />
            <PasswordMatch id="pw-match" password={form.password} confirm={form.confirm} />
          </div>
          <button type="submit" className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: 11 }} disabled={loading || !ready}>
            {loading ? '⏳ Saving…' : '💾 Set Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
