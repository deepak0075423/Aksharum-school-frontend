/**
 * Parent → Holidays.
 *
 * A parent can have more than one child, and their holidays are not the same:
 * a school-wide day closes the school for both, but a class day closes one
 * child's class and not the other's. So this page is told per child — a switch
 * across the top picks whose holidays are on screen, and with "Both children"
 * showing, any day that is not for all of them says whose it is.
 *
 * That distinction only exists because the endpoint now returns it. It used to
 * read the *first* child only (`StudentProfile.findOne`), so a second child's
 * class holidays were invisible and nothing said a second child existed.
 *
 * Shares the admin screen's parts, so a type is named, coloured and dated the
 * same way here as everywhere else.
 */
import React, { useMemo, useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getHolidays } from '../../api/parent.api';
import { Alert, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  HolidayDialog, HolidayList, MonthCalendar,
  dayKey, daysOf, daysUntil, statusOf, tintFor, today,
} from '../admin/holidayParts';

const MONTH_START = () => { const n = new Date(); return [n.getFullYear(), n.getMonth()]; };
const inThisMonth = (key) => key.slice(0, 7) === today().slice(0, 7);

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

export default function ParentHolidays() {
  const { data, meta, loading } = useFetch(getHolidays);
  const all      = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const children = useMemo(() => meta?.children || [], [meta]);
  const types    = meta?.types || [];

  // '' is every child at once. With one child there is nothing to switch
  // between, so the switch does not appear at all.
  const [who, setWho] = useState('');
  const [month, setMonth] = useState(MONTH_START);
  const [picked, setPicked] = useState(null);

  const nameOf = useMemo(
    () => Object.fromEntries(children.map((c) => [c._id, c.name])),
    [children],
  );

  const holidays = useMemo(
    () => (who ? all.filter((h) => (h.forChildren || []).includes(who)) : all),
    [all, who],
  );

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

  /**
   * Whose day this is — said only when it is not everybody's, and only while
   * more than one child is on screen. Labelling every school holiday with both
   * names would bury the one line that matters.
   */
  const whoseDay = (h) => {
    if (who || children.length < 2) return null;
    const on = h.forChildren || [];
    if (on.length >= children.length) return null;
    return `Only ${on.map((id) => nameOf[id]).filter(Boolean).join(' and ') || 'one child'}`;
  };

  const appliesTo = (h) => {
    const on = h.forChildren || [];
    if (!children.length) return null;
    if (on.length >= children.length) return 'Both children';
    return on.map((id) => nameOf[id]).filter(Boolean).join(', ') || null;
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const forChild = who ? children.find((c) => c._id === who) : null;

  return (
    <div className="page holpg holtch">
      <header className="holtch-top">
        <div className="holtch-title">
          <span className="holtch-title__icon tint-indigo"><Icon name="calendarDays" size={26} /></span>
          <div>
            <h1>Holidays</h1>
            <p>
              {forChild
                ? `The days ${forChild.name}'s school and class are closed.`
                : children.length > 1
                  ? 'The days school is closed — for each of your children.'
                  : 'The days your child’s school and class are closed.'}
            </p>
          </div>
        </div>
      </header>

      <div className="holtch-figs holtch-figs--wide">
        <Fig icon="calendar" tone="indigo" value={holidays.length} label="Total holidays"
          caption={forChild ? `For ${forChild.name}` : 'This academic year'} />
        <Fig icon="sunrise" tone="green" value={coming.length} label="Still to come"
          caption={nextLine(holidays)} />
        <Fig icon="checkSquare" tone="amber" value={groups.past.length} label="Already passed"
          caption={`${holidays.filter((h) => daysOf(h).some(inThisMonth)).length} this month`} />
      </div>

      {/* One child needs no switch; two or more do, because their holidays
          genuinely differ. */}
      {children.length > 1 && (
        <nav className="holtch-tabs holpar-who" role="tablist" aria-label="Whose holidays">
          <button type="button" role="tab" aria-selected={!who}
            className={!who ? 'is-on' : ''} onClick={() => setWho('')}>
            Both children
            <b>{all.length}</b>
          </button>
          {children.map((c) => (
            <button key={c._id} type="button" role="tab" aria-selected={who === c._id}
              className={who === c._id ? 'is-on' : ''} onClick={() => setWho(c._id)}>
              {c.name}
              {c.className ? <em>{c.className}</em> : null}
              <b>{all.filter((h) => (h.forChildren || []).includes(c._id)).length}</b>
            </button>
          ))}
        </nav>
      )}

      {children.length === 1 && children[0].className ? (
        <p className="holpar-note">
          <Icon name="user" size={14} />
          {children[0].name} · {children[0].className}
        </p>
      ) : null}

      {!children.length && (
        <Alert variant="info">
          No child is linked to this account yet, so only school-wide holidays are shown.
          Ask the school office to link your children.
        </Alert>
      )}

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
                <span className="is-note">
                  {forChild ? `Showing ${forChild.name}` : 'Showing every child'}
                </span>
              </p>
            )} />

          {types.length ? (
            <section className="card holtch-types">
              <header className="holrail__head">
                <span className="holcal__icon tint-purple"><Icon name="layers" size={16} /></span>
                <h2>Holiday types</h2>
              </header>
              <ul>
                {types.map((t) => {
                  const n = holidays.filter((h) => h.type === t).length;
                  return (
                    <li key={t}>
                      <i className={`tint-${tintFor(t, types)}`} />
                      <span>
                        <b>{t}</b>
                        <small>{n ? `${n} this year` : 'None this year'}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="holside">
          <HolidayList title="Coming up" icon="clock" tone="green"
            holidays={coming} types={types} onPick={setPicked} metaOf={whoseDay}
            empty={forChild ? `Nothing coming up for ${forChild.name}.` : 'Nothing announced yet.'} />

          <HolidayList title="Already been" icon="refresh" tone="amber"
            holidays={groups.past} types={types} onPick={setPicked} metaOf={whoseDay}
            empty="No holidays have passed yet this year." />
        </div>
      </div>

      <HolidayDialog holiday={picked} types={types} onClose={() => setPicked(null)}
        appliesTo={picked ? appliesTo(picked) : null} />
    </div>
  );
}

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
