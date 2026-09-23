/**
 * The breadcrumb. One of them, drawn by the layout, on every page.
 *
 * Every screen used to draw its own, and fifty-odd of them disagreed: some
 * started at "Dashboard", some at the module, some at nothing at all; some
 * separated steps with a "›" character and some with a chevron icon; the two
 * employee-directory screens could not agree whether the middle step was
 * called "Employee Directory" or "Employees". Two hundred and fifty-nine pages
 * had no crumb whatsoever.
 *
 * Now the trail is resolved from the navigation tree — the same data the
 * sidebar is built from — so it exists everywhere and always reads:
 *
 *     Home › Module › Section › Page
 *
 * A page that needs to name itself appends to it with `usePageCrumbs`; it
 * cannot change the steps before its own.
 */
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePageCrumbState } from '../../contexts/BreadcrumbContext';
import { trailFor } from './navTree';
import Icon from '../ui/icons';

export default function Breadcrumb() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { extra } = usePageCrumbState();

  const base = trailFor(pathname, user?.role);

  // What the tree worked out is the default; what the page says about itself
  // wins, because the page knows things the URL cannot.
  //
  //   · a step read off the URL gives way to the page's own words — the detail
  //     screen knows the row is "Rahul Sharma", the URL only knows "9c1";
  //   · the tree's name for THIS page gives way too, or the feedback module
  //     reads "Teacher Feedback › Overview › Dashboard": the tab's word and
  //     the page's word for one screen, one after the other.
  let tree = base;
  if (extra.length) {
    tree = tree.filter(s => !s.fromUrl);
    if (tree[tree.length - 1]?.to === pathname) tree = tree.slice(0, -1);
  }

  // Most kits still pass the module step they used to draw for themselves
  // ("Teacher Feedback", "Payroll") along with the page's name, and the tree
  // has already produced it — so a step repeating one on the trail is dropped.
  const seen = new Set(tree.map(s => s.label));
  const merged = [...tree];
  for (const s of extra) {
    if (seen.has(s.label)) continue;
    seen.add(s.label);
    merged.push(s);
  }

  // The step you are standing on never links anywhere, even when the page
  // handed it a path.
  const steps = merged.map((s, i, all) => (i === all.length - 1 ? { ...s, to: undefined } : s));

  // On the dashboard itself the trail would be a single word naming the page
  // you are already looking at.
  if (steps.length < 2) return null;

  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      <ol>
        {steps.map((s, i) => (
          <li key={`${s.label}-${i}`}>
            {i > 0 && <Icon name="chevronRight" size={13} aria-hidden />}
            {s.to
              ? <Link to={s.to}>{i === 0 ? <Icon name="home" size={14} aria-hidden /> : null}{s.label}</Link>
              : <span aria-current={i === steps.length - 1 ? 'page' : undefined}>{s.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
