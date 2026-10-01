/**
 * Hostel → Activity Log (Sep 2026 redesign, to the user's mockup).
 *
 * The module's audit trail (spec §29), read-only, from
 * GET /hostel/admin/board/audit: who did what to which record, when, from
 * where, and what changed. The log is append-only and never pruned, so the
 * fourth figure says how far back it reaches rather than a retention window.
 * Filters are drafted and applied together, as on Reports.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { PageHead, Mark, Glyph, words } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, FDateRange, Btn, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, Person, TwoLine, useListState, useBoardData, exportCsv, fmtDate, fmtTime,
} from './hsList';
import { stamp } from './hsTags';

/** What each kind of record is called, its icon, and the screen it lives on. */
const ENTITY = {
  Hostel: ['Hostel', 'hostel', 'indigo', 'hostels'], HostelBuilding: ['Building', 'building', 'indigo', 'structure'],
  HostelFloor: ['Floor', 'floors', 'indigo', 'structure'], HostelRoom: ['Room', 'door', 'indigo', 'rooms'], HostelBed: ['Bed', 'bedSolid', 'indigo', 'rooms'],
  HostelAdmission: ['Admission', 'doc', 'violet', 'admissions'], HostelAllocation: ['Student', 'person', 'teal', 'allocations'],
  HostelAttendance: ['Attendance', 'checkCircle', 'green', 'attendance'], HostelLeave: ['Leave', 'plane', 'teal', 'leave'],
  HostelOutpass: ['Outpass', 'passes', 'teal', 'outpass'], HostelVisitor: ['Visitor', 'walker', 'sky', 'visitors'],
  HostelMovement: ['Movement', 'gateIn', 'sky', 'movement'], HostelStaffAssignment: ['Staff', 'person', 'amber', 'staff'],
  HostelMess: ['Mess', 'cutlery', 'orange', 'mess'], HostelFeePlan: ['Fee plan', 'rupee', 'slate', 'fees'], HostelFeeInvoice: ['Fee', 'rupee', 'slate', 'fees'],
  HostelComplaint: ['Complaint', 'alarm', 'red', 'complaints'], HostelMaintenance: ['Maintenance', 'wrench', 'red', 'maintenance'],
  HostelAsset: ['Asset', 'cube', 'slate', 'assets'], HostelIncident: ['Incident', 'alertTri', 'red', 'incidents'],
  HostelDiscipline: ['Discipline', 'gavel', 'amber', 'discipline'], HostelDocument: ['Document', 'doc', 'blue', 'documents'],
  HostelAnnouncement: ['Announcement', 'megaphone', 'violet', 'communication'], HostelSettings: ['Settings', 'settings', 'slate', 'settings'],
  HostelAttachment: ['Attachment', 'paperclip', 'slate', null], HostelReport: ['Report', 'barsUp', 'slate', 'reports'],
  HostelCommunication: ['Announcement', 'megaphone', 'violet', 'communication'],
};
const entityOf = (t) => ENTITY[t] || [words(String(t || '').replace(/^Hostel/, '')) || '—', 'dot', 'slate', null];
const ACTION = { create: 'green', update: 'blue', delete: 'orange', approve: 'green', reject: 'red', assign: 'violet', allocate: 'green',
  transfer: 'blue', release: 'amber', cancel: 'slate', payment: 'green', refund: 'amber', discount: 'blue', fine: 'red', export: 'slate',
  announce: 'violet', archive: 'slate', restore: 'blue', upload: 'sky', verify: 'green' };
const FILTERS = { entity: '', action: '', user: '', hostel: '', from: '', to: '' };
/** "messAttendanceRequired" → "Mess attendance required". */
const field = (k) => words(String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase());
/** The address as people write it: no IPv6 wrapper round an IPv4 one. */
const ipOf = (ip) => (!ip ? '—' : ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/, ''));

/** "Status: Pending → Approved" — the first change, short enough for a cell. */
const brief = (v) => {
  if (v == null || v === '') return '∅';
  if (typeof v === 'object') return Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : '…';
  const s = typeof v === 'boolean' ? (v ? 'On' : 'Off') : String(v);
  return words(s.length > 18 ? `${s.slice(0, 18)}…` : s);
};
const changesOf = (r) => {
  const keys = [...new Set([...Object.keys(r.before || {}), ...Object.keys(r.after || {})])];
  return keys.map((k) => ({ k, from: r.before?.[k], to: r.after?.[k] }));
};
const Changes = ({ r }) => {
  const list = changesOf(r);
  if (!list.length) return r.actionType === 'delete' ? <Badge tone="slate">{entityOf(r.entityType)[0]} deleted</Badge> : <span className="hs-muted">—</span>;
  const [c] = list;
  const text = r.before && c.from !== undefined ? `${field(c.k)}: ${brief(c.from)} → ${brief(c.to)}` : `${field(c.k)}: ${brief(c.to)}`;
  return <Badge tone="slate" title={list.length > 1 ? `${list.length} fields changed` : undefined}>{text}{list.length > 1 ? ` +${list.length - 1}` : ''}</Badge>;
};
const full = (v) => (v == null || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? 'On' : 'Off') : String(v));

export default function Audit() {
  const { state, set, setPage, reset } = useListState({ limit: 10, dir: 'desc', ...FILTERS }, { fromUrl: ['entity', 'action', 'user'] });
  const [draft, setDraft] = useState(() => ({ ...FILTERS, search: '' }));
  const { data, loading } = useBoardData((q) => api.getBoard('audit', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const [detail, setDetail] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const t = data?.tiles || {};
  const o = data?.options || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const apply = () => { set({ ...draft }); setSelected(new Set()); };
  const clear = () => { setDraft({ ...FILTERS, search: '' }); reset(); setSelected(new Set()); };
  const dirty = Object.keys(draft).some((k) => (draft[k] || '') !== (state[k] || ''));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'at', textLabel: 'Date & Time', label: (
      <button type="button" className="hs-sorthead" onClick={() => set({ dir: state.dir === 'asc' ? 'desc' : 'asc' })}
        aria-label={`Date and time, ${state.dir === 'asc' ? 'oldest' : 'newest'} first — change`}>
        Date &amp; Time <Glyph name={state.dir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} />
      </button>
    ), render: (r) => <TwoLine top={fmtDate(r.createdAt)} sub={fmtTime(r.createdAt)} />, nowrap: true },
    { key: 'who', label: 'Admin', render: (r) => <Person name={r.userName} src={r.userPhoto} size={30} sub={words(r.role) || 'System'} /> },
    { key: 'action', label: 'Action', render: (r) => <Badge tone={ACTION[r.actionType] || 'slate'}>{words(r.actionType)}</Badge> },
    { key: 'type', label: 'Entity Type', render: (r) => {
      const [label, icon, tone] = entityOf(r.entityType);
      return <span className="hs-etype"><span className={`hs-etype__ico hs-pt-${tone}`}><Glyph name={icon} size={15} /></span>{label}</span>;
    }, nowrap: true },
    { key: 'entity', label: 'Entity', render: (r) => (r.entityName
      ? <button type="button" className="hs-linkbtn hs-linkbtn--under" onClick={() => setDetail(r)}>{r.entityName}</button>
      : <span className="hs-muted">{r.entityId ? 'Removed' : '—'}</span>) },
    { key: 'desc', label: 'Description', render: (r) => <span className="hs-wrap2 hs-wrap2--wide">{r.description}</span> },
    { key: 'changes', label: 'Changes', render: (r) => <Changes r={r} /> },
    { key: 'ip', label: 'IP Address', render: (r) => <span className="hs-mono">{ipOf(r.ip)}</span>, nowrap: true },
  ];

  const csvCols = [
    { label: 'Date', value: (r) => stamp(r.createdAt) }, { label: 'By', value: (r) => r.userName }, { label: 'Role', value: (r) => words(r.role) },
    { label: 'Action', value: (r) => words(r.actionType) }, { label: 'Entity type', value: (r) => entityOf(r.entityType)[0] },
    { label: 'Entity', value: (r) => r.entityName || '' }, { label: 'Hostel', value: (r) => r.hostelName || '' },
    { label: 'Description', value: (r) => r.description },
    { label: 'Changes', value: (r) => changesOf(r).map((c) => `${c.k}: ${full(c.from)} -> ${full(c.to)}`).join('; ') },
    { label: 'IP', value: (r) => r.ip },
  ];
  const exportAll = async () => {
    try { const res = await api.getBoard('audit', { ...state, page: 1, limit: 5000 }); exportCsv('hostel-activity-log.csv', csvCols, (res.data ?? res).rows || []); }
    catch (err) { toast.error(err.message); }
  };

  const topNames = (t.topEntities || []).map((e) => entityOf(e)[0].toLowerCase());
  const screen = detail ? entityOf(detail.entityType)[3] : null;

  return (
    <div className="hs-page">
      <PageHead title="Hostel Activity Log" subtitle="Track all important changes, actions and activities across the hostel module. Read-only audit trail for transparency and accountability.">
        <Btn icon="download" onClick={exportAll}>Export CSV</Btn>
      </PageHead>

      <Kpis cols={4} size="lg">
        <Kpi tone="blue" icon="doc" value={t.total ?? 0} label="Total Activities" delta={t.delta} />
        <Kpi tone="green" icon="person" value={t.admins ?? 0} label="Active Admins" note="active in the last 30 days" />
        <Kpi tone="amber" icon="settings" value={t.entities ?? 0} label="Entity Types" note={topNames.length ? `${topNames.join(', ')}…` : 'none yet'} />
        <Kpi tone="violet" icon="clockSolid" value={`${t.days ?? 0} days`} label="Data Retention" note={t.oldest ? `kept in full since ${fmtDate(t.oldest)}` : 'nothing logged yet'} />
      </Kpis>

      <FilterBar card title="Filters" below={(
        <>
          <FSearch compact value={draft.search} onChange={(v) => setDraft((d) => ({ ...d, search: v }))} placeholder="Search by description, entity name or admin..." grow={0} width="300px" />
          <span className="hs-filters__gap" />
          <Btn kind="primary" icon="filter" onClick={apply} className={dirty ? 'is-dirty' : ''}>Apply Filters</Btn>
          <Btn icon="refresh" onClick={clear}>Reset</Btn>
        </>
      )}>
        <FSelect value={draft.entity} onChange={(v) => setDraft((d) => ({ ...d, entity: v }))} all="All entities" options={(o.entities || []).map((e) => ({ value: e, label: entityOf(e)[0] }))} grow={1} width="170px" />
        <FSelect value={draft.action} onChange={(v) => setDraft((d) => ({ ...d, action: v }))} all="All actions" options={(o.actions || []).map((a) => ({ value: a, label: words(a) }))} grow={1} width="170px" />
        <FSelect value={draft.user} onChange={(v) => setDraft((d) => ({ ...d, user: v }))} all="All admins" options={o.users || []} grow={1} width="170px" />
        <FSelect value={draft.hostel} onChange={(v) => setDraft((d) => ({ ...d, hostel: v }))} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={1} width="170px" />
        <FDateRange from={draft.from} to={draft.to} onChange={(v) => setDraft((d) => ({ ...d, ...v }))} grow={1} width="300px" />
      </FilterBar>

      <ListCard>
        <BulkBar count={selected.size} noun="entry" plural="entries" onClear={() => setSelected(new Set())}>
          <Btn size="sm" icon="download" onClick={() => exportCsv('hostel-activity-log.csv', csvCols, rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
        </BulkBar>
        <DataTable
          columns={columns} rows={rows} loading={loading} pad={7} headPad={11} dense
          selected={selected} onSelect={setSelected} onRowClick={(r) => setDetail(r)}
          empty={<EmptyRows icon="doc" title="No activity matches">Try a wider date range, or clear the filters.</EmptyRows>}
        />
        <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
          noun={data?.total === 1 ? 'activity' : 'activities'} onPage={setPage} size="sm" sizes={[10, 25, 50, 100]} onLimit={(n) => set({ limit: n })} />
      </ListCard>

      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Activity">
        {detail ? (
          <>
            <DrawerHead mark={<Mark name={entityOf(detail.entityType)[1]} tone={entityOf(detail.entityType)[2]} size={52} glyph={26} />}
              name={detail.description} sub={`${stamp(detail.createdAt)} · ${detail.userName}`}
              tags={<><Badge tone={ACTION[detail.actionType] || 'slate'}>{words(detail.actionType)}</Badge><Badge tone="slate">{entityOf(detail.entityType)[0]}</Badge></>}
              onClose={() => setDetail(null)} />
            <DrawerBody>
              <DrawerSection title="Who and where">
                <DrawerFields fields={[
                  ['By', detail.userName], ['Role', words(detail.role)], ['Record', detail.entityName || (detail.entityId ? 'No longer exists' : '')],
                  ['Hostel', detail.hostelName], ['IP address', ipOf(detail.ip)], ['Browser', detail.userAgent],
                ]} />
              </DrawerSection>
              {changesOf(detail).length ? (
                <DrawerSection title="What changed">
                  <table className="hs-difftable">
                    <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                    <tbody>
                      {changesOf(detail).map((c) => (
                        <tr key={c.k}><th scope="row">{field(c.k)}</th><td>{full(c.from)}</td><td>{full(c.to)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </DrawerSection>
              ) : null}
              {detail.meta && Object.keys(detail.meta).length ? (
                <DrawerSection title="Details"><DrawerFields fields={Object.entries(detail.meta).map(([k, v]) => [field(k), full(v)])} /></DrawerSection>
              ) : null}
            </DrawerBody>
            {screen ? (
              <DrawerFoot>
                <Btn as={Link} kind="primary" iconRight="arrowRight" to={`/admin/hostel/${screen}`}>Open {entityOf(detail.entityType)[0] === 'Settings' ? 'Settings' : `${words(screen)}`}</Btn>
              </DrawerFoot>
            ) : null}
          </>
        ) : null}
      </Drawer>
    </div>
  );
}
