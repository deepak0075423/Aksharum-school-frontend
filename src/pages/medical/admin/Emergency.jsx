/**
 * Emergency Information (Oct 2026) — the quick-access screen: find a student
 * in two keystrokes and see their blood group, critical allergies and
 * conditions, emergency medication, who to ring and where to take them.
 * Below it, every student with a critical alert, so the staff know them on
 * sight. Opening a profile here is recorded in the audit trail.
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Field, Empty, Spin, Badge, StudentCell, AlertChips, Table, Btn, useLoad } from '../mdUI';
import { StudentPicker } from '../mdForm';
import { EmergencyCard } from '../mdShared';
import PrintCardsDialog from './PrintCards';

export default function MedicalEmergency() {
  const [params, setParams] = useSearchParams();
  const id = params.get('student') || '';
  const card = useLoad(() => (id ? api.getMedEmergency(id) : Promise.resolve(null)), id);
  const [printing, setPrinting] = useState(false);
  const list = useLoad(() => api.getMedAlerts(), 'alerts');
  const byStudent = new Map();
  for (const a of list.data?.critical || []) {
    const s = a.student;
    if (!s) continue;
    const key = s.studentId || s.student || s._id;
    if (!byStudent.has(key)) byStudent.set(key, { ...s, _key: key, alerts: [] });
    byStudent.get(key).alerts.push({ level: 'critical', kind: a.kind, label: a.title.replace(/^Severe allergy — /, 'Allergy: ').replace(/^Emergency medication — /, 'Emergency medicine: ').replace(/^Care plan — /, 'Care plan: '), detail: a.detail });
  }
  const rows = [...byStudent.values()];
  return (
    <Page>
      <PageHead icon="siren" tone="red" title="Emergency Information" subtitle="Find a student and see at once what anyone looking after them must know: blood group, critical allergies and conditions, emergency medication, contacts, doctor and hospital.">
        <Btn icon="printer" onClick={() => setPrinting(true)}>Print for a class, bus or trip</Btn>
      </PageHead>
      <PrintCardsDialog open={printing} onClose={() => setPrinting(false)} />
      <Panel title="Find a student" icon="search" tone="red">
        <Field label="Student">
          <StudentPicker value={card.data?.student ? { ...card.data.student } : null} onChange={(s) => setParams(s ? { student: s._id } : {}, { replace: true })} fetcher={api.findMedStudents} autoFocus={!id} />
        </Field>
      </Panel>
      {id ? (card.loading && !card.data ? <Spin /> : card.data ? <EmergencyCard data={card.data} onClose={() => setParams({}, { replace: true })} /> : null) : null}
      <Panel title="Students with critical alerts" sub="Severe allergies, severe or critical conditions, emergency medication" icon="alertTri" tone="red" pad={false}>
        <Table rowKey="_key" rows={rows} loading={list.loading} onRow={(r) => { setParams({ student: r._key }, { replace: true }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          columns={[
            { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} critical /> },
            { key: 'alerts', label: 'Critical alerts', render: (r) => <AlertChips alerts={r.alerts} max={3} /> },
            { key: 'go', label: '', align: 'right', render: () => <Badge tone="red" icon="siren">Emergency card</Badge> },
          ]}
          empty={<Empty compact title="No critical alerts on record">Students with severe allergies, critical conditions or emergency medication appear here.</Empty>} />
      </Panel>
    </Page>
  );
}
