import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../api/admin.api';
import { Modal, Button } from './ui/index';

/**
 * Add several sections to ONE class at once.
 *
 * Distinct from the bulk range dialog on the Classes page, which sets a whole
 * school up and asks how many sections each class should END with. Here the
 * admin is already looking at a class and its existing sections, so `count` is
 * how many MORE to add — and the dialog names the exact letters before writing,
 * using the server's own dry run so it cannot promise the wrong ones.
 *
 * Letters fill gaps first: a class holding A and C that asks for two gets B and D.
 */
export default function AddSectionsModal({ open, classId, className, onClose, onCreated }) {
  const [count, setCount]     = useState('4');
  const [capacity, setCap]    = useState('40');
  const [plan, setPlan]       = useState(null);
  const [error, setError]     = useState('');
  const [saving, setSaving]   = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (!open) return;
    setCount('4'); setCap('40'); setPlan(null); setError('');
  }, [open, classId]);

  // The letters follow the inputs, debounced so a keystroke is not a request.
  useEffect(() => {
    if (!open || !classId) return undefined;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const res = await api.bulkCreateSections(classId, {
          count: Number(count), capacity: Number(capacity), preview: true,
        });
        setPlan(res?.data ?? res); setError('');
      } catch (err) { setPlan(null); setError(err.message || 'That cannot be added'); }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [open, classId, count, capacity]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.bulkCreateSections(classId, { count: Number(count), capacity: Number(capacity) });
      const d = res?.data ?? res;
      toast.success(`Added section${d.created === 1 ? '' : 's'} ${d.toCreate.join(', ')}`);
      onCreated?.();
      onClose();
    } catch (err) { setError(err.message); toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose}
      title={`Add Sections — ${className || 'Class'}`} maxWidth={460}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button form="add-sections-form" type="submit" loading={saving} disabled={!plan || !!error}>
          {plan && !error ? `Add ${plan.toCreate.join(', ')}` : 'Add'}
        </Button>
      </>}>
      <form id="add-sections-form" onSubmit={submit}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', columnGap: 14, alignItems: 'end' }}>
          <div className="form-group">
            <label className="form-label required">How many to add</label>
            <input type="number" min="1" max="26" className="form-control" autoFocus
              value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label required">Seats per section</label>
            <input type="number" min="1" className="form-control"
              value={capacity} onChange={(e) => setCap(e.target.value)} />
          </div>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-light,#fef2f2)', border: '1px solid var(--danger)',
            borderRadius: 8, padding: '10px 14px', fontSize: '.82rem', color: 'var(--danger)' }}>
            {error}
          </div>
        )}

        {plan && !error && (
          <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '11px 14px', fontSize: '.82rem', lineHeight: 1.7 }}>
            {plan.existing.length > 0 && (
              <div style={{ color: 'var(--text-muted)' }}>
                Already here: <strong style={{ color: 'var(--text)' }}>{plan.existing.join(', ')}</strong>
              </div>
            )}
            <div style={{ color: 'var(--text-muted)' }}>
              Will create: <strong style={{ color: 'var(--success)' }}>{plan.toCreate.join(', ')}</strong>
              {' '}at {plan.capacity} seats each
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}
