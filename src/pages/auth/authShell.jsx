/**
 * The signed-out screens' frame — sign in, and every step of setting a password.
 *
 * Two faces, from the same parts:
 *   welcome  the sign-in page: a deep indigo panel that says what the platform is
 *   secure   the password pages: a pale panel about keeping the account safe
 * Beside either, a soft field with the card in it. Below 900px the panel is
 * dropped and the card has the screen; the password pages then carry the brand
 * row above the card, since their card has no brand of its own.
 *
 * No user is loaded on these screens, so the brand is the last school this
 * browser signed in to (see utils/branding), falling back to Aksharum.
 *
 * Fonts are bundled (@fontsource), not fetched from Google at runtime, and only
 * these screens import them.
 */
import React, { useLayoutEffect, useRef } from 'react';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/sacramento/400.css';
import logoMark from '../../assets/logo-icon.svg';
import Icon from '../../components/ui/icons';
import { schoolLogoUrl, getRememberedBranding } from '../../utils/branding';

// ── Brand ────────────────────────────────────────────────────────────────────
export function Brand({ layout = 'row', className = '' }) {
  const school = getRememberedBranding();
  const logo   = schoolLogoUrl(school);
  const name   = school?.name || 'Aksharum';
  return (
    <div className={`au-brand au-brand--${layout} ${className}`.trim()}>
      <img className={`au-brand__mark${logo ? ' is-school' : ''}`} src={logo || logoMark} alt="" />
      <div className="au-brand__text">
        <strong>{name}</strong>
        <span>School ERP</span>
      </div>
    </div>
  );
}

// ── Pieces of a card ─────────────────────────────────────────────────────────
/** Label + input with an icon inside its leading edge. `children` is the input. */
export const Field = ({ id, label, icon, required, children, after }) => (
  <div className="au-field">
    <label className={`au-label${required ? ' required' : ''}`} htmlFor={id}>{label}</label>
    <div className={`au-input${icon ? ' has-icon' : ''}`}>
      {icon && <Icon name={icon} size={19} className="au-input__icon" />}
      {children}
    </div>
    {after}
  </div>
);

/** The round badge that heads a password card. */
export const Badge = ({ icon }) => (
  <span className="au-badge" aria-hidden="true"><Icon name={icon} size={32} strokeWidth={1.9} /></span>
);

export const Note = ({ children }) => (
  <div className="au-note" role="note">
    <span className="au-note__icon" aria-hidden="true">i</span>
    <p>{children}</p>
  </div>
);

/** Google's own mark, in its own colours — the brand guidelines ask for it unaltered. */
export const GoogleMark = () => (
  <svg className="au-google" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);

// ── The script line at the foot of a panel ───────────────────────────────────
const Script = ({ lines }) => (
  <div className="au-script" aria-hidden="true">
    {lines.map((l, i) => <span key={i} style={{ paddingLeft: `${i * 0.9}em` }}>{l}</span>)}
    <svg viewBox="0 0 200 30" fill="none">
      <path d="M8 26C60 14 120 8 196 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
);

// ── Panels ───────────────────────────────────────────────────────────────────
const WELCOME_POINTS = [
  // Lines as the mockup breaks them; each still wraps on its own if a narrow panel needs it.
  { icon: 'users',   title: 'Simplify Administration', text: ['Manage academics, attendance,', 'exams and more — all in one place.'] },
  { icon: 'barsUp',  title: 'Empower Educators',       text: ['Tools to engage, assess and', 'support every learner.'] },
  { icon: 'gradCap', title: 'Enable Student Success',  text: ['A better learning experience', 'for a brighter future.'] },
];

const SECURE_POINTS = [
  { icon: 'lock',   title: 'Protect your account', text: 'Keep your data private' },
  { icon: 'users',  title: 'Ensure secure access', text: 'For a safer school community' },
  { icon: 'shield', title: 'Follow best practices', text: 'Use a strong, unique password' },
];

const Points = ({ items }) => (
  <ul className="au-points">
    {items.map((p) => (
      <li key={p.title}>
        <span className="au-points__icon" aria-hidden="true"><Icon name={p.icon} size={26} strokeWidth={2} /></span>
        <span>
          <strong>{p.title}</strong>
          <small>{[].concat(p.text).map((line, i) => <span key={i}>{line} </span>)}</small>
        </span>
      </li>
    ))}
  </ul>
);

const PANELS = {
  welcome: {
    script: ['Education', 'Builds Brighter', 'Futures'],
    // A function: built when rendered, after LockArt (defined below) exists.
    body: () => (
      <>
        <h1 className="au-hero"><span>Learning</span> <span>Today, A Brighter</span> <span>Tomorrow</span></h1>
        <p className="au-lede"><span>A unified platform for students,</span> <span>teachers and administrators.</span></p>
        <Points items={WELCOME_POINTS} />
      </>
    ),
  },
  secure: {
    script: ['Better Education', 'Brighter Futures'],
    // A function: built when rendered, after LockArt (defined below) exists.
    body: () => (
      <>
        <h1 className="au-hero"><span>Welcome to a</span> <span>safer learning space</span></h1>
        <p className="au-lede"><span>A strong password keeps your account</span> <span>and students’ data secure.</span></p>
        <LockArt />
        <Points items={SECURE_POINTS} />
      </>
    ),
  },
};

/** A padlock on two browser windows, with a password pill ticked off. Ornament only. */
const LockArt = () => (
  <svg className="au-art" viewBox="0 0 400 260" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="au-lock" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9d8cfb" />
        <stop offset="1" stopColor="#6b56ec" />
      </linearGradient>
      <linearGradient id="au-shackle" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#8f7ef8" />
        <stop offset="1" stopColor="#6450e6" />
      </linearGradient>
      <filter id="au-soft" x="-20%" y="-20%" width="140%" height="150%">
        <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="#5b4bd6" floodOpacity=".16" />
      </filter>
    </defs>

    {/* the halo behind it all */}
    <ellipse cx="190" cy="140" rx="150" ry="112" fill="#e8e3fc" />
    <ellipse cx="190" cy="140" rx="118" ry="88" fill="#ded7fb" opacity=".55" />

    {/* motion strokes and specks */}
    <circle cx="32" cy="72" r="7" fill="#a79bf5" />
    <path d="M8 118h30M14 128h26M20 138h18" stroke="#c7bff7" strokeWidth="3" strokeLinecap="round" />
    <path d="M312 232l14-5M318 242l20-7" stroke="#c7bff7" strokeWidth="3" strokeLinecap="round" />
    <circle cx="352" cy="214" r="5" fill="none" stroke="#b8adf6" strokeWidth="2.5" />

    {/* back window */}
    <g filter="url(#au-soft)">
      <rect x="92" y="28" width="196" height="176" rx="16" fill="#f5f3ff" stroke="#e2dcfb" strokeWidth="2" />
      <circle cx="114" cy="48" r="4.5" fill="#a99df3" />
      <circle cx="130" cy="48" r="4.5" fill="#a99df3" />
      <circle cx="146" cy="48" r="4.5" fill="#a99df3" />
    </g>
    {/* front window */}
    <g filter="url(#au-soft)">
      <rect x="118" y="62" width="196" height="178" rx="16" fill="#ffffff" stroke="#e6e1fc" strokeWidth="2" />
      <rect x="104" y="96" width="14" height="118" rx="7" fill="#ece8fd" />
    </g>

    {/* the padlock */}
    <path d="M186 132v-22a30 30 0 0 1 60 0v22" fill="none" stroke="url(#au-shackle)" strokeWidth="15" strokeLinecap="round" />
    <g filter="url(#au-soft)">
      <rect x="166" y="126" width="100" height="84" rx="18" fill="url(#au-lock)" />
    </g>
    <circle cx="216" cy="160" r="11" fill="#4a37c7" />
    <rect x="211" y="164" width="10" height="24" rx="5" fill="#4a37c7" />

    {/* password pill */}
    <g filter="url(#au-soft)">
      <rect x="262" y="144" width="126" height="46" rx="14" fill="#ffffff" stroke="#ebe7fd" strokeWidth="1.5" />
    </g>
    {[282, 300, 318, 336].map((x) => <circle key={x} cx={x} cy="167" r="5" fill="#6650e8" />)}
    <circle cx="364" cy="167" r="11" fill="#22c55e" />
    <path d="m358.5 167.5 4 4 7.5-8" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// ── Fitting the window ───────────────────────────────────────────────────────
/**
 * Scales an element down (CSS `zoom`, which moves layout with it) until it fits
 * the height its parent gives it, so the page never scrolls. The design is
 * drawn at 1440×938; a 1366×768 laptop or a 1080p screen at 125% has a window
 * 650–730px tall, and the card and the panel are shrunk as a whole rather than
 * reflowed into something the mockup is not.
 *
 * Never below `min` — past that the text would be too small, and the card's own
 * column scrolls instead (the page still does not). Off on phones, where the
 * page scrolls normally: shrinking an input's text there makes iOS zoom the
 * whole page in when it is tapped.
 */
const DESKTOP = '(min-width: 901px)';

function useFitZoom(ref, min) {
  useLayoutEffect(() => {
    const el = ref.current;
    const box = el?.parentElement;
    if (!el || !box) return undefined;

    const fit = () => {
      if (!window.matchMedia(DESKTOP).matches) { el.style.zoom = ''; return; }
      const was = el.style.zoom;
      el.style.zoom = '1';                                  // measure at full size
      const cs    = getComputedStyle(box);
      const avail = box.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const need  = el.offsetHeight;
      const z     = need > 0 ? Math.max(min, Math.min(1, avail / need)) : 1;
      // Exact: rounding up to full size "because it is close" leaves a 2px scroll.
      const next  = z >= 0.999 ? '' : String(Math.floor(z * 1000) / 1000);
      el.style.zoom = next;
      return was !== next;
    };

    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(fit); };
    fit();
    // The window, and the content: the Google button arrives after its config
    // request, and web fonts change every line's height once they load.
    const ro = new ResizeObserver(schedule);
    ro.observe(box);
    ro.observe(el);
    document.fonts?.ready?.then(schedule);
    return () => { ro.disconnect(); cancelAnimationFrame(frame); };
  }, [ref, min]);
}

/**
 * Lays the panel out at the mockup's size and scales it, as one piece, to the
 * panel's real size — so on a short screen it is the mockup made smaller, not
 * a squeezed rearrangement of it. Pure arithmetic from the panel's box; nothing
 * inside is measured, so there is no loop. The scale never goes above 1.
 */
const STAGE = { welcome: [626, 938], secure: [518, 938] };

function useStage(asideRef, stageRef, variant) {
  useLayoutEffect(() => {
    const aside = asideRef.current;
    const stage = stageRef.current;
    if (!aside || !stage) return undefined;
    const [dw, dh] = STAGE[variant] || STAGE.welcome;
    const place = () => {
      const w = aside.clientWidth;
      const h = aside.clientHeight;
      if (!w || !h) return;                       // hidden on phones
      const z = Math.min(1, w / dw, h / dh);
      stage.style.width     = `${w / z}px`;
      stage.style.height    = `${h / z}px`;
      stage.style.transform = z < 1 ? `scale(${z})` : '';
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(aside);
    return () => ro.disconnect();
  }, [asideRef, stageRef, variant]);
}

// ── The frame ────────────────────────────────────────────────────────────────
export default function AuthShell({ variant = 'welcome', children }) {
  const panel    = PANELS[variant] || PANELS.welcome;
  const asideRef = useRef(null);
  const stageRef = useRef(null);
  const cardRef  = useRef(null);
  useStage(asideRef, stageRef, variant);
  useFitZoom(cardRef, 0.7);

  return (
    <div className={`au au--${variant}`}>
      <aside className="au-aside" ref={asideRef}>
        <div className="au-aside__stage" ref={stageRef}>
          <Brand />
          <div className="au-aside__body">{panel.body()}</div>
          <Script lines={panel.script} />
        </div>
      </aside>

      <main className="au-main">
        {/* The shapes sit in their own clipped layer: as children of a column
            that may scroll, their overhang would itself be scrollable. */}
        <div className="au-main__deco" aria-hidden="true">
          <span className="au-main__shape au-main__shape--a" />
          <span className="au-main__shape au-main__shape--b" />
        </div>
        {/* The password cards have no brand of their own; on a phone, where the
            panel is gone, it sits above the card instead. */}
        {variant === 'secure' && <Brand className="au-brand--phone" />}
        <section className="au-card" ref={cardRef}>{children}</section>
      </main>
    </div>
  );
}
