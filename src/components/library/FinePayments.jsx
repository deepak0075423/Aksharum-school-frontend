/**
 * Library fines for the person who owes them — and for a parent paying on a
 * child's behalf. One component serves both; the server decides whose fines the
 * caller may see, so `forUserId` is a request, not a claim.
 *
 * Receipts appear here whether the fine was paid at the counter or online, so a
 * parent who handed over cash has the same document as one who tapped a card.
 *
 * A row's Pay Now settles that one charge and nothing else; Pay Outstanding
 * settles everything still owed. Both say what they are about to charge before
 * the checkout opens.
 *
 * `FinePayments` is the shell that loads and pays; `FinesView` is the screen it
 * draws, kept pure so it can be rendered and checked without a browser.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  getFineSummary, createFineOrder, confirmFinePayment, listMyReceipts, fineReceiptPath,
} from '../../api/library.api';
import { openCheckout } from '../../utils/razorpay';
import api from '../../api/axios';
import { Button, Spinner, Modal } from '../ui/index';
import Icon from '../ui/icons';
import { saveFile } from '../../utils/downloadFile';
import { RowMenu, MenuItem } from '../../pages/admin/listParts';
import { Fig, Panel } from '../../pages/library/student/dashboardParts';
import { Cover } from '../../pages/library/student/searchParts';
import PhoneCards from '../ui/PhoneCards';
import { useLibView, ViewToggle } from '../../pages/library/libView';

const fmtDate = (d) => (d
  ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  : '—');
const money = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const TYPE_LABEL = { late_return: 'Late return', lost: 'Lost book', damaged: 'Damaged book' };
const PAID_LABEL = { paid: 'Paid', waived: 'Waived', cancelled: 'Cancelled' };
const PAID_TONE  = { paid: 'green', waived: 'slate', cancelled: 'slate' };

/** Opens an authenticated receipt in a new tab — a plain link carries no token. */
export async function openReceipt(receiptNumber) {
  const tab = window.open('', '_blank');
  try {
    const res = await fetch(`${api.defaults.baseURL}${fineReceiptPath(receiptNumber)}`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message || 'Could not open the receipt');
    }
    const html = await res.text();
    if (!tab) return toast.error('Allow pop-ups to view the receipt');
    tab.document.write(html);
    tab.document.close();
  } catch (err) {
    tab?.close();
    toast.error(err?.message || 'Could not open the receipt');
  }
}

/** The book a charge was raised over, as a table cell. */
const BookCell = ({ book }) => (
  book ? (
    <div className="libsr-book">
      <Cover book={book} />
      <div className="libsr-book__body">
        <strong className="libfn-booktitle">{book.title}</strong>
        <span>{(book.authors || []).join(', ') || 'Unknown author'}</span>
        {book.isbn && <em>ISBN: {book.isbn}</em>}
      </div>
    </div>
  ) : <span className="libsr-dash">Not tied to a book</span>
);

// ── The screen ───────────────────────────────────────────────────────────────
export function FinesView({
  data, receipts = [], title = 'Outstanding Fines', paying,
  onPay, onPayAll, onExport, onDetail, onReceipt = openReceipt,
}) {
  const pending = data?.pending || [];
  const settled = data?.settled || [];
  const p       = data?.policy  || {};
  const canPayOnline = !!data?.gateway?.enabled && data?.outstanding > 0;
  const payAll  = onPayAll || onPay;
  // List or Card for each table (laptop, List each visit; pages/library/libView).
  const owedView = useLibView();
  const paidView = useLibView();

  // The figures narrow the page: Outstanding (and Pending Payments) show what
  // is still to pay, Paid Fines the year's payments, Total Fines everything.
  // Clicking the lit one again goes back to everything.
  const [fig, setFig] = useState('all');
  const pick = (key) => setFig((cur) => (cur === key ? 'all' : key));
  const showPending = ['all', 'outstanding', 'pending'].includes(fig);
  const showSettled = ['all', 'paid'].includes(fig);

  const yearStart = data?.academicYear?.startDate ? new Date(data.academicYear.startDate).getTime() : 0;
  const paidInYear = (f) => f.status === 'paid'
    && (!yearStart || new Date(f.paidAt || f.createdAt).getTime() >= yearStart);
  const paidThisYear = useMemo(() => settled.filter(paidInYear).length, [settled, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const settledRows  = fig === 'paid' ? settled.filter(paidInYear) : settled;
  const showAll = fig !== 'all'
    ? <button type="button" className="liblg-more libfn-showall" onClick={() => setFig('all')}>Show all fines</button>
    : null;

  return (
    <>
      <div className="liblg-figs">
        <Fig icon="alert" tone="red" label="Total Outstanding" value={money(data?.outstanding)}
          caption={pending.length
            ? `${pending.length} item${pending.length === 1 ? '' : 's'}`
            : 'Nothing to pay'}
          active={fig === 'outstanding'} onClick={() => pick('outstanding')} />
        <Fig icon="files" tone="blue" label="Total Fines" value={pending.length + settled.length}
          caption="All time" active={fig === 'all'} onClick={() => setFig('all')} />
        <Fig icon="checkCircle" tone="green" label="Paid Fines" value={paidThisYear}
          caption={data?.academicYear?.yearName ? `In ${data.academicYear.yearName}` : 'All time'}
          active={fig === 'paid'} onClick={() => pick('paid')} />
        {/* Fines still to be paid — the same rows the list marks Unpaid. It
            used to count only online payments started and not confirmed, so a
            damage fine waiting at the counter showed "0 pending". */}
        <Fig icon="clock" tone="violet" label="Pending Payments" value={pending.length}
          caption={data?.pendingPayments
            ? `${data.pendingPayments} started online, not confirmed`
            : pending.length ? `${money(data?.outstanding)} to pay` : 'No pending actions'}
          active={fig === 'pending'} onClick={() => pick('pending')} />
      </div>

      <div className="libfn-body">
        <div className="libfn-main">
          {showPending && (
          <Panel icon="alert" tone="red" title={`${title} (${pending.length})`}
            action={(showAll || pending.length > 0) ? (
              <div className="liblg-acts">{showAll}{pending.length > 0 && <ViewToggle view={owedView} />}</div>
            ) : null}>
            {!pending.length ? (
              <div className="liblg-empty">
                <span className="liblg-empty__icon"><Icon name="checkCircle" size={26} /></span>
                <div>
                  <strong>Nothing outstanding</strong>
                  <p>There are no library fines to pay.</p>
                </div>
              </div>
            ) : (
              <PhoneCards {...owedView.phc} title="Description" side="Status" keep={['Book details', 'Raised on', 'Amount']}>
              <div className="libsr-tablewrap">
                <table className="libsr-table libfn-table">
                  <thead>
                    {/* Rows carry data-focus-id so a notification about one
                        fine can flag it — see hooks/useFocusHighlight.js. */}
                    <tr>
                      <th className="libfn-num">#</th>
                      <th>Description</th>
                      <th>Book details</th>
                      <th>Raised on</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th className="libsr-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((f, i) => (
                      <tr key={f._id} data-focus-id={f._id}>
                        <td className="libfn-num">{i + 1}</td>
                        <td>
                          <strong>{TYPE_LABEL[f.fineType] || f.fineType}</strong>
                          {f.daysOverdue > 0 && (
                            <em className="libfn-sub">{f.daysOverdue} day{f.daysOverdue === 1 ? '' : 's'} late</em>
                          )}
                        </td>
                        <td><BookCell book={f.book} /></td>
                        <td>{fmtDate(f.createdAt)}</td>
                        <td>
                          <strong>{money(f.outstanding ?? f.amount)}</strong>
                          {f.waivedAmount > 0 && (
                            <em className="libfn-sub libfn-waived">{money(f.waivedAmount)} waived</em>
                          )}
                        </td>
                        <td><span className="libsr-pill libsr-t--red">Unpaid</span></td>
                        <td className="libsr-right">
                          <div className="libsr-actions">
                            {/* This charge only — the rest stay as they are. */}
                            {canPayOnline && (
                              <Button size="sm" loading={paying === f._id} disabled={!!paying && paying !== f._id}
                                onClick={() => onPay(f)} title="Pay this fine only">Pay Now</Button>
                            )}
                            <RowMenu>
                              <MenuItem icon="eye" onClick={() => onDetail(f)}>Why this charge?</MenuItem>
                              {canPayOnline && (
                                <MenuItem icon="creditCard" onClick={() => onPay(f)}>
                                  Pay this fine — {money(f.outstanding ?? f.amount)}
                                </MenuItem>
                              )}
                              {canPayOnline && pending.length > 1 && (
                                <MenuItem icon="creditCard" onClick={payAll}>
                                  Pay all outstanding — {money(data.outstanding)}
                                </MenuItem>
                              )}
                            </RowMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </PhoneCards>
            )}
            {data?.outstanding > 0 && !canPayOnline && (
              <p className="libfn-note">
                <Icon name="alert" size={15} />
                Online payment is not available for library fines at this school — please pay at the
                library counter. You will get a receipt either way.
              </p>
            )}
          </Panel>
          )}

          {showSettled && (
          <Panel icon="checkCircle" tone="green"
            title={fig === 'paid' && data?.academicYear?.yearName
              ? `Paid in ${data.academicYear.yearName} (${settledRows.length})`
              : 'Payment History'}
            action={(showAll || settledRows.length > 0) ? (
              <div className="liblg-acts">{showAll}{settledRows.length > 0 && <ViewToggle view={paidView} />}</div>
            ) : null}>
            {!settledRows.length ? (
              <div className="liblg-empty">
                <span className="liblg-empty__icon"><Icon name="files" size={26} /></span>
                <div>
                  <strong>{fig === 'paid' && settled.length ? 'Nothing paid this year' : 'No payments yet'}</strong>
                  <p>
                    {fig === 'paid' && settled.length
                      ? 'Fines paid in earlier years are under Total Fines.'
                      : 'Your fine payment history will appear here once you make a payment.'}
                  </p>
                </div>
              </div>
            ) : (
              <PhoneCards {...paidView.phc} title="Description" side="Status" keep={['Book details', 'Paid on', 'Amount', 'Receipt']}>
              <div className="libsr-tablewrap">
                <table className="libsr-table libfn-table">
                  <thead>
                    <tr>
                      <th className="libfn-num">#</th>
                      <th>Description</th>
                      <th>Book details</th>
                      <th>Paid on</th>
                      <th>Amount</th>
                      <th>Receipt</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {settledRows.map((f, i) => (
                      <tr key={f._id} data-focus-id={f._id}>
                        <td className="libfn-num">{i + 1}</td>
                        <td>
                          <strong>{TYPE_LABEL[f.fineType] || f.fineType}</strong>
                          {f.paymentMode && f.status === 'paid' && (
                            <em className="libfn-sub">
                              {f.paymentMode === 'online' ? 'Paid online' : 'Cash at the library'}
                            </em>
                          )}
                        </td>
                        <td><BookCell book={f.book} /></td>
                        <td>{fmtDate(f.paidAt || f.waivedAt)}</td>
                        <td>
                          <strong>{money(f.paidAmount || Math.max(0, (f.amount || 0) - (f.waivedAmount || 0)))}</strong>
                          {f.waivedAmount > 0 && (
                            <em className="libfn-sub libfn-waived">{money(f.waivedAmount)} waived</em>
                          )}
                        </td>
                        <td>
                          {f.receiptNumber
                            ? (
                              <button type="button" className="libfn-receipt"
                                onClick={() => onReceipt(f.receiptNumber)}>
                                <Icon name="files" size={14} />{f.receiptNumber}
                              </button>
                            )
                            : <span className="libsr-dash">—</span>}
                        </td>
                        <td>
                          <span className={`libsr-pill libsr-t--${PAID_TONE[f.status] || 'slate'}`}>
                            {PAID_LABEL[f.status] || f.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </PhoneCards>
            )}
          </Panel>
          )}
        </div>

        {/* ── Rail ────────────────────────────────────────────────────── */}
        <aside className="libfn-rail">
          <Panel icon="creditCard" tone="indigo" title="Quick Actions">
            <div className="libfn-acts">
              {canPayOnline && (
                <button type="button" className="libfn-act libfn-act--pay" onClick={payAll} disabled={!!paying}>
                  <Icon name="creditCard" size={18} />
                  <span>Pay Outstanding<em>{money(data.outstanding)}</em></span>
                  <Icon name="chevronRight" size={16} />
                </button>
              )}
              <button type="button" className="libfn-act" onClick={onExport} disabled={!receipts.length}>
                <Icon name="download" size={18} />
                <span>
                  Export receipts
                  <em>{receipts.length
                    ? `${receipts.length} receipt${receipts.length === 1 ? '' : 's'} as CSV`
                    : 'Nothing to export yet'}</em>
                </span>
                <Icon name="chevronRight" size={16} />
              </button>
            </div>
          </Panel>

          {/* The rules the charges came from, stated rather than linked — a
              member has no page of their own to read the policy on. */}
          <Panel icon="alert" tone="blue" title="Fine Policy">
            <ul className="libfn-policy">
              <li>
                <Icon name="clock" size={15} />
                Late returns cost <strong>{money(p.finePerDay)} per day</strong>
                {p.gracePeriodDays > 0 && <> after a {p.gracePeriodDays}-day grace period</>}.
              </li>
              <li>
                <Icon name="alert" size={15} />
                A lost book is charged <strong>{p.lostBookFineDays ?? '—'} days</strong> of fine,
                a damaged one <strong>{p.damagedBookFineDays ?? '—'} days</strong>.
              </li>
              <li>
                <Icon name="files" size={15} />
                Every payment gets a receipt, whether it is made online or at the counter.
              </li>
              {p.teacherFinesEnabled === false && (
                <li>
                  <Icon name="checkCircle" size={15} />
                  Staff loans are not fined by default — a charge already raised still stands.
                </li>
              )}
            </ul>
          </Panel>
        </aside>
      </div>
    </>
  );
}

// ── The shell ────────────────────────────────────────────────────────────────
export default function FinePayments({ forUserId, payerName, title = 'Outstanding Fines' }) {
  const [data,     setData]     = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [loading,  setLoading]  = useState(true);
  // The fine being paid (its id), 'all', or nothing.
  const [paying,   setPaying]   = useState('');
  const [detail,   setDetail]   = useState(null);
  // What the confirmation is about to charge: { fines, all }.
  const [confirm,  setConfirm]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, rcpts] = await Promise.all([
        getFineSummary(forUserId),
        listMyReceipts(forUserId).catch(() => ({ data: [] })),
      ]);
      setData(summary?.data || null);
      setReceipts(rcpts?.data || []);
    } catch (err) {
      toast.error(err?.message || 'Could not load fines');
      setData(null);
    } finally { setLoading(false); }
  }, [forUserId]);

  useEffect(() => { load(); }, [load]);

  const pending = data?.pending || [];

  /**
   * Opens the checkout for exactly the fines named — one row's Pay Now sends
   * that fine alone, Pay Outstanding sends every one. The server prices the
   * order from these ids, never from an amount in the request.
   */
  const pay = async () => {
    const chosen = confirm;
    setConfirm(null);
    if (!chosen?.fines?.length) return;
    setPaying(chosen.all ? 'all' : chosen.fines[0]._id);
    try {
      const orderRes = await createFineOrder({ userId: forUserId, fineIds: chosen.fines.map((f) => f._id) });
      const order = orderRes?.data;

      await openCheckout({
        order,
        amount: order.payable,
        name: 'Library fine',
        description: order.fineIds.length === 1
          ? `${TYPE_LABEL[chosen.fines[0].fineType] || 'Fine'}${chosen.fines[0].book?.title ? ` — ${chosen.fines[0].book.title}` : ''}`
          : `${order.fineIds.length} fines`,
        prefillName: payerName,
        onDismiss: () => setPaying(''),
        onError: (err) => { toast.error(err.message); setPaying(''); },
        onVerify: async (response) => {
          try {
            const v = await confirmFinePayment({
              ...response, userId: forUserId, fineIds: order.fineIds,
            });
            toast.success(`Paid — receipt ${v.data.receiptNumber}`);
            await load();
            openReceipt(v.data.receiptNumber);
          } catch (err) {
            // The money may well have left; never imply otherwise.
            toast.error(err?.message || 'We could not confirm the payment — please contact the school office.');
          } finally { setPaying(''); }
        },
      });
    } catch (err) {
      toast.error(err?.message || 'Could not start the payment');
      setPaying('');
    }
  };

  /** Money is about to move, so every payment says what it covers first. */
  const payOne = (fine) => setConfirm({ fines: [fine], all: false });
  const payAll = () => setConfirm({ fines: pending, all: true });
  const confirmTotal = (confirm?.fines || []).reduce((n, f) => n + Number(f.outstanding ?? f.amount ?? 0), 0);
  const one = confirm && !confirm.all ? confirm.fines[0] : null;

  const exportReceipts = () => {
    if (!receipts.length) return toast.error('There are no receipts to export');
    const head = ['Receipt', 'Paid on', 'Mode', 'Amount', 'Charges', 'Reference'];
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = receipts.map((r) => [
      r.receiptNumber, fmtDate(r.paidAt),
      r.paymentMode === 'online' ? 'Online' : 'Cash at the library',
      r.amount, r.count, r.reference,
    ].map(cell).join(','));
    saveFile([head.map(cell).join(','), ...body].join('\n'), 'library-fine-receipts.csv', 'text/csv;charset=utf-8');
    toast.success(`Exported ${receipts.length} receipt${receipts.length === 1 ? '' : 's'}`);
  };

  if (loading) return <div className="libfn-loading"><Spinner /></div>;
  if (!data) return null;

  return (
    <>
      <FinesView data={data} receipts={receipts} title={title} paying={paying}
        onPay={payOne} onPayAll={payAll} onExport={exportReceipts} onDetail={setDetail} />

      {detail && <FineDetail fine={detail} policy={data.policy || {}} onClose={() => setDetail(null)} />}

      <Modal open={!!confirm} onClose={() => setConfirm(null)} maxWidth={460}
        title={one ? 'Pay this fine' : 'Pay all outstanding fines'}
        footer={<>
          <Button variant="secondary" onClick={() => setConfirm(null)}>Cancel</Button>
          <Button onClick={pay}><Icon name="creditCard" size={15} /> Pay {money(confirmTotal)}</Button>
        </>}>
        {one ? (
          <>
            <p className="libfn-confirm__lead">
              Pay <b>{money(confirmTotal)}</b> for this fine only. Your other fines stay as they are.
            </p>
            <dl className="libf-pay">
              <div><dt>Charge</dt><dd>{TYPE_LABEL[one.fineType] || one.fineType}</dd></div>
              {one.book?.title && <div><dt>Book</dt><dd>{one.book.title}</dd></div>}
              <div><dt>Raised on</dt><dd>{fmtDate(one.createdAt)}</dd></div>
              <div className="is-total"><dt>To pay now</dt><dd>{money(confirmTotal)}</dd></div>
            </dl>
          </>
        ) : (
          <>
            <p className="libfn-confirm__lead">
              Pay every outstanding fine in one payment — <b>{confirm?.fines?.length || 0}</b> fine
              {confirm?.fines?.length === 1 ? '' : 's'}, <b>{money(confirmTotal)}</b> in total.
            </p>
            <dl className="libf-pay">
              {(confirm?.fines || []).map((f) => (
                <div key={f._id}>
                  <dt>{TYPE_LABEL[f.fineType] || f.fineType}{f.book?.title ? ` — ${f.book.title}` : ''}</dt>
                  <dd>{money(f.outstanding ?? f.amount)}</dd>
                </div>
              ))}
              <div className="is-total"><dt>To pay now</dt><dd>{money(confirmTotal)}</dd></div>
            </dl>
          </>
        )}
        <p className="libf-pay__note">
          <Icon name="files" size={14} /> You get a receipt as soon as the payment goes through.
        </p>
      </Modal>
    </>
  );
}

// ── Why a charge exists ──────────────────────────────────────────────────────
export function FineDetail({ fine, policy, onClose }) {
  const rule = fine.fineType === 'late_return'
    ? `${policy.finePerDay ? `₹${policy.finePerDay} per day late` : 'a daily rate set by the school'}${policy.gracePeriodDays ? `, after ${policy.gracePeriodDays} grace day(s)` : ''}`
    : fine.fineType === 'lost'
      ? `${policy.lostBookFineDays} days of fine for a lost book`
      : `${policy.damagedBookFineDays} days of fine for a damaged book`;

  const rows = [
    ['Charge',       TYPE_LABEL[fine.fineType] || fine.fineType],
    ['Raised on',    fmtDate(fine.createdAt)],
    ['Days late',    fine.daysOverdue ? String(fine.daysOverdue) : null],
    ['Charged',      money(fine.amount)],
    ['Waived',       fine.waivedAmount ? money(fine.waivedAmount) : null],
    ['Still to pay', money(fine.outstanding ?? fine.amount)],
    ['Borrowed',     fine.loan?.issueDate ? fmtDate(fine.loan.issueDate) : null],
    ['Was due',      fine.loan?.dueDate ? fmtDate(fine.loan.dueDate) : null],
    ['Returned',     fine.loan?.returnDate ? fmtDate(fine.loan.returnDate) : null],
  ].filter(([, v]) => v);

  return (
    <Modal open onClose={onClose} maxWidth={560}
      title={TYPE_LABEL[fine.fineType] || 'Fine'}
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <div className="libsr-detail">
        {fine.book && <Cover book={fine.book} size="lg" />}
        <div className="libsr-detail__body">
          {fine.book && <p className="libfn-detailbook"><strong>{fine.book.title}</strong></p>}
          {rows.map(([label, value]) => (
            <div key={label} className="libsr-detail__row"><span>{label}</span><strong>{value}</strong></div>
          ))}
        </div>
      </div>
      <p className="libfn-rule"><Icon name="alert" size={15} />The school&apos;s rule: {rule}.</p>
    </Modal>
  );
}
