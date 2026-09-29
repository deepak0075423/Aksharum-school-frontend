/**
 * Inventory → My Requests (teacher).
 *
 * What this teacher has asked the office for, and where each ask has got to.
 * Built to its own design rather than the admin frame: a teacher opening this
 * has one question — "what happened to the thing I asked for?" — so the page
 * leads with the four states a request can be in and a table that answers it
 * per row, with no hero and nothing to scroll past.
 */
import React, { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  PageHead, Tiles, Tile, Card, TabStrip, Filters, FilterEnd, Field, Search, DateRange,
  Btn, IconBtn, KebabMenu, DataTable, Pager, Badge, StatusBadge, Rail, Facts, Fact,
  Block, Note, Rows, Row, Empty, Loading, LoadError, Confirm, Thumb, Cell2, Ico,
  useBoard, useDebounced, useInvMeta, useMarks,
  count, money, fmtDate, fmtDateTime, ago, words, toCsv, saveFile,
} from '../admin/invUI';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { TeacherRequestForm } from './RequestForm';

const PRIORITY_TONE = { urgent: 'red', high: 'orange', normal: 'slate', low: 'slate' };

/** What each outcome actually means for the person who asked. */
const OUTCOME = {
  pending: 'Somebody still has to look at this. You can cancel it until they do.',
  approved: 'Approved. It will either come out of stock or be ordered in.',
  converted: 'A purchase order has gone to a vendor for this.',
  fulfilled_from_stock: 'Issued to you from what the school already had — nothing needed to be ordered.',
  rejected: 'Turned down. The approver’s comment is in the Approvals tab.',
  cancelled: 'You cancelled this before anybody acted on it.',
};

export default function TeacherPurchaseRequests() {
  // The URL segment is "requests"; the screen is "My Requests", and the
  // difference matters on a page whose whole point is that these are yours.
  usePageCrumbs([{ label: 'My Requests' }]);

  const { meta } = useInvMeta(api.getTeacherMeta);

  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(8);
  const search = useDebounced(q);

  const [form, setForm] = useState(false);
  const [view, setView] = useState(null);
  const [viewTab, setViewTab] = useState('overview');
  const [cancelRow, setCancelRow] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () => api.getMyRequestBoard({ tab, search, from: range.from, to: range.to, page, limit }),
    [tab, search, range.from, range.to, page, limit],
  );
  const { data, loading, error, reload } = useBoard(load, [tab, search, range.from, range.to, page, limit]);

  const d = data || {};
  const rows = d.rows || [];
  const t = d.tiles || {};
  const tabs = d.tabs || {};
  const marks = useMarks(rows);

  const setFilter = (fn) => (v) => { fn(v); setPage(1); };
  const reset = () => { setQ(''); setRange({ from: '', to: '' }); setPage(1); };
  const filtered = !!(search || range.from || range.to);

  const exportCsv = () => {
    saveFile(`my-inventory-requests-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ['requestNumber', 'Request No.'],
      ['createdAt', 'Date', (r) => fmtDate(r.createdAt)],
      ['items', 'Items', (r) => r.items.map(l => `${l.itemName} ×${l.quantity}`).join('; ')],
      ['reason', 'Purpose'],
      ['status', 'Status', (r) => words(r.status)],
      ['estimatedTotal', 'Estimated Total'],
      ['updatedAt', 'Last Updated', (r) => fmtDate(r.updatedAt)],
    ], rows));
    toast.success('Exported the requests on this page');
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      await api.cancelMyRequest(cancelRow._id);
      toast.success(`${cancelRow.requestNumber} cancelled`);
      setCancelRow(null);
      reload();
    } catch (e) { toast.error(e?.message || 'That request could not be cancelled'); }
    finally { setBusy(false); }
  };

  const open = (r) => { setView(r); setViewTab('overview'); };

  const columns = useMemo(() => [
    {
      key: 'requestNumber', label: 'Request No.', nowrap: true, primary: true,
      cell: (r) => (
        <button type="button" className="itq__no" onClick={() => open(r)}>
          {r.requestNumber}
          <Ico name="chevronRight" size={14} aria-hidden />
        </button>
      ),
    },
    { key: 'createdAt', label: 'Date', nowrap: true, cell: (r) => fmtDate(r.createdAt) },
    {
      key: 'items', label: 'Items',
      cell: (r) => (
        <span className="inv-cellrow">
          <Thumb src={r.lead?.image} icon={r.lead?.icon || 'box'} />
          <Cell2
            top={r.lead?.name || <span className="inv-dim">No items</span>}
            sub={`${count(r.lines)} item${r.lines === 1 ? '' : 's'}`}
          />
        </span>
      ),
    },
    {
      key: 'reason', label: 'Purpose',
      cell: (r) => <span className="inv-clamp2">{r.reason || <span className="inv-dim">—</span>}</span>,
    },
    { key: 'status', label: 'Status', nowrap: true, cell: (r) => <StatusBadge value={r.status} /> },
    {
      key: 'updatedAt', label: 'Last Updated', nowrap: true,
      cell: (r) => <span className="inv-dim">{ago(r.updatedAt || r.createdAt)}</span>,
    },
  ], []);

  if (error && !data) return <div className="inv-page"><LoadError error={error} onRetry={reload} /></div>;
  if (loading && !data) return <div className="inv-page"><Loading tiles={4} /></div>;

  return (
    <div className="inv-page">
      <PageHead
        plain
        title="My Purchase Requests"
        subtitle="Request items from the inventory department and track their status."
      >
        <Btn kind="primary" icon="plus" onClick={() => setForm(true)}>New Request</Btn>
      </PageHead>

      <Tiles>
        <Tile soft icon="request" tone="indigo" value={count(t.total)} label="Total Requests" />
        <Tile soft icon="clock" tone="amber" value={count(t.pending)} label="Pending Approval" />
        <Tile soft icon="checkCircle" tone="green" value={count(t.approved)} label="Approved" />
        <Tile soft icon="closeCircle" tone="red" value={count(t.rejected)} label="Rejected" />
      </Tiles>

      <Card>
        <Filters inner>
          <TabStrip
            pill
            value={tab} onChange={(v) => { setTab(v); setPage(1); }}
            items={[
              { value: 'all', label: 'All', count: tabs.all },
              { value: 'pending', label: 'Pending', count: tabs.pending },
              { value: 'approved', label: 'Approved', count: tabs.approved },
              { value: 'rejected', label: 'Rejected', count: tabs.rejected },
              { value: 'draft', label: 'Draft', count: tabs.draft },
            ]}
          />
          <Field grow>
            <Search value={q} onChange={setFilter(setQ)} placeholder="Search by request no., item or purpose..." />
          </Field>
          <Field pick>
            <DateRange from={range.from} to={range.to} onChange={(r) => { setRange(r); setPage(1); }} />
          </Field>
          <FilterEnd>
            <Btn kind={filtered ? 'soft' : 'ghost'} icon="filter" onClick={reset}>
              {filtered ? 'Clear filters' : 'Filters'}
            </Btn>
            <KebabMenu items={[
              { label: 'New request', icon: 'plus', onClick: () => setForm(true) },
              { label: 'Export this page', icon: 'download', onClick: exportCsv },
            ]} />
          </FilterEnd>
        </Filters>

        <DataTable
          columns={columns} rows={rows} loading={loading && !rows.length}
          marked={marks.marked} onMark={marks.toggle} onMarkAll={marks.toggleAll}
          actions={(r) => (
            <KebabMenu items={[
              { label: 'View request', icon: 'eye', onClick: () => open(r) },
              { label: 'Export this page', icon: 'download', onClick: exportCsv },
              { sep: true },
              { label: 'Cancel request', icon: 'closeCircle', danger: true,
                disabled: r.status !== 'pending', onClick: () => setCancelRow(r) },
            ]} />
          )}
          empty={
            <Empty icon="request" title={filtered || tab !== 'all' ? 'No requests match' : 'You have not asked for anything yet'}
              action={filtered || tab !== 'all'
                ? <Btn icon="refresh" onClick={() => { reset(); setTab('all'); }}>Clear the filters</Btn>
                : <Btn kind="primary" icon="plus" onClick={() => setForm(true)}>Raise your first request</Btn>}>
              {filtered || tab !== 'all'
                ? 'Try another tab or date range.'
                : 'Ask for what you need — chalk, lab supplies, a replacement projector. If the school already has it, it is issued to you rather than bought.'}
            </Empty>
          }
        />

        <Pager page={d.page} pages={d.pages} total={d.total} limit={limit} noun="requests"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} limits={[8, 25, 50]} />
      </Card>

      {view ? (
        <Rail
          icon="request" iconTone="violet"
          title={view.requestNumber}
          sub={`Raised ${fmtDate(view.createdAt)}`}
          badge={<StatusBadge value={view.status} />}
          onClose={() => setView(null)}
          tabs={[
            { value: 'overview', label: 'Overview' },
            { value: 'items', label: 'Items', count: view.lines },
            { value: 'trail', label: 'Approvals', count: view.approvals?.length },
          ]}
          tab={viewTab} onTab={setViewTab}
          foot={view.status === 'pending'
            ? <Btn kind="danger" icon="closeCircle" onClick={() => { setCancelRow(view); setView(null); }}>Cancel request</Btn>
            : null}
        >
          {viewTab === 'overview' ? (
            <>
              <Note tone={['rejected', 'cancelled'].includes(view.status) ? 'warn'
                : view.status === 'pending' ? 'info' : 'ok'}>
                {OUTCOME[view.status] || words(view.status)}
              </Note>
              <Block title="Request">
                <Facts>
                  <Fact k="Department" v={view.department?.name} />
                  <Fact k="Priority" v={<Badge tone={PRIORITY_TONE[view.priority] || 'slate'}>{words(view.priority)}</Badge>} />
                  <Fact k="Raised" v={fmtDateTime(view.createdAt)} />
                  <Fact k="Last updated" v={ago(view.updatedAt || view.createdAt)} />
                  <Fact k="Items" v={count(view.lines)} />
                  <Fact k="Estimated total" v={money(view.estimatedTotal)} />
                  {view.purchaseOrder ? <Fact k="Order" v={`${view.purchaseOrder.poNumber} · ${words(view.purchaseOrder.status)}`} /> : null}
                  <Fact k="Purpose" v={view.reason} />
                </Facts>
              </Block>
            </>
          ) : null}

          {viewTab === 'items' ? (
            <Block title={`Items (${count(view.lines)})`}>
              {view.items.length ? (
                <Rows>
                  {view.items.map((l, i) => (
                    <Row key={i} icon="box" title={l.itemName}
                      end={`${count(l.quantity)} ${l.unit}`}
                      endSub={l.estimatedPrice ? money(l.quantity * l.estimatedPrice) : null} />
                  ))}
                </Rows>
              ) : <Empty sm icon="box" title="No lines on this request" />}
            </Block>
          ) : null}

          {viewTab === 'trail' ? (
            <Block title="Who has looked at it">
              {(view.approvals || []).length ? (
                <Rows>
                  {view.approvals.map((a, i) => (
                    <Row key={i}
                      icon={a.action === 'approved' ? 'check' : a.action === 'rejected' ? 'x' : 'clock'}
                      iconTone={a.action === 'approved' ? 'green' : a.action === 'rejected' ? 'red' : 'amber'}
                      title={a.stage}
                      sub={[words(a.action), a.comment && `“${a.comment}”`].filter(Boolean).join(' — ')}
                      end={a.actedAt ? fmtDate(a.actedAt) : null} />
                  ))}
                </Rows>
              ) : (
                <Empty sm icon="clock" title="Nobody has acted on it yet">
                  It is sitting with whoever approves requests for your department.
                </Empty>
              )}
            </Block>
          ) : null}
        </Rail>
      ) : null}

      <TeacherRequestForm open={form} meta={meta} onClose={() => setForm(false)} onDone={reload} />

      <Confirm
        open={!!cancelRow} onClose={() => setCancelRow(null)} tone="danger" busy={busy}
        confirmLabel="Cancel request"
        title={cancelRow ? `Cancel ${cancelRow.requestNumber}?` : ''}
        message="It will be withdrawn and nobody will be asked to act on it. You can always raise a new one."
        onConfirm={doCancel}
      />
    </div>
  );
}
