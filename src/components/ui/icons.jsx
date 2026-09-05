/**
 * The app's icon set — one stroke style, one size scale, one import.
 *
 * Inline paths rather than an icon package: the project has no icon dependency
 * and adding one would ship a few hundred kilobytes to draw thirty glyphs. The
 * geometry follows the same 24×24 / round-cap convention the employee directory
 * already uses (see pages/directory/parts.jsx), so the two read as one family.
 *
 * Usage:
 *   <Icon name="users" />              // 20px, inherits color
 *   <Icon name="bell" size={18} />
 *
 * An unknown name renders nothing rather than throwing — a nav entry with a
 * stale icon key must not take the sidebar down with it.
 */
import React from 'react';

// ── Geometry ─────────────────────────────────────────────────────────────────
// Keys are stable: the sidebar, the dashboard and the module registry all name
// icons by these strings.
const PATHS = {
  // Navigation & structure
  home:        <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5" /></>,
  grid:        <><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></>,
  menu:        <path d="M4 7h16M4 12h16M4 17h16" />,
  search:      <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.6-3.6" /></>,
  settings:    <><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2v.17a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0-1.2-2.9H2.9a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 8.4a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.07 2.5v-.17a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.55 1.03h.17a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z" /></>,

  // People
  users:       <><circle cx="9" cy="8" r="3.4" /><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0" /><path d="M16.5 5.3a3.4 3.4 0 0 1 0 6.4M17.6 14.4A6.2 6.2 0 0 1 21.2 20" /></>,
  user:        <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  userCircle:  <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.3 18.5a6.5 6.5 0 0 1 11.4 0" /></>,
  teacher:     <><rect x="3" y="3.5" width="18" height="13" rx="2" /><path d="M8 20.5h8M12 16.5v4" /><path d="M7.5 8.5h5M7.5 12h7" /></>,
  student:     <><path d="M2.5 8.5 12 4l9.5 4.5L12 13z" /><path d="M6.5 10.7V16c0 1.5 2.5 2.8 5.5 2.8s5.5-1.3 5.5-2.8v-5.3" /><path d="M21.5 8.5v5" /></>,
  badge:       <><rect x="3.5" y="5.5" width="17" height="14" rx="2.2" /><path d="M9 3h6v2.5H9z" /><path d="M8 11.5h3.5M8 15h8" /></>,
  folder:      <><path d="M3 7.2A1.7 1.7 0 0 1 4.7 5.5h4.1l1.9 2.3h8.6A1.7 1.7 0 0 1 21 9.5v8.3a1.7 1.7 0 0 1-1.7 1.7H4.7A1.7 1.7 0 0 1 3 17.8z" /></>,

  // Academics
  calendar:    <><rect x="3" y="5" width="18" height="16" rx="2.2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  calendarDays:<><rect x="3" y="5" width="18" height="16" rx="2.2" /><path d="M3 10h18M8 3v4M16 3v4" /><path d="M7.5 14h1.6M11.2 14h1.6M14.9 14h1.6M7.5 17.4h1.6M11.2 17.4h1.6" /></>,
  building:    <><path d="M3.5 21h17" /><path d="M5.5 21V6.5L12 3l6.5 3.5V21" /><path d="M9.3 11h1.6M13.1 11h1.6M9.3 15h1.6M13.1 15h1.6" /><path d="M10.4 21v-3.4h3.2V21" /></>,
  layers:      <><path d="M12 3 3 7.6l9 4.6 9-4.6z" /><path d="M3 12.4 12 17l9-4.6" /><path d="M3 16.9 12 21.5l9-4.6" /></>,
  book:        <><path d="M4 5.4A2.4 2.4 0 0 1 6.4 3H20v14.6H6.4A2.4 2.4 0 0 0 4 20z" /><path d="M4 20a2.4 2.4 0 0 1 2.4-2.4H20V21H6.4" /></>,
  bookOpen:    <><path d="M12 6.5C10.6 5 8.6 4.2 6 4.2H3v13.4h3c2.6 0 4.6.8 6 2.2" /><path d="M12 6.5c1.4-1.5 3.4-2.3 6-2.3h3v13.4h-3c-2.6 0-4.6.8-6 2.2z" /></>,
  clock:       <><circle cx="12" cy="12" r="9" /><path d="M12 7v5.3l3.3 2" /></>,
  checkSquare: <><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8.2 12.3l2.6 2.6 5-5.3" /></>,
  fileCheck:   <><path d="M14 3H7.5A1.5 1.5 0 0 0 6 4.5v15A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7z" /><path d="M14 3v4h4" /><path d="M9.3 14.4l1.9 1.9 3.5-3.8" /></>,
  chart:       <><path d="M3.5 20.5h17" /><rect x="5" y="11" width="3.4" height="7" rx="1" /><rect x="10.3" y="6.5" width="3.4" height="11.5" rx="1" /><rect x="15.6" y="14" width="3.4" height="4" rx="1" /></>,
  trending:    <><path d="M3.5 16.5 9 11l3.6 3.6L20.5 6.5" /><path d="M15.6 6.5h4.9v4.9" /></>,
  compass:     <><circle cx="12" cy="12" r="9" /><path d="M15.6 8.4 13.8 14 8.4 15.6 10.2 10z" /></>,

  // Modules
  wallet:      <><path d="M3.5 8.2A2.2 2.2 0 0 1 5.7 6h11.6a2.2 2.2 0 0 1 2.2 2.2v9.6a2.2 2.2 0 0 1-2.2 2.2H5.7a2.2 2.2 0 0 1-2.2-2.2z" /><path d="M3.5 9.6h13.9a2.1 2.1 0 0 1 0 4.2H3.5" /><circle cx="16.4" cy="11.7" r=".9" fill="currentColor" stroke="none" /></>,
  banknote:    <><rect x="2.5" y="6.5" width="19" height="11" rx="2.2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 10v4M18 10v4" /></>,
  creditCard:  <><rect x="2.5" y="5.5" width="19" height="13" rx="2.4" /><path d="M2.5 10h19" /><path d="M6.5 14.6h3" /></>,
  package:     <><path d="M20.5 7.8 12 3.4 3.5 7.8v8.4L12 20.6l8.5-4.4z" /><path d="M3.7 7.9 12 12.2l8.3-4.3M12 12.2v8.4" /></>,
  bus:         <><rect x="3.5" y="3.5" width="17" height="13" rx="2.2" /><path d="M3.5 10h17" /><circle cx="7.6" cy="19" r="1.8" /><circle cx="16.4" cy="19" r="1.8" /><path d="M6.4 16.5v1M17.6 16.5v1M7 13.2h1.4M15.6 13.2H17" /></>,
  hotel:       <><path d="M3 21h18" /><path d="M4.8 21V4.5A1.5 1.5 0 0 1 6.3 3h11.4a1.5 1.5 0 0 1 1.5 1.5V21" /><path d="M8.5 7h1.6M13.9 7h1.6M8.5 11h1.6M13.9 11h1.6" /><path d="M10.2 21v-4.4h3.6V21" /></>,
  video:       <><rect x="2.5" y="6" width="13" height="12" rx="2.2" /><path d="M15.5 10.4 21.5 7v10l-6-3.4z" /></>,
  star:        <path d="m12 3.6 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.8l5.9-.8z" />,
  umbrella:    <><path d="M12 12v6.4a2.3 2.3 0 0 0 4.6 0" /><path d="M3 12a9 9 0 0 1 18 0z" /><path d="M12 3.2V12" /></>,
  files:       <><path d="M8 3.5h6.5L19 8v10.5A1.5 1.5 0 0 1 17.5 20h-9A1.5 1.5 0 0 1 7 18.5V5A1.5 1.5 0 0 1 8.5 3.5z" /><path d="M14 3.5V8h4.6" /><path d="M4.5 7.5v11A2.5 2.5 0 0 0 7 21h8" /></>,
  party:       <><path d="m3.5 20.5 4.4-12 8.1 8.1z" /><path d="M13.6 6.4a2.6 2.6 0 0 1 3.7 0M17 3.2a5.6 5.6 0 0 1 3.8 3.8M14.8 11.4a3.4 3.4 0 0 1 4.7-.6" /><circle cx="19.8" cy="14.6" r=".9" fill="currentColor" stroke="none" /></>,
  bell:        <><path d="M18 9a6 6 0 1 0-12 0c0 5.2-2 6.5-2 6.5h16S18 14.2 18 9" /><path d="M13.7 19.5a2 2 0 0 1-3.4 0" /></>,
  chat:        <><path d="M20.5 12.2a7.6 7.6 0 0 1-8.2 7.6l-5.1 1.7 1.7-4.2A7.6 7.6 0 1 1 20.5 12.2z" /><path d="M9 11.5h6M9 14.5h3.5" /></>,
  key:         <><circle cx="8" cy="15.6" r="3.6" /><path d="m10.6 13 8.4-8.4M16.6 7l2.1 2.1M14.2 9.4l1.8 1.8" /></>,
  school:      <><path d="M3 21h18" /><path d="M4.6 21V9.8L12 5.4l7.4 4.4V21" /><path d="M12 2.5v3" /><path d="M9.7 21v-4.3h4.6V21" /><path d="M9.2 12.4h1.5M13.3 12.4h1.5" /></>,
  film:        <><rect x="3" y="4" width="18" height="16" rx="2.2" /><path d="M3 9.5h18M3 14.5h18M8 4v16M16 4v16" /></>,
  repeat:      <><path d="M4 8.5h12.5a3.5 3.5 0 0 1 0 7H14" /><path d="m6.6 5.8-2.7 2.7 2.7 2.7" /><path d="M20 15.5H7.5a3.5 3.5 0 0 1 0-7H10" /><path d="m17.4 18.2 2.7-2.7-2.7-2.7" /></>,
  clipboard:   <><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v1" /><path d="M9 11h6M9 15h4" /></>,

  // Actions & indicators
  chevronRight:<path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  chevronLeft: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  chevronDown: <path d="m5.5 9 6.5 6.5L18.5 9" />,
  arrowUp:     <><path d="M12 19.5V5" /><path d="m6 11 6-6 6 6" /></>,
  arrowDown:   <><path d="M12 4.5V19" /><path d="m6 13 6 6 6-6" /></>,
  arrowRight:  <><path d="M4.5 12h14.5" /><path d="m13 6 6 6-6 6" /></>,
  plus:        <path d="M12 5v14M5 12h14" />,
  close:       <path d="m6 6 12 12M18 6 6 18" />,
  logIn:       <><path d="M15 3.5h3.5A1.5 1.5 0 0 1 20 5v14a1.5 1.5 0 0 1-1.5 1.5H15" /><path d="M10.5 16.5 15 12l-4.5-4.5" /><path d="M15 12H4" /></>,
  logOut:      <><path d="M9 3.5H5.5A1.5 1.5 0 0 0 4 5v14a1.5 1.5 0 0 0 1.5 1.5H9" /><path d="M16 16.5 20.5 12 16 7.5" /><path d="M20.5 12h-11" /></>,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8.2 12.3 2.6 2.6 5-5.3" /></>,
  alert:       <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.2" /><circle cx="12" cy="16.3" r=".95" fill="currentColor" stroke="none" /></>,
  megaphone:   <><path d="M3.5 10.2v3.6a1.8 1.8 0 0 0 1.8 1.8h1.4l1.2 4.3a1.2 1.2 0 0 0 1.2.9h.6a1 1 0 0 0 1-1.3l-1.1-3.9h.4L19 19V5l-8.8 4.4H5.3a1.8 1.8 0 0 0-1.8 1.8z" /><path d="M21 9.6v4.8" /></>,
  sparkle:     <><path d="m12 3.5 1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" /><path d="M18.6 16.4 19.4 18l1.6.8-1.6.8-.8 1.6-.8-1.6-1.6-.8 1.6-.8z" /></>,
  activity:    <path d="M3.5 12.5h4l2.4-6.8 4 13 2.5-6.2h4.1" />,
  eye:         <><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3.1" /></>,
  filter:      <path d="M3.5 5.5h17l-6.6 7.8v5.4l-3.8 2v-7.4z" />,
  refresh:     <><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" /><path d="M20.5 4.2v4.6h-4.6" /></>,
  download:    <><path d="M12 3.5v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  mapPin:      <><path d="M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  sun:         <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" /></>,
  moon:        <path d="M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8z" />,
  sunrise:     <><path d="M12 3.5v4.2M5.6 6.6l1.6 1.6M2.5 14h2.2M19.3 14h2.2M16.8 8.2l1.6-1.6" /><path d="M8 14a4 4 0 0 1 8 0" /><path d="M2.5 18.5h19" /></>,
  lifebuoy:    <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.7" /><path d="m5.7 5.7 3.7 3.7M14.6 14.6l3.7 3.7M18.3 5.7l-3.7 3.7M9.4 14.6l-3.7 3.7" /></>,
  trophy:      <><path d="M8 4.5h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5.6a2 2 0 0 0 0 4H8M16 6h2.4a2 2 0 0 1 0 4H16" /><path d="M12 13.5V17M9 20h6M10 17h4" /></>,
  target:      <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.6" /><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" /></>,
  sliders:     <><path d="M4 8h9M17 8h3M4 16h4M12 16h8" /><circle cx="15" cy="8" r="2.1" /><circle cx="10" cy="16" r="2.1" /></>,
  wallet2:     <><path d="M3.5 7.6A2.1 2.1 0 0 1 5.6 5.5h9.8" /><rect x="3.5" y="7.6" width="17" height="11.4" rx="2.1" /><path d="M16.6 12.4h3.9v3.8h-3.9a1.9 1.9 0 0 1 0-3.8z" /></>,
  pencil:      <><path d="M4 20.2h4.2L19 9.4a2.4 2.4 0 0 0-3.4-3.4L4.8 16.8z" /><path d="m14.6 7 2.4 2.4" /></>,
  trash:       <><path d="M4.5 6.5h15" /><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7" /><path d="M6.5 6.5 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5l.9-12.5" /><path d="M10.4 10.2v6.4M13.6 10.2v6.4" /></>,
  dots:        <><circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" /><circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" /></>,
  upload:      <><path d="M12 16V4.5" /><path d="m7.5 9 4.5-4.5L16.5 9" /><path d="M4.5 19.5h15" /></>,
  power:       <><path d="M12 3.5v8.2" /><path d="M17.4 6.6a7.6 7.6 0 1 1-10.8 0" /></>,
  userPlus:    <><circle cx="9.5" cy="8" r="3.6" /><path d="M2.5 20a7 7 0 0 1 14 0" /><path d="M18.5 8.5v6M15.5 11.5h6" /></>,
  mail:        <><rect x="2.8" y="5" width="18.4" height="14" rx="2.4" /><path d="m3.5 7 8.5 6 8.5-6" /></>,
  phone:       <path d="M7.6 3.8 9.4 8 7.5 9.9a12.6 12.6 0 0 0 6.6 6.6L16 14.6l4.2 1.8v3.1a1.5 1.5 0 0 1-1.7 1.5C9.9 20.1 3.9 14.1 3 5.5a1.5 1.5 0 0 1 1.5-1.7z" />,
  idCard:      <><rect x="2.5" y="5" width="19" height="14" rx="2.4" /><circle cx="8.4" cy="11.2" r="2.3" /><path d="M4.9 16.4a3.9 3.9 0 0 1 7 0" /><path d="M14.5 10h4.6M14.5 13.6h3.2" /></>,
};

// ── Spot illustrations ──────────────────────────────────────────────────────
// Bigger, scene-like drawings for a panel's empty space. Same stroke language
// as the icons, so they read as the same hand.

/** The school itself — the hero panel's backdrop. */
export const SchoolScene = ({ className = '' }) => (
  <svg viewBox="0 0 260 130" fill="none" className={className} aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {/* birds */}
      <path d="M28 26c2-2.4 4-2.4 6 0M40 20c2-2.4 4-2.4 6 0M214 22c2-2.4 4-2.4 6 0M228 30c2-2.4 4-2.4 6 0" opacity=".55" />
      {/* trees */}
      <path d="M46 116V96M46 96l-9 8M46 100l8 7" opacity=".65" />
      <path d="M38 96a8.5 8.5 0 1 1 17 0z" opacity=".65" />
      <path d="M214 116V96M214 96l-8 8M214 101l8 6" opacity=".65" />
      <path d="M206 96a8.5 8.5 0 1 1 17 0z" opacity=".65" />
      {/* main block */}
      <path d="M78 116V58l52-26 52 26v58" />
      <path d="M66 116h128" />
      <path d="M130 32V20M130 20h14v8h-14" />
      {/* clock */}
      <circle cx="130" cy="58" r="9" />
      <path d="M130 53v5.4l3.4 2" />
      {/* windows */}
      <rect x="92" y="74" width="12" height="12" rx="1.6" />
      <rect x="112" y="74" width="12" height="12" rx="1.6" />
      <rect x="136" y="74" width="12" height="12" rx="1.6" />
      <rect x="156" y="74" width="12" height="12" rx="1.6" />
      <rect x="92" y="94" width="12" height="12" rx="1.6" />
      <rect x="156" y="94" width="12" height="12" rx="1.6" />
      {/* door */}
      <path d="M118 116V98a12 12 0 0 1 24 0v18" />
      <path d="M130 98v18" />
      {/* side wings */}
      <path d="M78 116V84H60v32M182 116V84h18v32" opacity=".8" />
    </g>
  </svg>
);

/** Trophy on a stack of books — the results panel's encouragement card. */
export const TrophyScene = ({ className = '' }) => (
  <svg viewBox="0 0 140 120" fill="none" className={className} aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      {/* sparkles */}
      <path d="M26 26v8M22 30h8M112 22v7M108.5 25.5h7M118 62v6M115 65h6" opacity=".6" />
      {/* cup */}
      <path d="M55 24h30v20a15 15 0 0 1-30 0z" />
      <path d="M55 28H45a7.5 7.5 0 0 0 10 12M85 28h10a7.5 7.5 0 0 1-10 12" />
      <path d="M70 59v11M60 76h20M64 70h12" />
      {/* star on the cup */}
      <path d="m70 31 2.6 5.4 5.4.8-4 3.9.9 5.4-4.9-2.6-4.9 2.6.9-5.4-4-3.9 5.4-.8z"
        strokeWidth="1.6" opacity=".85" />
      {/* books */}
      <rect x="38" y="80" width="64" height="11" rx="2.4" />
      <rect x="32" y="91" width="76" height="11" rx="2.4" />
      <rect x="42" y="102" width="56" height="11" rx="2.4" />
      <path d="M48 80v11M52 91v11M56 102v11" opacity=".5" strokeWidth="1.6" />
    </g>
  </svg>
);

/** Mortarboard on a stack of books — the students list header. */
export const StudentsScene = ({ className = '' }) => (
  <svg viewBox="0 0 200 118" fill="none" className={className} aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* leaves behind */}
      <path d="M34 96c-14-2-22-12-22-25 13-2 23 6 24 19" opacity=".55" />
      <path d="M12 71c12 4 20 14 22 25" opacity=".4" strokeWidth="1.5" />
      <path d="M168 92c13-3 20-13 19-26-13-1-22 8-22 21" opacity=".55" />
      <path d="M187 66c-11 5-19 15-20 26" opacity=".4" strokeWidth="1.5" />
      {/* books */}
      <rect x="52" y="80" width="96" height="13" rx="3" />
      <rect x="44" y="93" width="112" height="13" rx="3" />
      <path d="M62 80v13M70 93v13" opacity=".45" strokeWidth="1.5" />
      {/* cap */}
      <path d="M100 26 44 47l56 21 56-21z" />
      <path d="M62 54v17c0 6 17 11 38 11s38-5 38-11V54" />
      <path d="M152 51v20" />
      <circle cx="152" cy="75" r="4" />
      {/* sparkles */}
      <path d="M30 30v9M25.5 34.5h9M172 24v7M168.5 27.5h7" opacity=".55" strokeWidth="1.5" />
    </g>
  </svg>
);

/** A teacher at the board — the teachers list header. */
export const TeachersScene = ({ className = '' }) => (
  <svg viewBox="0 0 200 118" fill="none" className={className} aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* board */}
      <rect x="72" y="14" width="112" height="70" rx="5" />
      <path d="M128 84v12M112 96h32" opacity=".6" />
      <path d="M88 34h56M88 47h74M88 60h40" opacity=".5" strokeWidth="1.6" />
      {/* teacher */}
      <circle cx="40" cy="34" r="12" />
      <path d="M22 96v-22a18 18 0 0 1 36 0v22" />
      <path d="M56 66l18-10" />
      <path d="M30 96v10M50 96v10" opacity=".8" />
      {/* pointer + plant */}
      <path d="M74 55l10-4" opacity=".7" strokeWidth="1.6" />
      <path d="M180 106V92M180 92c7 0 11-5 11-12-7 0-11 5-11 12zM180 95c-6 0-10-4-10-10 6 0 10 4 10 10z" opacity=".55" strokeWidth="1.6" />
      <path d="M8 106h184" opacity=".35" strokeWidth="1.6" />
    </g>
  </svg>
);

/** Someone running the school's settings — the admins list header. */
export const AdminsScene = ({ className = '' }) => (
  <svg viewBox="0 0 200 118" fill="none" className={className} aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {/* cog */}
      <circle cx="52" cy="34" r="13" />
      <circle cx="52" cy="34" r="5" />
      <path d="M52 13v6M52 49v6M31 34h6M67 34h6M37 19l4 4M63 45l4 4M67 19l-4 4M41 45l-4 4" opacity=".7" strokeWidth="1.6" />
      {/* person at a desk */}
      <circle cx="122" cy="36" r="13" />
      <path d="M100 92V76a22 22 0 0 1 44 0v16" />
      {/* shield */}
      <path d="M168 40l16 7v12c0 10-7 17-16 21-9-4-16-11-16-21V47z" opacity=".8" />
      <path d="m162 60 4 4 8-9" opacity=".8" strokeWidth="1.6" />
      {/* desk */}
      <path d="M78 92h96" />
      <path d="M92 92v14M160 92v14" opacity=".7" />
      <rect x="30" y="72" width="34" height="20" rx="3" opacity=".55" />
      <path d="M38 80h18M38 86h11" opacity=".45" strokeWidth="1.5" />
    </g>
  </svg>
);

/** Support desk — the "need help" panel on every list page. */
export const SupportScene = ({ className = '' }) => (
  <svg viewBox="0 0 150 110" fill="none" className={className} aria-hidden="true" focusable="false">
    <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="52" cy="34" r="14" />
      <path d="M28 96V78a24 24 0 0 1 48 0v18" />
      {/* headset */}
      <path d="M36 32a16 16 0 0 1 32 0" />
      <rect x="30" y="30" width="9" height="13" rx="3" />
      <rect x="65" y="30" width="9" height="13" rx="3" />
      {/* speech bubbles */}
      <path d="M92 26h44a5 5 0 0 1 5 5v22a5 5 0 0 1-5 5h-26l-11 9v-9h-7a5 5 0 0 1-5-5V31a5 5 0 0 1 5-5z" opacity=".8" />
      <path d="M104 40h20M104 48h12" opacity=".5" strokeWidth="1.6" />
      <path d="M6 96h138" opacity=".35" strokeWidth="1.6" />
    </g>
  </svg>
);

// Aliases keep old call sites and the module registry readable.
const ALIAS = {
  dashboard: 'home', teachers: 'teacher', students: 'student',
  attendance: 'checkSquare', timetable: 'clock', results: 'chart',
  exams: 'fileCheck', fees: 'wallet', payroll: 'banknote',
  library: 'bookOpen', inventory: 'package', transport: 'bus',
  hostel: 'hotel', videos: 'video', feedback: 'star', leave: 'umbrella',
  documents: 'files', holidays: 'party', notifications: 'bell',
  chat: 'chat', reports: 'trending', profile: 'user',
};

export const ICON_NAMES = Object.keys(PATHS);

export default function Icon({ name, size = 20, strokeWidth = 1.75, className = '', style }) {
  const shape = PATHS[name] || PATHS[ALIAS[name]];
  if (!shape) return null;
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true" focusable="false"
    >
      {shape}
    </svg>
  );
}

export { Icon };
