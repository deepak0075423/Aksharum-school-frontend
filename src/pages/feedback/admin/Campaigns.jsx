/**
 * Teacher Feedback → Campaigns.
 *
 * The register of every evaluation drive the school has run. A campaign is the
 * only thing in this module with a lifecycle — Draft → Scheduled → Active →
 * Completed → Archived — so a row's actions are not a fixed set of buttons:
 * what you can do depends entirely on where it sits in that line, and a row
 * offering "Close" to a draft would be offering nothing.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Acts, Bar, Crumbs, EmptyState, Foot, Hero, IconBtn, Menu, MenuItem,
  MenuSep, NoteBar, Pick, Rating, Search, SortBy, Spacer, Stack, Stat, Stats,
  Table, Tag, TextBtn, Toolbar, daysLeft, fmtDate,
} from './fbUI';
import { CampaignPill, homeFor, useFeedbackBase } from './feedbackParts';
import { CampaignConfirm, CampaignForm, blankCampaign, toCampaignForm } from './campaignParts';

const STATUSES = [
  { value: 'active',    label: 'Collecting now' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'draft',     label: 'Draft' },
  { value: 'closed',    label: 'Completed' },
  { value: 'archived',  label: 'Archived' },
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'name',   label: 'Name (A–Z)' },
  { value: 'rate',   label: 'Response rate' },
  { value: 'rating', label: 'Average rating' },
];

export default function Campaigns() {
  const base = useFeedbackBase();
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [meta, setMeta] = useState(null);
  const [settings, setSettings] = useState(null);

  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const limit = 10;

  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState('');

  /**
   * The whole register comes down once and filters in the browser.
   *
   * `includeArchived` is always on: the Archived filter has to be able to show
   * something, and archived drives still belong in the counts above — a school
   * that ran six campaigns and archived four did not run two. 100 is the
   * server's ceiling per page; the total comes back too, and the page says so
   * rather than quietly showing a prefix.
   */
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const body = (await api.getCampaigns({ limit: 100, includeArchived: true })).data;
      setRows(body?.data || []);
      setTotal(body?.total ?? (body?.data || []).length);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.getMeta().then((r) => setMeta(r.data ?? r)).catch(() => {});
    api.getSettings().then((r) => setSettings(r.data ?? r)).catch(() => {});
  }, []);
  useEffect(() => {
    const id = setTimeout(() => { setTerm(search.trim().toLowerCase()); setPage(1); }, 250);
    return () => clearTimeout(id);
  }, [search]);

  const counts = useMemo(() => ({
    all: rows.length,
    active: rows.filter((r) => r.status === 'active').length,
    scheduled: rows.filter((r) => r.status === 'scheduled').length,
    draft: rows.filter((r) => r.status === 'draft').length,
    closed: rows.filter((r) => r.status === 'closed').length,
    archived: rows.filter((r) => r.status === 'archived').length,
    responses: rows.reduce((n, r) => n + (r.submitted || 0), 0),
    asked: rows.reduce((n, r) => n + (r.assigned || 0), 0),
  }), [rows]);

  const filtered = useMemo(() => {
    // Archived drives are hidden unless asked for by name. They are history the
    // admin deliberately put away; leaving them in the default list would undo
    // the only thing archiving does.
    const out = rows.filter((r) => {
      if (status) { if (r.status !== status) return false; }
      else if (r.status === 'archived') return false;
      if (term && !`${r.name} ${r.term || ''} ${r.description || ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
    return [...out].sort((a, b) => {
      switch (sort) {
        case 'oldest': return new Date(a.startDate) - new Date(b.startDate);
        case 'name':   return a.name.localeCompare(b.name);
        case 'rate':   return (b.responseRate || 0) - (a.responseRate || 0);
        case 'rating': return (b.avgRating ?? -1) - (a.avgRating ?? -1);
        default:       return new Date(b.startDate) - new Date(a.startDate);
      }
    });
  }, [rows, status, term, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = filtered.slice(start, start + limit);
  const anyFilter = !!term || !!status;
  const clear = () => { setSearch(''); setTerm(''); setStatus(''); setPage(1); };
  const pick = (v) => { setStatus(status === v ? '' : v); setPage(1); };

  // ── Actions ────────────────────────────────────────────────────────────────
  const duplicate = async (row) => {
    setBusy(row._id);
    try {
      await api.duplicateCampaign(row._id, {});
      toast.success(`Copied — “${row.name}” is now a fresh draft you can edit`);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  const run = async () => {
    if (!pending) return;
    const { row, action } = pending;
    setBusy(row._id);
    try {
      if (action === 'activate') {
        const d = (await api.activateCampaign(row._id)).data;
        toast.success(d?.status === 'scheduled'
          ? `Scheduled — it opens on ${fmtDate(row.startDate)}`
          : `Started — ${d?.created ?? 0} student assignment(s) created`);
      } else if (action === 'close') {
        await api.closeCampaign(row._id); toast.success('Closed — the results stay available');
      } else if (action === 'archive') {
        await api.archiveCampaign(row._id); toast.success('Archived');
      } else if (action === 'delete') {
        await api.deleteCampaign(row._id); toast.success('Draft deleted');
      } else if (action === 'reminders') {
        const d = (await api.sendReminders(row._id)).data;
        toast.success(`Reminder sent to ${d?.reminded ?? 0} student(s)`);
      } else if (action === 'sync') {
        const d = (await api.syncAssignments(row._id)).data;
        toast.success(d?.created
          ? `${d.created} new assignment(s) created`
          : 'Already up to date — no new students to add');
      }
      setPending(null);
      load();
    } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };

  const save = async (f) => {
    setSaving(true); setFormErr('');
    try {
      if (f._id) { await api.updateCampaign(f._id, f); toast.success('Campaign saved'); }
      else       { await api.createCampaign(f); toast.success('Created as a draft — start it when you are ready'); }
      setForm(null);
      load();
    } catch (e) { setFormErr(e.message); } finally { setSaving(false); }
  };

  const closingSoon = rows.filter((r) => {
    if (r.status !== 'active') return false;
    const d = daysLeft(r.endDate);
    return d != null && d >= 0 && d <= 3 && r.assigned > r.submitted;
  });

  if (loading && !rows.length) {
    return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;
  }

  return (
    <div className="fbpage">
      <Crumbs here="Campaigns" trail={[{ to: `${base}/overview`, label: 'Teacher Feedback' }]}
        home={homeFor(base)} />

      <Hero icon="megaphone" tone="purple" title="Feedback Campaigns"
        subtitle="Create and run teacher evaluation drives, and see how many students have answered.">
        <Link to={`${base}/questions?view=templates`} className="fbtb">
          <Icon name="clipboard" size={14} /> Templates
        </Link>
        <button type="button" className="fbtb fbtb--primary" disabled={!meta}
          onClick={() => { setFormErr(''); setForm(blankCampaign(meta, settings)); }}>
          <Icon name="plus" size={15} /> New Campaign
        </button>
      </Hero>

      <Stats>
        <Stat icon="megaphone" tone="purple" value={counts.all} label="Total Campaigns"
          caption={counts.archived ? `${counts.archived} archived` : 'None archived'}
          onClick={() => pick('')} on={!status} />
        <Stat icon="activity" tone="green" value={counts.active} label="Collecting Now"
          caption={closingSoon.length ? `${closingSoon.length} closing within 3 days` : 'Students can answer these'}
          onClick={() => pick('active')} on={status === 'active'} />
        <Stat icon="clipboard" tone="amber" value={counts.draft} label="Drafts"
          caption="Built but not started"
          onClick={() => pick('draft')} on={status === 'draft'} />
        <Stat icon="chat" tone="blue" value={counts.responses} label="Responses Collected"
          caption={counts.asked ? `${Math.round((counts.responses / counts.asked) * 100)}% of everyone asked` : 'Nothing asked yet'} />
      </Stats>

      {error && <NoteBar tone="red" icon="alert">{error}</NoteBar>}

      {total > rows.length && (
        <NoteBar tone="blue" icon="info">
          Showing the {rows.length} most recent of {total} campaigns. Older ones still count towards the
          tiles above and still appear in Insights.
        </NoteBar>
      )}

      {!!closingSoon.length && (
        <NoteBar tone="amber" icon="bell"
          action={closingSoon.length === 1
            ? (
              <TextBtn icon="bell" onClick={() => setPending({ row: closingSoon[0], action: 'reminders' })}>
                Send reminders
              </TextBtn>
            )
            : null}>
          {closingSoon.length === 1
            ? <><b>{closingSoon[0].name}</b> {daysLeft(closingSoon[0].endDate) ? `closes in ${daysLeft(closingSoon[0].endDate)} day(s)` : 'closes today'} and{' '}
              {closingSoon[0].assigned - closingSoon[0].submitted} student(s) have not answered.</>
            : <>{closingSoon.length} campaigns close within three days and still have outstanding responses.
              A reminder is in each row&rsquo;s menu.</>}
        </NoteBar>
      )}

      <div className="fbcard">
        <Toolbar>
          <Search value={search} onChange={setSearch} placeholder="Search campaigns by name or term…" />
          <Pick value={status} onChange={(v) => { setStatus(v); setPage(1); }}
            all="All (except archived)" label="Status" options={STATUSES} />
          <Spacer />
          <SortBy value={sort} onChange={(v) => { setSort(v); setPage(1); }} options={SORTS} dflt="newest" />
        </Toolbar>

        <Table
          loading={loading}
          startIndex={start}
          rows={shown}
          columns={[
            {
              key: 'name', className: 'fbq', label: 'Campaign',
              render: (r) => (
                <Stack main={r.name} to={`${base}/campaigns/${r._id}`}
                  sub={[r.term, r.academicYear?.yearName,
                    `${r.questionCount || 0} question${r.questionCount === 1 ? '' : 's'}`]
                    .filter(Boolean).join(' · ')} />
              ),
            },
            { key: 'status', label: 'Status', render: (r) => <CampaignPill status={r.status} /> },
            {
              key: 'window', label: 'Window',
              render: (r) => {
                const left = daysLeft(r.endDate);
                return (
                  <Stack main={<span className="fbdate">{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</span>}
                    sub={r.status === 'active' && left != null
                      ? (left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : left === 0 ? 'Closes today' : 'Past its closing date')
                      : r.status === 'scheduled' ? `Opens ${fmtDate(r.startDate)}`
                      : r.status === 'draft' ? 'Not started' : 'Finished'} />
                );
              },
            },
            { key: 'responses', label: 'Responses', render: (r) => `${r.submitted} / ${r.assigned}` },
            { key: 'rate', label: 'Response %', render: (r) => <Bar value={r.responseRate} /> },
            { key: 'rating', label: 'Avg Rating', render: (r) => <Rating value={r.avgRating} sub={undefined} /> },
            {
              key: 'privacy', label: 'Privacy',
              render: (r) => (
                <Tag tone={r.isAnonymous ? 'purple' : 'slate'}>
                  {r.isAnonymous ? 'Anonymous' : 'Named'}
                </Tag>
              ),
            },
            {
              key: 'a', className: 'fbtable__acts', label: 'Actions',
              render: (r) => (
                <Acts>
                  <IconBtn icon="eye" label="Open campaign"
                    onClick={() => navigate(`${base}/campaigns/${r._id}`)} />
                  {/* The primary action is whatever this campaign's stage most
                      likely brought the admin here to do. */}
                  {r.status === 'draft' && (
                    <IconBtn icon="power" label="Start collecting" disabled={busy === r._id}
                      onClick={() => setPending({ row: r, action: 'activate' })} />
                  )}
                  {r.status === 'active' && (
                    <IconBtn icon="bell" label="Send reminders" disabled={busy === r._id}
                      onClick={() => setPending({ row: r, action: 'reminders' })} />
                  )}
                  <Menu>
                    <MenuItem icon="eye" to={`${base}/campaigns/${r._id}`}>Open campaign</MenuItem>
                    {['draft', 'scheduled', 'active'].includes(r.status) && (
                      <MenuItem icon="pencil" onClick={() => { setFormErr(''); setForm(toCampaignForm(r)); }}>
                        Edit details
                      </MenuItem>
                    )}
                    {r.status === 'draft' && (
                      <MenuItem icon="power" onClick={() => setPending({ row: r, action: 'activate' })}>
                        Start collecting
                      </MenuItem>
                    )}
                    {['scheduled', 'active'].includes(r.status) && (
                      <MenuItem icon="refresh" onClick={() => setPending({ row: r, action: 'sync' })}>
                        Sync assignments
                      </MenuItem>
                    )}
                    {r.status === 'active' && (
                      <MenuItem icon="bell" onClick={() => setPending({ row: r, action: 'reminders' })}>
                        Send reminders
                      </MenuItem>
                    )}
                    {['scheduled', 'active'].includes(r.status) && (
                      <MenuItem icon="checkCircle" onClick={() => setPending({ row: r, action: 'close' })}>
                        Close it
                      </MenuItem>
                    )}
                    {r.status === 'closed' && (
                      <MenuItem icon="folder" onClick={() => setPending({ row: r, action: 'archive' })}>
                        Archive it
                      </MenuItem>
                    )}
                    <MenuSep />
                    <MenuItem icon="files" onClick={() => duplicate(r)}>Duplicate as a draft</MenuItem>
                    {r.status === 'draft' && (
                      <MenuItem icon="trash" danger onClick={() => setPending({ row: r, action: 'delete' })}>
                        Delete draft
                      </MenuItem>
                    )}
                  </Menu>
                </Acts>
              ),
            },
          ]}
          empty={(
            <EmptyState icon={anyFilter ? '🔍' : '📣'}
              title={anyFilter ? 'No campaigns match these filters' : 'No campaigns yet'}
              message={anyFilter
                ? 'Try another status or search term.'
                : 'A campaign asks one set of questions of one group of students over one window of dates. Create one as a draft, check it, then start it when you are ready.'}
              action={anyFilter
                ? <button type="button" className="fbtb" onClick={clear}>Clear filters</button>
                : (
                  <button type="button" className="fbtb fbtb--primary" disabled={!meta}
                    onClick={() => { setFormErr(''); setForm(blankCampaign(meta, settings)); }}>
                    Create the first campaign
                  </button>
                )} />
          )}
        />

        <Foot page={Math.min(page, pages)} pages={pages} total={filtered.length} limit={limit}
          count={shown.length} noun="campaign" onPage={setPage} />
      </div>

      <div className="fbcard">
        <div className="fblife">
          <h2>The life of a campaign</h2>
          <ol>
            <li><CampaignPill status="draft" />
              <p>Built and editable. Nothing has been sent and no student can see it.</p></li>
            <li><CampaignPill status="scheduled" />
              <p>Started ahead of its opening date. It goes live on its own that morning.</p></li>
            <li><CampaignPill status="active" />
              <p>Collecting. Questions and targeting are frozen; the closing date and reminders are not.</p></li>
            <li><CampaignPill status="closed" />
              <p>No more submissions. Everything collected stays readable and counts towards trends.</p></li>
            <li><CampaignPill status="archived" />
              <p>Out of the lists and pickers, all data kept.</p></li>
          </ol>
        </div>
      </div>

      <NoteBar tone="blue" icon="info">
        Students are matched to their own teachers from the section–subject–teacher allocations, so a
        campaign that reaches nobody usually means those allocations are missing rather than the targeting
        being wrong. Use <b>Sync assignments</b> to pick up students who joined a section after a campaign
        started.
      </NoteBar>

      <CampaignForm open={!!form} form={form} setForm={setForm} meta={meta}
        saving={saving} error={formErr}
        onClose={() => { setForm(null); setFormErr(''); }} onSave={save} />

      <CampaignConfirm action={pending?.action} campaign={pending?.row} busy={!!busy}
        onClose={() => setPending(null)} onConfirm={run} />
    </div>
  );
}
