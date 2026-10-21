/**
 * /cookie-policy — the cookie policy of the signed-in person's school (set up
 * under School Settings → Privacy & cookies), or the platform's own before
 * anyone has signed in. Linked from the avatar menu.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { myCookiePolicy, platformCookiePolicy } from '../../api/privacy.api';
import CookiePolicyView from '../../components/privacy/CookiePolicyView';
import { roleHome } from '../auth/roleHome';
import { Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import '../../styles/privacy.css';

export default function CookiePolicyPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading) return;
    let live = true;
    // An applicant reads the policy on their school's portal, where the banner lives.
    if (user?.role === 'guest') {
      let slug = '';
      try { slug = localStorage.getItem('portalSlug') || ''; } catch { /* storage off */ }
      if (slug) { nav(`/${slug}/cookies`, { replace: true }); return undefined; }
    }
    const load = user && user.role !== 'guest' ? myCookiePolicy() : platformCookiePolicy();
    load
      .then((r) => { if (live) setPage(r.data.page); })
      .catch(() => platformCookiePolicy().then((r) => { if (live) setPage(r.data.page); }).catch((e) => { if (live) setError(e?.message || 'Could not open the cookie policy'); }));
    return () => { live = false; };
  }, [user, loading, nav]);

  const back = user ? (roleHome[user.role] || '/') : '/login';
  return (
    <div className="ckpage">
      <div className="ckpage__bar">
        <Link to={back} className="ckpage__back"><Icon name="arrowLeft" size={16} /> {user ? 'Back to my account' : 'Back to sign in'}</Link>
      </div>
      <main className="ckpage__main">
        {error ? <div className="alert alert-danger">{error}</div> : !page ? <div className="ckpage__wait"><Spinner /></div> : (
          <CookiePolicyView page={page} surface="app" />
        )}
      </main>
    </div>
  );
}
