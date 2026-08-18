import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { getMeta, getEmployees } from '../../api/employeeDirectory.api';
import { PageHeader, Pagination, Empty, Badge } from '../../components/ui/index';
import {
  Avatar, Chips, SkeletonRows, SkeletonCards, ErrorState, Meter, Fact,
  SegControl, SearchIcon, GridIcon, ListIcon, MailIcon, PhoneIcon, PinIcon,
  UserIcon, BookIcon, Blank, fmtDate,
  STATUS_TONE, STATUS_LABEL, useDirectoryBase,
} from './parts';

// Search, filtering, sorting and paging all happen on the server — the browser
// receives one page at a time and never the whole staff table.

const VIEW_KEY = 'employeeDirectory.view';
const PAGE_SIZES = [5, 10, 15, 20];

// Every filter maps to one query parameter the API understands.
const EMPTY = {
  search: '', department: '', designation: '', staffType: '', employmentType: '',
  status: '', subject: '', classId: '', sectionId: '', joiningYear: '',
  reportingManager: '', verification: '', completion: '',
};

export default function Employees() {
  const { base, isDirectoryAdmin } = useDirectoryBase();
  const navigate = useNavigate();
  const [urlParams] = useSearchParams();

  // A link from the dashboard can pre-apply a filter.
  const [filters, setFilters] = useState(() => {
    const seed = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) {
      const v = urlParams.get(k);
      if (v) seed[k] = v;
    }
    return seed;
  });
  const [draft,   setDraft]   = useState(filters.search);
  const [page,    setPage]    = useState(1);
  const [limit,   setLimit]   = useState(10);
  // Sorting is driven by the list-view column headers.
  const [sortBy,  setSortBy]  = useState('name');
  const [sortDir, setSortDir] = useState('asc');
  const [view,    setView]    = useState(() => localStorage.getItem(VIEW_KEY) || 'card');

  // The chosen view is the user's, so it outlives the page.
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

  // Debounce the search box so a keystroke does not become a request.
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setFilters((f) => (f.search === draft.trim() ? f : { ...f, search: draft.trim() }));
      setPage(1);
    }, 350);
    return () => clearTimeout(timer.current);
  }, [draft]);

  const { data: meta } = useFetch(getMeta, []);

  const params = useMemo(() => {
    const p = { page, limit, sortBy, sortDir };
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v;
    return p;
  }, [filters, page, limit, sortBy, sortDir]);
  const key = JSON.stringify(params);

  const { data, loading, error, refetch } = useFetch(() => getEmployees(params), [key]);

  // The last page that actually arrived. Holding it while the next request is in
  // flight means paging and typing never blank the list — the rows dim instead.
  const [shown, setShown] = useState(null);
  useEffect(() => { if (data) setShown(data); }, [data]);
  const page_data = data || shown;

  const set = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); };
  const clearAll = () => { setFilters(EMPTY); setDraft(''); setPage(1); };

  const opts = meta?.filters || {};
  const sections = filters.classId
    ? (opts.sections || []).filter((s) => s.classId === filters.classId)
    : (opts.sections || []);

  const employees = page_data?.employees || [];
  const toggleSort = (k) => {
    if (sortBy === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortBy(k); setSortDir('asc'); }
    setPage(1);
  };

  const SortHead = ({ k, children }) => (
    <th style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => toggleSort(k)}>
      {children}{sortBy === k ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
    </th>
  );

  // Says what is on screen, and only mentions filtering when something is filtered.
  const subtitle = !page_data
    ? 'Staff of your school'
    : page_data.total === page_data.grandTotal
      ? `${page_data.grandTotal} employee${page_data.grandTotal === 1 ? '' : 's'}`
      : `${page_data.total} of ${page_data.grandTotal} employees match`;

  const noneAtAll = !loading && !error && employees.length === 0 && page_data?.grandTotal === 0;
  const noMatches = !loading && !error && employees.length === 0 && page_data?.grandTotal > 0;

  return (
    <div className="page">
      <PageHeader
        title="Employee Directory"
        subtitle="Browse your school's staff — subjects, classes and how to reach them"
        action={isDirectoryAdmin && <Link className="btn btn-secondary" to={`${base}/reports`}>📈 Reports</Link>}
      />

      {/* ── Search + designation ─────────────────────────────────────────
          Deliberately just these two: the directory is a lookup, and every
          other filter it could offer keys on data this tier does not receive. */}
      <div className="card" style={{ marginBottom: 4 }}>
        <div className="card-body">
          <div className="ed-toolbar__main">
            <div className="ed-search">
              <SearchIcon size={17} />
              <input
                className="form-control"
                placeholder="Search employees by name, employee ID, email, phone, subject or class…"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Search employees"
              />
            </div>
            <select className="form-control ed-major" value={filters.designation} onChange={set('designation')}
              aria-label="Filter by designation">
              <option value="">All designations</option>
              {(opts.designations || []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* ── Results ─────────────────────────────────────────────────────── */}
      <div className="ed-resultbar">
        <div>
          <h2>All Employees</h2>
          <p>{subtitle}</p>
        </div>
        <SegControl
          value={view}
          onChange={setView}
          options={[
            { value: 'card',  label: 'Card view', icon: <GridIcon /> },
            { value: 'table', label: 'List view', icon: <ListIcon /> },
          ]}
        />
      </div>

      {error && <ErrorState error={error} onRetry={refetch} title="Could not load employees" />}

      {!error && loading && !shown && (view === 'table' ? <SkeletonRows rows={8} cols={6} /> : <SkeletonCards count={6} />)}

      {noneAtAll && (
        <Empty icon="👥" title="No employees found."
          message="No staff records exist for this school yet. Add a teacher and they will appear here." />
      )}
      {noMatches && (
        <Empty icon="🔍" title="No employees match your search criteria."
          message="Try changing your filters."
          action={<button className="btn btn-secondary" onClick={clearAll}>Clear filters</button>} />
      )}

      {!error && employees.length > 0 && view === 'table' && (
        <div className="card" style={{ opacity: loading ? .55 : 1, transition: 'opacity .15s' }}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <SortHead k="name">Employee</SortHead>
                  <SortHead k="designation">Role</SortHead>
                  {isDirectoryAdmin && <th>Type &amp; Status</th>}
                  <th>Subjects &amp; Classes</th>
                  <th>Contact</th>
                  {isDirectoryAdmin && <SortHead k="joiningDate">Joined</SortHead>}
                  <th style={{ width: 36 }} aria-label="Open" />
                </tr>
              </thead>
              <tbody>
                {employees.map((e) => (
                  <tr key={e._id} className="ed-row" onClick={() => navigate(`${base}/employees/${e._id}`)}>
                    {/* Identity: avatar, name and the employee ID that names them */}
                    <td>
                      <div className="ed-emp">
                        <Avatar name={e.name} src={e.profileImage} size={38} />
                        <div style={{ minWidth: 0 }}>
                          <div className="ed-nm">{e.name}</div>
                          <div className={`ed-id${e.employeeId ? '' : ' ed-none'}`}>
                            {e.employeeId || 'No employee ID'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {e.designation
                        ? <>
                          <div style={{ fontWeight: 500, fontSize: '.85rem' }}>{e.designation}</div>
                          <div className={`ed-sub${e.department ? '' : ' ed-none'}`}>{e.department || 'No department'}</div>
                        </>
                        : <Blank>Not set</Blank>}
                    </td>
                    {isDirectoryAdmin && (
                      <td>
                        <div className="ed-pills">
                          <Badge variant={e.staffType === 'teaching' ? 'primary' : 'muted'}>
                            {e.staffType === 'teaching' ? 'Teaching' : 'Non-Teaching'}
                          </Badge>
                          <Badge variant={STATUS_TONE[e.employmentStatus]}>{STATUS_LABEL[e.employmentStatus]}</Badge>
                        </div>
                      </td>
                    )}
                    <td>
                      {(e.subjects?.length || e.classes?.length)
                        ? <>
                          <div className="ed-pills">
                            <Chips items={e.subjects} max={2} empty="" />
                            <Chips items={(e.classes || []).map((c) => c.label)} max={2} empty="" />
                          </div>
                          {e.isClassTeacher && (
                            <div className="ed-sub">Class teacher · {e.classTeacherOf.join(', ')}</div>
                          )}
                        </>
                        : <Blank>No assignments</Blank>}
                    </td>
                    <td style={{ fontSize: '.79rem' }}>
                      <div style={{ wordBreak: 'break-word' }}>{e.officialEmail}</div>
                      <div className={`ed-sub${e.officialPhone ? '' : ' ed-none'}`}>{e.officialPhone || 'No phone'}</div>
                    </td>
                    {isDirectoryAdmin && (
                      <td style={{ whiteSpace: 'nowrap', fontSize: '.82rem' }}>
                        {e.joiningDate ? fmtDate(e.joiningDate) : <Blank />}
                      </td>
                    )}
                    <td className="ed-chev" aria-hidden>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!error && employees.length > 0 && view === 'card' && (
        <div className="ed-cards" style={{ opacity: loading ? .55 : 1, transition: 'opacity .15s' }}>
          {employees.map((e) => (
            <Link key={e._id} to={`${base}/employees/${e._id}`} className="ed-card">
              <div className="ed-card__head">
                <Avatar name={e.name} src={e.profileImage} size={46} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="ed-card__name">
                    {e.name}{e.employeeId && <span> — {e.employeeId}</span>}
                  </div>
                  <div className="ed-card__role">
                    {e.designation || <span className="ed-none">No designation</span>}
                  </div>
                </div>
                {e.employmentStatus && e.employmentStatus !== 'active' && (
                  <Badge variant={STATUS_TONE[e.employmentStatus]}>{STATUS_LABEL[e.employmentStatus]}</Badge>
                )}
              </div>

              <div className="ed-card__facts">
                <Fact icon={<MailIcon />} title={e.officialEmail}>{e.officialEmail}</Fact>
                <Fact icon={<PinIcon />} title={e.department || 'No department'}>
                  {e.department || <span className="ed-none">No department</span>}
                </Fact>
                <Fact icon={<PhoneIcon />}>
                  {e.officialPhone || <span className="ed-none">No phone</span>}
                </Fact>
                <Fact icon={<BookIcon />} title={(e.subjects || []).join(', ')}>
                  {e.subjects?.length ? e.subjects.join(', ') : <span className="ed-none">No subjects</span>}
                </Fact>
                {e.reportingManager
                  ? <Fact icon={<UserIcon />} wide title={e.reportingManager.name}>
                      Reports to {e.reportingManager.name}
                    </Fact>
                  : (e.classes?.length > 0 && (
                      <Fact icon={<UserIcon />} wide title={e.classes.map((c) => c.label).join(', ')}>
                        {e.classes.map((c) => c.label).join(' · ')}
                      </Fact>
                    ))}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Page size sits with the pager, where the reader is already deciding
          how to move through the list. */}
      {!error && employees.length > 0 && (page_data.total > PAGE_SIZES[0] || page_data.pages > 1) && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginTop: 18,
        }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.82rem', color: 'var(--text-muted)' }}>
            Show
            <select className="form-control" style={{ width: 'auto', padding: '5px 28px 5px 10px', fontSize: '.82rem' }}
              value={limit} aria-label="Employees per page"
              onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            per page
          </label>
          <div style={{ flex: 1, minWidth: 220 }}>
            <Pagination page={page_data.page} pages={page_data.pages} total={page_data.total} onPage={setPage} />
          </div>
        </div>
      )}
    </div>
  );
}
