import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { Button, Spinner, Badge, Empty } from '../../components/ui/index';

// Per-leave-type policy editor. Mounted as the "Policies" tab of
// pages/admin/Leave.jsx: pick a leave type on the left, edit its rules on the
// right. Every type has a policy — an unedited one runs on defaults seeded
// from the leave type itself, so nothing changes until it is saved.

const GENDERS = [['any', 'Any'], ['Female', 'Female only'], ['Male', 'Male only']];

// ── Reusable field bits, declared at module scope so React keeps the element
// type stable across renders and inputs never lose focus mid-typing. ─────────
const Num = ({ label, value, onChange, hint, step = 1, disabled }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    <input type="number" className="form-control" min={0} step={step} disabled={disabled}
      value={value ?? 0}
      onChange={e => onChange(e.target.value === '' ? 0 : Number(e.target.value))} />
    {hint && <div className="form-hint">{hint}</div>}
  </div>
);

const Toggle = ({ label, checked, onChange, hint }) => (
  <div className="form-group">
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
    {hint && <div className="form-hint" style={{ marginLeft: 24 }}>{hint}</div>}
  </div>
);

const Section = ({ title, note, children }) => (
  <div className="card" style={{ marginBottom: 16 }}>
    <div className="card-header"><h2 style={{ fontSize: '.95rem' }}>{title}</h2></div>
    <div className="card-body">
      {note && <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', marginTop: 0 }}>{note}</p>}
      {children}
    </div>
  </div>
);

const CheckList = ({ label, options, selected = [], onChange, empty }) => (
  <div className="form-group">
    <label className="form-label">{label}</label>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {options.map(([val, text]) => (
        <label key={val} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' }}>
          <input type="checkbox" checked={selected.includes(val)}
            onChange={e => onChange(e.target.checked
              ? [...selected, val]
              : selected.filter(x => x !== val))} />
          {text}
        </label>
      ))}
      {!options.length && <span style={{ color: 'var(--text-muted)', fontSize: '.85rem' }}>{empty}</span>}
    </div>
  </div>
);

export default function AdminLeavePolicies({ onSaved }) {
  const { data, loading, refetch } = useFetch(() => api.getLeavePolicies());
  const [selected, setSelected] = useState(null);   // leaveType id
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const policies    = data?.policies    || [];
  const designations = data?.designations || [];
  const leaveTypes  = data?.leaveTypes  || [];

  // Default to the first type, and re-sync the form whenever the list reloads
  useEffect(() => {
    if (!policies.length) return;
    const id = selected && policies.some(p => p.leaveType._id === selected)
      ? selected
      : policies[0].leaveType._id;
    if (id !== selected) setSelected(id);
    setForm(policies.find(p => p.leaveType._id === id) || null);
  }, [data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (id) => {
    setSelected(id);
    setForm(policies.find(p => p.leaveType._id === id) || null);
  };

  const set   = (patch) => setForm(f => ({ ...f, ...patch }));
  const setIn = (key, patch) => setForm(f => ({ ...f, [key]: { ...f[key], ...patch } }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateLeavePolicy(selected, form);
      toast.success(`${form.leaveType?.name} policy saved`);
      refetch();
      // The parent renders the allocation and apply forms from the merged type
      // list, which this save just invalidated.
      onSaved?.();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>;
  if (!policies.length) {
    return (
      <div className="card"><div className="card-body">
        <Empty icon="📋" title="No leave types yet"
          message="Create a leave type first — each one gets its own configurable policy." />
      </div></div>
    );
  }

  // The server refuses accrual that credits nothing, so the form does not offer
  // to submit it.
  const accrualInvalid = !!form?.monthlyAccrual?.enabled && !(form.monthlyAccrual.daysPerMonth > 0);
  const isCompOff = form?.leaveType?.category === 'compoff';
  const otherTypes = leaveTypes.filter(t => t._id !== selected);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 260px) 1fr', gap: 16, alignItems: 'start' }}>

      {/* ── Type picker ── */}
      <div className="card">
        <div className="card-header"><h2 style={{ fontSize: '.9rem' }}>Leave Types</h2></div>
        <div className="card-body" style={{ padding: 0 }}>
          {policies.map(p => {
            const active = p.leaveType._id === selected;
            return (
              <button key={p.leaveType._id} onClick={() => pick(p.leaveType._id)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 16px', cursor: 'pointer',
                  border: 'none', borderLeft: `3px solid ${active ? 'var(--primary)' : 'transparent'}`,
                  background: active ? 'var(--bg-muted)' : 'transparent',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                }}>
                <span>
                  <span style={{ fontWeight: active ? 700 : 500 }}>{p.leaveType.name}</span>
                  <span style={{ display: 'block', fontSize: '.72rem', color: 'var(--text-muted)' }}>
                    {p.leaveType.code}{p.leaveType.category === 'compoff' ? ' · Comp Off' : ''}
                  </span>
                </span>
                {!p.saved && <Badge variant="muted">default</Badge>}
                {!p.isActive && <Badge variant="danger">off</Badge>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Editor ── */}
      {form && (
        <form onSubmit={save}>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{form.leaveType?.name} policy</h2>
                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '.82rem' }}>
                  {form.saved
                    ? 'These rules apply to every application for this leave type.'
                    : 'Running on defaults — saving will pin these rules for this leave type.'}
                </p>
              </div>
              <Button type="submit" loading={saving} disabled={accrualInvalid}>Save Policy</Button>
            </div>
          </div>

          {isCompOff && (
            <div className="alert alert-info" style={{ marginBottom: 16, fontSize: '.85rem' }}>
              This is the Comp Off type. These rules govern <strong>applying for</strong> comp off leave.
              How comp off days are <strong>earned</strong> is configured under Leave&nbsp;→&nbsp;Comp&nbsp;Off.
            </div>
          )}

          <Section title="Who may apply" note="Leave the designation list empty to allow everyone.">
            <CheckList label="Eligible designations" options={designations.map(d => [d, d])}
              selected={form.eligibleDesignations || []}
              onChange={v => set({ eligibleDesignations: v })}
              empty="No designations configured" />
            <CheckList label="Eligible roles"
              options={[['teacher', 'Teachers'], ['school_admin', 'School Admins']]}
              selected={form.eligibleRoles || []}
              onChange={v => set({ eligibleRoles: v })} />
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Gender restriction</label>
                <select className="form-control" value={form.gender || 'any'}
                  onChange={e => set({ gender: e.target.value })}>
                  {GENDERS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                <div className="form-hint">For maternity / paternity leave</div>
              </div>
              <Num label="Minimum service (days)" value={form.minServiceDays}
                onChange={v => set({ minServiceDays: v })}
                hint="Probation gate, counted from the joining date. 0 = no wait" />
            </div>
          </Section>

          <Section title="Shape of an application" note="0 means no limit.">
            <div className="form-row form-row-3">
              <Num label="Minimum days per application" value={form.minDaysPerApplication}
                onChange={v => set({ minDaysPerApplication: v })} step={0.5} />
              <Num label="Max consecutive days" value={form.maxConsecutiveDays}
                onChange={v => set({ maxConsecutiveDays: v })} step={0.5} />
              <Num label="Advance notice (days)" value={form.advanceNoticeDays}
                onChange={v => set({ advanceNoticeDays: v })}
                hint="Must be applied for this far ahead" />
            </div>
            <Toggle label="Allow back-dated applications" checked={form.allowBackdated}
              onChange={v => set({ allowBackdated: v })}
              hint="Off by default — employees cannot apply for dates already past" />
            {form.allowBackdated && (
              <div style={{ maxWidth: 260 }}>
                <Num label="Back-dated within (days)" value={form.backdatedWithinDays}
                  onChange={v => set({ backdatedWithinDays: v })} hint="0 = no limit" />
              </div>
            )}
          </Section>

          <Section title="How often" note="0 means no cap.">
            <div className="form-row form-row-3">
              <Num label="Max applications per month" value={form.maxApplicationsPerMonth}
                onChange={v => set({ maxApplicationsPerMonth: v })} />
              <Num label="Max days per month" value={form.maxDaysPerMonth}
                onChange={v => set({ maxDaysPerMonth: v })} step={0.5} />
              <Num label="Max applications per year" value={form.maxApplicationsPerYear}
                onChange={v => set({ maxApplicationsPerYear: v })} />
            </div>
          </Section>

          <Section title="Day counting">
            <Toggle label="Half-day allowed" checked={form.halfDayAllowed}
              onChange={v => set({ halfDayAllowed: v })} />
            <Toggle label="Sandwich rule" checked={form.sandwichRule}
              onChange={v => set({ sandwichRule: v })}
              hint="Charges holidays and weekly offs that fall inside the leave — a Friday-to-Monday absence costs 4 days instead of 2" />
          </Section>

          <Section title="Supporting document">
            <Toggle label="Requires a supporting document" checked={form.requiresDocument}
              onChange={v => set({ requiresDocument: v })} />
            {form.requiresDocument && (
              <div style={{ maxWidth: 300 }}>
                <Num label="Required when leave exceeds (days)" value={form.documentRequiredAfterDays}
                  onChange={v => set({ documentRequiredAfterDays: v })}
                  hint="0 = always required" />
              </div>
            )}
          </Section>

          <Section title="Balance">
            <Toggle label="Allow applying beyond the available balance"
              checked={form.allowNegativeBalance} onChange={v => set({ allowNegativeBalance: v })}
              hint="For leave-without-pay style types" />
            {form.allowNegativeBalance && (
              <div style={{ maxWidth: 260 }}>
                <Num label="Maximum overdraft (days)" value={form.maxNegativeDays}
                  onChange={v => set({ maxNegativeDays: v })} step={0.5} hint="0 = unlimited" />
              </div>
            )}
          </Section>

          <Section title="Entitlement mechanics"
            note={`How the ${form.leaveType?.annualAllocation ?? 0}-day annual allocation reaches the balance, rolls over, and is cashed out.`}>
            {isCompOff ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '.82rem', marginTop: 0 }}>
                Comp Off is earned per approved request, so it never accrues on a clock and cannot be allocated.
                Carry forward still applies to whatever is left unused.
              </p>
            ) : (
              <>
                <Toggle label="Accrue monthly instead of allocating up front"
                  checked={form.monthlyAccrual?.enabled}
                  onChange={v => setIn('monthlyAccrual', {
                    enabled: v,
                    // Turning accrual on with 0 days a month is a rule that does
                    // nothing, so seed a sensible figure from the annual
                    // entitlement rather than leave it at a silent no-op.
                    daysPerMonth: v && !(form.monthlyAccrual?.daysPerMonth > 0)
                      ? Math.round(((form.leaveType?.annualAllocation || 0) / 12) * 2) / 2
                      : form.monthlyAccrual?.daysPerMonth,
                  })}
                  hint="The balance starts at 0 and is topped up each month, capped at the annual allocation" />
                {form.monthlyAccrual?.enabled && (
                  <div style={{ maxWidth: 260 }}>
                    <Num label="Days accrued per month" value={form.monthlyAccrual?.daysPerMonth}
                      onChange={v => setIn('monthlyAccrual', { daysPerMonth: v })} step={0.5} />
                    {!(form.monthlyAccrual?.daysPerMonth > 0) && (
                      <div className="form-error">
                        Must be greater than 0 — accrual crediting 0 days a month would never
                        add anything to the balance.
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            <Toggle label="Carry unused days into the next academic year"
              checked={form.carryForward?.enabled}
              onChange={v => setIn('carryForward', { enabled: v })} />
            {form.carryForward?.enabled && (
              <div style={{ maxWidth: 260 }}>
                <Num label="Max days to carry forward" value={form.carryForward?.maxDays}
                  onChange={v => setIn('carryForward', { maxDays: v })} step={0.5}
                  hint="0 = carry everything remaining" />
              </div>
            )}

            <Toggle label="Encashable" checked={form.encashable}
              onChange={v => set({ encashable: v })}
              hint="Unused days of this type can be paid out" />
            {form.encashable && (
              <div style={{ maxWidth: 260 }}>
                <Num label="Max encashable days" value={form.maxEncashableDays}
                  onChange={v => set({ maxEncashableDays: v })} step={0.5} hint="0 = no limit" />
              </div>
            )}
          </Section>

          <Section title="Combining with other leave">
            <Toggle label="May be combined with other leave types"
              checked={form.allowCombineWithOtherLeaves}
              onChange={v => set({ allowCombineWithOtherLeaves: v })}
              hint="When off, this leave cannot sit next to any other type" />
            {form.allowCombineWithOtherLeaves && (
              <CheckList label="…except these types"
                options={otherTypes.map(t => [t._id, `${t.name} (${t.code})`])}
                selected={form.blockedLeaveTypes || []}
                onChange={v => set({ blockedLeaveTypes: v })}
                empty="No other leave types" />
            )}
          </Section>

          <Section title="Approval workflow">
            <div className="form-group" style={{ maxWidth: 300 }}>
              <label className="form-label">Who approves</label>
              <select className="form-control" value={form.approval?.mode || 'admin'}
                onChange={e => setIn('approval', { mode: e.target.value })}>
                <option value="admin">School admins only</option>
                <option value="designation">Specific designations only</option>
                <option value="both">Admins or specific designations</option>
              </select>
            </div>
            {form.approval?.mode !== 'admin' && (
              <CheckList label="Approver designations" options={designations.map(d => [d, d])}
                selected={form.approval?.approverDesignations || []}
                onChange={v => setIn('approval', { approverDesignations: v })}
                empty="No designations configured" />
            )}
          </Section>

          <Section title="Availability">
            <Toggle label="Accepting applications" checked={form.isActive}
              onChange={v => set({ isActive: v })}
              hint="Turning this off suspends new applications for this type without deleting it or its history" />
          </Section>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
            <Button type="submit" loading={saving} disabled={accrualInvalid}>Save Policy</Button>
          </div>
        </form>
      )}
    </div>
  );
}
