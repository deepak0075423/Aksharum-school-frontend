/**
 * The two illustrations, drawn inline.
 *
 * Inline rather than shipped as files because these appear at the moment
 * something has already gone wrong — a page that must fetch its own picture
 * before it can explain itself is the wrong way round.
 */
import React from 'react';

/** A locked browser window: the module is shut, not the person. */
export const LockedArt = () => (
  <svg className="errp__art" viewBox="0 0 700 340" fill="none" role="img"
       aria-label="A browser window with a padlock across it">
    {/* the soft shape everything sits on */}
    <path d="M196 62c74-46 196-58 282-24s142 106 128 168-92 104-186 110-190-14-234-66-64-142 10-188z"
          fill="#efeafc" />
    <path d="M300 40c56-22 126-14 158 20s24 84-18 104-116 10-148-20-48-82 8-104z" fill="#f6f2fe" />

    {/* paper plane */}
    <path d="M118 96l62-24-22 60-12-24-28-12z" fill="#3b82f6" />
    <path d="M158 132l22-60-30 46 8 14z" fill="#1d4ed8" />
    <path d="M96 168c14-22 40-30 58-16" stroke="#c7d2fe" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="5 7" />

    {/* browser window */}
    <rect x="236" y="92" width="272" height="168" rx="14" fill="#fff" stroke="#e4e7f2" strokeWidth="2" />
    <path d="M236 106a14 14 0 0114-14h244a14 14 0 0114 14v18H236v-18z" fill="#eef1fa" />
    <circle cx="256" cy="115" r="4" fill="#cbd5e1" />
    <circle cx="270" cy="115" r="4" fill="#cbd5e1" />
    <circle cx="284" cy="115" r="4" fill="#cbd5e1" />
    <rect x="256" y="146" width="66" height="9" rx="4.5" fill="#e6ebf6" />
    <rect x="256" y="168" width="52" height="9" rx="4.5" fill="#eef1f8" />
    <rect x="256" y="190" width="70" height="9" rx="4.5" fill="#e6ebf6" />
    <rect x="256" y="212" width="44" height="9" rx="4.5" fill="#eef1f8" />

    {/* the lock, on its own disc so it reads as the subject */}
    <circle cx="416" cy="182" r="62" fill="#fde8e4" />
    <circle cx="416" cy="182" r="48" fill="#fdf1ee" />
    <path d="M396 162v-14a20 20 0 0140 0v14" stroke="#f0a500" strokeWidth="11" strokeLinecap="round" />
    <rect x="382" y="160" width="68" height="54" rx="12" fill="#ffc542" />
    <rect x="382" y="160" width="68" height="54" rx="12" fill="url(#lockShine)" />
    <circle cx="416" cy="183" r="7" fill="#8a5a00" />
    <rect x="413" y="187" width="6" height="13" rx="3" fill="#8a5a00" />
    <circle cx="456" cy="214" r="19" fill="#ef4444" />
    <path d="M450 208l12 12M462 208l-12 12" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />

    {/* books */}
    <rect x="132" y="272" width="96" height="13" rx="4" fill="#f97316" />
    <rect x="140" y="259" width="96" height="13" rx="4" fill="#60a5fa" />
    <rect x="148" y="246" width="82" height="13" rx="4" fill="#e2e8f0" />
    <path d="M140 259h96M132 272h96" stroke="#fff" strokeWidth="1.5" opacity=".5" />

    {/* plant */}
    <path d="M556 258c-18-4-28-20-24-38 18 2 30 18 24 38z" fill="#6ee7b7" />
    <path d="M560 258c14-10 18-28 8-42-14 8-18 28-8 42z" fill="#34d399" />
    <path d="M540 262h44l-6 34a6 6 0 01-6 5h-20a6 6 0 01-6-5l-6-34z" fill="#93c5fd" />
    <rect x="536" y="256" width="52" height="11" rx="5.5" fill="#60a5fa" />

    {/* small marks */}
    <circle cx="540" cy="118" r="5" fill="#fbbf24" />
    <path d="M534 196l16 9-16 9v-18z" fill="#c4b5fd" />
    <g fill="#f9a8d4">
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => (
        <circle key={`${r}-${c}`} cx={532 + c * 13} cy={142 + r * 13} r="2.6" />
      )))}
    </g>
    <defs>
      <linearGradient id="lockShine" x1="382" y1="160" x2="450" y2="214" gradientUnits="userSpaceOnUse">
        <stop stopColor="#fff" stopOpacity=".45" />
        <stop offset="1" stopColor="#fff" stopOpacity="0" />
      </linearGradient>
    </defs>
  </svg>
);

/** A signpost by a road that does not go anywhere. */
export const LostArt = () => (
  <svg className="errp__art" viewBox="0 0 700 340" fill="none" role="img"
       aria-label="The number 404 beside a signpost">
    {/* clouds */}
    <g fill="#e8edf9">
      <ellipse cx="176" cy="88" rx="34" ry="19" />
      <ellipse cx="202" cy="82" rx="24" ry="15" />
      <ellipse cx="516" cy="104" rx="30" ry="17" />
      <ellipse cx="540" cy="98" rx="21" ry="13" />
    </g>
    <circle cx="258" cy="56" r="4" fill="#fbbf24" />
    <circle cx="470" cy="62" r="3.5" fill="#86efac" />
    <circle cx="132" cy="140" r="3" fill="#c4b5fd" />

    {/* the number */}
    <text x="350" y="252" textAnchor="middle" fill="url(#numFill)"
          style={{ font: '700 168px/1 Inter, ui-sans-serif, system-ui, sans-serif', letterSpacing: '2px' }}>404</text>

    {/* pin, and the path that led nowhere */}
    <path d="M258 168c26-46 70-70 104-58" stroke="#c4b5fd" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 9" />
    <path d="M368 62c-17 0-30 13-30 30 0 22 30 52 30 52s30-30 30-52c0-17-13-30-30-30z" fill="#fbbf24" />
    <circle cx="368" cy="92" r="11" fill="#fff" />

    {/* signpost */}
    <rect x="516" y="120" width="11" height="150" rx="5.5" fill="#8b7fd4" />
    <path d="M436 126h92a8 8 0 018 8v26a8 8 0 01-8 8h-92l-18-21 18-21z" fill="#bfdbfe" />
    <text x="486" y="152" textAnchor="middle" fill="#1e40af"
          style={{ font: '600 17px Inter, ui-sans-serif, system-ui, sans-serif' }}>Go Back</text>
    <path d="M436 182h92a8 8 0 018 8v26a8 8 0 01-8 8h-92l-18-21 18-21z" fill="#a5b4fc" />
    <text x="486" y="208" textAnchor="middle" fill="#312e81"
          style={{ font: '600 17px Inter, ui-sans-serif, system-ui, sans-serif' }}>Home</text>

    {/* ground */}
    <rect x="120" y="268" width="470" height="5" rx="2.5" fill="#e2e8f0" />

    {/* books */}
    <rect x="140" y="252" width="92" height="13" rx="4" fill="#f97316" />
    <rect x="148" y="239" width="92" height="13" rx="4" fill="#60a5fa" />
    <rect x="156" y="226" width="78" height="13" rx="4" fill="#e2e8f0" />

    {/* greenery */}
    <path d="M246 268c-12-2-20-14-17-27 13 1 22 13 17 27z" fill="#6ee7b7" />
    <path d="M252 268c10-7 13-20 6-30-10 6-13 20-6 30z" fill="#34d399" />
    <path d="M566 268c-11-2-18-13-15-25 12 1 20 12 15 25z" fill="#86efac" />
    <defs>
      <linearGradient id="numFill" x1="200" y1="110" x2="500" y2="260" gradientUnits="userSpaceOnUse">
        <stop stopColor="#8b8af0" />
        <stop offset="1" stopColor="#6366f1" />
      </linearGradient>
    </defs>
  </svg>
);
