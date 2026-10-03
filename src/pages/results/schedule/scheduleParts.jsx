/**
 * Pieces the Exam Schedule pages share (Oct 2026).
 *
 * A paper's day is a calendar day — "2026-11-16" — and is read by its own
 * parts, never through a time zone: read as an instant, a browser west of
 * Greenwich shows the day before. Its time is the school's wall clock, "09:30",
 * shown as given.
 */
import React from 'react';
import { Ico } from '../rsUI';
import { classLine } from '../resultMeta';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const utc = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return Date.UTC(y, m - 1, d); };
export const dayParts = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { y, m, d, dd: String(d).padStart(2, '0'), mon: MON[m - 1], dow: DOW[w], dowLong: DOW_LONG[w] };
};
/** "Mon, 16 Nov" */
export const shortDay = (iso) => { const p = dayParts(iso); return `${p.dow}, ${p.dd} ${p.mon}`; };
/** "Monday, 16 Nov 2026" */
export const longDay = (iso) => { const p = dayParts(iso); return `${p.dowLong}, ${p.dd} ${p.mon} ${p.y}`; };
export const daysFrom = (today, iso) => Math.round((utc(iso) - utc(today)) / 864e5);
/** "Today", "Tomorrow", "In 5 days", "3 days ago". */
export const relDay = (iso, today) => {
  const n = daysFrom(today, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
};

/** "09:30" → "9:30 AM" */
export const clock = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || ''));
  if (!m) return '';
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};
export const timeRange = (start, end) => (start ? (end ? `${clock(start)} – ${clock(end)}` : clock(start)) : '');
/** "2 h 30 min" between two wall-clock times of one day. */
export const duration = (start, end) => {
  const a = /^(\d{1,2}):(\d{2})$/.exec(String(start || '')); const b = /^(\d{1,2}):(\d{2})$/.exec(String(end || ''));
  if (!a || !b) return '';
  const min = (Number(b[1]) * 60 + Number(b[2])) - (Number(a[1]) * 60 + Number(a[2]));
  if (min <= 0) return '';
  const h = Math.floor(min / 60); const r = min % 60;
  return [h ? `${h} h` : '', r ? `${r} min` : ''].filter(Boolean).join(' ');
};

/** A calendar leaf: the month over the day, the weekday under it. */
export const DateLeaf = ({ iso, tone }) => {
  const p = dayParts(iso);
  return (
    <span className={`rs-leaf${tone ? ` is-${tone}` : ''}`} aria-hidden>
      <i>{p.mon}</i>
      <b>{p.d}</b>
      <em>{p.dow}</em>
    </span>
  );
};

/** What a schedule leads with: the next paper still to be sat. */
export function NextPaper({ next, today, lead = 'Next paper' }) {
  if (!next) return null;
  const isToday = next.date === today;
  const when = timeRange(next.startTime, next.endTime);
  return (
    <div className={`rs-next${isToday ? ' is-today' : ''}`} role="status">
      <DateLeaf iso={next.date} tone={isToday ? 'today' : undefined} />
      <span className="rs-next__text">
        <small>{isToday ? 'Today' : lead} · {isToday ? longDay(next.date) : relDay(next.date, today)}</small>
        <strong>{next.subjectName}</strong>
        <span>{[next.exam.title, classLine(next.exam) !== '—' ? classLine(next.exam) : ''].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="rs-next__when">
        <Ico name="clock" size={17} />
        <span>
          <strong>{when || 'Time to be announced'}</strong>
          {duration(next.startTime, next.endTime) ? <small>{duration(next.startTime, next.endTime)}</small> : null}
        </span>
      </span>
    </div>
  );
}

/** Two or three choices side by side — "All papers | My subjects". */
export const Segmented = ({ value, onChange, options, label }) => (
  <span className="rs-seg" role="group" aria-label={label}>
    {options.map((o) => (
      <button key={o.value} type="button" className={value === o.value ? 'is-on' : ''} aria-pressed={value === o.value}
        disabled={o.disabled} onClick={() => onChange(o.value)}>
        {o.label}{o.count !== undefined ? <i>{o.count}</i> : null}
      </button>
    ))}
  </span>
);

/**
 * The papers as a calendar file (.ics) any calendar app opens. Times are
 * written as the school's wall clock with no zone ("floating"), so 9:30 is
 * 9:30 wherever the file is opened; a paper with no time is an all-day entry.
 * events: [{ uid, title, date, startTime, endTime, description }]
 */
export function downloadIcs(filename, events) {
  const esc = (v) => String(v || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ymd = (iso) => String(iso).replace(/-/g, '');
  const nextDay = (iso) => new Date(utc(iso) + 864e5).toISOString().slice(0, 10);
  const plusHour = (t) => { const [h, m] = t.split(':').map(Number); return `${String(Math.min(23, h + 1)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//School ERP//Exam Schedule//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
  events.forEach((e) => {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`);
    if (e.startTime) {
      const end = e.endTime || plusHour(e.startTime);
      lines.push(`DTSTART:${ymd(e.date)}T${e.startTime.replace(':', '')}00`, `DTEND:${ymd(e.date)}T${end.replace(':', '')}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${ymd(nextDay(e.date))}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  // A line is at most 75 octets; a longer one carries on down the page, each
  // continuation led by a space (which counts towards its own 75).
  const enc = new TextEncoder();
  const fold = (line) => {
    let out = ''; let cur = ''; let bytes = 0;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (bytes + n > (out ? 74 : 75)) { out += `${cur}\r\n `; cur = ''; bytes = 0; }
      cur += ch; bytes += n;
    }
    return out + cur;
  };
  const blob = new Blob([lines.map(fold).join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
