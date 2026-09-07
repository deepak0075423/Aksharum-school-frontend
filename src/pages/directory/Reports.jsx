/**
 * Employee Directory → Reports.
 *
 * Ten reports, all built server-side from the same employee set the directory
 * lists and through the same `matches()` filter. That last part is what this
 * screen is built around: the filters below are sent with the request AND with
 * the download, so the table and the spreadsheet are the same rows. The old
 * screen ignored that and always exported the whole school.
 *
 * No report carries Aadhaar, PAN, bank or salary columns — an export cannot
 * leak what the profile screen masks.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  listReports, getReport, downloadReport, getMeta, getDashboard,
} from '../../api/employeeDirectory.api';
import { Empty, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { ErrorState, SkeletonRows, useDirectoryBase } from './parts';
import { Crumbs, ListFoot, PageTop, Pick, SearchBox } from './employeeParts';
import { Cell, ExportNote, ReportTabs, SortHead, Tile, metaFor, sortRows } from './reportsParts';

const PAGE_SIZES = [10, 25, 50, 100];

const EMPTY = { search: '', department: '', designation: '', employmentType: '', status: '' };

export default function Reports() {
  const { base } = useDirectoryBase();

  const { data: catalogue, loading: catLoading, error: catError, refetch } = useFetch(listReports, []);
  const { data: meta } = useFetch(getMeta, []);
  const { data: dash } = useFetch(getDashboard, []);

  const [active, setActive]   = useState('directory');
  const [filters, setFilters] = useState(EMPTY);
  const [draft, setDraft]     = useState('');
  const [sort, setSort]       = useState({ by: null, dir: 'asc' });
  const [page, setPage]       = useState(1);
  const [limit, setLimit]     = useState(10);
  const [busy, setBusy]       = useState('');

  // A keystroke is not a search; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, search: draft })); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [draft]);

  // Only what is actually set travels — an empty value would narrow nothing and
  // only makes the query string harder to read.
  const query = useMemo(
    () => Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
    [filters],
  );
  const queryKey = JSON.stringify(query);

  const { data: report, loading, error } = useFetch(
    () => getReport(active, query),
    [active, queryKey],
  );

  const set = (patch) => { setFilters((f) => ({ ...f, ...patch })); setPage(1); };
  const clearAll = () => { setFilters(EMPTY); setDraft(''); setPage(1); };
  const anyFilter = Object.keys(query).length > 0;

  const onSort = (index) => {
    setSort((s) => (s.by === index
      ? { by: index, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { by: index, dir: 'asc' }));
    setPage(1);
  };

  // Sorting and paging are local: the whole report is already here.
  const rows  = useMemo(() => sortRows(report?.rows || [], sort), [report, sort]);
  const pages = Math.max(1, Math.ceil(rows.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = rows.slice(start, start + limit);

  const grab = async (format) => {
    setBusy(format);
    toast.loading('Building the file…', { id: 'edrexp' });
    try {
      // The same filters the table is showing, so the file matches the screen.
      await downloadReport(active, format, query);
      toast.success(`${format.toUpperCase()} downloaded`, { id: 'edrexp' });
    } catch {
      toast.error('Export failed — please try again', { id: 'edrexp' });
    } finally { setBusy(''); }
  };

  const totals = dash?.totals || {};
  const reports = catalogue?.reports || [];
  const current = reports.find((r) => r.key === active);
  const m = metaFor(active);

  if (catLoading) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Reports" />
        <PageTop title="Reports" subtitle="Built from your school's employee records." />
        <SkeletonRows rows={6} cols={4} />
      </div>
    );
  }
  if (catError) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Reports" />
        <PageTop title="Reports" />
        <ErrorState error={catError} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="page edl edrpg">
      <Crumbs base={base} here="Reports" />

      <PageTop
        title="Reports"
        subtitle="Ten views of your school's employee records. Filter one, read it here, then take the same rows away as a file.">
        <button type="button" className="btn btn-secondary" onClick={() => grab('csv')} disabled={!!busy}>
          <Icon name="download" size={16} /> CSV
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => grab('xlsx')} disabled={!!busy}>
          <Icon name="download" size={16} /> Excel
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
          <Icon name="files" size={16} /> Print
        </button>
      </PageTop>

      {/* The school as a whole, whatever the report below is filtered to. */}
      <div className="edl-stats no-print">
        <Tile icon="users" tone="indigo" value={totals.employees} label="Employees"
          caption={dash?.growthPct ? `↑ ${dash.growthPct}% joined this year` : 'On the books today'}
          captionTone={dash?.growthPct ? 'up' : undefined} />
        <Tile icon="userCircle" tone="green" value={totals.active} label="Active"
          caption={totals.employees ? `${Math.round((totals.active / totals.employees) * 100)}% of the school` : '—'} />
        <Tile icon="power" tone="pink" value={totals.inactive} label="Inactive"
          caption={totals.onLeave ? `${totals.onLeave} on leave as well` : 'Nobody deactivated'} />
        <Tile icon="userPlus" tone="blue" value={totals.newJoiners} label="New joiners"
          caption={dash?.academicYear ? `In ${dash.academicYear}` : 'This academic year'} />
        <Tile icon="checkCircle" tone="amber" value={totals.pendingVerification} label="Pending verification"
          captionTone={totals.pendingVerification ? 'down' : undefined}
          caption={totals.pendingVerification ? 'Still to be signed off' : 'All signed off'} />
      </div>

      <ReportTabs reports={reports} active={active}
        onPick={(k) => { setActive(k); setSort({ by: null, dir: 'asc' }); setPage(1); }} />

      <section className="card edl-card-wrap">
        <header className="edrhead">
          <span className={`edrhead__icon tint-${m.tone}`}><Icon name={m.icon} size={20} /></span>
          <div>
            <h2>{current?.label || report?.label || 'Report'}</h2>
            {m.desc ? <p>{m.desc}</p> : null}
          </div>
          {/* `total` from the server is already the FILTERED count — it counts
              the rows it built, after matches(). So there is no "of N" to show
              here without a second, unfiltered request nobody needs. */}
          <span className="edrhead__count">
            {loading ? '…' : `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}${anyFilter ? ' · filtered' : ''}`}
          </span>
        </header>

        <div className="edl-bar no-print">
          <SearchBox value={draft} onChange={setDraft}
            placeholder="Search by name, employee ID, email or phone…" />
          <Pick value={filters.department} onChange={(v) => set({ department: v })}
            all="All departments" label="Filter by department" options={meta?.filters?.departments || []} />
          <Pick value={filters.designation} onChange={(v) => set({ designation: v })}
            all="All designations" label="Filter by designation" options={meta?.filters?.designations || []} />
          <Pick value={filters.employmentType} onChange={(v) => set({ employmentType: v })}
            all="All employment types" label="Filter by employment type"
            options={meta?.filters?.employmentTypes || []} />
          <Pick value={filters.status} onChange={(v) => set({ status: v })}
            all="Any status" label="Filter by status" options={meta?.filters?.statuses || []} />
          {anyFilter && (
            <button type="button" className="btn btn-secondary" onClick={clearAll}>
              <Icon name="refresh" size={15} /> Reset
            </button>
          )}
        </div>

        <div className="edl-body">
          <ExportNote filtered={rows.length} anyFilter={anyFilter} />

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
          )}
          {error && <ErrorState error={error} title="Could not build this report" />}

          {!loading && !error && report && (
            rows.length === 0
              ? (
                <Empty icon="📄" title={anyFilter ? 'Nothing matches these filters' : 'Nothing to report'}
                  message={anyFilter
                    ? 'Try widening the filters — the report itself is fine.'
                    : 'No employee records fall into this report yet.'} />
              )
              : (
                <div className="table-wrap">
                  <table className="table edl-table edrtable">
                    <thead>
                      <tr>
                        <th className="edrtable__num">#</th>
                        {report.columns.map((c, i) => (
                          <SortHead key={c} label={c} index={i} sort={sort} onSort={onSort} />
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {/* A report row is a positional array with no id of its
                          own — the position IS its identity here. */}
                      {shown.map((row, i) => (
                        <tr key={start + i}>
                          <td className="edrtable__num">{start + i + 1}</td>
                          {row.map((cell, j) => <td key={j}><Cell value={cell} /></td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          )}
        </div>

        {!loading && !error && rows.length > 0 && (
          <ListFoot
            page={Math.min(page, pages)} pages={pages} total={rows.length}
            limit={limit} count={shown.length} noun="row"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} sizes={PAGE_SIZES}
          />
        )}
      </section>

      {/* Printing should give the report, not the application around it. */}
      <style>{'@media print{.no-print,.sidebar,.header,.breadcrumb,.edl-foot{display:none!important}.page{padding:0}.card{border:none}}'}</style>
    </div>
  );
}
