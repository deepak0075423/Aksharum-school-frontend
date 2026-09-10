/**
 * Student → Holidays.
 *
 * Every day the school has declared for this student: the ones announced to
 * everybody, plus any belonging to their own class. One calendar, and two lists
 * that split what is coming from what has been — a holiday next month and one
 * that has passed are read for different reasons.
 *
 * Read-only, and shares the admin screen's parts (pages/admin/holidayParts) so
 * a type is named, coloured and dated identically wherever it appears — dates
 * included, which stay `YYYY-MM-DD` strings end to end so a holiday never lands
 * on the wrong square for a reader west of Greenwich.
 */
import React, { useMemo, useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getHolidays } from '../../api/student.api';
import { Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  HolidayDialog, HolidayList, MonthCalendar,
  dayKey, daysOf, daysUntil, statusOf, tintFor, today,
} from '../admin/holidayParts';

const MONTH_START = () => { const n = new Date(); return [n.getFullYear(), n.getMonth()]; };
const inThisMonth = (key) => key.slice(0, 7) === today().slice(0, 7);

/** How far off the nearest holiday still to come is, said in words. */
const nextLine = (list) => {
  const soon = list
    .filter((h) => statusOf(h) !== 'past')
    .map((h) => daysUntil(dayKey(h.startDate)))
    .sort((a, b) => a - b)[0];
  if (soon === undefined) return 'Nothing scheduled';
  if (soon <= 0) return 'One is on today';
  if (soon === 1) return 'The next is tomorrow';
  return `The next is in ${soon} days`;
};

export default function StudentHolidays() {
  const { data, meta, loading } = useFetch(getHolidays);
  const holidays = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const types = meta?.types || [];

  const [month, setMonth] = useState(MONTH_START);
  const [picked, setPicked] = useState(null);

  const groups = useMemo(() => {
    const out = { ongoing: [], upcoming: [], past: [] };
    holidays.forEach((h) => out[statusOf(h)].push(h));
    out.upcoming.sort((a, b) => dayKey(a.startDate).localeCompare(dayKey(b.startDate)));
    out.past.sort((a, b) => dayKey(b.startDate).localeCompare(dayKey(a.startDate)));
    return out;
  }, [holidays]);

  const coming = [...groups.ongoing, ...groups.upcoming];

  const byDay = useMemo(() => {
    const out = {};
    holidays.forEach((h) => daysOf(h).forEach((k) => { (out[k] ||= []).push(h); }));
    return out;
  }, [holidays]);

  const counts = useMemo(() => {
    const out = {};
    holidays.forEach((h) => { out[h.type] = (out[h.type] || 0) + 1; });
    return out;
  }, [holidays]);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page holpg holtch">
      <header className="holtch-top">
        <div className="holtch-title">
          <span className="holtch-title__icon tint-indigo"><Icon name="calendarDays" size={26} /></span>
          <div>
            <h1>Holidays</h1>
            <p>Every holiday your school has announced for you and your class.</p>
          </div>
        </div>
      </header>

      <div className="holtch-figs holtch-figs--wide">
        <Fig icon="calendar" tone="indigo" value={holidays.length} label="Total holidays"
          caption="This academic year" />
        <Fig icon="sunrise" tone="green" value={coming.length} label="Still to come"
          caption={nextLine(holidays)} />
        <Fig icon="checkSquare" tone="amber" value={groups.past.length} label="Already passed"
          caption={`${holidays.filter((h) => daysOf(h).some(inThisMonth)).length} this month`} />
      </div>

      <div className="holgrid">
        <div className="holtch-col">
          <MonthCalendar
            title={null}
            month={month} onMonth={setMonth} byDay={byDay} types={types} onPick={setPicked}
            onToday={() => setMonth(MONTH_START())}
            showAdjacent
            legend={(
              <p className="holcal__legend">
                <span><i className="is-mine" />Holiday</span>
                <span><i className="is-today" />Today</span>
                <span className="is-note">Tap a marked day to read it</span>
              </p>
            )} />

          {types.length ? (
            <section className="card holtch-types">
              <header className="holrail__head">
                <span className="holcal__icon tint-purple"><Icon name="layers" size={16} /></span>
                <h2>Holiday types</h2>
              </header>
              <ul>
                {types.map((t) => (
                  <li key={t}>
                    <i className={`tint-${tintFor(t, types)}`} />
                    <span>
                      <b>{t}</b>
                      <small>{counts[t] ? `${counts[t]} this year` : 'None this year'}</small>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="holside">
          <HolidayList title="Coming up" icon="clock" tone="green"
            holidays={coming} types={types} onPick={setPicked}
            empty="Nothing announced yet — enjoy the term." />

          <HolidayList title="Already been" icon="refresh" tone="amber"
            holidays={groups.past} types={types} onPick={setPicked}
            empty="No holidays have passed yet this year." />
        </div>
      </div>

      <HolidayDialog holiday={picked} types={types} onClose={() => setPicked(null)} />
    </div>
  );
}

/** One figure above the page. */
const Fig = ({ icon, tone, value, label, caption }) => (
  <div className="holtch-fig">
    <span className={`holtch-fig__icon tint-${tone}`}><Icon name={icon} size={19} /></span>
    <span>
      <b>{value}</b>
      <small>{label}</small>
      <em>{caption}</em>
    </span>
  </div>
);
