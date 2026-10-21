/**
 * A school's admission portal — app.aksharum.com/<slug>. The frame every
 * portal page sits in: the school's name, logo and colours, its notices, and
 * who is signed in. The school is the one behind the address; the browser
 * never names a school id.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { pub, portal as portalApi } from '../../../api/admission.api';
import { useAuth } from '../../../contexts/AuthContext';
import NotFoundRoute from '../../errors/NotFoundRoute';
import { useLoad, Spin, Btn, Ico } from '../admUI';
import { roleHome, ROLE_LABEL } from '../../auth/roleHome';
import { useCookieConsent, CookieBanner, CookiePreferences } from './CookieConsent';
import { ConsentGate } from './YourData';

const PortalContext = createContext(null);
export const usePortal = () => useContext(PortalContext);

/** Is the signed-in person an applicant of THIS school's portal? */
export function useApplicantHere() {
  const { user } = useAuth();
  const portal = usePortal();
  const schoolId = String(user?.school?._id || user?.school || '');
  return !!(user && user.role === 'guest' && portal?.data?.school?._id && schoolId === String(portal.data.school._id));
}

/**
 * `bare`: the portal's school and colours without its header and footer — the
 * online exam room, which has the whole screen to itself.
 */
export default function PortalShell({ bare = false }) {
  const { slug } = useParams();
  const nav = useNavigate();
  const { user, signOut } = useAuth();
  const { data, loading, error, reload } = useLoad(() => pub.portal(slug), [slug]);
  // The school's cookie banner, and the guard that keeps optional tags to public pages.
  const cc = useCookieConsent(slug, data?.cookies, { reload });

  useEffect(() => {
    if (data?.slug) {
      try { localStorage.setItem('portalSlug', data.slug); } catch { /* storage off */ }
      document.title = `${data.portal.title || 'Admissions'} — ${data.school.name}`;
    }
  }, [data?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  // Added to a phone's home screen from here, the portal installs as the school's own app —
  // its name, colour and start page (school-backend controllers/admissionPublic manifest).
  useEffect(() => {
    if (!data?.slug) return undefined;
    const link = document.querySelector('link[rel="manifest"]');
    const meta = document.querySelector('meta[name="theme-color"]');
    const before = { href: link?.getAttribute('href'), color: meta?.getAttribute('content') };
    const apiBase = String(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
    if (link) link.setAttribute('href', `${apiBase}/admission/public/portals/${encodeURIComponent(data.slug)}/manifest.webmanifest`);
    if (meta && data.portal.theme?.primary) meta.setAttribute('content', data.portal.theme.primary);
    return () => {
      if (link && before.href) link.setAttribute('href', before.href);
      if (meta && before.color) meta.setAttribute('content', before.color);
    };
  }, [data?.slug, data?.portal?.theme?.primary]);

  const ctx = useMemo(() => ({ slug, data, reload, cookies: cc }), [slug, data, reload, cc]);
  if (loading && !data) return <div className="adm-portal"><Spin label="Opening the admission portal…" /></div>;
  if (error || !data) return <NotFoundRoute />;

  const p = data.portal;
  const theme = { '--pt': p.theme?.primary || '#4f46e5', '--pa': p.theme?.accent || '#7c3aed' };
  const schoolId = String(user?.school?._id || user?.school || '');
  const applicantHere = user && user.role === 'guest' && schoolId === String(data.school._id);
  const someoneElse = user && !applicantHere;
  const leave = () => { signOut(); nav(`/${slug}`); };

  if (bare) {
    return (
      <PortalContext.Provider value={ctx}>
        <div style={theme}><Outlet /></div>
      </PortalContext.Provider>
    );
  }

  return (
    <PortalContext.Provider value={ctx}>
      <div className="adm-portal" style={theme}>
        {p.status === 'maintenance' ? <div className="adm-banner adm-banner--warning">{p.maintenanceMessage}</div> : null}
        {p.announcement?.text ? <div className={`adm-banner adm-banner--${p.announcement.tone || 'info'}`}>{p.announcement.text}</div> : null}
        <header className="adm-portal__bar">
          <div className="adm-portal__barin">
            <Link to={`/${slug}`} className="adm-portal__brand">
              {data.school.logo ? <img src={data.school.logo} alt="" /> : <span className="adm-portal__logo">{data.school.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('')}</span>}
              <span>
                {p.header?.showSchoolName !== false ? <strong>{data.school.name}</strong> : null}
                <em>{p.title || 'Admissions'}</em>
              </span>
            </Link>
            <nav className="adm-portal__nav" aria-label="Portal">
              {(p.header?.links || []).map((l) => <a key={l.url} className="adm-portal__link" href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}
              {p.visits ? <NavLink to={`/${slug}/visit`} className="adm-portal__link">Visit us</NavLink> : null}
              {applicantHere ? (
                <>
                  <NavLink to={`/${slug}/dashboard`} className="adm-portal__link">My applications</NavLink>
                  <NavLink to={`/${slug}/privacy`} className="adm-portal__link">Your data</NavLink>
                  <Btn size="sm" kind="ghost" icon="logOut" onClick={leave}>Sign out</Btn>
                </>
              ) : someoneElse ? (
                <>
                  <span className="adm-muted" style={{ fontSize: '.8rem' }}>Signed in as {user.name} ({ROLE_LABEL[user.role] || user.role})</span>
                  <Btn size="sm" kind="ghost" onClick={() => nav(roleHome[user.role] || '/')}>Back to my account</Btn>
                </>
              ) : (
                <>
                  <NavLink to={`/${slug}/login`} className="adm-portal__link">Sign in</NavLink>
                  {p.status === 'open' ? <Btn size="sm" kind="primary" onClick={() => nav(`/${slug}/register`)}>Apply now</Btn> : null}
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="adm-portal__main">
          <Outlet />
        </main>
        <footer className="adm-portal__foot">
          <div className="adm-portal__footin">
            <span>{p.footer?.text || `${data.school.name} · Admissions`}</span>
            <span className="adm-row">
              {(p.footer?.links || []).map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}
              {p.contact?.email ? <a href={`mailto:${p.contact.email}`}><Ico name="mail" size={13} /> {p.contact.email}</a> : null}
              {p.contact?.phone ? <span><Ico name="phone" size={13} /> {p.contact.phone}</span> : null}
              <Link to={`/${slug}/privacy`}>Privacy</Link>
              <Link to={`/${slug}/cookies`}>Cookie policy</Link>
              {data.cookies?.enabled ? <button type="button" className="adm-portal__footbtn" onClick={cc.openPrefs}>Cookie settings</button> : null}
              <span>Powered by Aksharum</span>
            </span>
          </div>
        </footer>
        <CookieBanner slug={slug} cc={cc} />
        <CookiePreferences cc={cc} />
      </div>
    </PortalContext.Provider>
  );
}

/**
 * The applicant's own pages: only for an applicant of this school. Anyone
 * else is sent to sign in — or told plainly that this account is not one.
 */
export function ApplicantOnly({ children, skipConsent = false }) {
  const { user, loading, signOut } = useAuth();
  const portal = usePortal();
  const nav = useNavigate();
  const here = useApplicantHere();
  // A changed privacy notice is agreed to before the applicant's pages open (the server enforces it too).
  const [consent, setConsent] = useState(null);
  useEffect(() => {
    if (!here || skipConsent) return;
    portalApi.privacy().then((r) => setConsent(r.data.consent)).catch(() => setConsent({ agreedVersion: 1, currentVersion: 1 }));
  }, [here, skipConsent]);
  if (loading) return <Spin />;
  if (!user) return <Navigate to={`/${portal.slug}/login`} replace />;
  if (!here) {
    return (
      <div className="adm-authcard" style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1>This is the applicants' area</h1>
        <p>You are signed in as {user.name} ({ROLE_LABEL[user.role] || user.role}). To apply to {portal.data.school.name}, sign out and use an applicant account.</p>
        <div className="adm-row">
          <Btn kind="primary" onClick={() => { signOut(); nav(`/${portal.slug}/login`); }}>Sign out and continue</Btn>
          <Btn onClick={() => nav(roleHome[user.role] || '/')}>Back to my account</Btn>
        </div>
      </div>
    );
  }
  if (!skipConsent) {
    if (!consent) return <Spin />;
    if (Number(consent.agreedVersion || 0) < Number(consent.currentVersion || 1)) {
      return <ConsentGate notice={consent.notice} version={consent.currentVersion} onAgreed={() => setConsent({ ...consent, agreedVersion: consent.currentVersion })} />;
    }
  }
  return children;
}
