/**
 * Every application of the school: search, filters (kept in the address),
 * bulk moves and assignment, and exports. Filtering, sorting and paging all
 * happen on the server; the page holds one page of rows.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { admin } from '../../../api/admission.api';
import Tabs from '../../../components/ui/Tabs';
import {
  Page, Head, Panel, Btn, Chip, StatusChip, DocChip, FeeChip, Table, Pager, Toolbar, SearchBox, Select, Input,
  Empty, ErrorBox, Spin, Dialog, Field, TextArea, Note, Person, useLoad, useSelection,
} from '../admUI';
import { fmtDate, errMsg, plural } from '../meta';
import { useAdmission, useQueryState, useDebounced, RoundSelect, ClassSelect, YearSelect, StaffSelect, StatusSelect, openFile, REASON_STATUSES } from './parts';
import BackgroundExport from './ExportJobs';

const BASE = '/admin/admissions';
const VIEWS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'In progress' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'pending', label: 'Awaiting approval' },
  { key: 'duplicates', label: 'Possible duplicates' },
  { key: 'closed', label: 'Closed' },
];
const SORTS = [
  ['submitted', 'Newest submitted'], ['oldest', 'Oldest submitted'], ['updated', 'Recently changed'], ['status', 'Longest in status'],
  ['name', 'Student name'], ['number', 'Application number'], ['created', 'Newest started'],
];
const DEFAULTS = { view: 'all', q: '', status: '', stage: '', round: '', class: '', academicYear: '', assignedTo: '', docStatus: '', fee: '', source: '', from: '', to: '', sort: 'submitted', page: '1' };

export default function Applications() {
  const adm = useAdmission();
  const nav = useNavigate();
  const [q, setQ] = useQueryState(DEFAULTS);
  const [search, setSearch] = useState(q.q);
  const term = useDebounced(search);
  React.useEffect(() => { if (term !== q.q) setQ({ q: term }); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  const sel = useSelection();
  const [bulk, setBulk] = useState(null);   // 'move' | 'assign'
  const [more, setMore] = useState(!!(q.docStatus || q.fee || q.source || q.from || q.to || q.academicYear));

  const params = {
    q: q.q, status: q.status, stage: q.stage, round: q.round, class: q.class, academicYear: q.academicYear, assignedTo: q.assignedTo,
    docStatus: q.docStatus, fee: q.fee, source: q.source, from: q.from, to: q.to, sort: q.sort, page: q.page, limit: 25,
    ...(q.view === 'pending' ? { pending: '1' } : q.view === 'duplicates' ? { duplicates: '1' } : ['active', 'submitted', 'closed'].includes(q.view) ? { view: q.view } : {}),
  };
  const { data, meta, loading, error, reload } = useLoad(() => admin.applications(params), [JSON.stringify(params)]);
  const rows = data || [];

  const exportAs = (format) => {
    const { page, limit, ...rest } = params; // eslint-disable-line no-unused-vars
    openFile(admin.exportUrl({ ...rest, format }), { download: true, filename: `applications-${new Date().toISOString().slice(0, 10)}.${format}` });
  };
  const clear = () => { setSearch(''); setQ({ ...DEFAULTS, view: q.view }); };
  const filtered = ['status', 'stage', 'round', 'class', 'academicYear', 'assignedTo', 'docStatus', 'fee', 'source', 'from', 'to', 'q'].some((k) => q[k]);

  return (
    <Page>
      <Head eyebrow="Admissions" title="Applications" subtitle="Every application, from first draft to enrolment.">
        <Btn icon="download" onClick={() => exportAs('xlsx')}>Excel</Btn>
        <Btn icon="download" onClick={() => exportAs('csv')}>CSV</Btn>
        <Btn icon="filePdf" onClick={() => exportAs('pdf')}>PDF</Btn>
        <BackgroundExport kind="applications" params={params} label="Large export…" />
      </Head>

      <Tabs variant="line" value={q.view} onChange={(v) => { sel.clear(); setQ({ view: v }); }}
        items={VIEWS.map((v) => ({ ...v, count: v.key === 'all' && meta?.facets ? Object.values(meta.facets).reduce((a, b) => a + b, 0) : undefined }))} />

      <Panel pad={false}>
        <Toolbar>
          <SearchBox value={search} onChange={setSearch} placeholder="Name, application no., phone or email" />
          <StatusSelect value={q.status} onChange={(v) => setQ({ status: v })} />
          <RoundSelect value={q.round} onChange={(v) => setQ({ round: v, class: '' })} />
          <ClassSelect value={q.class} round={q.round} onChange={(v) => setQ({ class: v })} />
          <StaffSelect value={q.assignedTo} onChange={(v) => setQ({ assignedTo: v })} placeholder="Anyone assigned" none="Not assigned" ariaLabel="Assigned to" />
          <Select value={q.sort} onChange={(e) => setQ({ sort: e.target.value })} aria-label="Sort">
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <Btn kind="ghost" size="sm" icon="filter" onClick={() => setMore(!more)}>{more ? 'Fewer filters' : 'More filters'}</Btn>
          {filtered ? <Btn kind="ghost" size="sm" onClick={clear}>Clear</Btn> : null}
          {q.stage ? (
            // Set by a stage digest notification: the applications waiting in one stage.
            <Btn size="sm" kind="soft" icon="close" onClick={() => setQ({ stage: '' })} title="Show every stage">
              Stage: {adm.catalogs?.stages?.find((x) => x.key === q.stage)?.label || q.stage}
            </Btn>
          ) : null}
        </Toolbar>
        {more ? (
          <Toolbar>
            <YearSelect value={q.academicYear} onChange={(v) => setQ({ academicYear: v })} />
            <Select value={q.docStatus} onChange={(e) => setQ({ docStatus: e.target.value })} aria-label="Documents">
              <option value="">Any documents</option>
              <option value="missing">Documents missing</option>
              <option value="under_review">Documents to review</option>
              <option value="rejected">Documents rejected</option>
              <option value="verified">Documents verified</option>
            </Select>
            <Select value={q.fee} onChange={(e) => setQ({ fee: e.target.value })} aria-label="Fees">
              <option value="">Any fees</option>
              <option value="application_due">Application fee due</option>
              <option value="admission_due">Admission fee due</option>
            </Select>
            <Input value={q.source} onChange={(e) => setQ({ source: e.target.value })} placeholder="Source" aria-label="Source" style={{ width: 140 }} data-text="words" />
            <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>Submitted from <Input type="date" value={q.from} onChange={(e) => setQ({ from: e.target.value })} style={{ width: 150 }} /></label>
            <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>to <Input type="date" value={q.to} onChange={(e) => setQ({ to: e.target.value })} style={{ width: 150 }} /></label>
          </Toolbar>
        ) : null}
        {sel.ids.size ? (
          <div className="adm-bulkbar">
            <b>{plural(sel.ids.size, 'application')} selected</b>
            <Btn size="sm" kind="primary" icon="repeat" onClick={() => setBulk('move')}>Change status</Btn>
            <Btn size="sm" icon="userPlus" onClick={() => setBulk('assign')}>Assign</Btn>
            <Btn size="sm" kind="ghost" onClick={sel.clear}>Clear selection</Btn>
          </div>
        ) : null}
        {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
          <>
            <Table rows={rows} selection={sel} onRow={(r) => nav(`${BASE}/applications/${r._id}`)}
              empty={<Empty icon="files" title={filtered ? 'No application matches these filters' : 'No applications yet'}>{filtered ? 'Try clearing a filter.' : 'Applications appear here as families start them on the portal.'}</Empty>}
              columns={[
                { key: 'student', label: 'Student', render: (r) => <Person name={r.studentName || 'Not named yet'} sub={r.applicationNumber || 'Draft'} to={`${BASE}/applications/${r._id}`} /> },
                { key: 'class', label: 'Class', render: (r) => <>{r.className || '—'}<div className="adm-muted" style={{ fontSize: '.74rem' }}>{r.roundName}</div></> },
                { key: 'status', label: 'Status', render: (r) => (
                  <div className="adm-row" style={{ gap: 4 }}>
                    <StatusChip status={r.status} />
                    {r.pendingTransition ? <Chip tone="amber" icon="shieldCheck" title={`Waiting for approval: ${adm.statusOf(r.pendingTransition.to).label}`}>Approval</Chip> : null}
                    {r.duplicates ? <Chip tone="red" icon="copy">Duplicate?</Chip> : null}
                  </div>
                ) },
                { key: 'docs', label: 'Documents', render: (r) => <DocChip status={r.docStatus || 'none'} /> },
                { key: 'fees', label: 'Fees', render: (r) => (
                  <div className="adm-row" style={{ gap: 4 }}>
                    {r.applicationFeeStatus && r.applicationFeeStatus !== 'not_required' ? <span title="Application fee"><FeeChip status={r.applicationFeeStatus} /></span> : null}
                    {r.admissionFeeStatus && r.admissionFeeStatus !== 'not_required' ? <span title="Admission fee"><FeeChip status={r.admissionFeeStatus} /></span> : null}
                  </div>
                ) },
                { key: 'contact', label: 'Contact', render: (r) => <>{r.guardianName || r.applicantName || '—'}<div className="adm-muted" style={{ fontSize: '.74rem' }}>{r.guardianPhone || r.applicantEmail}</div></> },
                { key: 'assigned', label: 'Assigned', render: (r) => r.assignedName || <span className="adm-muted">—</span> },
                { key: 'submitted', label: 'Submitted', render: (r) => (r.submittedAt ? fmtDate(r.submittedAt) : <span className="adm-muted">Not yet</span>) },
              ]} />
            <Pager page={Number(meta?.page) || 1} pages={meta?.pages || 1} total={meta?.total || 0} onPage={(p) => setQ({ page: p }, { keepPage: true })} label="applications" />
          </>
        )}
      </Panel>

      <BulkMove open={bulk === 'move'} ids={[...sel.ids]} onClose={() => setBulk(null)} onDone={() => { sel.clear(); reload(); }} />
      <BulkAssign open={bulk === 'assign'} ids={[...sel.ids]} onClose={() => setBulk(null)} onDone={() => { sel.clear(); reload(); }} />
    </Page>
  );
}

function BulkResult({ r }) {
  if (!r) return null;
  return (
    <Note tone={r.failed.length ? 'amber' : 'green'} icon={r.failed.length ? 'alert' : 'checkCircle'}>
      {r.done} done{r.failed.length ? `, ${r.failed.length} not:` : '.'}
      {r.failed.length ? <ul style={{ margin: '6px 0 0 18px' }}>{r.failed.slice(0, 8).map((f) => <li key={f.id}>{f.message}</li>)}</ul> : null}
    </Note>
  );
}

function BulkMove({ open, ids, onClose, onDone }) {
  const adm = useAdmission();
  const [to, setTo] = useState('');
  const [remarks, setRemarks] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  React.useEffect(() => { if (open) { setTo(''); setRemarks(''); setResult(null); } }, [open]);
  const needReason = REASON_STATUSES.includes(to);
  const go = async () => {
    setBusy(true);
    try {
      const r = await admin.bulk({ ids, action: 'transition', to, remarks: remarks.trim() });
      setResult(r.data);
      if (r.data.done) onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const movable = (adm.catalogs?.statuses || []).filter((s) => !s.system);
  return (
    <Dialog open={open} onClose={onClose} title={`Change the status of ${plural(ids.length, 'application')}`} width={520}
      footer={result ? <Btn kind="primary" onClick={onClose}>Done</Btn> : <><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!to || (needReason && !remarks.trim())} onClick={go}>Apply</Btn></>}>
      {result ? <BulkResult r={result} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Note icon="info">Each application is checked on its own: one the workflow does not allow to move is left as it is and listed afterwards.</Note>
          <Field label="Move to" required>
            <Select value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose a status</option>
              {movable.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Message to the families" required={needReason} hint={needReason ? 'Required — each family is told why.' : 'Optional.'}>
            <TextArea rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} maxLength={1000} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}

function BulkAssign({ open, ids, onClose, onDone }) {
  const [userId, setUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  React.useEffect(() => { if (open) { setUserId(''); setResult(null); } }, [open]);
  const go = async () => {
    setBusy(true);
    try {
      const r = await admin.bulk({ ids, action: 'assign', userId: userId === 'none' ? null : userId });
      setResult(r.data);
      if (r.data.done) onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title={`Assign ${plural(ids.length, 'application')}`} width={460}
      footer={result ? <Btn kind="primary" onClick={onClose}>Done</Btn> : <><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!userId} onClick={go}>Assign</Btn></>}>
      {result ? <BulkResult r={result} /> : (
        <Field label="Assign to" hint="They see these applications under their admission duties.">
          <StaffSelect value={userId} onChange={setUserId} none="Nobody (unassign)" />
        </Field>
      )}
    </Dialog>
  );
}
