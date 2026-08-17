import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/feedback.api';
import { PageHeader, Card, Button, Spinner, Input, Table, Badge, Pagination } from '../../../components/ui/index';
import { Grid } from '../../analytics/viz';
import { fmtDate } from '../shared/kit';

const Toggle = ({ label, hint, value, onChange }) => (
  <label style={{
    display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 0',
    borderBottom: '1px solid var(--border)', cursor: 'pointer',
  }}>
    <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 4 }} />
    <span>
      <span style={{ fontSize: '.88rem', fontWeight: 500 }}>{label}</span>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </span>
  </label>
);

// Module settings + the audit trail (spec §3 Settings, §28).
export default function Settings() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);
  const [audit, setAudit] = useState({ rows: [], page: 1, pages: 1, total: 0 });

  useEffect(() => { api.getSettings().then((r) => setS(r.data ?? r)).catch((e) => toast.error(e.message)); }, []);

  const loadAudit = (page = 1) => {
    api.getAuditLog({ page, limit: 20 }).then((r) => {
      const d = r.data ?? r;
      setAudit({ rows: d.data || [], page: d.page, pages: d.pages, total: d.total });
    }).catch(() => {});
  };
  useEffect(() => { loadAudit(1); }, []);

  const set = (k, v) => setS((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setSaving(true);
    try { setS((await api.updateSettings(s)).data); toast.success('Settings saved'); }
    catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  if (!s) return <div className="page"><div style={{ display: 'flex', justifyContent: 'center', padding: 64 }}><Spinner /></div></div>;

  return (
    <div className="page">
      <PageHeader
        title="Feedback Settings"
        subtitle="Defaults, teacher visibility and reminder behaviour"
        action={<Button onClick={save} loading={saving}>Save settings</Button>}
      />

      <Grid min={330}>
        <Card title="Campaign defaults">
          <Toggle label="Anonymous by default"
            hint="New campaigns hide student identity from teachers unless changed."
            value={s.defaultAnonymous} onChange={(v) => set('defaultAnonymous', v)} />
          <div className="form-row form-row-2" style={{ marginTop: 12 }}>
            <Input label="Default minimum responses" type="number" min={1} value={s.defaultMinimumResponses}
              onChange={(e) => set('defaultMinimumResponses', e.target.value)}
              hint="Below this, teacher analytics stay hidden." />
            <Input label="Default campaign length (days)" type="number" min={1} value={s.defaultCampaignDays}
              onChange={(e) => set('defaultCampaignDays', e.target.value)} />
          </div>
        </Card>

        <Card title="What teachers can see">
          <Toggle label="Teachers can read student comments"
            hint="Aggregated scores always show; written comments can be withheld."
            value={s.teacherCanSeeComments} onChange={(v) => set('teacherCanSeeComments', v)} />
          <Toggle label="Teachers can see historical trends"
            value={s.teacherCanSeeTrends} onChange={(v) => set('teacherCanSeeTrends', v)} />
          <Toggle label="Publish results only after a campaign closes"
            hint="Teachers see nothing while a campaign is still collecting responses."
            value={s.publishToTeachersOnClose} onChange={(v) => set('publishToTeachersOnClose', v)} />
        </Card>

        <Card title="Notifications">
          <Toggle label="Notify students when a campaign starts"
            value={s.notifyOnCampaignStart} onChange={(v) => set('notifyOnCampaignStart', v)} />
          <Toggle label="Send reminders to students who have not responded"
            value={s.notifyReminders} onChange={(v) => set('notifyReminders', v)} />
          <Toggle label="Warn students before a campaign closes"
            value={s.notifyBeforeClose} onChange={(v) => set('notifyBeforeClose', v)} />
          <Toggle label="Confirm to the student after they submit"
            value={s.notifyOnSubmission} onChange={(v) => set('notifyOnSubmission', v)} />
          <Toggle label="Also send by email"
            hint="Uses the school's own SMTP settings when configured."
            value={s.emailNotifications} onChange={(v) => set('emailNotifications', v)} />
          <div className="form-row form-row-2" style={{ marginTop: 12 }}>
            <Input label="Reminder every (days)" type="number" min={1} value={s.reminderIntervalDays}
              onChange={(e) => set('reminderIntervalDays', e.target.value)} />
            <Input label="Closing-soon warning (days before)" type="number" min={1} value={s.closingSoonDays}
              onChange={(e) => set('closingSoonDays', e.target.value)} />
          </div>
        </Card>

        <Card title="Automation">
          <Toggle label="Activate scheduled campaigns automatically"
            hint="A campaign scheduled for a future date goes live on its start date."
            value={s.autoActivateScheduled} onChange={(v) => set('autoActivateScheduled', v)} />
          <Toggle label="Close campaigns automatically at the end date"
            hint="Outstanding assignments are marked expired. No data is deleted."
            value={s.autoCloseExpired} onChange={(v) => set('autoCloseExpired', v)} />
        </Card>
      </Grid>

      <Card title="Activity log" action={<span className="text-xs text-muted">{audit.total} entries</span>}>
        <Table
          columns={[
            { key: 'when', label: 'When', render: (r) => <span className="text-sm">{fmtDate(r.createdAt)}</span> },
            { key: 'user', label: 'By', render: (r) => r.user?.name || 'System' },
            { key: 'actionType', label: 'Action', render: (r) => <Badge variant="info">{r.actionType}</Badge> },
            { key: 'entityType', label: 'Entity' },
            { key: 'description', label: 'Details', render: (r) => <span className="text-sm">{r.description}</span> },
          ]}
          data={audit.rows}
          emptyIcon="🧾"
          emptyTitle="No activity yet"
        />
        <Pagination page={audit.page} pages={audit.pages} total={audit.total} onPage={loadAudit} />
      </Card>
    </div>
  );
}
