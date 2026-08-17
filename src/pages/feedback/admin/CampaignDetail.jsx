import React, { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import {
  PageHeader, Card, Spinner, Alert, Table, Button, Badge, Pagination, StatCard, Confirm,
} from '../../../components/ui/index';
import { Panel, Grid, RankBars } from '../../analytics/viz';
import { Score, CampaignBadge, LockedNotice, fmtDate } from '../shared/kit';

const TABS = ['overview', 'teachers', 'questions', 'responses'];

// One campaign in full: live statistics, the questionnaire that was snapshotted
// onto it, per-teacher / subject / class analytics, and the submission tracker.
export default function CampaignDetail() {
  const { id } = useParams();
  const [tab, setTab] = useState('overview');
  const [confirmAction, setConfirmAction] = useState(null);
  const [busy, setBusy] = useState(false);

  const campaign  = useFetch(() => api.getCampaign(id), [id]);
  const analytics = useFetch(() => api.getCampaignAnalytics(id), [id]);

  const act = async (action) => {
    setBusy(true);
    try {
      if (action === 'activate') {
        const r = await api.activateCampaign(id);
        toast.success(`Activated — ${(r.data ?? r).created} assignment(s) created`);
      } else if (action === 'close')   { await api.closeCampaign(id);   toast.success('Campaign closed'); }
      else if (action === 'archive')   { await api.archiveCampaign(id); toast.success('Campaign archived'); }
      else if (action === 'sync')      {
        const r = await api.syncAssignments(id);
        toast.success(`${(r.data ?? r).created} new assignment(s) created`);
      } else if (action === 'reminders') {
        const r = await api.sendReminders(id);
        toast.success(`Reminder sent to ${(r.data ?? r).reminded} student(s)`);
      }
      campaign.refetch(); analytics.refetch();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); setConfirmAction(null); }
  };

  if (campaign.loading) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;
  if (campaign.error)   return <div className="page"><Alert variant="danger">{campaign.error}</Alert></div>;

  const c = campaign.data;

  return (
    <div className="page">
      <PageHeader
        title={c.name}
        subtitle={[c.term, c.academicYear?.yearName, `${fmtDate(c.startDate)} – ${fmtDate(c.endDate)}`].filter(Boolean).join(' · ')}
        action={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Link to="/admin/feedback/campaigns"><Button variant="secondary" size="sm">← All campaigns</Button></Link>
            {c.status === 'draft' && <Button size="sm" onClick={() => setConfirmAction('activate')} loading={busy}>Activate</Button>}
            {['active', 'scheduled'].includes(c.status) && <>
              <Button size="sm" variant="secondary" onClick={() => act('sync')} loading={busy}>Sync assignments</Button>
              {c.status === 'active' && <Button size="sm" variant="secondary" onClick={() => act('reminders')} loading={busy}>Send reminders</Button>}
              <Button size="sm" variant="warning" onClick={() => setConfirmAction('close')}>Close</Button>
            </>}
            {c.status === 'closed' && <Button size="sm" variant="secondary" onClick={() => setConfirmAction('archive')}>Archive</Button>}
          </div>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <CampaignBadge status={c.status} />
        <Badge variant={c.isAnonymous ? 'info' : 'muted'}>{c.isAnonymous ? 'Anonymous' : 'Named'}</Badge>
        <Badge variant="muted">Min {c.minimumResponses} responses</Badge>
        <Badge variant="muted">{c.questions?.length || 0} questions</Badge>
      </div>

      <div className="stat-grid">
        <StatCard icon="🧑‍🎓" color="blue"   label="Total Assigned"  value={c.assigned} />
        <StatCard icon="✅"  color="green"  label="Submitted"       value={c.submitted} />
        <StatCard icon="⏳"  color="orange" label="Pending"         value={c.pending} />
        <StatCard icon="📈"  color="purple" label="Response Rate"   value={`${c.responseRate}%`} />
        <StatCard icon="⭐"  color="orange" label="Average Rating"
          value={c.avgRating == null ? '—' : `${c.avgRating.toFixed(1)} / 5.0`} />
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <button key={t} className={`tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}
            style={{ textTransform: 'capitalize' }}>{t}</button>
        ))}
      </div>

      {tab === 'overview'  && <Overview a={analytics} campaign={c} />}
      {tab === 'teachers'  && <TeacherTable a={analytics} campaign={c} />}
      {tab === 'questions' && <Questions questions={c.questions} />}
      {tab === 'responses' && <Responses id={id} />}

      <Confirm
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => act(confirmAction)}
        loading={busy}
        title={{ activate: 'Activate campaign?', close: 'Close campaign?', archive: 'Archive campaign?' }[confirmAction]}
        message={{
          activate: 'Assignments will be generated for every matching student and they will be notified.',
          close: 'Students can no longer submit. Nothing is deleted — collected feedback stays available.',
          archive: 'The campaign is hidden from the default lists but all data is kept.',
        }[confirmAction]}
      />
    </div>
  );
}

function Overview({ a, campaign }) {
  if (a.loading) return <Card><div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div></Card>;
  if (a.error)   return <Alert variant="danger">{a.error}</Alert>;
  const d = a.data;

  const cut = (rows, label) => (
    <Panel title={label}>
      {rows?.length ? (
        <RankBars data={rows.filter((r) => r.rating != null).map((r) => ({ label: r.name, value: r.rating }))}
          labelKey="label" valueKey="value" unit="" max={5} />
      ) : <p className="text-sm text-muted">No data yet.</p>}
    </Panel>
  );

  return (
    <>
      <Grid min={330}>
        <Panel title="Category performance" subtitle="School-wide average per category in this campaign">
          {d.overall.categories?.length ? (
            <RankBars data={d.overall.categories.map((c) => ({ label: c.name, value: c.average }))}
              labelKey="label" valueKey="value" unit="" max={5} />
          ) : <p className="text-sm text-muted">No scored responses yet.</p>}
        </Panel>
        {cut(d.bySubject, 'Subject-wise rating')}
        {cut(d.byClass, 'Class-wise rating')}
        {cut(d.bySection, 'Section-wise rating')}
      </Grid>
      <Card>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          Per-teacher figures are withheld until {campaign.minimumResponses} responses exist for that teacher.
          School-wide totals above are aggregated across all teachers, so they never identify anyone.
        </p>
      </Card>
    </>
  );
}

function TeacherTable({ a, campaign }) {
  if (a.loading) return <Card><div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div></Card>;
  if (a.error)   return <Alert variant="danger">{a.error}</Alert>;

  return (
    <div className="card"><div className="card-body" style={{ padding: 0 }}>
      <Table
        columns={[
          { key: 'name', label: 'Teacher', render: (r) => <Link to={`/admin/feedback/teachers/${r._id}`} style={{ fontWeight: 600 }}>{r.name}</Link> },
          { key: 'responses', label: 'Responses', render: (r) => `${r.responses} / ${r.assigned}` },
          { key: 'responseRate', label: 'Response %', render: (r) => `${r.responseRate}%` },
          {
            key: 'rating', label: 'Avg Rating',
            render: (r) => (r.locked
              ? <LockedNotice responses={r.responses} minimum={campaign.minimumResponses} compact />
              : <Score value={r.rating} size="sm" showLabel={false} />),
          },
        ]}
        data={a.data.byTeacher}
        emptyIcon="👨‍🏫"
        emptyTitle="No teachers in this campaign"
      />
    </div></div>
  );
}

function Questions({ questions }) {
  return (
    <Card title="Questionnaire snapshot">
      <p className="text-xs text-muted" style={{ marginBottom: 12 }}>
        These are the exact questions this campaign asked. Editing the question bank later never changes them,
        so historical feedback always stays readable.
      </p>
      <ol style={{ display: 'grid', gap: 10, paddingLeft: 20 }}>
        {(questions || []).map((q) => (
          <li key={q._id}>
            <div style={{ fontSize: '.87rem' }}>
              {q.questionText}
              {q.isRequired && <span style={{ color: 'var(--danger)' }}> *</span>}
            </div>
            <div className="text-xs text-muted">
              {[q.categoryName, q.questionType.replace('_', ' ')].filter(Boolean).join(' · ')}
              {!!q.options?.length && ` · ${q.options.length} options`}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Responses({ id }) {
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [status, setStatus] = useState('');
  const [loading, setLoad]  = useState(true);
  const [anon, setAnon]     = useState(true);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const res = await api.getCampaignAssignments(id, { page, limit: 50, status });
      const d = res.data ?? res;
      setRows(d.data || []); setAnon(d.isAnonymous);
      setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [id, status]);

  useEffect(() => { load(1); }, [load]);

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="submitted">Submitted</option>
          <option value="expired">Expired</option>
        </select>
        {anon && <span className="text-xs text-muted">🔒 Anonymous campaign — submission status is tracked, answers are never linked to a student.</span>}
      </div>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table
          columns={[
            { key: 'student', label: 'Student', render: (r) => r.student?.name || '—' },
            { key: 'teacher', label: 'Teacher' },
            { key: 'subject', label: 'Subject' },
            { key: 'section', label: 'Section' },
            {
              key: 'status', label: 'Status',
              render: (r) => <Badge variant={{ submitted: 'success', pending: 'warning', in_progress: 'info', expired: 'muted' }[r.status]}>
                {r.status.replace('_', ' ')}
              </Badge>,
            },
            { key: 'submittedAt', label: 'Submitted', render: (r) => (r.submittedAt ? fmtDate(r.submittedAt) : '—') },
          ]}
          data={rows}
          loading={loading}
          emptyIcon="🗳"
          emptyTitle="No assignments"
        />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />
    </>
  );
}
