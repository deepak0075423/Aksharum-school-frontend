/**
 * The admission office's dashboard. Every figure is an aggregate the server
 * computes over the school's own rows (/admin/analytics) for the chosen year,
 * round and class — nothing here is counted in the browser or made up.
 */
import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { admin } from '../../../api/admission.api';
import { Page, Head, Panel, Tiles, Tile, Btn, Spin, ErrorBox, Empty, Note, Meter, Table, Ico, Chip, KV, useLoad } from '../admUI';
import { money, fmtDate, fmtDateTime } from '../meta';
import { useAdmission, useQueryState, RoundSelect, ClassSelect, YearSelect, BarRow } from './parts';

const BASE = '/admin/admissions';
const n = (v) => (v == null ? '—' : Number(v).toLocaleString('en-IN'));
const AXIS = { fontSize: 11, fill: '#64748b' };

function Checklist({ adm }) {
  const s = adm.settings;
  const items = [
    { done: !!s.slug, label: 'Choose the portal address', to: `${BASE}/settings?tab=portal` },
    { done: (adm.forms || []).some((f) => f.currentVersion), label: 'Publish an application form', to: `${BASE}/forms` },
    { done: (adm.rounds || []).some((r) => (r.classes || []).length), label: 'Create an admission round with its classes and seats', to: `${BASE}/rounds` },
    { done: (adm.rounds || []).some((r) => r.status === 'open'), label: 'Open a round', to: `${BASE}/rounds` },
    { done: s.portal.status === 'open', label: 'Open the portal to applicants', to: `${BASE}/settings?tab=portal` },
  ];
  if (items.every((i) => i.done)) return null;
  return (
    <Panel title="Set up admissions" sub={`${items.filter((i) => i.done).length} of ${items.length} done`} icon="sparkle">
      <div className="adm-checklist">
        {items.map((i) => (
          <div key={i.label} className={`adm-checklist__item ${i.done ? 'is-done' : ''}`}>
            <Ico name={i.done ? 'checkCircle' : 'target'} size={16} />{i.label}
            {!i.done ? <Link to={i.to}>Do it</Link> : null}
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function Dashboard() {
  const adm = useAdmission();
  const nav = useNavigate();
  const [q, setQ] = useQueryState({ academicYear: '', round: '', class: '' });
  const { data, loading, error, reload } = useLoad(() => admin.analytics({ academicYear: q.academicYear, round: q.round, class: q.class }), [q.academicYear, q.round, q.class]);
  const link = (extra) => `${BASE}/applications?${new URLSearchParams(Object.entries({ academicYear: q.academicYear, round: q.round, class: q.class, ...extra }).filter(([, v]) => v)).toString()}`;
  const k = data?.kpis || {};
  const funnelMax = Math.max(1, ...(data?.funnel || []).map((f) => f.n));
  const status = adm.settings.portal.status;

  return (
    <Page>
      <Head eyebrow="Admissions" title="Admission dashboard"
        subtitle={adm.portalUrl ? <>Portal <a href={adm.portalUrl} target="_blank" rel="noreferrer">{adm.portalUrl.replace(/^https?:\/\//, '')}</a> is <b>{status}</b>.</> : 'The admission portal has no address yet.'}>
        {adm.portalUrl ? <Btn icon="externalLink" onClick={() => window.open(adm.portalUrl, '_blank', 'noopener')}>Open portal</Btn> : null}
        <Btn kind="primary" icon="list" onClick={() => nav(`${BASE}/applications`)}>Applications</Btn>
      </Head>

      {adm.catalogs?.mailDriver === 'log' ? (
        <Note tone="amber" icon="mail">Admission emails are being recorded, not sent (ADMISSION_MAIL_DRIVER=log). Set it to <b>smtp</b> on the server to deliver them.</Note>
      ) : null}
      <Checklist adm={adm} />

      <div className="adm-filters">
        <YearSelect value={q.academicYear} onChange={(v) => setQ({ academicYear: v })} />
        <RoundSelect value={q.round} onChange={(v) => setQ({ round: v, class: '' })} />
        <ClassSelect value={q.class} round={q.round} onChange={(v) => setQ({ class: v })} />
        {(q.academicYear || q.round || q.class) ? <Btn kind="ghost" size="sm" onClick={() => setQ({ academicYear: '', round: '', class: '' })}>Clear</Btn> : null}
      </div>

      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <>
          <Tiles>
            <Tile icon="files" tone="indigo" label="Applications" value={n(k.total)} sub={`${n(k.drafts)} drafts`} to={link({})} />
            <Tile icon="send" tone="blue" label="Submitted" value={n(k.submitted)} sub={k.completionRate != null ? `${k.completionRate}% of started` : ''} to={link({ view: 'submitted' })} />
            <Tile icon="fileCheck" tone="amber" label="Under verification" value={n(k.underVerification)} sub={`${n(k.incomplete)} incomplete`} to={link({ status: 'submitted,under_review,documents_pending,documents_rejected' })} />
            <Tile icon="checkCircle" tone="green" label="Verified / eligible" value={n(k.eligible)} to={link({ status: 'verified,eligible' })} />
            <Tile icon="calendarDays" tone="violet" label="Exams upcoming" value={n(k.upcomingExams)} sub={`${n(k.resultsPending)} with results pending`} to={`${BASE}/exams`} />
            <Tile icon="trophy" tone="teal" label="Selected" value={n(k.selected)} sub={`${n(k.waitlisted)} waitlisted`} to={link({ status: 'selected,offer_issued,accepted,payment_pending,confirmed,enrolled' })} />
            <Tile icon="mail" tone="pink" label="Offers open" value={n(k.offersOpen)} to={`${BASE}/selection?tab=offers`} />
            <Tile icon="shieldCheck" tone="green" label="Confirmed" value={n(k.confirmed)} sub={`${n(k.enrolled)} enrolled`} to={link({ status: 'confirmed,enrolled' })} />
            <Tile icon="layers" tone="blue" label="Seats available" value={k.seatsUnlimited && !k.availableSeats ? 'No limit' : n(k.availableSeats)} sub={k.seatsUnlimited ? 'some classes have no limit' : ''} to={`${BASE}/rounds`} />
            <Tile icon="wallet" tone="green" label="Fees collected" value={money((k.applicationFees || 0) + (k.admissionFees || 0))} sub={`${n(k.payments)} payments`} to={`${BASE}/payments`} />
            <Tile icon="alert" tone="amber" label="Fees outstanding" value={money(k.outstanding)} sub={`${n(k.outstandingFamilies)} fees due`} to={link({ fee: 'admission_due' })} />
            <Tile icon="target" tone="red" label="Awaiting approval" value={n(k.awaitingApproval)} sub={`${n(k.duplicates)} possible duplicates`} to={link({ pending: '1' })} />
            <Tile icon="chat" tone="indigo" label="Enquiries" value={n(k.enquiries)} sub={`${n(k.openEnquiries)} new`} to={`${BASE}/enquiries`} />
            <Tile icon="userPlus" tone="gray" label="Applicant accounts" value={n(k.guests)} to={`${BASE}/enquiries?tab=applicants`} />
          </Tiles>

          <div className="adm-grid2">
            <Panel title="Admission funnel" sub="From the first enquiry to enrolment" icon="filter">
              <div className="adm-funnel">
                {(data.funnel || []).map((f) => <BarRow key={f.key} label={f.label} n={f.n} max={funnelMax} />)}
              </div>
              <div className="adm-row adm-mt" style={{ fontSize: '.82rem' }}>
                {k.selectionToConfirmation != null ? <Chip tone="green">{k.selectionToConfirmation}% of selections confirmed</Chip> : null}
                <Chip tone="gray">{n(k.rejected)} not admitted</Chip>
                <Chip tone="gray">{n(k.dropped)} withdrawn or declined</Chip>
              </div>
            </Panel>
            <Panel title="Applications submitted" sub="Last 90 days" icon="trending">
              {(data.overTime || []).length ? (
                <div style={{ height: 240 }}>
                  <ResponsiveContainer>
                    <AreaChart data={data.overTime} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                      <defs><linearGradient id="admArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} /><stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} /></linearGradient></defs>
                      <CartesianGrid stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="day" tick={AXIS} tickFormatter={(d) => fmtDate(d).replace(/ \d{4}$/, '')} minTickGap={24} />
                      <YAxis tick={AXIS} allowDecimals={false} />
                      <Tooltip labelFormatter={(d) => fmtDate(d)} formatter={(v) => [v, 'Submitted']} />
                      <Area type="monotone" dataKey="n" stroke="#6366f1" strokeWidth={2} fill="url(#admArea)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty compact icon="trending" title="No submissions in the last 90 days" />}
            </Panel>
          </div>

          <div className="adm-grid2">
            <Panel title="By class" sub="Submitted, selected and confirmed" icon="building">
              {(data.byClass || []).length ? (
                <div style={{ height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.byClass} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="className" tick={AXIS} interval={0} />
                      <YAxis tick={AXIS} allowDecimals={false} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="submitted" name="Submitted" fill="#818cf8" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="selected" name="Selected" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="confirmed" name="Confirmed" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty compact icon="building" title="No applications yet" />}
            </Panel>
            <Panel title="Seats" sub="Held by live offers and confirmed admissions" icon="layers" pad={false}>
              <Table dense rowKey={(r) => r.class} rows={data.seats || []}
                empty={<Empty compact icon="layers" title="No open round">Seats appear once a round is open or closed.</Empty>}
                columns={[
                  { key: 'className', label: 'Class', render: (r) => r.className || '—' },
                  { key: 'capacity', label: 'Seats', align: 'right', render: (r) => (r.unlimited && !r.capacity ? 'No limit' : n(r.capacity)) },
                  { key: 'taken', label: 'Held', align: 'right', render: (r) => n(r.taken) },
                  { key: 'bar', label: '', width: '30%', render: (r) => (r.capacity ? <Meter value={r.taken} total={r.capacity} tone={r.taken >= r.capacity ? 'red' : 'green'} /> : null) },
                  { key: 'left', label: 'Left', align: 'right', render: (r) => (r.capacity ? n(Math.max(0, r.capacity - r.taken)) : '—') },
                ]} />
            </Panel>
          </div>

          <div className="adm-grid2">
            <Panel title="Exam scores" sub="Approved results, by percentage band" icon="chart">
              {(data.scoreDistribution || []).some((b) => b.n) ? (
                <div style={{ height: 230 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.scoreDistribution} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="band" tick={AXIS} interval={0} />
                      <YAxis tick={AXIS} allowDecimals={false} />
                      <Tooltip formatter={(v) => [v, 'Candidates']} labelFormatter={(l) => `${l}%`} />
                      <Bar dataKey="n" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty compact icon="chart" title="No approved results yet" />}
            </Panel>
            <Panel title="Fee collection" sub="Last 12 months" icon="wallet">
              {(data.feeByMonth || []).length ? (
                <div style={{ height: 230 }}>
                  <ResponsiveContainer>
                    <BarChart data={data.feeByMonth} margin={{ top: 6, right: 8, left: 6, bottom: 0 }}>
                      <CartesianGrid stroke="#eef2f7" vertical={false} />
                      <XAxis dataKey="month" tick={AXIS} />
                      <YAxis tick={AXIS} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                      <Tooltip formatter={(v, name) => [money(v), name]} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="application" name="Application fees" stackId="f" fill="#60a5fa" />
                      <Bar dataKey="admission" name="Admission fees" stackId="f" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : <Empty compact icon="wallet" title="No payments yet" />}
            </Panel>
          </div>

          <div className="adm-grid2">
            <Panel title="Documents waiting" sub="Uploaded and not yet reviewed" icon="fileCheck" right={<Link to={`${BASE}/documents`}>Open queue</Link>}>
              <Tiles>
                <Tile icon="clock" tone="green" label="Under 2 days" value={n(data.docBacklog?.fresh)} />
                <Tile icon="clock" tone="amber" label="2–7 days" value={n(data.docBacklog?.week)} />
                <Tile icon="alert" tone="red" label="Over a week" value={n(data.docBacklog?.old)} />
              </Tiles>
              {(data.docBacklog?.byType || []).length ? (
                <div className="adm-funnel adm-mt">
                  {data.docBacklog.byType.map((t) => <BarRow key={t.name || 'other'} label={t.name || 'Other'} n={t.n} max={Math.max(...data.docBacklog.byType.map((x) => x.n))} />)}
                </div>
              ) : null}
            </Panel>
            <Panel title="Where applicants came from" sub="Source of each application" icon="compass">
              {(data.sources || []).length ? (
                <div className="adm-funnel">
                  {data.sources.map((s) => <BarRow key={s.source} label={s.source} sub={`${n(s.submitted)} submitted`} n={s.n} max={Math.max(...data.sources.map((x) => x.n))} />)}
                </div>
              ) : <Empty compact icon="compass" title="No applications yet" />}
            </Panel>
          </div>

          <div className="adm-grid2">
            <Panel title="Exam attendance" icon="clipboard" pad={false} right={<Link to={`${BASE}/exams`}>All exams</Link>}>
              <Table dense rows={data.examAttendance || []} onRow={(r) => nav(`${BASE}/exams/${r._id}`)}
                empty={<Empty compact icon="clipboard" title="No exams yet" />}
                columns={[
                  { key: 'name', label: 'Exam', render: (r) => <><b>{r.name}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{r.mode} · {fmtDate(r.startsAt)}</div></> },
                  { key: 'scheduled', label: 'Scheduled', align: 'right', render: (r) => n(r.scheduled) },
                  { key: 'present', label: 'Sat', align: 'right', render: (r) => n(r.present) },
                  { key: 'absent', label: 'Absent', align: 'right', render: (r) => n(r.absent) },
                  { key: 'passed', label: 'Qualified', align: 'right', render: (r) => n(r.passed) },
                ]} />
            </Panel>
            <Panel title="Merit lists" sub="From selection to confirmation" icon="trophy" pad={false} right={<Link to={`${BASE}/selection`}>All lists</Link>}>
              <Table dense rows={data.listConversion || []} onRow={(r) => nav(`${BASE}/selection/${r._id}`)}
                empty={<Empty compact icon="trophy" title="No published lists yet" />}
                columns={[
                  { key: 'name', label: 'List', render: (r) => <><b>{r.name}</b><div className="adm-muted" style={{ fontSize: '.76rem' }}>{r.className}</div></> },
                  { key: 'selected', label: 'Selected', align: 'right', render: (r) => n(r.selected) },
                  { key: 'accepted', label: 'Accepted', align: 'right', render: (r) => n(r.accepted) },
                  { key: 'confirmed', label: 'Confirmed', align: 'right', render: (r) => n(r.confirmed) },
                  { key: 'lapsed', label: 'Lapsed', align: 'right', render: (r) => n(r.lapsed) },
                  { key: 'promoted', label: 'Promoted', align: 'right', render: (r) => n(r.promoted) },
                ]} />
            </Panel>
          </div>
          <HealthCard />
        </>
      )}
    </Page>
  );
}

const JOB_TONE = (j) => (j.late ? 'red' : j.failures24h ? 'amber' : 'green');

/**
 * How the module is running for this school (school-backend services/
 * admission/jobRuns.js): when each background job last worked, what email did
 * in the last day, and which optional services are switched on.
 * A job that has not worked when it should is shown as late.
 */
function HealthCard() {
  const { data, error, reload } = useLoad(() => admin.health(), []);
  if (error && !data) return null;
  if (!data) return null;
  const on = (v, label) => <Chip tone={v ? 'green' : 'gray'}>{label}: {v ? 'on' : 'off'}</Chip>;
  return (
    <Panel title="How it is running" sub={`Checked ${fmtDateTime(data.checkedAt)}`} icon="activity" right={<Btn size="sm" kind="ghost" icon="refresh" onClick={reload}>Check again</Btn>}>
      <div className="adm-grid2">
        <div>
          <div className="adm-muted" style={{ fontSize: '.76rem', fontWeight: 650, marginBottom: 6 }}>Background jobs</div>
          <div className="adm-doclist">
            {data.jobs.map((j) => (
              <div key={j.job} className="adm-row adm-row--between" style={{ flexWrap: 'nowrap' }}>
                <span style={{ fontSize: '.86rem' }}>{j.label}</span>
                <Chip tone={JOB_TONE(j)} title={j.lastFailAt ? `Last failed ${fmtDateTime(j.lastFailAt)}` : ''}>{j.late ? (j.lastOkAt ? `Late — last worked ${fmtDateTime(j.lastOkAt)}` : 'Has not run') : j.failures24h ? `${j.failures24h} failure(s) today` : `Worked ${fmtDateTime(j.lastOkAt)}`}</Chip>
              </div>
            ))}
          </div>
          {data.jobs.some((j) => j.failedRecently) ? <p className="adm-muted" style={{ fontSize: '.76rem' }}>A job failed today — the details are in the server log. Aksharum support can look into it.</p> : null}
        </div>
        <div>
          <div className="adm-muted" style={{ fontSize: '.76rem', fontWeight: 650, marginBottom: 6 }}>Last 24 hours</div>
          <KV cols={2} items={[
            ['Emails accepted by the mail server', `${data.email.sent}${data.email.failed ? ` · ${data.email.failed} failed` : ''}${data.email.suppressed ? ` · ${data.email.suppressed} held back` : ''}`],
            ['Exports', `${data.exports.queued} waiting · ${data.exports.running} being prepared${data.exports.failed ? ` · ${data.exports.failed} failed` : ''}`],
            ['Documents kept on', data.storage.driver === 's3' ? 'Cloud storage (S3)' : 'This server\'s disk'],
          ]} />
          <div className="adm-row adm-mt" style={{ gap: 6 }}>
            {data.email.driver === 'log' ? <Chip tone="amber">Email: written to the log, not sent</Chip> : <Chip tone="green">Email: sent</Chip>}
            {on(data.payments.online, 'Online payments')}
            {on(data.captcha.on, 'Robot check')}
            {data.scanning.on ? <Chip tone={data.scanning.reachable ? 'green' : 'red'}>Virus scanning: {data.scanning.reachable ? 'on' : 'not reachable'}</Chip> : on(false, 'Virus scanning')}
          </div>
        </div>
      </div>
    </Panel>
  );
}
