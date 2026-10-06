/**
 * Medical History (Oct 2026) — one student's timeline: visits, incidents,
 * first aid, medicines, referrals, checkups, vaccinations, documents and
 * follow-ups, filtered by type, academic year and dates. Nothing in it is
 * ever rewritten; it is read from the records themselves.
 */
import React, { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Field, Empty, AlertArea, useLoad } from '../mdUI';
import { StudentPicker } from '../mdForm';
import { Timeline } from '../mdShared';
import { studentLine } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';

export function openHistoryItem(drawer, nav) {
  return (it) => {
    const k = it.ref?.kind;
    if (k === 'visit' || k === 'incident') drawer.show(k, it.ref.id);
    else if (k === 'first_aid') drawer.show('first_aid', it.ref.id);
    else if (k === 'checkup') nav(`/admin/medical/checkups?tab=all&focus=${it.ref.id}`);
    else if (k === 'vaccination') nav(`/admin/medical/vaccinations?tab=all&focus=${it.ref.id}`);
    else if (k === 'document') nav(`/admin/medical/documents?focus=${it.ref.id}`);
    else if (k === 'dose') nav('/admin/medical/medicines/history');
  };
}

export default function MedicalHistory() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const id = params.get('student') || '';
  const { data: rec } = useLoad(() => (id ? api.getMedStudent(id) : Promise.resolve(null)), id);
  const { meta, drawer, elements } = useMedWorkspace(() => {});
  const fetcher = useCallback((q) => api.getMedHistory(id, q), [id]);
  const student = rec?.student;
  return (
    <Page>
      <PageHead icon="history" tone="indigo" title="Medical History" subtitle="A student's complete medical timeline — every visit, incident, medicine, checkup, vaccination and document, in order. Records are kept, never overwritten." />
      <Panel title="Student" icon="student" tone="indigo">
        <Field label="Whose history?">
          <StudentPicker value={student ? { _id: student._id, name: student.name, photo: student.photo, classLabel: student.classLabel, admissionNumber: student.admissionNumber } : null}
            onChange={(s) => setParams(s ? { student: s._id } : {}, { replace: true })} fetcher={api.findMedStudents} autoFocus={!id} />
        </Field>
      </Panel>
      {id && student ? (
        <>
          {rec.alerts?.length ? <AlertArea alerts={rec.alerts} compact /> : null}
          <Panel title={`History of ${student.name}`} sub={studentLine(student)} icon="history" tone="slate" right={<Btn size="sm" kind="tint" onClick={() => nav(`/admin/medical/students/${id}`)}>Open profile</Btn>}>
            <Timeline key={id} fetcher={fetcher} years={meta?.years || []} onOpen={openHistoryItem(drawer, nav)} compact />
          </Panel>
        </>
      ) : !id ? (
        <Empty title="Choose a student">Search by name, admission number or class to see their medical history.</Empty>
      ) : null}
      {elements}
    </Page>
  );
}
