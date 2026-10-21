/**
 * The "not a robot" check on the portal's public forms (Oct 2026) — Cloudflare
 * Turnstile or hCaptcha, as the server is set up (school-backend services/
 * admission/captcha.js). The widget's answer goes with the form as
 * `captchaToken`; the server checks it with the provider. Without a provider
 * this draws nothing and the forms work as before.
 *
 * Change `resetKey` after a refused submit: an answer can be used only once.
 */
import React, { useEffect, useRef, useState } from 'react';

const SCRIPTS = {
  turnstile: { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', global: 'turnstile' },
  hcaptcha: { src: 'https://js.hcaptcha.com/1/api.js?render=explicit', global: 'hcaptcha' },
};
const loading = {};

function load(provider) {
  const s = SCRIPTS[provider];
  if (!s) return Promise.reject(new Error('Unknown check'));
  if (window[s.global]) return Promise.resolve(window[s.global]);
  if (!loading[provider]) {
    loading[provider] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = s.src;
      el.async = true;
      el.onload = () => (window[s.global] ? resolve(window[s.global]) : reject(new Error('The check did not load')));
      el.onerror = () => { delete loading[provider]; reject(new Error('The check could not be loaded — check your connection')); };
      document.head.appendChild(el);
    });
  }
  return loading[provider];
}

export default function Captcha({ config, onToken, resetKey = 0 }) {
  const box = useRef(null);
  const widget = useRef(null);
  const [problem, setProblem] = useState('');
  useEffect(() => {
    if (!config?.provider || !config?.siteKey) return undefined;
    let alive = true;
    onToken('');
    load(config.provider).then((api) => {
      if (!alive || !box.current) return;
      box.current.innerHTML = '';
      widget.current = api.render(box.current, {
        sitekey: config.siteKey,
        callback: (t) => onToken(t),
        'expired-callback': () => onToken(''),
        'error-callback': () => { onToken(''); setProblem('The check could not be completed — try again.'); },
      });
    }).catch((e) => setProblem(e.message));
    return () => {
      alive = false;
      const api = window[SCRIPTS[config.provider]?.global];
      try { if (api && widget.current != null) api.remove(widget.current); } catch { /* already gone */ }
      widget.current = null;
    };
  }, [config?.provider, config?.siteKey, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!config?.provider) return null;
  return (
    <div className="adm-captcha">
      <div ref={box} />
      {problem ? <div className="adm-field__error" role="alert">{problem}</div> : null}
    </div>
  );
}

/**
 * The check as a form uses it: `widget` to draw, `ready` before submitting,
 * `body` to send along, and `reset()` after each try (an answer works once).
 */
export function useHumanCheck(config) {
  const [token, setToken] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const on = !!config?.provider;
  return {
    on,
    ready: !on || !!token,
    body: token ? { captchaToken: token } : {},
    reset: () => { setToken(''); setResetKey((k) => k + 1); },
    widget: on ? <Captcha config={config} onToken={setToken} resetKey={resetKey} /> : null,
  };
}
