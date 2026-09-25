/**
 * The map used by the Dashboard, Live Map, Routes, Incidents, the crew screens
 * and the location picker.
 *
 * Two basemap engines, chosen by the school's Settings → Integrations:
 *   · OpenFreeMap (default) — OpenStreetMap data as MapLibre vector tiles,
 *     free, no key, no usage limit;
 *   · Google Maps — when a school has entered a Google Maps JavaScript API key;
 *   · a plain grid, which calls nothing at all.
 *
 * Whichever is running, the school's own marks — route lines, stops, buses with
 * their fleet number and delay badge, crew, incident pins, a trail — are an SVG
 * overlay re-projected through the engine on every camera move. That keeps the
 * marks as ordinary SVG rather than sprite sheets, and is why this file still
 * owns how everything looks. See trMapEngines.js for the two adapters.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Glyph, Ico } from './trUI';
import {
  isCoord, hasPoint, openingView, createGoogleMap, createMapLibreMap,
} from './trMapEngines';

export { isCoord, hasPoint };

const STATE_INK = {
  on_route: '#16a34a', at_stop: '#2563eb', delayed: '#d97706',
  maintenance: '#dc2626', idle: '#d97706', offline: '#94a3b8',
};

/**
 * @param routes   [{ _id, tag, color, stops:[{name, latitude, longitude, sequence}] }]
 * @param vehicles [{ vehicleNumber, latitude, longitude, state, route, delayMinutes }]
 * @param crew     [{ name, latitude, longitude, staffType, stale }]
 * @param pins     [{ latitude, longitude, tone|color, label, title }]
 * @param trail    [{ latitude, longitude }] — where someone has been
 * @param marker   the point being picked
 * @param tiles    false draws the marks on a plain grid and calls nothing out
 */
/**
 * Map engines report their trouble in their own words, and some of it is a
 * paragraph with a wiki link in it. One short sentence is what belongs on the
 * screen; the original still goes to the console for whoever is debugging.
 */
function readable(msg) {
  const t = String(msg || '');
  if (t) console.warn('[transport map]', t);          // eslint-disable-line no-console
  if (/webgl/i.test(t)) return 'This browser cannot draw map tiles — WebGL is switched off or unavailable. Everything else on this screen still works.';
  if (/api key|apikey/i.test(t)) return 'The map provider refused the API key. Check it in Settings → Integrations.';
  if (/network|fetch|load|timeout/i.test(t)) return 'The map tiles could not be reached. Check the connection and try again.';
  return t.split('. ')[0].slice(0, 160) || 'The map could not be loaded.';
}

export default function TrMap({
  routes = [], vehicles = [], pins = [], crew = [], trail = [], school, height = 300, legend = true,
  focusVehicle, onPickVehicle, basemap = 'map', onBasemap, tools,
  showStopLabels = false, className = '', emptyHint,
  onPickPoint, fallbackCenter = null, marker = null, viewKey,
  // { provider, tiles, apiKey } straight from the school's settings.
  map: mapConfig = null, tiles: tilesProp,
}) {
  const host = useRef(null);
  const engineRef = useRef(null);
  const pickRef = useRef(onPickPoint);
  pickRef.current = onPickPoint;
  const touched = useRef(false);        // once the camera is moved, stop refitting
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState('');
  const [size, setSize] = useState({ w: 760, h: height });
  // Bumped on every camera move; the overlay reads the engine's projection, so
  // it needs a reason to re-render.
  const [tick, setTick] = useState(0);

  const provider = mapConfig?.provider ?? (tilesProp === false ? 'builtin' : 'openfreemap');
  const apiKey = mapConfig?.apiKey || '';
  const tiles = provider !== 'builtin';
  const useGoogle = provider === 'google' && !!apiKey;
  const engineKey = `${provider}:${useGoogle ? 'keyed' : 'nokey'}`;

  const marks = useMemo(() => ([
    ...routes.flatMap((r) => r.stops || []),
    ...vehicles, ...pins, ...crew, ...trail,
    ...(marker ? [marker] : []), ...(school ? [school] : []),
  ].filter(hasPoint)), [routes, vehicles, pins, crew, trail, marker, school]);

  const applyViewRef = useRef(null);
  const applyView = useCallback((engine) => {
    engine?.setView(openingView(marks, school, fallbackCenter));
  }, [marks, school, fallbackCenter]);
  applyViewRef.current = applyView;

  /* ── The engine ───────────────────────────────────────────────────────── */
  // This effect OWNS the map: it creates it and its own cleanup destroys it.
  // A separate unmount-only teardown raced with React.StrictMode's
  // mount → cleanup → mount and could leave a map belonging to a cancelled pass.
  useEffect(() => {
    if (!tiles || !host.current) return undefined;
    if (provider === 'google' && !apiKey) {
      setFailed('Google Maps is selected but no API key has been saved — add one in Settings → Integrations.');
      return undefined;
    }
    let cancelled = false;
    let engine = null;
    setFailed('');

    const bump = () => { if (!cancelled) setTick((n) => n + 1); };
    const settle = () => {
      if (cancelled || !engine) return;
      setSize(engine.size());
      engine.resize();
      applyViewRef.current(engine);
      setReady(true);
      bump();
    };

    (async () => {
      const make = useGoogle ? createGoogleMap : createMapLibreMap;
      engine = await make(host.current, {
        apiKey, basemap,
        onMove: () => { bump(); if (engine) setSize(engine.size()); },
        onClick: (pt) => pickRef.current?.(pt),
        onUserMove: () => { touched.current = true; },
        onStyle: settle,
        onFailed: (msg) => { if (!cancelled) setFailed(readable(msg)); },
      });
      if (cancelled) { engine.destroy(); return; }
      engineRef.current = engine;
      // Ready as soon as the camera exists — the overlay does not need the
      // first painted frame, and waiting for one hid the marks on slow GPUs.
      settle();
      // Google's projection only exists once the OverlayView has drawn.
      if (useGoogle) setTimeout(settle, 0);
    })().catch((e) => {
      if (!cancelled) setFailed(readable(e?.message));
    });

    return () => {
      cancelled = true;
      (engine || engineRef.current)?.destroy();
      engineRef.current = null;
      setReady(false);
    };
  }, [engineKey, tiles]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Swapping basemap keeps the camera where it is.
  const appliedBasemap = useRef(basemap);
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready || appliedBasemap.current === basemap) return;
    appliedBasemap.current = basemap;
    engine.setBasemap(basemap);
  }, [basemap, ready]);

  // Frame the marks once, then leave the camera alone — refitting under someone
  // who has just panned somewhere is the most annoying thing a map can do.
  const fitKey = `${viewKey || ''}|${marks.length}|${marks[0]?.latitude},${marks[0]?.longitude}`;
  useEffect(() => {
    if (!ready || touched.current || !engineRef.current) return;
    applyView(engineRef.current);
  }, [fitKey, ready]);      // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { engineRef.current?.resize(); }, [height]);

  /**
   * Keep the engine's idea of its own size honest.
   *
   * Both engines measure the container when they are constructed and cache it.
   * If the card is still being laid out at that moment — a rail collapsing, a
   * tab becoming visible, fonts settling — the map is built against a box a few
   * pixels wide and renders into that, which looks exactly like a broken map:
   * a sliver in the top-left corner of an otherwise empty panel. Watching the
   * container and telling the engine whenever it changes removes the whole
   * class of problem.
   */
  useEffect(() => {
    const el = host.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    let last = '';
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      const h = Math.round(entry.contentRect.height);
      const key = `${w}x${h}`;
      if (!w || !h || key === last) return;
      last = key;
      const engine = engineRef.current;
      if (!engine) return;
      engine.resize();
      setSize(engine.size());
      setTick((n) => n + 1);
      // A map built against a collapsed box also has the wrong camera.
      if (!touched.current) applyViewRef.current(engine);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  /* ── Projection for the overlay ───────────────────────────────────────── */
  const engine = engineRef.current;
  const project = useCallback((lat, lng) => engine?.project(lat, lng) ?? null,
    [engine, tick]);        // eslint-disable-line react-hooks/exhaustive-deps

  const recentre = () => { touched.current = false; if (engineRef.current) applyView(engineRef.current); };
  const zoomBy = (d) => { touched.current = true; engineRef.current?.zoomBy(d); };

  const labelStops = showStopLabels
    && routes.reduce((n, r) => n + (r.stops || []).filter(hasPoint).length, 0) <= 14;
  const nothingToShow = !marks.length && !tiles;
  const { w, h } = size;
  const drawable = tiles ? (ready && !failed) : marks.length > 0;

  return (
    <div className={`tr-map ${className}`} style={{ height }}>
      {nothingToShow ? (
        <div className="tr-map__empty">
          <Ico name="mapPin" size={26} />
          <b style={{ color: 'var(--tr-ink-2)' }}>No coordinates to plot yet</b>
          <span>{emptyHint || 'Add latitude and longitude to your stops, and set the campus pin in Settings → General, and every bus and stop appears here.'}</span>
        </div>
      ) : (
        <>
          {tiles
            ? <div ref={host} className="tr-map__canvas" style={{ cursor: onPickPoint ? 'crosshair' : 'grab' }} />
            : <div className="tr-map__grid" aria-hidden="true" />}

          {drawable ? (
            <svg className="tr-map__marks" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
              {/* Route lines, drawn through their stops in sequence. */}
              {routes.map((r) => {
                const stops = [...(r.stops || [])].filter(hasPoint).sort((a, b) => (a.sequence || 0) - (b.sequence || 0));
                if (stops.length < 2) return null;
                const pts = stops.map((s) => project(s.latitude, s.longitude)).filter(Boolean);
                if (pts.length < 2) return null;
                const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ');
                return (
                  <g key={r._id || r.tag}>
                    <path d={d} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity=".9" />
                    <path d={d} fill="none" stroke={r.color || '#2563eb'} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                  </g>
                );
              })}

              {/* Where someone has been today */}
              {trail.filter(hasPoint).length > 1 ? (() => {
                const pts = trail.filter(hasPoint).map((p) => project(p.latitude, p.longitude)).filter(Boolean);
                if (pts.length < 2) return null;
                return (
                  <g>
                    <path d={pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')}
                          fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinecap="round"
                          strokeLinejoin="round" opacity=".6" strokeDasharray="1 6" />
                    {pts.slice(0, -1).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="2.4" fill="#6366f1" opacity=".55" />)}
                  </g>
                );
              })() : null}

              {/* Stops */}
              {routes.flatMap((r) => (r.stops || []).filter(hasPoint).map((s) => {
                const p = project(s.latitude, s.longitude);
                if (!p) return null;
                return (
                  <g key={`${r._id}-${s._id || s.name}`}>
                    <circle cx={p.x} cy={p.y} r="6" fill="#fff" stroke={r.color || '#2563eb'} strokeWidth="3">
                      <title>{`${s.name}${r.tag ? ` · ${r.tag}` : ''}`}</title>
                    </circle>
                    {labelStops ? (
                      <text x={p.x} y={p.y - 11} textAnchor="middle"
                            style={{ fontSize: 11, fontWeight: 600, fill: '#1f2937',
                                     paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3.5 }}>{s.name}</text>
                    ) : null}
                  </g>
                );
              }))}

              {/* The campus */}
              {hasPoint(school) ? (() => {
                const p = project(school.latitude, school.longitude);
                if (!p) return null;
                return (
                  <g>
                    <circle cx={p.x} cy={p.y} r="17" fill="#4f46e5" opacity=".18" />
                    <circle cx={p.x} cy={p.y} r="12" fill="#4f46e5" stroke="#fff" strokeWidth="2" />
                    <g transform={`translate(${p.x - 8} ${p.y - 8}) scale(.67)`} style={{ color: '#fff' }}>
                      <Glyph name="building" size={24} />
                    </g>
                    <title>{school.name || 'School'}</title>
                  </g>
                );
              })() : null}

              {/* One-off pins (incident locations) */}
              {pins.filter(hasPoint).map((x, i) => {
                const p = project(x.latitude, x.longitude);
                if (!p) return null;
                const c = STATE_INK[x.state] || x.color || '#dc2626';
                return (
                  <g key={x._id || i} className="tr-map__pin">
                    <path d={`M${p.x} ${p.y} c -7 -9 -10 -13 -10 -18 a10 10 0 0 1 20 0 c0 5 -3 9 -10 18Z`} fill={c} stroke="#fff" strokeWidth="1.5" />
                    <circle cx={p.x} cy={p.y - 18} r="3.6" fill="#fff" />
                    <title>{x.title || x.label || ''}</title>
                  </g>
                );
              })}

              {/* Crew sharing a position from their own device */}
              {crew.filter(hasPoint).map((c) => {
                const p = project(c.latitude, c.longitude);
                if (!p) return null;
                const tone = c.stale ? '#94a3b8' : c.staffType === 'driver' ? '#0891b2' : '#7c3aed';
                return (
                  <g key={`crew-${c._id}`} className="tr-map__pin">
                    <circle cx={p.x} cy={p.y} r="10" fill={tone} stroke="#fff" strokeWidth="2.5" />
                    <text x={p.x} y={p.y + 3.4} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, fill: '#fff' }}>
                      {String(c.name || '?').trim().charAt(0).toUpperCase()}
                    </text>
                    <title>{`${c.name} · ${c.roleLabel}${c.stale ? ' · last seen a while ago' : ''}`}</title>
                  </g>
                );
              })}

              {/* Vehicles, each with its number on a flag */}
              {vehicles.filter(hasPoint).map((x) => {
                const p = project(x.latitude, x.longitude);
                if (!p) return null;
                const c = STATE_INK[x.state] || x.route?.color || '#2563eb';
                const on = String(focusVehicle || '') === String(x._id || x.vehicle);
                const label = x.vehicleNumber || x.vehicle || '';
                const lw = Math.max(42, label.length * 7.5 + 14);
                return (
                  <g key={x._id || label} className="tr-map__pin" onClick={() => onPickVehicle?.(x)}>
                    {on ? <circle cx={p.x} cy={p.y} r="21" fill={c} opacity=".2" /> : null}
                    <rect x={p.x - lw / 2} y={p.y - 32} width={lw} height="19" rx="5" fill="#fff" stroke={c} strokeWidth={on ? 2 : 1.4} />
                    <text x={p.x} y={p.y - 18.5} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: '#334155' }}>{label}</text>
                    <circle cx={p.x} cy={p.y} r="12" fill={c} stroke="#fff" strokeWidth="2.5" />
                    <g transform={`translate(${p.x - 7.5} ${p.y - 7.5}) scale(.62)`} style={{ color: '#fff' }}>
                      <Glyph name="bus" size={24} />
                    </g>
                    {x.delayMinutes > 0 ? (
                      <>
                        <rect x={p.x - 30} y={p.y + 13} width="60" height="17" rx="5" fill="#fee2e2" stroke="#fecaca" />
                        <text x={p.x} y={p.y + 24.5} textAnchor="middle" style={{ fontSize: 9.5, fontWeight: 700, fill: '#b91c1c' }}>
                          {x.delayMinutes} mins late
                        </text>
                      </>
                    ) : null}
                    <title>{`${label}${x.route?.tag ? ` · ${x.route.tag}` : ''}${x.speed != null ? ` · ${x.speed} km/h` : ''}`}</title>
                  </g>
                );
              })}

              {/* The point being picked */}
              {hasPoint(marker) ? (() => {
                const p = project(marker.latitude, marker.longitude);
                if (!p) return null;
                return (
                  <g>
                    <circle cx={p.x} cy={p.y} r="24" fill="#4f46e5" opacity=".16" />
                    <path d={`M${p.x} ${p.y} c -9 -12 -13 -17 -13 -23 a13 13 0 0 1 26 0 c0 6 -4 11 -13 23Z`}
                          fill="#4f46e5" stroke="#fff" strokeWidth="2" />
                    <circle cx={p.x} cy={p.y - 23} r="4.6" fill="#fff" />
                  </g>
                );
              })() : null}
            </svg>
          ) : null}

          {tiles && !ready && !failed ? (
            <div className="tr-map__loading"><span className="tr-skel" /></div>
          ) : null}
          {failed ? (
            <div className="tr-map__empty">
              <Ico name="wifiOff" size={26} />
              <b style={{ color: 'var(--tr-ink-2)' }}>The map could not be loaded</b>
              <span>{failed}</span>
            </div>
          ) : null}
        </>
      )}

      {(onBasemap || tools) && !nothingToShow && !failed ? (
        <div className="tr-map__tools">
          {onBasemap ? (
            <div className="tr-seg" style={{ background: '#fff', boxShadow: 'var(--tr-shadow)' }}>
              <button type="button" aria-pressed={basemap === 'map'} onClick={() => onBasemap('map')}>Map</button>
              <button type="button" aria-pressed={basemap === 'satellite'} onClick={() => onBasemap('satellite')}>Satellite</button>
            </div>
          ) : null}
          {tools}
        </div>
      ) : null}

      {!nothingToShow && !failed ? (
        <div className="tr-map__zoom">
          <button type="button" aria-label="Recentre" onClick={recentre}><Ico name="target" size={15} /></button>
          <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1)}><Ico name="plus" size={15} /></button>
          <button type="button" aria-label="Zoom out" onClick={() => zoomBy(-1)}><Ico name="minus" size={15} /></button>
        </div>
      ) : null}

      {legend && !nothingToShow && !failed ? (
        <div className="tr-map__legend">
          <span><i className="tr-dot" style={{ background: STATE_INK.on_route }} />On Route</span>
          <span><i className="tr-dot" style={{ background: STATE_INK.at_stop }} />At Stop</span>
          <span><i className="tr-dot" style={{ background: STATE_INK.delayed }} />Delayed</span>
          <span><i className="tr-dot" style={{ background: STATE_INK.maintenance }} />In Maintenance</span>
          <span><i className="tr-dot" style={{ background: STATE_INK.offline }} />Offline</span>
        </div>
      ) : null}
    </div>
  );
}

export { STATE_INK };
