/**
 * Fees → Structures (mockup 4). What each class or section is charged, head
 * by head. A structure is "upcoming" until its year has begun and its
 * charging-start date has come — the tile says "yet to start" rather than the
 * mockup's "for next academic year", because a structure dated to start later
 * THIS year is upcoming too.
 */
import React, { useEffect, useRef, useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import { getStructureList } from '../../../api/fees.api';
import { RowMenu, MenuItem, MenuSep } from '../../admin/listParts';
import Icon from '../../../components/ui/icons';
import {
  FeHead, Btn, Card, Tile, Tiles, Select, Search, PillTabs, StatusBadge, IconBtn, Pager, Mark,
  money, yearOptions, Empty, Loading, saveFile, toCsv,
} from './feeUI';
import { StructureDialog, StructureDrawer, CopyYearDialog, StructureLifecycleDialog } from './feeForms';
import { useFeesMeta, classOptions, sectionOptions, useUrlState } from './feeData';

const DEFAULTS = { academicYearId: '', classId: '', sectionId: '', categoryId: '', status: '', q: '', page: '1', limit: '10' };

/** Icon + tint for a structure, from what it charges: transport → bus, hostel → bed, else a cap. */
const CAP_TONES = ['blue', 'blue', 'green', 'red', 'blue', 'indigo', 'purple', 'teal', 'amber'];
export function structureLook(s) {
  const cats = (s.categories || []).join(' ').toLowerCase();
  if (/transport|bus/.test(cats) || /transport|bus/i.test(s.name)) return { glyph: 'bus', tone: 'amber' };
  if (/hostel|boarding/.test(cats) || /hostel/i.test(s.name)) return { glyph: 'bed', tone: /girl/i.test(s.name) ? 'pink' : 'purple' };
  const n = Number(s.class?.classNumber) || 0;
  if (n >= 11) return { glyph: 'bed', tone: 'red' };
  return { glyph: 'gradCap', tone: CAP_TONES[n % CAP_TONES.length] };
}

/** A small dropdown for "More Actions". */
function MoreMenu({ items, label = 'More Actions', variant = 'outline', width = 250 }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <span ref={ref} style={{ position: 'relative' }}>
      <Btn variant={variant} onClick={() => setOpen(o => !o)}>{label} <Icon name="chevronDown" size={16} /></Btn>
      {open ? (
        <div className="lmenu" style={{ position: 'absolute', right: 0, top: 46, width, zIndex: 30 }}>
          {items.map(i => (
            <button key={i.label} type="button" className="lmenu__item" onClick={() => { setOpen(false); i.onClick(); }}>
              <Icon name={i.icon} size={16} />{i.label}
            </button>
          ))}
        </div>
      ) : null}
    </span>
  );
}
export { MoreMenu };

export default function FeeStructures() {
  const [applied, setApplied] = useUrlState(DEFAULTS);
  const [draft, setDraft] = useState(applied);
  const [dialog, setDialog] = useState(null);      // { mode, source }
  const [viewing, setViewing] = useState(null);
  const [copying, setCopying] = useState(false);
  const [act, setAct] = useState(null);           // { action, row }
  useEffect(() => { setDraft(applied); }, [JSON.stringify(applied)]); // eslint-disable-line react-hooks/exhaustive-deps

  const { meta, refetchMeta } = useFeesMeta(applied.academicYearId);
  const { meta: draftMeta } = useFeesMeta(draft.academicYearId);
  const page = Number(applied.page) || 1, limit = Number(applied.limit) || 10;
  const query = Object.fromEntries(Object.entries({ ...applied, page, limit }).filter(([, v]) => v !== '' && v != null));
  const { data, meta: env, loading, refetch } = useFetch(() => getStructureList(query), [JSON.stringify(query)]);
  const rows = data?.rows || [];
  const c = data?.counts || {};
  const sym = meta?.settings?.currencySymbol || '₹';
  const yearValue = draft.academicYearId || data?.year?._id || '';
  const setD = (k) => (v) => setDraft(d => ({ ...d, [k]: v, ...(k === 'classId' ? { sectionId: '' } : {}), ...(k === 'academicYearId' ? { classId: '', sectionId: '' } : {}) }));
  const apply = () => setApplied({ ...draft, page: '1' });
  const reset = () => { setDraft(DEFAULTS); setApplied({ ...DEFAULTS }); };
  const reload = () => { refetch(); refetchMeta(); };
  // Keep the open drawer in step with the list after an action.
  useEffect(() => { if (viewing) setViewing(v => rows.find(r => r._id === v._id) || v); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => saveFile(toCsv([
    { key: 'name', label: 'Structure' }, { label: 'Academic Year', value: r => r.academicYear?.yearName },
    { label: 'Class', value: r => r.class?.className }, { label: 'Section', value: r => (r.level === 'section' ? r.section?.sectionName : 'All Sections') },
    { label: 'Categories', value: r => r.categories.join('; ') }, { key: 'headCount', label: 'Fee Heads' }, { key: 'totalAmount', label: 'Total Amount' },
    { key: 'status', label: 'Status' }, { label: 'Students Charged', value: r => r.charged.students },
  ], rows), `fee-structures-${data?.year?.yearName || ''}.csv`);

  return (
    <div className="fe-page">
      <FeHead title="Fee Structures" subtitle="Create and manage fee structures by academic year, class, section and category">
        <MoreMenu items={[
          { icon: 'copy', label: 'Copy from another year', onClick: () => setCopying(true) },
          { icon: 'download', label: 'Export this list (CSV)', onClick: exportCsv },
        ]} />
        <Btn variant="primary" icon="plus" onClick={() => setDialog({ mode: 'create' })}>Create Structure</Btn>
      </FeHead>

      <Tiles n={4}>
        <Tile valueFirst glyph="book" tone="indigo" value={c.all || 0} label="Total Structures" caption="Across all classes" />
        <Tile valueFirst glyph="checkCircle" tone="green" value={c.active || 0} label="Active Structures" caption="In use currently" />
        <Tile valueFirst glyph="clock" tone="amber" value={c.upcoming || 0} label="Upcoming Structures" caption="Yet to start" />
        <Tile valueFirst glyph="xCircle" tone="red" value={c.inactive || 0} label="Inactive Structures" caption="Not in use" />
      </Tiles>

      <Card className="fe-filters">
        <div className="fe-frow" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) minmax(238px, 1.25fr)' }}>
          <Select label="Academic Year" value={yearValue} onChange={setD('academicYearId')} options={yearOptions(draftMeta?.years || meta?.years)} />
          <Select label="Class" value={draft.classId} onChange={setD('classId')} all="All Classes" options={classOptions(draftMeta)} />
          <Select label="Section" value={draft.sectionId} onChange={setD('sectionId')} all="All Sections" options={sectionOptions(draftMeta, draft.classId)} disabled={!draft.classId} />
          <Select label="Fee Category" value={draft.categoryId} onChange={setD('categoryId')} all="All Categories" options={(draftMeta?.categories || []).map(x => ({ value: x._id, label: x.name }))} />
          <Select label="Status" value={draft.status} onChange={setD('status')} all="All Statuses" options={[{ value: 'active', label: 'Active' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'inactive', label: 'Inactive' }]} />
          <div className="fe-frow__stack">
            <Search value={draft.q} onChange={setD('q')} onEnter={apply} placeholder="Search structures..." />
            <div>
              <Btn variant="primary" icon="filter" size="fit" onClick={apply}>Apply Filters</Btn>
              <Btn variant="outline" icon="refresh" size="fit" onClick={reset}>Reset</Btn>
            </div>
          </div>
        </div>
      </Card>

      <PillTabs value={applied.status} onChange={s => setApplied({ status: s, page: '1' })} items={[
        { key: '', label: 'All Structures', count: c.all || 0, tone: 'slate' },
        { key: 'active', label: 'Active', count: c.active || 0, tone: 'green' },
        { key: 'upcoming', label: 'Upcoming', count: c.upcoming || 0, tone: 'amber' },
        { key: 'inactive', label: 'Inactive', count: c.inactive || 0, tone: 'red' },
      ]} />

      <Card>
        <div className="fe-tablewrap">
          <table className="fe-table fe-table--caps fe-table--roomy">
            <thead><tr><th>#</th><th>Structure Name</th><th>Academic Year</th><th>Applies To</th><th>Categories</th><th>Fee Heads</th><th title="What the structure charges over the whole academic year">Total Amount</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const look = structureLook(r);
                return (
                  <tr key={r._id}>
                    <td className="fe-w-idx">{(page - 1) * limit + i + 1}</td>
                    <td><span className="fe-name"><Mark glyph={look.glyph} tone={look.tone} size={36} /><b>{r.name}</b></span></td>
                    <td>{r.academicYear?.yearName}</td>
                    <td><span className="fe-cell2"><b>{r.class?.className || '—'}</b><small>{r.level === 'section' ? `Section ${r.section?.sectionName}` : 'All Sections'}</small></span></td>
                    <td>{r.categories.length ? (r.categories.length > 1 ? `${r.categories[0]} +${r.categories.length - 1}` : r.categories[0]) : <span className="fe-muted">—</span>}</td>
                    <td>{r.headCount}</td>
                    <td className="fe-num fe-strong">{money(r.totalAmount, { sym, space: true })}</td>
                    <td><StatusBadge status={r.status} /></td>
                    <td>
                      <span className="fe-acts">
                        <IconBtn icon="eye" label="View" bordered onClick={() => setViewing(r)} />
                        <IconBtn icon="pencil" label="Edit" bordered onClick={() => setDialog({ mode: 'edit', source: r })} />
                        <IconBtn icon="copy" label="Copy" bordered onClick={() => setDialog({ mode: 'copy', source: r })} />
                        <RowMenu>
                          <MenuItem icon="users" onClick={() => setAct({ action: 'demand', row: r })}>Generate demand</MenuItem>
                          <MenuSep />
                          <MenuItem icon="power" danger={r.isActive} onClick={() => setAct({ action: r.isActive ? 'deactivate' : 'activate', row: r })}>{r.isActive ? 'Deactivate' : 'Activate'}</MenuItem>
                          {/* Deleting is only ever offered while nothing has been charged —
                              after that the structure IS the record of the bill. */}
                          {r.charged.students ? null : <MenuItem icon="trash" danger onClick={() => setAct({ action: 'delete', row: r })}>Delete</MenuItem>}
                        </RowMenu>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {loading && !data ? <Loading rows={6} /> : null}
          {!loading && !rows.length ? (
            <Empty title="No fee structures" hint={c.all ? 'Nothing matches these filters.' : 'Create one per class, or copy last year\'s from More Actions.'}>
              {!c.all ? <Btn variant="primary" icon="plus" onClick={() => setDialog({ mode: 'create' })}>Create Structure</Btn> : null}
            </Empty>
          ) : null}
        </div>
        <Pager page={page} pages={env?.pages || 1} total={env?.total || 0} limit={limit} count={rows.length} noun="structures"
          onPage={p => setApplied({ page: String(p) })} onLimit={l => setApplied({ limit: String(l), page: '1' })} />
      </Card>

      <StructureDialog open={!!dialog} onClose={() => setDialog(null)} onSaved={reload} meta={meta} years={meta?.years || []}
        mode={dialog?.mode} source={dialog?.source} />
      <StructureDrawer row={viewing} onClose={() => setViewing(null)} meta={meta}
        onEdit={(r) => { setViewing(null); setDialog({ mode: 'edit', source: r }); }}
        onAct={(action, r) => setAct({ action, row: r })} />
      <CopyYearDialog open={copying} onClose={() => setCopying(false)} onDone={reload} years={meta?.years || []} defaultTo={data?.year?._id} />
      <StructureLifecycleDialog action={act?.action} row={act?.row || null} sym={sym}
        onClose={() => setAct(null)} onDone={reload} />
    </div>
  );
}
