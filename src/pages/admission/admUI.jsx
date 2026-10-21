/**
 * The admission module's UI kit — the app's design language (its tokens,
 * Tabs, Modal, Drawer and icon set), in its own `adm-` classes
 * (styles/admission.css) so nothing here restyles another module.
 */
import React, { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon, { ICON_NAMES } from '../../components/ui/icons';
import { Modal } from '../../components/ui/index';
import { STATUS, DOC_STATUS, FEE_STATUS, OFFER_STATUS, LIST_STATUS, DECISION, RESULTS_STATUS, errMsg } from './meta';
import '../../styles/admission.css';

export const Ico = ({ name, size = 16, className }) => (ICON_NAMES.includes(name) ? <Icon name={name} size={size} className={className} /> : null);

/* ── Data ─────────────────────────────────────────────────────────────────── */

/**
 * Load once, reload on demand. A response that arrives after a newer request
 * started is dropped, so switching filters fast never shows stale rows.
 */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, meta: null, loading: true, error: null });
  const seq = useRef(0);
  const run = useCallback(async () => {
    const mine = ++seq.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fn();
      if (mine !== seq.current) return;
      // An answer with a `data` key is that data — even null ("not in a group", "nothing shared"):
      // falling back to the whole answer then would hand the screen the envelope instead.
      const data = res && typeof res === 'object' && !Array.isArray(res) && 'data' in res ? res.data : res;
      setState({ data, meta: res && typeof res === 'object' && !Array.isArray(res) ? res : null, loading: false, error: null });
    } catch (e) {
      if (mine !== seq.current) return;
      setState((s) => ({ ...s, loading: false, error: errMsg(e, 'Could not load') }));
    }
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { run(); }, [run]);
  const setData = (updater) => setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }));
  return { ...state, reload: run, setData };
}

/* ── Frame ────────────────────────────────────────────────────────────────── */

// `page` is the app's own page frame (global.css): its gutter, its width, and
// the tighter top it gets under a module's section rail.
export const Page = ({ children, className = '' }) => <div className={`page adm-page ${className}`}>{children}</div>;

export const Head = ({ title, subtitle, eyebrow, children }) => (
  <header className="adm-head">
    <div className="adm-head__text">
      {eyebrow ? <div className="adm-head__eyebrow">{eyebrow}</div> : null}
      <h1>{title}</h1>
      {subtitle ? <p>{subtitle}</p> : null}
    </div>
    {children ? <div className="adm-head__acts">{children}</div> : null}
  </header>
);

export const Panel = ({ title, sub, icon, tone = 'indigo', right, children, className = '', pad = true, id }) => (
  <section className={`adm-panel ${className}`} id={id}>
    {(title || right) ? (
      <div className="adm-panel__head">
        <div className="adm-panel__title">
          {icon ? <span className={`adm-mark adm-t-${tone}`}><Ico name={icon} size={17} /></span> : null}
          <div>
            {title ? <h2>{title}</h2> : null}
            {sub ? <p>{sub}</p> : null}
          </div>
        </div>
        {right ? <div className="adm-panel__right">{right}</div> : null}
      </div>
    ) : null}
    <div className={pad ? 'adm-panel__body' : 'adm-panel__flush'}>{children}</div>
  </section>
);

export const Tiles = ({ children, cols }) => <div className="adm-tiles" style={cols ? { '--cols': cols } : undefined}>{children}</div>;

export function Tile({ icon, tone = 'indigo', label, value, sub, to, onClick, active }) {
  const body = (
    <>
      <span className={`adm-tile__mark adm-t-${tone}`}><Ico name={icon} size={20} /></span>
      <span className="adm-tile__text">
        <span className="adm-tile__label">{label}</span>
        <span className="adm-tile__value">{value ?? '—'}</span>
        {sub ? <span className="adm-tile__sub">{sub}</span> : null}
      </span>
    </>
  );
  const cls = `adm-tile${active ? ' is-active' : ''}${to || onClick ? ' is-link' : ''}`;
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" className={cls} onClick={onClick} aria-pressed={!!active}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/* ── Controls ─────────────────────────────────────────────────────────────── */

export const Btn = forwardRef(({ kind = 'outline', size, icon, busy, className = '', children, type = 'button', ...rest }, ref) => (
  <button ref={ref} type={type} className={`adm-btn adm-btn--${kind}${size ? ` adm-btn--${size}` : ''}${busy ? ' is-busy' : ''} ${className}`} disabled={rest.disabled || busy} {...rest}>
    {busy ? <span className="adm-spin adm-spin--sm" /> : icon ? <Ico name={icon} size={size === 'sm' ? 14 : 16} /> : null}
    {children}
  </button>
));
Btn.displayName = 'Btn';

export const IconBtn = ({ icon, label, kind = '', ...rest }) => (
  <button type="button" className={`adm-ibtn ${kind ? `adm-ibtn--${kind}` : ''}`} aria-label={label} title={label} {...rest}><Ico name={icon} size={16} /></button>
);

export const Chip = ({ tone = 'gray', children, icon, title }) => (
  <span className={`adm-chip adm-t-${tone}`} title={title}>{icon ? <Ico name={icon} size={12} /> : null}{children}</span>
);

const chipOf = (map) => ({ value, fallback }) => {
  const m = map[value] || { label: fallback || String(value || '—').replace(/_/g, ' '), tone: 'gray' };
  return <Chip tone={m.tone}>{m.label}</Chip>;
};
export const StatusChip = ({ status }) => chipOf(STATUS)({ value: status });
export const DocChip = ({ status }) => chipOf(DOC_STATUS)({ value: status });
export const FeeChip = ({ status }) => chipOf(FEE_STATUS)({ value: status });
export const OfferChip = ({ status }) => chipOf(OFFER_STATUS)({ value: status });
export const ListChip = ({ status }) => chipOf(LIST_STATUS)({ value: status });
export const DecisionChip = ({ value }) => chipOf(DECISION)({ value });
export const ResultsChip = ({ status }) => chipOf(RESULTS_STATUS)({ value: status });

export const Spin = ({ label = 'Loading…' }) => <div className="adm-loading"><span className="adm-spin" />{label}</div>;

export const Empty = ({ icon = 'files', title, children, action, compact }) => (
  <div className={`adm-empty${compact ? ' adm-empty--compact' : ''}`}>
    <span className="adm-empty__mark"><Ico name={icon} size={compact ? 20 : 26} /></span>
    <strong>{title}</strong>
    {children ? <p>{children}</p> : null}
    {action ? <div className="adm-empty__act">{action}</div> : null}
  </div>
);

export const Note = ({ tone = 'indigo', icon = 'info', children, action }) => (
  <div className={`adm-note adm-t-${tone}`}>
    <Ico name={icon} size={17} />
    <div className="adm-note__text">{children}</div>
    {action ? <div className="adm-note__act">{action}</div> : null}
  </div>
);

export const ErrorBox = ({ error, onRetry }) => (
  <Empty icon="alert" title="This could not be loaded" action={onRetry ? <Btn icon="refresh" onClick={onRetry}>Try again</Btn> : null}>{error}</Empty>
);

/* ── Form fields ──────────────────────────────────────────────────────────── */

/**
 * A labelled field. The label names the control inside it — linked to it when
 * there is one (a click on the label focuses it; a screen reader reads it), or
 * naming the group when there are several (choices, a row of inputs) — and the
 * hint or error describes it. Whatever the child is, the control is found in
 * the rendered field, so no caller has to pass ids.
 */
export function Field({ label, hint, error, required, children, className = '', htmlFor }) {
  const box = useRef(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const noteId = `${uid}-note`;
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !label || htmlFor) return;
    const controls = [...el.querySelectorAll('input:not([type="hidden"]), select, textarea')];
    if (!controls.length) return;
    if (controls.length === 1 && !['checkbox', 'radio'].includes(controls[0].type)) {
      const c = controls[0];
      if (!c.id) c.id = `${uid}-control`;
      el.querySelector(':scope > .adm-field__label')?.setAttribute('for', c.id);
      if ((hint || error) && !c.getAttribute('aria-describedby')) c.setAttribute('aria-describedby', noteId);
    } else if (!el.getAttribute('role')) {
      el.setAttribute('role', 'group');
      el.setAttribute('aria-labelledby', `${uid}-label`);
    }
  });
  return (
    <div ref={box} className={`adm-field ${error ? 'has-error' : ''} ${className}`}>
      {label ? <label id={`${uid}-label`} className="adm-field__label" htmlFor={htmlFor}>{label}{required ? <span className="adm-req" aria-hidden>*</span> : null}</label> : null}
      {children}
      {error ? <div id={noteId} className="adm-field__error" role="alert">{error}</div> : hint ? <div id={noteId} className="adm-field__hint">{hint}</div> : null}
    </div>
  );
}

export const Input = forwardRef(({ className = '', invalid, ...rest }, ref) => (
  <input ref={ref} className={`adm-input ${invalid ? 'is-invalid' : ''} ${className}`} aria-invalid={invalid || undefined} {...rest} />
));
Input.displayName = 'Input';

export const TextArea = forwardRef(({ className = '', invalid, rows = 4, ...rest }, ref) => (
  <textarea ref={ref} rows={rows} className={`adm-input adm-textarea ${invalid ? 'is-invalid' : ''} ${className}`} aria-invalid={invalid || undefined} {...rest} />
));
TextArea.displayName = 'TextArea';

export const Select = forwardRef(({ className = '', invalid, children, ...rest }, ref) => (
  <select ref={ref} className={`adm-input adm-select ${invalid ? 'is-invalid' : ''} ${className}`} aria-invalid={invalid || undefined} {...rest}>{children}</select>
));
Select.displayName = 'Select';

export const Toggle = ({ checked, onChange, label, sub, disabled }) => (
  <label className={`adm-toggle${disabled ? ' is-disabled' : ''}`}>
    <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span className="adm-toggle__track" aria-hidden><span /></span>
    <span className="adm-toggle__text">{label}{sub ? <em>{sub}</em> : null}</span>
  </label>
);

export const Check = ({ checked, onChange, children, disabled }) => (
  <label className="adm-check"><input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} /><span>{children}</span></label>
);

/* ── Lists ────────────────────────────────────────────────────────────────── */

/**
 * columns: [{ key, label, render(row), width, align, className }]
 * selection: { ids: Set, toggle(id), all(bool) } — adds a checkbox column.
 */
export function Table({ columns, rows, empty, onRow, selection, rowKey = (r) => r._id, dense, className = '' }) {
  if (!rows?.length) return empty || <Empty compact title="Nothing here yet" />;
  const allOn = selection && rows.every((r) => selection.ids.has(rowKey(r)));
  return (
    <div className={`adm-table-wrap ${className}`}>
      <table className={`adm-table${dense ? ' adm-table--dense' : ''}`}>
        <thead>
          <tr>
            {selection ? <th className="adm-table__check"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={(e) => selection.all(e.target.checked, rows)} /></th> : null}
            {columns.map((c) => <th key={c.key} style={{ width: c.width, textAlign: c.align }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={rowKey(r)} className={onRow ? 'is-link' : ''} onClick={onRow ? (e) => { if (!e.target.closest('button,a,input,select,label')) onRow(r); } : undefined}>
              {selection ? <td className="adm-table__check"><input type="checkbox" aria-label="Select" checked={selection.ids.has(rowKey(r))} onChange={() => selection.toggle(rowKey(r))} /></td> : null}
              {columns.map((c) => <td key={c.key} style={{ textAlign: c.align }} className={c.className}>{c.render ? c.render(r, idx) : r[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function useSelection() {
  const [ids, setIds] = useState(() => new Set());
  return {
    ids,
    toggle: (id) => setIds((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    all: (on, rows) => setIds(on ? new Set(rows.map((r) => r._id)) : new Set()),
    clear: () => setIds(new Set()),
  };
}

export function Pager({ page, pages, total, onPage, label = 'records' }) {
  if (!total) return null;
  return (
    <div className="adm-pager">
      <span>{total.toLocaleString('en-IN')} {label}</span>
      {pages > 1 ? (
        <div className="adm-pager__btns">
          <IconBtn icon="chevronLeft" label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} />
          <span>Page {page} of {pages}</span>
          <IconBtn icon="chevronRight" label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} />
        </div>
      ) : null}
    </div>
  );
}

export const KV = ({ items, cols = 2 }) => (
  <dl className="adm-kv" style={{ '--cols': cols }}>
    {items.filter(Boolean).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => (
      <div key={k} className="adm-kv__item"><dt>{k}</dt><dd>{v}</dd></div>
    ))}
  </dl>
);

export const Meter = ({ value = 0, total = 0, tone = 'indigo', label }) => {
  const pct = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="adm-meter" title={label || `${value} of ${total}`}>
      <span className={`adm-meter__bar adm-tb-${tone}`} style={{ width: `${pct}%` }} />
    </div>
  );
};

export function Timeline({ items, empty = 'No history yet' }) {
  if (!items?.length) return <Empty compact icon="history" title={empty} />;
  return (
    <ol className="adm-timeline">
      {items.map((t) => (
        <li key={t._id} className={`adm-timeline__item adm-tl-${t.type}`}>
          <span className="adm-timeline__dot" aria-hidden />
          <div className="adm-timeline__body">
            <div className="adm-timeline__msg">{t.message}</div>
            <div className="adm-timeline__meta">
              {t.actorName ? `${t.actorName} · ` : t.by === 'school' ? 'The school · ' : ''}
              {new Date(t.createdAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}
              {t.visibility === 'internal' ? <Chip tone="gray">Internal</Chip> : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

/* ── Dialogs ──────────────────────────────────────────────────────────────── */

export function Dialog({ open, title, onClose, children, footer, width = 560 }) {
  return <Modal open={open} onClose={onClose} title={title} maxWidth={width} footer={footer}>{children}</Modal>;
}

/**
 * Ask before doing something that cannot be taken back. With `reason`, the
 * person must say why (sent to the family, or kept in the history).
 */
export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', reason, reasonLabel = 'Reason', onConfirm, onClose }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setText(''); }, [open]);
  const go = async () => {
    setBusy(true);
    try { await onConfirm(text.trim()); onClose(); } catch { /* the caller's toast says why */ } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={title} width={460}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind={tone} busy={busy} disabled={reason && !text.trim()} onClick={go}>{confirmLabel}</Btn></>}>
      {message ? <p className="adm-muted">{message}</p> : null}
      {reason ? <Field label={reasonLabel} required className="adm-mt"><TextArea rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} /></Field> : null}
    </Dialog>
  );
}

/** Two short lines: what something is, and what it says. */
export const Person = ({ name, sub, to }) => (
  <span className="adm-person">
    <span className="adm-person__avatar" aria-hidden>{String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
    <span className="adm-person__text">
      {to ? <Link to={to}>{name || '—'}</Link> : <strong>{name || '—'}</strong>}
      {sub ? <em>{sub}</em> : null}
    </span>
  </span>
);

export const Toolbar = ({ children }) => <div className="adm-toolbar">{children}</div>;

export const SearchBox = ({ value, onChange, placeholder = 'Search…' }) => (
  <label className="adm-search">
    <Ico name="search" size={16} />
    <input type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
  </label>
);
