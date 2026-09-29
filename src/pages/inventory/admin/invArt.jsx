/**
 * The illustrations in each screen's hero banner.
 *
 * Flat SVG, drawn to the module's own palette, sized to the banner's 260×132
 * slot and scaled with it. They are DECORATION: `aria-hidden`, and hidden
 * outright under 1000px of page width (see inventory.css), because nothing in
 * them is information the screen does not also say in words.
 */
import React from 'react';

const P = {
  ink: '#4338ca', line: '#c7cbf5', paper: '#ffffff', paper2: '#eef1ff',
  box: '#f0b775', box2: '#e0a15c', box3: '#fadcbb',
  green: '#6ee7b7', green2: '#34d399', leaf: '#4ade80',
  blue: '#93c5fd', blue2: '#60a5fa', violet: '#c4b5fd', violet2: '#a78bfa',
  amber: '#fcd34d', rose: '#fda4af', slate: '#cbd5e1', dark: '#475569',
};

const Frame = ({ children }) => (
  <svg viewBox="0 0 260 132" fill="none" aria-hidden focusable="false" preserveAspectRatio="xMidYMid meet">
    {children}
  </svg>
);

/** A leafy pot plant — the corner of nearly every one of the mockups. */
const Plant = ({ x = 0, y = 0, s = 1, flip = false }) => (
  <g transform={`translate(${x},${y}) scale(${flip ? -s : s},${s})`}>
    <path d="M10 22c-6-3-9-9-8-15 6-1 11 2 13 8" fill={P.leaf} />
    <path d="M12 22c5-4 7-11 5-17-6 0-10 4-11 10" fill={P.green2} />
    <path d="M11 20v12" stroke={P.green2} strokeWidth="1.6" strokeLinecap="round" />
    <path d="M4 31h14l-1.6 10a2 2 0 0 1-2 1.7H7.6a2 2 0 0 1-2-1.7z" fill={P.box2} />
    <rect x="3" y="28.5" width="16" height="3.4" rx="1.3" fill={P.box} />
  </g>
);

/* ── Dashboard: a stack of cartons beside a checked clipboard ───────────── */
export const ArtDashboard = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="108" ry="8" fill={P.paper2} />
    {/* back cartons */}
    <path d="M28 66h46v40H28z" fill={P.box3} />
    <path d="M28 66h46l-6-10H34z" fill={P.box} />
    <path d="M44 66h14v9l-7-3-7 3z" fill={P.box2} />
    <path d="M78 78h42v28H78z" fill={P.box} />
    <path d="M78 78h42l-5-9H83z" fill={P.box2} />
    <path d="M92 78h14v8l-7-3-7 3z" fill={P.box3} />
    {/* clipboard */}
    <rect x="128" y="40" width="58" height="72" rx="6" fill={P.paper} stroke={P.line} strokeWidth="2" />
    <rect x="146" y="34" width="22" height="11" rx="3.5" fill={P.violet2} />
    <g stroke={P.blue2} strokeWidth="3" strokeLinecap="round">
      <path d="M140 60h2M140 74h2M140 88h2" />
    </g>
    <g stroke={P.green2} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="m137 58 2.5 2.5 4-4.5M137 72l2.5 2.5 4-4.5M137 86l2.5 2.5 4-4.5" />
    </g>
    <g stroke={P.line} strokeWidth="3" strokeLinecap="round">
      <path d="M150 59h26M150 73h26M150 87h18" />
    </g>
    {/* front carton */}
    <path d="M186 84h40v22h-40z" fill={P.box2} />
    <path d="M186 84h40l-4-8h-32z" fill={P.box} />
    <Plant x={214} y={64} s={1.05} />
    <Plant x={104} y={68} s={.82} flip />
  </Frame>
);

/* ── Items: supplies on a shelf ──────────────────────────────────────────── */
export const ArtItems = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="106" ry="8" fill={P.paper2} />
    <path d="M40 74h54v34H40z" fill={P.box3} />
    <path d="M40 74h54l-6-9H46z" fill={P.box} />
    {/* books */}
    <rect x="100" y="62" width="13" height="46" rx="2.5" fill={P.rose} />
    <rect x="115" y="70" width="12" height="38" rx="2.5" fill={P.blue2} />
    <rect x="129" y="56" width="14" height="52" rx="2.5" fill={P.green2} />
    <rect x="102" y="70" width="9" height="3" rx="1.5" fill={P.paper} opacity=".7" />
    <rect x="131" y="64" width="10" height="3" rx="1.5" fill={P.paper} opacity=".7" />
    {/* pen pot */}
    <path d="M154 80h30l-3 27a3 3 0 0 1-3 2.6h-18a3 3 0 0 1-3-2.6z" fill={P.violet} />
    <rect x="158" y="52" width="5" height="30" rx="2.5" fill={P.amber} transform="rotate(-8 160 67)" />
    <rect x="166" y="48" width="5" height="34" rx="2.5" fill={P.blue2} />
    <rect x="174" y="54" width="5" height="28" rx="2.5" fill={P.rose} transform="rotate(9 176 68)" />
    <path d="M163.5 49.5 166 44l2.5 5.5z" fill={P.dark} opacity=".5" />
    <path d="M196 86h30v22h-30z" fill={P.box2} />
    <path d="M196 86h30l-4-8h-22z" fill={P.box} />
    <Plant x={26} y={72} s={.9} />
    <Plant x={228} y={68} s={.95} flip />
  </Frame>
);

/* ── Purchase Orders: a document and a delivery van ──────────────────────── */
export const ArtOrders = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="104" ry="8" fill={P.paper2} />
    <rect x="34" y="28" width="62" height="82" rx="7" fill={P.paper} stroke={P.line} strokeWidth="2" />
    <rect x="46" y="42" width="24" height="7" rx="3.5" fill={P.violet2} />
    <g stroke={P.line} strokeWidth="3.2" strokeLinecap="round">
      <path d="M46 60h38M46 71h38M46 82h26" />
    </g>
    <circle cx="86" cy="94" r="14" fill={P.green2} />
    <path d="m80 94 4.4 4.4L92.5 90" stroke={P.paper} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* van */}
    <rect x="116" y="62" width="60" height="34" rx="5" fill={P.blue2} />
    <path d="M176 72h18l14 14v10h-32z" fill={P.violet2} />
    <rect x="180" y="75" width="12" height="9" rx="2" fill={P.paper2} />
    <circle cx="136" cy="99" r="9" fill={P.dark} /><circle cx="136" cy="99" r="3.6" fill={P.paper} />
    <circle cx="192" cy="99" r="9" fill={P.dark} /><circle cx="192" cy="99" r="3.6" fill={P.paper} />
    <g stroke={P.blue} strokeWidth="3.4" strokeLinecap="round">
      <path d="M100 70h-14M104 80H88M100 90h-9" />
    </g>
    <Plant x={214} y={72} s={.86} flip />
  </Frame>
);

/* ── Requests: a form being filled ──────────────────────────────────────── */
export const ArtRequests = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="102" ry="8" fill={P.paper2} />
    <rect x="70" y="20" width="74" height="92" rx="7" fill={P.paper} stroke={P.line} strokeWidth="2" />
    <rect x="93" y="14" width="28" height="12" rx="4" fill={P.violet2} />
    {[0, 1, 2].map(i => (
      <g key={i}>
        <rect x="82" y={42 + i * 20} width="13" height="13" rx="3.5" fill={P.paper2} stroke={P.blue} strokeWidth="1.6" />
        <path d={`m85 ${48.5 + i * 20} 2.6 2.6 5-5.4`} stroke={P.green2} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <rect x="101" y={45 + i * 20} width="32" height="4" rx="2" fill={P.line} />
        <rect x="101" y={52 + i * 20} width="20" height="3.4" rx="1.7" fill={P.paper2} />
      </g>
    ))}
    <path d="M160 68h44v42h-44z" fill={P.box3} />
    <path d="M160 68h44l-5-10h-34z" fill={P.box} />
    <path d="M174 68h14v9l-7-3-7 3z" fill={P.box2} />
    <rect x="30" y="72" width="30" height="38" rx="4" fill={P.blue} opacity=".55" />
    <rect x="34" y="82" width="22" height="4" rx="2" fill={P.paper} opacity=".8" />
    <rect x="34" y="91" width="16" height="4" rx="2" fill={P.paper} opacity=".8" />
    <Plant x={216} y={74} s={.9} flip />
  </Frame>
);

/* ── Issue / Return: a hand-over with two arrows ─────────────────────────── */
export const ArtIssue = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="100" ry="8" fill={P.paper2} />
    <rect x="94" y="24" width="72" height="86" rx="7" fill={P.paper} stroke={P.line} strokeWidth="2" />
    <rect x="116" y="18" width="28" height="11" rx="4" fill={P.violet2} />
    <g stroke={P.line} strokeWidth="3.4" strokeLinecap="round">
      <path d="M106 48h48M106 60h48M106 72h30" />
    </g>
    <path d="M106 88h34" stroke={P.green2} strokeWidth="3.4" strokeLinecap="round" />
    {/* out */}
    <path d="M28 52h38" stroke={P.blue2} strokeWidth="5" strokeLinecap="round" />
    <path d="m58 43 11 9-11 9" stroke={P.blue2} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    {/* back */}
    <path d="M232 86h-38" stroke={P.violet2} strokeWidth="5" strokeLinecap="round" />
    <path d="m202 77-11 9 11 9" stroke={P.violet2} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M186 40h44v30h-44z" fill={P.box} />
    <path d="M186 40h44l-4-8h-36z" fill={P.box2} />
    <path d="M30 78h44v32H30z" fill={P.box3} />
    <path d="M30 78h44l-5-9H35z" fill={P.box} />
    <Plant x={236} y={84} s={.8} flip />
  </Frame>
);

/* ── Assets: a desk with a monitor and a chair ──────────────────────────── */
export const ArtAssets = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="104" ry="8" fill={P.paper2} />
    <rect x="86" y="34" width="86" height="54" rx="6" fill={P.blue2} />
    <rect x="92" y="40" width="74" height="42" rx="3" fill={P.paper2} />
    <g stroke={P.blue} strokeWidth="3.4" strokeLinecap="round">
      <path d="M100 52h34M100 61h50M100 70h26" />
    </g>
    <path d="M118 88h22l4 12h-30z" fill={P.dark} opacity=".35" />
    <rect x="98" y="100" width="62" height="5" rx="2.5" fill={P.dark} opacity=".45" />
    {/* chair */}
    <rect x="186" y="40" width="30" height="42" rx="10" fill={P.violet2} />
    <rect x="192" y="82" width="18" height="6" rx="3" fill={P.dark} opacity=".4" />
    <path d="M201 88v12M188 106l13-6 13 6" stroke={P.dark} strokeWidth="3.4" strokeLinecap="round" opacity=".45" fill="none" />
    {/* cabinet */}
    <rect x="26" y="58" width="46" height="48" rx="4" fill={P.box} />
    <rect x="30" y="64" width="38" height="16" rx="2.5" fill={P.box3} />
    <rect x="30" y="84" width="38" height="16" rx="2.5" fill={P.box3} />
    <rect x="42" y="70" width="14" height="3" rx="1.5" fill={P.box2} />
    <rect x="42" y="90" width="14" height="3" rx="1.5" fill={P.box2} />
    <Plant x={228} y={70} s={.95} flip />
  </Frame>
);

/* ── Vendors: a shop front ──────────────────────────────────────────────── */
export const ArtVendors = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="102" ry="8" fill={P.paper2} />
    <rect x="66" y="52" width="110" height="58" rx="5" fill={P.paper} stroke={P.line} strokeWidth="2" />
    <path d="M60 52h122l-8-18H68z" fill={P.violet2} />
    {[0, 1, 2, 3, 4].map(i => (
      <path key={i} d={`M${68 + i * 22.8} 52h22.8l-2 10a9.4 9.4 0 0 1-18.8 0z`} fill={i % 2 ? P.rose : P.paper2} />
    ))}
    <rect x="80" y="70" width="34" height="40" rx="3" fill={P.blue} opacity=".5" />
    <rect x="128" y="70" width="38" height="24" rx="3" fill={P.paper2} stroke={P.line} strokeWidth="1.6" />
    <g stroke={P.line} strokeWidth="3" strokeLinecap="round"><path d="M136 78h22M136 86h14" /></g>
    <rect x="128" y="98" width="38" height="12" rx="3" fill={P.green2} opacity=".7" />
    {/* two figures */}
    <circle cx="36" cy="68" r="9" fill={P.amber} />
    <path d="M22 110c0-8 6-14 14-14s14 6 14 14z" fill={P.blue2} />
    <circle cx="216" cy="70" r="9" fill={P.rose} />
    <path d="M202 110c0-8 6-14 14-14s14 6 14 14z" fill={P.violet2} />
    <Plant x={242} y={84} s={.78} flip />
  </Frame>
);

/* ── Categories: labelled shelving ──────────────────────────────────────── */
export const ArtCategories = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="100" ry="8" fill={P.paper2} />
    <rect x="62" y="26" width="128" height="84" rx="6" fill={P.paper} stroke={P.line} strokeWidth="2" />
    <path d="M62 56h128M62 84h128" stroke={P.line} strokeWidth="2" />
    <rect x="72" y="34" width="22" height="18" rx="3" fill={P.box} />
    <rect x="98" y="34" width="22" height="18" rx="3" fill={P.blue2} />
    <rect x="124" y="34" width="22" height="18" rx="3" fill={P.green2} />
    <rect x="150" y="34" width="30" height="18" rx="3" fill={P.violet2} />
    <rect x="72" y="62" width="30" height="18" rx="3" fill={P.rose} />
    <rect x="106" y="62" width="22" height="18" rx="3" fill={P.amber} />
    <rect x="132" y="62" width="48" height="18" rx="3" fill={P.blue} />
    <rect x="72" y="90" width="42" height="16" rx="3" fill={P.box3} />
    <rect x="118" y="90" width="26" height="16" rx="3" fill={P.violet} />
    <rect x="148" y="90" width="32" height="16" rx="3" fill={P.green2} opacity=".65" />
    <Plant x={26} y={68} s={1} />
    <Plant x={214} y={72} s={.92} flip />
  </Frame>
);

/* ── Warehouses: a store with a roller shutter ──────────────────────────── */
export const ArtWarehouse = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="106" ry="8" fill={P.paper2} />
    <path d="M56 56 130 22l74 34v54H56z" fill={P.paper} stroke={P.line} strokeWidth="2" />
    <path d="M56 56 130 22l74 34z" fill={P.violet2} />
    <rect x="94" y="70" width="72" height="40" rx="3" fill={P.paper2} stroke={P.line} strokeWidth="1.6" />
    {[0, 1, 2, 3].map(i => <path key={i} d={`M94 ${78 + i * 9}h72`} stroke={P.line} strokeWidth="2" />)}
    <path d="M18 88h32v22H18z" fill={P.box} />
    <path d="M18 88h32l-3-7H21z" fill={P.box2} />
    <path d="M210 92h32v18h-32z" fill={P.box3} />
    <path d="M210 92h32l-3-7h-26z" fill={P.box} />
    <circle cx="204" cy="34" r="11" fill={P.amber} opacity=".55" />
    <Plant x={62} y={82} s={.78} />
    <Plant x={196} y={78} s={.72} flip />
  </Frame>
);

/* ── Budgets: a rising chart over coins ─────────────────────────────────── */
export const ArtBudget = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="102" ry="8" fill={P.paper2} />
    <rect x="66" y="24" width="112" height="76" rx="7" fill={P.paper} stroke={P.line} strokeWidth="2" />
    <rect x="80" y="66" width="16" height="22" rx="3" fill={P.blue} />
    <rect x="102" y="54" width="16" height="34" rx="3" fill={P.blue2} />
    <rect x="124" y="42" width="16" height="46" rx="3" fill={P.violet2} />
    <rect x="146" y="32" width="16" height="56" rx="3" fill={P.green2} />
    <path d="M82 60 110 46l22 10 30-20" stroke={P.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".45" />
    <path d="M154 34h10v10" stroke={P.ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity=".45" />
    {/* coins */}
    <g>
      <ellipse cx="34" cy="94" rx="18" ry="7" fill={P.amber} />
      <path d="M16 94v8c0 3.9 8 7 18 7s18-3.1 18-7v-8" fill={P.amber} opacity=".8" />
      <ellipse cx="34" cy="82" rx="18" ry="7" fill={P.box} />
      <ellipse cx="34" cy="82" rx="9" ry="3.4" fill={P.box2} opacity=".55" />
    </g>
    <g>
      <ellipse cx="216" cy="100" rx="16" ry="6.4" fill={P.amber} />
      <path d="M200 100v7c0 3.5 7.2 6.4 16 6.4s16-2.9 16-6.4v-7" fill={P.amber} opacity=".8" />
      <ellipse cx="216" cy="89" rx="16" ry="6.4" fill={P.box} />
    </g>
    <Plant x={238} y={62} s={.8} flip />
  </Frame>
);

/* ── Activity Log: a clock over a document ──────────────────────────────── */
export const ArtActivity = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="100" ry="8" fill={P.paper2} />
    <rect x="72" y="20" width="84" height="92" rx="7" fill={P.paper} stroke={P.line} strokeWidth="2" />
    {[0, 1, 2, 3].map(i => (
      <g key={i}>
        <circle cx="86" cy={42 + i * 18} r="4.6" fill={i === 0 ? P.green2 : i === 1 ? P.blue2 : i === 2 ? P.amber : P.violet2} />
        <rect x="98" y={39 + i * 18} width="44" height="4" rx="2" fill={P.line} />
        <rect x="98" y={47 + i * 18} width="28" height="3.4" rx="1.7" fill={P.paper2} />
      </g>
    ))}
    <circle cx="188" cy="58" r="30" fill={P.violet2} />
    <circle cx="188" cy="58" r="23" fill={P.paper} />
    <path d="M188 42v17l11 7" stroke={P.ink} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    <path d="M186 96h42v14h-42z" fill={P.box3} />
    <path d="M186 96h42l-4-7h-34z" fill={P.box} />
    <Plant x={28} y={76} s={.9} />
  </Frame>
);

/* ── Stock: shelves with a magnifier ────────────────────────────────────── */
export const ArtStock = () => (
  <Frame>
    <ellipse cx="130" cy="120" rx="100" ry="8" fill={P.paper2} />
    <rect x="44" y="30" width="116" height="80" rx="6" fill={P.paper} stroke={P.line} strokeWidth="2" />
    <path d="M44 60h116M44 86h116" stroke={P.line} strokeWidth="2" />
    <rect x="54" y="38" width="26" height="20" rx="3" fill={P.box} />
    <rect x="86" y="38" width="20" height="20" rx="3" fill={P.blue2} />
    <rect x="112" y="38" width="38" height="20" rx="3" fill={P.green2} />
    <rect x="54" y="66" width="34" height="18" rx="3" fill={P.rose} />
    <rect x="94" y="66" width="24" height="18" rx="3" fill={P.amber} />
    <rect x="124" y="66" width="26" height="18" rx="3" fill={P.violet2} />
    <rect x="54" y="92" width="44" height="16" rx="3" fill={P.box3} />
    <rect x="104" y="92" width="46" height="16" rx="3" fill={P.blue} />
    <circle cx="192" cy="54" r="26" fill={P.paper} stroke={P.violet2} strokeWidth="6" />
    <path d="m210 74 16 16" stroke={P.violet2} strokeWidth="9" strokeLinecap="round" />
    <path d="M182 58v-8m10 8V44m10 14v-4" stroke={P.green2} strokeWidth="4" strokeLinecap="round" />
    <Plant x={26} y={76} s={.78} />
  </Frame>
);

/** Screen key → illustration. A screen with no entry simply has no art. */
export const ART = {
  dashboard: ArtDashboard, items: ArtItems, stock: ArtStock, requests: ArtRequests,
  orders: ArtOrders, issues: ArtIssue, assets: ArtAssets, vendors: ArtVendors,
  categories: ArtCategories, warehouses: ArtWarehouse, budgets: ArtBudget, activity: ArtActivity,
};
export const Art = ({ name }) => {
  const C = ART[name];
  return C ? <C /> : null;
};
