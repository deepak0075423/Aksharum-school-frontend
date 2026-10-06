/**
 * Medication History (Oct 2026) — every dose recorded: given, missed, refused
 * or cancelled, by whom and when. The complete administration record.
 */
import React from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Status, StudentCell, Empty, Kebab } from '../mdUI';
import { DOSE_STATUS, fmtStamp, fmtDate, fmtTime, labelOf, qty, errorText } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, BoardPanel, ClassFilter, DateFilter } from './mdList';

export default function MedicationHistory() {
  const board = useBoard('doses', { tab: 'all' });
  const { meta, drawer, elements } = useMedWorkspace(board.reload);
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'medicine', label: 'Medicine', render: (r) => <span className="md-two"><b>{r.medicineName}</b><em>{r.dosage}{r.quantity ? ` · ${qty(r.quantity)} from stock` : ''}</em></span>, csv: (r) => `${r.medicineName} ${r.dosage}` },
    { key: 'when', label: 'When', render: (r) => { const at = r.givenAt || r.scheduledFor || r.updatedAt; return <span className="md-two"><b>{fmtDate(at)}</b><em>{fmtTime(at)}{r.scheduledFor && r.givenAt ? ` (due ${fmtTime(r.scheduledFor)})` : ''}</em></span>; }, csv: (r) => fmtStamp(r.givenAt || r.scheduledFor) },
    { key: 'source', label: 'From', render: (r) => (r.source === 'plan' ? 'Medication plan' : r.source === 'visit' ? `Visit ${r.visitNumber || ''}` : 'Given as needed') },
    { key: 'givenByName', label: 'By', render: (r) => <span className="md-two"><b>{r.givenByName || '—'}</b><em>{r.note}</em></span> },
    { key: 'status', label: 'Status', render: (r) => <Status of="dose" value={r.status} />, csv: (r) => labelOf(DOSE_STATUS, r.status) },
    { key: 'acts', label: '', align: 'right', stop: true, render: (r) => (r.status === 'given' ? <Kebab items={[{ label: 'Cancel this dose', icon: 'close', danger: true, onClick: () => drawer.confirm({
      title: 'Cancel this dose?', message: `${r.medicineName} will be recorded as not given${r.quantity ? ', and the stock returned' : ''}.`, reason: true, reasonLabel: 'Why', danger: true, confirmLabel: 'Cancel dose',
      run: async (why) => { try { await api.cancelDose(r._id, why); toast.success('Dose cancelled'); board.reload(); } catch (e) { throw new Error(errorText(e)); } },
    }) }]} /> : null) },
  ];
  return (
    <Page>
      <PageHead icon="history" tone="violet" title="Medication History" subtitle="Every dose recorded in the Medical Room — scheduled from a plan, given in a visit or given as needed — with who gave it and when." />
      <BoardPanel board={board} columns={columns} noun="dose" searchPlaceholder="Search student or medicine" exportName="medication-history"
        filters={<><ClassFilter meta={meta} q={board.q} setQ={board.setQ} /><DateFilter q={board.q} setQ={board.setQ} /></>}
        empty={<Empty compact title="No doses recorded">Doses appear here as they are given, refused or missed.</Empty>} />
      {elements}
    </Page>
  );
}
