/**
 * First Aid (Oct 2026) — every time first aid was given, in the room or out
 * of it, and the supplies it used (taken out of stock when it is recorded).
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Page, PageHead, Btn, StudentCell, Empty, Panel, Badge, Tiles, Tile, useLoad } from '../mdUI';
import * as api from '../../../api/medical.api';
import { fmtStamp, fmtDate, fmtTime, qty } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, useFocusOpen, BoardPanel, ClassFilter, DateFilter } from './mdList';

export default function MedicalFirstAid() {
  const nav = useNavigate();
  const board = useBoard('firstaid', { tab: 'all' });
  const supplies = useLoad(() => api.getMedBoard('items', { kind: 'supply', tab: 'all', limit: 12 }), 'supplies');
  const { meta, forms, drawer, elements } = useMedWorkspace(() => { board.reload(); supplies.reload(); });
  useFocusOpen(board.focus, React.useCallback((id) => drawer.show('first_aid', id), [drawer]));
  const columns = [
    { key: 'student', label: 'Student', primary: true, render: (r) => <StudentCell row={r} />, csv: (r) => r.studentName },
    { key: 'at', label: 'When', render: (r) => <span className="md-two"><b>{fmtDate(r.at)}</b><em>{fmtTime(r.at)}</em></span>, csv: (r) => fmtStamp(r.at) },
    { key: 'reason', label: 'Reason', render: (r) => <span className="md-two"><b>{r.reason}</b><em>{r.injury}</em></span> },
    { key: 'treatment', label: 'First aid given', render: (r) => <span className="md-clamp">{r.treatment}</span> },
    { key: 'supplies', label: 'Supplies used', render: (r) => ((r.supplies || []).length ? <span className="md-clamp">{r.supplies.map((s) => `${qty(s.quantity)} ${s.name}`).join(', ')}</span> : <span className="md-none">—</span>), csv: (r) => (r.supplies || []).map((s) => `${qty(s.quantity)} ${s.unit} ${s.name}`).join('; ') },
    { key: 'givenByName', label: 'Given by', render: (r) => <span className="md-two"><b>{r.givenByName}</b><em>{r.visitNumber || r.incidentNumber || ''}</em></span> },
  ];
  const sup = supplies.data?.rows || [];
  const low = sup.filter((s) => s.minStock > 0 && s.usable <= s.minStock);
  return (
    <Page>
      <PageHead icon="firstAid" tone="violet" title="First Aid" subtitle="First aid given to students and the supplies used — bandages, gauze, antiseptic, ice packs — each taken out of stock as it is recorded.">
        <Btn onClick={() => nav('/admin/medical/inventory?tab=supplies')} icon="package">First-aid stock</Btn>
        <Btn kind="primary" icon="plus" onClick={() => forms.open('firstAid')}>Record First Aid</Btn>
      </PageHead>
      {sup.length ? (
        <Tiles>
          <Tile tone="violet" icon="bandage" value={supplies.data?.total || 0} label="First-aid supplies" caption="Items kept in stock" onClick={() => nav('/admin/medical/inventory?tab=supplies')} />
          <Tile tone={low.length ? 'amber' : 'green'} icon="package" value={low.length} label="Running low" caption={low.slice(0, 3).map((s) => s.name).join(', ') || 'Everything above its minimum'} onClick={() => nav('/admin/medical/inventory?tab=supplies')} />
          <Tile tone="blue" icon="firstAid" value={board.data?.tabs?.find((t) => t.key === 'today')?.count || 0} label="First aid today" />
          <Tile tone="slate" icon="history" value={board.data?.tabs?.find((t) => t.key === 'week')?.count || 0} label="In the last 7 days" />
        </Tiles>
      ) : null}
      <BoardPanel board={board} columns={columns} noun="record" searchPlaceholder="Search student, reason or treatment" exportName="first-aid"
        onRow={(r) => drawer.show('first_aid', r._id)}
        filters={<><ClassFilter meta={meta} q={board.q} setQ={board.setQ} /><DateFilter q={board.q} setQ={board.setQ} /></>}
        empty={<Empty compact title="No first aid recorded" action={<Btn kind="primary" icon="plus" onClick={() => forms.open('firstAid')}>Record First Aid</Btn>}>First aid given in visits and on its own appears here.</Empty>} />
      {low.length ? (
        <Panel title="Supplies running low" icon="package" tone="amber" pad>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{low.map((s) => <Badge key={s._id} tone={s.usable <= 0 ? 'red' : 'amber'}>{s.name}: {qty(s.usable)} {s.unit}</Badge>)}</div>
        </Panel>
      ) : null}
      {elements}
    </Page>
  );
}
