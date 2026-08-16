import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../contexts/AuthContext';
import { getScope, getOverview, getStudents } from '../../api/analytics.api';
import { PageHeader, Spinner, Badge, Table, Pagination, Empty } from '../../components/ui/index';
import {
  VIZ, Panel, Hero, Meter, BandBar, Grid, fmtMoney, toneForPercent, toneColor,
} from './viz';

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

// One page for two audiences. A school admin sees every section; a teacher sees
// only the sections they are class teacher / vice class teacher of, or teach a
// subject in — the backend decides, this page just renders what came back.
export default function StudentAnalytics() {
  const { user } = useAuth();
  const base = user?.role === 'teacher' ? '/teacher/student-analytics' : '/admin/student-analytics';

  const [classId,   setClassId]   = useState('');
  const [sectionId, setSectionId] = useState('');
  const [search,    setSearch]    = useState('');
  const [term,      setTerm]      = useState('');
  const [filters,   setFilters]   = useState(EMPTY_FILTERS);
  const [sortBy,    setSortBy]    = useState('roll');
  const [showMore,  setShowMore]  = useState(false);
  const [page,      setPage]      = useState(1);

  const { data: scope, loading: scopeLoading, error: scopeError, refetch: retryScope } = useFetch(getScope, []);

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
    useFetch(() => getStudents({ ...params, page, limit: 20 }), [key, page]);

  const setFilter = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  const sections = scope?.sections || [];
  const classes = useMemo(() => {
    const map = new Map();
    sections.forEach((s) => { if (!map.has(s.classId)) map.set(s.classId, s.className); });
    return [...map].map(([id, name]) => ({ id, name }));
  }, [sections]);
  const sectionChoices = classId ? sections.filter((s) => s.classId === classId) : sections;

  const applySearch = (e) => { e.preventDefault(); setPage(1); setTerm(search.trim()); };
  const resetFilters = () => {
    setClassId(''); setSectionId(''); setSearch(''); setTerm('');
    setFilters(EMPTY_FILTERS); setSortBy('roll'); setPage(1);
  };

  if (scopeLoading) return <div className="loading-page"><Spinner /></div>;

  // Reaching the endpoint failed — say so, rather than letting a dead API look
  // like an empty roster.
  if (scopeError) {
    return (
      <div className="page">
        <PageHeader title="Student Analytics" />
        <Empty
          icon="🔌"
          title="Could not load analytics"
          message={scopeError}
          action={<button className="btn btn-primary" onClick={retryScope}>Try again</button>}
        />
      </div>
    );
  }

  if (!sections.length) {
    return (
      <div className="page">
        <PageHeader title="Student Analytics" />
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

  const availableFilters = FILTER_DEFS.filter((f) => !f.module || modules[f.module]);
  const availableSorts   = SORT_DEFS.filter((s) => !s.module || modules[s.module]);
  const activeFilters    = availableFilters
    .filter((f) => filters[f.key])
    .map((f) => ({
      key: f.key,
      label: f.label,
      valueLabel: f.options.find(([v]) => v === filters[f.key])?.[1] || filters[f.key],
    }));

  const columns = [
    {
      key: 'name', label: 'Student',
      render: (r) => (
        <Link to={`${base}/${r._id}`} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 30, height: 30, borderRadius: '50%', background: '#ede9fe', color: VIZ.accent,
            display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: '.78rem', flexShrink: 0,
          }}>{(r.name || '?').charAt(0).toUpperCase()}</span>
          <span>
            <span style={{ fontWeight: 600, display: 'block' }}>{r.name}</span>
            <span style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
              {r.admissionNumber || r.email}
            </span>
          </span>
        </Link>
      ),
    },
    { key: 'class', label: 'Class', render: (r) => `${r.className} ${r.sectionName}`.trim() || '—' },
    { key: 'rollNumber', label: 'Roll', render: (r) => r.rollNumber || '—' },
    ...(modules.attendance ? [{
      key: 'attendancePercent', label: 'Attendance',
      render: (r) => (r.attendancePercent == null
        ? <span className="text-muted">—</span>
        : <Meter value={r.attendancePercent} right={<strong>{r.attendancePercent}%</strong>} label={`${r.attendanceDays} days`} />),
    }] : []),
    ...(modules.result ? [{
      key: 'avgPercent', label: 'Avg. result',
      render: (r) => (r.avgPercent == null
        ? <span className="text-muted">Not assessed</span>
        : <Meter value={r.avgPercent} right={<strong>{r.avgPercent}%</strong>} label={`${r.examCount} exam${r.examCount === 1 ? '' : 's'}`} />),
    }] : []),
    ...(modules.fees ? [{
      key: 'feeBalance', label: 'Fee balance',
      render: (r) => (r.feeBalance > 0
        ? <Badge variant="danger">{fmtMoney(r.feeBalance)} due</Badge>
        : <Badge variant="success">Clear</Badge>),
    }] : []),
    ...(modules.library ? [{
      key: 'booksOut', label: 'Library',
      render: (r) => (r.booksOut
        ? <span>{r.booksOut} out{r.booksOverdue ? <span style={{ color: VIZ.bad }}> · {r.booksOverdue} overdue</span> : null}</span>
        : <span className="text-muted">—</span>),
    }] : []),
    {
      key: 'open', label: '',
      render: (r) => <Link to={`${base}/${r._id}`} className="btn btn-secondary btn-sm">View</Link>,
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Student Analytics"
        subtitle={scope?.canSeeAll
          ? `Every student in the school${scope?.academicYear ? ` · ${scope.academicYear.yearName}` : ''}`
          : `${sections.length} section${sections.length === 1 ? '' : 's'} you teach${scope?.academicYear ? ` · ${scope.academicYear.yearName}` : ''}`}
      />

      {/* Filters — one block above the charts. Both the roll-up and the roster
          below reflect exactly this selection. */}
      <form onSubmit={applySearch} style={{
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 12, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="form-control" style={{ width: 'auto', minWidth: 140 }}
            value={classId}
            onChange={(e) => { setClassId(e.target.value); setSectionId(''); setPage(1); }}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="form-control" style={{ width: 'auto', minWidth: 140 }}
            value={sectionId}
            onChange={(e) => { setSectionId(e.target.value); setPage(1); }}>
            <option value="">All sections</option>
            {sectionChoices.map((s) => (
              <option key={s._id} value={s._id}>{s.className} — {s.sectionName}</option>
            ))}
          </select>
          <input className="form-control" style={{ width: 'auto', minWidth: 190, flex: 1 }}
            placeholder="Search name, admission or roll number…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn btn-primary" type="submit">Search</button>
          <button className="btn btn-secondary" type="button" onClick={() => setShowMore((v) => !v)}>
            Filters{activeFilters.length ? ` (${activeFilters.length})` : ''} {showMore ? '▴' : '▾'}
          </button>
        </div>

        {showMore && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))',
            gap: 10, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
          }}>
            {availableFilters.map((f) => (
              <label key={f.key} style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                {f.label}
                <select className="form-control" style={{ marginTop: 4 }}
                  value={filters[f.key]} onChange={(e) => setFilter(f.key, e.target.value)}>
                  <option value="">Any</option>
                  {f.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            ))}
            <label style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
              Sort by
              <select className="form-control" style={{ marginTop: 4 }}
                value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }}>
                {availableSorts.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </label>
          </div>
        )}

        {/* Active selections, each individually removable */}
        {(activeFilters.length > 0 || classId || sectionId || term || sortBy !== 'roll') && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 12 }}>
            {term && <Chip label={`Search: ${term}`} onClear={() => { setSearch(''); setTerm(''); setPage(1); }} />}
            {activeFilters.map((f) => (
              <Chip key={f.key} label={`${f.label}: ${f.valueLabel}`} onClear={() => setFilter(f.key, '')} />
            ))}
            {sortBy !== 'roll' && (
              <Chip label={`Sorted by ${SORT_DEFS.find((s) => s.key === sortBy)?.label}`}
                onClear={() => { setSortBy('roll'); setPage(1); }} />
            )}
            <button className="btn btn-secondary btn-sm" type="button" onClick={resetFilters}>Clear all</button>
          </div>
        )}
      </form>

      {/* Which hat the viewer is wearing over the selected section */}
      {!scope?.canSeeAll && sectionId && (
        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 12 }}>
          Your role here:{' '}
          {(sections.find((s) => s._id === sectionId)?.roles || []).map((r) => (
            <Badge key={r} variant="primary">{r}</Badge>
          ))}
        </p>
      )}

      {ovLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><Spinner /></div>
      ) : (
        <>
          <div className="stat-grid" style={{ marginBottom: 4 }}>
            <div className="stat-card">
              <div className="stat-card__icon blue">👨‍🎓</div>
              <div className="stat-card__info">
                <div className="stat-card__value">{totals?.students ?? 0}</div>
                <div className="stat-card__label">Students in view</div>
              </div>
            </div>
            {modules.attendance && (
              <div className="stat-card">
                <div className="stat-card__icon green">✅</div>
                <div className="stat-card__info">
                  <div className="stat-card__value">
                    {overview?.attendance?.average != null ? `${overview.attendance.average}%` : '—'}
                  </div>
                  <div className="stat-card__label">Average attendance</div>
                </div>
              </div>
            )}
            {modules.result && (
              <div className="stat-card">
                <div className="stat-card__icon purple">📊</div>
                <div className="stat-card__info">
                  <div className="stat-card__value">
                    {overview?.results?.average != null ? `${overview.results.average}%` : '—'}
                  </div>
                  <div className="stat-card__label">Average result</div>
                </div>
              </div>
            )}
            {modules.fees && (
              <div className="stat-card">
                <div className="stat-card__icon orange">💰</div>
                <div className="stat-card__info">
                  <div className="stat-card__value">{fmtMoney(overview?.fees?.outstanding)}</div>
                  <div className="stat-card__label">
                    Outstanding · {overview?.fees?.defaulters || 0} student{overview?.fees?.defaulters === 1 ? '' : 's'}
                  </div>
                </div>
              </div>
            )}
          </div>

          <Grid min={320}>
            {modules.attendance && overview?.attendance?.tracked > 0 && (
              <Panel title="Attendance spread"
                subtitle={`${overview.attendance.tracked} student${overview.attendance.tracked === 1 ? '' : 's'} with marked attendance`}>
                <BandBar segments={[
                  { label: '90% and above', value: overview.attendance.bands.above90,    color: VIZ.bands[3] },
                  { label: '75–90%',        value: overview.attendance.bands.from75to90, color: VIZ.bands[2] },
                  { label: '60–75%',        value: overview.attendance.bands.from60to75, color: VIZ.bands[1] },
                  { label: 'Below 60%',     value: overview.attendance.bands.below60,    color: VIZ.bands[0] },
                ]} />
                {!!overview.attendance.lowest?.length && (
                  <div style={{ marginTop: 16 }}>
                    <h4 style={{ fontSize: '.8rem', fontWeight: 600, marginBottom: 8 }}>Lowest attendance</h4>
                    <RankList base={base} rows={overview.attendance.lowest}
                      value={(r) => `${r.attendancePercent}%`} tone={(r) => toneForPercent(r.attendancePercent)} />
                  </div>
                )}
              </Panel>
            )}

            {modules.result && (
              <Panel title="Academic standing" subtitle={`${overview?.results?.assessed || 0} assessed · ${overview?.results?.failing || 0} with a failed exam`}>
                {overview?.results?.assessed ? (
                  <Grid min={130} gap={12}>
                    <div>
                      <h4 style={{ fontSize: '.8rem', fontWeight: 600, marginBottom: 8 }}>Top performers</h4>
                      <RankList base={base} rows={overview.results.toppers} value={(r) => `${r.avgPercent}%`} tone={() => 'good'} />
                    </div>
                    <div>
                      <h4 style={{ fontSize: '.8rem', fontWeight: 600, marginBottom: 8 }}>Needs attention</h4>
                      <RankList base={base} rows={overview.results.needHelp} value={(r) => `${r.avgPercent}%`} tone={(r) => toneForPercent(r.avgPercent)} />
                    </div>
                  </Grid>
                ) : <p style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>No results published yet.</p>}
              </Panel>
            )}

            {modules.fees && !!overview?.fees?.topDues?.length && (
              <Panel title="Largest fee dues" subtitle={`${fmtMoney(overview.fees.collected)} collected so far`}>
                <RankList base={base} rows={overview.fees.topDues} value={(r) => fmtMoney(r.feeBalance)} tone={() => 'bad'} />
              </Panel>
            )}

            {(modules.library || modules.videoLibrary) && (
              <Panel title="Engagement">
                <Grid min={120} gap={14}>
                  {modules.library && (
                    <Hero value={overview?.library?.booksOut ?? 0} label="Books currently out"
                      tone={overview?.library?.overdue ? 'bad' : 'good'}
                      sub={`${overview?.library?.overdue || 0} overdue · ${overview?.library?.readers || 0} readers`} />
                  )}
                  {modules.videoLibrary && (
                    <Hero value={overview?.videos?.completed ?? 0} label="Videos completed"
                      tone="accent"
                      sub={`${overview?.videos?.watched || 0} started · ${overview?.videos?.viewers || 0} viewers`} />
                  )}
                </Grid>
              </Panel>
            )}
          </Grid>
        </>
      )}

      <Panel title="Students" subtitle="Open a student for their full module-by-module dashboard">
        <Table columns={columns} data={roster?.students} loading={rosterLoading}
          emptyIcon="🔍" emptyTitle="No students match these filters" />
        <Pagination page={roster?.page || 1} pages={roster?.pages || 1}
          total={roster?.total || 0} onPage={setPage} />
      </Panel>
    </div>
  );
}

// A removable summary of one active filter.
function Chip({ label, onClear }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.75rem',
      background: '#ede9fe', color: VIZ.accent, borderRadius: 99, padding: '4px 6px 4px 10px',
    }}>
      {label}
      <button type="button" onClick={onClear} aria-label={`Remove ${label}`}
        style={{
          border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer',
          fontSize: '.85rem', lineHeight: 1, padding: '0 2px',
        }}>✕</button>
    </span>
  );
}

// A ranked shortlist — the table form the skill prefers once names carry the meaning.
function RankList({ rows, value, tone, base }) {
  if (!rows?.length) return <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Nothing to show.</p>;
  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
      {rows.map((r) => (
        <li key={r._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, fontSize: '.82rem' }}>
          <Link to={`${base}/${r._id}`} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.name}
            <span style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}> · {r.className} {r.sectionName}</span>
          </Link>
          <strong style={{ color: toneColor[tone(r)], flexShrink: 0 }}>{value(r)}</strong>
        </li>
      ))}
    </ol>
  );
}
