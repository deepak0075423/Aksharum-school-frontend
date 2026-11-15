/**
 * Opening private uploads (Oct 2026).
 *
 * Admission papers, staff papers, leave and attendance attachments and the
 * Documents module's files are no longer public (server services/privateFiles).
 * The server reads who is asking from a 12-hour FILE TOKEN. Signed in, this
 * keeps one in the `aks_ft` cookie, so every <img>, link and frame that points
 * at those folders keeps working without knowing about it.
 *
 * The token used to be written onto every file address as well (`?ft=…`), so
 * a link copied out of the app — or sitting in the browser's history — opened
 * files as that person for up to twelve hours. It stays off the address now
 * wherever the cookie reaches the API by itself, which is every deployment
 * where the app and the API share a site (app.example.com and api.example.com,
 * or two ports of one machine). `withFileToken(url)` only falls back to the
 * address when the API is on an unrelated site, or the browser keeps no
 * cookies. Code that fetches a file's bytes uses `fetchFile(url)`, which sends
 * the token as a header instead.
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

/**
 * Will the cookie reach the host this address is on? It does when the address
 * is on this page's own host, or on a host under the domain the cookie was set
 * for — and only if the browser actually kept the cookie.
 */
function cookieReaches(url) {
  if (!document.cookie.split(';').some((c) => c.trim().startsWith(`${COOKIE}=`))) return false;
  let host;
  try { host = new URL(url, window.location.href).hostname; } catch { return false; }
  if (host === window.location.hostname) return true;
  const d = cookieDomain();
  return !!d && (host === d || host.endsWith(`.${d}`));
}

/**
 * The address a private file is opened at. Unchanged wherever the cookie
 * travels with the request; with the reader's file token on it only when
 * nothing else would carry it.
 */
export function withFileToken(url) {
  if (!url || !token || !PRIVATE_UPLOAD.test(url) || /[?&]ft=/.test(url)) return url;
  if (cookieReaches(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}ft=${encodeURIComponent(token)}`;
}

/**
 * Fetch a private file's bytes — for showing a PDF in place, or saving a set
 * of files. The token goes in a header (a script's request to another origin
 * does not carry the cookie), never on the address.
 */
export function fetchFile(url, init = {}) {
  const clean = String(url || '').replace(/([?&])ft=[^&]*(&|$)/, (_, a, b) => (b ? a : '')).replace(/[?&]$/, '');
  const headers = { ...(init.headers || {}) };
  if (token && PRIVATE_UPLOAD.test(clean)) headers.Authorization = `Bearer ${token}`;
  return fetch(clean, { ...init, headers });
}
