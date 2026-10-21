/**
 * The cookie banner on a school's admission portal (Oct 2026), its
 * preferences dialog, and the guard that keeps optional tags to the portal's
 * public pages.
 *
 * The banner shows until this browser has answered the current version of the
 * school's policy (utils/cookieConsent). "Accept all" and "Reject" sit side by
 * side and look the same — saying no is as easy as saying yes. Each answer is
 * also sent to the school's consent log, so it can show consent was asked for.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { portalCookieConsent } from '../../../api/privacy.api';
import {
  applyTags, clearTagCookies, consentStands, readConsent, visitorId, writeConsent,
} from '../../../utils/cookieConsent';
import { Btn, Dialog, Toggle } from '../admUI';
import '../../../styles/privacy.css';

const NONE = { preferences: false, analytics: false, marketing: false };

/** Is this a page anyone can see — the landing page or the policy itself? Only there may tags run. */
export function isPublicPage(pathname, slug) {
  const p = String(pathname || '').replace(/\/+$/, '');
  return p === `/${slug}` || p === `/${slug}/cookies`;
}

export function useCookieConsent(slug, banner, { reload } = {}) {
  const location = useLocation();
  const [consent, setConsent] = useState(() => readConsent(slug));
  const [prefsOpen, setPrefsOpen] = useState(false);
  const stands = consentStands(consent, banner);
  const choices = stands ? consent.choices : NONE;
  const publicPage = isPublicPage(location.pathname, slug);

  // Tags follow the page and the answer: on only where both allow it.
  useEffect(() => {
    if (!banner) return;
    applyTags(banner.tags, choices, { publicPage });
  }, [banner, choices, publicPage]);

  const answer = useCallback(async (action, picked = {}) => {
    if (!banner) return;
    const allowed = Object.fromEntries((banner.categories || []).map((c) => [c.key, action === 'accept_all' || (action === 'custom' && !!picked[c.key])]));
    const next = { ...NONE, ...allowed };
    const before = stands ? consent.choices : NONE;
    writeConsent(slug, banner.version, next);
    setConsent(readConsent(slug));
    setPrefsOpen(false);
    try {
      await portalCookieConsent(slug, { visitor: visitorId(), version: banner.version, action, choices: next });
    } catch (e) {
      // The policy changed while the banner was open: fetch the new one and ask again.
      if (e?.response?.status === 409 || e?.status === 409) reload?.();
    }
    // Something that was allowed is now refused: clear what its tag left and start the page clean.
    const withdrawn = ['analytics', 'marketing'].some((k) => before[k] && !next[k]);
    if (withdrawn) { clearTagCookies(); window.location.reload(); }
  }, [banner, consent, slug, stands, reload]);

  return {
    banner, choices, stands, publicPage,
    showBanner: !!banner?.enabled && !stands,
    prefsOpen, openPrefs: () => setPrefsOpen(true), closePrefs: () => setPrefsOpen(false),
    answer,
  };
}

export function CookieBanner({ slug, cc }) {
  if (!cc.showBanner || cc.prefsOpen) return null;
  const b = cc.banner;
  return (
    <section className="ckb" role="region" aria-label="Cookie choices">
      <div className="ckb__in">
        <div className="ckb__text">
          <h2>{b.title}</h2>
          <p>{b.text} <Link to={`/${slug}/cookies`}>Read the cookie policy</Link></p>
        </div>
        <div className="ckb__acts">
          {b.hasOptional ? (
            <>
              <Btn kind="ghost" onClick={cc.openPrefs}>Choose</Btn>
              <Btn kind="primary" onClick={() => cc.answer('reject_all')}>Reject optional</Btn>
              <Btn kind="primary" onClick={() => cc.answer('accept_all')}>Accept all</Btn>
            </>
          ) : (
            <Btn kind="primary" onClick={() => cc.answer('accept_all')}>OK</Btn>
          )}
        </div>
      </div>
    </section>
  );
}

export function CookiePreferences({ cc }) {
  const b = cc.banner;
  const [picked, setPicked] = useState(cc.choices);
  useEffect(() => { if (cc.prefsOpen) setPicked(cc.choices); }, [cc.prefsOpen]); // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => b?.categories || [], [b]);
  if (!b) return null;
  return (
    <Dialog open={cc.prefsOpen} onClose={cc.closePrefs} title="Cookie choices" width={560}
      footer={(
        <>
          {cats.length ? <Btn onClick={() => cc.answer('reject_all')}>Reject optional</Btn> : null}
          {cats.length ? <Btn onClick={() => cc.answer('accept_all')}>Accept all</Btn> : null}
          <Btn kind="primary" onClick={() => cc.answer(cats.length ? 'custom' : 'accept_all', picked)}>Save my choices</Btn>
        </>
      )}>
      <div className="ckprefs">
        <p className="ckprefs__lead">Choose which cookies this portal may use. Essential storage keeps the portal working and is always on.</p>
        <div className="ckprefs__row">
          <Toggle checked disabled onChange={() => {}} label={b.essential.label} sub={b.essential.description} />
          <span className="ckprefs__fixed">Always on</span>
        </div>
        {cats.map((c) => (
          <div className="ckprefs__row" key={c.key}>
            <Toggle checked={!!picked[c.key]} onChange={(x) => setPicked((p) => ({ ...p, [c.key]: x }))} label={c.label} sub={c.description} />
          </div>
        ))}
        {!cats.length ? <p className="ckprefs__lead">This portal uses no optional cookies.</p> : null}
      </div>
    </Dialog>
  );
}
