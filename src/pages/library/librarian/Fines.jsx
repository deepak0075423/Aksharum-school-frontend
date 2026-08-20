import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFines, collectFine, waiveFine, getClassList, downloadFile } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner, Pagination } from '../../../components/ui/index';
import MemberPicker from '../../../components/library/MemberPicker';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';
const money   = (n) => `₹${(n || 0).toLocaleString('en-IN')}`;
const today   = () => new Date().toISOString().slice(0, 10);

const TYPE_LABEL = { late_return: 'Late return', lost: 'Lost book', damaged: 'Damaged book' };

export default function LibraryFines() {
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [roleFilter,   setRoleFilter]   = useState('');
  const [classFilter,  setClassFilter]  = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');   // one member's fines
  const [from, setFrom] = useState('');
  const [to,   setTo]   = useState('');
  const [page, setPage] = useState(1);

  const filters = {
    status:    statusFilter  || undefined,
    fineType:  typeFilter    || undefined,
    role:      roleFilter    || undefined,
    classId:   classFilter   || undefined,
    sectionId: sectionFilter || undefined,
    userId:    memberFilter  || undefined,
    from:      from || undefined,
    to:        to   || undefined,
  };

  const { data, meta, loading, refetch } = useFetch(
    () => getFines({ ...filters, page, limit: 20 }),
    [statusFilter, typeFilter, roleFilter, classFilter, sectionFilter, memberFilter, from, to, page],
  );
  const fines   = Array.isArray(data) ? data : [];
  // Totals describe the whole filtered set, not the page on screen.
  const summary = meta?.summary;

  const [classes, setClasses] = useState([]);
  useEffect(() => {
    getClassList().then(res => setClasses(res?.data || [])).catch(() => setClasses([]));
  }, []);
  const sections = classes.find(c => c._id === classFilter)?.sections || [];

  const filtersOn = statusFilter || typeFilter || roleFilter || classFilter
    || sectionFilter || memberFilter || from || to;
  const resetFilters = () => {
    setStatusFilter(''); setTypeFilter(''); setRoleFilter(''); setClassFilter('');
    setSectionFilter(''); setMemberFilter(''); setFrom(''); setTo(''); setPage(1);
  };

  const exportFines = () =>
    toast.promise(downloadFile('/library/fines', { ...filters, format: 'xlsx' }, 'library_fines.xlsx'), {
      loading: 'Preparing the file…', success: 'Downloaded', error: (e) => e?.message || 'Export failed',
    });

  const [waiveModal,  setWaiveModal]  = useState(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveLoad,   setWaiveLoad]   = useState(false);

  const handleCollect = async (id) => {
    try { await collectFine(id); toast.success('Payment recorded'); refetch(); }
    catch (err) { toast.error(err?.message || 'Could not record the payment'); }
  };

  const handleWaive = async () => {
    if (!waiveReason.trim()) return toast.error('A reason is required to waive a fine');
    setWaiveLoad(true);
    try {
      await waiveFine(waiveModal._id, { reason: waiveReason.trim() });
      toast.success('Fine waived — the member has been notified');
      setWaiveModal(null); setWaiveReason(''); refetch();
    } catch (err) { toast.error(err?.message || 'Could not waive the fine'); }
    finally { setWaiveLoad(false); }
  };

  const statusColor = { pending: 'warning', paid: 'success', waived: 'muted' };

  const columns = [
    { key: 'user',    label: 'Member',   render: r => <div><div style={{ fontWeight:600 }}>{r.user?.name||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.user?.email||''}</div></div> },
    { key: 'issued',  label: 'Issued',   render: r => fmtDate(r.issuance?.issueDate) },
    { key: 'due',     label: 'Was Due',  render: r => fmtDate(r.issuance?.dueDate) },
    { key: 'type',    label: 'Reason',   render: r => TYPE_LABEL[r.fineType] || r.fineType || '—' },
    { key: 'days',    label: 'Days Late',render: r => r.daysOverdue || '—' },
    { key: 'amount',  label: 'Amount',   render: r => <strong>₹{(r.amount||0).toLocaleString()}</strong> },
    { key: 'status',  label: 'Status',   render: r => (
      <div>
        <Badge variant={statusColor[r.status]||'muted'}>{r.status}</Badge>
        {r.status === 'waived' && r.waiverReason && (
          <div style={{ fontSize:'.72rem', color:'var(--text-muted)', marginTop:2 }}>{r.waiverReason}</div>
        )}
      </div>
    )},
    { key: 'actions', label: '', render: r => r.status === 'pending' && (
      <div style={{ display:'flex', gap:4 }}>
        <Button size="sm" onClick={() => handleCollect(r._id)}>Collect</Button>
        <button className="btn btn-secondary btn-sm" onClick={() => { setWaiveReason(''); setWaiveModal(r); }}>Waive</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Library Fines" subtitle="What is owed, what was collected, and what was written off"
        action={<Button variant="secondary" onClick={exportFines}>⬇ Export</Button>} />

      {/* The headline the page exists to answer, for whatever is filtered —
          not for the twenty rows that happen to be on screen. */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))', gap:12, marginBottom:16 }}>
        <SummaryTile label="Outstanding" tone="var(--danger)"  data={summary?.pending} />
        <SummaryTile label="Collected"   tone="var(--success)" data={summary?.paid} />
        <SummaryTile label="Written off" tone="var(--text-muted)" data={summary?.waived} />
        <SummaryTile label="All fines"   tone="var(--text)"    data={summary?.total} />
      </div>

      <div className="card">
        <div className="card-header" style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select className="form-control" style={{ width:140 }} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="pending">Outstanding</option>
            <option value="paid">Collected</option>
            <option value="waived">Written off</option>
          </select>

          <select className="form-control" style={{ width:150 }} value={typeFilter}
            onChange={e => { setTypeFilter(e.target.value); setPage(1); }}>
            <option value="">All reasons</option>
            <option value="late_return">Late return</option>
            <option value="lost">Lost book</option>
            <option value="damaged">Damaged book</option>
          </select>

          <select className="form-control" style={{ width:140 }} value={roleFilter}
            disabled={!!memberFilter}
            title={memberFilter ? 'Clear the member to filter by role' : undefined}
            onChange={e => {
              setRoleFilter(e.target.value);
              if (e.target.value !== 'student') { setClassFilter(''); setSectionFilter(''); }
              setPage(1);
            }}>
            <option value="">Students & staff</option>
            <option value="student">Students</option>
            <option value="teacher">Teachers</option>
          </select>

          {roleFilter !== 'teacher' && (
            <>
              <select className="form-control" style={{ width:140 }} value={classFilter}
                disabled={!!memberFilter}
                onChange={e => { setClassFilter(e.target.value); setSectionFilter(''); setPage(1); }}>
                <option value="">All classes</option>
                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>
              <select className="form-control" style={{ width:130 }} value={sectionFilter}
                disabled={!classFilter || !!memberFilter}
                onChange={e => { setSectionFilter(e.target.value); setPage(1); }}>
                <option value="">{classFilter ? 'All sections' : 'Pick a class'}</option>
                {sections.map(sec => <option key={sec._id} value={sec._id}>{sec.name}</option>)}
              </select>
            </>
          )}

          <input type="date" className="form-control" style={{ width:150 }} value={from} max={to || today()}
            onChange={e => { setFrom(e.target.value); setPage(1); }} title="Raised on or after" />
          <input type="date" className="form-control" style={{ width:150 }} value={to} min={from || undefined} max={today()}
            onChange={e => { setTo(e.target.value); setPage(1); }} title="Raised on or before" />

          {/* "What does this child owe?" is the question the counter gets. */}
          <MemberPicker compact placeholder="Search member…" role={roleFilter || undefined}
            value={memberFilter} onChange={(id) => { setMemberFilter(id); setPage(1); }} />

          {filtersOn && <button className="btn btn-secondary btn-sm" onClick={resetFilters}>Clear</button>}
        </div>
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={fines} emptyIcon="💵" emptyTitle="No fines found" />}
        </div>
        {meta?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} /></div>}
      </div>

      <Modal open={!!waiveModal} onClose={() => setWaiveModal(null)} title="Waive Fine"
        footer={<><Button variant="secondary" onClick={() => setWaiveModal(null)}>Cancel</Button>
          <Button onClick={handleWaive} loading={waiveLoad}>Waive</Button></>}>
        <p style={{ marginBottom:12, color:'var(--text-muted)' }}>
          Waive ₹{(waiveModal?.amount||0).toLocaleString()} fine for <strong>{waiveModal?.user?.name}</strong>?
        </p>
        <div className="form-group"><label className="form-label required">Reason</label>
          <textarea className="form-control" rows={2} value={waiveReason}
            onChange={e => setWaiveReason(e.target.value)} placeholder="Why is this being written off?" /></div>
      </Modal>
    </div>
  );
}

// One figure and the count behind it. A total with no count reads as a single
// large fine rather than the many small ones a library actually collects.
const SummaryTile = ({ label, tone, data }) => (
  <div className="card">
    <div className="card-body" style={{ padding: '12px 16px' }}>
      <div className="text-muted text-sm">{label}</div>
      <strong style={{ fontSize: '1.25rem', color: tone, fontVariantNumeric: 'tabular-nums' }}>
        {money(data?.amount)}
      </strong>
      <div className="text-muted text-sm">
        {data?.count ?? 0} fine{(data?.count ?? 0) === 1 ? '' : 's'}
      </div>
    </div>
  </div>
);
