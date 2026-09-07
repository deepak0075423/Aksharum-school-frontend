/**
 * Admin → Reports.
 *
 * An index, not a report. Every card is a real screen inside the module that
 * owns it, so what opens is always the live thing rather than a copy of it —
 * this page exists because "where do I see what we collected this term" should
 * not require remembering that it lives three clicks inside Fees.
 *
 * Built on the same frame as the academic lists (listParts.jsx): a hero, four
 * headcount tiles, a card holding the category filter and the groups, then the
 * closing panels.
 */
import React, { useMemo, useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getDashboard } from '../../api/admin.api';
import { useModules } from '../../contexts/ModulesContext';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Badge, Spinner } from '../../components/ui/index';
import Icon, { TrophyScene } from '../../components/ui/icons';
import { Crumbs, ListHero, ListStats, HelpPanel, PageFoot } from './listParts';
import { HeadCount, MissingPanel, REPORTS, ReportGroup, catalogue } from './reportParts';

export default function Reports() {
  const { user: me } = useAuth();
  // The shared module map — effective access, already fetched once per session.
  // `ready` matters: isEnabled fails open while it loads, so asking too early
  // lists reports the school cannot open.
  const { isEnabled, ready } = useModules();
  const { data, loading, error } = useFetch(getDashboard);

  const [tab, setTab] = useState('all');

  const groups = useMemo(() => (ready ? catalogue(isEnabled) : []), [ready, isEnabled]);
  const total  = groups.reduce((n, g) => n + g.reports.length, 0);
  const hidden = REPORTS.length - total;
  const shown  = tab === 'all' ? groups : groups.filter((g) => g.key === tab);

  const growth = data?.growth || {};
  const year   = data?.academicYear;

  if (loading || !ready) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page listpg">
      <Crumbs here="Reports" />

      <ListHero
        title="Reports"
        subtitle="Everything the school records, gathered into one place — each one opens the live screen inside the module that owns it."
        quote="A number is only worth reading if you know what it counted. Every report here is the module's own, not a copy of it."
        scene={TrophyScene}
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <ListStats>
        <HeadCount icon="teacher" tone="indigo" value={data?.teachers} label="Teachers"
          added={growth.teachers} caption="On the staff roll" />
        <HeadCount icon="student" tone="green" value={data?.students} label="Students"
          added={growth.students} caption="Admitted to the school" />
        <HeadCount icon="users" tone="amber" value={data?.parents} label="Parents"
          added={growth.parents} caption="With an account" />
        <HeadCount icon="layers" tone="blue" value={data?.sections} label="Active sections"
          added={growth.sections} caption="Across all classes" />
      </ListStats>

      <section className="card">
        <div className="ltabs">
          <button type="button" className={`ltab${tab === 'all' ? ' is-on' : ''}`}
            aria-pressed={tab === 'all'} onClick={() => setTab('all')}>
            All reports ({total})
          </button>
          {groups.map((g) => (
            <button key={g.key} type="button" className={`ltab${tab === g.key ? ' is-on' : ''}`}
              aria-pressed={tab === g.key} onClick={() => setTab(g.key)}>
              {g.label} ({g.reports.length})
            </button>
          ))}
        </div>

        <div className="repbody">
          {/* The year every figure above belongs to. It is not a picker: each
              report has its own period controls, and one here would only claim
              to filter screens it cannot reach. */}
          {year && (
            <div className="repyear">
              <Icon name="calendar" size={15} />
              <span>Figures are for <b>{year.yearName}</b></span>
              <Badge variant={year.status === 'active' ? 'success' : 'muted'}>
                {year.status === 'active' ? 'Active year' : year.status}
              </Badge>
              <span className="repyear__note">Each report picks its own dates once open.</span>
            </div>
          )}

          {shown.length === 0
            ? (
              <Alert variant="info">
                No reports in this category — your school does not run the modules behind them yet.
              </Alert>
            )
            : shown.map((g) => <ReportGroup key={g.key} group={g} />)}
        </div>
      </section>

      <div className="lbottom">
        <MissingPanel hidden={hidden} />
        <HelpPanel
          text="Figures on this page are school-wide and live. A report that looks wrong is usually a question of period or scope — open it and check the year, term or class it is showing before treating a number as final." />
      </div>

      <PageFoot schoolName={me?.school?.name} />
    </div>
  );
}
