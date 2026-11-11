/**
 * Employee Directory → Profile Verification.
 *
 * A queue, not a report: the job is to look at each employee's evidence and
 * sign the sections off. So the screen is built around that one action, and the
 * rule behind it is unchanged — the Verify button stays disabled until the
 * evidence has actually been opened, and a document-backed section with nothing
 * uploaded cannot be verified at all (the server refuses it too).
 *
 * Three ways through the same queue: by employee (the default), by section —
 * for working one kind of paperwork at a time — and the employees who are
 * blocked because nothing has been uploaded for them yet.
 *
 * Two more tabs work on the documents themselves (documentParts.jsx): every
 * upload waiting for a decision — Verify, or Reject with a reason the employee
 * is shown — and the reminders that chase what is still owed.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getVerificationQueue, setVerification, downloadReport, getEmployee, revealField,
  getDocumentDesk, reviewEmployeeDocument, sendDocumentReminders,
} from '../../api/employeeDirectory.api';
import { Empty } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { ErrorState, SkeletonRows, useDirectoryBase } from './parts';
import { Crumbs, ListFoot, PageTop, Pick, SearchBox, StatTile } from './employeeParts';
import {
  BySection, EmployeeCell, Lightbox, MissingDocuments, ProgressCell, REVEALS, Reviewer,
  SectionProgress, StateBadge, VerificationRing, stateOf, summarise,
} from './verificationParts';
import { DocumentQueue, RejectDialog, ReminderBoard, ReminderDialog } from './documentParts';

const PAGE_SIZES = [12, 24, 48, 96];

const STATES = [
  { value: 'verified', label: 'Fully verified' },
  { value: 'partly',   label: 'In progress' },
  { value: 'none',     label: 'Not started' },
  { value: 'blocked',  label: 'Waiting on an upload' },
];

const SORTS = [
  { value: 'least', label: 'Least verified first' },
  { value: 'most',  label: 'Most verified first' },
  { value: 'name',  label: 'Name (A–Z)' },
];

export default function Verification() {
  const { base } = useDirectoryBase();
  const { data, loading, error, refetch } = useFetch(getVerificationQueue, []);
  const desk = useFetch(getDocumentDesk, []);

  // ?employee=<id> opens that reviewer straight away, so the dashboard's
  // "pending verification" tile can link to one person. With ?tab=documents
  // (a "document re-submitted" notification) it narrows the document queue to
  // that person instead.
  const [params, setParams] = useSearchParams();
  const startTab = ['documents', 'reminders', 'sections', 'missing'].includes(params.get('tab')) ? params.get('tab') : 'employees';
  const [open, setOpen] = useState(() => (startTab === 'employees' ? params.get('employee') || '' : ''));
  const [focus, setFocus] = useState(() => (startTab === 'documents' ? params.get('employee') || '' : ''));
  const [seen, setSeen] = useState(() => new Set());
  const [busy, setBusy] = useState('');
  // The record behind the open row. The queue carries the documents and the
  // statuses; the VALUES a reviewer checks live on the employee, so they are
  // fetched once per person and kept — reopening a row must not re-fetch.
  const [details, setDetails] = useState({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  // The sensitive numbers, in full, once a section has asked for them. Each read
  // is written to the activity log server-side, so they are fetched when the
  // section is opened rather than pre-loaded with the row.
  const [revealed, setRevealed] = useState({});
  const [doc, setDoc] = useState(null);   // the document opened over the page

  const [tab,    setTab]    = useState(startTab);
  const [docFilter, setDocFilter] = useState(() => (startTab === 'documents' && params.get('employee') ? 'all' : 'todo'));
  const [remindFilter, setRemindFilter] = useState('owing');
  const [docBusy, setDocBusy] = useState('');
  const [rejecting, setRejecting] = useState(null);   // the document being rejected
  const [reminding, setReminding] = useState(null);   // [employees] a reminder is being written for
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState('');
  const [state,  setState]  = useState('');
  const [section, setSection] = useState('');   // set from the rail
  const [sort,   setSort]   = useState('least');
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(12);
  const [openSection, setOpenSection] = useState('');
  const [exporting, setExporting] = useState(false);

  const employees = useMemo(() => data?.employees || [], [data]);
  const totals    = useMemo(() => data?.sectionTotals || [], [data]);
  const stats     = useMemo(() => summarise(employees), [employees]);

  const mark = (key) => {
    setSeen((s) => new Set(s).add(key));
    // Reviewing a section means reading its values, so an administrative screen
    // shows them in full — via the endpoint that records each read.
    const [employeeId, sectionKey] = key.split(':');
    const fields = REVEALS[sectionKey] || [];
    for (const field of fields) {
      if (revealed[employeeId]?.[field] !== undefined) continue;
      revealField(employeeId, field)
        .then((res) => {
          const v = (res?.data ?? res)?.value;
          if (v) setRevealed((r) => ({ ...r, [employeeId]: { ...r[employeeId], [field]: v } }));
        })
        // 404 is "not on file" and 403 is "not your data to see" — both leave
        // the masked value on screen, which already says as much.
        .catch(() => {});
    }
  };

  useEffect(() => {
    if (!open || details[open]) return undefined;
    let alive = true;
    setLoadingDetail(true);
    getEmployee(open)
      .then((res) => { if (alive) setDetails((d) => ({ ...d, [open]: res?.data ?? res })); })
      .catch((err) => { if (alive) toast.error(err.message || 'Could not load that record'); })
      .finally(() => { if (alive) setLoadingDetail(false); });
    return () => { alive = false; };
  }, [open, details]);

  // Verifying is the only write this screen makes. Putting a section back to
  // pending is not offered here — it would undo somebody's sign-off from a list
  // view, with no record of why.
  const verify = async (employeeId, sectionKey) => {
    setBusy(`${employeeId}:${sectionKey}`);
    try {
      await setVerification(employeeId, { section: sectionKey, status: 'verified' });
      toast.success('Section verified');
      refetch();
    } catch (err) { toast.error(err.message || 'Could not update'); }
    finally { setBusy(''); }
  };

  // Keep the tab in the address, so a reload or a shared link lands back here.
  const pickTab = (t) => {
    setTab(t);
    const next = new URLSearchParams(params);
    if (t === 'employees') next.delete('tab'); else next.set('tab', t);
    if (t !== 'documents') { next.delete('employee'); setFocus(''); }
    setParams(next, { replace: true });
  };

  const deskEmployees = useMemo(() => desk.data?.employees || [], [desk.data]);
  const deskCounts = desk.data?.counts || {};
  const focusName = focus ? deskEmployees.find((x) => x._id === focus)?.name : '';

  // One document's decision. Both lists are read again afterwards: the queue
  // carries each section's documents, the desk carries what is owed.
  const decide = async (doc, status, comment = '') => {
    setDocBusy(`${doc.employee}:${doc.key}:${status}`);
    try {
      await reviewEmployeeDocument(doc.employee, doc.key, { status, comment, fileName: doc.fileName });
      toast.success(status === 'verified'
        ? `${doc.label} verified`
        : `${doc.label} rejected — ${doc.employeeName || 'the employee'} has been asked to upload it again`);
      setRejecting(null);
      refetch();
      desk.refetch();
    } catch (err) { toast.error(err.message || 'Could not save that'); }
    finally { setDocBusy(''); }
  };

  const remind = async ({ message, email }) => {
    setSending(true);
    try {
      const res = await sendDocumentReminders({ employeeIds: reminding.map((x) => x._id), message, email });
      const out = res?.data ?? res;
      const n = out.sent?.length || 0;
      if (n) toast.success(n === 1 ? `Reminder sent to ${out.sent[0].name}` : `${n} reminders sent`);
      if (out.skipped?.length) toast(`${out.skipped.length} skipped — nothing outstanding`, { icon: 'ℹ️' });
      setReminding(null);
      desk.refetch();
    } catch (err) { toast.error(err.message || 'Could not send the reminders'); }
    finally { setSending(false); }
  };

  const exportQueue = async () => {
    setExporting(true);
    toast.loading('Building the spreadsheet…', { id: 'verexp' });
    try {
      // The report that matches the tab, so the file and the screen agree.
      await downloadReport(tab === 'missing' ? 'missing-documents' : 'pending-verification', 'xlsx');
      toast.success('Downloaded', { id: 'verexp' });
    } catch (e) {
      toast.error(e?.message || 'Could not build the file', { id: 'verexp' });
    } finally { setExporting(false); }
  };

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const out = employees.filter((e) => {
      const st = stateOf(e);
      if (state === 'blocked') {
        if (!e.sections.some((s) => s.missingDocuments)) return false;
      } else if (state && st !== state) return false;
      // Picked from the rail: the people this section is still waiting on.
      if (section && (e.sections.find((s) => s.section === section)?.status) === 'verified') return false;
      if (term && !`${e.name} ${e.employeeId || ''} ${e.designation || ''} ${e.department || ''}`
        .toLowerCase().includes(term)) return false;
      return true;
    });
    const byName = (a, b) => a.name.localeCompare(b.name);
    return out.sort((a, b) => {
      switch (sort) {
        case 'most': return b.verifiedCount - a.verifiedCount || byName(a, b);
        case 'name': return byName(a, b);
        default:     return a.verifiedCount - b.verifiedCount || byName(a, b);
      }
    });
  }, [employees, term, state, section, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = filtered.slice(start, start + limit);
  const anyFilter = !!term || !!state || !!section;
  const clearAll = () => { setSearch(''); setState(''); setSection(''); setPage(1); };

  const sectionLabel = totals.find((t) => t.section === section)?.label;

  // Only the FIRST load replaces the page. Verifying a section refetches the
  // queue, and swapping the table for a skeleton mid-review unmounted the row
  // being worked on and threw the reader back to the top of the page.
  if (loading && !data) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Verification" />
        <PageTop title="Profile Verification" subtitle="Check each employee's paperwork and sign it off, section by section." />
        <SkeletonRows rows={8} cols={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Verification" />
        <PageTop title="Profile Verification" />
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  if (!employees.length) {
    return (
      <div className="page edl">
        <Crumbs base={base} here="Verification" />
        <PageTop title="Profile Verification" />
        <Empty icon="🔎" title="No employees yet"
          message="Verification appears once your school has staff records." />
      </div>
    );
  }

  return (
    <div className="page edl">
      <Crumbs base={base} here="Verification" />

      <PageTop
        title="Profile Verification"
        subtitle="Check each employee's paperwork and sign it off, section by section. A section is only verifiable once its evidence has been opened.">
        <button type="button" className="btn btn-secondary" onClick={exportQueue} disabled={exporting}>
          <Icon name="download" size={16} /> Export {tab === 'missing' ? 'missing documents' : 'the queue'}
        </button>
      </PageTop>

      <div className="edl-stats">
        <StatTile icon={<Icon name="users" size={22} />} tone="indigo" value={stats.total}
          label="Employees" caption="With a profile to check"
          on={!state} onClick={() => { setState(''); setSection(''); setPage(1); }} />
        <StatTile icon={<Icon name="checkCircle" size={22} />} tone="green" value={stats.verified}
          label="Fully verified" caption={`${stats.pct}% of the school`}
          on={state === 'verified'} onClick={() => { setState(state === 'verified' ? '' : 'verified'); setPage(1); }} />
        <StatTile icon={<Icon name="clock" size={22} />} tone="amber" value={stats.pending}
          label="Still pending" caption={`${stats.partly} started, ${stats.none} untouched`}
          on={state === 'partly'} onClick={() => { setState(state === 'partly' ? '' : 'partly'); setPage(1); }} />
        <StatTile icon={<Icon name="alert" size={22} />} tone={stats.blocked ? 'pink' : 'blue'}
          value={stats.blocked} label="Waiting on an upload"
          captionTone={stats.blocked ? 'down' : undefined}
          caption={stats.blocked ? 'Nothing to check yet' : 'Nothing is blocked'}
          on={state === 'blocked'} onClick={() => { setState(state === 'blocked' ? '' : 'blocked'); setPage(1); }} />
      </div>

      {/* The rail describes sections; the two document tabs work on documents
          and people, and need the width for their tables. */}
      <div className={`orggrid${tab === 'documents' || tab === 'reminders' ? ' orggrid--solo' : ''}`}>
        <section className="card edl-card-wrap">
          <div className="orgtabs">
            <button type="button" className={`orgtab${tab === 'employees' ? ' is-on' : ''}`}
              aria-pressed={tab === 'employees'} onClick={() => pickTab('employees')}>
              <Icon name="users" size={16} /> By employee
            </button>
            <button type="button" className={`orgtab${tab === 'documents' ? ' is-on' : ''}`}
              aria-pressed={tab === 'documents'} onClick={() => pickTab('documents')}>
              <Icon name="fileCheck" size={16} /> Documents
              {deskCounts.awaitingReview > 0 && <em>{deskCounts.awaitingReview}</em>}
            </button>
            <button type="button" className={`orgtab${tab === 'reminders' ? ' is-on' : ''}`}
              aria-pressed={tab === 'reminders'} onClick={() => pickTab('reminders')}>
              <Icon name="bell" size={16} /> Reminders
              {deskCounts.followUpDue > 0 && <em>{deskCounts.followUpDue}</em>}
            </button>
            <button type="button" className={`orgtab${tab === 'sections' ? ' is-on' : ''}`}
              aria-pressed={tab === 'sections'} onClick={() => pickTab('sections')}>
              <Icon name="checkSquare" size={16} /> By section
            </button>
            <button type="button" className={`orgtab${tab === 'missing' ? ' is-on' : ''}`}
              aria-pressed={tab === 'missing'} onClick={() => pickTab('missing')}>
              <Icon name="files" size={16} /> Waiting on uploads
              {stats.blocked > 0 && <em>{stats.blocked}</em>}
            </button>
          </div>

          {tab === 'employees' && (
            <>
              <div className="edl-bar">
                <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }}
                  placeholder="Search by name, employee ID, designation or department…" />
                <Pick value={state} onChange={(v) => { setState(v); setPage(1); }}
                  all="Any state" label="Filter by verification state" options={STATES} />
                <Pick value={sort} onChange={(v) => { setSort(v); setPage(1); }}
                  label="Sort employees" options={SORTS} defaultValue="least" />
              </div>

              <div className="edl-results">
                <span className="edl-results__count">
                  {filtered.length} of {employees.length} employees
                  {section ? ` still waiting on ${sectionLabel}` : anyFilter ? ' matching' : ''}
                </span>
                {anyFilter && (
                  <div className="edl-results__right">
                    <button type="button" className="edl-hint__btn" onClick={clearAll}>Clear filters</button>
                  </div>
                )}
              </div>

              <div className="edl-body">
                {shown.length === 0
                  ? <Empty icon="🔍" title="Nobody matches" message="Try another state or search term." />
                  : (
                    <div className="table-wrap">
                      <table className="table edl-table">
                        <thead>
                          <tr>
                            <th className="vercol-num">#</th>
                            <th>Employee</th>
                            <th className="vercol-prog">Verified</th>
                            <th className="vercol-state">State</th>
                            <th className="edl-table__acts">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {shown.map((e, i) => (
                            <React.Fragment key={e._id}>
                              <tr className={open === e._id ? 'is-open' : undefined}>
                                <td className="vercol-num">{start + i + 1}</td>
                                <td><EmployeeCell employee={e} base={base} /></td>
                                <td className="vercol-prog"><ProgressCell employee={e} /></td>
                                <td className="vercol-state"><StateBadge employee={e} /></td>
                                <td className="edl-table__acts">
                                  <button type="button" className="btn btn-secondary btn-sm"
                                    onClick={() => setOpen(open === e._id ? '' : e._id)}>
                                    {open === e._id ? 'Close' : 'Review'}
                                  </button>
                                </td>
                              </tr>
                              {open === e._id && (
                                <tr className="verrow--review">
                                  <td colSpan={5}>
                                    <Reviewer employee={e} detail={details[e._id]}
                                      loadingDetail={loadingDetail && !details[e._id]}
                                      revealed={revealed[e._id]} onOpenDoc={setDoc}
                                      seen={seen} onSeen={mark} busy={busy} onVerify={verify}
                                      docBusy={docBusy}
                                      onVerifyDoc={(d) => decide(d, 'verified')}
                                      onRejectDoc={setRejecting} />
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
              </div>

              <ListFoot
                page={Math.min(page, pages)} pages={pages} total={filtered.length}
                limit={limit} count={shown.length} noun="employee"
                onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }} sizes={PAGE_SIZES}
              />
            </>
          )}

          {(tab === 'documents' || tab === 'reminders') && (
            <>
              <div className="edl-bar">
                <SearchBox value={search} onChange={setSearch}
                  placeholder={tab === 'documents' ? 'Search by employee or document…' : 'Search by name, employee ID or designation…'} />
              </div>
              {tab === 'documents' && focus && (
                <div className="edl-results">
                  <span className="edl-results__count">Showing {focusName || 'one employee'}&rsquo;s documents</span>
                  <div className="edl-results__right">
                    <button type="button" className="edl-hint__btn" onClick={() => {
                      setFocus('');
                      const next = new URLSearchParams(params); next.delete('employee'); setParams(next, { replace: true });
                    }}>Show everyone</button>
                  </div>
                </div>
              )}
              <div className="edl-body">
                {desk.loading && !desk.data ? <SkeletonRows rows={6} cols={4} />
                  : desk.error ? <ErrorState error={desk.error} onRetry={desk.refetch} />
                    : tab === 'documents'
                      ? (
                        <DocumentQueue employees={deskEmployees} focus={focus} filter={docFilter} onFilter={setDocFilter}
                          search={search} busyKey={docBusy} base={base} onOpen={setDoc}
                          onVerify={(d) => decide(d, 'verified')} onReject={setRejecting} />
                      )
                      : (
                        <ReminderBoard employees={deskEmployees} followUpAfterDays={desk.data?.followUpAfterDays || 3}
                          filter={remindFilter} onFilter={setRemindFilter} search={search} base={base}
                          onRemind={setReminding} />
                      )}
              </div>
            </>
          )}

          {tab === 'sections' && (
            <div className="edl-body">
              <BySection totals={totals} employees={employees} base={base}
                open={openSection} onToggle={(s) => setOpenSection(openSection === s ? '' : s)} />
            </div>
          )}

          {tab === 'missing' && (
            <div className="edl-body">
              <MissingDocuments employees={employees} base={base} />
            </div>
          )}
        </section>

        {tab !== 'documents' && tab !== 'reminders' && (
        <aside className="card orgrail">
          <header className="orgrail__head">
            <h2>Where the school stands</h2>
          </header>
          <div className="orgrail__body">
            <VerificationRing stats={stats} />

            <h3 className="verrail__title">Sections</h3>
            <p className="verrail__hint">
              {totals.length} per employee. Pick one to see who it is still waiting on.
            </p>
            <SectionProgress totals={totals} picked={section}
              onPick={(s) => { setSection(s); pickTab('employees'); setPage(1); }} />
          </div>
        </aside>
        )}
      </div>

      <Lightbox doc={doc} onClose={() => setDoc(null)} />
      <RejectDialog target={rejecting} busy={!!docBusy} onClose={() => setRejecting(null)}
        onConfirm={(comment) => decide(rejecting, 'rejected', comment)} />
      <ReminderDialog employees={reminding} busy={sending} onClose={() => setReminding(null)} onSend={remind} />
    </div>
  );
}
