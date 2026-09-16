/**
 * Moving between the schools and roles one sign-in holds.
 *
 * The same list in two places: inside the header's avatar menu, where switching
 * is a thing you do in passing, and as a block on the Profile page, where it is
 * something you go looking for. Both draw from `user.accounts`, which the server
 * puts on the session — the posts this password opens, live schools only, the
 * current one marked.
 *
 * Nothing is rendered when there is only one, which is almost everybody: a
 * switcher offering the seat you are already in is noise.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { listAccounts } from '../api/auth.api';
import Icon from './ui/icons';
import { ROLE_LABEL, ROLE_ICON } from '../pages/auth/roleHome';
import { schoolLogoUrl } from '../utils/branding';

export default function AccountSwitcher({ variant = 'menu', onDone }) {
  const { user, accounts: atSignIn, switchTo } = useAuth();
  const [busy, setBusy] = useState(null);
  // The list on the session was drawn when it was opened. A post can be
  // switched off since — a teacher who has left one school — and must not be
  // offered, so the current list is asked for whenever the switcher is shown
  // (the menu mounts on open). Until it answers, the sign-in list stands in.
  const [live, setLive] = useState(null);
  useEffect(() => {
    let alive = true;
    listAccounts()
      .then((r) => { if (alive && Array.isArray(r?.accounts)) setLive(r.accounts); })
      .catch(() => { /* keep the sign-in list */ });
    return () => { alive = false; };
  }, [user?._id]);
  const accounts = live ?? atSignIn;

  if (!accounts || accounts.length < 2) return null;

  // Every post in the same role — a parent with children at two schools, a
  // teacher at two — is purely a choice of school, and is named that way.
  // Only a mix of roles makes it a choice of role as well.
  const oneRole  = new Set(accounts.map((a) => a.role)).size === 1;
  const current  = accounts.find((a) => a.current);
  const isParent = oneRole && accounts[0].role === 'parent';

  const go = async (account) => {
    if (account.current || busy) return;
    setBusy(account.id);
    try {
      // Hands off to a full reload, so this component is unmounted mid-flight
      // and never needs to clear `busy` on the happy path.
      await switchTo(account.id);
      onDone?.();
    } catch (err) {
      toast.error(err.message || 'Could not switch account');
      setBusy(null);
    }
  };

  const rows = accounts.map((a) => (
    <button
      key={a.id}
      type="button"
      className={`acctsw__row${a.current ? ' is-current' : ''}`}
      onClick={() => go(a)}
      disabled={!!busy || a.current}
    >
      <span className="acctsw__mark">
        {schoolLogoUrl(a.school)
          ? <img src={schoolLogoUrl(a.school)} alt="" />
          : <Icon name={ROLE_ICON[a.role] || 'user'} size={16} />}
      </span>
      <span className="acctsw__text">
        <strong>{a.school?.name || 'Platform'}</strong>
        <small>
          {a.current ? 'Viewing now' : (oneRole ? 'Switch to this school' : ROLE_LABEL[a.role] || a.role)}
          {!oneRole && a.current ? ` · ${ROLE_LABEL[a.role] || a.role}` : ''}
        </small>
      </span>
      {busy === a.id
        ? <span className="acctsw__spin" aria-hidden="true" />
        : a.current
          ? <Icon name="check" size={16} className="acctsw__tick" />
          : <Icon name="chevronRight" size={16} className="acctsw__go" />}
    </button>
  ));

  if (variant === 'menu') {
    return (
      <div className="acctsw acctsw--menu">
        <p className="acctsw__label">{oneRole ? 'Switch school' : 'Switch school or role'}</p>
        {rows}
      </div>
    );
  }

  return (
    <section className="card acctsw acctsw--page">
      <header className="acctsw__head">
        <h3><Icon name="repeat" size={18} /> {oneRole ? 'Switch school' : 'Switch school or role'}</h3>
        <p>
          {isParent
            ? <>Your children study at {accounts.length} schools. You are viewing <strong>{current?.school?.name}</strong> — pick another school to see its information instead. You stay signed in.</>
            : oneRole
              ? <>You work at {accounts.length} schools. You are in <strong>{current?.school?.name}</strong> — pick another to switch. You stay signed in.</>
              : <>{user?.email} is used for {accounts.length} posts. Switching changes the school and role you are working in — you stay signed in.</>}
        </p>
      </header>
      {rows}
    </section>
  );
}
