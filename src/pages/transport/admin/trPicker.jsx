/**
 * Picking a place instead of typing two numbers.
 *
 * Four ways in, all producing the same pair of coordinates:
 *   · search for an address — "4 Bishop Lefroy Road, Kolkata" — and pick a result;
 *   · click the real map, then drag to nudge;
 *   · "Use my current location", when standing at the stop;
 *   · paste anything containing a coordinate (a Google/Apple Maps link, a pair).
 *
 * The basemap is OpenFreeMap and the address search is OpenStreetMap's
 * Nominatim. Both are third parties, so they are named on screen rather than
 * left for someone to find in a network tab, and a school that would rather
 * send nothing can switch to the plain grid in Settings → Integrations.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Modal, Btn, Field, Input, Note, Badge, Ico, Empty, Search,
} from './trUI';
import TrMap, { hasPoint, isCoord } from './trMap';

/** Pull a lat/lng out of pasted text: a maps URL, a pair, an @lat,lng. */
export function parseCoordinates(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  // Google Maps puts the viewport centre after @ and the actual place in !3d!4d.
  const place = /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(s);
  if (place) return { latitude: +place[1], longitude: +place[2] };
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(s);
  if (at) return { latitude: +at[1], longitude: +at[2] };
  const q = /[?&](?:q|ll|daddr|destination)=(-?\d+(?:\.\d+)?)[,%2C\s]+(-?\d+(?:\.\d+)?)/i.exec(s);
  if (q) return { latitude: +q[1], longitude: +q[2] };
  // A bare pair, but only when BOTH sides are numbers — "4, bishop lefroy road"
  // must not be read as a coordinate.
  const pair = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(s);
  if (pair) {
    const latitude = +pair[1], longitude = +pair[2];
    if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
  }
  return null;
}

const fmt = (n) => (isCoord(n) ? Number(n).toFixed(6) : '');

/**
 * @param value      { latitude, longitude } | null — what is set now
 * @param reference  { routes, school, pins } — the school's own marks, for context
 */
export function LocationPicker({ open, onClose, onPick, value, title = 'Pick the location',
                                 subtitle, reference = {} }) {
  // reference.map is the school's { provider, tiles, apiKey }, from getMeta.
  const [point, setPoint] = useState(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [basemap, setBasemap] = useState('map');

  useEffect(() => {
    if (!open) return;
    setQuery(''); setResults(null); setSearching(false);
    setPoint(hasPoint(value) ? { latitude: +value.latitude, longitude: +value.longitude } : null);
  }, [open, value?.latitude, value?.longitude]);

  const school = reference.school;
  // Something has to anchor the view before anything is placed.
  const fallbackCenter = useMemo(() => {
    if (hasPoint(school)) return { latitude: +school.latitude, longitude: +school.longitude };
    const firstStop = (reference.routes || []).flatMap((r) => r.stops || []).find(hasPoint);
    return firstStop ? { latitude: +firstStop.latitude, longitude: +firstStop.longitude } : null;
  }, [school, reference.routes]);

  /** Address → coordinates, via OpenStreetMap's search. */
  const runSearch = async (text) => {
    const q = String(text ?? query).trim();
    if (q.length < 3) { toast.error('Type a few more characters to search'); return; }
    const coords = parseCoordinates(q);
    if (coords) { setPoint(coords); setResults(null); return; }
    setSearching(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&addressdetails=1&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Search is unavailable (${res.status})`);
      const rows = await res.json();
      setResults(rows.map((r) => ({
        id: r.place_id, label: r.display_name,
        latitude: +r.lat, longitude: +r.lon, kind: r.type,
      })));
      if (!rows.length) toast('Nothing found for that address', { icon: '🔍' });
    } catch (e) {
      toast.error(e.message || 'Could not reach the address search');
      setResults([]);
    } finally { setSearching(false); }
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) { toast.error('This browser cannot report a location'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPoint({ latitude: +pos.coords.latitude.toFixed(6), longitude: +pos.coords.longitude.toFixed(6) });
        setResults(null); setLocating(false);
        toast.success(`Placed within about ${Math.round(pos.coords.accuracy)} m`);
      },
      (err) => {
        setLocating(false);
        toast.error(err.code === 1 ? 'Location permission was refused' : 'Could not get a location from this device');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <Modal open={open} onClose={onClose} wide icon="pin" iconTone="pink" title={title} sub={subtitle}
           foot={<>
             {point ? <Btn kind="ghost" onClick={() => setPoint(null)}>Clear</Btn> : null}
             <Btn onClick={onClose}>Cancel</Btn>
             <Btn kind="primary" disabled={!point} onClick={() => { onPick(point); onClose(); }}>
               Use this location
             </Btn>
           </>}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: '1 1 320px', minWidth: 0 }}>
          <Search value={query} onChange={setQuery} onEnter={runSearch} grow={false}
                  placeholder="Search an address, landmark, or paste a maps link…" />
        </div>
        <Btn kind="primary" icon="search" onClick={() => runSearch()} disabled={searching}>
          {searching ? 'Searching…' : 'Search'}
        </Btn>
        <Btn icon="target" onClick={useMyLocation} disabled={locating}>
          {locating ? 'Locating…' : 'My location'}
        </Btn>
      </div>

      {results ? (
        <div style={{ border: '1px solid var(--tr-line)', borderRadius: 12, marginBottom: 12, maxHeight: 176, overflow: 'auto' }}>
          {results.length ? results.map((r) => (
            <button key={r.id} type="button" className="tr-row tr-row--pick"
                    onClick={() => { setPoint({ latitude: r.latitude, longitude: r.longitude }); setResults(null); }}>
              <span style={{ color: 'var(--tr-primary)', display: 'inline-flex' }}><Ico name="mapPin" size={17} /></span>
              <div className="tr-row__text"><b>{r.label.split(',')[0]}</b><span>{r.label}</span></div>
            </button>
          )) : <Empty icon="pin" sm title="Nothing found">Try the area or the city name as well.</Empty>}
        </div>
      ) : null}

      <TrMap height={340} routes={reference.routes || []} school={school} pins={reference.pins || []}
             marker={point} onPickPoint={setPoint} fallbackCenter={fallbackCenter} legend={false}
             basemap={basemap} onBasemap={setBasemap} showStopLabels map={reference.map}
             viewKey={point ? `${point.latitude},${point.longitude}` : 'none'} />

      <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Latitude" hint={point ? undefined : 'Search above, or click the map'}>
          <Input value={fmt(point?.latitude)} readOnly placeholder="—" style={{ width: 150 }} />
        </Field>
        <Field label="Longitude">
          <Input value={fmt(point?.longitude)} readOnly placeholder="—" style={{ width: 150 }} />
        </Field>
        {point ? <Badge tone="green" dot="green">Placed</Badge> : <Badge tone="slate">Not set</Badge>}
        <span style={{ marginLeft: 'auto', fontSize: '.72rem', color: 'var(--tr-muted)' }}>
          Map by {reference.map?.provider === 'google' ? 'Google' : 'OpenFreeMap'} · search by OpenStreetMap
        </span>
      </div>
    </Modal>
  );
}

/**
 * The form control that replaces a pair of number inputs: shows what is set,
 * opens the picker, and lets it be cleared.
 */
export function LocationField({ label = 'Location', hint, value, onChange, reference, title, subtitle, full }) {
  const [open, setOpen] = useState(false);
  const set = hasPoint(value);
  return (
    <div className={full ? 'tr-formgrid__full' : undefined}>
      <span className="tr-field__label">{label}</span>
      <div className="tr-locfield">
        <span className="tr-locfield__ico"><Ico name="mapPin" size={17} /></span>
        <span className="tr-locfield__text">
          {set ? <b>{fmt(value.latitude)}, {fmt(value.longitude)}</b> : <i>No location set</i>}
        </span>
        <Btn size="sm" kind={set ? 'ghost' : 'soft'} icon="mapPin" onClick={() => setOpen(true)}>
          {set ? 'Change' : 'Pick on map'}
        </Btn>
        {set ? <Btn size="sm" kind="ghost" onClick={() => onChange(null)}>Clear</Btn> : null}
      </div>
      {hint ? <span className="tr-field__hint">{hint}</span> : null}
      <LocationPicker open={open} onClose={() => setOpen(false)} value={value} onPick={onChange}
                      reference={reference} title={title || `Pick the ${String(label).toLowerCase()}`} subtitle={subtitle} />
    </div>
  );
}

export default LocationPicker;
