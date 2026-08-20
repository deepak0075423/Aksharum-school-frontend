import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getPolicy, updatePolicy } from '../../../api/library.api';
import { PageHeader, Button, Card, Spinner } from '../../../components/ui/index';

// These keys are the LibraryPolicy schema. They were previously spelled
// maxBooksPerMember / loanPeriodDays / renewalLimit / gracePeriod, which exist
// nowhere on the server — the page showed blanks and saved nothing.
const NUMBERS = [
  ['maxBooksPerUser',        'Max books per member',   3,  { min: 1,  max: 100 },
   'How many books one person may have out at once.'],
  ['issueDurationDays',      'Loan period (days)',     14, { min: 1,  max: 365 },
   'Default due date when the counter does not set one.'],
  ['maxRenewals',            'Renewal limit',          1,  { min: 0,  max: 20 },
   'Times a loan may be extended before the book must come back.'],
  ['finePerDay',             'Fine per day (₹)',       2,  { min: 0,  max: 10000 },
   'Charged for each day past the grace period.'],
  ['gracePeriodDays',        'Grace period (days)',    0,  { min: 0,  max: 365 },
   'Days after the due date before a fine starts.'],
  ['reservationExpiryDays',  'Reservation hold (days)', 2, { min: 1,  max: 90 },
   'How long a reserved copy is held before it passes to the next in queue.'],
  ['maxReservationsPerUser', 'Max reservations',       3,  { min: 1,  max: 100 },
   'How many titles one person may be queued for at once.'],
  ['lostBookFineDays',        'Lost book charge',       30, { min: 0,  max: 3650 },
   'Charged as this many days of fine. At ₹2/day, 30 means ₹60.'],
  ['damagedBookFineDays',     'Damaged book charge',    10, { min: 0,  max: 3650 },
   'Added on top of any late fine when a book comes back damaged.'],
];

const FLAGS = [
  ['allowMultipleCopiesPerUser', 'Allow two copies of one title per person',
   'Off means a member must return their copy before taking another of the same book — the usual rule.'],
  ['blockIssueOnPendingFine',    'Block borrowing while a fine is unpaid',
   'A member with an outstanding fine cannot borrow or reserve until it is settled or waived.'],
  ['blockIssueOnOverdue',        'Block borrowing while a book is overdue',
   'A member holding an overdue book cannot take out another.'],
  ['teacherFinesEnabled',        'Charge late fines to teachers',
   'Off means teacher loans never accrue late fines. Lost and damaged books are still charged — that is compensation, not a penalty.'],
];

export default function LibraryPolicy() {
  const { data: policy, loading, refetch } = useFetch(getPolicy);
  const [editing, setEditing] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [form,    setForm]    = useState({});
  const [errors,  setErrors]  = useState({});

  const startEdit = () => {
    setForm({
      ...Object.fromEntries(NUMBERS.map(([k, , fallback]) => [k, policy?.[k] ?? fallback])),
      ...Object.fromEntries(FLAGS.map(([k]) => [k, !!policy?.[k]])),
    });
    setErrors({});
    setEditing(true);
  };
  useEffect(() => { setEditing(false); }, [policy]);

  // Mirrors the server-side bounds so a typo is caught before the round trip.
  const validate = () => {
    const next = {};
    for (const [key, label, , { min, max }] of NUMBERS) {
      const n = Number(form[key]);
      if (!Number.isInteger(n) || n < min || n > max) next[key] = `${label} must be a whole number between ${min} and ${max}`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!validate()) return toast.error('Fix the highlighted fields');
    setSaving(true);
    try {
      await updatePolicy(form);
      toast.success('Policy updated');
      setEditing(false);
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not save the policy'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Library Policy" subtitle="Loan, fine and borrowing rules"
        action={!editing && <Button onClick={startEdit}>Edit Policy</Button>} />

      <Card>
        {editing ? (
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
              {NUMBERS.map(([key, label, , { min, max }, hint]) => (
                <div className="form-group" key={key}>
                  <label className="form-label">{label}</label>
                  <input type="number" className={`form-control${errors[key] ? ' error' : ''}`}
                    min={min} max={max} step={1} value={form[key] ?? ''}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value === '' ? '' : +e.target.value }))} />
                  {errors[key] ? <div className="form-error">{errors[key]}</div> : <div className="form-hint">{hint}</div>}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
              {FLAGS.map(([key, label, hint]) => (
                <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form[key]} style={{ marginTop: 3 }}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.checked }))} />
                  <span>
                    <strong style={{ fontSize: '0.9rem' }}>{label}</strong>
                    <div className="form-hint" style={{ marginTop: 2 }}>{hint}</div>
                  </span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <Button type="submit" loading={saving}>Save</Button>
              <Button variant="secondary" type="button" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {NUMBERS.map(([key, label]) => (
              <Row key={key} label={label} value={policy?.[key] ?? '—'} />
            ))}
            {FLAGS.map(([key, label]) => (
              <Row key={key} label={label} value={policy?.[key] ? 'Yes' : 'No'} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const Row = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
    <span className="text-muted text-sm">{label}</span>
    <strong>{value}</strong>
  </div>
);
