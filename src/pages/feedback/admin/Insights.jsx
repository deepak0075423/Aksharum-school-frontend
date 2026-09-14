/**
 * Teacher Feedback → Insights.
 *
 * One question asked from four angles: *who* was rated, *where* they sit, *how
 * it has moved*, and the filtered table you actually export. Each is its own
 * screen — different tiles, different pictures, different table — because a
 * teacher roster and a trend line answer nothing alike.
 *
 * Two sources feed it, and which one is in play is not arbitrary:
 *
 *   • Teachers and Departments come from the dashboard payload, because only
 *     that carries the ids, the privacy lock and the per-teacher trend arrow.
 *   • Trends and Reports come from the report endpoint — the same call the
 *     export buttons make, so what is on screen is exactly what downloads.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Acts, Bar, CatBars, Columns, Crumbs, Dash, Donut, EmptyState, Field,
  Foot, Hero, IconBtn, Insights as InsightList, Locked, Menu, MenuItem, Muted,
  NoteBar, PALETTE, Panel, Pick, Rating, RatingSpread, Row, Search, SortBy,
  Spacer, Stack, Stat, StatVs, Stats, Table, Tag, TextBtn, Toolbar, TrendArea,
  TipCard, ViewToggle, Who, ratingWord, toneAt,
} from './fbUI';
import { TeacherState, departmentIcon, homeFor, useFeedbackBase } from './feedbackParts';

const VIEWS = ['teachers', 'departments', 'trends', 'reports'];

const HERO = {
  teachers: {
    icon: 'users', title: 'Teacher Performance',
    subtitle: 'View and analyze feedback received for all teachers across campaigns.',
  },
  departments: {
    icon: 'building', title: 'Department Performance',
    subtitle: 'View and analyze teacher feedback across all departments.',
  },
  trends: {
    icon: 'trending', title: 'Feedback Trends',
    subtitle: 'How teaching quality has moved across campaigns, classes and subjects.',
  },
  reports: {
    icon: 'chart', title: 'Teacher Feedback Reports',
    subtitle: 'Generate, view and export detailed reports on teacher performance and feedback.',
  },
};

const TEACHER_SORTS = [
  { value: 'rating',    label: 'Average rating' },
  { value: 'rating_up', label: 'Lowest rated first' },
  { value: 'name',      label: 'Name (A–Z)' },
  { value: 'responses', label: 'Most responses' },
  { value: 'rate',      label: 'Response rate' },
];

const DEPT_SORTS = [
  { value: 'rating',    label: 'Average rating (High to Low)' },
  { value: 'name',      label: 'Name (A–Z)' },
  { value: 'teachers',  label: 'Most teachers' },
  { value: 'responses', label: 'Most responses' },
];

const REPORTS = [
  { value: 'teacher',       label: 'Teacher Feedback Report' },
  { value: 'campaign',      label: 'Campaign Report' },
  { value: 'class',         label: 'Class-wise Report' },
  { value: 'subject',       label: 'Subject-wise Report' },
  { value: 'department',    label: 'Department-wise Report' },
  { value: 'response_rate', label: 'Response Rate Report' },
  { value: 'trend',         label: 'Rating Trend Report' },
];

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v != null));
const EMPTY = {
  academicYear: '', campaign: '', department: '', subject: '',
  class: '', section: '', teacher: '', term: '', dateFrom: '', dateTo: '',
};

export default function Insights() {
  const base = useFeedbackBase();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = VIEWS.includes(params.get('view')) ? params.get('view') : 'teachers';
  const setView = (v) => setParams(v === 'teachers' ? {} : { view: v }, { replace: true });

  const [campaignId, setCampaignId] = useState('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [dept, setDept] = useState('');
  const [subject, setSubject] = useState('');
  const [state, setState] = useState('');
  const [sort, setSort] = useState('rating');
  const [layout, setLayout] = useState('table');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const limit = 10;

  // Reports keeps its own filter set — it is a form you fill in and submit,
  // not a set of live filters, so `draft` is what is typed and `applied` is
  // what has actually been asked for.
  const [reportType, setReportType] = useState('teacher');
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [exporting, setExporting] = useState('');

  const meta = useFetch(() => api.getMeta(), []);
  const campaigns = useFetch(() => api.getCampaigns({ limit: 100, includeArchived: true }), []);

  const dash = useFetch(
    () => api.getDashboard(campaignId ? { campaignId } : {}),
    [campaignId],
  );

  // Trends reads the trend report; Reports reads whichever type is chosen.
  const reportFilters = view === 'trends'
    ? clean({ campaign: campaignId, academicYear: draft.academicYear, class: draft.class, subject: draft.subject })
    : clean(applied);

  const report = useFetch(
    () => (view === 'trends' || view === 'reports'
      ? api.getReport({ type: view === 'trends' ? 'trend' : reportType, format: 'json', ...reportFilters })
      : Promise.resolve(null)),
    [view, reportType, campaignId, JSON.stringify(reportFilters)],
  );

  useEffect(() => {
    const id = setTimeout(() => { setTerm(search.trim().toLowerCase()); setPage(1); }, 250);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setPage(1); setSearch(''); setTerm(''); setDept(''); setSubject(''); setState('');
    setSort(view === 'departments' ? 'rating' : 'rating');
  }, [view]);

  useEffect(() => { setOpen(null); }, [campaignId, term, view]);

  const teachers = useMemo(() => dash.data?.teachers || [], [dash.data]);
  const focus = dash.data?.campaign || null;
  const focusQuestions = ((campaigns.data?.data) || []).find((c) => c._id === focus?._id)?.questionCount;
  const min = focus?.minimumResponses || 5;

  const departments = useMemo(
    () => [...new Set(teachers.map((t) => t.department || 'Unassigned'))].sort(),
    [teachers],
  );
  const subjects = useMemo(
    () => [...new Set(teachers.flatMap((t) => t.subjects || []))].sort(),
    [teachers],
  );

  // ── Rows ───────────────────────────────────────────────────────────────────
  const teacherRows = useMemo(() => {
    const out = teachers.filter((t) => {
      if (dept && (t.department || 'Unassigned') !== dept) return false;
      if (subject && !(t.subjects || []).includes(subject)) return false;
      if (state === 'rated' && t.rating == null) return false;
      if (state === 'locked' && t.rating != null) return false;
      if (state === 'good' && t.status !== 'good') return false;
      if (state === 'attention' && t.status !== 'attention') return false;
      if (term && !t.name.toLowerCase().includes(term)) return false;
      return true;
    });
    // A locked row has no rating at all, so it sorts to the end of BOTH rating
    // orders rather than pretending to be a nought or a five.
    const byRating = (a, b, dir) => {
      if (a.rating == null && b.rating == null) return a.name.localeCompare(b.name);
      if (a.rating == null) return 1;
      if (b.rating == null) return -1;
      return dir * (b.rating - a.rating);
    };
    return [...out].sort((a, b) => {
      switch (sort) {
        case 'rating_up': return byRating(a, b, -1);
        case 'name':      return a.name.localeCompare(b.name);
        case 'responses': return b.responses - a.responses || a.name.localeCompare(b.name);
        case 'rate':      return b.responseRate - a.responseRate || a.name.localeCompare(b.name);
        default:          return byRating(a, b, 1);
      }
    });
  }, [teachers, dept, subject, state, term, sort]);

  // ListTable keys and row expansion hang off `_id`; a department is identified
  // by its name, so it is given one here rather than rendering rows React
  // cannot tell apart.
  const deptRows = useMemo(() => {
    const src = (dash.data?.departments || [])
      .filter((d) => !term || d.name.toLowerCase().includes(term))
      .map((d) => ({ ...d, _id: d.name }));
    return src.sort((a, b) => {
      if (sort === 'name')      return a.name.localeCompare(b.name);
      if (sort === 'teachers')  return b.teachers - a.teachers;
      if (sort === 'responses') return b.responses - a.responses;
      return (b.rating ?? -1) - (a.rating ?? -1);
    });
  }, [dash.data, term, sort]);

  const reportRows = useMemo(() => {
    const src = (report.data?.rows || []).map((r, i) => ({
      ...r,
      _rowIndex: i,
      _id: r._id || `${r.class || r.subject || r.section || r.campaign || r.department || 'row'}-${i}`,
    }));
    if (!term) return src;
    return src.filter((r) => Object.values(r)
      .some((v) => String(v ?? '').toLowerCase().includes(term)));
  }, [report.data, term]);

  const rows = view === 'teachers' ? teacherRows
    : view === 'departments' ? deptRows
    : reportRows;

  const pages = Math.max(1, Math.ceil(rows.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = rows.slice(start, start + limit);

  const doExport = async (format) => {
    setExporting(format);
    try {
      await api.downloadReport({
        type: view === 'trends' ? 'trend' : reportType, format, ...reportFilters,
      });
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch (e) { toast.error(e.message || 'Export failed'); } finally { setExporting(''); }
  };

  const sections = (meta.data?.sections || [])
    .filter((s) => !draft.class || String(s.class) === draft.class);

  if (dash.loading && !dash.data) {
    return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;
  }

  const hero = HERO[view];
  const cards = dash.data?.cards;

  return (
    <div className="fbpage">
      <Crumbs here={hero.title} trail={[{ to: `${base}/overview`, label: 'Teacher Feedback' }]}
        home={homeFor(base)} />

      <Hero icon={hero.icon} tone="purple" title={hero.title} subtitle={hero.subtitle}>
        <div className="fbhero__stack">
        <div className="fbvt" role="group" aria-label="Insight">
          {[['teachers', 'Teachers', 'users'], ['departments', 'Departments', 'building'],
            ['trends', 'Trends', 'trending'], ['reports', 'Reports', 'fileSheet']].map(([v, l, ic]) => (
              <button key={v} type="button" className={view === v ? 'is-on' : ''} onClick={() => setView(v)}>
                <Icon name={ic} size={15} /> {l}
              </button>
          ))}
        </div>

        {view === 'trends' ? (
          <div className="fbhero__filters">
            <Pick value={draft.academicYear} onChange={(v) => setDraft({ ...draft, academicYear: v })}
              all="All years" label="Academic year"
              options={(meta.data?.academicYears || []).map((y) => ({ value: y._id, label: y.yearName }))} />
            <select className={`fbsel${campaignId ? ' is-on' : ''}`} value={campaignId} aria-label="Campaign"
              onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">All campaigns</option>
              {((campaigns.data?.data) || []).map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
            </select>
            <Pick value={draft.class} onChange={(v) => setDraft({ ...draft, class: v })}
              all="All classes" label="Class"
              options={(meta.data?.classes || []).map((c) => ({ value: c._id, label: c.className }))} />
            <Pick value={draft.subject} onChange={(v) => setDraft({ ...draft, subject: v })}
              all="All subjects" label="Subject"
              options={(meta.data?.subjects || []).map((x) => ({ value: x._id, label: x.subjectName }))} />
          </div>
        ) : view === 'reports' ? (
          <div className="fbexp">
            <button type="button" className="is-xlsx" disabled={!!exporting || !rows.length}
              onClick={() => doExport('xlsx')}>
              <Icon name="download" size={15} /> {exporting === 'xlsx' ? 'Preparing…' : 'Excel'}
            </button>
            <button type="button" className="is-csv" disabled={!!exporting || !rows.length}
              onClick={() => doExport('csv')}>
              <Icon name="files" size={15} /> {exporting === 'csv' ? 'Preparing…' : 'CSV'}
            </button>
            <button type="button" className="is-pdf" disabled={!!exporting || !rows.length}
              onClick={() => doExport('pdf')}>
              <Icon name="filePdf" size={15} /> {exporting === 'pdf' ? 'Preparing…' : 'PDF'}
            </button>
          </div>
        ) : (
          <select className="fbsel fbsel--hero" value={campaignId || focus?._id || ''} aria-label="Campaign"
            onChange={(e) => setCampaignId(e.target.value)}>
            {(dash.data?.campaigns || []).map((c) => (
              <option key={c._id} value={c._id}>{c.name}{c.term ? ` · ${c.term}` : ''}</option>
            ))}
          </select>
        )}
        </div>
      </Hero>

      {(dash.error || report.error) && (
        <NoteBar tone="red" icon="alert">{dash.error || report.error}</NoteBar>
      )}

      {/* ── Teachers ─────────────────────────────────────────────────────────── */}
      {view === 'teachers' && (
        <>
          <Stats>
            <Stat icon="users" tone="blue" value={teachers.length} label="Total Teachers"
              caption="Receiving feedback" onClick={() => setState('')} />
            <Stat icon="checkCircle" tone="green" value={teachers.filter((t) => t.status === 'good').length}
              label="Well Rated" caption="(≥ 4.0 average)"
              onClick={() => setState(state === 'good' ? '' : 'good')} on={state === 'good'} />
            <Stat icon="clock" tone="amber" value={teachers.filter((t) => t.status === 'attention').length}
              label="Needs Attention" caption="(< 3.0 average)"
              onClick={() => setState(state === 'attention' ? '' : 'attention')} on={state === 'attention'} />
            <Stat icon="star" tone="purple"
              value={cards?.averageRating == null ? '0.0' : cards.averageRating.toFixed(1)}
              label="Overall Average Rating" caption="Across all teachers" />
          </Stats>

          <div className="fbcard">
            <Toolbar>
              <Search value={search} onChange={setSearch} placeholder="Search teacher by name…" />
              <Pick value={dept} onChange={(v) => { setDept(v); setPage(1); }} all="All departments"
                label="Department" options={departments} />
              <Pick value={subject} onChange={(v) => { setSubject(v); setPage(1); }} all="All subjects"
                label="Subject" options={subjects} />
              <Pick value={state} onChange={(v) => { setState(v); setPage(1); }} all="All statuses"
                label="Status" options={[
                  { value: 'good', label: 'Well rated (≥ 4.0)' },
                  { value: 'attention', label: 'Needs attention (< 3.0)' },
                  { value: 'rated', label: 'Rating showing' },
                  { value: 'locked', label: 'Below the floor' },
                ]} />
              <Spacer />
              <SortBy value={sort} onChange={setSort} options={TEACHER_SORTS} dflt="rating" />
              <ViewToggle value={layout} onChange={setLayout} options={[
                { value: 'table', label: 'Table', icon: 'grid' },
                { value: 'card', label: 'Card', icon: 'layers' },
              ]} />
            </Toolbar>

            {layout === 'card' ? (
              <div className="fbtplwrap">
                {shown.length ? (
                  <div className="fbtcards">
                    {shown.map((t) => (
                      <article key={t._id} className="fbtcard">
                        <Who name={t.name} to={`${base}/teachers/${t._id}`} size={42}
                          sub={[t.designation || 'Teacher', t.department].filter(Boolean).join(' · ')} />
                        <div className="fbtcard__r">
                          <Rating value={t.rating} locked={t.locked} responses={t.responses}
                            minimum={min} sub={t.rating == null ? undefined : ratingWord(t.rating)} big />
                        </div>
                        <dl className="fbtcard__m">
                          <div><dt>Responses</dt><dd>{t.responses} / {t.assigned}</dd></div>
                          <div><dt>Response %</dt><dd><Bar value={t.responseRate} width={60} /></dd></div>
                        </dl>
                        <TeacherState status={t.status} responses={t.responses} minimum={min} />
                      </article>
                    ))}
                  </div>
                ) : <EmptyState icon="🔍" title="No teacher matches these filters" />}
              </div>
            ) : (
              <Table
                loading={dash.loading}
                startIndex={start}
                rows={shown}
                columns={[
                  {
                    key: 'teacher', label: 'Teacher',
                    render: (t) => (
                      <Who name={t.name} to={`${base}/teachers/${t._id}`}
                        tone={toneAt(teachers.indexOf(t))} sub={t.designation || 'Teacher'} />
                    ),
                  },
                  { key: 'dept', label: 'Department', render: (t) => t.department || <Dash /> },
                  {
                    key: 'subjects', label: 'Subjects',
                    render: (t) => (t.subjects?.length
                      ? <Tag tone="blue">{t.subjects[0]}{t.subjects.length > 1 ? ` +${t.subjects.length - 1}` : ''}</Tag>
                      : <Dash />),
                  },
                  { key: 'responses', label: 'Responses', render: (t) => `${t.responses} / ${t.assigned}` },
                  { key: 'rate', label: 'Response %', render: (t) => <Bar value={t.responseRate} /> },
                  {
                    key: 'rating', label: 'Avg Rating',
                    render: (t) => (
                      <Rating value={t.rating} locked={t.locked} responses={t.responses} minimum={min}
                        sub={t.rating == null ? 'No responses yet' : `Based on ${t.responses} response${t.responses === 1 ? '' : 's'}`} />
                    ),
                  },
                  {
                    key: 'trend', label: 'Trend',
                    render: (t) => (t.trend == null
                      ? <Dash />
                      : <Sparkline value={t.trend} />),
                  },
                  {
                    key: 'status', label: 'Status',
                    render: (t) => <TeacherState status={t.status} responses={t.responses} minimum={min} />,
                  },
                  {
                    key: 'a', className: 'fbtable__acts', label: 'Actions',
                    render: (t) => (
                      <Acts>
                        <IconBtn icon="chart" label="Open the full breakdown"
                          onClick={() => navigate(`${base}/teachers/${t._id}`)} />
                        <Menu>
                          <MenuItem icon="chart" to={`${base}/teachers/${t._id}`}>Full breakdown</MenuItem>
                          <MenuItem icon="building" onClick={() => { setView('departments'); }}>
                            See the department
                          </MenuItem>
                        </Menu>
                      </Acts>
                    ),
                  },
                ]}
                empty={<EmptyState icon="🔍" title="No teacher matches these filters"
                  message="Try another department, subject or campaign." />}
              />
            )}

            <Foot page={Math.min(page, pages)} pages={pages} total={rows.length} limit={limit}
              count={shown.length} noun="teacher" onPage={setPage} />
          </div>

          <Row split="2">
            <Panel icon="chart" tone="purple" title="Rating Distribution"
              subtitle="Distribution of average ratings across teachers">
              <RatingSpread counts={teacherRows.reduce((acc, t) => {
                if (t.rating != null) {
                  const b = Math.min(5, Math.max(1, Math.round(t.rating)));
                  acc[b] = (acc[b] || 0) + 1;
                }
                return acc;
              }, {})} />
            </Panel>

            <Panel icon="sparkle" tone="amber" title="Insights"
              subtitle="What this campaign is saying so far">
              <InsightList items={[
                { icon: 'checkCircle', tone: 'green',
                  text: <>{teachers.filter((t) => t.status === 'good').length} teachers are performing very well (≥ 4.0)</> },
                { icon: 'alert', tone: 'amber',
                  text: <>{teachers.filter((t) => t.status === 'attention').length} teachers need attention (&lt; 3.0)</> },
                { icon: 'info', tone: 'blue',
                  text: <>{teachers.filter((t) => t.responses > 0).length} teacher(s) have received feedback so far</> },
                { icon: 'key', tone: 'purple',
                  text: <>{teachers.filter((t) => t.locked).length} are below the {min}-response floor, so their ratings stay hidden</> },
              ]} />
            </Panel>
          </Row>

          <NoteBar tone="blue" icon="info"
            action={<TextBtn icon="chart" onClick={() => setView('reports')}>Open Reports</TextBtn>}>
            Ratings are withheld for any teacher with fewer than <b>{min}</b> responses, so no individual
            student can be identified.
          </NoteBar>
        </>
      )}

      {/* ── Departments ──────────────────────────────────────────────────────── */}
      {view === 'departments' && (
        <>
          <Stats>
            <Stat icon="building" tone="purple" value={deptRows.length} label="Total Departments"
              caption="Across your school" />
            <Stat icon="users" tone="green" value={teachers.length} label="Total Teachers"
              caption="In selected period" />
            <Stat icon="chat" tone="blue" value={deptRows.reduce((n, d) => n + d.responses, 0)}
              label="Total Responses" caption="From all departments" />
            <Stat icon="star" tone="amber"
              value={cards?.averageRating == null ? '—' : <>{cards.averageRating.toFixed(1)}<em>/ 5</em></>}
              label="Overall Rating"
              caption={`Based on ${deptRows.reduce((n, d) => n + d.responses, 0)} responses`} />
          </Stats>

          <Row split="2">
            <Panel icon="chart" tone="purple" title="Department-wise Average Rating"
              subtitle="Out of 5 — a department with nobody past the floor is left out">
              {deptRows.some((d) => d.rating != null)
                ? (
                  <Columns max={5}
                    data={deptRows.filter((d) => d.rating != null)
                      .map((d) => ({ label: d.name, value: Number(d.rating.toFixed(1)) }))} />
                )
                : <Muted>No department has a teacher past the {min}-response floor yet.</Muted>}
            </Panel>

            <Panel icon="chart" tone="pink" title="Responses by Department"
              subtitle="Where the feedback actually came from">
              <Donut centerLabel="Total Responses"
                data={deptRows.filter((d) => d.responses > 0).map((d, i) => ({
                  label: d.name, value: d.responses, color: PALETTE.series[i % PALETTE.series.length],
                }))} />
            </Panel>
          </Row>

          <div className="fbcard">
            <Toolbar>
              <div className="fbtools__title">
                <b>Departments</b>
                <small>Detailed view of feedback performance for each department.</small>
              </div>
              <Spacer />
              <Search value={search} onChange={setSearch} placeholder="Search departments…" />
              <SortBy value={sort} onChange={setSort} options={DEPT_SORTS} dflt="rating" />
            </Toolbar>

            <Table
              loading={dash.loading}
              startIndex={start}
              rows={shown}
              expandedId={open}
              renderExpanded={(d) => <DeptTeachers dept={d} teachers={teachers} base={base} min={min} />}
              columns={[
                {
                  key: 'name', label: 'Department',
                  render: (d) => (
                    <button type="button" className="fbcatcell fbcatcell--btn"
                      onClick={() => setOpen(open === d._id ? null : d._id)}
                      aria-expanded={open === d._id}>
                      <span className={`fbcatcell__i fbcatcell__i--solid is-${toneAt(deptRows.indexOf(d))}`}>
                        <Icon name={departmentIcon(d.name)} size={17} />
                      </span>
                      <b>{d.name}</b>
                    </button>
                  ),
                },
                { key: 'teachers', label: 'Teachers', render: (d) => d.teachers },
                // Every department answered the same questionnaire, so this is
                // the campaign's own question count — the same on every row.
                { key: 'questions', label: 'Questions', render: () => focusQuestions ?? <Dash /> },
                { key: 'responses', label: 'Responses', render: (d) => d.responses },
                {
                  key: 'rating', label: 'Avg Rating',
                  render: (d) => (d.rating == null
                    ? <Locked responses={0} minimum={min} />
                    : <Rating value={d.rating} sub={`${d.evaluated} teacher${d.evaluated === 1 ? '' : 's'}`} />),
                },
                { key: 'rate', label: 'Response %', render: (d) => <Bar value={d.responseRate} /> },
                {
                  key: 'status', label: 'Status',
                  render: (d) => (d.rating == null
                    ? <Tag tone="amber">Insufficient</Tag>
                    : d.evaluated < d.teachers
                      ? <Tag tone="blue">Partial</Tag>
                      : <Tag tone="green">Active</Tag>),
                },
                {
                  key: 'a', className: 'fbtable__acts', label: 'Actions',
                  render: (d) => (
                    <TextBtn onClick={() => setOpen(open === d._id ? null : d._id)}>
                      View Details <Icon name="chevronRight" size={14} />
                    </TextBtn>
                  ),
                },
              ]}
              empty={<EmptyState icon="🏢" title="No department data"
                message="Departments come from teacher profiles. Set one on each teacher to see this broken down." />}
            />

            <Foot page={Math.min(page, pages)} pages={pages} total={rows.length} limit={limit}
              count={shown.length} noun="department" onPage={setPage} />
          </div>
        </>
      )}

      {/* ── Trends ───────────────────────────────────────────────────────────── */}
      {view === 'trends' && <TrendsView
        report={report} meta={meta} campaigns={campaigns} dash={dash}
        campaignId={campaignId} setCampaignId={setCampaignId}
        draft={draft} setDraft={setDraft} base={base} setView={setView} />}

      {/* ── Reports ──────────────────────────────────────────────────────────── */}
      {view === 'reports' && (
        <>
          <Stats>
            <Stat icon="users" tone="blue" value={report.data?.rows?.length ?? 0}
              label={reportType === 'teacher' ? 'Total Teachers' : 'Rows'} caption="In selected filters" />
            <Stat icon="chat" tone="green"
              value={(report.data?.rows || []).reduce((n, r) => n + (r.responses || 0), 0)}
              label="Total Responses"
              caption={`From ${report.data?.meta?.campaigns ?? 0} campaign(s)`} />
            <Stat icon="star" tone="amber" value={avgOf(report.data?.rows)} label="Average Rating"
              caption="Across all responses" />
            <Stat icon="target" tone="pink" value={`${rateOf(report.data?.rows)}%`} label="Response Rate"
              caption={`${(report.data?.rows || []).filter((r) => r.responses > 0).length} of ${report.data?.rows?.length ?? 0} responded`} />
          </Stats>

          <Panel icon="filter" tone="purple" title="Report Filters"
            subtitle="Select criteria to generate the report"
            right={(
              <>
                <button type="button" className="fbtb"
                  onClick={() => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); }}>
                  <Icon name="refresh" size={14} /> Reset
                </button>
                <button type="button" className="fbtb fbtb--primary"
                  onClick={() => { setApplied(draft); setPage(1); }}>
                  <Icon name="search" size={14} /> Generate Report
                </button>
              </>
            )}>
            <div className="fbfields fbfields--5">
              <Field label="Report">
                <select value={reportType} onChange={(e) => setReportType(e.target.value)} aria-label="Report">
                  {REPORTS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="Academic Year">
                <select value={draft.academicYear} aria-label="Academic Year"
                  onChange={(e) => setDraft({ ...draft, academicYear: e.target.value })}>
                  <option value="">All</option>
                  {(meta.data?.academicYears || []).map((y) => (
                    <option key={y._id} value={y._id}>{y.yearName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Campaign">
                <select value={draft.campaign} aria-label="Campaign"
                  onChange={(e) => setDraft({ ...draft, campaign: e.target.value })}>
                  <option value="">All</option>
                  {((campaigns.data?.data) || []).map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Teacher">
                <select value={draft.teacher} aria-label="Teacher"
                  onChange={(e) => setDraft({ ...draft, teacher: e.target.value })}>
                  <option value="">All</option>
                  {(meta.data?.teachers || []).map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </Field>

              <Field label="Subject">
                <select value={draft.subject} aria-label="Subject"
                  onChange={(e) => setDraft({ ...draft, subject: e.target.value })}>
                  <option value="">All</option>
                  {(meta.data?.subjects || []).map((s) => (
                    <option key={s._id} value={s._id}>{s.subjectName}</option>
                  ))}
                </select>
              </Field>
              <Field label="Class">
                <select value={draft.class} aria-label="Class"
                  onChange={(e) => setDraft({ ...draft, class: e.target.value, section: '' })}>
                  <option value="">All</option>
                  {(meta.data?.classes || []).map((c) => (
                    <option key={c._id} value={c._id}>{c.className}</option>
                  ))}
                </select>
              </Field>
              <Field label="Section">
                <select value={draft.section} aria-label="Section"
                  onChange={(e) => setDraft({ ...draft, section: e.target.value })}>
                  <option value="">All</option>
                  {sections.map((s) => <option key={s._id} value={s._id}>{s.sectionName}</option>)}
                </select>
              </Field>
              <Field label="Term">
                <input value={draft.term} placeholder="e.g. Term 1" aria-label="Term"
                  onChange={(e) => setDraft({ ...draft, term: e.target.value })} />
              </Field>
              <div className="fbfield--span2">
              <Field label="Date Range" hint="Filters on the campaign's start date.">
                <span className="fbrange">
                  <Icon name="calendar" size={15} />
                  <input type="date" value={draft.dateFrom} aria-label="From"
                    onChange={(e) => setDraft({ ...draft, dateFrom: e.target.value })} />
                  <span>→</span>
                  <input type="date" value={draft.dateTo} aria-label="To"
                    onChange={(e) => setDraft({ ...draft, dateTo: e.target.value })} />
                </span>
              </Field>
              </div>
            </div>
            <div className="fbdirty">
              {JSON.stringify(draft) !== JSON.stringify(applied)
                ? <span className="fbdirty__on"><Icon name="alert" size={14} /> Filters changed — press Generate Report to apply them.</span>
                : <span>{Object.values(applied).filter(Boolean).length
                  ? `${Object.values(applied).filter(Boolean).length} filter(s) applied.`
                  : 'Showing everything.'}</span>}
            </div>
          </Panel>

          <div className="fbcard">
            <Toolbar>
              <div className="fbtools__title">
                <b>{report.data?.title || 'Report'}</b>
                <small>Showing {shown.length} of {rows.length} row{rows.length === 1 ? '' : 's'}</small>
              </div>
              <Spacer />
              <Search value={search} onChange={setSearch} placeholder="Search this report…" />
            </Toolbar>

            <Table
              loading={report.loading}
              startIndex={start}
              rows={shown}
              columns={reportColumns(report.data?.columns, base, navigate)}
              empty={<EmptyState icon="📄" title="No data"
                message="No records match the selected filters." />}
            />

            <Foot page={Math.min(page, pages)} pages={pages} total={rows.length} limit={limit}
              count={shown.length} noun="row" onPage={setPage} />
          </div>

          <TipCard icon="sparkle" tone="purple" title="Insights"
            action={<TextBtn onClick={() => setView('trends')}>View Trends <Icon name="arrowRight" size={14} /></TextBtn>}>
            {(() => {
              const r = report.data?.rows || [];
              const answered = r.filter((x) => (x.responses || 0) > 0).length;
              return r.length
                ? `${answered} of ${r.length} ${reportType === 'teacher' ? 'teachers' : 'rows'} have responses. Rows without a rating are withheld because too few students responded — the same rule applies to Excel, CSV and PDF.`
                : 'Nothing matches these filters yet.';
            })()}
          </TipCard>
        </>
      )}
    </div>
  );
}

// ── Trends ───────────────────────────────────────────────────────────────────

const TrendsView = ({ report, meta, campaigns, dash, campaignId, setCampaignId, draft, setDraft, base, setView }) => {
  const rows = report.data?.rows || [];
  const points = rows.filter((r) => r.avgRating != null);
  const latest = points[points.length - 1];
  const prev = points[points.length - 2];

  const move = (a, b, digits = 1) => (a == null || b == null ? null
    : { text: `${Math.abs(a - b).toFixed(digits)}`, dir: a >= b ? 'up' : 'down' });
  const movePct = (a, b) => (a == null || b == null ? null
    : { text: `${Math.abs(Math.round(a - b))}%`, dir: a >= b ? 'up' : 'down' });

  const rating = move(latest?.avgRating, prev?.avgRating);
  const rate = movePct(latest?.responseRate, prev?.responseRate);
  const resp = latest && prev
    ? { text: String(Math.abs(latest.responses - prev.responses)), dir: latest.responses >= prev.responses ? 'up' : 'down' }
    : null;

  if (report.loading) return <div className="fbloading"><Spinner /></div>;

  return (
    <>
      <Stats>
        <StatVs icon="star" tone="purple" label="Overall Average Rating"
          value={latest?.avgRating == null ? '—' : latest.avgRating.toFixed(1)} unit="/ 5"
          delta={rating?.text} deltaDir={rating?.dir} vs="vs last campaign" />
        <StatVs icon="users" tone="green" label="Response Rate"
          value={`${latest?.responseRate ?? 0}%`}
          delta={rate?.text} deltaDir={rate?.dir} vs="vs last campaign" />
        <StatVs icon="fileDoc" tone="blue" label="Total Responses"
          value={rows.reduce((n, r) => n + (r.responses || 0), 0)}
          delta={resp?.text} deltaDir={resp?.dir} vs="vs last campaign" />
        <StatVs icon="teacher" tone="amber" label="Teachers Evaluated"
          value={dash.data?.cards?.teachersEvaluated ?? 0} vs="in this campaign" />
      </Stats>

      {!points.length ? (
        <div className="fbcard">
          <EmptyState icon="📈" title="No trend data yet"
            message="Trends appear once at least one campaign has collected responses." />
        </div>
      ) : (
        <>
          <Row split="2">
            <Panel icon="trending" tone="purple" title="Average Rating Trend"
              subtitle="Average teacher rating across campaigns">
              <TrendArea labels domain={[1, 5]}
                data={points.map((r) => ({ label: r.term || r.campaign, value: r.avgRating }))} />
            </Panel>
            <Panel icon="users" tone="green" title="Response Rate Trend"
              subtitle="Percentage of assigned students who responded">
              <TrendArea labels domain={[0, 100]} unit="%" color={PALETTE.green}
                data={points.map((r) => ({ label: r.term || r.campaign, value: r.responseRate }))} />
            </Panel>
          </Row>

          <Row split="2">
            <Panel icon="layers" tone="indigo" title="Category Performance (Latest Campaign)"
              subtitle="Average rating by category">
              {dash.data?.categories?.some((c) => c.average != null)
                ? (
                  <CatBars max={5} labelWidth={150}
                    data={[...dash.data.categories].filter((c) => c.average != null)
                      .sort((a, b) => b.average - a.average)
                      .map((c) => ({ label: c.name, value: Number(c.average.toFixed(1)) }))} />
                )
                : <Muted>No scored answers in the latest campaign yet.</Muted>}
            </Panel>
            <Panel icon="grid" tone="blue" title="Performance by Class"
              subtitle="Average rating across classes">
              <ByClass filters={{ campaign: campaignId, academicYear: draft.academicYear }} />
            </Panel>
          </Row>

          <TipCard icon="sparkle" tone="amber" title="Insight"
            action={<TextBtn onClick={() => setView('reports')}>View Detailed Report <Icon name="arrowRight" size={14} /></TextBtn>}>
            {rating
              ? <>The overall rating has moved <b>{rating.dir === 'up' ? 'up' : 'down'} {rating.text}</b> against
                the previous campaign, on a response rate of <b>{latest.responseRate}%</b>. Read the two together —
                a rating that climbs while responses fall is usually a smaller, keener sample rather than better teaching.</>
              : <>Only one campaign has collected responses so far, so there is nothing to compare against yet.</>}
          </TipCard>
        </>
      )}
    </>
  );
};

/** Class-wise ratings, pulled from the report endpoint that already groups them. */
const ByClass = ({ filters }) => {
  const { data, loading } = useFetch(
    () => api.getReport({ type: 'class', format: 'json', ...clean(filters) }),
    [JSON.stringify(filters)],
  );
  if (loading) return <div className="fbloading"><Spinner /></div>;
  const rows = (data?.rows || []).filter((r) => r.avgRating != null);
  if (!rows.length) return <Muted>No class has enough responses to show a rating yet.</Muted>;
  return (
    <CatBars max={5} labelWidth={110} color="#38bdf8"
      data={rows.sort((a, b) => b.avgRating - a.avgRating).slice(0, 10)
        .map((r) => ({ label: r.class, value: Number(r.avgRating.toFixed(1)) }))} />
  );
};

/** The teachers inside one department, opened from its row. */
const DeptTeachers = ({ dept, teachers, base, min }) => {
  const rows = teachers.filter((t) => (t.department || 'Unassigned') === dept.name);
  if (!rows.length) return <Muted>No teacher in this department was part of the campaign.</Muted>;
  return (
    <>
      <div className="fbexp__h">{dept.name} — {rows.length} teacher{rows.length === 1 ? '' : 's'}</div>
      <ul className="fbexp__rows">
        {rows.map((t) => (
          <li key={t._id}>
            <span style={{ flex: '1 1 200px', minWidth: 0 }}>
              <Who name={t.name} to={`${base}/teachers/${t._id}`} size={32}
                sub={t.subjects?.join(', ') || t.designation || 'Teacher'} />
            </span>
            <span className="fbexp__resp">{t.responses} / {t.assigned} responded</span>
            <Bar value={t.responseRate} />
            <Rating value={t.rating} locked={t.locked} responses={t.responses} minimum={min} sub={undefined} />
          </li>
        ))}
      </ul>
    </>
  );
};

/** A tiny up/down mark plus the figure — never a bare arrow. */
const Sparkline = ({ value }) => {
  const dir = value > 0.05 ? 'up' : value < -0.05 ? 'down' : 'flat';
  return (
    <span className={`fbtrendc is-${dir}`}>
      <Icon name={dir === 'up' ? 'trending' : dir === 'down' ? 'arrowDown' : 'arrowRight'} size={15} />
      {dir === 'flat' ? '0.0' : `${value > 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`}
    </span>
  );
};

/**
 * A report's columns come from the server, so the table and the export can
 * never drift apart. Only the rendering of a few known keys is ours.
 */
const reportColumns = (cols, base, navigate) => [...(cols || [])
  // The Note column carries "Insufficient responses" into a spreadsheet. On
  // screen that sentence already rides inside the rating cell, so a second
  // column of it would be a column of repeats.
  .filter((c) => c.key !== 'note')
  .map((c) => ({
    key: c.key,
    label: c.label,
    render: (r) => {
      if (c.key === 'avgRating') {
        // `note` is the server's own reason the figure is missing — almost
        // always the response floor. Printed here instead of a number, never
        // beside one.
        return r.avgRating == null
          ? <span className="fblocked" title={r.note || 'Not enough responses'}>{r.note || 'No responses'}</span>
          : <Rating value={r.avgRating} sub={undefined} />;
      }
      if (c.key === 'responseRate') return <Bar value={r.responseRate} />;
      if (c.key === 'teacher') {
        return r._id
          ? <Who name={r.teacher} to={`${base}/teachers/${r._id}`} tone={toneAt(r._rowIndex || 0)} sub="Teacher" />
          : <Stack main={r.teacher} />;
      }
      if (c.key === 'subjects') {
        return r.subjects ? <Tag tone="purple">{r.subjects}</Tag> : <Dash />;
      }
      if (c.key === 'status') return <Tag tone="slate">{r.status}</Tag>;
      const v = r[c.key];
      return v === 0 || (v && String(v).trim()) ? v : <Dash />;
    },
  })),
  // Status and View are on-screen only: they are derived from the row, and the
  // export flattens through the server's columns, so neither reaches a file.
  ...((cols || []).some((c) => c.key === 'avgRating') ? [{
    key: '_status', label: 'Status',
    render: (r) => (r.avgRating != null
      ? <Tag tone={r.avgRating >= 4 ? 'green' : r.avgRating >= 3 ? 'amber' : 'red'}>{ratingWord(r.avgRating)}</Tag>
      : (r.responses || 0) > 0 ? <Tag tone="pink">Needs More</Tag> : <Tag tone="amber">Insufficient</Tag>),
  }] : []),
  ...((cols || []).some((c) => c.key === 'teacher') ? [{
    key: '_act', className: 'fbtable__acts', label: 'Actions',
    render: (r) => (r._id
      ? <TextBtn icon="eye" onClick={() => navigate(`${base}/teachers/${r._id}`)}>View</TextBtn>
      : <Dash />),
  }] : []),
];

const avgOf = (rows) => {
  const have = (rows || []).filter((r) => r.avgRating != null);
  if (!have.length) return '—';
  return (have.reduce((n, r) => n + r.avgRating, 0) / have.length).toFixed(1);
};

const rateOf = (rows) => {
  const assigned = (rows || []).reduce((n, r) => n + (r.assigned || 0), 0);
  const responses = (rows || []).reduce((n, r) => n + (r.responses || 0), 0);
  return assigned ? Math.round((responses / assigned) * 100) : 0;
};
