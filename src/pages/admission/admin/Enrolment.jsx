/**
 * Admissions → Enrolment (Oct 2026).
 *
 *   Enrol a class    every confirmed application of a class in a round on one
 *                    sheet: the section suggested so sections fill evenly (by
 *                    headcount, then boys and girls), the student's sign-in
 *                    email, the parent from the form. Each row is enrolled
 *                    exactly as on its own — a row that cannot be says why.
 *   Offers forecast  from the school's own record of offers accepted and
 *                    confirmed: how many admissions the offers out are likely
 *                    to bring, and how many more offers would fill the seats.
 *                    An estimate to read — nothing is offered by itself.
 * (school-backend services/admission/enrolment.js)
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import { Page, Head, Panel, Btn, Chip, Table, Empty, ErrorBox, Spin, Field, Input, Select, Note, useLoad } from '../admUI';
import { errMsg } from '../meta';
import { useAdmission, useQueryState, RoundSelect, ClassSelect } from './parts';

const BASE = '/admin/admissions';
const pct = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);

export default function Enrolment() {
  const adm = useAdmission();
  const open = (adm.rounds || []).find((r) => r.status === 'open') || (adm.rounds || [])[0];
  const [q, setQ] = useQueryState({ tab: 'bulk', round: String(open?._id || ''), class: '' });
  return (
    <Page>
      <Head eyebrow="Admissions" title="Enrolment" subtitle="Enrol a class in one go, and see how many offers the seats are likely to need." />
      <Tabs variant="line" value={q.tab} onChange={(v) => setQ({ tab: v })} items={[{ key: 'bulk', label: 'Enrol a class' }, { key: 'forecast', label: 'Offers forecast' }]} />
      <div className="adm-row">
        <RoundSelect value={q.round} onChange={(v) => setQ({ round: v, class: '' })} all={false} />
        {q.tab === 'bulk' ? <ClassSelect value={q.class} round={q.round} onChange={(v) => setQ({ class: v })} all="Choose a class" /> : null}
      </div>
      {q.tab === 'forecast' ? <Forecast round={q.round} /> : q.round && q.class ? <Bulk key={`${q.round}-${q.class}`} round={q.round} cls={q.class} /> : <Note icon="info">Choose the round and the class to enrol.</Note>}
    </Page>
  );
}

function Bulk({ round, cls }) {
  const { data, loading, error, reload } = useLoad(() => admin.enrolPlan({ round, class: cls }), [round, cls]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState({});
  useEffect(() => {
    if (!data) return;
    setRows(data.rows.map((r) => ({
      ...r, pick: !r.blockers.length,
      parentMode: 'new', parentId: r.parent.existing?.[0]?._id || '',
      parentName: r.parent.name || '', parentEmail: r.parent.email || '', parentPhone: r.parent.phone || '', relation: r.parent.relation || 'Father',
    })));
  }, [data]);
  const set = (i, patch) => setRows((x) => x.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const sectionName = (id) => data?.sections.find((s) => String(s._id) === String(id))?.sectionName || '';
  const chosen = rows.filter((r) => r.pick);
  const fill = useMemo(() => {
    const m = new Map((data?.sections || []).map((s) => [String(s._id), { ...s, adding: 0 }]));
    for (const r of rows) if (r.pick && r.section && m.has(String(r.section))) m.get(String(r.section)).adding += 1;
    return [...m.values()];
  }, [rows, data]);
  const go = async () => {
    setBusy(true);
    try {
      const body = chosen.map((r) => ({
        applicationId: r.applicationId, section: r.section || undefined, studentEmail: r.studentEmail.trim(),
        parent: r.parentMode === 'existing' && r.parentId ? { mode: 'existing', userId: r.parentId } : { mode: 'new', relation: r.relation, name: r.parentName.trim(), email: r.parentEmail.trim(), phone: r.parentPhone.trim() },
      }));
      const res = await admin.enrolBulk(body);
      setResults(Object.fromEntries(res.data.results.map((x) => [x.applicationId, x])));
      toast[res.data.failed ? 'error' : 'success'](`${res.data.enrolled} enrolled${res.data.failed ? ` · ${res.data.failed} could not be — see each row` : ''}`);
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const done = Object.values(results).filter((x) => x.ok);
  return (
    <>
      {fill.length ? (
        <Panel title="Sections after this" icon="layers">
          <div className="adm-row" style={{ gap: 8 }}>
            {fill.map((s) => (
              <Chip key={s._id} tone={s.capacity && s.occupied + s.adding > s.capacity ? 'red' : 'indigo'}>
                {s.sectionName}: {s.occupied} + {s.adding}{s.capacity ? ` / ${s.capacity}` : ''}
              </Chip>
            ))}
          </div>
        </Panel>
      ) : <Note tone="amber" icon="alert">This class has no sections for the year yet — students are placed in the class and given a section later.</Note>}
      {done.length ? <Note tone="green" icon="checkCircle">{done.length} enrolled{done.some((x) => x.admissionNumber) ? `: ${done.map((x) => x.admissionNumber).filter(Boolean).join(', ')}` : ''}.</Note> : null}
      <Panel pad={false} title={`${rows.length} confirmed, not yet enrolled`} icon="gradCap"
        right={<Btn kind="primary" icon="userPlus" busy={busy} disabled={!chosen.length} onClick={go}>Enrol {chosen.length}</Btn>}>
        <Table rows={rows} rowKey={(r) => r.applicationId} empty={<Empty icon="gradCap" title="Nobody to enrol here">Applications appear once their admission is confirmed.</Empty>} columns={[
          { key: 'p', label: '', render: (r, i) => <input type="checkbox" aria-label={`Enrol ${r.studentName}`} checked={r.pick} disabled={!!r.blockers.length} onChange={(e) => set(i, { pick: e.target.checked })} /> },
          { key: 'n', label: 'Student', render: (r) => (
            <>
              <Link to={`${BASE}/applications/${r.applicationId}`}><b>{r.studentName}</b></Link>
              <div className="adm-muted" style={{ fontSize: '.74rem' }}>{r.applicationNumber}{r.gender ? ` · ${r.gender}` : ''}</div>
              {r.blockers.map((b) => <div key={b} className="adm-field__error">{b}</div>)}
              {r.hostelRequested ? <div className="adm-muted" style={{ fontSize: '.72rem' }}>Asked for the hostel — arrange it from the application</div> : null}
              {results[r.applicationId] && !results[r.applicationId].ok ? <div className="adm-field__error">{results[r.applicationId].message}</div> : null}
            </>
          ) },
          { key: 's', label: 'Section', render: (r, i) => (
            <Select value={r.section || ''} onChange={(e) => set(i, { section: e.target.value })} aria-label="Section" style={{ width: 110 }}>
              <option value="">Later</option>
              {(data.sections || []).map((s) => <option key={s._id} value={s._id}>{s.sectionName}</option>)}
            </Select>
          ) },
          { key: 'e', label: 'Student sign-in email', render: (r, i) => <Input type="email" value={r.studentEmail} placeholder="Needed" onChange={(e) => set(i, { studentEmail: e.target.value })} aria-label="Student email" style={{ minWidth: 200 }} /> },
          { key: 'pa', label: 'Parent', render: (r, i) => (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 230 }}>
              {r.parent.existing?.length ? (
                <Select value={r.parentMode === 'existing' ? r.parentId : 'new'} onChange={(e) => set(i, e.target.value === 'new' ? { parentMode: 'new' } : { parentMode: 'existing', parentId: e.target.value })} aria-label="Parent account">
                  <option value="new">A new parent account</option>
                  {r.parent.existing.map((p) => <option key={p._id} value={p._id}>Link {p.name} ({p.email})</option>)}
                </Select>
              ) : null}
              {r.parentMode === 'new' ? (
                <>
                  <Input value={r.parentName} placeholder="Name" onChange={(e) => set(i, { parentName: e.target.value })} aria-label="Parent name" data-text="name" />
                  <Input type="email" value={r.parentEmail} placeholder="Email" onChange={(e) => set(i, { parentEmail: e.target.value })} aria-label="Parent email" />
                </>
              ) : null}
            </div>
          ) },
          { key: 'r', label: '', render: (r) => (results[r.applicationId]?.ok ? <Chip tone="green">Enrolled</Chip> : sectionName(r.section) ? <Chip tone="indigo">{sectionName(r.section)}</Chip> : null) },
        ]} />
      </Panel>
    </>
  );
}

function Forecast({ round }) {
  const { data, loading, error, reload } = useLoad(() => (round ? admin.forecast(round) : Promise.resolve({ data: null })), [round]);
  if (!round) return <Note icon="info">Choose a round.</Note>;
  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  if (!data) return null;
  return (
    <>
      <Note icon="info">
        Rates come from this school&rsquo;s own offers of the last three years: how many were accepted, and how many acceptances became admissions.
        Shown only with at least {data.minHistory} answered offers behind them. An estimate to plan with — no offer is made by itself.
      </Note>
      <Panel pad={false} title={data.round.name} icon="trending">
        <Table rows={data.classes} rowKey={(c) => c.class} empty={<Empty compact icon="trending" title="No classes in this round" />} columns={[
          { key: 'c', label: 'Class', render: (c) => <b>{c.className}</b> },
          { key: 's', label: 'Seats', align: 'right', render: (c) => c.seats || 'Open' },
          { key: 'cf', label: 'Confirmed', align: 'right', render: (c) => c.confirmed },
          { key: 'a', label: 'Accepted, to confirm', align: 'right', render: (c) => c.accepted },
          { key: 'o', label: 'Offers out', align: 'right', render: (c) => c.issued },
          { key: 'w', label: 'Waiting list', align: 'right', render: (c) => c.waitlisted },
          { key: 'r', label: 'Accepted / confirmed', render: (c) => (c.basis === 'not_enough' ? <span className="adm-muted">Not enough history ({c.history} answered)</span> : <>{pct(c.acceptRate)} / {pct(c.confirmRate)}<div className="adm-muted" style={{ fontSize: '.72rem' }}>{c.basis === 'class' ? 'this class' : 'the whole school'} · {c.history} offers</div></>) },
          { key: 'e', label: 'Expected admissions', align: 'right', render: (c) => (c.expected == null ? '—' : c.expected.toFixed(1)) },
          { key: 'g', label: 'Seats left (est.)', align: 'right', render: (c) => (c.gap == null ? '—' : Math.max(0, c.gap).toFixed(1)) },
          { key: 'm', label: 'More offers to fill', align: 'right', render: (c) => (c.moreOffers ? <b>{c.moreOffers}</b> : '—') },
        ]} />
      </Panel>
      {data.classes.some((c) => c.moreOffers > c.waitlisted) ? <Note tone="amber" icon="alert">Some classes would need more offers than their waiting list holds.</Note> : null}
    </>
  );
}
