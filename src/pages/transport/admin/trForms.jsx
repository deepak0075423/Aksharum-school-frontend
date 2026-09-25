/**
 * Every dialog the Transport admin screens open.
 *
 * They live together because they share three things: the `useMeta` lookup
 * (one cached call for vehicles/crew/routes/plans/students, instead of each
 * dialog fetching its own), the `Form` wrapper that turns a submit into a
 * toast and a reload, and the CSV preview both importers use.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../../../components/ui/icons';
import * as api from '../../../api/transport.api';
import {
  Modal, Btn, Field, Input, Textarea, Select, FormGrid, Check, Toggle, Note, Badge, Empty, Seg,
  isoDay, money, count, words, VEHICLE_TYPE, FUEL_TYPE, SHIFT, FREQUENCY, PAY_MODE, parseCsv, saveFile, toCsv,
  Search, IconBtn, Avatar, StatusBadge, fmtDate, Ico, Mark, FormSection, useValidate, Who, Rows, Row, plural,
} from './trUI';
import { LocationField, LocationPicker } from './trPicker';
import TrMap, { hasPoint } from './trMap';

/* ── Shared lookups ───────────────────────────────────────────────────────── */

let metaCache = null;
/** vehicles / drivers / attendants / routes / feePlans / students, fetched once. */
export function useMeta(open) {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    if (!open || metaCache) return;
    let alive = true;
    api.getMeta().then((r) => {
      metaCache = r?.data ?? r;
      if (alive) setMeta(metaCache);
    }).catch(() => {});
    return () => { alive = false; };
  }, [open]);
  return meta || { vehicles: [], drivers: [], attendants: [], routes: [], feePlans: [], students: [] };
}
export const clearMeta = () => { metaCache = null; };

const opt = (rows, label, value = '_id') => (rows || []).map((r) => ({ value: r[value], label: typeof label === 'function' ? label(r) : r[label] }));

/**
 * A modal whose footer submits. Keeps every dialog's busy/error handling the
 * same: one toast on success, the server's own words on failure.
 */
function FormModal({ open, onClose, title, sub, icon, iconTone, wide, xl, slim, submitLabel = 'Save',
                    submitIcon, onSubmit, canSubmit = true, errors, required, children, extraFoot }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onSubmit(); }
    catch (e) { toast.error(e?.message || 'That did not save'); }
    finally { setBusy(false); }
  };
  const list = errors ? Object.values(errors).filter(Boolean) : [];
  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={title} sub={sub} icon={icon} iconTone={iconTone}
           wide={wide} xl={xl} slim={slim}
           foot={<>
             {required ? <span className="tr-reqnote">Fields marked * are required</span> : null}
             {extraFoot}
             <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
             <Btn kind="primary" icon={submitIcon} onClick={go} disabled={busy || !canSubmit}>{busy ? 'Saving…' : submitLabel}</Btn>
           </>}>
      {/* The same messages the fields carry, gathered at the top: a long form
          should not have to be scrolled to find out what is wrong with it. */}
      {list.length ? (
        <div className="tr-errsum" role="alert">
          <Ico name="alert" size={17} />
          <div>
            <b>{list.length === 1 ? 'One thing needs fixing' : `${list.length} things need fixing`}</b>
            <ul>{list.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        </div>
      ) : null}
      {children}
    </Modal>
  );
}

const useForm = (initial, open) => {
  const [form, setForm] = useState(initial);
  useEffect(() => { if (open) setForm(initial); }, [open, JSON.stringify(initial)]);   // eslint-disable-line
  const set = useCallback((k, v) => setForm((f) => ({ ...f, [k]: v })), []);
  return [form, set, setForm];
};

/* ── Requests ─────────────────────────────────────────────────────────────── */

const REQUEST_TYPES = [
  'pickup_change', 'drop_change', 'route_change', 'stop_change', 'new_transport',
  'leave_request', 'special_trip', 'temporary_address', 'permanent_address', 'cancellation', 'other',
];

export function NewRequestModal({ open, onClose, onSaved, student: fixedStudent }) {
  const meta = useMeta(open);
  const [form, set] = useForm({
    student: fixedStudent || '', requestType: 'pickup_change', route: '', pickupStop: '', dropStop: '',
    address: '', fromDate: '', toDate: '', reason: '', note: '', requiresAction: false,
  }, open);
  const route = (meta.routes || []).find((r) => String(r._id) === String(form.route));

  const submit = async () => {
    if (!form.student) throw new Error('Pick the student this is for');
    await api.createRequest({
      student: form.student, requestType: form.requestType, requiresAction: form.requiresAction,
      details: {
        route: form.route || null, pickupStop: form.pickupStop || null, dropStop: form.dropStop || null,
        address: form.address, reason: form.reason, note: form.note,
        fromDate: form.fromDate || null, toDate: form.toDate || null,
      },
    });
    toast.success('Request raised');
    onSaved?.();
  };

  return (
    <FormModal open={open} onClose={onClose} title="New Transport Request" icon="request"
               sub="Raised on a family's behalf — it still goes through the same approval."
               submitLabel="Raise request" onSubmit={submit}>
      <FormGrid>
        <Field label="Student" required full={!fixedStudent}>
          <Select value={form.student} onChange={(v) => set('student', v)} placeholder="Pick a student"
                  options={opt(meta.students, 'name')} disabled={!!fixedStudent} />
        </Field>
        <Field label="Request type" required>
          <Select value={form.requestType} onChange={(v) => set('requestType', v)}
                  options={REQUEST_TYPES.map((v) => ({ value: v, label: words(v) }))} />
        </Field>
        <Field label="Route">
          <Select value={form.route} onChange={(v) => { set('route', v); set('pickupStop', ''); set('dropStop', ''); }}
                  placeholder="No route change" options={opt(meta.routes, (r) => `${r.routeCode} — ${r.name}`)} />
        </Field>
        {route ? (
          <>
            <Field label="Pickup stop">
              <Select value={form.pickupStop} onChange={(v) => set('pickupStop', v)} placeholder="Unchanged"
                      options={opt(route.stops, 'name')} />
            </Field>
            <Field label="Drop stop">
              <Select value={form.dropStop} onChange={(v) => set('dropStop', v)} placeholder="Unchanged"
                      options={opt(route.stops, 'name')} />
            </Field>
          </>
        ) : null}
        <Field label="From"><Input type="date" value={form.fromDate} onChange={(e) => set('fromDate', e.target.value)} /></Field>
        <Field label="To"><Input type="date" value={form.toDate} onChange={(e) => set('toDate', e.target.value)} /></Field>
        {['temporary_address', 'permanent_address'].includes(form.requestType) ? (
          <Field label="Address" full><Textarea value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        ) : null}
        <Field label="Reason / details" full>
          <Textarea value={form.reason} onChange={(e) => set('reason', e.target.value)}
                    placeholder="What is being asked for, in the family's words" />
        </Field>
        <Field full>
          <Check checked={form.requiresAction} onChange={(v) => set('requiresAction', v)}
                 label="Flag as needing something from the school before it can be decided" />
        </Field>
      </FormGrid>
    </FormModal>
  );
}

/* ── Vehicles ─────────────────────────────────────────────────────────────── */

const emptyVehicle = {
  vehicleNumber: '', registrationNumber: '', busName: '', vehicleType: 'bus', capacity: '',
  fuelType: 'diesel', manufacturer: '', modelYear: '', odometer: '', mileage: '', photo: '',
  engineNumber: '', chassisNumber: '', gpsDeviceId: '', rfidDeviceId: '', hasCamera: false,
  purchaseDate: '', purchaseCost: '', status: 'active',
  insuranceExpiry: '', fitnessExpiry: '', permitExpiry: '', roadTaxExpiry: '', pollutionExpiry: '',
};

export function VehicleForm({ open, onClose, onSaved, row }) {
  const [form, set] = useForm(row ? {
    ...emptyVehicle, ...row,
    purchaseDate: isoDay(row.purchaseDate), insuranceExpiry: isoDay(row.insuranceExpiry),
    fitnessExpiry: isoDay(row.fitnessExpiry), permitExpiry: isoDay(row.permitExpiry),
    roadTaxExpiry: isoDay(row.roadTaxExpiry), pollutionExpiry: isoDay(row.pollutionExpiry),
  } : emptyVehicle, open);

  const v = useValidate({
    registrationNumber: (x) => !String(x || '').trim() && 'A registration number is required',
    capacity: (x) => x !== '' && +x < 0 && 'Seating capacity cannot be negative',
    modelYear: (x) => x && (+x < 1950 || +x > new Date().getFullYear() + 1) && 'Model year looks wrong',
  });
  const put = (k, val) => { set(k, val); v.revalidate({ ...form, [k]: val }); };

  const save = async () => {
    const payload = {
      ...form,
      capacity: +form.capacity || 0, purchaseCost: +form.purchaseCost || 0,
      odometer: +form.odometer || 0, mileage: +form.mileage || 0, modelYear: +form.modelYear || null,
    };
    if (row?._id) await api.updateVehicle(row._id, payload); else await api.createVehicle(payload);
    toast.success(row ? 'Vehicle updated' : 'Vehicle added');
    clearMeta(); onSaved?.();
  };

  const steps = useMemo(() => [
    { id: 'identity', nav: 'Vehicle Details', note: 'Number and model', icon: 'bus', tone: 'blue',
      title: 'Vehicle Details', sub: 'How this bus is named and registered.' },
    { id: 'capacity', nav: 'Capacity & Use', note: 'Seats and odometer', icon: 'users', tone: 'green',
      title: 'Capacity & Running', sub: 'What it seats, and what it has done so far.' },
    { id: 'devices', nav: 'Devices', note: 'Tracker and scanner', icon: 'gauge', tone: 'purple',
      title: 'Devices & Identifiers', sub: 'What the live map and the boarding scanner need.' },
    { id: 'papers', nav: 'Compliance', note: 'Renewal dates', icon: 'calendar', tone: 'amber',
      title: 'Purchase & Compliance', sub: 'The dates the renewal alerts read.' },
    { id: 'review', nav: 'Review & Save', note: 'Confirm and save', icon: 'checkCircle', tone: 'teal',
      title: 'Review', sub: 'What will be saved for this vehicle.' },
  ], []);

  return (
    <WizardModal open={open} onClose={onClose} icon="bus" iconTone="blue"
                 title={row ? `Edit ${row.vehicleNumber}` : 'Add Vehicle'}
                 sub="Identity, capacity, devices and the compliance dates the renewal alerts read."
                 submitLabel={row ? 'Save changes' : 'Add vehicle'}
                 errors={v.errors} onSubmit={() => v.run(form, save)}
                 steps={steps}
                 sections={{
        identity: (
          <>
            <FormGrid>
              <Field label="Fleet number" hint="Left blank, one is generated (VH-…)">
                <Input value={form.vehicleNumber} onChange={(e) => put('vehicleNumber', e.target.value)} placeholder="WB-01" />
              </Field>
              <Field label="Registration number" required error={v.errors.registrationNumber}>
                <Input value={form.registrationNumber} aria-invalid={!!v.errors.registrationNumber}
                       onChange={(e) => put('registrationNumber', e.target.value)} placeholder="WB 01 AB 1234" />
              </Field>
              <Field label="Model / bus name">
                <Input value={form.busName} onChange={(e) => put('busName', e.target.value)} placeholder="Tata Starbus 52 Seater" />
              </Field>
              <Field label="Type">
                <Select value={form.vehicleType} onChange={(x) => put('vehicleType', x)}
                        options={Object.entries(VEHICLE_TYPE).filter(([k]) => k !== 'any').map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Manufacturer"><Input value={form.manufacturer} onChange={(e) => put('manufacturer', e.target.value)} /></Field>
              <Field label="Model year" error={v.errors.modelYear}>
                <Input type="number" value={form.modelYear || ''} aria-invalid={!!v.errors.modelYear}
                       onChange={(e) => put('modelYear', e.target.value)} />
              </Field>
              <Field label="Photo URL" hint="Shown in the fleet list and the vehicle panel" full>
                <Input value={form.photo} onChange={(e) => put('photo', e.target.value)} placeholder="uploads/vehicles/wb-01.jpg" />
              </Field>
            </FormGrid>
          </>
        ),
        capacity: (
          <>
            <FormGrid>
              <Field label="Seating capacity" error={v.errors.capacity}>
                <Input type="number" min="0" value={form.capacity} aria-invalid={!!v.errors.capacity}
                       onChange={(e) => put('capacity', e.target.value)} />
              </Field>
              <Field label="Fuel type">
                <Select value={form.fuelType} onChange={(x) => put('fuelType', x)}
                        options={Object.entries(FUEL_TYPE).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Odometer (km)"><Input type="number" min="0" value={form.odometer} onChange={(e) => put('odometer', e.target.value)} /></Field>
              <Field label="Mileage (km/l)"><Input type="number" step="0.1" min="0" value={form.mileage} onChange={(e) => put('mileage', e.target.value)} /></Field>
              <Field label="Status">
                <Select value={form.status} onChange={(x) => put('status', x)}
                        options={['active', 'inactive', 'maintenance', 'retired'].map((x) => ({ value: x, label: words(x) }))} />
              </Field>
            </FormGrid>
          </>
        ),
        devices: (
          <>
            <FormGrid>
              <Field label="GPS device ID" hint="Without one the vehicle can never show on the live map">
                <Input value={form.gpsDeviceId} onChange={(e) => put('gpsDeviceId', e.target.value)} />
              </Field>
              <Field label="RFID reader ID"><Input value={form.rfidDeviceId} onChange={(e) => put('rfidDeviceId', e.target.value)} /></Field>
              <Field label="Engine number"><Input value={form.engineNumber} onChange={(e) => put('engineNumber', e.target.value)} /></Field>
              <Field label="Chassis number"><Input value={form.chassisNumber} onChange={(e) => put('chassisNumber', e.target.value)} /></Field>
              <Field full><Check checked={form.hasCamera} onChange={(x) => put('hasCamera', x)} label="Has on-board camera" /></Field>
            </FormGrid>
          </>
        ),
        papers: (
          <>
            <FormGrid three>
              <Field label="Purchase date"><Input type="date" value={form.purchaseDate} onChange={(e) => put('purchaseDate', e.target.value)} /></Field>
              <Field label="Purchase cost (₹)"><Input type="number" min="0" value={form.purchaseCost} onChange={(e) => put('purchaseCost', e.target.value)} /></Field>
              <Field label="Insurance expiry"><Input type="date" value={form.insuranceExpiry} onChange={(e) => put('insuranceExpiry', e.target.value)} /></Field>
              <Field label="Fitness expiry"><Input type="date" value={form.fitnessExpiry} onChange={(e) => put('fitnessExpiry', e.target.value)} /></Field>
              <Field label="Permit expiry"><Input type="date" value={form.permitExpiry} onChange={(e) => put('permitExpiry', e.target.value)} /></Field>
              <Field label="Road tax expiry"><Input type="date" value={form.roadTaxExpiry} onChange={(e) => put('roadTaxExpiry', e.target.value)} /></Field>
              <Field label="Pollution (PUC) expiry"><Input type="date" value={form.pollutionExpiry} onChange={(e) => put('pollutionExpiry', e.target.value)} /></Field>
            </FormGrid>
          </>
        ),
        review: (
          <>
            <div className="tr-review">
              <R k="Registration">{form.registrationNumber}</R>
              <R k="Fleet number">{form.vehicleNumber}</R>
              <R k="Model">{form.busName}</R>
              <R k="Type / fuel">{[VEHICLE_TYPE[form.vehicleType], FUEL_TYPE[form.fuelType]].filter(Boolean).join(' · ')}</R>
              <R k="Seats">{+form.capacity ? plural(form.capacity, 'seat') : ''}</R>
              <R k="GPS device">{form.gpsDeviceId}</R>
              <R k="Insurance expiry">{form.insuranceExpiry ? fmtDate(form.insuranceExpiry) : ''}</R>
              <R k="Fitness expiry">{form.fitnessExpiry ? fmtDate(form.fitnessExpiry) : ''}</R>
            </div>
            {form.gpsDeviceId ? null : (
              <div className="tr-callout tr-callout--warn" style={{ marginTop: 14 }}>
                <Ico name="alert" size={15} />
                <span>No GPS device ID, so this bus can never appear on the live map.</span>
              </div>
            )}
          </>
        ),
      }} />
  );
}

/* ── Crew ─────────────────────────────────────────────────────────────────── */

const ROLE_META = {
  driver:    { label: 'Driver',    icon: 'driver', tone: 'blue',   needsLicence: true },
  conductor: { label: 'Conductor', icon: 'people', tone: 'purple', needsLicence: false },
  helper:    { label: 'Crew Member', icon: 'people', tone: 'amber', needsLicence: false },
};

/** The rail's picture — drawn here rather than shipped as a file to load. */
const BusArt = () => (
  <svg width="146" height="102" viewBox="0 0 146 102" fill="none" aria-hidden="true">
    <rect x="6"   y="40" width="24" height="42" rx="3" fill="#e4e9f7" />
    <rect x="32"  y="28" width="18" height="54" rx="3" fill="#eef1fb" />
    <rect x="106" y="36" width="26" height="46" rx="3" fill="#e4e9f7" />
    <rect x="12"  y="46" width="5" height="5" rx="1" fill="#c6d0ee" />
    <rect x="21"  y="46" width="5" height="5" rx="1" fill="#c6d0ee" />
    <rect x="12"  y="56" width="5" height="5" rx="1" fill="#c6d0ee" />
    <rect x="112" y="42" width="6" height="6" rx="1" fill="#c6d0ee" />
    <rect x="122" y="42" width="6" height="6" rx="1" fill="#c6d0ee" />
    <circle cx="120" cy="70" r="9" fill="#a7f3d0" />
    <rect x="118.5" y="74" width="3" height="10" rx="1.5" fill="#0f766e" />
    <rect x="0" y="84" width="146" height="4" rx="2" fill="#e2e8f0" />
    <rect x="38" y="46" width="66" height="34" rx="8" fill="#4f46e5" />
    <rect x="44" y="52" width="22" height="14" rx="3" fill="#c7d2fe" />
    <rect x="70" y="52" width="22" height="14" rx="3" fill="#c7d2fe" />
    <rect x="96" y="52" width="4" height="14" rx="2" fill="#818cf8" />
    <circle cx="53" cy="82" r="6.5" fill="#1e293b" />
    <circle cx="89" cy="82" r="6.5" fill="#1e293b" />
    <circle cx="53" cy="82" r="2.4" fill="#cbd5e1" />
    <circle cx="89" cy="82" r="2.4" fill="#cbd5e1" />
    <path d="M71 4c-6.1 0-11 4.9-11 11 0 8.2 11 19 11 19s11-10.8 11-19c0-6.1-4.9-11-11-11z" fill="#f59e0b" />
    <circle cx="71" cy="15" r="4.2" fill="#fff" />
  </svg>
);

/** The name a meta list gives an id — for the review cards. */
const metaName = (list, id, key = 'name') => (list || []).find((x) => String(x._id) === String(id))?.[key] || '';

/* ── The wizard shell ─────────────────────────────────────────────────────── */

/**
 * One card in a wizard's right-hand pane.
 *
 * Declared HERE, at module scope, and not inside the form that uses it. A
 * component defined in a render body is a brand-new function on every render,
 * so React sees a different element type each time and unmounts the whole
 * subtree instead of updating it — which throws away the section refs the rail
 * reads, and takes the focus out of whichever field is being typed into, on
 * every single keystroke.
 */
const WizSection = ({ step, n, innerRef, action, children }) => (
  <section className="tr-sect" data-step={step.id} ref={innerRef}>
    <Mark className="tr-sect__mark" name={step.icon} tone={step.tone} size={40} glyph={19} />
    <div className="tr-sect__body">
      <div className="tr-sect__head">
        <div className="tr-card__grow">
          <h4>{n}. {step.title}</h4>
          <p>{step.sub}</p>
        </div>
        {action}
      </div>
      <div className="tr-sect__fields">{children}</div>
    </div>
  </section>
);

/** One label/value pair on a Review card. */
const R = ({ k, children }) => (
  <div>
    <span className="tr-review__k">{k}</span>
    {children ? <span className="tr-review__v">{children}</span>
      : <span className="tr-review__v tr-review__v--none">Not given</span>}
  </div>
);

/**
 * The shell the long transport dialogs share.
 *
 * A form with twenty fields in it reads as a wall. This gives it a rail of
 * named places on the left and one bordered card per place on the right, so the
 * shape of the thing is visible before any of it is read.
 *
 * The rail FOLLOWS THE SCROLL rather than paging: every field stays reachable,
 * and a step can be clicked to jump. The footer's primary button walks forward
 * a step at a time and turns into the submit on the last one.
 *
 * `steps` is [{ id, nav, note, title, sub, icon, tone }] and `sections` is
 * { id: node } — the shell renders them in `steps` order, so dropping a step
 * (a conductor has no licence) drops its card and renumbers the rest.
 */
function WizardModal({
  open, onClose, icon, iconTone, title, sub, steps, sections,
  art, artTitle, artText, submitLabel = 'Save', onSubmit, canSubmit = true,
  errors, required = true, footNote,
}) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(steps[0]?.id);
  const mainRef = useRef(null);
  const secRefs = useRef({});

  const list = errors ? Object.values(errors).filter(Boolean) : [];
  const at = Math.max(0, steps.findIndex((s) => s.id === step));
  const last = at >= steps.length - 1;

  useEffect(() => { if (open) setStep(steps[0]?.id); }, [open, steps]);
  // The rail follows the scroll: the last card whose top has crossed the line
  // near the top of the pane is the one you are in.
  //
  // This was an IntersectionObserver and it stuck on the first step, because an
  // observer callback is handed only the entries that CHANGED. Scroll so that
  // one card leaves and none enters and the callback sees a single
  // isIntersecting:false, decides nothing, and leaves the rail where it was.
  // Reading the positions outright is both simpler and always right.
  useEffect(() => {
    if (!open) return undefined;
    const root = mainRef.current;
    if (!root) return undefined;
    let frame = 0;
    const pick = () => {
      frame = 0;
      const live = steps.map((s) => [s.id, secRefs.current[s.id]]).filter(([, el]) => el);
      if (!live.length) return;
      // The last card is shorter than the pane, so its top never reaches the
      // line — hitting the bottom of the scroll has to mean the last step.
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 4) {
        setStep(live[live.length - 1][0]);
        return;
      }
      const line = root.getBoundingClientRect().top + 76;
      let id = live[0][0];
      for (const [sid, el] of live) if (el.getBoundingClientRect().top <= line) id = sid;
      setStep(id);
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(pick); };
    root.addEventListener('scroll', onScroll, { passive: true });
    pick();
    return () => { root.removeEventListener('scroll', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, [open, steps]);

  const go = (id) => secRefs.current[id]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  const submit = async () => {
    setBusy(true);
    try { await onSubmit(); }
    catch (e) { toast.error(e?.message || 'That did not save'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={title} sub={sub}
           icon={icon} iconTone={iconTone} xl
           foot={<>
             {required ? <span className="tr-reqnote">Fields marked * are required</span> : null}
             {footNote}
             <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
             {last
               ? <Btn kind="primary" onClick={submit} disabled={busy || !canSubmit}>
                   {busy ? 'Saving…' : submitLabel}
                 </Btn>
               : <Btn kind="primary" iconRight="arrowRight" onClick={() => go(steps[at + 1].id)}>
                   Next: {steps[at + 1].nav}
                 </Btn>}
           </>}>
      {/* The same messages the fields carry, gathered at the top: a long form
          should not have to be scrolled to find out what is wrong with it. */}
      {list.length ? (
        <div className="tr-errsum" role="alert">
          <Ico name="alert" size={17} />
          <div>
            <b>{list.length === 1 ? 'One thing needs fixing' : `${list.length} things need fixing`}</b>
            <ul>{list.map((msg) => <li key={msg}>{msg}</li>)}</ul>
          </div>
        </div>
      ) : null}
      <div className="tr-wiz">
        <nav className="tr-wiz__rail" aria-label="Sections of this form">
          <div className="tr-wiz__steps">
            {steps.map((s, i) => (
              <button key={s.id} type="button"
                      className={`tr-wiz__step${s.id === step ? ' tr-wiz__step--on' : ''}${i < at ? ' tr-wiz__step--done' : ''}`}
                      aria-current={s.id === step ? 'step' : undefined}
                      onClick={() => go(s.id)}>
                <i>{i < at ? <Ico name="check" size={13} /> : i + 1}</i>
                <span>
                  <b>{s.nav}</b>
                  {s.note ? <em>{s.note}</em> : null}
                </span>
              </button>
            ))}
          </div>
          {art || artTitle ? (
            <div className="tr-wiz__art">
              {art}
              {artTitle ? <b>{artTitle}</b> : null}
              {artText ? <p>{artText}</p> : null}
            </div>
          ) : null}
        </nav>

        <div className="tr-wiz__main" ref={mainRef}>
          {steps.map((s, i) => (
            <WizSection key={s.id} step={s} n={i + 1} action={s.action}
                        innerRef={(el) => { secRefs.current[s.id] = el; }}>
              {sections[s.id]}
            </WizSection>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Give an employee a transport role.
 *
 * Drivers, conductors and crew are members of staff, so they are created once
 * under Teachers/Employees and picked here — this form never asks for a name, a
 * phone number or a photo again. It asks only for what is true of the transport
 * role: the licence, the medical, and whether their device shares a position.
 *
 * The picker lists every teacher account that does NOT already crew. Someone who
 * is a driver, a conductor or a crew member is off the list, because one person
 * holds one transport role — to move them, edit their crew record instead.
 *
 * It is long, so it is laid out as six named places with a rail that says which
 * one you are in. The rail follows the scroll rather than paging the form: every
 * field stays reachable, and nothing is hidden behind a Next button.
 */
export function CrewAssignForm({ open, onClose, onSaved, role = 'driver' }) {
  const meta = ROLE_META[role] || ROLE_META.driver;
  const one = meta.label.toLowerCase();
  const m = useMeta(open);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  // A failed fetch used to be swallowed, and an empty list reads as "nobody to
  // pick" — which is exactly how a 404 on this endpoint hid in plain sight. The
  // two states are told apart on screen.
  const [loadError, setLoadError] = useState('');
  const [picked, setPicked] = useState(null);
  const [comboOpen, setComboOpen] = useState(false);
  const [form, set] = useForm({
    phone: '', dateOfJoining: isoDay(new Date()),
    address: '', emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
    licenseNumber: '', licenseType: '', licenseExpiry: '', experienceYears: '',
    medicalCertExpiry: '', policeVerified: false, vehicle: '', locationSharing: false, notes: '',
  }, open);

  const steps = useMemo(() => [
    { id: 'account', nav: 'Basic Information',  note: 'Whose account',         icon: 'users',       tone: 'blue',
      title: 'Teacher Account',    sub: `Select an existing teacher account to create a ${one} profile.` },
    { id: 'contact', nav: 'Contact & Address',  note: 'Phone and next of kin', icon: 'userPlus',    tone: 'green',
      title: 'Contact & Address',  sub: `Basic contact information for the ${one}.` },
    ...(meta.needsLicence ? [{ id: 'licence', nav: 'License Details', note: 'Class and expiry', icon: 'idCard', tone: 'amber',
      title: 'License Details',    sub: "Driver's license information and experience." }] : []),
    { id: 'duty',    nav: 'Duty & Safety',      note: 'Vehicle and checks',    icon: 'shieldCheck', tone: 'purple',
      title: 'Duty & Safety',      sub: 'Assign vehicle and configure safety requirements.' },
    { id: 'extra',   nav: 'Additional Details', note: 'Notes',                 icon: 'fileDoc',     tone: 'blue',
      title: 'Additional Details', sub: `Any additional information about the ${one}.` },
    { id: 'review',  nav: 'Review & Assign',    note: 'Confirm and save',      icon: 'checkCircle', tone: 'teal',
      title: 'Review',             sub: 'What will be recorded when this is assigned.' },
  ], [meta.needsLicence, one]);

  const v = useValidate({
    __picked:      (_x, f) => !f.__pickedId && 'Pick the teacher account this role is for',
    phone:         (x) => !String(x || '').trim() && 'A phone number is required',
    dateOfJoining: (x) => !String(x || '').trim() && 'A date of joining transport is required',
    licenseNumber: (x) => meta.needsLicence && !String(x || '').trim() && 'A driver needs a licence number',
    licenseType:   (x) => meta.needsLicence && !String(x || '').trim() && 'A licence class is required',
    licenseExpiry: (x) => meta.needsLicence && !String(x || '').trim() && 'A licence expiry is required',
  });
  // The rule needs to see the pick, which lives outside `form`.
  const shape = { ...form, __pickedId: picked?._id || '' };
  const put = (k, val) => { set(k, val); v.revalidate({ ...shape, [k]: val }); };

  const comboRef = useRef(null);
  const aliveRef = useRef(false);

  const load = useCallback(() => {
    setLoading(true); setLoadError('');
    return api.getAssignableEmployees({ limit: 200 })
      .then((r) => { if (aliveRef.current) { setRows((r?.data ?? r)?.data || []); setLoadError(''); } })
      .catch((e) => {
        if (!aliveRef.current) return;
        setRows([]);
        setLoadError(e?.message || 'That list could not be loaded');
      })
      .finally(() => { if (aliveRef.current) setLoading(false); });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setPicked(null); setQ(''); setComboOpen(false); v.reset();
    aliveRef.current = true;
    load();
    return () => { aliveRef.current = false; };
  }, [open, load]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Clicking away closes the account list without choosing anything.
  useEffect(() => {
    if (!comboOpen) return undefined;
    const away = (e) => { if (comboRef.current && !comboRef.current.contains(e.target)) setComboOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [comboOpen]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? rows.filter((r) => [r.name, r.employeeId, r.designation, r.department, r.email]
      .join(' ').toLowerCase().includes(n)) : rows;
  }, [rows, q]);

  const choose = (e) => {
    setPicked(e); setComboOpen(false); setQ('');
    v.revalidate({ ...shape, __pickedId: e._id });
  };

  const save = async () => {
    await api.assignCrewRole({
      user: picked._id, staffType: role,
      phone: form.phone, address: form.address, dateOfJoining: form.dateOfJoining || null,
      licenseNumber: form.licenseNumber, licenseType: form.licenseType,
      licenseExpiry: form.licenseExpiry || null, medicalCertExpiry: form.medicalCertExpiry || null,
      policeVerified: form.policeVerified,
      experienceYears: +form.experienceYears || 0,
      vehicle: form.vehicle || null,
      emergencyContact: (form.emergencyContactName || form.emergencyContactPhone) ? {
        name: form.emergencyContactName, phone: form.emergencyContactPhone, relation: form.emergencyContactRelation,
      } : null,
      locationSharing: form.locationSharing, notes: form.notes,
    });
    toast.success(`${picked.name} is now a ${one}`);
    clearMeta(); onSaved?.();
  };

  const vehicleName = (id) => {
    const veh = (m.vehicles || []).find((x) => String(x._id) === String(id));
    return veh ? `${veh.vehicleNumber}${veh.busName ? ` · ${veh.busName}` : ''}` : '';
  };

  return (
    <WizardModal open={open} onClose={onClose} icon={meta.icon} iconTone={meta.tone}
                 title={`Add ${meta.label}`}
                 sub={`Select a teacher account and provide the required ${one} details.`}
                 submitLabel={`Assign as ${meta.label}`}
                 errors={v.errors} onSubmit={() => v.run(shape, save)}
                 steps={steps} art={<BusArt />}
                 artTitle={`Add a trusted ${one}`}
                 artText={`Link an existing teacher account and provide the ${one} details for transport operations.`}
                 sections={{
          account: (
            <>
              <div className="tr-formgrid" style={{ gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', alignItems: 'start' }}>
                <Field label="Teacher Account" required error={v.errors.__picked}>
                  <div className={`tr-combo${picked && !comboOpen ? ' tr-combo__has' : ''}`} ref={comboRef}>
                    <span className="tr-ifield">
                      <Ico name="search" size={16} />
                      <Input value={comboOpen ? q : (picked?.name || '')}
                             placeholder="Search by name, ID, or designation…"
                             aria-invalid={!!v.errors.__picked}
                             onFocus={() => setComboOpen(true)}
                             onChange={(e) => { setQ(e.target.value); setComboOpen(true); }} />
                    </span>
                    <span className="tr-combo__caret"><Ico name="chevronDown" size={16} /></span>
                    {comboOpen ? (
                      <div className="tr-combo__pop">
                        {loading ? <div style={{ padding: 16 }}><div className="tr-skel" style={{ height: 96 }} /></div>
                          : shown.length ? shown.map((e) => (
                            <button key={e._id} type="button" className="tr-row tr-row--pick"
                                    aria-selected={picked?._id === e._id || undefined}
                                    onClick={() => choose(e)}>
                              <Avatar name={e.name} src={e.photo} id={e._id} />
                              <div className="tr-row__text">
                                <b>{e.name}</b>
                                <span>{[e.employeeId, e.designation || (e.staffType === 'non_teaching' ? 'Non-teaching staff' : 'Teaching staff'), e.department]
                                  .filter(Boolean).join(' · ')}</span>
                              </div>
                              {picked?._id === e._id ? <Ico name="check" size={16} /> : null}
                            </button>
                          )) : loadError ? (
                            <Empty icon="alert" sm title="The account list could not be loaded"
                                   action={<Btn size="sm" kind="soft" icon="refresh" onClick={load}>Try again</Btn>}>
                              {loadError} — this is not the same as nobody being available.
                            </Empty>
                          ) : q.trim() ? (
                            <Empty icon="users" sm title="Nothing matches that">
                              No free teacher account matches “{q.trim()}”.
                            </Empty>
                          ) : (
                            <Empty icon="users" sm title="Every teacher account already crews">
                              Add the person under Teachers first, or free one up by ending the transport
                              role it holds now.
                            </Empty>
                          )}
                      </div>
                    ) : null}
                  </div>
                </Field>
                <div className="tr-callout">
                  <Ico name="info" size={15} />
                  <span>Only accounts that do not already have driver, crew, or conductor roles are listed.</span>
                </div>
              </div>
            </>
          ),
          contact: (
            <>
              <FormGrid three>
                <Field label="Phone Number" required error={v.errors.phone}>
                  <span className="tr-ifield">
                    <Ico name="phone" size={16} />
                    <Input value={form.phone} aria-invalid={!!v.errors.phone}
                           onChange={(e) => put('phone', e.target.value)} placeholder="98765 43210" />
                  </span>
                </Field>
                <Field label="Emergency Contact Name">
                  <span className="tr-ifield">
                    <Ico name="user" size={16} />
                    <Input value={form.emergencyContactName}
                           onChange={(e) => put('emergencyContactName', e.target.value)} placeholder="e.g. Ramesh Kumar" />
                  </span>
                </Field>
                <Field label="Emergency Contact Phone">
                  <span className="tr-ifield">
                    <Ico name="phone" size={16} />
                    <Input value={form.emergencyContactPhone}
                           onChange={(e) => put('emergencyContactPhone', e.target.value)} placeholder="e.g. 98765 43210" />
                  </span>
                </Field>
                <Field label="Address" span2>
                  <span className="tr-ifield tr-ifield--area">
                    <Ico name="mapPin" size={16} />
                    <Textarea value={form.address} rows={2}
                              onChange={(e) => put('address', e.target.value)} placeholder="Enter full address" />
                  </span>
                </Field>
                <Field label="Relationship">
                  <span className="tr-ifield">
                    <Ico name="users" size={16} />
                    <Select value={form.emergencyContactRelation} onChange={(x) => put('emergencyContactRelation', x)}
                            placeholder="e.g. Spouse, Brother, Friend"
                            options={['Spouse', 'Father', 'Mother', 'Brother', 'Sister', 'Son', 'Daughter', 'Friend', 'Other']
                              .map((x) => ({ value: x, label: x }))} />
                  </span>
                </Field>
              </FormGrid>
            </>
          ),
          licence: meta.needsLicence && (
              <>
                <FormGrid three>
                  <Field label="License Number" required error={v.errors.licenseNumber}>
                    <span className="tr-ifield">
                      <Ico name="creditCard" size={16} />
                      <Input value={form.licenseNumber} aria-invalid={!!v.errors.licenseNumber}
                             onChange={(e) => put('licenseNumber', e.target.value)} placeholder="WB14 2015001234" />
                    </span>
                  </Field>
                  <Field label="License Class" required error={v.errors.licenseType}>
                    <Select value={form.licenseType} onChange={(x) => put('licenseType', x)} placeholder="Select a class"
                            options={['LMV', 'HMV', 'HTV', 'HPMV', 'MCWG', 'Other'].map((x) => ({ value: x, label: x }))} />
                  </Field>
                  <Field label="License Expiry" required error={v.errors.licenseExpiry}>
                    <span className="tr-ifield">
                      <Ico name="calendar" size={16} />
                      <Input type="date" value={form.licenseExpiry} aria-invalid={!!v.errors.licenseExpiry}
                             onChange={(e) => put('licenseExpiry', e.target.value)} />
                    </span>
                  </Field>
                  <Field label="Experience (Years)">
                    <span className="tr-ifield">
                      <Ico name="clock" size={16} />
                      <Input type="number" min="0" value={form.experienceYears}
                             onChange={(e) => put('experienceYears', e.target.value)} placeholder="e.g. 5" />
                    </span>
                  </Field>
                </FormGrid>
              </>
          ),
          duty: (
            <>
              <FormGrid three>
                <Field label="Assigned Vehicle" hint="Optional — a route's bus already carries its crew">
                  <span className="tr-ifield">
                    <Ico name="bus" size={16} />
                    <Select value={form.vehicle} onChange={(x) => put('vehicle', x)} placeholder="No fixed vehicle"
                            options={opt(m.vehicles, (r) => `${r.vehicleNumber}${r.busName ? ` · ${r.busName}` : ''}`)} />
                  </span>
                </Field>
                <Field label="Date of Joining Transport" required error={v.errors.dateOfJoining}>
                  <span className="tr-ifield">
                    <Ico name="calendar" size={16} />
                    <Input type="date" value={form.dateOfJoining} aria-invalid={!!v.errors.dateOfJoining}
                           onChange={(e) => put('dateOfJoining', e.target.value)} />
                  </span>
                </Field>
                <Field label="Medical Certificate Expiry">
                  <span className="tr-ifield">
                    <Ico name="calendar" size={16} />
                    <Input type="date" value={form.medicalCertExpiry}
                           onChange={(e) => put('medicalCertExpiry', e.target.value)} />
                  </span>
                </Field>
              </FormGrid>
              <div className="tr-formgrid" style={{ marginTop: 14 }}>
                {/* Not wrapped in <Field>: a Check is already a <label>, and a label
                    inside a label toggles the box twice on one click. */}
                <div className="tr-field">
                  <Check checked={form.policeVerified} onChange={(x) => put('policeVerified', x)}
                         label="Police verification complete" />
                </div>
                <div className="tr-field">
                  <Check checked={form.locationSharing} onChange={(x) => put('locationSharing', x)}
                         label="Share their location from their device while they are on duty" />
                  <span className="tr-field__hint">
                    Their position is only collected while this is on, and it comes from their own signed-in device.
                  </span>
                </div>
              </div>
            </>
          ),
          extra: (
            <>
              <Field label="Notes">
                <span className="tr-ifield tr-ifield--area">
                  <Ico name="fileDoc" size={16} />
                  <Textarea value={form.notes} rows={3} maxLength={500}
                            onChange={(e) => put('notes', e.target.value)}
                            placeholder="Enter any additional notes (optional)…" />
                  <span className="tr-count">{form.notes.length}/500</span>
                </span>
              </Field>
            </>
          ),
          review: (
            <>
              <div className="tr-review">
                <R k="Teacher account">{picked?.name}</R>
                <R k="Role">{meta.label}</R>
                <R k="Phone">{form.phone}</R>
                <R k="Joining transport">{form.dateOfJoining ? fmtDate(form.dateOfJoining) : ''}</R>
                {meta.needsLicence ? <R k="Licence">{[form.licenseNumber, form.licenseType].filter(Boolean).join(' · ')}</R> : null}
                {meta.needsLicence ? <R k="Licence expiry">{form.licenseExpiry ? fmtDate(form.licenseExpiry) : ''}</R> : null}
                <R k="Assigned vehicle">{vehicleName(form.vehicle)}</R>
                <R k="Medical expiry">{form.medicalCertExpiry ? fmtDate(form.medicalCertExpiry) : ''}</R>
                <R k="Police verification">{form.policeVerified ? 'Complete' : 'Not recorded'}</R>
                <R k="Location sharing">{form.locationSharing ? 'On while on duty' : 'Off'}</R>
              </div>
              {picked ? (
                <div className="tr-callout" style={{ marginTop: 14 }}>
                  <Ico name="info" size={15} />
                  <span>
                    <b>{picked.name}</b> keeps this same account and becomes a {one} — no second account is
                    created, and they sign in exactly as they do now.
                  </span>
                </div>
              ) : null}
            </>
          ),
        }} />
  );
}

/**
 * Edit the transport side of an existing crew record.
 *
 * Identity fields appear only for legacy standalone records. For a linked one
 * they are shown read-only with a pointer to the employee record, because
 * editing them here would create a second, disagreeing copy.
 */
export function StaffForm({ open, onClose, onSaved, row }) {
  const linked = !!row?.user;
  const [form, set, setForm] = useForm(row ? {
    staffType: row.staffType || 'driver',
    name: row.name || '', phone: row.phone || '', photo: row.photo || '',
    employeeId: row.employeeId || '', address: row.address || '',
    dateOfBirth: isoDay(row.dateOfBirth), dateOfJoining: isoDay(row.dateOfJoining),
    licenseNumber: row.licenseNumber || '', licenseType: row.licenseType || '',
    licenseExpiry: isoDay(row.licenseExpiry), experienceYears: row.experienceYears || '',
    medicalCertExpiry: isoDay(row.medicalCertExpiry), status: row.status || 'active',
    locationSharing: !!row.locationSharing,
    policeVerification: { status: row.policeVerification?.status || '', date: isoDay(row.policeVerification?.date) },
    emergencyContact: { name: row.emergencyContact?.name || '', phone: row.emergencyContact?.phone || '', relation: row.emergencyContact?.relation || '' },
  } : {}, open);
  const sub = (group, k, v) => setForm((f) => ({ ...f, [group]: { ...f[group], [k]: v } }));
  const isDriver = form.staffType === 'driver';

  const submit = async () => {
    if (!linked && !form.name?.trim()) throw new Error('A name is required');
    const payload = { ...form, experienceYears: +form.experienceYears || 0 };
    delete payload.leaves;      // leave has its own action
    delete payload.lastLocation;
    if (linked) {
      // Never write identity onto a linked record — it is read from the employee.
      ['name', 'phone', 'photo', 'address', 'dateOfBirth', 'dateOfJoining', 'emergencyContact'].forEach((k) => delete payload[k]);
    }
    await api.updateStaff(row._id, payload);
    toast.success('Saved');
    clearMeta(); onSaved?.();
  };

  return (
    <FormModal open={open} onClose={onClose} wide icon="driver" iconTone="orange"
               title={`Edit ${row?.name || 'crew member'}`}
               sub={linked ? 'Name, phone and photo come from their employee record.' : 'A standalone record, not linked to an employee account.'}
               submitLabel="Save changes" onSubmit={submit}>
      {linked ? (
        <Note tone="info" title="Linked to an employee account">
          {row.name}{row.designation ? ` · ${row.designation}` : ''} — change their name, phone, photo or address under
          Teachers/Employees and it updates everywhere.
        </Note>
      ) : (
        <Note tone="warn" title="Not linked to an employee account">
          This record was created before crew were employees. Their details live only here — assign them from an
          employee account to keep one copy.
        </Note>
      )}

      <div style={{ marginTop: 14 }}>
        <FormGrid>
          <Field label="Role" required>
            <Select value={form.staffType} onChange={(v) => set('staffType', v)}
                    options={[{ value: 'driver', label: 'Driver' }, { value: 'conductor', label: 'Conductor' }, { value: 'helper', label: 'Crew Member' }]} />
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(v) => set('status', v)}
                    options={[{ value: 'active', label: 'Active' }, { value: 'on_leave', label: 'On Leave' }, { value: 'inactive', label: 'Inactive' }]} />
          </Field>

          {!linked ? (
            <>
              <Field label="Full name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
              <Field label="Phone"><Input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
              <Field label="Date of birth"><Input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></Field>
              <Field label="Date of joining"><Input type="date" value={form.dateOfJoining} onChange={(e) => set('dateOfJoining', e.target.value)} /></Field>
              <Field label="Address" full><Textarea value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
              <Field label="Emergency contact"><Input value={form.emergencyContact.name} onChange={(e) => sub('emergencyContact', 'name', e.target.value)} /></Field>
              <Field label="Emergency phone"><Input value={form.emergencyContact.phone} onChange={(e) => sub('emergencyContact', 'phone', e.target.value)} /></Field>
            </>
          ) : null}

          {isDriver ? (
            <>
              <div className="tr-formgrid__full" style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--tr-muted)', marginTop: 4 }}>Licence</div>
              <Field label="Licence number"><Input value={form.licenseNumber} onChange={(e) => set('licenseNumber', e.target.value)} /></Field>
              <Field label="Licence class"><Input value={form.licenseType} onChange={(e) => set('licenseType', e.target.value)} placeholder="HMV" /></Field>
              <Field label="Licence expiry"><Input type="date" value={form.licenseExpiry} onChange={(e) => set('licenseExpiry', e.target.value)} /></Field>
              <Field label="Experience (years)"><Input type="number" min="0" value={form.experienceYears} onChange={(e) => set('experienceYears', e.target.value)} /></Field>
            </>
          ) : null}

          <div className="tr-formgrid__full" style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--tr-muted)', marginTop: 4 }}>Safety & verification</div>
          <Field label="Medical certificate expiry"><Input type="date" value={form.medicalCertExpiry} onChange={(e) => set('medicalCertExpiry', e.target.value)} /></Field>
          <Field label="Police verification">
            <Select value={form.policeVerification.status} onChange={(v) => sub('policeVerification', 'status', v)} placeholder="Not started"
                    options={[{ value: 'pending', label: 'Pending' }, { value: 'verified', label: 'Verified' }, { value: 'rejected', label: 'Rejected' }]} />
          </Field>
        </FormGrid>
      </div>
    </FormModal>
  );
}

export function LeaveModal({ open, onClose, onSaved, staff }) {
  const [form, set] = useForm({ fromDate: isoDay(new Date()), toDate: isoDay(new Date()), leaveType: 'casual', reason: '' }, open);
  const [cover, setCover] = useState(null);
  const submit = async () => {
    const res = await api.markStaffLeave(staff._id, form);
    const body = res?.data ?? res;
    toast.success(`${staff.name} marked on leave`);
    if (body?.needsCover?.length) setCover(body.needsCover);
    else onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} slim icon="calendar" iconTone="amber" title={`Mark leave — ${staff?.name || ''}`}
               submitLabel="Mark leave" onSubmit={submit}>
      {cover ? (
        <Note tone="warn" title="These routes now need cover">
          {cover.map((r) => r.name).join(', ')} — assign a relief driver on the Routes screen.
          <div style={{ marginTop: 10 }}><Btn kind="soft" size="sm" onClick={onSaved}>Got it</Btn></div>
        </Note>
      ) : (
        <FormGrid>
          <Field label="From" required><Input type="date" value={form.fromDate} onChange={(e) => set('fromDate', e.target.value)} /></Field>
          <Field label="To" required><Input type="date" value={form.toDate} onChange={(e) => set('toDate', e.target.value)} /></Field>
          <Field label="Type" full>
            <Select value={form.leaveType} onChange={(v) => set('leaveType', v)}
                    options={['casual', 'sick', 'earned', 'unpaid', 'other'].map((v) => ({ value: v, label: words(v) }))} />
          </Field>
          <Field label="Reason" full><Textarea value={form.reason} onChange={(e) => set('reason', e.target.value)} /></Field>
        </FormGrid>
      )}
    </FormModal>
  );
}

/* ── Routes ───────────────────────────────────────────────────────────────── */

const emptyRoute = {
  name: '', routeCode: '', zone: '', color: '', description: '', shift: 'both', routeType: 'regular',
  vehicle: '', driver: '', attendant: '', startPoint: '', endPoint: 'School',
  distanceKm: '', estimatedDurationMin: '', geofenceRadiusM: 150, status: 'active',
  schedule: { morningStart: '', morningEnd: '', eveningStart: '', eveningEnd: '' },
  stops: [],
};
const emptyStop = { name: '', sequence: 0, latitude: '', longitude: '', landmark: '', arrivalTime: '', eveningTime: '', distanceFromStart: '', maxStudents: '' };

/** The rail's picture for a route: a bus on a drawn line between stops. */
const RouteArt = () => (
  <svg width="146" height="104" viewBox="0 0 146 104" fill="none" aria-hidden="true">
    <path d="M118 16C96 16 92 44 70 44S34 28 22 40" stroke="#c7d2fe" strokeWidth="2.5"
          strokeLinecap="round" strokeDasharray="5 6" />
    <path d="M118 6c-6 0-10.8 4.8-10.8 10.8C107.2 24.8 118 35 118 35s10.8-10.2 10.8-18.2C128.8 10.8 124 6 118 6z"
          fill="#ec4899" />
    <circle cx="118" cy="16.5" r="4" fill="#fff" />
    <rect x="8"   y="48" width="22" height="34" rx="3" fill="#e4e9f7" />
    <rect x="112" y="52" width="24" height="30" rx="3" fill="#e4e9f7" />
    <rect x="14" y="54" width="5" height="5" rx="1" fill="#c6d0ee" />
    <rect x="118" y="58" width="6" height="6" rx="1" fill="#c6d0ee" />
    <circle cx="38" cy="70" r="8" fill="#a7f3d0" />
    <rect x="36.5" y="74" width="3" height="10" rx="1.5" fill="#0f766e" />
    <circle cx="106" cy="72" r="7" fill="#a7f3d0" />
    <rect x="104.5" y="76" width="3" height="8" rx="1.5" fill="#0f766e" />
    <rect x="0" y="84" width="146" height="4" rx="2" fill="#e2e8f0" />
    <rect x="46" y="50" width="56" height="32" rx="7" fill="#f5a623" />
    <rect x="51" y="55" width="18" height="12" rx="3" fill="#fff5e0" />
    <rect x="73" y="55" width="18" height="12" rx="3" fill="#fff5e0" />
    <rect x="94" y="55" width="4" height="12" rx="2" fill="#e08c00" />
    <circle cx="60" cy="83" r="6" fill="#1e293b" />
    <circle cx="90" cy="83" r="6" fill="#1e293b" />
    <circle cx="60" cy="83" r="2.2" fill="#cbd5e1" />
    <circle cx="90" cy="83" r="2.2" fill="#cbd5e1" />
  </svg>
);

/**
 * Create or edit a route.
 *
 * Stops are the whole point of the form, so they get a card of their own with a
 * map beside them: the order they are listed in IS the order the bus drives,
 * and the timetable, the map line and the fee bands all read that order. Every
 * other field is grouped behind it.
 */
export function RouteForm({ open, onClose, onSaved, row, palette = [] }) {
  const meta = useMeta(open);
  const [showMap, setShowMap] = useState(true);
  const [pickStop, setPickStop] = useState(-1);       // which stop's location is being placed
  const [form, set, setForm] = useForm(row ? {
    ...emptyRoute, ...row,
    vehicle: row.vehicle?._id || row.vehicle || '', driver: row.driver?._id || row.driver || '',
    attendant: row.attendant?._id || row.attendant || '',
    schedule: { ...emptyRoute.schedule, ...(row.schedule || {}) },
    stops: (row.stops || []).map((s) => ({ ...emptyStop, ...s })),
  } : emptyRoute, open);

  const setStop = (i, k, val) => setForm((f) => ({ ...f, stops: f.stops.map((s, j) => (j === i ? { ...s, [k]: val } : s)) }));
  const addStop = () => setForm((f) => ({ ...f, stops: [...f.stops, { ...emptyStop, sequence: f.stops.length + 1 }] }));
  const delStop = (i) => setForm((f) => ({ ...f, stops: f.stops.filter((_, j) => j !== i).map((s, j) => ({ ...s, sequence: j + 1 })) }));
  const moveStop = (i, dir) => setForm((f) => {
    const next = [...f.stops];
    const j = i + dir;
    if (j < 0 || j >= next.length) return f;
    [next[i], next[j]] = [next[j], next[i]];
    return { ...f, stops: next.map((s, k) => ({ ...s, sequence: k + 1 })) };
  });
  const setSchedule = (k, val) => setForm((f) => ({ ...f, schedule: { ...f.schedule, [k]: val } }));

  const v = useValidate({
    name: (x) => !String(x || '').trim() && 'A route name is required',
    zone: (x) => !String(x || '').trim() && 'A zone is required',
    stops: (x) => (!x?.length ? 'A route needs at least one stop'
      : x.some((st) => !String(st.name || '').trim()) && 'Every stop needs a name'),
    distanceKm: (x) => x !== '' && +x < 0 && 'Distance cannot be negative',
  });
  const put = (k, val) => { set(k, val); v.revalidate({ ...form, [k]: val }); };

  const steps = useMemo(() => [
    { id: 'details', nav: 'Route Details',      note: 'Basic information',      icon: 'fileDoc',     tone: 'pink',
      title: 'Route Details',      sub: 'Basic information about the route.' },
    { id: 'stops',   nav: 'Stops & Timings',    note: 'Add stops in order',     icon: 'mapPin',      tone: 'blue',
      title: 'Stops & Timings',    sub: 'Add stops in the exact visiting order. The timetable, map line and fee bands will follow this order.' },
    { id: 'crew',    nav: 'Assignments',        note: 'Vehicle, driver and crew', icon: 'bus',       tone: 'green',
      title: 'Assignments',        sub: 'Assign vehicle, driver and optional conductor/helper for this route.' },
    { id: 'extra',   nav: 'Additional Settings', note: 'Distance, type, status', icon: 'sliders',    tone: 'amber',
      title: 'Additional Settings', sub: 'Distance, running windows and the status this route is in.' },
    { id: 'review',  nav: 'Review & Create',    note: 'Confirm and save',       icon: 'checkCircle', tone: 'teal',
      title: 'Review & Create',    sub: 'What will be saved when this route is created.' },
  ], []);

  const save = async () => {
    const payload = {
      ...form,
      // Every route terminates at the campus — see `campus` below.
      endPoint: 'School',
      vehicle: form.vehicle || null, driver: form.driver || null, attendant: form.attendant || null,
      distanceKm: +form.distanceKm || 0, estimatedDurationMin: +form.estimatedDurationMin || 0,
      geofenceRadiusM: +form.geofenceRadiusM || 150,
      stops: form.stops.map((s, i) => ({
        ...s, sequence: i + 1,
        latitude: s.latitude === '' ? null : +s.latitude,
        longitude: s.longitude === '' ? null : +s.longitude,
        distanceFromStart: +s.distanceFromStart || 0, maxStudents: +s.maxStudents || 0,
      })),
    };
    if (row?._id) await api.updateRoute(row._id, payload); else await api.createRoute(payload);
    toast.success(row ? 'Route updated' : 'Route created');
    clearMeta(); onSaved?.();
  };

  // Every route ends at the campus: the morning run drops there and the
  // afternoon run leaves from there. It is not one of `stops` — a stop is a
  // place children are picked up from, and the timetable, the fee bands and the
  // seat counts all read that list — so it is appended for the drawing only,
  // and pinned to the end of the list on screen where it cannot be edited away.
  const campus = hasPoint(meta.school)
    ? { name: 'School', landmark: 'Campus', latitude: meta.school.latitude, longitude: meta.school.longitude }
    : null;

  // The route as the map should draw it while it is still being typed.
  const draft = {
    _id: 'draft', tag: form.routeCode || 'R', name: form.name || 'New route',
    color: form.color || '#4f46e5',
    stops: [...form.stops.filter(hasPoint), ...(campus ? [campus] : [])],
  };
  const placed = form.stops.filter(hasPoint).length;
  const named = (list, id) => (list || []).find((x) => String(x._id) === String(id))?.name || '';

  return (
    <WizardModal open={open} onClose={onClose} icon="route" iconTone="pink"
                 title={row ? `Edit ${row.name}` : 'Add Route'}
                 sub="Create a new transport route with stops, timings and vehicle/driver assignment."
                 submitLabel={row ? 'Save Route' : 'Create Route'}
                 errors={v.errors} onSubmit={() => v.run(form, save)}
                 steps={steps} art={<RouteArt />}
                 artTitle="Create Efficient Routes"
                 artText="Add route details, stops, timings and assign drivers to ensure safe and on-time transport for students."
                 sections={{
        details: (
          <>
            <FormGrid three>
              <Field label="Route name" required error={v.errors.name}>
                <Input value={form.name} aria-invalid={!!v.errors.name}
                       onChange={(e) => put('name', e.target.value)} placeholder="South Zone" />
              </Field>
              <Field label="Route code" hint="Leave blank to auto-generate">
                <Input value={form.routeCode} onChange={(e) => set('routeCode', e.target.value)} placeholder="R1" />
              </Field>
              <Field label="Zone" required error={v.errors.zone}>
                <Input value={form.zone} aria-invalid={!!v.errors.zone}
                       onChange={(e) => put('zone', e.target.value)} placeholder="South Kolkata" />
              </Field>
              <Field label="Colour" hint="Used for map, timetable, and charts">
                <div className="tr-swatches">
                  {palette.map((c) => (
                    <button key={c} type="button" className="tr-swatch" style={{ background: c }}
                            aria-pressed={form.color === c} aria-label={c} onClick={() => set('color', c)} />
                  ))}
                  <button type="button" className="tr-swatch tr-swatch--auto"
                          aria-pressed={!form.color} aria-label="Automatic" onClick={() => set('color', '')} />
                </div>
              </Field>
              <Field label="Shift" required>
                <Select value={form.shift} onChange={(x) => set('shift', x)}
                        options={Object.entries(SHIFT).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Route type" required>
                <Select value={form.routeType} onChange={(x) => set('routeType', x)}
                        options={['regular', 'holiday', 'temporary', 'alternative'].map((x) => ({ value: x, label: words(x) }))} />
              </Field>
            </FormGrid>
            <Field label="Description" full>
              <span className="tr-ifield tr-ifield--area">
                <Textarea value={form.description} rows={3} maxLength={500}
                          onChange={(e) => set('description', e.target.value)}
                          placeholder="Covers major areas in South Kolkata including Ballygunge, Gariahat…"
                          style={{ paddingLeft: 14 }} />
                <span className="tr-count">{(form.description || '').length}/500</span>
              </span>
            </Field>
          </>
        ),
        stops: (
          <>
            {v.errors.stops ? <span className="tr-field__err" style={{ display: 'block', marginBottom: 10 }}>{v.errors.stops}</span> : null}
            {campus ? null : (
              <div className="tr-callout tr-callout--warn" style={{ marginBottom: 12 }}>
                <Ico name="alert" size={15} />
                <span>
                  This school has no campus location yet, so no route can draw its last leg, and
                  no arrival at school can be detected. Set it under Transport → Settings.
                </span>
              </div>
            )}
            <div className={`tr-stopwrap${showMap ? ' tr-stopwrap--map' : ''}`}>
              <div className="tr-stoplist">
                {form.stops.length ? form.stops.map((s, i) => (
                  <div className="tr-stoprow" key={i}>
                    <span className="tr-stoprow__move">
                      <button type="button" aria-label={`Move ${s.name || `stop ${i + 1}`} up`}
                              disabled={i === 0} onClick={() => moveStop(i, -1)}>
                        <Ico name="arrowUp" size={13} />
                      </button>
                      <button type="button" aria-label={`Move ${s.name || `stop ${i + 1}`} down`}
                              disabled={i === form.stops.length - 1} onClick={() => moveStop(i, 1)}>
                        <Ico name="arrowDown" size={13} />
                      </button>
                    </span>
                    <span className="tr-stoprow__n">{i + 1}</span>
                    <span className="tr-stoprow__pin" title={hasPoint(s) ? 'Placed on the map' : 'No location yet'}>
                      <Ico name="mapPin" size={15} />
                    </span>
                    <span className="tr-stoprow__text">
                      <input value={s.name} onChange={(e) => setStop(i, 'name', e.target.value)}
                             placeholder="Stop name" aria-label={`Stop ${i + 1} name`} />
                      <input value={s.landmark} onChange={(e) => setStop(i, 'landmark', e.target.value)}
                             placeholder="Landmark or road" aria-label={`Stop ${i + 1} landmark`} className="tr-stoprow__sub" />
                    </span>
                    <span className="tr-stoprow__time">
                      <Input type="time" value={s.arrivalTime} aria-label={`Stop ${i + 1} arrival`}
                             onChange={(e) => setStop(i, 'arrivalTime', e.target.value)} />
                    </span>
                    <span className="tr-suffixed tr-stoprow__km">
                      <Input type="number" step="0.1" value={s.distanceFromStart} aria-label={`Stop ${i + 1} km from start`}
                             onChange={(e) => setStop(i, 'distanceFromStart', e.target.value)} placeholder="0.0" />
                      <em>km</em>
                    </span>
                    <span className="tr-stoprow__acts">
                      <IconBtn icon={hasPoint(s) ? 'mapPin' : 'pencil'} kind={hasPoint(s) ? 'good' : ''}
                               label={hasPoint(s) ? 'Change location' : 'Place on the map'}
                               onClick={() => setPickStop(i)} />
                      <IconBtn icon="trash" kind="danger" label="Remove stop" onClick={() => delStop(i)} />
                    </span>
                  </div>
                )) : (
                  <Empty icon="mapPin" sm title="No stops yet"
                         action={<Btn size="sm" kind="soft" icon="plus" onClick={addStop}>Add the first stop</Btn>}>
                    Add them in the order the bus visits them.
                  </Empty>
                )}

                {/* Shown even with no stops yet, because it is the one part of
                    the route that is already decided. */}
                <div className="tr-stoprow tr-stoprow--end">
                  <span className="tr-stoprow__move" aria-hidden="true" />
                  <span className="tr-stoprow__n tr-stoprow__n--end"><Ico name="school" size={13} /></span>
                  <span className="tr-stoprow__pin" style={campus ? { color: '#16a34a' } : undefined}>
                    <Ico name="mapPin" size={15} />
                  </span>
                  <span className="tr-stoprow__text">
                    <b>School</b>
                    <em>
                      {campus
                        ? `Campus · ${Number(campus.latitude).toFixed(5)}, ${Number(campus.longitude).toFixed(5)}`
                        : 'No campus location set — Transport → Settings'}
                    </em>
                  </span>
                  <Badge tone="slate">Always last</Badge>
                </div>
              </div>

              {showMap ? (
                <div className="tr-stopmap">
                  <div className="tr-stopmap__head">
                    <Toggle checked={showMap} onChange={setShowMap} label="Show route on map" />
                    <b>Show Route on Map</b>
                  </div>
                  {placed ? (
                    <TrMap routes={[draft]} school={meta.school} map={meta.map} height={228}
                           legend={false} showStopLabels viewKey={`draft-${placed}`} />
                  ) : (
                    <div className="tr-stopmap__none">
                      <Ico name="mapPin" size={20} />
                      <span>Place a stop with its pin button and the line appears here.</span>
                    </div>
                  )}
                  <span className="tr-field__hint" style={{ padding: '0 12px 10px' }}>
                    {plural(placed, 'stop')} of {form.stops.length} placed, then the campus.
                    A stop without a point is still saved — it just cannot be drawn, geofenced
                    or used for an ETA.
                  </span>
                </div>
              ) : (
                <div className="tr-stopmap tr-stopmap--off">
                  <div className="tr-stopmap__head">
                    <Toggle checked={showMap} onChange={setShowMap} label="Show route on map" />
                    <b>Show Route on Map</b>
                  </div>
                </div>
              )}
            </div>
            <LocationPicker
              open={pickStop >= 0} onClose={() => setPickStop(-1)}
              value={pickStop >= 0 ? { latitude: form.stops[pickStop]?.latitude, longitude: form.stops[pickStop]?.longitude } : null}
              onPick={(pt) => {
                setStop(pickStop, 'latitude', pt ? pt.latitude : '');
                setStop(pickStop, 'longitude', pt ? pt.longitude : '');
              }}
              title={`Pick where “${(pickStop >= 0 && form.stops[pickStop]?.name) || 'this stop'}” is`}
              subtitle="Click the map, stand at the stop and use your location, or paste a maps link."
              reference={{
                school: meta.school, map: meta.map,
                // The stops already placed on THIS route are the most useful
                // reference for placing the next one.
                routes: [{ ...draft, stops: form.stops.filter((x, j) => j !== pickStop && hasPoint(x)) },
                         ...(meta.routes || []).filter((r) => String(r._id) !== String(row?._id))],
              }} />
          </>
        ),
        crew: (
          <FormGrid three>
            <Field label="Vehicle">
              <span className="tr-ifield">
                <Ico name="bus" size={16} />
                <Select value={form.vehicle} onChange={(x) => put('vehicle', x)} placeholder="Not assigned"
                        options={opt(meta.vehicles, (x) => `${x.vehicleNumber} · ${plural(x.capacity, 'seat')}`)} />
              </span>
            </Field>
            <Field label="Driver">
              <span className="tr-ifield">
                <Ico name="user" size={16} />
                <Select value={form.driver} onChange={(x) => set('driver', x)} placeholder="Not assigned"
                        options={opt(meta.drivers, 'name')} />
              </span>
            </Field>
            <Field label="Conductor / Helper">
              <span className="tr-ifield">
                <Ico name="users" size={16} />
                <Select value={form.attendant} onChange={(x) => set('attendant', x)} placeholder="None"
                        options={opt(meta.attendants, 'name')} />
              </span>
            </Field>
          </FormGrid>
        ),
        extra: (
          <div className="tr-formgrid tr-formgrid--6">
            <Field span="2" label="Distance" error={v.errors.distanceKm} hint="0 adds up the stops' own kilometres">
              <span className="tr-suffixed">
                <Input type="number" step="0.1" value={form.distanceKm} aria-invalid={!!v.errors.distanceKm}
                       onChange={(e) => put('distanceKm', e.target.value)} placeholder="0.0" />
                <em>km</em>
              </span>
            </Field>
            <Field span="2" label="Estimated duration">
              <span className="tr-suffixed">
                <Input type="number" value={form.estimatedDurationMin}
                       onChange={(e) => set('estimatedDurationMin', e.target.value)} placeholder="45" />
                <em>min</em>
              </span>
            </Field>
            <Field span="2" label="Status">
              <Select value={form.status} onChange={(x) => set('status', x)}
                      options={['active', 'inactive', 'maintenance', 'draft'].map((x) => ({ value: x, label: words(x) }))} />
            </Field>
            <Field span="3" label="Morning window" hint="The pickup run">
              <div className="tr-range">
                <Input type="time" value={form.schedule.morningStart} aria-label="Morning start"
                       onChange={(e) => setSchedule('morningStart', e.target.value)} />
                <i>to</i>
                <Input type="time" value={form.schedule.morningEnd} aria-label="Morning end"
                       onChange={(e) => setSchedule('morningEnd', e.target.value)} />
              </div>
            </Field>
            <Field span="3" label="Afternoon window" hint="The drop run">
              <div className="tr-range">
                <Input type="time" value={form.schedule.eveningStart} aria-label="Afternoon start"
                       onChange={(e) => setSchedule('eveningStart', e.target.value)} />
                <i>to</i>
                <Input type="time" value={form.schedule.eveningEnd} aria-label="Afternoon end"
                       onChange={(e) => setSchedule('eveningEnd', e.target.value)} />
              </div>
            </Field>
            <Field span="2" label="Geofence radius" hint="How close counts as arrived">
              <span className="tr-suffixed">
                <Input type="number" value={form.geofenceRadiusM}
                       onChange={(e) => set('geofenceRadiusM', e.target.value)} />
                <em>m</em>
              </span>
            </Field>
          </div>
        ),
        review: (
          <>
            <div className="tr-review">
              <R k="Route">{[form.name, form.routeCode && `(${form.routeCode})`].filter(Boolean).join(' ')}</R>
              <R k="Zone">{form.zone}</R>
              <R k="Shift">{SHIFT[form.shift]}</R>
              <R k="Route type">{words(form.routeType)}</R>
              <R k="Stops">{form.stops.length ? `${plural(form.stops.length, 'stop')}, ${placed} placed on the map` : ''}</R>
              <R k="Ends at">{campus ? 'School (campus)' : ''}</R>
              <R k="Distance">{+form.distanceKm ? `${form.distanceKm} km` : ''}</R>
              <R k="Vehicle">{named(meta.vehicles, form.vehicle) || (meta.vehicles || []).find((x) => String(x._id) === String(form.vehicle))?.vehicleNumber}</R>
              <R k="Driver">{named(meta.drivers, form.driver)}</R>
              <R k="Conductor / helper">{named(meta.attendants, form.attendant)}</R>
              <R k="Status">{words(form.status)}</R>
            </div>
            {form.stops.length && placed < form.stops.length ? (
              <div className="tr-callout" style={{ marginTop: 14 }}>
                <Ico name="info" size={15} />
                <span>
                  {plural(form.stops.length - placed, 'stop')} {form.stops.length - placed === 1 ? 'has' : 'have'} no
                  location yet. The route saves either way — an unplaced stop simply cannot be drawn on the
                  live map, geofenced, or used for an ETA.
                </span>
              </div>
            ) : null}
          </>
        ),
      }} />
  );
}

/* ── Assignments ──────────────────────────────────────────────────────────── */

/**
 * Enrol someone in the transport service.
 *
 * Students AND staff: a teacher who rides the bus is enrolled the same way and
 * on the same record, which is what gives them (and, for a child, their parents)
 * access to the transport screens at all — see services/transportEnrolment on
 * the server. The person picker therefore reads /transport/admin/enrollable
 * rather than the meta student list, because that one knows about both kinds of
 * person and about who is already enrolled.
 */
export function AssignmentForm({ open, onClose, onSaved, row }) {
  const meta = useMeta(open);
  const editing = !!row?._id;
  const [personType, setPersonType] = useState(row?.student?.personType || 'student');
  const [people, setPeople] = useState([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [q, setQ] = useState('');

  const [form, set] = useForm(row ? {
    student: row.student?._id || '', route: row.route?._id || '', vehicle: row.vehicle?._id || '',
    pickupStop: row.pickupStop?._id || row.pickupStop || '', dropStop: row.dropStop?._id || row.dropStop || '',
    seatNumber: row.seatNumber || '', shift: row.shift || 'both', feePlan: row.feePlan || '',
    feeAmount: row.feeAmount ?? '', feeStatus: row.feeStatus || 'pending',
    effectiveDate: isoDay(row.effectiveDate) || isoDay(new Date()),
    status: row.status || 'active', notes: row.notes || '',
  } : {
    student: '', route: '', vehicle: '', pickupStop: '', dropStop: '', seatNumber: '', shift: 'both',
    feePlan: '', feeAmount: '', feeStatus: 'pending', effectiveDate: isoDay(new Date()),
    status: 'active', notes: '',
  }, open);

  const route = (meta.routes || []).find((r) => String(r._id) === String(form.route));
  const plan = (meta.feePlans || []).find((p) => String(p._id) === String(form.feePlan));

  const v = useValidate({
    student: (x) => !x && 'Pick the person being enrolled',
    route: (x) => !x && 'Pick a route',
    pickupStop: (x, f) => !x && f.route && 'Pick the boarding point — it is what a parent is told to wait at',
    feeAmount: (x) => x !== '' && +x < 0 && 'A fee cannot be negative',
  });
  const put = (k, val) => { set(k, val); v.revalidate({ ...form, [k]: val }); };

  // The roll of people who can be enrolled, refreshed when the kind changes.
  useEffect(() => {
    if (!open || editing) return undefined;
    let alive = true;
    setPeopleLoading(true);
    api.getEnrollable({ personType, limit: 300 })
      .then((r) => { if (alive) setPeople((r?.data ?? r)?.data || []); })
      .catch(() => {})
      .finally(() => { if (alive) setPeopleLoading(false); });
    return () => { alive = false; };
  }, [open, personType, editing]);

  const shownPeople = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? people.filter((p) => [p.name, p.identifier, p.classLabel].join(' ').toLowerCase().includes(n)) : people;
  }, [people, q]);
  const pickedPerson = people.find((p) => String(p._id) === String(form.student));

  const save = async () => {
    const payload = {
      ...form, personType,
      vehicle: form.vehicle || null, feePlan: form.feePlan || null,
      pickupStop: form.pickupStop || null, dropStop: form.dropStop || null,
      feeAmount: form.feeAmount === '' ? null : +form.feeAmount,
      effectiveDate: form.effectiveDate || null,
    };
    if (editing) await api.updateAssignment(row._id, payload); else await api.createAssignment(payload);
    toast.success(editing ? 'Enrolment updated' : `${pickedPerson?.name || 'They'} are enrolled in transport`);
    onSaved?.();
  };

  const steps = useMemo(() => [
    { id: 'who', nav: 'Who is Riding', note: 'Student or staff', icon: 'users', tone: 'blue',
      title: 'Who is Riding', sub: 'A student, or a member of staff. The account decides which.' },
    { id: 'route', nav: 'Route & Boarding', note: 'Bus and stops', icon: 'mapPin', tone: 'green',
      title: 'Route & Boarding', sub: 'Which bus, and where they get on and off.' },
    { id: 'fees', nav: 'Service & Fees', note: 'Dates and charge', icon: 'wallet', tone: 'amber',
      title: 'Service & Fees', sub: 'When it starts and what it costs.' },
    { id: 'review', nav: 'Review & Save', note: 'Confirm and save', icon: 'checkCircle', tone: 'teal',
      title: 'Review', sub: 'What will be recorded for this enrolment.' },
  ], []);

  return (
    <WizardModal open={open} onClose={onClose} icon="userPlus" iconTone="green"
                 title={editing ? `Edit enrolment — ${row.student?.name || ''}` : 'Enrol in Transport'}
                 sub={editing ? 'Route, boarding point, seat and fees.'
                 : 'Students and staff ride the same buses. Enrolling someone here is also what opens the transport screens to them.'}
                 submitLabel={editing ? 'Save changes' : 'Enrol'}
                 errors={v.errors} onSubmit={() => v.run(form, save)}
                 steps={steps}
                 sections={{
        who: (
          <>
            {editing ? (
              <div className="tr-locfield">
                <span className="tr-locfield__ico"><Ico name="users" size={17} /></span>
                <span className="tr-locfield__text">
                  <b>{row.student?.name}</b>
                  <i> · {row.student?.classLabel || words(row.personType || 'student')}</i>
                </span>
                <Badge tone="slate">{words(row.personType || 'student')}</Badge>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 12 }}>
                  <Seg value={personType} onChange={(x) => { setPersonType(x); put('student', ''); }} items={[
                    { value: 'student', label: 'Student', icon: 'students' },
                    { value: 'teacher', label: 'Staff member', icon: 'people' },
                  ]} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  {pickedPerson ? <Badge tone="green" dot="green">{pickedPerson.name}</Badge> : <Badge tone="slate">Nobody picked</Badge>}
                  <div style={{ marginLeft: 'auto', width: 260 }}>
                    <Search value={q} onChange={setQ} placeholder="Find by name, ID or class…" grow={false} />
                  </div>
                </div>
                <div className="tr-scroller" style={{ maxHeight: 210, border: '1px solid var(--tr-line)', borderRadius: 12 }}>
                  {peopleLoading ? <div style={{ padding: 20 }}><div className="tr-skel" style={{ height: 100 }} /></div>
                    : shownPeople.length ? shownPeople.map((p) => (
                      <button key={p._id} type="button" className="tr-row tr-row--pick"
                              aria-selected={String(form.student) === String(p._id) || undefined}
                              disabled={p.enrolled}
                              onClick={() => put('student', p._id)}>
                        <Avatar name={p.name} src={p.photo} id={p._id} />
                        <div className="tr-row__text">
                          <b>{p.name}</b>
                          <span>{[p.identifier, p.classLabel].filter(Boolean).join(' · ')}</span>
                        </div>
                        {p.enrolled ? <Badge tone="amber">Already enrolled</Badge> : null}
                      </button>
                    )) : <Empty icon="students" sm title={`No ${personType === 'teacher' ? 'staff' : 'students'} to enrol`}>
                      Everyone matching is already enrolled.
                    </Empty>}
                </div>
                {v.errors.student ? <span className="tr-field__err">{v.errors.student}</span> : null}
              </>
            )}
          </>
        ),
        route: (
          <>
            <FormGrid>
              <Field label="Route" required error={v.errors.route}>
                <Select value={form.route} onChange={(x) => { put('route', x); set('pickupStop', ''); set('dropStop', ''); }}
                        placeholder="Pick a route" options={opt(meta.routes, (r) => `${r.routeCode} — ${r.name}`)} />
              </Field>
              <Field label="Vehicle" hint="Defaults to the route's bus">
                <Select value={form.vehicle} onChange={(x) => put('vehicle', x)} placeholder="Route's vehicle"
                        options={opt(meta.vehicles, (x) => `${x.vehicleNumber} · ${plural(x.capacity, 'seat')}`)} />
              </Field>
              <Field label="Pickup / boarding point" required error={v.errors.pickupStop}
                     hint={route ? undefined : 'Pick a route first'}>
                <Select value={form.pickupStop} onChange={(x) => put('pickupStop', x)} disabled={!route}
                        placeholder={route ? 'Pick a stop' : '—'} options={opt(route?.stops, 'name')} />
              </Field>
              <Field label="Drop-off point" hint="Left blank, they are dropped where they boarded">
                <Select value={form.dropStop} onChange={(x) => put('dropStop', x)} disabled={!route}
                        placeholder={route ? 'Same as pickup' : '—'} options={opt(route?.stops, 'name')} />
              </Field>
              <Field label="Seat"><Input value={form.seatNumber} onChange={(e) => put('seatNumber', e.target.value)} placeholder="12A" /></Field>
              <Field label="Shift">
                <Select value={form.shift} onChange={(x) => put('shift', x)}
                        options={Object.entries(SHIFT).map(([value, label]) => ({ value, label }))} />
              </Field>
            </FormGrid>
          </>
        ),
        fees: (
          <>
            <FormGrid>
              <Field label="Service starts" required>
                <Input type="date" value={form.effectiveDate} onChange={(e) => put('effectiveDate', e.target.value)} />
              </Field>
              <Field label="Fee plan">
                <Select value={form.feePlan} onChange={(x) => put('feePlan', x)} placeholder="No transport fee"
                        options={opt(meta.feePlans, (p) => `${p.name} · ${money(p.amount)}`)} />
              </Field>
              <Field label="Fee charged (₹)" error={v.errors.feeAmount}
                     hint={plan ? `Blank uses the plan's ${money(plan.amount)}` : 'Blank means no charge'}>
                <Input type="number" min="0" value={form.feeAmount} aria-invalid={!!v.errors.feeAmount}
                       onChange={(e) => put('feeAmount', e.target.value)} placeholder={plan ? String(plan.amount) : ''} />
              </Field>
              <Field label="Payment status">
                <Select value={form.feeStatus} onChange={(x) => put('feeStatus', x)}
                        options={[{ value: 'pending', label: 'Pending' }, { value: 'partial', label: 'Part paid' },
                                  { value: 'paid', label: 'Paid' }, { value: 'waived', label: 'Waived' }]} />
              </Field>
              <Field label="Enrolment status">
                <Select value={form.status} onChange={(x) => put('status', x)}
                        options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'On hold' },
                                  { value: 'cancelled', label: 'Cancelled' }]} />
              </Field>
              <Field label="Notes" full><Textarea value={form.notes} onChange={(e) => put('notes', e.target.value)} rows={2} /></Field>
            </FormGrid>
            {form.status !== 'active' ? (
              <div style={{ marginTop: 12 }}>
                <Note tone="warn" title="This closes their transport access">
                  Only an active or on-hold enrolment opens the transport screens. Cancelling one takes the module away from
                  them — and, for a child, from their parents.
                </Note>
              </div>
            ) : null}
          </>
        ),
        review: (          <div className="tr-review">
            <R k="Rider">{personType === 'teacher' ? 'A member of staff' : 'A student'}</R>
            <R k="Route">{metaName(meta.routes, form.route)}</R>
            <R k="Pickup stop">{form.pickupStop}</R>
            <R k="Drop stop">{form.dropStop}</R>
            <R k="Shift">{SHIFT[form.shift] || words(form.shift || '')}</R>
            <R k="Seat">{form.seatNumber}</R>
            <R k="Effective from">{form.effectiveDate ? fmtDate(form.effectiveDate) : ''}</R>
            <R k="Fee plan">{metaName(meta.feePlans, form.feePlan)}</R>
            <R k="Fee">{+form.feeAmount ? `${money(form.feeAmount)} · ${words(form.feeStatus || '')}` : ''}</R>
            <R k="Status">{words(form.status || 'active')}</R>
          </div>
        ),
      }} />
  );
}

export function BulkAssignModal({ open, onClose, onSaved, unassigned = [] }) {
  const meta = useMeta(open);
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState('');
  const [form, set] = useForm({ route: '', pickupStop: '', dropStop: '', feePlan: '', shift: 'both' }, open);
  useEffect(() => { if (open) { setPicked([]); setQ(''); } }, [open]);
  const route = (meta.routes || []).find((r) => String(r._id) === String(form.route));
  const pool = useMemo(() => {
    const base = unassigned.length ? unassigned : (meta.students || []);
    const n = q.trim().toLowerCase();
    return n ? base.filter((s) => `${s.name} ${s.admissionNumber || ''}`.toLowerCase().includes(n)) : base;
  }, [unassigned, meta.students, q]);

  const submit = async () => {
    if (!picked.length) throw new Error('Pick at least one student');
    if (!form.route) throw new Error('Pick a route');
    const res = await api.bulkAssign({ students: picked, ...form, pickupStop: form.pickupStop || null, dropStop: form.dropStop || null, feePlan: form.feePlan || null });
    const body = res?.data ?? res;
    if (body.created) toast.success(`${body.created} student${body.created === 1 ? '' : 's'} assigned`);
    if (body.skipped) toast.error(`${body.skipped} skipped — ${body.results.find((r) => !r.ok)?.reason || 'see the list'}`);
    onSaved?.();
  };

  return (
    <FormModal open={open} onClose={onClose} wide icon="people" iconTone="teal" title="Bulk Assign Students"
               sub="Every student is decided on its own — anyone already assigned, or over capacity, is reported and skipped."
               submitLabel={`Assign ${picked.length || ''}`.trim()} canSubmit={!!picked.length && !!form.route} onSubmit={submit}>
      <FormGrid>
        <Field label="Route" required>
          <Select value={form.route} onChange={(v) => { set('route', v); set('pickupStop', ''); set('dropStop', ''); }}
                  placeholder="Pick a route" options={opt(meta.routes, (r) => `${r.routeCode} — ${r.name}`)} />
        </Field>
        <Field label="Fee plan">
          <Select value={form.feePlan} onChange={(v) => set('feePlan', v)} placeholder="No transport fee"
                  options={opt(meta.feePlans, (p) => `${p.name} · ${money(p.amount)}`)} />
        </Field>
        <Field label="Pickup stop">
          <Select value={form.pickupStop} onChange={(v) => set('pickupStop', v)} placeholder="Not set" options={opt(route?.stops, 'name')} />
        </Field>
        <Field label="Drop stop">
          <Select value={form.dropStop} onChange={(v) => set('dropStop', v)} placeholder="Not set" options={opt(route?.stops, 'name')} />
        </Field>
      </FormGrid>

      <div style={{ margin: '16px 0 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <b style={{ fontSize: '.86rem' }}>Students</b>
        <Badge tone="indigo">{picked.length} picked</Badge>
        <div style={{ marginLeft: 'auto', width: 220 }}><Search value={q} onChange={setQ} placeholder="Find a student…" grow={false} /></div>
      </div>
      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--tr-line)', borderRadius: 12 }}>
        {pool.length ? pool.slice(0, 200).map((s) => (
          <label key={s._id} className="tr-row tr-row--pick" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={picked.includes(s._id)} style={{ accentColor: 'var(--tr-primary)' }}
                   onChange={(e) => setPicked((p) => (e.target.checked ? [...p, s._id] : p.filter((x) => x !== s._id)))} />
            <Avatar name={s.name} id={s._id} src={s.photo} size="sm" />
            <div className="tr-row__text"><b>{s.name}</b><span>{s.admissionNumber || s.email || ''}{s.classLabel ? ` · ${s.classLabel}` : ''}</span></div>
          </label>
        )) : <Empty icon="students" sm title="Nobody to show" />}
      </div>
    </FormModal>
  );
}

/* ── Spreadsheet import (assignments and fuel share this) ─────────────────── */

const TEMPLATES = {
  assignments: {
    title: 'Import Assignments from a Spreadsheet',
    icon: 'upload',
    cols: ['admissionNumber', 'route', 'pickupStop', 'dropStop', 'seatNumber', 'shift'],
    sample: [['ADM0012', 'R1', 'Ballygunge', 'Ballygunge', '12A', 'both']],
    hint: 'Match students by admission number (or email), and routes by their code or name. Stops must already exist on that route.',
    send: api.importAssignments,
  },
  fuel: {
    title: 'Bulk Upload Fuel Entries',
    icon: 'fuel',
    cols: ['vehicle', 'date', 'litres', 'pricePerLitre', 'totalCost', 'odometer', 'station', 'billNo', 'driver'],
    sample: [['WB-01', '2026-09-22', '60', '90', '5400', '12450', 'IOCL, Kalighat', 'KLH2345', 'Ravi Kumar']],
    hint: 'Entries are written oldest-first so each one’s mileage is measured against the fill before it.',
    send: api.bulkFuel,
  },
};

export function ImportModal({ open, onClose, onSaved, kind = 'assignments' }) {
  const t = TEMPLATES[kind];
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState(null);
  const [name, setName] = useState('');
  useEffect(() => { if (open) { setRows([]); setReport(null); setName(''); } }, [open]);

  const readFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed.rows.length) { toast.error('That file has no rows under its header'); return; }
    setName(file.name);
    setRows(parsed.rows);
    try {
      const res = await t.send({ rows: parsed.rows, dryRun: true });
      setReport(res?.data ?? res);
    } catch (e) { toast.error(e?.message || 'Could not check that file'); }
  };

  const submit = async () => {
    if (!rows.length) throw new Error('Choose a CSV file first');
    const res = await t.send({ rows });
    const body = res?.data ?? res;
    toast.success(`${body.created} row${body.created === 1 ? '' : 's'} imported${body.failed ? `, ${body.failed} skipped` : ''}`);
    onSaved?.();
  };

  return (
    <FormModal open={open} onClose={onClose} wide icon={t.icon} title={t.title} sub={t.hint}
               submitLabel={report?.ready ? `Import ${report.ready} rows` : 'Import'}
               canSubmit={!!report?.ready} onSubmit={submit}
               extraFoot={<Btn kind="ghost" icon="download" onClick={() => saveFile(`${kind}-template.csv`, toCsv(t.cols.map((c) => [c, c]), t.sample.map((r) => Object.fromEntries(t.cols.map((c, i) => [c, r[i]]))))) }>
                 Download template
               </Btn>}>
      <label style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '26px 18px',
        border: '2px dashed var(--tr-line)', borderRadius: 14, cursor: 'pointer', textAlign: 'center',
      }}>
        <Ico name="upload" size={26} />
        <b style={{ fontSize: '.9rem' }}>{name || 'Choose a CSV file'}</b>
        <span style={{ fontSize: '.78rem', color: 'var(--tr-muted)' }}>
          Columns: {t.cols.join(', ')}
        </span>
        <input type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => readFile(e.target.files?.[0])} />
      </label>

      {report ? (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
            <Badge tone="slate">{report.total} rows read</Badge>
            <Badge tone="green">{report.ready} ready</Badge>
            {report.failed ? <Badge tone="red">{report.failed} rejected</Badge> : null}
          </div>
          {report.failed ? (
            <div style={{ maxHeight: 190, overflow: 'auto', border: '1px solid var(--tr-line)', borderRadius: 12 }}>
              <table className="tr-table">
                <thead><tr><th style={{ width: 60 }}>Row</th><th>Why it was rejected</th></tr></thead>
                <tbody>
                  {report.results.filter((r) => !r.ok).map((r) => (
                    <tr key={r.line}><td className="tr-num">{r.line}</td><td>{r.reason}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Note tone="good" title="Every row checks out">Nothing has been written yet — press Import to commit them.</Note>}
        </div>
      ) : null}
    </FormModal>
  );
}

/* ── Trips ────────────────────────────────────────────────────────────────── */

export function ScheduleTripModal({ open, onClose, onSaved }) {
  const meta = useMeta(open);
  const [form, set] = useForm({ route: '', date: isoDay(new Date()), shift: 'morning', tripType: 'special', title: '', vehicle: '', driver: '' }, open);
  const submit = async () => {
    if (!form.route) throw new Error('Pick a route');
    await api.scheduleTrip({ ...form, vehicle: form.vehicle || null, driver: form.driver || null });
    toast.success('Trip scheduled');
    onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} icon="trips" iconTone="blue" title="Schedule a Trip"
               sub="A one-off trip — an excursion, an exam shuttle. The daily generator never recreates it."
               submitLabel="Schedule" onSubmit={submit}>
      <FormGrid>
        <Field label="Route" required full>
          <Select value={form.route} onChange={(v) => set('route', v)} placeholder="Pick a route"
                  options={opt(meta.routes, (r) => `${r.routeCode} — ${r.name}`)} />
        </Field>
        <Field label="Date" required><Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field label="Shift">
          <Select value={form.shift} onChange={(v) => set('shift', v)}
                  options={[{ value: 'morning', label: 'Morning (School → City)' }, { value: 'evening', label: 'Afternoon (City → School)' }]} />
        </Field>
        <Field label="Trip type">
          <Select value={form.tripType} onChange={(v) => set('tripType', v)}
                  options={['special', 'excursion', 'event', 'exam'].map((v) => ({ value: v, label: words(v) }))} />
        </Field>
        <Field label="Name it" hint="Shown on the Trips list"><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Inter-school event" /></Field>
        <Field label="Vehicle"><Select value={form.vehicle} onChange={(v) => set('vehicle', v)} placeholder="Route's vehicle" options={opt(meta.vehicles, 'vehicleNumber')} /></Field>
        <Field label="Driver"><Select value={form.driver} onChange={(v) => set('driver', v)} placeholder="Route's driver" options={opt(meta.drivers, 'name')} /></Field>
      </FormGrid>
    </FormModal>
  );
}

export function GenerateTripsModal({ open, onClose, onSaved }) {
  const [form, set] = useForm({ date: isoDay(new Date()), force: false }, open);
  const submit = async () => {
    const res = await api.generateTrips(form);
    const body = res?.data ?? res;
    if (body.skipped) toast(body.message, { icon: '🗓' });
    else toast.success(`${body.created} trip${body.created === 1 ? '' : 's'} generated`);
    onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} slim icon="calendar" iconTone="blue" title="Generate the day's trips"
               sub="One pickup and one drop per active route with a vehicle. Running it twice never duplicates."
               submitLabel="Generate" onSubmit={submit}>
      <FormGrid one>
        <Field label="Date" required><Input type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></Field>
        <Field><Check checked={form.force} onChange={(v) => set('force', v)}
                      label="Generate even on a weekend or holiday (a working Saturday)" /></Field>
      </FormGrid>
    </FormModal>
  );
}

/* ── Fuel & maintenance ───────────────────────────────────────────────────── */

export function FuelForm({ open, onClose, onSaved, row }) {
  const meta = useMeta(open);
  const [form, set] = useForm(row ? {
    ...row, vehicle: row.vehicle?._id || row.vehicle || '', driver: row.driver?._id || row.driver || '', date: isoDay(row.date),
  } : { vehicle: '', driver: '', date: isoDay(new Date()), litres: '', pricePerLitre: '', totalCost: '', odometer: '', vendor: '', receipt: '', note: '' }, open);

  const v = useValidate({
    vehicle: (x) => !x && 'Pick the vehicle that was filled',
    date: (x) => !x && 'A date is required',
    litres: (x) => !(+x > 0) && 'Litres must be above zero',
    pricePerLitre: (x) => x !== '' && +x < 0 && 'Price cannot be negative',
    odometer: (x) => x !== '' && +x < 0 && 'An odometer reading cannot be negative',
  });
  const put = (k, val) => { set(k, val); v.revalidate({ ...form, [k]: val }); };
  const computed = (+form.litres || 0) * (+form.pricePerLitre || 0);

  const save = async () => {
    await api.createFuel({
      ...form, driver: form.driver || null,
      litres: +form.litres, pricePerLitre: +form.pricePerLitre || 0,
      totalCost: +form.totalCost || computed,
      odometer: +form.odometer || 0,
    });
    toast.success('Fuel entry saved');
    onSaved?.();
  };

  const steps = useMemo(() => [
    { id: 'fill', nav: 'The Fill', note: 'Bus, date, driver', icon: 'bus', tone: 'blue',
      title: 'The Fill', sub: 'Which bus, when, and who was driving.' },
    { id: 'amount', nav: 'Quantity & Cost', note: 'Litres and rupees', icon: 'wallet', tone: 'green',
      title: 'Quantity & Cost', sub: 'What went in and what it came to.' },
    { id: 'papers', nav: 'Paperwork', note: 'Bill and station', icon: 'fileDoc', tone: 'amber',
      title: 'Paperwork', sub: 'The bill this fill is evidenced by.' },
    { id: 'review', nav: 'Review & Save', note: 'Confirm and save', icon: 'checkCircle', tone: 'teal',
      title: 'Review', sub: 'What will be recorded for this fill.' },
  ], []);

  return (
    <WizardModal open={open} onClose={onClose} icon="fuel" iconTone="amber"
                 title="Add Fuel Entry"
                 sub="Mileage is worked out from the odometer reading against the fill before this one."
                 submitLabel="Save entry"
                 errors={v.errors} onSubmit={() => v.run(form, save)}
                 steps={steps}
                 sections={{
        fill: (
          <>
            <FormGrid>
              <Field label="Vehicle" required error={v.errors.vehicle}>
                <Select value={form.vehicle} onChange={(x) => put('vehicle', x)} placeholder="Pick a vehicle" options={opt(meta.vehicles, 'vehicleNumber')} />
              </Field>
              <Field label="Driver"><Select value={form.driver} onChange={(x) => put('driver', x)} placeholder="Not recorded" options={opt(meta.drivers, 'name')} /></Field>
              <Field label="Date" required error={v.errors.date}>
                <Input type="date" value={form.date} aria-invalid={!!v.errors.date} onChange={(e) => put('date', e.target.value)} />
              </Field>
              <Field label="Odometer (km)" error={v.errors.odometer} hint="Reading at the pump — this is what mileage is measured from">
                <Input type="number" min="0" value={form.odometer} aria-invalid={!!v.errors.odometer} onChange={(e) => put('odometer', e.target.value)} />
              </Field>
            </FormGrid>
          </>
        ),
        amount: (
          <>
            <FormGrid>
              <Field label="Litres" required error={v.errors.litres}>
                <Input type="number" step="0.01" min="0" value={form.litres} aria-invalid={!!v.errors.litres}
                       onChange={(e) => put('litres', e.target.value)} />
              </Field>
              <Field label="Price per litre (₹)" error={v.errors.pricePerLitre}>
                <Input type="number" step="0.01" min="0" value={form.pricePerLitre} aria-invalid={!!v.errors.pricePerLitre}
                       onChange={(e) => put('pricePerLitre', e.target.value)} />
              </Field>
              <Field label="Total cost (₹)" hint={computed > 0 ? `Left blank, ${money(computed)} is used` : 'Left blank, litres × price'}>
                <Input type="number" step="0.01" min="0" value={form.totalCost} onChange={(e) => put('totalCost', e.target.value)}
                       placeholder={computed > 0 ? String(Math.round(computed)) : ''} />
              </Field>
            </FormGrid>
          </>
        ),
        papers: (
          <>
            <FormGrid>
              <Field label="Station"><Input value={form.vendor} onChange={(e) => put('vendor', e.target.value)} placeholder="IOCL, Kalighat" /></Field>
              <Field label="Bill number"><Input value={form.receipt} onChange={(e) => put('receipt', e.target.value)} placeholder="KLH2345" /></Field>
              <Field label="Note" full><Input value={form.note} onChange={(e) => put('note', e.target.value)} /></Field>
            </FormGrid>
          </>
        ),
        review: (          <div className="tr-review">
            <R k="Vehicle">{metaName(meta.vehicles, form.vehicle, 'vehicleNumber')}</R>
            <R k="Driver">{metaName(meta.drivers, form.driver)}</R>
            <R k="Date">{form.date ? fmtDate(form.date) : ''}</R>
            <R k="Litres">{+form.litres ? `${form.litres} L` : ''}</R>
            <R k="Price per litre">{+form.pricePerLitre ? money(form.pricePerLitre) : ''}</R>
            <R k="Total cost">{+form.totalCost ? money(form.totalCost) : ''}</R>
            <R k="Odometer">{+form.odometer ? `${count(form.odometer)} km` : ''}</R>
            <R k="Filling station">{form.vendor}</R>
            <R k="Receipt">{form.receipt}</R>
          </div>
        ),
      }} />
  );
}

export function MaintenanceForm({ open, onClose, onSaved, row }) {
  const meta = useMeta(open);
  const [form, set] = useForm(row ? {
    ...row, vehicle: row.vehicle?._id || row.vehicle || '',
    scheduledDate: isoDay(row.scheduledDate), completedDate: isoDay(row.completedDate), nextDueDate: isoDay(row.nextDueDate),
  } : {
    vehicle: '', maintenanceType: 'preventive', category: 'service', title: '', description: '',
    scheduledDate: isoDay(new Date()), completedDate: '', status: 'scheduled', odometer: '',
    cost: '', labourCost: '', vendor: '', invoice: '', nextDueDate: '', nextDueOdometer: '',
  }, open);

  const v = useValidate({
    vehicle: (x) => !x && 'Pick the vehicle going in',
    title: (x) => !String(x || '').trim() && 'Name the job',
    scheduledDate: (x) => !x && 'A scheduled date is required',
    completedDate: (x, f) => f.status === 'completed' && !x && 'A completed job needs the date it was finished',
    cost: (x) => x !== '' && +x < 0 && 'Cost cannot be negative',
  });
  const put = (k, val) => { set(k, val); v.revalidate({ ...form, [k]: val }); };

  const save = async () => {
    const payload = {
      ...form, cost: +form.cost || 0, labourCost: +form.labourCost || 0,
      odometer: +form.odometer || 0, nextDueOdometer: +form.nextDueOdometer || null,
      completedDate: form.completedDate || null, nextDueDate: form.nextDueDate || null,
    };
    if (row?._id) await api.updateMaintenance(row._id, payload); else await api.createMaintenance(payload);
    toast.success(row ? 'Job updated' : 'Service scheduled');
    onSaved?.();
  };

  const steps = useMemo(() => [
    { id: 'job', nav: 'The Job', note: 'Bus and work', icon: 'settings', tone: 'blue',
      title: 'The Job', sub: 'Which bus, and what is being done to it.' },
    { id: 'dates', nav: 'Dates & Status', note: 'In and out of service', icon: 'calendar', tone: 'amber',
      title: 'Dates & Status', sub: 'In progress takes the bus off the road.' },
    { id: 'cost', nav: 'Cost & Garage', note: 'Who did it, what it cost', icon: 'wallet', tone: 'green',
      title: 'Cost & Garage', sub: 'Who did the work and what it came to.' },
    { id: 'review', nav: 'Review & Save', note: 'Confirm and save', icon: 'checkCircle', tone: 'teal',
      title: 'Review', sub: 'What will be recorded for this job.' },
  ], []);

  return (
    <WizardModal open={open} onClose={onClose} icon="wrench" iconTone="purple"
                 title={row ? 'Edit service' : 'Schedule Service'}
                 sub="Marking a job in progress takes the vehicle off the road; completing it puts it back."
                 submitLabel={row ? 'Save' : 'Schedule'}
                 errors={v.errors} onSubmit={() => v.run(form, save)}
                 steps={steps}
                 sections={{
        job: (
          <>
            <FormGrid>
              <Field label="Vehicle" required error={v.errors.vehicle}>
                <Select value={form.vehicle} onChange={(x) => put('vehicle', x)} placeholder="Pick a vehicle" options={opt(meta.vehicles, 'vehicleNumber')} />
              </Field>
              <Field label="Service type" required error={v.errors.title}>
                <Input value={form.title} aria-invalid={!!v.errors.title}
                       onChange={(e) => put('title', e.target.value)} placeholder="Routine Service" />
              </Field>
              <Field label="Category">
                <Select value={form.category} onChange={(x) => put('category', x)}
                        options={['service', 'oil_change', 'engine', 'brakes', 'tyres', 'battery', 'ac', 'body', 'other'].map((x) => ({ value: x, label: words(x) }))} />
              </Field>
              <Field label="Kind">
                <Select value={form.maintenanceType} onChange={(x) => put('maintenanceType', x)}
                        options={['preventive', 'corrective', 'scheduled'].map((x) => ({ value: x, label: words(x) }))} />
              </Field>
              <Field label="Description" full><Textarea value={form.description} onChange={(e) => put('description', e.target.value)} rows={2} /></Field>
            </FormGrid>
          </>
        ),
        dates: (
          <>
            <FormGrid>
              <Field label="Scheduled date" required error={v.errors.scheduledDate}>
                <Input type="date" value={form.scheduledDate} aria-invalid={!!v.errors.scheduledDate}
                       onChange={(e) => put('scheduledDate', e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(x) => put('status', x)}
                        options={['scheduled', 'in_progress', 'completed', 'cancelled'].map((x) => ({ value: x, label: words(x) }))} />
              </Field>
              <Field label="Completed date" error={v.errors.completedDate}
                     required={form.status === 'completed'}>
                <Input type="date" value={form.completedDate} aria-invalid={!!v.errors.completedDate}
                       onChange={(e) => put('completedDate', e.target.value)} />
              </Field>
              <Field label="Odometer (km)"><Input type="number" min="0" value={form.odometer} onChange={(e) => put('odometer', e.target.value)} /></Field>
            </FormGrid>
          </>
        ),
        cost: (
          <>
            <FormGrid>
              <Field label="Cost (₹)" error={v.errors.cost}>
                <Input type="number" min="0" value={form.cost} aria-invalid={!!v.errors.cost} onChange={(e) => put('cost', e.target.value)} />
              </Field>
              <Field label="Workshop / vendor"><Input value={form.vendor} onChange={(e) => put('vendor', e.target.value)} /></Field>
              <Field label="Next due date"><Input type="date" value={form.nextDueDate} onChange={(e) => put('nextDueDate', e.target.value)} /></Field>
              <Field label="Next due odometer"><Input type="number" min="0" value={form.nextDueOdometer || ''} onChange={(e) => put('nextDueOdometer', e.target.value)} /></Field>
            </FormGrid>
          </>
        ),
        review: (
          <>
            <div className="tr-review">
              <R k="Vehicle">{metaName(meta.vehicles, form.vehicle, 'vehicleNumber')}</R>
              <R k="Job">{form.title}</R>
              <R k="Kind">{[words(form.maintenanceType || ''), words(form.category || '')].filter(Boolean).join(' · ')}</R>
              <R k="Status">{words(form.status || '')}</R>
              <R k="Scheduled">{form.scheduledDate ? fmtDate(form.scheduledDate) : ''}</R>
              <R k="Completed">{form.completedDate ? fmtDate(form.completedDate) : ''}</R>
              <R k="Cost">{+form.cost || +form.labourCost ? money((+form.cost || 0) + (+form.labourCost || 0)) : ''}</R>
              <R k="Garage">{form.vendor}</R>
            </div>
            {form.status === 'in_progress' ? (
              <div className="tr-callout tr-callout--warn" style={{ marginTop: 14 }}>
                <Ico name="alert" size={15} />
                <span>In progress takes this bus off the road — its routes will need cover.</span>
              </div>
            ) : null}
          </>
        ),
      }} />
  );
}

/* ── Incidents & complaints ───────────────────────────────────────────────── */

export function IncidentForm({ open, onClose, onSaved, row }) {
  const meta = useMeta(open);
  const [form, set, setForm] = useForm(row ? {
    ...row, vehicle: row.vehicle?._id || row.vehicle || '', driver: row.driver?._id || row.driver || '',
    date: isoDay(row.date), location: { ...(row.location || {}) },
  } : {
    vehicle: '', driver: '', date: isoDay(new Date()), type: 'breakdown', severity: 'minor',
    description: '', injuredCount: '', repairCost: '', actionsTaken: '', status: 'reported',
    location: { address: '', latitude: '', longitude: '' },
  }, open);

  const v = useValidate({
    description: (x) => !String(x || '').trim() && 'Describe what happened',
    date: (x) => !x && 'A date is required',
    injuredCount: (x) => x !== '' && +x < 0 && 'That cannot be negative',
    actionsTaken: (x, f) => ['resolved', 'closed'].includes(f.status) && !String(x || '').trim()
      && 'Say what was done before closing an incident',
  });
  const put = (k, val) => { set(k, val); v.revalidate({ ...form, [k]: val }); };

  const save = async () => {
    const payload = {
      ...form, vehicle: form.vehicle || null, driver: form.driver || null,
      injuredCount: +form.injuredCount || 0, repairCost: +form.repairCost || 0,
      location: {
        address: form.location.address,
        latitude: form.location.latitude === '' ? null : +form.location.latitude,
        longitude: form.location.longitude === '' ? null : +form.location.longitude,
      },
    };
    if (row?._id) await api.updateIncident(row._id, payload); else await api.createIncident(payload);
    toast.success(row ? 'Incident updated' : 'Incident reported');
    onSaved?.();
  };

  const steps = useMemo(() => [
    { id: 'what', nav: 'What Happened', note: 'The account', icon: 'alert', tone: 'red',
      title: 'What Happened', sub: 'The account the safety report is built from.' },
    { id: 'who', nav: 'Who Was Involved', note: 'Bus, driver, riders', icon: 'users', tone: 'blue',
      title: 'Who Was Involved', sub: 'The people and the vehicle this concerns.' },
    { id: 'where', nav: 'Where', note: 'Plots the map pin', icon: 'mapPin', tone: 'purple',
      title: 'Where', sub: 'Plots it on the incident map.' },
    { id: 'after', nav: 'Follow-up', note: 'Needed before closing', icon: 'checkSquare', tone: 'green',
      title: 'Follow-up', sub: 'Required before an incident can be closed.' },
    { id: 'review', nav: 'Review & Save', note: 'Confirm and save', icon: 'checkCircle', tone: 'teal',
      title: 'Review', sub: 'What will be filed for this incident.' },
  ], []);

  return (
    <WizardModal open={open} onClose={onClose} icon="alert" iconTone="red"
                 title={row ? `Update ${row.incidentCode}` : 'Report Incident'}
                 sub="What happened, who was involved, and where — the map and the safety tiles read this."
                 submitLabel={row ? 'Save' : 'Report'}
                 errors={v.errors} onSubmit={() => v.run(form, save)}
                 steps={steps}
                 sections={{
        what: (
          <>
            <FormGrid>
              <Field label="Type" required>
                <Select value={form.type} onChange={(x) => put('type', x)}
                        options={['breakdown', 'accident', 'delay', 'behavior', 'route_deviation', 'medical', 'safety', 'fire', 'other'].map((x) => ({ value: x, label: words(x) }))} />
              </Field>
              <Field label="Severity">
                <Select value={form.severity} onChange={(x) => put('severity', x)}
                        options={['minor', 'major', 'critical'].map((x) => ({ value: x, label: words(x) }))} />
              </Field>
              <Field label="Date" required error={v.errors.date}>
                <Input type="date" value={form.date} aria-invalid={!!v.errors.date} onChange={(e) => put('date', e.target.value)} />
              </Field>
              <Field label="Status">
                <Select value={form.status} onChange={(x) => put('status', x)}
                        options={['reported', 'investigating', 'resolved', 'closed'].map((x) => ({ value: x, label: words(x) }))} />
              </Field>
              <Field label="What happened" required full error={v.errors.description}>
                <Textarea value={form.description} aria-invalid={!!v.errors.description}
                          onChange={(e) => put('description', e.target.value)} rows={3} />
              </Field>
            </FormGrid>
          </>
        ),
        who: (
          <>
            <FormGrid>
              <Field label="Vehicle"><Select value={form.vehicle} onChange={(x) => put('vehicle', x)} placeholder="Not involved" options={opt(meta.vehicles, 'vehicleNumber')} /></Field>
              <Field label="Driver / crew"><Select value={form.driver} onChange={(x) => put('driver', x)} placeholder="Not recorded" options={opt(meta.drivers, 'name')} /></Field>
              <Field label="Students injured" error={v.errors.injuredCount} hint="Counted on its own tile">
                <Input type="number" min="0" value={form.injuredCount} aria-invalid={!!v.errors.injuredCount}
                       onChange={(e) => put('injuredCount', e.target.value)} />
              </Field>
              <Field label="Repair cost (₹)"><Input type="number" min="0" value={form.repairCost} onChange={(e) => put('repairCost', e.target.value)} /></Field>
            </FormGrid>
          </>
        ),
        where: (
          <>
            <FormGrid>
              <Field label="Place" full>
                <Input value={form.location.address} placeholder="Gariahat"
                       onChange={(e) => setForm((f) => ({ ...f, location: { ...f.location, address: e.target.value } }))} />
              </Field>
              <LocationField full label="Pin on the map" title="Pick where the incident happened"
                             value={{ latitude: form.location.latitude, longitude: form.location.longitude }}
                             onChange={(pt) => setForm((f) => ({ ...f, location: {
                               ...f.location,
                               latitude: pt ? pt.latitude : '', longitude: pt ? pt.longitude : '',
                             } }))}
                             reference={{ school: meta.school, routes: meta.routes || [], map: meta.map }} />
            </FormGrid>
          </>
        ),
        after: (
          <>
            <FormGrid one>
              <Field label="Action taken" error={v.errors.actionsTaken}
                     required={['resolved', 'closed'].includes(form.status)}>
                <Textarea value={form.actionsTaken} aria-invalid={!!v.errors.actionsTaken}
                          onChange={(e) => put('actionsTaken', e.target.value)} rows={2} />
              </Field>
            </FormGrid>
          </>
        ),
        review: (          <div className="tr-review">
            <R k="Type">{words(form.type || '')}</R>
            <R k="Severity">{words(form.severity || '')}</R>
            <R k="When">{form.date ? fmtDate(form.date) : ''}</R>
            <R k="Vehicle">{metaName(meta.vehicles, form.vehicle, 'vehicleNumber')}</R>
            <R k="Driver">{metaName(meta.drivers, form.driver)}</R>
            <R k="Status">{words(form.status || '')}</R>
            <R k="Location">{hasPoint(form.location)
              ? `${Number(form.location.latitude).toFixed(5)}, ${Number(form.location.longitude).toFixed(5)}`
              : form.location?.address}</R>
            <R k="Action taken">{form.actionsTaken}</R>
          </div>
        ),
      }} />
  );
}

export function ComplaintForm({ open, onClose, onSaved }) {
  const meta = useMeta(open);
  const [form, set] = useForm({ subject: '', description: '', category: 'other', priority: 'medium', route: '', vehicle: '', student: '' }, open);
  const v = useValidate({
    subject: (x) => !String(x || '').trim() && 'Give the complaint a subject',
    description: (x) => !String(x || '').trim() && 'Say what the complaint is about',
  });
  const put = (k, val) => { set(k, val); v.revalidate({ ...form, [k]: val }); };
  const save = async () => {
    await api.createComplaint({ ...form, route: form.route || null, vehicle: form.vehicle || null, student: form.student || null });
    toast.success('Complaint logged');
    onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} icon="megaphone" iconTone="red" title="New Complaint"
               sub="Logged on a family's behalf — it enters the same queue as one raised in the portal."
               submitLabel="Log complaint" errors={v.errors} required onSubmit={() => v.run(form, save)}>
      <FormSection n="1" title="The complaint">
        <FormGrid>
          <Field label="Subject" required full error={v.errors.subject}>
            <Input value={form.subject} aria-invalid={!!v.errors.subject}
                   onChange={(e) => put('subject', e.target.value)} placeholder="Bus arrived 20 minutes late" />
          </Field>
          <Field label="Category">
            <Select value={form.category} onChange={(x) => put('category', x)}
                    options={['driver_behavior', 'late_bus', 'delay', 'route_deviation', 'bus_condition', 'safety', 'lost_item', 'overcrowding', 'other']
                      .map((x) => ({ value: x, label: words(x) }))} />
          </Field>
          <Field label="Priority">
            <Select value={form.priority} onChange={(x) => put('priority', x)}
                    options={['low', 'medium', 'high', 'urgent'].map((x) => ({ value: x, label: words(x) }))} />
          </Field>
          <Field label="Details" required full error={v.errors.description}>
            <Textarea value={form.description} aria-invalid={!!v.errors.description}
                      onChange={(e) => put('description', e.target.value)} rows={3} />
          </Field>
        </FormGrid>
      </FormSection>

      <FormSection n="2" title="What it is about" sub="Optional — narrows the report and the assignment">
        <FormGrid>
          <Field label="Route"><Select value={form.route} onChange={(x) => put('route', x)} placeholder="Not route-specific" options={opt(meta.routes, (r) => `${r.routeCode} — ${r.name}`)} /></Field>
          <Field label="Vehicle"><Select value={form.vehicle} onChange={(x) => put('vehicle', x)} placeholder="Not vehicle-specific" options={opt(meta.vehicles, 'vehicleNumber')} /></Field>
          <Field label="Student" full><Select value={form.student} onChange={(x) => put('student', x)} placeholder="Not about one child" options={opt(meta.students, 'name')} /></Field>
        </FormGrid>
      </FormSection>
    </FormModal>
  );
}

export function ComplaintActionModal({ open, onClose, onSaved, complaint, assignees = [] }) {
  const [form, set] = useForm({ action: 'assign', assignedTo: '', note: '', resolution: '' }, open);
  const submit = async () => {
    await api.actOnComplaint(complaint._id, {
      action: form.action,
      assignedTo: form.assignedTo || null,
      note: form.note,
      resolution: form.resolution || form.note,
    });
    toast.success(`Complaint ${form.action === 'comment' ? 'updated' : form.action + 'd'}`);
    onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} slim icon="megaphone" iconTone="red"
               title={complaint?.complaintCode || 'Complaint'} sub={complaint?.subject}
               submitLabel="Apply" onSubmit={submit}>
      <FormGrid one>
        <Field label="What are you doing?">
          <Select value={form.action} onChange={(v) => set('action', v)}
                  options={[
                    { value: 'assign', label: 'Assign to someone' },
                    { value: 'progress', label: 'Mark in progress' },
                    { value: 'comment', label: 'Add a note' },
                    { value: 'resolve', label: 'Resolve' },
                    { value: 'close', label: 'Close' },
                  ]} />
        </Field>
        {form.action === 'assign' ? (
          <Field label="Assign to" required>
            <Select value={form.assignedTo} onChange={(v) => set('assignedTo', v)} placeholder="Pick someone"
                    options={assignees.map((a) => ({ value: a.value, label: a.label }))} />
          </Field>
        ) : null}
        {form.action === 'resolve' ? (
          <Field label="How it was resolved" required><Textarea value={form.resolution} onChange={(e) => set('resolution', e.target.value)} /></Field>
        ) : null}
        <Field label="Note"><Textarea value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </FormGrid>
    </FormModal>
  );
}

/* ── Fees ─────────────────────────────────────────────────────────────────── */

export function FeePlanForm({ open, onClose, onSaved, row }) {
  const meta = useMeta(open);
  const [form, set, setForm] = useForm(row ? {
    ...row, route: row.route?._id || row.route || '',
    effectiveFrom: isoDay(row.effectiveFrom), renewalDate: isoDay(row.renewalDate),
    zones: row.zones || [],
  } : {
    name: '', description: '', basis: 'flat', frequency: 'monthly', amount: '', route: '', zoneLabel: '',
    vehicleType: '', lateFeePerDay: '', siblingDiscountPct: '', status: 'active', approvalStatus: 'approved',
    effectiveFrom: '', renewalDate: '', zones: [],
  }, open);

  const v = useValidate({
    name: (x) => !String(x || '').trim() && 'Name the plan',
    amount: (x, f) => !['distance', 'zone'].includes(f.basis) && !(+x > 0) && 'A flat plan needs an amount above zero',
    zones: (x, f) => ['distance', 'zone'].includes(f.basis)
      && (!x?.length ? 'A banded plan needs at least one band'
        : x.some((z) => !String(z.name || '').trim() || !(+z.amount > 0)) && 'Every band needs a name and an amount'),
    siblingDiscountPct: (x) => x !== '' && (+x < 0 || +x > 100) && 'A discount is between 0 and 100 per cent',
  });
  const put = (k, val) => { set(k, val); v.revalidate({ ...form, [k]: val }); };
  const putZones = (fn) => setForm((f) => { const next = { ...f, zones: fn(f.zones) }; v.revalidate(next); return next; });

  const save = async () => {
    const payload = {
      ...form, route: form.route || null,
      amount: +form.amount || 0, lateFeePerDay: +form.lateFeePerDay || 0, siblingDiscountPct: +form.siblingDiscountPct || 0,
      effectiveFrom: form.effectiveFrom || null, renewalDate: form.renewalDate || null,
      zones: form.zones.map((z) => ({ ...z, maxDistanceKm: +z.maxDistanceKm || 0, amount: +z.amount || 0 })),
    };
    if (row?._id) await api.updateFeePlan(row._id, payload); else await api.createFeePlan(payload);
    toast.success(row ? 'Plan updated' : 'Plan created');
    clearMeta(); onSaved?.();
  };

  const banded = ['distance', 'zone'].includes(form.basis);

  const steps = useMemo(() => [
    { id: 'plan', nav: 'The Plan', note: 'How it is charged', icon: 'wallet', tone: 'green',
      title: 'The Plan', sub: 'How the charge is worked out.' },
    ...(banded ? [{ id: 'bands', nav: 'Bands', note: 'Distance or zone', icon: 'layers', tone: 'blue',
      title: 'Bands', sub: 'Up to this many km → this amount.' }] : []),
    { id: 'who', nav: 'Who It Applies To', note: 'Route and riders', icon: 'users', tone: 'purple',
      title: 'Who It Applies To', sub: 'Which route and which riders this plan charges.' },
    { id: 'extras', nav: 'Adjustments', note: 'Discounts and dates', icon: 'percent', tone: 'amber',
      title: 'Adjustments & Dates', sub: 'Late fees, sibling discounts and when it runs from.' },
    { id: 'review', nav: 'Review & Save', note: 'Confirm and save', icon: 'checkCircle', tone: 'teal',
      title: 'Review', sub: 'What will be saved for this plan.' },
  ], [banded]);

  return (
    <WizardModal open={open} onClose={onClose} icon="rupee" iconTone="green"
                 title={row ? `Edit ${row.name}` : 'Create Fee Plan'}
                 sub="What transport costs, who it applies to, and when it is billed."
                 submitLabel={row ? 'Save plan' : 'Create plan'}
                 errors={v.errors} onSubmit={() => v.run(form, save)}
                 steps={steps}
                 sections={{
        plan: (
          <>
            <FormGrid>
              <Field label="Plan name" required full error={v.errors.name}>
                <Input value={form.name} aria-invalid={!!v.errors.name}
                       onChange={(e) => put('name', e.target.value)} placeholder="R1 - South Zone" />
              </Field>
              <Field label="Charged by">
                <Select value={form.basis} onChange={(x) => put('basis', x)}
                        options={[
                          { value: 'flat', label: 'Flat — one amount for everyone' },
                          { value: 'route', label: 'Per route' },
                          { value: 'stop', label: 'Per stop' },
                          { value: 'distance', label: 'By distance band' },
                          { value: 'zone', label: 'By zone band' },
                        ]} />
              </Field>
              <Field label="Billing frequency">
                <Select value={form.frequency} onChange={(x) => put('frequency', x)}
                        options={Object.entries(FREQUENCY).map(([value, label]) => ({ value, label }))} />
              </Field>
              {!banded ? (
                <Field label="Fee amount (₹)" required error={v.errors.amount}>
                  <Input type="number" min="0" value={form.amount} aria-invalid={!!v.errors.amount}
                         onChange={(e) => put('amount', e.target.value)} />
                </Field>
              ) : null}
              <Field label="Description" full><Textarea value={form.description} onChange={(e) => put('description', e.target.value)} rows={2} /></Field>
            </FormGrid>
          </>
        ),
        bands: banded && (
          <>
            {v.errors.zones ? <span className="tr-field__err" style={{ marginBottom: 8 }}>{v.errors.zones}</span> : null}
            {form.zones.map((z, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 34px', gap: 8, marginBottom: 8 }}>
                <Input value={z.name} placeholder="Band name"
                       onChange={(e) => putZones((zs) => zs.map((x, k) => (k === idx ? { ...x, name: e.target.value } : x)))} />
                <Input type="number" value={z.maxDistanceKm} placeholder="km"
                       onChange={(e) => putZones((zs) => zs.map((x, k) => (k === idx ? { ...x, maxDistanceKm: e.target.value } : x)))} />
                <Input type="number" value={z.amount} placeholder="₹"
                       onChange={(e) => putZones((zs) => zs.map((x, k) => (k === idx ? { ...x, amount: e.target.value } : x)))} />
                <IconBtn icon="trash" kind="danger" label="Remove band"
                         onClick={() => putZones((zs) => zs.filter((_, k) => k !== idx))} />
              </div>
            ))}
            <Btn size="sm" kind="soft" icon="plus"
                 onClick={() => putZones((zs) => [...zs, { name: '', maxDistanceKm: '', amount: '' }])}>Add band</Btn>
          </>
        ),
        who: (
          <>
            <FormGrid>
              <Field label="Route"><Select value={form.route} onChange={(x) => put('route', x)} placeholder="All routes" options={opt(meta.routes, (r) => `${r.routeCode} — ${r.name}`)} /></Field>
              <Field label="Zone label"><Input value={form.zoneLabel} onChange={(e) => put('zoneLabel', e.target.value)} placeholder="South Kolkata" /></Field>
              <Field label="Vehicle type">
                <Select value={form.vehicleType} onChange={(x) => put('vehicleType', x)} placeholder="Any"
                        options={Object.entries(VEHICLE_TYPE).map(([value, label]) => ({ value, label }))} />
              </Field>
            </FormGrid>
          </>
        ),
        extras: (
          <>
            <FormGrid>
              <Field label="Late fee per day (₹)"><Input type="number" min="0" value={form.lateFeePerDay} onChange={(e) => put('lateFeePerDay', e.target.value)} /></Field>
              <Field label="Sibling discount (%)" error={v.errors.siblingDiscountPct}>
                <Input type="number" min="0" max="100" value={form.siblingDiscountPct} aria-invalid={!!v.errors.siblingDiscountPct}
                       onChange={(e) => put('siblingDiscountPct', e.target.value)} />
              </Field>
              <Field label="Effective from"><Input type="date" value={form.effectiveFrom} onChange={(e) => put('effectiveFrom', e.target.value)} /></Field>
              <Field label="Renewal date" hint="Listed under Upcoming Fee Renewals"><Input type="date" value={form.renewalDate} onChange={(e) => put('renewalDate', e.target.value)} /></Field>
              <Field label="Status">
                <Select value={form.status} onChange={(x) => put('status', x)} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
              </Field>
              <Field label="Approval">
                <Select value={form.approvalStatus} onChange={(x) => put('approvalStatus', x)}
                        options={[{ value: 'approved', label: 'Approved' }, { value: 'pending', label: 'Awaiting approval' }]} />
              </Field>
            </FormGrid>
          </>
        ),
        review: (          <div className="tr-review">
            <R k="Plan">{form.name}</R>
            <R k="Charged by">{words(form.basis || '')}</R>
            <R k="Frequency">{words(form.frequency || '')}</R>
            <R k="Amount">{banded ? `${plural(form.zones.length, 'band')}` : (+form.amount ? money(form.amount) : '')}</R>
            <R k="Route">{metaName(meta.routes, form.route)}</R>
            <R k="Effective from">{form.effectiveFrom ? fmtDate(form.effectiveFrom) : ''}</R>
            <R k="Late fee / day">{+form.lateFeePerDay ? money(form.lateFeePerDay) : ''}</R>
            <R k="Sibling discount">{+form.siblingDiscountPct ? `${form.siblingDiscountPct}%` : ''}</R>
          </div>
        ),
      }} />
  );
}

export function GenerateInvoicesModal({ open, onClose, onSaved }) {
  const now = new Date();
  const [form, set] = useForm({ month: now.getMonth() + 1, year: now.getFullYear(), dueDate: '' }, open);
  const submit = async () => {
    const res = await api.generateInvoices({ ...form, month: +form.month, year: +form.year, dueDate: form.dueDate || null });
    const body = res?.data ?? res;
    toast.success(`${body.created} invoice${body.created === 1 ? '' : 's'} generated`);
    onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} slim icon="invoice" iconTone="blue" title="Bulk Generate Invoices"
               sub="One per active assignment that carries a fee plan. A student already billed for that period is skipped."
               submitLabel="Generate" onSubmit={submit}>
      <FormGrid>
        <Field label="Month">
          <Select value={String(form.month)} onChange={(v) => set('month', v)}
                  options={['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => ({ value: String(i + 1), label: m }))} />
        </Field>
        <Field label="Year"><Input type="number" value={form.year} onChange={(e) => set('year', e.target.value)} /></Field>
        <Field label="Due date" hint="Left blank, the school's invoice due day is used" full>
          <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
      </FormGrid>
    </FormModal>
  );
}

export function PaymentModal({ open, onClose, onSaved, invoice }) {
  const due = Math.max(0, (invoice?.netAmount || 0) - (invoice?.paidAmount || 0));
  const [form, set] = useForm({ amount: due || '', mode: 'cash', reference: '', note: '' }, open);
  const submit = async () => {
    if (!(+form.amount > 0)) throw new Error('Enter an amount above zero');
    await api.payInvoice(invoice._id, { ...form, amount: +form.amount });
    toast.success('Payment recorded');
    onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} slim icon="rupee" iconTone="green"
               title={`Record payment — ${invoice?.invoiceNumber || ''}`}
               sub={`${invoice?.student?.name || ''} · ${money(due)} outstanding`}
               submitLabel="Record payment" onSubmit={submit}>
      <FormGrid>
        <Field label="Amount (₹)" required><Input type="number" min="1" value={form.amount} onChange={(e) => set('amount', e.target.value)} /></Field>
        <Field label="Mode">
          <Select value={form.mode} onChange={(v) => set('mode', v)} options={Object.entries(PAY_MODE).map(([value, label]) => ({ value, label }))} />
        </Field>
        <Field label="Reference" full><Input value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="Cheque / UPI reference" /></Field>
        <Field label="Note" full><Input value={form.note} onChange={(e) => set('note', e.target.value)} /></Field>
      </FormGrid>
    </FormModal>
  );
}

export function RemindModal({ open, onClose, onSaved, picked = [] }) {
  const [form, set] = useForm({ scope: 'due', message: '' }, open);
  const submit = async () => {
    const res = await api.remindInvoices({ invoices: picked, scope: form.scope, message: form.message });
    const body = res?.data ?? res;
    toast.success(body.sent ? `${body.sent} reminder${body.sent === 1 ? '' : 's'} sent` : body.message || 'Nothing outstanding');
    onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} slim icon="bell" iconTone="amber" title="Send payment reminders"
               sub="Only families with something outstanding are messaged."
               submitLabel="Send reminders" onSubmit={submit}>
      <FormGrid one>
        {picked.length ? <Note tone="info">Sending to the {picked.length} invoice{picked.length === 1 ? '' : 's'} you picked.</Note> : (
          <Field label="Who">
            <Select value={form.scope} onChange={(v) => set('scope', v)}
                    options={[{ value: 'due', label: 'Everyone due soon' }, { value: 'overdue', label: 'Overdue only' }]} />
          </Field>
        )}
        <Field label="Message" hint="Left blank, each family gets their own invoice number and balance">
          <Textarea value={form.message} onChange={(e) => set('message', e.target.value)} />
        </Field>
      </FormGrid>
    </FormModal>
  );
}

/* ── Notifications & reports ──────────────────────────────────────────────── */

export function NotifyModal({ open, onClose, onSaved, routes = [] }) {
  const [form, set] = useForm({ route: '', title: '', body: '' }, open);
  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) throw new Error('A title and a message are required');
    const res = await api.notifyAssignees({ route: form.route || null, title: form.title, body: form.body });
    const body = res?.data ?? res;
    toast.success(`Sent to ${body.recipients} recipient${body.recipients === 1 ? '' : 's'}`);
    onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} slim icon="send" iconTone="blue" title="Send Notification"
               sub="Goes to the students on the route and to their parents."
               submitLabel="Send" onSubmit={submit}>
      <FormGrid one>
        <Field label="Route" required>
          <Select value={form.route} onChange={(v) => set('route', v)} placeholder="Pick a route"
                  options={routes.map((r) => ({ value: r.value ?? r._id, label: r.label ?? r.name }))} />
        </Field>
        <Field label="Title" required><Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Route R3 running late tomorrow" /></Field>
        <Field label="Message" required><Textarea value={form.body} onChange={(e) => set('body', e.target.value)} /></Field>
      </FormGrid>
    </FormModal>
  );
}

export function ScheduleReportModal({ open, onClose, onSaved, catalog = [], row }) {
  const [form, set] = useForm(row ? {
    _id: row._id, name: row.name, reportType: row.reportType, format: row.format,
    frequency: row.frequency || 'weekly', weekday: row.weekday ?? 1, dayOfMonth: row.dayOfMonth ?? 1,
    recipients: (row.recipients || []).join(', '), preset: 'last_30_days',
  } : { name: '', reportType: catalog[0]?.key || 'trip_summary', format: 'pdf', frequency: 'weekly', weekday: 1, dayOfMonth: 1, recipients: '', preset: 'last_30_days' }, open);

  const submit = async () => {
    await api.saveScheduledReport({
      ...form,
      recipients: form.recipients.split(',').map((s) => s.trim()).filter(Boolean),
    });
    toast.success(row ? 'Schedule updated' : 'Report scheduled');
    onSaved?.();
  };
  return (
    <FormModal open={open} onClose={onClose} icon="calendar" iconTone="blue" title={row ? 'Edit schedule' : 'Schedule a Report'}
               sub="It runs on its own and emails the people you list." submitLabel="Save schedule" onSubmit={submit}>
      <FormGrid>
        <Field label="Report" required full>
          <Select value={form.reportType} onChange={(v) => set('reportType', v)}
                  options={catalog.map((c) => ({ value: c.key, label: c.name }))} />
        </Field>
        <Field label="Name it" hint="Left blank, the report's own name is used"><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="Format">
          <Select value={form.format} onChange={(v) => set('format', v)}
                  options={[{ value: 'pdf', label: 'PDF' }, { value: 'excel', label: 'Excel' }, { value: 'csv', label: 'CSV' }]} />
        </Field>
        <Field label="How often">
          <Select value={form.frequency} onChange={(v) => set('frequency', v)}
                  options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} />
        </Field>
        {form.frequency === 'weekly' ? (
          <Field label="Day">
            <Select value={String(form.weekday)} onChange={(v) => set('weekday', +v)}
                    options={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => ({ value: String(i), label: d }))} />
          </Field>
        ) : null}
        {form.frequency === 'monthly' ? (
          <Field label="Day of month"><Input type="number" min="1" max="28" value={form.dayOfMonth} onChange={(e) => set('dayOfMonth', e.target.value)} /></Field>
        ) : null}
        <Field label="Email to" hint="Comma-separated" full>
          <Input value={form.recipients} onChange={(e) => set('recipients', e.target.value)} placeholder="head@school.edu.in, transport@school.edu.in" />
        </Field>
      </FormGrid>
    </FormModal>
  );
}

export default NewRequestModal;
