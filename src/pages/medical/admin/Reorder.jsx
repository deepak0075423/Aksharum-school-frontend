/**
 * Reorder & Costs (Oct 2026) — what to buy before it runs out: items at or
 * below their minimum, or that will run out within a month at the pace of
 * the last 30 days, with how many to order and what it should cost. With the
 * Inventory module on, the list becomes a purchase request in one step.
 * Below: what the Medical Room used, bought and threw away, month by month.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Empty, Spin, LoadError, Note, Segmented, useLoad } from '../mdUI';
import { qty, errorText, money } from '../mdMeta';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m) => { const [y, mo] = String(m).split('-'); return `${MONTH[Number(mo) - 1]} ${y.slice(2)}`; };

export default function MedicalReorder() {
  const [days, setDays] = useState('30');
  const list = useLoad(() => api.getReorder({ days }), days);
  const cost = useLoad(() => api.getMedCosts({ months: 12 }), 'costs');
  const [chosen, setChosen] = useState({});      // item → quantity
  const [busy, setBusy] = useState(false);
  const [raised, setRaised] = useState(null);
  const rows = useMemo(() => list.data?.rows || [], [list.data]);
  useEffect(() => { setChosen(Object.fromEntries(rows.map((r) => [r._id, r.suggested]))); }, [rows]);
  const lines = rows.filter((r) => chosen[r._id] > 0);
  const total = lines.reduce((t, r) => t + (r.lastCost ? r.lastCost * chosen[r._id] : 0), 0);
  const raise = async () => {
    setBusy(true);
    try {
      const r = await api.raiseReorderRequest({ lines: lines.map((x) => ({ item: x._id, quantity: chosen[x._id] })), priority: rows.some((x) => x.usable <= 0) ? 'high' : 'normal' });
      setRaised(r?.data ?? r);
      toast.success('Purchase request raised');
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const copy = () => {
    const text = lines.map((x) => `${chosen[x._id]} × ${x.name}${x.strength ? ` ${x.strength}` : ''} (${x.unit || 'units'})`).join('\n');
    navigator.clipboard?.writeText(text).then(() => toast.success('Copied the list')).catch(() => toast.error('Could not copy'));
  };
  const months = cost.data?.months || [];
  const peak = Math.max(1, ...months.map((m) => Math.max(m.used, m.bought)));
  return (
    <Page>
      <PageHead icon="package" tone="amber" title="Reorder & Costs" subtitle="What to buy before it runs out — items at or below their minimum, or that will run out at the pace they are used — and what the Medical Room used, bought and threw away, month by month.">
        <Segmented value={days} onChange={setDays} label="Looking ahead" options={[{ value: '14', label: '2 weeks' }, { value: '30', label: '1 month' }, { value: '60', label: '2 months' }]} />
      </PageHead>
      {raised ? <Note tone="green" icon="checkCircle">Purchase request <b>{raised.requestNumber}</b> raised (est. {money(raised.estimatedTotal)}) — it is with the school&rsquo;s Inventory approvers.</Note> : null}
      <Panel title="To order" icon="package" tone="amber" pad={false}
        right={lines.length ? <span className="md-acts">
          <Btn size="sm" onClick={copy}>Copy the list</Btn>
          {list.data?.inventory && !raised ? <Btn size="sm" kind="primary" busy={busy} onClick={raise}>Raise a purchase request</Btn> : null}
        </span> : null}>
        {list.error && !list.data ? <LoadError error={list.error} onRetry={list.reload} /> : !list.data ? <Spin /> : rows.length ? (
          <div className="mdc-readings" style={{ border: 0, borderRadius: 0 }}>
            <table>
              <thead><tr><th>Item</th><th>Usable now</th><th>Used in 30 days</th><th>Why</th><th>Order</th><th>Estimate</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <td><b>{r.name}{r.strength ? ` ${r.strength}` : ''}</b><em>{r.kind === 'medicine' ? r.category || 'Medicine' : 'Supply'}{r.supplier ? ` · ${r.supplier}` : ''}</em></td>
                    <td className={r.usable <= 0 ? 'is-critical' : r.low ? 'is-warning' : ''}>{qty(r.usable)} {r.unit}</td>
                    <td>{qty(r.used30)}</td>
                    <td className="mdc-readings__note">{r.why}</td>
                    <td><input className="md-input" style={{ width: 90 }} type="number" min="0" value={chosen[r._id] ?? ''} aria-label={`How many ${r.name}`}
                      onChange={(e) => setChosen((c) => ({ ...c, [r._id]: Math.max(0, Math.round(Number(e.target.value) || 0)) }))} /></td>
                    <td>{r.lastCost ? money(r.lastCost * (chosen[r._id] || 0)) : <span className="md-muted">no price yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="md-muted" style={{ padding: '10px 14px', margin: 0 }}>
              {lines.length} item{lines.length === 1 ? '' : 's'} · estimated {money(total)}
              {!list.data.inventory ? ' · The Inventory module is not on for this school: copy the list and order the usual way.' : ''}
            </p>
          </div>
        ) : <div style={{ padding: 16 }}><Empty compact title="Nothing to order">No item is at its minimum or will run out in this time at the pace it is used.</Empty></div>}
      </Panel>
      <Panel title="Costs" icon="chart" tone="indigo" pad>
        {cost.loading && !cost.data ? <Spin /> : months.length ? (
          <>
            <div className="mdco-chart" role="img" aria-label="Used and bought, month by month">
              {months.map((m) => (
                <div key={m.month} className="mdco-col" title={`${monthLabel(m.month)} — used ${money(m.used)}, bought ${money(m.bought)}${m.wasted ? `, thrown away ${money(m.wasted)}` : ''}`}>
                  <div className="mdco-bars">
                    <i className="is-used" style={{ height: `${Math.round((m.used / peak) * 100)}%` }} />
                    <i className="is-bought" style={{ height: `${Math.round((m.bought / peak) * 100)}%` }} />
                  </div>
                  <span>{monthLabel(m.month)}</span>
                </div>
              ))}
            </div>
            <div className="mdco-key"><span className="is-used">Used</span><span className="is-bought">Bought</span></div>
            <div className="mdpl-figs" style={{ marginTop: 10 }}>
              <span>This month: used <b>{money(months[months.length - 1]?.used || 0)}</b></span>
              <span>bought <b>{money(months[months.length - 1]?.bought || 0)}</b></span>
              {months[months.length - 1]?.wasted ? <Badge tone="red" size="sm">thrown away {money(months[months.length - 1].wasted)}</Badge> : null}
            </div>
            {(cost.data.top || []).length ? (
              <>
                <h4 className="mdp-h" style={{ marginTop: 14 }}>Most used this month</h4>
                <ul className="mdd-list">{cost.data.top.map((t) => <li key={t.name}><div><b>{t.name}{t.strength ? ` ${t.strength}` : ''}</b><em>{qty(t.quantity)} {t.unit}</em></div><span>{money(t.value)}</span></li>)}</ul>
              </>
            ) : null}
          </>
        ) : <Empty compact title="No figures yet">Costs appear as stock with a price per unit is used and received.</Empty>}
      </Panel>
    </Page>
  );
}
