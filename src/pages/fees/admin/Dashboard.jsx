/**
 * Fees → Dashboard (mockup 1). Four tiles against last month, the collection
 * trend, collection by class, the latest payments, and a rail of quick
 * actions, the pending-dues alert and the collection summary.
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFeesOverview, getReceiptsHtml } from '../../../api/fees.api';
import { RowMenu, MenuItem } from '../../admin/listParts';
import Icon from '../../../components/ui/icons';
import {
  FeHead, Btn, Card, CardHead, LinkBtn, Tile, Tiles, Select, yearOptions, StatusBadge, Avatar, IconBtn,
  money, fmtDateTime, MODE, Empty, Loading, Glyph, openHtmlWindow,
} from './feeUI';
import { CollectionTrend, Legend, ClassBars, Donut, INK } from './feeCharts';
import { RecordPaymentDialog, ReminderDialog, StudentDrawer } from './feeForms';
import { useFeesMeta, classOptions } from './feeData';

export default function FeesDashboard() {
  const nav = useNavigate();
  const [yearId, setYearId] = useState('');
  const [range, setRange] = useState('6');
  const [classId, setClassId] = useState('');
  const [paying, setPaying] = useState(null);   // true, or the student to collect from
  const [reminding, setReminding] = useState(false);
  const [studentId, setStudentId] = useState(null);
  const { meta } = useFeesMeta(yearId);
  const { data, loading, refetch } = useFetch(
    () => getFeesOverview({ academicYearId: yearId || undefined, range, classId: classId || undefined }), [yearId, range, classId]);
  const sym = meta?.settings?.currencySymbol || '₹';
  const d = data || {};
  const t = d.tiles || {};
  const yearValue = yearId || d.year?._id || '';
  const receipt = (id) => openHtmlWindow(() => getReceiptsHtml([id])).catch(e => toast.error(e.message));

  return (
    <div className="fe-page">
      <FeHead title="Fees Dashboard" subtitle="Overview of fee collection, pending dues and recent transactions">
        <div style={{ width: 204 }}>
          <Select value={yearValue} onChange={v => { setYearId(v); setClassId(''); }} icon="calendar" options={yearOptions(meta?.years)} />
        </div>
      </FeHead>

      <div className="fe-dash">
        <div className="fe-dash__main">
          <Tiles n={4}>
            <Tile glyph="moneyBag" tone="green" label="Total Collected" value={money(t.collected, { sym })}
              delta={{ pct: t.collectedChange, caption: 'vs last month' }} />
            <Tile glyph="alertTri" tone="red" label="Pending Dues" value={money(t.pending, { sym })}
              delta={{ pct: t.pendingChange, upIsGood: false, caption: 'vs last month' }} />
            <Tile glyph="users" tone="blue" label="Total Students" value={(t.students || 0).toLocaleString('en-IN')}
              delta={{ plain: t.newStudents || 0, caption: 'vs last month' }} />
            <Tile glyph="doc" tone="purple" label="Total Transactions" value={(t.transactions || 0).toLocaleString('en-IN')}
              delta={{ pct: t.transactionsChange, noSign: true, caption: 'vs last month' }} />
          </Tiles>

          <div className="fe-2col">
            <Card>
              <CardHead title="Fee Collection Trend">
                <div style={{ width: 140 }}>
                  <Select value={range} onChange={setRange} compact options={[
                    { value: '6', label: 'Last 6 months' }, { value: '12', label: 'Last 12 months' }, { value: 'year', label: 'This academic year' }]} />
                </div>
              </CardHead>
              <div className="fe-cardbody">
                {loading && !data ? <Loading rows={4} /> : <CollectionTrend data={d.trend || []} sym={sym} />}
                <Legend items={[{ label: 'Collected', color: INK.green }, { label: 'Pending', color: INK.lavender }]} />
              </div>
            </Card>
            <Card>
              <CardHead title="Collection by Class">
                <div style={{ width: 140 }}>
                  <Select value={classId} onChange={setClassId} compact all="All Classes" options={classOptions(meta)} />
                </div>
              </CardHead>
              <div className="fe-cardbody" style={{ maxHeight: 250, overflowY: 'auto', paddingTop: 6 }}>
                {(d.byGroup || []).length ? <ClassBars rows={d.byGroup} />
                  : <Empty title={classId ? 'No students in this class' : 'No students this year'} hint="Collection is counted over the fees each class has been charged." />}
              </div>
            </Card>
          </div>

          <Card>
            <CardHead title="Recent Payments"><LinkBtn onClick={() => nav('/admin/fees/payments')} /></CardHead>
            <div className="fe-tablewrap">
              <table className="fe-table fe-table--caps">
                <thead><tr><th>#</th><th>Student Name</th><th>Class</th><th>Amount</th><th>Payment Mode</th><th>Date &amp; Time</th><th>Status</th><th>Receipt</th><th /></tr></thead>
                <tbody>
                  {(d.recent || []).map((p, i) => (
                    <tr key={p._id}>
                      <td className="fe-w-idx">{i + 1}</td>
                      <td><span className="fe-who"><Avatar name={p.student.name} /><span><b>{p.student.name}</b></span></span></td>
                      <td>{p.classLabel}</td>
                      <td className="fe-num">{money(p.amount, { sym })}</td>
                      <td>{MODE[p.mode] || p.mode}</td>
                      <td className="fe-num">{fmtDateTime(p.date)}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td><IconBtn icon="download" label="Open receipt" onClick={() => receipt(p._id)} disabled={p.status !== 'completed'} /></td>
                      <td>
                        <RowMenu>
                          <MenuItem icon="user" onClick={() => setStudentId(p.student._id)}>View student fees</MenuItem>
                          <MenuItem icon="download" onClick={() => receipt(p._id)}>Open receipt</MenuItem>
                        </RowMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!loading && !(d.recent || []).length ? <Empty title="No payments yet this year" hint="Payments recorded at the counter or paid online appear here." /> : null}
            </div>
          </Card>
        </div>

        <aside className="fe-dash__rail">
          <Card className="fe-qa">
            <h3>Quick Actions</h3>
            <div className="fe-qa__list">
              <Btn variant="primary" icon="plus" onClick={() => setPaying(true)}>Record Payment</Btn>
              <Btn variant="outline" glyph="doc" onClick={() => nav('/admin/fees/student-fees?status=pending')}>View Pending Dues</Btn>
              <Btn variant="outline" glyph="bars" onClick={() => nav('/admin/fees/reports')}>Generate Fee Report</Btn>
              <Btn variant="outline" icon="send" onClick={() => setReminding(true)}>Send Fee Reminder</Btn>
            </div>
          </Card>

          <Card className="fe-alert">
            <div className="fe-alert__head">
              <span style={{ color: '#f59e0b', display: 'inline-flex' }}><Glyph name="bell" size={26} /></span>
              <h3>Pending Dues Alert</h3>
              <LinkBtn onClick={() => nav('/admin/fees/student-fees?status=pending')} />
            </div>
            <div className="fe-alert__big"><b>{(d.alert?.students || 0).toLocaleString('en-IN')}</b>student{d.alert?.students === 1 ? ' has' : 's have'} pending dues</div>
            <div className="fe-alert__rows">
              {(d.alert?.top || []).map(g => (
                <button key={g.classId} type="button" className="fe-alert__row" onClick={() => nav(`/admin/fees/student-fees?status=pending&classId=${g.classId}`)}>
                  <Glyph name="alertTri" size={15} /><span>{g.label}</span><span>{g.count} student{g.count === 1 ? '' : 's'}</span><Icon name="chevronRight" size={15} />
                </button>
              ))}
              {d.alert?.others ? (
                <button type="button" className="fe-alert__row fe-alert__row--rest" onClick={() => nav('/admin/fees/student-fees?status=pending')}>
                  <Glyph name="users" size={15} /><span>Other Classes</span><span>{d.alert.others} students</span><Icon name="chevronRight" size={15} />
                </button>
              ) : null}
              {!d.alert?.students && data ? <p className="fe-form__hint" style={{ margin: '0 4px' }}>Nobody owes anything right now.</p> : null}
            </div>
          </Card>

          <Card className="fe-summary">
            <h3>Fee Collection Summary</h3>
            <div className="fe-summary__body">
              <Donut size={138} thickness={20} sym={sym}
                slices={[
                  { label: 'Collected', value: d.summary?.collected || 0, color: INK.green },
                  { label: 'Pending', value: d.summary?.pending || 0, color: INK.lavender },
                  { label: 'Not Applicable', value: d.summary?.notApplicable || 0, color: '#e2e8f0' },
                ]}
                center={[`${d.summary?.pct || 0}%`, 'Collected']} />
              <ul className="fe-summary__legend">
                <li><i style={{ background: INK.green }} />Collected<b>{money(d.summary?.collected, { sym })}</b></li>
                <li><i style={{ background: INK.lavender }} />Pending<b>{money(d.summary?.pending, { sym })}</b></li>
                <li title="Taken off by concessions, so not collectable"><i style={{ background: '#e2e8f0' }} />Not Applicable<b>{money(d.summary?.notApplicable, { sym })}</b></li>
              </ul>
            </div>
            <div className="fe-note fe-note--blue">
              <span className="fe-note__i"><Glyph name="info" size={20} /></span>
              <div className="fe-note__b">Collection percentage is calculated based on applicable fees for the selected academic year.</div>
            </div>
          </Card>
        </aside>
      </div>

      <RecordPaymentDialog open={!!paying} onClose={() => setPaying(null)} onDone={refetch} meta={meta} student={paying?._id ? paying : null} />
      <ReminderDialog open={reminding} onClose={() => setReminding(false)} meta={meta} />
      <StudentDrawer studentId={studentId} onClose={() => setStudentId(null)} meta={meta} onChanged={refetch}
        onCollect={(s) => { setStudentId(null); setPaying(s || true); }} />
    </div>
  );
}
