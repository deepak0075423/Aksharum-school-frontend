/**
 * The hostel module's popup forms (Oct 2026 redesign, to the user's mockups:
 * Add Hostel, Add Building, Add Floor, Add Room, New Hostel Application,
 * Allocate a Bed, File Hostel Leave, New Outpass Request).
 *
 *   FormModal    the frame: a header with its icon tile, a stepper on the left,
 *                the sections, an optional summary column, Cancel / Back / Next.
 *                Without `steps` it is the same frame in one step — every small
 *                dialog of the module (record a payment, reject, transfer…).
 *   FormSection  one card of fields, tagged with the step it belongs to.
 *   Fld          a label, the control with its leading icon, a hint, a counter.
 *   Select, StatusSelect, RadioCards, ChipSelect, Toggle, ToggleRow,
 *   FileDrop, PersonCard, SummaryCard, InfoNote, ReviewList — the pieces the
 *   mockups draw inside those cards.
 *
 * The steps are one scrolling form, as the mockups show them: Step 1 is active
 * with the next sections already below it. The stepper follows the scroll,
 * a click on a step goes to it, and Next checks the step's required fields
 * (the browser's own validity, so `required`, `min`, `pattern` all count)
 * before moving on. The last step's button submits; the whole form is checked
 * again first, and the first bad field is scrolled to and explained.
 */
import React, { Children, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import PhoneInput from '../../../components/ui/PhoneInput';
import { Glyph, words } from './hsUI';
import { Popover, Avatar, fmtDate } from './hsList';

/* ── the background holds still while a form is up ────────────────────────── */
let locks = 0; let before = '';
function useScrollLock(on) {
  useEffect(() => {
    if (!on) return undefined;
    if (locks === 0) { before = document.body.style.overflow; document.body.style.overflow = 'hidden'; }
    locks += 1;
    return () => { locks -= 1; if (locks === 0) document.body.style.overflow = before; };
  }, [on]);
}

const controls = (root) => (root ? [...root.querySelectorAll('input, select, textarea')].filter((el) => !el.disabled && el.type !== 'hidden') : []);

/**
 * The frame.
 *   steps       [{ key, title, sub, icon, optional }] — omit for a one-step dialog
 *   aside       the summary column (Allocate a Bed, Outpass)
 *   onSubmit    called when the last step is submitted and every field is valid
 *   submitLabel the last button ("Create Hostel", "Submit Application")
 *   tone        'danger' paints the submit button red (reject, remove, revoke)
 *   width       the card's largest width; the mockups are 1050–1165px
 */
export function FormModal({
  open, onClose, icon, iconTone = 'indigo', title, subtitle, steps, aside, width, busy, onSubmit,
  submitLabel = 'Save', submitIcon, tone, children, footerNote, cancelLabel = 'Cancel', hideSubmit, footerStart,
}) {
  useScrollLock(open);
  const wizard = !!steps?.length;
  const [at, setAt] = useState(0);
  const [done, setDone] = useState(() => new Set());
  const main = useRef(null);
  const form = useRef(null);
  const quiet = useRef(0);          // while a programmatic scroll runs, the spy keeps still
  const titleId = useId();

  // Each time the form opens it starts at the top, on its first step.
  useLayoutEffect(() => {
    if (!open) return;
    setAt(0); setDone(new Set());
    if (main.current) main.current.scrollTop = 0;
    const t = setTimeout(() => {
      const first = controls(form.current).find((el) => !el.readOnly && el.type !== 'checkbox' && el.type !== 'radio');
      first?.focus({ preventScroll: true });
    }, 30);
    return () => clearTimeout(t);
  }, [open]);

  const sectionsOf = useCallback((key) => (main.current ? [...main.current.querySelectorAll(`[data-step="${key}"]`)] : []), []);

  const goTo = useCallback((i) => {
    const target = sectionsOf(steps[i]?.key)[0];
    setAt(i);
    if (target && main.current) {
      quiet.current = Date.now();
      main.current.scrollTo({ top: target.offsetTop - 14, behavior: 'smooth' });
    }
  }, [sectionsOf, steps]);

  /** The first control in `root` the browser calls invalid — explained, and scrolled to. */
  const firstBad = (roots) => {
    for (const root of roots) {
      const bad = controls(root).find((el) => !el.checkValidity());
      if (bad) return bad;
    }
    return null;
  };
  const explain = (el) => {
    const i = steps ? steps.findIndex((s) => el.closest(`[data-step="${s.key}"]`)) : -1;
    if (i >= 0) setAt(i);
    quiet.current = Date.now();
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => { el.focus({ preventScroll: true }); el.reportValidity(); }, 250);
  };

  // A step's fields turn red only once that step has been checked. The browser
  // counts every control as "touched" after the first submit (Next is one),
  // which would otherwise paint the steps ahead red before anyone reaches them.
  const markChecked = (sections) => sections.forEach((el) => el.setAttribute('data-checked', ''));

  const next = () => {
    markChecked(sectionsOf(steps[at].key));
    const bad = firstBad(sectionsOf(steps[at].key));
    if (bad) { explain(bad); return; }
    setDone((d) => new Set(d).add(steps[at].key));
    goTo(Math.min(at + 1, steps.length - 1));
  };

  const submit = (e) => {
    e.preventDefault();
    if (busy) return;
    if (wizard && at < steps.length - 1) { next(); return; }
    markChecked([...form.current.querySelectorAll('.hsf-sec')]);
    const bad = firstBad([form.current]);
    if (bad) { explain(bad); return; }
    onSubmit?.();
  };

  // The stepper follows the reader: the step whose section is at the top of
  // the pane, or the last step once the pane is scrolled to its end.
  const onScroll = () => {
    if (!wizard || Date.now() - quiet.current < 700) return;
    const pane = main.current; if (!pane) return;
    const top = pane.scrollTop + 40;
    let current = 0;
    steps.forEach((s, i) => { const el = sectionsOf(s.key)[0]; if (el && el.offsetTop <= top) current = i; });
    if (pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 4) {
      const lastVisible = steps.findLastIndex?.((s) => sectionsOf(s.key)[0]) ?? steps.length - 1;
      current = Math.max(current, lastVisible);
    }
    setAt(current);
  };

  if (!open) return null;
  const last = !wizard || at === steps.length - 1;
  return createPortal(
    <div className="hsf-overlay">
      <form ref={form} noValidate onSubmit={submit}
        className={`hsf${wizard ? ' hsf--steps' : ' hsf--single'}${aside ? ' hsf--aside' : ''}`}
        style={{ '--hsf-w': `${width || (wizard ? (aside ? 1165 : 1100) : 560)}px` }}
        role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="hsf__head">
          {icon ? <span className={`hsf__mark hs-t-${iconTone}`}><Glyph name={icon} size={wizard ? 28 : 24} /></span> : null}
          <div className="hsf__titles">
            <h2 id={titleId}>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="hsf__close" aria-label="Close" onClick={onClose}><Glyph name="close" size={20} /></button>
        </header>

        <div className="hsf__body">
          {wizard ? (
            <nav className="hsf__steps" aria-label="Steps">
              <ol>
                {steps.map((s, i) => (
                  <li key={s.key} className={`${i === at ? 'is-on' : ''}${done.has(s.key) && i !== at ? ' is-done' : ''}`}>
                    <button type="button" className={s.icon ? '' : 'no-ico'} onClick={() => goTo(i)} aria-current={i === at ? 'step' : undefined}>
                      <span className="hsf__num">{done.has(s.key) && i !== at ? <Glyph name="check" size={14} /> : i + 1}</span>
                      {s.icon ? <span className="hsf__sico"><Glyph name={s.icon} size={21} /></span> : null}
                      <span className="hsf__stext">
                        <strong>{s.title}{s.optional ? <small> (Optional)</small> : null}</strong>
                        {s.sub ? <span>{s.sub}</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </nav>
          ) : null}
          <div className="hsf__main" ref={main} onScroll={onScroll}>
            {children}
            {wizard ? <div className="hsf__tail" aria-hidden /> : null}
          </div>
          {aside ? <aside className="hsf__aside">{aside}</aside> : null}
        </div>

        <footer className="hsf__foot">
          <button type="button" className="hsf-btn" onClick={onClose}>{cancelLabel}</button>
          {footerStart}
          {footerNote ? <span className="hsf__note">{footerNote}</span> : <span className="hsf__gap" />}
          {wizard ? <button type="button" className="hsf-btn hsf-btn--soft" disabled={at === 0} onClick={() => goTo(at - 1)}>Back</button> : null}
          {hideSubmit && last ? null : (
            <button type="submit" className={`hsf-btn hsf-btn--primary${tone === 'danger' && last ? ' hsf-btn--danger' : ''}`} disabled={busy}>
              {last ? (busy ? 'Saving…' : submitLabel) : 'Next'}
              {last ? (submitIcon ? <Glyph name={submitIcon} size={17} /> : null) : <Glyph name="arrowRight" size={17} />}
            </button>
          )}
        </footer>
      </form>
    </div>,
    document.body,
  );
}

/** One card of fields. `step` ties it to the stepper; `cols` lays its fields out. */
export function FormSection({ step, icon, title, sub, children, cols, className = '', tight, extra }) {
  return (
    <section className={`hsf-sec ${className}`} data-step={step}>
      {title ? (
        <header className="hsf-sec__head">
          {icon ? <span className="hsf-sec__ico"><Glyph name={icon} size={22} /></span> : null}
          <div><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div>
          {extra ? <span className="hsf-sec__extra">{extra}</span> : null}
        </header>
      ) : null}
      <div className={`hsf-sec__body${cols ? ` hsf-grid hsf-grid--${cols}` : ''}${tight ? ' is-tight' : ''}`}>{children}</div>
    </section>
  );
}

/** Two cards side by side (Room Facilities | Additional Settings). */
export const SectionPair = ({ children, step }) => <div className="hsf-pair" data-step={step}>{children}</div>;
/** A grid of fields inside a card, where one card mixes layouts. */
export const Grid = ({ cols = 2, children, className = '' }) => <div className={`hsf-grid hsf-grid--${cols} ${className}`}>{children}</div>;

/**
 * A field. The control is the child — an <input>, <select> or <textarea> —
 * given the kit's look; `icon` draws the grey glyph inside it on the left.
 *   span       2 or 3 columns (or 'all')
 *   hint       the grey line under it; hintTone 'good' | 'bad' colours it
 *   count      [length, max] — the "0/500" under a text area
 */
export function Fld({ label, required, optional, hint, hintTone, icon, span, count, children, className = '', id: given }) {
  const auto = useId();
  const id = given || auto;
  const child = Children.only(children);
  // PhoneInput renders a plain <input>, so it is dressed like one.
  const control = React.isValidElement(child) && (typeof child.type === 'string' || child.type === PhoneInput)
    ? React.cloneElement(child, { id: child.props.id || id, required: child.props.required ?? required, className: `hsf-in ${child.props.className || ''}` })
    : child;
  const isSelect = React.isValidElement(child) && child.type === 'select';
  return (
    <div className={`hsf-fld${span ? ` hsf-span-${span}` : ''} ${className}`}>
      {label ? (
        <label htmlFor={child?.props?.id || id} className="hsf-fld__label">
          {label}{required ? <i className="hsf-req" aria-hidden> *</i> : null}{optional ? <small> (Optional)</small> : null}
        </label>
      ) : null}
      <div className={`hsf-ctl${icon ? ' has-icon' : ''}${isSelect ? ' is-select' : ''}`}>
        {icon ? <span className="hsf-ctl__icon"><Glyph name={icon} size={18} /></span> : null}
        {control}
        {isSelect ? <span className="hsf-ctl__chev"><Glyph name="chevronDown" size={16} /></span> : null}
      </div>
      {(hint || count) ? (
        <div className="hsf-fld__foot">
          {hint ? <span className={`hsf-hint${hintTone ? ` is-${hintTone}` : ''}`}>{hint}</span> : <span />}
          {count ? <span className="hsf-count">{count[0] || 0}/{count[1]}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A status picker with the coloured dot the mockups draw beside the word. */
const DOT = { active: 'green', available: 'green', inactive: 'slate', maintenance: 'amber', under_construction: 'amber', closed: 'red', full: 'red' };
export function StatusSelect({ value, onChange, options, label = 'Status', required = true, hint, span }) {
  return (
    <Fld label={label} required={required} hint={hint} span={span} className="hsf-status" icon={null}>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`has-dot dot-${DOT[value] || 'slate'}`}>
        {options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, words(o)]; return <option key={v} value={v}>{l}</option>; })}
      </select>
    </Fld>
  );
}

/** "Single Day / Multiple Days", "Day Out / Overnight / Weekend / Other". */
export function RadioCards({ value, onChange, options, name, label, required, cols, half }) {
  const gid = useId();
  return (
    <div className={`hsf-fld${half ? '' : ' hsf-span-all'}`}>
      {label ? <span className="hsf-fld__label">{label}{required ? <i className="hsf-req" aria-hidden> *</i> : null}</span> : null}
      <div className="hsf-radios" role="radiogroup" aria-label={label} style={cols ? { '--cols': cols } : undefined}>
        {options.map(([v, l, sub]) => (
          <label key={v} className={`hsf-radio${value === v ? ' is-on' : ''}`}>
            <input type="radio" name={name || gid} value={v} checked={value === v} onChange={() => onChange(v)} />
            <span className="hsf-radio__dot" />
            <span><span>{l}</span>{sub ? <small>{sub}</small> : null}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export const Toggle = ({ on, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={!!on} aria-label={label} disabled={disabled}
    className={`hs-toggle${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}><i /></button>
);
/** A switch with its sentence and the grey line under it ("Auto-create beds for this room"). */
export const ToggleRow = ({ on, onChange, label, hint, span = 'all', disabled }) => (
  <div className={`hsf-togrow hsf-span-${span}`}>
    <Toggle on={on} onChange={onChange} label={label} disabled={disabled} />
    <span><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span>
  </div>
);

/** Chips for a list of choices, with a picker for the ones not chosen yet. */
export function ChipSelect({ value = [], options, onChange, label, show = words, icon, placeholder = 'None chosen', allowNew }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const ref = useRef(null);
  const rest = options.filter((o) => !value.includes(o));
  const add = (v) => { const t = String(v).trim(); if (t && !value.includes(t)) onChange([...value, t]); };
  return (
    <div className="hs-chipsel" ref={ref}>
      <div className={`hs-chipsel__box${icon ? ' has-icon' : ''}`}>
        {icon ? <span className="hsf-ctl__icon"><Glyph name={icon} size={18} /></span> : null}
        {value.length ? value.map((v) => (
          <span key={v} className="hs-chipsel__chip">{show(v)}
            <button type="button" aria-label={`Remove ${show(v)}`} onClick={() => onChange(value.filter((x) => x !== v))}><Glyph name="close" size={12} /></button>
          </span>
        )) : (allowNew ? null : <span className="hs-muted">{placeholder}</span>)}
        {allowNew ? (
          <input className="hs-chipsel__type" value={text} placeholder={value.length ? '' : placeholder} aria-label={`Add to ${label}`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(text); setText(''); } }}
            onBlur={() => { if (text.trim()) { add(text); setText(''); } }} />
        ) : null}
        <button type="button" className="hs-chipsel__more" aria-haspopup="menu" aria-expanded={open} aria-label={`Add to ${label}`} disabled={!rest.length} onClick={() => setOpen((o) => !o)}>
          <Glyph name="chevronDown" size={15} />
        </button>
      </div>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} label={label}>
        <div className="hs-menu2" role="menu">
          {rest.map((o) => (
            <button key={o} type="button" role="menuitem" className="hs-menu2__item" onClick={() => { add(o); setOpen(false); }}><span>{show(o)}</span></button>
          ))}
        </div>
      </Popover>
    </div>
  );
}

/**
 * "Click to upload or drag and drop files". Uploads through the module's
 * attachment route and hands back the stored names.
 */
export function FileDrop({ value = [], onChange, entityType, entityId, hint = 'Images or documents (PDF, JPG, PNG) up to 5 MB each', multiple = true, upload = api.uploadAttachment }) {
  const pick = useRef(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const take = async (files) => {
    const list = [...(files || [])];
    if (!list.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const f of list) {
        if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is larger than 5 MB`); continue; }
        if (!/\.(pdf|jpe?g|png|docx?)$/i.test(f.name)) { toast.error(`${f.name}: only PDF, JPG, PNG or Word files`); continue; }
        const fd = new FormData(); fd.append('file', f);
        if (entityType) fd.append('entityType', entityType);
        if (entityId) fd.append('entityId', entityId);
        const r = await upload(fd); // eslint-disable-line no-await-in-loop
        added.push((r.data ?? r).storedName);
      }
      if (added.length) onChange([...value, ...added]);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="hsf-drop-wrap">
      <button type="button" className={`hsf-drop${over ? ' is-over' : ''}`} disabled={busy}
        onClick={() => pick.current?.click()} onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer?.files); }}>
        <Glyph name="oCloud" size={26} />
        <span>
          <span>{busy ? 'Uploading…' : <><b>Click to upload</b> or drag and drop files</>}</span>
          <small>{hint}</small>
        </span>
      </button>
      <input ref={pick} type="file" hidden multiple={multiple} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      {value.length ? (
        <ul className="hs-attach__list">
          {value.map((f) => (
            <li key={f}><span>{f.length > 40 ? `${f.slice(0, 40)}…` : f}</span>
              <button type="button" aria-label={`Remove ${f}`} onClick={() => onChange(value.filter((x) => x !== f))}><Glyph name="close" size={14} /></button></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/**
 * "Search by name, roll no. or admission no." — the student picker every
 * form of the module uses. Searches the server as you type (so a school of
 * thousands works), shows class and gender beside each name, and tells the
 * browser the field is invalid until a student is actually chosen.
 *   params     narrow the search: { onlyUnallocated: 'true' } for a new
 *              application, { allocated: 'true' } for leave and outpasses
 *   current    the chosen student's row, when the form opens on one (editing)
 */
/* ── Residents: students and staff ───────────────────────────────────────── */
/** The two kinds of resident, as a RadioCards option list. */
export const RESIDENT_KINDS = [['student', 'Student', 'A student of the school'], ['teacher', 'Teacher', 'A member of staff']];
/** Who a bed, a room or a fee plan is for, as a RadioCards option list. */
export const OCCUPANTS = [['student', 'Students', 'Only students'], ['teacher', 'Teachers', 'Only staff'], ['both', 'Both', 'Students or teachers']];
/** 'student' | 'teacher' | 'both' — rows older than the field read as 'student'. */
export const occupantOf = (row, field = 'occupantType') => (['teacher', 'both'].includes(row?.[field]) ? row[field] : 'student');
export const occupantLabel = (row, field) => ({ student: 'Students', teacher: 'Teachers', both: 'Students & teachers' })[occupantOf(row, field)];
/** May a resident of `kind` be given this bed? The server enforces the same rule. */
export const bedFits = (bed, kind) => { const o = occupantOf(bed); return o === 'both' || o === (kind === 'teacher' ? 'teacher' : 'student'); };

/**
 * The resident picker. `kind="teacher"` turns it to the staff register — a
 * member of staff can hold a bed and a hostel bill too.
 */
export function StudentPicker({ value, onChange, params, current, required = true, disabled, kind = 'student', placeholder, id }) {
  const staff = kind === 'teacher';
  const hint = placeholder || (staff ? 'Search by name, employee ID or designation' : 'Search by name, roll no. or admission no.');
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState('');           // a failed search is not "nobody matches"
  const [hi, setHi] = useState(0);
  const [picked, setPicked] = useState(current || null);
  const box = useRef(null);
  const input = useRef(null);
  const key = `${kind}:${JSON.stringify(params || {})}`;

  useEffect(() => { if (current) setPicked(current); }, [current]);
  useEffect(() => { if (!value) setPicked(null); }, [value]);
  // Given only an id (a link, an edit), look the student up so the field shows their name.
  useEffect(() => {
    if (!value || (picked && String(picked._id) === String(value))) return undefined;
    let alive = true;
    api.searchStudents({ id: value }).then((r) => { const st = (r.data ?? r)[0]; if (alive && st) setPicked(st); }).catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // The field is only valid once a student is chosen — typed text is not a student.
  useEffect(() => { input.current?.setCustomValidity(required && !value ? `Choose a ${staff ? 'teacher' : 'student'} from the list` : ''); }, [value, required, staff]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    setBusy(true);
    const t = setTimeout(() => {
      api.searchStudents({ ...(params || {}), ...(staff ? { kind: 'teacher' } : {}), search: text.trim() })
        .then((r) => { if (alive) { setList(r.data ?? r); setHi(0); setFailed(''); } })
        .catch((err) => { if (alive) { setList([]); setFailed(err?.message || 'The list could not be loaded'); } })
        .finally(() => alive && setBusy(false));
    }, 220);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, text, key]);

  const choose = (st) => { setPicked(st); onChange(st?._id || '', st); setText(''); setOpen(false); };
  const meta = (st) => (st.kind === 'teacher'
    ? [st.admissionNumber, st.className || 'Teacher', st.department, st.gender]
    : [st.admissionNumber, st.rollNumber && `Roll ${st.rollNumber}`, st.className && `${st.className}${st.sectionName ? `-${st.sectionName}` : ''}`, st.gender]).filter(Boolean);
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter' && open && list[hi]) { e.preventDefault(); choose(list[hi]); }
    else if (e.key === 'Escape') setOpen(false);
  };
  const shown = open ? text : (picked?.name || '');

  return (
    <div className="hsf-ctl has-icon is-select hsf-picker" ref={box}>
      <span className="hsf-ctl__icon"><Glyph name="search" size={18} /></span>
      <input ref={input} id={id} className="hsf-in" role="combobox" aria-expanded={open} aria-autocomplete="list" autoComplete="off"
        disabled={disabled} required={required} value={shown} placeholder={picked ? picked.name : hint}
        onFocus={() => { setOpen(true); setText(''); }} onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey} />
      <span className="hsf-ctl__chev"><Glyph name="chevronDown" size={16} /></span>
      <Popover anchor={box} open={open && !disabled} onClose={() => setOpen(false)} align="start" label={staff ? 'Teachers' : 'Students'} className="hsf-picker__pop">
        <ul className="hsf-picker__list" role="listbox" style={{ width: Math.max(box.current?.offsetWidth || 0, 320) - 10 }}>
          {busy && !list.length ? <li className="hsf-picker__empty">Searching…</li> : null}
          {!busy && failed ? <li className="hsf-picker__empty is-bad">Could not load the list — {failed}</li> : null}
          {!busy && !failed && !list.length ? <li className="hsf-picker__empty">No {staff ? 'teacher' : 'student'} matches{text ? ` “${text}”` : ''}</li> : null}
          {list.map((st, i) => (
            <li key={st._id} role="option" aria-selected={i === hi} className={i === hi ? 'is-hi' : ''}
              onMouseDown={(e) => { e.preventDefault(); choose(st); }} onMouseEnter={() => setHi(i)}>
              <Avatar name={st.name} src={st.profileImage} size={30} />
              <span className="hsf-picker__text"><strong>{st.name}</strong><small>{meta(st).join(' • ')}</small></span>
              {st.allocation ? <em>{st.allocation.hostelName}{st.allocation.roomNumber ? ` · ${st.allocation.roomNumber}` : ''}</em> : null}
            </li>
          ))}
        </ul>
      </Popover>
    </div>
  );
}
/** The picked student's facts, for the card and the summaries. */
export const studentMeta = (st) => (st ? [st.admissionNumber, st.className || (st.kind === 'teacher' ? 'Teacher' : ''), st.gender].filter(Boolean) : []);

/** The chosen student, as the mockups show them under the picker. */
export const PersonCard = ({ name, photo, meta = [], badge, badgeTone = 'green' }) => (
  <div className="hsf-person">
    <Avatar name={name} src={photo} size={46} />
    <span className="hsf-person__text">
      <strong>{name}</strong>
      <span>{meta.filter(Boolean).map((m, i) => <React.Fragment key={m}>{i ? <i aria-hidden>•</i> : null}{m}</React.Fragment>)}</span>
    </span>
    {badge ? <span className={`hs-badge hs-bt-${badgeTone} hsf-person__badge`}>{badge}</span> : null}
  </div>
);

/** A card of "Label : value" rows for the summary column. */
export const SummaryCard = ({ icon, title, sub, rows = [], children }) => (
  <section className="hsf-sum">
    <header>
      {icon ? <span className="hsf-sec__ico"><Glyph name={icon} size={20} /></span> : null}
      <div><h3>{title}</h3>{sub ? <p>{sub}</p> : null}</div>
    </header>
    {rows.length ? (
      <dl>
        {rows.map(([k, v]) => (
          <React.Fragment key={k}><dt>{k}</dt><dd>{v === '' || v == null ? '–' : v}</dd></React.Fragment>
        ))}
      </dl>
    ) : null}
    {children}
  </section>
);

/** The blue note with its (i). */
export const InfoNote = ({ title, children, tone = 'blue', className = '' }) => (
  <div className={`hsf-note hsf-note--${tone} ${className}`} role="note">
    <Glyph name={tone === 'amber' ? 'warn' : 'info'} size={20} />
    <div>{title ? <strong>{title}</strong> : null}<span>{children}</span></div>
  </div>
);

/** The last step: everything entered, by step, with a way back to each. */
export const ReviewList = ({ groups = [], onEdit }) => (
  <div className="hsf-review">
    {groups.filter((g) => g.rows?.length).map((g) => (
      <section key={g.title}>
        <header><h4>{g.title}</h4>{onEdit && g.step !== undefined ? <button type="button" className="hs-linkbtn" onClick={() => onEdit(g.step)}>Edit</button> : null}</header>
        <dl>
          {g.rows.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v === '' || v == null || (Array.isArray(v) && !v.length) ? '—' : Array.isArray(v) ? v.join(', ') : v}</dd></React.Fragment>)}
        </dl>
      </section>
    ))}
  </div>
);

/** "HH:MM" → "09:00 PM", for summaries. */
export const ampm = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  if (!m) return '';
  const h = +m[1];
  return `${String(((h + 11) % 12) + 1).padStart(2, '0')}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};
/** yyyy-mm-dd → "01 Aug 2026", for summaries. */
export const dmy = (d) => {
  if (!d) return '';
  const x = new Date(`${String(d).slice(0, 10)}T00:00:00`);
  return Number.isNaN(x.getTime()) ? '' : fmtDate(x);
};

/** "Deactivate this hostel?" — a yes/no on the same frame as every other form. */
export const ConfirmDialog = ({ open, onClose, onConfirm, title, message, confirmLabel = 'Confirm', tone = 'danger', icon, busy, cancelLabel, children }) => (
  <FormModal open={open} onClose={onClose} onSubmit={onConfirm} busy={busy} width={480}
    icon={icon || (tone === 'danger' ? 'alertTri' : 'checkCircle')} iconTone={tone === 'danger' ? 'red' : 'indigo'}
    title={title} submitLabel={confirmLabel} tone={tone} cancelLabel={cancelLabel}>
    <FormSection>{message ? <p className="hsf-msg">{message}</p> : null}{children}</FormSection>
  </FormModal>
);
