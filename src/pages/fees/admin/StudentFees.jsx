/**
 * Fees → Student Fees (mockup 2). Every student of the year with what they
 * were charged, paid and still owe. The filter card is staged — nothing
 * reloads until Apply Filters — and the tabs are the status filter, counted
 * over every other filter so they do not move when one is pressed.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getStudentFeeList, getConcessionList } from '../../../api/fees.api';
import { RowMenu, MenuItem } from '../../admin/listParts';
import Icon from '../../../components/ui/icons';
import {
  FeHead, Btn, Card, Tile, Tiles, Select, Search, PillTabs, StatusBadge, DUE_STATUS, Avatar, IconBtn, Check, Pager,
  money, fmtDate, yearOptions, Empty, Loading, saveFile, toCsv,
} from './feeUI';
import { RecordPaymentDialog, ReminderDialog, StudentDrawer, SelectionStrip } from './feeForms';
import { useFeesMeta, classOptions, sectionOptions, useUrlState } from './feeData';

const DEFAULTS = { academicYearId: '', classId: '', sectionId: '', status: '', q: '', structureId: '', concession: '', lastFrom: '', lastTo: '', sort: 'name', page: '1', limit: '10' };
const pct = (n, of) => (of > 0 ? `${(n / of * 100).toFixed(1)}%` : '0%');

export default function AdminStudentFees() {
  const [applied, setApplied] = useUrlState(DEFAULTS);
  const [draft, setDraft] = useState(applied);
  const [more, setMore] = useState(!!(applied.structureId || applied.concession || applied.lastFrom || applied.lastTo));
  const [picked, setPicked] = useState(new Set());
  const [paying, setPaying] = useState(null);
  const [reminding, setReminding] = useState(null);
  const [studentId, setStudentId] = useState(null);
  // The URL can change under us (a link from the dashboard) — follow it.
  useEffect(() => { setDraft(applied); }, [JSON.stringify(applied)]); // eslint-disable-line react-hooks/exhaustive-deps

  const { meta } = useFeesMeta(applied.academicYearId);
  const { meta: draftMeta } = useFeesMeta(draft.academicYearId);
  const page = Number(applied.page) || 1, limit = Number(applied.limit) || 10;
  const query = Object.fromEntries(Object.entries({ ...applied, page, limit }).filter(([, v]) => v !== '' && v != null));
  const { data, meta: env, loading, refetch } = useFetch(() => getStudentFeeList(query), [JSON.stringify(query)]);
  const { data: con } = useFetch(() => getConcessionList({ limit: 200, academicYearId: applied.academicYearId || undefined }), [applied.academicYearId]);
  const rows = data?.rows || [];
  const c = data?.counts || {};
  const sym = meta?.settings?.currencySymbol || '₹';
  const yearValue = draft.academicYearId || data?.year?._id || '';
  useEffect(() => { setPicked(new Set()); }, [JSON.stringify(query)]); // eslint-disable-line react-hooks/exhaustive-deps

  const setD = (k) => (v) => setDraft(d => ({ ...d, [k]: v, ...(k === 'classId' ? { sectionId: '' } : {}), ...(k === 'academicYearId' ? { classId: '', sectionId: '', structureId: '' } : {}) }));
  const apply = () => setApplied({ ...draft, page: '1' });
  const clear = () => { setDraft(DEFAULTS); setApplied({ ...DEFAULTS }); };
  const tab = (status) => { setDraft(d => ({ ...d, status })); setApplied({ status, page: '1' }); };
  const allOn = rows.length > 0 && rows.every(r => picked.has(r._id));

  const exportCsv = async () => {
    try {
      const all = [];
      for (let p = 1; p <= 50; p++) {
        const res = await getStudentFeeList({ ...query, page: p, limit: 200 });
        all.push(...(res?.data?.rows || []));
        if (p >= (res?.pages || 1)) break;
      }
      const list = picked.size ? all.filter(r => picked.has(r._id)) : all;
      saveFile(toCsv([
        { key: 'name', label: 'Student Name' }, { key: 'admissionNumber', label: 'Adm. No.' }, { key: 'classLabel', label: 'Class / Section' },
        { key: 'total', label: 'Total Fees' }, { key: 'paid', label: 'Paid' }, { key: 'due', label: 'Due' },
        { label: 'Status', value: r => DUE_STATUS[r.status]?.[1] || r.status }, { label: 'Last Payment', value: r => (r.lastPayment ? fmtDate(r.lastPayment) : '') },
      ], list), `student-fees-${data?.year?.yearName || ''}.csv`);
    } catch (e) { toast.error(e.message); }
  };

  const tabs = [
    { key: '', label: 'All Students', count: c.all || 0, tone: 'slate' },
    { key: 'pending', label: 'Pending Fees', count: c.pending || 0, tone: 'red' },
    { key: 'partial', label: 'Partially Paid', count: c.partial || 0, tone: 'amber' },
    { key: 'paid', label: 'Paid', count: c.paid || 0, tone: 'green' },
  ];
  // Students no demand has reached: a tab of their own only when there are any,
  // so a school that forgot to generate demand can see who is missing.
  if (c.none) tabs.push({ key: 'none', label: 'Not Charged', count: c.none, tone: 'slate' });

  return (
    <div className="fe-page">
      <FeHead title="Student Fees" subtitle="View and manage fee details for all students">
        <Btn variant="outline" icon="download" onClick={exportCsv}>Export</Btn>
        <Btn variant="primary" icon="plus" onClick={() => setPaying(true)}>Collect Fee</Btn>
      </FeHead>

      <Tiles n={4}>
        <Tile valueFirst glyph="users" tone="indigo" value={(c.all || 0).toLocaleString('en-IN')} label="Total Students" />
        <Tile valueFirst glyph="checkCircle" tone="green" value={(c.paid || 0).toLocaleString('en-IN')} label="Fully Paid" badge={{ tone: 'green', text: pct(c.paid, c.all) }} />
        <Tile valueFirst glyph="clock" tone="amber" value={(c.partial || 0).toLocaleString('en-IN')} label="Partially Paid" badge={{ tone: 'amber', text: pct(c.partial, c.all) }} />
        <Tile valueFirst glyph="bang" tone="red" value={(c.pending || 0).toLocaleString('en-IN')} label="Pending" badge={{ tone: 'red', text: pct(c.pending, c.all) }} />
      </Tiles>

      <Card className="fe-filters">
        <div className="fe-frow" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) minmax(0, 1.75fr)' }}>
          <Select label="Academic Year" value={yearValue} onChange={setD('academicYearId')} options={yearOptions(draftMeta?.years || meta?.years)} />
          <Select label="Class" value={draft.classId} onChange={setD('classId')} all="All Classes" options={classOptions(draftMeta)} />
          <Select label="Section" value={draft.sectionId} onChange={setD('sectionId')} all="All Sections" options={sectionOptions(draftMeta, draft.classId)} disabled={!draft.classId} />
          <Select label="Payment Status" value={draft.status} onChange={setD('status')} all="All Statuses"
            options={[{ value: 'paid', label: 'Paid' }, { value: 'partial', label: 'Partially Paid' }, { value: 'pending', label: 'Pending' }, { value: 'none', label: 'Not Charged' }]} />
          <Search className="is-top" value={draft.q} onChange={setD('q')} onEnter={apply} placeholder="Search by name, admission no., roll no..." />
        </div>
        {more ? (
          <div className="fe-more">
            <Select label="Concession" value={draft.concession} onChange={setD('concession')} all="Any" options={[{ value: 'with', label: 'Has a concession' }, { value: 'without', label: 'No concession' }]} />
            <label className="fe-field"><span className="fe-field__label">Last payment from</span><input className="fe-input" type="date" value={draft.lastFrom} onChange={e => setD('lastFrom')(e.target.value)} /></label>
            <label className="fe-field"><span className="fe-field__label">Last payment to</span><input className="fe-input" type="date" value={draft.lastTo} min={draft.lastFrom || undefined} onChange={e => setD('lastTo')(e.target.value)} /></label>
            <Select label="Sort by" value={draft.sort} onChange={setD('sort')} options={[{ value: 'name', label: 'Name (A–Z)' }, { value: '-due', label: 'Highest due first' }, { value: 'class', label: 'Class' }]} />
          </div>
        ) : null}
        <div className="fe-frow--end">
          <Btn variant="link" icon="filter" onClick={() => setMore(m => !m)}>{more ? 'Fewer Filters' : 'More Filters'}</Btn>
          <div>
            <Btn variant="link" onClick={clear}>Clear Filters</Btn>
            <Btn variant="primary" onClick={apply}>Apply Filters</Btn>
          </div>
        </div>
      </Card>

      <PillTabs items={tabs} value={applied.status} onChange={tab} />

      <SelectionStrip count={picked.size} onClear={() => setPicked(new Set())}>
        <Btn variant="soft" size="sm" icon="send" onClick={() => setReminding([...picked])}>Send reminder</Btn>
        <Btn variant="soft" size="sm" icon="download" onClick={exportCsv}>Export selected</Btn>
      </SelectionStrip>

      <Card>
        <div className="fe-tablewrap">
          <table className="fe-table">
            <thead>
              <tr>
                <th className="fe-w-check"><Check checked={allOn} indeterminate={!allOn && picked.size > 0} label="Select all"
                  onChange={() => setPicked(allOn ? new Set() : new Set(rows.map(r => r._id)))} /></th>
                <th className="fe-w-idx">#</th>
                <th><button type="button" className="fe-sort" onClick={() => setApplied({ sort: applied.sort === 'name' ? '-name' : 'name', page: '1' })}>
                  Student Name <Icon name={applied.sort === '-name' ? 'arrowUp' : 'arrowDown'} size={13} /></button></th>
                <th>Adm. No.</th><th>Class / Section</th><th>Total Fees</th><th>Paid</th><th>Due</th><th>Status</th><th>Last Payment</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r._id} className={picked.has(r._id) ? 'is-sel' : ''}>
                  <td><Check checked={picked.has(r._id)} label={`Select ${r.name}`}
                    onChange={() => setPicked(p => { const n = new Set(p); if (n.has(r._id)) n.delete(r._id); else n.add(r._id); return n; })} /></td>
                  <td className="fe-w-idx">{(page - 1) * limit + i + 1}</td>
                  <td><span className="fe-who"><Avatar name={r.name} /><span><b>{r.name}</b></span></span></td>
                  <td className="fe-muted">{r.admissionNumber || '—'}</td>
                  <td>{r.classLabel}</td>
                  <td className="fe-num">{r.status === 'none' ? <span className="fe-muted">—</span> : money(r.total, { sym, space: true })}</td>
                  <td className="fe-num">{money(r.paid, { sym, space: true })}</td>
                  <td className="fe-num">
                    {money(r.due, { sym, space: true })}
                    {r.prevDue > 0 ? <div className="fe-muted" style={{ fontSize: '.74rem' }} title="Still owed from earlier academic years">+{money(r.prevDue, { sym })} previous</div> : null}
                    {r.advance > 0 ? <div style={{ fontSize: '.74rem', color: '#15803d' }}>{money(r.advance, { sym })} advance</div> : null}
                  </td>
                  <td><StatusBadge status={r.status} map={DUE_STATUS} /></td>
                  <td className="fe-num">{r.lastPayment ? fmtDate(r.lastPayment) : <span className="fe-muted">—</span>}</td>
                  <td>
                    <span className="fe-acts">
                      <IconBtn icon="eye" label="View fees" onClick={() => setStudentId(r._id)} />
                      <RowMenu>
                        <MenuItem icon="plus" onClick={() => setPaying(r)}>Collect fee</MenuItem>
                        <MenuItem icon="send" onClick={() => setReminding([r._id])}>Send reminder</MenuItem>
                        <MenuItem icon="percent" onClick={() => setStudentId(r._id)}>Concessions &amp; fines</MenuItem>
                      </RowMenu>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && !data ? <Loading rows={6} /> : null}
          {!loading && !rows.length ? (
            <Empty title="No students match" hint={c.all ? 'Try another tab or clear the filters.' : 'Students appear here once they are placed in a section of this academic year.'} />
          ) : null}
        </div>
        <Pager page={page} pages={env?.pages || 1} total={env?.total || 0} limit={limit} count={rows.length} noun="students"
          onPage={p => setApplied({ page: String(p) })} onLimit={l => setApplied({ limit: String(l), page: '1' })} />
      </Card>

      <RecordPaymentDialog open={!!paying} onClose={() => setPaying(null)} onDone={refetch} meta={meta} student={paying?._id ? paying : null} />
      <ReminderDialog open={!!reminding} onClose={() => setReminding(null)} meta={meta} studentIds={Array.isArray(reminding) ? reminding : undefined} />
      <StudentDrawer studentId={studentId} onClose={() => setStudentId(null)} meta={meta} onChanged={refetch}
        concessions={con?.rows || []} onCollect={(s) => { setStudentId(null); setPaying(s || true); }} />
    </div>
  );
}
