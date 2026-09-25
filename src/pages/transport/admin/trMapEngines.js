/**
 * The two map engines behind TrMap.
 *
 * Both answer the same three questions — where is the camera, what pixel does
 * this coordinate sit at, and did it fail — so the component that draws routes,
 * buses and crew does not care which one is running. Everything visible on the
 * map is still an SVG overlay drawn by trMap.jsx; these only supply the
 * basemap and the projection.
 */

/** Is this actually a coordinate? `+null` is 0, so Number.isFinite is not the test. */
export const isCoord = (v) => v !== null && v !== undefined && v !== ''
  && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 180;
export const hasPoint = (p) => isCoord(p?.latitude) && isCoord(p?.longitude)
  && !(Number(p.latitude) === 0 && Number(p.longitude) === 0);

export const CITY_Z = 12;
export const PLACE_Z = 15;
export const WORLD = { latitude: 20.5937, longitude: 78.9629, zoom: 4 };

/* ── Google Maps ──────────────────────────────────────────────────────────── */

let googleLoader = null;

/**
 * Google reports most key problems by writing to the console and rendering
 * nothing — `ApiNotActivatedMapError`, `BillingNotEnabledMapError`,
 * `RefererNotAllowedMapError`, `InvalidKeyMapError`. `gm_authFailure` does not
 * fire for all of them, so the screen would otherwise sit blank with the real
 * answer hidden in devtools. This keeps the last such line so the map can show
 * it.
 */
let lastGoogleConsoleError = '';
export const googleConsoleError = () => lastGoogleConsoleError;
const GOOGLE_ERROR_HELP = {
  ApiNotActivatedMapError: 'the Maps JavaScript API is not enabled on that Cloud project',
  BillingNotEnabledMapError: 'the Cloud project has no billing account attached',
  RefererNotAllowedMapError: 'this address is not in the key\'s HTTP referrer list',
  InvalidKeyMapError: 'the key is not valid',
  ExpiredKeyMapError: 'the key has expired',
  MissingKeyMapError: 'no key was sent',
  RefererDeniedMapError: 'this address is blocked by the key\'s restrictions',
};
function watchGoogleConsole() {
  if (watchGoogleConsole.on) return;
  watchGoogleConsole.on = true;
  const real = console.error.bind(console);
  console.error = (...args) => {
    const text = args.map((a) => (typeof a === 'string' ? a : a?.message || '')).join(' ');
    if (/Google Maps JavaScript API/i.test(text)) {
      const code = Object.keys(GOOGLE_ERROR_HELP).find((k) => text.includes(k));
      lastGoogleConsoleError = code
        ? `Google refused the key: ${code} — ${GOOGLE_ERROR_HELP[code]}.`
        : text.slice(0, 200);
    }
    real(...args);
  };
}

/**
 * Collect the classes this module needs, whichever bootstrap Google served.
 *
 * Google's loader comes in two shapes and you do not get to choose which:
 *   · the modern one exposes ONLY `importLibrary`, so reading `google.maps.Map`
 *     gives undefined and calling it fails with "maps.Map is not a constructor";
 *   · the classic one puts every class straight on `google.maps`.
 * Both are handled here so the engine above never has to care.
 */
async function resolveGoogleLibraries() {
  const g = window.google?.maps;
  if (!g) throw new Error('Google Maps did not load');
  if (typeof g.importLibrary === 'function') {
    const [mapsLib, coreLib] = await Promise.all([g.importLibrary('maps'), g.importLibrary('core')]);
    if (!mapsLib?.Map) throw new Error('Google Maps loaded but did not provide its Map class');
    return {
      Map: mapsLib.Map, OverlayView: mapsLib.OverlayView,
      LatLng: coreLib.LatLng, LatLngBounds: coreLib.LatLngBounds, event: g.event,
    };
  }
  if (typeof g.Map !== 'function') throw new Error('Google Maps loaded but did not provide its Map class');
  return { Map: g.Map, OverlayView: g.OverlayView, LatLng: g.LatLng, LatLngBounds: g.LatLngBounds, event: g.event };
}

/**
 * Load the Google Maps JS API once per page, whatever asks for it.
 *
 * Loaded with `callback=`, which is the only signal that means "the API is
 * ready". The script's own `onload` fires while the classic bootstrap is still
 * fetching the real payload, so reading the API there finds nothing.
 *
 * An invalid key, a key without billing, or one whose referrer restrictions do
 * not cover this host all fail the same way: Google calls `gm_authFailure` and
 * leaves a blank map with a console warning. That is hooked so the screen can
 * say what happened instead of showing an empty grey box.
 */
export function loadGoogleMaps(apiKey) {
  if (typeof window === 'undefined') return Promise.reject(new Error('No browser'));
  watchGoogleConsole();
  if (googleLoader) return googleLoader;
  if (window.google?.maps?.Map || window.google?.maps?.importLibrary) {
    googleLoader = resolveGoogleLibraries();
    return googleLoader;
  }

  googleLoader = new Promise((resolve, reject) => {
    const CB = '__trGoogleMapsReady';
    const fail = (msg) => { googleLoader = null; reject(new Error(msg)); };
    const timer = setTimeout(
      () => fail('Google Maps did not finish loading. The key may be rejected, or the script may be blocked.'),
      20000,
    );
    window.gm_authFailure = () => {
      clearTimeout(timer);
      fail('Google rejected the API key. Check that billing is enabled on the Cloud project, the Maps JavaScript API is turned on, and this address is allowed by the key\'s HTTP referrer restrictions.');
    };
    window[CB] = () => {
      clearTimeout(timer);
      resolveGoogleLibraries().then(resolve, (e) => fail(e.message));
    };
    const el = document.createElement('script');
    el.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`
           + `&v=weekly&loading=async&callback=${CB}`;
    el.async = true;
    el.onerror = () => { clearTimeout(timer); fail('The Google Maps script could not be downloaded — check the network and any ad blocker'); };
    document.head.appendChild(el);
  });
  return googleLoader;
}

/**
 * Start a Google map in `container`.
 *
 * Returns the same shape the MapLibre engine returns, so trMap.jsx treats them
 * identically. The projection comes from an OverlayView, which is the only way
 * Google exposes lat/lng → container pixels.
 */
export async function createGoogleMap(container, { apiKey, basemap, onMove, onClick, onUserMove, onFailed }) {
  const { Map, OverlayView, LatLng, LatLngBounds, event } = await loadGoogleMaps(apiKey);
  const map = new Map(container, {
    center: { lat: WORLD.latitude, lng: WORLD.longitude },
    zoom: WORLD.zoom,
    mapTypeId: basemap === 'satellite' ? 'hybrid' : 'roadmap',
    disableDefaultUI: true,          // the module draws its own controls
    gestureHandling: 'greedy',
    clickableIcons: false,
    keyboardShortcuts: false,
    // North-up: the SVG overlay's maths assumes no rotation or tilt.
    rotateControl: false, tilt: 0,
  });

  // An OverlayView is the documented way to get a projection out of Google.
  const overlay = new OverlayView();
  overlay.onAdd = () => {};
  overlay.draw = () => onMove?.();
  overlay.onRemove = () => {};
  overlay.setMap(map);

  map.addListener('bounds_changed', () => onMove?.());
  map.addListener('idle', () => onMove?.());
  map.addListener('dragstart', () => onUserMove?.());
  map.addListener('click', (e) => onClick?.({
    latitude: +e.latLng.lat().toFixed(6), longitude: +e.latLng.lng().toFixed(6),
  }));
  // Only a wheel/pinch/button zoom counts as the user taking over; fitBounds
  // fires zoom_changed too and must not stop the map ever re-framing itself.
  map.addListener('zoom_changed', () => { if (map.__trUserZoom) onUserMove?.(); });
  container.addEventListener('wheel', () => { map.__trUserZoom = true; }, { passive: true });

  // Constructed-but-never-rendered is what a refused key looks like: no
  // `.gm-style`, no tiles, no exception. Watch for it and report the reason
  // rather than leaving an empty box.
  let painted = false;
  map.addListener('tilesloaded', () => { painted = true; });
  map.addListener('idle', () => { painted = true; });
  setTimeout(() => {
    const chrome = container.querySelector('.gm-style');
    if (chrome) {
      const r = chrome.getBoundingClientRect();
      if (r.width < 60 || r.height < 60) {
        onFailed?.(`Google drew the map into a ${Math.round(r.width)}×${Math.round(r.height)} box — it measured the panel before it had been laid out.`);
      }
      return;
    }
    if (painted) return;
    onFailed?.(lastGoogleConsoleError
      || 'Google Maps loaded but drew nothing. That is almost always the key: check that billing is enabled, the Maps JavaScript API is on, and this address is allowed by the key\'s referrer restrictions.');
  }, 9000);

  return {
    kind: 'google',
    raw: map,
    project(lat, lng) {
      const proj = overlay.getProjection?.();
      if (!proj) return null;
      const p = proj.fromLatLngToContainerPixel(new LatLng(Number(lat), Number(lng)));
      return p ? { x: p.x, y: p.y } : null;
    },
    setView(view) {
      if (view.bounds) {
        const b = new LatLngBounds();
        view.bounds.forEach(([lng, lat]) => b.extend(new LatLng(lat, lng)));
        map.fitBounds(b, 60);
        // fitBounds can zoom absurdly close on two stops in one street.
        event.addListenerOnce(map, 'idle', () => { if (map.getZoom() > 16) map.setZoom(16); });
      } else {
        map.setCenter({ lat: view.latitude, lng: view.longitude });
        map.setZoom(view.zoom);
      }
    },
    setBasemap(next) { map.setMapTypeId(next === 'satellite' ? 'hybrid' : 'roadmap'); },
    zoomBy(d) { map.__trUserZoom = true; map.setZoom((map.getZoom() || WORLD.zoom) + d); },
    size() { return { w: container.clientWidth, h: container.clientHeight }; },
    resize() {
      // Modern Maps JS watches its own container, but a map constructed against
      // a not-yet-laid-out box keeps that stale size until something nudges it.
      try { event.trigger(map, 'resize'); } catch { /* not needed on new builds */ }
      const c = map.getCenter?.();
      if (c) map.setCenter(c);     // re-centres against the corrected viewport
    },
    destroy() { overlay.setMap(null); container.innerHTML = ''; },
  };
}

/* ── MapLibre / OpenFreeMap ───────────────────────────────────────────────── */

export const MAPLIBRE_STYLES = {
  map: 'https://tiles.openfreemap.org/styles/liberty',
  satellite: {
    version: 8,
    sources: {
      esri: {
        type: 'raster', tileSize: 256, maxzoom: 19,
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        attribution: 'Imagery © Esri, Maxar, Earthstar Geographics',
      },
    },
    layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
  },
};

export async function createMapLibreMap(container, { basemap, onMove, onClick, onUserMove, onStyle }) {
  // MapLibre v6 has NO default export — named exports only, so `{ default: x }`
  // is undefined and `new x.Map()` throws into a silent blank map.
  const [mod] = await Promise.all([
    import('maplibre-gl'),
    import('maplibre-gl/dist/maplibre-gl.css'),
  ]);
  const maplibregl = mod?.Map ? mod : mod?.default;
  if (!maplibregl?.Map) throw new Error('MapLibre did not load');

  const map = new maplibregl.Map({
    container,
    style: MAPLIBRE_STYLES[basemap] || MAPLIBRE_STYLES.map,
    center: [WORLD.longitude, WORLD.latitude],
    zoom: WORLD.zoom,
    attributionControl: { compact: true },
    dragRotate: false, pitchWithRotate: false, touchZoomRotate: true,
  });
  map.touchZoomRotate?.disableRotation();
  map.on('move', () => onMove?.());
  map.on('zoom', () => onMove?.());
  map.on('resize', () => onMove?.());
  map.on('dragstart', () => onUserMove?.());
  map.on('zoomstart', (e) => { if (e.originalEvent) onUserMove?.(); });
  map.on('click', (e) => onClick?.({
    latitude: +e.lngLat.lat.toFixed(6), longitude: +e.lngLat.lng.toFixed(6),
  }));
  // `styledata`, not `load`: `load` also waits for the first PAINTED frame,
  // which slow or software WebGL may never deliver.
  map.once('styledata', () => onStyle?.());

  return {
    kind: 'maplibre',
    raw: map,
    project(lat, lng) {
      const p = map.project([Number(lng), Number(lat)]);
      return { x: p.x, y: p.y };
    },
    setView(view) {
      if (view.bounds) {
        const lngs = view.bounds.map((b) => b[0]);
        const lats = view.bounds.map((b) => b[1]);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 60, maxZoom: 16, duration: 0 });
      } else {
        map.jumpTo({ center: [view.longitude, view.latitude], zoom: view.zoom });
      }
    },
    setBasemap(next) {
      map.setStyle(MAPLIBRE_STYLES[next] || MAPLIBRE_STYLES.map);
      map.once('styledata', () => onStyle?.());
    },
    zoomBy(d) { map[d > 0 ? 'zoomIn' : 'zoomOut'](); },
    size() { const c = map.getCanvas(); return { w: c.clientWidth, h: c.clientHeight }; },
    resize() { map.resize(); },
    isStyleLoaded() { return !!map.isStyleLoaded?.(); },
    destroy() { try { map.remove(); } catch { /* already gone */ } },
  };
}

/**
 * Where the map opens: the school first, then whatever marks there are.
 */
export function openingView(marks, school, fallback) {
  const pts = marks.filter(hasPoint);
  if (pts.length > 1) return { bounds: pts.map((p) => [Number(p.longitude), Number(p.latitude)]) };
  if (hasPoint(school)) return { latitude: +school.latitude, longitude: +school.longitude, zoom: CITY_Z };
  if (pts.length === 1) return { latitude: +pts[0].latitude, longitude: +pts[0].longitude, zoom: PLACE_Z };
  if (hasPoint(fallback)) return { latitude: +fallback.latitude, longitude: +fallback.longitude, zoom: CITY_Z };
  return WORLD;
}
