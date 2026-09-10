/**
 * Library → Fines.
 *
 * What is owed, what was collected, and what was written off. Four figures sit
 * above the register; the two money ones are counted in the month they moved.
 *
 * Everything that narrows the register travels with the request, and the totals
 * beside the chips describe the whole filtered set rather than the page on
 * screen — "what is outstanding" is the question this page exists to answer.
 *
 * There are three statuses and no more: a written-off fine is what "cancelled"
 * would mean, so there is no fourth chip for a state nothing can be in.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import {
  getFines, collectFine, collectFines, waiveFine, createFine, getIssuances,
  getClassList, downloadFile,
} from '../../../api/library.api';
import { Button, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import MemberPicker from '../../../components/library/MemberPicker';
import {
  ListTable, ListFooter, RowActions, IconAction, RowMenu, MenuItem, MenuSep,
  SelectionBar, useSelection,
} from '../../admin/listParts';
import { Hero, Tile, delta, note, quoteOfTheDay } from './dashParts';
import {
  AmountCell, BookCell, DateRange, DaysLateCell, MemberCell, PaymentCell,
  PAYMENT_FILTERS, REASONS, REASON_FILTERS, SearchBox, StatusTabs,
  fmtDate, money, owedOn,
} from './finesParts';

export default function LibraryFines() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const base = pathname.replace(/\/fines$/, '');

  // The status lives in the URL so the tiles above actually filter the table —
  // they linked to `?status=…` while the filter read a separate piece of state,
  // so clicking one changed the address bar and left the register untouched.
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const setStatus = (value) => {
    setParams((p) => { if (value) p.set('status', value); else p.delete('status'); return p; },
      { replace: true });
    setPage(1);
  };

  const [search, setSearch] = useState('');
  const [term,   setTerm]   = useState('');
  const [reason, setReason] = useState('');
  const [mode,   setMode]   = useState('');
  const [classId, setClassId] = useState('');
  const [range,  setRange]  = useState({ from: '', to: '' });
  const [page,   setPage]   = useState(1);
  const [limit,  setLimit]  = useState(10);

  // A request per keystroke is a request per keystroke; wait for a pause.
  useEffect(() => {
    const t = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = useMemo(() => ({
    q:           term    || undefined,
    status:      status  || undefined,
    fineType:    reason  || undefined,
    paymentMode: mode    || undefined,
    classId:     classId || undefined,
    from:        range.from || undefined,
    to:          range.to   || undefined,
    // The endpoint also takes `userId`; the search box covers "what does this
    // child owe" by name, which is how the question actually arrives.
  }), [term, status, reason, mode, classId, range]);
  const queryKey = JSON.stringify(query);

  const { data, meta, loading, refetch } = useFetch(
    () => getFines({ ...query, page, limit }),
    [queryKey, page, limit],
  );
  const fines = Array.isArray(data) ? data : [];
  // Totals describe the whole filtered set, not the page on screen.
  const summary = meta?.summary || {};
  const stats   = meta?.stats || {};
  const pages   = meta?.pages || 1;
  const total   = meta?.total ?? fines.length;
  const start   = (Math.min(page, pages) - 1) * limit;
  const anyFilter = !!(term || status || reason || mode || classId || range.from || range.to);
  const heroQuote = useMemo(() => quoteOfTheDay(5), []);

  const selection = useSelection(fines, `${queryKey}|${page}|${limit}`);
  // Only what is actually still owed can be collected.
  const payable = selection.rows.filter((f) => owedOn(f) > 0);
  const payableTotal = payable.reduce((n, f) => n + owedOn(f), 0);

  const [classes, setClasses] = useState([]);
  useEffect(() => {
    getClassList().then((res) => setClasses(res?.data || [])).catch(() => setClasses([]));
  }, []);

  const resetAll = () => {
    setSearch(''); setTerm(''); setStatus(''); setReason(''); setMode('');
    setClassId(''); setRange({ from: '', to: '' }); setPage(1);
  };

  const exportFines = () => toast.promise(
    downloadFile('/library/fines', { ...query, format: 'xlsx' }, 'library_fines.xlsx'),
    { loading: 'Preparing the file…', success: 'Downloaded', error: (e) => e?.message || 'Export failed' },
  );

  // ── Collecting ────────────────────────────────────────────────────────────
  const [collecting, setCollecting] = useState(null);
  const handleCollect = async (f) => {
    setCollecting(f._id);
    try {
      const res = await collectFine(f._id);
      toast.success(`${money(res?.data?.collected ?? owedOn(f))} collected — receipt ${res?.data?.receiptNumber || 'issued'}`);
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not record the payment'); }
    finally { setCollecting(null); }
  };

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const collectSelected = async () => {
    setBulkBusy(true);
    try {
      const res = await collectFines(payable.map((f) => f._id));
      if (res?.paid) toast.success(`${money(res.collected)} collected across ${res.paid} receipt${res.paid === 1 ? '' : 's'}`);
      (res?.skipped || []).forEach((sk) => toast.error(sk.reason, { duration: 6000 }));
      setBulkOpen(false); selection.clear(); refetch();
    } catch (err) { toast.error(err?.message || 'Could not record the payments'); }
    finally { setBulkBusy(false); }
  };

  // ── Waiving ───────────────────────────────────────────────────────────────
  const [waiveModal,  setWaiveModal]  = useState(null);
  const [waiveReason, setWaiveReason] = useState('');
  const [waiveWhole,  setWaiveWhole]  = useState(true);
  const [waiveAmount, setWaiveAmount] = useState('');
  const [waiveLoad,   setWaiveLoad]   = useState(false);

  const openWaive = (f) => {
    setWaiveReason(''); setWaiveWhole(true); setWaiveAmount(String(owedOn(f)));
    setWaiveModal(f);
  };

  const handleWaive = async () => {
    if (!waiveReason.trim()) return toast.error('A reason is required to waive a fine');
    const owed = owedOn(waiveModal);
    let amount;
    if (!waiveWhole) {
      amount = Number(waiveAmount);
      if (!Number.isFinite(amount) || amount <= 0) return toast.error('Enter a waiver amount greater than zero');
      if (amount > owed) return toast.error(`Only ${money(owed)} is outstanding on this fine`);
    }
    setWaiveLoad(true);
    try {
      const res = await waiveFine(waiveModal._id, { reason: waiveReason.trim(), amount });
      const left = res?.data?.outstanding ?? 0;
      toast.success(left > 0
        ? `Waived — ${money(left)} still to pay`
        : 'Fine waived in full — the member has been notified');
      setWaiveModal(null); setWaiveReason(''); refetch();
    } catch (err) { toast.error(err?.message || 'Could not waive the fine'); }
    finally { setWaiveLoad(false); }
  };

  // ── Raising one by hand ───────────────────────────────────────────────────
  // Every fine hangs off a loan, so this asks which loan rather than inventing
  // a debt with no book behind it.
  const [addOpen,  setAddOpen]  = useState(false);
  const [addUser,  setAddUser]  = useState('');
  const [addLoans, setAddLoans] = useState([]);
  const [addLoan,  setAddLoan]  = useState('');
  const [addType,  setAddType]  = useState('damaged');
  const [addAmt,   setAddAmt]   = useState('');
  const [addWhy,   setAddWhy]   = useState('');
  const [addBusy,  setAddBusy]  = useState(false);
  const [loansBusy, setLoansBusy] = useState(false);

  useEffect(() => {
    if (!addUser) { setAddLoans([]); setAddLoan(''); return; }
    setLoansBusy(true);
    getIssuances({ userId: addUser, limit: 25 })
      .then((res) => setAddLoans(res?.data || []))
      .catch(() => setAddLoans([]))
      .finally(() => setLoansBusy(false));
  }, [addUser]);

  const openAdd = () => {
    setAddUser(''); setAddLoans([]); setAddLoan('');
    setAddType('damaged'); setAddAmt(''); setAddWhy(''); setAddOpen(true);
  };

  const saveAdd = async () => {
    if (!addLoan) return toast.error('Choose the loan this fine is against');
    const value = Number(addAmt);
    if (!Number.isFinite(value) || value <= 0) return toast.error('Enter an amount greater than zero');
    setAddBusy(true);
    try {
      await createFine({ issuanceId: addLoan, fineType: addType, amount: value, reason: addWhy.trim() });
      toast.success(`${money(value)} fine raised — the member has been told`);
      setAddOpen(false); refetch();
    } catch (err) { toast.error(err?.message || 'Could not raise the fine'); }
    finally { setAddBusy(false); }
  };

  // ── Columns ───────────────────────────────────────────────────────────────
  const columns = [
    { key: 'member', className: 'libf-col-member', label: 'Member',    render: (r) => <MemberCell row={r} /> },
    { key: 'book',   className: 'libf-col-book',   label: 'Book',      render: (r) => <BookCell row={r} /> },
    { key: 'issued', className: 'libf-col-date',   label: 'Issued on', render: (r) => fmtDate(r.issuance?.issueDate) || '—' },
    { key: 'due',    className: 'libf-col-date',   label: 'Was due',   render: (r) => fmtDate(r.issuance?.dueDate) || '—' },
    { key: 'reason', className: 'libf-col-reason', label: 'Reason',    render: (r) => REASONS[r.fineType] || r.fineType || '—' },
    { key: 'late',   className: 'libf-col-late',   label: 'Days late', render: (r) => <DaysLateCell row={r} /> },
    { key: 'amount', className: 'libf-col-amount', label: 'Fine',      render: (r) => <AmountCell row={r} /> },
    { key: 'status', className: 'libf-col-status', label: 'Payment',   render: (r) => <PaymentCell row={r} /> },
    { key: 'paidOn', className: 'libf-col-date',   label: 'Paid on',   render: (r) => fmtDate(r.paidAt) || <span className="lnone">—</span> },
    {
      key: 'actions',
      className: 'ltable__acts',
      label: 'Actions',
      render: (r) => (
        <RowActions>
          {owedOn(r) > 0 && (
            <Button size="sm" loading={collecting === r._id} onClick={() => handleCollect(r)}>
              Collect
            </Button>
          )}
          <IconAction icon="eye" label="Open this book"
            onClick={() => navigate(`${base}/books/${r.issuance?.book || ''}`)}
            disabled={!r.issuance?.book} />
          <RowMenu>
            {owedOn(r) > 0 && (
              <>
                <MenuItem icon="banknote" onClick={() => handleCollect(r)}>Take payment</MenuItem>
                <MenuItem icon="close" onClick={() => openWaive(r)}>Write it off</MenuItem>
                <MenuSep />
              </>
            )}
            <MenuItem icon="book" to={`${base}/books/${r.issuance?.book || ''}`}>Book and copies</MenuItem>
            <MenuItem icon="repeat" to={`${base}/circulation`}>Circulation register</MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="page libdpg libfpg">
      <Hero
        icon="banknote" title="Fines"
        tagline="Charge · Collect · Write off"
        subtitle="What is owed, what has been collected, and what the library has written off."
        quote={heroQuote} />

      <div className="libd-tiles">
        <Tile icon="wallet" tone={stats.outstanding ? 'pink' : 'green'} to={`${pathname}?status=pending`}
          value={money(stats.outstanding)} label="Outstanding"
          caption={stats.unpaidCount
            ? `${stats.unpaidCount} fine${stats.unpaidCount === 1 ? '' : 's'} still owed`
            : 'Nothing owed'}
          trend={delta(stats.unpaidCount || 0, stats.unpaidPrev || 0, 'last week')} />

        <Tile icon="checkCircle" tone="green" to={`${pathname}?status=paid`}
          value={money(stats.collected)} label="Collected this month" caption="Money actually taken"
          trend={delta(stats.collected || 0, stats.collectedPrev || 0, 'last month')} />

        <Tile icon="clock" tone="amber" to={`${pathname}?status=pending`}
          value={stats.unpaidCount ?? 0} label="Awaiting payment" caption="Fines with a balance left"
          trend={stats.unpaidCount
            ? note(`${money(stats.outstanding)} in total`)
            : note('Everything settled')} />

        <Tile icon="close" tone="purple" to={`${pathname}?status=waived`}
          value={money(stats.waived)} label="Written off this month"
          caption={stats.waivedCount
            ? `${stats.waivedCount} fine${stats.waivedCount === 1 ? '' : 's'} waived`
            : 'Nothing written off'}
          trend={delta(stats.waived || 0, stats.waivedPrev || 0, 'last month')} />
      </div>

      <section className="card libf-card">
        <div className="libr-bar">
          <StatusTabs value={status} counts={summary} onPick={(v) => { setStatus(v); setPage(1); }} />
          <div className="libr-bar__acts">
            <DateRange from={range.from} to={range.to} onChange={(r) => { setRange(r); setPage(1); }} />
            <Button variant="secondary" onClick={exportFines}>
              <Icon name="download" size={16} /> Export
            </Button>
            <Button onClick={openAdd}><Icon name="plus" size={16} /> Add fine</Button>
          </div>
        </div>

        <div className="libc-filters">
          <SearchBox value={search} onChange={setSearch} />

          <select className="form-control libc-sel" value={classId} aria-label="Filter by class"
            onChange={(e) => { setClassId(e.target.value); setPage(1); }}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>

          <select className="form-control libc-sel" value={reason} aria-label="Filter by reason"
            onChange={(e) => { setReason(e.target.value); setPage(1); }}>
            {REASON_FILTERS.map(([v, l]) => <option key={v || 'any'} value={v}>{l}</option>)}
          </select>

          <select className="form-control libc-sel" value={mode} aria-label="Filter by how it was paid"
            onChange={(e) => { setMode(e.target.value); setPage(1); }}>
            {PAYMENT_FILTERS.map(([v, l]) => <option key={v || 'any'} value={v}>{l}</option>)}
          </select>

          {anyFilter && (
            <Button variant="secondary" onClick={resetAll}>
              <Icon name="refresh" size={15} /> Reset
            </Button>
          )}
        </div>

        <SelectionBar count={selection.ids.length} noun="fine" onClear={selection.clear}>
          <Button size="sm" disabled={!payable.length} onClick={() => setBulkOpen(true)}>
            <Icon name="banknote" size={15} />
            {payable.length ? `Collect ${money(payableTotal)}` : 'Nothing to collect'}
          </Button>
        </SelectionBar>

        <ListTable
          columns={columns}
          rows={fines}
          loading={loading}
          selection={selection}
          startIndex={start}
          emptyIcon={anyFilter ? '🔍' : '💵'}
          emptyTitle={anyFilter ? 'No fines match this' : 'Nobody owes anything'}
          emptyMessage={anyFilter
            ? 'Try another status, another reason, or a wider date window.'
            : 'Fines are raised when a book comes back late, lost or damaged — and can be added by hand.'}
          emptyAction={anyFilter
            ? <Button variant="secondary" onClick={resetAll}>Clear filters</Button>
            : <Button onClick={openAdd}>+ Add fine</Button>}
        />

        <ListFooter
          page={Math.min(page, pages)} pages={pages} total={total}
          limit={limit} count={fines.length} noun="fine"
          onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
        />
      </section>

      {/* ── Overlays ────────────────────────────────────────────────────────── */}
      <Modal open={bulkOpen} onClose={() => setBulkOpen(false)} maxWidth={460} title="Take payment"
        footer={<>
          <Button variant="secondary" onClick={() => setBulkOpen(false)}>Cancel</Button>
          <Button onClick={collectSelected} loading={bulkBusy}>Collect {money(payableTotal)}</Button>
        </>}>
        <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
          Record {money(payableTotal)} against {payable.length} fine{payable.length === 1 ? '' : 's'}.
        </p>
        <p className="text-muted text-sm">
          Each one gets its own receipt — a receipt covering several fines is not something the
          ledger can produce. {selection.ids.length > payable.length
            ? `${selection.ids.length - payable.length} of the selected fines have nothing left to pay and are left alone.`
            : ''}
        </p>
      </Modal>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} maxWidth={520} title="Add a fine"
        footer={<>
          <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button onClick={saveAdd} loading={addBusy} disabled={!addLoan || !addAmt}>Raise it</Button>
        </>}>
        <p className="text-muted text-sm" style={{ marginTop: 0 }}>
          Late, lost and damaged fines are raised automatically when a book comes back. This is for
          the ones nobody spots until later — every fine hangs off a loan, so pick the one it is
          against.
        </p>

        <div className="form-group">
          <label className="form-label required">Member</label>
          <MemberPicker placeholder="Search students and staff…" value={addUser} onChange={setAddUser} />
        </div>

        <div className="form-group">
          <label className="form-label required">Which loan</label>
          <select className="form-control" value={addLoan} disabled={!addUser || loansBusy}
            onChange={(e) => setAddLoan(e.target.value)}>
            <option value="">
              {!addUser ? 'Choose a member first' : loansBusy ? 'Loading their loans…'
                : addLoans.length ? 'Choose a loan' : 'This member has never borrowed anything'}
            </option>
            {addLoans.map((l) => (
              <option key={l._id} value={l._id}>
                {l.book?.title || 'Book'} — issued {fmtDate(l.issueDate)} ({l.status})
              </option>
            ))}
          </select>
        </div>

        <div className="libf-add2">
          <div className="form-group">
            <label className="form-label required">Reason</label>
            <select className="form-control" value={addType} onChange={(e) => setAddType(e.target.value)}>
              {REASON_FILTERS.slice(1).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Amount (₹)</label>
            <input type="number" className="form-control" min="0" step="0.01" value={addAmt}
              onChange={(e) => setAddAmt(e.target.value)} placeholder="0" />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Note</label>
          <input className="form-control" value={addWhy} onChange={(e) => setAddWhy(e.target.value)}
            placeholder="e.g. torn pages found on reshelving" />
          <div className="form-hint">Included in the notice the member receives.</div>
        </div>
      </Modal>

      <Modal open={!!waiveModal} onClose={() => setWaiveModal(null)} title="Waive Fine"
        footer={<><Button variant="secondary" onClick={() => setWaiveModal(null)}>Cancel</Button>
          <Button onClick={handleWaive} loading={waiveLoad}>Waive</Button></>}>
        <p style={{ marginBottom:12, color:'var(--text-muted)' }}>
          <strong>{waiveModal?.user?.name}</strong> owes {money(owedOn(waiveModal))}
          {waiveModal && owedOn(waiveModal) !== waiveModal.amount
            ? <> of a {money(waiveModal.amount)} charge</> : null}.
        </p>

        <div className="form-group">
          <label className="form-label">How much to write off</label>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <label style={{ display:'flex', gap:8, alignItems:'center', cursor:'pointer' }}>
              <input type="radio" checked={waiveWhole} onChange={() => setWaiveWhole(true)} />
              <span>All of it — {money(owedOn(waiveModal))}</span>
            </label>
            <label style={{ display:'flex', gap:8, alignItems:'center', cursor:'pointer' }}>
              <input type="radio" checked={!waiveWhole} onChange={() => setWaiveWhole(false)} />
              <span>Part of it</span>
            </label>
          </div>
        </div>

        {!waiveWhole && (
          <div className="form-group" style={{ maxWidth:220 }}>
            <label className="form-label required">Amount to waive (₹)</label>
            <input type="number" className="form-control" min={0} max={owedOn(waiveModal)} step="0.01"
              value={waiveAmount} onChange={e => setWaiveAmount(e.target.value)} />
            <div className="form-hint">
              {money(Math.max(0, owedOn(waiveModal) - (Number(waiveAmount) || 0)))} will remain payable.
            </div>
          </div>
        )}

        <div className="form-group"><label className="form-label required">Reason</label>
          <textarea className="form-control" rows={2} value={waiveReason}
            onChange={e => setWaiveReason(e.target.value)} placeholder="Why is this being written off?" /></div>
      </Modal>
    </div>
  );
}
