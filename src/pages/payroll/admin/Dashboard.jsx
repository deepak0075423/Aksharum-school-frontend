/**
 * Payroll → Dashboard (mockup 1).
 *
 * Four figures for the month in view plus the "start a run" prompt, the last
 * six months of payroll, the workforce split, quick actions, the recent runs
 * and what falls due next.
 *
 * The month stepper drives everything: the tiles, the chart window and the
 * "create a run" button all read the month in the header, so stepping back to
 * August answers "what did August cost" rather than showing September's
 * figures under August's title.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, PrHead, MonthStepper, Tiles, Tile, Card, CardHead, Panel, QuickActions, HelpCard,
  Btn, LinkBtn, Select, Mark, Glyph, Badge, StatusBadge, Loading, Empty, TableWrap,
  money, fmtDate, dueIn, RUN_STATUS, MONTHS,
} from './prUI';
import { PayBars, Donut, DonutLegend, ChartEmpty, inkAt } from './prCharts';
import { CreateRunDialog } from './prForms';

export default function PayrollDashboard() {
  const nav = useNavigate();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [yearId, setYearId] = useState('');
  const [creating, setCreating] = useState(false);
  const [hover, setHover] = useState(null);

  const { data, loading, refetch } = useFetch(
    () => api.getOverview({ month, year, academicYear: yearId || undefined }), [month, year, yearId]);

  const d = data || {};
  const t = d.tiles || {};
  const runs = d.recentRuns || [];
  const dist = d.distribution || [];
  const distTotal = dist.reduce((s, b) => s + b.count, 0);

  const thisMonthLabel = t.thisMonth?.status
    ? money(t.thisMonth.value)
    : 'Not Generated';

  const afterCreate = (run) => {
    setCreating(false);
    refetch();
    if (run?._id) nav(`/admin/payroll/runs?run=${run._id}`);
  };

  return (
    <div className="pr-page">
      <SectionBar years={d.academicYears || []} year={yearId || d.academicYear?._id} onYear={setYearId} />

      <PrHead title="Payroll Dashboard" subtitle="Manage employee salaries, assignments and payroll runs">
        <MonthStepper month={month} year={year} isCurrent={d.isCurrentMonth}
          onChange={(m, y) => { setMonth(m); setYear(y); }}
          max={{ month: now.getMonth() + 1, year: now.getFullYear() }} />
        <Btn variant="primary" icon="plus" onClick={() => setCreating(true)}>Create Payroll Run</Btn>
      </PrHead>

      <Tiles n={5}>
        <Tile glyph="users" tone="indigo" label="Total Employees"
          value={loading ? '—' : (t.totalEmployees?.value ?? 0)}
          delta={{ pct: t.totalEmployees?.deltaPct, caption: t.totalEmployees?.caption || 'Active staff members' }} />
        <Tile glyph="docFill" tone="green" label="Active Assignments"
          value={loading ? '—' : (t.activeAssignments?.value ?? 0)}
          delta={{ pct: t.activeAssignments?.deltaPct, caption: t.activeAssignments?.caption || 'Teachers, staff & admin' }}
          onClick={() => nav('/admin/payroll/assignments')} />
        <Tile glyph="wallet" tone="purple" label="This Month Payroll" small={!t.thisMonth?.status}
          value={loading ? '—' : thisMonthLabel}
          caption={t.thisMonth?.caption || `${MONTHS[month - 1]} ${year}`}
          onClick={t.thisMonth?.runId ? () => nav(`/admin/payroll/runs?run=${t.thisMonth.runId}`) : undefined} />
        <Tile glyph="bars" tone="pink" label="Last Month Net Pay"
          value={loading ? '—' : (t.lastMonth?.value === null || t.lastMonth?.value === undefined ? '—' : money(t.lastMonth.value))}
          small={t.lastMonth?.value !== null && t.lastMonth?.value !== undefined}
          delta={t.lastMonth?.deltaPct !== null && t.lastMonth?.deltaPct !== undefined
            ? { pct: t.lastMonth.deltaPct, caption: t.lastMonth.caption }
            : undefined}
          caption={t.lastMonth?.caption || 'No previous run'} />

        <div className="pr-promo">
          <div className="pr-promo__top">
            <Mark glyph="bolt" tone="indigo" size={36} glyphSize={19} />
            <div style={{ minWidth: 0 }}>
              <b>Streamline your payroll</b>
              <p>Generate accurate salaries with just a few clicks.</p>
            </div>
          </div>
          <Btn variant="primary" className="pr-btn--block" onClick={() => setCreating(true)}>
            Create Payroll Run <Glyph name="arrowRight" size={16} />
          </Btn>
        </div>
      </Tiles>

      {d.unassigned > 0 && (
        <div className="pr-note pr-note--amber">
          <Glyph name="bang" size={19} />
          <p>
            <b>{d.unassigned} {d.unassigned === 1 ? 'employee has' : 'employees have'} no salary assignment.</b>{' '}
            They will be left out of every payroll run until one is set up.
          </p>
          <Btn size="sm" onClick={() => nav('/admin/payroll/assignments?status=all')}>Assign now</Btn>
        </div>
      )}

      <div className="pr-grid3">
        <Card>
          <CardHead title="Payroll Overview" glyph="chartUp">
            <Select value="6" onChange={() => {}} options={[{ value: '6', label: 'Last 6 Months' }]} ariaLabel="Range" />
          </CardHead>
          <div className="pr-cardbody">
            {loading ? <Loading rows={4} /> : (
              <PayBars data={d.series || []} height={244}
                empty={<ChartEmpty glyph="wallet" title="No payroll data yet"
                  hint="Create a payroll run to see the salary overview" />} />
            )}
          </div>
        </Card>

        <Card>
          <CardHead title="Employee Distribution" />
          <div className="pr-cardbody">
            {loading ? <Loading rows={4} /> : distTotal === 0 ? (
              <Empty glyph="users" title="No staff yet" hint="Add teachers and administrators to see the split." />
            ) : (
              <>
                <Donut
                  slices={dist.map((b, i) => ({ name: b.label, value: b.count, color: inkAt(i) }))}
                  center={{ value: distTotal, label: 'Total' }}
                  hover={hover} onHover={setHover} />
                <DonutLegend rows={dist.map((b, i) => ({ name: b.label, value: b.count, color: inkAt(i) }))}
                  hover={hover} onHover={setHover} />
              </>
            )}
          </div>
        </Card>

        <QuickActions items={[
          { glyph: 'plusCircle', tone: 'indigo', label: 'Create Payroll Run', hint: 'Generate salaries for this month', onClick: () => setCreating(true) },
          { glyph: 'docFill', tone: 'green', label: 'Manage Assignments', hint: 'View and assign employees', to: '/admin/payroll/assignments' },
          { glyph: 'sitemap', tone: 'orange', label: 'Salary Structures', hint: 'Manage pay scales and components', to: '/admin/payroll/structures' },
          { glyph: 'bars', tone: 'purple', label: 'View Reports', hint: 'Payroll reports and statements', to: '/admin/payroll/reports' },
        ]} />
      </div>

      <div className="pr-split">
        <Card>
          <CardHead title="Recent Payroll Runs" glyph="play">
            <LinkBtn to="/admin/payroll/runs">View all</LinkBtn>
          </CardHead>
          <div className="pr-cardbody pr-cardbody--flush">
            {loading ? <Loading /> : runs.length === 0 ? (
              <Empty glyph="docFill" title="No payroll runs yet" hint="Create your first payroll run to get started">
                <Btn variant="primary" icon="plus" onClick={() => setCreating(true)}>Create Payroll Run</Btn>
              </Empty>
            ) : (
              <TableWrap>
                <table className="pr-table pr-table--stickyend">
                  <thead>
                    <tr>
                      <th className="pr-idx">#</th>
                      <th>Run Name</th>
                      <th>Period</th>
                      <th style={{ textAlign: 'right' }}>Employees</th>
                      <th style={{ textAlign: 'right' }}>Gross Pay</th>
                      <th style={{ textAlign: 'right' }}>Deductions</th>
                      <th style={{ textAlign: 'right' }}>Net Pay</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r, i) => (
                      <tr key={r._id} data-focus-id={r._id}>
                        <td className="pr-idx">{i + 1}</td>
                        <td>
                          <div className="pr-cell2"><b>{r.runName}</b><small>Monthly payroll run</small></div>
                        </td>
                        <td><div className="pr-cell2"><b>{r.period}</b><small>{r.periodRange}</small></div></td>
                        <td className="pr-num">{r.totalEmployees}</td>
                        <td className="pr-num">{money(r.totalGross)}</td>
                        <td className="pr-num">{money(r.totalDeductions)}</td>
                        <td className="pr-num pr-strong">{money(r.totalNet)}</td>
                        <td><StatusBadge status={r.status} map={RUN_STATUS} /></td>
                        <td style={{ textAlign: 'right' }}>
                          <Btn size="sm" variant={r.status === 'published' ? 'outline' : 'soft'}
                            onClick={() => nav(`/admin/payroll/runs?run=${r._id}`)}>
                            {r.status === 'published' ? 'View' : 'Continue'}
                          </Btn>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableWrap>
            )}
          </div>
        </Card>

        <div className="pr-rail">
          <Panel title="Upcoming Activities" flush>
            <div style={{ paddingBottom: 6 }}>
              {(d.upcoming || []).map(u => (
                <div className="pr-act" key={u.key}>
                  <Mark glyph={u.glyph} tone={u.tone} size={34} glyphSize={17} />
                  <span className="pr-act__t"><b>{u.title}</b><small>{u.subtitle}</small></span>
                  {u.badge
                    ? <Badge tone={u.badge.tone}>{u.badge.text}</Badge>
                    : <span className="pr-act__when" title={dueIn(u.due)}>{fmtDate(u.due)}</span>}
                </div>
              ))}
            </div>
          </Panel>
          <HelpCard text="Contact the admin or check the payroll guide." action="View Guide"
            onAction={() => toast('Payroll guide: Structures → Assignments → Runs → Reports.', { icon: '📘' })} />
        </div>
      </div>

      <CreateRunDialog open={creating} onClose={() => setCreating(false)} onDone={afterCreate}
        month={month} year={year} academicYear={yearId || d.academicYear?._id} />
    </div>
  );
}
