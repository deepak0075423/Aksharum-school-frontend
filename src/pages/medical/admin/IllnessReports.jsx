/**
 * Health Programmes → Off Sick (Oct 2026): families telling the school their
 * child is unwell at home — read by the medical staff, counted by the
 * outbreak watch.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Table, Empty, Spin, LoadError, LineTabs, StudentCell, useLoad, useQueryState } from '../mdUI';
import { fmtDay, fmtStamp, errorText } from '../mdMeta';

export default function MedicalIllnessReports() {
  const nav = useNavigate();
  const [q, setQ] = useQueryState({ tab: 'new' });
  const r = useLoad(() => api.getIllnessReports({ tab: q.tab }), q.tab);
  const d = r.data;
  const seen = async (x) => { try { await api.markIllnessSeen(x._id); toast.success('Marked as read'); r.reload(); } catch (e) { toast.error(errorText(e)); } };
  return (
    <Page>
      <PageHead icon="thermometer" tone="amber" title="Off Sick" subtitle="Families' reports of a child unwell at home. They count towards the outbreak watch; teachers see only that the child is away." />
      <Panel pad={false}>
        <div className="md-listhead"><LineTabs items={(d?.tabs || []).map((t) => ({ key: t.key, label: t.label, count: t.count }))} value={d?.tab || q.tab} onChange={(v) => setQ({ tab: v })} /></div>
        {r.error && !d ? <LoadError error={r.error} onRetry={r.reload} /> : !d ? <Spin /> : (
          <Table rows={d.rows} minWidth={820} onRow={(x) => nav(`/admin/medical/students/${x.studentId}`)}
            columns={[
              { key: 'student', label: 'Student', primary: true, render: (x) => <StudentCell row={x} /> },
              { key: 'signs', label: 'Signs', render: (x) => <span className="md-two"><b>{x.symptomLabels.join(', ')}</b><em>{x.note}</em></span> },
              { key: 'when', label: 'Unwell', render: (x) => <span className="md-two"><b>From {fmtDay(x.from)}</b><em>{x.to ? `Back ${fmtDay(x.to)}` : ''}</em></span> },
              { key: 'by', label: 'Told by', render: (x) => <span className="md-two"><b>{x.reportedByName}</b><em>{fmtStamp(x.createdAt)}</em></span> },
              { key: 'status', label: '', align: 'right', stop: true, render: (x) => (x.status === 'new' ? <Btn size="sm" kind="primary" onClick={() => seen(x)}>Mark read</Btn> : <Badge tone={x.status === 'seen' ? 'green' : 'slate'} size="sm">{x.status === 'seen' ? `Read by ${x.seenByName}` : 'Withdrawn'}</Badge>) },
            ]}
            empty={<Empty compact title="Nothing here">Families report an illness from the Medical Room page of their app.</Empty>} />
        )}
      </Panel>
    </Page>
  );
}
