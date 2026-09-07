/**
 * The twelve tabs of one student's dashboard.
 *
 * Each is built from exactly one block of the `/analytics/students/:id`
 * payload, and each says plainly when its block is empty — "no register marked"
 * and "0% attendance" are different answers and are never conflated.
 *
 * Where a mockup asks for something the school does not record, it is not drawn
 * rather than filled with a plausible number. What is missing, and why:
 *   • aptitude skill breakdown / radar — an attempt stores a total, not a score
 *     per skill, so there is nothing to put on the axes;
 *   • library recommendations, reading points, book covers — no catalogue
 *     imagery and no recommender exist;
 *   • a live bus map — no coordinates reach this endpoint (the stop list and
 *     its times do, and are shown);
 *   • the fee payment schedule — a demand posts as one dated charge, so future
 *     instalment dates are not on file;
 *   • per-card Edit buttons — one wizard edits a student, and the header opens
 *     it; a second, differently-scoped editor would be a lie about what saving
 *     here would do.
 */
import React, { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { Columns, RankBars, TrendLine } from './viz';
import { VIZ } from './palette';
import {
  DataTable, Fact, Grid, Meter, MonthCalendar, NoData, Panel, Pct,
  ShowMore, Split, StatusBadge, TimeLine, Tile, Tiles, WeekGrid,
  fmtDate, fmtDay, fmtMoney, fmtMonthKey, fmtTime, titleCase,
} from './studentDetailParts';

// ── General ──────────────────────────────────────────────────────────────────

export function GeneralTab({ general }) {
  const s = general.student;
  const p = general.profile;
  const pl = general.placement;
  const address = [p.address, p.city, p.state, p.pincode, p.country].filter(Boolean).join(', ');

  return (
    <Grid cols="three">
      <Panel icon="user" title="Personal">
        <Fact label="Full name" value={s.name} />
        <Fact label="Gender" value={titleCase(p.gender)} />
        <Fact label="Date of birth" value={p.dob ? `${fmtDate(p.dob)}${p.age != null ? ` (${p.age} yrs)` : ''}` : ''} />
        <Fact label="Blood group" value={p.bloodGroup} />
        <Fact label="Religion" value={p.religion} />
        <Fact label="Category" value={p.category} />
      </Panel>

      <Panel icon="phone" tone="teal" title="Contact">
        <Fact label="Email" value={s.email} />
        <Fact label="Phone" value={s.phone} />
        <Fact label="Address" value={address} empty="Not on file" />
        <Fact label="Account created" value={fmtDate(s.joinedAt)} />
        <Fact label="Last signed in" value={s.lastSeenAt ? fmtDate(s.lastSeenAt) : ''} empty="Never signed in" />
      </Panel>

      <Panel icon="school" tone="purple" title="Enrolment">
        <Fact label="Class" value={`${pl.className} ${pl.sectionName}`.trim()} empty="No section" />
        <Fact label="Roll number" value={p.rollNumber} />
        <Fact label="Admission number" value={p.admissionNumber} />
        <Fact label="Class teacher" value={pl.classTeacher?.name} empty="Not assigned" />
        <Fact label="Vice class teacher" value={pl.viceClassTeacher?.name} empty="Not assigned" />
      </Panel>

      <Panel icon="users" tone="amber" title="Parent / guardian"
        subtitle={general.parent ? 'Linked account — sees this child in the parent portal' : undefined}>
        {general.parent
          ? (
            <>
              <Fact label="Name" value={general.parent.name} />
              <Fact label="Email" value={general.parent.email} />
              <Fact label="Phone" value={general.parent.phone} />
            </>
          )
          : <NoData icon="users" title="No parent account linked"
              hint="Link one from the student's record to give a parent access to fees, attendance and results." />}
      </Panel>

      <Panel icon="teacher" tone="blue" title="Subject teachers"
        subtitle={pl.subjectTeachers?.length ? `${pl.subjectTeachers.length} assigned to this section` : undefined}>
        {pl.subjectTeachers?.length
          ? pl.subjectTeachers.map((t, i) => (
            <Fact key={`${t.subject}-${i}`} label={t.subject || 'Subject'} value={t.teacher} empty="Unassigned" />
          ))
          : <NoData icon="teacher" title="No subject teachers assigned"
              hint="Assign them on the section to see who teaches what here." />}
      </Panel>

      <Panel icon="repeat" tone="pink" title="Section history"
        subtitle="Every move between sections, newest first">
        {general.sectionHistory?.length
          ? general.sectionHistory.map((h, i) => (
            <Fact key={`${h.date}-${i}`} label={fmtDate(h.date)}
              value={<>{h.from || '—'} <Icon name="arrowRight" size={12} /> {h.to || '—'}{h.reason ? ` · ${h.reason}` : ''}</>} />
          ))
          : <NoData icon="repeat" title="No section changes"
              hint="This student has stayed in the same section." />}
      </Panel>
    </Grid>
  );
}

// ── Attendance ───────────────────────────────────────────────────────────────

export function AttendanceTab({ a }) {
  // The calendar opens on the most recently marked month, not on today: a
  // register that stopped in July should not present August as a blank sheet.
  const [month, setMonth] = useState(() => {
    const last = a?.days?.[0]?.date;
    const d = last ? new Date(last) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const byDate = useMemo(() => {
    const m = {};
    (a?.days || []).forEach((d) => {
      const dt = new Date(d.date);
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      m[key] = d;
    });
    return m;
  }, [a]);

  const monthRows = useMemo(() => (a?.days || []).filter((d) => {
    const dt = new Date(d.date);
    return dt.getFullYear() === month.getFullYear() && dt.getMonth() === month.getMonth();
  }), [a, month]);

  if (!a?.tracked) {
    return (
      <Panel icon="checkSquare" tone="green" title="Attendance" wide>
        <NoData icon="checkSquare" title="No attendance marked for this section yet"
          hint="Figures, the calendar and the month-by-month table all appear once a register is taken." />
      </Panel>
    );
  }

  const trend = (a.monthly || []).map((m) => ({ month: fmtMonthKey(m.month), percent: m.percent }));
  const attended = a.present + a.late;

  return (
    <>
      <Tiles>
        <Tile icon="checkSquare" tone="green" value={a.percent} unit="%" label="Attendance rate"
          caption={`${attended} of ${a.total} marked days`} empty="Not marked yet" />
        <Tile icon="checkCircle" tone="blue" value={a.present} label="Present"
          caption="Days marked present" />
        <Tile icon="close" tone="pink" value={a.absent} label="Absent"
          caption={a.absent ? 'Days marked absent' : 'Never marked absent'} />
        <Tile icon="clock" tone="amber" value={a.late} label="Late arrivals"
          caption={a.late ? 'Counted as attended' : 'Always on time'} />
      </Tiles>

      <Grid cols="two">
        <Panel icon="calendar" tone="indigo" title="Attendance calendar"
          subtitle="Only days the register was actually taken are coloured">
          <MonthCalendar month={month} byDate={byDate}
            onPrev={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            onNext={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            canPrev canNext />
        </Panel>

        <Panel icon="trending" tone="green" title="Month by month"
          subtitle="Share of the days marked in each month that were attended">
          {trend.length
            ? <TrendLine data={trend} xKey="month" yKey="percent" unit="%" name="Attendance" />
            : <NoData icon="trending" title="Only one month marked so far"
                hint="A trend needs at least two months of register." />}
        </Panel>
      </Grid>

      <Grid cols="two">
        <Panel icon="chart" tone="purple" title="This year"
          subtitle={a.rank ? `Rank ${a.rank} of ${a.sectionSize} in the section` : 'Across every marked day'}>
          <Split segments={[
            { label: 'Present', value: a.present, color: VIZ.good },
            { label: 'Late', value: a.late, color: VIZ.warn },
            { label: 'Absent', value: a.absent, color: VIZ.bad },
          ]} />
          <div className="sdfacts">
            <Fact label="Days marked for this student" value={a.total} />
            <Fact label="Registers taken by the section" value={a.sessionsHeld || a.total} />
            <Fact label="Counted as attended" value={`${attended} (present + late)`} />
          </div>
        </Panel>

        <Panel icon="calendarDays" tone="blue"
          title={`${month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} in detail`}
          subtitle={`${monthRows.length} day${monthRows.length === 1 ? '' : 's'} marked in this month`}>
          {monthRows.length
            ? (
              <ShowMore rows={monthRows} initial={8} noun="days">
                {(shown) => (
                  <DataTable
                    cols={[
                      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date) },
                      { key: 'day', label: 'Day', render: (r) => new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short' }) },
                      { key: 'status', label: 'Status', render: (r) => (
                        <StatusBadge status={r.status} map={{ present: 'success', late: 'warning', absent: 'danger' }} />) },
                      { key: 'remarks', label: 'Remarks' },
                    ]}
                    rows={shown} />
                )}
              </ShowMore>
            )
            : <NoData icon="calendarDays" title="Nothing marked in this month"
                hint="Use the arrows on the calendar to find a month with a register." />}
        </Panel>
      </Grid>
    </>
  );
}

// ── Results ──────────────────────────────────────────────────────────────────

export function ResultsTab({ r }) {
  const sum = r?.summary || {};
  // Exam titles run long; the tick is trimmed so every period stays labelled and
  // the tooltip carries the full name.
  const trend = (r?.trend || []).filter((t) => t.percentage != null)
    .map((t) => ({ label: (t.label || '').slice(0, 12), percentage: t.percentage }));
  const subjects = (r?.subjectAverages || []).slice(0, 10)
    .map((x) => ({ subject: x.subject.slice(0, 20), average: x.average }));
  const remarks = (r?.exams || []).flatMap((e) => (e.subjects || [])
    .filter((s) => s.remarks)
    .map((s) => ({ exam: e.title, date: e.date, subject: s.subject, text: s.remarks })));

  if (!sum.examsTaken && !sum.testsTaken) {
    return (
      <Panel icon="chart" tone="purple" title="Results" wide>
        <NoData icon="chart" title="No published results yet"
          hint="Exam results and class tests appear here once they are published." />
      </Panel>
    );
  }

  return (
    <>
      <Tiles>
        <Tile icon="chart" tone="purple" value={sum.average} unit="%" label="Average across exams"
          caption={`${sum.examsTaken || 0} exam${sum.examsTaken === 1 ? '' : 's'} · ${sum.testsTaken || 0} class test${sum.testsTaken === 1 ? '' : 's'}`}
          empty="Not assessed" />
        <Tile icon="trophy" tone="amber" value={sum.bestRank} label="Best rank"
          caption="Highest rank achieved in an exam" empty="Not ranked" />
        <Tile icon="star" tone="green" value={sum.best} unit="%" label="Best score"
          caption="Highest exam percentage" empty="No graded exam" />
        <Tile icon="book" tone="blue" value={r?.strongest?.subject} label="Strongest subject"
          caption={r?.strongest ? `${r.strongest.average}% across ${r.strongest.assessments} assessment${r.strongest.assessments === 1 ? '' : 's'}` : undefined}
          empty="Not enough marks" />
      </Tiles>

      <Grid cols="two">
        <Panel icon="trending" tone="purple" title="Result trend"
          subtitle="Percentage per formal exam, oldest first">
          {trend.length > 1
            ? <TrendLine data={trend} xKey="label" yKey="percentage" unit="%" name="Result" />
            : <NoData icon="trending" title="One exam so far"
                hint="A trend needs a second published exam to compare against." />}
        </Panel>

        {/* Subject averages are magnitudes that do not sum to a whole, so they
            are ranked bars. A doughnut of them would imply a share of something
            that does not exist. */}
        <Panel icon="book" tone="blue" title="Subject strength"
          subtitle="Average percentage per subject, exams and class tests together">
          {subjects.length
            ? <RankBars data={subjects} labelKey="subject" valueKey="average" unit="%" labelWidth={132} />
            : <NoData icon="book" title="No subject marks yet" />}
        </Panel>
      </Grid>

      <Panel icon="fileCheck" tone="indigo" title="Exam results" wide
        subtitle={sum.failedExams ? `${sum.failedExams} exam${sum.failedExams === 1 ? '' : 's'} not passed` : 'Every exam passed'}>
        <DataTable
          cols={[
            { key: 'title', label: 'Exam' },
            { key: 'examType', label: 'Type', render: (x) => titleCase(x.examType) },
            { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
            { key: 'marks', label: 'Marks', render: (x) => `${x.obtained ?? '—'} / ${x.max ?? '—'}` },
            { key: 'percentage', label: '%', render: (x) => <Pct value={x.percentage} /> },
            { key: 'grade', label: 'Grade' },
            { key: 'rank', label: 'Rank' },
            { key: 'isPassed', label: 'Result', render: (x) => (
              <Badge variant={x.isPassed ? 'success' : 'danger'}>{x.isPassed ? 'Pass' : 'Fail'}</Badge>) },
          ]}
          rows={r?.exams} empty="No published exam results" emptyIcon="fileCheck" />
      </Panel>

      {!!r?.exams?.length && (
        <Panel icon="layers" tone="teal" title="Subject-wise marks" wide
          subtitle="Every subject of every published exam">
          {r.exams.map((e) => (
            <div key={e._id} className="sdexam">
              <h3>
                {e.title}
                <span>{fmtDate(e.date)}</span>
                {e.percentage != null ? <Pct value={e.percentage} /> : null}
              </h3>
              <DataTable
                cols={[
                  { key: 'subject', label: 'Subject' },
                  { key: 'marks', label: 'Marks', render: (x) => (x.isAbsent ? 'Absent' : `${x.obtained} / ${x.max}`) },
                  { key: 'percent', label: '%', render: (x) => (x.isAbsent ? null : <Pct value={x.percent} />) },
                  { key: 'grade', label: 'Grade' },
                  { key: 'isPassed', label: 'Result', render: (x) => (
                    <Badge variant={x.isAbsent ? 'muted' : x.isPassed ? 'success' : 'danger'}>
                      {x.isAbsent ? 'Absent' : x.isPassed ? 'Pass' : 'Fail'}
                    </Badge>) },
                  { key: 'remarks', label: 'Remarks' },
                ]}
                rows={e.subjects} empty="No subjects recorded for this exam" />
            </div>
          ))}
        </Panel>
      )}

      <Grid cols="two">
        <Panel icon="clipboard" tone="green" title="Class tests"
          subtitle={`${sum.testsTaken || 0} recorded for this section`}>
          <DataTable
            cols={[
              { key: 'title', label: 'Test' },
              { key: 'subject', label: 'Subject' },
              { key: 'date', label: 'Date', render: (x) => fmtDay(x.date) },
              { key: 'marks', label: 'Marks', render: (x) => (x.isAbsent ? 'Absent' : `${x.obtained ?? '—'} / ${x.max}`) },
              { key: 'percent', label: '%', render: (x) => <Pct value={x.percent} /> },
              { key: 'classAvg', label: 'Class avg' },
            ]}
            rows={r?.classTests} empty="No class tests recorded" emptyIcon="clipboard" />
        </Panel>

        <Panel icon="chat" tone="pink" title="Teacher remarks"
          subtitle="Written against a subject when the result was entered">
          {remarks.length
            ? (
              <ShowMore rows={remarks} initial={5} noun="remarks">
                {(shown) => (
                  <ul className="sdnotes">
                    {shown.map((n, i) => (
                      <li key={`${n.exam}-${n.subject}-${i}`}>
                        <p>{n.text}</p>
                        <small>{n.subject} · {n.exam} · {fmtDate(n.date)}</small>
                      </li>
                    ))}
                  </ul>
                )}
              </ShowMore>
            )
            : <NoData icon="chat" title="No remarks written"
                hint="Remarks entered against a subject in a result appear here." />}
        </Panel>
      </Grid>
    </>
  );
}

// ── Aptitude ─────────────────────────────────────────────────────────────────

export function AptitudeTab({ a }) {
  const sum = a?.summary || {};
  const trend = (a?.exams || []).filter((e) => e.percentage != null)
    .map((e) => ({ label: (e.title || '').slice(0, 12), percentage: e.percentage }));

  if (!sum.attempted && !sum.evaluated) {
    return (
      <Panel icon="compass" tone="teal" title="Aptitude" wide>
        <NoData icon="compass" title="No aptitude exam attempted yet"
          hint="Scores, the trend and the integrity log appear after the first attempt." />
      </Panel>
    );
  }

  return (
    <>
      <Tiles>
        <Tile icon="compass" tone="teal" value={sum.attempted} label="Exams attempted"
          caption={`${sum.submitted || 0} submitted · ${sum.evaluated || 0} evaluated`} />
        <Tile icon="chart" tone="purple" value={sum.average} unit="%" label="Average score"
          caption="Across evaluated attempts" empty="Not evaluated" />
        <Tile icon="star" tone="green" value={sum.best} unit="%" label="Best score"
          caption="Highest evaluated attempt" empty="No score yet" />
        <Tile icon="alert" tone={sum.violations ? 'pink' : 'blue'} value={sum.violations} label="Integrity flags"
          caption={sum.violations ? 'Raised by the anti-cheat watch' : 'Nothing flagged'} />
      </Tiles>

      <Grid cols="two">
        <Panel icon="trending" tone="teal" title="Score trend"
          subtitle="Percentage per evaluated exam, oldest first">
          {trend.length > 1
            ? <TrendLine data={trend} xKey="label" yKey="percentage" unit="%" name="Score" />
            : <NoData icon="trending" title="One evaluated exam so far"
                hint="A trend needs a second evaluated attempt." />}
        </Panel>

        <Panel icon="alert" tone="amber" title="Integrity flags"
          subtitle="Events the proctor raised during an attempt">
          {a?.violationTypes?.length
            ? (
              <Split segments={a.violationTypes.map((v, i) => ({
                label: titleCase(v.type), value: v.count, color: VIZ.bands[i % VIZ.bands.length],
              }))} />
            )
            : <NoData icon="checkCircle" title="Nothing flagged"
                hint="No tab switches, exits or other integrity events were recorded." />}
        </Panel>
      </Grid>

      <Panel icon="clipboard" tone="teal" title="Exam history" wide>
        <DataTable
          cols={[
            { key: 'title', label: 'Exam' },
            { key: 'subject', label: 'Subject' },
            { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
            { key: 'marks', label: 'Marks', render: (x) => `${x.obtained} / ${x.max}` },
            { key: 'percentage', label: '%', render: (x) => <Pct value={x.percentage} /> },
          ]}
          rows={a?.exams} empty="No evaluated aptitude exams" emptyIcon="compass" />
      </Panel>
    </>
  );
}

// ── Fees ─────────────────────────────────────────────────────────────────────

export function FeesTab({ f }) {
  const sum = f?.summary || {};
  const monthly = (f?.monthly || []).map((m) => ({ month: fmtMonthKey(m.month), paid: m.paid }));
  const collected = sum.charged ? Math.round((sum.paid / sum.charged) * 100) : null;

  if (sum.status === 'not_assigned' && !sum.charged) {
    return (
      <Panel icon="wallet" tone="amber" title="Fees" wide>
        <NoData icon="wallet" title="No fees charged to this student"
          hint="Assign a fee structure and generate the demand — the ledger, the payments and the head-by-head split then appear here." />
      </Panel>
    );
  }

  return (
    <>
      <Tiles>
        <Tile icon="banknote" tone="blue" value={fmtMoney(sum.charged)} label="Total charged"
          caption={sum.structure ? `Structure: ${sum.structure}` : 'No structure assigned'} />
        <Tile icon="checkCircle" tone="green" value={fmtMoney(sum.paid)} label="Paid"
          caption={collected != null ? `${collected}% of what was charged` : undefined} />
        <Tile icon="wallet" tone={sum.balance > 0 ? 'pink' : 'green'} value={fmtMoney(sum.balance)} label="Outstanding"
          caption={sum.balance > 0 ? 'Owed today' : 'Nothing owed'} />
        <Tile icon="creditCard" tone="indigo" value={f?.payments?.length ?? 0} label="Payments"
          caption={f?.lastPaymentAt ? `Last on ${fmtDate(f.lastPaymentAt)}` : 'None received yet'} />
      </Tiles>

      <Grid cols="two">
        <Panel icon="chart" tone="green" title="Collection"
          subtitle="Against what has been charged for the running year">
          <Split segments={[
            { label: 'Paid', value: sum.paid, color: VIZ.good, display: fmtMoney(sum.paid) },
            { label: 'Outstanding', value: Math.max(0, sum.balance), color: VIZ.bad, display: fmtMoney(Math.max(0, sum.balance)) },
          ]} />
          <div className="sdfacts">
            <Fact label="Concession applied" value={fmtMoney(sum.concession)} />
            <Fact label="Fines levied" value={fmtMoney(sum.fine)} />
            <Fact label="Due on" value={f?.dueDay ? `Day ${f.dueDay} of the month` : ''} empty="No due day set" />
          </div>
        </Panel>

        <Panel icon="trending" tone="blue" title="Payments by month"
          subtitle="Amount credited in each month of the year">
          {monthly.length
            ? <Columns data={monthly} xKey="month" yKey="paid" format={(v) => fmtMoney(v)} />
            : <NoData icon="banknote" title="No payments credited yet" />}
        </Panel>
      </Grid>

      <Panel icon="layers" tone="amber" title="Head by head" wide
        subtitle="What the assigned structure charges, and what has been paid against each head">
        {f?.heads?.length
          ? (
            <>
              <DataTable
                cols={[
                  { key: 'name', label: 'Fee head' },
                  { key: 'charged', label: 'Charged', align: 'right', render: (x) => fmtMoney(x.charged) },
                  { key: 'paid', label: 'Paid', align: 'right', render: (x) => fmtMoney(x.paid) },
                  { key: 'pending', label: 'Pending', align: 'right', render: (x) => (
                    x.pending > 0
                      ? <b style={{ color: VIZ.bad }}>{fmtMoney(x.pending)}</b>
                      : <Badge variant="success">Clear</Badge>) },
                ]}
                rows={f.heads} />
              {/* A receipt only names a head when whoever took the money split
                  it. Un-split money is reported as un-split rather than spread
                  across the heads, which would invent a payment. */}
              {f.unallocatedPaid > 0 && (
                <p className="sdnote">
                  <Icon name="alert" size={14} />
                  {fmtMoney(f.unallocatedPaid)} of what has been paid was receipted without naming a
                  fee head, so it is not counted in the Paid column above. It is included in the
                  totals and in the ledger.
                </p>
              )}
            </>
          )
          : <NoData icon="layers" title="No head-by-head split available"
              hint="The split comes from the fee structure this student is assigned to." />}
      </Panel>

      {!!f?.concessions?.length && (
        <Panel icon="star" tone="green" title="Concessions" wide>
          <DataTable
            cols={[
              { key: 'name', label: 'Concession' },
              { key: 'type', label: 'Type', render: (x) => titleCase(x.type) },
              { key: 'value', label: 'Value', render: (x) => (x.type === 'percentage' ? `${x.value}%` : fmtMoney(x.value)) },
              { key: 'from', label: 'Valid from', render: (x) => fmtDate(x.from) },
              { key: 'to', label: 'Valid to', render: (x) => fmtDate(x.to) },
            ]}
            rows={f.concessions} />
        </Panel>
      )}

      <Grid cols="two">
        <Panel icon="creditCard" tone="indigo" title="Payments" subtitle="Most recent first">
          <DataTable
            cols={[
              { key: 'date', label: 'Date', render: (x) => fmtDay(x.date) },
              { key: 'receipt', label: 'Receipt' },
              { key: 'amount', label: 'Amount', align: 'right', render: (x) => fmtMoney(x.amount) },
              { key: 'mode', label: 'Mode', render: (x) => titleCase(x.mode) },
              { key: 'status', label: 'Status', render: (x) => (
                x.refunded
                  ? <Badge variant="muted">Refunded</Badge>
                  : <StatusBadge status={x.status}
                      map={{ completed: 'success', failed: 'danger', pending: 'warning', refunded: 'muted' }} />) },
            ]}
            rows={f?.payments} empty="No payments recorded" emptyIcon="creditCard" />
        </Panel>

        <Panel icon="files" tone="teal" title="Ledger" subtitle="The last 25 entries, newest first">
          <DataTable
            cols={[
              { key: 'date', label: 'Date', render: (x) => fmtDay(x.date) },
              { key: 'description', label: 'Entry' },
              { key: 'amount', label: 'Amount', align: 'right', render: (x) => (
                <span style={{ color: x.type === 'credit' ? VIZ.good : VIZ.ink, fontWeight: 600 }}>
                  {x.type === 'credit' ? '−' : '+'}{fmtMoney(x.amount)}
                </span>) },
              { key: 'balance', label: 'Balance', align: 'right', render: (x) => fmtMoney(x.balance) },
            ]}
            rows={f?.ledger} empty="No ledger entries" emptyIcon="files" />
        </Panel>
      </Grid>
    </>
  );
}

// ── Library ──────────────────────────────────────────────────────────────────

export function LibraryTab({ l }) {
  const sum = l?.summary || {};

  if (!sum.totalIssued) {
    return (
      <Panel icon="library" tone="blue" title="Library" wide>
        <NoData icon="library" title="Nothing borrowed yet"
          hint="Issues, returns, punctuality and fines all appear here once this student takes a book out." />
      </Panel>
    );
  }

  return (
    <>
      <Tiles>
        <Tile icon="bookOpen" tone="blue" value={sum.currentlyOut} label="Books out"
          caption={`${sum.totalIssued} borrowed all time`} />
        <Tile icon="clock" tone={sum.overdue ? 'pink' : 'green'} value={sum.overdue} label="Overdue"
          caption={sum.overdue ? 'Past the return date' : 'Nothing overdue'} />
        <Tile icon="checkCircle" tone="green" value={sum.punctuality} unit="%" label="Returned on time"
          caption={`${sum.onTimeReturns} of ${sum.returned} returns`} empty="Nothing returned yet" />
        <Tile icon="banknote" tone={sum.finePending ? 'amber' : 'green'} value={fmtMoney(sum.finePending)}
          label="Fines pending" caption={`${fmtMoney(sum.fineTotal)} levied in total`} />
      </Tiles>

      <Grid cols="two">
        <Panel icon="bookOpen" tone="blue" title="Currently borrowed"
          subtitle={sum.reservations ? `${sum.reservations} reservation${sum.reservations === 1 ? '' : 's'} waiting as well` : undefined}>
          <DataTable
            cols={[
              { key: 'title', label: 'Book' },
              { key: 'issueDate', label: 'Issued', render: (x) => fmtDay(x.issueDate) },
              { key: 'dueDate', label: 'Due', render: (x) => fmtDay(x.dueDate) },
              { key: 'daysOverdue', label: 'Status', render: (x) => (x.daysOverdue > 0
                ? <Badge variant="danger">{x.daysOverdue}d overdue</Badge>
                : <Badge variant="success">On time</Badge>) },
            ]}
            rows={l?.current} empty="No books out right now" emptyIcon="bookOpen" />
        </Panel>

        <Panel icon="chart" tone="green" title="Reading habit"
          subtitle="How this student handles a borrowed book">
          <Meter value={sum.punctuality} label="Returned by the due date" right={`${sum.punctuality ?? 0}%`} />
          <div className="sdfacts">
            <Fact label="Returned" value={sum.returned} />
            <Fact label="Returned on time" value={sum.onTimeReturns} />
            <Fact label="Renewals used" value={sum.renewals} />
            <Fact label="Active reservations" value={sum.reservations} />
          </div>
        </Panel>
      </Grid>

      <Panel icon="library" tone="indigo" title="Borrowing history" wide subtitle="The last 20 issues">
        <DataTable
          cols={[
            { key: 'title', label: 'Book' },
            { key: 'issueDate', label: 'Issued', render: (x) => fmtDay(x.issueDate) },
            { key: 'dueDate', label: 'Due', render: (x) => fmtDay(x.dueDate) },
            { key: 'returnDate', label: 'Returned', render: (x) => fmtDay(x.returnDate) },
            { key: 'fine', label: 'Fine', align: 'right', render: (x) => (x.fine ? fmtMoney(x.fine) : null) },
            { key: 'status', label: 'Status', render: (x) => (
              <StatusBadge status={x.status}
                map={{ returned: 'success', overdue: 'danger', issued: 'info', lost: 'danger' }} />) },
          ]}
          rows={l?.history} empty="No borrowing history" emptyIcon="library" />
      </Panel>

      {!!l?.fines?.length && (
        <Panel icon="banknote" tone="amber" title="Fines" wide>
          <DataTable
            cols={[
              { key: 'type', label: 'Reason', render: (x) => titleCase(x.type) },
              { key: 'daysOverdue', label: 'Days overdue' },
              { key: 'amount', label: 'Amount', align: 'right', render: (x) => fmtMoney(x.amount) },
              { key: 'status', label: 'Status', render: (x) => (
                <StatusBadge status={x.status} map={{ paid: 'success', pending: 'warning', waived: 'muted' }} />) },
              { key: 'paidAt', label: 'Paid on', render: (x) => fmtDay(x.paidAt) },
            ]}
            rows={l.fines} />
        </Panel>
      )}
    </>
  );
}

// ── Transport ────────────────────────────────────────────────────────────────

export function TransportTab({ t }) {
  if (!t?.assigned) {
    return (
      <>
        <Panel icon="bus" tone="orange" title="Transport" wide>
          <NoData icon="bus" title="Not assigned to a route"
            hint="This student does not use school transport. Assign a route to see the bus, the stops and the boarding record here." />
        </Panel>
        {!!t?.fees?.invoices && <TransportInvoices fees={t.fees} />}
      </>
    );
  }

  const a = t.assignment;
  const trips = t.trips || {};

  // The most recent day this student was actually on the bus, as it happened.
  const latestDate = trips.recent?.[0]?.date;
  const journey = (trips.recent || []).filter((e) => e.date === latestDate);

  return (
    <>
      <Tiles>
        <Tile icon="bus" tone="orange" value={a.route || 'Assigned'} label="Route"
          caption={a.routeCode ? `Route ${a.routeCode}` : 'No route code'} />
        <Tile icon="mapPin" tone="green" value={a.pickupStop || null} label="Pickup stop"
          caption={a.shift ? `${titleCase(a.shift)} shift` : undefined} empty="No stop set" />
        <Tile icon="mapPin" tone="blue" value={a.dropStop || null} label="Drop stop"
          caption={a.seatNumber ? `Seat ${a.seatNumber}` : 'No seat assigned'} empty="No stop set" />
        <Tile icon="checkSquare" tone="purple" value={trips.percent} unit="%" label="Boarding rate"
          caption={trips.total ? `${trips.boarded} of ${trips.total} trips in 90 days` : undefined}
          empty="No trips recorded" />
      </Tiles>

      <Grid cols="two">
        <Panel icon="bus" tone="orange" title="The bus"
          subtitle={a.temporary ? 'Temporary assignment' : `Assigned since ${fmtDate(a.since)}`}>
          <Fact label="Vehicle" value={[a.vehicle, a.busName].filter(Boolean).join(' · ')} empty="Not assigned" />
          <Fact label="Driver" value={a.driver?.name} empty="No driver on the route" />
          <Fact label="Driver phone" value={a.driver?.phone
            ? <a href={`tel:${a.driver.phone}`}>{a.driver.phone}</a> : ''} empty="Not on file" />
          <Fact label="Attendant" value={a.attendant?.name} empty="None assigned" />
          <Fact label="Attendant phone" value={a.attendant?.phone
            ? <a href={`tel:${a.attendant.phone}`}>{a.attendant.phone}</a> : ''} empty="Not on file" />
          <Fact label="Fee plan" value={a.feePlan} empty="No plan" />
        </Panel>

        <Panel icon="mapPin" tone="teal" title="Stops on this route"
          subtitle="This student's pickup and drop are marked">
          {a.stops?.length
            ? (
              <ol className="sdstops">
                {a.stops.map((st, i) => (
                  <li key={`${st.name}-${i}`} className={st.isPickup || st.isDrop ? 'is-mine' : undefined}>
                    <span className="sdstops__dot" />
                    <div>
                      <b>{st.name || `Stop ${i + 1}`}</b>
                      {st.arrival || st.departure
                        ? <small>{[st.arrival && `arrives ${fmtTime(st.arrival)}`, st.departure && `leaves ${fmtTime(st.departure)}`].filter(Boolean).join(' · ')}</small>
                        : null}
                    </div>
                    {st.isPickup && <Badge variant="success">Pickup</Badge>}
                    {st.isDrop && <Badge variant="info">Drop</Badge>}
                  </li>
                ))}
              </ol>
            )
            : <NoData icon="mapPin" title="No stops recorded on this route" />}
        </Panel>
      </Grid>

      <Grid cols="two">
        <Panel icon="checkSquare" tone="purple" title="Boarding record"
          subtitle="Every trip on this route in the last 90 days">
          {trips.total
            ? (
              <>
                <Split segments={[
                  { label: 'Boarded', value: trips.boarded, color: VIZ.good },
                  { label: 'Absent', value: trips.absent, color: VIZ.warn },
                  { label: 'No show', value: trips.noShow, color: VIZ.bad },
                ]} />
                <div className="sdfacts">
                  <Fact label="Trips recorded" value={trips.total} />
                  <Fact label="Boarding rate" value={<Pct value={trips.percent} />} />
                </div>
              </>
            )
            : <NoData icon="bus" title="No trip attendance recorded"
                hint="Bus attendance appears once the attendant starts marking trips." />}
        </Panel>

        <Panel icon="clock" tone="blue" title="Most recent journey"
          subtitle={latestDate ? fmtDate(latestDate) : 'No trips recorded'}>
          {journey.length
            ? (
              <TimeLine items={journey.map((e, i) => ({
                key: `${e.date}-${e.direction}-${i}`,
                title: `${titleCase(e.direction || 'Trip')} · ${titleCase(e.shift)}`,
                sub: [e.boardTime && `boarded ${fmtTime(e.boardTime)}`, e.dropTime && `dropped ${fmtTime(e.dropTime)}`]
                  .filter(Boolean).join(' · ') || 'No times recorded',
                color: ['boarded', 'dropped'].includes(e.status) ? VIZ.good : e.status === 'absent' ? VIZ.warn : VIZ.bad,
                right: e.delayMinutes ? `${e.delayMinutes} min late` : titleCase(e.status),
              }))} />
            )
            : <NoData icon="clock" title="No journey recorded yet" />}
        </Panel>
      </Grid>

      <Panel icon="clipboard" tone="indigo" title="Recent trips" wide>
        <DataTable
          cols={[
            { key: 'date', label: 'Date', render: (x) => fmtDate(x.date) },
            { key: 'shift', label: 'Shift', render: (x) => titleCase(x.shift) },
            { key: 'direction', label: 'Direction', render: (x) => titleCase(x.direction) },
            { key: 'boardTime', label: 'Boarded', render: (x) => fmtTime(x.boardTime) },
            { key: 'status', label: 'Status', render: (x) => (
              <StatusBadge status={x.status}
                map={{ boarded: 'success', dropped: 'success', absent: 'warning', no_show: 'danger' }} />) },
            { key: 'delayMinutes', label: 'Delay', render: (x) => (x.delayMinutes ? `${x.delayMinutes} min` : null) },
          ]}
          rows={trips.recent} empty="No trip attendance recorded" emptyIcon="bus" />
      </Panel>

      <TransportInvoices fees={t.fees} />

      {!!t.complaints?.length && (
        <Panel icon="megaphone" tone="pink" title="Complaints" wide>
          <DataTable
            cols={[
              { key: 'code', label: 'Code' },
              { key: 'subject', label: 'Subject' },
              { key: 'category', label: 'Category', render: (x) => titleCase(x.category) },
              { key: 'priority', label: 'Priority', render: (x) => titleCase(x.priority) },
              { key: 'raisedAt', label: 'Raised', render: (x) => fmtDay(x.raisedAt) },
              { key: 'status', label: 'Status', render: (x) => (
                <StatusBadge status={x.status}
                  map={{ resolved: 'success', closed: 'success', open: 'warning', in_progress: 'info' }} />) },
            ]}
            rows={t.complaints} />
        </Panel>
      )}
    </>
  );
}

function TransportInvoices({ fees }) {
  if (!fees) return null;
  return (
    <Panel icon="banknote" tone="amber" title="Transport fees" wide
      subtitle={`${fmtMoney(fees.paid)} paid of ${fmtMoney(fees.billed)} billed · ${fmtMoney(fees.due)} due`}>
      <DataTable
        cols={[
          { key: 'number', label: 'Invoice' },
          { key: 'period', label: 'Period' },
          { key: 'amount', label: 'Amount', align: 'right', render: (x) => fmtMoney(x.amount) },
          { key: 'paid', label: 'Paid', align: 'right', render: (x) => fmtMoney(x.paid) },
          { key: 'dueDate', label: 'Due', render: (x) => fmtDay(x.dueDate) },
          { key: 'status', label: 'Status', render: (x) => (
            <StatusBadge status={x.status}
              map={{ paid: 'success', overdue: 'danger', pending: 'warning', partial: 'warning' }} />) },
        ]}
        rows={fees.list} empty="No transport invoices raised" emptyIcon="banknote" />
    </Panel>
  );
}

// ── Videos ───────────────────────────────────────────────────────────────────

export function VideosTab({ v }) {
  const sum = v?.summary || {};
  // "Carry on with" is the most recently touched video that is not finished —
  // the payload is already sorted by last watched.
  const resume = (v?.recent || []).find((x) => !x.completed && x.progress > 0);

  if (!sum.videosStarted && !sum.assignments) {
    return (
      <Panel icon="video" tone="pink" title="Video learning" wide>
        <NoData icon="video" title="Nothing watched or assigned"
          hint="Watch time, completion and assignments appear once a video reaches this student." />
      </Panel>
    );
  }

  return (
    <>
      <Tiles>
        <Tile icon="film" tone="pink" value={sum.assignments} label="Videos assigned"
          caption={`${sum.activeAssignments || 0} still active`} />
        <Tile icon="checkCircle" tone="green" value={sum.videosCompleted} label="Completed"
          caption={`${sum.completionRate ?? 0}% of the ${sum.videosStarted || 0} started`} />
        <Tile icon="clock" tone="blue" value={sum.watchHours} unit=" h" label="Watch time"
          caption={sum.lastWatchedAt ? `Last watched ${fmtDate(sum.lastWatchedAt)}` : 'Never watched'} />
        <Tile icon="repeat" tone="purple" value={sum.avgProgress} unit="%" label="Average progress"
          caption={`${sum.replays || 0} replay${sum.replays === 1 ? '' : 's'}`} empty="Nothing started" />
      </Tiles>

      <Grid cols="two">
        <Panel icon="video" tone="pink" title="Carry on with"
          subtitle={resume ? 'The most recent video left unfinished' : undefined}>
          {resume
            ? (
              <div className="sdresume">
                {resume.thumbnail
                  ? <img src={resume.thumbnail} alt="" />
                  : <span className="sdresume__blank"><Icon name="film" size={26} /></span>}
                <div>
                  <b>{resume.title}</b>
                  <small>
                    {resume.watchedMin} min watched
                    {resume.durationMin ? ` of ${resume.durationMin} min` : ''}
                    {resume.lastAt ? ` · ${fmtDate(resume.lastAt)}` : ''}
                  </small>
                  <Meter value={resume.progress} label="Progress" right={`${resume.progress}%`} tone="accent" />
                </div>
              </div>
            )
            : <NoData icon="checkCircle" title="Nothing left half-watched"
                hint="Every video this student started has been finished." />}
        </Panel>

        <Panel icon="chart" tone="purple" title="Progress per video"
          subtitle="The six most recently watched">
          {v?.recent?.length
            ? (
              <RankBars
                data={v.recent.slice(0, 6).map((x) => ({ title: (x.title || '').slice(0, 20), progress: x.progress }))}
                labelKey="title" valueKey="progress" unit="%" labelWidth={132} />
            )
            : <NoData icon="film" title="No videos watched yet" />}
        </Panel>
      </Grid>

      <Panel icon="film" tone="indigo" title="Watch history" wide>
        <DataTable
          cols={[
            { key: 'title', label: 'Video' },
            { key: 'progress', label: 'Progress', width: 170, render: (x) => (
              <Meter value={x.progress} label="" right={`${x.progress}%`} tone="accent" />) },
            { key: 'watchedMin', label: 'Watched', render: (x) => `${x.watchedMin} min` },
            { key: 'completed', label: 'Status', render: (x) => (
              <Badge variant={x.completed ? 'success' : 'warning'}>{x.completed ? 'Completed' : 'In progress'}</Badge>) },
            { key: 'lastAt', label: 'Last watched', render: (x) => fmtDay(x.lastAt) },
          ]}
          rows={v?.recent} empty="No videos watched yet" emptyIcon="film" />
      </Panel>

      <Panel icon="clipboard" tone="teal" title="Video assignments" wide>
        <DataTable
          cols={[
            { key: 'title', label: 'Assignment' },
            { key: 'videoCount', label: 'Videos' },
            { key: 'dueDate', label: 'Due', render: (x) => fmtDate(x.dueDate) },
            { key: 'mandatory', label: 'Mandatory', render: (x) => (x.mandatory ? 'Yes' : 'No') },
            { key: 'status', label: 'Status', render: (x) => (
              <StatusBadge status={x.status} map={{ active: 'success', completed: 'info', expired: 'muted' }} />) },
          ]}
          rows={v?.assignments} empty="No video assignments" emptyIcon="clipboard" />
      </Panel>
    </>
  );
}

// ── Assignments ──────────────────────────────────────────────────────────────

export function AssignmentsTab({ d }) {
  const sum = d?.summary || {};

  if (!sum.assigned && !sum.submitted) {
    return (
      <Panel icon="documents" tone="blue" title="Assignments" wide>
        <NoData icon="documents" title="Nothing assigned yet"
          hint="Assignments set for this section or this student appear here, with what was handed in." />
      </Panel>
    );
  }

  return (
    <>
      <Tiles>
        <Tile icon="documents" tone="blue" value={sum.assigned} label="Assigned"
          caption="Reaching this student" />
        <Tile icon="checkCircle" tone="green" value={sum.submitted} label="Submitted"
          caption={`${sum.reviewed || 0} reviewed`} />
        <Tile icon="clock" tone={sum.pending ? 'amber' : 'green'} value={sum.pending} label="Not handed in"
          caption={sum.pending ? 'Still outstanding' : 'Nothing outstanding'} />
        <Tile icon="star" tone="purple" value={sum.avgMarks} label="Average marks"
          caption={`${sum.onTimeRate ?? 0}% submitted on time · ${sum.late || 0} late`}
          empty="Nothing marked" />
      </Tiles>

      <Grid cols="two">
        <Panel icon="clock" tone="amber" title="Still to hand in"
          subtitle={sum.pending ? `${sum.pending} outstanding` : undefined}>
          {d?.pending?.length
            ? (
              <ul className="sddue">
                {d.pending.map((x) => (
                  <li key={x._id}>
                    <span className={`sddue__flag${x.overdue ? ' is-late' : ''}`}>
                      <Icon name={x.overdue ? 'alert' : 'clock'} size={14} />
                    </span>
                    <div>
                      <b>{x.title}</b>
                      <small>
                        {[x.subject, titleCase(x.type)].filter(Boolean).join(' · ') || 'No subject'}
                        {x.dueDate ? ` · due ${fmtDate(x.dueDate)}` : ' · no due date'}
                      </small>
                    </div>
                    <Badge variant={x.overdue ? 'danger' : 'warning'}>{x.overdue ? 'Overdue' : 'Pending'}</Badge>
                  </li>
                ))}
              </ul>
            )
            : <NoData icon="checkCircle" title="Everything has been handed in"
                hint="Nothing assigned to this student is outstanding." />}
        </Panel>

        <Panel icon="chat" tone="pink" title="Teacher feedback"
          subtitle="Written when a submission was reviewed">
          {(d?.submissions || []).some((s) => s.feedback)
            ? (
              <ShowMore rows={d.submissions.filter((s) => s.feedback)} initial={4} noun="notes">
                {(shown) => (
                  <ul className="sdnotes">
                    {shown.map((s) => (
                      <li key={s._id}>
                        <p>{s.feedback}</p>
                        <small>
                          {s.title}
                          {s.marks != null ? ` · ${s.marks}${s.totalMarks ? `/${s.totalMarks}` : ''}` : ''}
                          {s.reviewedAt ? ` · ${fmtDate(s.reviewedAt)}` : ''}
                        </small>
                      </li>
                    ))}
                  </ul>
                )}
              </ShowMore>
            )
            : <NoData icon="chat" title="No feedback written yet"
                hint="Feedback left on a reviewed submission appears here." />}
        </Panel>
      </Grid>

      <Panel icon="fileCheck" tone="green" title="Submissions" wide subtitle="The 15 most recent">
        <DataTable
          cols={[
            { key: 'title', label: 'Assignment' },
            { key: 'subject', label: 'Subject' },
            { key: 'type', label: 'Type', render: (x) => titleCase(x.type) },
            { key: 'dueDate', label: 'Due', render: (x) => fmtDay(x.dueDate) },
            { key: 'submittedAt', label: 'Submitted', render: (x) => fmtDay(x.submittedAt) },
            { key: 'marks', label: 'Marks', render: (x) => (x.marks == null
              ? null : `${x.marks}${x.totalMarks ? ` / ${x.totalMarks}` : ''}`) },
            { key: 'status', label: 'Status', render: (x) => (
              <StatusBadge status={x.status}
                map={{ submitted: 'success', late: 'warning', reviewed: 'info', draft: 'muted' }} />) },
          ]}
          rows={d?.submissions} empty="Nothing handed in yet" emptyIcon="fileCheck" />
      </Panel>
    </>
  );
}

// ── Timetable ────────────────────────────────────────────────────────────────

const TODAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

export function TimetableTab({ t }) {
  if (!t?.hasTimetable) {
    return (
      <Panel icon="calendarDays" tone="indigo" title="Timetable" wide>
        <NoData icon="calendarDays" title="No timetable published for this section"
          hint="Publish one from the timetable module and the week appears here." />
      </Panel>
    );
  }

  const teachers = new Set();
  (t.subjects || []).forEach((s) => (s.teachers || []).forEach((n) => teachers.add(n)));
  const today = (t.entries || []).filter((e) => e.day === TODAY).sort((a, b) => a.period - b.period);
  const periodTime = Object.fromEntries((t.periods || []).map((p) => [p.period, p]));

  return (
    <>
      <Tiles>
        <Tile icon="book" tone="indigo" value={t.subjects?.length ?? 0} label="Subjects"
          caption="Taught in this section" />
        <Tile icon="calendarDays" tone="blue" value={t.periodsPerWeek} label="Periods a week"
          caption={`${t.days?.length || 0} teaching day${t.days?.length === 1 ? '' : 's'}`} />
        <Tile icon="teacher" tone="purple" value={teachers.size} label="Teachers"
          caption="Taking at least one period" />
        <Tile icon="clock" tone="amber" value={t.startTime ? fmtTime(t.startTime) : null} label="School starts"
          caption={t.endTime ? `Ends ${fmtTime(t.endTime)}` : undefined} empty="Not set" />
      </Tiles>

      <Panel icon="calendarDays" tone="indigo" title="The week" wide
        subtitle="Every period as published, with the teacher and the room">
        <WeekGrid days={t.days || []} periods={t.periods || []} entries={t.entries || []} today={TODAY} />
      </Panel>

      <Grid cols="two">
        <Panel icon="clock" tone="green" title={`Today · ${TODAY}`}
          subtitle={today.length ? `${today.length} period${today.length === 1 ? '' : 's'}` : undefined}>
          {today.length
            ? (
              <TimeLine items={today.map((e) => ({
                key: e._id,
                title: e.subject || 'Subject',
                sub: [e.teacher, e.room].filter(Boolean).join(' · ') || 'No teacher assigned',
                right: periodTime[e.period]?.startTime
                  ? `${fmtTime(periodTime[e.period].startTime)}–${fmtTime(periodTime[e.period].endTime)}`
                  : `Period ${e.period}`,
              }))} />
            )
            : <NoData icon="sun" title="No periods scheduled today"
                hint={`${TODAY} is not a teaching day for this section.`} />}
        </Panel>

        <Panel icon="chart" tone="teal" title="Weekly load"
          subtitle="Periods per subject across the week">
          <RankBars
            data={(t.subjects || []).map((s) => ({ subject: s.subject.slice(0, 20), periods: s.periods }))}
            labelKey="subject" valueKey="periods" unit=""
            max={Math.max(...(t.subjects || []).map((s) => s.periods), 1)} labelWidth={132} />
        </Panel>
      </Grid>

      <Panel icon="teacher" tone="blue" title="Subjects and teachers" wide>
        <DataTable
          cols={[
            { key: 'subject', label: 'Subject' },
            { key: 'periods', label: 'Periods / week' },
            { key: 'teachers', label: 'Teachers', render: (x) => (x.teachers || []).join(', ') },
          ]}
          rows={t.subjects} empty="No subjects on the timetable" />
      </Panel>
    </>
  );
}

// ── Inventory ────────────────────────────────────────────────────────────────

export function InventoryTab({ i }) {
  const sum = i?.summary || {};

  if (!sum.issued) {
    return (
      <Panel icon="package" tone="teal" title="Inventory" wide>
        <NoData icon="package" title="Nothing issued to this student"
          hint="School property handed out — a laptop, a lab kit, a uniform — appears here with its return date." />
      </Panel>
    );
  }

  return (
    <>
      <Tiles>
        <Tile icon="package" tone="teal" value={sum.issued} label="Items issued"
          caption="This academic year" />
        <Tile icon="checkSquare" tone="blue" value={sum.open} label="Still held"
          caption={sum.open ? 'Not yet returned' : 'Everything returned'} />
        <Tile icon="checkCircle" tone="green" value={sum.returned} label="Returned" />
        <Tile icon="alert" tone={sum.overdue ? 'pink' : 'green'} value={sum.overdue} label="Past return date"
          caption={sum.overdue ? 'Needs chasing' : 'Nothing overdue'} />
      </Tiles>

      <Panel icon="package" tone="teal" title="Issue history" wide subtitle="The 15 most recent">
        <DataTable
          cols={[
            { key: 'item', label: 'Item' },
            { key: 'quantity', label: 'Qty' },
            { key: 'issueDate', label: 'Issued', render: (x) => fmtDate(x.issueDate) },
            { key: 'expectedReturn', label: 'Return by', render: (x) => fmtDate(x.expectedReturn) },
            { key: 'status', label: 'Status', render: (x) => (
              <StatusBadge status={x.status}
                map={{ returned: 'success', issued: 'info', partially_returned: 'warning', overdue: 'danger' }} />) },
          ]}
          rows={i?.items} empty="No items issued" emptyIcon="package" />
      </Panel>
    </>
  );
}

// ── Alerts ───────────────────────────────────────────────────────────────────

const CATEGORY_ICON = {
  fees: 'wallet', attendance: 'checkSquare', leave: 'calendar', library: 'library',
  transport: 'bus', results: 'chart', exams: 'fileCheck', holidays: 'party',
  documents: 'documents', inventory: 'package', chat: 'chat', general: 'bell',
};

export function AlertsTab({ n }) {
  const sum = n?.summary || {};

  if (!sum.received) {
    return (
      <Panel icon="bell" tone="amber" title="Alerts" wide>
        <NoData icon="bell" title="Nothing sent to this student yet"
          hint="Every notification the school sends appears here, with whether it was opened." />
      </Panel>
    );
  }

  return (
    <>
      <Tiles>
        <Tile icon="bell" tone="amber" value={sum.received} label="Received"
          caption="Notifications sent to this student" />
        <Tile icon="checkCircle" tone="green" value={sum.read} label="Opened"
          caption={`${sum.readRate ?? 0}% of everything sent`} />
        <Tile icon="alert" tone={sum.unread ? 'pink' : 'green'} value={sum.unread} label="Unopened"
          caption={sum.unread ? 'Still unread' : 'Nothing waiting'} />
        <Tile icon="activity" tone="indigo" value={sum.readRate} unit="%" label="Read rate"
          caption="How reliably this student reads what is sent" />
      </Tiles>

      <Grid cols="wide-left">
        <Panel icon="bell" tone="amber" title="Recent alerts"
          subtitle="The 25 most recent, newest first">
          {n?.recent?.length
            ? (
              <ShowMore rows={n.recent} initial={8} noun="alerts">
                {(shown) => (
                  <ul className="sdalerts">
                    {shown.map((x) => (
                      <li key={x._id} className={x.isRead ? undefined : 'is-unread'}>
                        <span className="sdalerts__icon tint-indigo">
                          <Icon name={CATEGORY_ICON[x.category] || 'bell'} size={15} />
                        </span>
                        <div>
                          <b>{x.title}</b>
                          <p>{x.body}</p>
                          <small>
                            {fmtDate(x.sentAt)}
                            {x.from ? ` · from ${titleCase(x.from)}` : ''}
                          </small>
                        </div>
                        <Badge variant={x.isRead ? 'success' : 'warning'}>{x.isRead ? 'Read' : 'Unread'}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </ShowMore>
            )
            : <NoData icon="bell" title="Nothing to show"
                hint="The notifications behind these counts have since been deleted." />}
        </Panel>

        <Panel icon="layers" tone="blue" title="What they were about"
          subtitle="Grouped by the part of the school that sent them">
          {n?.byCategory?.length
            ? (
              <ul className="sdcats">
                {n.byCategory.map((c) => (
                  <li key={c.category}>
                    <Icon name={CATEGORY_ICON[c.category] || 'bell'} size={15} />
                    <span>{titleCase(c.category)}</span>
                    <b>{c.count}</b>
                  </li>
                ))}
              </ul>
            )
            : <NoData icon="layers" title="Nothing to group" />}
          <Meter value={sum.readRate} label="Read rate" right={`${sum.readRate ?? 0}%`} />
        </Panel>
      </Grid>
    </>
  );
}
