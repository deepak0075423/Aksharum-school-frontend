import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getPolicy, updatePolicy } from '../../../api/library.api';
import { PageHeader, Button, Card, Spinner, Alert } from '../../../components/ui/index';

// These keys are the LibraryPolicy schema. They were previously spelled
// maxBooksPerMember / loanPeriodDays / renewalLimit / gracePeriod, which exist
// nowhere on the server — the page showed blanks and saved nothing.
//
// Grouped rather than listed flat, because the numbers answer three different
// questions and a column of thirteen rows made none of them findable. `unit`
// is what the read-only view appends: a policy that reads "30" where it means
// "30 days of fine" is the reason the lost-book charge kept being mistaken for
// ₹30.
const GROUPS = [
  {
    title: 'Borrowing limits',
    hint: 'How much a member may have out, and for how long.',
    fields: [
      ['maxBooksPerUser',        'Max books per member',    3,  { min: 1, max: 100 }, '',
       'How many books one person may have out at once.'],
      ['issueDurationDays',      'Loan period',             14, { min: 1, max: 365 }, 'days',
       'Default due date when the counter does not set one.'],
      ['maxRenewals',            'Renewal limit',           1,  { min: 0, max: 20 }, '',
       'Times a loan may be extended before the book must come back.'],
      ['maxReservationsPerUser', 'Max reservations',        3,  { min: 1, max: 100 }, '',
       'How many titles one person may be queued for at once.'],
      ['reservationExpiryDays',  'Reservation hold',        2,  { min: 1, max: 90 }, 'days',
       'How long a reserved copy is held before it passes to the next in queue.'],
    ],
  },
  {
    title: 'Fines',
    hint: 'Late returns are charged per day; loss and damage as a multiple of that rate.',
    fields: [
      ['finePerDay',          'Fine per day',        2,  { min: 0, max: 10000 }, '₹',
       'Charged for each day past the grace period.'],
      ['gracePeriodDays',     'Grace period',        0,  { min: 0, max: 365 }, 'days',
       'Days after the due date before a fine starts.'],
      ['lostBookFineDays',    'Lost book charge',    30, { min: 0, max: 3650 }, 'days of fine',
       'Charged as this many days of fine. At ₹2/day, 30 means ₹60.'],
      ['damagedBookFineDays', 'Damaged book charge', 10, { min: 0, max: 3650 }, 'days of fine',
       'Added on top of any late fine when a book comes back damaged.'],
    ],
  },
];

const NUMBERS = GROUPS.flatMap(g => g.fields);

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

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

export default function LibraryPolicy() {
  const { data: policy, loading, error, refetch } = useFetch(getPolicy);
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

  // Without this the page rendered its whole table of dashes on a failed fetch,
  // which read as "the policy is empty" rather than "you were refused" — and a
  // refused fetch was exactly what a librarian teacher used to get here.
  if (error || !policy) {
    return (
      <div className="page">
        <PageHeader title="Library Policy" subtitle="Loan, fine and borrowing rules" />
        <Alert variant="danger">
          {error || 'The library policy could not be loaded.'}
          {' '}Administrative access to the Library module is required to view or change it.
        </Alert>
      </div>
    );
  }

  const rate = Number(policy.finePerDay || 0);

  return (
    <div className="page">
      <PageHeader title="Library Policy" subtitle="Loan, fine and borrowing rules"
        action={!editing && <Button onClick={startEdit}>Edit Policy</Button>} />

      {editing ? (
        <Card>
          <form onSubmit={handleSave}>
            {GROUPS.map(g => (
              <section key={g.title} style={{ marginBottom: 24 }}>
                <SectionTitle title={g.title} hint={g.hint} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 16 }}>
                  {g.fields.map(([key, label, , { min, max }, unit, hint]) => (
                    <div className="form-group" key={key}>
                      <label className="form-label">{label}{unit && unit !== '₹' ? ` (${unit})` : ''}</label>
                      <input type="number" className={`form-control${errors[key] ? ' error' : ''}`}
                        min={min} max={max} step={1} value={form[key] ?? ''}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value === '' ? '' : +e.target.value }))} />
                      {errors[key] ? <div className="form-error">{errors[key]}</div> : <div className="form-hint">{hint}</div>}
                    </div>
                  ))}
                </div>
              </section>
            ))}

            <section>
              <SectionTitle title="Borrowing rules" hint="What the issue counter refuses, and who is exempt." />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
            </section>

            <div style={{ display: 'flex', gap: 8, marginTop: 24 }}>
              <Button type="submit" loading={saving}>Save</Button>
              <Button variant="secondary" type="button" onClick={() => setEditing(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      ) : (
        <>
          {GROUPS.map(g => (
            <div className="card" key={g.title} style={{ marginBottom: 16 }}>
              {/* .card-header is a space-between flex row, so the title and
                  its hint have to travel as one block or they end up at
                  opposite ends of the bar. */}
              <div className="card-header">
                <div>
                  <h3 className="card-title">{g.title}</h3>
                  <div className="text-muted text-sm">{g.hint}</div>
                </div>
              </div>
              <div className="card-body">
                {g.fields.map(([key, label, , , unit]) => (
                  <Row key={key} label={label} value={valueOf(policy, key, unit)} />
                ))}
                {/* The two charges that are stored as a multiplier and spent as
                    money. Showing only the multiplier is what made "30" read as
                    thirty rupees. */}
                {g.title === 'Fines' && (
                  <div className="text-muted text-sm" style={{ marginTop: 10 }}>
                    At {rupees(rate)} a day, a lost book costs{' '}
                    <strong>{rupees((policy.lostBookFineDays ?? 0) * rate)}</strong> and a damaged one{' '}
                    <strong>{rupees((policy.damagedBookFineDays ?? 0) * rate)}</strong>,
                    unless the librarian enters the book's actual price at the return desk.
                  </div>
                )}
              </div>
            </div>
          ))}

          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="card-title">Borrowing rules</h3>
                <div className="text-muted text-sm">What the issue counter refuses, and who is exempt.</div>
              </div>
            </div>
            <div className="card-body">
              {FLAGS.map(([key, label, hint]) => (
                <div key={key} style={{
                  display: 'flex', justifyContent: 'space-between', gap: 16,
                  padding: '8px 0', borderBottom: '1px solid var(--border)',
                }}>
                  <span>
                    <div style={{ fontSize: '.87rem' }}>{label}</div>
                    <div className="text-muted text-sm" style={{ marginTop: 2 }}>{hint}</div>
                  </span>
                  <strong style={{ whiteSpace: 'nowrap', color: policy[key] ? 'var(--success)' : 'var(--text-muted)' }}>
                    {policy[key] ? 'On' : 'Off'}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function valueOf(policy, key, unit) {
  const raw = policy?.[key];
  if (raw === undefined || raw === null || raw === '') return '—';
  if (unit === '₹') return rupees(raw);
  return unit ? `${raw} ${unit}` : String(raw);
}

const SectionTitle = ({ title, hint }) => (
  <div style={{ marginBottom: 12 }}>
    <h3 style={{ margin: 0, fontSize: '.95rem' }}>{title}</h3>
    <div className="text-muted text-sm">{hint}</div>
  </div>
);

const Row = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
    <span className="text-muted text-sm">{label}</span>
    <strong style={{ whiteSpace: 'nowrap' }}>{value}</strong>
  </div>
);
