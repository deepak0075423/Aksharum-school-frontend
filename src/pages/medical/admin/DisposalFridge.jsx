/**
 * Disposal & Fridge (Oct 2026).
 *
 * The disposal register: medicine taken out of use (expired, damaged) waits
 * here until someone records how it finally went — returned to a pharmacy,
 * incinerated, the sharps bin — with a witness for a controlled medicine.
 *
 * The fridge log: vaccines and insulin keep at 2–8 °C. A reading a school day;
 * one out of range says what was done, and the medical staff are told at once.
 */
import React, { useState } from 'react';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Empty, Spin, LoadError, Note, LineTabs, useLoad } from '../mdUI';
import { DISPOSAL_METHOD, fmtStamp, qty, labelOf } from '../mdMeta';
import { useMedWorkspace } from './mdDrawers';

const REASON = { expired: 'Expired', damaged: 'Damaged', recalled: 'Recalled', other: 'Other' };

export default function MedicalDisposalFridge() {
  const [tab, setTab] = useState('awaiting');
  const reg = useLoad(() => api.getDisposals({ status: tab }), tab);
  const fridge = useLoad(() => api.getFridge({ days: 30 }), 'fridge');
  const reload = () => { reg.reload(); fridge.reload(); };
  const { forms, elements } = useMedWorkspace(reload);
  const rows = reg.data?.rows || [];
  const logs = fridge.data?.rows || [];
  return (
    <Page>
      <PageHead icon="trash" tone="slate" title="Disposal & Fridge" subtitle="The register of medicine taken out of use and how it finally went, and the medicine fridge's daily temperature.">
        <Btn kind="primary" icon="thermometer" onClick={() => forms.open('fridge')}>Log the fridge</Btn>
      </PageHead>
      {fridge.data && !fridge.data.loggedToday ? <Note tone="amber" icon="thermometer" action={<Btn size="sm" kind="primary" onClick={() => forms.open('fridge')}>Log it now</Btn>}>The fridge has not been read today.</Note> : null}
      <Panel pad={false}>
        <div className="md-listhead">
          <LineTabs items={[{ key: 'awaiting', label: 'Waiting to be disposed of', count: reg.data?.counts?.awaiting }, { key: 'disposed', label: 'Disposed of', count: reg.data?.counts?.disposed }, { key: 'all', label: 'All' }]} value={tab} onChange={setTab} />
        </div>
        <div className="md-panel__body">
          {reg.error && !reg.data ? <LoadError error={reg.error} onRetry={reg.reload} /> : !reg.data ? <Spin /> : rows.length ? (
            <ul className="mdd-list">
              {rows.map((d) => (
                <li key={d._id}>
                  <div><b>{qty(d.quantity)} {d.unit} {d.itemName}</b>
                    <em>{[d.batchNumber && `batch ${d.batchNumber}`, labelOf(REASON, d.reason), d.note, `written off ${fmtStamp(d.createdAt)}${d.createdByName ? ` by ${d.createdByName}` : ''}`].filter(Boolean).join(' · ')}</em>
                    {d.status === 'disposed' ? <em>{DISPOSAL_METHOD[d.method] || d.method}{d.reference ? ` · ref ${d.reference}` : ''} · {fmtStamp(d.disposedAt)} by {d.disposedByName}{d.witnessName ? `, witnessed by ${d.witnessName}` : ''}</em> : null}
                  </div>
                  {d.status === 'disposed' ? <Badge tone="green" size="sm">Disposed of</Badge> : <Btn size="sm" kind="primary" onClick={() => forms.open('dispose', { disposal: d })}>Record disposal</Btn>}
                </li>
              ))}
            </ul>
          ) : <Empty compact title={tab === 'awaiting' ? 'Nothing waiting' : 'Nothing here'}>Writing off an expired or damaged batch puts it here until it is disposed of.</Empty>}
        </div>
      </Panel>
      <Panel title="Fridge temperature" sub={`Last 30 days · keep at ${fridge.data?.range?.min ?? 2}–${fridge.data?.range?.max ?? 8} °C`} icon="thermometer" tone="blue" pad>
        {fridge.loading && !fridge.data ? <Spin /> : logs.length ? (
          <div className="mdc-readings">
            <table>
              <thead><tr><th>When</th><th>Fridge</th><th>Now</th><th>Min</th><th>Max</th><th>By</th><th>Note</th></tr></thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l._id}>
                    <td><b>{fmtStamp(l.at)}</b></td>
                    <td>{l.fridge}</td>
                    <td className={l.current < 2 || l.current > 8 ? 'is-critical' : ''}>{l.current} °C</td>
                    <td className={l.min != null && l.min < 2 ? 'is-critical' : ''}>{l.min ?? '—'}</td>
                    <td className={l.max != null && l.max > 8 ? 'is-critical' : ''}>{l.max ?? '—'}</td>
                    <td>{l.byName}</td>
                    <td className="mdc-readings__note">{l.outOfRange ? <><Badge tone="red" size="sm">Out of range</Badge> {l.action}</> : l.reset ? 'Min/max reset' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <Empty compact title="No readings yet" action={<Btn icon="thermometer" onClick={() => forms.open('fridge')}>Log the first reading</Btn>}>Read the fridge thermometer once a school day.</Empty>}
      </Panel>
      {elements}
    </Page>
  );
}
