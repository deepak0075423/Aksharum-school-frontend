/**
 * Every dialog the admin Payroll screens open.
 *
 * They live together because several are reachable from more than one screen —
 * "Assign Employee" from both the Assignments list and the Structures rail,
 * "Create Payroll Run" from the dashboard, the runs list and the empty state —
 * and because each one has to agree with the server's validation rather than
 * inventing its own. Where a rule is enforced server-side (one live assignment
 * per employee, a percentage may only cite a component defined above it) the
 * form states the same rule in the same words.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/payroll.api';
import Icon from '../../../components/ui/icons';
import {
  Modal, Drawer, Btn, Field, Row, Select, Search, Check, Toggle, Badge, Avatar, Who, Mark, Glyph,
  Ledger, NetBar, Loading, Empty, Note, IconBtn, Spinner,
  money, isoDay, fmtDate, MONTHS, STRUCTURE_TYPE, COMPONENT_TYPE, CALC_TYPE, PAYMENT_MODE,
} from './prUI';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const err = (e) => toast.error(e?.message || 'Something went wrong');

const yearsAround = (n = 3) => {
  const y = new Date().getFullYear();
  return Array.from({ length: n * 2 + 1 }, (_, i) => y - n + i);
};

/* ── Confirm ──────────────────────────────────────────────────────────────── */

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirm = 'Confirm', danger, glyph = 'bang', note }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={title} glyph={glyph} tone={danger ? 'red' : 'amber'} note={note}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant={danger ? 'danger' : 'primary'} loading={busy} onClick={go}>{confirm}</Btn>
      </>}>
      <p style={{ margin: 0, fontSize: '.9rem', lineHeight: 1.6, color: 'var(--pr-ink-2)' }}>{body}</p>
    </Modal>
  );
}

/* ── Create a payroll run ─────────────────────────────────────────────────── */

export function CreateRunDialog({ open, onClose, onDone, month, year, academicYear }) {
  const [form, setForm] = useState({ month, year, runName: '', notes: '', workingDays: '' });
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm({ month: month || new Date().getMonth() + 1, year: year || new Date().getFullYear(), runName: '', notes: '', workingDays: '' });
    api.getSettings().then(r => setSettings(r.data)).catch(() => {});
  }, [open, month, year]);

  const defaultName = `${MONTHS[num(form.month) - 1] || ''} ${form.year} Payroll`;
  const basis = settings?.workingDaysBasis;
  const basisWord = basis === 'calendar' ? 'the days in the month'
    : basis === 'school' ? 'the school calendar, minus weekly offs and holidays'
    : `a fixed ${settings?.fixedWorkingDays || 26}-day month`;

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.createRun({
        month: num(form.month), year: num(form.year),
        runName: form.runName.trim() || defaultName,
        notes: form.notes.trim(),
        workingDays: form.workingDays ? num(form.workingDays) : undefined,
        academicYear,
      });
      const skipped = res.data?.skipped || [];
      toast.success(`${res.data.runName} created — ${res.data.totalEmployees} employees`);
      if (skipped.length) {
        toast(`${skipped.length} employee${skipped.length === 1 ? ' was' : 's were'} left out. Open the run to see why.`, { icon: '⚠️', duration: 6000 });
      }
      onDone?.(res.data);
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} glyph="plusCircle" title="Create Payroll Run"
      sub="Salaries are computed for every active assignment whose window covers this month."
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} onClick={save}>Create Run</Btn>
      </>}>
      <Row n={2}>
        <Field label="Month" required>
          <Select className="pr-select--block" value={String(form.month)}
            onChange={v => setForm(f => ({ ...f, month: num(v) }))}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </Field>
        <Field label="Year" required>
          <Select className="pr-select--block" value={String(form.year)}
            onChange={v => setForm(f => ({ ...f, year: num(v) }))}
            options={yearsAround().map(y => ({ value: String(y), label: String(y) }))} />
        </Field>
      </Row>
      <Field label="Run name" hint="Leave blank to use the month's name.">
        <input className="pr-input" value={form.runName} placeholder={defaultName}
          onChange={e => setForm(f => ({ ...f, runName: e.target.value }))} />
      </Field>
      <Field label="Working days"
        hint={`Leave blank to use this school's setting — ${basisWord}. A day of unpaid leave costs one working day's pay.`}>
        <input className="pr-input" type="number" min="1" max="31" value={form.workingDays}
          placeholder={settings ? String(settings.fixedWorkingDays || 26) : ''}
          onChange={e => setForm(f => ({ ...f, workingDays: e.target.value }))} />
      </Field>
      <Field label="Notes">
        <textarea className="pr-textarea" rows={2} value={form.notes}
          placeholder="Anything worth recording about this month's payroll"
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
      </Field>
      <Note tone="slate" glyph="info">
        Unpaid leave days are taken from approved leave automatically
        {settings && settings.useLeaveForLop === false ? ' — currently switched off in Payroll settings' : ''}. You can
        override any employee's days on the run itself before it is approved.
      </Note>
    </Modal>
  );
}

/* ── Assign an employee ───────────────────────────────────────────────────── */

export function AssignDialog({ open, onClose, onDone, assignment, academicYear, presetStructure }) {
  const editing = !!assignment;
  const [form, setForm] = useState({});
  const [employees, setEmployees] = useState([]);
  const [structures, setStructures] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(editing ? {
      employeeId: assignment.employee._id,
      structureId: assignment.structure?._id || '',
      annualCtc: String(assignment.ctc || ''),
      effectiveDate: isoDay(assignment.effectiveDate),
      endDate: isoDay(assignment.endDate),
      paymentMode: assignment.paymentMode || 'bank_transfer',
      notes: assignment.notes || '',
    } : {
      employeeId: '', structureId: presetStructure || '', annualCtc: '',
      effectiveDate: isoDay(new Date()), endDate: '', paymentMode: 'bank_transfer', notes: '',
    });
    setSearch('');
    api.getStructures({ tab: 'active', limit: 100 }).then(r => {
      setStructures(r.data || []);
      if (!editing && !presetStructure) {
        const def = (r.data || []).find(s => s.isDefault);
        if (def) setForm(f => ({ ...f, structureId: def._id }));
      }
    }).catch(() => {});
    if (!editing) api.getEmployees({ unassigned: 1 }).then(r => setEmployees(r.data || [])).catch(() => {});
  }, [open, assignment, editing, presetStructure]);

  const structure = structures.find(s => s._id === form.structureId);
  const byRate = structure?.payBasis === 'rate';

  // A live preview of what this CTC pays, so a structure is never picked blind.
  useEffect(() => {
    if (!open || !form.structureId || (!byRate && !num(form.annualCtc))) { setPreview(null); return undefined; }
    let cancelled = false;
    const id = setTimeout(() => {
      api.previewStructure({ structureId: form.structureId, annualCtc: num(form.annualCtc), units: byRate ? 20 : 0 })
        .then(r => { if (!cancelled) setPreview(r.data); })
        .catch(() => { if (!cancelled) setPreview(null); });
    }, 300);
    return () => { cancelled = true; clearTimeout(id); };
  }, [open, form.structureId, form.annualCtc, byRate]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(e => `${e.name} ${e.email} ${e.employeeId} ${e.department}`.toLowerCase().includes(q));
  }, [employees, search]);

  const save = async () => {
    setBusy(true);
    try {
      if (editing) {
        await api.updateAssignment(assignment._id, {
          structureId: form.structureId, effectiveDate: form.effectiveDate,
          endDate: form.endDate || null, paymentMode: form.paymentMode, notes: form.notes,
        });
        toast.success('Assignment updated');
      } else {
        await api.assignEmployee({
          employeeId: form.employeeId, structureId: form.structureId,
          annualCtc: num(form.annualCtc), effectiveDate: form.effectiveDate,
          endDate: form.endDate || null, paymentMode: form.paymentMode, notes: form.notes,
          academicYear,
        });
        toast.success('Employee assigned');
      }
      onDone?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  const chosen = employees.find(e => e._id === form.employeeId);
  const ready = editing
    ? !!form.structureId && !!form.effectiveDate
    : !!form.employeeId && !!form.structureId && !!form.effectiveDate && (byRate || num(form.annualCtc) > 0);

  return (
    <Modal open={open} onClose={onClose} wide={760}
      glyph={editing ? 'pencil' : 'userPlus'} title={editing ? 'Edit Assignment' : 'Assign Employee'}
      sub={editing ? assignment?.employee?.name : 'Put an employee on a salary structure and set what they are paid.'}
      note={editing ? 'The CTC is revised separately, so the salary timeline is never overwritten.' : null}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} disabled={!ready} onClick={save}>
          {editing ? 'Save Changes' : 'Assign Employee'}
        </Btn>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 260px', gap: 20, alignItems: 'start' }}>
        <div>
          {editing ? (
            <div style={{ marginBottom: 14 }}><Who name={assignment.employee.name} sub={assignment.employee.employeeId || assignment.employee.email} size={40} /></div>
          ) : (
            <Field label="Employee" required hint={employees.length === 0 ? 'Everyone already has an active assignment.' : `${filtered.length} without an assignment`}>
              <Search value={search} onChange={setSearch} placeholder="Search by name, code or department…" />
              <div style={{ maxHeight: 190, overflowY: 'auto', marginTop: 8, border: '1px solid var(--pr-line)', borderRadius: 10 }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: 18, textAlign: 'center', fontSize: '.84rem', color: 'var(--pr-muted)' }}>No matching employee</div>
                ) : filtered.map(e => (
                  <button key={e._id} type="button" onClick={() => setForm(f => ({ ...f, employeeId: e._id }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px',
                      border: 0, borderBottom: '1px solid var(--pr-line-2)', textAlign: 'left', cursor: 'pointer',
                      background: form.employeeId === e._id ? 'var(--pr-primary-soft)' : 'none', font: 'inherit',
                    }}>
                    <Avatar name={e.name} size={30} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ display: 'block', fontSize: '.85rem' }}>{e.name}</b>
                      <small style={{ color: 'var(--pr-muted)', fontSize: '.74rem' }}>
                        {[e.employeeId, e.department || 'No department'].filter(Boolean).join(' · ')}
                      </small>
                    </span>
                    {form.employeeId === e._id ? <Icon name="checkCircle" size={17} style={{ color: 'var(--pr-primary)' }} /> : null}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Salary structure" required>
            <Select className="pr-select--block" value={form.structureId} all="— Select a structure —"
              onChange={v => setForm(f => ({ ...f, structureId: v }))}
              options={structures.map(s => ({ value: s._id, label: `${s.name}${s.isDefault ? ' (Default)' : ''}` }))} />
          </Field>

          {byRate ? (
            <Note tone="blue" glyph="info">
              <b>{structure.name}</b> pays {money(structure.rate)} per {structure.rateUnit}. There is no annual CTC —
              enter the units worked on each payroll run.
            </Note>
          ) : (
            <Field label="Annual CTC" required hint={form.annualCtc ? `${money(num(form.annualCtc) / 12)} a month` : 'The full annual cost to the school, including employer contributions.'}>
              <input className="pr-input" type="number" min="0" step="1000" value={form.annualCtc}
                disabled={editing}
                placeholder="600000"
                onChange={e => setForm(f => ({ ...f, annualCtc: e.target.value }))} />
            </Field>
          )}

          <Row n={2}>
            <Field label="Start date" required>
              <input className="pr-input" type="date" value={form.effectiveDate || ''}
                onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} />
            </Field>
            <Field label="End date" hint="Leave blank for open-ended.">
              <input className="pr-input" type="date" value={form.endDate || ''} min={form.effectiveDate || undefined}
                onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </Field>
          </Row>

          <Field label="Payment mode">
            <Select className="pr-select--block" value={form.paymentMode}
              onChange={v => setForm(f => ({ ...f, paymentMode: v }))}
              options={Object.entries(PAYMENT_MODE).map(([value, label]) => ({ value, label }))} />
          </Field>

          {!editing && chosen && !chosen.hasBank && form.paymentMode === 'bank_transfer' && (
            <Note tone="amber" glyph="bang">
              {chosen.name} has no bank account on file, so this row will be left out of the bank transfer file until
              one is added to their employee record.
            </Note>
          )}

          <Field label="Notes">
            <textarea className="pr-textarea" rows={2} value={form.notes || ''}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
        </div>

        <div style={{ position: 'sticky', top: 0 }}>
          <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--pr-muted)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 }}>
            Monthly breakdown
          </div>
          {!preview ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: '.82rem', color: 'var(--pr-muted)', border: '1px dashed var(--pr-line)', borderRadius: 11 }}>
              Pick a structure and a CTC to preview the pay.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Ledger title="Earnings" rows={preview.earnings} total={preview.grossSalary} />
              {preview.deductions.length > 0 && <Ledger title="Deductions" rows={preview.deductions} total={preview.totalDeductions} tone="red" />}
              <NetBar value={preview.netSalary} />
              {preview.employerContributions?.length > 0 && (
                <div style={{ fontSize: '.75rem', color: 'var(--pr-muted)', lineHeight: 1.5 }}>
                  Employer cost {money(preview.employerCost)} on top — total {money(preview.monthlyCost)} a month.
                </div>
              )}
              {!preview.balances && (
                <Note tone="amber" glyph="bang">
                  This structure pays {money(preview.monthlyCost)} against a monthly CTC of {money(preview.monthlyCtc)}
                  {' '}({preview.gap > 0 ? `${money(preview.gap)} unallocated` : `${money(Math.abs(preview.gap))} over`}).
                </Note>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── Bulk assign ──────────────────────────────────────────────────────────── */

export function BulkAssignDialog({ open, onClose, onDone, academicYear }) {
  const [employees, setEmployees] = useState([]);
  const [structures, setStructures] = useState([]);
  const [picked, setPicked] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ structureId: '', annualCtc: '', effectiveDate: isoDay(new Date()) });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPicked([]); setSearch('');
    setForm({ structureId: '', annualCtc: '', effectiveDate: isoDay(new Date()) });
    api.getEmployees({ unassigned: 1 }).then(r => setEmployees(r.data || [])).catch(() => {});
    api.getStructures({ tab: 'active', limit: 100 }).then(r => setStructures(r.data || [])).catch(() => {});
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? employees.filter(e => `${e.name} ${e.employeeId} ${e.department}`.toLowerCase().includes(q)) : employees;
  }, [employees, search]);

  const toggle = (id) => setPicked(p => (p.includes(id) ? p.filter(x => x !== id) : [...p, id]));
  const allOn = filtered.length > 0 && filtered.every(e => picked.includes(e._id));

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.bulkAssign({
        employeeIds: picked, structureId: form.structureId,
        annualCtc: num(form.annualCtc), effectiveDate: form.effectiveDate, academicYear,
      });
      toast.success(`${res.data.created} assigned`);
      if (res.data.rejected?.length) {
        toast(`${res.data.rejected.length} could not be assigned: ${res.data.rejected[0].reason}`, { icon: '⚠️', duration: 6000 });
      }
      onDone?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} glyph="users" title="Assign Several Employees"
      sub="Everyone selected goes on the same structure at the same CTC."
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} disabled={!picked.length || !form.structureId || !num(form.annualCtc)} onClick={save}>
          Assign {picked.length || ''}
        </Btn>
      </>}>
      <Row n={2}>
        <Field label="Salary structure" required>
          <Select className="pr-select--block" value={form.structureId} all="— Select —"
            onChange={v => setForm(f => ({ ...f, structureId: v }))}
            options={structures.map(s => ({ value: s._id, label: s.name }))} />
        </Field>
        <Field label="Annual CTC" required>
          <input className="pr-input" type="number" min="0" step="1000" value={form.annualCtc}
            onChange={e => setForm(f => ({ ...f, annualCtc: e.target.value }))} />
        </Field>
      </Row>
      <Field label="Start date" required>
        <input className="pr-input" type="date" value={form.effectiveDate}
          onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} />
      </Field>
      <Field label={`Employees (${picked.length} selected)`}>
        <Search value={search} onChange={setSearch} placeholder="Search employees…" />
        <div style={{ maxHeight: 230, overflowY: 'auto', marginTop: 8, border: '1px solid var(--pr-line)', borderRadius: 10 }}>
          {filtered.length > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', borderBottom: '1px solid var(--pr-line-2)', background: '#f8fafc', fontSize: '.82rem', fontWeight: 600 }}>
              <Check checked={allOn} onChange={() => setPicked(allOn ? [] : filtered.map(e => e._id))} label="Select all" />
              Select all {filtered.length}
            </label>
          )}
          {filtered.length === 0 ? (
            <div style={{ padding: 18, textAlign: 'center', fontSize: '.84rem', color: 'var(--pr-muted)' }}>
              Everyone already has an active assignment.
            </div>
          ) : filtered.map(e => (
            <label key={e._id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderBottom: '1px solid var(--pr-line-2)', cursor: 'pointer' }}>
              <Check checked={picked.includes(e._id)} onChange={() => toggle(e._id)} label={e.name} />
              <Avatar name={e.name} size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: '.84rem' }}>{e.name}</b>
                <small style={{ color: 'var(--pr-muted)', fontSize: '.73rem' }}>{[e.employeeId, e.department].filter(Boolean).join(' · ') || '—'}</small>
              </span>
            </label>
          ))}
        </div>
      </Field>
    </Modal>
  );
}

/* ── Copy assignments into a new year ─────────────────────────────────────── */

export function CopyAssignmentsDialog({ open, onClose, onDone, years = [], currentYear }) {
  const [form, setForm] = useState({ fromAcademicYear: '', toAcademicYear: '', incrementPercent: '', effectiveDate: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const to = years.find(y => String(y._id) === String(currentYear)) || years[0];
    const from = years.find(y => new Date(y.startDate) < new Date(to?.startDate || Date.now()));
    setForm({
      fromAcademicYear: from?._id || '', toAcademicYear: to?._id || '',
      incrementPercent: '', effectiveDate: to ? isoDay(to.startDate) : '',
    });
  }, [open, years, currentYear]);

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.copyAssignments(form);
      toast.success(`${res.data.created} carried from ${res.data.from} to ${res.data.to}`);
      onDone?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} glyph="copy" title="Copy Assignments"
      sub="Carry last year's assignments forward, optionally with an across-the-board increment."
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} disabled={!form.toAcademicYear} onClick={save}>Copy Assignments</Btn>
      </>}>
      <Row n={2}>
        <Field label="From year" required>
          <Select className="pr-select--block" value={form.fromAcademicYear}
            onChange={v => setForm(f => ({ ...f, fromAcademicYear: v }))}
            options={years.map(y => ({ value: y._id, label: y.yearName }))} />
        </Field>
        <Field label="To year" required>
          <Select className="pr-select--block" value={form.toAcademicYear}
            onChange={v => setForm(f => ({ ...f, toAcademicYear: v }))}
            options={years.map(y => ({ value: y._id, label: y.yearName }))} />
        </Field>
      </Row>
      <Row n={2}>
        <Field label="Increment %" hint="Leave blank to carry the same CTC.">
          <input className="pr-input" type="number" min="0" max="100" step="0.5" value={form.incrementPercent}
            placeholder="0" onChange={e => setForm(f => ({ ...f, incrementPercent: e.target.value }))} />
        </Field>
        <Field label="Effective from" hint="Defaults to the start of the target year.">
          <input className="pr-input" type="date" value={form.effectiveDate}
            onChange={e => setForm(f => ({ ...f, effectiveDate: e.target.value }))} />
        </Field>
      </Row>
      <Note tone="amber" glyph="bang">
        Each employee's current assignment is closed the day before the new one starts, so no month is ever paid twice.
        Anyone who already has an assignment in the target year is left alone.
      </Note>
    </Modal>
  );
}

/* ── Revise CTC ───────────────────────────────────────────────────────────── */

export function ReviseCtcDialog({ open, onClose, onDone, assignment }) {
  const now = new Date();
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!open || !assignment) return;
    setForm({
      incrementType: 'increment_pct', incrementValue: '', annualCtc: String(assignment.ctc || ''),
      effectiveMonth: now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2,
      effectiveYear: now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear(),
      note: '',
    });
    api.getCtcHistory(assignment._id).then(r => setHistory(r.data || [])).catch(() => {});
  }, [open, assignment]);

  const current = num(assignment?.ctc);
  const next = form.incrementType === 'increment_pct'
    ? Math.round(current * (1 + num(form.incrementValue) / 100))
    : form.incrementType === 'increment_value'
      ? current + num(form.incrementValue)
      : num(form.annualCtc);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateCtc(assignment._id, {
        incrementType: form.incrementType,
        incrementValue: num(form.incrementValue),
        annualCtc: num(form.annualCtc),
        effectiveMonth: num(form.effectiveMonth), effectiveYear: num(form.effectiveYear),
        note: form.note,
      });
      toast.success('CTC revised');
      onDone?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} glyph="chartUp" tone="green" title="Revise CTC"
      sub={assignment?.employee?.name}
      note="A revision is a new point on the salary timeline — past months keep the figure they were paid on."
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} disabled={!(next > 0)} onClick={save}>Save Revision</Btn>
      </>}>
      <Field label="How">
        <Select className="pr-select--block" value={form.incrementType}
          onChange={v => setForm(f => ({ ...f, incrementType: v }))}
          options={[
            { value: 'increment_pct', label: 'Percentage increment' },
            { value: 'increment_value', label: 'Flat ₹ increment' },
            { value: 'manual', label: 'Set a new CTC' },
          ]} />
      </Field>
      {form.incrementType === 'manual' ? (
        <Field label="New annual CTC" required>
          <input className="pr-input" type="number" min="0" step="1000" value={form.annualCtc}
            onChange={e => setForm(f => ({ ...f, annualCtc: e.target.value }))} />
        </Field>
      ) : (
        <Field label={form.incrementType === 'increment_pct' ? 'Increment %' : 'Increment ₹'} required>
          <input className="pr-input" type="number" min="0" step={form.incrementType === 'increment_pct' ? '0.5' : '1000'}
            value={form.incrementValue}
            onChange={e => setForm(f => ({ ...f, incrementValue: e.target.value }))} />
        </Field>
      )}

      <div style={{
        display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 11,
        background: 'var(--pr-primary-soft)', border: '1px solid #e0e7ff', marginBottom: 14,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.74rem', color: 'var(--pr-muted)' }}>Current</div>
          <div style={{ fontSize: '1.02rem', fontWeight: 700 }}>{money(current)}</div>
        </div>
        <Icon name="arrowRight" size={18} style={{ color: 'var(--pr-primary)' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.74rem', color: 'var(--pr-muted)' }}>New</div>
          <div style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--pr-primary)' }}>{money(next)}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '.74rem', color: 'var(--pr-muted)' }}>Monthly</div>
          <div style={{ fontSize: '.9rem', fontWeight: 700 }}>{money(next / 12)}</div>
        </div>
      </div>

      <Row n={2}>
        <Field label="Effective from" required>
          <Select className="pr-select--block" value={String(form.effectiveMonth)}
            onChange={v => setForm(f => ({ ...f, effectiveMonth: num(v) }))}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </Field>
        <Field label="Year" required>
          <Select className="pr-select--block" value={String(form.effectiveYear)}
            onChange={v => setForm(f => ({ ...f, effectiveYear: num(v) }))}
            options={yearsAround(2).map(y => ({ value: String(y), label: String(y) }))} />
        </Field>
      </Row>
      <Field label="Note">
        <input className="pr-input" value={form.note || ''} placeholder="Annual appraisal, promotion, …"
          onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
      </Field>

      {history.length > 0 && (
        <>
          <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--pr-muted)', textTransform: 'uppercase', letterSpacing: '.03em', margin: '18px 0 8px' }}>
            Salary timeline
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.83rem' }}>
                <Mark glyph={h.incrementType === 'initial' ? 'plusCircle' : 'chartUp'} tone={h.incrementType === 'initial' ? 'slate' : 'green'} size={28} glyphSize={15} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ display: 'block' }}>{money(h.annualCtc)}</b>
                  <small style={{ color: 'var(--pr-muted)', fontSize: '.74rem' }}>
                    {h.effectiveLabel}{h.note ? ` · ${h.note}` : ''}{h.updatedByName ? ` · ${h.updatedByName}` : ''}
                  </small>
                </span>
                {h.previousCtc > 0 && (
                  <Badge tone={h.annualCtc >= h.previousCtc ? 'green' : 'red'}>
                    {h.annualCtc >= h.previousCtc ? '+' : '−'}{money(Math.abs(h.annualCtc - h.previousCtc))}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ── Edit one entry of a run ──────────────────────────────────────────────── */

export function EntryDrawer({ open, onClose, onDone, runId, entry, run }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const locked = run?.status === 'published' || run?.status === 'cancelled';

  useEffect(() => {
    if (!open || !entry) return;
    setForm({
      lopDays: String(entry.lopDays ?? 0), units: String(entry.units ?? 0),
      arrears: String(entry.arrears ?? 0), bonus: String(entry.bonus ?? 0),
      otherDeductions: String(entry.otherDeductions ?? 0), remarks: entry.remarks || '',
      overtimeHours: String(entry.overtimeHours ?? 0), overtimeRate: String(entry.overtimeRate ?? 0),
    });
  }, [open, entry]);

  if (!entry) return null;

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.updateRunEntry(runId, entry._id, {
        lopDays: num(form.lopDays), units: num(form.units),
        arrears: num(form.arrears), bonus: num(form.bonus),
        otherDeductions: num(form.otherDeductions), remarks: form.remarks,
        overtimeHours: num(form.overtimeHours), overtimeRate: num(form.overtimeRate),
      });
      toast.success('Entry updated');
      onDone?.(res.data);
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  const hold = async () => {
    setBusy(true);
    try {
      const res = await api.holdRunEntry(runId, entry._id, { hold: !entry.isOnHold });
      toast.success(entry.isOnHold ? 'Released back into the run' : 'Held — this person is out of the run totals');
      onDone?.(res.data);
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  const slip = entry.payslip;
  const byRate = num(entry.rate) > 0;

  return (
    <Drawer open={open} onClose={onClose} width={620}
      title={entry.employee.name}
      sub={[entry.employee.employeeId, entry.employee.designation || entry.employee.department].filter(Boolean).join(' · ')}
      glyph="user" tone="indigo"
      status={entry.isOnHold ? <Badge tone="amber">On hold</Badge> : entry.isEdited ? <Badge tone="blue">Edited</Badge> : null}
      footer={locked ? (
        <>
          {slip ? <Btn glyph="download" onClick={() => onDone?.({ download: slip._id })}>Download payslip</Btn> : null}
          <Btn onClick={onClose}>Close</Btn>
        </>
      ) : (
        <>
          <Btn variant={entry.isOnHold ? 'soft' : 'danger'} loading={busy} onClick={hold}>
            {entry.isOnHold ? 'Release' : 'Hold payment'}
          </Btn>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={busy} onClick={save}>Save Entry</Btn>
        </>
      )}>
      {locked && (
        <Note tone="slate" glyph="info">
          This run is {run.status === 'published' ? 'published and locked' : 'cancelled'}. Reverse the publish to change an entry.
        </Note>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        <Badge tone="slate">CTC {money(entry.annualCtc)}</Badge>
        <Badge tone="slate">{entry.paidDays} / {entry.workingDays} paid days</Badge>
        {entry.structure ? <Badge tone="indigo">{entry.structure.name}</Badge> : null}
        {entry.lopSource === 'leave' ? <Badge tone="amber">LOP from approved leave</Badge> : null}
        {entry.lopSource === 'manual' ? <Badge tone="blue">LOP entered by hand</Badge> : null}
      </div>

      {!locked && (
        <>
          <Row n={byRate ? 2 : 1}>
            <Field label="Loss-of-pay days" hint={`Out of ${entry.workingDays} working days. Recomputes every pro-rated line.`}>
              <input className="pr-input" type="number" min="0" max={entry.workingDays} step="0.5" value={form.lopDays}
                onChange={e => setForm(f => ({ ...f, lopDays: e.target.value }))} />
            </Field>
            {byRate && (
              <Field label="Units worked" hint={`At ${money(entry.rate)} each.`}>
                <input className="pr-input" type="number" min="0" step="1" value={form.units}
                  onChange={e => setForm(f => ({ ...f, units: e.target.value }))} />
              </Field>
            )}
          </Row>
          <Row n={3}>
            <Field label="Arrears"><input className="pr-input" type="number" min="0" step="100" value={form.arrears}
              onChange={e => setForm(f => ({ ...f, arrears: e.target.value }))} /></Field>
            <Field label="Bonus"><input className="pr-input" type="number" min="0" step="100" value={form.bonus}
              onChange={e => setForm(f => ({ ...f, bonus: e.target.value }))} /></Field>
            <Field label="Other deductions"><input className="pr-input" type="number" min="0" step="100" value={form.otherDeductions}
              onChange={e => setForm(f => ({ ...f, otherDeductions: e.target.value }))} /></Field>
          </Row>
          <Row n={2}>
            <Field label="Overtime hours" hint="Paid as an earning, so it is taxed like salary.">
              <input className="pr-input" type="number" min="0" step="0.5" value={form.overtimeHours}
                onChange={e => setForm(f => ({ ...f, overtimeHours: e.target.value }))} />
            </Field>
            <Field label="Rate per hour">
              <input className="pr-input" type="number" min="0" step="50" value={form.overtimeRate}
                onChange={e => setForm(f => ({ ...f, overtimeRate: e.target.value }))} />
            </Field>
          </Row>
          <Field label="Remarks" hint="Printed on the payslip.">
            <input className="pr-input" value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} />
          </Field>
        </>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        <Ledger title="Earnings" rows={entry.earnings.map(e => ({
          ...e,
          note: e.fullAmount > e.amount ? `${money(e.fullAmount)} for a full month` : undefined,
        }))} total={entry.grossSalary} />
        {entry.lopAmount > 0 && (
          <div style={{ fontSize: '.8rem', color: '#b45309' }}>
            {entry.lopDays} unpaid {entry.lopDays === 1 ? 'day' : 'days'} reduced the earnings by {money(entry.lopAmount)}.
          </div>
        )}
        <Ledger title="Deductions" rows={[
          ...entry.deductions,
          ...(entry.otherDeductions > 0 ? [{ name: 'Other deductions', amount: entry.otherDeductions }] : []),
        ]} total={entry.totalDeductions + entry.otherDeductions} tone="red" />
        {(entry.arrears > 0 || entry.bonus > 0 || entry.reimbursement > 0) && (
          <Ledger title="Additions" rows={[
            ...(entry.arrears > 0 ? [{ name: 'Arrears', amount: entry.arrears }] : []),
            ...(entry.bonus > 0 ? [{ name: 'Bonus', amount: entry.bonus }] : []),
            ...(entry.reimbursement > 0 ? [{ name: 'Expenses reimbursed', amount: entry.reimbursement, note: 'Not taxable, outside gross' }] : []),
          ]} total={entry.arrears + entry.bonus + entry.reimbursement} />
        )}
        {entry.advanceRecovery > 0 && (
          <Ledger title="Recovered" tone="red" rows={[{ name: 'Advance instalment', amount: entry.advanceRecovery }]}
            total={entry.advanceRecovery} />
        )}
        <NetBar value={entry.netSalary} />
        {entry.unrecovered > 0 && (
          <Note tone="amber" glyph="bang">
            {money(entry.unrecovered)} could not be recovered this month — the net floors at zero rather than going
            negative. It stays outstanding.
          </Note>
        )}
        {entry.employerContributions?.length > 0 && (
          <Ledger title="Employer cost (not deducted)" rows={entry.employerContributions} total={entry.employerCost} />
        )}
      </div>

      {slip && (
        <div style={{ marginTop: 16 }}>
          <Note tone="green" glyph="checkCircle">
            Payslip <b>{slip.slipNo}</b> was issued for this entry.
          </Note>
        </div>
      )}
    </Drawer>
  );
}

/* ── The structure editor ─────────────────────────────────────────────────── */

const blankComponent = (order) => ({
  name: '', code: '', type: 'earning', calculationType: 'fixed',
  value: 0, percentage: 0, percentageOf: 'CTC',
  wageCeiling: 0, capAmount: 0, minAmount: 0,
  proRated: true, taxable: true, order, isActive: true,
});

/**
 * Create or edit a salary structure.
 *
 * The preview on the right is the point of the screen: components are rules,
 * not amounts, and the only way to know a rule set is right is to watch it turn
 * a CTC into a payslip. It calls the server's engine — the same one a payroll
 * run uses — so what is previewed is what will be paid.
 */
export function StructureDialog({ open, onClose, onDone, structure }) {
  const editing = !!structure;
  const [form, setForm] = useState(null);
  const [library, setLibrary] = useState({ components: [], templates: [], types: [] });
  const [busy, setBusy] = useState(false);
  const [sampleCtc, setSampleCtc] = useState(600000);
  const [preview, setPreview] = useState(null);
  const [previewErr, setPreviewErr] = useState('');
  const [openRow, setOpenRow] = useState(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setOpenRow(null); setPicking(false); setPreviewErr('');
    setForm(editing ? {
      name: structure.name, description: structure.description || '',
      type: structure.type || 'general',
      payBasis: structure.payBasis || 'monthly',
      rate: String(structure.rate || ''), rateUnit: structure.rateUnit || 'class',
      isActive: structure.isActive !== false, isDefault: !!structure.isDefault,
      components: (structure.components || []).map((c, i) => ({ ...c, order: c.order ?? i + 1 })),
    } : {
      name: '', description: '', type: 'general', payBasis: 'monthly', rate: '', rateUnit: 'class',
      isActive: true, isDefault: false,
      components: [
        { ...blankComponent(1), name: 'Basic Salary', code: 'BASIC', calculationType: 'percentage', percentage: 50, percentageOf: 'CTC' },
        { ...blankComponent(2), name: 'Special Allowance', code: 'SPL', calculationType: 'balance' },
      ],
    });
    api.getLibrary().then(r => setLibrary(r.data || { components: [], templates: [], types: [] })).catch(() => {});
  }, [open, structure, editing]);

  // Live preview, debounced, against the server's engine.
  useEffect(() => {
    if (!open || !form) return undefined;
    let cancelled = false;
    const id = setTimeout(() => {
      api.previewStructure({
        structure: {
          name: form.name || 'Preview', type: form.type, payBasis: form.payBasis,
          rate: num(form.rate), rateUnit: form.rateUnit, components: form.components,
        },
        annualCtc: sampleCtc,
        units: form.payBasis === 'rate' ? 20 : 0,
      }).then(r => { if (!cancelled) { setPreview(r.data); setPreviewErr(''); } })
        .catch(e => { if (!cancelled) { setPreview(null); setPreviewErr(e.message || 'This structure is not valid yet'); } });
    }, 350);
    return () => { cancelled = true; clearTimeout(id); };
  }, [open, form, sampleCtc]);

  if (!form) return null;

  const setC = (i, patch) => setForm(f => ({
    ...f, components: f.components.map((c, j) => (j === i ? { ...c, ...patch } : c)),
  }));
  const addC = (comp) => setForm(f => ({ ...f, components: [...f.components, { ...blankComponent(f.components.length + 1), ...(comp || {}) }] }));
  const delC = (i) => setForm(f => ({ ...f, components: f.components.filter((_, j) => j !== i).map((c, j) => ({ ...c, order: j + 1 })) }));
  const moveC = (i, delta) => setForm(f => {
    const list = [...f.components];
    const j = i + delta;
    if (j < 0 || j >= list.length) return f;
    [list[i], list[j]] = [list[j], list[i]];
    return { ...f, components: list.map((c, k) => ({ ...c, order: k + 1 })) };
  });

  // The bases a percentage may cite: CTC, or a component defined ABOVE it.
  const basesFor = (i) => ['CTC', ...form.components.slice(0, i).map(c => c.name).filter(Boolean)];

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(), description: form.description.trim(), type: form.type,
        payBasis: form.payBasis, rate: num(form.rate), rateUnit: form.rateUnit,
        components: form.components, isActive: form.isActive, isDefault: form.isDefault,
      };
      const res = editing
        ? await api.updateStructure(structure._id, payload)
        : await api.createStructure(payload);
      toast.success(editing ? 'Structure updated' : 'Structure created');
      if (editing && res.affected > 0) {
        toast(`${res.affected} employee${res.affected === 1 ? '' : 's'} will be paid on the new rules from the next run.`, { icon: 'ℹ️', duration: 6000 });
      }
      onDone?.(res.data);
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} wide={980}
      glyph={editing ? 'pencil' : 'sitemap'} title={editing ? 'Edit Salary Structure' : 'Create Salary Structure'}
      sub="Components are rules, not amounts — the preview shows what they pay at a given CTC."
      note={preview && !preview.balances
        ? `Earnings and employer cost come to ${money(preview.monthlyCost)} against a monthly CTC of ${money(preview.monthlyCtc)}.`
        : null}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} disabled={!form.name.trim() || !form.components.length} onClick={save}>
          {editing ? 'Save Structure' : 'Create Structure'}
        </Btn>
      </>}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 268px', gap: 22, alignItems: 'start' }}>
        <div style={{ minWidth: 0 }}>
          <Row n={2}>
            <Field label="Structure name" required>
              <input className="pr-input" value={form.name} placeholder="Teaching Staff"
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Type">
              <Select className="pr-select--block" value={form.type}
                onChange={v => setForm(f => ({ ...f, type: v }))}
                options={Object.entries(STRUCTURE_TYPE).map(([value, [, label]]) => ({ value, label }))} />
            </Field>
          </Row>
          <Field label="Description">
            <input className="pr-input" value={form.description} placeholder="For all teaching faculty"
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </Field>

          <Field label="Paid by">
            <Row n={form.payBasis === 'rate' ? 3 : 1}>
              <Select className="pr-select--block" value={form.payBasis}
                onChange={v => setForm(f => ({ ...f, payBasis: v }))}
                options={[
                  { value: 'monthly', label: 'Monthly CTC' },
                  { value: 'rate', label: 'Rate per unit (guest faculty)' },
                ]} />
              {form.payBasis === 'rate' && (
                <>
                  <input className="pr-input" type="number" min="0" step="50" value={form.rate} placeholder="800"
                    onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} />
                  <Select className="pr-select--block" value={form.rateUnit}
                    onChange={v => setForm(f => ({ ...f, rateUnit: v }))}
                    options={[{ value: 'class', label: 'per class' }, { value: 'hour', label: 'per hour' }, { value: 'day', label: 'per day' }]} />
                </>
              )}
            </Row>
          </Field>

          <div style={{ display: 'flex', gap: 22, margin: '4px 0 18px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.85rem', fontWeight: 500 }}>
              <Toggle checked={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} label="Active" />
              Active
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: '.85rem', fontWeight: 500 }}>
              <Toggle checked={form.isDefault} onChange={v => setForm(f => ({ ...f, isDefault: v }))} label="Default structure" />
              Offer first when assigning
            </label>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
            <b style={{ fontSize: '.92rem' }}>Components</b>
            <span style={{ fontSize: '.78rem', color: 'var(--pr-muted)' }}>
              resolved top to bottom — a percentage may only cite something above it
            </span>
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <Btn size="sm" icon="plus" onClick={() => setPicking(p => !p)}>From library</Btn>
              <Btn size="sm" variant="soft" icon="plus" onClick={() => addC()}>Add row</Btn>
            </span>
          </div>

          {picking && (
            <div style={{ border: '1px solid var(--pr-line)', borderRadius: 11, padding: 10, marginBottom: 12, maxHeight: 190, overflowY: 'auto' }}>
              {library.components.map(c => (
                <button key={c.name} type="button"
                  onClick={() => { addC({ ...c, order: form.components.length + 1 }); setPicking(false); }}
                  disabled={form.components.some(x => x.name.toLowerCase() === c.name.toLowerCase())}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 8px',
                    border: 0, background: 'none', font: 'inherit', fontSize: '.83rem', textAlign: 'left',
                    borderRadius: 7, cursor: 'pointer',
                    opacity: form.components.some(x => x.name.toLowerCase() === c.name.toLowerCase()) ? .4 : 1,
                  }}>
                  <Badge tone={COMPONENT_TYPE[c.type]?.[0] || 'slate'}>{COMPONENT_TYPE[c.type]?.[1] || c.type}</Badge>
                  <span style={{ flex: 1 }}>{c.name}</span>
                  <small style={{ color: 'var(--pr-muted)' }}>
                    {c.calculationType === 'percentage' ? `${c.percentage}% of ${c.percentageOf}`
                      : c.calculationType === 'balance' ? 'balance of CTC' : money(c.value)}
                  </small>
                </button>
              ))}
            </div>
          )}

          <div className="pr-comphead">
            <span />
            <span>Component</span>
            <span>Type</span>
            <span>Calculation</span>
            <span>Value</span>
            <span />
          </div>

          {form.components.map((c, i) => (
            <React.Fragment key={i}>
              <div className="pr-comp">
                <span className="pr-comp__grip" title="Reorder">
                  <button type="button" onClick={() => moveC(i, -1)} disabled={i === 0} aria-label="Move up"
                    style={{ border: 0, background: 'none', padding: 0, cursor: i === 0 ? 'default' : 'pointer', color: 'inherit', opacity: i === 0 ? .3 : 1 }}>
                    <Icon name="arrowUp" size={13} />
                  </button>
                  <button type="button" onClick={() => moveC(i, 1)} disabled={i === form.components.length - 1} aria-label="Move down"
                    style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', opacity: i === form.components.length - 1 ? .3 : 1 }}>
                    <Icon name="arrowDown" size={13} />
                  </button>
                </span>
                <input className="pr-input" value={c.name} placeholder="Component name"
                  onChange={e => setC(i, { name: e.target.value })} />
                <Select value={c.type} onChange={v => setC(i, { type: v })}
                  options={Object.entries(COMPONENT_TYPE).map(([value, [, label]]) => ({ value, label }))} />
                <Select value={c.calculationType} onChange={v => setC(i, { calculationType: v })}
                  options={Object.entries(CALC_TYPE).map(([value, label]) => ({ value, label }))} />
                {c.calculationType === 'fixed' ? (
                  <input className="pr-input" type="number" min="0" step="100" value={c.value}
                    onChange={e => setC(i, { value: num(e.target.value) })} />
                ) : c.calculationType === 'percentage' ? (
                  <input className="pr-input" type="number" min="0" max="100" step="0.25" value={c.percentage}
                    onChange={e => setC(i, { percentage: num(e.target.value) })} />
                ) : (
                  <span style={{ fontSize: '.78rem', color: 'var(--pr-muted)' }}>residual</span>
                )}
                <span style={{ display: 'flex', gap: 2 }}>
                  <IconBtn icon={openRow === i ? 'chevronDown' : 'sliders'} label="More options" onClick={() => setOpenRow(openRow === i ? null : i)} />
                  <IconBtn glyph="trash" label="Remove" danger onClick={() => delC(i)} />
                </span>
              </div>
              {c.calculationType === 'percentage' && (
                <div className="pr-comp" style={{ borderTop: 0, paddingTop: 0 }}>
                  <span />
                  <span style={{ gridColumn: '2 / 5', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <small style={{ fontSize: '.76rem', color: 'var(--pr-muted)', whiteSpace: 'nowrap' }}>% of</small>
                    <Select className="pr-select--block" value={c.percentageOf}
                      onChange={v => setC(i, { percentageOf: v })}
                      options={basesFor(i).map(b => ({ value: b, label: b === 'CTC' ? 'Monthly CTC' : b }))} />
                  </span>
                </div>
              )}
              {openRow === i && (
                <div className="pr-comp" style={{ borderTop: 0, paddingTop: 0 }}>
                  <span />
                  <div className="pr-compmore">
                    <Field label="Code"><input className="pr-input" value={c.code} placeholder="HRA"
                      onChange={e => setC(i, { code: e.target.value })} /></Field>
                    <Field label="Wage ceiling" hint="Cap the base"><input className="pr-input" type="number" min="0" step="500" value={c.wageCeiling}
                      onChange={e => setC(i, { wageCeiling: num(e.target.value) })} /></Field>
                    <Field label="Max amount"><input className="pr-input" type="number" min="0" step="500" value={c.capAmount}
                      onChange={e => setC(i, { capAmount: num(e.target.value) })} /></Field>
                    <Field label="Reduced by LOP">
                      <div style={{ height: 40, display: 'flex', alignItems: 'center' }}>
                        <Toggle checked={c.proRated !== false} onChange={v => setC(i, { proRated: v })} label="Pro-rated" />
                      </div>
                    </Field>
                  </div>
                </div>
              )}
            </React.Fragment>
          ))}

          {form.components.length === 0 && (
            <div style={{ padding: 22, textAlign: 'center', fontSize: '.85rem', color: 'var(--pr-muted)', border: '1px dashed var(--pr-line)', borderRadius: 11 }}>
              A structure needs at least one earning. Add one from the library, or start a row.
            </div>
          )}
        </div>

        <div style={{ position: 'sticky', top: 0 }}>
          <Field label={form.payBasis === 'rate' ? 'Preview at 20 units' : 'Preview at this CTC'}>
            {form.payBasis === 'rate' ? (
              <div className="pr-input" style={{ display: 'flex', alignItems: 'center', color: 'var(--pr-muted)' }}>
                {money(num(form.rate) * 20)} a month
              </div>
            ) : (
              <input className="pr-input" type="number" min="0" step="60000" value={sampleCtc}
                onChange={e => setSampleCtc(num(e.target.value))} />
            )}
          </Field>
          {previewErr ? (
            <Note tone="amber" glyph="bang">{previewErr}</Note>
          ) : !preview ? (
            <Loading rows={4} />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Ledger title="Earnings" rows={preview.earnings} total={preview.grossSalary} />
              {preview.deductions.length > 0 && <Ledger title="Deductions" rows={preview.deductions} total={preview.totalDeductions} tone="red" />}
              <NetBar value={preview.netSalary} />
              {preview.employerContributions?.length > 0 && (
                <Ledger title="Employer cost" rows={preview.employerContributions} total={preview.employerCost} />
              )}
              <div style={{
                fontSize: '.76rem', lineHeight: 1.5, padding: '9px 11px', borderRadius: 9,
                background: preview.balances ? '#f0fdf4' : '#fffbeb',
                color: preview.balances ? '#166534' : '#92400e',
                border: `1px solid ${preview.balances ? '#bbf7d0' : '#fde68a'}`,
              }}>
                {preview.balances
                  ? `Adds up: gross ${money(preview.grossSalary)} plus employer cost ${money(preview.employerCost)} equals the monthly CTC.`
                  : `Gross plus employer cost is ${money(preview.monthlyCost)}, against a monthly CTC of ${money(preview.monthlyCtc)}. Add a “Balance of CTC” earning to soak up the difference.`}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ── Start from a template ────────────────────────────────────────────────── */

export function TemplateDialog({ open, onClose, onDone }) {
  const [library, setLibrary] = useState({ templates: [] });
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!open) return;
    api.getLibrary().then(r => setLibrary(r.data || { templates: [] })).catch(() => {});
  }, [open]);

  const create = async (key) => {
    setBusy(key);
    try {
      const res = await api.createFromTemplate({ template: key });
      toast.success(`“${res.data.name}” created`);
      onDone?.(res.data);
    } catch (e) { err(e); } finally { setBusy(''); }
  };

  return (
    <Modal open={open} onClose={onClose} glyph="layers" title="Start from a Template"
      sub="A ready-made structure you can edit — each one already adds up to CTC."
      footer={<Btn onClick={onClose}>Close</Btn>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {library.templates.map(t => (
          <div key={t.key} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            border: '1px solid var(--pr-line)', borderRadius: 11,
          }}>
            <Mark glyph="sitemap" tone={STRUCTURE_TYPE[t.type]?.[0] || 'slate'} size={38} glyphSize={19} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: '.9rem' }}>{t.name}</b>
              <small style={{ color: 'var(--pr-muted)', fontSize: '.78rem' }}>
                {t.description} · {t.components} components
                {t.payBasis === 'rate' ? ` · ${money(t.rate)} per class` : ''}
              </small>
            </div>
            <Btn size="sm" variant="soft" loading={busy === t.key} onClick={() => create(t.key)}>Use</Btn>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/* ── Generate a report ────────────────────────────────────────────────────── */

export function GenerateReportDialog({ open, onClose, onDone, types = [], departments = [], month, year, preset }) {
  const [form, setForm] = useState({});
  const [employees, setEmployees] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      type: preset || 'summary', month: month || new Date().getMonth() + 1,
      year: year || new Date().getFullYear(), department: '', employeeId: '', format: 'pdf',
    });
    api.getEmployees({}).then(r => setEmployees(r.data || [])).catch(() => {});
  }, [open, month, year, preset]);

  const meta = types.find(t => t.key === form.type);
  const wantsYear = meta?.period === 'year';

  const save = async () => {
    setBusy(true);
    try {
      const res = await api.generateReport(form);
      toast.success(`${res.data.name} generated`);
      onDone?.(res.data);
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} glyph="bars" title="Generate Report"
      sub="The report is built from the runs in the period, so it always reflects what payroll currently says."
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} onClick={save} glyph="docFill">Generate Report</Btn>
      </>}>
      <Field label="Report type" required>
        <Select className="pr-select--block" value={form.type} onChange={v => setForm(f => ({ ...f, type: v }))}
          options={types.map(t => ({ value: t.key, label: t.label }))} />
        {meta ? <div className="pr-hint">{meta.hint}</div> : null}
      </Field>
      <Row n={2}>
        {!wantsYear && (
          <Field label="Month" required>
            <Select className="pr-select--block" value={String(form.month)}
              onChange={v => setForm(f => ({ ...f, month: num(v) }))}
              options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
          </Field>
        )}
        <Field label="Year" required>
          <Select className="pr-select--block" value={String(form.year)}
            onChange={v => setForm(f => ({ ...f, year: num(v) }))}
            options={yearsAround().map(y => ({ value: String(y), label: String(y) }))} />
        </Field>
      </Row>
      {form.type === 'employee' ? (
        <Field label="Employee" required>
          <Select className="pr-select--block" value={form.employeeId} all="— Select an employee —"
            onChange={v => setForm(f => ({ ...f, employeeId: v }))}
            options={employees.map(e => ({ value: e._id, label: `${e.name}${e.employeeId ? ` (${e.employeeId})` : ''}` }))} />
        </Field>
      ) : (
        <Field label="Department">
          <Select className="pr-select--block" value={form.department} all="All Departments"
            onChange={v => setForm(f => ({ ...f, department: v }))}
            options={departments.map(d => ({ value: d, label: d }))} />
        </Field>
      )}
      <Field label="Format">
        <Select className="pr-select--block" value={form.format} onChange={v => setForm(f => ({ ...f, format: v }))}
          options={[{ value: 'pdf', label: 'PDF' }, { value: 'excel', label: 'Excel (CSV)' }, { value: 'csv', label: 'CSV' }]} />
      </Field>
    </Modal>
  );
}

/* ── Payroll settings ─────────────────────────────────────────────────────── */

export function SettingsDialog({ open, onClose, onDone }) {
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.getSettings().then(r => setForm(r.data)).catch(err);
  }, [open]);

  const save = async () => {
    setBusy(true);
    try {
      await api.updateSettings(form);
      toast.success('Payroll settings saved');
      onDone?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} glyph="gear" title="Payroll Settings"
      sub="How a month is measured, rounded, approved and announced."
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} disabled={!form} onClick={save}>Save Settings</Btn>
      </>}>
      {!form ? <Loading rows={6} /> : (
        <>
          <Row n={2}>
            <Field label="Working days basis" hint="The divisor behind a day's pay.">
              <Select className="pr-select--block" value={form.workingDaysBasis}
                onChange={v => setForm(f => ({ ...f, workingDaysBasis: v }))}
                options={[
                  { value: 'fixed', label: 'Fixed number of days' },
                  { value: 'calendar', label: 'Days in the month' },
                  { value: 'school', label: 'School calendar (minus offs & holidays)' },
                ]} />
            </Field>
            <Field label="Fixed working days" hint={form.workingDaysBasis === 'fixed' ? 'The classic 26-day month.' : 'Used only on the fixed basis.'}>
              <input className="pr-input" type="number" min="1" max="31" value={form.fixedWorkingDays}
                disabled={form.workingDaysBasis !== 'fixed'}
                onChange={e => setForm(f => ({ ...f, fixedWorkingDays: num(e.target.value) }))} />
            </Field>
          </Row>
          {form.workingDaysThisMonth ? (
            <Note tone="slate" glyph="info">This month works out at <b>{form.workingDaysThisMonth} working days</b>.</Note>
          ) : null}
          <Row n={3}>
            <Field label="Pay day" hint="Day of the following month.">
              <input className="pr-input" type="number" min="1" max="28" value={form.payDay}
                onChange={e => setForm(f => ({ ...f, payDay: num(e.target.value) }))} />
            </Field>
            <Field label="Financial year starts">
              <Select className="pr-select--block" value={String(form.financialYearStartMonth)}
                onChange={v => setForm(f => ({ ...f, financialYearStartMonth: num(v) }))}
                options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
            </Field>
            <Field label="Round to">
              <Select className="pr-select--block" value={String(form.roundTo)}
                onChange={v => setForm(f => ({ ...f, roundTo: Number(v) }))}
                options={[
                  { value: '0.01', label: 'Paise' }, { value: '1', label: 'Rupee' },
                  { value: '5', label: '₹5' }, { value: '10', label: '₹10' },
                ]} />
            </Field>
          </Row>
          <Row n={2}>
            <Field label="Payslip prefix">
              <input className="pr-input" value={form.payslipPrefix}
                onChange={e => setForm(f => ({ ...f, payslipPrefix: e.target.value }))} />
            </Field>
            <Field label="School bank account" hint="Printed as the debit account on the bank transfer file.">
              <input className="pr-input" value={form.bankAccountNumber}
                onChange={e => setForm(f => ({ ...f, bankAccountNumber: e.target.value }))} />
            </Field>
          </Row>
          {[
            ['useLeaveForLop', 'Take unpaid leave days from the Leave module', 'Approved unpaid leave becomes loss-of-pay days automatically.'],
            ['requireApproval', 'Require the approve step', 'Off means a reviewed run can be published directly.'],
            ['notifyOnPublish', 'Notify employees when a run is published', 'Sends an in-app notice and an email with the net figure.'],
          ].map(([key, label, hint]) => (
            <label key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderTop: '1px solid var(--pr-line-2)' }}>
              <Toggle checked={form[key]} onChange={v => setForm(f => ({ ...f, [key]: v }))} label={label} />
              <span style={{ flex: 1 }}>
                <b style={{ display: 'block', fontSize: '.86rem', fontWeight: 600 }}>{label}</b>
                <small style={{ color: 'var(--pr-muted)', fontSize: '.78rem' }}>{hint}</small>
              </span>
            </label>
          ))}
        </>
      )}
    </Modal>
  );
}

/* ── Advances and loans ───────────────────────────────────────────────────── */

export function AdvanceDialog({ open, onClose, onDone }) {
  const now = new Date();
  const [form, setForm] = useState({});
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState('');

  useEffect(() => {
    if (!open) return;
    setWarn(''); setSearch('');
    setForm({
      employeeId: '', kind: 'advance', amount: '', instalments: '1',
      startMonth: now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2,
      startYear: now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear(),
      reason: '',
    });
    api.getEmployees({ limit: 200 }).then(r => setEmployees(r.data || [])).catch(() => {});
  }, [open]);

  const chosen = employees.find(e => e._id === form.employeeId);
  const instalment = num(form.amount) > 0 && num(form.instalments) > 0
    ? Math.round(num(form.amount) / num(form.instalments)) : 0;
  const monthly = chosen ? Math.round(num(chosen.ctc) / 12) : 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? employees.filter(e => `${e.name} ${e.employeeId} ${e.department}`.toLowerCase().includes(q)) : employees;
  }, [employees, search]);

  const save = async (force) => {
    setBusy(true);
    try {
      await api.createAdvance({ ...form, amount: num(form.amount), instalments: num(form.instalments), force });
      toast.success(`${form.kind === 'loan' ? 'Loan' : 'Advance'} recorded`);
      onDone?.();
    } catch (e) {
      // The server questions an instalment bigger than a month's pay; offer to
      // confirm rather than making the admin guess what to change.
      if (/more than/i.test(e.message || '')) setWarn(e.message);
      else err(e);
    } finally { setBusy(false); }
  };

  const ready = form.employeeId && num(form.amount) > 0 && num(form.instalments) >= 1;

  return (
    <Modal open={open} onClose={onClose} glyph="rupee" title="Record an Advance"
      sub="Money paid ahead of salary, taken back over one or more months."
      note={instalment > 0 ? `${money(instalment)} a month for ${form.instalments} month${num(form.instalments) === 1 ? '' : 's'}` : null}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        {warn
          ? <Btn variant="danger" loading={busy} onClick={() => save(true)}>Record it anyway</Btn>
          : <Btn variant="primary" loading={busy} disabled={!ready} onClick={() => save(false)}>Record</Btn>}
      </>}>
      <Field label="Employee" required>
        <Search value={search} onChange={setSearch} placeholder="Search by name, code or department…" />
        <div style={{ maxHeight: 170, overflowY: 'auto', marginTop: 8, border: '1px solid var(--pr-line)', borderRadius: 10 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 16, textAlign: 'center', fontSize: '.84rem', color: 'var(--pr-muted)' }}>No matching employee</div>
          ) : filtered.map(e => (
            <button key={e._id} type="button" onClick={() => { setForm(f => ({ ...f, employeeId: e._id })); setWarn(''); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 11px',
                border: 0, borderBottom: '1px solid var(--pr-line-2)', textAlign: 'left', cursor: 'pointer',
                background: form.employeeId === e._id ? 'var(--pr-primary-soft)' : 'none', font: 'inherit',
              }}>
              <Avatar name={e.name} size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: '.84rem' }}>{e.name}</b>
                <small style={{ color: 'var(--pr-muted)', fontSize: '.73rem' }}>
                  {e.ctc > 0 ? `${money(e.ctc / 12)} a month` : 'No salary assigned'}
                </small>
              </span>
              {form.employeeId === e._id ? <Icon name="checkCircle" size={16} style={{ color: 'var(--pr-primary)' }} /> : null}
            </button>
          ))}
        </div>
      </Field>

      <Row n={3}>
        <Field label="Kind">
          <Select className="pr-select--block" value={form.kind} onChange={v => setForm(f => ({ ...f, kind: v }))}
            options={[{ value: 'advance', label: 'Advance' }, { value: 'loan', label: 'Loan' }]} />
        </Field>
        <Field label="Amount" required>
          <input className="pr-input" type="number" min="0" step="1000" value={form.amount}
            onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); setWarn(''); }} />
        </Field>
        <Field label="Instalments" required hint={monthly > 0 && instalment > monthly ? 'More than a month’s pay' : ''}>
          <input className="pr-input" type="number" min="1" max="60" value={form.instalments}
            onChange={e => { setForm(f => ({ ...f, instalments: e.target.value })); setWarn(''); }} />
        </Field>
      </Row>

      <Row n={2}>
        <Field label="Recovery starts" required hint="The first pay month it comes out of.">
          <Select className="pr-select--block" value={String(form.startMonth)}
            onChange={v => setForm(f => ({ ...f, startMonth: num(v) }))}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} />
        </Field>
        <Field label="Year" required>
          <Select className="pr-select--block" value={String(form.startYear)}
            onChange={v => setForm(f => ({ ...f, startYear: num(v) }))}
            options={yearsAround(2).map(y => ({ value: String(y), label: String(y) }))} />
        </Field>
      </Row>

      <Field label="Reason">
        <input className="pr-input" value={form.reason || ''} placeholder="Medical, festival, relocation…"
          onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />
      </Field>

      {warn ? <Note tone="amber" glyph="bang">{warn}</Note> : (
        <Note tone="slate" glyph="info">
          One instalment comes out of each payroll run from the month you chose. If a month cannot bear the whole
          instalment it takes what it can and the rest waits — nobody is ever paid a negative salary.
        </Note>
      )}
    </Modal>
  );
}

/* ── Reimbursement claims ─────────────────────────────────────────────────── */

const CLAIM_CATEGORIES = ['Travel', 'Accommodation', 'Meals', 'Materials', 'Phone & Internet', 'Medical', 'Training', 'Other'];

export function ClaimDialog({ open, onClose, onDone }) {
  const [form, setForm] = useState({});
  const [employees, setEmployees] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({ employeeId: '', category: 'Travel', amount: '', description: '', claimedOn: isoDay(new Date()), approve: true, taxable: false });
    api.getEmployees({ limit: 200 }).then(r => setEmployees(r.data || [])).catch(() => {});
  }, [open]);

  const save = async () => {
    setBusy(true);
    try {
      await api.createClaim({ ...form, amount: num(form.amount) });
      toast.success(form.approve ? 'Claim recorded and approved' : 'Claim recorded');
      onDone?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} glyph="docFill" tone="green" title="New Reimbursement Claim"
      sub="Money an employee spent for the school, paid back through payroll."
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} disabled={!form.employeeId || !(num(form.amount) > 0)} onClick={save}>
          Record Claim
        </Btn>
      </>}>
      <Field label="Employee" required>
        <Select className="pr-select--block" value={form.employeeId} all="— Select an employee —"
          onChange={v => setForm(f => ({ ...f, employeeId: v }))}
          options={employees.map(e => ({ value: e._id, label: `${e.name}${e.employeeId ? ` (${e.employeeId})` : ''}` }))} />
      </Field>
      <Row n={2}>
        <Field label="Category">
          <Select className="pr-select--block" value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))}
            options={CLAIM_CATEGORIES.map(c => ({ value: c, label: c }))} />
        </Field>
        <Field label="Amount" required>
          <input className="pr-input" type="number" min="0" step="100" value={form.amount}
            onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
        </Field>
      </Row>
      <Field label="What was it for" required={false}>
        <input className="pr-input" value={form.description || ''} placeholder="Inter-school meet, lab materials…"
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </Field>
      <Field label="Claimed on">
        <input className="pr-input" type="date" value={form.claimedOn || ''}
          onChange={e => setForm(f => ({ ...f, claimedOn: e.target.value }))} />
      </Field>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderTop: '1px solid var(--pr-line-2)' }}>
        <Toggle checked={form.approve} onChange={v => setForm(f => ({ ...f, approve: v }))} label="Approve now" />
        <span style={{ flex: 1 }}>
          <b style={{ display: 'block', fontSize: '.86rem', fontWeight: 600 }}>Approve now</b>
          <small style={{ color: 'var(--pr-muted)', fontSize: '.78rem' }}>
            You are recording this on their behalf, so there is no second desk for it to wait at. Switch off to leave it pending.
          </small>
        </span>
      </label>
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderTop: '1px solid var(--pr-line-2)' }}>
        <Toggle checked={form.taxable} onChange={v => setForm(f => ({ ...f, taxable: v }))} label="Treat as taxable" />
        <span style={{ flex: 1 }}>
          <b style={{ display: 'block', fontSize: '.86rem', fontWeight: 600 }}>Treat as taxable</b>
          <small style={{ color: 'var(--pr-muted)', fontSize: '.78rem' }}>
            A reimbursement is normally the return of money already spent, so it is not income. Switch on only if this one is.
          </small>
        </span>
      </label>
    </Modal>
  );
}

/* ── Full and final settlement ────────────────────────────────────────────── */

export function SettlementDialog({ open, onClose, onDone, assignment }) {
  const [lastDay, setLastDay] = useState(isoDay(new Date()));
  const [preview, setPreview] = useState(null);
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !assignment) return;
    setNote(''); setRunId('');
    setLastDay(assignment.endDate ? isoDay(assignment.endDate) : isoDay(new Date()));
    api.getPayrollRuns({ status: 'in_progress', limit: 20 })
      .then(r => { setRuns(r.data || []); if (r.data?.[0]) setRunId(r.data[0]._id); })
      .catch(() => {});
  }, [open, assignment]);

  useEffect(() => {
    if (!open || !assignment || !lastDay) return undefined;
    let cancelled = false;
    setLoading(true);
    api.getSettlement(assignment._id, { lastDay })
      .then(r => { if (!cancelled) setPreview(r.data); })
      .catch(e => { if (!cancelled) { setPreview(null); toast.error(e.message); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, assignment, lastDay]);

  const apply = async () => {
    setBusy(true);
    try {
      await api.applySettlement(assignment._id, {
        runId,
        // The final month is already in the run; what is added is everything
        // the employment leaves behind, and what is recovered is the advances.
        addition: (preview.leaveEncashment.amount + preview.gratuity.amount + preview.claims.amount),
        recovery: preview.advances.outstanding,
        lastDay, note,
      });
      toast.success('Settlement applied — the assignment has been closed');
      onDone?.();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  if (!assignment) return null;
  const d = preview;

  return (
    <Modal open={open} onClose={onClose} wide={760} glyph="ban" tone="amber"
      title="Full and Final Settlement" sub={assignment.employee?.name}
      note={d ? `Settlement: ${money(d.settlement)}${d.settlement < 0 ? ' — the employee owes the school' : ''}` : null}
      footer={<>
        <Btn onClick={onClose}>Cancel</Btn>
        <Btn variant="primary" loading={busy} disabled={!d || !runId} onClick={apply}>
          Apply to {runs.find(r => r._id === runId)?.period || 'run'}
        </Btn>
      </>}>
      <Row n={2}>
        <Field label="Last working day" required>
          <input className="pr-input" type="date" value={lastDay} onChange={e => setLastDay(e.target.value)} />
        </Field>
        <Field label="Settle in" required hint="An open run. The final month is already an entry in it.">
          <Select className="pr-select--block" value={runId} all={runs.length ? undefined : '— No open run —'}
            onChange={setRunId}
            options={runs.map(r => ({ value: r._id, label: `${r.runName} (${r.stageLabel})` }))} />
        </Field>
      </Row>

      {loading ? <Loading rows={6} /> : !d ? (
        <Note tone="amber" glyph="bang">Choose a last working day to see what is owed.</Note>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
            <Badge tone="slate">{d.service.years} year{d.service.years === 1 ? '' : 's'} of service</Badge>
            <Badge tone="blue">{d.finalMonth.paidDays} of {d.finalMonth.workingDays} days in {d.finalMonth.label}</Badge>
            {d.gratuity.eligible ? <Badge tone="green">Gratuity due</Badge> : <Badge tone="slate">No gratuity</Badge>}
          </div>

          <Ledger title="Payable" total={d.payable} rows={[
            { name: `${d.finalMonth.label} salary`, amount: d.finalMonth.net, note: `${d.finalMonth.paidDays} of ${d.finalMonth.workingDays} days` },
            { name: 'Leave encashment', amount: d.leaveEncashment.amount, note: d.leaveEncashment.days ? `${d.leaveEncashment.days} days at ${money(d.leaveEncashment.dailyBasic)}` : 'No unused leave' },
            { name: 'Gratuity', amount: d.gratuity.amount, note: d.gratuity.basis },
            { name: 'Approved expenses', amount: d.claims.amount, note: `${d.claims.count} claim${d.claims.count === 1 ? '' : 's'}` },
          ]} />

          <div style={{ marginTop: 12 }}>
            <Ledger title="Recoverable" tone="red" total={d.recoverable} rows={
              d.advances.items.length
                ? d.advances.items.map(a => ({ name: a.kind === 'loan' ? 'Loan balance' : 'Advance balance', amount: a.outstanding, note: `${money(a.recovered)} of ${money(a.amount)} recovered` }))
                : []} />
          </div>

          <div style={{ marginTop: 12 }}>
            <NetBar label={d.settlement >= 0 ? 'Payable on settlement' : 'Recoverable from the employee'}
              value={Math.abs(d.settlement)} />
          </div>

          <div style={{ marginTop: 14 }}>
            <Field label="Note" hint="Printed on the payslip.">
              <input className="pr-input" value={note} placeholder="Full and final settlement"
                onChange={e => setNote(e.target.value)} />
            </Field>
          </div>

          <Note tone="amber" glyph="bang">
            Applying this adds {money(d.leaveEncashment.amount + d.gratuity.amount + d.claims.amount)} and recovers
            {' '}{money(d.advances.outstanding)} on their entry in the chosen run, and ends the assignment on {fmtDate(lastDay)}.
            No later run will pay them.
          </Note>
        </>
      )}
    </Modal>
  );
}
