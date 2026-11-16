/**
 * The pieces that know what a department *is* in this module.
 *
 * There is no department master table. A department is the distinct value of
 * `TeacherProfile.department` across the staff — the server groups the employee
 * rows and hands back the buckets. Everything below follows from that:
 *
 *   • A department is CREATED by setting that field on somebody's record, and
 *     disappears when the last person leaves it. So there is no "Add" here that
 *     could do anything; what the page offers instead is the way in — the
 *     employees who have no department yet.
 *   • A department has no type of its own either. Whether it reads as teaching,
 *     support or mixed is derived from who is in it, and the card says which.
 *   • "Unassigned" is not a department. It is the gap, and it is drawn as one.
 *
 * Same file convention as employeeParts.jsx.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Avatar, Chips } from './parts';

export const UNASSIGNED = 'Unassigned';

/**
 * The two staff types, as a validated categorical pair.
 *
 * Teaching and non-teaching are identities, not magnitudes and not states, so
 * they take two hues rather than a light/dark ramp or the status tokens. Run
 * through the data-viz validator against this app's light surface: lightness
 * and chroma in band, CVD ΔE 22.1 (worst adjacent, deutan), normal-vision
 * ΔE 27.1, both ≥3:1 against the surface. Every use ships labels and counts
 * beside the bar, so colour is never the only channel.
 */
export const MIX = { teaching: '#4f46e5', nonTeaching: '#0d9488' };

/** What a department reads as, from who is actually in it. */
export const typeOf = (d) => {
  if (d.name === UNASSIGNED) return 'none';
  if (d.teaching && !d.nonTeaching) return 'teaching';
  if (d.nonTeaching && !d.teaching) return 'support';
  if (d.teaching && d.nonTeaching) return 'mixed';
  return 'empty';
};

export const TYPE = {
  teaching: { label: 'Teaching',     tone: 'indigo', icon: 'teacher' },
  support:  { label: 'Non-teaching', tone: 'teal',   icon: 'badge' },
  mixed:    { label: 'Mixed',        tone: 'purple', icon: 'users' },
  none:     { label: 'No department', tone: 'amber', icon: 'alert' },
  empty:    { label: 'No staff',     tone: 'amber',  icon: 'alert' },
};

/** School-wide figures, all derived from the same buckets the cards draw. */
export const summarise = (list = []) => {
  const real = list.filter((d) => d.name !== UNASSIGNED);
  const unassigned = list.find((d) => d.name === UNASSIGNED);
  return {
    departments: real.length,
    teaching:    real.filter((d) => typeOf(d) === 'teaching').length,
    support:     real.filter((d) => typeOf(d) === 'support').length,
    mixed:       real.filter((d) => typeOf(d) === 'mixed').length,
    employees:   list.reduce((n, d) => n + d.total, 0),
    placed:      real.reduce((n, d) => n + d.total, 0),
    unassigned:  unassigned?.total || 0,
    largest:     real.slice().sort((a, b) => b.total - a.total)[0] || null,
  };
};

// ── Marks ────────────────────────────────────────────────────────────────────

export const TypeChip = ({ type }) => {
  const t = TYPE[type] || TYPE.mixed;
  return <span className={`deptype deptype--${t.tone}`}><Icon name={t.icon} size={12} /> {t.label}</span>;
};

/**
 * Teaching against non-teaching, as one bar.
 *
 * A 2px gap between the segments rather than a hairline border: the surface
 * showing through is what separates two fills without adding a third colour.
 * Both segments are labelled with their own count underneath.
 */
export const StaffMix = ({ department }) => {
  const { teaching = 0, nonTeaching = 0 } = department;
  const total = teaching + nonTeaching;
  if (!total) return <p className="depmix__none">Nobody in this department yet.</p>;
  return (
    <div className="depmix">
      <div className="depmix__bar">
        {teaching > 0 && (
          <span style={{ flex: teaching, background: MIX.teaching }}
            title={`Teaching: ${teaching}`} />
        )}
        {nonTeaching > 0 && (
          <span style={{ flex: nonTeaching, background: MIX.nonTeaching }}
            title={`Non-teaching: ${nonTeaching}`} />
        )}
      </div>
      <ul className="depmix__key">
        <li><i style={{ background: MIX.teaching }} />Teaching <b>{teaching}</b></li>
        <li><i style={{ background: MIX.nonTeaching }} />Non-teaching <b>{nonTeaching}</b></li>
      </ul>
    </div>
  );
};

/** The people in it, opened in place — the card already names how many. */
export const Members = ({ members = [], base }) => (
  <div className="depmembers">
    {members.map((m) => (
      <Link key={m._id} to={`${base}/employees/${m._id}`} className="depmember">
        <Avatar name={m.name} size={26} />
        <span className="depmember__name">{m.name}</span>
        <span className="depmember__role">{m.designation || 'No designation'}</span>
        <Icon name="chevronRight" size={14} />
      </Link>
    ))}
  </div>
);

// ── The card ─────────────────────────────────────────────────────────────────

/**
 * One department.
 *
 * "Unassigned" comes through here too, drawn as the gap it is: the same figures,
 * but the action is to place those people rather than to browse them.
 */
export function DepartmentCard({ department: d, base, open, onToggle, onManage }) {
  const type = typeOf(d);
  const gap  = d.name === UNASSIGNED;
  const t    = TYPE[type];
  // "Unassigned" is a real filter value on the employee list — it means the
  // people with no department, which is exactly this bucket.
  // Everyone the card counts, deactivated accounts included.
  const to   = `${base}/employees?department=${encodeURIComponent(d.name)}&accountStatus=all`;

  return (
    <article className={`depcard${gap ? ' depcard--gap' : ''}`}>
      <header className="depcard__head">
        <span className={`depcard__mark tint-${t.tone}`}><Icon name={gap ? 'alert' : 'building'} size={19} /></span>
        <div className="depcard__id">
          <h3>{d.name}</h3>
          {d.total > 0 ? <TypeChip type={type} /> : <span className="badge badge-muted">Nobody in it yet</span>}
          {!gap && d.listed === false && (
            <span className="badge badge-warning" style={{ marginLeft: 6 }} title="Typed on a staff record, but not on the school's list of departments">Not on the list</span>
          )}
        </div>
        <span className="depcard__total" title={`${d.total} on the books`}>
          <b>{d.total}</b>
          <small>{d.total === 1 ? 'person' : 'people'}</small>
        </span>
      </header>

      <StaffMix department={d} />

      <dl className="depcard__facts">
        <div><dt>Active</dt><dd>{d.active}</dd></div>
        <div><dt>Designations</dt><dd>{d.designations.length || '—'}</dd></div>
        {!gap && <div><dt>Head</dt><dd>{d.head ? `${d.head.name}${d.head.inactive ? ' (deactivated)' : ''}` : '—'}</dd></div>}
      </dl>

      {d.designations.length > 0 && (
        <div className="depcard__chips"><Chips items={d.designations} max={3} empty="No designations" /></div>
      )}

      {gap && (
        <p className="depcard__note">
          <Icon name="alert" size={14} />
          These {d.total === 1 ? 'person has' : 'people have'} no department on their record. Tick them on
          the employee list and use &ldquo;Set department&rdquo;, or set one on a profile&rsquo;s Employment tab.
        </p>
      )}

      <footer className="depcard__foot">
        <Link to={to} className="btn btn-primary btn-sm">
          {gap ? 'Place them' : 'View members'} <Icon name="arrowRight" size={14} />
        </Link>
        {d.members.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onToggle(d.name)}>
            {open ? 'Hide list' : `List ${d.members.length}`}
          </button>
        )}
        {!gap && onManage && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onManage(d)}>
            <Icon name="pencil" size={13} /> Manage
          </button>
        )}
      </footer>

      {open && <Members members={d.members} base={base} />}
    </article>
  );
}

// ── Closing panel ────────────────────────────────────────────────────────────

/**
 * Where a department comes from.
 *
 * The page has no "Add department" because there is nothing to add to: the list
 * is grouped from the staff records themselves. This says so, and points at the
 * only thing that does change it.
 */
export const HowPanel = ({ base, unassigned }) => (
  <section className="depabout">
    <span className="depabout__mark"><Icon name="building" size={22} /></span>
    <div className="depabout__body">
      <h2>How departments work here</h2>
      <p>
        The school keeps a list of its departments: add one before anybody is in it, give it a head,
        rename it (everyone in it follows), or move its staff into another one — which is also how two
        spellings of the same department are merged. A name that was typed on a staff record but is
        not on the list shows as &ldquo;Not on the list&rdquo; until it is added or its people are moved.
      </p>
      <div className="depabout__acts">
        <Link to={`${base}/employees`} className="btn btn-secondary">
          Open the employee list <Icon name="arrowRight" size={15} />
        </Link>
        {unassigned > 0 && (
          <Link to={`${base}/employees?department=Unassigned&accountStatus=all`} className="btn btn-secondary">
            {unassigned} without a department <Icon name="arrowRight" size={15} />
          </Link>
        )}
      </div>
    </div>
  </section>
);
