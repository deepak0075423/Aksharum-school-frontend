/**
 * "Which of you is signing in?"
 *
 * One email address can be several people's worth of access: a teacher at two
 * schools, a parent with children at three, a teacher who is also a parent. The
 * password proved who they are; this screen asks which of their posts they are
 * here as, and nothing is signed in until they say.
 *
 * Two questions, asked only when they have more than one answer:
 *   1. Continue as — the role, when they hold more than one
 *   2. Which school — the school, when that role is held at more than one
 *
 * A person with one role at two schools therefore sees only the school question,
 * and a teacher-and-parent at a single school sees only the role question. The
 * sign-in is finished by /auth/select, which re-checks the post server-side: the
 * list was drawn up to ten minutes ago and a post can be switched off in between.
 */
import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { selectAccount } from '../../api/auth.api';
import { useAuth } from '../../contexts/AuthContext';
import { takePendingNotification } from '../../utils/notificationLink';
import Icon from '../../components/ui/icons';
import AuthShell, { Brand } from './authShell';
import { schoolLogoUrl } from '../../utils/branding';
import { roleHome, ROLE_LABEL, ROLE_ICON } from './roleHome';

export default function ChooseAccount() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { signIn } = useAuth();

  const { selectionToken, accounts = [], name, email } = state || {};
  const [role, setRole]       = useState(null);
  const [busy, setBusy]       = useState(null);   // the id being opened

  // The roles on offer, in the order the server listed them.
  const roles = useMemo(() => [...new Set(accounts.map((a) => a.role))], [accounts]);
  // Once there is only one role, the role question has no content — skip it.
  // Derived during render rather than set from an effect, so a parent with two
  // schools never sees a flash of "Continue as" before the school list.
  const activeRole = role ?? (roles.length === 1 ? roles[0] : null);

  // Reached directly, or reloaded: the token lives in the navigation state only,
  // so there is nothing to choose from and sign-in starts again.
  if (!selectionToken || !accounts.length) return <Navigate to="/login" replace />;

  const forRole = accounts.filter((a) => a.role === activeRole);

  const open = async (account) => {
    setBusy(account.id);
    try {
      const res = await selectAccount({ selectionToken, userId: account.id });
      if (!res?.user) throw new Error('Unexpected server response.');
      signIn(res.token, res.refreshToken, res.user);
      // A full load of the chosen school, not an in-app navigation. This screen
      // can be reached from a one-time link opened in a browser that was signed
      // in somewhere else, and a soft navigation would carry that session's
      // modules, chat socket and cached pages into this one. The welcome toast
      // survives the reload the same way the magic link's does.
      sessionStorage.setItem('welcome_msg', `Welcome, ${res.user.name}!`);
      if (res.user.isFirstLogin) return window.location.replace('/reset-password');
      const pending = takePendingNotification();
      window.location.replace(pending ? `/n/${pending}` : (roleHome[res.user.role] || '/'));
    } catch (err) {
      // The ten-minute ticket is the thing most likely to have run out.
      if (err?.data?.code === 'SELECTION_EXPIRED') {
        toast.error(err.message);
        navigate('/login', { replace: true });
      } else {
        toast.error(err.message || 'Could not open that account');
      }
      setBusy(null);
    }
  };

  // One school for the chosen role: there is no second question to ask.
  const pickRole = (r) => {
    const mine = accounts.filter((a) => a.role === r);
    if (mine.length === 1) return open(mine[0]);
    setRole(r);
  };

  const showingSchools = activeRole !== null;

  return (
    <AuthShell variant="welcome">
      <Brand layout="stack" />

      <header className="au-head">
        <h2>{showingSchools ? 'Which school would you like to access?' : 'Continue as'}</h2>
        <p>
          {showingSchools
            ? <>You are signed in as <strong>{email}</strong>. You'll see that school's information only — switch schools any time from your profile.</>
            : <>Hi {name?.split(' ')[0] || 'there'} — this email is used for more than one role. Choose how you want to continue.</>}
        </p>
      </header>

      <ul className="au-pick">
        {(showingSchools ? forRole : roles.map((r) => ({ role: r }))).map((item) => {
          const isRole  = !showingSchools;
          const key     = isRole ? item.role : item.id;
          const logo    = isRole ? null : schoolLogoUrl(item.school);
          const label   = isRole ? ROLE_LABEL[item.role] || item.role : (item.school?.name || 'School');
          const count   = isRole ? accounts.filter((a) => a.role === item.role).length : 0;
          return (
            <li key={key}>
              <button
                type="button"
                className="au-pick__row"
                onClick={() => (isRole ? pickRole(item.role) : open(item))}
                disabled={busy !== null}
              >
                <span className="au-pick__mark">
                  {logo
                    ? <img src={logo} alt="" />
                    : <Icon name={isRole ? (ROLE_ICON[item.role] || 'user') : 'school'} size={22} />}
                </span>
                <span className="au-pick__text">
                  <strong>{label}</strong>
                  <small>
                    {isRole
                      ? (count > 1 ? `${count} schools` : 'One school')
                      : `Continue as ${ROLE_LABEL[item.role]?.toLowerCase() || item.role}`}
                  </small>
                </span>
                {/* A role held at one school opens that post directly, so its
                    row spins for the post's id rather than the role's name. */}
                {(busy === key || (isRole && accounts.some((a) => a.role === item.role && a.id === busy)))
                  ? <span className="au-spin au-spin--dark" aria-hidden="true" />
                  : <Icon name="chevronRight" size={20} className="au-pick__go" />}
              </button>
            </li>
          );
        })}
      </ul>

      {/* Only offered once a role has been chosen AND there was a choice to make. */}
      {showingSchools && roles.length > 1 && (
        <p className="au-back">
          <button type="button" className="au-linkbtn" onClick={() => setRole(null)} disabled={busy !== null}>
            <Icon name="arrowLeft" size={16} /> Back to roles
          </button>
        </p>
      )}
      <p className="au-back">
        <button type="button" className="au-linkbtn" onClick={() => navigate('/login', { replace: true })}>
          Use a different account
        </button>
      </p>
    </AuthShell>
  );
}
