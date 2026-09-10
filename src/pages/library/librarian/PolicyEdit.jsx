/**
 * Library → Policy → Edit.
 *
 * Its own screen rather than the read view in a different mode. Editing a
 * policy is one deliberate act — open it, change what needs changing, save —
 * and a page that flips between a statement and a form makes the two look
 * like the same thing.
 *
 * The bounds it enforces and the defaults it resets to come down with the
 * policy from the server, not from a table in here. This form used to carry its
 * own copy of every min and max; the day the server changed one, the form would
 * have gone on cheerfully accepting a value the save then refused.
 *
 * Only what actually moved is sent as a change: the server diffs the save
 * against what is stored, so pressing Save with nothing touched writes nothing
 * and leaves no line in the history.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getPolicy, updatePolicy } from '../../../api/library.api';
import { Alert, Button, Confirm, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { quoteOfTheDay } from './dashParts';
import {
  FIELD_KEYS, LastUpdated, Panel, SECTIONS, SectionRail, money,
} from './policyParts';

export default function LibraryPolicyEdit() {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  const policyPath = pathname.replace(/\/edit\/?$/, '');

  const { data: policy, meta, loading, error } = useFetch(getPolicy);
  const limits    = meta?.limits   || {};
  const defaults  = meta?.defaults || {};
  const updatedBy = meta?.updatedBy;
  const quote = useMemo(() => quoteOfTheDay(4), []);

  const [form,   setForm]   = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(null);   // where to go once the warning is answered
  const [active, setActive] = useState(SECTIONS[0].id);
  const panels = useRef({});

  /**
   * What a setting is worth right now: what is stored, or — where a column was
   * never written — the default the module falls back to at the counter. The
   * form has to open on this and compare against this, or a policy with an
   * unset column would show "1 unsaved change" before anybody touched it.
   */
  const effective = (k) => policy?.[k] ?? defaults[k] ?? '';

  // Seeded once. Re-seeding on every refetch would throw away whatever was
  // being typed at the time.
  useEffect(() => {
    if (!policy || form) return;
    setForm(Object.fromEntries(FIELD_KEYS.map((k) => [k, effective(k)])));
  }, [policy]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Arriving from a panel's Edit button (…/edit#fines) opens on that section.
  useEffect(() => {
    const id = hash.replace('#', '');
    if (!form || !id || !panels.current[id]) return;
    setActive(id);
    panels.current[id].scrollIntoView({ block: 'start' });
  }, [hash, form]);

  const jumpTo = (id) => {
    setActive(id);
    panels.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  // What differs from what is stored — the same comparison the server makes,
  // so the count on the Save button is the number of lines the history will get.
  const changed = useMemo(() => {
    if (!form || !policy) return [];
    return FIELD_KEYS.filter((k) => String(form[k] ?? '') !== String(effective(k)));
  }, [form, policy, defaults]);   // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = changed.length > 0;

  // Leaving with unsaved changes has to be a question, not a surprise.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const goBack = () => (dirty ? setLeaving(policyPath) : navigate(policyPath));

  /** Mirrors the server's bounds, which arrived with the policy. */
  const validate = () => {
    const next = {};
    for (const section of SECTIONS) {
      for (const f of section.fields) {
        const raw = form[f.key];
        if (f.type === 'flag') continue;
        if (f.type === 'text') {
          const v = String(raw ?? '').trim();
          if (!v) next[f.key] = `${f.label} cannot be empty`;
          else if (!/^[A-Za-z0-9][A-Za-z0-9-]{0,7}$/.test(v)) {
            next[f.key] = 'Use 1–8 letters, digits or dashes, starting with a letter or digit';
          }
          continue;
        }
        const { min, max, label } = limits[f.key] || {};
        const n = Number(raw);
        if (!Number.isInteger(n) || (min !== undefined && n < min) || (max !== undefined && n > max)) {
          next[f.key] = `${label || f.label} must be a whole number between ${min ?? 0} and ${max ?? '∞'}`;
        }
      }
    }
    setErrors(next);
    // Handed back as well as stored: `setErrors` lands on the next render, so a
    // caller reading `errors` straight afterwards would be reading the state
    // from before it validated and would jump to the wrong section.
    return next;
  };

  const save = async (e) => {
    e?.preventDefault?.();
    const found = validate();
    if (Object.keys(found).length) {
      toast.error('Fix the highlighted fields');
      const first = SECTIONS.find((s) => s.fields.some((f) => found[f.key]));
      if (first) jumpTo(first.id);
      return;
    }
    if (!dirty) return toast('Nothing has changed', { icon: 'ℹ️' });

    setSaving(true);
    try {
      // Only what moved. The server diffs the save anyway, but sending the
      // whole form would let a setting whose column was never written record
      // itself as a change nobody made.
      const res = await updatePolicy(Object.fromEntries(changed.map((k) => [k, form[k]])));
      toast.success(res?.changed
        ? `Policy updated — ${res.changed} setting${res.changed === 1 ? '' : 's'} changed`
        : 'Policy saved');
      navigate(policyPath);
    } catch (err) {
      toast.error(err?.message || 'Could not save the policy');
    } finally { setSaving(false); }
  };

  /** Loads the module's own defaults into the form; nothing is written yet. */
  const resetAll = () => {
    setForm(Object.fromEntries(FIELD_KEYS.map((k) => [k, defaults[k] ?? ''])));
    setErrors({});
    toast('Defaults loaded — press Save to apply them', { icon: '↺' });
  };

  const resetSection = (section) => {
    setForm((f) => ({ ...f, ...Object.fromEntries(section.fields.map((x) => [x.key, defaults[x.key] ?? ''])) }));
    setErrors((e) => ({ ...e, ...Object.fromEntries(section.fields.map((x) => [x.key, undefined])) }));
  };

  if (loading || (!form && !error)) return <div className="loading-page"><Spinner /></div>;

  if (error || !policy) {
    return (
      <div className="page libdpg libpolpg">
        <Alert variant="danger">
          {error || 'The library policy could not be loaded.'}
          {' '}Administrative access to the Library module is required to change it.
        </Alert>
      </div>
    );
  }

  const rate = Number(form.finePerDay || 0);

  return (
    <div className="page libdpg libpolpg libpoledit">
      <div className="breadcrumb">
        <Link to={policyPath.replace(/\/policy$/, '/dashboard')}>Library</Link>
        <span aria-hidden>›</span>
        <Link to={policyPath}>Policy</Link>
        <span aria-hidden>›</span>
        <span>Edit</span>
      </div>

      <header className="libpol-edithead">
        <div>
          <h1>Edit Library Policy</h1>
          <p>Set the rules for borrowing, fines and reservations. They apply across the whole library.</p>
        </div>
        <Button variant="secondary" onClick={goBack}>
          <Icon name="chevronLeft" size={16} /> Back to Policy
        </Button>
      </header>

      <section className="card libpol-banner">
        <span className="libpol-banner__icon tint-indigo"><Icon name="sparkle" size={22} /></span>
        <div>
          <h2>Create a balanced library experience</h2>
          <p>Limits and fines that encourage books to come back without making the library feel like a fine desk.</p>
        </div>
        <blockquote>
          <p>“{quote.text}”</p>
          <cite>— {quote.by}</cite>
        </blockquote>
      </section>

      <div className="libpol-body">
        <SectionRail title="Policy Sections" items={SECTIONS} active={active} onPick={jumpTo}>
          <LastUpdated at={policy.updatedAt} by={updatedBy} className="libpol-stamp--rail" />
        </SectionRail>

        <form className="libpol-main" onSubmit={save}>
          {SECTIONS.map((s) => {
            const touched = s.fields.filter((f) => changed.includes(f.key)).length;
            const atDefault = s.fields.every((f) => String(form[f.key] ?? '') === String(defaults[f.key] ?? ''));
            return (
              <Panel key={s.id} id={s.id} innerRef={(el) => { panels.current[s.id] = el; }}
                icon={s.icon} tone={s.tone} title={s.title} blurb={s.blurb}
                action={(
                  <div className="libpol-panel__acts">
                    {/* Says what the section *is* rather than offering an
                        on/off switch the policy does not have. */}
                    <span className={`libpol-flag is-${touched ? 'changed' : atDefault ? 'default' : 'set'}`}>
                      {touched
                        ? `${touched} unsaved`
                        : atDefault ? 'Default' : 'Customised'}
                    </span>
                    <button type="button" className="libpol-reset" onClick={() => resetSection(s)}>
                      <Icon name="refresh" size={13} /> Reset
                    </button>
                  </div>
                )}>
                {s.fields.some((f) => f.type === 'flag') ? (
                  <div className="libpol-flags">
                    {s.fields.map((f) => (
                      <label key={f.key} className="libpol-check">
                        <input type="checkbox" checked={!!form[f.key]}
                          onChange={(e) => set(f.key, e.target.checked)} />
                        <span>
                          <b>{f.label}</b>
                          <small>{f.hint}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="libpol-fields">
                    {s.fields.map((f) => {
                      const bound = limits[f.key] || {};
                      return (
                        <div className="form-group libpol-field" key={f.key}>
                          <label className="form-label" htmlFor={`pol-${f.key}`}>
                            {f.label}{f.unit ? ` (${f.unit})` : ''}
                          </label>
                          {f.type === 'text' ? (
                            <input id={`pol-${f.key}`} className={`form-control${errors[f.key] ? ' error' : ''}`}
                              value={form[f.key] ?? ''} maxLength={f.maxLength}
                              onChange={(e) => set(f.key, e.target.value.toUpperCase())} />
                          ) : (
                            <input id={`pol-${f.key}`} type="number" inputMode="numeric"
                              className={`form-control${errors[f.key] ? ' error' : ''}`}
                              min={bound.min} max={bound.max} step={1}
                              value={form[f.key] ?? ''}
                              onChange={(e) => set(f.key, e.target.value === '' ? '' : Number(e.target.value))} />
                          )}
                          {errors[f.key]
                            ? <div className="form-error">{errors[f.key]}</div>
                            : <div className="form-hint">{f.hint}</div>}
                          {/* The multiplier fields are spent as money, so the
                              form says what the number will actually cost. */}
                          {f.unit === 'days of fine' && !errors[f.key] && (
                            <div className="form-hint">
                              At {money(rate)} a day, that is <strong>{money(Number(form[f.key] || 0) * rate)}</strong>.
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            );
          })}

          <div className="libpol-foot">
            <LastUpdated at={policy.updatedAt} by={updatedBy} />
            <div className="libpol-foot__acts">
              {dirty && (
                <span className="libpol-foot__count">
                  {changed.length} unsaved change{changed.length === 1 ? '' : 's'}
                </span>
              )}
              <Button variant="secondary" type="button" onClick={resetAll}>
                <Icon name="refresh" size={15} /> Reset to Default
              </Button>
              <Button type="submit" loading={saving} disabled={!dirty}>
                <Icon name="checkCircle" size={15} /> Save Changes
              </Button>
            </div>
          </div>
        </form>
      </div>

      <Confirm
        open={!!leaving}
        onClose={() => setLeaving(null)}
        onConfirm={() => { const to = leaving; setLeaving(null); navigate(to); }}
        title="Leave without saving?"
        message={`${changed.length} change${changed.length === 1 ? '' : 's'} would be lost. The policy stays as it is until it is saved.`}
        confirmLabel="Discard changes"
      />
    </div>
  );
}
