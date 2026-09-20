/**
 * Fees → Categories (mockup 6). Groups of fee heads, as a list or as cards,
 * with a panel for the picked one: details, its heads, where they are used
 * this year, and its history.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getCategoryList, getCategoryActivity, toggleFeeCategory } from '../../../api/fees.api';
import { Confirm } from '../../../components/ui/index';
import { RowMenu, MenuItem } from '../../admin/listParts';
import {
  FeHead, Btn, Card, CardHead, Tile, Tiles, Select, Search, StatusBadge, IconBtn, Pager, Mark, Panel, Facts, Fact, Toggle,
  ViewSwitch, LinkBtn, money, fmtDate, fmtDateTime, yearOptions, Empty, Loading, saveFile, toCsv,
} from './feeUI';
import { CategoryDialog, HeadDialog } from './feeForms';
import { useFeesMeta, useUrlState } from './feeData';
import { History } from './feeHistory';

const DEFAULTS = { academicYearId: '', status: '', q: '', sort: 'name', page: '1', limit: '10' };

const CAT_LOOKS = [
  [/academic|tuition/i, 'gradCap', 'indigo'], [/transport|bus/i, 'bus', 'amber'], [/hostel|boarding/i, 'bed', 'red'],
  [/mess|food|meal/i, 'cutlery', 'green'], [/exam|assessment/i, 'docFill', 'indigo'], [/co-?curricular|sport|club|activit/i, 'trophy', 'purple'],
  [/other|misc/i, 'gear', 'slate'], [/one.?time|admission/i, 'trash', 'red'], [/library/i, 'bookOpen', 'purple'], [/lab/i, 'flask', 'green'],
];
export const catLook = (name) => {
  const hit = CAT_LOOKS.find(([re]) => re.test(String(name || '')));
  return hit ? { glyph: hit[1], tone: hit[2] } : { glyph: 'grid', tone: 'indigo' };
};
const CHIP_TONES = ['red', 'purple', 'green', 'blue', 'amber', 'pink', 'indigo'];

export default function FeeCategories() {
  const [applied, setApplied] = useUrlState(DEFAULTS);
  const [draft, setDraft] = useState(applied);
  const [view, setView] = useState('list');
  const [selId, setSelId] = useState(null);
  const [tab, setTab] = useState('details');
  const [dialog, setDialog] = useState(null);
  const [headDialog, setHeadDialog] = useState(null);
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { setDraft(applied); }, [JSON.stringify(applied)]); // eslint-disable-line react-hooks/exhaustive-deps

  const { meta, refetchMeta } = useFeesMeta(applied.academicYearId);
  const page = Number(applied.page) || 1, limit = Number(applied.limit) || 10;
  const query = Object.fromEntries(Object.entries({ ...applied, page, limit }).filter(([, v]) => v !== '' && v != null));
  const { data, meta: env, loading, refetch } = useFetch(() => getCategoryList(query), [JSON.stringify(query)]);
  const rows = data?.rows || [];
  const c = data?.counts || {};
  const sym = meta?.settings?.currencySymbol || '₹';
  const sel = rows.find(r => r._id === selId) || rows[0] || null;
  const { data: act, refetch: refetchAct } = useFetch(
    () => (sel ? getCategoryActivity(sel._id, { academicYearId: applied.academicYearId || undefined }) : Promise.resolve(null)), [sel?._id, applied.academicYearId]);
  const reload = () => { refetch(); refetchMeta(); refetchAct(); };
  const yearValue = draft.academicYearId || meta?.year?._id || '';

  const toggle = async () => {
    try { await toggleFeeCategory(confirm._id); toast.success(confirm.isActive ? 'Category switched off' : 'Category switched on'); setConfirm(null); reload(); }
    catch (e) { toast.error(e.message); }
  };
  const exportCsv = () => saveFile(toCsv([
    { key: 'name', label: 'Category' }, { key: 'description', label: 'Description' }, { key: 'headCount', label: 'Fee Heads' },
    { label: 'Heads', value: r => r.heads.map(h => h.name).join('; ') }, { key: 'status', label: 'Status' }, { label: 'Created On', value: r => fmtDate(r.createdAt) },
  ], rows), 'fee-categories.csv');

  const look = catLook(sel?.name);
  return (
    <div className="fe-page">
      <FeHead title="Fee Categories" subtitle="Organize fee heads into categories for better management">
        <Btn variant="outline" icon="download" onClick={exportCsv}>Export</Btn>
        <Btn variant="primary" icon="plus" onClick={() => setDialog({})}>Add Category</Btn>
      </FeHead>

      <Tiles n={4}>
        <Tile valueFirst glyph="grid" tone="indigo" value={c.all || 0} label="Total Categories" caption="All fee categories" />
        <Tile valueFirst glyph="checkCircle" tone="green" value={c.active || 0} label={c.active === 1 ? 'Active Category' : 'Active Categories'} caption="In use" />
        <Tile valueFirst glyph="pause" tone="amber" value={c.inactive || 0} label={c.inactive === 1 ? 'Inactive Category' : 'Inactive Categories'} caption="Not in use" />
        <Tile valueFirst glyph="users" tone="pink" value={c.heads || 0} label="Total Fee Heads" caption={c.uncategorised ? `${c.uncategorised} without a category` : 'Across all categories'} />
      </Tiles>

      <Card className="fe-filters">
        <div className="fe-frow" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, .5fr) auto auto' }}>
          <Select label="Academic Year" value={yearValue} onChange={v => setDraft(d => ({ ...d, academicYearId: v }))} options={yearOptions(meta?.years)} />
          <Select label="Status" value={draft.status} onChange={v => setDraft(d => ({ ...d, status: v }))} all="All Statuses" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          <Search value={draft.q} onChange={v => setDraft(d => ({ ...d, q: v }))} onEnter={() => setApplied({ ...draft, page: '1' })} placeholder="Search categories..." />
          <span />
          <Btn variant="outline" onClick={() => { setDraft(DEFAULTS); setApplied({ ...DEFAULTS }); }}>Clear</Btn>
          <Btn variant="primary" icon="filter" onClick={() => setApplied({ ...draft, page: '1' })}>Apply Filters</Btn>
        </div>
      </Card>

      <div className="fe-split">
        <Card>
          <CardHead title={`Fee Categories (${env?.total ?? c.all ?? 0})`}>
            <div style={{ width: 150 }}>
              <Select value={applied.sort} onChange={v => setApplied({ sort: v, page: '1' })} compact options={[
                { value: 'name', label: 'Sort by Name' }, { value: 'heads', label: 'Most fee heads' }, { value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }]} />
            </div>
            <ViewSwitch value={view} onChange={setView} items={[{ key: 'list', icon: 'list', label: 'List view' }, { key: 'grid', icon: 'grid', label: 'Card view' }]} />
          </CardHead>
          {view === 'list' ? (
            <div className="fe-tablewrap">
              <table className="fe-table fe-table--roomy" style={{ fontSize: '.84rem' }}>
                <thead><tr><th>#</th><th>Category Name</th><th>Description</th><th>Fee Heads</th><th>Status</th><th>Created On</th><th>Actions</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const lk = catLook(r.name);
                    return (
                      <tr key={r._id} className={`is-click${sel?._id === r._id ? ' is-sel' : ''}`} onClick={() => { setSelId(r._id); setTab('details'); }}>
                        <td>{(page - 1) * limit + i + 1}</td>
                        <td><span className="fe-name"><Mark glyph={lk.glyph} tone={lk.tone} size={36} /><b>{r.name}</b></span></td>
                        <td style={{ maxWidth: 260 }}>{r.description || <span className="fe-muted">—</span>}</td>
                        <td>{r.headCount}</td>
                        <td><StatusBadge status={r.status} /></td>
                        <td className="fe-num">{fmtDate(r.createdAt)}</td>
                        <td onClick={e => e.stopPropagation()}>
                          <span className="fe-acts">
                            <IconBtn icon="pencil" label="Edit" onClick={() => setDialog({ category: r })} />
                            <RowMenu>
                              <MenuItem icon="plus" onClick={() => setHeadDialog({ categoryId: r._id })}>Add a fee head here</MenuItem>
                              <MenuItem icon="power" danger={r.isActive} onClick={() => setConfirm(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</MenuItem>
                            </RowMenu>
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="fe-cards">
              {rows.map(r => {
                const lk = catLook(r.name);
                return (
                  <button key={r._id} type="button" className={`fe-catcard${sel?._id === r._id ? ' is-sel' : ''}`} onClick={() => { setSelId(r._id); setTab('details'); }}>
                    <span className="fe-catcard__top"><Mark glyph={lk.glyph} tone={lk.tone} size={40} /><b>{r.name}</b></span>
                    <p>{r.description || 'No description'}</p>
                    <span className="fe-catcard__foot"><span>{r.headCount} fee head{r.headCount === 1 ? '' : 's'}</span><StatusBadge status={r.status} /></span>
                  </button>
                );
              })}
            </div>
          )}
          {loading && !data ? <Loading rows={6} /> : null}
          {!loading && !rows.length ? <Empty title="No categories" hint={c.all ? 'Nothing matches these filters.' : 'Group your fee heads — Academic, Transport, Hostel — so reports can add them up.'} /> : null}
          <Pager page={page} pages={env?.pages || 1} total={env?.total || 0} limit={limit} count={rows.length} noun="categories"
            onPage={p => setApplied({ page: String(p) })} onLimit={l => setApplied({ limit: String(l), page: '1' })} />
        </Card>

        {sel ? (
          <Panel glyph={look.glyph} tone={look.tone} title={sel.name} subtitle={sel.description || 'No description'} status={<StatusBadge status={sel.status} />}
            tabs={[{ key: 'details', label: 'Details' }, { key: 'heads', label: `Fee Heads (${sel.headCount})` }, { key: 'usage', label: 'Usage' }, { key: 'history', label: 'History' }]}
            tab={tab} onTab={setTab}>
            {tab === 'details' ? (
              <>
                <Facts>
                  <Fact label="Category Name"><b>{sel.name}</b></Fact>
                  <Fact label="Description"><span style={{ fontWeight: 400, color: '#475569', lineHeight: 1.55 }}>{sel.description || '—'}</span></Fact>
                  <Fact label="Total Fee Heads"><b>{sel.headCount}</b></Fact>
                  <Fact label="Status"><span className="fe-togglerow"><Toggle checked={sel.isActive} onChange={() => setConfirm(sel)} label="Active" />{sel.isActive ? 'Active' : 'Inactive'}</span></Fact>
                  <Fact label="Created On">{fmtDateTime(sel.createdAt)}</Fact>
                  <Fact label="Last Updated">{fmtDateTime(sel.updatedAt)}</Fact>
                  <Fact label="Created By">{sel.createdBy || '—'}</Fact>
                </Facts>
                <div className="fe-panel__acts">
                  <Btn variant="soft" icon="pencil" onClick={() => setDialog({ category: sel })}>Edit Category</Btn>
                  <Btn variant={sel.isActive ? 'danger' : 'soft'} icon="power" onClick={() => setConfirm(sel)}>{sel.isActive ? 'Deactivate' : 'Activate'}</Btn>
                </div>
                <div style={{ marginTop: 16, background: '#f5f7fb', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <b style={{ fontSize: '.95rem' }}>Associated Fee Heads</b>
                    {sel.heads.length ? <LinkBtn onClick={() => setTab('heads')}>View All</LinkBtn> : null}
                  </div>
                  {sel.heads.length ? (
                    <div className="fe-chips">
                      {sel.heads.slice(0, 5).map((h, i) => <span key={h._id} className={`fe-chip fe-b-${CHIP_TONES[i % CHIP_TONES.length]}`}>{h.name}</span>)}
                      {sel.heads.length > 5 ? <button type="button" className="fe-chip fe-chip--more fe-link" onClick={() => setTab('heads')}>+{sel.heads.length - 5} more</button> : null}
                    </div>
                  ) : <p className="fe-form__hint" style={{ margin: 0 }}>No fee heads in this category yet.</p>}
                </div>
              </>
            ) : tab === 'heads' ? (
              <>
                {sel.heads.length ? (
                  <table className="fe-mini"><tbody>{sel.heads.map(h => <tr key={h._id}><td>{h.name}</td><td><StatusBadge status={h.isActive ? 'active' : 'inactive'} /></td></tr>)}</tbody></table>
                ) : <p className="fe-form__hint">No fee heads yet.</p>}
                <div style={{ marginTop: 12 }}><Btn variant="soft" icon="plus" onClick={() => setHeadDialog({ categoryId: sel._id })}>Add Fee Head</Btn></div>
              </>
            ) : tab === 'usage' ? (
              <>
                <div className="fe-kv"><span>Collected this year</span><b>{money(act?.collected || 0, { sym })}</b></div>
                <div className="fe-kv"><span>Structures using its heads</span><b>{act?.structures?.length ?? '…'}</b></div>
                {act?.structures?.length ? (
                  <table className="fe-mini" style={{ marginTop: 10 }}>
                    <thead><tr><th>Structure</th><th>Heads</th><th>Amount</th></tr></thead>
                    <tbody>{act.structures.map(s => <tr key={s._id}><td>{s.name}<br /><small>{s.appliesTo}</small></td><td>{s.heads}</td><td>{money(s.amount, { sym })}</td></tr>)}</tbody>
                  </table>
                ) : act ? <p className="fe-form__hint">None of its heads is charged this year.</p> : <Loading rows={2} />}
              </>
            ) : <History rows={act?.history} />}
          </Panel>
        ) : <Card><Empty title="Pick a category" /></Card>}
      </div>

      <CategoryDialog open={!!dialog} onClose={() => setDialog(null)} onSaved={reload} category={dialog?.category} />
      <HeadDialog open={!!headDialog} onClose={() => setHeadDialog(null)} onSaved={reload}
        meta={meta} head={headDialog ? { name: '', category: { _id: headDialog.categoryId }, type: 'recurring', amountType: 'fixed', defaultAmount: '', description: '', isActive: true, _new: true } : null} />
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={toggle}
        title={confirm?.isActive ? 'Deactivate category' : 'Activate category'} confirmLabel={confirm?.isActive ? 'Deactivate' : 'Activate'}
        message={confirm ? (confirm.isActive ? `Switch "${confirm.name}" off? Its ${confirm.headCount} fee head${confirm.headCount === 1 ? '' : 's'} keep working; the category just stops being offered for new ones.` : `Switch "${confirm.name}" back on?`) : ''} />
    </div>
  );
}
