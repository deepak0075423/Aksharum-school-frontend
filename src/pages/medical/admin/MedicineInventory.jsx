/**
 * Medicine Inventory (Oct 2026) — every medicine the room keeps, with what is
 * usable (in date), what is about to expire and what is past its date but
 * still on the shelf. Open one for its batches, movements and actions.
 */
import React from 'react';
import { Page, PageHead, Btn, Badge, Select, Empty } from '../mdUI';
import { fmtDay, qty } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, useFocusOpen, BoardPanel } from './mdList';

export function stockColumns(kind) {
  return [
    { key: 'name', label: kind === 'medicine' ? 'Medicine' : 'Supply', primary: true, render: (r) => <span className="md-two"><b>{r.name}{r.strength ? ` ${r.strength}` : ''}</b><em>{[r.genericName, r.form, r.category].filter(Boolean).join(' · ')}</em></span>, csv: (r) => `${r.name}${r.strength ? ` ${r.strength}` : ''}` },
    { key: 'usable', label: 'Usable', align: 'right', render: (r) => <b style={{ color: r.usable <= 0 ? '#b91c1c' : r.minStock > 0 && r.usable <= r.minStock ? '#b45309' : undefined }}>{qty(r.usable)} <span className="md-muted" style={{ fontWeight: 400 }}>{r.unit}</span></b>, csv: (r) => r.usable },
    { key: 'minStock', label: 'Minimum', align: 'right', render: (r) => qty(r.minStock) },
    { key: 'nextExpiry', label: 'Next expiry', render: (r) => (r.nextExpiry ? fmtDay(r.nextExpiry) : <span className="md-none">—</span>), csv: (r) => fmtDay(r.nextExpiry) },
    { key: 'flags', label: 'Status', render: (r) => (
      <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {r.isActive === false ? <Badge tone="gray" size="sm">Archived</Badge>
          : r.usable <= 0 ? <Badge tone="red" size="sm">Out of stock</Badge>
            : r.minStock > 0 && r.usable <= r.minStock ? <Badge tone="amber" size="sm">Low</Badge> : <Badge tone="green" size="sm">In stock</Badge>}
        {r.expiring > 0 ? <Badge tone="amber" size="sm">{qty(r.expiring)} expiring</Badge> : null}
        {r.expired > 0 ? <Badge tone="red" size="sm">{qty(r.expired)} expired on shelf</Badge> : null}
        {r.prescriptionOnly ? <Badge tone="violet" size="sm">Plan only</Badge> : null}
      </span>
    ), csv: (r) => (r.usable <= 0 ? 'Out of stock' : r.minStock > 0 && r.usable <= r.minStock ? 'Low' : 'In stock') },
    { key: 'storageLocation', label: 'Kept', render: (r) => r.storageLocation || <span className="md-none">—</span> },
  ];
}

export default function MedicineInventory() {
  const board = useBoard('items', { tab: 'all', kind: 'medicine' });
  const { meta, forms, drawer, elements } = useMedWorkspace(board.reload);
  useFocusOpen(board.focus, React.useCallback((id) => drawer.show('item', id), [drawer]));
  return (
    <Page>
      <PageHead icon="pill" tone="indigo" title="Medicine Inventory" subtitle="Medicines kept in the Medical Room, batch by batch. Stock goes down by itself as doses are given; expiring and expired batches are flagged so nothing past its date is ever given.">
        <Btn kind="primary" icon="plus" onClick={() => forms.open('medicine')}>Add Medicine</Btn>
      </PageHead>
      <BoardPanel board={board} columns={stockColumns('medicine')} noun="medicine" searchPlaceholder="Search name, generic name or category" exportName="medicine-inventory"
        onRow={(r) => drawer.show('item', r._id)} rowClass={(r) => (r.expired > 0 ? 'is-critical' : r.isActive === false ? 'is-off' : '')}
        filters={<Select value={board.q.category} onChange={(v) => board.setQ({ category: v })} all="Any category" label="Category" options={meta?.settings?.medicineCategories || []} />}
        empty={<Empty compact title="No medicines here" action={<Btn kind="primary" icon="plus" onClick={() => forms.open('medicine')}>Add Medicine</Btn>}>Add the medicines the room keeps, with their batches and expiry dates.</Empty>} />
      {elements}
    </Page>
  );
}
