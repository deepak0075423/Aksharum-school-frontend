/**
 * Hostel → Occupancy Map (Sep 2026 redesign, to the user's mockup).
 *
 * The structure tree on the left, the chosen floor drawn as a plan on the
 * right: each room with its beds, each bed tinted by its state and carrying
 * the name of whoever sleeps in it. GET /hostel/admin/board/occupancy answers
 * the tree, the chosen building's figures and the chosen floor's rooms in one
 * call; the bed states are BED_STATE's, so the key under the plan, the tiles
 * above it and the Rooms & Beds screen can never disagree.
 */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import Icon from '../../../components/ui/icons';
import { PageHead, Mark, Glyph, count, plural } from './hsUI';
import { Kpis, Kpi, FSearch, FSelect, Btn, IconBtn, EmptyRows, useBoardData, exportCsv, fmtDate } from './hsList';
import { RoomFormModal, RoomDrawer, BedFormModal, BedDrawer, BED_STATE, roomTypeLabel } from './hsRoom';

/** The plan's key. `out` is a bed taken out of service — "Inactive" to a warden. */
const KEY = [
  ['available', 'Available', 'bedSolid'], ['occupied', 'Occupied', 'bedSolid'], ['reserved', 'Reserved', 'bedSolid'],
  ['maintenance', 'Maintenance', 'tools'], ['inactive', 'Inactive', 'bedSolid'],
];
const stateOf = (b) => (b.state === 'out' ? 'inactive' : b.state);

/** Rooms are laid out in rows of about this many beds, a corridor between rows. */
const ROW_UNITS = 14.5;
const unitsOf = (r) => Math.max(2, r.bedList?.length || 0) + 0.7;
function rowsOf(rooms) {
  const rows = []; let row = []; let used = 0;
  for (const r of rooms) {
    const u = unitsOf(r);
    if (row.length && used + u > ROW_UNITS) { rows.push(row); row = []; used = 0; }
    row.push(r); used += u;
  }
  if (row.length) rows.push(row);
  return rows;
}

const PLAN_W = 900;             // the plan's natural width; Fit View scales it to the card
const ZOOMS = [0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.15, 1.3, 1.5];

export default function Occupancy() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [state, setState] = useState({ hostel: sp.get('hostel') || '', building: sp.get('building') || '', floor: sp.get('floor') || '' });
  const { data, loading, error, reload } = useBoardData((q) => api.getBoard('occupancy', q), state);
  const { data: meta } = useFetch(api.getMeta, []);

  const [focus, setFocus] = useState(sp.get('room') || '');
  const [term, setTerm] = useState('');
  const [shut, setShut] = useState(new Set());       // tree nodes the user collapsed
  const [opened, setOpened] = useState(new Set());   // …and the ones they opened
  const [roomView, setRoomView] = useState(null);
  const [roomForm, setRoomForm] = useState(null);
  const [bedView, setBedView] = useState(null);
  const [bedForm, setBedForm] = useState(null);
  const [zoom, setZoom] = useState(null);            // null = fit to the card
  const [fit, setFit] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [tick, setTick] = useState(0);
  const stage = useRef(null);

  const tree = data?.tree || [];
  const t = data?.tiles || {};
  const rooms = data?.rooms || [];
  const hostel = tree.find((h) => h._id === data?.hostel) || null;
  const building = hostel?.buildings.find((b) => b._id === data?.building) || null;
  const planRows = useMemo(() => rowsOf(rooms), [rooms]);
  const refresh = () => { reload(); setTick((n) => n + 1); };

  // Fit View: the scale at which the plan's natural width fills the card.
  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return undefined;
    const measure = () => setFit(Math.min(1.15, Math.max(0.35, (el.clientWidth - 2) / PLAN_W)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data?.floor]);
  const z = zoom ?? fit;
  const step = (dir) => {
    const at = ZOOMS.findIndex((v) => v >= z - 0.001);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (at < 0 ? ZOOMS.length - 1 : at) + dir))];
    setZoom(next);
  };

  // Bring the room picked in the tree into view on the plan.
  useEffect(() => {
    if (!focus || !rooms.some((r) => String(r._id) === focus)) return;
    document.getElementById(`hs-room-${focus}`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [focus, rooms]);

  /* ── The tree ──────────────────────────────────────────────────────────── */
  const q = term.trim().toLowerCase();
  const hit = (s) => String(s || '').toLowerCase().includes(q);
  const shown = useMemo(() => {
    if (!q) return tree;
    // Keep a branch when it, or anything under it, matches.
    return tree.map((h) => {
      const buildings = h.buildings.map((b) => {
        const floors = b.floors.map((f) => {
          const rs = f.rooms.filter((r) => hit(r.name));
          return (rs.length || hit(f.name)) ? { ...f, rooms: rs.length ? rs : f.rooms } : null;
        }).filter(Boolean);
        return (floors.length || hit(b.name)) ? { ...b, floors: floors.length ? floors : b.floors } : null;
      }).filter(Boolean);
      return (buildings.length || hit(h.name)) ? { ...h, buildings: buildings.length ? buildings : h.buildings } : null;
    }).filter(Boolean);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, q]);

  // Open by default: the branch that is on the plan. A search opens everything it kept.
  const isOpen = (id, onPath) => (q ? !shut.has(id) : (opened.has(id) || (onPath && !shut.has(id))));
  const toggle = (id, onPath) => {
    const open = isOpen(id, onPath);
    setShut((s) => { const n = new Set(s); open ? n.add(id) : n.delete(id); return n; });
    setOpened((s) => { const n = new Set(s); open ? n.delete(id) : n.add(id); return n; });
  };
  const go = (patch, room = '') => { setState((s) => ({ ...s, ...patch })); setFocus(room); };

  const tw = { isOpen, toggle };

  /* ── Export ────────────────────────────────────────────────────────────── */
  const doExport = async () => {
    if (!hostel) return;
    setExporting(true);
    try {
      const res = await api.getBoard('rooms', { hostel: hostel._id, ...(building ? { building: building._id } : null), limit: 5000 });
      const list = (res.data ?? res).rows || [];
      const lines = list.flatMap((r) => (r.bedList?.length ? r.bedList : [null]).map((b) => ({ r, b })));
      exportCsv(`occupancy-${(building?.name || hostel.name).replace(/\s+/g, '-').toLowerCase()}.csv`, [
        { label: 'Hostel', value: ({ r }) => r.hostelName }, { label: 'Building', value: ({ r }) => r.buildingName },
        { label: 'Floor', value: ({ r }) => r.floorName }, { label: 'Room', value: ({ r }) => r.roomNumber },
        { label: 'Room type', value: ({ r }) => roomTypeLabel(r.roomType) },
        { label: 'Bed', value: ({ b }) => b?.code || b?.bedNumber || '' },
        { label: 'State', value: ({ b }) => (b ? (BED_STATE[b.state] || [b.state])[0] : 'No beds') },
        { label: 'Student', value: ({ b }) => b?.studentName || '' },
        { label: 'Class', value: ({ b }) => b?.studentClass || '' }, { label: 'Roll', value: ({ b }) => b?.studentRoll || '' },
        { label: 'Allocated on', value: ({ b }) => (b?.studentName && b.allocatedOn ? fmtDate(b.allocatedOn) : '') },
      ], lines);
    } catch (err) { toast.error(err.message); } finally { setExporting(false); }
  };

  const empty = !loading && !tree.length;

  return (
    <div className="hs-page">
      <PageHead title="Occupancy Map" subtitle="Visual view of all hostels, buildings, floors, rooms and beds. Click on any room to view details.">
        <FSelect value={data?.hostel || ''} onChange={(v) => go({ hostel: v, building: '', floor: '' })} icon="tower" label="Hostel"
          options={tree.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="160px" />
        <FSelect value={data?.building || ''} onChange={(v) => go({ building: v, floor: '' })} label="Building"
          options={(hostel?.buildings || []).map((b) => ({ value: b._id, label: b.name }))} {...(hostel?.buildings.length ? null : { all: 'No buildings' })}
          grow={0} width="160px" />
        <Btn kind="primary" icon="download" onClick={doExport} disabled={!hostel || exporting}>{exporting ? 'Exporting…' : 'Export'}</Btn>
      </PageHead>

      <Kpis cols={5} size="md">
        <Kpi tone="violet" icon="bedSolid" value={t.rooms ?? 0} label="Total Rooms" />
        <Kpi tone="rose" icon="bedSolid" value={t.beds ?? 0} label="Total Beds" />
        <Kpi tone="green" icon="person" value={t.occupied ?? 0} label="Occupied Beds"
          pct={t.occupiedPct ?? 0} pctLabel={`${t.occupiedPct ?? 0}% occupancy`} bar inline barColor="#2b7bf5" />
        <Kpi tone="sky" icon="bedSolid" value={t.available ?? 0} label="Available Beds"
          pct={t.availablePct ?? 0} pctLabel={`${t.availablePct ?? 0}% available`} bar inline barColor="#2b8ef0" />
        <Kpi tone="amber" icon="tools" value={t.maintenance ?? 0} label="Maintenance Beds"
          pct={t.maintenancePct ?? 0} pctLabel={`${t.maintenancePct ?? 0}% under maintenance`} bar inline barColor="#f59e0b" />
      </Kpis>

      {error && !data ? (
        <div className="hs-panel hs-omap__fail">
          <EmptyRows icon="alertTri" title="Could not load the map" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</EmptyRows>
        </div>
      ) : (
        <div className="hs-omap">
          {/* ── Structure ───────────────────────────────────────────────── */}
          <section className="hs-panel hs-tree" aria-label="Hostel structure">
            <h2>Hostel Structure</h2>
            <FSearch value={term} onChange={setTerm} placeholder="Search buildings, floors or rooms..." />
            {shown.length ? (
              <ul role="tree" className="hs-tree__list">
                {shown.map((h) => {
                  const hOn = h._id === data?.hostel;
                  return (
                    <Twig {...tw} key={h._id} id={h._id} onPath={hOn} depth={0} icon="hostel" label={h.name} on={hOn}
                      onPick={() => go({ hostel: h._id, building: '', floor: '' })}
                      kids={h.buildings.length ? h.buildings.map((b) => {
                        const bOn = hOn && b._id === data?.building;
                        return (
                          <Twig {...tw} key={b._id} id={b._id} onPath={bOn} depth={1} icon="folder" label={b.name}
                            onPick={() => go({ hostel: h._id, building: b._id, floor: '' })}
                            kids={b.floors.length ? b.floors.map((f) => {
                              const fOn = bOn && f._id === data?.floor;
                              return (
                                <Twig {...tw} key={f._id} id={f._id} onPath={fOn} depth={2} icon="folder" label={f.name}
                                  onPick={() => go({ hostel: h._id, building: b._id, floor: f._id })}
                                  kids={f.rooms.length ? f.rooms.map((r) => (
                                    <Twig {...tw} key={r._id} id={r._id} leaf depth={3} icon="room" label={r.name} on={focus === r._id}
                                      onPick={() => go({ hostel: h._id, building: b._id, floor: f._id }, r._id)} />
                                  )) : <li className="hs-tree__none" style={{ '--depth': 3 }}>No rooms</li>} />
                              );
                            }) : <li className="hs-tree__none" style={{ '--depth': 2 }}>No floors</li>} />
                        );
                      }) : <li className="hs-tree__none" style={{ '--depth': 1 }}>No buildings</li>} />
                  );
                })}
              </ul>
            ) : (
              <p className="hs-tree__none" style={{ '--depth': 0 }}>{empty ? 'No hostels yet.' : loading ? 'Loading…' : `Nothing matches “${term}”.`}</p>
            )}
          </section>

          {/* ── The plan ────────────────────────────────────────────────── */}
          <section className="hs-panel hs-plan" aria-label="Floor plan" aria-busy={loading || undefined}>
            <header className="hs-plan__head">
              <Mark name="tower" tone="indigo" size={42} glyph={24} />
              <ol className="hs-plan__path">
                {[data?.path?.hostel, data?.path?.building, data?.path?.floor].filter(Boolean).map((p, i) => (
                  <li key={`${p}-${i}`}>{i ? <Icon name="chevronRight" size={13} aria-hidden /> : null}{p}</li>
                ))}
                {!data?.path?.hostel ? <li>{loading ? 'Loading…' : 'No hostel'}</li> : null}
              </ol>
              <FSelect value={data?.floor || ''} onChange={(v) => go({ floor: v })} label="Floor"
                options={(data?.floors || []).map((f) => ({ value: f._id, label: f.name }))}
                {...(data?.floors?.length ? null : { all: 'No floors' })} grow={0} width="150px" />
              <Btn kind="primary" iconRight="externalLink" disabled={!data?.floor}
                onClick={() => nav(`/admin/hostel/rooms?hostel=${data.hostel}&building=${data.building}&floor=${data.floor}`)}>View Details</Btn>
            </header>

            {rooms.length ? (
              <div className="hs-plan__stage" ref={stage}>
                <div className="hs-plan__tools">
                  <Btn icon="fit" size="sm" onClick={() => setZoom(null)} aria-pressed={zoom === null}>Fit View</Btn>
                </div>
                <div className="hs-plan__zoom">
                  <IconBtn icon="plus" label="Zoom in" onClick={() => step(1)} disabled={z >= ZOOMS[ZOOMS.length - 1]} />
                  <IconBtn icon="minus" label="Zoom out" onClick={() => step(-1)} disabled={z <= ZOOMS[0]} />
                </div>
                <div className="hs-plan__scroll">
                  <div className="hs-plan__sheet" style={{ width: PLAN_W, zoom: z }}>
                    <div className="hs-floor">
                      <div className="hs-floor__main">
                        <div className="hs-corr">Corridor</div>
                        {planRows.map((row, i) => (
                          <React.Fragment key={row[0]._id}>
                            {i ? <div className="hs-corr hs-corr--mid">Corridor</div> : null}
                            <div className="hs-rooms">
                              {row.map((r) => {
                                const beds = r.bedList || [];
                                return (
                                  <div key={r._id} id={`hs-room-${r._id}`} style={{ flexGrow: unitsOf(r) }}
                                    className={`hs-room hs-room--${r.state}${focus === String(r._id) ? ' is-focus' : ''}`}>
                                    <button type="button" className="hs-room__hit" onClick={() => { setFocus(String(r._id)); setRoomView(r._id); }}
                                      aria-label={`${r.roomNumber}, ${r.occupied} of ${r.beds} beds occupied. Open details`} />
                                    <span className="hs-room__door" aria-hidden />
                                    <strong>{r.roomNumber}</strong>
                                    <span className="hs-room__count">{r.occupied} / {r.beds} beds</span>
                                    <div className="hs-room__beds">
                                      {beds.map((b) => {
                                        const st = stateOf(b);
                                        return (
                                          <button key={b._id} type="button" className={`hs-pbed hs-pbed--${st}`}
                                            title={`Bed ${b.code || b.bedNumber} — ${(BED_STATE[b.state] || [b.state])[0]}${b.studentName ? ` · ${b.studentName}` : ''}`}
                                            onClick={() => setBedView({ room: { ...r, hostelName: data.path.hostel, buildingName: data.path.building, floorName: data.path.floor }, bed: b })}>
                                            <Glyph name={st === 'maintenance' ? 'tools' : 'bedSolid'} size={26} />
                                            <b>B-{b.bedNumber}</b>
                                            {b.studentName ? <span>{b.studentName}</span> : null}
                                          </button>
                                        );
                                      })}
                                      {!beds.length ? <span className="hs-room__none">No beds</span> : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </React.Fragment>
                        ))}
                        <div className="hs-corr">Corridor</div>
                      </div>
                      <div className="hs-stairs" aria-hidden><span>Stairs</span></div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="hs-plan__empty">
                {loading ? <p className="hs-muted">Loading…</p> : (
                  <EmptyRows icon="door"
                    title={empty ? 'Nothing to show yet' : !building ? 'This hostel has no buildings' : !data?.floor ? 'This building has no floors' : 'No rooms on this floor'}
                    action={empty ? <Btn kind="primary" icon="plus" onClick={() => nav('/admin/hostel/hostels?new=1')}>Add Hostel</Btn>
                      : data?.floor ? <Btn kind="primary" icon="plus" onClick={() => setRoomForm({ floor: data.floor })}>Add Room</Btn>
                        : <Btn kind="primary" icon="plus" onClick={() => nav(`/admin/hostel/structure?new=${building ? 'floor' : 'building'}`)}>{building ? 'Add Floor' : 'Add Building'}</Btn>}>
                    {empty ? 'Create a hostel, then its buildings, floors and rooms.' : 'The plan draws a floor’s rooms and every bed in them.'}
                  </EmptyRows>
                )}
              </div>
            )}

            <ul className="hs-plankey" aria-label="Key">
              {KEY.map(([k, name, icon]) => (
                <li key={k} className={`hs-plankey--${k}`}>
                  <span className="hs-plankey__mark" aria-hidden><Glyph name={icon} size={26} /></span>
                  <span><strong>{name}</strong><em>{plural(t[k] ?? 0, 'bed')}</em></span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}

      <RoomDrawer roomId={roomView} refreshKey={tick} onClose={() => setRoomView(null)}
        onEdit={(r) => { setRoomView(null); setRoomForm({ room: r._id }); }} />
      <RoomFormModal open={!!roomForm} room={roomForm?.room} floor={roomForm?.floor} hostels={meta?.hostels || []}
        floors={meta?.floors || []} buildings={meta?.buildings || []} onClose={() => setRoomForm(null)} onSaved={refresh} />
      <BedDrawer bed={bedView?.bed} room={bedView?.room} onClose={() => setBedView(null)}
        onEdit={(b) => { const room = bedView.room; setBedView(null); setBedForm({ room, bed: b }); }} />
      <BedFormModal open={!!bedForm} room={bedForm?.room} bed={bedForm?.bed} onClose={() => setBedForm(null)} onSaved={refresh} />
      <span className="hs-sr" aria-live="polite">{loading ? '' : `${count(rooms.length)} rooms on this floor`}</span>
    </div>
  );
}

/** One line of the structure tree: a chevron for what is under it, and its name. */
function Twig({ id, onPath, depth, icon, label, on, kids, onPick, leaf, isOpen, toggle }) {
  const open = !leaf && isOpen(id, onPath);
  return (
    <li role="treeitem" aria-expanded={leaf ? undefined : open} aria-selected={on || undefined}>
      <div className={`hs-twig${on ? ' is-on' : ''}${leaf ? ' is-leaf' : ''}`} style={{ '--depth': depth }}>
        {leaf ? null : (
          <button type="button" className="hs-twig__chev" aria-label={open ? 'Collapse' : 'Expand'} onClick={() => toggle(id, onPath)}>
            <Icon name={open ? 'chevronDown' : 'chevronRight'} size={15} aria-hidden />
          </button>
        )}
        <button type="button" className="hs-twig__label" onClick={onPick}>
          <span className={`hs-twig__ico hs-twig__ico--${icon}`} aria-hidden>
            {icon === 'folder' ? <Folder /> : <Glyph name={icon === 'hostel' ? 'tower' : 'bedSolid'} size={icon === 'hostel' ? 18 : 17} />}
          </span>
          <span>{label}</span>
        </button>
      </div>
      {open && kids ? <ul role="group">{kids}</ul> : null}
    </li>
  );
}

/** The tree's folder, in the mockup's amber. */
const Folder = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden focusable="false">
    <path d="M2.5 6.2a2 2 0 0 1 2-2h4.3a2 2 0 0 1 1.5.7L11.7 6.5H19.5a2 2 0 0 1 2 2V9H2.5z" fill="#f7b731" />
    <rect x="2.5" y="7.6" width="19" height="12.2" rx="2" fill="#fcd265" />
  </svg>
);
