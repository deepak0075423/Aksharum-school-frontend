/**
 * Hostel → Announcements (Sep 2026 redesign, to the user's mockup).
 *
 * The list of every notice — sent, booked for later, still a draft, put away —
 * from GET /hostel/admin/board/announcements, with the compose form and quick
 * templates beside it. A notice is delivered through the school's notification
 * channels (in-app, and email when asked or when urgent); the server claims it
 * before sending, so a scheduled notice and a "Send now" never both go out.
 * A sent notice cannot be edited or deleted — it has already reached people —
 * so its row offers "Reuse" (a fresh copy in the form) and Archive instead.
 */
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Alert } from '../../../components/ui/index';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { FileLink, useNewFromLink } from '../shared';
import { PageHead, Mark, Glyph, words, count as fmtCount } from './hsUI';
import {
  Kpis, Kpi, FilterBar, FSearch, FSelect, FDateRange, LineTabs, Btn, Kebab, ListCard, DataTable, Pager, EmptyRows, BulkBar,
  Badge, TwoLine, Ico, useListState, useBoardData, useDebounced, exportCsv, fmtDate, fmtTime, fmtMonth,
} from './hsList';
import { MoreFilters, stamp } from './hsTags';
import { FormModal, FormSection } from './hsForm';

const CATEGORY = {
  general: 'blue', mess: 'lavender', maintenance: 'orange', medical: 'pink', discipline: 'amber', leave: 'green',
  documents: 'violet', safety: 'red', fees: 'teal', events: 'sky', other: 'slate',
};
const AUDIENCE = {
  residents: ['Residents', 'sky', 'Every student currently living in the hostel'],
  new_residents: ['New Residents', 'lavender', 'Students who moved in within the last 30 days'],
  parents: ['Parents', 'violet', 'The parents of every current resident'],
  residents_and_parents: ['Residents & Parents', 'indigo', 'Every current resident and their parents'],
  staff: ['Staff', 'teal', 'Wardens and everyone posted to the hostel'],
};
const STATUS = {
  published: ['Published', 'green'], scheduled: ['Scheduled', 'lavender'], sending: ['Sending', 'amber'],
  draft: ['Draft', 'slate'], archived: ['Archived', 'slate'],
};
const Category = ({ value }) => <Badge tone={CATEGORY[value] || 'slate'}>{words(value)}</Badge>;
const Audience = ({ value }) => <Badge tone={AUDIENCE[value]?.[1] || 'slate'}>{AUDIENCE[value]?.[0] || words(value)}</Badge>;
const Status = ({ value }) => { const [t, tone] = STATUS[value] || [words(value), 'slate']; return <Badge tone={tone}>{t}</Badge>; };

const FILTERS = { hostel: '', audience: '', category: '', status: '', from: '', to: '', sort: '', dir: '' };
const blank = {
  id: null, hostel: '', audience: 'residents', category: 'general', title: '', message: '', attachments: [],
  sendEmail: false, urgent: false, schedule: false, scheduledAt: '',
};
/** yyyy-mm-ddThh:mm for <input type="datetime-local">, in local time. */
const localInput = (d) => {
  const x = new Date(d); if (Number.isNaN(x.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
};
const month = new Date().toLocaleString('en-IN', { month: 'long' });

/** Ready-made notices; the first five are the card's, the rest behind "View all". */
const TEMPLATES = [
  { key: 'general', label: 'General announcement', icon: 'megaphone', tone: 'orange', category: 'general',
    title: '', message: 'Dear residents,\n\n' },
  { key: 'fee', label: 'Fee reminder', icon: 'wallet', tone: 'amber', category: 'fees', audience: 'residents_and_parents',
    title: `Hostel fees for ${month}`, message: `This is a reminder that hostel fees for ${month} are due. A late fee applies after the grace period — please pay at the office or online before then.` },
  { key: 'mess', label: 'Mess notice', icon: 'cutlery', tone: 'slate', category: 'mess',
    title: 'Mess notice', message: 'Please note a change to the mess from ____: ' },
  { key: 'maintenance', label: 'Maintenance notice', icon: 'wrench', tone: 'slate', category: 'maintenance',
    title: 'Scheduled maintenance', message: '____ will be unavailable on ____ from ____ to ____ for maintenance. We regret the inconvenience.' },
  { key: 'emergency', label: 'Emergency alert', icon: 'siren', tone: 'red', category: 'safety', urgent: true, sendEmail: true,
    title: 'Emergency alert', message: 'Please follow the wardens’ instructions immediately and stay where you are told. Further updates will follow.' },
  { key: 'holiday', label: 'Holiday / leave notice', icon: 'plane', tone: 'green', category: 'leave', audience: 'residents_and_parents',
    title: 'Hostel closed for the holidays', message: 'The hostel will be closed from ____ to ____. Leave requests must be submitted by ____.' },
  { key: 'health', label: 'Health camp', icon: 'cross', tone: 'green', category: 'medical',
    title: 'Health check-up camp', message: 'A general health check-up camp will be held in the common hall on ____ from ____.' },
  { key: 'docs', label: 'Document submission', icon: 'doc', tone: 'violet', category: 'documents',
    title: 'Documents due', message: 'All residents must submit ____ at the hostel office by ____.' },
  { key: 'discipline', label: 'Discipline notice', icon: 'gavel', tone: 'amber', category: 'discipline',
    title: 'A reminder about hostel rules', message: 'Residents are reminded that ____. Strict action will be taken on repeat offences.' },
  { key: 'visit', label: 'Parents’ visiting day', icon: 'group', tone: 'sky', category: 'events', audience: 'parents',
    title: 'Visiting day', message: 'Parents may visit on ____ between ____ and ____. Please bring the visitor pass.' },
];

/** The compose form's file list: upload on pick, remove with a click. */
function AttachBox({ value, onChange }) {
  const pick = useRef(null);
  const [busy, setBusy] = useState(false);
  const take = async (files) => {
    const list = [...(files || [])];
    if (!list.length) return;
    setBusy(true);
    try {
      const added = [];
      for (const f of list) {
        if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is larger than 5 MB`); continue; }
        const fd = new FormData(); fd.append('file', f);
        const r = await api.uploadAttachment(fd); // eslint-disable-line no-await-in-loop
        added.push((r.data ?? r).storedName);
      }
      if (added.length) onChange([...value, ...added]);
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="hs-attach">
      <button type="button" className="hs-attach__drop" onClick={() => pick.current?.click()} disabled={busy}
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); take(e.dataTransfer?.files); }}>
        <Ico name="paperclip" size={18} />
        <span><span>{busy ? 'Uploading…' : 'Attach files (optional)'}</span><small>PDF, JPG, PNG (Max 5 MB each)</small></span>
      </button>
      <input ref={pick} type="file" multiple hidden accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { take(e.target.files); e.target.value = ''; }} />
      {value.length ? (
        <ul className="hs-attach__list">
          {value.map((f) => (
            <li key={f}><FileLink name={f} max={30} className="" />
              <button type="button" aria-label={`Remove ${f}`} onClick={() => onChange(value.filter((x) => x !== f))}><Ico name="close" size={14} /></button></li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default function Communication() {
  const { state, set, setPage, reset } = useListState({ limit: 10, ...FILTERS });
  const tab = ['published', 'scheduled', 'drafts', 'archived'].includes(state.tab) ? state.tab : 'all';
  const { data, loading, reload } = useBoardData((q) => api.getBoard('announcements', q), state);
  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];

  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState('');
  const [size, setSize] = useState(null);
  const [detail, setDetail] = useState(null);
  const [reports, setReports] = useState(false);
  const [allTemplates, setAllTemplates] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const composeRef = useRef(null);
  const titleRef = useRef(null);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const focusCompose = () => {
    composeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 250);
  };
  const fresh = (extra = {}) => { setForm({ ...blank, ...extra }); focusCompose(); };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(true, () => fresh());

  // How many people the chosen audience is, right now.
  const who = useDebounced(`${form.hostel}|${form.audience}`, 250);
  useEffect(() => {
    let alive = true;
    const [hostel, audience] = who.split('|');
    setSize(null);
    api.getAudienceSize({ hostel: hostel || undefined, audience }).then((r) => alive && setSize((r.data ?? r).count)).catch(() => alive && setSize(null));
    return () => { alive = false; };
  }, [who]);

  const submit = async (mode) => {
    if (!form.title.trim() || !form.message.trim()) { toast.error('Give it a title and a message'); return; }
    if (mode === 'schedule' && !form.scheduledAt) { toast.error('Choose when it should go out'); return; }
    setBusy(mode);
    try {
      const body = {
        hostel: form.hostel || null, audience: form.audience, category: form.category, title: form.title.trim(), message: form.message.trim(),
        attachments: form.attachments, sendEmail: form.sendEmail, urgent: form.urgent, mode,
        scheduledAt: mode === 'schedule' ? new Date(form.scheduledAt).toISOString() : null,
      };
      const r = form.id ? await api.updateAnnouncement(form.id, body) : await api.createAnnouncement(body);
      const d = r.data ?? r;
      toast.success(mode === 'send' ? `Sent to ${fmtCount(d.recipients ?? d.sent ?? 0)} ${(d.recipients ?? d.sent) === 1 ? 'person' : 'people'}`
        : mode === 'schedule' ? `Scheduled for ${stamp(d.scheduledAt)}` : 'Saved as a draft');
      setForm(blank); setConfirm(null); reload();
      if (detail?._id === d._id) setDetail(d);
    } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  };
  // Sending reaches people at once, so it asks first; a schedule or a draft does not.
  const onSend = (e) => {
    e.preventDefault();
    if (form.schedule) { submit('schedule'); return; }
    if (!form.title.trim() || !form.message.trim()) { toast.error('Give it a title and a message'); return; }
    setConfirm({ kind: 'compose' });
  };

  const edit = (r) => {
    setDetail(null);
    setForm({
      id: r._id, hostel: r.hostelId || '', audience: r.audience, category: r.category, title: r.title, message: r.message,
      attachments: r.attachments || [], sendEmail: !!r.sendEmail, urgent: !!r.urgent,
      schedule: r.status === 'scheduled', scheduledAt: r.scheduledAt ? localInput(r.scheduledAt) : '',
    });
    focusCompose();
  };
  const reuse = (r) => {
    setDetail(null);
    fresh({ hostel: r.hostelId || '', audience: r.audience, category: r.category, title: r.title, message: r.message, attachments: r.attachments || [], sendEmail: !!r.sendEmail, urgent: !!r.urgent });
  };
  const applyTemplate = (t) => {
    setAllTemplates(false);
    fresh({ category: t.category, audience: t.audience || 'residents', title: t.title, message: t.message, urgent: !!t.urgent, sendEmail: !!t.sendEmail });
  };

  const step = async (r, what) => {
    setBusy(what);
    try {
      const fn = { send: api.sendAnnouncementNow, archive: api.archiveAnnouncement, restore: api.restoreAnnouncement, delete: api.deleteAnnouncement }[what];
      const res = await fn(r._id); const d = res.data ?? res;
      toast.success(what === 'send' ? `Sent to ${fmtCount(d.recipients || 0)} people` : what === 'archive' ? 'Archived' : what === 'restore' ? 'Restored' : 'Deleted');
      setConfirm(null); reload();
      if (detail?._id === r._id) setDetail(what === 'delete' ? null : { ...detail, ...d });
      if (what === 'delete' && form.id === r._id) setForm(blank);
    } catch (err) { toast.error(err.message); } finally { setBusy(''); }
  };

  const t = data?.tiles || {};
  const tabs = data?.tabs || {};
  const rows = data?.rows || [];
  const from = ((data?.page || 1) - 1) * (data?.limit || state.limit);
  const filtered = !!(state.search || Object.keys(FILTERS).some((k) => state[k]));
  const unsent = (r) => ['draft', 'scheduled'].includes(r.status);
  const hostelLabel = (r) => (r.hostelName || (r.hostelCount ? `${r.hostelCount} hostels` : 'All hostels'));

  const columns = [
    { key: 'n', label: '#', render: (r, i) => from + i + 1, className: 'hs-table__num' },
    { key: 'title', label: 'Title', render: (r) => (
      <span className="hs-clip hs-clip--wide">
        <TwoLine top={<>{r.urgent ? <Glyph name="siren" size={14} /> : null}{r.title}</>} sub={r.message} strong />
      </span>
    ) },
    { key: 'cat', label: 'Category', render: (r) => <Category value={r.category} /> },
    { key: 'aud', label: 'Audience', render: (r) => <Audience value={r.audience} /> },
    { key: 'status', label: 'Status', render: (r) => <Status value={r.status} /> },
    { key: 'at', label: 'Sent / Scheduled', nowrap: true, render: (r) => {
      const at = r.publishedAt || r.scheduledAt;
      if (!at) return <span className="hs-muted">—</span>;
      return (
        <span className="hs-three">
          <span>{fmtDate(at)}</span><span>{fmtTime(at)}</span>
          <small>{r.publishedAt ? `by ${r.publishedByName || r.createdByName || '—'}` : `by ${r.createdByName || '—'}`}</small>
        </span>
      );
    } },
  ];

  const csvCols = [
    { label: 'Title', value: (r) => r.title }, { label: 'Message', value: (r) => r.message }, { label: 'Category', value: (r) => words(r.category) },
    { label: 'Audience', value: (r) => AUDIENCE[r.audience]?.[0] }, { label: 'Hostel', value: (r) => hostelLabel(r) },
    { label: 'Status', value: (r) => STATUS[r.status]?.[0] }, { label: 'Sent', value: (r) => stamp(r.publishedAt) },
    { label: 'Scheduled for', value: (r) => stamp(r.scheduledAt) }, { label: 'Recipients', value: (r) => (r.publishedAt ? r.recipients : '') },
    { label: 'Urgent', value: (r) => (r.urgent ? 'Yes' : '') }, { label: 'By', value: (r) => r.publishedByName || r.createdByName },
  ];

  const menu = (r) => [
    unsent(r) && { label: 'Send now', icon: 'send', onClick: () => setConfirm({ kind: 'row', r }) },
    unsent(r) && { label: 'Edit', icon: 'pencil', onClick: () => edit(r) },
    { label: 'Reuse as a new announcement', icon: 'copy', onClick: () => reuse(r) },
    '-',
    !['archived', 'sending'].includes(r.status) && { label: 'Archive', icon: 'archive', onClick: () => step(r, 'archive') },
    r.status === 'archived' && { label: 'Restore', icon: 'refresh', onClick: () => step(r, 'restore') },
    (unsent(r) || (r.status === 'archived' && r.archivedFrom !== 'published')) && { label: 'Delete', icon: 'trash', danger: true, onClick: () => setConfirm({ kind: 'delete', r }) },
  ].filter(Boolean);

  const aud = AUDIENCE[form.audience];
  const catMax = Math.max(1, ...Object.values(t.byCategory || {}));
  const audMax = Math.max(1, ...Object.values(t.byAudience || {}));

  return (
    <div className="hs-page">
      <PageHead title="Hostel Announcements" subtitle="Reach residents, parents and staff through the school’s existing notification channels.">
        <Btn className="hs-btn--accent" icon="barsUp" onClick={() => setReports(true)}>View Reports</Btn>
        <Btn kind="primary" icon="plus" onClick={() => fresh()}>New Announcement</Btn>
      </PageHead>

      <div className="hs-twocol">
        <div className="hs-twocol__main">
          <Kpis cols={4}>
            <Kpi tone="indigo" icon="megaphone" value={t.total ?? 0} label="Total Announcements" delta={t.delta} />
            <Kpi tone="green" icon="send" value={t.published ?? 0} label="Sent Successfully" pct={t.publishedPct ?? 0}
              pctLabel={<>{t.publishedPct ?? 0}% <span className="hs-muted">of total</span></>} pctTone="green" bar barColor="#12b76a" />
            <Kpi tone="amber" icon="clockSolid" value={t.scheduled ?? 0} label="Scheduled" pct={t.scheduledPct ?? 0} pctTone="amber" bar barColor="#f79009" />
            <Kpi tone="red" icon="alarm" value={t.drafts ?? 0} label="Drafts" pct={t.draftsPct ?? 0} pctTone="red" bar barColor="#f04438" />
          </Kpis>

          <LineTabs rule value={tab} onChange={(k) => { set({ tab: k }); setSelected(new Set()); }} label="Announcements by status"
            items={[
              { key: 'all', label: 'All Announcements', count: tabs.all ?? 0 },
              { key: 'published', label: 'Published', count: tabs.published ?? 0, tone: 'good' },
              { key: 'scheduled', label: 'Scheduled', count: tabs.scheduled ?? 0, tone: 'warn' },
              { key: 'drafts', label: 'Drafts', count: tabs.drafts ?? 0, tone: 'bad' },
              { key: 'archived', label: 'Archived', count: tabs.archived ?? 0 },
            ]} />

          <FilterBar below={(
            <>
              <FDateRange from={state.from} to={state.to} onChange={(v) => set(v)} grow={0} width="252px" />
              <FSearch compact value={state.search} onChange={(v) => set({ search: v })} placeholder="Search by title or message..." grow={1} width="220px" />
              <MoreFilters groups={[
                { key: 'sort', title: 'Order', value: state.sort ? `${state.sort}:${state.dir}` : '', onPick: (v) => { const [s, d] = v.split(':'); set({ sort: s || '', dir: d || '' }); },
                  options: [['', 'Newest first'], ['at:desc', 'By send date'], ['created:asc', 'Oldest first'], ['title:asc', 'Title A–Z']] },
              ]} />
              <Btn icon="refresh" onClick={() => { reset(); setSelected(new Set()); }}>Reset</Btn>
            </>
          )}>
            <FSelect value={state.hostel} onChange={(v) => set({ hostel: v })} all="All hostels" options={hostels.map((h) => ({ value: h._id, label: h.name }))} grow={0} width="148px" />
            <FSelect value={state.audience} onChange={(v) => set({ audience: v })} all="All audiences" options={Object.entries(AUDIENCE).map(([value, [label]]) => ({ value, label }))} grow={0} width="148px" />
            <FSelect value={state.category} onChange={(v) => set({ category: v })} all="All categories" options={Object.keys(CATEGORY).map((c) => ({ value: c, label: words(c) }))} grow={0} width="148px" />
            <FSelect value={state.status} onChange={(v) => set({ status: v })} all="All statuses" options={[['published', 'Published'], ['scheduled', 'Scheduled'], ['drafts', 'Draft'], ['archived', 'Archived']].map(([value, label]) => ({ value, label }))} grow={0} width="124px" />
          </FilterBar>

          <ListCard>
            <BulkBar count={selected.size} noun="announcement" onClear={() => setSelected(new Set())}>
              <Btn size="sm" icon="download" onClick={() => exportCsv('hostel-announcements.csv', csvCols, rows.filter((r) => selected.has(String(r._id))))}>Export CSV</Btn>
            </BulkBar>
            <DataTable
              columns={columns} rows={rows} loading={loading} pad={9} headPad={12} dense
              selected={selected} onSelect={setSelected}
              actions={(r) => (
                <>
                  <Btn size="sm" icon="eye" onClick={() => setDetail(r)}>View</Btn>
                  {unsent(r)
                    ? <Btn size="sm" icon="pencil" onClick={() => edit(r)}>Edit</Btn>
                    : <Btn size="sm" icon="copy" onClick={() => reuse(r)} title="A sent announcement cannot change — start a new one from it">Reuse</Btn>}
                  <Kebab label={`Actions for ${r.title}`} items={menu(r)} />
                </>
              )}
              empty={(
                <EmptyRows icon="megaphone" title={filtered || tab !== 'all' ? 'No announcement matches' : 'No announcements yet'}
                  action={filtered ? <Btn icon="refresh" onClick={reset}>Reset filters</Btn> : <Btn kind="primary" icon="plus" onClick={() => fresh()}>New Announcement</Btn>}>
                  {filtered || tab !== 'all' ? 'Try another tab, or clear the filters.' : 'Notices to residents, parents and staff are written and kept here.'}
                </EmptyRows>
              )}
            />
            <Pager page={data?.page || 1} pages={data?.pages || 1} total={data?.total || 0} limit={data?.limit || state.limit}
              noun={data?.total === 1 ? 'announcement' : 'announcements'} onPage={setPage} size="sm" sizes={[10, 25, 50]} onLimit={(n) => set({ limit: n })} />
          </ListCard>
        </div>

        <aside className="hs-twocol__side">
          {/* ── Compose ───────────────────────────────────────────────────── */}
          <form className="hs-card hs-compose" ref={composeRef} onSubmit={onSend} aria-label="Compose announcement">
            <div className="hs-compose__head">
              <h2><Ico name="send" size={18} />{form.id ? 'Edit Announcement' : 'Compose Announcement'}</h2>
              {form.id || form.title || form.message ? <button type="button" className="hs-linkbtn" onClick={() => setForm(blank)}>{form.id ? 'Cancel edit' : 'Clear'}</button> : null}
            </div>
            <label className="hs-fld"><span>Hostel</span>
              <select className="form-control" value={form.hostel} onChange={(e) => setF('hostel', e.target.value)}>
                <option value="">All hostels</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </label>
            <label className="hs-fld"><span>Audience</span>
              <select className="form-control" value={form.audience} onChange={(e) => setF('audience', e.target.value)}>
                {Object.entries(AUDIENCE).map(([v, [l]]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <small>{aud?.[2]}{size != null ? ` · ${fmtCount(size)} ${size === 1 ? 'person' : 'people'}` : ''}</small>
            </label>
            <label className="hs-fld"><span>Category</span>
              <select className="form-control" value={form.category} onChange={(e) => setF('category', e.target.value)}>
                {Object.keys(CATEGORY).map((c) => <option key={c} value={c}>{words(c)}</option>)}
              </select>
            </label>
            <label className="hs-fld"><span className="is-req">Title</span>
              <input ref={titleRef} className="form-control" maxLength={140} value={form.title} placeholder="Enter announcement title" onChange={(e) => setF('title', e.target.value)} />
            </label>
            <label className="hs-fld"><span className="is-req">Message</span>
              <textarea className="form-control" rows={4} value={form.message} placeholder="Write your message here..." onChange={(e) => setF('message', e.target.value)} />
            </label>
            <AttachBox value={form.attachments} onChange={(v) => setF('attachments', v)} />
            <div className="hs-compose__checks">
              <label><input type="checkbox" className="hs-check" checked={form.sendEmail} onChange={(e) => setF('sendEmail', e.target.checked)} />Also send via email</label>
              <label><input type="checkbox" className="hs-check" checked={form.urgent} onChange={(e) => setF('urgent', e.target.checked)} />Mark as urgent</label>
              <label><input type="checkbox" className="hs-check" checked={form.schedule} onChange={(e) => setF('schedule', e.target.checked)} />Schedule for later</label>
            </div>
            {form.urgent ? <p className="hs-compose__note">Urgent notices are always emailed too, and marked 🚨.</p> : null}
            {form.schedule ? (
              <label className="hs-fld"><span className="is-req">Send on</span>
                <input className="form-control" type="datetime-local" min={localInput(Date.now())} value={form.scheduledAt} onChange={(e) => setF('scheduledAt', e.target.value)} />
              </label>
            ) : null}
            <div className="hs-compose__acts">
              <Btn type="button" onClick={() => submit('draft')} disabled={!!busy}>{busy === 'draft' ? 'Saving…' : 'Save as Draft'}</Btn>
              <Btn type="submit" kind="primary" icon={form.schedule ? 'clock' : 'send'} disabled={!!busy}>
                {busy === 'send' || busy === 'schedule' ? 'Working…' : form.schedule ? 'Schedule' : 'Send Announcement'}
              </Btn>
            </div>
          </form>

          {/* ── Quick templates ───────────────────────────────────────────── */}
          <section className="hs-card hs-templates" aria-label="Quick templates">
            <div className="hs-compose__head">
              <div><h2>Quick Templates</h2><p>Use a template to get started quickly.</p></div>
              <button type="button" className="hs-linkbtn" onClick={() => setAllTemplates(true)}>View all</button>
            </div>
            <ul>
              {TEMPLATES.slice(0, 5).map((x) => (
                <li key={x.key}>
                  <span className={`hs-templates__ico hs-pt-${x.tone}`}><Glyph name={x.icon} size={17} /></span>
                  <span>{x.label}</span>
                  <button type="button" className="hs-linkbtn" onClick={() => applyTemplate(x)}>Use</button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      {/* ── One announcement ───────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Announcement">
        {detail ? (
          <>
            <DrawerHead mark={<Mark name={detail.urgent ? 'siren' : 'megaphone'} tone={detail.urgent ? 'red' : 'indigo'} size={52} glyph={26} />}
              name={detail.title}
              sub={detail.publishedAt ? `Sent ${stamp(detail.publishedAt)} by ${detail.publishedByName || detail.createdByName}`
                : detail.scheduledAt ? `Goes out ${stamp(detail.scheduledAt)}` : `Draft by ${detail.createdByName || '—'}`}
              tags={<><Status value={detail.status} /><Category value={detail.category} /><Audience value={detail.audience} />{detail.urgent ? <Badge tone="red">Urgent</Badge> : null}</>}
              onClose={() => setDetail(null)} />
            <DrawerBody>
              {detail.lastError ? <Alert variant="warning">{detail.lastError}</Alert> : null}
              <DrawerSection title="Message"><p className="hs-dtext">{detail.message}</p></DrawerSection>
              <DrawerSection title="Delivery">
                <DrawerFields fields={[
                  ['Hostel', hostelLabel(detail)], ['Audience', AUDIENCE[detail.audience]?.[0]],
                  ['Reached', detail.publishedAt ? `${fmtCount(detail.recipients)} ${detail.recipients === 1 ? 'person' : 'people'}` : 'Not sent yet'],
                  ['Email copy', detail.sendEmail || detail.urgent ? 'Yes' : 'No'],
                  ['Written', `${stamp(detail.createdAt)}${detail.createdByName ? ` by ${detail.createdByName}` : ''}`],
                  ['Archived from', detail.status === 'archived' ? STATUS[detail.archivedFrom]?.[0] : ''],
                ]} />
              </DrawerSection>
              {detail.attachments?.length ? (
                <DrawerSection title={`Attachments (${detail.attachments.length})`}>
                  <div className="hs-chips">{detail.attachments.map((f) => <FileLink key={f} name={f} />)}</div>
                </DrawerSection>
              ) : null}
            </DrawerBody>
            <DrawerFoot>
              <Kebab label="More" items={menu(detail).filter((x) => x === '-' || !['Send now', 'Edit'].includes(x.label))} />
              {unsent(detail) ? <Btn icon="pencil" onClick={() => edit(detail)}>Edit</Btn> : <Btn icon="copy" onClick={() => reuse(detail)}>Reuse</Btn>}
              {unsent(detail) ? <Btn kind="primary" icon="send" onClick={() => setConfirm({ kind: 'row', r: detail })}>Send now</Btn> : null}
            </DrawerFoot>
          </>
        ) : null}
      </Drawer>

      {/* ── Confirmations ──────────────────────────────────────────────────── */}
      <FormModal open={!!confirm} onClose={() => setConfirm(null)} busy={!!busy} width={500}
        onSubmit={() => (confirm.kind === 'compose' ? submit('send') : step(confirm.r, confirm.kind === 'delete' ? 'delete' : 'send'))}
        icon={confirm?.kind === 'delete' ? 'trash' : 'send'} iconTone={confirm?.kind === 'delete' ? 'red' : 'indigo'}
        title={confirm?.kind === 'delete' ? 'Delete Announcement' : 'Send Announcement Now'}
        submitLabel={confirm?.kind === 'delete' ? 'Delete' : 'Send Now'} submitIcon={confirm?.kind === 'delete' ? undefined : 'send'}
        tone={confirm?.kind === 'delete' ? 'danger' : undefined}>
        {confirm ? (
          <FormSection>
            {confirm.kind === 'delete'
              ? <p className="hsf-msg"><strong>{confirm.r.title}</strong> was never sent, so it is removed for good.</p>
              : (() => {
                const x = confirm.kind === 'compose' ? form : confirm.r;
                const n = confirm.kind === 'compose' && size != null ? ` — ${fmtCount(size)} ${size === 1 ? 'person' : 'people'} at the moment` : '';
                return <p className="hsf-msg"><strong>{x.title}</strong> goes to {AUDIENCE[x.audience]?.[0].toLowerCase()}{n}, in the app{x.sendEmail || x.urgent ? ' and by email' : ''}. It cannot be taken back once sent.</p>;
              })()}
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Reports ────────────────────────────────────────────────────────── */}
      <Drawer open={reports} onClose={() => setReports(false)} label="Announcement reports">
        <DrawerHead mark={<Mark name="barsUp" tone="indigo" size={52} glyph={26} />} name="Announcement Reports" sub="Who has been reached, and with what" onClose={() => setReports(false)} />
        <DrawerBody>
          <div className="hs-dstats">
            <div><strong>{fmtCount(t.reached || 0)}</strong><span>deliveries in all</span></div>
            <div><strong>{fmtCount(t.published || 0)}</strong><span>sent</span></div>
            <div><strong>{fmtCount(t.urgent || 0)}</strong><span>urgent</span></div>
          </div>
          <DrawerSection title="By month (sent · people reached)">
            {(t.months || []).length ? (
              <ul className="hs-hbars">
                {t.months.map((m) => (
                  <li key={m.month}><span>{fmtMonth(m.month)}</span><span className="hs-bar"><i style={{ '--pct': `${Math.round((m.reached / Math.max(1, ...t.months.map((x) => x.reached))) * 100)}%`, '--bar': '#5b4ff5' }} /></span><b>{m.sent} · {fmtCount(m.reached)}</b></li>
                ))}
              </ul>
            ) : <p className="hs-muted">Nothing sent in the last six months.</p>}
          </DrawerSection>
          <DrawerSection title="By category">
            <ul className="hs-hbars">
              {Object.entries(t.byCategory || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k}><span>{words(k)}</span><span className="hs-bar"><i style={{ '--pct': `${Math.round((v / catMax) * 100)}%`, '--bar': '#2b8ef0' }} /></span><b>{v}</b></li>
              ))}
            </ul>
          </DrawerSection>
          <DrawerSection title="By audience">
            <ul className="hs-hbars">
              {Object.entries(t.byAudience || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <li key={k}><span>{AUDIENCE[k]?.[0] || words(k)}</span><span className="hs-bar"><i style={{ '--pct': `${Math.round((v / audMax) * 100)}%`, '--bar': '#12b76a' }} /></span><b>{v}</b></li>
              ))}
            </ul>
          </DrawerSection>
          <Btn icon="download" onClick={async () => {
            try { const res = await api.getBoard('announcements', { ...state, page: 1, limit: 5000 }); exportCsv('hostel-announcements.csv', csvCols, (res.data ?? res).rows || []); }
            catch (err) { toast.error(err.message); }
          }}>Export the list as CSV</Btn>
        </DrawerBody>
      </Drawer>

      {/* ── Every template ─────────────────────────────────────────────────── */}
      <Drawer open={allTemplates} onClose={() => setAllTemplates(false)} label="Templates">
        <DrawerHead mark={<Mark name="doc" tone="indigo" size={52} glyph={26} />} name="Templates" sub="Pick one; you can change every word before it goes out" onClose={() => setAllTemplates(false)} />
        <DrawerBody>
          <ul className="hs-thread">
            {TEMPLATES.map((x) => (
              <li key={x.key}>
                <div><strong>{x.label}</strong><button type="button" className="hs-linkbtn" onClick={() => applyTemplate(x)}>Use</button></div>
                <p>{x.message.trim() || 'A blank notice, addressed to the residents.'}</p>
                <p className="hs-muted">{words(x.category)} · {AUDIENCE[x.audience || 'residents'][0]}{x.urgent ? ' · urgent' : ''}</p>
              </li>
            ))}
          </ul>
        </DrawerBody>
      </Drawer>
    </div>
  );
}
