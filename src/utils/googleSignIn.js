/**
 * Google's popup, for "Sign in with Google".
 *
 * Uses Google Identity Services' authorization-code flow in a popup, so the
 * button on the page is our own (drawn to match the sign-in card) rather than
 * Google's iframe. The code it returns is worthless without the client secret,
 * which only the server holds — see auth.controller googleLogin.
 *
 * The script is loaded ahead of the click: a popup opened after an await is
 * no longer "in response to a click" and the browser blocks it.
 */
const SRC = 'https://accounts.google.com/gsi/client';
let loading = null;

export function loadGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SRC;
    tag.async = true;
    tag.defer = true;
    tag.onload  = () => (window.google?.accounts?.oauth2 ? resolve(window.google) : reject(new Error('Google sign-in did not load')));
    tag.onerror = () => { loading = null; reject(new Error('Google sign-in could not be reached')); };
    document.head.appendChild(tag);
  });
  return loading;
}

export const googleReady = () => !!window.google?.accounts?.oauth2;

/**
 * Opens Google's account chooser. Must be called synchronously from a click.
 * Resolves with the authorization code; rejects when the person closes the
 * popup or Google refuses.
 */
export function requestGoogleCode(clientId) {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: clientId,
      scope: 'openid email profile',
      ux_mode: 'popup',
      select_account: true,
      callback: (resp) => (resp?.code
        ? resolve(resp.code)
        : reject(new Error(resp?.error_description || resp?.error || 'Google sign-in was not completed'))),
      error_callback: (err) => {
        const closed = err?.type === 'popup_closed';
        const e = new Error(closed ? 'Google sign-in was closed' : (err?.message || 'Google sign-in failed'));
        e.cancelled = closed;
        reject(e);
      },
    });
    client.requestCode();
  });
}
