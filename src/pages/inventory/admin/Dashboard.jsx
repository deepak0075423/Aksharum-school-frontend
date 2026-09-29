/**
 * Inventory → Dashboard.
 *
 * Six figures, three cards and two tables, all from ONE call. Every number is
 * summed at read time from the rows that caused it, so nothing on this screen
 * can disagree with the screen it links to — the donut's "Low Stock 3" is the
 * same three rows the Items screen filters to.
 */
import React, { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Strip, Card, CardHead, CardBody, ViewAll, Btn, KebabMenu,
  DataTable, Rows, Row, Meter, Badge, StatusBadge, ItemCell, Empty, Loading, LoadError,
  Confirm, Mark, Added, Select, useBoard, useInvMeta, count, money, fmtDate, ago, plural,
} from './invUI';
import { Donut, STATE_COLOR } from './invCharts';
import { Art } from './invArt';

/* Which mark and tint the recent-activity list gives each kind of entry. */
const ACT_LOOK = {
  created: ['plus', 'green'], added: ['plus', 'green'], updated: ['package', 'teal'],
  issued: ['arrowRight', 'blue'], returned: ['undo', 'violet'], received: ['cart', 'amber'],
  approved: ['check', 'green'], rejected: ['x', 'red'], deleted: ['x', 'red'],
  cancelled: ['x', 'red'], transferred: ['swap', 'indigo'],
};

export default function InventoryDashboard() {
  const nav = useNavigate();
  const { activeYear } = useInvMeta(api.getFormMeta);
  const [reorder, setReorder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [consumedDays, setConsumedDays] = useState(30);

  const { data, loading, error, reload } = useBoard(
    useCallback(() => api.getOverview({ consumedDays }), [consumedDays]),
    [consumedDays],
  );

  const confirmReorder = async () => {
    setBusy(true);
    try {
      const r = await api.reorderItem({ item: reorder._id, quantity: reorder.suggested });
      toast.success(r?.data?.message || r?.message || 'Reorder request raised');
      setReorder(null);
      reload();
    } catch (e) {
      toast.error(e?.message || 'That reorder could not be raised');
    } finally { setBusy(false); }
  };

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={6} cards={3} /></div>;

  const d = data || {};
  const t = d.tiles || {};
  const donut = d.stockStatus || { total: 0, slices: [] };

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <Hero
        icon="box" kicker="Inventory" title="Inventory Dashboard"
        subtitle="Track stock levels, manage procurement, monitor usage and ensure every department has what it needs."
        art={<Art name="dashboard" />}
        pill="Manage your school's supplies, assets and equipment efficiently."
      />

      <Tiles cols={6}>
        <Tile
          icon="package" tone="brown" value={count(t.totalItems?.value)} label="Total Items"
          delta={t.totalItems?.delta} deltaNote="from last month"
          to="/admin/inventory/items"
        />
        <Tile
          icon="rupee" tone="green" value={money(t.stockValue?.value)} label="Total Stock Value"
          delta={t.stockValue?.delta} deltaNote="from last month"
          to="/admin/inventory/stock" small
        />
        <Tile
          icon="doc" tone="blue" value={count(t.pendingRequests?.value)} label="Pending Requests"
          foot={<><Added value={t.pendingRequests?.added} /><span className="inv-tile__note">from last week</span></>}
          to="/admin/inventory/requests"
        />
        <Tile
          icon="alert" tone="red" value={count(t.lowStock?.value)} label="Low Stock Items"
          foot={<><Added value={t.lowStock?.added} tone={t.lowStock?.added > 0 ? 'down' : 'up'} /><span className="inv-tile__note">needs reordering</span></>}
          to="/admin/inventory/items?state=low_stock"
        />
        <Tile
          icon="hourglass" tone="amber" value={count(t.expiringSoon?.value)} label="Items Expiring Soon"
          note="within 30 days"
        />
        <Tile
          icon="warehouse" tone="sky" value={count(t.warehouses?.value)} label="Active Warehouses"
          note={t.warehouses?.total > t.warehouses?.value ? `of ${count(t.warehouses?.total)} stores` : null}
          to="/admin/inventory/warehouses"
        />
      </Tiles>

      <Strip cols={3}>
        {/* ── Stock status ─────────────────────────────────────────────── */}
        <Card>
          <CardHead
            icon="boxes" iconTone="brown" title="Stock Status"
            right={<ViewAll to="/admin/inventory/stock">View Details</ViewAll>}
          />
          <CardBody>
            {donut.total ? (
              <Donut
                slices={donut.slices}
                total={donut.total}
                unit="Items"
                colorOf={(s) => STATE_COLOR[s.key]}
                onPick={(s) => nav(`/admin/inventory/items?state=${s.key}`)}
              />
            ) : (
              <Empty icon="boxes" title="No items yet" sm
                action={<Btn kind="primary" icon="plus" onClick={() => nav('/admin/inventory/items')}>Add your first item</Btn>}>
                Add items to the master and their stock status appears here.
              </Empty>
            )}
          </CardBody>
        </Card>

        {/* ── Recent activity ──────────────────────────────────────────── */}
        <Card>
          <CardHead
            title="Recent Inventory Activity"
            right={<ViewAll to="/admin/inventory/audit">View All</ViewAll>}
          />
          <CardBody tight>
            {d.activity?.length ? (
              <Rows>
                {d.activity.map((a) => {
                  const [icon, tone] = ACT_LOOK[a.verb] || ['package', 'slate'];
                  return (
                    <Row
                      key={a._id}
                      avatar={<Mark name={icon} tone={tone} size={36} glyph={17} />}
                      title={a.title}
                      sub={[a.module, a.sub].filter(Boolean).join(' · ')}
                      endSub={ago(a.at)}
                    />
                  );
                })}
              </Rows>
            ) : <Empty icon="history" title="Nothing logged yet" sm>Every change to stock, orders and assets will be listed here.</Empty>}
          </CardBody>
        </Card>

        {/* ── Top consumed ─────────────────────────────────────────────── */}
        <Card>
          <CardHead
            icon="hourglass" iconTone="amber" title="Top Consumed Items"
            right={(
              <Select
                value={String(consumedDays)} onChange={(v) => setConsumedDays(Number(v))}
                options={[{ value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '180', label: '6 months' }]}
                style={{ height: 32, fontSize: '.78rem', minWidth: 104 }}
                aria-label="How far back to look"
              />
            )}
          />
          <CardBody tight>
            {d.topConsumed?.length ? (
              <div>
                {d.topConsumed.map((it, i) => (
                  <Meter
                    key={it._id}
                    image={it.image}
                    icon={it.category?.icon || 'box'}
                    iconTone={['indigo', 'blue', 'rose', 'amber', 'teal'][i % 5]}
                    name={it.name}
                    value={it.consumed}
                    max={d.topConsumedMax || 1}
                  />
                ))}
              </div>
            ) : <Empty icon="chart" title="Nothing issued in this window" sm>Issue stock to staff or classes and the heaviest users appear here.</Empty>}
          </CardBody>
        </Card>
      </Strip>

      <Strip variant="11">
        {/* ── Low stock ────────────────────────────────────────────────── */}
        <Card>
          <CardHead
            icon="alert" iconTone="red" title="Low Stock Items"
            right={<ViewAll to="/admin/inventory/items?state=low_stock">View All</ViewAll>}
          />
          <DataTable
            className="inv-table--dense"
            rows={d.lowStock || []}
            columns={[
              {
                key: 'name', label: 'Item', primary: true,
                cell: (r) => <ItemCell image={r.image} icon={r.category?.icon || 'box'} name={r.name} sub={r.category?.name} />,
              },
              { key: 'itemCode', label: 'Code', nowrap: true, cell: (r) => <span className="inv-num">{r.itemCode}</span> },
              { key: 'current', label: 'Current Stock', align: 'num', cell: (r) => <span className="inv-strong">{count(r.current)}</span> },
              { key: 'reorderLevel', label: 'Reorder Level', align: 'num', cell: (r) => count(r.reorderLevel) },
              { key: 'state', label: 'Status', cell: (r) => <StatusBadge value="low_stock" noIcon /> },
            ]}
            actions={(r) => (
              <>
                <Btn kind="soft" size="xs" onClick={() => setReorder(r)}>Reorder</Btn>
                <KebabMenu items={[
                  { label: 'View item', icon: 'eye', onClick: () => nav(`/admin/inventory/items?search=${encodeURIComponent(r.itemCode)}`) },
                  { label: 'Adjust stock', icon: 'sliders', onClick: () => nav(`/admin/inventory/stock?search=${encodeURIComponent(r.itemCode)}`) },
                ]} />
              </>
            )}
            empty={<Empty icon="check" title="Nothing is running low" sm>Every tracked item is above its reorder level.</Empty>}
          />
        </Card>

        {/* ── Expiring ─────────────────────────────────────────────────── */}
        <Card>
          <CardHead
            icon="hourglass" iconTone="amber" title="Upcoming Expiry Items"
            right={<ViewAll to="/admin/inventory/stock">View All</ViewAll>}
          />
          <DataTable
            className="inv-table--dense"
            rows={d.expiring || []}
            columns={[
              {
                key: 'name', label: 'Item', primary: true,
                cell: (r) => <ItemCell image={r.image} icon="medical" tone="rose" name={r.name} sub={r.batchNumber ? `Batch ${r.batchNumber}` : null} />,
              },
              { key: 'itemCode', label: 'Code', nowrap: true },
              { key: 'expiryDate', label: 'Expiry Date', nowrap: true, cell: (r) => fmtDate(r.expiryDate) },
              {
                key: 'daysLeft', label: 'Days Left', align: 'num',
                cell: (r) => <span className={r.daysLeft <= 14 ? 'inv-danger' : 'inv-strong'}>{count(r.daysLeft)}</span>,
              },
              { key: 'state', label: 'Status', cell: (r) => <StatusBadge value={r.state} noIcon /> },
            ]}
            actions={(r) => (
              <>
                <Btn kind="ghost" size="xs" onClick={() => nav(`/admin/inventory/stock?search=${encodeURIComponent(r.itemCode)}`)}>View</Btn>
                <KebabMenu items={[
                  { label: 'Adjust stock', icon: 'sliders', onClick: () => nav(`/admin/inventory/stock?search=${encodeURIComponent(r.itemCode)}`) },
                  { label: 'Write off batch', icon: 'trash', danger: true, onClick: () => nav(`/admin/inventory/stock?search=${encodeURIComponent(r.itemCode)}`) },
                ]} />
              </>
            )}
            empty={<Empty icon="check" title="Nothing expiring" sm>No batch has an expiry date inside the next 30 days.</Empty>}
          />
        </Card>
      </Strip>

      <Confirm
        open={!!reorder} onClose={() => setReorder(null)} onConfirm={confirmReorder} busy={busy}
        icon="package" confirmLabel="Raise request"
        title={reorder ? `Reorder ${reorder.name}?` : ''}
        message={reorder
          ? `${count(reorder.current)} ${reorder.unit || 'units'} left against a reorder level of ${count(reorder.reorderLevel)}. This raises a purchase request for ${plural(reorder.suggested, reorder.unit || 'unit')} for approval — it does not order anything yet.`
          : ''}
      />
    </div>
  );
}
