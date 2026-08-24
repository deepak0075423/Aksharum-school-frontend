import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getDashboard } from '../../../api/inventory.api';
import { PageHeader, StatCard, Spinner, Badge } from '../../../components/ui/index';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmt = (n) => `₹${(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const TX_LABEL = {
  purchase: 'Stock In', issue: 'Issue', return: 'Return', transfer_in: 'Transfer In',
  transfer_out: 'Transfer Out', damage: 'Damage', repair: 'Repair', scrap: 'Scrap',
  adjustment: 'Adjustment', audit: 'Audit',
};
const TX_COLOR = {
  purchase: 'success', return: 'success', transfer_in: 'info', issue: 'warning',
  transfer_out: 'warning', damage: 'danger', scrap: 'danger', adjustment: 'muted', audit: 'muted',
};

export default function InventoryDashboard() {
  const { data, loading } = useFetch(getDashboard);
  if (loading) return <div className="loading-page"><Spinner /></div>;
  const d = data || {};

  const trends = d.monthlyTrends || [];
  const maxTrend = Math.max(1, ...trends.map(t => t.total));

  return (
    <div className="page">
      <PageHeader title="Inventory Dashboard" subtitle="Real-time overview of stock, procurement & assets" />

      {/* Primary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 16, marginBottom: 16 }}>
        <StatCard label="Inventory Items"   value={d.totalItems || 0}   icon="📦" color="blue" />
        <StatCard label="Tracked Assets"    value={d.totalAssets || 0}  icon="💻" color="purple" />
        <StatCard label="Stock Value"       value={fmt(d.stockValue)}   icon="💰" color="green" />
        <StatCard label="Vendors"           value={d.totalVendors || 0} icon="🏭" color="orange" />
      </div>

      {/* Procurement / alert stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 12, marginBottom: 20 }}>
        <MiniStat to="/admin/inventory/requests" icon="📝" label="Pending Requests" value={d.pendingRequests || 0} />
        <MiniStat to="/admin/inventory/orders"   icon="🧾" label="Open POs"          value={d.pendingPOs || 0} />
        <MiniStat to="/admin/inventory/stock?lowOnly=true" icon="⚠️" label="Low Stock" value={d.lowStockCount || 0} tone={d.lowStockCount ? 'danger' : ''} />
        <MiniStat to="/admin/inventory/stock"    icon="🚫" label="Out of Stock" value={d.outOfStockCount || 0} tone={d.outOfStockCount ? 'danger' : ''} />
        <MiniStat to="/admin/inventory/stock"    icon="⏳" label="Expiring Soon" value={d.expiringCount || 0} />
        <MiniStat to="/admin/inventory/assets?status=under_repair" icon="🛠" label="Under Repair" value={d.itemsUnderRepair || 0} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
        {/* AI recommendations */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">🤖 AI Recommendations</h3></div>
          <div className="card-body">
            {(d.aiRecommendations || []).length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>Stock levels look healthy — no reorder suggestions right now.</div>
              : (d.aiRecommendations).map(r => (
                <div key={r.item} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{r.name}</div>
                    <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>On hand {r.current} / reorder {r.reorderLevel}</div>
                  </div>
                  <Badge variant="warning">Order {r.suggestedQty}</Badge>
                </div>
              ))}
          </div>
        </div>

        {/* Department budgets */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">💼 Department Budgets</h3></div>
          <div className="card-body">
            {(d.departmentBudgets || []).length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>No departments configured yet.</div>
              : d.departmentBudgets.map(b => (
                <div key={b._id} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.82rem', marginBottom: 4 }}>
                    <span style={{ fontWeight: 600 }}>{b.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{fmt(b.usedBudget)} / {fmt(b.annualBudget)}</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, b.utilization)}%`, height: '100%', background: b.utilization >= 90 ? 'var(--danger,#ef4444)' : b.utilization >= 70 ? 'var(--warning,#f59e0b)' : 'var(--success,#22c55e)' }} />
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Monthly purchase trend */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">📈 Monthly Purchases</h3></div>
          <div className="card-body">
            {trends.length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>No purchase orders yet.</div>
              : (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140 }}>
                  {trends.map((t, i) => (
                    <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{fmt(t.total)}</div>
                      <div title={fmt(t.total)} style={{ width: '70%', height: `${(t.total / maxTrend) * 100}%`, minHeight: 4, background: 'var(--primary)', borderRadius: '4px 4px 0 0' }} />
                      <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{MONTHS[t.month - 1]}</div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* Top consumed */}
        <div className="card">
          <div className="card-header"><h3 className="card-title">🔥 Top Consumed Items</h3></div>
          <div className="card-body">
            {(d.topConsumed || []).length === 0
              ? <div style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>No issue activity yet.</div>
              : d.topConsumed.map((c, i) => (
                <div key={c._id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '.85rem' }}>
                  <span>{i + 1}. {c.name}</span>
                  <strong>{c.consumed}</strong>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Recent transactions */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h3 className="card-title">Recent Stock Transactions</h3></div>
        <div className="card-body" style={{ padding: 0 }}>
          {(d.recentTransactions || []).length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No transactions yet.</div>
          ) : (
            <table className="table" style={{ width: '100%' }}>
              <thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>Balance</th><th>Warehouse</th><th>By</th><th>When</th></tr></thead>
              <tbody>
                {d.recentTransactions.map(t => (
                  <tr key={t._id} data-focus-id={t._id}>
                    <td>{t.item?.name || '—'}</td>
                    <td><Badge variant={TX_COLOR[t.type] || 'muted'}>{TX_LABEL[t.type] || t.type}</Badge></td>
                    <td style={{ color: t.quantity < 0 ? 'var(--danger,#ef4444)' : 'var(--success,#22c55e)' }}>{t.quantity > 0 ? '+' : ''}{t.quantity}</td>
                    <td>{t.balanceAfter}</td>
                    <td>{t.warehouse?.name || '—'}</td>
                    <td>{t.performedBy?.name || '—'}</td>
                    <td style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{new Date(t.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ to, icon, label, value, tone }) {
  return (
    <Link to={to} style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
      border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      textDecoration: 'none', color: 'var(--text)', background: 'var(--bg-primary)',
    }}>
      <span style={{ fontSize: '1.3rem' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: tone === 'danger' && value > 0 ? 'var(--danger,#ef4444)' : 'inherit' }}>{value}</div>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{label}</div>
      </div>
    </Link>
  );
}
