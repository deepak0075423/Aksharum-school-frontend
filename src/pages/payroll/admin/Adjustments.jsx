/**
 * Payroll → Adjustments.
 *
 * The two things that change what a month pays without changing anybody's
 * salary: money lent to an employee and being taken back, and money they spent
 * and are being paid back for. They share a screen because they are the same
 * question from opposite sides — what does this month owe, and what does it
 * collect — and because a payroll run settles both together.
 *
 * Neither moves until a run is PUBLISHED: a draft that is recomputed or thrown
 * away must not leave an advance half-recovered.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, Crumbs, PrHead, Tiles, Tile, Card, CardHead, Panel, QuickActions, HelpCard,
  Btn, Select, Search, Badge, IconBtn, RowMenu, MenuItem, Avatar, Mark, Glyph, PillTabs,
  Loading, Empty, TableWrap, Pager, Note, money, fmtDate,
} from './prUI';
import { AdvanceDialog, ClaimDialog, ConfirmDialog } from './prForms';

const ADVANCE_STATUS = {
  active:    ['blue',  'Recovering'],
  closed:    ['green', 'Cleared'],
  cancelled: ['slate', 'Cancelled'],
};
const CLAIM_STATUS = {
  pending:  ['amber', 'Awaiting decision'],
  approved: ['blue',  'Approved'],
  paid:     ['green', 'Paid'],
  rejected: ['red',   'Rejected'],
};

export default function PayrollAdjustments() {
  const [tab, setTab] = useState('advances');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);

  const [advancing, setAdvancing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const isAdv = tab === 'advances';
  const { data: rows, meta, loading, refetch } = useFetch(
    () => (isAdv ? api.getAdvances({ search, status, page, limit })
                 : api.getClaims({ search, status: status === 'active' ? 'pending' : status, page, limit })),
    [tab, search, status, page, limit]);

  const s = meta?.summary || {};

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); await refetch(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); setConfirm(null); }
  };

  const switchTab = (v) => { setTab(v); setStatus(v === 'advances' ? 'active' : 'pending'); setPage(1); setQ(''); setSearch(''); };

  return (
    <div className="pr-page">
      <Crumbs trail={[{ label: 'Payroll', to: '/admin/payroll/dashboard' }, { label: 'Adjustments' }]} />
      <SectionBar hideYear>
        <Btn glyph="rupee" onClick={() => setAdvancing(true)}>Record Advance</Btn>
        <Btn variant="primary" icon="plus" onClick={() => setClaiming(true)}>New Claim</Btn>
      </SectionBar>

      <PrHead title="Adjustments"
        subtitle="Advances and loans being recovered from salary, and expenses being paid back through it" />

      <Note tone="blue" glyph="info">
        Nothing here moves until a payroll run is <b>published</b>. A draft shows what the month intends to take and
        pay; reversing a publish gives it all back.
      </Note>

      {isAdv ? (
        <Tiles n={4}>
          <Tile glyph="rupee" tone="indigo" valueFirst label="Being recovered"
            value={loading ? '—' : (s.active ?? 0)} caption="Active advances and loans" />
          <Tile glyph="wallet" tone="blue" valueFirst label="Lent" small
            value={loading ? '—' : money(s.lent)} caption="Across active advances" />
          <Tile glyph="checkCircle" tone="green" valueFirst label="Recovered" small
            value={loading ? '—' : money(s.recovered)} caption="Taken back so far" />
          <Tile glyph="clock" tone="amber" valueFirst label="Outstanding" small
            value={loading ? '—' : money(s.outstanding)} caption="Still to come back" />
        </Tiles>
      ) : (
        <Tiles n={4}>
          <Tile glyph="clock" tone="amber" valueFirst label="Awaiting decision"
            value={loading ? '—' : (s.pending ?? 0)} caption="Claims to approve or reject" />
          <Tile glyph="docFill" tone="blue" valueFirst label="Pending value" small
            value={loading ? '—' : money(s.pendingAmount)} caption="Not yet decided" />
          <Tile glyph="checkCircle" tone="indigo" valueFirst label="Approved" small
            value={loading ? '—' : money(s.approvedAmount)} caption="Due in the next run" />
          <Tile glyph="wallet" tone="green" valueFirst label="Paid" small
            value={loading ? '—' : money(s.paidAmount)} caption="Reimbursed through payroll" />
        </Tiles>
      )}

      <div className="pr-split">
        <div className="pr-stack">
          <Card>
            <div className="pr-cardhead" style={{ paddingBottom: 0 }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <PillTabs value={tab} onChange={switchTab} items={[
                  { value: 'advances', label: 'Advances & Loans' },
                  { value: 'claims', label: 'Reimbursements' },
                ]} />
              </div>
              <div className="pr-cardhead__acts">
                <Search value={q} onChange={setQ} onEnter={() => { setSearch(q); setPage(1); }}
                  placeholder={isAdv ? 'Search by employee or reason…' : 'Search by employee or description…'} />
                <Select value={status} onChange={v => { setStatus(v); setPage(1); }} ariaLabel="Status"
                  options={isAdv
                    ? [{ value: 'active', label: 'Recovering' }, { value: 'closed', label: 'Cleared' }, { value: 'cancelled', label: 'Cancelled' }, { value: 'all', label: 'All' }]
                    : [{ value: 'pending', label: 'Awaiting decision' }, { value: 'approved', label: 'Approved' }, { value: 'paid', label: 'Paid' }, { value: 'rejected', label: 'Rejected' }, { value: 'all', label: 'All' }]} />
              </div>
            </div>

            <div className="pr-cardbody pr-cardbody--flush" style={{ marginTop: 12 }}>
              {loading ? <Loading rows={5} /> : !rows?.length ? (
                <Empty glyph={isAdv ? 'rupee' : 'docFill'}
                  title={isAdv ? 'No advances here' : 'No claims here'}
                  hint={isAdv
                    ? 'An advance is money paid ahead of salary and taken back over one or more months.'
                    : 'A reimbursement is money an employee spent for the school, paid back through payroll.'}>
                  <Btn variant="primary" icon="plus" onClick={() => (isAdv ? setAdvancing(true) : setClaiming(true))}>
                    {isAdv ? 'Record Advance' : 'New Claim'}
                  </Btn>
                </Empty>
              ) : (
                <>
                  <TableWrap>
                    <table className="pr-table pr-table--stickyend">
                      <thead>
                        {isAdv ? (
                          <tr>
                            <th className="pr-idx">#</th>
                            <th>Employee</th>
                            <th>Reason</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                            <th style={{ textAlign: 'right' }}>Instalment</th>
                            <th style={{ textAlign: 'right' }}>Recovered</th>
                            <th style={{ textAlign: 'right' }}>Outstanding</th>
                            <th>From</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        ) : (
                          <tr>
                            <th className="pr-idx">#</th>
                            <th>Employee</th>
                            <th>Category</th>
                            <th>Description</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                            <th>Claimed</th>
                            <th>Status</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                          </tr>
                        )}
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (isAdv ? (
                          <tr key={r._id} data-focus-id={r._id}>
                            <td className="pr-idx">{(page - 1) * limit + i + 1}</td>
                            <td>
                              <div className="pr-who">
                                <Avatar name={r.employee.name} size={32} />
                                <div className="pr-who__txt"><b>{r.employee.name}</b><small>{r.employee.employeeId || r.employee.department}</small></div>
                              </div>
                            </td>
                            <td><div className="pr-cell2 pr-cell2--wrap"><b>{r.kind === 'loan' ? 'Loan' : 'Advance'}</b><small>{r.reason || '—'}</small></div></td>
                            <td className="pr-num">{money(r.amount)}</td>
                            <td className="pr-num">
                              <div className="pr-cell2" style={{ textAlign: 'right' }}>
                                <b>{money(r.instalmentAmount)}</b><small>× {r.instalments}</small>
                              </div>
                            </td>
                            <td className="pr-num">
                              {money(r.recovered)}
                              <div className="pr-share" style={{ marginTop: 4 }}>
                                <span style={{ width: `${Math.min(100, r.progress)}%`, background: '#16a34a' }} />
                              </div>
                            </td>
                            <td className="pr-num pr-strong">{money(r.outstanding)}</td>
                            <td>{r.startLabel}</td>
                            <td><Badge tone={ADVANCE_STATUS[r.status]?.[0] || 'slate'}>{ADVANCE_STATUS[r.status]?.[1] || r.status}</Badge></td>
                            <td>
                              <div className="pr-acts" style={{ justifyContent: 'flex-end' }}>
                                <RowMenu label={`Actions for ${r.employee.name}`}>
                                  <MenuItem glyph="ban" disabled={r.status !== 'active'} onClick={() => setConfirm({
                                    title: r.recovered > 0 ? 'Write off the rest?' : 'Cancel this advance?',
                                    body: r.recovered > 0
                                      ? `${money(r.outstanding)} is still outstanding for ${r.employee.name}. Writing it off closes the advance and stops any further recovery — the school absorbs the difference.`
                                      : `Nothing has been recovered yet, so this will be marked as never disbursed.`,
                                    confirm: r.recovered > 0 ? 'Write Off' : 'Cancel Advance', danger: true,
                                    run: () => api.closeAdvance(r._id, { writeOff: r.recovered > 0 }),
                                    msg: r.recovered > 0 ? 'Written off' : 'Cancelled',
                                  })}>
                                    {r.recovered > 0 ? 'Write off the balance' : 'Cancel'}
                                  </MenuItem>
                                </RowMenu>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={r._id} data-focus-id={r._id}>
                            <td className="pr-idx">{(page - 1) * limit + i + 1}</td>
                            <td>
                              <div className="pr-who">
                                <Avatar name={r.employee.name} size={32} />
                                <div className="pr-who__txt"><b>{r.employee.name}</b><small>{r.employee.employeeId || r.employee.department}</small></div>
                              </div>
                            </td>
                            <td><Badge tone="slate">{r.category}</Badge></td>
                            <td><div className="pr-cell2 pr-cell2--wrap"><b>{r.description || '—'}</b>{r.taxable ? <small>Taxable</small> : <small>Not taxable</small>}</div></td>
                            <td className="pr-num pr-strong">{money(r.amount)}</td>
                            <td>{fmtDate(r.claimedOn)}</td>
                            <td><Badge tone={CLAIM_STATUS[r.status]?.[0] || 'slate'}>{CLAIM_STATUS[r.status]?.[1] || r.status}</Badge></td>
                            <td>
                              <div className="pr-acts" style={{ justifyContent: 'flex-end' }}>
                                {r.status === 'pending' && (
                                  <>
                                    <Btn size="sm" variant="soft" glyph="checkCircle"
                                      onClick={() => act(() => api.decideClaim(r._id, { status: 'approved' }), 'Approved — it will be paid in the next run')}>
                                      Approve
                                    </Btn>
                                    <IconBtn glyph="xCircle" label="Reject" danger
                                      onClick={() => setConfirm({
                                        title: 'Reject this claim?',
                                        body: `${r.employee.name}'s ${money(r.amount)} ${r.category.toLowerCase()} claim will be rejected. They are told, and it is not paid.`,
                                        confirm: 'Reject', danger: true,
                                        run: () => api.decideClaim(r._id, { status: 'rejected' }), msg: 'Rejected',
                                      })} />
                                  </>
                                )}
                                <RowMenu label={`Actions for ${r.employee.name}`}>
                                  <MenuItem glyph="checkCircle" disabled={r.status !== 'pending'}
                                    onClick={() => act(() => api.decideClaim(r._id, { status: 'approved' }), 'Approved')}>Approve</MenuItem>
                                  <MenuItem glyph="xCircle" disabled={r.status !== 'pending'}
                                    onClick={() => act(() => api.decideClaim(r._id, { status: 'rejected' }), 'Rejected')}>Reject</MenuItem>
                                  <MenuItem glyph="trash" danger disabled={r.status === 'paid'}
                                    onClick={() => setConfirm({
                                      title: 'Remove this claim?',
                                      body: 'It is taken off the list entirely. A claim that has been paid through payroll cannot be removed.',
                                      confirm: 'Remove', danger: true,
                                      run: () => api.deleteClaim(r._id), msg: 'Removed',
                                    })}>Remove</MenuItem>
                                </RowMenu>
                              </div>
                            </td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </TableWrap>
                  <Pager page={meta?.page || 1} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit}
                    noun={isAdv ? 'advances' : 'claims'} onPage={setPage} onLimit={v => { setLimit(v); setPage(1); }} />
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="pr-rail">
          <Panel title="How these reach a payslip" glyph="info" tone="blue">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: '.84rem', lineHeight: 1.55, color: 'var(--pr-ink-2)' }}>
              <div>
                <b style={{ display: 'block', color: 'var(--pr-ink)' }}>An advance</b>
                is taken back one instalment per run, starting from the month you set. If a month cannot bear the whole
                instalment it takes what it can and the rest waits — nobody is ever paid a negative salary.
              </div>
              <div>
                <b style={{ display: 'block', color: 'var(--pr-ink)' }}>A reimbursement</b>
                is added to the net once approved. It is not earnings: it does not raise gross pay, it is not taxed,
                and it does not touch CTC.
              </div>
            </div>
          </Panel>

          <QuickActions items={[
            { glyph: 'rupee', tone: 'indigo', label: 'Record an Advance', hint: 'Money paid ahead of salary', onClick: () => setAdvancing(true) },
            { glyph: 'docFill', tone: 'green', label: 'New Claim', hint: 'An expense to pay back', onClick: () => setClaiming(true) },
            { glyph: 'play', tone: 'blue', label: 'Payroll Runs', hint: 'Where both are settled', to: '/admin/payroll/runs' },
          ]} />

          <HelpCard text="Advances and claims settle on publish, never on a draft."
            action="How it works"
            onAction={() => toast('A draft run shows what it intends to take and pay. Publishing moves it; reversing a publish gives it back.', { icon: '📘', duration: 7000 })} />
        </div>
      </div>

      <AdvanceDialog open={advancing} onClose={() => setAdvancing(false)}
        onDone={() => { setAdvancing(false); setTab('advances'); setStatus('active'); refetch(); }} />
      <ClaimDialog open={claiming} onClose={() => setClaiming(false)}
        onDone={() => { setClaiming(false); setTab('claims'); refetch(); }} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        title={confirm?.title} body={confirm?.body} confirm={confirm?.confirm} danger={confirm?.danger}
        onConfirm={() => act(confirm.run, confirm.msg)} />
    </div>
  );
}
