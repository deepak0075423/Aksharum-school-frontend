import api from './axios';

/**
 * Cookie policies (school-backend controllers/cookiePolicy.controller.js).
 *
 *   school admin   School Settings → Privacy & cookies
 *   app            the signed-in person's school's policy, or the platform's own
 *   portal         a school's admission portal: its banner, page and consent log
 */
export const getCookiePolicy    = ()     => api.get('/admin/cookie-policy');
export const saveCookiePolicy   = (data) => api.put('/admin/cookie-policy', data);
export const resetCookiePolicy  = ()     => api.post('/admin/cookie-policy/reset');
export const getCookieConsents  = (days = 30) => api.get(`/admin/cookie-policy/consents?days=${days}`);
export const cookieConsentsCsvUrl = (days = 365) => `/admin/cookie-policy/consents?days=${days}&format=csv`;

export const myCookiePolicy       = () => api.get('/profile/cookie-policy');
export const platformCookiePolicy = () => api.get('/public/cookie-policy');

const P = (slug) => `/admission/public/portals/${encodeURIComponent(slug)}`;
export const portalCookiePolicy  = (slug) => api.get(`${P(slug)}/cookie-policy`);
export const portalCookieConsent = (slug, data) => api.post(`${P(slug)}/cookie-consent`, data, { meta: { quiet: true } });
