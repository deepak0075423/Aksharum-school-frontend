/**
 * Inventory (Oct 2026) — the Medical Room's stock as a whole: first-aid
 * supplies, medicines, batches by expiry, and every movement (in, used, out,
 * adjusted, written off) with the balance after it. Equipment has its own
 * screen.
 */
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Btn, Status, Empty, Select, Tiles, Tile, Kebab, useLoad } from '../mdUI';
import { BATCH_STATE, MOVE_TYPE, fmtDay, fmtStamp, labelOf, qty } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';
import { useBoard, useFocusOpen, BoardPanel, DateFilter } from './mdList';
import { stockColumns } from './MedicineInventory';

const VIEWS = [
  { key: 'supplies', label: 'First-aid Supplies' },
  { key: 'medicines', label: 'Medicines' },
  { key: 'expiry', label: 'Expiry' },
  { key: 'movements', label: 'Stock Movements' },
];

function Items({ kind, ws }) {
  const board = useBoard('items', { tab: 'all', kind });
  useFocusOpen(board.focus, React.useCallback((id) => ws.drawer.show('item', id), [ws.drawer]));
  return (
    <BoardPanel board={board} columns={stockColumns(kind)} noun={kind === 'medicine' ? 'medicine' : 'supply'} many={kind === 'medicine' ? 'medicines' : 'supplies'}
      searchPlaceholder="Search name or category" exportName={kind === 'medicine' ? 'medicines-stock' : 'first-aid-supplies'}
      onRow={(r) => ws.drawer.show('item', r._id)} rowClass={(r) => (r.expired > 0 ? 'is-critical' : r.isActive === false ? 'is-off' : '')}
      filters={<Select value={board.q.category} onChange={(v) => board.setQ({ category: v })} all="Any category" label="Category" options={(kind === 'medicine' ? ws.meta?.settings?.medicineCategories : ws.meta?.settings?.supplyCategories) || []} />}
      empty={<Empty compact title="Nothing here" action={<Btn kind="primary" size="sm" icon="plus" onClick={() => ws.forms.open(kind)}>{kind === 'medicine' ? 'Add Medicine' : 'Add Supply'}</Btn>}>Add what the room keeps, with an opening stock.</Empty>} />
  );
}

function Expiry({ ws }) {
  const board = useBoard('batches', { tab: 'expiring' });
  return (
    <BoardPanel board={board} noun="batch" many="batches" searchPlaceholder="Search item or batch number" exportName="batches-by-expiry"
      onRow={(r) => ws.drawer.show('item', r.item)} rowClass={(r) => (r.state === 'expired' ? 'is-critical' : '')}
      filters={<Select value={board.q.kind} onChange={(v) => board.setQ({ kind: v })} all="Medicines and supplies" label="Kind" options={[{ value: 'medicine', label: 'Medicines' }, { value: 'supply', label: 'Supplies' }]} />}
      columns={[
        { key: 'name', label: 'Item', primary: true, render: (r) => <span className="md-two"><b>{r.name}{r.strength ? ` ${r.strength}` : ''}</b><em>{r.kind === 'medicine' ? 'Medicine' : 'Supply'}</em></span>, csv: (r) => r.name },
        { key: 'batchNumber', label: 'Batch', render: (r) => r.batchNumber || <span className="md-none">—</span> },
        { key: 'quantity', label: 'Left', align: 'right', render: (r) => `${qty(r.quantity)} ${r.unit}`, csv: (r) => r.quantity },
        { key: 'expiryDate', label: 'Expiry', render: (r) => (r.expiryDate ? <span className="md-two"><b>{fmtDay(r.expiryDate)}</b><em className={r.daysLeft < 0 ? 'is-bad' : r.daysLeft <= 30 ? 'is-warn' : ''}>{r.daysLeft < 0 ? `${-r.daysLeft} days ago` : r.daysLeft === 0 ? 'Today' : `In ${r.daysLeft} days`}</em></span> : '—'), csv: (r) => fmtDay(r.expiryDate) },
        { key: 'state', label: 'State', render: (r) => <Status of="batch" value={r.state} />, csv: (r) => labelOf(BATCH_STATE, r.state) },
        { key: 'acts', label: '', align: 'right', stop: true, render: (r) => (r.status === 'active' && r.quantity > 0 ? (
          <Kebab items={[
            { label: r.state === 'expired' ? 'Write off as expired' : 'Mark expired', icon: 'hourglass', onClick: () => ws.forms.open('writeOff', { batch: r, unit: r.unit, type: 'expired' }) },
            { label: 'Mark damaged', icon: 'alert', onClick: () => ws.forms.open('writeOff', { batch: r, unit: r.unit, type: 'damaged' }) },
            { label: 'Stock count', icon: 'sliders', onClick: () => ws.forms.open('adjust', { batch: r, unit: r.unit }) },
          ]} />
        ) : null) },
      ]}
      empty={<Empty compact title="Nothing in this list">Batches expiring within the alert window, and batches past their date still on the shelf, appear here.</Empty>} />
  );
}

function Movements({ ws }) {
  const board = useBoard('moves', { tab: 'all' });
  return (
    <BoardPanel board={board} noun="movement" searchPlaceholder="Search item, batch, student or reason" exportName="stock-movements"
      onRow={(r) => ws.drawer.show('item', r.item)}
      filters={<><Select value={board.q.kind} onChange={(v) => board.setQ({ kind: v })} all="Medicines and supplies" label="Kind" options={[{ value: 'medicine', label: 'Medicines' }, { value: 'supply', label: 'Supplies' }]} /><DateFilter q={board.q} setQ={board.setQ} /></>}
      columns={[
        { key: 'createdAt', label: 'When', render: (r) => fmtStamp(r.createdAt), csv: (r) => fmtStamp(r.createdAt) },
        { key: 'name', label: 'Item', primary: true, render: (r) => <span className="md-two"><b>{r.name}{r.strength ? ` ${r.strength}` : ''}</b><em>{r.batchNumber ? `Batch ${r.batchNumber}` : ''}</em></span>, csv: (r) => r.name },
        { key: 'type', label: 'Movement', render: (r) => <Status of="move" value={r.type} />, csv: (r) => labelOf(MOVE_TYPE, r.type) },
        { key: 'quantity', label: 'Quantity', align: 'right', render: (r) => <b style={{ color: r.quantity < 0 ? '#b91c1c' : '#15803d' }}>{r.quantity > 0 ? '+' : ''}{qty(r.quantity)} <span className="md-muted" style={{ fontWeight: 400 }}>{r.unit}</span></b>, csv: (r) => r.quantity },
        { key: 'itemBalance', label: 'Balance after', align: 'right', render: (r) => qty(r.itemBalance) },
        { key: 'reason', label: 'For', render: (r) => <span className="md-two"><b>{r.studentName || r.reason || '—'}</b><em>{r.studentName ? r.reason : ''}</em></span>, csv: (r) => [r.studentName, r.reason].filter(Boolean).join(' — ') },
        { key: 'byName', label: 'By' },
      ]}
      empty={<Empty compact title="No movements">Every receipt, dose, first aid, adjustment and write-off is recorded here.</Empty>} />
  );
}

export default function MedicalInventory() {
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.key === params.get('view')) ? params.get('view') : 'supplies';
  const overview = useLoad(() => api.getMedOverview(), 'inv-overview');
  const ws = useMedWorkspace(overview.reload);
  const f = overview.data?.figures;
  return (
    <Page>
      <PageHead icon="package" tone="amber" title="Inventory" subtitle="Medicines, first-aid supplies and their batches — what came in, what was used and on whom, what was written off. Medical equipment is kept on its own screen.">
        <Btn icon="plus" onClick={() => ws.forms.open('supply')}>Add Supply</Btn>
        <Btn kind="primary" icon="plus" onClick={() => ws.forms.open('medicine')}>Add Medicine</Btn>
      </PageHead>
      {f ? (
        <Tiles>
          <Tile tone="indigo" icon="pill" value={f.medicines} label="Medicines" onClick={() => setParams({ view: 'medicines' })} />
          <Tile tone="violet" icon="bandage" value={f.supplies} label="First-aid supplies" onClick={() => setParams({ view: 'supplies' })} />
          <Tile tone={f.lowStock ? 'amber' : 'green'} icon="package" value={f.lowStock} label="Low stock" caption={f.outOfStock ? `${f.outOfStock} out of stock` : 'Nothing out of stock'} />
          <Tile tone={f.expiredItems ? 'red' : 'amber'} icon="hourglass" value={f.expiringItems + f.expiredItems} label="Expiring or expired" caption={`${f.expiredItems} with expired stock on the shelf`} onClick={() => setParams({ view: 'expiry' })} />
        </Tiles>
      ) : null}
      <div className="md-seg-row"><span className="md-seg">{VIEWS.map((v) => <button key={v.key} type="button" className={v.key === view ? 'is-on' : ''} onClick={() => setParams({ view: v.key })}>{v.label}</button>)}</span></div>
      {view === 'supplies' ? <Items key="s" kind="supply" ws={ws} /> : null}
      {view === 'medicines' ? <Items key="m" kind="medicine" ws={ws} /> : null}
      {view === 'expiry' ? <Expiry ws={ws} /> : null}
      {view === 'movements' ? <Movements ws={ws} /> : null}
      {ws.elements}
    </Page>
  );
}
