/**
 * Fees → Fee Heads (mockup 5). The components structures charge, with a
 * detail panel for the picked head: its details, the structures using it this
 * year (and what it has collected), and its change history.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getHeadList, getHeadActivity, archiveFeeHead } from '../../../api/fees.api';
import { Confirm } from '../../../components/ui/index';
import { RowMenu, MenuItem, MenuSep } from '../../admin/listParts';
import {
  FeHead, Btn, Card, CardHead, Tile, Tiles, Select, Search, StatusBadge, IconBtn, Check, Pager, Mark, Panel, Facts, Fact,
  Toggle, Badge, money, fmtDateTime, yearOptions, FREQUENCY, FREQUENCY_OPTIONS, Empty, Loading, saveFile, toCsv,
} from './feeUI';
import { HeadDialog, ImportHeadsDialog, HeadLifecycleDialog } from './feeForms';
import { useFeesMeta, useUrlState } from './feeData';
import { History } from './feeHistory';

const DEFAULTS = { academicYearId: '', categoryId: '', status: '', q: '', frequency: '', amountType: '', page: '1', limit: '10' };

/** Glyph and tint for a head, from its name — nothing about it is stored. */
const HEAD_LOOKS = [
  [/tuition/i, 'gradCap', 'indigo'], [/admission|registration/i, 'docFill', 'blue'], [/transport|bus|van/i, 'bus', 'amber'],
  [/hostel|boarding/i, 'bed', 'red'], [/exam|test|assessment/i, 'clipboard', 'green'], [/library|book/i, 'bookOpen', 'purple'],
  [/lab|science|practical/i, 'flask', 'green'], [/smart|computer|it\b|digital/i, 'monitor', 'pink'], [/sport|game|athlet/i, 'trophy', 'amber'],
  [/mess|food|meal|canteen/i, 'cutlery', 'green'], [/uniform|id card/i, 'idCard', 'blue'], [/development|building|infra|annual/i, 'gear', 'slate'],
];
export function headLook(name) {
  const hit = HEAD_LOOKS.find(([re]) => re.test(String(name || '')));
  return hit ? { glyph: hit[1], tone: hit[2] } : { glyph: 'docFill', tone: 'indigo' };
}

export default function FeeHeads() {
  const nav = useNavigate();
  const [applied, setApplied] = useUrlState(DEFAULTS);
  const [draft, setDraft] = useState(applied);
  const [more, setMore] = useState(!!(applied.frequency || applied.amountType));
  const [selId, setSelId] = useState(null);
  const [tab, setTab] = useState('details');
  const [dialog, setDialog] = useState(null);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [lifecycle, setLifecycle] = useState(null);
  const [picked, setPicked] = useState(new Set());
  useEffect(() => { setDraft(applied); }, [JSON.stringify(applied)]); // eslint-disable-line react-hooks/exhaustive-deps

  const { meta, refetchMeta } = useFeesMeta(applied.academicYearId);
  const page = Number(applied.page) || 1, limit = Number(applied.limit) || 10;
  const query = Object.fromEntries(Object.entries({ ...applied, page, limit }).filter(([, v]) => v !== '' && v != null));
  const { data, meta: env, loading, refetch } = useFetch(() => getHeadList(query), [JSON.stringify(query)]);
  const rows = data?.rows || [];
  const c = data?.counts || {};
  const sym = meta?.settings?.currencySymbol || '₹';
  const sel = rows.find(r => r._id === selId) || rows[0] || null;
  const { data: act, refetch: refetchAct } = useFetch(
    () => (sel ? getHeadActivity(sel._id, { academicYearId: applied.academicYearId || undefined }) : Promise.resolve(null)), [sel?._id, applied.academicYearId]);
  const yearValue = draft.academicYearId || data?.year?._id || '';
  const setD = (k) => (v) => { const next = { ...draft, [k]: v }; setDraft(next); if (k !== 'q') setApplied({ ...next, page: '1' }); };
  const reload = () => { refetch(); refetchMeta(); refetchAct(); };
  const allOn = rows.length > 0 && rows.every(r => picked.has(r._id));

  const run = async () => {
    const { kind, row } = confirm;
    try {
      if (kind === 'archive') { await archiveFeeHead(row._id, !row.isArchived); toast.success(row.isArchived ? 'Fee head restored (switched off)' : 'Fee head archived'); }
      setConfirm(null); reload();
    } catch (e) { toast.error(e.message); }
  };
  // Switching a head off stops it charging everywhere, so it is never a bare
  // flick of a switch — the dialog says what it will do first.
  const flip = (row) => setLifecycle({ action: row.isActive ? 'deactivate' : 'activate', row });
  const exportCsv = () => saveFile(toCsv([
    { key: 'name', label: 'name' }, { label: 'category', value: r => r.category?.name || '' }, { label: 'frequency', value: r => FREQUENCY[r.type] },
    { key: 'defaultAmount', label: 'amount' }, { label: 'type', value: r => (r.amountType === 'fixed' ? 'Fixed' : 'Variable') },
    { key: 'description', label: 'description' }, { key: 'status', label: 'status' }, { key: 'structures', label: 'structures' },
  ], picked.size ? rows.filter(r => picked.has(r._id)) : rows), 'fee-heads.csv');

  const look = headLook(sel?.name);
  return (
    <div className="fe-page">
      <FeHead title="Fee Heads" subtitle="Create and manage individual fee components used in fee structures">
        <Btn variant="outline" icon="download" onClick={() => setImporting(true)}>Import</Btn>
        <Btn variant="outline" icon="download" onClick={exportCsv}>Export</Btn>
        <Btn variant="primary" icon="plus" onClick={() => setDialog({})}>Add Fee Head</Btn>
      </FeHead>

      <Tiles n={4}>
        <Tile valueFirst glyph="layers" tone="indigo" value={c.all || 0} label="Total Fee Heads" caption="All fee components" />
        <Tile valueFirst glyph="checkCircle" tone="green" value={c.active || 0} label="Active Fee Heads" caption="Available to structures" />
        <Tile valueFirst glyph="pause" tone="amber" value={c.inactive || 0} label="Inactive Fee Heads" caption="Not used currently" />
        <Tile valueFirst glyph="trash" tone="red" value={c.archived || 0} label={c.archived === 1 ? 'Archived Fee Head' : 'Archived Fee Heads'} caption="Kept for past records" />
      </Tiles>

      <Card className="fe-filters">
        <div className="fe-frow" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.4fr) auto minmax(0, .9fr)' }}>
          <Select label="Academic Year" value={yearValue} onChange={setD('academicYearId')} options={yearOptions(meta?.years)} />
          <Select label="Category" value={draft.categoryId} onChange={setD('categoryId')} all="All Categories" options={(meta?.categories || []).map(x => ({ value: x._id, label: x.name }))} />
          <Select label="Status" value={draft.status} onChange={setD('status')} all="All Statuses" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'archived', label: 'Archived' }]} />
          <Search value={draft.q} onChange={v => setDraft(d => ({ ...d, q: v }))} onEnter={() => setApplied({ q: draft.q, page: '1' })} placeholder="Search fee heads..." />
          <Btn variant="outline" onClick={() => { setDraft(DEFAULTS); setApplied({ ...DEFAULTS }); }}>Clear</Btn>
          <Btn variant="soft" icon="filter" onClick={() => setMore(m => !m)}>{more ? 'Fewer Filters' : 'More Filters'}</Btn>
        </div>
        {more ? (
          <div className="fe-more">
            <Select label="Frequency" value={draft.frequency} onChange={setD('frequency')} all="Any frequency" options={FREQUENCY_OPTIONS} />
            <Select label="Type" value={draft.amountType} onChange={setD('amountType')} all="Fixed or variable" options={[{ value: 'fixed', label: 'Fixed' }, { value: 'variable', label: 'Variable' }]} />
          </div>
        ) : null}
      </Card>

      <div className="fe-split">
        <Card>
          <CardHead title={`Fee Heads (${env?.total ?? c.all ?? 0})`} />
          <div className="fe-tablewrap">
            <table className="fe-table" style={{ fontSize: '.84rem' }}>
              <thead><tr>
                <th className="fe-w-check"><Check checked={allOn} label="Select all" onChange={() => setPicked(allOn ? new Set() : new Set(rows.map(r => r._id)))} /></th>
                <th>#</th><th>Name</th><th>Category</th><th>Type</th><th>Default Amount</th><th>Frequency</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const lk = headLook(r.name);
                  return (
                    <tr key={r._id} className={`is-click${sel?._id === r._id ? ' is-sel' : ''}`} onClick={() => { setSelId(r._id); setTab('details'); }}>
                      <td onClick={e => e.stopPropagation()}><Check checked={picked.has(r._id)} label={`Select ${r.name}`}
                        onChange={() => setPicked(p => { const n = new Set(p); if (n.has(r._id)) n.delete(r._id); else n.add(r._id); return n; })} /></td>
                      <td>{(page - 1) * limit + i + 1}</td>
                      <td><span className="fe-name"><Mark glyph={lk.glyph} tone={lk.tone} size={30} /><span>{r.name}</span></span></td>
                      <td>{r.category?.name || <span className="fe-muted">—</span>}</td>
                      <td>{r.amountType === 'fixed' ? 'Fixed' : 'Variable'}</td>
                      <td className="fe-num">{money(r.defaultAmount, { sym, space: true })}</td>
                      <td>{FREQUENCY[r.type] || r.type}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td onClick={e => e.stopPropagation()}>
                        <span className="fe-acts">
                          <IconBtn icon="pencil" label="Edit" onClick={() => setDialog({ head: r })} />
                          <RowMenu>
                            {!r.isArchived ? <MenuItem icon="power" onClick={() => flip(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</MenuItem> : null}
                            <MenuItem icon="eye" onClick={() => { setSelId(r._id); setTab('usage'); }}>See where it is used</MenuItem>
                            <MenuSep />
                            <MenuItem icon="archive" danger={!r.isArchived} onClick={() => setConfirm({ kind: 'archive', row: r })}>{r.isArchived ? 'Restore' : 'Archive'}</MenuItem>
                          </RowMenu>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loading && !data ? <Loading rows={6} /> : null}
            {!loading && !rows.length ? <Empty title="No fee heads" hint={c.all ? 'Nothing matches these filters.' : 'Add the components your school charges — tuition, transport, exams — or import them from a CSV.'} /> : null}
          </div>
          <Pager page={page} pages={env?.pages || 1} total={env?.total || 0} limit={limit} count={rows.length} noun="fee heads"
            onPage={p => setApplied({ page: String(p) })} onLimit={l => setApplied({ limit: String(l), page: '1' })} />
        </Card>

        {sel ? (
          <Panel glyph={look.glyph} tone={look.tone} title={sel.name} subtitle={sel.description || 'No description'}
            status={<StatusBadge status={sel.status} />}
            tabs={[{ key: 'details', label: 'Details' }, { key: 'usage', label: 'Usage' }, { key: 'history', label: 'History' }]} tab={tab} onTab={setTab}>
            {tab === 'details' ? (
              <>
                <Facts>
                  <Fact label="Fee Head Name">{sel.name}</Fact>
                  <Fact label="Category">{sel.category ? <Badge tone="indigo">{sel.category.name}</Badge> : '—'}</Fact>
                  <Fact label="Type">{sel.amountType === 'fixed' ? 'Fixed Amount' : 'Variable Amount'}</Fact>
                  <Fact label="Default Amount">{money(sel.defaultAmount, { sym, space: true })}</Fact>
                  <Fact label="Frequency">{FREQUENCY[sel.type]}</Fact>
                  <Fact label="Applicable To">{sel.appliesTo}</Fact>
                  <Fact label="Description" box>{sel.description || 'No description yet.'}</Fact>
                  <Fact label="Created On">{fmtDateTime(sel.createdAt)}</Fact>
                  <Fact label="Last Updated">{fmtDateTime(sel.updatedAt)}</Fact>
                  <Fact label="Status">
                    <span className="fe-togglerow"><Toggle checked={sel.isActive && !sel.isArchived} disabled={sel.isArchived} onChange={() => flip(sel)} label="Active" />
                      {sel.isArchived ? 'Archived' : sel.isActive ? 'Active' : 'Inactive'}</span>
                  </Fact>
                </Facts>
                <div className="fe-panel__acts">
                  <Btn variant="soft" icon="pencil" onClick={() => setDialog({ head: sel })}>Edit Fee Head</Btn>
                  <Btn variant="danger" glyph="trash" onClick={() => setConfirm({ kind: 'archive', row: sel })}>{sel.isArchived ? 'Restore' : 'Archive'}</Btn>
                </div>
              </>
            ) : tab === 'usage' ? (
              <>
                <div className="fe-kv"><span>Collected this year</span><b>{money(act?.collected || 0, { sym })}</b></div>
                <div className="fe-kv"><span>Structures using it ({act?.year?.yearName || '…'})</span><b>{act?.structures?.length ?? '…'}</b></div>
                {act?.structures?.length ? (
                  <table className="fe-mini" style={{ marginTop: 10 }}>
                    <thead><tr><th>Structure</th><th>Applies to</th><th>Amount</th></tr></thead>
                    <tbody>{act.structures.map(s => <tr key={s._id}><td>{s.name}</td><td>{s.appliesTo}</td><td>{money(s.amount, { sym })}</td></tr>)}</tbody>
                  </table>
                ) : act ? <p className="fe-form__hint">No structure charges it this year.</p> : <Loading rows={2} />}
                <div style={{ marginTop: 14 }}><Btn variant="link" onClick={() => nav('/admin/fees/structures')}>Open Structures →</Btn></div>
                <p className="fe-form__hint">Collected is split from payments by what each student was charged for, unless the payment named its head.</p>
              </>
            ) : <History rows={act?.history} />}
          </Panel>
        ) : <Card><Empty title="Pick a fee head" hint="Its details, usage and history appear here." /></Card>}
      </div>

      <HeadDialog open={!!dialog} onClose={() => setDialog(null)} onSaved={reload} meta={meta} head={dialog?.head} />
      <HeadLifecycleDialog action={lifecycle?.action} row={lifecycle?.row || null} sym={sym}
        onClose={() => setLifecycle(null)} onDone={reload} />
      <ImportHeadsDialog open={importing} onClose={() => setImporting(false)} onDone={reload} />
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={run}
        title={confirm?.row?.isArchived ? 'Restore fee head' : 'Archive fee head'} confirmLabel={confirm?.row?.isArchived ? 'Restore' : 'Archive'}
        message={confirm ? (confirm.row.isArchived
          ? `Bring "${confirm.row.name}" back? It returns switched off; switch it on when structures should use it again.`
          : `Archive "${confirm.row.name}"? It leaves every picker. Structures and receipts that already name it keep it, so past years still read true.`) : ''} />
    </div>
  );
}
