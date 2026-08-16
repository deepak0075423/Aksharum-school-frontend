import React, { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../contexts/AuthContext';
import { getStudentAnalytics } from '../../api/analytics.api';
import { Spinner, Badge, Table, Alert, Empty } from '../../components/ui/index';
import {
  VIZ, Panel, Hero, Meter, Grid, KV, StatusSplit, TrendLine, RankBars, Columns,
  Empty as VizEmpty, fmtDate, fmtMoney, fmtMonth, toneForPercent,
} from './viz';

// The 360° view of one student. Every tab below is gated on the school having
// that module switched on — the backend only sends blocks for enabled modules,
// and the tab list is built from the same flags.
export default function StudentDetail() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const base = user?.role === 'teacher' ? '/teacher/student-analytics' : '/admin/student-analytics';

  const { data, loading, error } = useFetch(() => getStudentAnalytics(studentId), [studentId]);
  const [tab, setTab] = useState('general');

  const modules = data?.modules || {};
  const tabs = useMemo(() => ([
    { key: 'general',     label: 'General',    show: true },
    { key: 'attendance',  label: 'Attendance', show: !!modules.attendance },
    { key: 'results',     label: 'Results',    show: !!modules.result },
    { key: 'aptitude',    label: 'Aptitude',   show: !!modules.aptitudeExam },
    { key: 'fees',        label: 'Fees',       show: !!modules.fees },
    { key: 'library',     label: 'Library',    show: !!modules.library },
    { key: 'transport',   label: 'Transport',  show: !!modules.transport },
    { key: 'videos',      label: 'Videos',     show: !!modules.videoLibrary },
    { key: 'documents',   label: 'Assignments',show: !!modules.document },
    { key: 'timetable',   label: 'Timetable',  show: !!modules.timetable },
    { key: 'inventory',   label: 'Inventory',  show: !!modules.inventory },
    { key: 'alerts',      label: 'Alerts',     show: !!modules.notification },
  ].filter((t) => t.show)), [modules]);

  if (loading) return <div className="loading-page"><Spinner /></div>;
  if (error) {
    return (
      <div className="page">
        <Alert variant="danger">{error}</Alert>
        <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={() => navigate(base)}>← Back to analytics</button>
      </div>
    );
  }
  if (!data?.general) return <div className="page"><Empty icon="🔍" title="Student not found" /></div>;

  const { general } = data;
  const s = general.student;
  const p = general.profile;

  return (
    <div className="page">
      <Link to={base} style={{ fontSize: '.82rem' }}>← All students</Link>

      {/* Identity header */}
      <header style={{
        display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 18, margin: '12px 0 16px',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', background: '#ede9fe', color: VIZ.accent,
          display: 'grid', placeItems: 'center', fontSize: '1.4rem', fontWeight: 700, flexShrink: 0,
        }}>{(s.name || '?').charAt(0).toUpperCase()}</div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h1 style={{ fontSize: '1.3rem', margin: 0 }}>{s.name}</h1>
          <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', margin: '3px 0 0' }}>
            {general.placement.className} {general.placement.sectionName}
            {p.rollNumber ? ` · Roll ${p.rollNumber}` : ''}
            {p.admissionNumber ? ` · ${p.admissionNumber}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {s.isActive ? <Badge variant="success">Active</Badge> : <Badge variant="danger">Inactive</Badge>}
          {(data.viewer?.roles || []).map((r) => <Badge key={r} variant="primary">{r}</Badge>)}
          {data.academicYear && <Badge variant="muted">{data.academicYear.yearName}</Badge>}
        </div>
      </header>

      {/* Headline numbers across the enabled modules */}
      <Grid min={190}>
        {modules.attendance && (
          <Panel><Hero value={data.attendance?.percent ?? '—'} unit={data.attendance?.percent != null ? '%' : ''}
            label="Attendance" tone={toneForPercent(data.attendance?.percent)}
            sub={data.attendance?.total ? `${data.attendance.present + data.attendance.late}/${data.attendance.total} days present` : 'Not marked yet'} /></Panel>
        )}
        {modules.result && (
          <Panel><Hero value={data.results?.summary?.average ?? '—'} unit={data.results?.summary?.average != null ? '%' : ''}
            label="Average result" tone={toneForPercent(data.results?.summary?.average)}
            sub={`${data.results?.summary?.examsTaken || 0} exams · ${data.results?.summary?.testsTaken || 0} class tests`} /></Panel>
        )}
        {modules.fees && (
          <Panel><Hero value={fmtMoney(data.fees?.summary?.balance)} label="Fee balance"
            tone={(data.fees?.summary?.balance || 0) > 0 ? 'bad' : 'good'}
            sub={`${fmtMoney(data.fees?.summary?.paid)} paid of ${fmtMoney(data.fees?.summary?.charged)}`} /></Panel>
        )}
        {modules.library && (
          <Panel><Hero value={data.library?.summary?.currentlyOut ?? 0} label="Books out"
            tone={data.library?.summary?.overdue ? 'bad' : 'good'}
            sub={`${data.library?.summary?.totalIssued || 0} borrowed all-time · ${data.library?.summary?.overdue || 0} overdue`} /></Panel>
        )}
      </Grid>

      {/* Tabs */}
      <div className="tabs" style={{ margin: '4px 0 16px' }}>
        {tabs.map((t) => (
          <button key={t.key} className={`tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general'    && <GeneralTab general={general} />}
      {tab === 'attendance' && <AttendanceTab a={data.attendance} />}
      {tab === 'results'    && <ResultsTab r={data.results} />}
      {tab === 'aptitude'   && <AptitudeTab a={data.aptitude} />}
      {tab === 'fees'       && <FeesTab f={data.fees} />}
      {tab === 'library'    && <LibraryTab l={data.library} />}
      {tab === 'transport'  && <TransportTab t={data.transport} />}
      {tab === 'videos'     && <VideosTab v={data.videos} />}
      {tab === 'documents'  && <DocumentsTab d={data.documents} />}
      {tab === 'timetable'  && <TimetableTab t={data.timetable} />}
      {tab === 'inventory'  && <InventoryTab i={data.inventory} />}
      {tab === 'alerts'     && <AlertsTab n={data.notifications} />}
    </div>
  );
}

// ── General ───────────────────────────────────────────────────────────────────
function GeneralTab({ general }) {
  const s = general.student, p = general.profile, pl = general.placement;
  const address = [p.address, p.city, p.state, p.pincode, p.country].filter(Boolean).join(', ');
  return (
    <Grid min={300}>
      <Panel title="Personal">
        <KV label="Full name" value={s.name} />
        <KV label="Gender" value={p.gender ? p.gender[0].toUpperCase() + p.gender.slice(1) : ''} />
        <KV label="Date of birth" value={p.dob ? `${fmtDate(p.dob)}${p.age != null ? ` (${p.age} yrs)` : ''}` : ''} />
        <KV label="Blood group" value={p.bloodGroup} />
        <KV label="Religion" value={p.religion} />
        <KV label="Category" value={p.category} />
      </Panel>

      <Panel title="Contact">
        <KV label="Email" value={s.email} />
        <KV label="Phone" value={s.phone} />
        <KV label="Address" value={address} />
        <KV label="Account created" value={fmtDate(s.joinedAt)} />
        <KV label="Last seen" value={s.lastSeenAt ? fmtDate(s.lastSeenAt) : 'Never signed in'} />
      </Panel>

      <Panel title="Enrolment">
        <KV label="Class" value={`${pl.className} ${pl.sectionName}`.trim()} />
        <KV label="Roll number" value={p.rollNumber} />
        <KV label="Admission number" value={p.admissionNumber} />
        <KV label="Class teacher" value={pl.classTeacher?.name} />
        <KV label="Vice class teacher" value={pl.viceClassTeacher?.name} />
      </Panel>

      <Panel title="Parent / guardian">
        {general.parent ? (
          <>
            <KV label="Name" value={general.parent.name} />
            <KV label="Email" value={general.parent.email} />
            <KV label="Phone" value={general.parent.phone} />
          </>
        ) : <VizEmpty text="No parent account linked" />}
      </Panel>

      <Panel title="Subject teachers">
        {pl.subjectTeachers?.length
          ? pl.subjectTeachers.map((t, i) => <KV key={i} label={t.subject || 'Subject'} value={t.teacher} />)
          : <VizEmpty text="No subject teachers assigned" />}
      </Panel>

      {!!general.sectionHistory?.length && (
        <Panel title="Section history">
          {general.sectionHistory.map((h, i) => (
            <KV key={i} label={fmtDate(h.date)} value={`${h.from || '—'} → ${h.to || '—'}`} />
          ))}
        </Panel>
      )}
    </Grid>
  );
}

// ── Attendance ────────────────────────────────────────────────────────────────
function AttendanceTab({ a }) {
  if (!a?.tracked) return <Panel><VizEmpty text="No attendance has been marked for this section yet" /></Panel>;
  const trend = (a.monthly || []).map((m) => ({ month: fmtMonth(m.month), percent: m.percent }));
  return (
    <>
      <Grid min={280}>
        <Panel title="This year" subtitle={`${a.total} sessions marked`}>
          <Hero value={a.percent} unit="%" label="Attendance" tone={toneForPercent(a.percent)}
            sub={a.rank ? `Rank ${a.rank} of ${a.sectionSize} in the section` : null} />
          <div style={{ marginTop: 16 }}>
            <StatusSplit items={[
              { label: 'Present', value: a.present, color: VIZ.good, percent: a.total ? (a.present / a.total) * 100 : 0 },
              { label: 'Late',    value: a.late,    color: VIZ.warn, percent: a.total ? (a.late / a.total) * 100 : 0 },
              { label: 'Absent',  value: a.absent,  color: VIZ.bad,  percent: a.total ? (a.absent / a.total) * 100 : 0 },
            ]} />
          </div>
        </Panel>
        <Panel title="Monthly attendance" subtitle="Share of marked days attended, per month">
          <TrendLine data={trend} xKey="month" yKey="percent" unit="%" name="Attendance" />
        </Panel>
      </Grid>

      <Panel title="Recent days">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
            { key: 'status', label: 'Status', render: (r) => (
              <Badge variant={r.status === 'present' ? 'success' : r.status === 'late' ? 'warning' : 'danger'}>
                {r.status}
              </Badge>
            ) },
            { key: 'remarks', label: 'Remarks', render: (r) => r.remarks || '—' },
          ]}
          data={a.recent} emptyTitle="No records" />
      </Panel>

      <Panel title="Month by month">
        <Table
          columns={[
            { key: 'month',   label: 'Month',   render: (r) => fmtMonth(r.month) },
            { key: 'present', label: 'Present' },
            { key: 'late',    label: 'Late' },
            { key: 'absent',  label: 'Absent' },
            { key: 'percent', label: 'Attendance', render: (r) => `${r.percent}%` },
          ]}
          data={a.monthly} emptyTitle="No months recorded" />
      </Panel>
    </>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────
function ResultsTab({ r }) {
  if (!r) return <Panel><VizEmpty /></Panel>;
  const sum = r.summary || {};
  // Exam names get long; keep the tick short enough that every period stays
  // labelled, and let the tooltip carry the full title.
  const trend = (r.trend || []).filter((t) => t.percentage != null)
    .map((t) => ({ label: (t.label || '').slice(0, 10), percentage: t.percentage }));
  const subjects = (r.subjectAverages || []).slice(0, 10)
    .map((x) => ({ subject: x.subject.slice(0, 18), average: x.average }));

  return (
    <>
      <Grid min={280}>
        <Panel title="Standing" subtitle={`${sum.examsTaken || 0} exams · ${sum.testsTaken || 0} class tests`}>
          <Hero value={sum.average ?? '—'} unit={sum.average != null ? '%' : ''} label="Average across exams"
            tone={toneForPercent(sum.average)}
            sub={sum.bestRank ? `Best rank achieved: ${sum.bestRank}` : null} />
          <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
            <KV label="Best exam score" value={sum.best != null ? `${sum.best}%` : '—'} />
            <KV label="Exams failed" value={sum.failedExams ?? 0} />
            <KV label="Strongest subject" value={r.strongest ? `${r.strongest.subject} · ${r.strongest.average}%` : '—'} />
            <KV label="Weakest subject" value={r.weakest ? `${r.weakest.subject} · ${r.weakest.average}%` : '—'} />
          </div>
        </Panel>
        <Panel title="Result trend" subtitle="Percentage per formal exam, oldest first">
          <TrendLine data={trend} xKey="label" yKey="percentage" unit="%" name="Result" />
        </Panel>
      </Grid>

      <Panel title="Subject strength" subtitle="Average percentage per subject across exams and class tests">
        <RankBars data={subjects} labelKey="subject" valueKey="average" unit="%" />
      </Panel>

      <Panel title="Formal exams">
        <Table
          columns={[
            { key: 'title', label: 'Exam' },
            { key: 'examType', label: 'Type', render: (x) => (x.examType || '').replace('_', ' ') || '—' },
            { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
            { key: 'marks', label: 'Marks', render: (x) => `${x.obtained ?? '—'} / ${x.max ?? '—'}` },
            { key: 'percentage', label: '%', render: (x) => `${x.percentage ?? '—'}%` },
            { key: 'grade', label: 'Grade', render: (x) => x.grade || '—' },
            { key: 'rank', label: 'Rank', render: (x) => x.rank || '—' },
            { key: 'isPassed', label: 'Result', render: (x) => (
              <Badge variant={x.isPassed ? 'success' : 'danger'}>{x.isPassed ? 'Pass' : 'Fail'}</Badge>) },
          ]}
          data={r.exams} emptyTitle="No published exam results" />
      </Panel>

      {!!r.exams?.length && (
        <Panel title="Subject-wise marks" subtitle="Every subject of every published exam">
          {r.exams.map((e) => (
            <div key={e._id} style={{ marginBottom: 18 }}>
              <h4 style={{ fontSize: '.84rem', fontWeight: 600, marginBottom: 8 }}>{e.title}</h4>
              <Table
                columns={[
                  { key: 'subject', label: 'Subject' },
                  { key: 'marks', label: 'Marks', render: (x) => (x.isAbsent ? 'Absent' : `${x.obtained} / ${x.max}`) },
                  { key: 'percent', label: '%', render: (x) => (x.isAbsent ? '—' : `${x.percent}%`) },
                  { key: 'grade', label: 'Grade', render: (x) => x.grade || '—' },
                  { key: 'isPassed', label: 'Result', render: (x) => (
                    <Badge variant={x.isAbsent ? 'muted' : x.isPassed ? 'success' : 'danger'}>
                      {x.isAbsent ? 'Absent' : x.isPassed ? 'Pass' : 'Fail'}
                    </Badge>) },
                ]}
                data={e.subjects} emptyTitle="No subjects" />
            </div>
          ))}
        </Panel>
      )}

      <Panel title="Class tests">
        <Table
          columns={[
            { key: 'title', label: 'Test' },
            { key: 'subject', label: 'Subject', render: (x) => x.subject || '—' },
            { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
            { key: 'marks', label: 'Marks', render: (x) => (x.isAbsent ? 'Absent' : `${x.obtained ?? '—'} / ${x.max}`) },
            { key: 'percent', label: '%', render: (x) => (x.percent == null ? '—' : `${x.percent}%`) },
            { key: 'classAvg', label: 'Class avg', render: (x) => (x.classAvg == null ? '—' : x.classAvg) },
            { key: 'status', label: 'Status', render: (x) => (
              <Badge variant={x.status === 'final_approved' ? 'success' : 'muted'}>{(x.status || '').replace(/_/g, ' ')}</Badge>) },
          ]}
          data={r.classTests} emptyTitle="No class tests recorded" />
      </Panel>
    </>
  );
}

// ── Aptitude ──────────────────────────────────────────────────────────────────
function AptitudeTab({ a }) {
  const sum = a?.summary || {};
  return (
    <>
      <Grid min={280}>
        <Panel title="Aptitude exams">
          <Hero value={sum.average ?? '—'} unit={sum.average != null ? '%' : ''} label="Average score"
            tone={toneForPercent(sum.average)}
            sub={`${sum.evaluated || 0} evaluated of ${sum.attempted || 0} attempted`} />
          <div style={{ marginTop: 14 }}>
            <KV label="Best score" value={sum.best != null ? `${sum.best}%` : '—'} />
            <KV label="Submitted" value={sum.submitted ?? 0} />
            <KV label="Integrity violations" value={sum.violations ?? 0} />
          </div>
        </Panel>
        <Panel title="Violations by type" subtitle="Anti-cheat events raised during attempts">
          {a?.violationTypes?.length
            ? <StatusSplit items={a.violationTypes.map((v) => ({
                label: v.type.replace(/_/g, ' '), value: v.count, color: VIZ.warn,
                percent: (v.count / Math.max(1, sum.violations)) * 100,
              }))} />
            : <VizEmpty text="No violations recorded" />}
        </Panel>
      </Grid>

      <Panel title="Exam history">
        <Table
          columns={[
            { key: 'title', label: 'Exam' },
            { key: 'subject', label: 'Subject', render: (x) => x.subject || '—' },
            { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
            { key: 'marks', label: 'Marks', render: (x) => `${x.obtained} / ${x.max}` },
            { key: 'percentage', label: '%', render: (x) => `${x.percentage}%` },
          ]}
          data={a?.exams} emptyTitle="No aptitude exams taken" />
      </Panel>
    </>
  );
}

// ── Fees ──────────────────────────────────────────────────────────────────────
function FeesTab({ f }) {
  const sum = f?.summary || {};
  const monthly = (f?.monthly || []).map((m) => ({ month: fmtMonth(m.month), paid: m.paid }));
  return (
    <>
      <Grid min={280}>
        <Panel title="Fee position" subtitle={sum.structure ? `Structure: ${sum.structure}` : 'No structure assigned'}>
          <Hero value={fmtMoney(sum.balance)} label="Outstanding balance"
            tone={(sum.balance || 0) > 0 ? 'bad' : 'good'}
            sub={sum.status === 'not_assigned' ? 'No fees charged yet' : null} />
          <div style={{ marginTop: 14 }}>
            <KV label="Total charged" value={fmtMoney(sum.charged)} />
            <KV label="Total paid" value={fmtMoney(sum.paid)} />
            <KV label="Concession" value={fmtMoney(sum.concession)} />
            <KV label="Fines" value={fmtMoney(sum.fine)} />
            <KV label="Last payment" value={f?.lastPaymentAt ? fmtDate(f.lastPaymentAt) : '—'} />
          </div>
          {sum.charged > 0 && (
            <div style={{ marginTop: 14 }}>
              <Meter value={(sum.paid / Math.max(1, sum.charged)) * 100}
                label="Collected" tone={(sum.balance || 0) > 0 ? 'warn' : 'good'}
                right={<strong>{Math.round((sum.paid / Math.max(1, sum.charged)) * 100)}%</strong>} />
            </div>
          )}
        </Panel>
        <Panel title="Payments by month" subtitle="Amount credited each month">
          <Columns data={monthly} xKey="month" yKey="paid" format={(v) => fmtMoney(v)} />
        </Panel>
      </Grid>

      {!!f?.concessions?.length && (
        <Panel title="Concessions">
          <Table
            columns={[
              { key: 'name', label: 'Concession' },
              { key: 'type', label: 'Type' },
              { key: 'value', label: 'Value', render: (x) => (x.type === 'percentage' ? `${x.value}%` : fmtMoney(x.value)) },
              { key: 'from', label: 'Valid from', render: (x) => fmtDate(x.from) },
              { key: 'to', label: 'Valid to', render: (x) => fmtDate(x.to) },
            ]}
            data={f.concessions} />
        </Panel>
      )}

      <Panel title="Payments">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
            { key: 'receipt', label: 'Receipt', render: (x) => x.receipt || '—' },
            { key: 'amount', label: 'Amount', render: (x) => fmtMoney(x.amount) },
            { key: 'mode', label: 'Mode', render: (x) => x.mode || '—' },
            { key: 'status', label: 'Status', render: (x) => (
              <Badge variant={x.refunded ? 'muted' : x.status === 'completed' ? 'success' : x.status === 'failed' ? 'danger' : 'warning'}>
                {x.refunded ? 'refunded' : x.status}
              </Badge>) },
          ]}
          data={f?.payments} emptyTitle="No payments recorded" />
      </Panel>

      <Panel title="Ledger" subtitle="Most recent entries first">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
            { key: 'description', label: 'Description' },
            { key: 'period', label: 'Period', render: (x) => x.period || '—' },
            { key: 'amount', label: 'Amount', render: (x) => (
              <span style={{ color: x.type === 'credit' ? VIZ.good : VIZ.ink }}>
                {x.type === 'credit' ? '−' : '+'}{fmtMoney(x.amount)}
              </span>) },
            { key: 'balance', label: 'Balance', render: (x) => fmtMoney(x.balance) },
          ]}
          data={f?.ledger} emptyTitle="No ledger entries" />
      </Panel>
    </>
  );
}

// ── Library ───────────────────────────────────────────────────────────────────
function LibraryTab({ l }) {
  const sum = l?.summary || {};
  return (
    <>
      <Grid min={280}>
        <Panel title="Borrowing" subtitle={`${sum.totalIssued || 0} books borrowed all-time`}>
          <Hero value={sum.currentlyOut ?? 0} label="Currently out"
            tone={sum.overdue ? 'bad' : 'good'} sub={`${sum.overdue || 0} overdue`} />
          <div style={{ marginTop: 14 }}>
            <KV label="Returned" value={sum.returned ?? 0} />
            <KV label="Returned on time" value={`${sum.onTimeReturns ?? 0} (${sum.punctuality ?? 0}%)`} />
            <KV label="Renewals used" value={sum.renewals ?? 0} />
            <KV label="Active reservations" value={sum.reservations ?? 0} />
          </div>
        </Panel>
        <Panel title="Fines">
          <Hero value={fmtMoney(sum.finePending)} label="Pending fines"
            tone={(sum.finePending || 0) > 0 ? 'bad' : 'good'}
            sub={`${fmtMoney(sum.fineTotal)} levied in total`} />
          {sum.returned > 0 && (
            <div style={{ marginTop: 16 }}>
              <Meter value={sum.punctuality} label="Return punctuality"
                right={<strong>{sum.punctuality}%</strong>} />
            </div>
          )}
        </Panel>
      </Grid>

      <Panel title="Currently borrowed">
        <Table
          columns={[
            { key: 'title', label: 'Book' },
            { key: 'author', label: 'Author', render: (x) => x.author || '—' },
            { key: 'issueDate', label: 'Issued', render: (x) => fmtDate(x.issueDate) },
            { key: 'dueDate', label: 'Due', render: (x) => fmtDate(x.dueDate) },
            { key: 'daysOverdue', label: 'Status', render: (x) => (x.daysOverdue > 0
              ? <Badge variant="danger">{x.daysOverdue}d overdue</Badge>
              : <Badge variant="success">On time</Badge>) },
          ]}
          data={l?.current} emptyTitle="No books currently borrowed" />
      </Panel>

      <Panel title="Borrowing history">
        <Table
          columns={[
            { key: 'title', label: 'Book' },
            { key: 'issueDate', label: 'Issued', render: (x) => fmtDate(x.issueDate) },
            { key: 'dueDate', label: 'Due', render: (x) => fmtDate(x.dueDate) },
            { key: 'returnDate', label: 'Returned', render: (x) => fmtDate(x.returnDate) },
            { key: 'fine', label: 'Fine', render: (x) => (x.fine ? fmtMoney(x.fine) : '—') },
            { key: 'status', label: 'Status', render: (x) => (
              <Badge variant={x.status === 'returned' ? 'success' : x.status === 'overdue' ? 'danger' : 'info'}>{x.status}</Badge>) },
          ]}
          data={l?.history} emptyTitle="No borrowing history" />
      </Panel>
    </>
  );
}

// ── Transport ─────────────────────────────────────────────────────────────────
function TransportTab({ t }) {
  if (!t?.assigned) {
    return (
      <>
        <Panel><VizEmpty text="This student is not assigned to a transport route" /></Panel>
        {!!t?.fees?.invoices && <TransportInvoices fees={t.fees} />}
      </>
    );
  }
  const a = t.assignment;
  return (
    <>
      <Grid min={280}>
        <Panel title="Route assignment">
          <KV label="Route" value={`${a.route}${a.routeCode ? ` (${a.routeCode})` : ''}`} />
          <KV label="Vehicle" value={[a.vehicle, a.busName].filter(Boolean).join(' · ')} />
          <KV label="Pickup stop" value={a.pickupStop} />
          <KV label="Drop stop" value={a.dropStop} />
          <KV label="Shift" value={a.shift} />
          <KV label="Seat" value={a.seatNumber} />
          <KV label="Assigned since" value={fmtDate(a.since)} />
          {a.temporary && <KV label="Type" value="Temporary assignment" />}
        </Panel>
        <Panel title="Bus attendance" subtitle="Last 90 days of trips on this route">
          <Hero value={t.trips.percent ?? '—'} unit={t.trips.percent != null ? '%' : ''} label="Boarding rate"
            tone={toneForPercent(t.trips.percent)} sub={`${t.trips.boarded} of ${t.trips.total} trips`} />
          <div style={{ marginTop: 16 }}>
            <StatusSplit items={[
              { label: 'Boarded', value: t.trips.boarded, color: VIZ.good, percent: t.trips.total ? (t.trips.boarded / t.trips.total) * 100 : 0 },
              { label: 'Absent',  value: t.trips.absent,  color: VIZ.warn, percent: t.trips.total ? (t.trips.absent / t.trips.total) * 100 : 0 },
              { label: 'No show', value: t.trips.noShow,  color: VIZ.bad,  percent: t.trips.total ? (t.trips.noShow / t.trips.total) * 100 : 0 },
            ]} />
          </div>
        </Panel>
      </Grid>

      <Panel title="Recent trips">
        <Table
          columns={[
            { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
            { key: 'shift', label: 'Shift' },
            { key: 'direction', label: 'Direction' },
            { key: 'status', label: 'Status', render: (x) => (
              <Badge variant={['boarded', 'dropped'].includes(x.status) ? 'success' : x.status === 'absent' ? 'warning' : 'danger'}>
                {x.status}
              </Badge>) },
            { key: 'delayMinutes', label: 'Delay', render: (x) => (x.delayMinutes ? `${x.delayMinutes} min` : '—') },
          ]}
          data={t.trips.recent} emptyTitle="No trip attendance recorded" />
      </Panel>

      <TransportInvoices fees={t.fees} />

      {!!t.complaints?.length && (
        <Panel title="Complaints">
          <Table
            columns={[
              { key: 'code', label: 'Code' },
              { key: 'subject', label: 'Subject' },
              { key: 'category', label: 'Category' },
              { key: 'priority', label: 'Priority' },
              { key: 'raisedAt', label: 'Raised', render: (x) => fmtDate(x.raisedAt) },
              { key: 'status', label: 'Status', render: (x) => (
                <Badge variant={['resolved', 'closed'].includes(x.status) ? 'success' : 'warning'}>{x.status}</Badge>) },
            ]}
            data={t.complaints} />
        </Panel>
      )}
    </>
  );
}

function TransportInvoices({ fees }) {
  return (
    <Panel title="Transport fees" subtitle={`${fmtMoney(fees.paid)} paid of ${fmtMoney(fees.billed)} billed`}>
      <Table
        columns={[
          { key: 'number', label: 'Invoice' },
          { key: 'period', label: 'Period', render: (x) => x.period || '—' },
          { key: 'amount', label: 'Amount', render: (x) => fmtMoney(x.amount) },
          { key: 'paid', label: 'Paid', render: (x) => fmtMoney(x.paid) },
          { key: 'dueDate', label: 'Due', render: (x) => fmtDate(x.dueDate) },
          { key: 'status', label: 'Status', render: (x) => (
            <Badge variant={x.status === 'paid' ? 'success' : x.status === 'overdue' ? 'danger' : 'warning'}>{x.status}</Badge>) },
        ]}
        data={fees.list} emptyTitle="No transport invoices" />
    </Panel>
  );
}

// ── Videos ────────────────────────────────────────────────────────────────────
function VideosTab({ v }) {
  const sum = v?.summary || {};
  return (
    <>
      <Grid min={280}>
        <Panel title="Video learning">
          <Hero value={sum.videosCompleted ?? 0} label="Videos completed"
            tone={sum.completionRate >= 60 ? 'good' : sum.completionRate >= 30 ? 'warn' : 'bad'}
            sub={`${sum.videosStarted || 0} started · ${sum.watchHours || 0} h watched`} />
          <div style={{ marginTop: 14 }}>
            <KV label="Assignments received" value={sum.assignments ?? 0} />
            <KV label="Active assignments" value={sum.activeAssignments ?? 0} />
            <KV label="Average progress" value={sum.avgProgress != null ? `${sum.avgProgress}%` : '—'} />
            <KV label="Replays" value={sum.replays ?? 0} />
            <KV label="Last watched" value={sum.lastWatchedAt ? fmtDate(sum.lastWatchedAt) : '—'} />
          </div>
        </Panel>
        <Panel title="Completion" subtitle="Share of started videos finished">
          <Meter value={sum.completionRate} label="Completion rate" height={12}
            right={<strong>{sum.completionRate ?? 0}%</strong>} />
          <div style={{ marginTop: 18 }}>
            <RankBars
              data={(v?.recent || []).slice(0, 6).map((x) => ({ title: (x.title || '').slice(0, 18), progress: x.progress }))}
              labelKey="title" valueKey="progress" unit="%" />
          </div>
        </Panel>
      </Grid>

      <Panel title="Watch history">
        <Table
          columns={[
            { key: 'title', label: 'Video' },
            { key: 'progress', label: 'Progress', render: (x) => (
              <Meter value={x.progress} right={<strong>{x.progress}%</strong>} />) },
            { key: 'watchedMin', label: 'Watched', render: (x) => `${x.watchedMin} min` },
            { key: 'completed', label: 'Status', render: (x) => (
              <Badge variant={x.completed ? 'success' : 'warning'}>{x.completed ? 'Completed' : 'In progress'}</Badge>) },
            { key: 'lastAt', label: 'Last watched', render: (x) => fmtDate(x.lastAt) },
          ]}
          data={v?.recent} emptyTitle="No videos watched yet" />
      </Panel>

      <Panel title="Assignments">
        <Table
          columns={[
            { key: 'title', label: 'Assignment' },
            { key: 'videoCount', label: 'Videos' },
            { key: 'dueDate', label: 'Due', render: (x) => fmtDate(x.dueDate) },
            { key: 'mandatory', label: 'Mandatory', render: (x) => (x.mandatory ? 'Yes' : 'No') },
            { key: 'status', label: 'Status', render: (x) => <Badge variant="info">{x.status}</Badge> },
          ]}
          data={v?.assignments} emptyTitle="No video assignments" />
      </Panel>
    </>
  );
}

// ── Documents / assignments ───────────────────────────────────────────────────
function DocumentsTab({ d }) {
  const sum = d?.summary || {};
  return (
    <>
      <Grid min={280}>
        <Panel title="Assignment submissions">
          <Hero value={sum.submitted ?? 0} label="Submitted"
            tone={sum.pending ? 'warn' : 'good'}
            sub={`${sum.pending || 0} pending of ${sum.assigned || 0} assigned`} />
          <div style={{ marginTop: 14 }}>
            <KV label="Reviewed" value={sum.reviewed ?? 0} />
            <KV label="Submitted late" value={sum.late ?? 0} />
            <KV label="On-time rate" value={`${sum.onTimeRate ?? 0}%`} />
            <KV label="Average marks" value={sum.avgMarks != null ? sum.avgMarks : '—'} />
          </div>
        </Panel>
        <Panel title="Pending submissions">
          <Table
            columns={[
              { key: 'title', label: 'Assignment' },
              { key: 'dueDate', label: 'Due', render: (x) => fmtDate(x.dueDate) },
              { key: 'overdue', label: 'Status', render: (x) => (
                <Badge variant={x.overdue ? 'danger' : 'warning'}>{x.overdue ? 'Overdue' : 'Pending'}</Badge>) },
            ]}
            data={d?.pending} emptyTitle="Nothing pending" />
        </Panel>
      </Grid>

      <Panel title="Submissions">
        <Table
          columns={[
            { key: 'title', label: 'Assignment' },
            { key: 'submittedAt', label: 'Submitted', render: (x) => fmtDate(x.submittedAt) },
            { key: 'marks', label: 'Marks', render: (x) => (x.marks == null ? '—' : `${x.marks}${x.totalMarks ? ` / ${x.totalMarks}` : ''}`) },
            { key: 'status', label: 'Status', render: (x) => (
              <Badge variant={x.status === 'submitted' ? 'success' : x.status === 'late' ? 'warning' : 'muted'}>{x.status}</Badge>) },
            { key: 'feedback', label: 'Feedback', render: (x) => x.feedback || '—' },
          ]}
          data={d?.submissions} emptyTitle="No submissions" />
      </Panel>
    </>
  );
}

// ── Timetable ─────────────────────────────────────────────────────────────────
function TimetableTab({ t }) {
  if (!t?.hasTimetable) return <Panel><VizEmpty text="No timetable published for this section" /></Panel>;
  return (
    <>
      <Panel title="Weekly load" subtitle={`${t.periodsPerWeek} periods a week`}>
        <RankBars
          data={t.subjects.map((s) => ({ subject: s.subject.slice(0, 18), periods: s.periods }))}
          labelKey="subject" valueKey="periods" unit=""
          max={Math.max(...t.subjects.map((s) => s.periods), 1)} />
      </Panel>
      <Panel title="Subjects and teachers">
        <Table
          columns={[
            { key: 'subject', label: 'Subject' },
            { key: 'periods', label: 'Periods / week' },
            { key: 'teachers', label: 'Teachers', render: (x) => (x.teachers || []).join(', ') || '—' },
          ]}
          data={t.subjects} />
      </Panel>
    </>
  );
}

// ── Inventory ─────────────────────────────────────────────────────────────────
function InventoryTab({ i }) {
  const sum = i?.summary || {};
  return (
    <>
      <Panel title="Items issued to this student">
        <Grid min={130} gap={14}>
          <Hero value={sum.open ?? 0} label="Not yet returned" tone={sum.overdue ? 'bad' : 'good'} />
          <Hero value={sum.returned ?? 0} label="Returned" tone="accent" />
          <Hero value={sum.overdue ?? 0} label="Past return date" tone={sum.overdue ? 'bad' : 'good'} />
        </Grid>
      </Panel>
      <Panel title="Issue history">
        <Table
          columns={[
            { key: 'item', label: 'Item' },
            { key: 'quantity', label: 'Qty' },
            { key: 'issueDate', label: 'Issued', render: (x) => fmtDate(x.issueDate) },
            { key: 'expectedReturn', label: 'Return by', render: (x) => fmtDate(x.expectedReturn) },
            { key: 'status', label: 'Status', render: (x) => (
              <Badge variant={x.status === 'returned' ? 'success' : 'warning'}>{(x.status || '').replace(/_/g, ' ')}</Badge>) },
          ]}
          data={i?.items} emptyTitle="No items issued" />
      </Panel>
    </>
  );
}

// ── Alerts ────────────────────────────────────────────────────────────────────
function AlertsTab({ n }) {
  const sum = n?.summary || {};
  return (
    <Panel title="Notifications" subtitle="How reliably this student reads what the school sends">
      <Grid min={140} gap={14}>
        <Hero value={sum.received ?? 0} label="Received" tone="accent" />
        <Hero value={sum.read ?? 0} label="Read" tone="good" />
        <Hero value={sum.unread ?? 0} label="Unread" tone={sum.unread ? 'warn' : 'good'} />
      </Grid>
      <div style={{ marginTop: 18 }}>
        <Meter value={sum.readRate} label="Read rate" height={12} right={<strong>{sum.readRate ?? 0}%</strong>} />
      </div>
    </Panel>
  );
}
