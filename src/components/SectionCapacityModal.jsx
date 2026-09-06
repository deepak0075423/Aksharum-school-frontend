import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../api/admin.api';
import { Modal, Button } from './ui/index';

/**
 * Change how many seats a section holds.
 *
 * Capacity is set when the section is created and then stops being true — a
 * class grows, a room changes — so it has to be editable afterwards, and this is
 * the one place that does it. It is the number the admission wizard and the bulk
 * importer both check before seating another student, so it is worth an explicit
 * dialog rather than an inline field that can be nudged by accident.
 *
 * `section` needs `_id`, `sectionName` and a student count — `studentCount`
 * (the length of the section's enrolled list, which the class detail endpoint
 * now returns) in preference to the cached `currentCount` beside it.
 */
export default function SectionCapacityModal({ open, section, onClose, onSaved }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const enrolled = section?.studentCount ?? section?.currentCount ?? 0;

  useEffect(() => {
    if (!open) return;
    setValue(String(section?.maxStudents ?? 40));
    setError('');
  }, [open, section?._id, section?.maxStudents]);

  const save = async (e) => {
    e.preventDefault();
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1) { setError('Capacity must be a positive number'); return; }
    // Answered here instantly; the server enforces the same rule on the write.
    if (n < enrolled) {
      setError(`${enrolled} student${enrolled === 1 ? ' is' : 's are'} already enrolled — capacity cannot be below that.`);
      return;
    }
    setSaving(true);
    try {
      await api.updateSectionCapacity(section._id, n);
      toast.success(`Section ${section.sectionName} now holds ${n} students`);
      onSaved?.();
      onClose();
    } catch (err) { setError(err.message || 'Could not update the capacity'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose}
      title={`Capacity — Section ${section?.sectionName || ''}`} maxWidth={420}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button form="section-capacity-form" type="submit" loading={saving}>Save</Button>
      </>}>
      <form id="section-capacity-form" onSubmit={save}>
        <div className="form-group">
          <label className="form-label required">Seats</label>
          <input type="number" min="1" className={`form-control${error ? ' error' : ''}`} autoFocus
            value={value} onChange={(e) => { setError(''); setValue(e.target.value); }} />
          {error && <span style={{ fontSize: '.78rem', color: 'var(--danger)' }}>{error}</span>}
        </div>
        <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.7 }}>
          {enrolled} student{enrolled === 1 ? ' is' : 's are'} enrolled, so the capacity cannot go below
          that — move students out of the section first if you need a smaller number. This is the figure
          the admission wizard and the bulk importer check before seating another student here.
        </p>
      </form>
    </Modal>
  );
}
