/**
 * Hostel → Fees (Sep 2026 redesign, to the user's mockup).
 *
 * Four figures over six views. The figures add up — every rupee billed is
 * kept, still owed or handed back — and they are the same four whichever view
 * is open (GET /hostel/admin/board/fee-summary).
 *
 * Everything that can be done to an invoice or a plan is done here, by one
 * form each, and handed to the views as `act`: an invoice is collected the same
 * way from the Invoices list, from Outstanding and from its own drawer.
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { Drawer, DrawerHead, DrawerBody, DrawerSection, DrawerFields, DrawerFoot } from '../../../components/ui/Drawer';
import { today, useNewFromLink, openHostelReceipt, openRefundVoucher } from '../shared';
import { PageHead, words } from './hsUI';
import { Kpis, Kpi, LineTabs, Btn, Avatar, useBoardData, fmtDate, fmtTime, rupees } from './hsList';
import { roomShort } from './hsPeople';
import { FormModal, FormSection, Grid, Fld, RadioCards, ToggleRow, StudentPicker, PersonCard, InfoNote, ReviewList, ConfirmDialog, RESIDENT_KINDS, OCCUPANTS, occupantOf, occupantLabel } from './hsForm';
import { ROOM_TYPES } from './hsRoom';
import {
  Invoices, Plans, RateCards, Collections, Outstanding, Refunds, OnlinePayments, FEE_TYPE, feeTypeOptions, FeeType, InvoiceStatus, MODES, invoiceSteps,
} from './FeeTabs';

const PLAN_TYPES = Object.keys(FEE_TYPE).filter((t) => !['fine', 'late_fee'].includes(t));
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BANDS = ROOM_TYPES.filter(([k]) => k !== 'custom');
const emptyPlan = {
  name: '', hostel: '', feeType: 'monthly', basis: 'flat', amount: '', appliesTo: 'student',
  frequency: 'monthly', dueDayOfMonth: 10, isRefundable: false, description: '', roomTypeRates: [],
};
const TABS = ['invoices', 'plans', 'rates', 'collections', 'outstanding', 'refunds', 'online'];
/** What the fee desk can take. 'Online' is not offered: only the gateway records one, with its own proof. */
const OFFLINE_MODES = Object.entries(MODES).filter(([k]) => k !== 'online');
const stamp = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');
/** Was any of this invoice paid through the gateway? Only then can a refund go back the same way. */
const paidOnline = (inv) => (inv?.payments || []).some((p) => p.mode === 'online' && p.gatewayPaymentId);

export default function Fees() {
  const [sp] = useSearchParams();
  const linkStatus = sp.get('status') || '';
  const [tab, setTab] = useState(TABS.includes(sp.get('tab')) ? sp.get('tab') : 'invoices');
  const [refreshKey, setRefreshKey] = useState(0);
  const { data: summary, reload: reloadTiles } = useBoardData((q) => api.getBoard('fee-summary', q), {});
  const { data: meta, refetch: reloadMeta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];
  const plans = meta?.feePlans || [];

  const [modal, setModal] = useState(null);         // plan | generate | invoice | pay | discount | refund
  const [form, setForm] = useState(emptyPlan);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState(null);             // { kind: 'invoice' | 'plan', row }
  const [target, setTarget] = useState(null);
  const [payForm, setPayForm] = useState({ amount: '', mode: 'cash', reference: '', note: '' });
  const [genForm, setGenForm] = useState({ feePlan: '', hostel: '', month: new Date().getMonth() + 1, year: new Date().getFullYear(), dueDate: '' });
  const [discForm, setDiscForm] = useState({ discount: '', reason: '' });
  const [refundForm, setRefundForm] = useState({ amount: '', reference: '', reason: '', how: 'offline' });
  // Checkouts the gateway has not confirmed, or money it took that could not be placed.
  const { data: onlineRes, refetch: reloadOnline } = useFetch(() => api.getOnlinePayments({ tab: 'open' }), []);
  const onlineOpen = ((c) => (c ? (c.unconfirmed || 0) + (c.unapplied || 0) : 0))((onlineRes?.data ?? onlineRes)?.counts);
  const [invForm, setInvForm] = useState({ kind: 'student', student: '', feeType: 'other', amount: '', dueDate: '', remarks: '' });
  // Whether the school bills its staff residents at all (Hostel Settings).
  const { data: settingsRes } = useFetch(api.getSettings, []);
  const chargeTeachers = !!(settingsRes?.data ?? settingsRes)?.chargeTeachers;
  const [invMode, setInvMode] = useState('one');    // one | plan
  const [detail, setDetail] = useState(null);
  const [lateAsk, setLateAsk] = useState(false);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  /** Something was saved: the figures, the open view and the open drawer are all stale. */
  const saved = async (invoiceId) => {
    setModal(null); reloadTiles(); setRefreshKey((k) => k + 1);
    const id = invoiceId || detail?._id;
    if (id && detail) {
      try { const r = await api.getBoard('fees', { id }); const row = (r.data ?? r).rows?.[0]; setDetail(row || null); } catch { setDetail(null); }
    }
  };

  const openPlan = (row) => {
    if (row) {
      setEditId(row._id);
      setForm({ ...emptyPlan, ...row, hostel: row.hostelId || row.hostel?._id || row.hostel || '', description: row.description || '', roomTypeRates: row.roomTypeRates || [], appliesTo: occupantOf(row, 'appliesTo') });
    } else { setEditId(null); setForm(emptyPlan); }
    setModal('plan');
  };
  const openInvoice = (mode = 'one') => {
    setInvMode(mode);
    setInvForm({ kind: 'student', student: '', feeType: 'other', amount: '', dueDate: '', remarks: '' });
    setModal('invoice');
  };
  // Opened straight from the Dashboard's New menu (?new=…).
  useNewFromLink(!!meta, () => openInvoice());

  const savePlan = async () => {
    setSaving(true);
    try {
      const p = {
        name: form.name, feeType: form.feeType, basis: form.basis, frequency: form.frequency, isRefundable: !!form.isRefundable, description: form.description,
        hostel: form.hostel || null,
        amount: Number(form.amount) || 0,
        dueDayOfMonth: Number(form.dueDayOfMonth) || 10,
        roomTypeRates: (form.roomTypeRates || []).map((z) => ({ roomType: z.roomType, amount: Number(z.amount) || 0 })),
      };
      if (editId) await api.updateFeePlan(editId, p); else await api.createFeePlan(p);
      toast.success('Fee plan saved'); reloadMeta?.(); saved();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const saveInvoice = async () => {
    setSaving(true);
    try {
      if (invMode === 'plan') {
        const r = await api.generateInvoices({ ...genForm, hostel: genForm.hostel || null });
        const d = r.data ?? r;
        toast.success(`${d.created} invoice(s) generated, ${d.skipped} already billed`);
      } else {
        await api.createInvoice({ ...invForm, amount: Number(invForm.amount) || 0 });
        toast.success('Invoice raised');
      }
      setTab('invoices'); saved();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  const pay = async () => {
    setSaving(true);
    try {
      const r = await api.payInvoice(target._id, { ...payForm, amount: Number(payForm.amount) || 0 });
      const d = r.data ?? r;
      toast.success(`Payment recorded — receipt ${d.receiptNumber}`);
      saved(target._id);
      if (d.receiptNumber) openHostelReceipt(d.receiptNumber, target._id);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const discount = async () => {
    setSaving(true);
    try {
      await api.discountInvoice(target._id, { discount: Number(discForm.discount) || 0, reason: discForm.reason });
      toast.success('Concession applied'); saved(target._id);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const refund = async () => {
    setSaving(true);
    try {
      const r = await api.refundInvoice(target._id, {
        amount: Number(refundForm.amount) || 0, reason: refundForm.reason,
        reference: refundForm.how === 'gateway' ? '' : refundForm.reference, viaGateway: refundForm.how === 'gateway',
      });
      const voucher = (r.data ?? r)?.voucherNumber;
      toast.success(refundForm.how === 'gateway' ? 'Refund sent back to the online payment' : 'Refund recorded');
      if (voucher) openRefundVoucher(voucher);
      saved(target._id);
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const confirmDel = async () => {
    try {
      if (del.kind === 'plan') { await api.deleteFeePlan(del.row._id); toast.success('Fee plan deactivated'); reloadMeta?.(); }
      else { await api.cancelInvoice(del.row._id); toast.success('Invoice cancelled'); }
      setDel(null); saved(del.kind === 'invoice' ? del.row._id : undefined);
    } catch (err) { toast.error(err.message); setDel(null); }
  };
  const runLateFees = async () => {
    setLateAsk(false);
    try {
      const r = await api.applyLateFees();
      const d = r.data ?? r;
      toast.success(d.message || `${d.updated} invoice(s) updated`);
      saved();
    } catch (err) { toast.error(err.message); }
  };

  const act = {
    view: async (r) => {
      if (r.invoiceNumber) { setDetail(r); return; }
      try { const res = await api.getBoard('fees', { id: r._id }); const row = (res.data ?? res).rows?.[0]; if (row) setDetail(row); else toast.error('That invoice could not be found'); }
      catch (err) { toast.error(err.message); }
    },
    collect: (r) => { setTarget(r); setPayForm({ amount: String(Math.max(0, r.netAmount - r.paidAmount)), mode: 'cash', reference: '', note: '' }); setModal('pay'); },
    concession: (r) => { setTarget(r); setDiscForm({ discount: String(r.discount || ''), reason: r.discountReason || '' }); setModal('discount'); },
    refund: (r) => {
      setTarget(r);
      setRefundForm({ amount: String(r.paidAmount - (r.refundedAmount || 0)), reference: '', reason: r.feeType === 'security_deposit' ? 'Security deposit returned' : '', how: 'offline' });
      setModal('refund');
    },
    cancel: (r) => setDel({ kind: 'invoice', row: r }),
    editPlan: openPlan,
    removePlan: (r) => setDel({ kind: 'plan', row: r }),
    bill: (r) => { setGenForm((g) => ({ ...g, feePlan: r._id, hostel: r.hostelId || '' })); openInvoice('plan'); },
  };

  // A link that names a status is asking about the invoices in it.
  useEffect(() => { if (linkStatus) setTab('invoices'); }, [linkStatus]);

  const t = summary?.tiles || {};
  const view = { meta, act, refreshKey };
  const steps = detail ? invoiceSteps(detail, act).filter((x) => x && x !== '-') : [];

  return (
    <div className="hs-page">
      <PageHead title="Hostel Fees Management" subtitle="Manage fee plans, rate cards, billing, collections and refunds for hostel residents.">
        <Btn className="hs-btn--accent" icon="clock" onClick={() => setLateAsk(true)}>Apply Late Fees</Btn>
        <Btn className="hs-btn--accent" icon="plus" onClick={() => openPlan()}>Fee Plan</Btn>
        <Btn kind="primary" icon="plus" onClick={() => openInvoice()}>Create Invoice</Btn>
      </PageHead>

      <Kpis cols={4} size="lg">
        <Kpi tone="blue" icon="wallet" value={rupees(t.billed ?? 0)} label="Total Billed"
          delta={t.billedPct != null ? { pct: t.billedPct, diagonal: true } : null} note={t.billedPct == null ? `${t.invoices ?? 0} invoices raised` : null} />
        <Kpi tone="green" icon="checkCircle" value={rupees(t.collected ?? 0)} label="Total Collected"
          pct={t.collectedPct ?? 0} pctLabel={`${t.collectedPct ?? 0}% collection rate`} pctTone="green" bar barColor="#12b76a" />
        <Kpi tone="amber" icon="hourglass" value={rupees(t.outstanding ?? 0)} label="Outstanding"
          pct={t.outstandingPct ?? 0} pctLabel={<><b className="hs-pt-amber">{t.outstandingPct ?? 0}%</b> pending</>} pctTone="muted" bar barColor="#f79009" />
        <Kpi tone="red" icon="refund" value={rupees(t.refunded ?? 0)} label="Refunded"
          pct={t.refundedPct ?? 0} pctLabel={<><b className="hs-pt-red">{t.refundedPct ?? 0}%</b> of total</>} pctTone="muted" bar barColor="#f04438" />
      </Kpis>

      <LineTabs rule value={tab} onChange={setTab} label="Fee views"
        items={[
          { key: 'invoices', label: 'Invoices' }, { key: 'plans', label: 'Fee Plans' }, { key: 'rates', label: 'Rate Cards' },
          { key: 'collections', label: 'Collections' }, { key: 'outstanding', label: 'Outstanding' }, { key: 'refunds', label: 'Refunds' },
          { key: 'online', label: 'Online Payments', count: onlineOpen || undefined, tone: 'warn' },
        ]} />

      {tab === 'invoices' ? <Invoices {...view} startStatus={linkStatus} /> : null}
      {tab === 'plans' ? <Plans {...view} /> : null}
      {tab === 'rates' ? <RateCards {...view} /> : null}
      {tab === 'collections' ? <Collections {...view} /> : null}
      {tab === 'outstanding' ? <Outstanding {...view} /> : null}
      {tab === 'refunds' ? <Refunds {...view} /> : null}
      {tab === 'online' ? <OnlinePayments {...view} onChanged={() => { reloadOnline(); reloadTiles(); setRefreshKey((k) => k + 1); }} /> : null}

      {/* ── Fee plan ──────────────────────────────────────────────────────── */}
      <FormModal open={modal === 'plan'} onClose={() => setModal(null)} busy={saving} onSubmit={savePlan}
        icon="wallet" title={editId ? 'Edit Fee Plan' : 'New Fee Plan'} subtitle="A charge the hostel bills — its amount, how often, and whether room type changes it."
        submitLabel={editId ? 'Save Changes' : 'Create Fee Plan'} submitIcon="check"
        steps={[
          { key: 'plan', title: 'Plan Details', sub: 'Name, type and schedule', icon: 'wallet' },
          { key: 'amount', title: 'Amount & Rates', sub: 'Flat or by room type', icon: 'rupee' },
          { key: 'review', title: 'Review', sub: 'Confirm and save', icon: 'oCheckRound' },
        ]}>
        <FormSection step="plan" icon="wallet" title="Plan Details" sub="What the plan charges for, and when.">
          <Grid cols={2}>
            <Fld label="Plan Name" required icon="wallet"><input value={form.name} maxLength={80} placeholder="e.g. Monthly hostel fee" onChange={(e) => setF('name', e.target.value)} /></Fld>
            <Fld label="Hostel" icon="oBuilding">
              <select value={form.hostel} onChange={(e) => setF('hostel', e.target.value)}>
                <option value="">All hostels</option>
                {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
              </select>
            </Fld>
          </Grid>
          <Grid cols={3}>
            <Fld label="Fee Type" required icon="oTag">
              <select value={form.feeType} onChange={(e) => setF('feeType', e.target.value)}>
                {feeTypeOptions(PLAN_TYPES).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Fld>
            <Fld label="Frequency" required icon="refresh">
              <select value={form.frequency} onChange={(e) => setF('frequency', e.target.value)}>
                {['one_time', 'monthly', 'quarterly', 'half_yearly', 'annual'].map((x) => <option key={x} value={x}>{words(x)}</option>)}
              </select>
            </Fld>
            <Fld label="Due Day of Month" required icon="calendar"><input type="number" min="1" max="28" value={form.dueDayOfMonth} onChange={(e) => setF('dueDayOfMonth', e.target.value)} /></Fld>
          </Grid>
          <Fld label="Description" optional><input value={form.description} maxLength={200} onChange={(e) => setF('description', e.target.value)} /></Fld>
          <RadioCards label="Plan Bills" required cols={3} value={form.appliesTo} onChange={(v) => setF('appliesTo', v)} options={OCCUPANTS} />
          {form.appliesTo !== 'student' && !chargeTeachers ? (
            <InfoNote tone="amber">Hostel Settings currently say the hostel is free for teachers, so this plan will not bill them until that is switched off.</InfoNote>
          ) : null}
        </FormSection>
        <FormSection step="amount" icon="rupee" title="Amount & Rates" sub="One amount for everyone, or a rate for each room type.">
          <RadioCards label="Basis" value={form.basis} onChange={(v) => setF('basis', v)}
            options={[['flat', 'Flat', 'The same for everyone'], ['room_type', 'By room type', 'A rate per room type']]} />
          <Grid cols={2}>
            <Fld label={form.basis === 'room_type' ? 'Fallback Amount (₹)' : 'Amount (₹)'} required icon="rupee"
              hint={form.basis === 'room_type' ? 'Charged for a room type left blank below' : ''}>
              <input type="number" min="0" value={form.amount} onChange={(e) => setF('amount', e.target.value)} />
            </Fld>
          </Grid>
          {form.basis === 'room_type' ? (
            <Grid cols={3}>
              {BANDS.map(([rt, name]) => {
                const band = (form.roomTypeRates || []).find((z) => z.roomType === rt);
                return (
                  <Fld key={rt} label={`${name} Room (₹)`} icon="oBed">
                    <input type="number" min="0" placeholder={form.amount ? `${form.amount} (fallback)` : ''} value={band?.amount ?? ''}
                      onChange={(e) => {
                        const rest = (form.roomTypeRates || []).filter((z) => z.roomType !== rt);
                        setF('roomTypeRates', e.target.value === '' ? rest : [...rest, { roomType: rt, amount: e.target.value }]);
                      }} />
                  </Fld>
                );
              })}
            </Grid>
          ) : null}
          <ToggleRow on={!!form.isRefundable} onChange={(v) => setF('isRefundable', v)} label="Refundable" hint="A security deposit — returned when the student leaves" />
        </FormSection>
        <FormSection step="review" icon="oCheckRound" title="Review" sub="Confirm the plan before it is saved.">
          <ReviewList groups={[
            { title: 'Plan', step: 0, rows: [['Name', form.name], ['Hostel', hostels.find((h) => h._id === form.hostel)?.name || 'All hostels'], ['Fee type', FEE_TYPE[form.feeType]?.[0] || words(form.feeType)],
              ['Frequency', words(form.frequency)], ['Due day', form.dueDayOfMonth], ['Bills', occupantLabel(form, 'appliesTo')], ['Description', form.description]] },
            { title: 'Amount', step: 1, rows: [['Basis', form.basis === 'room_type' ? 'By room type' : 'Flat'], ['Amount', form.amount ? rupees(form.amount) : ''],
              ...(form.basis === 'room_type' ? (form.roomTypeRates || []).map((z) => [`${(BANDS.find(([k]) => k === z.roomType) || [])[1] || z.roomType} room`, rupees(z.amount)]) : []),
              ['Refundable', form.isRefundable ? 'Yes' : 'No']] },
          ]} />
        </FormSection>
      </FormModal>

      {/* ── Create invoice: one student, or every resident on a plan ──────── */}
      <FormModal open={modal === 'invoice'} onClose={() => setModal(null)} busy={saving} onSubmit={saveInvoice} width={680}
        icon="oReceipt" title="Create Invoice" subtitle="Bill one resident, or every resident on a fee plan for a period."
        submitLabel={invMode === 'plan' ? 'Generate Invoices' : 'Raise Invoice'} submitIcon="check">
        <FormSection>
          <RadioCards label="Who to Bill" value={invMode} onChange={setInvMode}
            options={[['one', 'One resident', 'A single charge'], ['plan', 'Every resident on a plan', 'Billed for a month or a year']]} />
          {invMode === 'one' ? (
            <>
              <RadioCards label="Resident" value={invForm.kind} options={RESIDENT_KINDS} onChange={(v) => setInvForm((f) => (v === f.kind ? f : { ...f, kind: v, student: '' }))} />
              <Fld label={invForm.kind === 'teacher' ? 'Teacher' : 'Student'} required hint="Only current residents are listed">
                <StudentPicker kind={invForm.kind} value={invForm.student} onChange={(id) => setInvForm((f) => ({ ...f, student: id }))} params={{ allocated: 'true' }} />
              </Fld>
              {invForm.kind === 'teacher' && !chargeTeachers ? (
                <InfoNote>The hostel is free for teachers, so fee plans do not bill them. A one-off charge like this one (damage, a fine) is still raised.</InfoNote>
              ) : null}
              <Grid cols={3}>
                <Fld label="Fee Type" required icon="oTag">
                  <select value={invForm.feeType} onChange={(e) => setInvForm((f) => ({ ...f, feeType: e.target.value }))}>
                    {feeTypeOptions().map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Fld>
                <Fld label="Amount (₹)" required icon="rupee"><input type="number" min="1" step="any" value={invForm.amount} onChange={(e) => setInvForm((f) => ({ ...f, amount: e.target.value }))} /></Fld>
                <Fld label="Due Date" icon="calendar"><input type="date" value={invForm.dueDate} onChange={(e) => setInvForm((f) => ({ ...f, dueDate: e.target.value }))} /></Fld>
              </Grid>
              <Fld label="Remarks" optional icon="fileDoc"><input value={invForm.remarks} maxLength={200} onChange={(e) => setInvForm((f) => ({ ...f, remarks: e.target.value }))} /></Fld>
            </>
          ) : (
            <>
              <Fld label="Fee Plan" required icon="wallet" hint={plans.length ? '' : 'There are no fee plans yet — add one first.'} hintTone="bad">
                <select value={genForm.feePlan} onChange={(e) => setGenForm((g) => ({ ...g, feePlan: e.target.value }))}>
                  <option value="">Select a plan</option>
                  {plans.map((x) => <option key={x._id} value={x._id}>{x.name} ({rupees(x.amount)} · {occupantLabel(x, 'appliesTo').toLowerCase()})</option>)}
                </select>
              </Fld>
              <Grid cols={3}>
                <Fld label="Hostel" icon="oBuilding">
                  <select value={genForm.hostel} onChange={(e) => setGenForm((g) => ({ ...g, hostel: e.target.value }))}>
                    <option value="">Plan&apos;s hostel</option>
                    {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
                  </select>
                </Fld>
                <Fld label="Month" icon="calendar">
                  <select value={genForm.month} onChange={(e) => setGenForm((g) => ({ ...g, month: e.target.value }))}>
                    <option value="">Annual (no month)</option>
                    {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </Fld>
                <Fld label="Year" required icon="calendar"><input type="number" min="2000" max="2100" value={genForm.year} onChange={(e) => setGenForm((g) => ({ ...g, year: e.target.value }))} /></Fld>
              </Grid>
              <Fld label="Due Date Override" optional icon="calendar"><input type="date" value={genForm.dueDate} onChange={(e) => setGenForm((g) => ({ ...g, dueDate: e.target.value }))} /></Fld>
              <InfoNote>Safe to re-run: one invoice per resident, plan and period — running a month twice charges nobody twice.{chargeTeachers ? '' : ' Teachers are skipped: the hostel is free for them.'}</InfoNote>
            </>
          )}
        </FormSection>
      </FormModal>

      {/* ── Collect / concession / refund ─────────────────────────────────── */}
      <FormModal open={modal === 'pay'} onClose={() => setModal(null)} busy={saving} onSubmit={pay} width={560}
        icon="wallet" iconTone="green" title="Record Offline Payment" subtitle={target ? `${target.invoiceNumber} · ${FEE_TYPE[target.feeType]?.[0] || words(target.feeType)}` : ''}
        submitLabel="Record Payment" submitIcon="check">
        {target ? (
          <FormSection>
            <PersonCard name={target.studentName} photo={target.studentPhoto} meta={[target.studentClass, `Outstanding ${rupees(target.netAmount - target.paidAmount)}`]} />
            <Grid cols={2}>
              <Fld label="Amount (₹)" required icon="rupee" hint={`Up to ${rupees(target.netAmount - target.paidAmount)}`}>
                <input type="number" min="1" max={target.netAmount - target.paidAmount} step="any" value={payForm.amount} onChange={(e) => setPayForm((f) => ({ ...f, amount: e.target.value }))} />
              </Fld>
              <Fld label="Mode" required icon="creditCard">
                <select value={payForm.mode} onChange={(e) => setPayForm((f) => ({ ...f, mode: e.target.value }))}>
                  {OFFLINE_MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Fld>
            </Grid>
            <Fld label="Reference" required={payForm.mode !== 'cash'} optional={payForm.mode === 'cash'} icon="oHash">
              <input value={payForm.reference} maxLength={60} placeholder="Cheque / UPI / transaction reference" onChange={(e) => setPayForm((f) => ({ ...f, reference: e.target.value }))} />
            </Fld>
            <Fld label="Note" optional icon="fileDoc"><input value={payForm.note} maxLength={200} onChange={(e) => setPayForm((f) => ({ ...f, note: e.target.value }))} /></Fld>
            <InfoNote>For money taken at the hostel office. A receipt opens once it is saved. Online payments are not entered here — they are recorded automatically when the resident or a parent pays from their own Hostel page.</InfoNote>
          </FormSection>
        ) : null}
      </FormModal>

      <FormModal open={modal === 'discount'} onClose={() => setModal(null)} busy={saving} onSubmit={discount} width={540}
        icon="percent" iconTone="violet" title="Apply Concession" subtitle={target ? `${target.invoiceNumber} · billed ${rupees(target.amount)}, paid ${rupees(target.paidAmount)}` : ''}
        submitLabel="Apply Concession" submitIcon="check">
        {target ? (
          <FormSection>
            <Fld label="Concession / Scholarship / Waiver (₹)" required icon="rupee" hint={`Up to ${rupees(target.amount)}`}>
              <input type="number" min="0" max={target.amount} value={discForm.discount} onChange={(e) => setDiscForm((f) => ({ ...f, discount: e.target.value }))} />
            </Fld>
            <Fld label="Reason" required hint="Every fee change is audited with its before and after amount" count={[discForm.reason.length, 300]}>
              <textarea rows={2} maxLength={300} value={discForm.reason} onChange={(e) => setDiscForm((f) => ({ ...f, reason: e.target.value }))} />
            </Fld>
          </FormSection>
        ) : null}
      </FormModal>

      <FormModal open={modal === 'refund'} onClose={() => setModal(null)} busy={saving} onSubmit={refund} width={540}
        icon="refund" iconTone="amber" title="Process Refund" subtitle={target ? `${target.invoiceNumber} · to ${target.studentName}` : ''}
        submitLabel="Refund" submitIcon="check">
        {target ? (
          <FormSection>
            {paidOnline(target) ? (
              <RadioCards value={refundForm.how} onChange={(v) => setRefundForm((f) => ({ ...f, how: v }))} options={[
                ['offline', 'Cash or bank transfer', 'Handed over by the hostel office'],
                ['gateway', 'Back to the online payment', 'Sent to the card or account it was paid from'],
              ]} />
            ) : null}
            <Fld label="Amount (₹)" required icon="rupee" hint={`Up to ${rupees(target.paidAmount - (target.refundedAmount || 0))} can be refunded`}>
              <input type="number" min="1" max={target.paidAmount - (target.refundedAmount || 0)} step="any" required value={refundForm.amount} onChange={(e) => setRefundForm((f) => ({ ...f, amount: e.target.value }))} />
            </Fld>
            {refundForm.how === 'gateway' ? null : (
              <Fld label="Reference" optional icon="oHash" hint="Cheque or transfer number"><input value={refundForm.reference} maxLength={60} onChange={(e) => setRefundForm((f) => ({ ...f, reference: e.target.value }))} /></Fld>
            )}
            <Fld label="Reason" required icon="fileDoc"><input value={refundForm.reason} maxLength={200} required placeholder="Security deposit return" onChange={(e) => setRefundForm((f) => ({ ...f, reason: e.target.value }))} /></Fld>
            <InfoNote>{refundForm.how === 'gateway'
              ? 'The gateway sends the money back — it usually reaches the payer in 5–7 working days. The amount must fit within one online payment on this invoice.'
              : 'This records money the office has handed back; nothing is sent anywhere.'} A refund voucher opens once it is saved.</InfoNote>
          </FormSection>
        ) : null}
      </FormModal>

      {/* ── Invoice ───────────────────────────────────────────────────────── */}
      <Drawer open={!!detail} onClose={() => setDetail(null)} label="Invoice">
        {detail ? (
          <>
            <DrawerHead
              mark={<Avatar name={detail.studentName} src={detail.studentPhoto} size={52} />}
              name={detail.studentName} sub={[detail.invoiceNumber, detail.studentClass, detail.studentRoll ? `Roll ${detail.studentRoll}` : ''].filter(Boolean).join(' · ')}
              tags={<><InvoiceStatus value={detail.status} /><FeeType value={detail.feeType} /></>}
              onClose={() => setDetail(null)}
            />
            <DrawerBody>
              <div className="hs-dstats">
                {[['Net amount', rupees(detail.netAmount)], ['Paid', rupees(detail.paidAmount)], ['Balance', rupees(detail.balance)]]
                  .map(([l, v]) => <div key={l}><strong>{v}</strong><span>{l}</span></div>)}
              </div>
              <DrawerSection title="Invoice">
                <DrawerFields fields={[
                  ['Period', detail.period?.label], ['Due date', fmtDate(detail.dueDate)], ['Raised on', fmtDate(detail.createdAt)],
                  ['Hostel', detail.hostelName], ['Room / bed', detail.roomNumber ? roomShort(detail) : ''],
                  ['Amount', rupees(detail.amount)],
                  ['Concession', detail.discount > 0 ? `− ${rupees(detail.discount)}${detail.discountReason ? ` · ${detail.discountReason}` : ''}` : ''],
                  ['Late fee', detail.lateFee > 0 ? `+ ${rupees(detail.lateFee)}` : ''],
                  ['Refunded', detail.refundedAmount > 0 ? `${rupees(detail.refundedAmount)}${detail.refundedAt ? ` on ${fmtDate(detail.refundedAt)}` : ''}${detail.refundReference ? ` · ${detail.refundReference}` : ''}` : ''],
                  ['Remarks', detail.remarks],
                ]} />
              </DrawerSection>
              <DrawerSection title={`Payments (${detail.payments?.length || 0})`}>
                {detail.payments?.length ? (
                  <ul className="hs-livelist">
                    {detail.payments.map((p, i) => (
                      <li key={p._id || i}>
                        <span className="hs-two"><span className="hs-two__top">{p.receiptNumber || 'Payment'} · {MODES[p.mode] || words(p.mode)}</span><span className="hs-two__sub">{[stamp(p.paidAt), p.reference].filter(Boolean).join(' · ')}</span></span>
                        <strong>{rupees(p.amount)}</strong>
                        {p.receiptNumber ? <Btn size="sm" icon="oReceipt" onClick={() => openHostelReceipt(p.receiptNumber, detail._id)}>Receipt</Btn> : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="hs-muted">Nothing has been paid against this invoice.</p>}
              </DrawerSection>
              {detail.refunds?.length ? (
                <DrawerSection title={`Refunds (${detail.refunds.length})`}>
                  <ul className="hs-livelist">
                    {detail.refunds.map((r, i) => (
                      <li key={r.voucherNumber || i}>
                        <span className="hs-two"><span className="hs-two__top">{r.voucherNumber || 'Refund'} · {r.mode === 'gateway' ? 'Back to the online payment' : 'Cash / transfer'}</span><span className="hs-two__sub">{[stamp(r.refundedAt), r.reason, r.reference].filter(Boolean).join(' · ')}</span></span>
                        <strong>{rupees(r.amount)}</strong>
                        {r.voucherNumber ? <Btn size="sm" icon="oReceipt" onClick={() => openRefundVoucher(r.voucherNumber)}>Voucher</Btn> : null}
                      </li>
                    ))}
                  </ul>
                </DrawerSection>
              ) : null}
            </DrawerBody>
            {steps.length ? (
              <DrawerFoot>
                {steps.map((x) => <Btn key={x.label} kind={x.danger ? 'danger' : x.label === 'Collect payment' ? 'primary' : 'outline'} onClick={x.onClick}>{x.label}</Btn>)}
              </DrawerFoot>
            ) : null}
          </>
        ) : null}
      </Drawer>

      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={confirmDel}
        confirmLabel={del?.kind === 'plan' ? 'Deactivate Plan' : 'Cancel Invoice'} cancelLabel={del?.kind === 'plan' ? 'Cancel' : 'Keep Invoice'}
        title={del?.kind === 'plan' ? 'Deactivate Fee Plan' : 'Cancel Invoice'}
        message={del?.kind === 'plan'
          ? `Deactivate ${del?.row?.name}? Invoices already raised from it are kept.`
          : `Cancel ${del?.row?.invoiceNumber}? A reversing entry is posted to the fee ledger.`} />
      <ConfirmDialog open={lateAsk} onClose={() => setLateAsk(false)} onConfirm={runLateFees} tone="primary" icon="clockSolid"
        title="Apply Late Fees"
        confirmLabel="Apply"
        message={`Bring the late fee on every unpaid invoice past its grace period up to date as of ${fmtDate(`${today()}T00:00:00`)} — days overdue × the daily rate in Hostel Settings. The fee is recalculated, not added on, so running this twice charges nobody twice.`} />
    </div>
  );
}
