/**
 * Fees → Concessions (mockup 7). Scholarship and discount schemes, who holds
 * them, and what they have taken off this year. "vs last term" in the mockup
 * reads "vs last year" here: the school records no terms, and the previous
 * academic year is the comparison that exists.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getConcessionList, toggleConcession } from '../../../api/fees.api';
import { Confirm } from '../../../components/ui/index';
import { RowMenu, MenuItem, MenuSep } from '../../admin/listParts';
import Icon from '../../../components/ui/icons';
import {
  FeHead, Btn, Card, CardHead, Tile, Tiles, Select, Search, PillTabs, StatusBadge, IconBtn, Check, Pager, Mark, Note, LinkBtn,
  money, fmtDate, yearOptions, ELIGIBILITY, Empty, Loading, saveFile, toCsv,
} from './feeUI';
import { Donut, DonutLegend, SERIES, INK } from './feeCharts';
import { ConcessionDialog, AssignConcessionDialog, ConcessionDrawer } from './feeForms';
import { useFeesMeta, classOptions, sectionOptions, useUrlState } from './feeData';
import { Activity } from './feeHistory';

const DEFAULTS = { academicYearId: '', type: '', status: '', classId: '', sectionId: '', eligibility: '', q: '', page: '1', limit: '10' };

const CON_LOOKS = [
  [/merit|scholar|topper|rank/i, 'trophy', 'amber'], [/sibling|brother|sister/i, 'users', 'blue'], [/staff|employee|teacher/i, 'briefcase', 'green'],
  [/need|aid|poor|financial|ews/i, 'heartHand', 'red'], [/covid|relief|disaster/i, 'shield', 'blue'], [/girl|female|daughter/i, 'venus', 'pink'],
  [/alumni/i, 'gradCap', 'blue'], [/late|waiver|admission/i, 'docFill', 'purple'], [/sport/i, 'trophy', 'amber'],
];
export const concessionLook = (name) => {
  const hit = CON_LOOKS.find(([re]) => re.test(String(name || '')));
  return hit ? { glyph: hit[1], tone: hit[2] } : { glyph: 'percent', tone: 'green' };
};

/** "Add Concession ▾" — a new scheme, or give an existing one to students. */
function SplitAdd({ onNew, onAssign }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);
  return (
    <span ref={ref} style={{ position: 'relative' }}>
      <Btn variant="primary" icon="plus" onClick={() => setOpen(o => !o)}>Add Concession <Icon name="chevronDown" size={15} /></Btn>
      {open ? (
        <div className="lmenu" style={{ position: 'absolute', right: 0, top: 46, width: 240, zIndex: 30 }}>
          <button type="button" className="lmenu__item" onClick={() => { setOpen(false); onNew(); }}><Icon name="plus" size={16} />New concession scheme</button>
          <button type="button" className="lmenu__item" onClick={() => { setOpen(false); onAssign(); }}><Icon name="userPlus" size={16} />Assign to students</button>
        </div>
      ) : null}
    </span>
  );
}

export default function Concessions() {
  const nav = useNavigate();
  const [applied, setApplied] = useUrlState(DEFAULTS);
  const [draft, setDraft] = useState(applied);
  const [more, setMore] = useState(!!applied.eligibility);
  const [insight, setInsight] = useState('year');
  const [hover, setHover] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [assign, setAssign] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [picked, setPicked] = useState(new Set());
  useEffect(() => { setDraft(applied); }, [JSON.stringify(applied)]); // eslint-disable-line react-hooks/exhaustive-deps

  const { meta } = useFeesMeta(applied.academicYearId);
  const { meta: draftMeta } = useFeesMeta(draft.academicYearId);
  const page = Number(applied.page) || 1, limit = Number(applied.limit) || 10;
  const query = Object.fromEntries(Object.entries({ ...applied, page, limit, insight }).filter(([, v]) => v !== '' && v != null));
  const { data, meta: env, loading, refetch } = useFetch(() => getConcessionList(query), [JSON.stringify(query)]);
  const { data: all } = useFetch(() => getConcessionList({ limit: 200, academicYearId: applied.academicYearId || undefined }), [applied.academicYearId, data]);
  const rows = data?.rows || [];
  const c = data?.counts || {};
  const t = data?.tiles || {};
  const sym = meta?.settings?.currencySymbol || '₹';
  const yearValue = draft.academicYearId || data?.year?._id || '';
  const setD = (k) => (v) => setDraft(d => ({ ...d, [k]: v, ...(k === 'classId' ? { sectionId: '' } : {}), ...(k === 'academicYearId' ? { classId: '', sectionId: '' } : {}) }));
  const apply = () => setApplied({ ...draft, page: '1' });
  const clear = () => { setDraft(DEFAULTS); setApplied({ ...DEFAULTS }); };
  const allOn = rows.length > 0 && rows.every(r => picked.has(r._id));
  useEffect(() => { if (viewing) setViewing(v => rows.find(r => r._id === v._id) || v); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const vsLabel = data?.previousYear ? `vs ${data.previousYear}` : 'vs last year';

  const toggle = async () => {
    try { await toggleConcession(confirm._id); toast.success(confirm.isActive ? 'Concession switched off' : 'Concession switched on'); setConfirm(null); refetch(); }
    catch (e) { toast.error(e.message); }
  };
  const exportCsv = () => saveFile(toCsv([
    { key: 'name', label: 'Concession' }, { label: 'Type', value: r => (r.concessionType === 'percentage' ? 'Percentage' : 'Fixed Amount') },
    { label: 'Applicable To', value: r => ELIGIBILITY[r.eligibility] }, { label: 'Discount', value: r => (r.concessionType === 'percentage' ? `${r.value}%` : r.value) },
    { key: 'beneficiaries', label: 'Beneficiaries' }, { key: 'amount', label: 'Taken off this year' },
    { label: 'Valid From', value: r => (r.validFrom ? fmtDate(r.validFrom) : '') }, { label: 'Valid To', value: r => (r.validTo ? fmtDate(r.validTo) : '') }, { key: 'status', label: 'Status' },
  ], picked.size ? rows.filter(r => picked.has(r._id)) : rows), 'concessions.csv');

  const slices = (data?.insights?.slices || []).map((s, i) => ({ label: s.name, value: s.amount, pct: s.pct, color: SERIES[i] || INK.slate, names: s.names }));

  return (
    <div className="fe-page">
      <FeHead title="Concessions" subtitle="Manage fee concessions, scholarships, discounts and fee waivers">
        <SplitAdd onNew={() => setDialog({})} onAssign={() => setAssign({})} />
        <Btn variant="outline" icon="download" onClick={exportCsv}>Export</Btn>
      </FeHead>

      <Tiles n={6}>
        <Tile small valueFirst glyph="percent" tone="green" value={t.total || 0} label="Total Concessions" caption="All concession schemes" />
        <Tile small glyph="users" tone="blue" label="Students Benefited" value={t.benefited || 0} delta={{ pct: t.benefitedChange, caption: vsLabel, noSign: true }} />
        <Tile small glyph="rupee" tone="amber" label="Total Concession Amount" value={money(t.amount, { sym })} delta={{ pct: t.amountChange, caption: vsLabel, noSign: true }} />
        <Tile small valueFirst glyph="clockRing" tone="red" value={t.active || 0} label="Active Concessions" caption="Currently running" />
        <Tile small valueFirst glyph="docFill" tone="purple" value={t.upcoming || 0} label="Upcoming Concessions" caption="Scheduled for future" />
        <Tile small valueFirst glyph="eyeSlash" tone="slate" value={t.inactive || 0} label={t.inactive === 1 ? 'Inactive Concession' : 'Inactive Concessions'} caption="Not in use" />
      </Tiles>

      <Card className="fe-filters">
        <div className="fe-frow" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr)) minmax(0, 1.4fr)' }}>
          <Select label="Academic Year" value={yearValue} onChange={setD('academicYearId')} options={yearOptions(draftMeta?.years || meta?.years)} />
          <Select label="Concession Type" value={draft.type} onChange={setD('type')} all="All Types" options={[{ value: 'percentage', label: 'Percentage' }, { value: 'fixed', label: 'Fixed Amount' }]} />
          <Select label="Status" value={draft.status} onChange={setD('status')} all="All Statuses" options={[{ value: 'active', label: 'Active' }, { value: 'upcoming', label: 'Upcoming' }, { value: 'inactive', label: 'Inactive' }]} />
          <Select label="Class" value={draft.classId} onChange={setD('classId')} all="All Classes" options={classOptions(draftMeta)} />
          <Select label="Section" value={draft.sectionId} onChange={setD('sectionId')} all="All Sections" options={sectionOptions(draftMeta, draft.classId)} disabled={!draft.classId} />
          <Search className="is-top" value={draft.q} onChange={setD('q')} onEnter={apply} placeholder="Search concessions..." />
        </div>
        {more ? (
          <div className="fe-more">
            <Select label="Applicable To" value={draft.eligibility} onChange={setD('eligibility')} all="Anyone" options={Object.entries(ELIGIBILITY).map(([value, label]) => ({ value, label }))} />
          </div>
        ) : null}
        <div className="fe-frow--end">
          <Btn variant="link" icon="filter" onClick={() => setMore(m => !m)}>{more ? 'Fewer Filters' : 'More Filters'}</Btn>
          <div>
            <Btn variant="link" onClick={clear}>Clear Filters</Btn>
            <Btn variant="primary" icon="filter" onClick={apply}>Apply Filters</Btn>
          </div>
        </div>
      </Card>

      <div className="fe-split fe-split--narrow">
        <Card>
          <CardHead title={`Concessions (${c.all || 0})`}>
            <PillTabs className="fe-pills--inline" value={applied.status} onChange={s => setApplied({ status: s, page: '1' })} items={[
              { key: '', label: 'All', count: c.all || 0, tone: 'slate' },
              { key: 'active', label: 'Active', count: c.active || 0, tone: 'green' },
              { key: 'upcoming', label: 'Upcoming', count: c.upcoming || 0, tone: 'amber' },
              { key: 'inactive', label: 'Inactive', count: c.inactive || 0, tone: 'red' },
            ]} />
          </CardHead>
          <div className="fe-tablewrap">
            <table className="fe-table fe-table--dense fe-table--xdense">
              <thead><tr>
                <th className="fe-w-check"><Check checked={allOn} label="Select all" onChange={() => setPicked(allOn ? new Set() : new Set(rows.map(r => r._id)))} /></th>
                <th>#</th><th>Concession Name</th><th>Type</th><th>Applicable To</th><th>Discount / Waiver</th><th>Beneficiaries</th><th>Valid Period</th><th>Status</th><th>Actions</th>
              </tr></thead>
              <tbody>
                {rows.map((r, i) => {
                  const lk = concessionLook(r.name);
                  const heads = r.applicableTo === 'specific_heads' && r.applicableHeads.length ? r.applicableHeads.map(h => h.name).join(', ') : '';
                  return (
                    <tr key={r._id} className={picked.has(r._id) ? 'is-sel' : ''}>
                      <td><Check checked={picked.has(r._id)} label={`Select ${r.name}`}
                        onChange={() => setPicked(p => { const n = new Set(p); if (n.has(r._id)) n.delete(r._id); else n.add(r._id); return n; })} /></td>
                      <td>{(page - 1) * limit + i + 1}</td>
                      <td><span className="fe-name"><Mark glyph={lk.glyph} tone={lk.tone} size={34} /><b style={{ fontWeight: 500, maxWidth: 130 }}>{r.name}</b></span></td>
                      <td>{r.concessionType === 'percentage' ? 'Percentage' : 'Fixed Amount'}</td>
                      <td>{ELIGIBILITY[r.eligibility]}</td>
                      <td className="fe-strong">{r.concessionType === 'percentage' ? `${r.value}%` : money(r.value, { sym, space: true })}{heads ? <div className="fe-muted" style={{ fontWeight: 400 }}>({heads})</div> : null}</td>
                      <td>{r.beneficiaries}</td>
                      <td className="fe-num fe-muted">{r.validFrom || r.validTo ? `${r.validFrom ? fmtDate(r.validFrom) : '…'} – ${r.validTo ? fmtDate(r.validTo) : '…'}` : 'No end date'}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>
                        <span className="fe-acts">
                          <IconBtn icon="eye" label="View" onClick={() => setViewing(r)} />
                          <IconBtn icon="pencil" label="Edit" onClick={() => setDialog({ concession: r })} />
                          <RowMenu>
                            <MenuItem icon="userPlus" onClick={() => setAssign({ concession: r })}>Assign students</MenuItem>
                            <MenuSep />
                            <MenuItem icon="power" danger={r.isActive} onClick={() => setConfirm(r)}>{r.isActive ? 'Deactivate' : 'Activate'}</MenuItem>
                          </RowMenu>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loading && !data ? <Loading rows={6} /> : null}
            {!loading && !rows.length ? <Empty title="No concessions" hint={c.all ? 'Nothing matches these filters.' : 'Add a scholarship or discount scheme, then assign it to students.'} /> : null}
          </div>
          <Pager page={page} pages={env?.pages || 1} total={env?.total || 0} limit={limit} count={rows.length} noun="concessions"
            onPage={p => setApplied({ page: String(p) })} onLimit={l => setApplied({ limit: String(l), page: '1' })} />
        </Card>

        <aside className="fe-split__rail">
          <Card>
            <CardHead title="Concession Insights">
              <div style={{ width: 146 }} className="fe-select--mini"><Select compact value={insight} onChange={setInsight} options={[{ value: 'year', label: 'This Academic Year' }, { value: 'all', label: 'All Time' }]} /></div>
            </CardHead>
            <div className="fe-cardbody" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Donut size={136} thickness={20} slices={slices} sym={sym} hover={hover} onHover={setHover}
                center={[money(data?.insights?.total || 0, { sym, space: true }), 'Total']} />
              {slices.length ? <DonutLegend rows={slices} hover={hover} onHover={setHover} className="fe-dlegend--tight" /> : <p className="fe-form__hint">Nothing taken off yet.</p>}
            </div>
          </Card>
          <Card>
            <CardHead title="Recent Activity"><LinkBtn onClick={() => nav('/admin/fees/settings?tab=audit&entity=FeeConcession')}>View All</LinkBtn></CardHead>
            <div className="fe-cardbody"><Activity rows={data?.activity} /></div>
          </Card>
          <Note title="Note">Concessions are applied at the time of fee generation, and at once to fees already charged when a concession is assigned. Withdrawing one adds its amount back.</Note>
        </aside>
      </div>

      <ConcessionDialog open={!!dialog} onClose={() => setDialog(null)} onSaved={refetch} meta={meta} concession={dialog?.concession} />
      <AssignConcessionDialog open={!!assign} onClose={() => setAssign(null)} onDone={refetch} meta={meta} concession={assign?.concession} concessions={all?.rows || []} />
      <ConcessionDrawer row={viewing} onClose={() => setViewing(null)} meta={meta} onChanged={refetch}
        onEdit={(r) => { setViewing(null); setDialog({ concession: r }); }} onAssign={(r) => setAssign({ concession: r })} />
      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={toggle}
        title={confirm?.isActive ? 'Deactivate concession' : 'Activate concession'} confirmLabel={confirm?.isActive ? 'Deactivate' : 'Activate'}
        message={confirm ? (confirm.isActive ? `Switch "${confirm.name}" off? What it has already taken off stays; it stops applying to new demands.` : `Switch "${confirm.name}" back on?`) : ''} />
    </div>
  );
}
