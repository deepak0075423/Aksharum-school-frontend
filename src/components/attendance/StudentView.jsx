/**
 * A student's attendance — the pieces the student's own page and their
 * parent's page share. Both read GET …/attendance/overview
 * (services/studentAttendanceView.js); the student can also ask for a
 * correction and answer a teacher's question, the parent reads.
 *
 * Built on the teacher attendance kit (parts.jsx, `tat-` in global.css) so the
 * three roles see one design.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Modal, Spinner } from '../ui/index';
import Icon from '../ui/icons';
import { fileUrl } from '../../pages/admin/listParts';
import {
  Card, Change, Empty, MARKS, PillSelect, STATUS, StatusPill, Tile,
  addMonths, dateOf, fmtDay, fmtMonth, fmtStamp, monthShort, todayKey,
} from './parts';

export const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MARK_LABEL = { present: 'Present', absent: 'Absent', late: 'Late', 'half-day': 'Half-Day', unmarked: 'Not marked' };
const share = (n, of) => (of ? `${Math.round((n / of) * 100)}%` : '0%');
const longDay = (key) => {
  const d = dateOf(key);
  return `${d.toLocaleDateString('en-GB', { weekday: 'long' })}, ${d.getDate()} ${d.toLocaleDateString('en-GB', { month: 'long' })} ${d.getFullYear()}`;
};
const firstName = (name) => String(name || '').split(/\s+/)[0] || 'your child';

// ── Month picker ─────────────────────────────────────────────────────────────

export function MonthPicker({ value, onChange }) {
  const now = `${todayKey().slice(0, 7)}-01`;
  const months = Array.from({ length: 12 }, (_, i) => addMonths(now, -i).slice(0, 7));
  return (
    <PillSelect icon="calendar" value={value} onChange={onChange} className="tat-pillselect--head tat-pillselect--monthhead">
      {months.map((m) => <option key={m} value={m}>{fmtMonth(`${m}-01`)}</option>)}
    </PillSelect>
  );
}

// ── Alerts ───────────────────────────────────────────────────────────────────

export function Alerts({ data, who = 'student' }) {
  if (!data?.alerts?.length) return null;
  const name = who === 'student' ? 'You have' : `${firstName(data.student?.name)} has`;
  return (
    <div className="tat-alerts">
      {data.alerts.map((a) => (a.kind === 'streak' ? (
        <div key="streak" className="tat-alert tat-alert--red" role="status">
          <Icon name="alert" size={20} />
          <div>
            <b>{name} been absent {a.count} school days in a row</b>
            <p>{who === 'student' ? 'If a mark is wrong, ask for a correction.' : 'If something is wrong, please get in touch with the class teacher.'}</p>
          </div>
        </div>
      ) : (
        <div key="low" className="tat-alert tat-alert--amber" role="status">
          <Icon name="trendDown" size={20} />
          <div>
            <b>Attendance for the year is {a.percentage}%, below the {a.threshold}% minimum</b>
            <p>Every day attended from here raises it.</p>
          </div>
        </div>
      )))}
    </div>
  );
}

// ── Figures ──────────────────────────────────────────────────────────────────

export function OverviewTiles({ data }) {
  const s = data?.summary || { marks: {}, days: {} };
  const p = data?.previous || { marks: {} };
  const marked = s.days?.marked || 0;
  const change = s.marks?.percentage != null && p.marks?.percentage != null ? s.marks.percentage - p.marks.percentage : null;
  return (
    <div className="tat-tiles tat-tiles--5">
      <Tile icon="chart" tone="indigo" label="Attendance"
        value={<>{s.marks?.percentage == null ? '—' : `${s.marks.percentage}%`}{change == null ? null : <Change value={change} />}</>}
        title={p.marks?.percentage != null ? `${p.label}: ${p.marks.percentage}%` : undefined} />
      <Tile icon="shieldCheck" solid tone="green" value={s.days?.present || 0} label="Present" note={share(s.days?.present || 0, marked)} />
      <Tile icon="user" tone="red" value={s.days?.absent || 0} label="Absent" note={share(s.days?.absent || 0, marked)} />
      <Tile icon="gauge" tone="amber" value={s.days?.late || 0} label="Late" note={share(s.days?.late || 0, marked)} />
      <Tile icon="halfDay" tone="indigo" value={s.days?.halfDay || 0} label="Half-Day" note={share(s.days?.halfDay || 0, marked)} />
    </div>
  );
}

// ── The month ────────────────────────────────────────────────────────────────

const CAL_LEGEND = ['present', 'absent', 'late', 'half-day', 'holiday', 'unmarked'];

export function MonthGrid({ data, selected, onSelect, onMonth, loading }) {
  const days = data?.days || [];
  const lead = days.length ? dateOf(days[0].key).getDay() : 0;
  const month = data?.month || todayKey().slice(0, 7);
  const thisMonth = todayKey().slice(0, 7);
  return (
    <Card className="tat-bigcalcard" title="Attendance Calendar" sub={data?.label}
      actions={(
        <>
          <button type="button" className="tat-iconbtn" aria-label="Previous month" onClick={() => onMonth(addMonths(`${month}-01`, -1).slice(0, 7))}>
            <Icon name="chevronLeft" size={18} />
          </button>
          <button type="button" className="tat-btn" disabled={month === thisMonth} onClick={() => onMonth(thisMonth)}>This Month</button>
          <button type="button" className="tat-iconbtn" aria-label="Next month" disabled={month >= thisMonth}
            onClick={() => onMonth(addMonths(`${month}-01`, 1).slice(0, 7))}>
            <Icon name="chevronRight" size={18} />
          </button>
        </>
      )}>
      <div className={`tat-bigcal${loading ? ' is-loading' : ''}`}>
        {WEEK.map((w) => <span key={w} className="tat-bigcal__dow">{w}</span>)}
        {Array.from({ length: lead }).map((_, i) => <span key={`b${i}`} />)}
        {days.map((d) => {
          const tone = d.state ? (STATUS[d.state]?.tone || 'muted') : 'none';
          const cls = ['tat-bigcal__day', `is-${d.state || 'future'}`, `tone-${tone}`,
            d.key === selected && 'is-on', d.key === todayKey() && 'is-today'].filter(Boolean).join(' ');
          const tag = d.state === 'holiday' ? (d.label || 'Holiday')
            : d.state === 'weekend' ? '' : d.state ? MARK_LABEL[d.state] : '';
          return (
            <button key={d.key} type="button" className={cls} disabled={!d.state || d.state === 'weekend'}
              title={[fmtDay(d.key), d.registers ? d.registers.map((g) => `${g.subjectName}: ${MARK_LABEL[g.status || 'unmarked']}`).join(', ') : tag].filter(Boolean).join(' · ')}
              onClick={() => onSelect(d.key)}>
              <span className="tat-bigcal__num">{dateOf(d.key).getDate()}</span>
              {tag ? <span className="tat-bigcal__tag">{d.state !== 'holiday' && d.state !== 'unmarked' ? <i /> : null}{tag}</span> : null}
              {d.registers ? <span className="tat-bigcal__subs">{d.registers.length} subjects</span> : null}
            </button>
          );
        })}
      </div>
      <ul className="tat-legend tat-legend--row">
        {CAL_LEGEND.map((k) => <li key={k}><i style={{ background: STATUS[k].dot }} />{MARK_LABEL[k] || STATUS[k].label}</li>)}
      </ul>
    </Card>
  );
}

/** What one day holds, and — for the student — a way to ask for it to be corrected. */
export function DayDetail({ data, dayKey, who = 'student', onRequest }) {
  const day = (data?.days || []).find((d) => d.key === dayKey);
  if (!day) return null;
  const name = who === 'student' ? 'you' : firstName(data?.student?.name);
  const marked = ['present', 'absent', 'late', 'half-day'].includes(day.state);
  const canAsk = who === 'student' && marked && dayKey >= (data?.canRequestFrom || '') && dayKey <= todayKey();

  return (
    <Card className="tat-daydetail" title={longDay(dayKey)}
      actions={marked || day.state === 'holiday' || day.state === 'unmarked'
        ? <StatusPill status={day.state === 'unmarked' ? 'unmarked' : day.state} label={day.state === 'holiday' ? 'Holiday' : undefined} /> : null}>
      {day.registers ? (
        <table className="tat-table tat-table--subjects">
          <thead><tr><th>Subject</th><th>Mark</th><th>Remark</th></tr></thead>
          <tbody>
            {day.registers.map((g) => (
              <tr key={g.attendance}>
                <td>{g.subjectName}</td>
                <td><StatusPill status={g.status || 'unmarked'} /></td>
                <td className="tat-muted">{g.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : marked ? (
        <p className="tat-daydetail__text">
          Marked <b className={`tat-ink--${STATUS[day.state].tone === 'amber' ? 'amber' : STATUS[day.state].tone}`}>{MARK_LABEL[day.state].toLowerCase()}</b>
          {day.remarks ? <> — <span className="tat-muted">{day.remarks}</span></> : null}
        </p>
      ) : day.state === 'holiday' ? (
        <p className="tat-daydetail__text">A school holiday{day.label ? ` — ${day.label}` : ''}. Attendance is not taken.</p>
      ) : day.state === 'unmarked' ? (
        <p className="tat-daydetail__text">
          {day.registerTaken
            ? `The register was taken but ${name === 'you' ? 'you were' : `${name} was`} not on it. Please tell the class teacher.`
            : 'No attendance was recorded for this day.'}
        </p>
      ) : (
        <p className="tat-daydetail__text tat-muted">Nothing to show for this day yet.</p>
      )}
      {day.registers && day.state === 'half-day' && (
        <p className="tat-daydetail__note"><Icon name="info" size={14} />A day with some subjects missed shows as a half day; each subject counts on its own towards the percentage.</p>
      )}
      {who === 'student' && marked && (
        <div className="tat-daydetail__acts">
          <button type="button" className="tat-btn tat-btn--soft" disabled={!canAsk} onClick={() => onRequest(dayKey)}
            title={canAsk ? '' : 'Corrections can be asked for within the last month'}>
            <Icon name="pencil" size={16} /> Request Correction
          </button>
        </div>
      )}
    </Card>
  );
}

// ── The rail ─────────────────────────────────────────────────────────────────

export function Donut({ parts, value, caption = 'Attendance', size = 142, stroke = 15 }) {
  const shown = parts.filter((p) => p.n > 0);
  const total = shown.reduce((n, p) => n + p.n, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const gap = shown.length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="tat-donut" style={{ width: size, height: size }}
      role="img" aria-label={shown.map((p) => `${p.label} ${p.n}`).join(', ') || 'Nothing marked'}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef2f7" strokeWidth={stroke} />
        {shown.map((p) => {
          const len = (p.n / total) * c;
          const seg = (
            <circle key={p.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={STATUS[p.key].dot} strokeWidth={stroke}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <title>{`${p.label}: ${p.n}`}</title>
            </circle>
          );
          offset += len;
          return seg;
        })}
      </svg>
      <div className="tat-donut__label"><b>{value == null ? '—' : `${value}%`}</b><span>{caption}</span></div>
    </div>
  );
}

export function MonthCard({ data }) {
  const d = data?.summary?.days || {};
  const parts = [
    { key: 'present', label: 'Present', n: d.present || 0 },
    { key: 'absent', label: 'Absent', n: d.absent || 0 },
    { key: 'late', label: 'Late', n: d.late || 0 },
    { key: 'half-day', label: 'Half-Day', n: d.halfDay || 0 },
    { key: 'unmarked', label: 'Not Marked', n: data?.summary?.notMarked || 0 },
  ];
  return (
    <Card className="tat-monthcard" title="This Month" sub={data?.label}>
      <div className="tat-donutwrap">
        <Donut parts={parts.slice(0, 4)} value={data?.summary?.marks?.percentage} />
        <ul className="tat-donutlegend">
          {parts.map((p) => <li key={p.key}><i style={{ background: STATUS[p.key].dot }} /><span>{p.label}</span><b>{p.n}</b></li>)}
        </ul>
      </div>
    </Card>
  );
}

export function StandingCard({ data }) {
  const y = data?.year;
  const pct = y?.marks?.percentage;
  const threshold = data?.threshold || 75;
  return (
    <Card className="tat-standing" title="This Year" actions={y?.label ? <span className="tat-chip">{y.label}</span> : null}>
      <div className="tat-standing__big">
        <b className={pct == null ? '' : pct >= threshold ? 'tat-ink--green' : 'tat-ink--red'}>{pct == null ? '—' : `${pct}%`}</b>
        <span>attendance so far</span>
      </div>
      <div className="tat-meter" role="img" aria-label={`${pct ?? 0}% against a ${threshold}% minimum`}>
        <span className="tat-meter__fill" style={{ width: `${Math.max(0, Math.min(100, pct || 0))}%` }} data-low={pct != null && pct < threshold ? '' : undefined} />
        <span className="tat-meter__mark" style={{ left: `${threshold}%` }}><em>{threshold}% minimum</em></span>
      </div>
      <dl className="tat-standing__rows">
        <div><dt><Icon name="trophy" size={16} />Rank in class</dt><dd>{y?.rank ? `${y.rank} of ${y.of}` : '—'}</dd></div>
        <div><dt><Icon name="users" size={16} />Class average</dt><dd>{y?.classAverage == null ? '—' : `${y.classAverage}%`}</dd></div>
        <div><dt><Icon name="calendar" size={16} />Days marked</dt><dd>{y?.days?.marked ?? 0}</dd></div>
        <div><dt><Icon name="halfDay" size={16} />Half days</dt><dd>{y?.days?.halfDay ?? 0}</dd></div>
      </dl>
    </Card>
  );
}

export function InsightCard({ data, who = 'student' }) {
  const now = data?.summary?.marks?.percentage;
  const before = data?.previous?.marks?.percentage;
  const subject = who === 'student' ? 'You are' : `${firstName(data?.student?.name)} is`;
  let tone = 'flat', text;
  if (now == null) text = 'Nothing has been marked this month yet.';
  else if (before == null) text = `${now}% this month — there is no ${data?.previous?.label || 'earlier month'} to compare with.`;
  else if (now > before) { tone = 'good'; text = <>{subject} <span className="tat-ink--green">{now - before}%</span> more regular than last month.</>; }
  else if (now < before) { tone = 'bad'; text = <>{subject} <span className="tat-ink--red">{before - now}%</span> less regular than last month.</>; }
  else text = 'Steady — the same as last month.';
  return (
    <section className={`tat-insight tat-insight--${tone}`}>
      <span className="tat-insight__icon"><Icon name="chart" size={24} /></span>
      <div><b>Attendance Insights</b><p>{text}</p></div>
      {tone !== 'flat' && <Icon name={tone === 'good' ? 'trending' : 'trendDown'} size={30} strokeWidth={2} />}
    </section>
  );
}

const reqStatus = (s) => (s === 'pending' ? 'waiting' : s);

export function RecentRequestsCard({ data, onViewAll }) {
  const list = data?.requests?.recent || [];
  return (
    <Card className="tat-reqlistcard" title="Correction Requests"
      actions={<button type="button" className="tat-link" onClick={onViewAll}>View All <Icon name="chevronRight" size={14} /></button>}>
      {list.length === 0 ? <p className="tat-muted tat-small">No correction requests.</p> : (
        <ul className="tat-reqs">
          {list.map((r) => {
            const d = new Date(r.date);
            return (
              <li key={r._id}>
                <button type="button" onClick={onViewAll}>
                  <span className="tat-datetile"><b>{String(d.getUTCDate()).padStart(2, '0')}</b><small>{monthShort(new Date(d.getUTCFullYear(), d.getUTCMonth(), 1))}</small></span>
                  <span className="tat-reqs__text">
                    <b>{MARK_LABEL[r.currentStatus || 'unmarked']} → {MARK_LABEL[r.requestedStatus]}</b>
                    <small>{r.subject ? `${r.subject.name} · ` : ''}{r.reason}</small>
                  </span>
                  <StatusPill status={r.awaitingReply ? 'late' : reqStatus(r.status)} label={r.awaitingReply ? 'Reply needed' : undefined} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// ── Requests ─────────────────────────────────────────────────────────────────

const EVENT = {
  submitted:      { title: 'Request submitted',          tone: 'green' },
  info_requested: { title: 'More information requested', tone: 'amber' },
  replied:        { title: 'Reply sent',                 tone: 'indigo' },
  approved:       { title: 'Approved',                   tone: 'green' },
  rejected:       { title: 'Rejected',                   tone: 'red' },
  corrected:      { title: 'Corrected by the teacher',   tone: 'indigo' },
};
const ROLE = { student: 'Student', teacher: 'Teacher', school_admin: 'School Office' };

export function RequestTiles({ requests }) {
  const n = (s) => requests.filter((r) => r.status === s).length;
  const all = requests.length;
  const pct = (x) => (all ? `${Math.round((x / all) * 100)}%` : '0%');
  return (
    <div className="tat-tiles tat-tiles--4">
      <Tile layout="corner" icon="fileDoc" tone="indigo" value={all} label="Total Requests" caption="All time" />
      <Tile layout="corner" icon="check" solid="circle" tone="green" value={n('approved')} label="Approved" note={pct(n('approved'))} />
      <Tile layout="corner" icon="clock" tone="amber" value={n('pending')} label="Pending" note={pct(n('pending'))} />
      <Tile layout="corner" icon="user" tone="red" value={n('rejected')} label="Rejected" note={pct(n('rejected'))} />
    </div>
  );
}

/** Files picked for a request: at most three, 5 MB each — the server's limits, said before upload. */
function pickFiles(list, current) {
  const next = [...current, ...Array.from(list || [])];
  if (next.length > 3) { toast.error('Attach at most 3 files'); return next.slice(0, 3); }
  const big = next.find((f) => f.size > 5 * 1024 * 1024);
  if (big) { toast.error(`${big.name} is larger than 5 MB`); return next.filter((f) => f !== big); }
  return next;
}

function FileDrop({ files, onFiles, label = 'Attach proof (optional)' }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <button type="button" className={`tat-drop${over ? ' is-over' : ''}`} onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(pickFiles(e.dataTransfer.files, files)); }}>
        <Icon name="upload" size={20} />
        <span><b>{label}</b><small>A medical certificate or a note from home — up to 3 files, 5 MB each</small></span>
      </button>
      <input ref={input} type="file" multiple hidden accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.txt"
        onChange={(e) => { onFiles(pickFiles(e.target.files, files)); e.target.value = ''; }} />
      {files.length > 0 && (
        <div className="tat-filechips">
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="tat-filechip">
              <Icon name={/pdf$/i.test(f.name) ? 'filePdf' : /\.(png|jpe?g)$/i.test(f.name) ? 'fileImage' : 'fileDoc'} size={15} />
              <span>{f.name}</span>
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => onFiles(files.filter((_, j) => j !== i))}><Icon name="close" size={13} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function RequestCard({ request: r, who = 'student', name, onReply }) {
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const question = [...(r.history || [])].reverse().find((h) => h.event === 'info_requested');
  const d = new Date(r.date);
  const events = (r.history || []).map((h) => ({ ...h, ...(EVENT[h.event] || { title: h.event, tone: 'indigo' }) }));
  if (r.status === 'pending') {
    events.push(r.awaitingReply
      ? { key: 'wait', title: who === 'student' ? 'Waiting for your reply' : 'Waiting for the student’s reply', tone: 'muted' }
      : { key: 'wait', title: 'Waiting for the teacher’s review', tone: 'muted' });
  }
  const shown = all ? events : events.slice(-3);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim() && !files.length) return toast.error('Write a reply or attach a file');
    setBusy(true);
    try {
      await onReply(r, text.trim(), files);
      setText(''); setFiles([]);
    } finally { setBusy(false); }
  };

  return (
    <article className={`tat-card tat-rq${r.awaitingReply ? ' is-waiting' : ''}`} data-focus-id={r._id}>
      <header className="tat-rq__head">
        <span className="tat-datetile"><b>{String(d.getUTCDate()).padStart(2, '0')}</b><small>{monthShort(new Date(d.getUTCFullYear(), d.getUTCMonth(), 1))}</small></span>
        <div className="tat-rq__title">
          <b>
            <StatusPill status={r.currentStatus || 'unmarked'} />
            <Icon name="arrowRight" size={15} />
            <StatusPill status={r.requestedStatus} />
          </b>
          <small>{fmtDay(r.date)}{r.subject ? ` · ${r.subject.name}` : ''} · Submitted {fmtStamp(r.createdAt)}{r.source === 'teacher' ? ' by the teacher' : ''}</small>
        </div>
        <StatusPill status={r.awaitingReply ? 'late' : reqStatus(r.status)} label={r.awaitingReply ? 'Reply needed' : undefined} />
      </header>
      <p className="tat-rq__reason">{r.reason}</p>
      {r.attachments?.length > 0 && (
        <div className="tat-filechips">
          {r.attachments.map((f) => (
            <a key={f.url} className="tat-file" href={fileUrl(f.url)} target="_blank" rel="noreferrer">
              <Icon name={/pdf/i.test(f.type || f.name) ? 'filePdf' : /image/i.test(f.type || '') ? 'fileImage' : 'fileDoc'} size={16} />
              <span>{f.name}</span><Icon name="externalLink" size={14} />
            </a>
          ))}
        </div>
      )}
      {r.teacherRemarks && !(r.history || []).some((h) => h.message === r.teacherRemarks) ? <p className="tat-rq__remarks"><Icon name="chat" size={15} /><span><b>Remarks:</b> {r.teacherRemarks}</span></p> : null}

      <div className="tat-rq__trail">
        <ol className="tat-timeline">
          {shown.map((e, i) => (
            <li key={e.key || `${e.event}-${e.at}-${i}`} className={`tat-timeline__item tat-timeline__item--${e.tone}`}>
              <i />
              <div>
                <b>{e.title}</b>
                {e.byName ? <small>By {e.byName}{ROLE[e.role] ? ` (${ROLE[e.role]})` : ''}</small> : null}
                {e.message && e.event !== 'submitted' ? <p>{e.message}</p> : null}
              </div>
              {e.at ? <time>{fmtStamp(e.at)}</time> : null}
            </li>
          ))}
        </ol>
        {events.length > 3 && (
          <button type="button" className="tat-link tat-rq__more" onClick={() => setAll((v) => !v)}>
            {all ? 'Show less' : `Show all ${events.length} steps`}
          </button>
        )}
      </div>

      {r.awaitingReply && question && (who === 'student' ? (
        <form className="tat-rq__reply" onSubmit={send}>
          <p><Icon name="chat" size={16} /><span><b>{question.byName || 'Your teacher'} asked:</b> {question.message}</span></p>
          <textarea className="form-control" rows={2} maxLength={500} value={text} placeholder="Write your reply…"
            onChange={(e) => setText(e.target.value)} aria-label="Your reply" />
          <FileDrop files={files} onFiles={setFiles} label="Attach a file (optional)" />
          <div className="tat-rq__replyacts">
            <Button type="submit" loading={busy}><Icon name="arrowRight" size={15} /> Send Reply</Button>
          </div>
        </form>
      ) : (
        <p className="tat-rq__replynote"><Icon name="info" size={15} />{question.byName || 'The teacher'} asked: “{question.message}” — {firstName(name)} can reply from their own account.</p>
      ))}
    </article>
  );
}

export function RequestsBody({ requests, who = 'student', name, loading, onReply, emptyAction }) {
  const [status, setStatus] = useState('');
  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  }), [requests]);
  const list = status ? requests.filter((r) => r.status === status) : requests;
  return (
    <>
      <RequestTiles requests={requests} />
      <section className="tat-card">
        <div className="tat-filters">
          <div className="tat-chips" role="radiogroup" aria-label="Status">
            {[['', 'All', 'all'], ['pending', 'Pending', 'pending'], ['approved', 'Approved', 'approved'], ['rejected', 'Rejected', 'rejected']].map(([v, l, k]) => (
              <button key={l} type="button" role="radio" aria-checked={status === v}
                className={`tat-chipbtn${status === v ? ' is-on' : ''}`} onClick={() => setStatus(v)}>{l} ({counts[k]})</button>
            ))}
          </div>
        </div>
      </section>
      {loading && !requests.length ? <div className="tat-center"><Spinner /></div>
        : list.length === 0 ? (
          <section className="tat-card"><Empty icon="fileDoc" title={requests.length ? 'Nothing with that status' : 'No correction requests'}>
            {requests.length ? 'Try another filter.' : emptyAction}
          </Empty></section>
        ) : list.map((r) => <RequestCard key={r._id} request={r} who={who} name={name} onReply={onReply} />)}
    </>
  );
}

export function HowItWorksCard({ who = 'student', onRequest }) {
  return (
    <Card title="How Corrections Work">
      <ol className="tat-howto">
        <li><b>Ask</b><span>{who === 'student' ? 'Pick the day' : 'Your child picks the day'} — within the last month — say what the mark should be and why, and attach any proof.</span></li>
        <li><b>Review</b><span>The class teacher (or that subject&rsquo;s teacher) reviews it and may ask a question first.</span></li>
        <li><b>Decision</b><span>Approved corrections change the mark straight away. {who === 'student' ? 'You and your parents are' : 'You are'} notified at every step.</span></li>
      </ol>
      {onRequest && (
        <button type="button" className="tat-quick__btn tat-quick__btn--primary tat-howto__cta" onClick={() => onRequest('')}>
          <Icon name="pencil" size={18} /> Request Correction
        </button>
      )}
    </Card>
  );
}

// ── Asking for a correction ──────────────────────────────────────────────────

/** Pick the day and register, say what the mark should be and why, attach proof. */
export function CorrectionModal({ open, date, minDate, loadDay, submit, onClose, onSaved }) {
  const [form, setForm] = useState({ date: date || '', attendance: '', requestedStatus: '', reason: '' });
  const [files, setFiles] = useState([]);
  const [day, setDay] = useState(null);
  const [loadingDay, setLoadingDay] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ date: date || '', attendance: '', requestedStatus: '', reason: '' });
    setFiles([]);
  }, [open, date]);

  useEffect(() => {
    if (!open || !form.date) { setDay(null); return undefined; }
    let live = true;
    setLoadingDay(true);
    loadDay(form.date).then((res) => {
      if (!live) return;
      const d = res?.data ?? res;
      setDay(d);
      const first = (d?.registers || []).find((g) => !g.pending);
      setForm((f) => ({ ...f, attendance: first?.attendance || '', requestedStatus: '' }));
    }).catch(() => live && setDay(null)).finally(() => live && setLoadingDay(false));
    return () => { live = false; };
  }, [open, form.date]); // eslint-disable-line react-hooks/exhaustive-deps

  const registers = day?.registers || [];
  const chosen = registers.find((g) => g.attendance === form.attendance);
  const options = MARKS.filter((m) => m !== chosen?.status);

  const go = async (e) => {
    e.preventDefault();
    if (!form.date) return toast.error('Pick the day');
    if (!chosen) return toast.error(registers.length ? 'Choose which register to correct' : 'No attendance was taken on that day');
    if (!form.requestedStatus) return toast.error('Choose what the mark should be');
    if (!form.reason.trim()) return toast.error('Say why the mark is wrong');
    const body = new FormData();
    body.append('date', form.date);
    body.append('attendance', form.attendance);
    body.append('requestedStatus', form.requestedStatus);
    body.append('reason', form.reason.trim());
    files.forEach((f) => body.append('attachments', f));
    setBusy(true);
    try {
      await submit(body);
      toast.success('Request sent — your teacher will review it');
      onSaved();
    } catch (err) { toast.error(err?.message || 'Could not send the request'); }
    finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={580}
      title={<span className="tat-modaltitle"><Icon name="pencil" size={20} /> Request Correction</span>}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="tat-askfix" loading={busy} disabled={!chosen}>Send Request</Button>
      </>}>
      <form id="tat-askfix" className="tat-form" onSubmit={go}>
        <div className="form-group">
          <label className="form-label required" htmlFor="tat-ask-date">Day</label>
          <input id="tat-ask-date" type="date" className="form-control" value={form.date} min={minDate} max={todayKey()}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
          <small className="tat-muted">Within the last month.</small>
        </div>

        {form.date && (loadingDay ? <div className="tat-center"><Spinner size="sm" /></div> : !registers.length ? (
          <div className="tat-callout tat-callout--warn"><Icon name="alert" size={17} /><span>No attendance was taken on {fmtDay(form.date)}.</span></div>
        ) : (
          <div className="form-group">
            <span className="form-label required">{registers.length > 1 ? 'Which register' : 'Currently marked'}</span>
            <div className="tat-registers" role="radiogroup" aria-label="Register">
              {registers.map((g) => (
                <label key={g.attendance} className={`tat-register${form.attendance === g.attendance ? ' is-on' : ''}${g.pending ? ' is-disabled' : ''}`}>
                  <input type="radio" name="tat-register" value={g.attendance} checked={form.attendance === g.attendance} disabled={g.pending}
                    onChange={() => setForm((f) => ({ ...f, attendance: g.attendance, requestedStatus: '' }))} />
                  <span className="tat-register__name">{g.subject?.name || 'Day register'}</span>
                  {g.pending ? <small>Request pending</small> : <StatusPill status={g.status || 'unmarked'} />}
                </label>
              ))}
            </div>
          </div>
        ))}

        {chosen && (
          <div className="form-group">
            <span className="form-label required">It should be</span>
            <div className="tat-markpick" role="radiogroup" aria-label="Correct mark">
              {options.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={form.requestedStatus === m}
                  className={`tat-mark tat-mark--${STATUS[m].tone}${form.requestedStatus === m ? ' is-on' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, requestedStatus: m }))}>
                  <i aria-hidden>{form.requestedStatus === m ? <Icon name="check" size={11} /> : null}</i>{STATUS[m].label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label required" htmlFor="tat-ask-reason">Reason</label>
          <textarea id="tat-ask-reason" className="form-control" rows={3} maxLength={500} value={form.reason}
            placeholder="e.g. I was in school for the whole day — marked absent by mistake"
            onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} />
        </div>
        <FileDrop files={files} onFiles={setFiles} />
      </form>
    </Modal>
  );
}
