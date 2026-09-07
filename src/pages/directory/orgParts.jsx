/**
 * The pieces that draw the school's shape.
 *
 * Two structures come back from one call and they are not the same thing:
 *
 *   • `tree` — the REPORTING lines, built from the reporting manager on each
 *     profile. This is the real hierarchy, and a school that has never set one
 *     has a flat tree of everybody, which is honest rather than empty.
 *   • `byDepartment` — department → designation → people, which every school
 *     has whether or not it has reporting lines.
 *
 * Nothing here invents a level. The school node at the top of the department
 * chart is the school itself, not a person, and it is drawn differently for
 * that reason.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/ui/icons';
import { Avatar, STATUS_LABEL, STATUS_TONE } from './parts';
import { Badge } from '../../components/ui/index';

export const UNASSIGNED = 'Unassigned';

// ── Reading the tree ─────────────────────────────────────────────────────────

/** Everyone in the tree, flattened — the counts are taken from this. */
export const flatten = (nodes = []) => nodes.flatMap((n) => [n, ...flatten(n.children || [])]);

/**
 * How much of the school actually has a reporting line.
 *
 * A root with no children is nobody's report and has no manager, so it is not
 * "mapped"; a root WITH children is the top of a real chain and is. Anything
 * below a root has a manager by definition.
 */
export const coverageOf = (tree = []) => {
  const all = flatten(tree);
  const mapped = all.length - tree.filter((r) => !(r.children || []).length).length;
  return {
    total:  all.length,
    mapped: Math.max(0, mapped),
    pct:    all.length ? Math.round((Math.max(0, mapped) / all.length) * 100) : 0,
  };
};

/**
 * The tree, keeping only branches that match — with their ancestors.
 *
 * Dropping a manager because their own name does not match would orphan the
 * person who does match, so a node survives when it matches OR when anything
 * under it does.
 */
export const filterTree = (nodes = [], term) => {
  if (!term) return nodes;
  const keep = (n) => {
    const children = filterTree(n.children || [], term);
    const hit = `${n.name} ${n.designation || ''} ${n.department || ''}`.toLowerCase().includes(term);
    return hit || children.length ? { ...n, children } : null;
  };
  return nodes.map(keep).filter(Boolean);
};

/** department → designation → people, regrouped as designation → department. */
export const byDesignation = (byDepartment = []) => {
  const map = new Map();
  for (const dep of byDepartment) {
    for (const g of dep.designations) {
      if (!map.has(g.designation)) map.set(g.designation, { designation: g.designation, total: 0, departments: [] });
      const row = map.get(g.designation);
      row.total += g.members.length;
      row.departments.push({ department: dep.department, members: g.members });
    }
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
};

/** Distinct designations actually held, ignoring the unassigned bucket. */
export const heldDesignations = (byDepartment = []) => new Set(
  byDepartment.flatMap((d) => d.designations.map((g) => g.designation)).filter((n) => n !== UNASSIGNED),
).size;

// ── The reporting tree ───────────────────────────────────────────────────────

/**
 * One person in the reporting tree.
 *
 * Drawn with a rail down the left rather than as a box-and-line chart: a
 * reporting chain goes deep rather than wide, and a top-down chart of it
 * scrolls sideways off the screen by the third level.
 */
export function TreeNode({ node, base, depth = 0, last = true }) {
  const kids = node.children || [];
  return (
    <li className={`orgnode${last ? ' is-last' : ''}`}>
      <Link to={`${base}/employees/${node._id}`} className="orgnode__row">
        <Avatar name={node.name} src={node.profileImage} size={34} />
        <span className="orgnode__id">
          <span className="orgnode__name">{node.name}</span>
          <span className="orgnode__sub">
            {[node.designation, node.department].filter(Boolean).join(' · ') || 'No designation or department'}
          </span>
        </span>
        {kids.length > 0 && (
          <span className="orgnode__reports" title={`${kids.length} direct report${kids.length === 1 ? '' : 's'}`}>
            <Icon name="users" size={13} /> {kids.length}
          </span>
        )}
        <Badge variant={STATUS_TONE[node.employmentStatus] || 'muted'}>
          {STATUS_LABEL[node.employmentStatus] || node.employmentStatus || '—'}
        </Badge>
      </Link>
      {kids.length > 0 && (
        <ul className="orgtree__branch">
          {kids.map((c, i) => (
            <TreeNode key={c._id} node={c} base={base} depth={depth + 1} last={i === kids.length - 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export const ReportingTree = ({ tree, base }) => (
  <ul className="orgtree">
    {tree.map((n, i) => <TreeNode key={n._id} node={n} base={base} last={i === tree.length - 1} />)}
  </ul>
);

// ── The department chart ─────────────────────────────────────────────────────

/**
 * School → department → the people in it.
 *
 * Two levels deep and no more, which is the one shape a top-down chart holds
 * without scrolling sideways. The school box is the school, not a person.
 */
export const DepartmentChart = ({ school, departments, base, limit = 4 }) => (
  <div className="orgchart">
    <div className="orgchart__root">
      <span className="orgchart__rootmark"><Icon name="school" size={22} /></span>
      <div>
        <b>{school.name}</b>
        <small>{school.total} {school.total === 1 ? 'employee' : 'employees'}</small>
      </div>
    </div>

    {departments.length > 0 && (
      <div className="orgchart__row">
        {departments.map((d) => {
          const gap = d.department === UNASSIGNED;
          const people = d.designations.flatMap((g) => g.members.map((m) => ({ ...m, designation: g.designation })));
          const shown = people.slice(0, limit);
          const rest  = people.length - shown.length;
          return (
            <div className={`orgbranch${gap ? ' orgbranch--gap' : ''}`} key={d.department}>
              <div className="orgbranch__head">
                <span className={`orgbranch__mark tint-${gap ? 'amber' : 'indigo'}`}>
                  <Icon name={gap ? 'alert' : 'building'} size={18} />
                </span>
                <div className="orgbranch__id">
                  <b>{gap ? 'No department' : d.department}</b>
                  <small>{d.total} {d.total === 1 ? 'employee' : 'employees'}</small>
                </div>
              </div>
              <ul className="orgbranch__people">
                {shown.map((m) => (
                  <li key={m._id}>
                    <Link to={`${base}/employees/${m._id}`}>
                      <Avatar name={m.name} size={26} />
                      <span className="orgbranch__name">{m.name}</span>
                      <span className="orgbranch__role">
                        {m.designation === UNASSIGNED ? 'No designation' : m.designation}
                      </span>
                    </Link>
                  </li>
                ))}
                {rest > 0 && (
                  <li className="orgbranch__more">
                    <Link to={`${base}/employees?department=${encodeURIComponent(d.department)}`}>
                      +{rest} more <Icon name="chevronRight" size={13} />
                    </Link>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

// ── The breakdown rail ───────────────────────────────────────────────────────

/** One group in the rail, opened in place. */
const Group = ({ title, subtitle, total, gap, open, onToggle, to, children }) => (
  <section className={`orggroup${gap ? ' orggroup--gap' : ''}`}>
    <header>
      <span className={`orggroup__mark tint-${gap ? 'amber' : 'indigo'}`}>
        <Icon name={gap ? 'alert' : 'folder'} size={16} />
      </span>
      <div className="orggroup__id">
        <b>{title}</b>
        {subtitle ? <small>{subtitle}</small> : null}
      </div>
      <span className="orggroup__count">{total}</span>
    </header>
    <div className="orggroup__acts">
      <button type="button" onClick={onToggle}>{open ? 'Hide members' : 'View members'}</button>
      <Link to={to}>Open in directory <Icon name="arrowRight" size={13} /></Link>
    </div>
    {open && <div className="orggroup__body">{children}</div>}
  </section>
);

export const DepartmentBreakdown = ({ rows, base, open, onToggle }) => (
  <>
    {rows.map((d) => {
      const gap = d.department === UNASSIGNED;
      return (
        <Group
          key={d.department}
          title={gap ? 'No department' : d.department}
          subtitle={`${d.designations.length} designation${d.designations.length === 1 ? '' : 's'}`}
          total={d.total}
          gap={gap}
          open={open === d.department}
          onToggle={() => onToggle(d.department)}
          to={`${base}/employees?department=${encodeURIComponent(d.department)}`}
        >
          {d.designations.map((g) => (
            <div className="orgsub" key={g.designation}>
              <h5>{g.designation === UNASSIGNED ? 'No designation' : g.designation}</h5>
              <ul>
                {g.members.map((m) => (
                  <li key={m._id}><Link to={`${base}/employees/${m._id}`}>{m.name}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </Group>
      );
    })}
  </>
);

export const DesignationBreakdown = ({ rows, base, open, onToggle }) => (
  <>
    {rows.map((d) => {
      const gap = d.designation === UNASSIGNED;
      return (
        <Group
          key={d.designation}
          title={gap ? 'No designation' : d.designation}
          subtitle={`${d.departments.length} department${d.departments.length === 1 ? '' : 's'}`}
          total={d.total}
          gap={gap}
          open={open === d.designation}
          onToggle={() => onToggle(d.designation)}
          to={`${base}/employees?designation=${encodeURIComponent(d.designation)}`}
        >
          {d.departments.map((dep) => (
            <div className="orgsub" key={dep.department}>
              <h5>{dep.department === UNASSIGNED ? 'No department' : dep.department}</h5>
              <ul>
                {dep.members.map((m) => (
                  <li key={m._id}><Link to={`${base}/employees/${m._id}`}>{m.name}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </Group>
      );
    })}
  </>
);

/** What the marks on the chart mean. Only the ones actually drawn. */
export const Legend = () => (
  <ul className="orglegend">
    <li><span className="orglegend__dot tint-indigo" /> School and departments</li>
    <li><span className="orglegend__dot tint-amber" /> Nobody assigned yet</li>
    <li><span className="orglegend__dot orglegend__dot--person" /> An employee — click through to their profile</li>
  </ul>
);
