/**
 * Student Analytics — the landing page.
 *
 * One screen for two audiences. A school admin sees every section; a teacher
 * sees only the sections they are class teacher, vice class teacher or subject
 * teacher of. The server decides that (getScope) — this page renders what came
 * back, and never widens it.
 *
 * The filters above the panels are the whole page: the roll-up AND the roster
 * below are both computed over exactly the selection in force, so a number here
 * always describes the students listed underneath it.
 *
 * Every module block is gated on the module producing it. A school without fees
 * is not shown a fee column, an empty fee panel, or a "has dues" filter.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../contexts/AuthContext';
import { getScope, getOverview, getStudents } from '../../api/analytics.api';
import { Empty, Spinner, Badge } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { ListFoot } from '../directory/employeeParts';
import { VIZ, fmtMoney, toneForPercent } from './viz';
import {
  Chip, Crumbs, FeeCell, Hero, LibraryCell, NoData, Panel, PercentCell, RankList,
  Split, StudentCell, Tile,
} from './analyticsParts';

// Filters that need a computed metric are gated on the module that produces it —
// there is no point offering "has dues" to a school without the fees module.
const FILTER_DEFS = [
  { key: 'gender', label: 'Gender', options: [
    ['male', 'Male'], ['female', 'Female'], ['other', 'Other'],
  ] },
  { key: 'status', label: 'Account', options: [
    ['active', 'Active'], ['inactive', 'Inactive'],
  ] },
  { key: 'attendance', label: 'Attendance', module: 'attendance', options: [
    ['90plus', '90% and above'], ['75to90', '75–90%'], ['60to75', '60–75%'],
    ['below60', 'Below 60%'], ['below75', 'Below 75% (at risk)'], ['untracked', 'Not marked yet'],
  ] },
  { key: 'result', label: 'Result', module: 'result', options: [
    ['75plus', '75% and above'], ['60to75', '60–75%'], ['40to60', '40–60%'],
    ['below40', 'Below 40%'], ['unassessed', 'Not assessed'],
  ] },
  { key: 'fees', label: 'Fees', module: 'fees', options: [
    ['due', 'Has dues'], ['clear', 'Cleared'],
  ] },
  { key: 'library', label: 'Library', module: 'library', options: [
    ['out', 'Books out'], ['overdue', 'Has overdue'],
  ] },
  { key: 'transport', label: 'Transport', module: 'transport', options: [
    ['assigned', 'Assigned'], ['none', 'Not assigned'],
  ] },
];

const SORT_DEFS = [
  { key: 'roll',       label: 'Roll number' },
  { key: 'name',       label: 'Name (A–Z)' },
  { key: 'attendance', label: 'Attendance — lowest first', module: 'attendance' },
  { key: 'result',     label: 'Result — lowest first',     module: 'result' },
  { key: 'dues',       label: 'Dues — highest first',      module: 'fees' },
];

const EMPTY_FILTERS = { gender: '', status: '', attendance: '', result: '', fees: '', library: '', transport: '' };
const PAGE_SIZES = [20, 50, 100];

export default function StudentAnalytics() {
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const base = isTeacher ? '/teacher/student-analytics' : '/admin/student-analytics';

  const [classId,   setClassId]   = useState('');
  const [sectionId, setSectionId] = useState('');
  const [search,    setSearch]    = useState('');
  const [term,      setTerm]      = useState('');
  const [filters,   setFilters]   = useState(EMPTY_FILTERS);
  const [sortBy,    setSortBy]    = useState('roll');
  const [showMore,  setShowMore]  = useState(false);
  const [page,      setPage]      = useState(1);
  const [limit,     setLimit]     = useState(20);

  const { data: scope, loading: scopeLoading, error: scopeError, refetch: retryScope } = useFetch(getScope, []);

  // A keystroke is not a search; wait for a pause. (The old page needed the
  // button pressed, which meant the panels could disagree with the box.)
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = useMemo(() => {
    const p = {};
    if (sectionId) p.sectionId = sectionId;
    else if (classId) p.classId = classId;
    if (term) p.search = term;
    Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
    if (sortBy && sortBy !== 'roll') p.sortBy = sortBy;
    return p;
  }, [classId, sectionId, term, filters, sortBy]);

  // useFetch re-runs on dep change; the serialised params are the honest key.
  const key = JSON.stringify(params);

  const { data: overview, loading: ovLoading } = useFetch(() => getOverview(params), [key]);
  const { data: roster, loading: rosterLoading } =
    useFetch(() => getStudents({ ...params, page, limit }), [key, page, limit]);

  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const sections = scope?.sections || [];
  const classes = useMemo(() => {
    const map = new Map();
    sections.forEach((s) => { if (!map.has(s.classId)) map.set(s.classId, s.className); });
    return [...map].map(([id, name]) => ({ id, name }));
  }, [sections]);
  const sectionChoices = classId ? sections.filter((s) => s.classId === classId) : sections;

  const resetFilters = () => {
    setClassId(''); setSectionId(''); setSearch(''); setTerm('');
    setFilters(EMPTY_FILTERS); setSortBy('roll'); setPage(1);
  };

  if (scopeLoading) return <div className="loading-page"><Spinner /></div>;

  // Reaching the endpoint failed — say so, rather than letting a dead API look
  // like an empty roster.
  if (scopeError) {
    return (
      <div className="page anpg">
        <Crumbs home={isTeacher ? '/teacher/dashboard' : '/admin/dashboard'} />
        <Empty icon="🔌" title="Could not load analytics" message={scopeError}
          action={<button type="button" className="btn btn-primary" onClick={retryScope}>Try again</button>} />
      </div>
    );
  }

  if (!sections.length) {
    return (
      <div className="page anpg">
        <Crumbs home={isTeacher ? '/teacher/dashboard' : '/admin/dashboard'} />
        <Empty
          icon="🎓"
          title={scope?.canSeeAll ? 'No sections yet' : 'No classes assigned to you'}
          message={scope?.canSeeAll
            ? 'No active sections in the current academic year. Create classes and sections first, then analytics will appear here.'
            : 'You will see analytics here once you are made class teacher, vice class teacher or subject teacher of a section.'}
        />
      </div>
    );
  }

  const modules = overview?.modules || scope?.modules || {};
  const totals  = overview?.totals;
  const att     = overview?.attendance;
  const res     = overview?.results;
  const fees    = overview?.fees;

  const availableFilters = FILTER_DEFS.filter((f) => !f.module || modules[f.module]);
  const availableSorts   = SORT_DEFS.filter((s) => !s.module || modules[s.module]);
  const activeFilters    = availableFilters
    .filter((f) => filters[f.key])
    .map((f) => ({
      key: f.key,
      label: f.label,
      valueLabel: f.options.find(([v]) => v === filters[f.key])?.[1] || filters[f.key],
    }));
  const anyFilter = activeFilters.length > 0 || !!classId || !!sectionId || !!term || sortBy !== 'roll';
  const students  = roster?.students || [];

  return (
    <div className="page anpg">
      <Crumbs home={isTeacher ? '/teacher/dashboard' : '/admin/dashboard'} />

      <Hero scope={scope} sections={sections.length} />

      {/* One selection drives the whole page: the figures, the panels and the
          roster are all computed over exactly this. */}
      <section className="anfilters">
        <div className="anfilters__row">
          <select className="form-control ansel" value={classId} aria-label="Class"
            onChange={(e) => { setClassId(e.target.value); setSectionId(''); setPage(1); }}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <select className="form-control ansel" value={sectionId} aria-label="Section"
            onChange={(e) => { setSectionId(e.target.value); setPage(1); }}>
            <option value="">All sections</option>
            {sectionChoices.map((s) => (
              <option key={s._id} value={s._id}>{s.className} — {s.sectionName}</option>
            ))}
          </select>

          <div className="ansearch">
            <Icon name="search" size={16} />
            <input className="form-control" value={search} placeholder="Search by name, admission or roll number…"
              onChange={(e) => setSearch(e.target.value)} aria-label="Search students" />
            {search && (
              <button type="button" onClick={() => setSearch('')} aria-label="Clear search">
                <Icon name="close" size={14} />
              </button>
            )}
          </div>

          <button type="button" className={`btn btn-secondary${activeFilters.length ? ' anmore--on' : ''}`}
            onClick={() => setShowMore((v) => !v)} aria-expanded={showMore}>
            <Icon name="filter" size={16} />
            Filters{activeFilters.length ? ` (${activeFilters.length})` : ''}
          </button>
        </div>

        {showMore && (
          <div className="anfilters__panel">
            {availableFilters.map((f) => (
              <label key={f.key}>
                {f.label}
                <select className="form-control" value={filters[f.key]}
                  onChange={(e) => setFilter(f.key, e.target.value)}>
                  <option value="">Any</option>
                  {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            ))}
            <label>
              Sort by
              <select className="form-control" value={sortBy}
                onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
                {availableSorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>
        )}

        {anyFilter && (
          <div className="anfilters__chips">
            {term && <Chip label={`Search: ${term}`} onClear={() => setSearch('')} />}
            {activeFilters.map((f) => (
              <Chip key={f.key} label={`${f.label}: ${f.valueLabel}`} onClear={() => setFilter(f.key, '')} />
            ))}
            {sortBy !== 'roll' && (
              <Chip label={`Sorted by ${SORT_DEFS.find((s) => s.key === sortBy)?.label}`}
                onClear={() => { setSortBy('roll'); setPage(1); }} />
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={resetFilters}>Clear all</button>
          </div>
        )}
      </section>

      {/* Which hat the viewer is wearing over the selected section */}
      {!scope?.canSeeAll && sectionId && (
        <p className="anrole">
          Your role here:{' '}
          {(sections.find((s) => s._id === sectionId)?.roles || []).map((r) => (
            <Badge key={r} variant="primary">{r}</Badge>
          ))}
        </p>
      )}

      {ovLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
      ) : (
        <>
          <div className="antiles">
            <Tile icon="student" tone="indigo" value={totals?.students ?? 0} label="Students in view"
              caption={anyFilter ? 'Matching these filters' : `Across ${sections.length} section${sections.length === 1 ? '' : 's'}`} />
            {modules.attendance && (
              <Tile icon="checkSquare" tone="green" value={att?.average} unit="%" label="Average attendance"
                empty="Not marked yet"
                caption={att?.tracked ? `${att.tracked} student${att.tracked === 1 ? '' : 's'} with a marked register` : 'No register marked yet'} />
            )}
            {modules.result && (
              <Tile icon="chart" tone="purple" value={res?.average} unit="%" label="Average result"
                empty="Not assessed"
                caption={res?.assessed ? `${res.assessed} assessed · ${res.failing} with a failed exam` : 'No results published yet'} />
            )}
            {modules.fees && (
              <Tile icon="wallet" tone="amber" value={fmtMoney(fees?.outstanding)} label="Outstanding fees"
                caption={fees?.defaulters
                  ? `${fees.defaulters} student${fees.defaulters === 1 ? '' : 's'} owing`
                  : 'Nobody owes anything'} />
            )}
          </div>

          <div className="angrid">
            {modules.attendance && (
              <Panel icon="checkSquare" tone="green" title="Attendance spread"
                subtitle={att?.tracked
                  ? `${att.tracked} student${att.tracked === 1 ? '' : 's'} with a marked register`
                  : 'Nothing marked in this selection yet'}>
                {att?.tracked
                  ? (
                    <>
                      {/* Ordered bands, so a single-hue ramp rather than the
                          status trio — these are degrees of one thing. */}
                      <Split segments={[
                        { label: '90% and above', value: att.bands.above90,    color: VIZ.bands[3] },
                        { label: '75–90%',        value: att.bands.from75to90, color: VIZ.bands[2] },
                        { label: '60–75%',        value: att.bands.from60to75, color: VIZ.bands[1] },
                        { label: 'Below 60%',     value: att.bands.below60,    color: VIZ.bands[0] },
                      ]} />
                      {!!att.lowest?.length && (
                        <>
                          <h4 className="anpanel__sub">Lowest attendance</h4>
                          <RankList base={base} rows={att.lowest}
                            value={(r) => `${r.attendancePercent}%`}
                            tone={(r) => toneForPercent(r.attendancePercent)} />
                        </>
                      )}
                    </>
                  )
                  : <NoData icon="checkSquare" title="No attendance marked yet"
                      hint="Bands appear here as sections record their registers." />}
              </Panel>
            )}

            {modules.result && (
              <Panel icon="chart" tone="purple" title="Academic standing"
                subtitle={res?.assessed
                  ? `${res.assessed} assessed · ${res.failing} with a failed exam`
                  : 'Nothing published in this selection yet'}>
                {res?.assessed
                  ? (
                    <div className="anpanel__two">
                      <div>
                        <h4 className="anpanel__sub">Top performers</h4>
                        <RankList base={base} rows={res.toppers}
                          value={(r) => `${r.avgPercent}%`} tone={() => 'good'} />
                      </div>
                      <div>
                        <h4 className="anpanel__sub">Needs attention</h4>
                        <RankList base={base} rows={res.needHelp}
                          value={(r) => `${r.avgPercent}%`} tone={(r) => toneForPercent(r.avgPercent)}
                          empty="Nobody is struggling." />
                      </div>
                    </div>
                  )
                  : <NoData icon="chart" title="No results published yet"
                      hint="Averages and shortlists appear once an exam is published." />}
              </Panel>
            )}

            {modules.fees && (
              <Panel icon="wallet" tone="amber" title="Fees"
                subtitle={`${fmtMoney(fees?.collected)} collected in this selection`}>
                {(fees?.collected || fees?.outstanding)
                  ? (
                    <>
                      {/* Collected against outstanding is a status split, so it
                          ships both labels and both amounts. */}
                      <Split segments={[
                        { label: 'Collected',   value: fees.collected,   color: VIZ.good },
                        { label: 'Outstanding', value: fees.outstanding, color: VIZ.bad },
                      ]} />
                      {!!fees.topDues?.length && (
                        <>
                          <h4 className="anpanel__sub">Largest dues</h4>
                          <RankList base={base} rows={fees.topDues}
                            value={(r) => fmtMoney(r.feeBalance)} tone={() => 'bad'} />
                        </>
                      )}
                    </>
                  )
                  : <NoData icon="wallet" title="Nothing billed yet"
                      hint="Collection and dues appear once fees are raised." />}
              </Panel>
            )}

            {(modules.library || modules.videoLibrary) && (
              <Panel icon="bookOpen" tone="blue" title="Engagement"
                subtitle="What these students are reading and watching">
                <div className="anengage">
                  {modules.library && (
                    <div>
                      <b>{overview?.library?.booksOut ?? 0}</b>
                      <span>Books out</span>
                      <small>
                        {overview?.library?.overdue || 0} overdue · {overview?.library?.readers || 0} readers
                      </small>
                    </div>
                  )}
                  {modules.videoLibrary && (
                    <div>
                      <b>{overview?.videos?.completed ?? 0}</b>
                      <span>Videos completed</span>
                      <small>
                        {overview?.videos?.watched || 0} started · {overview?.videos?.viewers || 0} viewers
                      </small>
                    </div>
                  )}
                </div>
              </Panel>
            )}
          </div>
        </>
      )}

      <section className="card anroster">
        <header className="anpanel__head">
          <span className="anpanel__icon tint-indigo"><Icon name="users" size={18} /></span>
          <div>
            <h2>Students <span className="ancount">{roster?.total ?? 0}</span></h2>
            <p>Open a student for their full module-by-module dashboard.</p>
          </div>
        </header>

        {rosterLoading
          ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
          : students.length === 0
            ? (
              <Empty icon="🔍" title="No students match these filters"
                message={anyFilter ? 'Try widening the selection.' : 'No students in this section yet.'}
                action={anyFilter
                  ? <button type="button" className="btn btn-secondary" onClick={resetFilters}>Clear all</button>
                  : null} />
            )
            : (
              <div className="table-wrap">
                <table className="table antable">
                  <thead>
                    <tr>
                      <th className="ancol-num">#</th>
                      <th>Student</th>
                      <th className="ancol-class">Class</th>
                      <th className="ancol-roll">Roll</th>
                      {modules.attendance && <th className="ancol-pc">Attendance</th>}
                      {modules.result && <th className="ancol-pc">Avg. result</th>}
                      {modules.fees && <th className="ancol-fee">Fees</th>}
                      {modules.library && <th className="ancol-lib">Library</th>}
                      <th className="ancol-act" />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((r, i) => (
                      <tr key={r._id}>
                        <td className="ancol-num">{((roster?.page || 1) - 1) * limit + i + 1}</td>
                        <td><StudentCell row={r} base={base} /></td>
                        <td className="ancol-class">{`${r.className} ${r.sectionName}`.trim() || '—'}</td>
                        <td className="ancol-roll">{r.rollNumber || <span className="ed-none">—</span>}</td>
                        {modules.attendance && (
                          <td className="ancol-pc">
                            <PercentCell value={r.attendancePercent}
                              sub={r.attendanceDays ? `${r.attendanceDays} days` : ''} empty="Not marked" />
                          </td>
                        )}
                        {modules.result && (
                          <td className="ancol-pc">
                            <PercentCell value={r.avgPercent}
                              sub={r.examCount ? `${r.examCount} exam${r.examCount === 1 ? '' : 's'}` : ''}
                              empty="Not assessed" />
                          </td>
                        )}
                        {modules.fees && <td className="ancol-fee"><FeeCell row={r} /></td>}
                        {modules.library && <td className="ancol-lib"><LibraryCell row={r} /></td>}
                        <td className="ancol-act">
                          <Link to={`${base}/${r._id}`} className="btn btn-secondary btn-sm">View</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

        {students.length > 0 && (
          <ListFoot
            page={roster?.page || 1} pages={roster?.pages || 1} total={roster?.total || 0}
            limit={limit} count={students.length} noun="student"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} sizes={PAGE_SIZES}
          />
        )}
      </section>
    </div>
  );
}
