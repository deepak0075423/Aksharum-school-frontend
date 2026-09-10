/**
 * Library → Reports.
 *
 * Eight reports, one screen: four figures across the top, the catalogue of
 * reports down the left, and whichever one is open filling the rest — its own
 * summary, its own controls, its rows, and the two things a librarian does with
 * a report once it is on screen, which are export it and print it.
 *
 * The page is built from the server's registry rather than from a list here.
 * A report brings its name, its blurb, the controls it accepts and the columns
 * it answers on, so adding one on the backend adds it here — correctly
 * formatted, correctly filtered — with no edit to this file.
 *
 * Filtering and paging travel with the request. The reports are the biggest
 * lists in the module (an accession register is every copy the library has ever
 * bought), so narrowing them in the browser would mean fetching all of it to
 * throw most of it away, and the footer's count would be a count of the page
 * rather than of the answer.
 *
 * The same page serves school admins at /admin/library/reports and teachers
 * with library administration at /teacher/manage-library/reports.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { useAuth } from '../../../contexts/AuthContext';
import { listReports, runReport, remindOverdue, downloadFile } from '../../../api/library.api';
import { Alert, Button, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  ListTable, ListFooter, RowActions, RowMenu, MenuItem, SelectionBar, useSelection,
} from '../../admin/listParts';
import { Hero, Tile, delta, note, quoteOfTheDay } from './dashParts';
import {
  Cell, Chip, FilterBar, PrintHead, Rail, RangePicker, SummaryStrip,
  fmtDate, money, rangeFor, today, words,
} from './reportParts';

export default function LibraryReports() {
  const { pathname } = useLocation();
  const base = pathname.replace(/\/reports\/?$/, '');
  const { user } = useAuth();

  const { data, meta, loading: loadingIndex, error: indexError } = useFetch(listReports, []);
  const reports = Array.isArray(data) ? data : [];
  const stats   = meta?.stats || {};
  const options = meta?.options || {};

  // Which report is open lives in the URL, so a librarian can bookmark "the
  // fine ledger" and land back on it.
  const [params, setParams] = useSearchParams();
  const report = reports.find((r) => r.key === params.get('report')) || reports[0] || null;

  const [values, setValues] = useState({});
  const [seeded, setSeeded] = useState('');     // which report `values` belong to
  const [search, setSearch] = useState('');
  const [term,   setTerm]   = useState('');
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(10);

  // Opening a report seeds its controls from what the report says it wants —
  // the period it is usually asked over, the grouping it defaults to.
  useEffect(() => {
    if (!report) return;
    const seed = {};
    for (const f of report.filters || []) {
      if (f.type === 'daterange') {
        const r = rangeFor(f.preset);
        seed.from = r.from; seed.to = r.to;
      } else if (f.type === 'date') {
        seed[f.key] = rangeFor(f.preset).from;
      } else if (f.defaultValue) {
        seed[f.key] = f.defaultValue;
      }
    }
    setValues(seed);
    setSearch(''); setTerm(''); setPage(1);
    setSeeded(report.key);
  }, [report?.key]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const setValue = (key, value) => {
    setValues((v) => ({ ...v, [key]: value }));
    setPage(1);
  };

  // Only what carries something travels: an empty select would otherwise arrive
  // as `?classId=` and be asked about.
  const filled = useMemo(() => {
    const out = {};
    for (const [k, v] of Object.entries(values)) if (v !== '' && v != null) out[k] = v;
    if (term) out.q = term;
    return out;
  }, [values, term]);

  // A report that needs a member cannot be run until one is picked — that is a
  // prompt, not an error, so it never reaches the server.
  const missing = (report?.filters || []).find((f) => f.required && !values[f.key]);
  const ready   = !!report && seeded === report.key && !missing;

  const query = useMemo(() => ({ ...filled, page, limit }), [filled, page, limit]);
  const key   = `${report?.key || ''}|${JSON.stringify(query)}|${ready}`;

  const { data: rowsData, meta: run, loading, error } = useFetch(
    () => (ready ? runReport(report.path, query) : Promise.resolve(null)),
    [key],
  );
  const rows    = ready && Array.isArray(rowsData) ? rowsData : [];
  const columns = run?.columns || report?.columns || [];
  const total   = run?.total ?? 0;
  const pages   = run?.pages ?? 1;
  const start   = (Math.min(page, pages) - 1) * limit;

  const selection = useSelection(rows, key);
  const canRemind = report?.action === 'remind';

  // The strip of figures holds its last values while a filter change reloads —
  // blanking it on every keystroke is a flicker — but it is emptied the moment
  // another report is opened, so one report's totals never sit under another
  // report's heading.
  const [figures, setFigures] = useState([]);
  useEffect(() => { setFigures([]); }, [report?.key]);
  useEffect(() => { if (run?.summary) setFigures(run.summary); }, [run]);

  // ── What is narrowing the report, said in words ──────────────────────────
  const chips = useMemo(() => {
    if (!report) return [];
    const out = [];
    for (const f of report.filters || []) {
      if (f.type === 'daterange') {
        if (values.from || values.to) {
          out.push({
            key: 'range',
            label: `${values.from ? fmtDate(values.from) : 'The beginning'} – ${values.to ? fmtDate(values.to) : 'today'}`,
            clear: () => { setValues((v) => ({ ...v, from: '', to: '' })); setPage(1); },
          });
        }
        continue;
      }
      const value = values[f.key];
      if (!value) continue;
      if (f.type === 'search' || f.type === 'member') continue;
      // Grouping by month or by week shapes the report; it does not narrow it,
      // so it is not something to offer to clear.
      if (f.defaultValue) continue;
      const opts  = f.options || options[f.source] || [];
      const label = opts.find((o) => String(o.value) === String(value))?.label || words(value);
      out.push({ key: f.key, label: `${f.label}: ${label}`, clear: () => setValue(f.key, '') });
    }
    if (term) out.push({ key: 'q', label: `Search: ${term}`, clear: () => setSearch('') });
    return out;
  }, [report, values, term, options]);   // eslint-disable-line react-hooks/exhaustive-deps

  const clearAll = () => {
    setValues((v) => {
      const kept = {};
      // The period and the grouping are what the report *is*, not a narrowing
      // of it — clearing them would ask a different question, not a wider one.
      for (const f of report?.filters || []) {
        if (f.type === 'daterange') { kept.from = v.from; kept.to = v.to; }
        if (f.type === 'date' || f.type === 'member') kept[f.key] = v[f.key];
        if (f.defaultValue) kept[f.key] = v[f.key];
      }
      return kept;
    });
    setSearch(''); setPage(1);
  };

  // ── Export, print, chase ─────────────────────────────────────────────────
  const exportSheet = () => {
    if (!report) return;
    toast.promise(
      downloadFile(report.path, { ...filled, format: 'xlsx' }, `${report.key}_${today()}.xlsx`),
      {
        loading: 'Building the spreadsheet…',
        success: 'Downloaded — everything the filters matched, not just this page',
        error: (e) => e?.message || 'Export failed',
      },
    );
  };

  const [reminding, setReminding] = useState(false);
  const remind = async (ids) => {
    if (!ids.length) return;
    setReminding(true);
    try {
      const res = await remindOverdue(ids);
      if (res?.sent) toast.success(`Reminder sent for ${res.sent} loan${res.sent === 1 ? '' : 's'}`);
      // A loan returned or renewed since the page loaded is no longer overdue;
      // saying so is better than quietly sending nothing.
      (res?.skipped || []).forEach((s) => toast(`${s.title} — ${s.reason}`, { icon: 'ℹ️' }));
      if (!res?.sent && !res?.skipped?.length) toast('Nothing to send', { icon: 'ℹ️' });
      selection.clear();
    } catch (err) {
      toast.error(err?.message || 'The reminder could not be sent');
    } finally { setReminding(false); }
  };

  // ── Columns ──────────────────────────────────────────────────────────────
  const tableColumns = useMemo(() => {
    const shown = columns
      .filter((c) => !c.inline)
      .map((c) => ({
        key: c.key,
        className: `librep-col is-${c.type}${c.align === 'right' ? ' is-right' : ''}`,
        label: c.label,
        render: (row) => <Cell column={c} row={row} />,
      }));

    if (!canRemind) return shown;
    return [...shown, {
      key: 'actions',
      className: 'ltable__acts librep-col is-acts',
      label: 'Actions',
      render: (row) => (
        <RowActions>
          <Button size="sm" variant="secondary" loading={reminding} onClick={() => remind([row._id])}>
            <Icon name="mail" size={14} /> Send Reminder
          </Button>
          <RowMenu>
            <MenuItem icon="repeat" to={`${base}/circulation?q=${encodeURIComponent(row.copy || '')}`}>
              Open in circulation
            </MenuItem>
            <MenuItem icon="banknote" to={`${base}/fines?q=${encodeURIComponent(row.member || '')}`}>
              Fines for this member
            </MenuItem>
          </RowMenu>
        </RowActions>
      ),
    }];
  }, [columns, canRemind, reminding, base]);   // eslint-disable-line react-hooks/exhaustive-deps

  const heroQuote = useMemo(() => quoteOfTheDay(3), []);
  const period = `the previous ${stats.periodDays || 30} days`;

  if (loadingIndex) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page libdpg libreppg">
      <Hero
        icon="chart" title="Library Reports"
        tagline="Measure · Explain · Decide"
        subtitle="What the collection is doing — circulation, overdue books, dead stock, fines and usage."
        quote={heroQuote} />

      {indexError && <Alert variant="danger">{indexError}</Alert>}

      <div className="libd-tiles">
        <Tile icon="book" tone="indigo" to={`${base}/books`}
          value={stats.books ?? 0} label="Total books" caption="Titles catalogued"
          trend={delta(stats.booksNew || 0, stats.booksPrev || 0, period)} />

        <Tile icon="repeat" tone="green" to={`${base}/circulation`}
          value={stats.out ?? 0} label="Books issued" caption={`${stats.loans ?? 0} lent in the last ${stats.periodDays || 30} days`}
          trend={delta(stats.loans || 0, stats.loansPrev || 0, period)} />

        <Tile icon="users" tone="blue" to={`${base}/circulation`}
          value={stats.readers ?? 0} label="Active members" caption="Borrowed at least one book"
          trend={delta(stats.readers || 0, stats.readersPrev || 0, period)} />

        <Tile icon="banknote" tone="amber" to={`${base}/fines`}
          value={money(stats.collected ?? 0)} label="Fines collected" caption="Cash and online, taken at the counter"
          trend={stats.collected || stats.collectedPrev
            ? delta(stats.collected || 0, stats.collectedPrev || 0, period)
            : note('Nothing collected either period')} />
      </div>

      <div className="librep-body">
        <Rail reports={reports} active={report?.key}
          onPick={(k) => setParams((p) => { p.set('report', k); return p; }, { replace: true })} />

        {report && (
          <section className="card librep-main">
            <header className="librep-head">
              <span className={`librep-head__icon tint-${report.tone || 'indigo'}`}>
                <Icon name={report.icon} size={18} />
              </span>
              <div>
                <h2>{report.name}</h2>
                <p>{report.blurb}</p>
              </div>
              {(report.filters || []).some((f) => f.type === 'daterange') && (
                <RangePicker from={values.from} to={values.to}
                  onChange={({ from, to }) => { setValues((v) => ({ ...v, from, to })); setPage(1); }} />
              )}
            </header>

            <PrintHead report={report} school={user?.school?.name} chips={chips.map((c) => c.label)}
              shown={rows.length} total={total} />

            <SummaryStrip summary={figures} />

            <FilterBar
              filters={report.filters || []} options={options} values={values}
              onChange={setValue} search={search} onSearch={setSearch}
            >
              <Button variant="secondary" size="sm" onClick={exportSheet} disabled={!ready}>
                <Icon name="download" size={15} /> Export
              </Button>
              <Button variant="secondary" size="sm" onClick={() => window.print()} disabled={!ready || !rows.length}>
                <Icon name="files" size={15} /> Print
              </Button>
            </FilterBar>

            {chips.length > 0 && (
              <div className="librep-tags">
                {chips.map((c) => <Chip key={c.key} label={c.label} onClear={c.clear} />)}
                <button type="button" className="btn btn-secondary btn-sm" onClick={clearAll}>Clear filters</button>
              </div>
            )}

            {error && <div className="librep-alert"><Alert variant="danger">{error}</Alert></div>}

            {canRemind && (
              <SelectionBar count={selection.ids.length} noun="overdue loan" onClear={selection.clear}>
                <Button size="sm" loading={reminding} onClick={() => remind(selection.ids)}>
                  <Icon name="mail" size={15} /> Send reminders
                </Button>
              </SelectionBar>
            )}

            {missing ? (
              <div className="librep-prompt">
                <span className="librep-prompt__icon tint-blue"><Icon name="user" size={22} /></span>
                <b>Pick a member to run this report</b>
                <span>Search by name or admission number above — the report covers everything that member has borrowed.</span>
              </div>
            ) : (
              <>
                <ListTable
                  columns={tableColumns}
                  rows={rows}
                  loading={loading}
                  selection={canRemind ? selection : undefined}
                  startIndex={start}
                  emptyIcon={chips.length ? '🔍' : '✅'}
                  emptyTitle={chips.length ? 'Nothing matches these filters' : 'Nothing to report'}
                  emptyMessage={chips.length
                    ? 'Try a wider period, or clear a filter.'
                    : 'No rows came back — which, for most of these reports, is good news.'}
                  emptyAction={chips.length
                    ? <Button variant="secondary" onClick={clearAll}>Clear filters</Button>
                    : null}
                />

                <ListFooter
                  page={Math.min(page, pages)} pages={pages} total={total}
                  limit={limit} count={rows.length} noun="record"
                  onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
                />
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
