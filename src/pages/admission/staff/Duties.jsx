/**
 * A teacher's admission duties — /teacher/admissions. The exams and
 * interviews they evaluate or sit on the panel of, the applications assigned
 * to them, and the documents of the types they review. Nothing else of the
 * admission office is visible from here; every list is the server's.
 */
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { staff } from '../../../api/admission.api';
import {
  Page, Head, Panel, Btn, Chip, StatusChip, ResultsChip, Table, Empty, ErrorBox, Spin, Tiles, Tile, IconBtn, Person, Note, useLoad,
} from '../admUI';
import { fmtDateTime, ago, EXAM_MODE, size } from '../meta';
import { ReviewDialog, openFile } from '../admin/parts';

export default function Duties() {
  const nav = useNavigate();
  const { data, loading, error, reload } = useLoad(() => staff.duties(), []);
  const docs = useLoad(() => staff.documents(), []);
  const [review, setReview] = useState(null);
  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  const toMark = data.exams.reduce((s, e) => s + (e.notMarked || 0) + (e.toEvaluate || 0), 0);
  const open = (r, decision) => setReview({ doc: { ...r, fileUrl: staff.docUrl(r._id) }, decision, reasons: r.rejectionReasons || [] });
  return (
    <Page>
      <Head eyebrow="Admissions" title="My admission duties" subtitle="Exams to mark, applications assigned to you, and documents to check." />
      {data.isAdmin ? <Note icon="shieldCheck" action={<Btn size="sm" kind="primary" onClick={() => nav('/admin/admissions/dashboard')}>Open the admission office</Btn>}>You administer admissions — the full office is under Manage Admissions.</Note> : null}
      <Tiles>
        <Tile icon="clipboard" tone="indigo" label="Exams and interviews" value={data.exams.length} sub={toMark ? `${toMark} to mark` : 'nothing waiting'} />
        <Tile icon="files" tone="blue" label="Applications assigned" value={data.applications.length} />
        <Tile icon="fileCheck" tone="amber" label="Documents to check" value={data.documentQueue} sub={data.reviewTypes.map((t) => t.name).join(', ') || 'no document types assigned'} />
      </Tiles>

      <Panel pad={false} title="Exams and interviews" icon="clipboard">
        <Table rows={data.exams} onRow={(e) => nav(`/teacher/admissions/exams/${e._id}`)}
          empty={<Empty compact icon="clipboard" title="No exams assigned to you" />}
          columns={[
            { key: 'n', label: 'Exam', render: (e) => <><b>{e.name}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{e.roundName} · {EXAM_MODE[e.mode]}</div></> },
            { key: 'w', label: 'When', render: (e) => fmtDateTime(e.startsAt) },
            { key: 'c', label: 'Candidates', align: 'right', render: (e) => e.candidates },
            { key: 'm', label: 'To mark', align: 'right', render: (e) => (e.mode === 'online' ? (e.toEvaluate ? <Chip tone="amber">{e.toEvaluate} answers</Chip> : '—') : (e.notMarked ? <Chip tone="amber">{e.notMarked}</Chip> : '—')) },
            { key: 'r', label: 'Results', render: (e) => <ResultsChip status={e.resultsStatus} /> },
          ]} />
      </Panel>

      <Panel pad={false} title="Applications assigned to me" icon="files">
        <Table rows={data.applications} onRow={(a) => nav(`/teacher/admissions/applications/${a._id}`)}
          empty={<Empty compact icon="files" title="No applications assigned to you" />}
          columns={[
            { key: 's', label: 'Student', render: (a) => <Person name={a.studentName || 'Not named'} sub={`${a.applicationNumber || 'Draft'} · ${a.className || ''}`} to={`/teacher/admissions/applications/${a._id}`} /> },
            { key: 'st', label: 'Status', render: (a) => <StatusChip status={a.status} /> },
            { key: 'since', label: 'In this status', render: (a) => ago(a.statusChangedAt) },
          ]} />
      </Panel>

      {data.reviewTypes.length || data.isAdmin ? (
        <Panel pad={false} title="Documents to check" icon="fileCheck">
          {docs.loading && !docs.data ? <Spin /> : (
            <Table rows={docs.data || []} empty={<Empty compact icon="fileCheck" title="Nothing waiting" />}
              columns={[
                { key: 'd', label: 'Document', render: (r) => <><b>{r.typeName}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{r.originalName} · {size(r.size || 0)}</div></> },
                { key: 's', label: 'Student', render: (r) => <>{r.studentName}<div className="adm-muted" style={{ fontSize: '.76rem' }}>{r.applicationNumber} · {r.className}</div></> },
                { key: 'a', label: 'Uploaded', render: (r) => ago(r.createdAt) },
                { key: 'x', label: '', render: (r) => (
                  <div className="adm-row" style={{ gap: 4, flexWrap: 'nowrap', justifyContent: 'flex-end' }}>
                    <IconBtn icon="eye" label="Open" onClick={() => openFile(staff.docUrl(r._id))} />
                    <Btn size="sm" kind="success" onClick={() => open(r, 'verify')}>Verify</Btn>
                    <Btn size="sm" onClick={() => open(r, 'resubmit')}>Problem</Btn>
                  </div>
                ) },
              ]} />
          )}
        </Panel>
      ) : null}
      <ReviewDialog open={!!review} onClose={() => setReview(null)} doc={review?.doc} reasons={review?.reasons || []} initial={review?.decision}
        review={staff.reviewDoc} onDone={() => { docs.reload(); reload(); }} />
      <p className="adm-muted" style={{ fontSize: '.8rem' }}>Sensitive documents and answers are seen only by the admission administrators. <Link to="/teacher/dashboard">Back to the dashboard</Link></p>
    </Page>
  );
}
