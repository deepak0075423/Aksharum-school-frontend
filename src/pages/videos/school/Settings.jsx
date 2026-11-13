/**
 * Admin → Video Learning → Settings.
 *
 * The school's own choices about notifications: whether teachers hear when a
 * student finishes a video or a chapter, and after how many days a student
 * who has not started is reminded.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { school as api } from '../../../api/video.api';
import { Button, Alert } from '../../../components/ui/index';
import { Head, Panel, Loadable, errText } from '../vlParts';

export default function SchoolVideoSettings() {
  const { data, loading, error, refetch } = useFetch(api.settings);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState('');
  useEffect(() => { if (data) setForm({ ...data }); }, [data]);

  const save = async () => {
    const days = Number(form.reminderAfterDays);
    if (!Number.isInteger(days) || days < 0 || days > 60) return setProblem('Reminder days must be a whole number from 0 to 60');
    setProblem(''); setSaving(true);
    try { await api.saveSettings({ ...form, reminderAfterDays: days }); toast.success('Settings saved'); refetch(); }
    catch (e) { setProblem(errText(e)); }
    finally { setSaving(false); }
  };
  const dirty = form && data && JSON.stringify(form) !== JSON.stringify(data);

  return (
    <div className="page vl-page">
      <Head title="Settings" subtitle="Notifications for Video Learning in your school." />
      <Loadable loading={loading} error={error} onRetry={refetch}>
        {form ? (
          <Panel title="Notifications">
            <div className="vl-stack" style={{ maxWidth: 640 }}>
              {problem ? <Alert variant="danger">{problem}</Alert> : null}
              <label className="vl-row" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={!!form.notifyTeacherOnVideoComplete} onChange={(e) => setForm({ ...form, notifyTeacherOnVideoComplete: e.target.checked })} style={{ marginTop: 4 }} />
                <span><b>Tell the teacher when a student completes a video</b><br /><span className="vl-muted vl-small">One notification per student and video, to the teacher who released it.</span></span>
              </label>
              <label className="vl-row" style={{ alignItems: 'flex-start' }}>
                <input type="checkbox" checked={!!form.notifyTeacherOnChapterComplete} onChange={(e) => setForm({ ...form, notifyTeacherOnChapterComplete: e.target.checked })} style={{ marginTop: 4 }} />
                <span><b>Tell the teacher when a student completes a chapter</b><br /><span className="vl-muted vl-small">Sent once every released video of the chapter is watched.</span></span>
              </label>
              <div className="form-group" style={{ maxWidth: 280, marginBottom: 0 }}>
                <label className="form-label" htmlFor="vl-reminder">Remind students who have not started after (days)</label>
                <input id="vl-reminder" type="number" min="0" max="60" step="1" className="form-control" value={form.reminderAfterDays}
                  onChange={(e) => setForm({ ...form, reminderAfterDays: e.target.value })} />
                <div className="form-hint">Each student is reminded once per release. Enter 0 to switch reminders off.</div>
              </div>
              <div><Button onClick={save} loading={saving} disabled={!dirty}>Save settings</Button></div>
            </div>
          </Panel>
        ) : null}
      </Loadable>
    </div>
  );
}
