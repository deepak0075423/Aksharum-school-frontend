/**
 * Employee Directory — All Employees.
 *
 * Search, filtering, sorting and paging all happen on the server: the browser
 * receives one page at a time and never the whole staff table. The headcounts
 * above the list are counted over every row the caller may see, not the filtered
 * page, so the summary describes the school rather than the filter in force.
 *
 * Two tiers share this screen. A teacher looking a colleague up gets the list
 * and the fields their level is entitled to; an administrator additionally gets
 * the staff-type, status and employment filters, and the three header actions.
 * Every one of those is re-checked server-side — this only decides what to draw.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { getMeta, getEmployees, downloadReport, bulkEmployment } from '../../api/employeeDirectory.api';
import { Badge, Button, Empty, Modal, Select } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  Avatar, Chips, SkeletonRows, SkeletonCards, ErrorState, Blank, fmtDate,
  STATUS_TONE, STATUS_LABEL, STAGE_LABEL, useDirectoryBase,
} from './parts';
import {
  ActiveChips, Crumbs, EmployeeCard, Field, ListFoot, MenuItem, MenuSep,
  MoreFiltersButton, MorePanel, PageTop, Pick, RowMenu, SearchBox, StatTile,
  ViewToggle, activeCount, useShownView,
} from './employeeParts';

const VIEW_KEY  = 'employeeDirectory.view';
const PAGE_SIZES = [12, 24, 48, 96];

// Every filter maps to one query parameter the API understands.
const EMPTY = {
  search: '', department: '', designation: '', staffType: '', employmentType: '',
  status: '', subject: '', classId: '', sectionId: '', joiningYear: '',
  reportingManager: '', verification: '', completion: '',
  // 'year' = joined since the academic year began (the Reports "New joiners" tile).
  joined: '',
  // Where the employment stands (probation, notice…), and who owes the office a document.
  stage: '', owed: '',
  // Active by default. 'all' and 'inactive' are one pick away, and Clear returns
  // here rather than to "everyone", so the list keeps its meaning.
  accountStatus: 'active',
};

// The bar shows four; everything else lives behind More Filters, so the row
// fits on one line at any width the app is used at.
const IN_BAR = ['department', 'designation', 'employmentType', 'status'];

const SORTS = [
  { value: 'name:asc',         label: 'Name (A–Z)' },
  { value: 'name:desc',        label: 'Name (Z–A)' },
  { value: 'employeeId:asc',   label: 'Employee ID' },
  { value: 'joiningDate:desc', label: 'Newest joiners' },
  { value: 'joiningDate:asc',  label: 'Longest serving' },
  { value: 'designation:asc',  label: 'Designation' },
  { value: 'department:asc',   label: 'Department' },
  { value: 'completion:asc',   label: 'Least complete profile' },
];
// What a colleague lookup may sort by: only what its rows carry (the server
// ignores the rest for that reader anyway).
const OPEN_SORTS = ['name:asc', 'name:desc', 'employeeId:asc', 'designation:asc', 'department:asc'];
const PAGE_DEFAULT = 12;

export default function Employees() {
  const { base, isDirectoryAdmin, canManageAccounts } = useDirectoryBase();
  const navigate = useNavigate();
  const [urlParams, setUrlParams] = useSearchParams();

  // A link from the overview can pre-apply a filter.
  const [filters, setFilters] = useState(() => {
    const seed = { ...EMPTY };
    for (const k of Object.keys(EMPTY)) {
      const v = urlParams.get(k);
      if (v) seed[k] = v;
    }
    return seed;
  });
  const [draft, setDraft] = useState(filters.search);
  const [page,  setPage]  = useState(() => Math.max(1, Number(urlParams.get('page')) || 1));
  const [limit, setLimit] = useState(() => (PAGE_SIZES.includes(Number(urlParams.get('limit'))) ? Number(urlParams.get('limit')) : PAGE_DEFAULT));
  const [sort,  setSort]  = useState(() => {
    const by  = urlParams.get('sortBy');
    const dir = urlParams.get('sortDir') || 'asc';
    return by ? `${by}:${dir}` : 'name:asc';
  });
  const [showMore, setShowMore] = useState(false);
  const [view, setView] = useState(() => localStorage.getItem(VIEW_KEY) || 'card');
  // A phone always gets the cards (no Grid / List switch there).
  const shownView = useShownView(view);
  const [exporting, setExporting] = useState(false);
  // Rows ticked for a change made to many people at once (administrators, list view).
  const [picked, setPicked] = useState(() => new Set());
  const [bulk, setBulk] = useState(null);   // 'department' | 'manager'

  // The chosen layout is the reader's, so it outlives the page.
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

  // Debounce the search box so a keystroke does not become a request.
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      // Only a search that actually changed goes back to page one — the page
      // the address arrived with must survive the box settling on mount.
      setFilters((f) => {
        if (f.search === draft.trim()) return f;
        setPage(1);
        return { ...f, search: draft.trim() };
      });
    }, 350);
    return () => clearTimeout(timer.current);
  }, [draft]);

  const { data: meta } = useFetch(getMeta, []);
  const [sortBy, sortDir] = sort.split(':');

  const params = useMemo(() => {
    const p = { page, limit, sortBy, sortDir };
    for (const [k, v] of Object.entries(filters)) if (v) p[k] = v;
    return p;
  }, [filters, page, limit, sortBy, sortDir]);
  const key = JSON.stringify(params);

  // The filters, the sort and the page live in the address: Back from a
  // profile returns to the same list, and a link to it can be shared.
  useEffect(() => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(filters)) if (v && v !== EMPTY[k]) next.set(k, v);
    if (filters.accountStatus !== EMPTY.accountStatus) next.set('accountStatus', filters.accountStatus);
    if (sort !== 'name:asc') { next.set('sortBy', sortBy); next.set('sortDir', sortDir); }
    if (page > 1) next.set('page', String(page));
    if (limit !== PAGE_DEFAULT) next.set('limit', String(limit));
    if (next.toString() !== urlParams.toString()) setUrlParams(next, { replace: true });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, loading, error, refetch } = useFetch(() => getEmployees(params), [key]);

  // The last page that actually arrived. Holding it while the next request is in
  // flight means paging and typing never blank the list — the rows dim instead.
  const [shown, setShown] = useState(null);
  useEffect(() => { if (data) setShown(data); }, [data]);
  const pageData = data || shown;
  // The server answers with the last page when the one asked for is past the
  // end (the list shrank); follow it, so the pager and the rows agree.
  useEffect(() => { if (data?.page && data.page !== page) setPage(data.page); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  // A tick belongs to the rows it was made on.
  useEffect(() => { setPicked(new Set()); }, [key]);

  const set = (k, v) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };
  const clearAll = () => { setFilters(EMPTY); setDraft(''); setPage(1); };

  const opts  = meta?.filters || {};
  const stats = pageData?.stats || {};
  const employees = pageData?.employees || [];
  const sections = filters.classId
    ? (opts.sections || []).filter((s) => s.classId === filters.classId)
    : (opts.sections || []);

  const share = (n) => (stats.employees > 0 ? `${Math.round((n / stats.employees) * 100)}% of total` : '—');

  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast.success(`${what} copied`); }
    catch { toast.error(`Could not copy the ${what.toLowerCase()}`); }
  };

  const exportList = async () => {
    setExporting(true);
    toast.loading('Building the spreadsheet…', { id: 'edexp' });
    try {
      // The same filters the list is showing, so the file matches the screen.
      const { page: _p, limit: _l, ...scoped } = params;
      await downloadReport('directory', 'xlsx', scoped);
      toast.success('Downloaded', { id: 'edexp' });
    } catch { toast.error('Export failed', { id: 'edexp' }); }
    finally { setExporting(false); }
  };

  // ── What is in force, as removable chips ───────────────────────────────────
  const labelFor = {
    department: 'Department', designation: 'Designation', staffType: 'Staff type',
    employmentType: 'Employment', status: 'Status', subject: 'Subject',
    classId: 'Class', sectionId: 'Section', joiningYear: 'Joined',
    reportingManager: 'Reports to', verification: 'Verification', completion: 'Profile',
    accountStatus: 'Account', joined: 'Joined', stage: 'Employment', owed: 'Documents',
  };
  const valueFor = (k, v) => {
    if (k === 'classId')   return (opts.classes  || []).find((c) => c._id === v)?.label || v;
    if (k === 'sectionId') return (opts.sections || []).find((s) => s._id === v)?.label || v;
    if (k === 'subject')   return (opts.subjects || []).find((s) => s._id === v)?.label || v;
    if (k === 'reportingManager') return (opts.managers || []).find((m) => m._id === v)?.label || v;
    if (k === 'staffType') return v === 'teaching' ? 'Teaching' : 'Non-Teaching';
    if (k === 'joined') return 'This academic year';
    if (k === 'stage') return v === 'none' ? 'Not stated' : (STAGE_LABEL[v] || v);
    if (k === 'owed') return v === 'missing' ? 'Not uploaded' : 'Owed to the office';
    return String(v).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  };
  const chips = Object.entries(filters)
    .filter(([k, v]) => v && v !== EMPTY[k] && k !== 'search')
    .map(([k, v]) => ({
      key: k, label: labelFor[k] || k, value: valueFor(k, v),
      onRemove: () => set(k, EMPTY[k]),
    }));

  const filterCount = activeCount(filters, EMPTY, ['search', ...IN_BAR]);
  const anyFilter   = chips.length > 0 || !!filters.search;

  const noneAtAll = !loading && !error && employees.length === 0 && pageData?.grandTotal === 0;
  const noMatches = !loading && !error && employees.length === 0 && pageData?.grandTotal > 0;

  const toggleAccount = (want) => set('accountStatus', filters.accountStatus === want ? 'all' : want);
  const toggleStaff   = (want) => set('staffType',     filters.staffType === want ? '' : want);

  const sorts = isDirectoryAdmin ? SORTS : SORTS.filter((x) => OPEN_SORTS.includes(x.value));
  const allPicked = employees.length > 0 && employees.every((e) => picked.has(e._id));
  const tick = (id) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="page edl">
      <Crumbs base={base} here="All Employees" />

      <PageTop
        title="All Employees"
        subtitle="Browse and manage your school’s staff — subjects, classes and how to reach them.">
        {/* Adding and importing are the school administrator's own screens
            (Admin → Teachers); a teacher who administers the directory is not
            let into them, so the two buttons are theirs alone. */}
        {canManageAccounts && (
          <>
            <Link className="btn btn-primary" to="/admin/teachers?new=1">
              <Icon name="plus" size={16} /> Add Employee
            </Link>
            <Link className="btn btn-secondary" to="/admin/teachers?import=1">
              <Icon name="upload" size={16} /> Import
            </Link>
          </>
        )}
        {isDirectoryAdmin && (
          <button type="button" className="btn btn-secondary" onClick={exportList} disabled={exporting}>
            <Icon name="download" size={16} /> Export
          </button>
        )}
      </PageTop>

      {/* The tiles describe the school, and each one sets the filter it names. */}
      <div className="edl-stats">
        {/* A colleague lookup lists the staff who work here: for that reader
            the total IS the list, and account state is not theirs to browse. */}
        {isDirectoryAdmin ? (
          <StatTile icon={<Icon name="users" size={22} />} tone="indigo" value={stats.employees}
            label="Total Employees"
            captionTone={stats.growthPct > 0 ? 'up' : undefined}
            caption={stats.growthPct == null ? 'On the books today' : `↑ ${stats.growthPct}% joined this year`}
            on={filters.accountStatus === 'all'} onClick={() => set('accountStatus', 'all')} />
        ) : (
          <StatTile icon={<Icon name="users" size={22} />} tone="indigo" value={stats.employees}
            label="Employees" caption="Working here now"
            on={!filters.staffType} onClick={() => set('staffType', '')} />
        )}
        {isDirectoryAdmin && (
          <StatTile icon={<Icon name="userCircle" size={22} />} tone="green" value={stats.active}
            label="Active Employees" caption={share(stats.active ?? 0)}
            on={filters.accountStatus === 'active'} onClick={() => toggleAccount('active')} />
        )}
        {isDirectoryAdmin && (
          <StatTile icon={<Icon name="power" size={22} />} tone="pink" value={stats.inactive}
            label="Inactive Employees" caption={share(stats.inactive ?? 0)}
            on={filters.accountStatus === 'inactive'} onClick={() => toggleAccount('inactive')} />
        )}
        <StatTile icon={<Icon name="teacher" size={22} />} tone="blue" value={stats.teaching}
          label="Teaching Staff" caption={share(stats.teaching ?? 0)}
          on={filters.staffType === 'teaching'}
          onClick={() => toggleStaff('teaching')} />
        <StatTile icon={<Icon name="badge" size={22} />} tone="amber" value={stats.nonTeaching}
          label="Non-Teaching Staff" caption={share(stats.nonTeaching ?? 0)}
          on={filters.staffType === 'non_teaching'}
          onClick={() => toggleStaff('non_teaching')} />
      </div>

      <section className="card edl-card-wrap">
        <div className="edl-bar">
          <SearchBox value={draft} onChange={setDraft}
            placeholder="Search by name, employee ID, email, phone…" />
          <Pick value={filters.department} onChange={(v) => set('department', v)}
            all="All Departments" label="Filter by department" options={opts.departments || []} />
          <Pick value={filters.designation} onChange={(v) => set('designation', v)}
            all="All Designations" label="Filter by designation" options={opts.designations || []} />
          {isDirectoryAdmin && (
            <Pick value={filters.employmentType} onChange={(v) => set('employmentType', v)}
              all="All Employment Types" label="Filter by employment type"
              options={opts.employmentTypes || []} />
          )}
          {isDirectoryAdmin && (
            <Pick value={filters.status} onChange={(v) => set('status', v)}
              all="All Status" label="Filter by status" options={opts.statuses || []} />
          )}
          <MoreFiltersButton open={showMore} count={filterCount} onClick={() => setShowMore((v) => !v)} />
        </div>

        {showMore && (
          <MorePanel>
            {isDirectoryAdmin && (
              <Field label="Account">
                <Pick value={filters.accountStatus} onChange={(v) => set('accountStatus', v)}
                  defaultValue="active" label="Account state" options={[
                    { value: 'active', label: 'Active accounts' },
                    { value: 'inactive', label: 'Inactive accounts' },
                    { value: 'all', label: 'All accounts' },
                  ]} />
              </Field>
            )}
            <Field label="Staff type">
              <Pick value={filters.staffType} onChange={(v) => set('staffType', v)}
                all="All staff" label="Staff type" options={opts.staffTypes || []} />
            </Field>
            {isDirectoryAdmin && (
              <Field label="Employment">
                <Pick value={filters.stage} onChange={(v) => set('stage', v)}
                  all="Any stage" label="Employment stage"
                  options={[...(opts.stages || []), { value: 'none', label: 'Not stated' }]} />
              </Field>
            )}
            <Field label="Subject">
              <Pick value={filters.subject} onChange={(v) => set('subject', v)}
                all="Any subject" label="Subject" options={(opts.subjects || []).map((s) => ({ value: s._id, label: s.label }))} />
            </Field>
            <Field label="Class">
              <Pick value={filters.classId} onChange={(v) => { set('classId', v); set('sectionId', ''); }}
                all="Any class" label="Class" options={(opts.classes || []).map((c) => ({ value: c._id, label: c.label }))} />
            </Field>
            <Field label="Section">
              <Pick value={filters.sectionId} onChange={(v) => set('sectionId', v)}
                all="Any section" label="Section" options={sections.map((s) => ({ value: s._id, label: s.label }))} />
            </Field>
            {isDirectoryAdmin && (
              <Field label="Joined in">
                <Pick value={filters.joiningYear} onChange={(v) => set('joiningYear', v)}
                  all="Any year" label="Joining year"
                  options={(opts.joiningYears || []).map((y) => ({ value: String(y), label: String(y) }))} />
              </Field>
            )}
            {isDirectoryAdmin && (
              <Field label="Reports to">
                <Pick value={filters.reportingManager} onChange={(v) => set('reportingManager', v)}
                  all="Anyone" label="Reporting manager"
                  options={(opts.managers || []).map((m) => ({ value: m._id, label: m.label }))} />
              </Field>
            )}
            {isDirectoryAdmin && (
              <Field label="Verification">
                <Pick value={filters.verification} onChange={(v) => set('verification', v)}
                  all="Any state" label="Verification" options={[
                    { value: 'pending', label: 'Pending review' },
                    { value: 'verified', label: 'Fully verified' },
                  ]} />
              </Field>
            )}
            {isDirectoryAdmin && (
              <Field label="Profile">
                <Pick value={filters.completion} onChange={(v) => set('completion', v)}
                  all="Any completeness" label="Profile completion" options={[
                    { value: 'incomplete', label: 'Incomplete' },
                    { value: 'complete', label: 'Complete' },
                  ]} />
              </Field>
            )}
            {isDirectoryAdmin && (
              <Field label="Documents">
                <Pick value={filters.owed} onChange={(v) => set('owed', v)}
                  all="Any" label="Documents owed" options={[
                    { value: 'any', label: 'Owes the office a document' },
                    { value: 'missing', label: 'A required one not uploaded' },
                  ]} />
              </Field>
            )}
          </MorePanel>
        )}

        <ActiveChips items={chips} onClear={clearAll} />

        <div className="edl-results">
          <span className="edl-results__count">
            {pageData
              ? `${pageData.total} employee${pageData.total === 1 ? '' : 's'}${
                pageData.total === pageData.grandTotal ? '' : ` of ${pageData.grandTotal}`}`
              : 'Loading…'}
          </span>
          <div className="edl-results__right">
            <label className="edl-sortby">
              Sort by
              <select className="form-control" value={sort} aria-label="Sort employees"
                onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                {sorts.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <ViewToggle value={view} onChange={setView} />
          </div>
        </div>

        {isDirectoryAdmin && shownView === 'table' && picked.size > 0 && (
          <div className="edl-results" role="region" aria-label="Change the selected employees">
            <span className="edl-results__count">{picked.size} selected</span>
            <div className="edl-results__right" style={{ gap: 8 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBulk('department')}>
                <Icon name="building" size={14} /> Set department
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setBulk('manager')}>
                <Icon name="users" size={14} /> Set reporting manager
              </button>
              <button type="button" className="edl-hint__btn" onClick={() => setPicked(new Set())}>Clear selection</button>
            </div>
          </div>
        )}

        {error && <ErrorState error={error} onRetry={refetch} title="Could not load employees" />}

        {!error && loading && !shown && (
          <div className="edl-body">
            {shownView === 'table' ? <SkeletonRows rows={8} cols={6} /> : <SkeletonCards count={8} />}
          </div>
        )}

        {noneAtAll && (
          <Empty icon="👥" title="No employees yet"
            message="No staff records exist for this school. Add a teacher and they will appear here."
            action={isDirectoryAdmin && (
              <Link className="btn btn-primary" to="/admin/teachers?new=1">+ Add Employee</Link>
            )} />
        )}
        {noMatches && (
          <Empty icon="🔍" title="No employees match these filters"
            message="Try a different department, designation or search term."
            action={<button className="btn btn-secondary" onClick={clearAll}>Clear filters</button>} />
        )}

        {!error && employees.length > 0 && (
          <div className="edl-body" style={{ opacity: loading ? 0.55 : 1 }}>
            {shownView === 'card' ? (
              <div className="edl-cards">
                {employees.map((e) => <EmployeeCard key={e._id} e={e} base={base} onCopy={copy} />)}
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table edl-table">
                  <thead>
                    <tr>
                      {isDirectoryAdmin && (
                        <th style={{ width: 34 }}>
                          <input type="checkbox" aria-label="Select everyone on this page" checked={allPicked}
                            onChange={() => setPicked(allPicked ? new Set() : new Set(employees.map((e) => e._id)))} />
                        </th>
                      )}
                      <th>Employee</th>
                      <th>Role</th>
                      {isDirectoryAdmin && <th>Type &amp; Status</th>}
                      <th>Subjects &amp; Classes</th>
                      <th>Contact</th>
                      {isDirectoryAdmin && <th>Joined</th>}
                      <th className="edl-table__acts">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e) => (
                      <tr key={e._id} data-focus-id={e._id}>
                        {isDirectoryAdmin && (
                          <td>
                            <input type="checkbox" aria-label={`Select ${e.name}`} checked={picked.has(e._id)} onChange={() => tick(e._id)} />
                          </td>
                        )}
                        <td>
                          <div className="ed-emp">
                            <Avatar name={e.name} src={e.profileImage} size={38} />
                            <div style={{ minWidth: 0 }}>
                              <Link to={`${base}/employees/${e._id}`} className="ed-nm">{e.name}</Link>
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
                              {e.employmentStage && e.employmentStage !== 'confirmed' && (
                                <Badge variant="muted">{STAGE_LABEL[e.employmentStage]}</Badge>
                              )}
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
                        <td className="edl-table__acts">
                          <div className="edl-rowacts">
                            <button type="button" className="edl-kebab"
                              onClick={() => navigate(`${base}/employees/${e._id}`)}
                              title="View profile" aria-label={`View ${e.name}`}>
                              <Icon name="eye" size={16} />
                            </button>
                            {/* The eye beside it opens the profile — not repeated here. */}
                            <RowMenu label={`Actions for ${e.name}`}>
                              {e.officialEmail && <MenuItem icon="mail" href={`mailto:${e.officialEmail}`}>Send email</MenuItem>}
                              {e.officialPhone && <MenuItem icon="phone" href={`tel:${e.officialPhone}`}>Call</MenuItem>}
                              <MenuSep />
                              {e.officialEmail && (
                                <MenuItem icon="clipboard" onClick={() => copy(e.officialEmail, 'Email')}>Copy email</MenuItem>
                              )}
                            </RowMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {!error && pageData && (
          <ListFoot
            page={pageData.page} pages={pageData.pages} total={pageData.total}
            limit={limit} count={employees.length} sizes={PAGE_SIZES}
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} />
        )}
      </section>

      <BulkDialog kind={bulk} ids={[...picked]} opts={opts}
        onClose={() => setBulk(null)}
        onDone={() => { setBulk(null); setPicked(new Set()); refetch(); }} />
    </div>
  );
}

/**
 * One change, for everybody ticked. Each person is checked on their own by the
 * server (a manager cannot report to themselves, a loop is refused), and the
 * ones that could not take the change are named rather than stopping the rest.
 */
function BulkDialog({ kind, ids, opts, onClose, onDone }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValue(''); }, [kind]);
  if (!kind) return null;
  const department = kind === 'department';
  const save = async () => {
    setBusy(true);
    try {
      const res = await bulkEmployment(department ? { ids, department: value } : { ids, reportingManager: value });
      const out = res?.data ?? res;
      toast.success(`${out.updated} employee${out.updated === 1 ? '' : 's'} updated`);
      if (out.skipped?.length) {
        toast(`${out.skipped.length} not changed — ${out.skipped.slice(0, 2).map((x) => `${x.name}: ${x.reason}`).join('; ')}${out.skipped.length > 2 ? '…' : ''}`,
          { icon: 'ℹ️', duration: 7000 });
      }
      onDone();
    } catch (err) { toast.error(err.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose}
      title={`${department ? 'Set the department' : 'Set the reporting manager'} for ${ids.length} employee${ids.length === 1 ? '' : 's'}`}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button loading={busy} onClick={save}>Apply to {ids.length}</Button>
      </>}>
      {department ? (
        <Select label="Department" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">No department (unassigned)</option>
          {(opts.departments || []).filter((d) => d !== 'Unassigned').map((d) => <option key={d} value={d}>{d}</option>)}
        </Select>
      ) : (
        <Select label="Reports to" value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Nobody (clear the reporting manager)</option>
          {(opts.managers || []).map((m) => (
            <option key={m._id} value={m._id}>{m.label}{m.designation ? ` — ${m.designation}` : ''}</option>
          ))}
        </Select>
      )}
      <p className="form-hint" style={{ marginTop: 10 }}>
        {department
          ? 'A new department is added on the Departments page first, then chosen here.'
          : 'Anyone this cannot apply to — the manager themselves, or somebody above them — is left as they are and named.'}
      </p>
    </Modal>
  );
}
