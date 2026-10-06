/**
 * Places & Kits (Oct 2026) — where the Medical Room's stock is kept: the room
 * itself (and any other room), first-aid kits, the bus kit, the hostel
 * cabinet, the lab. What each holds, what is close to its date, when it was
 * last checked — and moving stock between them.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Dialog, Empty, Spin, LoadError, Note, Ico, Kebab, useLoad } from '../mdUI';
import { PLACE_KIND, fmtDay, fmtStamp, qty, ago } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';

const ICON = { room: 'bed', kit: 'firstAid', bus: 'bus', hostel: 'home', lab: 'flask', sports: 'activity', other: 'package' };

/** What one place holds, batch by batch, with a Move button per item. */
function PlaceStock({ place, onClose, onMove }) {
  const st = useLoad(() => api.getPlaceStock(place._id), place._id);
  const rows = st.data?.batches || [];
  return (
    <Dialog open onClose={onClose} title={place.name} icon={ICON[place.kind] || 'package'} tone="indigo" width={680}
      footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" icon="arrowRight" onClick={() => onMove({ from: place.isMain ? '' : place._id })}>Move stock from here</Btn></>}>
      {st.loading && !st.data ? <Spin /> : st.error ? <LoadError error={st.error} onRetry={st.reload} /> : rows.length ? (
        <ul className="mdd-list">
          {rows.map((b) => (
            <li key={b._id}>
              <div><b>{b.name}{b.strength ? ` ${b.strength}` : ''}</b> — {qty(b.quantity)} {b.unit}
                <em>{b.batchNumber ? `batch ${b.batchNumber} · ` : ''}{b.expiryDate ? `expires ${fmtDay(b.expiryDate)}` : 'no expiry'}</em></div>
              {b.daysLeft !== null && b.daysLeft < 0 ? <Badge tone="red" size="sm">Expired</Badge> : b.daysLeft !== null && b.daysLeft <= 30 ? <Badge tone="amber" size="sm">{b.daysLeft} days left</Badge> : null}
              <Btn size="xs" onClick={() => onMove({ item: { _id: b.item }, from: place.isMain ? '' : place._id })}>Move</Btn>
            </li>
          ))}
        </ul>
      ) : <Empty compact title="Nothing kept here">Move stock here from the Medical Room.</Empty>}
    </Dialog>
  );
}

export default function MedicalPlaces() {
  const list = useLoad(() => api.getPlaces(), 'places');
  const reload = list.reload;
  const { forms, drawer, elements } = useMedWorkspace(reload);
  const [open, setOpen] = useState(null);
  const check = (p) => drawer.confirm({
    title: `Checked — ${p.name}`, message: 'Everything that should be there is there, in date and in good condition.',
    reason: true, reasonLabel: 'Note', reasonPlaceholder: 'Optional — e.g. replaced the gauze', confirmLabel: 'Checked',
    run: async (note) => { await api.checkPlace(p._id, note); toast.success('Recorded'); reload(); },
  });
  const close = (p) => drawer.confirm({
    title: `Close ${p.name}?`, message: 'It leaves the lists. A place still holding stock cannot be closed — move or write it off first.', danger: true, confirmLabel: 'Close it',
    run: async () => { await api.updatePlace(p._id, { isActive: false }); toast.success('Closed'); reload(); },
  });
  const places = list.data?.places || [];
  return (
    <Page>
      <PageHead icon="package" tone="teal" title="Places & Kits" subtitle="Where the Medical Room's stock is kept — the room, other rooms, first-aid kits, the bus kit, the hostel cabinet. What each holds, what is close to its date, and when it was last checked. The room gives medicine from its own shelf.">
        <Btn icon="arrowRight" onClick={() => forms.open('transfer', {})}>Move stock</Btn>
        <Btn kind="primary" icon="plus" onClick={() => forms.open('place', {})}>New place</Btn>
      </PageHead>
      {list.error && !list.data ? <LoadError error={list.error} onRetry={reload} /> : !list.data ? <Spin /> : (
        <>
          {places.length === 1 ? <Note tone="indigo" icon="info">Everything is in the Medical Room. Add a first-aid kit, the bus kit or a second room to keep stock there too.</Note> : null}
          <div className="mdpl-grid">
            {places.map((p) => {
              const stale = !p.isMain && (!p.lastCheckedAt || Date.now() - new Date(p.lastCheckedAt).getTime() > 30 * 86400000);
              return (
                <Panel key={p._id} pad title={p.name} icon={ICON[p.kind] || 'package'} tone={p.isMain ? 'rose' : 'teal'}
                  sub={[p.kindLabel, p.place, p.keeper && `kept by ${p.keeper}`].filter(Boolean).join(' · ')}
                  right={<Kebab label="Place actions" items={[
                    { label: 'What is here', icon: 'list', onClick: () => setOpen(p) },
                    { label: 'Checked today', icon: 'checkCircle', onClick: () => check(p) },
                    { label: 'Edit', icon: 'pencil', onClick: () => forms.open('place', { place: p }) },
                    !p.isMain ? '-' : null,
                    !p.isMain ? { label: 'Close this place', icon: 'archive', danger: true, onClick: () => close(p) } : null,
                  ]} />}>
                  <div className="mdpl-figs">
                    <span><b>{p.items}</b> item{p.items === 1 ? '' : 's'}</span>
                    <span><b>{qty(p.units)}</b> units</span>
                    {p.expiring ? <Badge tone="amber" size="sm">{p.expiring} expiring</Badge> : null}
                    {p.expired ? <Badge tone="red" size="sm">{p.expired} expired</Badge> : null}
                  </div>
                  <p className={`mdpl-check${stale ? ' is-due' : ''}`}><Ico name="checkCircle" size={13} />{p.lastCheckedAt ? `Checked ${ago(p.lastCheckedAt)} by ${p.lastCheckedName}` : p.isMain ? 'The main Medical Room' : 'Never checked'}{stale ? ' — due a check' : ''}</p>
                  <div className="mdr-card__acts">
                    <Btn size="sm" onClick={() => setOpen(p)}>What is here</Btn>
                    <Btn size="sm" kind="tint" onClick={() => forms.open('transfer', { to: p.isMain ? '' : p._id, from: p.isMain ? (places.find((x) => !x.isMain)?._id || '') : '' })}>Restock</Btn>
                    {!p.isMain ? <Btn size="sm" onClick={() => check(p)}>Checked</Btn> : null}
                  </div>
                </Panel>
              );
            })}
          </div>
          <p className="md-muted" style={{ fontSize: '.8rem' }}>{places.filter((p) => p.lastCheckedAt).length ? `Last check: ${fmtStamp(places.map((p) => p.lastCheckedAt).filter(Boolean).sort().pop())}` : ''}</p>
        </>
      )}
      {open ? <PlaceStock place={open} onClose={() => setOpen(null)} onMove={(preset) => { setOpen(null); forms.open('transfer', preset); }} /> : null}
      {elements}
    </Page>
  );
}
