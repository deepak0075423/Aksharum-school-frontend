/**
 * Opening private uploads (Oct 2026).
 *
 * Admission papers, staff papers, leave and attendance attachments and the
 * Documents module's files are no longer public (server services/privateFiles).
 * The server reads who is asking from a 12-hour FILE TOKEN. Signed in, this
 * keeps one in the `aks_ft` cookie, so every <img>, link and frame that points
 * at those folders keeps working without knowing about it. `withFileToken(url)`
 * also puts it on the address, for an API on another site where the cookie
 * would not travel.
 */
import api from '../api/axios';

const COOKIE = 'aks_ft';
export const PRIVATE_UPLOAD = /\/uploads\/(student-docs|staff-docs|leave-docs|attendance-docs|documents)\//i;

let token = '';
let timer = null;
let domain = null;

/**
 * The widest domain this page may set a cookie on — the API usually lives on a
 * sibling host (api.example.com beside app.example.com). Browsers refuse a
 * public suffix such as co.in, so the shortest domain that sticks is used.
 */
function cookieDomain() {
  if (domain !== null) return domain;
  const host = window.location.hostname || '';
  domain = '';
  if (!host || host === 'localhost' || /^[\d.]+$/.test(host) || host.includes(':')) return domain;
  const parts = host.split('.');
  for (let n = 2; n < parts.length; n += 1) {
    const d = parts.slice(-n).join('.');
    document.cookie = `aks_ft_probe=1; Domain=${d}; Path=/; Max-Age=5; SameSite=Lax`;
    if (document.cookie.includes('aks_ft_probe=1')) {
      document.cookie = `aks_ft_probe=; Domain=${d}; Path=/; Max-Age=0; SameSite=Lax`;
      domain = d;
      break;
    }
  }
  return domain;
}

function writeCookie(value, maxAge) {
  const d = cookieDomain();
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${encodeURIComponent(value)}; Path=/${d ? `; Domain=${d}` : ''}; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/** Fetch a token and keep it fresh until stopFileAccess(). */
export async function startFileAccess() {
  clearTimeout(timer);
  try {
    const res = await api.get('/auth/file-token');
    const data = res?.data ?? res;
    if (!data?.token) return;
    token = data.token;
    const life = Number(data.expiresIn) || 12 * 3600;
    writeCookie(token, life);
    // Renewed at two-thirds of its life, so a page left open all day keeps opening files.
    timer = setTimeout(startFileAccess, Math.max(60, life * (2 / 3)) * 1000);
  } catch {
    // Signed out or offline: the next sign-in starts it again.
    timer = setTimeout(startFileAccess, 5 * 60 * 1000);
  }
}

export function stopFileAccess() {
  clearTimeout(timer);
  timer = null;
  token = '';
  writeCookie('', 0);
}

/** The address with the reader's file token on it, when it points at a private folder. */
export function withFileToken(url) {
  if (!url || !token || !PRIVATE_UPLOAD.test(url) || /[?&]ft=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ft=${encodeURIComponent(token)}`;
}
