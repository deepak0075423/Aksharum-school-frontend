// School branding helpers — logo URL resolution + browser-tab favicon.

// Uploads are served from the backend ROOT, while VITE_API_URL points at /api.
// Strip the suffix so logos load even when the app is not served from the same
// origin as the backend (dev proxies /uploads, production often does not).
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

// School logo URL helper — handles both storage formats:
// bare filename ("169...png") and path ("/uploads/images/169...png").
export function schoolLogoUrl(school) {
  const logo = school?.logo;
  if (!logo) return null;
  if (/^https?:\/\//.test(logo)) return logo;
  const path = logo.startsWith('/uploads')
    ? logo
    : `/uploads/images/${logo.replace(/^\/+/, '')}`;
  return `${API_BASE}${path}`;
}

// ── Remembered branding ───────────────────────────────────────────────────────
// The sign-in screens render before any user is loaded, so the last school this
// browser signed in to is cached and reused there. It holds nothing private —
// just the school name and its (publicly served) logo path.
const BRANDING_KEY = 'schoolBranding';

export function rememberSchoolBranding(school) {
  try {
    if (school?.name || school?.logo) {
      localStorage.setItem(BRANDING_KEY, JSON.stringify({
        _id:  school._id || null,
        name: school.name || '',
        logo: school.logo || '',
      }));
    }
  } catch { /* storage full or blocked — branding just falls back */ }
}

export function getRememberedBranding() {
  try {
    const raw = localStorage.getItem(BRANDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Icon for browser push notifications — the school's logo when it has one. */
export function notificationIconUrl(school) {
  return schoolLogoUrl(school) || schoolLogoUrl(getRememberedBranding()) || '/favicon.ico';
}

const DEFAULT_ICONS = [
  { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
  { rel: 'icon', href: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
  { rel: 'icon', href: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
  { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
];

function clearIcons() {
  document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')
    .forEach(el => el.remove());
}

function addIcon({ rel, href, type, sizes }) {
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (type)  link.type = type;
  if (sizes) link.sizes = sizes;
  document.head.appendChild(link);
}

/**
 * Point the browser tab at the school's own logo (falls back to the Aksharum
 * icons when the school has none). Everyone signed in to a school — students
 * included — sees their school's branding.
 */
export function applySchoolFavicon(school) {
  // Before sign-in there is no user — fall back to the last school used here so
  // the tab is already branded on the login screen.
  const branding = school || getRememberedBranding();
  const url      = schoolLogoUrl(branding);
  clearIcons();
  if (url) {
    addIcon({ rel: 'icon', href: url });
    addIcon({ rel: 'apple-touch-icon', href: url });
  } else {
    DEFAULT_ICONS.forEach(addIcon);
  }
  // The tab name belongs to the same badge as the icon
  document.title = branding?.name || 'Aksharum';
}
