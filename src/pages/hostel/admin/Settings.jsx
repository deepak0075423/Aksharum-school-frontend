import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Button, Card, Spinner, Alert } from '../../../components/ui/index';
import { label } from '../shared';

/**
 * Every rule the hostel module enforces is configured here — nothing about
 * capacity, gender, curfew, approvals or fines is hard-coded in a controller
 * (spec §28). Each field below maps 1:1 to a HostelSettings column.
 */
const SECTIONS = [
  {
    title: 'Capacity & allocation', icon: '🛏',
    fields: [
      ['maxHostelCapacity', 'number', 'Maximum hostel capacity', '0 means each hostel\'s own capacity applies'],
      ['maxRoomCapacity', 'number', 'Maximum room capacity', 'A room cannot be created above this'],
      ['enforceGenderRestriction', 'bool', 'Enforce gender restriction', 'Checked before every allocation'],
      ['allowOvercapacityAllocation', 'bool', 'Allow allocation beyond capacity', 'Off keeps rooms and hostels within their limits'],
      ['autoAllocateOnApproval', 'bool', 'Auto-allocate a bed on admission approval'],
      ['allowTransferBetweenHostels', 'bool', 'Allow transfers between hostels'],
      ['transferRequiresApproval', 'bool', 'Transfers need approval'],
      ['allowConcurrentLeaveAndOutpass', 'bool', 'Allow leave and outpass at the same time', 'Off refuses an outpass while a student is on leave'],
    ],
  },
  {
    title: 'Timings & curfew', icon: '🕐',
    fields: [
      ['entryTime', 'time', 'Hostel entry time'],
      ['exitTime', 'time', 'Hostel exit time'],
      ['curfewTime', 'time', 'Curfew', 'Movement after this is flagged and the warden alerted'],
      ['visitorFrom', 'time', 'Visitors from'],
      ['visitorTo', 'time', 'Visitors until'],
      ['visitorDays', 'list', 'Visiting days', 'Comma separated (Sat, Sun) — blank means any day'],
      ['outpassFrom', 'time', 'Outpass window from'],
      ['outpassTo', 'time', 'Outpass window until'],
      ['maxOutpassHours', 'number', 'Maximum outpass length (hours)'],
    ],
  },
  {
    title: 'Late return & fines', icon: '⏰',
    fields: [
      ['lateReturnGraceMinutes', 'number', 'Late-return grace (minutes)'],
      ['lateReturnFine', 'number', 'Late-return fine', 'Above zero raises an invoice automatically'],
      ['overdueAlertAfterMinutes', 'number', 'Mark overdue after (minutes)'],
      ['curfewViolationFine', 'number', 'Curfew violation fine'],
    ],
  },
  {
    title: 'Leave & outpass rules', icon: '🏖',
    fields: [
      ['leaveRequiresParentApproval', 'bool', 'Leave needs parent consent'],
      ['outpassRequiresParentApproval', 'bool', 'Outpass needs a guardian contact'],
      ['maxLeaveDaysPerRequest', 'number', 'Maximum leave days per request'],
      ['minLeaveNoticeDays', 'number', 'Minimum notice (days)'],
      ['maxOpenLeavesPerStudent', 'number', 'Open leave requests per student'],
    ],
  },
  {
    title: 'Attendance', icon: '✅',
    fields: [
      ['attendanceSessions', 'list', 'Roll-call sessions', 'Comma separated: morning, evening, night, roll_call'],
      ['attendanceCorrectionNeedsApproval', 'bool', 'Corrections need approval'],
      ['attendanceCorrectionWindowDays', 'number', 'Correction window (days)'],
    ],
  },
  {
    title: 'Fees', icon: '💳',
    fields: [
      ['autoGenerateMonthlyFees', 'bool', 'Generate monthly fees automatically'],
      ['feeDueDayOfMonth', 'number', 'Fee due day of month'],
      ['lateFeePerDay', 'number', 'Late fee per day'],
      ['lateFeeGraceDays', 'number', 'Late fee grace (days)'],
      ['securityDepositAmount', 'number', 'Default security deposit'],
      ['postToFeeLedger', 'bool', 'Post hostel charges to the school fee ledger', 'Keeps the student\'s overall fee position in one place'],
    ],
  },
  {
    title: 'Admission', icon: '📝',
    fields: [
      ['admissionRequiresApproval', 'bool', 'Applications need approval'],
      ['allowStudentSelfApplication', 'bool', 'Students may apply themselves'],
      ['allowParentApplication', 'bool', 'Parents may apply'],
      ['requiredAdmissionDocuments', 'list', 'Required documents', 'Comma separated'],
    ],
  },
  {
    title: 'Complaints & mess', icon: '📣',
    fields: [
      ['complaintSlaHours', 'number', 'Complaint SLA (hours)'],
      ['complaintAutoEscalate', 'bool', 'Escalate complaints that breach the SLA'],
      ['messAttendanceRequired', 'bool', 'Meal attendance is required'],
      ['messLeaveNoticeHours', 'number', 'Mess leave notice (hours)'],
    ],
  },
  {
    title: 'Notifications', icon: '🔔',
    fields: [
      ['notifyParentOnLeave', 'bool', 'Parents on leave updates'],
      ['notifyParentOnOutpass', 'bool', 'Parents on outpass updates'],
      ['notifyParentOnLateReturn', 'bool', 'Parents on late return'],
      ['notifyParentOnIncident', 'bool', 'Parents on incidents'],
      ['notifyParentOnDiscipline', 'bool', 'Parents on disciplinary action'],
      ['notifyOnFeeDue', 'bool', 'Fee reminders'],
      ['notifyOnVisitor', 'bool', 'Visitor notifications'],
      ['emailNotifications', 'bool', 'Send email as well as in-app'],
    ],
  },
];

export default function Settings() {
  const { data, loading, refetch } = useFetch(api.getSettings, []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data) setForm(data); }, [data]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      delete payload._id; delete payload.school; delete payload.createdAt; delete payload.updatedAt;
      await api.updateSettings(payload);
      toast.success('Hostel settings saved');
      refetch();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  if (loading || !form) return <div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div>;

  const field = ([key, kind, l, hint]) => {
    if (kind === 'bool') {
      return (
        <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '7px 0' }}>
          <input type="checkbox" checked={!!form[key]} onChange={(e) => set(key, e.target.checked)} style={{ marginTop: 3 }} />
          <span>
            <span style={{ fontSize: '.86rem' }}>{l}</span>
            {hint && <span style={{ display: 'block', fontSize: '.74rem', color: 'var(--text-muted)' }}>{hint}</span>}
          </span>
        </label>
      );
    }
    return (
      <div key={key} className="form-group">
        <label className="form-label">{l}</label>
        <input
          className="form-control"
          type={kind === 'number' ? 'number' : kind === 'time' ? 'time' : 'text'}
          min={kind === 'number' ? 0 : undefined}
          value={kind === 'list' ? (form[key] || []).join(', ') : (form[key] ?? '')}
          onChange={(e) => set(key, kind === 'number' ? Number(e.target.value) || 0
            : kind === 'list' ? e.target.value.split(',').map((s) => s.trim()).filter(Boolean)
            : e.target.value)}
        />
        {hint && <div className="form-hint">{hint}</div>}
      </div>
    );
  };

  return (
    <div className="page">
      <PageHeader title="Hostel Settings" subtitle="Every rule the module enforces — nothing is hard-coded"
        action={<Button loading={saving} onClick={save}>Save settings</Button>} />

      <Alert variant="info">
        Changes take effect on the next action. Requests already in flight keep the terms they were
        filed under — a leave that required parent consent still does, even if you switch it off now.
      </Alert>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginTop: 16 }}>
        {SECTIONS.map((s) => (
          <Card key={s.title} title={`${s.icon} ${s.title}`}>
            {s.fields.map(field)}
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <Button loading={saving} onClick={save}>Save settings</Button>
      </div>
    </div>
  );
}
