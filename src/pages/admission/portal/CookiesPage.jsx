/**
 * /<slug>/cookies — the school's cookie policy on its admission portal, with
 * this browser's choices beside each category and a way to change them.
 */
import React from 'react';
import { portalCookiePolicy } from '../../../api/privacy.api';
import CookiePolicyView from '../../../components/privacy/CookiePolicyView';
import { useLoad, Spin, ErrorBox } from '../admUI';
import { usePortal } from './PortalShell';

export default function CookiesPage() {
  const portal = usePortal();
  const { data, loading, error, reload } = useLoad(() => portalCookiePolicy(portal.slug), [portal.slug]);
  if (loading && !data) return <Spin label="Opening the cookie policy…" />;
  if (error) return <ErrorBox error={error} onRetry={reload} />;
  const cc = portal.cookies;
  return (
    <CookiePolicyView
      page={data.page}
      choices={cc?.choices}
      onChoose={cc ? cc.openPrefs : undefined}
    />
  );
}
