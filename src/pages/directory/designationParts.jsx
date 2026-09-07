/**
 * The pieces that know what a designation *is* in this module.
 *
 * Two records describe a designation and this page is where they meet:
 *
 *   • The Designation table — the master list an admin keeps, carrying the
 *     description, the active flag and the module permissions it grants.
 *   • TeacherProfile.designation — a NAME on each employee, which is what
 *     actually decides who holds it. The name is the join key between them.
 *
 * So a designation can exist with nobody in it (defined but unused), and a
 * profile can name one that was never defined (which silently falls back to
 * legacy permissions). Both are worth seeing, and `merge()` below produces
 * them; nothing here invents a record that is not in one of the two sources.
 *
 * Editing any of it stays on Admin → Designations, which is the single place
 * a designation and its access are changed.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Avatar } from './parts';

export const UNASSIGNED = 'Unassigned';

/**
 * The master list and the headcounts, joined by name.
 *
 * `defined` is the Designation table (admin only — a teacher's view has none,
 * and then every row is simply "held by N people"). `held` is the directory's
 * grouping of the staff. The result keeps three states apart:
 *
 *   held + defined → normal
 *   defined, nobody holding it → `unused`
 *   held but never defined → `undefined_`, the drift case
 */
export const merge = (defined = [], held = []) => {
  const byName = new Map();

  for (const d of defined) {
    byName.set(d.name, {
      name: d.name,
      description: d.description || '',
      isActive: d.isActive !== false,
      createdAt: d.createdAt || null,
      permissions: d.permissions || {},
      total: 0, active: 0, members: [],
      state: 'unused',
      defined: true,
    });
  }

  for (const h of held) {
    if (h.name === UNASSIGNED) continue;      // the gap is carried separately
    const row = byName.get(h.name);
    if (row) {
      Object.assign(row, { total: h.total, active: h.active, members: h.members, state: 'normal' });
    } else {
      byName.set(h.name, {
        name: h.name, description: '', isActive: true, createdAt: null, permissions: null,
        total: h.total, active: h.active, members: h.members,
        state: 'undefined_', defined: false,
      });
    }
  }

  return [...byName.values()];
};

export const gapOf = (held = []) => held.find((h) => h.name === UNASSIGNED) || null;

/** How much of the school a designation reaches, from its permission map. */
export const accessOf = (permissions, modules = []) => {
  if (!permissions) return null;
  const keys = modules.length ? modules.map((m) => m.key) : Object.keys(permissions);
  let admin = 0;
  let user  = 0;
  for (const k of keys) {
    const level = permissions[k] || 'none';
    if (level === 'admin') admin += 1;
    else if (level === 'user') user += 1;
  }
  return { admin, user, reach: admin + user, total: keys.length };
};

export const summarise = (rows = [], gap) => ({
  designations: rows.length,
  defined:      rows.filter((r) => r.defined).length,
  // A deactivated designation nobody holds is counted as deactivated, not as
  // unused — otherwise the tile and the chip on the row disagree about the same
  // record, and "nobody holds it" would read as work to do when it is not.
  unused:       rows.filter((r) => r.state === 'unused' && r.isActive).length,
  inactive:     rows.filter((r) => r.defined && !r.isActive).length,
  undefined_:   rows.filter((r) => r.state === 'undefined_').length,
  employees:    rows.reduce((n, r) => n + r.total, 0) + (gap?.total || 0),
  active:       rows.reduce((n, r) => n + r.active, 0) + (gap?.active || 0),
  unassigned:   gap?.total || 0,
});

// ── Marks ────────────────────────────────────────────────────────────────────

/** A mark drawn from the name, so a table of designations is still scannable. */
const TONES = ['indigo', 'blue', 'green', 'amber', 'purple', 'pink', 'teal', 'orange'];
const ICONS = ['badge', 'teacher', 'bookOpen', 'trophy', 'idCard', 'star', 'clipboard', 'key'];
export const lookOf = (name = '') => {
  let n = 0;
  for (let i = 0; i < name.length; i += 1) n = (n + name.charCodeAt(i)) % 997;
  return { tone: TONES[n % TONES.length], icon: ICONS[n % ICONS.length] };
};

export const DesignationMark = ({ name, size = 36 }) => {
  const look = lookOf(name);
  return (
    <span className={`dsgmark tint-${look.tone}`} style={{ width: size, height: size }}>
      <Icon name={look.icon} size={size * 0.5} />
    </span>
  );
};

/**
 * Whether the two records agree.
 *
 * "Not in the designation list" is the one worth reading: those employees hold
 * a name nobody configured, so their module access falls back to the legacy
 * defaults rather than to anything an admin chose.
 */
export const StateChip = ({ row }) => {
  if (row.state === 'undefined_') {
    return (
      <span className="dsgchip dsgchip--warn" title="No Designation record carries this name, so anyone holding it falls back to the legacy default access.">
        <Icon name="alert" size={12} /> Not configured
      </span>
    );
  }
  if (!row.isActive) {
    return (
      <span className="dsgchip dsgchip--off" title="Deactivated: everyone holding it is denied every module until it is activated.">
        <Icon name="power" size={12} /> Inactive
      </span>
    );
  }
  if (row.state === 'unused') {
    return <span className="dsgchip dsgchip--idle"><Icon name="userPlus" size={12} /> Nobody holds it</span>;
  }
  return <span className="dsgchip dsgchip--ok"><Icon name="checkCircle" size={12} /> Active</span>;
};

/** Module reach, as a sentence rather than a bar — it is a count, not a ratio. */
export const AccessSummary = ({ access }) => {
  if (!access) return <span className="ed-none">Not configured</span>;
  if (!access.reach) return <span className="dsgaccess dsgaccess--none">No modules</span>;
  return (
    <span className="dsgaccess" title={`${access.user} at normal access, ${access.admin} administrative`}>
      <b>{access.reach}</b> of {access.total} modules
      {access.admin > 0 && <em>{access.admin} admin</em>}
    </span>
  );
};

/** The people holding it — faces first, the rest as a count. */
export const Faces = ({ members = [], base, max = 3 }) => {
  if (!members.length) return <span className="ed-none">—</span>;
  const shown = members.slice(0, max);
  const rest  = members.length - shown.length;
  return (
    <span className="dsgfaces" title={members.map((m) => m.name).join(', ')}>
      {shown.map((m) => (
        <Link key={m._id} to={`${base}/employees/${m._id}`} className="dsgfaces__one" title={m.name}>
          <Avatar name={m.name} size={26} />
        </Link>
      ))}
      {rest > 0 && <span className="dsgfaces__more">+{rest}</span>}
    </span>
  );
};

export const fmtDay = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  : '—');

// ── The card ─────────────────────────────────────────────────────────────────

export function DesignationCard({ row, access, base, onMembers, open }) {
  const to = `${base}/employees?designation=${encodeURIComponent(row.name)}`;
  return (
    <article className={`dsgcard${row.state === 'undefined_' ? ' dsgcard--warn' : ''}${!row.isActive ? ' dsgcard--off' : ''}`}>
      <header className="dsgcard__head">
        <DesignationMark name={row.name} size={40} />
        <div className="dsgcard__id">
          <h3>{row.name}</h3>
          <p>{row.description || (row.defined ? 'No description set' : 'Held by staff, but never defined')}</p>
        </div>
        <StateChip row={row} />
      </header>

      <dl className="dsgcard__facts">
        <div><dt>Employees</dt><dd>{row.total}</dd></div>
        <div><dt>Active</dt><dd>{row.active}</dd></div>
        <div><dt>Module access</dt><dd className="dsgcard__access"><AccessSummary access={access} /></dd></div>
      </dl>

      {row.members.length > 0 && (
        <div className="dsgcard__faces"><Faces members={row.members} base={base} max={5} /></div>
      )}

      <footer className="dsgcard__foot">
        {row.total > 0
          ? <Link to={to} className="btn btn-primary btn-sm">View members <Icon name="arrowRight" size={14} /></Link>
          : <span className="dsgcard__idle">Nobody holds this yet</span>}
        {row.members.length > 0 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onMembers(row.name)}>
            {open ? 'Hide list' : `List ${row.members.length}`}
          </button>
        )}
      </footer>

      {open && (
        <div className="dsgmembers">
          {row.members.map((m) => (
            <Link key={m._id} to={`${base}/employees/${m._id}`} className="dsgmember">
              <Avatar name={m.name} size={26} />
              <span className="dsgmember__name">{m.name}</span>
              <span className="dsgmember__sub">{m.department || 'No department'}</span>
              <Icon name="chevronRight" size={14} />
            </Link>
          ))}
        </div>
      )}
    </article>
  );
}

// ── Closing panel ────────────────────────────────────────────────────────────

/**
 * Where a designation is actually edited.
 *
 * This screen is the people view; the access it grants is configured in one
 * place only, and saying so is what stops the two drifting.
 */
export const AboutPanel = ({ isAdmin, undefinedCount, unassigned, base }) => (
  <section className="dsgabout">
    <span className="dsgabout__mark"><Icon name="badge" size={22} /></span>
    <div className="dsgabout__body">
      <h2>Designations and what they open</h2>
      <p>
        A designation is two things joined by its name: the record an admin keeps — its description,
        whether it is active, and the modules it grants — and the name written on each employee&rsquo;s
        profile, which is what actually puts them in it.
        {undefinedCount > 0 && (
          <> {undefinedCount} {undefinedCount === 1 ? 'name is' : 'names are'} held by staff but not in
            the designation list, so those people fall back to the default access rather than anything
            configured.</>
        )}
      </p>
      <div className="dsgabout__acts">
        {isAdmin && (
          <Link to="/admin/designations" className="btn btn-secondary">
            Manage designations &amp; access <Icon name="arrowRight" size={15} />
          </Link>
        )}
        {unassigned > 0 && (
          <Link to={`${base}/employees?designation=Unassigned`} className="btn btn-secondary">
            {unassigned} without a designation <Icon name="arrowRight" size={15} />
          </Link>
        )}
      </div>
    </div>
  </section>
);
