import React, { useState, useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { PageHeader, Card, Badge, Spinner, Empty, Input, StatCard } from '../../components/ui/index';
import { getMySubstitutions } from '../../api/substitute.api';

/**
 * A teacher's own view: the substitute classes I have to take, and my own
 * periods someone else is covering while I'm away.
 *
 * The same six counts the admin sees when picking me are shown here, so the
 * fairness argument is visible from both sides rather than only to the person
 * doing the assigning.
 */

const todayIso = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const fmtDay = (d) => new Date(d).toLocaleDateString('en-IN', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
});

const periodTime = (p) => (p.startTime ? `${p.startTime}${p.endTime ? `–${p.endTime}` : ''}` : '');

function DutyRow({ d, mine }) {
  const isToday = new Date(d.date).toISOString().slice(0, 10) === todayIso();
  return (
    // data-focus-id lets a substitution notification flag this exact duty on
    // arrival — see hooks/useFocusHighlight.js.
    <div data-focus-id={d._id} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px',
      borderTop: '1px solid var(--border)', flexWrap: 'wrap',
      background: isToday ? 'var(--bg-secondary)' : 'transparent',
    }}>
      <div style={{ minWidth: 84 }}>
        <div style={{ fontWeight: 700 }}>{fmtDay(d.date)}</div>
        {isToday && <Badge variant="success">Today</Badge>}
      </div>
      <div style={{ minWidth: 92 }}>
        <div style={{ fontWeight: 600 }}>Period {d.periodNumber}</div>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{periodTime(d) || '—'}</div>
      </div>
      <div style={{ flex: 1, minWidth: 170 }}>
        <div style={{ fontWeight: 600 }}>{d.section?.label || '—'}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{d.subject?.name || '—'}</div>
      </div>
      <div style={{ flex: 1, minWidth: 160, fontSize: '.82rem' }}>
        {mine ? (
          <>
            <span style={{ color: 'var(--text-muted)' }}>Covering for </span>
            <strong>{d.originalTeacher?.name || '—'}</strong>
          </>
        ) : d.substituteTeacher ? (
          <>
            <span style={{ color: 'var(--text-muted)' }}>Covered by </span>
            <strong>{d.substituteTeacher.name}</strong>
          </>
        ) : (
          <Badge variant="danger">Not yet covered</Badge>
        )}
        {d.remarks && (
          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>“{d.remarks}”</div>
        )}
      </div>
    </div>
  );
}

export default function MySubstitutions() {
  const [from, setFrom]       = useState(todayIso());
  const [to, setTo]           = useState(plusDays(todayIso(), 14));
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMySubstitutions(from, to);
      setData(res?.data ?? res);
    } catch (e) { toast.error(e.message || 'Could not load your substitutions'); }
    finally { setLoading(false); }
  }, [from, to]);

  useEffect(() => { load(); }, [load]);

  const w = data?.workload;

  return (
    <div className="page">
      <PageHeader title="My Substitutions"
        subtitle="Classes you are covering, and your own classes being covered" />

      <Card>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', padding: 4 }}>
          <Input label="From" type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ maxWidth: 180 }} />
          <Input label="To"   type="date" value={to}   onChange={(e) => setTo(e.target.value)}   style={{ maxWidth: 180 }} />
        </div>
      </Card>

      {w && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, margin: '16px 0' }}>
          <StatCard icon="🔁" label="Substitutes today"     value={w.subsToday}   color="orange" />
          <StatCard icon="🔁" label="Substitutes this week"  value={w.subsWeek}    color="orange" />
          <StatCard icon="🔁" label="Substitutes this month" value={w.subsMonth}   color="orange" />
          <StatCard icon="📚" label="My periods today"       value={w.normalToday} color="blue" />
          <StatCard icon="📚" label="My periods this week"   value={w.normalWeek}  color="blue" />
          <StatCard icon="📚" label="My periods this month"  value={w.normalMonth} color="blue" />
        </div>
      )}

      {loading ? (
        <div style={{ padding: 60, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
      ) : (
        <>
          <Card title={`Classes I'm covering (${data?.duties?.length || 0})`}>
            {!data?.duties?.length ? (
              <Empty icon="✅" title="Nothing to cover"
                message="You have no substitute classes in this date range." />
            ) : (
              <div style={{ margin: '0 -16px -16px' }}>
                {data.duties.map((d) => <DutyRow key={d._id} d={d} mine />)}
              </div>
            )}
          </Card>

          <Card title={`My classes being covered (${data?.handedOver?.length || 0})`}>
            {!data?.handedOver?.length ? (
              <Empty icon="📘" title="None"
                message="None of your periods are down for substitution in this date range." />
            ) : (
              <div style={{ margin: '0 -16px -16px' }}>
                {data.handedOver.map((d) => <DutyRow key={d._id} d={d} />)}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
