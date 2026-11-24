/**
 * No zoom when a field is tapped on an iPhone or iPad (Nov 24 2026).
 *
 * iOS zooms the page in when a text box or dropdown whose text is under 16px
 * gets focus — and never zooms back out when it loses it, so the reader is
 * left on a magnified page to pinch back by hand. Under 480px the app's text
 * is 15px and its fields 13–14px (the filter bars' search boxes most of all),
 * so it happened on every list in the app.
 *
 * Capping the viewport's scale at 1 stops that automatic zoom for every field
 * at once, whatever its size, without making the fields bigger. It costs the
 * reader nothing on iOS: since iOS 10 Safari (and every iOS browser, all
 * WebKit) lets people pinch to zoom whatever the page's cap says. Android
 * browsers do not zoom on focus at all — and Chrome there WOULD honour the cap
 * against the reader's own pinch — so the cap is set on Apple devices only.
 */
export function installNoFocusZoom() {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return;
  // iPadOS asks for the desktop site and says it is a Mac; its touch screen gives it away.
  const apple = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!apple) return;

  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  const parts = String(meta.getAttribute('content') || '')
    .split(',').map((s) => s.trim())
    .filter((s) => s && !/^maximum-scale\s*=/i.test(s));
  meta.setAttribute('content', [...parts, 'maximum-scale=1'].join(', '));
}
