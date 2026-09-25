/**
 * Report this device's position while a run is under way.
 *
 * NOTHING in either client ever called `POST /transport/staff/location`. The
 * endpoint, the TransportStaffLocation model, the trail, the admin's "Sharing
 * Location" tile and the parent's "last reported" all existed and all waited
 * for a ping that was never sent — the whole live map was a read surface over
 * data only the seed script wrote.
 *
 * This is the producer. It runs only while BOTH are true: the crew member has
 * sharing switched on, and a run is actually in progress. Off duty, nothing is
 * collected — which is the promise the toggle makes.
 */
import { useEffect, useRef, useState } from 'react';
import * as api from '../../../api/transport.api';

const MIN_GAP_MS = 20000;        // don't post more often than this
const MIN_MOVE_M = 25;           // or for a bus that has not really moved

const metres = (a, b) => {
  const R = 6371000, rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude), dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

export function useLocationReporter({ active, trip }) {
  const [state, setState] = useState({ on: false, at: null, error: '', sent: 0 });
  const last = useRef({ at: 0, point: null });
  const sent = useRef(0);

  useEffect(() => {
    if (!active) { setState((s) => ({ ...s, on: false })); return undefined; }
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setState({ on: false, at: null, sent: 0, error: 'This device cannot report a position' });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, on: true, error: '' }));

    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        if (!alive) return;
        const now = Date.now();
        const point = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        // A bus parked at a stop would otherwise post every second all morning.
        const still = last.current.point && metres(last.current.point, point) < MIN_MOVE_M;
        if (now - last.current.at < MIN_GAP_MS || (still && now - last.current.at < MIN_GAP_MS * 6)) return;
        last.current = { at: now, point };
        api.crewPushLocation({
          ...point,
          accuracy: pos.coords.accuracy ?? null,
          speed: pos.coords.speed ?? 0,
          heading: pos.coords.heading ?? 0,
          trip: trip || null,
          source: 'device',
          recordedAt: new Date(pos.timestamp || now).toISOString(),
        }).then(() => {
          if (!alive) return;
          sent.current += 1;
          setState({ on: true, at: new Date(), error: '', sent: sent.current });
        }).catch((e) => {
          if (alive) setState((s) => ({ ...s, error: e?.message || 'The last position did not send' }));
        });
      },
      (err) => {
        if (!alive) return;
        setState({ on: false, at: null, sent: sent.current,
          error: err?.code === 1 ? 'This browser is blocking location for the site'
            : 'The device could not get a position' });
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
    return () => { alive = false; navigator.geolocation.clearWatch(watch); };
  }, [active, trip]);

  return state;
}
