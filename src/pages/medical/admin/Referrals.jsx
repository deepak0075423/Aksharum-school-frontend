/**
 * Health Checkups → Referrals (Oct 2026): every student sent on to a
 * specialist, followed until the family says what the specialist found.
 * Overdue ones first; how many came back, per kind of specialist.
 */
import React, { useState } from 'react';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Table, Empty, Spin, LoadError, LineTabs, Toolbar, Select, SearchBox, Pager, StudentCell, useLoad, useQueryState } from '../mdUI';
import { fmtDay } from '../mdMeta';
import { ClassFilter } from './mdList';
import { useMeta } from './mdForms';
import { PickStudent } from './Allergies';
import { SPECIALTY, ReferralDialog, ReferralDetail } from '../programmeParts';

export default function MedicalReferrals() {
  const { meta } = useMeta();
  const [q, setQ] = useQueryState({ tab: 'open', page: '1', q: '', specialty: '', classId: '', sectionId: '' });
  const r = useLoad(() => api.getReferrals(q), q);
  const [pick, setPick] = useState(false);
  const [refer, setRefer] = useState(null);
  const [open, setOpen] = useState(null);
  const d = r.data;
  const openOne = async (row) => {
    try { const res = await api.getReferral(row._id); setOpen(res?.data ?? res); } catch { setOpen(row); }
  };
  return (
    <Page>
      <PageHead icon="send" tone="indigo" title="Referrals" subtitle="Students sent on to a specialist after a screening or a visit — the family is told, answers from their app, and the room closes it when the specialist's answer is in.">
        <Btn kind="primary" icon="plus" onClick={() => setPick(true)}>Refer a student</Btn>
      </PageHead>
      {d?.rates?.length ? (
        <div className="mdpr-rates">
          {d.rates.map((x) => <div key={x.specialty}><span>{x.label}</span><b>{x.rate === null ? '—' : `${x.rate}%`}</b><em>{x.seen} of {x.total} seen{x.declined ? ` · ${x.declined} declined` : ''}</em></div>)}
        </div>
      ) : null}
      <Panel pad={false}>
        <div className="md-listhead"><LineTabs items={(d?.tabs || []).map((t) => ({ key: t.key, label: t.label, count: t.count }))} value={d?.tab || q.tab} onChange={(v) => setQ({ tab: v })} /></div>
        <Toolbar>
          <SearchBox value={q.q} onChange={(v) => setQ({ q: v })} placeholder="Search student, number or reason" />
          <Select value={q.specialty} onChange={(v) => setQ({ specialty: v })} all="Any specialist" label="Specialist" options={Object.entries(SPECIALTY).map(([value, label]) => ({ value, label }))} />
          <ClassFilter meta={meta} q={q} setQ={setQ} />
        </Toolbar>
        {r.error && !d ? <LoadError error={r.error} onRetry={r.reload} /> : !d ? <Spin /> : (
          <>
            <Table rows={d.rows} minWidth={820} onRow={openOne} rowClass={(x) => (x.overdue ? 'is-critical' : '')}
              columns={[
                { key: 'student', label: 'Student', primary: true, render: (x) => <StudentCell row={x} /> },
                { key: 'to', label: 'Referred to', render: (x) => <span className="md-two"><b>{x.specialtyLabel}</b><em>{x.number} · {x.urgencyLabel}</em></span> },
                { key: 'reason', label: 'Why', render: (x) => <span className="md-clamp">{x.reason}</span> },
                { key: 'due', label: 'To be seen by', render: (x) => (x.status === 'booked' && x.appointmentOn ? <span className="md-two"><b>{fmtDay(x.dueBy)}</b><em>Appointment {fmtDay(x.appointmentOn)}</em></span> : fmtDay(x.dueBy) || '—') },
                { key: 'status', label: 'Status', render: (x) => <Badge tone={x.tone} size="sm">{x.statusLabel}</Badge> },
              ]}
              empty={<Empty compact title="Nothing here">A checkup saved as "Referred" refers the child by itself.</Empty>} />
            <Pager page={d.page} pages={d.pages} total={d.total} limit={d.limit} noun="referral" onPage={(p) => setQ({ page: String(p) }, { keepPage: true })} />
          </>
        )}
      </Panel>
      <PickStudent open={pick} onClose={() => setPick(false)} title="Refer a student — choose the student" onPick={(s) => { setPick(false); setRefer(s); }} />
      {refer ? <ReferralDialog student={refer} onClose={() => setRefer(null)} onDone={() => { setRefer(null); r.reload(); }} /> : null}
      {open ? <ReferralDetail referral={open} onClose={() => setOpen(null)} onChanged={() => { r.reload(); openOne(open); }} /> : null}
    </Page>
  );
}
