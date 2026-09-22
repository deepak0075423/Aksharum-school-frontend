/**
 * Payroll → My Salary (the employee's own view, Sep 2026 redesign).
 *
 * Built on the admin module's `pr-` kit so the two sides of Payroll read as one
 * product, and on the same engine: the breakdown below is computed by
 * services/payrollCalc.js, which is what a payroll run uses — so the figure
 * shown here is the figure that will be paid.
 *
 * Two things the old screen got wrong and this one is careful about:
 *   • it printed the STORED CTC beside a breakdown built from a different one,
 *     so a revision dated next April made the page contradict itself. The
 *     headline is the CTC in force THIS month; a pending revision is called out
 *     separately.
 *   • it read `asgn.effectiveFrom`, a field that does not exist, so "Effective
 *     from" was permanently "—".
 */
import React from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, PAYROLL_MY_TABS, PrHead, Tiles, Tile, Card, CardHead, Panel, HelpCard,
  Btn, Badge, Mark, Glyph, Loading, Empty, Note, Facts, Fact, Ledger, NetBar, Avatar,
  money, fmtDate, saveFile, STRUCTURE_TYPE, PAYMENT_MODE,
} from '../admin/prUI';
import { PayBars, ChartEmpty } from '../admin/prCharts';

export default function TeacherMySalary() {
  const { data, loading } = useFetch(api.getMyCtc);
  const d = data || {};
  const who = d.employee || {};
  const b = d.breakdown;

  const download = async () => {
    try { saveFile(await api.downloadMyStatement(), 'salary_statement.pdf'); }
    catch (e) { toast.error(e.message || 'Nothing to download yet'); }
  };

  const lastPaid = (d.recent || [])[0];

  return (
    <div className="pr-page">
      <SectionBar tabs={PAYROLL_MY_TABS} hideYear>
        <Btn glyph="download" onClick={download}>Salary Statement</Btn>
      </SectionBar>

      <PrHead title="My Salary" subtitle="Your salary structure, what it pays each month, and how it has changed" />

      {loading ? <Loading rows={6} /> : !d.hasSalary ? (
        <Card>
          <Empty glyph="wallet" title="No salary assigned yet"
            hint={`${who.name ? `${who.name}, your` : 'Your'} salary structure has not been set up. Your school's administrator assigns one before the first payroll run.`} />
        </Card>
      ) : (
        <>
          <Tiles n={4}>
            <Tile glyph="wallet" tone="indigo" label="Annual CTC" value={money(d.annualCtc)} small
              caption={`In force for ${d.monthLabel}`} />
            <Tile glyph="rupee" tone="blue" label="Monthly CTC" value={money(d.monthlyCtc)} small
              caption="Cost to the school, per month" />
            <Tile glyph="checkCircle" tone="green" label="Take home (monthly)" value={money(b?.netSalary)} small
              caption="After deductions, before loss of pay" />
            <Tile glyph="docFill" tone="purple" label="Last paid" small
              value={lastPaid ? money(lastPaid.net) : '—'}
              caption={lastPaid ? lastPaid.label : 'No payslip issued yet'} />
          </Tiles>

          {d.pendingRevision && (
            <Note tone="blue" glyph="chartUp">
              Your CTC is revised to <b>{money(d.pendingRevision.annualCtc)}</b> from {d.pendingRevision.effectiveLabel}
              {d.pendingRevision.note ? ` — ${d.pendingRevision.note}` : ''}. The figures below are what {d.monthLabel} pays.
            </Note>
          )}

          <div className="pr-split">
            <div className="pr-stack">
              <Card>
                <CardHead title="Monthly breakdown" glyph="rupee"
                  sub={d.structure?.payBasis === 'rate'
                    ? `${money(d.structure.rate)} per ${d.structure.rateUnit}`
                    : `On the “${d.structure?.name}” structure`}>
                  <Badge tone={STRUCTURE_TYPE[d.structure?.type]?.[0] || 'slate'}>
                    {STRUCTURE_TYPE[d.structure?.type]?.[1] || 'General'}
                  </Badge>
                </CardHead>
                <div className="pr-cardbody">
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, alignItems: 'start' }}>
                    <Ledger title="Earnings" rows={b.earnings} total={b.grossSalary} />
                    <Ledger title="Deductions" rows={b.deductions} total={b.totalDeductions} tone="red" />
                  </div>
                  <div style={{ marginTop: 14 }}><NetBar label="Take home each month" value={b.netSalary} /></div>

                  {b.employerContributions?.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <Ledger title="Paid by the school on your behalf" rows={b.employerContributions} total={b.employerCost} />
                      <div style={{ fontSize: '.78rem', color: 'var(--pr-muted)', marginTop: 8, lineHeight: 1.5 }}>
                        These are employer contributions. They are part of your CTC and are not deducted from your pay —
                        gross {money(b.grossSalary)} plus {money(b.employerCost)} is the {money(b.monthlyCost)} a month
                        your CTC represents.
                      </div>
                    </div>
                  )}

                  <div style={{ fontSize: '.78rem', color: 'var(--pr-muted)', marginTop: 14, lineHeight: 1.5 }}>
                    Computed on a {b.workingDays}-day month. A day of unpaid leave reduces the pro-rated lines by one
                    day's worth; the exact figure for any month is on that month's payslip.
                  </div>
                </div>
              </Card>

              <Card>
                <CardHead title="What you were actually paid" sub="Last six months" glyph="chartUp">
                  <Link className="pr-link" to="/teacher/payroll/payslips">All payslips <Glyph name="arrowRight" size={15} /></Link>
                </CardHead>
                <div className="pr-cardbody">
                  <PayBars data={d.series || []} height={220}
                    empty={<ChartEmpty glyph="wallet" title="No payslips yet"
                      hint="Your payslips appear here once a payroll run is published" />} />
                </div>
              </Card>
            </div>

            <div className="pr-rail">
              <Panel title="My details" flush>
                <div className="pr-who pr-who--rail">
                  <Avatar name={who.name} size={42} />
                  <div className="pr-who__txt">
                    <b>{who.name || '—'}</b>
                    <small>{[who.employeeId, who.designation].filter(Boolean).join(' · ') || who.email}</small>
                  </div>
                </div>
                <div className="pr-panel__body">
                  <Facts>
                    <Fact label="Department">{who.department || '—'}</Fact>
                    <Fact label="Joined">{who.joiningDate ? fmtDate(who.joiningDate) : '—'}</Fact>
                    <Fact label="Structure">{d.structure?.name || '—'}</Fact>
                    <Fact label="Effective from">{fmtDate(d.effectiveDate)}</Fact>
                    {d.endDate ? <Fact label="Until">{fmtDate(d.endDate)}</Fact> : null}
                    <Fact label="Paid by">{PAYMENT_MODE[d.paymentMode] || d.paymentMode}</Fact>
                    <Fact label="Bank account">{who.bankAccount || 'Not on file'}</Fact>
                    {who.uanNumber ? <Fact label="UAN">{who.uanNumber}</Fact> : null}
                    {who.panNumber ? <Fact label="PAN">{who.panNumber}</Fact> : null}
                  </Facts>
                  {d.paymentMode === 'bank_transfer' && !who.bankAccount && (
                    <div style={{ marginTop: 12 }}>
                      <Note tone="amber" glyph="bang">
                        There is no bank account on your record, so your salary cannot be transferred. Ask the office to
                        add it.
                      </Note>
                    </div>
                  )}
                </div>
              </Panel>

              {d.revisions?.length > 0 && (
                <Panel title="Salary history" sub={`${d.revisions.length} ${d.revisions.length === 1 ? 'entry' : 'entries'}`} flush>
                  <div style={{ padding: '4px 0 8px' }}>
                    {d.revisions.slice(0, 6).map((r, i) => (
                      <div className="pr-act" key={i}>
                        <Mark glyph={r.incrementType === 'initial' ? 'plusCircle' : 'chartUp'}
                          tone={r.incrementType === 'initial' ? 'slate' : 'green'} size={32} glyphSize={16} />
                        <span className="pr-act__t">
                          <b>{money(r.annualCtc)}</b>
                          <small>{r.note || (r.incrementType === 'initial' ? 'Initial CTC' : 'Revision')}</small>
                        </span>
                        <span className="pr-act__when">{r.effectiveLabel}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}

              <Panel title="Recent payslips" flush>
                <div className="pr-qa">
                  {(d.recent || []).length === 0 ? (
                    <div style={{ padding: '14px 16px', fontSize: '.84rem', color: 'var(--pr-muted)' }}>
                      None yet — payslips appear once a month's payroll is published.
                    </div>
                  ) : d.recent.slice(0, 5).map(r => (
                    <Link key={r.label} className="pr-qarow" to="/teacher/payroll/payslips">
                      <Mark glyph="docFill" tone="indigo" size={32} glyphSize={16} />
                      <span className="pr-qarow__t">
                        <b>{money(r.net)}</b>
                        <small>{r.label}{r.lopDays ? ` · ${r.lopDays} unpaid ${r.lopDays === 1 ? 'day' : 'days'}` : ''}</small>
                      </span>
                      <Glyph name="chevronRight" size={16} />
                    </Link>
                  ))}
                </div>
              </Panel>

              <HelpCard text="Something here looks wrong? The school office maintains your salary record."
                action="How it works"
                onAction={() => toast('Your CTC is set by the office. Each month it becomes a payroll run, and a published run issues your payslip.', { icon: '📘', duration: 7000 })} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
