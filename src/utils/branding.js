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
  const url = schoolLogoUrl(school);
  clearIcons();
  if (url) {
    addIcon({ rel: 'icon', href: url });
    addIcon({ rel: 'apple-touch-icon', href: url });
  } else {
    DEFAULT_ICONS.forEach(addIcon);
  }
}
