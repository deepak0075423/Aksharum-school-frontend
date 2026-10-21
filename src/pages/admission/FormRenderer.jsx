/**
 * Draws an application form from its schema — the applicant's form, and the
 * builder's live preview. Inputs carry the platform's text kinds (`data-text`,
 * utils/textGuard) so a name box takes letters, a PIN box six digits, and so on.
 *
 * Props:
 *   schema, values, onChange(key, value), errors {key: message}
 *   scope { classId, roundId }      which class/round-specific questions apply
 *   sectionKeys                     only these sections (a wizard step); all when omitted
 *   docs { byKey: {docKey: file}, onUpload(docKey, file), onRemove(file), onOpen(file), busy: {docKey: pct} }
 *   readOnly
 *
 * A PIN code answer looks its place up (the ERP's own lookup, school-backend
 * services/pincodes.js) and fills the city and state questions of the same
 * address — only those still empty; nothing the family typed is overwritten.
 */
import React, { useRef, useState } from 'react';
import PhoneInput from '../../components/ui/PhoneInput';
import { pub } from '../../api/admission.api';
import { Field, Input, TextArea, Select, IconBtn, Chip, Ico } from './admUI';
import { visibleSections } from './formLogic';
import { DOC_STATUS, size as fmtSize } from './meta';

const TEXT_KIND = { name: 'name', letters: 'letters', place: 'place', title: 'title', words: 'words', sentence: 'sentence', code: 'code', upper: 'upper', digits: 'digits', decimal: 'decimal', token: 'token', pincode: 'pincode', aadhaar: 'aadhaar', pan: 'pan', ifsc: 'ifsc', gstin: 'gstin', account: 'account', uan: 'uan', hsn: 'hsn', udise: 'digits', pen: 'digits', apaar: 'digits' };
const NUMERIC_KINDS = new Set(['digits', 'pincode', 'aadhaar', 'account', 'uan', 'hsn', 'udise', 'pen', 'apaar']);

const PIN_CACHE = new Map();
async function lookupPin(pin) {
  if (PIN_CACHE.has(pin)) return PIN_CACHE.get(pin);
  const r = await pub.pincode(pin).then((x) => x.data).catch(() => null);
  PIN_CACHE.set(pin, r);
  return r;
}

/** The questions a PIN fills: its address's city and state (by where they go at enrolment), else its section's. */
function pinTargets(schema, f) {
  const fields = (schema?.sections || []).flatMap((sec) => (sec.fields || []).map((x) => ({ ...x, sec: sec.key })));
  const group = String(f.mapTo || '').endsWith('.pincode') ? f.mapTo.slice(0, -'.pincode'.length) : null;
  const sec = fields.find((x) => x.key === f.key)?.sec;
  // Never another address's city or state (a permanent address in the same section).
  const elsewhere = (x) => /\.(city|state)$/.test(x.mapTo || '') && (!group || !x.mapTo.startsWith(`${group}.`));
  const pick = (part, re) => (group && fields.find((x) => x.mapTo === `${group}.${part}`))
    || fields.find((x) => x.sec === sec && x.key !== f.key && ['text', 'select'].includes(x.type) && !elsewhere(x) && re.test(`${x.key} ${x.label}`));
  return { city: pick('city', /city|town|district/i), state: pick('state', /\bstate/i) };
}
const blank = (v) => v === undefined || v === null || String(v).trim() === '';

function FileField({ f, docs, readOnly, error }) {
  const file = docs?.byKey?.[f.docType];
  const busy = docs?.busy?.[f.docType];
  const bad = file && ['rejected', 'resubmission_required'].includes(file.status);
  const st = file ? DOC_STATUS[file.status] : null;
  const accept = (docs?.types?.[f.docType]?.accept || ['pdf', 'jpg', 'jpeg', 'png']).map((x) => `.${x}`).join(',');
  const maxMb = docs?.types?.[f.docType]?.maxSizeMB;
  return (
    <div className={`adm-upload ${file ? (bad ? 'is-bad' : 'is-filled') : ''}`}>
      <Ico name={file ? (bad ? 'alert' : 'checkCircle') : 'upload'} size={20} />
      <div className="adm-upload__text">
        <strong>{file ? (file.originalName || 'Uploaded') : 'No file yet'}</strong>
        <em>
          {file ? `${fmtSize(file.size || 0)} · ` : ''}{accept.replace(/\./g, '').toUpperCase().replace(/,/g, ', ')}{maxMb ? ` · up to ${maxMb} MB` : ''}
          {bad && file.rejectionReason ? ` — ${file.rejectionReason}` : ''}
        </em>
        {busy != null ? <div className="adm-upload__bar"><span style={{ width: `${busy}%` }} /></div> : null}
        {error ? <span className="adm-field__error">{error}</span> : null}
      </div>
      {st ? <Chip tone={st.tone}>{st.label}</Chip> : null}
      {file && docs?.onOpen ? <IconBtn icon="eye" label="Open" onClick={() => docs.onOpen(file)} /> : null}
      {!readOnly && docs?.onUpload ? (
        <label className="adm-btn adm-btn--outline adm-btn--sm" style={{ cursor: 'pointer' }}>
          <Ico name="upload" size={14} />{file ? 'Replace' : 'Upload'}
          <input type="file" accept={accept} hidden onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ''; if (x) docs.onUpload(f.docType, x); }} />
        </label>
      ) : null}
      {file && !readOnly && docs?.onRemove && file.status === 'uploaded' ? <IconBtn icon="trash" kind="danger" label="Remove" onClick={() => docs.onRemove(file)} /> : null}
    </div>
  );
}

function FieldInput({ f, value, onChange, readOnly, error, docs }) {
  const id = `fld-${f.key}`;
  const common = { id, disabled: readOnly, invalid: !!error, placeholder: f.placeholder || undefined };
  switch (f.type) {
    case 'textarea':
      return <TextArea {...common} rows={3} value={value ?? ''} maxLength={f.validation?.maxLength || 2000} onChange={(e) => onChange(e.target.value)} data-text={TEXT_KIND[f.validation?.kind] || 'text'} />;
    case 'number':
      return <Input {...common} type="number" value={value ?? ''} min={f.validation?.min ?? undefined} max={f.validation?.max ?? undefined}
        step={f.validation?.integer ? '1' : 'any'} onChange={(e) => onChange(e.target.value === '' ? '' : e.target.value)} />;
    case 'date': {
      const today = new Date().toISOString().slice(0, 10);
      const b = (x) => (x === 'today' ? today : x || undefined);
      return <Input {...common} type="date" value={value ?? ''} min={b(f.validation?.minDate)} max={b(f.validation?.maxDate)} onChange={(e) => onChange(e.target.value)} />;
    }
    case 'email':
      return <Input {...common} type="email" value={value ?? ''} maxLength={200} onChange={(e) => onChange(e.target.value)} />;
    case 'phone':
      return <PhoneInput id={id} className={`adm-input ${error ? 'is-invalid' : ''}`} disabled={readOnly} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder || '10-digit mobile'} />;
    case 'select':
      return (
        <Select {...common} value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
          <option value="">Choose…</option>
          {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      );
    case 'radio':
      return (
        <div className="adm-choices" role="radiogroup" aria-labelledby={`${id}-l`}>
          {(f.options || []).map((o) => (
            <label key={o.value} className={`adm-choice ${value === o.value ? 'is-on' : ''}`}>
              <input type="radio" name={id} value={o.value} disabled={readOnly} checked={value === o.value} onChange={() => onChange(o.value)} />{o.label}
            </label>
          ))}
        </div>
      );
    case 'multiselect': {
      const list = Array.isArray(value) ? value : [];
      return (
        <div className="adm-choices">
          {(f.options || []).map((o) => (
            <label key={o.value} className={`adm-choice ${list.includes(o.value) ? 'is-on' : ''}`}>
              <input type="checkbox" disabled={readOnly} checked={list.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value))} />{o.label}
            </label>
          ))}
        </div>
      );
    }
    case 'checkbox':
      return <label className="adm-check"><input type="checkbox" disabled={readOnly} checked={value === true} onChange={(e) => onChange(e.target.checked)} /><span>{f.label}</span></label>;
    case 'declaration':
      return (
        <label className="adm-declare">
          <input type="checkbox" disabled={readOnly} checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          <span>{f.text || f.label}</span>
        </label>
      );
    case 'info':
      return <div className="adm-info">{f.text || f.label}</div>;
    case 'file':
      return <FileField f={f} docs={docs} readOnly={readOnly} error={error} />;
    default:
      return <Input {...common} value={value ?? ''} maxLength={f.validation?.maxLength || 200} onChange={(e) => onChange(e.target.value)} data-text={TEXT_KIND[f.validation?.kind] || 'text'}
        inputMode={NUMERIC_KINDS.has(f.validation?.kind) ? 'numeric' : undefined} />;
  }
}

export default function FormRenderer({ schema, values = {}, onChange, errors = {}, scope = {}, sectionKeys, docs, readOnly = false, showSensitiveMark = false }) {
  const latest = useRef(values);
  latest.current = values;
  const [pinNote, setPinNote] = useState({});
  const change = (f, v) => {
    onChange?.(f.key, v);
    if (readOnly || !onChange || f.validation?.kind !== 'pincode' || !/^[1-9]\d{5}$/.test(String(v || ''))) return;
    lookupPin(String(v)).then((r) => {
      if (String(latest.current[f.key] || '') !== String(v)) return;   // the PIN changed meanwhile
      setPinNote((n) => ({ ...n, [f.key]: r ? [r.district, r.state].filter(Boolean).join(', ') : '' }));
      if (!r) return;
      const t = pinTargets(schema, f);
      const fill = (target, text) => {
        if (!target || !text || !blank(latest.current[target.key])) return;
        if (target.type === 'select') {
          const o = (target.options || []).find((x) => [x.value, x.label].some((y) => String(y).toLowerCase() === String(text).toLowerCase()));
          if (o) onChange(target.key, o.value);
        } else onChange(target.key, text);
      };
      fill(t.city, r.district || r.city);
      fill(t.state, r.state);
    });
  };
  const sections = visibleSections(schema, values, scope).filter((s) => !sectionKeys || sectionKeys.includes(s.key));
  if (!sections.length) return <p className="adm-muted">Nothing to fill in here.</p>;
  return (
    <div className="adm-form">
      {sections.map((sec) => (
        <section key={sec.key} className="adm-form__sec" aria-labelledby={`sec-${sec.key}`}>
          <div className="adm-form__sechead">
            <h3 id={`sec-${sec.key}`}>{sec.title}</h3>
            {sec.description ? <p>{sec.description}</p> : null}
          </div>
          <div className="adm-form__grid">
            {sec.fields.map((f) => {
              const wide = f.width !== 'half' || ['textarea', 'radio', 'multiselect', 'declaration', 'info', 'file', 'checkbox'].includes(f.type);
              const showLabel = !['checkbox', 'declaration', 'info'].includes(f.type);
              return (
                <div key={f.key} className={wide ? 'is-full' : ''} data-field={f.key}>
                  <Field
                    label={showLabel ? <span id={`fld-${f.key}-l`}>{f.label}{showSensitiveMark && f.sensitive ? <Chip tone="amber">Sensitive</Chip> : null}</span> : null}
                    required={f.required && showLabel}
                    hint={pinNote[f.key] && String(values[f.key] || '').length === 6 ? `${pinNote[f.key]}${f.help ? ` — ${f.help}` : ''}` : f.help}
                    error={f.type === 'file' ? null : errors[f.key]}
                    htmlFor={`fld-${f.key}`}>
                    <FieldInput f={f} value={values[f.key]} onChange={(v) => change(f, v)} readOnly={readOnly} error={errors[f.key]} docs={docs} />
                  </Field>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export { FieldInput };
