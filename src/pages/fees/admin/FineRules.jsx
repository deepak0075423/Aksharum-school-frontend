/**
 * Fees → Fine Rules (mockup 8). Late-payment rules and the office's "other
 * fines", with a panel for the picked rule.
 *
 * The mockup's notes say fine rules "are applied automatically during fee
 * generation". Nothing in this app charges a late fine on its own — the old
 * standalone cron (scripts/feeCron.js) is neither scheduled nor able to work
 * out a due date — so the notes here say what is true: other fines are
 * charged from a student's page; late-payment rules record the policy.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFineRuleList, getFineRuleActivity, toggleFineRule } from '../../../api/fees.api';
import { Confirm } from '../../../components/ui/index';
import { RowMenu, MenuItem } from '../../admin/listParts';
import {
  FeHead, Btn, Card, CardHead, Tile, Tiles, Select, Search, StatusBadge, IconBtn, Check, Pager, Mark, Panel, Facts, Fact, Badge,
  ViewSwitch, Note, money, fmtDate, fmtDateTime, yearOptions, FINE_APPLIES, Empty, Loading, saveFile, toCsv,
} from './feeUI';
import { FineRuleDialog, ChargeFineDialog } from './feeForms';
import { useFeesMeta, useUrlState } from './feeData';
import { History } from './feeHistory';
import { MoreMenu } from './FeeStructures';

const DEFAULTS = { academicYearId: '', ruleType: '', status: '', appliesTo: '', q: '', page: '1', limit: '10' };

const FINE_LOOKS = [
  [/transport|bus/i, 'bus', 'amber'], [/hostel/i, 'bed', 'red'], [/library|book/i, 'bookOpen', 'purple'], [/id card|identity/i, 'clipboard', 'purple'],
  [/lab|equipment/i, 'flask', 'green'], [/exam/i, 'calendar', 'indigo'], [/late|delay|monthly/i, 'calendar', 'indigo'],
];
const fineLook = (name) => {
  const hit = FINE_LOOKS.find(([re]) => re.test(String(name || '')));
  return hit ? { glyph: hit[1], tone: hit[2] } : { glyph: 'docFill', tone: 'purple' };
};
export const calcLabel = (r, sym = '₹') => (r.fineType === 'per_day' ? `${money(r.perDayAmount, { sym, space: true })} per day` : `${money(r.flatAmount, { sym, space: true })} (Fixed)`);
const appliesLabel = (r) => (r.appliesTo === 'classes' && r.classes.length ? `Selected Classes` : FINE_APPLIES[r.appliesTo] || 'All Students');

export default function FineRules() {
  const nav = useNavigate();
  const [applied, setApplied] = useUrlState(DEFAULTS);
  const [draft, setDraft] = useState(applied);
  const [view, setView] = useState('list');
  const [selId, setSelId] = useState(null);
  const [tab, setTab] = useState('details');
  const [dialog, setDialog] = useState(null);
  const [charging, setCharging] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [picked, setPicked] = useState(new Set());
  useEffect(() => { setDraft(applied); }, [JSON.stringify(applied)]); // eslint-disable-line react-hooks/exhaustive-deps

  const { meta } = useFeesMeta(applied.academicYearId);
  const page = Number(applied.page) || 1, limit = Number(applied.limit) || 10;
  const query = Object.fromEntries(Object.entries({ ...applied, page, limit }).filter(([, v]) => v !== '' && v != null));
  const { data, meta: env, loading, refetch } = useFetch(() => getFineRuleList(query), [JSON.stringify(query)]);
  const { data: others } = useFetch(() => getFineRuleList({ ruleType: 'other', status: 'active', limit: 200 }), [data]);
  const rows = data?.rows || [];
  const c = data?.counts || {};
  const t = data?.tiles || {};
  const sym = meta?.settings?.currencySymbol || '₹';
  const sel = rows.find(r => r._id === selId) || rows[0] || null;
  const { data: act, refetch: refetchAct } = useFetch(
    () => (sel ? getFineRuleActivity(sel._id, { academicYearId: applied.academicYearId || undefined }) : Promise.resolve(null)), [sel?._id, applied.academicYearId]);
  const yearValue = draft.academicYearId || data?.year?._id || '';
  const apply = () => setApplied({ ...draft, page: '1' });
  const reload = () => { refetch(); refetchAct(); };
  const allOn = rows.length > 0 && rows.every(r => picked.has(r._id));

  const toggle = async () => {
    try { await toggleFineRule(confirm._id); toast.success(confirm.isActive ? 'Rule switched off' : 'Rule switched on'); setConfirm(null); reload(); }
    catch (e) { toast.error(e.message); }
  };
  const exportCsv = () => saveFile(toCsv([
    { key: 'name', label: 'Rule' }, { label: 'Type', value: r => (r.ruleType === 'late_payment' ? 'Late Payment' : 'Other Fine') },
    { label: 'Applicable To', value: r => appliesLabel(r) }, { label: 'Calculation', value: r => calcLabel(r, sym) },
    { label: 'Grace Period', value: r => (r.ruleType === 'late_payment' ? `${r.gracePeriodDays} days` : '') }, { key: 'status', label: 'Status' },
    { key: 'students', label: 'Students fined this year' }, { key: 'charged', label: 'Charged this year' },
  ], picked.size ? rows.filter(r => picked.has(r._id)) : rows), 'fine-rules.csv');

  const look = fineLook(sel?.name);
  const Actions = ({ r }) => (
    <span className="fe-acts">
      <IconBtn icon="pencil" label="Edit" onClick={() => setDialog({ rule: r })} />
      <IconBtn icon="copy" label="Copy" onClick={() => setDialog({ rule: r, copy: true })} />
      <RowMenu>
        <MenuItem icon="power" danger={r.isActive} onClick={() => setConfirm(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</MenuItem>
        {r.ruleType === 'other' && r.isActive ? <MenuItem icon="user" onClick={() => setCharging(true)}>Charge to a student</MenuItem> : null}
      </RowMenu>
    </span>
  );

  return (
    <div className="fe-page">
      <FeHead title="Fine Rules" subtitle="Define and manage fine rules for late payments and other fee-related penalties">
        <MoreMenu items={[
          { icon: 'user', label: 'Charge a fine to a student', onClick: () => setCharging(true) },
          { icon: 'download', label: 'Export this list (CSV)', onClick: exportCsv },
        ]} />
        <Btn variant="primary" icon="plus" onClick={() => setDialog({})}>Add Fine Rule</Btn>
      </FeHead>

      <Tiles n={5}>
        <Tile valueFirst glyph="rupee" tone="red" value={t.total || 0} label="Total Fine Rules" caption="All configured rules" />
        <Tile valueFirst glyph="checkCircle" tone="green" value={t.active || 0} label="Active Rules" caption="Currently in use" />
        <Tile valueFirst glyph="clock" tone="amber" value={t.inactive || 0} label="Inactive Rules" caption="Not in use" />
        <Tile valueFirst glyph="users" tone="purple" value={(t.affected || 0).toLocaleString('en-IN')} label="Students Affected" caption="This academic year" />
        <Tile valueFirst glyph="bars" tone="blue" value={money(t.collected || 0, { sym, space: true })} label="Total Fine Collected" caption="This academic year" />
      </Tiles>

      <Card className="fe-filters">
        <div className="fe-frow" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) minmax(0, 2fr)' }}>
          <Select label="Academic Year" value={yearValue} onChange={v => setDraft(d => ({ ...d, academicYearId: v }))} options={yearOptions(meta?.years)} />
          <Select label="Rule Type" value={draft.ruleType} onChange={v => setDraft(d => ({ ...d, ruleType: v }))} all="All Types" options={[{ value: 'late_payment', label: 'Late Payment' }, { value: 'other', label: 'Other Fine' }]} />
          <Select label="Status" value={draft.status} onChange={v => setDraft(d => ({ ...d, status: v }))} all="All Statuses" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          <Select label="Applicable To" value={draft.appliesTo} onChange={v => setDraft(d => ({ ...d, appliesTo: v }))} all="All" options={Object.entries(FINE_APPLIES).map(([value, label]) => ({ value, label }))} />
          <div className="fe-frow__stack">
            <Search value={draft.q} onChange={v => setDraft(d => ({ ...d, q: v }))} onEnter={apply} placeholder="Search fine rules..." />
            <div style={{ justifyContent: 'flex-end' }}>
              <Btn variant="link" onClick={() => { setDraft(DEFAULTS); setApplied({ ...DEFAULTS }); }}>Clear Filters</Btn>
              <Btn variant="primary" icon="filter" onClick={apply} style={{ flex: '0 0 auto' }}>Apply Filters</Btn>
            </div>
          </div>
        </div>
      </Card>

      <div className="fe-split">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <Card>
            <CardHead title={`Fine Rules (${env?.total ?? c.all ?? 0})`}>
              <ViewSwitch value={view} onChange={setView} items={[{ key: 'list', icon: 'list', label: 'List', text: 'List' }, { key: 'card', icon: 'grid', label: 'Card', text: 'Card' }]} />
            </CardHead>
            {view === 'list' ? (
              <div className="fe-tablewrap">
                <table className="fe-table fe-table--dense">
                  <thead><tr>
                    <th className="fe-w-check"><Check checked={allOn} label="Select all" onChange={() => setPicked(allOn ? new Set() : new Set(rows.map(r => r._id)))} /></th>
                    <th>#</th><th>Rule Name</th><th>Type</th><th>Applicable To</th><th>Amount / Calculation</th><th>Grace Period</th><th>Status</th><th>Actions</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const lk = fineLook(r.name);
                      return (
                        <tr key={r._id} className={`is-click${sel?._id === r._id ? ' is-sel' : ''}`} onClick={() => { setSelId(r._id); setTab('details'); }}>
                          <td onClick={e => e.stopPropagation()}><Check checked={picked.has(r._id)} label={`Select ${r.name}`}
                            onChange={() => setPicked(p => { const n = new Set(p); if (n.has(r._id)) n.delete(r._id); else n.add(r._id); return n; })} /></td>
                          <td>{(page - 1) * limit + i + 1}</td>
                          <td><span className="fe-name"><Mark glyph={lk.glyph} tone={lk.tone} size={30} /><b>{r.name}</b></span></td>
                          <td className="fe-nowrap">{r.ruleType === 'late_payment' ? 'Late Payment' : 'Other Fine'}</td>
                          <td className="fe-nowrap">{appliesLabel(r)}</td>
                          <td className="fe-strong fe-nowrap">{calcLabel(r, sym)}</td>
                          <td>{r.ruleType === 'late_payment' ? `${r.gracePeriodDays} days` : '-'}</td>
                          <td><StatusBadge status={r.status} /></td>
                          <td onClick={e => e.stopPropagation()}><Actions r={r} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="fe-cards">
                {rows.map(r => {
                  const lk = fineLook(r.name);
                  return (
                    <button key={r._id} type="button" className={`fe-catcard${sel?._id === r._id ? ' is-sel' : ''}`} onClick={() => { setSelId(r._id); setTab('details'); }}>
                      <span className="fe-catcard__top"><Mark glyph={lk.glyph} tone={lk.tone} size={40} /><b>{r.name}</b></span>
                      <p>{calcLabel(r, sym)} · {appliesLabel(r)}{r.ruleType === 'late_payment' ? ` · ${r.gracePeriodDays} days grace` : ''}</p>
                      <span className="fe-catcard__foot"><span>{r.ruleType === 'late_payment' ? 'Late Payment' : 'Other Fine'}</span><StatusBadge status={r.status} /></span>
                    </button>
                  );
                })}
              </div>
            )}
            {loading && !data ? <Loading rows={6} /> : null}
            {!loading && !rows.length ? <Empty title="No fine rules" hint={c.all ? 'Nothing matches these filters.' : 'Add a late-payment rule, or an "other fine" such as a lost ID card.'} /> : null}
            <Pager page={page} pages={env?.pages || 1} total={env?.total || 0} limit={limit} count={rows.length} noun="fine rules"
              onPage={p => setApplied({ page: String(p) })} onLimit={l => setApplied({ limit: String(l), page: '1' })} />
          </Card>
          <Note glyph="bulb" title="Important Notes">
            <ul>
              <li>Other fines (a lost ID card, damaged equipment) are charged to a student from their fee page or with “Charge a fine”.</li>
              <li>Grace period allows a buffer time after the due date before a late fine applies.</li>
              <li>Late-payment rules record the school's policy; they are not yet charged to students automatically.</li>
              <li>You can set different fine rules for different classes and student groups.</li>
            </ul>
          </Note>
        </div>

        {sel ? (
          <Panel glyph={look.glyph} tone={look.tone} title={sel.name} subtitle={sel.description || (sel.ruleType === 'late_payment' ? 'Fine for delayed fee payments' : 'Charged by the office')}
            status={<StatusBadge status={sel.status} />}
            tabs={[{ key: 'details', label: 'Details' }, { key: 'applicability', label: 'Applicability' }, { key: 'history', label: 'History' }]} tab={tab} onTab={setTab}>
            {tab === 'details' ? (
              <>
                <Facts>
                  <Fact label="Rule Name">{sel.name}</Fact>
                  <Fact label="Type"><Badge tone="blue">{sel.ruleType === 'late_payment' ? 'Late Payment' : 'Other Fine'}</Badge></Fact>
                  <Fact label="Calculation">{calcLabel(sel, sym)}</Fact>
                  <Fact label="Grace Period">{sel.ruleType === 'late_payment' ? `${sel.gracePeriodDays} days` : 'Not applicable'}</Fact>
                  {sel.maxCap ? <Fact label="Maximum">{money(sel.maxCap, { sym, space: true })}</Fact> : null}
                  <Fact label="Applicable To">{appliesLabel(sel)}</Fact>
                  <Fact label="Description" box>{sel.description || (sel.fineType === 'per_day'
                    ? `A fine of ${money(sel.perDayAmount, { sym, space: true })} will be charged for each day after the due date.`
                    : `A fixed fine of ${money(sel.flatAmount, { sym, space: true })}.`)}</Fact>
                  <Fact label="Created On">{fmtDateTime(sel.createdAt)}</Fact>
                  <Fact label="Last Updated">{fmtDateTime(sel.updatedAt)}</Fact>
                  <Fact label="Created By">{sel.createdBy || '—'}</Fact>
                </Facts>
                <div className="fe-panel__acts">
                  <Btn variant="soft" icon="pencil" onClick={() => setDialog({ rule: sel })}>Edit Rule</Btn>
                  <Btn variant={sel.isActive ? 'danger' : 'soft'} icon="power" onClick={() => setConfirm(sel)}>{sel.isActive ? 'Deactivate' : 'Activate'}</Btn>
                </div>
                <Btn variant="soft" glyph="bars" className="fe-btn--block fe-btn--lg" style={{ marginTop: 12, background: '#f1f4fd' }}
                  onClick={() => nav('/admin/fees/reports?tab=fine')}>View Collection Report</Btn>
              </>
            ) : tab === 'applicability' ? (
              <>
                <div className="fe-kv"><span>Applies to</span><b>{FINE_APPLIES[sel.appliesTo]}</b></div>
                {sel.appliesTo === 'classes' ? <div className="fe-chips" style={{ margin: '10px 0' }}>{sel.classes.map(cl => <span key={cl._id} className="fe-chip fe-b-indigo">{cl.name}</span>)}</div> : null}
                <div className="fe-kv"><span>Students fined this year</span><b>{sel.students}</b></div>
                <div className="fe-kv"><span>Charged / settled</span><b>{money(sel.charged, { sym })} / {money(sel.settled, { sym })}</b></div>
                {act?.students?.length ? (
                  <table className="fe-mini" style={{ marginTop: 10 }}>
                    <thead><tr><th>Student</th><th>Last</th><th>Amount</th></tr></thead>
                    <tbody>{act.students.map(s => <tr key={s._id}><td>{s.name}{s.times > 1 ? ` ×${s.times}` : ''}</td><td>{fmtDate(s.last)}</td><td>{money(s.amount, { sym })}</td></tr>)}</tbody>
                  </table>
                ) : act ? <p className="fe-form__hint">No student has been fined under this rule this year.</p> : <Loading rows={2} />}
              </>
            ) : <History rows={act?.history} />}
          </Panel>
        ) : <Card><Empty title="Pick a fine rule" /></Card>}
      </div>

      <FineRuleDialog open={!!dialog} onClose={() => setDialog(null)} onSaved={reload} meta={meta} rule={dialog?.rule} copy={dialog?.copy} />
      <ChargeFineDialog open={charging} onClose={() => setCharging(false)} onDone={reload} meta={meta} rules={others?.rows || []} />
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={toggle}
        title={confirm?.isActive ? 'Deactivate fine rule' : 'Activate fine rule'} confirmLabel={confirm?.isActive ? 'Deactivate' : 'Activate'}
        message={confirm ? (confirm.isActive ? `Switch "${confirm.name}" off? Fines already charged stay on the ledger.` : `Switch "${confirm.name}" back on?`) : ''} />
    </div>
  );
}
