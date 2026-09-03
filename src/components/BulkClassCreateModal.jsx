import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../api/admin.api';
import { Modal, Button, Spinner } from './ui/index';

/**
 * Build a whole grade range and its sections in one go.
 *
 * Setting a school up by hand is twelve class forms and then forty-eight section
 * forms. This asks for a range and a section count instead.
 *
 * The run is additive and never destructive — a class already in the year keeps
 * its name, number and students, and only its MISSING sections are added. That
 * makes it safe to run over a half-finished setup, and a second identical run a
 * no-op. The dialog says exactly that before anything is written: the server's
 * own `preview` is what fills the summary, so what is promised here is computed
 * by the same code that does the work.
 */
export default function BulkClassCreateModal({ open, academicYear, onClose, onCreated }) {
  const [form, setForm] = useState({ fromClass: '1', toClass: '12', sectionsPerClass: '4', capacity: '40' });
  const [plan, setPlan]       = useState(null);
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving]   = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm({ fromClass: '1', toClass: '12', sectionsPerClass: '4', capacity: '40' });
    setPlan(null); setError('');
  }, [open]);

  // The summary follows the inputs, debounced so a keystroke is not a request.
  useEffect(() => {
    if (!open) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api.bulkCreateClasses({ ...payload(form, academicYear), preview: true });
        setPlan(res?.data ?? res); setError('');
      } catch (err) { setPlan(null); setError(err.message || 'That range cannot be built'); }
      finally { setLoading(false); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [open, form, academicYear]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.bulkCreateClasses(payload(form, academicYear));
      const d = res?.data ?? res;
      const bits = [];
      if (d.createdClasses)  bits.push(`${d.createdClasses} class${d.createdClasses === 1 ? '' : 'es'}`);
      if (d.createdSections) bits.push(`${d.createdSections} section${d.createdSections === 1 ? '' : 's'}`);
      toast.success(bits.length ? `Created ${bits.join(' and ')}` : 'Everything in that range already existed');
      onCreated?.();
      onClose();
    } catch (err) { setError(err.message || 'Could not create these classes'); toast.error(err.message); }
    finally { setSaving(false); }
  };

  const nothingToDo = plan && !plan.classesToCreate && !plan.sectionsToCreate;

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose} title="Bulk Create Classes & Sections" maxWidth={560}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button form="bulk-class-form" type="submit" loading={saving} disabled={!plan || !!error || nothingToDo}>
          {plan && !error
            ? `Create ${plan.classesToCreate} class${plan.classesToCreate === 1 ? '' : 'es'} · ${plan.sectionsToCreate} section${plan.sectionsToCreate === 1 ? '' : 's'}`
            : 'Create'}
        </Button>
      </>}>
      <form id="bulk-class-form" onSubmit={submit}>
        {/* Two per row, not four: at four across "Seats per section" wrapped and
            dropped its input a line below the others. `end` keeps every input on
            one baseline whatever a label does. */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))',
          columnGap: 14, alignItems: 'end',
        }}>
          <div className="form-group">
            <label className="form-label required">From class</label>
            <input type="number" min="0" className="form-control" value={form.fromClass} onChange={set('fromClass')} />
          </div>
          <div className="form-group">
            <label className="form-label required">To class</label>
            <input type="number" min="0" className="form-control" value={form.toClass} onChange={set('toClass')} />
          </div>
          <div className="form-group">
            <label className="form-label required">Sections per class</label>
            <input type="number" min="0" max="26" className="form-control" value={form.sectionsPerClass} onChange={set('sectionsPerClass')} />
          </div>
          <div className="form-group">
            <label className="form-label required">Seats per section</label>
            <input type="number" min="1" className="form-control" value={form.capacity} onChange={set('capacity')} />
          </div>
        </div>

        <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.7 }}>
          Sections are named A, B, C… in order. Classes already in this academic year keep their name,
          grade and students — only their missing sections are added, so running the same range twice
          changes nothing the second time.
        </p>

        {loading && !plan && (
          <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
        )}

        {error && (
          <div style={{ background: 'var(--danger-light,#fef2f2)', border: '1px solid var(--danger)', borderRadius: 8,
            padding: '10px 14px', fontSize: '.82rem', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {plan && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 10, marginBottom: 12 }}>
              <Tile n={plan.classesToCreate}  label="New classes"  tone="success" />
              <Tile n={plan.sectionsToCreate} label="New sections" tone="success" />
              <Tile n={plan.classesExisting}  label="Classes already there" />
              <Tile n={plan.sectionsExisting} label="Sections already there" />
            </div>

            {nothingToDo && (
              <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                Every class and section in this range already exists — there is nothing to create.
              </p>
            )}

            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              {plan.plan.map((row) => (
                <div key={row.classNumber} style={{ display: 'flex', justifyContent: 'space-between', gap: 10,
                  padding: '6px 12px', fontSize: '.8rem', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontWeight: row.classExists ? 400 : 600 }}>
                    {row.className}
                    {row.classExists && <span style={{ color: 'var(--text-muted)' }}> · exists</span>}
                  </span>
                  <span style={{ color: row.skipped ? 'var(--danger)' : 'var(--text-muted)', textAlign: 'right' }}>
                    {row.skipped
                      ? row.skipped
                      : row.sectionsToAdd.length
                        ? `+ ${row.sectionsToAdd.join(', ')}`
                        : 'nothing to add'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

function Tile({ n, label, tone }) {
  return (
    <div style={{
      border: `1px solid ${tone === 'success' && n > 0 ? 'var(--success)' : 'var(--border)'}`,
      background: tone === 'success' && n > 0 ? 'var(--success-light,#f0fdf4)' : 'var(--bg)',
      borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'baseline', gap: 8,
    }}>
      <strong style={{ fontSize: '1.15rem', color: tone === 'success' && n > 0 ? 'var(--success)' : 'var(--text)' }}>{n}</strong>
      <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

/** Numbers, not the strings the inputs hold — the server validates types. */
function payload(form, academicYear) {
  return {
    fromClass: Number(form.fromClass),
    toClass: Number(form.toClass),
    sectionsPerClass: Number(form.sectionsPerClass),
    capacity: Number(form.capacity),
    ...(academicYear ? { academicYear } : {}),
  };
}
