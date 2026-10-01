/**
 * The Hostel dashboard's drawings: the pale building and window tucked into
 * the right edge of two tiles, and the dove the mockup shows when nothing has
 * been reported. Decoration only — every one is aria-hidden, and the tiles
 * drop theirs when the page is too narrow to spare the room.
 */
import React from 'react';

/** Total Hostels: a tall block and a lower one in front, windows lit. */
export const BuildingArt = () => (
  <svg width="54" height="72" viewBox="0 0 54 72" aria-hidden focusable="false">
    <rect x="4" y="16" width="20" height="58" rx="2" fill="#e7defd" />
    <rect x="9" y="52" width="8" height="12" rx="1" fill="#d4c4fb" />
    <path d="M20 30a4 4 0 0 1 4-4h22a6 6 0 0 1 6 6v42H20z" fill="#ddd0fc" />
    <circle cx="47" cy="27" r="6" fill="#ece5fe" />
    {[36, 46, 56, 66].map((y) => [26, 35, 44].map((x) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="5" height="5.5" rx="1" fill="#f7f3ff" />
    )))}
    {[24, 34, 44].map((y) => (
      <rect key={y} x="8" y={y} width="4.5" height="5" rx="1" fill="#f2edff" />
    ))}
  </svg>
);

/** Rooms: an arched window of four panes on its sill. */
export const WindowArt = () => (
  <svg width="52" height="70" viewBox="0 0 52 70" aria-hidden focusable="false">
    <path d="M8 66V27a18 18 0 0 1 36 0v39z" fill="#d7dbfd" />
    <path d="M13.5 63V28a12.5 12.5 0 0 1 25 0v35z" fill="#eff1ff" />
    <path d="M26 15.5V63M13.5 38.5h25" stroke="#d7dbfd" strokeWidth="3.4" />
    <rect x="3" y="63" width="46" height="7" rx="1.6" fill="#cdd2fb" />
  </svg>
);

/** "No incidents" — a dove with an olive sprig. */
export const Dove = () => (
  <svg width="68" height="60" viewBox="0 0 68 60" aria-hidden focusable="false">
    {/* the far wing, raised */}
    <path d="M35 27c-3-9-2-19 4-25 4 8 5 17 1 26z" fill="#cdd1da" />
    {/* the near wing */}
    <path d="M37 29c1-11 8-20 19-24 0 11-5 20-14 26z" fill="#e1e4eb" />
    <path d="M41 25c3-5 7-9 12-12M40 21c2-4 5-8 9-10" stroke="#cfd3dc" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    {/* body and tail */}
    <path d="M17 33c3-6 11-9 18-7l10 3c6 2 12 1 17-3-2 8-8 14-17 16l-5 1 6 9-8-1-6-8c-8-1-13-4-15-10z" fill="#eceef3" />
    <path d="M28 41c5 2 11 2 16 0" stroke="#dcdfe6" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    {/* head */}
    <circle cx="20" cy="29.5" r="6" fill="#eceef3" />
    <circle cx="18.6" cy="28.3" r="1.05" fill="#3a4055" />
    <path d="M14.4 30 11 31.4l3.6 1z" fill="#c98b6b" />
    {/* the sprig in its beak */}
    <path d="M12 31.8c-3 1.5-5.7 3.9-7.3 7.2" stroke="#6f9440" strokeWidth="1.1" fill="none" strokeLinecap="round" />
    <ellipse cx="9.4" cy="32.2" rx="2.9" ry="1.2" transform="rotate(-28 9.4 32.2)" fill="#7ec453" />
    <ellipse cx="6.2" cy="35.4" rx="2.8" ry="1.15" transform="rotate(-58 6.2 35.4)" fill="#8fd062" />
    <ellipse cx="9.2" cy="36.6" rx="2.6" ry="1.1" transform="rotate(16 9.2 36.6)" fill="#6fb847" />
    <ellipse cx="4.6" cy="39" rx="2.4" ry="1.05" transform="rotate(-80 4.6 39)" fill="#7ec453" />
  </svg>
);

/** Total Hostels on the list screens: a low wing beside a capped block. */
export const HostelArt = () => (
  <svg width="84" height="70" viewBox="0 0 84 70" aria-hidden focusable="false">
    <rect x="7" y="17" width="24" height="46" rx="2.5" fill="#ddd6fb" />
    <path d="M26 5.5a2.5 2.5 0 0 1 2.5-2.5h38a2.5 2.5 0 0 1 2.5 2.5v3.5h-2v54H28V9h-2z" fill="#d8d0fa" />
    <rect x="0" y="61" width="84" height="8" rx="4" fill="#ddd6fb" />
    {[24, 35, 46].map((y) => <rect key={y} x="14" y={y} width="7" height="6.5" rx="1" fill="#f0ecfe" />)}
    {[15, 31].map((y) => [37, 51].map((x) => <rect key={`${x}-${y}`} x={x} y={y} width="7.5" height="8.5" rx="1" fill="#f0ecfe" />))}
    <path d="M41 63V53a6 6 0 0 1 12 0v10z" fill="#f0ecfe" />
  </svg>
);

/** Total Rooms: a pale door, ajar, in its frame. */
export const DoorArt = () => (
  <svg width="46" height="62" viewBox="0 0 46 62" aria-hidden focusable="false">
    <rect x="1" y="2" width="44" height="58" rx="2" fill="#e6e0fd" />
    <path d="M13 6h26a2 2 0 0 1 2 2v50H13z" fill="#f3f0fe" />
    <circle cx="20" cy="34" r="2.2" fill="#dcd4fc" />
  </svg>
);

/** Total Beds: a pale bed with someone sitting up in it, for the pink tile. */
export const BedArt = ({ small }) => (
  <svg width={small ? 66 : 88} height={small ? 52 : 70} viewBox="0 0 88 70" aria-hidden focusable="false">
    <rect x="2" y="20" width="8" height="46" rx="4" fill="#fcd9de" />
    <rect x="12" y="31" width="76" height="12" rx="6" fill="#fcdde2" />
    <rect x="2" y="44" width="76" height="9" rx="2" fill="#fcd9de" />
    <circle cx="66" cy="12" r="7.5" fill="#fbd3d9" />
    <path d="M55 33c-2-9 3-15 10-14 5 1 8 5 9 12l-2 2z" fill="#fbd3d9" />
    <circle cx="77" cy="9" r="3.6" fill="#fbd3d9" />
    <path d="M73 12h6v17h-6z" fill="#fbd3d9" />
  </svg>
);

/**
 * The faint mark in the right of a list-screen tile — a sheet, a rosette with a
 * tick, a clock. Drawn in the tile's own tint, so one drawing serves every tone.
 */
export const GhostArt = ({ kind = 'doc' }) => (
  <svg width="56" height="60" viewBox="0 0 56 60" aria-hidden focusable="false" style={{ color: 'var(--k-mark, #e6e1fd)' }}>
    {kind === 'doc' ? (
      <>
        <rect x="8" y="4" width="40" height="52" rx="5" fill="currentColor" />
        <path d="M18 22h20M18 31h20M18 40h13" stroke="#fff" strokeOpacity=".75" strokeWidth="3.4" strokeLinecap="round" />
      </>
    ) : null}
    {kind === 'check' ? (
      <>
        <path d="M28 3l6 4 7-.5 3 6.5 6 4-1.5 7 1.5 7-6 4-3 6.5-7-.5-6 4-6-4-7 .5-3-6.5-6-4 1.5-7L4 17l6-4 3-6.5 7 .5z" fill="currentColor" />
        <path d="m19 27 6 6 12-12.5" stroke="#fff" strokeOpacity=".8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ) : null}
    {kind === 'people' ? (
      <>
        <circle cx="28" cy="20" r="9" fill="currentColor" />
        <path d="M12 46c0-9 7-14 16-14s16 5 16 14z" fill="currentColor" />
        <circle cx="9" cy="24" r="6" fill="currentColor" opacity=".7" />
        <circle cx="47" cy="24" r="6" fill="currentColor" opacity=".7" />
        <path d="M0 44c0-6 4-9.5 9-9.5 1.6 0 3 .3 4.2 1C9.5 38 8 41.5 8 46H0zM56 44c0-6-4-9.5-9-9.5-1.6 0-3 .3-4.2 1C46.5 38 48 41.5 48 46h8z" fill="currentColor" opacity=".7" />
      </>
    ) : null}
    {kind === 'clock' ? (
      <>
        <circle cx="28" cy="28" r="25" fill="currentColor" />
        <path d="M28 14v15l10 6" stroke="#fff" strokeOpacity=".8" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </>
    ) : null}
  </svg>
);

