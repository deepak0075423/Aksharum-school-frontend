/**
 * Transport → Activity Log.
 *
 * Every write in the module leaves a row here. It has no mockup of its own, so
 * it is built from the same kit as the rest: filters, a table, a pager, and a
 * rail that says what kind of work has been going on in the window.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import {
  TrHead, TopBar, DayChip, Tiles, Tile, Card, CardHead, CardBody, Panel, Btn, Select, Search, Filters,
  FilterEnd, TableWrap, Cell2, Who, Badge, Pager, Rows, Row, Loading, Empty, Note, count, fmtDate,
  fmtTime, fmtDateTime, ago, words, useBoard, useDebounced, toCsv, saveFile,
} from './trUI';
import { RankBars, seriesColor } from './trCharts';

const RANGES = [
  { value: '7', label: 'Last 7 Days' }, { value: '30', label: 'Last 30 Days' },
  { value: '90', label: 'Last 90 Days' }, { value: '365', label: 'Last 12 Months' },
];

export default function TransportAudit() {
  const [days, setDays] = useState('30');
  const [q, setQ] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actionType, setActionType] = useState('');
  const [user, setUser] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const search = useDebounced(q);

  const { data, loading, error } = useBoard(
    () => api.getActivity({ days, search, entityType, actionType, user, page, limit }),
    [days, search, entityType, actionType, user, page, limit],
  );
  const d = data || {};
  const rows = d.data || [];

  const byEntity = useMemo(() => {
    const m = new Map();
    rows.forEach((r) => m.set(r.entityType, (m.get(r.entityType) || 0) + 1));
    return [...m.entries()].map(([k, v], i) => ({ key: k, label: k, value: v, color: seriesColor(i) }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  const reset = () => { setQ(''); setEntityType(''); setActionType(''); setUser(''); setPage(1); };
  const exportCsv = () => {
    saveFile(`transport-activity-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['at', 'When', (r) => fmtDateTime(r.at)], ['actionType', 'Action'], ['entityType', 'Entity'],
      ['description', 'What happened'], ['by', 'By', (r) => r.by?.name || 'System'],
    ], rows));
    toast.success('Exported the rows on this page');
  };

  if (loading && !data) return <div className="tr-page"><Loading tiles={3} /></div>;
  if (error) return <div className="tr-page"><Note tone="bad" title="Could not load the activity log">{error}</Note></div>;

  return (
    <div className="tr-page">
      <TopBar>
        <DayChip label={`${fmtDate(d.range?.from)} – ${fmtDate(d.range?.to)}`} icon="calendar" />
      </TopBar>

      <TrHead icon="doc" iconTone="slate" title="Activity Log"
              subtitle="Everything anyone has changed in the transport module, newest first.">
        <Btn icon="download" onClick={exportCsv}>Export</Btn>
      </TrHead>

      <Tiles cols="3">
        <Tile icon="doc" tone="indigo" value={count(d.total)} label="Entries in this window" />
        <Tile icon="people" tone="teal" value={count(d.filters?.users?.length)} label="People who made changes" />
        <Tile icon="grid" tone="blue" value={count(d.filters?.entityTypes?.length)} label="Kinds of record touched" />
      </Tiles>

      <Filters>
        <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search the log…" />
        <Select value={entityType} onChange={(v) => { setEntityType(v); setPage(1); }} placeholder="All records"
                options={(d.filters?.entityTypes || []).map((x) => ({ value: x, label: x }))} />
        <Select value={actionType} onChange={(v) => { setActionType(v); setPage(1); }} placeholder="All actions"
                options={(d.filters?.actionTypes || []).map((x) => ({ value: x, label: words(x) }))} />
        <Select value={user} onChange={(v) => { setUser(v); setPage(1); }} placeholder="Anyone" options={d.filters?.users || []} />
        <Select value={days} onChange={(v) => { setDays(v); setPage(1); }} options={RANGES} width={150} />
        <Btn onClick={reset}>Reset</Btn>
        <FilterEnd><Btn icon="upload" onClick={exportCsv}>Export</Btn></FilterEnd>
      </Filters>

      <div className="tr-split">
        <Card>
          <CardHead title={`Activity (${count(d.total)})`} />
          <CardBody flush>
            <TableWrap>
              <table className="tr-table">
                <thead>
                  <tr><th style={{ width: 150 }}>When</th><th>Action</th><th>Record</th><th>What happened</th><th>By</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r._id}>
                      <td><Cell2 top={fmtDate(r.at)} sub={fmtTime(r.at)} /></td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                          <i className={`tr-dot tr-dot--${{ good: 'green', warn: 'amber', bad: 'red', info: 'blue' }[r.tone] || 'blue'}`} />
                          {words(r.actionType)}
                        </span>
                      </td>
                      <td><Badge tone="slate" square>{r.entityType}</Badge></td>
                      <td>{r.description || '—'}</td>
                      <td>{r.by ? <Who name={r.by.name} id={r.by._id} sub={words(r.by.role)} size="sm" /> : <span style={{ color: 'var(--tr-faint)' }}>System</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
            {!rows.length ? <Empty icon="doc" title="Nothing in this window">Widen the date range, or clear the filters.</Empty> : null}
            <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="entries"
                   onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[25, 50, 100]} />
          </CardBody>
        </Card>

        <div className="tr-rail">
          <Panel title="What is being changed" sub="On this page">
            {byEntity.length ? <RankBars nameWidth={94} data={byEntity} /> : <Empty icon="chart" sm title="Nothing to break down" />}
          </Panel>
          <Panel title="Latest" flush>
            {rows.length ? (
              <Rows>
                {rows.slice(0, 6).map((r) => (
                  <Row key={`l-${r._id}`} icon="clock" iconTone={{ good: 'green', warn: 'amber', bad: 'red', info: 'blue' }[r.tone] || 'blue'}
                       title={r.description || words(r.actionType)} sub={r.by?.name || 'System'} endSub={ago(r.at)} />
                ))}
              </Rows>
            ) : <Empty icon="clock" sm title="Nothing recent" />}
          </Panel>
        </div>
      </div>
    </div>
  );
}
