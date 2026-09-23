/**
 * One campaign, in full.
 *
 * Four tabs, in the order the questions get asked: what it has collected
 * (Results), who it was about (Teachers), what it actually asked (Questions),
 * and who still has not answered (Tracking).
 *
 * Tracking is the only screen in the whole module that names students, and it
 * names them ONLY against a submission status. It never joins a student to the
 * content of an answer — that pairing does not exist on any admin endpoint.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Bar, CatBars, Crumbs, Dash, Dot, EmptyState, Foot, Hero, Muted, NoteBar,
  Panel, Pick, Rating, Row, Search, Spacer, Stack, Stars, Stat, Stats, Table,
  Tag, Toolbar, Who, daysLeft, fmtDate, toneAt,
} from './fbUI';
import { CampaignPill, homeFor, minutesFor, typeShort, useFeedbackBase } from './feedbackParts';
import { CampaignConfirm, CampaignForm, toCampaignForm } from './campaignParts';
import Tabs from '../../../components/ui/Tabs';

const TABS = [
  { value: 'results',   label: 'Results',       icon: 'chart' },
  { value: 'teachers',  label: 'Teachers',      icon: 'users' },
  { value: 'questions', label: 'Questions',     icon: 'checkSquare' },
  { value: 'tracking',  label: 'Who responded', icon: 'clipboard' },
];

export default function CampaignDetail() {
  const { id } = useParams();
  const base = useFeedbackBase();
  const navigate = useNavigate();

  const [tab, setTab] = useState('results');
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [meta, setMeta] = useState(null);

  const campaign = useFetch(() => api.getCampaign(id), [id]);
  const analytics = useFetch(() => api.getCampaignAnalytics(id), [id]);

  useEffect(() => { api.getMeta().then((r) => setMeta(r.data ?? r)).catch(() => {}); }, []);

  const run = async () => {
    const action = pending;
    setBusy(true);
    try {
      if (action === 'activate') {
        const d = (await api.activateCampaign(id)).data;
        toast.success(d?.status === 'scheduled'
          ? 'Scheduled — it opens on its start date'
          : `Started — ${d?.created ?? 0} student assignment(s) created`);
      } else if (action === 'close') {
        await api.closeCampaign(id); toast.success('Closed — the results stay available');
      } else if (action === 'archive') {
        await api.archiveCampaign(id); toast.success('Archived');
      } else if (action === 'sync') {
        const d = (await api.syncAssignments(id)).data;
        toast.success(d?.created ? `${d.created} new assignment(s) created` : 'Already up to date');
      } else if (action === 'reminders') {
        const d = (await api.sendReminders(id)).data;
        toast.success(`Reminder sent to ${d?.reminded ?? 0} student(s)`);
      }
      setPending(null);
      campaign.refetch(); analytics.refetch();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const save = async (f) => {
    setSaving(true); setFormErr('');
    try {
      await api.updateCampaign(f._id, f);
      toast.success('Campaign saved');
      setForm(null);
      campaign.refetch();
    } catch (e) { setFormErr(e.message); } finally { setSaving(false); }
  };

  const trail = [
    { to: `${base}/overview`, label: 'Teacher Feedback' },
    { to: `${base}/campaigns`, label: 'Campaigns' },
  ];

  if (campaign.loading) return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;
  if (campaign.error) {
    return (
      <div className="fbpage">
        <Crumbs here="Campaign" trail={trail} home={homeFor(base)} />
        <NoteBar tone="red" icon="alert">{campaign.error}</NoteBar>
      </div>
    );
  }

  const c = campaign.data;
  const left = daysLeft(c.endDate);

  return (
    <div className="fbpage">
      <Crumbs here={c.name} trail={trail} home={homeFor(base)} />

      <Hero icon="megaphone" tone="purple" title={c.name}
        subtitle={[c.term, c.academicYear?.yearName, `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}`]
          .filter(Boolean).join(' · ')}>
        <button type="button" className="fbtb" onClick={() => navigate(`${base}/campaigns`)}>
          <Icon name="chevronLeft" size={14} /> All campaigns
        </button>
        {['draft', 'scheduled', 'active'].includes(c.status) && (
          <button type="button" className="fbtb"
            onClick={() => { setFormErr(''); setForm(toCampaignForm(c)); }}>
            <Icon name="pencil" size={14} /> Edit
          </button>
        )}
        {c.status === 'draft' && (
          <button type="button" className="fbtb fbtb--primary" disabled={busy}
            onClick={() => setPending('activate')}>
            <Icon name="power" size={15} /> Start collecting
          </button>
        )}
        {['scheduled', 'active'].includes(c.status) && (
          <>
            <button type="button" className="fbtb" disabled={busy} onClick={() => setPending('sync')}>
              <Icon name="refresh" size={14} /> Sync
            </button>
            {c.status === 'active' && (
              <button type="button" className="fbtb" disabled={busy} onClick={() => setPending('reminders')}>
                <Icon name="bell" size={14} /> Remind
              </button>
            )}
            <button type="button" className="fbtb fbtb--primary" onClick={() => setPending('close')}>
              Close
            </button>
          </>
        )}
        {c.status === 'closed' && (
          <button type="button" className="fbtb" onClick={() => setPending('archive')}>
            <Icon name="folder" size={14} /> Archive
          </button>
        )}
      </Hero>

      <div className="fbtagrow">
        <CampaignPill status={c.status} />
        <Tag tone={c.isAnonymous ? 'purple' : 'slate'}>{c.isAnonymous ? 'Anonymous' : 'Named'}</Tag>
        <Tag tone="slate">{c.questions?.length || 0} questions</Tag>
        <Tag tone="slate">~ {minutesFor(c.questions?.length || 0)} min to fill in</Tag>
        <Tag tone="blue">Floor: {c.minimumResponses} responses</Tag>
        {c.status === 'active' && left != null && (
          <Tag tone={left <= 3 ? 'amber' : 'slate'}>
            {left > 0 ? `${left} day${left === 1 ? '' : 's'} left` : left === 0 ? 'Closes today' : 'Past its closing date'}
          </Tag>
        )}
      </div>

      <Stats>
        <Stat icon="student" tone="blue" value={c.assigned} label="Students Asked"
          caption="Matched from the section–subject–teacher allocations" />
        <Stat icon="checkCircle" tone="green" value={c.submitted} label="Submitted"
          caption={`${c.responseRate}% of everyone asked`} />
        <Stat icon="clock" tone="amber" value={c.pending} label="Still Outstanding"
          caption={c.status === 'active'
            ? 'Can still be chased with a reminder'
            : 'Marked expired when it closed'} />
        <Stat icon="star" tone="purple"
          value={c.avgRating == null ? '—' : <>{c.avgRating.toFixed(1)}<em>/ 5</em></>}
          label="Average Rating"
          caption={c.avgRating == null ? 'Nothing scored yet' : 'Out of 5, school-wide'} />
      </Stats>

      {c.status === 'draft' && (
        <NoteBar tone="blue" icon="info">
          This campaign has not started. Nothing has been sent and no student can see it — check the
          questions and the targeting, then <b>Start collecting</b>. From that moment both are frozen.
        </NoteBar>
      )}

      <div className="fbcard">
        <Tabs variant="line" className="uitabs--inset" label="Campaign"
          value={tab} onChange={setTab} items={TABS.map((t) => ({
            ...t,
            count: t.value === 'teachers' ? analytics.data?.byTeacher?.length
                 : t.value === 'questions' ? (c.questions?.length || 0)
                 : undefined,
          }))} />

        {tab === 'results'   && <Results a={analytics} campaign={c} />}
        {tab === 'teachers'  && <Teachers a={analytics} campaign={c} base={base} />}
        {tab === 'questions' && <Questions questions={c.questions} />}
        {tab === 'tracking'  && <Tracking id={id} campaign={c} />}
      </div>

      <NoteBar tone="purple" icon="key">
        Per-teacher figures are withheld until <b>{c.minimumResponses}</b> students have answered about that
        teacher. The totals above are averaged across every teacher at once, so they identify nobody
        {c.isAnonymous ? ' — and this campaign is anonymous, so no answer is ever paired with the student who wrote it' : ''}.
      </NoteBar>

      <CampaignForm open={!!form} form={form} setForm={setForm} meta={meta}
        saving={saving} error={formErr}
        onClose={() => { setForm(null); setFormErr(''); }} onSave={save} />

      <CampaignConfirm action={pending} campaign={c} busy={busy}
        onClose={() => setPending(null)} onConfirm={run} />
    </div>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

function Results({ a, campaign }) {
  if (a.loading) return <div className="fbloading"><Spinner /></div>;
  if (a.error)   return <NoteBar tone="red" icon="alert">{a.error}</NoteBar>;
  const d = a.data;

  const cut = (rows, title, subtitle, icon, tone) => (
    <Panel icon={icon} tone={tone} title={title} subtitle={subtitle}>
      {rows?.some((r) => r.rating != null)
        ? (
          <CatBars colored max={5} labelWidth={140}
            data={rows.filter((r) => r.rating != null)
              .map((r) => ({ label: r.name, value: Number(r.rating.toFixed(1)) }))} />
        )
        : <Muted>Nothing past the {campaign.minimumResponses}-response floor yet.</Muted>}
    </Panel>
  );

  return (
    <div className="fbtabbody">
      <Row split="2">
        <Panel icon="star" tone="amber" title="Overall"
          subtitle="Every scored answer in this campaign, averaged">
          <div className="fbbigrate">
            <Rating value={d.overall.averageRating} big sub={undefined} />
            <Stars value={Math.round(d.overall.averageRating || 0)} size={22} />
            <Bar value={d.overall.responseRate} width={180} />
            <Muted>
              {d.overall.responses} of {d.overall.assigned} students answered. This figure is school-wide,
              so it is shown whatever the floor.
            </Muted>
          </div>
        </Panel>

        <Panel icon="layers" tone="purple" title="By Category"
          subtitle="Where this campaign says teaching is strongest">
          {d.overall.categories?.some((x) => x.average != null)
            ? (
              <CatBars colored max={5} labelWidth={150}
                data={d.overall.categories.filter((x) => x.average != null)
                  .map((x) => ({ label: x.name, value: Number(x.average.toFixed(1)) }))} />
            )
            : <Muted>No scored answers yet — the categories fill in as students submit.</Muted>}
        </Panel>
      </Row>

      <Row split="2">
        {cut(d.bySubject, 'By Subject', 'Average rating out of 5', 'book', 'blue')}
        {cut(d.byClass, 'By Class', 'Average rating out of 5', 'grid', 'teal')}
      </Row>

      {cut(d.bySection, 'By Section', 'Average rating out of 5, per class section', 'users', 'green')}
    </div>
  );
}

// ── Teachers ─────────────────────────────────────────────────────────────────

function Teachers({ a, campaign, base }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 10;

  const rows = useMemo(() => {
    const src = a.data?.byTeacher || [];
    const t = search.trim().toLowerCase();
    return t ? src.filter((r) => r.name.toLowerCase().includes(t)) : src;
  }, [a.data, search]);

  if (a.loading) return <div className="fbloading"><Spinner /></div>;
  if (a.error)   return <NoteBar tone="red" icon="alert">{a.error}</NoteBar>;

  const pages = Math.max(1, Math.ceil(rows.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = rows.slice(start, start + limit);

  return (
    <>
      <Toolbar>
        <Search value={search} onChange={(v) => { setSearch(v); setPage(1); }}
          placeholder="Search teachers…" />
        <Spacer />
        <span className="fbmuted">
          {rows.filter((r) => !r.locked).length} of {rows.length} are past the{' '}
          {campaign.minimumResponses}-response floor
        </span>
      </Toolbar>

      <Table
        startIndex={start}
        rows={shown}
        columns={[
          {
            key: 'teacher', label: 'Teacher',
            render: (r) => <Who name={r.name} to={`${base}/teachers/${r._id}`} tone={toneAt(rows.indexOf(r))} />,
          },
          { key: 'responses', label: 'Responses', render: (r) => `${r.responses} / ${r.assigned}` },
          { key: 'rate', label: 'Response %', render: (r) => <Bar value={r.responseRate} /> },
          {
            key: 'rating', label: 'Avg Rating',
            render: (r) => (
              <Rating value={r.rating} locked={r.locked} responses={r.responses}
                minimum={campaign.minimumResponses}
                sub={r.rating == null ? undefined : `Based on ${r.responses} response${r.responses === 1 ? '' : 's'}`} />
            ),
          },
        ]}
        empty={(
          <EmptyState icon="👨‍🏫"
            title={search ? 'No teacher matches' : 'No teachers in this campaign'}
            message={search
              ? 'Try another name.'
              : 'Assignments are built from the section–subject–teacher allocations when a campaign starts.'} />
        )}
      />

      <Foot page={Math.min(page, pages)} pages={pages} total={rows.length} limit={limit}
        count={shown.length} noun="teacher" onPage={setPage} />
    </>
  );
}

// ── Questions ────────────────────────────────────────────────────────────────

/**
 * The exact questions this campaign asked.
 *
 * A snapshot, not a link to the bank: the bank can be edited freely and these
 * do not move, which is the only reason a two-year-old campaign's results are
 * still readable.
 */
function Questions({ questions }) {
  const rows = questions || [];
  const scored = rows.filter((q) => q.includeInScore).length;
  const mins = minutesFor(rows.length);

  return (
    <>
      <Toolbar>
        <div className="fbtools__title">
          <b>{rows.length} question{rows.length === 1 ? '' : 's'}</b>
          <small>
            {scored} count towards the rating · about {mins} minute{mins === 1 ? '' : 's'} to fill in
          </small>
        </div>
        <Spacer />
        <span className="fbmuted">
          Frozen when the campaign was created — editing the question bank never changes these.
        </span>
      </Toolbar>

      <Table
        rows={rows}
        columns={[
          {
            key: 'q', className: 'fbq', label: 'Question',
            render: (q) => (
              <Stack main={<>{q.questionText}{q.isRequired ? <em className="fbreq"> *</em> : null}</>}
                sub={q.helpText || (q.options?.length ? q.options.map((o) => o.optionText).join(' · ') : '')} />
            ),
          },
          {
            key: 'category', label: 'Category',
            render: (q) => (q.categoryName ? <Tag tone="purple">{q.categoryName}</Tag> : <Dash />),
          },
          { key: 'type', label: 'Type', render: (q) => <Tag tone="blue">{typeShort(q.questionType)}</Tag> },
          {
            key: 'scored', label: 'Scored',
            render: (q) => (q.includeInScore
              ? <span className="fbtick"><Icon name="checkCircle" size={16} /></span>
              : <Dash />),
          },
        ]}
        empty={(
          <EmptyState icon="❓" title="No questions on this campaign"
            message="A campaign is built from a template. This one appears to have been created without one." />
        )}
      />
    </>
  );
}

// ── Tracking ─────────────────────────────────────────────────────────────────

const ASSIGNMENT = {
  submitted:   { word: 'Submitted',   tone: 'green' },
  pending:     { word: 'Not started', tone: 'amber' },
  in_progress: { word: 'In progress', tone: 'blue' },
  expired:     { word: 'Expired',     tone: 'slate' },
};

function Tracking({ id, campaign }) {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [anon, setAnon] = useState(true);
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const limit = 10;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = (await api.getCampaignAssignments(id, { page, limit, status })).data;
      setRows(d?.data || []);
      setAnon(d?.isAnonymous);
      setTotal(d?.total || 0);
      setPages(d?.pages || 1);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [id, page, status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const shown = useMemo(() => (term
    ? rows.filter((r) => `${r.student?.name || ''} ${r.teacher || ''} ${r.subject || ''} ${r.section || ''}`
      .toLowerCase().includes(term))
    : rows), [rows, term]);

  return (
    <>
      <Toolbar>
        <Search value={search} onChange={setSearch}
          placeholder="Search students, teachers or sections…" />
        <Pick value={status} onChange={(v) => { setStatus(v); setPage(1); }} all="All statuses"
          label="Submission status" options={[
            { value: 'pending', label: 'Not started' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'submitted', label: 'Submitted' },
            { value: 'expired', label: 'Expired' },
          ]} />
        <Spacer />
      </Toolbar>

      {anon && (
        <div style={{ padding: '0 18px 14px' }}>
          <NoteBar tone="purple" icon="key">
            This is a <b>submission register</b>, not a list of answers. It says who has responded so the
            school can chase the rest — it never shows what anybody wrote, and this campaign is anonymous,
            so no screen anywhere pairs a student with their answers.
          </NoteBar>
        </div>
      )}

      <Table
        loading={loading}
        startIndex={(page - 1) * limit}
        rows={shown}
        columns={[
          {
            key: 'student', label: 'Student',
            render: (r) => (r.student?.name
              ? <Who name={r.student.name} tone="blue" sub={r.section} />
              : <Dash />),
          },
          { key: 'about', label: 'About', render: (r) => <Stack main={r.teacher} sub={r.subject} /> },
          {
            key: 'status', label: 'Status',
            render: (r) => {
              const s = ASSIGNMENT[r.status] || ASSIGNMENT.pending;
              return <Dot tone={s.tone}>{s.word}</Dot>;
            },
          },
          {
            key: 'when', label: 'Submitted',
            render: (r) => (r.submittedAt ? <span className="fbdate">{fmtDate(r.submittedAt)}</span> : <Dash />),
          },
        ]}
        empty={(
          <EmptyState icon="🗳" title={status || term ? 'Nothing matches' : 'No assignments'}
            message={campaign.status === 'draft'
              ? 'Assignments are generated when the campaign starts.'
              : 'No student was matched to a teacher for this campaign. Check the section–subject–teacher allocations.'} />
        )}
      />

      <Foot page={page} pages={pages} total={total} limit={limit}
        count={shown.length} noun="assignment" onPage={setPage} />
    </>
  );
}
