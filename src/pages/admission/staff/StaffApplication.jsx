/**
 * An application assigned to a teacher: what their part of the work needs —
 * the answers (sensitive ones hidden), the documents, the family-visible
 * history, moving it along the workflow (or asking for approval where the
 * stage needs it) and adding notes. The server refuses anything beyond that.
 */
import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { staff } from '../../../api/admission.api';
import {
  Page, Head, Panel, Btn, Chip, StatusChip, DocChip, Empty, ErrorBox, Spin, KV, Timeline, TextArea, IconBtn, Ico, Note, useLoad,
} from '../admUI';
import { fmtDateTime, errMsg, size } from '../meta';
import { MoveDialog, ReviewDialog, openFile } from '../admin/parts';

export default function StaffApplication() {
  const { id } = useParams();
  const { data: d, loading, error, reload } = useLoad(() => staff.application(id), [id]);
  const [moving, setMoving] = useState(false);
  const [review, setReview] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (loading && !d) return <Spin />;
  if (error && !d) return <ErrorBox error={error} onRetry={reload} />;
  const app = d.application;
  const files = new Map((d.documents.files || []).map((f) => [f.docKey, f]));
  const addNote = async () => {
    setBusy(true);
    try { await staff.note(app._id, note.trim()); setNote(''); toast.success('Note added'); reload(); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Page>
      <Link to="/teacher/admissions" className="adm-linkbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--primary)' }}><Ico name="arrowLeft" size={14} />My admission duties</Link>
      <Head eyebrow={`Application ${app.applicationNumber || ''}`} title={app.studentName || 'Student'} subtitle={[app.className, app.yearName, app.roundName].filter(Boolean).join(' · ')}>
        <StatusChip status={app.status} />
        <Btn kind="primary" icon="repeat" disabled={!(d.workflow?.moves || []).some((m) => m.ok)} onClick={() => setMoving(true)}>Change status</Btn>
      </Head>
      {d.workflow?.pending ? <Note tone="amber" icon="shieldCheck">A move to {d.workflow.pending.to.replace(/_/g, ' ')} is waiting for an administrator's approval.</Note> : null}
      <div className="adm-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {(d.answers || []).map((sec) => (
            <Panel key={sec.section} title={sec.title}>
              <KV cols={2} items={sec.fields.map((f) => [f.label, f.hidden ? <i key={f.key} className="adm-muted">Hidden</i> : (String(f.value ?? '') || '—')])} />
            </Panel>
          ))}
          {!d.answers?.length ? <Panel><Empty icon="files" title="No answers to show" /></Panel> : null}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Panel title="Documents" icon="fileCheck">
            <div className="adm-doclist">
              {(d.documents.requirements || []).map((r) => {
                const doc = files.get(r.key);
                return (
                  <div key={r.key} className="adm-row adm-row--between" style={{ flexWrap: 'nowrap', fontSize: '.86rem' }}>
                    <span style={{ minWidth: 0 }}><b>{r.name}</b>{doc ? <div className="adm-muted" style={{ fontSize: '.74rem' }}>{doc.originalName} · {size(doc.size || 0)}</div> : null}</span>
                    <span className="adm-row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                      {doc ? <DocChip status={doc.status} /> : <Chip tone={r.required ? 'amber' : 'gray'}>{r.required ? 'Missing' : 'Optional'}</Chip>}
                      {doc ? <IconBtn icon="eye" label="Open" onClick={() => openFile(staff.docUrl(doc._id))} /> : null}
                      {doc && doc.status !== 'verified' ? <IconBtn icon="checkCircle" label="Review" onClick={() => setReview({ doc: { ...doc, name: r.name, fileUrl: staff.docUrl(doc._id) }, reasons: r.rejectionReasons || [] })} /> : null}
                    </span>
                  </div>
                );
              })}
              {!(d.documents.requirements || []).length ? <span className="adm-muted">No documents asked for.</span> : null}
            </div>
          </Panel>
          <Panel title="History" icon="history">
            <div className="adm-row" style={{ alignItems: 'flex-start', marginBottom: 12, flexWrap: 'nowrap' }}>
              <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the admission office" maxLength={2000} />
              <Btn kind="primary" busy={busy} disabled={!note.trim()} onClick={addNote}>Add</Btn>
            </div>
            <Timeline items={d.timeline} />
            <p className="adm-muted" style={{ fontSize: '.74rem', marginTop: 8 }}>Updated {fmtDateTime(app.updatedAt)}</p>
          </Panel>
        </div>
      </div>
      <MoveDialog open={moving} onClose={() => setMoving(false)} app={app} moves={d.workflow?.moves || []} transition={staff.transition} onDone={reload} />
      <ReviewDialog open={!!review} onClose={() => setReview(null)} doc={review?.doc} reasons={review?.reasons || []} initial="verify" review={staff.reviewDoc} onDone={reload} />
    </Page>
  );
}
