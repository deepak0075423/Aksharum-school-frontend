/**
 * /cookie-policy — the cookie policy of the signed-in person's school, set up
 * under School Settings → Privacy & cookies.
 *
 * Only where the school runs the Admission module (Nov 2026): the policy is
 * part of Admission, so without it this address is a 404 — for every role,
 * and for someone not signed in (no school, so no Admission). The server
 * decides (GET /profile/cookie-policy answers 404 MODULE_DISABLED); the page
 * only draws the not-found screen when told so. An applicant (guest) is sent
 * to their school's portal, where the banner and the policy live.
 */
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { myCookiePolicy } from '../../api/privacy.api';
import CookiePolicyView from '../../components/privacy/CookiePolicyView';
import NotFoundRoute from '../errors/NotFoundRoute';
import { roleHome } from '../auth/roleHome';
import { Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import '../../styles/privacy.css';

export default function CookiePolicyPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [page, setPage] = useState(null);
  const [error, setError] = useState('');
  const [absent, setAbsent] = useState(false);   // no page here: not found

  useEffect(() => {
    if (loading) return undefined;
    let live = true;
    setPage(null); setError(''); setAbsent(false);
    // An applicant reads the policy on their school's portal, where the banner lives.
    if (user?.role === 'guest') {
      let slug = '';
      try { slug = localStorage.getItem('portalSlug') || ''; } catch { /* storage off */ }
      if (slug) { nav(`/${slug}/cookies`, { replace: true }); return undefined; }
    }
    // Not signed in, or an applicant with no portal to go to: no school, so no page.
    if (!user || user.role === 'guest') { setAbsent(true); return undefined; }
    myCookiePolicy()
      .then((r) => { if (live) setPage(r.data.page); })
      .catch((e) => {
        if (!live) return;
        if (e?.status === 404) setAbsent(true);   // the school does not run Admission
        else setError(e?.message || 'Could not open the cookie policy');
      });
    return () => { live = false; };
  }, [user, loading, nav]);

  if (absent) return <NotFoundRoute />;

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
