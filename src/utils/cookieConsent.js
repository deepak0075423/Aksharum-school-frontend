/**
 * A visitor's cookie choices (Oct 2026), kept in this browser.
 *
 * One localStorage entry, `aks_cookie_consent`, holds a random visitor id and
 * one answer per portal: { v: policy version, at, choices }. An answer counts
 * only for the version it was given for and only for as long as the school
 * says a choice is remembered — after that the banner asks again.
 *
 * Optional tags (Google Analytics, Meta Pixel) are loaded only on a portal's
 * public pages, only for a category the visitor allowed. On any other page
 * they are switched off with each vendor's own off switch, so nothing about an
 * applicant's own pages is ever sent.
 */
const KEY = 'aks_cookie_consent';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
}
function writeAll(all) {
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* storage off: the banner asks each visit */ }
}

/** The random id this browser answers banners with — never tied to a person. */
export function visitorId() {
  const all = readAll();
  if (typeof all._visitor === 'string' && /^[A-Za-z0-9-]{16,64}$/.test(all._visitor)) return all._visitor;
  const id = (window.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`).slice(0, 64);
  writeAll({ ...all, _visitor: id });
  return id;
}

export function readConsent(scope) {
  const c = readAll()[`s:${scope}`];
  return c && typeof c === 'object' ? c : null;
}

export function writeConsent(scope, version, choices) {
  const all = readAll();
  all[`s:${scope}`] = { v: version, at: Date.now(), choices };
  writeAll(all);
}

/** Does the stored answer still stand for this banner? */
export function consentStands(consent, banner) {
  if (!consent || !banner) return false;
  if (Number(consent.v) !== Number(banner.version)) return false;
  return Date.now() - Number(consent.at || 0) < (Number(banner.consentDays) || 180) * 86400000;
}

// ── Optional tags ────────────────────────────────────────────────────────────

function addScript(src, id) {
  if (document.getElementById(id)) return;
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  s.id = id;
  document.head.appendChild(s);
}

function loadGa(id) {
  if (window.__aksGa === id) return;
  window.__aksGa = id;
  window.dataLayer = window.dataLayer || [];
  // eslint-disable-next-line prefer-rest-params
  window.gtag = window.gtag || function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { send_page_view: true });
  addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`, 'aks-ga4');
}

function loadPixel(id) {
  if (window.__aksPixel === id) return;
  window.__aksPixel = id;
  if (!window.fbq) {
    const fbq = function fbq(...args) { fbq.callMethod ? fbq.callMethod(...args) : fbq.queue.push(args); };
    fbq.push = fbq; fbq.loaded = true; fbq.version = '2.0'; fbq.queue = [];
    window.fbq = fbq; window._fbq = fbq;
  }
  window.fbq('init', id);
  window.fbq('track', 'PageView');
  addScript('https://connect.facebook.net/en_US/fbevents.js', 'aks-pixel');
}

/**
 * Bring the tags in line with the page: on a public page with consent, load
 * (or switch back on) what was allowed; anywhere else, switch them off.
 */
export function applyTags(tags, choices, { publicPage }) {
  const ga = tags?.ga4 || '';
  const px = tags?.metaPixel || '';
  const gaOn = !!(publicPage && ga && choices?.analytics);
  const pxOn = !!(publicPage && px && choices?.marketing);
  if (ga) window[`ga-disable-${ga}`] = !gaOn;
  if (window.__aksGa && window.__aksGa !== ga) window[`ga-disable-${window.__aksGa}`] = true;
  if (gaOn) loadGa(ga);
  if (window.fbq) window.fbq('consent', pxOn ? 'grant' : 'revoke');
  if (pxOn) loadPixel(px);
}

/** Withdrawn consent: expire what the tags left behind, on every domain they could have used. */
export function clearTagCookies() {
  const names = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^(_ga|_ga_.+|_gid|_fbp|_fbc)$/.test(n));
  const host = window.location.hostname;
  const parts = host.split('.');
  const domains = ['', ...parts.map((_, i) => parts.slice(i).join('.')).filter((d) => d.includes('.'))];
  for (const n of names) {
    for (const d of domains) document.cookie = `${n}=; Path=/; Max-Age=0${d ? `; Domain=${d}` : ''}`;
  }
}
