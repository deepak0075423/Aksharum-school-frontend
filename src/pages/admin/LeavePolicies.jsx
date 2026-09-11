/**
 * Per-leave-type policy editor — the "Policies" tab of pages/admin/Leave.jsx.
 *
 * Pick a leave type on the left, edit its rules on the right. Every type has a
 * policy: an unedited one runs on defaults seeded from the leave type itself
 * and is marked "Default" in the list, so nothing changes until it is saved.
 *
 * The rules are grouped into numbered sections rather than one long form,
 * because they are answers to different questions — who may apply, what an
 * application may look like, how often, how the days are counted — and an
 * admin arrives wanting to change exactly one of them.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { Button, Empty, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  PolicyHead, RuleCard, RuleCheck, RuleList, RuleNum, RulePick, TypeIcon, typeLook,
} from './leaveParts';

const GENDERS = [['any', 'Any'], ['Female', 'Female only'], ['Male', 'Male only']];

export default function AdminLeavePolicies({ onSaved, onAddType }) {
  const { data, loading, refetch } = useFetch(() => api.getLeavePolicies());
  const [picked, setPicked] = useState(null);   // leaveType id, once one is chosen
  const [edits,  setEdits]  = useState(null);   // the edit buffer, once one is typed into
  const [saving, setSaving] = useState(false);

  const policies     = data?.policies     || [];
  const designations = data?.designations || [];
  const leaveTypes   = data?.leaveTypes   || [];

  // Which type is being edited: the one chosen, or the first in the list. Kept
  // as a derived value rather than synced in an effect — an effect would leave
  // the editor blank on the first paint and refill it on the second.
  const selected = (picked && policies.some((p) => p.leaveType._id === picked))
    ? picked
    : policies[0]?.leaveType._id || null;

  const saved = policies.find((p) => p.leaveType._id === selected) || null;
  // The buffer only counts while it belongs to the type on screen; switching
  // type, or a reload landing after a save, falls straight back to the server's
  // copy without anything having to remember to clear it.
  const form = edits && edits.leaveType?._id === selected ? edits : saved;

  const pick  = (id) => { setPicked(id); setEdits(null); };
  const set   = (patch) => setEdits({ ...form, ...patch });
  const setIn = (key, patch) => setEdits({ ...form, [key]: { ...form[key], ...patch } });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateLeavePolicy(selected, form);
      toast.success(`${form.leaveType?.name} policy saved`);
      setEdits(null);   // the refetch below is now the truth
      refetch();
      // The parent renders the allocation and apply forms from the merged type
      // list, which this save just invalidated.
      onSaved?.();
    } catch (err) { toast.error(err?.response?.data?.message || err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="lvtable__state"><Spinner /></div>;

  if (!policies.length) {
    return (
      <section className="card lvcard">
        <div className="lvtable__state">
          <Empty icon="📋" title="No leave types yet"
            message="Create a leave type first — each one gets its own configurable policy."
            action={onAddType ? <Button onClick={onAddType}>+ Add Leave Type</Button> : null} />
        </div>
      </section>
    );
  }

  // The server refuses accrual that credits nothing, so the form does not offer
  // to submit it.
  const accrualInvalid = !!form?.monthlyAccrual?.enabled && !(form.monthlyAccrual.daysPerMonth > 0);
  const isCompOff  = form?.leaveType?.category === 'compoff';
  const otherTypes = leaveTypes.filter((t) => t._id !== selected);

  return (
    <div className="lvpolgrid">
      {/* ── The type picker ─────────────────────────────────────────────────── */}
      <aside className="card lvpolside">
        <header>
          <h3>Leave Types</h3>
          {onAddType && (
            <button type="button" className="lvpolside__add" onClick={onAddType}>
              <Icon name="plus" size={15} /> Add Type
            </button>
          )}
        </header>
        <div className="lvpollist">
          {policies.map((p) => {
            const t = p.leaveType;
            const on = t._id === selected;
            return (
              <button key={t._id} type="button" onClick={() => pick(t._id)}
                className={`lvpolitem${on ? ' is-on' : ''}`} aria-pressed={on}>
                <TypeIcon type={t} />
                <span className="lvpolitem__id">
                  <b>{t.name}</b>
                  <small>{t.code}</small>
                </span>
                {/* "Default" means no policy row has been saved yet — this type
                    still runs on the rules seeded from the type itself. */}
                {!p.saved && <span className="lvpolitem__tag" title="No policy saved — running on defaults">Default</span>}
                {!p.isActive && <span className="lvpolitem__tag is-off" title="Not accepting applications">Off</span>}
                {on && <Icon name="chevronRight" size={16} />}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ── The editor ──────────────────────────────────────────────────────── */}
      {form && (
        <form className="lvpolmain" onSubmit={save}>
          <PolicyHead
            icon={typeLook(form.leaveType).icon}
            tone={typeLook(form.leaveType).tone}
            title={<>{form.leaveType?.name} <em>({form.leaveType?.code})</em></>}
            subtitle={`Configure rules and settings for ${form.leaveType?.name}`}
            active={form.isActive}
            onToggleActive={(v) => set({ isActive: v })}
            activeLabel="Active" offLabel="Inactive"
          >
            <Button type="submit" loading={saving} disabled={accrualInvalid}>Save Policy</Button>
          </PolicyHead>

          {isCompOff && (
            <div className="lvnotice lvnotice--flat">
              <Icon name="alert" size={15} />
              <span>
                This is the Comp Off type. These rules govern <b>applying for</b> comp off leave;
                how comp off days are <b>earned</b> is configured under Leave → Comp Off.
              </span>
            </div>
          )}

          <div className="lvpolsecs">
            <RuleCard n={1} icon="users" tone="indigo" title="Applicability"
              note="Define who can apply for this leave type.">
              <RuleList label="Eligible designations" options={designations.map((d) => [d, d])}
                selected={form.eligibleDesignations || []}
                onChange={(v) => set({ eligibleDesignations: v })}
                empty="No designations configured" />
              <RuleList label="Eligible roles"
                options={[['teacher', 'Teachers'], ['school_admin', 'School Admins']]}
                selected={form.eligibleRoles || []}
                onChange={(v) => set({ eligibleRoles: v })} />
              <div className="lvpolrow lvpolrow--2">
                <RulePick label="Gender restriction" value={form.gender || 'any'}
                  onChange={(v) => set({ gender: v })} options={GENDERS}
                  hint="For maternity / paternity leave" />
                <RuleNum label="Minimum service (days)" value={form.minServiceDays}
                  onChange={(v) => set({ minServiceDays: v })}
                  hint="Probation gate, from the joining date. 0 = no wait" />
              </div>
            </RuleCard>

            <RuleCard n={2} icon="fileCheck" tone="blue" title="Application Rules"
              note="Set limits and conditions for each application.">
              <div className="lvpolrow lvpolrow--3">
                <RuleNum label="Minimum days per application" step={0.5}
                  value={form.minDaysPerApplication}
                  onChange={(v) => set({ minDaysPerApplication: v })} />
                <RuleNum label="Max consecutive days" step={0.5}
                  value={form.maxConsecutiveDays}
                  onChange={(v) => set({ maxConsecutiveDays: v })} />
                <RuleNum label="Advance notice (days)" value={form.advanceNoticeDays}
                  onChange={(v) => set({ advanceNoticeDays: v })}
                  hint="Must be applied for this far ahead" />
              </div>
              <RuleCheck label="Allow back-dated applications" checked={form.allowBackdated}
                onChange={(v) => set({ allowBackdated: v })}
                hint="Off by default — employees cannot apply for dates already past">
                <RuleNum label="Back-dated within (days)" value={form.backdatedWithinDays}
                  onChange={(v) => set({ backdatedWithinDays: v })} hint="0 = no limit" />
              </RuleCheck>
            </RuleCard>

            <RuleCard n={3} icon="clock" tone="green" title="Frequency"
              note="Control how often this leave can be used.">
              <div className="lvpolrow lvpolrow--3">
                <RuleNum label="Max applications per month" value={form.maxApplicationsPerMonth}
                  onChange={(v) => set({ maxApplicationsPerMonth: v })} />
                <RuleNum label="Max days per month" step={0.5} value={form.maxDaysPerMonth}
                  onChange={(v) => set({ maxDaysPerMonth: v })} />
                <RuleNum label="Max applications per year" value={form.maxApplicationsPerYear}
                  onChange={(v) => set({ maxApplicationsPerYear: v })} />
              </div>
              <p className="lvpolnote">0 means no cap.</p>
            </RuleCard>

            <RuleCard n={4} icon="calendarDays" tone="amber" title="Day Counting"
              note="Choose how leave days are calculated.">
              <RuleCheck label="Half-day allowed" checked={form.halfDayAllowed}
                onChange={(v) => set({ halfDayAllowed: v })} />
              <RuleCheck label="Sandwich rule" checked={form.sandwichRule}
                onChange={(v) => set({ sandwichRule: v })}
                hint="Charges holidays and weekly offs that fall inside the leave — a Friday-to-Monday absence costs 4 days instead of 2" />
            </RuleCard>

            <RuleCard n={5} icon="wallet2" tone="pink" title="Balance &amp; Carry Forward"
              note="Control how leave balance is managed.">
              <RuleCheck label="Allow applying beyond the available balance"
                checked={form.allowNegativeBalance}
                onChange={(v) => set({ allowNegativeBalance: v })}
                hint="For leave-without-pay style types">
                <RuleNum label="Maximum overdraft (days)" step={0.5} value={form.maxNegativeDays}
                  onChange={(v) => set({ maxNegativeDays: v })} hint="0 = unlimited" />
              </RuleCheck>
              {/* Without this the only answer to "no balance left but the day
                  must be taken" was to refuse the application outright. */}
              <RuleCheck label="Allow applying beyond the balance as loss of pay"
                checked={form.allowLopBeyondBalance}
                onChange={(v) => set({ allowLopBeyondBalance: v })}
                hint="Days past the available balance are accepted and marked unpaid instead of being refused. Payroll deducts them automatically.">
                <RuleNum label="Max loss-of-pay days per application" step={0.5}
                  value={form.maxLopDaysPerApplication}
                  onChange={(v) => set({ maxLopDaysPerApplication: v })} hint="0 = no limit" />
              </RuleCheck>
            </RuleCard>

            <RuleCard n={6} icon="settings" tone="violet" title="Entitlement Mechanics"
              note="Define how the leave is added and managed.">
              {isCompOff ? (
                <p className="lvpolnote">
                  Comp Off is earned per approved request, so it never accrues on a clock and
                  cannot be allocated. Carry forward still applies to whatever is left unused.
                </p>
              ) : (
                <>
                  <RuleNum label="Days accrued per month" step={0.5}
                    value={form.monthlyAccrual?.daysPerMonth}
                    onChange={(v) => setIn('monthlyAccrual', { daysPerMonth: v })}
                    error={accrualInvalid
                      ? 'Must be greater than 0 — accrual crediting 0 days a month never adds anything.'
                      : undefined}
                    hint={form.monthlyAccrual?.enabled ? undefined : 'Used once monthly accrual is switched on below'} />
                  <RuleCheck label="Accrue monthly instead of allocating up front"
                    checked={form.monthlyAccrual?.enabled}
                    onChange={(v) => setIn('monthlyAccrual', {
                      enabled: v,
                      // Turning accrual on with 0 days a month is a rule that
                      // does nothing, so seed a figure from the annual
                      // entitlement rather than leave a silent no-op.
                      daysPerMonth: v && !(form.monthlyAccrual?.daysPerMonth > 0)
                        ? Math.round(((form.leaveType?.annualAllocation || 0) / 12) * 2) / 2
                        : form.monthlyAccrual?.daysPerMonth,
                    })}
                    hint="The balance starts at 0 and is topped up each month, capped at the annual allocation" />
                </>
              )}
              <RuleCheck label="Carry unused days into the next academic year"
                checked={form.carryForward?.enabled}
                onChange={(v) => setIn('carryForward', { enabled: v })}>
                <RuleNum label="Max days to carry forward" step={0.5} value={form.carryForward?.maxDays}
                  onChange={(v) => setIn('carryForward', { maxDays: v })}
                  hint="0 = carry everything remaining" />
              </RuleCheck>
              {/* Encashment is reported, not paid automatically — the hint says
                  so rather than letting the screen imply a payout that never
                  runs. */}
              <RuleCheck label="Encashable" checked={form.encashable}
                onChange={(v) => set({ encashable: v })}
                hint="Marks unused days as eligible for payout. They are listed on the employee's exit settlement for payroll to action — nothing is paid out automatically.">
                <RuleNum label="Max encashable days" step={0.5} value={form.maxEncashableDays}
                  onChange={(v) => set({ maxEncashableDays: v })} hint="0 = no limit" />
              </RuleCheck>
            </RuleCard>

            <RuleCard n={7} icon="repeat" tone="teal" title="Combining with Other Leave"
              note="Allow or restrict combining this leave with others.">
              <RuleCheck label="May be combined with other leave types"
                checked={form.allowCombineWithOtherLeaves}
                onChange={(v) => set({ allowCombineWithOtherLeaves: v })}
                hint="When off, this leave cannot sit next to any other type">
                <RuleList label="…except these types"
                  options={otherTypes.map((t) => [t._id, `${t.name} (${t.code})`])}
                  selected={form.blockedLeaveTypes || []}
                  onChange={(v) => set({ blockedLeaveTypes: v })}
                  empty="No other leave types" />
              </RuleCheck>
            </RuleCard>

            <RuleCard n={8} icon="checkSquare" tone="indigo" title="Approval Workflow"
              note="Set who approves applications for this leave type.">
              <RulePick label="Who approves" value={form.approval?.mode || 'admin'}
                onChange={(v) => setIn('approval', { mode: v })}
                options={[
                  ['admin', 'School admins only'],
                  ['designation', 'Specific designations only'],
                  ['both', 'Admins or specific designations'],
                ]} />
              {form.approval?.mode !== 'admin' && (
                <RuleList label="Approver designations" options={designations.map((d) => [d, d])}
                  selected={form.approval?.approverDesignations || []}
                  onChange={(v) => setIn('approval', { approverDesignations: v })}
                  empty="No designations configured" />
              )}
            </RuleCard>

            <RuleCard n={9} icon="files" tone="blue" title="Supporting Document"
              note="Require proof for this leave type.">
              <RuleCheck label="Requires a supporting document" checked={form.requiresDocument}
                onChange={(v) => set({ requiresDocument: v })}>
                <RuleNum label="Required when leave exceeds (days)" value={form.documentRequiredAfterDays}
                  onChange={(v) => set({ documentRequiredAfterDays: v })}
                  hint="0 = always required" />
              </RuleCheck>
            </RuleCard>
          </div>

          <div className="lvpolfoot">
            {/* Says what saving will do, because an unsaved type is running on
                defaults and the difference is otherwise invisible. */}
            <span className="lvmuted">
              {form.saved
                ? 'These rules apply to every application for this leave type.'
                : 'Running on defaults — saving pins these rules for this leave type.'}
            </span>
            <Button type="submit" loading={saving} disabled={accrualInvalid}>Save Policy</Button>
          </div>
        </form>
      )}
    </div>
  );
}
