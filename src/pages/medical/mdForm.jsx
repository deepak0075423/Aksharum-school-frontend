/**
 * The Medical Room's forms (Oct 2026). Every form in the module is a
 * FormDialog given sections of fields, so they all look, validate, show
 * errors and save the same way — a nurse who has filled in one has filled in
 * all of them.
 *
 *   <FormDialog open title sections={[{ title, fields: [{ name, label, type, required, … }] }]}
 *               initial={{…}} onSubmit={async (values) => api(…)} onDone={reload} />
 *
 * Field types: text, textarea, number, date, time, datetime, select, seg,
 * chips (quick picks into a text field), multi (chips, many), switch, check,
 * student, custom. Names may be paths ("vitals.temperature").
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '../../components/ui';
import { Btn, Field, Ico, Note, Segmented, Chips, Switch, Avatar, Popover, IconBtn, useDebounced } from './mdUI';
import { errorText, qty } from './mdMeta';

/* ── Paths ────────────────────────────────────────────────────────────────── */

export const getPath = (obj, path) => String(path).split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
export function setPath(obj, path, value) {
  const keys = String(path).split('.');
  const out = { ...obj };
  let cur = out;
  for (let i = 0; i < keys.length - 1; i += 1) {
    cur[keys[i]] = { ...(cur[keys[i]] || {}) };
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
  return out;
}

const empty = (v) => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);

/* ── Student picker ───────────────────────────────────────────────────────── */

/**
 * Search a student by name, admission number or class. Identity only — a
 * picker never carries medical information. `value` is the chosen student
 * ({ _id, name, photo, classLabel, admissionNumber }) or null.
 */
export function StudentPicker({ value, onChange, fetcher, placeholder = 'Search by name, admission no. or class', disabled, autoFocus }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const input = useRef(null);
  const term = useDebounced(q, 220);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setBusy(true);
    Promise.resolve(fetcher(term)).then((res) => {
      if (!alive) return;
      const rows = res?.data ?? res;
      setList(Array.isArray(rows) ? rows : []);
      setActive(0);
    }).catch(() => alive && setList([])).finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [term, open, fetcher]);

  const pick = (s) => { onChange(s); setQ(''); setOpen(false); };
  const close = useCallback(() => setOpen(false), []);

  if (value?._id) {
    return (
      <div className="md-picker">
        <div className="md-picker__box">
          <span className="md-picker__chosen">
            <Avatar name={value.name} photo={value.photo} size={32} />
            <span className="md-two"><b>{value.name}</b><em>{[value.classLabel || [value.className, value.sectionName].filter(Boolean).join(' – '), value.admissionNumber].filter(Boolean).join(' · ')}</em></span>
          </span>
          {!disabled ? <IconBtn icon="close" label="Choose another student" size={14} onClick={() => { onChange(null); setTimeout(() => input.current?.focus(), 0); }} /> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="md-picker" ref={box}>
      <div className="md-picker__box">
        <Ico name="search" size={16} />
        <input
          ref={input} value={q} disabled={disabled} autoFocus={autoFocus} placeholder={placeholder} aria-label="Find a student"
          // Opens on typing or a click, not on focus: an autofocused picker
          // would otherwise drop its list over the form the moment it loads.
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onClick={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, list.length - 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            if (e.key === 'Enter' && open && list[active]) { e.preventDefault(); pick(list[active]); }
          }}
        />
      </div>
      <Popover anchor={box} open={open} onClose={close} label="Students" className="md-pop--picker" match>
        {busy && !list.length ? <div className="md-picker__empty">Searching…</div> : null}
        {!busy && !list.length ? <div className="md-picker__empty">{q ? 'No student matches that' : 'Type a name, admission number or class'}</div> : null}
        {list.length ? (
          <ul className="md-picker__list">
            {list.map((s, i) => (
              <li key={s._id}>
                <button type="button" className={i === active ? 'is-active' : ''} onMouseEnter={() => setActive(i)} onClick={() => pick(s)}>
                  <Avatar name={s.name} photo={s.photo} size={32} />
                  <span className="md-two"><b>{s.name}</b><em>{[s.classLabel || [s.className, s.sectionName].filter(Boolean).join(' – '), s.admissionNumber].filter(Boolean).join(' · ') || 'Student'}</em></span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Popover>
    </div>
  );
}

/* ── Items: medicines given, supplies used ────────────────────────────────── */

const itemLabel = (it) => `${it.name}${it.strength ? ` ${it.strength}` : ''} — ${qty(it.usable)} ${it.unit || ''} in date`;

export function ItemSelect({ items = [], value, onChange, placeholder = 'Choose…', allowEmpty = true }) {
  return (
    <span className={`md-select${value ? ' is-set' : ''}`} style={{ width: '100%' }}>
      <select value={value || ''} onChange={(e) => onChange(e.target.value)} aria-label="Item">
        {allowEmpty ? <option value="">{placeholder}</option> : null}
        {items.map((it) => <option key={it._id} value={it._id} disabled={!(Number(it.usable) > 0)}>{itemLabel(it)}</option>)}
      </select>
      <Ico name="chevronDown" size={15} />
    </span>
  );
}

/**
 * Lines of medicine given: [{ source: 'school' | 'parent', item, medicineName, dosage, quantity }].
 * `plans` are the student's own medication plans, offered first.
 */
/** `renderCheck(line)` draws under a line what the safety check says about it (admin/mdSafety DoseCheck). */
export function MedicineLines({ value = [], onChange, items = [], plans = [], renderCheck }) {
  const set = (i, patch) => onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = () => onChange([...value, { source: 'school', item: '', dosage: '', quantity: 1 }]);
  return (
    <div className="md-lines">
      {value.map((l, i) => {
        const it = items.find((x) => x._id === l.item);
        const low = it && Number(l.quantity) > Number(it.usable);
        return (
          <div key={i}>
          <div className="md-line">
            <div>
              {l.source === 'parent' ? (
                <input className="md-input" value={l.medicineName || ''} onChange={(e) => set(i, { medicineName: e.target.value })} placeholder="Family's own medicine — name" />
              ) : l.plan ? (
                <span className="md-select is-set" style={{ width: '100%' }}>
                  <select value={l.plan} onChange={(e) => set(i, { plan: e.target.value })} aria-label="Medication plan">
                    {plans.map((p) => <option key={p._id} value={p._id}>{p.medicineName} — {p.dosage} (plan)</option>)}
                  </select><Ico name="chevronDown" size={15} />
                </span>
              ) : (
                <ItemSelect items={items} value={l.item} onChange={(v) => set(i, { item: v })} placeholder="Choose a medicine from stock" />
              )}
              <div className={`md-line__stock${low ? ' is-low' : ''}`}>
                {l.source === 'parent' ? 'Not taken from school stock' : it ? `${qty(it.usable)} ${it.unit} in date${low ? ' — not enough' : ''}` : ''}
                {' '}
                <button type="button" className="md-btn md-btn--ghost md-btn--xs" onClick={() => set(i, l.source === 'parent' ? { source: 'school', medicineName: '' } : { source: 'parent', item: '', plan: '' })}>
                  {l.source === 'parent' ? 'Use school stock' : "Family's own medicine"}
                </button>
              </div>
            </div>
            <input className="md-input" value={l.dosage || ''} onChange={(e) => set(i, { dosage: e.target.value })} placeholder="Dosage, e.g. 1 tablet" aria-label="Dosage" />
            <input className="md-input" type="number" min="0" step="0.5" value={l.source === 'parent' ? '' : (l.quantity ?? '')} disabled={l.source === 'parent'} onChange={(e) => set(i, { quantity: e.target.value })} placeholder="Qty" aria-label="Quantity from stock" />
            <IconBtn icon="trash" label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
          {renderCheck ? renderCheck(l) : null}
          </div>
        );
      })}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Btn size="sm" kind="tint" icon="plus" onClick={add}>Add a medicine</Btn>
        {plans.length ? <Btn size="sm" kind="ghost" icon="pill" onClick={() => onChange([...value, { source: 'school', plan: plans[0]._id, dosage: plans[0].dosage, quantity: plans[0].quantityPerDose ?? 1 }])}>From the student&rsquo;s plan</Btn> : null}
      </div>
    </div>
  );
}

/** Supplies used: [{ item, quantity }]. */
export function SupplyLines({ value = [], onChange, items = [] }) {
  const set = (i, patch) => onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="md-lines">
      {value.map((l, i) => {
        const it = items.find((x) => x._id === l.item);
        const low = it && Number(l.quantity) > Number(it.usable);
        return (
          <div key={i} className="md-line md-line--2">
            <div>
              <ItemSelect items={items} value={l.item} onChange={(v) => set(i, { item: v })} placeholder="Choose a supply" />
              {it ? <div className={`md-line__stock${low ? ' is-low' : ''}`}>{qty(it.usable)} {it.unit} available{low ? ' — not enough' : ''}</div> : null}
            </div>
            <input className="md-input" type="number" min="0" step="1" value={l.quantity ?? ''} onChange={(e) => set(i, { quantity: e.target.value })} placeholder="Qty" aria-label="Quantity used" />
            <IconBtn icon="trash" label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))} />
          </div>
        );
      })}
      <div><Btn size="sm" kind="tint" icon="plus" onClick={() => onChange([...value, { item: '', quantity: 1 }])}>Add a supply</Btn></div>
    </div>
  );
}

/* ── Vitals ───────────────────────────────────────────────────────────────── */

/** Mirrors services/medicalRules.vitalFlags: hints for the person at the bedside. */
export function vitalLevel(key, v = {}) {
  const n = Number(v[key]);
  if (v[key] === '' || v[key] === null || v[key] === undefined || !Number.isFinite(n)) return '';
  const c = v.tempUnit === 'C';
  if (key === 'temperature') return n >= (c ? 39.4 : 103) ? 'critical' : n >= (c ? 38 : 100.4) || n <= (c ? 35 : 95) ? 'warning' : '';
  if (key === 'spo2') return n < 90 ? 'critical' : n < 95 ? 'warning' : '';
  if (key === 'pulse') return n > 140 || n < 45 ? 'critical' : n > 120 || n < 55 ? 'warning' : '';
  if (key === 'bpSystolic') return n >= 160 ? 'critical' : n >= 140 || n < 85 ? 'warning' : '';
  if (key === 'bpDiastolic') return n >= 100 ? 'critical' : n >= 90 ? 'warning' : '';
  return '';
}

export function VitalsFields({ value = {}, onChange, unit = 'F' }) {
  const v = { tempUnit: unit, ...value };
  const set = (k) => (e) => onChange({ ...v, [k]: e.target.value });
  const box = (k, label, u, step = '1', placeholder) => {
    const lvl = vitalLevel(k, v);
    return (
      <Field label={label}>
        <span className={`md-unit${lvl === 'critical' ? ' is-critical' : lvl === 'warning' ? ' is-flag' : ''}`}>
          <input className="md-input md-input--unit" type="number" inputMode="decimal" step={step} value={v[k] ?? ''} onChange={set(k)} placeholder={placeholder} />
          <span>{u}</span>
        </span>
      </Field>
    );
  };
  return (
    <div className="md-form__grid md-form__grid--3">
      <Field label="Temperature">
        <span style={{ display: 'flex', gap: 6 }}>
          <span className={`md-unit${vitalLevel('temperature', v) === 'critical' ? ' is-critical' : vitalLevel('temperature', v) ? ' is-flag' : ''}`} style={{ flex: 1 }}>
            <input className="md-input md-input--unit" type="number" inputMode="decimal" step="0.1" value={v.temperature ?? ''} onChange={set('temperature')} placeholder={v.tempUnit === 'C' ? '37.0' : '98.6'} />
            <span>°{v.tempUnit}</span>
          </span>
          <Segmented size="sm" value={v.tempUnit} onChange={(u) => onChange({ ...v, tempUnit: u })} options={[{ value: 'F', label: '°F' }, { value: 'C', label: '°C' }]} label="Unit" />
        </span>
      </Field>
      {box('pulse', 'Pulse', 'bpm', '1', '84')}
      {box('spo2', 'SpO₂', '%', '1', '98')}
      {box('bpSystolic', 'BP systolic', 'mmHg', '1', '110')}
      {box('bpDiastolic', 'BP diastolic', 'mmHg', '1', '70')}
      {box('weightKg', 'Weight', 'kg', '0.1', '38')}
    </div>
  );
}

/* ── The form ─────────────────────────────────────────────────────────────── */

function Control({ f, value, values, set, ctx }) {
  const id = `mdf-${f.name.replace(/\W/g, '-')}`;
  switch (f.type) {
  case 'textarea':
    return <textarea id={id} className="md-textarea" rows={f.rows || 3} value={value ?? ''} maxLength={f.maxLength || 2000} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />;
  case 'number':
    return f.unit ? (
      <span className="md-unit"><input id={id} className="md-input md-input--unit" type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step || 'any'} value={value ?? ''} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} /><span>{f.unit}</span></span>
    ) : <input id={id} className="md-input" type="number" inputMode="decimal" min={f.min} max={f.max} step={f.step || 'any'} value={value ?? ''} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />;
  case 'date':
    return <input id={id} className="md-input" type="date" value={value ?? ''} min={f.min} max={f.max} onChange={(e) => set(e.target.value)} />;
  case 'time':
    return <input id={id} className="md-input" type="time" value={value ?? ''} onChange={(e) => set(e.target.value)} />;
  case 'datetime':
    return <input id={id} className="md-input" type="datetime-local" value={value ?? ''} max={f.max} onChange={(e) => set(e.target.value)} />;
  case 'select':
    return (
      <span className={`md-select${value ? ' is-set' : ''}`} style={{ width: '100%' }}>
        <select id={id} value={value ?? ''} onChange={(e) => set(e.target.value)}>
          {f.placeholder !== false ? <option value="">{f.placeholder || 'Choose…'}</option> : null}
          {(typeof f.options === 'function' ? f.options(values) : f.options || []).map((o) => (typeof o === 'string'
            ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>))}
        </select>
        <Ico name="chevronDown" size={15} />
      </span>
    );
  case 'seg':
    return <Segmented value={value} onChange={set} options={typeof f.options === 'function' ? f.options(values) : f.options} label={f.label} size={f.size} />;
  case 'chips':
    return (
      <>
        <input id={id} className="md-input" value={value ?? ''} maxLength={f.maxLength || 200} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} />
        <Chips options={f.options || []} value={value} onPick={(v) => set(value === v ? '' : v)} />
      </>
    );
  case 'multi':
    return <Chips multi options={f.options || []} value={value || []} onPick={(v) => set((value || []).includes(v) ? value.filter((x) => x !== v) : [...(value || []), v])} />;
  case 'switch':
    return <Switch checked={!!value} onChange={set} label={f.switchLabel || f.label} hint={f.hint} />;
  case 'check':
    return <label className="md-check"><input type="checkbox" checked={!!value} onChange={(e) => set(e.target.checked)} />{f.checkLabel}</label>;
  case 'student':
    return <StudentPicker value={value} onChange={set} fetcher={f.fetcher} disabled={f.disabled} autoFocus={f.autoFocus} />;
  case 'custom':
    return f.render({ value, set, values, ctx });
  default:
    return <input id={id} className="md-input" type={f.inputType || 'text'} value={value ?? ''} maxLength={f.maxLength || 200} placeholder={f.placeholder} onChange={(e) => set(e.target.value)} autoFocus={f.autoFocus} />;
  }
}

export function FormDialog({
  open, onClose, title, sections, initial, onSubmit, onDone, submitLabel = 'Save', width = 680,
  intro, success, submitKind = 'primary', ctx, extraFooter,
}) {
  const [values, setValues] = useState(initial || {});
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState('');
  const body = useRef(null);
  // Reset only when the dialog OPENS. Resetting whenever `initial` changed
  // would wipe a half-filled form the moment a parent re-rendered with a fresh
  // object (a background refresh of the lists, a new "now" for a time field).
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) { setValues(initial || {}); setErrors({}); setFail(''); setBusy(false); }
    wasOpen.current = open;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const list = useMemo(() => (typeof sections === 'function' ? sections(values) : sections) || [], [sections, values]);
  const visible = (f) => !f.show || f.show(values);
  // A field may carry `onSet(value, nextValues) => values`, to fill in what
  // follows from it — choosing which allergy to change loads its current values.
  // Choosing what is already chosen changes nothing (no reload over edits).
  const setField = (f, v) => setValues((cur) => {
    if (f.onSet && getPath(cur, f.name) === v) return cur;
    const next = setPath(cur, f.name, v);
    return (f.onSet && f.onSet(v, next)) || next;
  });

  const submit = async (e) => {
    e?.preventDefault?.();
    const errs = {};
    for (const s of list) {
      if (s.show && !s.show(values)) continue;
      for (const f of s.fields || []) {
        if (!visible(f)) continue;
        const v = getPath(values, f.name);
        if (f.required && (empty(v) || (f.type === 'student' && !v?._id))) errs[f.name] = `${f.label || 'This'} is required`;
        else if (f.validate) { const m = f.validate(v, values); if (m) errs[f.name] = m; }
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length) {
      setFail('Please check the highlighted fields');
      setTimeout(() => body.current?.querySelector('.md-field.has-error')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 30);
      return;
    }
    setBusy(true); setFail('');
    try {
      const res = await onSubmit(values);
      if (success) toast.success(typeof success === 'function' ? success(res) : success);
      onDone?.(res?.data ?? res, values);
      onClose();
    } catch (err) {
      setFail(errorText(err, 'That could not be saved'));
      body.current?.scrollIntoView?.({ block: 'start' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={title} maxWidth={width}
      footer={<>{extraFooter}<Btn onClick={onClose} disabled={busy}>Cancel</Btn><Btn kind={submitKind} busy={busy} onClick={submit}>{submitLabel}</Btn></>}>
      <form className="md-form" ref={body} onSubmit={submit} noValidate>
        {fail ? <Note tone="red" icon="alert">{fail}</Note> : null}
        {intro}
        {list.filter((s) => !s.show || s.show(values)).map((s, si) => (
          <div key={s.title || si} className={s.title ? 'md-form__sec' : ''}>
            {s.title ? <h4>{s.icon ? <span><Ico name={s.icon} size={14} /></span> : null}{s.title}</h4> : null}
            {s.hint ? <p>{s.hint}</p> : null}
            {s.render ? s.render({ values, setValues, ctx }) : null}
            {(s.fields || []).length ? (
              <div className={`md-form__grid${s.cols === 3 ? ' md-form__grid--3' : ''}${s.cols === 1 ? ' md-form__grid--1' : ''}`} style={s.cols === 1 ? { gridTemplateColumns: '1fr' } : undefined}>
                {s.fields.filter(visible).map((f) => (
                  f.type === 'switch'
                    ? <div key={f.name} className={f.wide !== false ? 'is-wide' : ''}><Control f={f} value={getPath(values, f.name)} values={values} set={(v) => setField(f, v)} ctx={ctx} /></div>
                    : (
                      <Field key={f.name} label={f.label} hint={f.hint} required={f.required} optional={f.optional} error={errors[f.name]} className={f.wide ? 'is-wide' : ''}
                        htmlFor={`mdf-${f.name.replace(/\W/g, '-')}`}>
                        <Control f={f} value={getPath(values, f.name)} values={values} set={(v) => { setField(f, v); if (errors[f.name]) setErrors((e) => ({ ...e, [f.name]: undefined })); }} ctx={ctx} />
                      </Field>
                    )
                ))}
              </div>
            ) : null}
          </div>
        ))}
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Modal>
  );
}

/** A form's value for a nested optional object, with blanks dropped. */
export const clean = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, v]) => v !== '' && v !== undefined));
