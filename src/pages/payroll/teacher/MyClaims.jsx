/**
 * Payroll → Claims & Tax (the employee's own view, Nov 2026).
 *
 * Three things an employee could not do or see before this screen existed:
 *
 *   • raise an expense claim. Claims were typed in by the office on a person's
 *     behalf; there was nowhere to submit one and nowhere to find out what had
 *     become of it. A claim raised here waits as "pending" for the office.
 *   • see an advance or a loan. The instalments simply came off the payslip.
 *   • see how their income tax is worked out, or get the year's statement. TDS
 *     appeared on the payslip as a number with no working behind it.
 *
 * Everything here is the caller's own — the endpoints scope to the signed-in
 * person — and nothing on it can change what they are paid.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, PAYROLL_MY_TABS, PrHead, Tiles, Tile, Card, CardHead, Panel, HelpCard, Modal,
  Btn, Badge, Field, Row, Select, Loading, Empty, Note, TableWrap, IconBtn,
  money, fmtDate, isoDay, saveFile,
} from '../admin/prUI';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

const CLAIM_STATUS = {
  pending:  ['amber', 'Waiting for the office'],
  approved: ['blue', 'Approved — in the next payroll'],
  paid:     ['green', 'Paid'],
  rejected: ['red', 'Not approved'],
};
const REGIME = { new: 'New regime', old: 'Old regime', none: 'No tax is deducted' };

function ClaimDialog({ open, onClose, onDone, categories = [] }) {
  const blank = { category: categories[0] || 'Other', amount: '', claimedOn: isoDay(new Date()), description: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { if (open) setForm(blank); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);
  const ready = num(form.amount) > 0 && form.description.trim().length >= 3;
  const save = async () => {
    setBusy(true);
    try {
      await api.createMyClaim({ ...form, amount: num(form.amount), description: form.description.trim() });
      toast.success('Claim submitted — the office will review it');
      onDone?.();
    } catch (e) { toast.error(e.message || 'Could not submit the claim'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New Expense Claim" glyph="rupee" tone="indigo"
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} disabled={!ready} onClick={save}>Submit Claim</Btn>
      </>}>
      <Row n={2}>
        <Field label="What was it for" required>
          <Select className="pr-select--block" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
            options={(categories.length ? categories : ['Other']).map(c => ({ value: c, label: c }))} />
        </Field>
        <Field label="Amount spent" required>
          <input className="pr-input" type="number" min="1" step="1" value={form.amount} placeholder="0"
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </Field>
      </Row>
      <Field label="Date of the expense" required>
        <input className="pr-input" type="date" max={isoDay(new Date())} value={form.claimedOn}
          onChange={e => setForm(f => ({ ...f, claimedOn: e.target.value }))} />
      </Field>
      <Field label="Details" required hint="Enough for the office to recognise it. Hand the bill itself to the accounts office.">
        <textarea data-text="sentence" className="pr-textarea" rows={2} maxLength={500} value={form.description}
          placeholder="Bus fare to the inter-school science fair"
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </Field>
      <Note tone="blue" glyph="info">
        An approved claim is paid back with your next salary. It is your own money being returned, so it is not part of
        your gross pay.
      </Note>
    </Modal>
  );
}

export default function TeacherClaimsAndTax() {
  const { data, loading, refetch } = useFetch(api.getMyClaims);
  const { data: tax, loading: taxLoading } = useFetch(api.getMyTax);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState('');

  const claims = data?.claims || [];
  const advances = data?.advances || [];
  const waiting = claims.filter(c => c.status === 'pending' || c.status === 'approved');
  const owing = advances.filter(a => a.status === 'active');

  const withdraw = async (c) => {
    setBusyId(c._id);
    try { await api.deleteMyClaim(c._id); toast.success('Claim withdrawn'); refetch(); }
    catch (e) { toast.error(e.message); } finally { setBusyId(''); }
  };
  const statement = async () => {
    try { saveFile(await api.downloadMyTaxStatement(), `tax_statement_${tax?.financialYear || 'year'}.pdf`, 'application/pdf'); }
    catch (e) { toast.error(e.message || 'Nothing to download yet'); }
  };

  return (
    <div className="pr-page">
      <SectionBar tabs={PAYROLL_MY_TABS} hideYear>
        <Btn variant="primary" icon="plus" onClick={() => setAdding(true)}>New Expense Claim</Btn>
      </SectionBar>

      <PrHead title="Claims & Tax" subtitle="Expenses you are owed, advances you are repaying, and how your income tax is worked out" />

      <Tiles n={4}>
        <Tile glyph="rupee" tone="indigo" valueFirst label="Claims waiting" small
          value={loading ? '—' : money(waiting.reduce((s, c) => s + c.amount, 0))}
          caption={`${waiting.length} ${waiting.length === 1 ? 'claim' : 'claims'} not yet paid`} />
        <Tile glyph="checkCircle" tone="green" valueFirst label="Claims paid" small
          value={loading ? '—' : money(claims.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount, 0))}
          caption="Returned through payroll" />
        <Tile glyph="wallet" tone="orange" valueFirst label="Still to repay" small
          value={loading ? '—' : money(owing.reduce((s, a) => s + a.outstanding, 0))}
          caption={owing.length ? `${owing.length} advance${owing.length === 1 ? '' : 's'} or loan${owing.length === 1 ? '' : 's'}` : 'No advance outstanding'} />
        <Tile glyph="bars" tone="pink" valueFirst label="Tax deducted" small
          value={taxLoading ? '—' : money(tax?.summary?.deductions || 0)}
          caption={tax?.financialYear ? `In ${tax.financialYear}` : 'This financial year'} />
      </Tiles>

      <div className="pr-split">
        <div className="pr-stack">
          <Card>
            <CardHead title="My expense claims" sub={`${claims.length} in all`} glyph="rupee">
              <Btn size="sm" icon="plus" onClick={() => setAdding(true)}>New claim</Btn>
            </CardHead>
            <div className="pr-cardbody pr-cardbody--flush">
              {loading ? <Loading rows={4} /> : !claims.length ? (
                <Empty glyph="rupee" title="No claims yet"
                  hint="Spent your own money on something for the school? Raise a claim and it is paid back with your salary once the office approves it." />
              ) : (
                <TableWrap>
                  <table className="pr-table" style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th>Date</th><th>For</th><th>Details</th>
                        <th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {claims.map(c => {
                        const [tone, label] = CLAIM_STATUS[c.status] || ['slate', c.status];
                        return (
                          <tr key={c._id}>
                            <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(c.claimedOn)}</td>
                            <td>{c.category}</td>
                            <td style={{ maxWidth: 280 }}>
                              {c.description || '—'}
                              {c.status === 'rejected' && c.decisionNote
                                ? <small style={{ display: 'block', color: '#b91c1c' }}>{c.decisionNote}</small> : null}
                            </td>
                            <td className="pr-num pr-strong">{money(c.amount)}</td>
                            <td><Badge tone={tone}>{label}</Badge></td>
                            <td style={{ textAlign: 'right' }}>
                              {c.status === 'pending'
                                ? <IconBtn glyph="trash" danger label="Withdraw this claim" disabled={busyId === c._id} onClick={() => withdraw(c)} />
                                : null}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Advances and loans" sub="Recovered from your salary in instalments" glyph="wallet" tone="orange" />
            <div className="pr-cardbody">
              {loading ? <Loading rows={2} /> : !advances.length ? (
                <p style={{ margin: 0, fontSize: '.86rem', color: 'var(--pr-muted)' }}>You have no advance or loan on record.</p>
              ) : advances.map(a => {
                const pct = a.amount > 0 ? Math.min(100, Math.round((a.recovered / a.amount) * 100)) : 0;
                return (
                  <div key={a._id} style={{ padding: '10px 0', borderTop: '1px solid var(--pr-line-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <b style={{ fontSize: '.9rem' }}>
                        {a.kind === 'loan' ? 'Loan' : 'Advance'} of {money(a.amount)}
                        {a.reason ? <span style={{ fontWeight: 400, color: 'var(--pr-muted)' }}> — {a.reason}</span> : null}
                      </b>
                      <Badge tone={a.status === 'active' ? 'amber' : 'green'}>
                        {a.status === 'active' ? `${money(a.outstanding)} to go` : 'Cleared'}
                      </Badge>
                    </div>
                    <div className="pr-share" style={{ margin: '8px 0 6px' }}><span style={{ width: `${pct}%`, background: '#16a34a' }} /></div>
                    <small style={{ color: 'var(--pr-muted)', fontSize: '.79rem' }}>
                      {money(a.recovered)} recovered so far · {a.instalments} instalment{a.instalments === 1 ? '' : 's'} of about {money(a.instalmentAmount)} from {a.startLabel}
                      {a.history.length ? ` · last taken ${a.history[a.history.length - 1].label}` : ''}
                    </small>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="pr-rail">
          <Panel title="My income tax" sub={tax?.financialYear ? `Financial year ${tax.financialYear}` : undefined}
            status={tax?.regime ? <Badge tone={tax.regime === 'none' ? 'slate' : 'indigo'}>{REGIME[tax.regime] || tax.regime}</Badge> : null}>
            {taxLoading ? <Loading rows={5} /> : !tax?.hasData ? (
              <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--pr-muted)' }}>
                Nothing to show yet — the working appears once a payslip has been issued this financial year.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {tax.rows.map((r, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0',
                      borderTop: i ? '1px solid var(--pr-line-2)' : 0, fontSize: '.84rem',
                      fontWeight: /^(Taxable income|Total tax|Tax deducted|Balance|Deducted in excess)/.test(r.particulars) ? 600 : 400,
                    }}>
                      <span>{r.particulars}{r.note ? <small style={{ display: 'block', color: 'var(--pr-muted)', fontWeight: 400 }}>{r.note}</small> : null}</span>
                      <span style={{ whiteSpace: 'nowrap' }}>{money(r.amount)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12 }}>
                  <Btn className="pr-btn--block" glyph="download" onClick={statement}>Tax Statement (PDF)</Btn>
                </div>
                {tax.regime === 'none' && (
                  <div style={{ marginTop: 12 }}>
                    <Note tone="slate" glyph="info">Your school does not deduct income tax through payroll, so no tax is worked out here.</Note>
                  </div>
                )}
              </>
            )}
          </Panel>

          <HelpCard text="The figures are worked out from the payslips you have actually been issued. The Form 16 certificate itself comes from the Income Tax Department's portal."
            action="How tax is spread"
            onAction={() => toast('Each month the year’s tax is worked out again on what you have been paid so far plus what is expected, and what is left is spread over the months remaining. A bonus or arrears is counted in the month it is paid.', { icon: '📘', duration: 9000 })} />
        </div>
      </div>

      <ClaimDialog open={adding} categories={data?.categories || []} onClose={() => setAdding(false)}
        onDone={() => { setAdding(false); refetch(); }} />
    </div>
  );
}
