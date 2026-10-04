/**
 * One face of an ID card, drawn the way the PDF prints it (Oct 2026).
 *
 * Laid out in container units: the face is a size container and 1cqw is one
 * hundredth of its width — the "u" of school-backend utils/idCardPdf.js, which
 * uses the same positions and the same pattern maths. So a card is the same
 * card in a 90px list thumbnail, a 340px 3D viewer and on paper.
 *
 *   card   { kind, number, snapshot, design, status, reissueNo, reissueReason,
 *            validUntil, issuedAt, qrSvg }
 *   side   'front' | 'back'
 *
 * Text that may be long (the school's name, the holder's) shrinks to fit
 * before it is cut, exactly as the PDF does.
 */
import React, { useId, useLayoutEffect, useMemo, useRef } from 'react';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import { STAMP, fileUrl, fmtDay, fmtDate, initials, subLine } from './icMeta';

/* ── Colour and pattern — the same maths as the PDF ───────────────────────── */

export function shade(hex, amount) {
  const n = parseInt(String(hex || '#1b2a5e').slice(1), 16);
  const mix = (c) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const r = mix((n >> 16) & 255); const g = mix((n >> 8) & 255); const b = mix(n & 255);
  return `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')}`;
}

/** The fine guilloche (or broad wave) lines every card is printed with, as SVG paths in u. */
function patternPaths(kind, x, y, w, h) {
  if (kind === 'plain') return [];
  const rows = kind === 'waves' ? 5 : 14;
  const amp = kind === 'waves' ? h / 9 : h / 7;
  const out = [];
  for (let i = 0; i < rows; i += 1) {
    const base = y + (h * (i + 0.5)) / rows;
    const phase = (i % 2 ? 0.5 : 0) * (w / 3);
    let d = `M${(x - w / 3 + phase).toFixed(2)} ${base.toFixed(2)}`;
    for (let k = -1; k < 4; k += 1) {
      const sx = x + k * (w / 3) + phase;
      d += ` C${(sx + w / 12).toFixed(2)} ${(base - amp).toFixed(2)} ${(sx + w / 4).toFixed(2)} ${(base + amp).toFixed(2)} ${(sx + w / 3).toFixed(2)} ${base.toFixed(2)}`;
    }
    out.push(d);
  }
  return out;
}

function Pattern({ kind, x, y, w, h, color, opacity, u = 1 }) {
  const paths = useMemo(() => patternPaths(kind, x, y, w, h), [kind, x, y, w, h]);
  if (!paths.length) return null;
  return (
    <g fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={(kind === 'waves' ? 0.6 : 0.16) * u}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </g>
  );
}

/* ── Text that fits ───────────────────────────────────────────────────────── */

/**
 * Shrink an element's font (in cqw) from `max` towards `min` until its text
 * fits its box — one line, or `lines` lines when it is line-clamped. Run again
 * once the web font has arrived, since its widths are not the fallback's.
 */
function useFit(ref, deps, { max, min, lines = 1 }) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      let size = max;
      el.style.fontSize = `${size}cqw`;
      const over = () => (lines > 1 ? el.scrollHeight > el.clientHeight + 1 : el.scrollWidth > el.clientWidth + 1);
      let guard = 0;
      while (over() && size > min && guard < 60) {
        size = Math.max(min, +(size - 0.1).toFixed(2));
        el.style.fontSize = `${size}cqw`;
        guard += 1;
      }
    };
    fit();
    let alive = true;
    document.fonts?.ready?.then(() => { if (alive) fit(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

function Fit({ as: As = 'div', className, max, min, lines = 1, children, style }) {
  const ref = useRef(null);
  useFit(ref, [children, max, min, lines], { max, min, lines });
  return <As ref={ref} className={className} style={style}>{children}</As>;
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */

function Photo({ card, look, landscape }) {
  const s = card.snapshot || {};
  const circle = look.photoShape === 'circle';
  const url = fileUrl(s.photo);
  return (
    <div className={`idc-photo${circle ? ' idc-photo--circle' : ''}${landscape ? ' idc-photo--l' : ''}`}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="idc-photo__none">{initials(s.name)}</span>}
    </div>
  );
}

function Logo({ look }) {
  const url = look.showLogo && look.identity?.logo ? fileUrl(look.identity.logo) : '';
  if (!url) return null;
  return <div className="idc-logo"><img src={url} alt="" draggable={false} /></div>;
}

const qrSrc = (svg) => (svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : '');

function Qr({ svg, className }) {
  const src = qrSrc(svg);
  return (
    <div className={`idc-qr ${className || ''}`}>
      {src ? <img src={src} alt="QR code to verify this card" draggable={false} /> : <span className="idc-qr__none" />}
    </div>
  );
}

/** [label, value, wide] — what the front's grid prints, in the template's order. */
function frontFields(card, look) {
  const s = card.snapshot || {};
  const on = (k) => look.fields?.[k] === true;
  const out = [];
  const add = (k, label, value, wide) => { if (on(k) && value) out.push([label, value, !!wide]); };
  if (card.kind === 'student') {
    add('admissionNo', 'Admission No.', s.holderCode);
    add('rollNo', 'Roll No.', s.rollNumber);
    add('dob', 'Date of Birth', fmtDay(s.dob));
    add('bloodGroup', 'Blood Group', s.bloodGroup);
  } else if (card.kind === 'parent') {
    add('parentId', 'Parent ID', s.holderCode);
    add('phone', 'Phone', s.phone);
    add('children', 'Parent of', (s.children || []).map((c) => c.name).join(', '), true);
  } else {
    add('employeeId', 'Employee ID', s.holderCode);
    add('department', 'Department', s.department);
    add('bloodGroup', 'Blood Group', s.bloodGroup);
    add('dob', 'Date of Birth', fmtDay(s.dob));
    add('joiningDate', 'Joined', fmtDay(s.joiningDate));
  }
  return out;
}

function backFields(card, look) {
  const s = card.snapshot || {};
  const on = (k) => look.fields?.[k] === true;
  const out = [];
  if (card.kind === 'student') {
    if (on('parentName') && s.parentName) out.push(["Parent's Name", s.parentName]);
    if (on('emergencyPhone') && s.emergencyPhone) out.push(['Emergency Contact', s.emergencyPhone]);
    if (on('address') && s.address) out.push(['Home Address', s.address, true]);
  } else if (card.kind !== 'parent') {
    if (on('phone') && s.phone) out.push(['Phone', s.phone]);
    if (on('emergencyPhone') && s.emergencyPhone) out.push(['Emergency Contact', s.emergencyPhone]);
  }
  return out;
}

const KIND_TITLE = { student: 'Student', teacher: 'Teacher', staff: 'Staff', parent: 'Parent' };

function Stripe({ card, back }) {
  const dup = Number(card.reissueNo) > 0 && ['lost', 'damaged'].includes(card.reissueReason);
  return (
    <div className={`idc-stripe${back ? ' idc-stripe--back' : ''}`}>
      {back ? null : <span className="idc-stripe__role">{KIND_TITLE[card.kind]}</span>}
      {!back && dup ? <span className="idc-stripe__dup">{card.reissueNo > 1 ? `Duplicate ${card.reissueNo}` : 'Duplicate'}</span> : null}
    </div>
  );
}

function FooterLeft({ card, look }) {
  const s = card.snapshot || {};
  if (card.kind === 'student' && s.yearName) {
    const till = card.validUntil || (s.yearEnd ? `${s.yearEnd}T00:00:00Z` : null);
    return (
      <div className="idc-foot">
        <span className="idc-chip">{s.yearName}</span>
        {look.showValidity && till ? <span className="idc-valid">Valid till {fmtDay(till)}</span> : null}
      </div>
    );
  }
  return (
    <div className="idc-foot idc-foot--no">
      <span className="idc-foot__label">Card No.</span>
      <span className="idc-foot__no">{card.number || 'ST0000-00000'}</span>
      {look.showValidity ? <span className="idc-valid">Issued {fmtDate(card.issuedAt || new Date())}</span> : null}
    </div>
  );
}

function Signature({ look }) {
  if (!look.showSignature) return null;
  const url = look.signatory?.signature ? fileUrl(look.signatory.signature) : '';
  return (
    <div className="idc-sign">
      <div className="idc-sign__img">{url ? <img src={url} alt="" draggable={false} /> : null}</div>
      <div className="idc-sign__line" />
      <div className="idc-sign__who">{look.signatory?.title || 'Principal'}</div>
    </div>
  );
}

function Stamp({ status }) {
  const word = STAMP[status];
  if (!word) return null;
  return <div className="idc-stamp" aria-label={`This card is ${word.toLowerCase()}`}><span>{word}</span></div>;
}

/* ── Faces ────────────────────────────────────────────────────────────────── */

function FrontPortrait({ card, look }) {
  const s = card.snapshot || {};
  const fields = frontFields(card, look);
  const qrFront = look.qrOn === 'front';
  const hasLogo = look.showLogo && !!look.identity?.logo;
  const circle = look.photoShape === 'circle';
  const headPath = 'M0 0 H100 V38 Q50 48 0 38 Z';
  const id = `h${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <>
      <svg className="idc-art" viewBox="0 0 100 158.52" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shade(look.primary, 0.08)} />
            <stop offset="1" stopColor={shade(look.primary, -0.18)} />
          </linearGradient>
          <clipPath id={`${id}c`}><path d={headPath} /></clipPath>
        </defs>
        <Pattern kind={look.pattern} x={0} y={46} w={100} h={100} color={look.primary} opacity={0.05} />
        <path d={headPath} fill={`url(#${id}g)`} />
        <g clipPath={`url(#${id}c)`}><Pattern kind={look.pattern} x={0} y={0} w={100} h={44} color="#ffffff" opacity={0.1} /></g>
        <path d="M0 38.6 Q50 48.6 100 38.6" fill="none" stroke={look.accent} strokeWidth="0.9" />
      </svg>
      <Logo look={look} />
      <div className={`idc-school${hasLogo ? '' : ' idc-school--nologo'}`}>
        <Fit className="idc-school__name" max={4.3} min={3.2} lines={2}>{look.identity?.name || 'School name'}</Fit>
        {look.identity?.tagline ? <div className="idc-school__tag">{look.identity.tagline}</div> : null}
      </div>
      <Photo card={card} look={look} />
      <div className={`idc-who${circle ? ' idc-who--circle' : ''}`}>
        <Fit className="idc-name" max={5.3} min={3.6}>{s.name || 'Full name'}</Fit>
        <div className="idc-sub">{subLine(card)}</div>
        <div className={`idc-gridwrap${qrFront ? ' has-qr' : ''}`}>
          <dl className={`idc-grid${qrFront ? ' idc-grid--one' : ''}`}>
            {fields.map(([label, value, wide]) => (
              <div key={label} className={`idc-cell${wide ? ' idc-cell--wide' : ''}`}>
                <dt>{label}</dt><dd>{value}</dd>
              </div>
            ))}
          </dl>
          {qrFront ? <Qr svg={card.qrSvg} className="idc-qr--front" /> : null}
        </div>
      </div>
      <FooterLeft card={card} look={look} />
      <Signature look={look} />
      <Stripe card={card} />
    </>
  );
}

function ReturnBlock({ look, left }) {
  const id = look.identity || {};
  const contact = [id.phone, id.email || id.website].filter(Boolean).join('  ·  ');
  return (
    <div className={`idc-return${left ? ' idc-return--left' : ''}`}>
      {look.showReturnAddress ? <div className="idc-return__ask">If found, please return to</div> : null}
      <div className="idc-return__name">{id.name}</div>
      {id.address ? <div className="idc-return__addr">{id.address}</div> : null}
      {contact ? <div className="idc-return__contact">{contact}</div> : null}
    </div>
  );
}

function BackPortrait({ card, look }) {
  const extras = backFields(card, look);
  const qrBack = look.qrOn !== 'front';
  const id = `b${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <>
      <svg className="idc-art" viewBox="0 0 100 158.52" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shade(look.primary, 0.08)} />
            <stop offset="1" stopColor={shade(look.primary, -0.18)} />
          </linearGradient>
          <clipPath id={`${id}c`}><rect width="100" height="20" /></clipPath>
        </defs>
        <rect width="100" height="20" fill={`url(#${id}g)`} />
        <g clipPath={`url(#${id}c)`}><Pattern kind={look.pattern} x={0} y={0} w={100} h={20} color="#ffffff" opacity={0.1} /></g>
        <rect y="20" width="100" height="0.8" fill={look.accent} />
        <Pattern kind={look.pattern} x={0} y={22} w={100} h={120} color={look.primary} opacity={0.035} />
        <rect y="154.5" width="100" height="4.02" fill={look.accent} />
      </svg>
      <Fit className="idc-backname" max={3.1} min={2.2}>{look.identity?.name || 'School name'}</Fit>
      <div className={`idc-backbody${qrBack ? '' : ' idc-backbody--noqr'}`}>
        {qrBack ? (
          <>
            <Qr svg={card.qrSvg} className="idc-qr--back" />
            <div className="idc-scan">Scan to verify this card</div>
            <div className="idc-number">{card.number || 'ST0000-00000'}</div>
          </>
        ) : (
          <>
            <div className="idc-foot__label idc-foot__label--c">Card No.</div>
            <div className="idc-number idc-number--big">{card.number || 'ST0000-00000'}</div>
          </>
        )}
        {extras.length ? (
          <dl className="idc-extras">
            {extras.map(([label, value, wide]) => (
              <div key={label} className={`idc-cell${wide ? ' idc-cell--two' : ''}`}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        ) : null}
        {extras.length ? <hr className="idc-rule" /> : null}
        <ReturnBlock look={look} />
        {look.backNote ? <p className="idc-note">{look.backNote}</p> : null}
      </div>
    </>
  );
}

function FrontLandscape({ card, look }) {
  const s = card.snapshot || {};
  const fields = frontFields(card, look);
  const qrFront = look.qrOn === 'front';
  const hasLogo = look.showLogo && !!look.identity?.logo;
  const id = `l${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <>
      <svg className="idc-art" viewBox="0 0 100 63.06" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shade(look.primary, 0.08)} />
            <stop offset="1" stopColor={shade(look.primary, -0.18)} />
          </linearGradient>
          <clipPath id={`${id}c`}><rect width="100" height="18" /></clipPath>
        </defs>
        <Pattern kind={look.pattern} x={0} y={19} w={100} h={38} color={look.primary} opacity={0.05} />
        <rect width="100" height="18" fill={`url(#${id}g)`} />
        <g clipPath={`url(#${id}c)`}><Pattern kind={look.pattern} x={0} y={0} w={100} h={18} color="#ffffff" opacity={0.1} /></g>
        <rect y="18" width="100" height="0.7" fill={look.accent} />
      </svg>
      <Logo look={look} />
      <div className={`idc-school idc-school--l${hasLogo ? '' : ' idc-school--nologo'}`}>
        <Fit className="idc-school__name" max={3.5} min={2.5} lines={2}>{look.identity?.name || 'School name'}</Fit>
        {look.identity?.tagline ? <div className="idc-school__tag">{look.identity.tagline}</div> : null}
      </div>
      <Photo card={card} look={look} landscape />
      <div className="idc-who idc-who--l">
        <Fit className="idc-name" max={4.3} min={3.0}>{s.name || 'Full name'}</Fit>
        <div className="idc-sub">{subLine(card)}</div>
        <div className={`idc-gridwrap${qrFront ? ' has-qr' : ''}`}>
          <dl className={`idc-grid${qrFront ? ' idc-grid--one' : ''}`}>
            {fields.slice(0, qrFront ? 3 : 5).map(([label, value, wide]) => (
              <div key={label} className={`idc-cell${wide ? ' idc-cell--wide' : ''}`}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
          {qrFront ? <Qr svg={card.qrSvg} className="idc-qr--front" /> : null}
        </div>
      </div>
      <div className={`idc-under${look.photoShape === 'circle' ? ' idc-under--circle' : ''}`}><FooterLeft card={card} look={look} /></div>
      {qrFront ? null : <Signature look={look} />}
      <Stripe card={card} />
    </>
  );
}

function BackLandscape({ card, look }) {
  const extras = backFields(card, look);
  const qrBack = look.qrOn !== 'front';
  const id = `m${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <>
      <svg className="idc-art" viewBox="0 0 100 63.06" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={shade(look.primary, 0.08)} />
            <stop offset="1" stopColor={shade(look.primary, -0.18)} />
          </linearGradient>
          <clipPath id={`${id}c`}><rect width="100" height="12" /></clipPath>
        </defs>
        <rect width="100" height="12" fill={`url(#${id}g)`} />
        <g clipPath={`url(#${id}c)`}><Pattern kind={look.pattern} x={0} y={0} w={100} h={12} color="#ffffff" opacity={0.1} /></g>
        <rect y="12" width="100" height="0.6" fill={look.accent} />
        <Pattern kind={look.pattern} x={0} y={13} w={100} h={45} color={look.primary} opacity={0.035} />
        <rect y="60.06" width="100" height="3" fill={look.accent} />
      </svg>
      <Fit className="idc-backname idc-backname--l" max={2.7} min={2.0}>{look.identity?.name || 'School name'}</Fit>
      {qrBack ? (
        <div className="idc-lqr">
          <Qr svg={card.qrSvg} className="idc-qr--lback" />
          <div className="idc-scan">Scan to verify</div>
          <div className="idc-number">{card.number || 'ST0000-00000'}</div>
        </div>
      ) : null}
      <div className={`idc-lcol${qrBack ? '' : ' idc-lcol--wide'}`}>
        {qrBack ? null : <div className="idc-lno"><b>Card No.</b> {card.number || 'ST0000-00000'}</div>}
        {extras.length ? (
          <dl className="idc-extras idc-extras--l">
            {extras.map(([label, value]) => <div key={label} className="idc-cell"><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
        ) : null}
        <ReturnBlock look={look} left />
        {look.backNote ? <p className="idc-note idc-note--l">{look.backNote}</p> : null}
      </div>
    </>
  );
}

/**
 * The face itself. `stamp` draws the status across a card that is not in
 * force; `slot` punches the lanyard slot (off for print-like previews).
 */
export default function IdCardFace({ card, side = 'front', stamp = true, slot = true, className = '', style }) {
  const look = card?.design || {};
  const landscape = look.layout === 'landscape';
  const Face = side === 'back' ? (landscape ? BackLandscape : BackPortrait) : (landscape ? FrontLandscape : FrontPortrait);
  return (
    <div
      className={`idc idc--${card.kind} ${landscape ? 'idc--landscape' : 'idc--portrait'} idc--${side}${slot ? ' idc--slot' : ''} ${className}`}
      style={{ '--p': look.primary, '--a': look.accent, '--a-ink': shade(look.accent, -0.12), '--a-deep': shade(look.accent, -0.25), '--a-tint': shade(look.accent, 0.9), ...style }}
    >
      <Face card={card} look={look} />
      {stamp && side === 'front' ? <Stamp status={card.status} /> : null}
    </div>
  );
}
