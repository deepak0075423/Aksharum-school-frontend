/**
 * Medical Equipment (Oct 2026) — thermometers to stretchers: where each is,
 * its condition, its status and when it is next serviced (the staff are told
 * as a service falls due).
 */
import React from 'react';
import { Page, PageHead, Btn, Status, Select, Empty } from '../mdUI';
import { EQUIP_TYPE, EQUIP_STATUS, EQUIP_CONDITION, fmtDay, labelOf } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, useFocusOpen, BoardPanel } from './mdList';

export default function MedicalEquipment() {
  const board = useBoard('equipment', { tab: 'all' });
  const { forms, drawer, elements } = useMedWorkspace(board.reload);
  useFocusOpen(board.focus, React.useCallback((id) => drawer.show('equipment', id), [drawer]));
  const columns = [
    { key: 'name', label: 'Equipment', primary: true, render: (r) => <span className="md-two"><b>{r.name}</b><em>{[labelOf(EQUIP_TYPE, r.type), r.serialNumber].filter(Boolean).join(' · ')}</em></span>, csv: (r) => r.name },
    { key: 'location', label: 'Location', render: (r) => r.location || <span className="md-none">—</span> },
    { key: 'quantity', label: 'Qty', align: 'right' },
    { key: 'condition', label: 'Condition', render: (r) => <Status of="equipCondition" value={r.condition} />, csv: (r) => labelOf(EQUIP_CONDITION, r.condition) },
    { key: 'next', label: 'Next service', render: (r) => (r.nextMaintenanceOn ? <span className="md-two"><b>{fmtDay(r.nextMaintenanceOn)}</b><em className={r.maintenanceOverdue ? 'is-bad' : r.daysToMaintenance <= 14 ? 'is-warn' : ''}>{r.maintenanceOverdue ? 'Overdue' : r.daysToMaintenance === 0 ? 'Today' : `In ${r.daysToMaintenance} days`}</em></span> : <span className="md-none">—</span>), csv: (r) => fmtDay(r.nextMaintenanceOn) },
    { key: 'status', label: 'Status', render: (r) => <Status of="equipStatus" value={r.status} />, csv: (r) => labelOf(EQUIP_STATUS, r.status) },
  ];
  return (
    <Page>
      <PageHead icon="wrench" tone="teal" title="Medical Equipment" subtitle="Thermometers, BP monitors, oximeters, wheelchairs, stretchers, nebulizers, first-aid boxes — their condition, status and service dates, with a history of every service.">
        <Btn kind="primary" icon="plus" onClick={() => forms.open('equipment')}>Add Equipment</Btn>
      </PageHead>
      <BoardPanel board={board} columns={columns} noun="item" searchPlaceholder="Search name, serial number or location" exportName="medical-equipment"
        onRow={(r) => drawer.show('equipment', r._id)} rowClass={(r) => (r.maintenanceOverdue || r.condition === 'damaged' ? 'is-critical' : r.status === 'retired' ? 'is-off' : '')}
        filters={<>
          <Select value={board.q.type} onChange={(v) => board.setQ({ type: v })} all="Any type" label="Type" options={Object.entries(EQUIP_TYPE).map(([value, label]) => ({ value, label }))} />
          <Select value={board.q.condition} onChange={(v) => board.setQ({ condition: v })} all="Any condition" label="Condition" options={Object.entries(EQUIP_CONDITION).map(([value, c]) => ({ value, label: c.label }))} />
        </>}
        empty={<Empty compact title="No equipment here" action={<Btn kind="primary" icon="plus" onClick={() => forms.open('equipment')}>Add Equipment</Btn>}>Record the room's equipment to track its condition and services.</Empty>} />
      {elements}
    </Page>
  );
}
