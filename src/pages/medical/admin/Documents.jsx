/**
 * Medical Documents (Oct 2026) — prescriptions, certificates, lab and doctor
 * reports, hospital papers and incident photos. Private: each opens through a
 * short-lived link after an access check, and every opening is audited.
 */
import React from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Btn, Badge, Status, StudentCell, Select, Empty, Kebab } from '../mdUI';
import { DocButton, openDocument } from '../mdShared';
import { DOC_TYPE, DOC_VISIBILITY, fmtDay, fmtDate, ago, fileSize, labelOf, errorText } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter } from './mdList';

export default function MedicalDocuments() {
  const board = useBoard('documents', { tab: 'all' });
  const { meta, forms, drawer, elements } = useMedWorkspace(board.reload);
  const act = async (fn, ok) => { try { await fn(); toast.success(ok); board.reload(); } catch (e) { toast.error(errorText(e)); } };
  const columns = [
    { key: 'title', label: 'Document', primary: true, render: (r) => <span className="md-two"><b>{r.title}</b><em>{labelOf(DOC_TYPE, r.type)} · {fileSize(r.size)}</em></span> },
    { key: 'student', label: 'Student', render: (r) => <StudentCell row={r} size={30} />, csv: (r) => r.studentName },
    { key: 'date', label: 'Date', render: (r) => <span className="md-two"><b>{r.documentDate ? fmtDay(r.documentDate) : fmtDate(r.createdAt)}</b><em className={r.expired ? 'is-bad' : ''}>{r.expiresOn ? `${r.expired ? 'Expired' : 'Valid until'} ${fmtDay(r.expiresOn)}` : ''}</em></span>, csv: (r) => fmtDay(r.documentDate) },
    { key: 'visibility', label: 'Who can see it', render: (r) => <Status of="docVisibility" value={r.visibility} />, csv: (r) => labelOf(DOC_VISIBILITY, r.visibility) },
    { key: 'by', label: 'Uploaded', render: (r) => <span className="md-two"><b>{r.uploadedByName}</b><em>{r.uploadedByRole === 'parent' ? 'Parent' : 'Staff'} · {ago(r.createdAt)}</em></span>, csv: (r) => r.uploadedByName },
    { key: 'status', label: 'Status', render: (r) => (r.archivedAt ? <Badge tone="gray">Archived</Badge> : <Status of="docStatus" value={r.status} />) },
    { key: 'acts', label: '', align: 'right', stop: true, render: (r) => (
      <span className="md-acts">
        <DocButton getLink={api.medDocLink} id={r._id} />
        <Kebab items={r.archivedAt ? [{ label: 'Restore', icon: 'repeat', onClick: () => act(() => api.restoreMedRecord('documents', r._id), 'Restored') }] : [
          { label: 'Download', icon: 'download', onClick: () => openDocument(api.medDocLink, r._id, { download: true }) },
          { label: 'Edit details', icon: 'pencil', onClick: () => forms.open('documentEdit', { document: r }) },
          r.status === 'pending' ? { label: 'Accept', icon: 'checkCircle', onClick: () => act(() => api.reviewMedDocument(r._id, { status: 'verified' }), 'Accepted') } : null,
          r.status === 'pending' ? { label: 'Do not accept', icon: 'close', onClick: () => drawer.confirm({ title: 'Do not accept this document?', reason: true, reasonLabel: 'Why (the parent sees it)', confirmLabel: 'Do not accept', run: async (why) => { await api.reviewMedDocument(r._id, { status: 'rejected', note: why }); board.reload(); } }) } : null,
          '-',
          { label: 'Delete (archive)', icon: 'trash', danger: true, onClick: () => drawer.confirm({ title: `Delete “${r.title}”?`, message: 'It is archived — removed from every list, kept for the record, and can be restored.', reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Delete', run: async (why) => { await api.archiveMedRecord('documents', r._id, why); toast.success('Deleted'); board.reload(); } }) },
        ]} />
      </span>
    ) },
  ];
  return (
    <Page>
      <PageHead icon="files" tone="slate" title="Medical Documents" subtitle="Prescriptions, certificates, lab and doctor reports, hospital papers and incident photos. Files are private: they open through a short-lived link, and every opening is recorded.">
        <Btn kind="primary" icon="upload" onClick={() => forms.open('document')}>Upload Document</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="document" searchPlaceholder="Search student or document name" exportName="medical-documents" rowClass={(r) => (r.archivedAt ? 'is-off' : '')}
        filters={<>
          <ClassFilter meta={meta} q={board.q} setQ={board.setQ} />
          <Select value={board.q.type} onChange={(v) => board.setQ({ type: v })} all="Any type" label="Type" options={Object.entries(DOC_TYPE).map(([value, label]) => ({ value, label }))} />
          <Select value={board.q.archived} onChange={(v) => board.setQ({ archived: v })} all="Current documents" label="Archived" options={[{ value: '1', label: 'Archived only' }]} />
        </>}
        empty={<Empty compact title="No documents here" action={<Btn kind="primary" icon="upload" onClick={() => forms.open('document')}>Upload Document</Btn>}>Upload medical documents from here or from a student's profile; parents can send them too.</Empty>} />
      {elements}
    </Page>
  );
}
