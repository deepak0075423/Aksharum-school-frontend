/**
 * Payroll → Settings, with the audit log beside it.
 *
 * The two answer the same question from opposite ends: how this module is set
 * up to behave, and what it has actually done. For a module that moves money
 * the second half is not optional — every write in payroll is audited, and
 * until now nothing displayed it.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, Crumbs, PrHead, Card, CardHead, Panel, HelpCard, PillTabs,
  Btn, Select, Search, Toggle, Field, Row, Badge, Mark, Glyph, IconBtn,
  Loading, Empty, TableWrap, Pager, Note, Avatar,
  money, fmtDateTime, MONTHS,
} from './prUI';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** How each audited action is written, and the tone it wears. */
const ACTION = {
  RUN_CREATED: ['blue', 'Run created'], RUN_RECOMPUTED: ['blue', 'Run recomputed'],
  RUN_REVIEWED: ['amber', 'Run reviewed'], RUN_APPROVED: ['indigo', 'Run approved'],
  RUN_PUBLISHED: ['green', 'Run published'], RUN_UNPUBLISHED: ['red', 'Publish reversed'],
  RUN_CANCELLED: ['slate', 'Run cancelled'], RUN_DELETED: ['red', 'Run deleted'],
  RUN_FAILED: ['red', 'Run failed'],
  ENTRY_UPDATED: ['blue', 'Entry edited'], ENTRY_HELD: ['amber', 'Entry held'], ENTRY_RELEASED: ['green', 'Entry released'],
  STRUCTURE_CREATED: ['green', 'Structure created'], STRUCTURE_UPDATED: ['blue', 'Structure updated'],
  STRUCTURE_DELETED: ['red', 'Structure deleted'], STRUCTURE_TOGGLED: ['amber', 'Structure switched'],
  STRUCTURE_DUPLICATED: ['slate', 'Structure copied'],
  ASSIGNMENT_CREATED: ['green', 'Assigned'], ASSIGNMENT_UPDATED: ['blue', 'Assignment updated'],
  ASSIGNMENT_DEACTIVATED: ['amber', 'Assignment ended'], ASSIGNMENT_REACTIVATED: ['green', 'Assignment resumed'],
  ASSIGNMENT_DELETED: ['red', 'Assignment deleted'],
  CTC_UPDATED: ['indigo', 'CTC revised'],
  ADVANCE_CREATED: ['blue', 'Advance recorded'], ADVANCE_WRITTEN_OFF: ['red', 'Advance written off'],
  ADVANCE_CANCELLED: ['slate', 'Advance cancelled'],
  CLAIM_CREATED: ['blue', 'Claim recorded'], CLAIM_APPROVED: ['green', 'Claim approved'],
  CLAIM_REJECTED: ['red', 'Claim rejected'], CLAIM_DELETED: ['slate', 'Claim removed'],
  SETTLEMENT_APPLIED: ['purple', 'Settlement applied'],
  REPORT_GENERATED: ['slate', 'Report generated'], REPORT_DELETED: ['slate', 'Report removed'],
  SETTINGS_UPDATED: ['amber', 'Settings changed'],
};

export default function PayrollSettings() {
  const [tab, setTab] = useState('settings');
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getSettings().then(r => setForm(r.data)).catch(e => toast.error(e.message)); }, []);

  const set = (k) => (v) => setForm(f => ({ ...f, [k]: v }));
  const save = async () => {
    setSaving(true);
    try { const r = await api.updateSettings(form); setForm(r.data); toast.success('Payroll settings saved'); }
    catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="pr-page">
      <Crumbs trail={[{ label: 'Payroll', to: '/admin/payroll/dashboard' }, { label: 'Settings' }]} />
      <SectionBar hideYear>
        {tab === 'settings' && <Btn variant="primary" glyph="checkCircle" loading={saving} disabled={!form} onClick={save}>Save Settings</Btn>}
      </SectionBar>

      <PrHead title="Payroll Settings"
        subtitle="How a month is measured, taxed, approved and announced — and a record of everything this module has done" />

      <div style={{ marginBottom: 18 }}>
        <PillTabs value={tab} onChange={setTab} items={[
          { value: 'settings', label: 'Settings' },
          { value: 'audit', label: 'Audit Log' },
        ]} />
      </div>

      {tab === 'settings' ? (!form ? <Loading rows={8} /> : (
        <div className="pr-split">
          <div className="pr-stack">
            <Card>
              <CardHead title="The month" glyph="calendar" sub="What a day of pay is worth, and when it is paid" />
              <div className="pr-cardbody">
                <Row n={2}>
                  <Field label="Working days basis" hint="The divisor behind a day's pay.">
                    <Select className="pr-select--block" value={form.workingDaysBasis} onChange={set('workingDaysBasis')}
                      options={[
                        { value: 'fixed', label: 'A fixed number of days' },
                        { value: 'calendar', label: 'The days in the month' },
                        { value: 'school', label: 'School calendar, minus offs and holidays' },
                      ]} />
                  </Field>
                  <Field label="Fixed working days" hint={form.workingDaysBasis === 'fixed' ? 'The classic 26-day month.' : 'Used only on the fixed basis.'}>
                    <input className="pr-input" type="number" min="1" max="31" value={form.fixedWorkingDays}
                      disabled={form.workingDaysBasis !== 'fixed'}
                      onChange={e => set('fixedWorkingDays')(num(e.target.value))} />
                  </Field>
                </Row>
                {form.workingDaysThisMonth ? (
                  <Note tone="slate" glyph="info">This month works out at <b>{form.workingDaysThisMonth} working days</b>.</Note>
                ) : null}
                <Row n={3}>
                  <Field label="Pay day" hint="Day of the following month.">
                    <input className="pr-input" type="number" min="1" max="28" value={form.payDay}
                      onChange={e => set('payDay')(num(e.target.value))} />
                  </Field>
                  <Field label="Financial year starts">
                    <Select className="pr-select--block" value={String(form.financialYearStartMonth)}
                      onChange={v => set('financialYearStartMonth')(num(v))}
                      options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
                  </Field>
                  <Field label="Round to">
                    <Select className="pr-select--block" value={String(form.roundTo)} onChange={v => set('roundTo')(Number(v))}
                      options={[{ value: '0.01', label: 'Paise' }, { value: '1', label: 'Rupee' }, { value: '5', label: '₹5' }, { value: '10', label: '₹10' }]} />
                  </Field>
                </Row>
              </div>
            </Card>

            <Card>
              <CardHead title="Loss of pay" glyph="clock" sub="Which absences reduce a salary" />
              <div className="pr-cardbody">
                {[
                  ['useLeaveForLop', 'Approved unpaid leave', 'Days the Leave module has approved as unpaid become loss-of-pay days automatically.'],
                  ['useAttendanceForLop', 'Unexplained absences', 'Days the staff register marks Absent with no leave behind them. A half day costs half a day. Off by default — switching it on starts docking pay for gaps in your own record-keeping.'],
                ].map(([key, label, hint]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderTop: '1px solid var(--pr-line-2)' }}>
                    <Toggle checked={form[key]} onChange={set(key)} label={label} />
                    <span style={{ flex: 1 }}>
                      <b style={{ display: 'block', fontSize: '.88rem', fontWeight: 600 }}>{label}</b>
                      <small style={{ color: 'var(--pr-muted)', fontSize: '.79rem', lineHeight: 1.5 }}>{hint}</small>
                    </span>
                  </label>
                ))}
              </div>
            </Card>

            <Card>
              <CardHead title="Income tax" glyph="rupee"
                sub="Nothing is withheld until you choose a regime" />
              <div className="pr-cardbody">
                <Field label="Regime" hint="“None” deducts no tax at all — the default, so an upgrade never quietly starts withholding.">
                  <Select className="pr-select--block" value={form.tax?.regime || 'none'}
                    onChange={v => setForm(f => ({ ...f, tax: { ...(f.tax || {}), regime: v } }))}
                    options={[
                      { value: 'none', label: 'Deduct no tax' },
                      { value: 'new', label: 'New regime' },
                      { value: 'old', label: 'Old regime' },
                    ]} />
                </Field>

                {form.tax?.regime !== 'none' && (
                  <>
                    <Note tone="amber" glyph="bang">
                      These rates are yours to keep correct. They change with every budget, and the figures below are a
                      starting point — check them against the current Finance Act before the first run of a new year.
                    </Note>
                    <Row n={2}>
                      <Field label="Standard deduction">
                        <input className="pr-input" type="number" min="0" step="1000" value={form.tax?.standardDeduction ?? 0}
                          onChange={e => setForm(f => ({ ...f, tax: { ...f.tax, standardDeduction: num(e.target.value) } }))} />
                      </Field>
                      <Field label="Cess %">
                        <input className="pr-input" type="number" min="0" max="100" step="0.5" value={form.tax?.cessPercent ?? 0}
                          onChange={e => setForm(f => ({ ...f, tax: { ...f.tax, cessPercent: num(e.target.value) } }))} />
                      </Field>
                    </Row>
                    <Row n={2}>
                      <Field label="Rebate applies up to" hint="Taxable income below this pays no tax at all.">
                        <input className="pr-input" type="number" min="0" step="10000" value={form.tax?.rebateUpTo ?? 0}
                          onChange={e => setForm(f => ({ ...f, tax: { ...f.tax, rebateUpTo: num(e.target.value) } }))} />
                      </Field>
                      <Field label="Maximum rebate">
                        <input className="pr-input" type="number" min="0" step="1000" value={form.tax?.rebateMax ?? 0}
                          onChange={e => setForm(f => ({ ...f, tax: { ...f.tax, rebateMax: num(e.target.value) } }))} />
                      </Field>
                    </Row>

                    <div style={{ fontSize: '.8rem', fontWeight: 700, color: 'var(--pr-muted)', textTransform: 'uppercase', letterSpacing: '.03em', margin: '16px 0 8px' }}>
                      Slabs
                    </div>
                    {(form.tax?.slabs || []).map((slab, i) => (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 40px', gap: 10, alignItems: 'center', padding: '6px 0' }}>
                        <input className="pr-input" type="number" min="0" step="50000"
                          placeholder={i === (form.tax.slabs.length - 1) ? 'and above' : 'up to'}
                          value={slab.upTo ?? ''}
                          onChange={e => setForm(f => ({
                            ...f, tax: { ...f.tax, slabs: f.tax.slabs.map((x, j) => (j === i ? { ...x, upTo: e.target.value === '' ? null : num(e.target.value) } : x)) },
                          }))} />
                        <div style={{ position: 'relative' }}>
                          <input className="pr-input" type="number" min="0" max="100" step="1" value={slab.rate}
                            onChange={e => setForm(f => ({
                              ...f, tax: { ...f.tax, slabs: f.tax.slabs.map((x, j) => (j === i ? { ...x, rate: num(e.target.value) } : x)) },
                            }))} />
                        </div>
                        <IconBtn glyph="trash" label="Remove slab" danger
                          onClick={() => setForm(f => ({ ...f, tax: { ...f.tax, slabs: f.tax.slabs.filter((_, j) => j !== i) } }))} />
                      </div>
                    ))}
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <Btn size="sm" icon="plus"
                        onClick={() => setForm(f => ({ ...f, tax: { ...f.tax, slabs: [...(f.tax.slabs || []), { upTo: null, rate: 0 }] } }))}>
                        Add a slab
                      </Btn>
                      <span style={{ fontSize: '.78rem', color: 'var(--pr-muted)', alignSelf: 'center' }}>
                        Leave the last “up to” blank — that is the open-ended top slab.
                      </span>
                    </div>
                  </>
                )}
              </div>
            </Card>

            <Card>
              <CardHead title="Approval and announcements" glyph="checkCircle" sub="Who signs a run off, and who is told" />
              <div className="pr-cardbody">
                {[
                  ['requireApproval', 'Require the approve step', 'Off means a reviewed run can be published directly.'],
                  ['separateApprover', 'Someone else must approve', 'Whoever processed a run cannot sign it off as well. A school where only one account can reach payroll is let through regardless — there is nobody else to ask.'],
                  ['notifyOnPublish', 'Tell employees when a run is published', 'An in-app notice and an email, with the payslip itself attached.'],
                  ['autoOpenRun', 'Open the month automatically', 'Creates the run as a draft once the month has ended. Nothing automatic ever reviews, approves or publishes.'],
                  ['remindBeforePayDay', 'Remind me before pay day', 'One notice when pay day is close and the month is still unpublished.'],
                ].map(([key, label, hint]) => (
                  <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 0', borderTop: '1px solid var(--pr-line-2)' }}>
                    <Toggle checked={form[key]} onChange={set(key)} label={label} />
                    <span style={{ flex: 1 }}>
                      <b style={{ display: 'block', fontSize: '.88rem', fontWeight: 600 }}>{label}</b>
                      <small style={{ color: 'var(--pr-muted)', fontSize: '.79rem', lineHeight: 1.5 }}>{hint}</small>
                    </span>
                  </label>
                ))}
                {(form.autoOpenRun || form.remindBeforePayDay) && (
                  <Row n={2}>
                    {form.autoOpenRun && (
                      <Field label="Open on day" hint="Of the month after the one being paid.">
                        <input className="pr-input" type="number" min="1" max="28" value={form.autoOpenDay}
                          onChange={e => set('autoOpenDay')(num(e.target.value))} />
                      </Field>
                    )}
                    {form.remindBeforePayDay && (
                      <Field label="Remind this many days before">
                        <input className="pr-input" type="number" min="1" max="15" value={form.remindDaysBefore}
                          onChange={e => set('remindDaysBefore')(num(e.target.value))} />
                      </Field>
                    )}
                  </Row>
                )}
              </div>
            </Card>

            <Card>
              <CardHead title="Payslips and the bank" glyph="bank" />
              <div className="pr-cardbody">
                <Row n={2}>
                  <Field label="Payslip prefix" hint="Slip numbers read PS/2026/0001.">
                    <input className="pr-input" value={form.payslipPrefix} onChange={e => set('payslipPrefix')(e.target.value)} />
                  </Field>
                  <Field label="School bank account" hint="The debit account on the bank transfer file.">
                    <input className="pr-input" value={form.bankAccountNumber} onChange={e => set('bankAccountNumber')(e.target.value)} />
                  </Field>
                </Row>
                <Field label="Payslip footer note">
                  <textarea className="pr-textarea" rows={2} value={form.payslipNote} onChange={e => set('payslipNote')(e.target.value)} />
                </Field>
              </div>
            </Card>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Btn variant="primary" className="pr-btn--lg" glyph="checkCircle" loading={saving} onClick={save}>Save Settings</Btn>
            </div>
          </div>

          <div className="pr-rail">
            <Panel title="What these change" glyph="info" tone="blue">
              <div style={{ fontSize: '.84rem', lineHeight: 1.6, color: 'var(--pr-ink-2)' }}>
                Settings apply to runs made <b>from now on</b>. A run freezes its own working days and rounding when it
                is created, so changing them here never re-prices a month that has already been computed.
              </div>
            </Panel>
            <HelpCard text="Tax rates change every budget. Review the slabs before the first run of a new financial year."
              action="Audit log" onAction={() => setTab('audit')} />
          </div>
        </div>
      )) : <AuditLog />}
    </div>
  );
}

/** Every write this module has made, newest first. */
function AuditLog() {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(30);
  const [entityType, setEntityType] = useState('');
  const { data: rows, meta, loading } = useFetch(
    () => api.getAuditLog({ page, limit, entityType: entityType || undefined }), [page, limit, entityType]);

  return (
    <Card>
      <CardHead title="Audit Log" sub={`${meta?.total ?? 0} recorded actions`} glyph="clipboard">
        <Select value={entityType} all="Everything" onChange={v => { setEntityType(v); setPage(1); }} ariaLabel="Filter"
          options={[
            { value: 'PayrollRun', label: 'Payroll runs' },
            { value: 'PayrollEntry', label: 'Entries' },
            { value: 'EmployeeSalaryAssignment', label: 'Assignments' },
            { value: 'SalaryStructure', label: 'Structures' },
            { value: 'SalaryAdvance', label: 'Advances' },
            { value: 'SalaryClaim', label: 'Claims' },
            { value: 'PayrollReport', label: 'Reports' },
            { value: 'PayrollSettings', label: 'Settings' },
          ]} />
      </CardHead>
      <div className="pr-cardbody pr-cardbody--flush">
        {loading ? <Loading rows={8} /> : !rows?.length ? (
          <Empty glyph="clipboard" title="Nothing recorded yet"
            hint="Every payroll action — a run created, a CTC revised, a structure changed — is written here as it happens." />
        ) : (
          <>
            <TableWrap>
              <table className="pr-table">
                <thead>
                  <tr>
                    <th className="pr-idx">#</th>
                    <th>Action</th>
                    <th>What happened</th>
                    <th>Who</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a, i) => {
                    const [tone, label] = ACTION[a.actionType] || ['slate', a.actionType];
                    return (
                      <tr key={a._id} data-focus-id={a._id}>
                        <td className="pr-idx">{(page - 1) * limit + i + 1}</td>
                        <td><Badge tone={tone}>{label}</Badge></td>
                        <td><div className="pr-cell2 pr-cell2--wrap"><b>{a.note || '—'}</b><small>{a.entityType || ''}</small></div></td>
                        <td>
                          <div className="pr-who">
                            <Avatar name={a.userName} size={28} />
                            <div className="pr-who__txt"><b>{a.userName}</b><small>{a.role || ''}</small></div>
                          </div>
                        </td>
                        <td>{fmtDateTime(a.timestamp)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableWrap>
            <Pager page={meta?.page || 1} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit}
              noun="actions" onPage={setPage} onLimit={v => { setLimit(v); setPage(1); }} sizes={[30, 60, 100]} />
          </>
        )}
      </div>
    </Card>
  );
}
