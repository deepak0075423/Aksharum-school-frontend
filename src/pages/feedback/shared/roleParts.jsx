/**
 * Pieces the teacher, student and parent feedback screens share.
 *
 * They sit on the same kit as the admin screens (pages/feedback/admin/fbUI.jsx)
 * so the whole module reads as one design; what lives here is only what these
 * three audiences need and the admin does not — a countdown a student can act
 * on, a lock that explains itself to the teacher it hides from, and the list of
 * slices with the reason each one is or is not shown.
 */
import React from 'react';
import Icon from '../../../components/ui/icons';
import { Bar, Dot, Rating, Tag, daysLeft } from '../admin/fbUI';

/** "Closes in 4 days" / "Closes today" / "Closed" — with urgency as a tone. */
export function closesIn(endDate) {
  const left = daysLeft(endDate);
  if (left == null) return { text: '', tone: 'slate', left };
  if (left < 0) return { text: 'Closed', tone: 'slate', left };
  if (left === 0) return { text: 'Closes today', tone: 'red', left };
  if (left === 1) return { text: 'Closes tomorrow', tone: 'red', left };
  return { text: `Closes in ${left} days`, tone: left <= 3 ? 'amber' : 'blue', left };
}

export const Countdown = ({ endDate }) => {
  const c = closesIn(endDate);
  if (!c.text) return null;
  return <Tag tone={c.tone} icon="clock">{c.text}</Tag>;
};

/** The campaign a results screen is about. */
export const CampaignSelect = ({ campaigns, value, onChange }) => (
  <select className="fbsel fbsel--hero fbsel--campaign" value={value || ''} aria-label="Campaign"
    onChange={(e) => onChange(e.target.value)}>
    {(campaigns || []).map((c) => (
      <option key={c._id} value={c._id}>
        {c.name}{c.term && !c.name.includes(c.term) ? ` · ${c.term}` : ''}{c.status === 'active' ? ' (collecting)' : ''}
      </option>
    ))}
  </select>
);

/**
 * The whole results screen while the floor has not been reached.
 *
 * Said to the teacher it is hiding from, so it explains itself: how far off the
 * floor is, and that nothing is being kept from them that exists to be seen.
 */
export function LockedResults({ responses, minimum, assigned, campaignOpen }) {
  const need = Math.max(0, minimum - responses);
  const pct = minimum ? Math.min(100, Math.round((responses / minimum) * 100)) : 0;
  return (
    <section className="fblockhero">
      <span className="fblockhero__icon"><Icon name="key" size={30} /></span>
      <div className="fblockhero__body">
        <h2>{responses === 0 ? 'No responses yet' : `${need} more response${need === 1 ? '' : 's'} before your results appear`}</h2>
        <p>
          Results stay hidden until at least <b>{minimum}</b> students have answered, so no single student’s
          answer can ever be picked out — not by you, and not by anyone else in the school.
        </p>
        <div className="fblockhero__meter">
          <span className="fblockhero__track" aria-hidden><span style={{ width: `${pct}%` }} /></span>
          <b>{responses} of {minimum}</b>
        </div>
        <small>
          {assigned ? `${assigned} student${assigned === 1 ? '' : 's'} were asked about you. ` : ''}
          {campaignOpen ? 'The campaign is still collecting.' : 'This campaign has closed with too few responses to show.'}
        </small>
      </div>
    </section>
  );
}

/** Why one figure is not shown. */
export const Withheld = ({ reason, responses, minimum }) => (
  <span className="fblocked" title={reason === 'protect'
    ? 'This group has enough responses, but showing it would let a smaller hidden group be worked out by subtraction.'
    : `${responses} of ${minimum} responses needed.`}>
    <Icon name="key" size={12} />
    {reason === 'protect' ? 'Hidden to protect others'
      : reason === 'none' || responses === 0 ? 'No responses'
      : `${responses} of ${minimum}`}
  </span>
);

/** A subject or section slice: responses, rate, and the rating or its reason. */
export const SliceList = ({ slices, minimum, empty }) => {
  if (!slices?.length) return <p className="fbmuted">{empty}</p>;
  return (
    <ul className="fbslices">
      {slices.map((s) => (
        <li key={s._id}>
          <span className="fbslices__name">
            <b>{s.name}</b>
            <small>{s.responses} of {s.assigned} answered</small>
          </span>
          <Bar value={s.responseRate} width={90} />
          <span className="fbslices__val">
            {s.locked
              ? <Withheld reason={s.protectsOthers ? 'protect' : 'floor'} responses={s.responses} minimum={minimum} />
              : <Rating value={s.rating} sub={undefined} />}
          </span>
        </li>
      ))}
    </ul>
  );
};

const STATE = {
  todo:     { word: 'To do',    tone: 'amber' },
  done:     { word: 'Done',     tone: 'green' },
  missed:   { word: 'Missed',   tone: 'pink' },
  upcoming: { word: 'Upcoming', tone: 'blue' },
};

export const StatePill = ({ state }) => {
  const s = STATE[state] || STATE.todo;
  return <Dot tone={s.tone}>{s.word}</Dot>;
};

/** Done / missed / to-do as one segmented bar, with its numbers beside it. */
export const ProgressSplit = ({ done = 0, missed = 0, todo = 0, upcoming = 0 }) => {
  const total = done + missed + todo + upcoming || 1;
  return (
    <div className="fbsplit">
      <span className="fbsplit__bar" aria-hidden>
        <span className="is-done" style={{ width: `${(done / total) * 100}%` }} />
        <span className="is-missed" style={{ width: `${(missed / total) * 100}%` }} />
        <span className="is-todo" style={{ width: `${(todo / total) * 100}%` }} />
      </span>
      <span className="fbsplit__key">
        <span><i className="is-done" />{done} done</span>
        {todo ? <span><i className="is-todo" />{todo} to do</span> : null}
        {missed ? <span><i className="is-missed" />{missed} missed</span> : null}
        {upcoming ? <span><i className="is-upcoming" />{upcoming} upcoming</span> : null}
      </span>
    </div>
  );
};
