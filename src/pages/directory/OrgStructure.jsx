/**
 * Employee Directory → Organization Structure.
 *
 * Two structures, one call, and they are not the same thing: the REPORTING tree
 * built from the reporting manager on each profile, and the department →
 * designation grouping every school has whether or not anyone has set a
 * reporting line. The page shows both and says which is which.
 *
 * Nothing is edited here — the reporting manager, the department and the
 * designation are all set on an employee's Employment tab, and this is the view
 * of what they add up to.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getOrgStructure, downloadReport } from '../../api/employeeDirectory.api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Empty } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { ErrorState, SkeletonRows, useDirectoryBase } from './parts';
import { Crumbs, PageTop, SearchBox, StatTile } from './employeeParts';
import {
  DepartmentBreakdown, DepartmentChart, DesignationBreakdown, Legend, ReportingTree,
  UNASSIGNED, byDesignation, coverageOf, filterTree, flatten, heldDesignations,
} from './orgParts';

export default function OrgStructure() {
  const { base } = useDirectoryBase();
  const { user } = useAuth();
  const { data, loading, error, refetch } = useFetch(getOrgStructure, []);

  const [view,   setView]   = useState('chart');   // chart | reporting
  const [rail,   setRail]   = useState('department');
  const [search, setSearch] = useState('');
  const [open,   setOpen]   = useState('');
  const [exporting, setExporting] = useState(false);

  const tree  = useMemo(() => data?.tree || [], [data]);
  const byDep = useMemo(() => data?.byDepartment || [], [data]);
  const byDes = useMemo(() => byDesignation(byDep), [byDep]);

  const people   = useMemo(() => flatten(tree), [tree]);
  const coverage = useMemo(() => coverageOf(tree), [tree]);
  const withStaff = byDep.filter((d) => d.department !== UNASSIGNED);

  // A reporting tree with no lines set is one flat list of everybody, which is
  // true but not a structure — so the department chart leads until there is one.
  useEffect(() => {
    if (data && data.hasReportingLines) setView('reporting');
  }, [data]);

  const term = search.trim().toLowerCase();
  const shownTree = useMemo(() => filterTree(tree, term), [tree, term]);
  const shownDeps = useMemo(() => {
    if (!term) return byDep;
    return byDep
      .map((d) => {
        const designations = d.designations
          .map((g) => ({ ...g, members: g.members.filter((m) => m.name.toLowerCase().includes(term)) }))
          .filter((g) => g.members.length);
        return designations.length
          ? { ...d, designations, total: designations.reduce((n, g) => n + g.members.length, 0) }
          : null;
      })
      .filter(Boolean);
  }, [byDep, term]);

  const exportRail = async () => {
    setExporting(true);
    toast.loading('Building the spreadsheet…', { id: 'orgexp' });
    try {
      // The report that matches what the rail is showing, so the file and the
      // screen agree.
      await downloadReport(rail === 'department' ? 'by-department' : 'by-designation', 'xlsx');
      toast.success('Downloaded', { id: 'orgexp' });
    } catch (e) {
      toast.error(e?.message || 'Could not build the file', { id: 'orgexp' });
    } finally { setExporting(false); }
  };

  if (loading) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Organization Structure" />
        <PageTop title="Organization Structure" subtitle="Built from the reporting lines, departments and designations already on the employee records." />
        <SkeletonRows rows={8} cols={2} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Organization Structure" />
        <PageTop title="Organization Structure" />
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  if (!people.length) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Organization Structure" />
        <PageTop title="Organization Structure" />
        <Empty icon="🏗️" title="No employees yet"
          message="The structure is drawn from employee records — it appears as soon as there are some." />
      </div>
    );
  }

  return (
    <div className="page edl">
      <Crumbs base={base} here="Organization Structure" />

      <PageTop
        title="Organization Structure"
        subtitle="Your school's shape, drawn from the reporting lines, departments and designations already on the employee records.">
        <button type="button" className="btn btn-secondary" onClick={exportRail} disabled={exporting}>
          <Icon name="download" size={16} /> Export {rail === 'department' ? 'departments' : 'designations'}
        </button>
        <Link className="btn btn-secondary" to={`${base}/employees`}>
          <Icon name="users" size={16} /> All employees
        </Link>
      </PageTop>

      <div className="edl-stats">
        <StatTile icon={<Icon name="users" size={22} />} tone="indigo" value={people.length}
          label="Employees" caption="On the books today" />
        <StatTile icon={<Icon name="building" size={22} />} tone="blue" value={withStaff.length}
          label="Departments" caption={`${byDep.length - withStaff.length ? 'Plus the unassigned' : 'All staff placed'}`} />
        <StatTile icon={<Icon name="badge" size={22} />} tone="purple" value={heldDesignations(byDep)}
          label="Designations" caption="Held across the school" />
        <StatTile icon={<Icon name="activity" size={22} />} tone={coverage.pct ? 'green' : 'amber'}
          value={`${coverage.pct}%`} label="Reporting coverage"
          captionTone={coverage.pct ? undefined : 'down'}
          caption={coverage.pct
            ? `${coverage.mapped} of ${coverage.total} report to someone`
            : 'No reporting lines set yet'} />
      </div>

      {!data?.hasReportingLines && (
        <Alert variant="info">
          No reporting manager has been set on anybody yet, so there is no chain to draw — everyone sits
          at the top. Set one on an employee&rsquo;s <b>Employment</b> tab and the tree builds itself.
        </Alert>
      )}

      <div className="orggrid">
        <section className="card edl-card-wrap">
          <div className="orgtabs">
            <button type="button" className={`orgtab${view === 'chart' ? ' is-on' : ''}`}
              aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
              <Icon name="grid" size={16} /> Department chart
            </button>
            <button type="button" className={`orgtab${view === 'reporting' ? ' is-on' : ''}`}
              aria-pressed={view === 'reporting'} onClick={() => setView('reporting')}>
              <Icon name="layers" size={16} /> Reporting lines
              {!data?.hasReportingLines && <em>not set</em>}
            </button>
            <div className="orgtabs__search">
              <SearchBox value={search} onChange={setSearch} placeholder="Find an employee…" />
            </div>
          </div>

          <div className="orgbody">
            {view === 'chart'
              ? (
                shownDeps.length === 0
                  ? <Empty icon="🔍" title="Nobody matches" message="Try another name." />
                  : (
                    <>
                      <DepartmentChart
                        school={{ name: user?.school?.name || 'This school', total: people.length }}
                        departments={shownDeps}
                        base={base}
                      />
                      <Legend />
                    </>
                  )
              )
              : (
                shownTree.length === 0
                  ? <Empty icon="🔍" title="Nobody matches" message="Try another name." />
                  : (
                    <>
                      {term && (
                        <p className="orghint">
                          Showing the people who match and the managers above them, so the chain stays readable.
                        </p>
                      )}
                      <ReportingTree tree={shownTree} base={base} />
                    </>
                  )
              )}
          </div>
        </section>

        <aside className="card orgrail">
          <header className="orgrail__head">
            <h2>Breakdown</h2>
            <div className="orgrail__switch" role="group" aria-label="Group by">
              <button type="button" className={rail === 'department' ? 'is-on' : ''}
                aria-pressed={rail === 'department'} onClick={() => { setRail('department'); setOpen(''); }}>
                By department
              </button>
              <button type="button" className={rail === 'designation' ? 'is-on' : ''}
                aria-pressed={rail === 'designation'} onClick={() => { setRail('designation'); setOpen(''); }}>
                By designation
              </button>
            </div>
          </header>
          <div className="orgrail__body">
            {rail === 'department'
              ? <DepartmentBreakdown rows={byDep} base={base} open={open}
                  onToggle={(n) => setOpen(open === n ? '' : n)} />
              : <DesignationBreakdown rows={byDes} base={base} open={open}
                  onToggle={(n) => setOpen(open === n ? '' : n)} />}
          </div>
        </aside>
      </div>
    </div>
  );
}
