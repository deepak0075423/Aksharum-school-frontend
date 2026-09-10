/**
 * Library → Policy.
 *
 * What the rules currently say, read-only. Four figures across the top, the
 * sections down the left, and every setting spelled out with the sentence that
 * explains it — changing them is a separate screen, because a page that is both
 * a statement of the rules and a form for them is neither.
 *
 * Two panels are not settings and are the reason this page is worth reading:
 *
 *  • **Member types** — the same rules apply to students and teachers except in
 *    one place, and a librarian asked "do teachers get fined?" should not have
 *    to infer the answer from a checkbox four sections up.
 *
 *  • **Policy history** — who changed what, and what it was before. The policy
 *    row only ever knew who touched it last; the audit log has held the rest
 *    since the module shipped and nothing ever showed it.
 *
 * Serves school admins at /admin/library/policy and teachers with library
 * administration at /teacher/manage-library/policy — both may change the
 * policy, so both get the Edit buttons and the history.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getPolicy, getPolicyHistory } from '../../../api/library.api';
import { Alert, Badge, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { quoteOfTheDay } from './dashParts';
import {
  LastUpdated, Panel, PolicyHero, PolicyTile, SECTIONS, SectionRail, SettingRow,
  fmtWhen, money, valueOf, fieldOf,
} from './policyParts';

const EXTRAS = [
  { id: 'members', title: 'Member Types', icon: 'users',    tone: 'teal' },
  { id: 'history', title: 'Policy History', icon: 'activity', tone: 'pink' },
];

export default function LibraryPolicy() {
  const { pathname } = useLocation();
  const editPath = `${pathname.replace(/\/$/, '')}/edit`;

  const { data: policy, meta, loading, error } = useFetch(getPolicy);
  const updatedBy = meta?.updatedBy;
  const quote = useMemo(() => quoteOfTheDay(4), []);

  const [active, setActive] = useState('limits');
  const panels = useRef({});
  const jumpTo = (id) => {
    setActive(id);
    panels.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  // Without this the page rendered its whole table of dashes on a failed fetch,
  // which read as "the policy is empty" rather than "you were refused" — and a
  // refused fetch was exactly what a librarian teacher used to get here.
  if (error || !policy) {
    return (
      <div className="page libdpg libpolpg">
        <PolicyHero title="Library Policy" tagline="Fair · Clear · Consistent"
          subtitle="Loan, fine and borrowing rules." quote={quote} />
        <Alert variant="danger">
          {error || 'The library policy could not be loaded.'}
          {' '}Administrative access to the Library module is required to view or change it.
        </Alert>
      </div>
    );
  }

  const rate = Number(policy.finePerDay || 0);
  const editLink = (id) => (
    <Link className="btn btn-secondary btn-sm" to={`${editPath}#${id}`}>
      <Icon name="pencil" size={14} /> Edit
    </Link>
  );

  return (
    <div className="page libdpg libpolpg">
      <PolicyHero
        title="Library Policy"
        tagline="Fair · Clear · Consistent"
        subtitle="The rules the counter enforces — borrowing, fines and reservations."
        quote={quote} />

      <div className="libd-tiles libpol-tiles">
        <PolicyTile icon="book" tone="indigo"
          value={policy.maxBooksPerUser ?? '—'} label="Borrowing limit" caption="Books per member" />
        <PolicyTile icon="calendarDays" tone="green"
          value={valueOf(fieldOf('issueDurationDays'), policy.issueDurationDays)}
          label="Loan period" caption="Standard duration" />
        <PolicyTile icon="banknote" tone="amber"
          value={money(rate)} label="Fine per day" caption="On a late return" />
        <PolicyTile icon="clock" tone="purple"
          value={valueOf(fieldOf('gracePeriodDays'), policy.gracePeriodDays)}
          label="Grace period" caption="Before a fine applies" />
      </div>

      <div className="libpol-body">
        <SectionRail title="Policy Settings" items={[...SECTIONS, ...EXTRAS]} active={active} onPick={jumpTo}>
          <LastUpdated at={policy.updatedAt} by={updatedBy} className="libpol-stamp--rail" />
        </SectionRail>

        <div className="libpol-main">
          {SECTIONS.map((s) => (
            <Panel key={s.id} id={s.id} innerRef={(el) => { panels.current[s.id] = el; }}
              icon={s.icon} tone={s.tone} title={s.title} blurb={s.blurb} action={editLink(s.id)}>
              <div className="libpol-rows">
                {s.fields.map((f) => <SettingRow key={f.key} field={f} policy={policy} />)}
              </div>

              {/* The two charges that are stored as a multiplier and spent as
                  money. Showing only the multiplier is what made "30" read as
                  thirty rupees. */}
              {s.id === 'fines' && (
                <p className="libpol-note">
                  At {money(rate)} a day, a lost book costs <strong>{money((policy.lostBookFineDays ?? 0) * rate)}</strong>
                  {' '}and a damaged one <strong>{money((policy.damagedBookFineDays ?? 0) * rate)}</strong>,
                  unless the librarian enters the book’s actual price at the return desk.
                </p>
              )}
            </Panel>
          ))}

          <MemberTypes policy={policy} innerRef={(el) => { panels.current.members = el; }} />
          <History innerRef={(el) => { panels.current.history = el; }} />
        </div>
      </div>
    </div>
  );
}

/**
 * The policy as each kind of member meets it.
 *
 * Everything here is read off the settings above — there is no per-role
 * configuration in the module, and inventing a table of it would promise
 * knobs that do not exist. What it answers is the question the settings make
 * you assemble yourself: the rules are the same for everyone, except that
 * teachers can be exempt from late fines.
 */
const MemberTypes = ({ policy, innerRef }) => {
  const days = (n) => `${n ?? '—'} day${Number(n) === 1 ? '' : 's'}`;
  const rows = [
    ['Books at a time',   policy.maxBooksPerUser, policy.maxBooksPerUser],
    ['Loan period',       days(policy.issueDurationDays), days(policy.issueDurationDays)],
    ['Renewals',          policy.maxRenewals, policy.maxRenewals],
    ['Reservations',      policy.maxReservationsPerUser, policy.maxReservationsPerUser],
    ['Late fines',        'Charged', policy.teacherFinesEnabled ? 'Charged' : 'Not charged'],
    ['Lost or damaged',   'Charged', 'Charged'],
  ];
  return (
    <Panel id="members" innerRef={innerRef} icon="users" tone="teal" title="Member Types"
      blurb="How the same rules land on a student and on a teacher.">
      <div className="table-wrap">
        <table className="table libpol-matrix">
          <thead>
            <tr>
              <th>Rule</th>
              <th>Students</th>
              <th>Teachers</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, student, teacher]) => (
              <tr key={label}>
                <td>{label}</td>
                <td>{student}</td>
                <td className={student !== teacher ? 'libpol-matrix__diff' : undefined}>{teacher}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="libpol-note">
        {policy.teacherFinesEnabled
          ? 'Teachers are charged late fines on the same terms as students.'
          : 'Teacher loans never accrue late fines. A lost or damaged book is still charged — that is compensation for the book, not a penalty for lateness.'}
      </p>
    </Panel>
  );
};

/** Who changed what, and what it was before. */
const History = ({ innerRef }) => {
  const { data, loading, error } = useFetch(getPolicyHistory);
  const entries = Array.isArray(data) ? data : [];

  return (
    <Panel id="history" innerRef={innerRef} icon="activity" tone="pink" title="Policy History"
      blurb="Every change to these rules, most recent first.">
      {loading ? (
        <div className="libpol-empty"><Spinner /></div>
      ) : error ? (
        <div className="libpol-alert"><Alert variant="danger">{error}</Alert></div>
      ) : !entries.length ? (
        <div className="libpol-empty">
          <span className="libpol-empty__icon tint-pink"><Icon name="activity" size={20} /></span>
          <b>No changes recorded</b>
          <span>The policy is still as the school started with, or was last changed before this log existed.</span>
        </div>
      ) : (
        <ol className="libpol-log">
          {entries.map((e) => (
            <li key={e._id}>
              <span className="libpol-log__dot" aria-hidden />
              <div className="libpol-log__head">
                <b>{e.by || 'Somebody'}</b>
                {e.role ? <Badge variant="info">{e.role.replace(/_/g, ' ')}</Badge> : null}
                <time>{fmtWhen(e.at)}</time>
              </div>
              {e.changes.length ? (
                <ul className="libpol-log__changes">
                  {e.changes.map((c) => {
                    const field = fieldOf(c.field);
                    return (
                      <li key={c.field}>
                        <span>{field?.label || c.label}</span>
                        {/* An entry written before both halves were recorded
                            knows what a setting became but not what it was. */}
                        <em>{c.from === null || c.from === undefined
                          ? 'not recorded'
                          : (field ? valueOf(field, c.from) : String(c.from))}</em>
                        <Icon name="arrowRight" size={12} />
                        <strong>{field ? valueOf(field, c.to) : String(c.to)}</strong>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="libpol-log__none">Nothing recorded for this change.</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
};
