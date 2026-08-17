import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/teacher.api';
import { Table, Badge, Button, Modal, Spinner, Empty } from '../../components/ui/index';

// Mounted as the "Comp Off" tab of pages/teacher/Leave.jsx — Comp Off stays
// inside Leave Management rather than becoming its own nav item.

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const todayStr = () => new Date().toISOString().slice(0, 10);

const STATUS_VARIANT = {
  draft: 'info', pending: 'warning', approved: 'success',
  rejected: 'danger', cancelled: 'muted', expired: 'muted',
};

const DAY_LABEL = {
  holiday: '🎉 Holiday', weekly_off: '🗓️ Weekly Off', sunday: '☀️ Sunday',
  working_day: '💼 Working Day', unknown: '❔ Unclassified',
};

const ENTRY_VARIANT = {
  EARNED: 'success', REVERSED: 'success', USED: 'info',
  EXPIRED: 'muted', CANCELLED: 'danger', ADJUSTMENT: 'warning',
};

const EMPTY_FORM = { workDate: '', checkIn: '', checkOut: '', compOffDays: '', reason: '' };

export default function TeacherCompOff() {
  const [sub, setSub] = useState('overview');
  const { data, loading, refetch } = useFetch(() => api.getMyCompOff());

  const enabled  = data?.enabled !== false;
  const balance  = data?.balance;
  const drafts   = data?.drafts   || [];
  const requests = data?.requests || [];
  const policy   = data?.policy;

  // ── Apply (scenarios 1 & 2) ───────────────────────────────────────────────
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);

  // Live verdict from the same engine that will judge the submission, so the
  // employee is never surprised by a rejection they could have seen coming.
  useEffect(() => {
    if (!modal || !form.workDate) { setPreview(null); return; }
    let cancelled = false;
    api.previewCompOffDate({
      date: form.workDate,
      checkIn: form.checkIn || undefined,
      checkOut: form.checkOut || undefined,
    })
      .then(res => { if (!cancelled) setPreview(res?.data ?? res); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [modal, form.workDate, form.checkIn, form.checkOut]);

  const handleApply = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.applyCompOff({
        ...form,
        compOffDays: form.compOffDays === '' ? undefined : Number(form.compOffDays),
      });
      toast.success('Comp Off applied — awaiting approval');
      setModal(false); setForm(EMPTY_FORM); setPreview(null); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  // ── Ready-to-apply drafts (scenario 3) ────────────────────────────────────
  const [applyDraft, setApplyDraft] = useState(null);
  const [draftReason, setDraftReason] = useState('');
  const [draftLoad, setDraftLoad] = useState(false);

  const submitDraft = async () => {
    setDraftLoad(true);
    try {
      await api.submitCompOffDraft(applyDraft._id, { reason: draftReason });
      toast.success('Applied — awaiting approval');
      setApplyDraft(null); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setDraftLoad(false); }
  };

  const cancelRequest = async (r) => {
    try {
      await api.cancelCompOff(r._id);
      toast.success('Comp Off request withdrawn');
      refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
  };

  const columns = [
    { key: 'workDate', label: 'Work Date', render: r => (
      <div>
        <div>{fmtDate(r.workDate)}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
          {DAY_LABEL[r.dayCategory] || r.dayCategory}{r.dayLabel ? ` · ${r.dayLabel}` : ''}
        </div>
      </div>
    )},
    { key: 'hours', label: 'Worked', render: r => r.workedHours ? `${r.workedHours} h` : '—' },
    { key: 'days', label: 'Comp Off', render: r => <strong>{r.compOffDays}</strong> },
    { key: 'status', label: 'Status', render: r => (
      <div>
        <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status}</Badge>
        {r.approvalsRequired > 1 && r.status === 'pending' && (
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
            sign-off {r.approvalLevel || 0}/{r.approvalsRequired}
          </div>
        )}
      </div>
    )},
    { key: 'credited', label: 'Credited', render: r => r.creditedDays > 0
      ? <div>
          <strong style={{ color: 'var(--success)' }}>{r.creditedDays}</strong>
          {r.expiresAt && <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>expires {fmtDate(r.expiresAt)}</div>}
        </div>
      : <span style={{ color: 'var(--text-muted)' }}>—</span> },
    { key: 'comment', label: 'Comment', render: r => <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>{r.adminComment || '—'}</span> },
    { key: 'actions', label: '', render: r => r.status === 'pending'
      ? <button className="btn btn-danger btn-sm" onClick={() => cancelRequest(r)}>Withdraw</button>
      : null },
  ];

  if (loading) return <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;

  if (!enabled) {
    return (
      <div className="card"><div className="card-body">
        <Empty icon="🕓" title="Comp Off is not available" message={data?.reason} />
      </div></div>
    );
  }

  return (
    <div>
      {/* ── Balance ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12, marginBottom: 16 }}>
        {[['Available', balance?.remaining, 'var(--success)'], ['Earned', balance?.totalAllocated, 'var(--primary)'],
          ['Used', balance?.used, 'var(--text)'], ['Pending', balance?.pending, 'var(--warning)'],
          ['Expired', balance?.expired, 'var(--danger)']].map(([label, val, color]) => (
          <div key={label} className="card"><div className="card-body" style={{ padding: '14px 18px' }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 700, color, lineHeight: 1 }}>{val ?? 0}</div>
            <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
          </div></div>
        ))}
      </div>

      {/* ── Ready to apply (auto-generated from approved attendance) ── */}
      {drafts.length > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--primary)' }}>
          <div className="card-header">
            <h2 style={{ fontSize: '.95rem' }}>Ready to apply ({drafts.length})</h2>
          </div>
          <div className="card-body">
            <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', marginTop: 0 }}>
              Your approved attendance on these days qualifies for Comp Off. Review the figures and apply —
              your balance is credited only after an approver signs off.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              {drafts.map(d => (
                <div key={d._id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{fmtDate(d.workDate)}</div>
                      <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                        {DAY_LABEL[d.dayCategory] || d.dayCategory}{d.dayLabel ? ` · ${d.dayLabel}` : ''}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--primary)', lineHeight: 1 }}>{d.compOffDays}</div>
                      <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>day(s)</div>
                    </div>
                  </div>
                  <div style={{ marginTop: 10, fontSize: '.8rem', color: 'var(--text-muted)' }}>
                    {d.checkIn || '—'} → {d.checkOut || '—'} · {d.workedHours} hour(s)
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                    <button className="btn btn-primary btn-sm" style={{ flex: 1 }}
                      onClick={() => { setDraftReason(d.reason || ''); setApplyDraft(d); }}>Apply</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => cancelRequest({ ...d, status: 'pending' })}>Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── History / ledger ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <div className="tabs" style={{ margin: 0 }}>
          {[['overview', 'My Requests'], ['ledger', 'Ledger']].map(([k, l]) => (
            <button key={k} className={`tab${sub === k ? ' active' : ''}`} onClick={() => setSub(k)}>{l}</button>
          ))}
        </div>
        <Button onClick={() => { setForm(EMPTY_FORM); setModal(true); }}>+ Apply Comp Off</Button>
      </div>

      {sub === 'overview' && (
        <div className="card"><div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={requests} emptyIcon="🕓" emptyTitle="No Comp Off requests yet" />
        </div></div>
      )}

      {sub === 'ledger' && <MyLedger />}

      {/* ── Apply modal ── */}
      <Modal open={modal} onClose={() => setModal(false)} title="Apply for Comp Off" maxWidth={580}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button form="co-form" type="submit" loading={saving} disabled={preview && preview.eligible === false}>Apply</Button>
        </>}>
        <form id="co-form" onSubmit={handleApply}>
          <div className="form-group">
            <label className="form-label required">Work Date</label>
            <input type="date" className="form-control" required value={form.workDate}
              max={policy?.advanceCompOffAllowed ? undefined : todayStr()}
              onChange={e => setForm(f => ({ ...f, workDate: e.target.value }))} />
          </div>

          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Check In</label>
              <input type="time" className="form-control" value={form.checkIn}
                onChange={e => setForm(f => ({ ...f, checkIn: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Check Out</label>
              <input type="time" className="form-control" value={form.checkOut}
                onChange={e => setForm(f => ({ ...f, checkOut: e.target.value }))} />
            </div>
          </div>

          {preview && (
            <div className={`alert alert-${preview.eligible ? 'success' : 'warning'}`} style={{ fontSize: '.82rem', marginBottom: 12 }}>
              <div><strong>{DAY_LABEL[preview.dayCategory] || preview.dayCategory}</strong>{preview.dayLabel ? ` — ${preview.dayLabel}` : ''}</div>
              {preview.workedHours > 0 && <div>{preview.workedHours} hour(s) → {preview.compOffDays ?? 0} Comp Off day(s)</div>}
              {!preview.eligible && <div style={{ marginTop: 4 }}>{preview.message}</div>}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Comp Off Days</label>
            <input type="number" className="form-control" min={0} step="0.5" value={form.compOffDays}
              placeholder={preview?.compOffDays != null ? String(preview.compOffDays) : 'auto from hours worked'}
              onChange={e => setForm(f => ({ ...f, compOffDays: e.target.value }))} />
            <div className="form-hint">Leave blank to let the policy work it out from your hours</div>
          </div>

          <div className="form-group">
            <label className="form-label required">Reason</label>
            <textarea className="form-control" rows={3} required value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="What you worked on that day" />
          </div>

          {policy && (
            <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Minimum {policy.minWorkingHours}h · half day from {policy.halfDayHours}h · full day from {policy.fullDayHours}h<br />
              Apply within {policy.applyWithinDays || '∞'} day(s) of working · credited days valid for {policy.validityDays || '∞'} day(s)<br />
              {policy.approvalsRequired > 1 ? 'Requires two approvals' : 'Requires approval'} — nothing is credited until then
            </div>
          )}
        </form>
      </Modal>

      {/* ── Draft confirmation ── */}
      <Modal open={!!applyDraft} onClose={() => setApplyDraft(null)} title="Apply for Comp Off"
        footer={<>
          <Button variant="secondary" onClick={() => setApplyDraft(null)}>Cancel</Button>
          <Button onClick={submitDraft} loading={draftLoad}>Apply</Button>
        </>}>
        {applyDraft && (
          <div>
            <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '12px 16px', fontSize: '.85rem', marginBottom: 12, lineHeight: 1.8 }}>
              <div><strong>Date:</strong> {fmtDate(applyDraft.workDate)}</div>
              <div><strong>Day:</strong> {DAY_LABEL[applyDraft.dayCategory] || applyDraft.dayCategory}{applyDraft.dayLabel ? ` — ${applyDraft.dayLabel}` : ''}</div>
              <div><strong>Attendance:</strong> {applyDraft.checkIn || '—'} → {applyDraft.checkOut || '—'}</div>
              <div><strong>Hours worked:</strong> {applyDraft.workedHours}</div>
              <div><strong>Comp Off:</strong> {applyDraft.compOffDays} day(s)</div>
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <textarea className="form-control" rows={3} value={draftReason}
                onChange={e => setDraftReason(e.target.value)} />
            </div>
            <div className="alert alert-info" style={{ fontSize: '.82rem' }}>
              Applying sends this for approval. Your Comp Off balance is credited only once it is approved.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── My ledger ───────────────────────────────────────────────────────────────
function MyLedger() {
  const { data, loading } = useFetch(() => api.getMyCompOffLedger());
  const columns = [
    { key: 'when', label: 'When', render: r => fmtDate(r.createdAt) },
    { key: 'type', label: 'Entry', render: r => <Badge variant={ENTRY_VARIANT[r.entryType] || 'muted'}>{r.entryType}</Badge> },
    { key: 'delta', label: 'Days', render: r => (
      <strong style={{ color: r.delta >= 0 ? 'var(--success)' : 'var(--danger)' }}>
        {r.delta >= 0 ? '+' : ''}{r.delta}
      </strong>
    )},
    { key: 'balance', label: 'Balance After', render: r => r.balanceAfter },
    { key: 'expiry', label: 'Valid Until', render: r => r.expiresAt ? fmtDate(r.expiresAt) : '—' },
    { key: 'desc', label: 'Description', render: r => <span style={{ fontSize: '.82rem' }}>{r.description || '—'}</span> },
  ];
  if (loading) return <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  return (
    <div className="card"><div className="card-body" style={{ padding: 0 }}>
      <Table columns={columns} data={data?.entries || []} emptyIcon="📒" emptyTitle="No Comp Off ledger entries yet" />
    </div></div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  Approvals queue — only rendered for designation-based approvers
//  (e.g. a Principal), who are teachers and so have no admin screen.
// ════════════════════════════════════════════════════════════════════════════
export function TeacherCompOffApprovals() {
  const [status, setStatus] = useState('pending');
  const { data, loading, refetch } = useFetch(
    () => api.getCompOffApprovals({ status: status || undefined, limit: 50 }),
    [status],
  );
  const [action, setAction] = useState(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const { type, request } = action;
      if (type === 'approve') {
        const res = await api.approveCompOff(request._id, { comment });
        const d = res?.data ?? res;
        toast.success(d.pendingLevels > 0
          ? `Approval recorded — ${d.pendingLevels} more sign-off needed before crediting`
          : `Approved — ${d.credited} day(s) credited`);
      } else {
        await api.rejectCompOff(request._id, { comment });
        toast.success('Rejected — no balance credited');
      }
      setAction(null); setComment(''); refetch();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setBusy(false); }
  };

  const columns = [
    { key: 'employee', label: 'Employee', render: r => r.teacher?.name || '—' },
    { key: 'workDate', label: 'Work Date', render: r => (
      <div>
        <div>{fmtDate(r.workDate)}</div>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{DAY_LABEL[r.dayCategory] || r.dayCategory}</div>
      </div>
    )},
    { key: 'hours', label: 'Worked', render: r => r.workedHours ? `${r.workedHours} h` : '—' },
    { key: 'days', label: 'Comp Off', render: r => <strong>{r.compOffDays}</strong> },
    { key: 'status', label: 'Status', render: r => <Badge variant={STATUS_VARIANT[r.status] || 'muted'}>{r.status}</Badge> },
    { key: 'reason', label: 'Reason', render: r => <span style={{ fontSize: '.82rem' }}>{r.reason || '—'}</span> },
    { key: 'actions', label: '', render: r => r.status === 'pending' ? (
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="btn btn-success btn-sm" onClick={() => { setComment(''); setAction({ type: 'approve', request: r }); }}>Approve</button>
        <button className="btn btn-danger btn-sm"  onClick={() => { setComment(''); setAction({ type: 'reject',  request: r }); }}>Reject</button>
      </div>
    ) : null },
  ];

  if (loading) return <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (data?.enabled === false) {
    return <div className="card"><div className="card-body"><Empty icon="🕓" title="Comp Off is not available" message={data.reason} /></div></div>;
  }

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="form-control" style={{ width: 160 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={data?.items || []} emptyIcon="✅" emptyTitle="Nothing waiting for you" />
      </div>

      <Modal open={!!action} onClose={() => setAction(null)}
        title={action?.type === 'approve' ? 'Approve Comp Off' : 'Reject Comp Off'}
        footer={<>
          <Button variant="secondary" onClick={() => setAction(null)}>Cancel</Button>
          <Button variant={action?.type === 'approve' ? 'success' : 'danger'} onClick={run} loading={busy}>
            {action?.type === 'approve' ? 'Approve' : 'Reject'}
          </Button>
        </>}>
        {action && (
          <div>
            <div style={{ background: 'var(--bg-muted)', borderRadius: 6, padding: '10px 14px', fontSize: '.85rem', marginBottom: 12 }}>
              <div><strong>{action.request.teacher?.name}</strong></div>
              <div>{fmtDate(action.request.workDate)} · {action.request.compOffDays} day(s)</div>
            </div>
            <div className="form-group">
              <label className="form-label">Comment</label>
              <textarea className="form-control" rows={3} value={comment} onChange={e => setComment(e.target.value)} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
