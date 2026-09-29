/**
 * Inventory → Activity Log.
 *
 * The audit trail. Entries are written, never edited or deleted, and each one
 * now carries the IP it came from and the human code of the record it touched
 * — a log that can only say "a purchase order changed" is not an audit trail.
 *
 * The five figures describe the WHOLE log, not the filtered view: a "total
 * activities" that moved when you typed in the search box would be describing
 * the search, not the school.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  Hero, YearBar, Tiles, Tile, Card, SplitView, Rail, Filters, FilterEnd, Field, Search, Select,
  DateRange, Btn, IconBtn, KebabMenu, DataTable, Pager, Badge, StatusBadge, Who, Block, Facts,
  Fact, Lines, Line, Empty, Loading, LoadError, SkeletonRows, useBoard, useDebounced, useInvMeta,
  useSort, count, money, fmtDate, fmtClock, fmtDateTime, words,
  saveFile, Cell2, MODULE_TONE,
} from './invUI';
import { Art } from './invArt';

export default function InventoryAudit() {
  const { activeYear } = useInvMeta(api.getFormMeta);

  const [q, setQ] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [user, setUser] = useState('');
  const [entityType, setEntityType] = useState('');
  const [critical, setCritical] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const { sort, dir, onSort } = useSort('at', 'desc');
  const search = useDebounced(q);

  const [detail, setDetail] = useState(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const params = useMemo(() => ({
    search, module, action, user, entityType, critical,
    from: range.from, to: range.to, page, limit,
  }), [search, module, action, user, entityType, critical, range.from, range.to, page, limit]);

  const load = useCallback(() => api.getActivityBoard(params), [params]);
  const { data, loading, error, reload } = useBoard(load, [params]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    if (!picked) { setDetail(null); return undefined; }
    let alive = true;
    setDetailBusy(true);
    api.getActivityDetail(picked)
      .then((r) => { if (alive) setDetail(r?.data ?? r); })
      .catch((e) => { if (alive) { toast.error(e?.message || 'That entry could not be loaded'); setPicked(null); } })
      .finally(() => { if (alive) setDetailBusy(false); });
    return () => { alive = false; };
  }, [picked]);

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => {
    setQ(''); setModule(''); setAction(''); setUser(''); setEntityType(''); setCritical('');
    setRange({ from: '', to: '' }); setPage(1);
  };
  const filtered = !!(search || module || action || user || entityType || critical || range.from || range.to);

  // Exported server-side: the CSV is every matching line, not just this page.
  const exportLogs = async () => {
    setExporting(true);
    try {
      const blob = await api.exportActivity(params);
      saveFile(`inventory-activity-${new Date().toISOString().slice(0, 10)}.csv`, blob);
      toast.success('Every matching activity exported');
    } catch (e) { toast.error(e?.message || 'The log could not be exported'); }
    finally { setExporting(false); }
  };

  const columns = useMemo(() => [
    {
      key: 'at', label: 'Date & Time', sortable: true, nowrap: true,
      cell: (r) => <Cell2 top={fmtDate(r.at)} sub={fmtClock(r.at)} />,
    },
    {
      key: 'by', label: 'User',
      cell: (r) => <Who name={r.by?.name} src={r.by?.photo} id={r.by?._id} size="sm" />,
    },
    { key: 'verb', label: 'Action', cell: (r) => <StatusBadge value={r.verb} square noIcon /> },
    {
      key: 'module', label: 'Module', secondary: true,
      cell: (r) => <Badge tone={MODULE_TONE[r.module] || 'slate'} square>{r.module}</Badge>,
    },
    {
      key: 'description', label: 'Description', primary: true,
      cell: (r) => <span className="inv-clamp2">{r.description}</span>,
    },
    {
      key: 'referenceCode', label: 'Reference', nowrap: true,
      cell: (r) => (r.referenceCode
        ? <span className="inv-num" style={{ color: 'var(--inv-primary)', fontWeight: 600 }}>{r.referenceCode}</span>
        : <span className="inv-dim">—</span>),
    },
    {
      key: 'details', label: 'Details', align: 'mid', secondary: true,
      cell: (r) => <IconBtn icon="fileDoc" kind="bare" label="Open the full entry" onClick={() => setPicked(r._id)} />,
    },
    {
      key: 'ip', label: 'IP Address', nowrap: true, secondary: true,
      cell: (r) => (r.ip ? <span className="inv-num inv-dim">{r.ip}</span> : <span className="inv-dim">Not recorded</span>),
    },
  ], []);

  const e = detail?.entry;
  const target = detail?.target;

  const rail = picked ? (
    <Rail
      title="Activity Details" onClose={() => setPicked(null)}
      foot={e ? (
        <>
          {target ? (
            <Btn kind="primary" icon="externalLink"
              onClick={() => toast(`${target.code || target.label} — open its own screen from the module's tab.`, { icon: 'ℹ️' })}>
              View {e.module}
            </Btn>
          ) : null}
          <Btn icon="user" onClick={() => { setUser(e.by?._id || ''); setPage(1); setPicked(null); }}>View User Activity</Btn>
        </>
      ) : null}
    >
      {detailBusy && !detail ? <SkeletonRows rows={6} /> : !e ? null : (
        <>
          <Block>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
              <StatusBadge value={e.verb} square noIcon />
              <span style={{ fontSize: '.8rem', color: 'var(--inv-muted)', marginLeft: 'auto' }}>{fmtDateTime(e.at)}</span>
            </div>
            <Who name={e.by?.name} sub={e.by?.email} src={e.by?.photo} id={e.by?._id} size="lg" />
            {e.ip ? <div style={{ marginTop: 8, fontSize: '.78rem', color: 'var(--inv-muted)' }}>IP: {e.ip}</div> : null}
          </Block>

          <Block>
            <Facts>
              <Fact k="Action" v={words(e.actionType)} />
              <Fact k="Module" v={<Badge tone={MODULE_TONE[e.module] || 'slate'} square>{e.module}</Badge>} />
              <Fact k="Reference" v={e.referenceCode || '—'} />
              <Fact k="Description" v={e.description} />
              {e.critical ? <Fact k="Flagged" v={<Badge tone="red" icon="alert">Critical change</Badge>} /> : null}
            </Facts>
          </Block>

          {target ? (
            <Block title="Additional Information">
              <Facts>
                <Fact k="Record" v={target.label || target.code} />
                {target.code ? <Fact k="Code" v={target.code} /> : null}
                {target.itemCount ? <Fact k="Items" v={`${count(target.itemCount)} items`} /> : null}
                {target.total ? <Fact k="Total Value" v={money(target.total)} /> : null}
                {target.status ? <Fact k="Status" v={<StatusBadge value={target.status} noIcon />} /> : null}
                <Fact k="Created By" v={e.by?.name} />
                <Fact k="Created At" v={fmtDateTime(target.createdAt)} />
              </Facts>
            </Block>
          ) : (
            <Block title="Additional Information">
              <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--inv-muted)', lineHeight: 1.6 }}>
                {e.entityId
                  ? 'The record this entry describes is no longer there. A log entry outlives what it describes — that is the point of it.'
                  : 'This entry was written without a link to the record it describes, so there is nothing more to show.'}
              </p>
            </Block>
          )}

          {e.meta && Object.keys(e.meta).length ? (
            <Block title="What was recorded">
              <Lines>
                {Object.entries(e.meta).map(([k, v]) => (
                  <Line key={k} icon="listDots">
                    <strong>{words(k)}:</strong>{' '}
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </Line>
                ))}
              </Lines>
            </Block>
          ) : null}
        </>
      )}
    </Rail>
  ) : null;

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={5} /></div>;

  return (
    <div className="inv-page">
      <YearBar year={activeYear} />

      <Hero
        icon="history" tone="violet" title="Activity Log"
        subtitle="Track all inventory activities, changes and user actions across the system with complete audit trail."
        art={<Art name="activity" />}
        promises={['Complete audit trail of all activities', 'Track who did what and when', 'Filter by module, user, date and action', 'View detailed change history']}
      >
        <Btn kind="primary" icon="download" onClick={exportLogs} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export Logs'}
        </Btn>
      </Hero>

      <Tiles cols={5}>
        <Tile icon="doc" tone="indigo" value={count(t.total?.value)} label="Total Activities"
          delta={t.total?.delta} deltaNote="from last month" spark={t.total?.series} sparkKind="bar" sparkTone="indigo" />
        <Tile icon="user" tone="green" value={count(t.users?.value)} label="Active Users"
          delta={t.users?.added} deltaNote="this month" spark={t.total?.series} sparkKind="bar" sparkTone="green" />
        <Tile icon="boxes" tone="amber" value={count(t.modules?.value)} label="Modules"
          note="Inventory related" />
        <Tile icon="clock" tone="violet" value={count(t.today?.value)} label="Today" small
          delta={t.today?.delta} deltaNote="from yesterday" note={`${count(t.today?.value)} activities`} />
        <Tile icon="alert" tone="red" value={count(t.critical?.value)} label="Critical Changes"
          note="Require attention" onClick={() => setFilter(setCritical)('true')} />
      </Tiles>

      <SplitView rail={rail}>
        <Card>
          <Filters inner>
            <Field pick>
              <DateRange from={range.from} to={range.to} onChange={(r) => { setRange(r); setPage(1); }} placeholder="All dates" />
            </Field>
            <Field pick>
              <Select value={module} onChange={setFilter(setModule)} options={d.filters?.modules || []} placeholder="All Modules" />
            </Field>
            <Field pick>
              <Select value={action} onChange={setFilter(setAction)} placeholder="All Actions"
                options={(d.filters?.actions || []).map(a => ({ value: a, label: words(a) }))} />
            </Field>
            <Field pick>
              <Select value={user} onChange={setFilter(setUser)} options={d.filters?.users || []} placeholder="All Users" />
            </Field>
            <Field pick>
              <Select value={entityType} onChange={setFilter(setEntityType)} placeholder="All Reference Types"
                options={(d.filters?.entityTypes || []).map(x => ({ value: x, label: words(x.replace(/^Inventory/, '')) }))} />
            </Field>
            <Field grow>
              <Search value={q} onChange={setFilter(setQ)} placeholder="Search in activity log…" />
            </Field>
            <FilterEnd>
              <Btn kind={critical ? 'soft' : 'ghost'} icon="filter"
                onClick={() => setFilter(setCritical)(critical ? '' : 'true')}>
                {critical ? 'Critical only' : 'Filters'}
              </Btn>
              <Btn icon="refresh" onClick={reset}>Reset</Btn>
            </FilterEnd>
          </Filters>

          <DataTable
            columns={columns} rows={rows} loading={loading && !rows.length}
            sort={sort} dir={dir} onSort={(k) => { onSort(k); setPage(1); }}
            pickedId={picked} onRowClick={(r) => setPicked(r._id)}
            actions={(r) => (
              <>
                <Btn size="sm" onClick={() => setPicked(r._id)}>View</Btn>
                <KebabMenu icon="listDots" items={[
                  { label: 'Everything by this user', icon: 'user', onClick: () => { setUser(r.by?._id || ''); setPage(1); } },
                  { label: `Everything in ${r.module}`, icon: 'layers', onClick: () => { setModule(r.module); setPage(1); } },
                ]} />
              </>
            )}
            empty={
              <Empty icon="history" title={filtered ? 'No activity matches' : 'Nothing logged yet'}
                action={filtered ? <Btn icon="refresh" onClick={reset}>Reset the filters</Btn> : null}>
                {filtered
                  ? 'Try a wider date range, another module or a different user.'
                  : 'Every change to items, stock, orders, issues, assets and budgets is recorded here as it happens.'}
              </Empty>
            }
          />

          <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="activities"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[10, 25, 50, 100]} />
        </Card>
      </SplitView>
    </div>
  );
}
