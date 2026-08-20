import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getIssuances, getReturnForm, issueBook, returnBook, renewBook, getBooks, getIssueForm, scanCopy,
  getClassList, downloadFile } from '../../../api/library.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner, Pagination, Alert } from '../../../components/ui/index';
import MemberPicker from '../../../components/library/MemberPicker';
import DropdownPanel, { isInsideDropdown } from '../../../components/ui/DropdownPanel';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }) : '—';

export default function LibraryCirculation() {
  // Everything, unfiltered, is the honest default — a librarian opening this
  // page is as likely to be chasing a return as looking at what is out.
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter,   setRoleFilter]   = useState('');
  const [classFilter,  setClassFilter]  = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [memberFilter, setMemberFilter] = useState('');   // one member's loans
  const [page, setPage] = useState(1);

  const filters = {
    status:    statusFilter  || undefined,
    role:      roleFilter    || undefined,
    classId:   classFilter   || undefined,
    sectionId: sectionFilter || undefined,
    userId:    memberFilter  || undefined,
  };

  const { data, meta, loading, refetch } = useFetch(
    () => getIssuances({ ...filters, page, limit: 20 }),
    [statusFilter, roleFilter, classFilter, sectionFilter, memberFilter, page],
  );
  const issuances = Array.isArray(data) ? data : [];

  // Class and section only narrow students, so they appear with that role.
  const [classes, setClasses] = useState([]);
  useEffect(() => {
    getClassList().then(res => setClasses(res?.data || [])).catch(() => setClasses([]));
  }, []);
  const sections = classes.find(c => c._id === classFilter)?.sections || [];

  const resetFilters = () => {
    setStatusFilter(''); setRoleFilter(''); setClassFilter('');
    setSectionFilter(''); setMemberFilter(''); setPage(1);
  };
  const filtersOn = statusFilter || roleFilter || classFilter || sectionFilter || memberFilter;

  // format=xlsx is what makes this endpoint return a spreadsheet rather than the
  // JSON the table on screen uses; without it the browser saved JSON as .xlsx.
  const exportList = () =>
    toast.promise(downloadFile('/library/issuances', { ...filters, format: 'xlsx' }, 'library_circulation.xlsx'), {
      loading: 'Preparing the file…', success: 'Downloaded', error: (e) => e?.message || 'Export failed',
    });

  // ── Issue Book ───────────────────────────────────────────────────────────────
  const EMPTY_ISSUE = { bookId: '', copyId: '', userId: '', dueDate: '', notes: '' };
  const [issueModal, setIssueModal] = useState(false);
  const [issueForm,  setIssueForm]  = useState(EMPTY_ISSUE);
  const [issueSaving, setIssueSaving] = useState(false);

  // Book search, so the librarian names a title instead of pasting its id.
  const [bookQuery, setBookQuery] = useState('');
  const [bookHits,  setBookHits]  = useState([]);
  const [book,      setBook]      = useState(null);
  const [copies,    setCopies]    = useState([]);
  const bookBoxRef   = useRef(null);
  const bookFieldRef = useRef(null);

  // The hit list is portalled out of the scrolling modal body, so closing on an
  // outside click has to treat the portalled panel as "inside".
  useEffect(() => {
    const away = (e) => { if (!isInsideDropdown(e.target, bookBoxRef.current)) setBookHits([]); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  useEffect(() => {
    if (book || bookQuery.trim().length < 2) { setBookHits([]); return; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const res = await getBooks({ q: bookQuery.trim(), limit: 8 });
        if (live) setBookHits(res?.data || []);
      } catch { if (live) setBookHits([]); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [bookQuery, book]);

  const pickBook = async (b) => {
    setBook(b); setBookHits([]); setBookQuery('');
    setIssueForm(f => ({ ...f, bookId: b._id, copyId: '' }));
    try {
      const res = await getIssueForm({ bookId: b._id });
      setCopies(res?.data?.copies || []);
    } catch (err) { toast.error(err?.message || 'Could not load copies'); setCopies([]); }
  };

  const resetIssue = () => {
    setIssueForm(EMPTY_ISSUE); setBook(null); setCopies([]); setBookQuery(''); setBookHits([]);
  };
  const openIssue = () => { resetIssue(); setIssueModal(true); };

  const handleIssue = async (e) => {
    e.preventDefault();
    if (!issueForm.bookId || !issueForm.copyId || !issueForm.userId)
      return toast.error('Pick a book, a copy and a member');
    setIssueSaving(true);
    try {
      await issueBook(issueForm);
      toast.success('Book issued');
      setIssueModal(false); resetIssue();
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not issue the book'); }
    finally { setIssueSaving(false); }
  };

  // ── Scanner ──────────────────────────────────────────────────────────────────
  // A USB or Bluetooth scanner types the copy code and presses Enter, so this is
  // just a text field that acts on submit. One scan decides the next move.
  const [scanModal, setScanModal] = useState(false);
  const [scanCode,  setScanCode]  = useState('');
  const [scanned,   setScanned]   = useState(null);
  const [scanBusy,  setScanBusy]  = useState(false);

  const openScan = () => { setScanned(null); setScanCode(''); setScanModal(true); };

  const handleScan = async (e) => {
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    setScanBusy(true);
    try {
      const res = await scanCopy(code);
      setScanned(res?.data || null);
      setScanCode('');
    } catch (err) { setScanned(null); toast.error(err?.message || 'Copy not found'); }
    finally { setScanBusy(false); }
  };

  // Scanned a book somebody has out — the desk's next move is a return.
  const scanReturn = async (condition) => {
    setScanBusy(true);
    try {
      const res = await returnBook({ issuanceId: scanned.issuance._id, condition });
      const fine = res?.data?.fine;
      toast.success(fine ? `Returned — ₹${fine.amount} fine raised` : 'Book returned');
      setScanned(null); setScanCode(''); refetch();
    } catch (err) { toast.error(err?.message || 'Could not record the return'); }
    finally { setScanBusy(false); }
  };

  // Scanned a shelf copy — carry it straight into the issue form.
  const scanIssue = () => {
    setIssueForm({ ...EMPTY_ISSUE, bookId: scanned.book._id, copyId: scanned.copy._id });
    setBook(scanned.book);
    setCopies([scanned.copy]);
    setScanModal(false);
    setIssueModal(true);
  };

  // ── Return Book ──────────────────────────────────────────────────────────────
  // Two ways a book arrives at the desk: with the person who borrowed it, or on
  // its own. So the form takes either the member or the copy code, rather than
  // the user id it used to demand.
  const [returnModal,   setReturnModal]  = useState(false);
  const [returnBy,      setReturnBy]     = useState('member');   // 'member' | 'copy'
  const [returnMember,  setReturnMember] = useState(null);
  const [returnCode,    setReturnCode]   = useState('');
  const [returnList,    setReturnList]   = useState([]);
  const [returnLoad,    setReturnLoad]   = useState(false);
  const [returning,     setReturning]    = useState(false);
  const [searched,      setSearched]     = useState(false);

  const openReturn = () => {
    setReturnBy('member'); setReturnMember(null); setReturnCode('');
    setReturnList([]); setSearched(false); setReturnModal(true);
  };

  const loadReturns = async (params) => {
    setReturnLoad(true);
    try {
      const res = await getReturnForm(params);
      setReturnList(res?.data?.issuances || []);
      setSearched(true);
    } catch (err) { toast.error(err?.message || 'Could not load their books'); }
    finally { setReturnLoad(false); }
  };

  // Picking a member loads their books straight away — no second click.
  const pickReturnMember = (id, m) => {
    setReturnMember(m);
    setReturnList([]); setSearched(false);
    if (id) loadReturns({ userId: id });
  };

  const searchByCode = (e) => {
    e.preventDefault();
    if (!returnCode.trim()) return;
    loadReturns({ copyCode: returnCode.trim() });
  };

  // How the book came back. 'good' puts the copy straight back on the shelf;
  // the other two keep it off and charge the borrower for it.
  const [returnCondition, setReturnCondition] = useState({});

  const handleReturn = async (issuanceId) => {
    const condition = returnCondition[issuanceId] || 'good';
    setReturning(true);
    try {
      const res = await returnBook({ issuanceId, condition });
      const fine = res?.data?.fine;
      toast.success(fine ? `Recorded — ₹${fine.amount} fine raised` : 'Book returned');
      setReturnList(prev => prev.filter(i => i._id !== issuanceId));
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not record the return'); }
    finally { setReturning(false); }
  };

  // ── Renew ────────────────────────────────────────────────────────────────────
  const handleRenew = async (id) => {
    try { await renewBook(id); toast.success('Renewed'); refetch(); }
    catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const statusColor = { issued: 'success', returned: 'muted', overdue: 'danger' };

  const columns = [
    { key: 'book',     label: 'Book',    render: r => <div><div style={{ fontWeight:600 }}>{r.book?.title||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.book?.isbn||''}</div></div> },
    { key: 'member',   label: 'Member',  render: r => <div><div>{r.issuedTo?.name||'—'}</div><div style={{ fontSize:'.75rem',color:'var(--text-muted)' }}>{r.issuedToRole||''}</div></div> },
    { key: 'copy',     label: 'Copy',    render: r => r.bookCopy?.uniqueCode || '—' },
    { key: 'issued',   label: 'Issued',  render: r => fmtDate(r.issueDate) },
    { key: 'due',      label: 'Due',     render: r => {
      const overdue = r.status === 'issued' && new Date() > new Date(r.dueDate);
      return <span style={{ color: overdue ? 'var(--danger)' : 'inherit' }}>{fmtDate(r.dueDate)}</span>;
    }},
    { key: 'status',   label: 'Status',  render: r => <Badge variant={statusColor[r.status]||'muted'}>{r.status}</Badge> },
    { key: 'actions',  label: '', render: r => r.status === 'issued' && (
      <div style={{ display:'flex', gap:4 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => handleRenew(r._id)}>Renew</button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader title="Circulation" subtitle="Issue and return books"
        action={
          <div style={{ display:'flex', gap:8 }}>
            <Button variant="secondary" onClick={openScan}>📷 Scan</Button>
            <Button variant="secondary" onClick={openReturn}>Return Book</Button>
            <Button onClick={openIssue}>Issue Book</Button>
          </div>
        } />

      <div className="card">
        <div className="card-header" style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
          <select className="form-control" style={{ width:150 }} value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            <option value="issued">Issued</option>
            <option value="overdue">Overdue</option>
            <option value="returned">Returned</option>
            <option value="lost">Lost</option>
          </select>

          <select className="form-control" style={{ width:140 }} value={roleFilter}
            disabled={!!memberFilter}
            title={memberFilter ? 'Clear the member to filter by role' : undefined}
            onChange={e => {
              setRoleFilter(e.target.value);
              // Class and section describe students only.
              if (e.target.value !== 'student') { setClassFilter(''); setSectionFilter(''); }
              setPage(1);
            }}>
            <option value="">Students & staff</option>
            <option value="student">Students</option>
            <option value="teacher">Teachers</option>
          </select>

          {roleFilter !== 'teacher' && (
            <>
              <select className="form-control" style={{ width:150 }} value={classFilter}
                disabled={!!memberFilter}
                onChange={e => { setClassFilter(e.target.value); setSectionFilter(''); setPage(1); }}>
                <option value="">All classes</option>
                {classes.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
              </select>

              <select className="form-control" style={{ width:140 }} value={sectionFilter}
                disabled={!classFilter || !!memberFilter}
                onChange={e => { setSectionFilter(e.target.value); setPage(1); }}>
                <option value="">{classFilter ? 'All sections' : 'Pick a class first'}</option>
                {sections.map(sec => <option key={sec._id} value={sec._id}>{sec.name}</option>)}
              </select>
            </>
          )}

          {/* One named person's loans — the commonest thing a librarian is
              asked for at the desk. */}
          <MemberPicker compact placeholder="Search member…" role={roleFilter || undefined}
            value={memberFilter} onChange={(id) => { setMemberFilter(id); setPage(1); }} />

          {filtersOn && (
            <button className="btn btn-secondary btn-sm" onClick={resetFilters}>Clear</button>
          )}

          <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
            {meta?.total != null && <span className="text-muted text-sm">{meta.total} record(s)</span>}
            <Button variant="secondary" size="sm" onClick={exportList}>⬇ Export</Button>
          </div>
        </div>
        <div className="card-body" style={{ padding:0 }}>
          {loading ? <div style={{ padding:48, display:'flex', justifyContent:'center' }}><Spinner /></div>
            : <Table columns={columns} data={issuances} emptyIcon="📖" emptyTitle="No issuances found" />}
        </div>
        {meta?.pages > 1 && <div className="card-footer"><Pagination page={page} pages={meta.pages} total={meta.total} onPage={setPage} /></div>}
      </div>

      {/* Issue Modal */}
      <Modal open={issueModal} onClose={() => setIssueModal(false)} title="Issue Book"
        footer={<><Button variant="secondary" onClick={() => setIssueModal(false)}>Cancel</Button>
          <Button form="issue-form" type="submit" loading={issueSaving}>Issue</Button></>}>
        <form id="issue-form" onSubmit={handleIssue}>
          {/* Book: searched by title or ISBN, never typed as an id */}
          <div className="form-group" ref={bookBoxRef}>
            <label className="form-label required">Book</label>
            {book ? (
              <div style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px',
                            border:'1px solid var(--border)', borderRadius:6, background:'var(--bg)' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <strong>{book.title}</strong>
                  <div className="text-muted text-sm">
                    {(book.authors||[]).join(', ') || 'Unknown author'}{book.isbn ? ` · ${book.isbn}` : ''}
                  </div>
                </div>
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => { setBook(null); setCopies([]); setIssueForm(f=>({...f,bookId:'',copyId:''})); }}>Change</button>
              </div>
            ) : (
              <div ref={bookFieldRef}>
                <input className="form-control" autoFocus placeholder="Search by title or ISBN…"
                  value={bookQuery} onChange={e => setBookQuery(e.target.value)} />
              </div>
            )}
            <DropdownPanel anchorRef={bookFieldRef} open={bookHits.length > 0 && !book}>
              {bookHits.map(b => (
                <button key={b._id} type="button" onClick={() => pickBook(b)}
                  style={{ display:'flex', width:'100%', gap:10, alignItems:'center', textAlign:'left',
                           padding:'9px 12px', background:'none', border:0,
                           borderBottom:'1px solid var(--border)', cursor:'pointer' }}>
                  <span style={{ flex:1, minWidth:0 }}>
                    <strong style={{ fontSize:'0.92rem' }}>{b.title}</strong>
                    <span className="text-muted text-sm" style={{ display:'block' }}>
                      {(b.authors||[]).join(', ') || 'Unknown author'}
                    </span>
                  </span>
                  <span className={`badge badge-${(b.availableCopies ?? 0) > 0 ? 'success' : 'danger'}`}>
                    {b.availableCopies ?? 0} free
                  </span>
                </button>
              ))}
            </DropdownPanel>
          </div>

          {book && (
            <div className="form-group">
              <label className="form-label required">Copy</label>
              {copies.length === 0 ? (
                <Alert variant="warning">No copy of this book is on the shelf right now.</Alert>
              ) : (
                <select className="form-control" required value={issueForm.copyId}
                  onChange={e => setIssueForm(f=>({...f,copyId:e.target.value}))}>
                  <option value="">Pick an available copy…</option>
                  {copies.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.uniqueCode}{c.rackLocation ? ` · ${c.rackLocation}` : ''}{c.condition ? ` · ${c.condition}` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <MemberPicker value={issueForm.userId}
            onChange={(id) => setIssueForm(f => ({ ...f, userId: id }))} />

          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Due date</label>
              <input type="date" className="form-control" value={issueForm.dueDate}
                onChange={e => setIssueForm(f=>({...f,dueDate:e.target.value}))} />
              <div className="form-hint">Leave blank to use the policy loan period.</div></div>
            <div className="form-group"><label className="form-label">Notes</label>
              <input className="form-control" value={issueForm.notes}
                onChange={e => setIssueForm(f=>({...f,notes:e.target.value}))} /></div>
          </div>
        </form>
      </Modal>

      {/* Return Modal */}
      <Modal open={returnModal} onClose={() => setReturnModal(false)} title="Return Book" maxWidth={720}
        footer={<Button variant="secondary" onClick={() => setReturnModal(false)}>Close</Button>}>

        <div className="tabs" style={{ marginBottom: 16 }}>
          {[['member', '👤 By member'], ['copy', '🏷 By copy code']].map(([key, label]) => (
            <button key={key} type="button" className={`tab${returnBy === key ? ' active' : ''}`}
              onClick={() => { setReturnBy(key); setReturnList([]); setSearched(false); }}>
              {label}
            </button>
          ))}
        </div>

        {returnBy === 'member' ? (
          <MemberPicker value={returnMember?._id || ''} onChange={pickReturnMember} label="Who is returning it" />
        ) : (
          <form onSubmit={searchByCode}>
            <div className="form-group">
              <label className="form-label">Copy code</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="form-control" autoFocus value={returnCode}
                  placeholder="Scan the spine label, or type LIB-COPY-000042"
                  onChange={e => setReturnCode(e.target.value)} />
                <Button type="submit" loading={returnLoad}>Find</Button>
              </div>
              <div className="form-hint">A scanner types the code and submits on its own.</div>
            </div>
          </form>
        )}

        {returnMember && returnBy === 'member' && (returnMember.overdue > 0 || returnMember.finesDue > 0) && (
          <div style={{ marginBottom: 12 }}>
            <Alert variant="warning">
              {returnMember.name} has
              {returnMember.overdue > 0 ? ` ${returnMember.overdue} overdue book(s)` : ''}
              {returnMember.overdue > 0 && returnMember.finesDue > 0 ? ' and' : ''}
              {returnMember.finesDue > 0 ? ` ₹${returnMember.finesDue} in unpaid fines` : ''}.
            </Alert>
          </div>
        )}

        {returnLoad && <div style={{ padding: 24, display: 'flex', justifyContent: 'center' }}><Spinner /></div>}

        {returnList.length > 0 && (
          <table className="table">
            <thead><tr><th>Book</th><th>Borrower</th><th>Due</th><th>Condition</th><th></th></tr></thead>
            <tbody>
              {returnList.map(i => {
                const late = new Date(i.dueDate) < new Date();
                return (
                <tr key={i._id}>
                  <td><strong>{i.book?.title||'—'}</strong><br /><small>{i.bookCopy?.uniqueCode||''}</small></td>
                  <td>{i.issuedTo?.name || '—'}</td>
                  <td style={late ? { color: 'var(--danger)', fontWeight: 600 } : undefined}>
                    {fmtDate(i.dueDate)}
                    {late && <div style={{ fontSize: '0.72rem' }}>
                      {Math.ceil((Date.now() - new Date(i.dueDate)) / 86400000)} day(s) late
                    </div>}
                  </td>
                  <td>
                    <select className="form-control" style={{ width:120, padding:'4px 8px', fontSize:'0.8rem' }}
                      value={returnCondition[i._id] || 'good'}
                      onChange={e => setReturnCondition(c => ({ ...c, [i._id]: e.target.value }))}>
                      <option value="good">Good</option>
                      <option value="damaged">Damaged</option>
                      <option value="lost">Lost</option>
                    </select>
                  </td>
                  <td><Button size="sm" onClick={() => handleReturn(i._id)} loading={returning}>Return</Button></td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {returnList.length === 0 && searched && !returnLoad && (
          <Alert variant="info">
            {returnBy === 'copy'
              ? `Copy ${returnCode} is not out on loan — nothing to return.`
              : `${returnMember?.name || 'This member'} has no books out.`}
          </Alert>
        )}
      </Modal>

      {/* Scanner — a handheld scanner types the code and submits, so the field
          just needs to stay focused and act on Enter. */}
      <Modal open={scanModal} onClose={() => setScanModal(false)} title="Scan a copy"
        footer={<Button variant="secondary" onClick={() => setScanModal(false)}>Close</Button>}>
        <form onSubmit={handleScan}>
          <div className="form-group">
            <label className="form-label">Copy code</label>
            <input className="form-control" autoFocus value={scanCode}
              placeholder="Scan the spine label, or type LIB-COPY-000042"
              onChange={e => setScanCode(e.target.value)} />
            <div className="form-hint">The scanner submits on its own — no need to press anything.</div>
          </div>
        </form>

        {scanBusy && <div style={{ padding:16, display:'flex', justifyContent:'center' }}><Spinner /></div>}

        {scanned && !scanBusy && (
          <div style={{ marginTop:8, paddingTop:14, borderTop:'1px solid var(--border)' }}>
            <strong style={{ fontSize:'1.02rem' }}>{scanned.book?.title}</strong>
            <div className="text-muted text-sm" style={{ marginBottom:12 }}>
              {scanned.copy?.uniqueCode}
              {scanned.copy?.rackLocation ? ` · ${scanned.copy.rackLocation}` : ''}
              {' · '}{scanned.copy?.status}
            </div>

            {scanned.action === 'return' && (
              <>
                <Alert variant="info">
                  Out with <strong>{scanned.issuance?.issuedTo?.name || 'a member'}</strong>,
                  due {fmtDate(scanned.issuance?.dueDate)}.
                </Alert>
                <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
                  <Button onClick={() => scanReturn('good')}>Return</Button>
                  <Button variant="secondary" onClick={() => scanReturn('damaged')}>Return damaged</Button>
                  <Button variant="danger" onClick={() => scanReturn('lost')}>Mark lost</Button>
                </div>
              </>
            )}

            {scanned.action === 'issue' && (
              <>
                <Alert variant="success">On the shelf and free to issue.</Alert>
                <div style={{ marginTop:12 }}><Button onClick={scanIssue}>Issue this copy</Button></div>
              </>
            )}

            {scanned.action === 'blocked' && (
              <Alert variant="warning">
                This copy is marked <strong>{scanned.copy?.status}</strong>, so it cannot be issued.
              </Alert>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
