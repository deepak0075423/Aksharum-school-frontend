/**
 * Payroll → Salary Slips (the employee's own view, Sep 2026 redesign).
 *
 * Framed by the FINANCIAL year, because that is the frame a payslip is used in
 * — tax, a loan application, a landlord. The old screen listed every payslip
 * ever issued with no totals and a Status column the Payslip model has no field
 * for, so it rendered an empty badge on every row.
 *
 * The rail holds the slip you picked, in full, with the download beside it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, PAYROLL_MY_TABS, PrHead, Tiles, Tile, Card, CardHead, Panel, HelpCard,
  Btn, Search, Badge, IconBtn, Mark, Glyph, Loading, Empty, Note, TableWrap, Facts, Fact,
  Ledger, NetBar, money, fmtDate, fmtDateTime, saveFile,
} from '../admin/prUI';

export default function TeacherPayslips() {
  const [sp, setSp] = useSearchParams();
  const selected = sp.get('slip') || '';
  const [year, setYear] = useState('');
  const [q, setQ] = useState('');

  const { data: slips, meta, loading } = useFetch(
    () => api.getMyPayslips({ year: year || undefined }), [year]);

  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = async (id) => {
    if (!id) { setDetail(null); return; }
    setDetailLoading(true);
    try { setDetail((await api.getPayslipDetail(id)).data); }
    catch (e) { toast.error(e.message); setDetail(null); }
    finally { setDetailLoading(false); }
  };
  useEffect(() => { loadDetail(selected); }, [selected]);
  useEffect(() => {
    if (selected || !slips?.length) return;
    setSp(p => { p.set('slip', slips[0]._id); return p; }, { replace: true });
  }, [slips, selected, setSp]);

  const summary = meta?.summary || {};
  const fy = meta?.financialYear?.label || '';
  const years = meta?.years || [];

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return slips || [];
    return (slips || []).filter(p => `${p.period} ${p.periodLong} ${p.slipNo}`.toLowerCase().includes(s));
  }, [slips, q]);

  const download = async (loader, name) => {
    try { saveFile(await loader(), name); }
    catch (e) { toast.error(e.message || 'Download failed'); }
  };
  const slipFile = (p) => `payslip_${p.periodLong.replace(' ', '_')}.pdf`;

  return (
    <div className="pr-page">
      <SectionBar tabs={PAYROLL_MY_TABS} yearLabel="Financial Year"
        yearOptions={years} year={year || fy} onYear={setYear}>
        <Btn variant="primary" glyph="download"
          onClick={() => download(() => api.downloadMyStatement({ year: year || fy }), `salary_statement_${year || fy}.pdf`)}>
          Salary Statement
        </Btn>
      </SectionBar>

      <PrHead title="Salary Slips"
        subtitle={fy ? `Your payslips for ${fy}, and what the year comes to` : 'Your monthly payslips'} />

      <Tiles n={4}>
        <Tile glyph="docFill" tone="indigo" valueFirst label="Payslips"
          value={loading ? '—' : (summary.count ?? 0)} caption={fy ? `Issued in ${fy}` : ''} />
        <Tile glyph="rupee" tone="blue" valueFirst label="Gross earnings" small
          value={loading ? '—' : money(summary.gross)} caption="Before deductions" />
        <Tile glyph="bars" tone="pink" valueFirst label="Deductions" small
          value={loading ? '—' : money(summary.deductions)} caption="PF, tax and others" />
        <Tile glyph="checkCircle" tone="green" valueFirst label="Take home" small
          value={loading ? '—' : money(summary.net)} caption="Paid to you this year" />
      </Tiles>

      {summary.lopDays > 0 && (
        <Note tone="amber" glyph="bang">
          {summary.lopDays} unpaid {summary.lopDays === 1 ? 'day was' : 'days were'} deducted across {fy}. Each month's
          payslip shows its own figure.
        </Note>
      )}

      <div className="pr-split">
        <div className="pr-stack">
          <Card>
            <CardHead title={`Payslips${fy ? ` — ${fy}` : ''}`} sub={`${rows.length} of ${slips?.length || 0}`} glyph="docFill">
              <Search value={q} onChange={setQ} placeholder="Search by month or slip number…" />
            </CardHead>
            <div className="pr-cardbody pr-cardbody--flush">
              {loading ? <Loading rows={5} /> : !rows.length ? (
                <Empty glyph="docFill" title={q ? 'No matching payslip' : 'No payslips yet'}
                  hint={q ? 'Try a different month or slip number.'
                    : 'A payslip is issued when the school publishes that month’s payroll. Nothing has been published for this year yet.'} />
              ) : (
                <TableWrap>
                  <table className="pr-table pr-table--stickyend">
                    <thead>
                      <tr>
                        <th className="pr-idx">#</th>
                        <th>Period</th>
                        <th>Slip No</th>
                        <th style={{ textAlign: 'right' }}>Paid Days</th>
                        <th style={{ textAlign: 'right' }}>Gross</th>
                        <th style={{ textAlign: 'right' }}>Deductions</th>
                        <th style={{ textAlign: 'right' }}>Net Pay</th>
                        <th>Issued</th>
                        <th style={{ textAlign: 'right' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((p, i) => (
                        <tr key={p._id} data-focus-id={p._id} className={p._id === selected ? 'is-on' : ''}>
                          <td className="pr-idx">{i + 1}</td>
                          <td><div className="pr-cell2"><b>{p.periodLong}</b><small>Monthly salary</small></div></td>
                          <td>{p.slipNo || '—'}</td>
                          <td className="pr-num">
                            {p.paidDays}/{p.workingDays}
                            {p.lopDays > 0 ? <div style={{ fontSize: '.72rem', color: '#b45309' }}>{p.lopDays} unpaid</div> : null}
                          </td>
                          <td className="pr-num">{money(p.grossSalary)}</td>
                          <td className="pr-num">{money(p.totalDeductions)}</td>
                          <td className="pr-num pr-strong">{money(p.netSalary)}</td>
                          <td>{fmtDate(p.generatedAt)}</td>
                          <td>
                            <div className="pr-acts" style={{ justifyContent: 'flex-end' }}>
                              <IconBtn glyph="eye" label={`View ${p.periodLong}`}
                                onClick={() => setSp(s => { s.set('slip', p._id); return s; })} />
                              <Btn size="sm" variant="soft" glyph="download"
                                onClick={() => download(() => api.downloadMyPayslip(p._id), slipFile(p))}>
                                PDF
                              </Btn>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableWrap>
              )}
            </div>
          </Card>
        </div>

        <div className="pr-rail">
          {detailLoading ? (
            <Panel title="Loading…"><Loading rows={5} /></Panel>
          ) : !detail ? (
            <Panel title="Payslip">
              <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--pr-muted)' }}>
                Pick a month to see the full payslip.
              </p>
            </Panel>
          ) : (
            <>
              <Panel title={detail.periodLong} sub={detail.slipNo ? `Slip ${detail.slipNo}` : 'Monthly salary'}
                glyph="docFill" status={<Badge tone="green">Issued</Badge>}>
                <Facts>
                  <Fact label="Paid days">{detail.paidDays} of {detail.workingDays}</Fact>
                  {detail.lopDays > 0 && <Fact label="Unpaid days">{detail.lopDays}</Fact>}
                  <Fact label="Issued on">{fmtDateTime(detail.generatedAt)}</Fact>
                </Facts>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 11, marginTop: 14 }}>
                  <Ledger title="Earnings" rows={(detail.earnings || []).map(e => ({
                    ...e,
                    note: e.fullAmount > e.amount ? `${money(e.fullAmount)} for a full month` : undefined,
                  }))} total={detail.grossSalary} />

                  {detail.lopAmount > 0 && (
                    <div style={{ fontSize: '.79rem', color: '#b45309', lineHeight: 1.5 }}>
                      {detail.lopDays} unpaid {detail.lopDays === 1 ? 'day' : 'days'} reduced your earnings by{' '}
                      {money(detail.lopAmount)} this month.
                    </div>
                  )}

                  {(detail.arrears > 0 || detail.bonus > 0) && (
                    <Ledger title="Additions" rows={[
                      ...(detail.arrears > 0 ? [{ name: 'Arrears', amount: detail.arrears }] : []),
                      ...(detail.bonus > 0 ? [{ name: 'Bonus', amount: detail.bonus }] : []),
                    ]} total={detail.arrears + detail.bonus} />
                  )}

                  <Ledger title="Deductions" tone="red" total={detail.totalDeductions + detail.otherDeductions}
                    rows={[
                      ...(detail.deductions || []),
                      ...(detail.otherDeductions > 0 ? [{ name: 'Other deductions', amount: detail.otherDeductions }] : []),
                    ]} />

                  <NetBar value={detail.netSalary} />

                  {detail.employerContributions?.length > 0 && (
                    <Ledger title="Paid by the school (not deducted)" rows={detail.employerContributions}
                      total={detail.employerCost} />
                  )}
                </div>

                {detail.remarks ? (
                  <div style={{ marginTop: 12 }}>
                    <Note tone="slate" glyph="info">{detail.remarks}</Note>
                  </div>
                ) : null}

                <Btn variant="primary" className="pr-btn--block" glyph="download" style={{ marginTop: 14 }}
                  onClick={() => download(() => api.downloadMyPayslip(detail._id), slipFile(detail))}>
                  Download Payslip
                </Btn>
                {detail.note ? (
                  <div style={{ fontSize: '.73rem', color: 'var(--pr-faint)', marginTop: 10, lineHeight: 1.5 }}>
                    {detail.note}
                  </div>
                ) : null}
              </Panel>

              {detail.employeeSnapshot?.bankAccountNumber ? (
                <Panel title="Paid into" flush>
                  <div className="pr-act">
                    <Mark glyph="bank" tone="blue" size={34} glyphSize={17} />
                    <span className="pr-act__t">
                      <b>{detail.employeeSnapshot.bankAccountNumber}</b>
                      <small>{[detail.employeeSnapshot.bankIfsc, detail.employeeSnapshot.bankName].filter(Boolean).join(' · ') || 'Bank transfer'}</small>
                    </span>
                  </div>
                </Panel>
              ) : null}

              <HelpCard text="A figure looks wrong? Raise it with the school office before the next run."
                action="How it works"
                onAction={() => toast('A payslip is a snapshot taken when the month was published — it does not change afterwards.', { icon: '📘', duration: 7000 })} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
