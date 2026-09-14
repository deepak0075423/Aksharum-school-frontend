/**
 * Teacher Feedback → Settings.
 *
 * Five cards of defaults and one activity log. Nothing here saves as you type:
 * a privacy floor or a visibility switch changed by a stray click, with no way
 * to see it happened, is the one kind of mistake this module cannot afford —
 * so the page tracks what has been edited, names it, and saves on the button.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/feedback.api';
import Icon from '../../../components/ui/icons';
import { Spinner } from '../../../components/ui/index';
import {
  Crumbs, EmptyState, Foot, Hero, NoteBar, NumberField, Panel, Pick,
  Search, Spacer, Table, Tag, Toggle, Toolbar, fmtDate,
} from './fbUI';
import { SETTINGS_DEFAULTS, homeFor, useFeedbackBase } from './feedbackParts';

const ACTION_TONE = {
  create: 'green', update: 'blue', delete: 'red', activate: 'green',
  close: 'amber', archive: 'slate', export: 'purple', seed: 'teal', reopen: 'amber',
};

// Plain-English names for the unsaved-changes line, so the footer names the
// setting rather than the column it lives in.
const LABELS = {
  defaultAnonymous: 'anonymous by default',
  defaultMinimumResponses: 'minimum responses',
  defaultCampaignDays: 'default campaign length',
  teacherCanSeeComments: 'teachers read comments',
  teacherCanSeeTrends: 'teachers see historical trends',
  publishToTeachersOnClose: 'publish only after close',
  notifyOnCampaignStart: 'campaign-start notice',
  notifyReminders: 'reminders',
  reminderIntervalDays: 'reminder interval',
  notifyBeforeClose: 'closing-soon warning',
  closingSoonDays: 'closing-soon lead time',
  notifyOnSubmission: 'submission confirmation',
  emailNotifications: 'email notifications',
  autoActivateScheduled: 'automatic activation',
  autoCloseExpired: 'automatic closing',
};

export default function Settings() {
  const base = useFeedbackBase();

  const [saved, setSaved] = useState(null);   // what the server last confirmed
  const [draft, setDraft] = useState(null);   // what is on screen
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [log, setLog] = useState([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPages, setLogPages] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [logLoading, setLogLoading] = useState(true);
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const logLimit = 10;

  useEffect(() => {
    api.getSettings()
      .then((r) => { const d = r.data ?? r; setSaved(d); setDraft(d); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const d = (await api.getAuditLog({
        page: logPage, limit: logLimit, ...(action ? { actionType: action } : {}),
      })).data;
      setLog(d?.data || []);
      setLogTotal(d?.total || 0);
      setLogPages(d?.pages || 1);
    } catch { /* the log is supporting detail; a failure must not blank the page */ }
    finally { setLogLoading(false); }
  }, [logPage, action]);

  useEffect(() => { loadLog(); }, [loadLog]);
  useEffect(() => {
    const id = setTimeout(() => { setTerm(search.trim().toLowerCase()); setLogPage(1); }, 250);
    return () => clearTimeout(id);
  }, [search]);

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

  /**
   * Which fields differ from what the server last confirmed.
   *
   * Numbers come back from the inputs as strings, so they compare loosely — a
   * reminder interval retyped as the same number is not a change, and a Save
   * button that lights up for it teaches people to ignore it.
   */
  const dirty = useMemo(() => {
    if (!saved || !draft) return [];
    return Object.keys(LABELS).filter((k) => {
      const a = saved[k]; const b = draft[k];
      if (typeof a === 'number' || typeof b === 'number') return Number(a) !== Number(b);
      return a !== b;
    });
  }, [saved, draft]);

  const save = async () => {
    setSaving(true);
    try {
      const d = (await api.updateSettings(draft)).data;
      setSaved(d); setDraft(d);
      toast.success('Settings saved');
      loadLog();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const discard = () => { setDraft(saved); toast('Changes discarded', { icon: '↩️' }); };

  /**
   * Put every field back to the module's own defaults — on screen only. It is
   * still a change like any other: it shows in the unsaved notice and does
   * nothing until Save, so a mis-click here costs one Discard.
   */
  const resetToDefault = () => {
    setDraft((d) => ({ ...d, ...SETTINGS_DEFAULTS }));
    toast('Defaults loaded — review, then save', { icon: '↺' });
  };

  const logRows = useMemo(() => (term
    ? log.filter((r) => `${r.description || ''} ${r.user?.name || ''} ${r.entityType || ''}`
      .toLowerCase().includes(term))
    : log), [log, term]);

  if (loading) return <div className="fbpage"><div className="fbloading"><Spinner /></div></div>;
  if (error || !draft) {
    return (
      <div className="fbpage">
        <Crumbs here="Settings" trail={[{ to: `${base}/overview`, label: 'Teacher Feedback' }]} home={homeFor(base)} />
        <NoteBar tone="red" icon="alert">{error || 'Settings could not be loaded.'}</NoteBar>
      </div>
    );
  }

  return (
    <div className="fbpage">
      <Crumbs here="Settings" trail={[{ to: `${base}/overview`, label: 'Teacher Feedback' }]} home={homeFor(base)} />

      <Hero icon="settings" tone="purple" title="Feedback Settings"
        subtitle="Configure defaults, visibility, notifications and automation for teacher feedback.">
        <button type="button" className="fbtb" onClick={resetToDefault}>
          <Icon name="refresh" size={14} /> Reset to default
        </button>
        <button type="button" className="fbtb fbtb--primary" onClick={save}
          disabled={!dirty.length || saving}>
          <Icon name="checkCircle" size={15} /> {saving ? 'Saving…' : 'Save settings'}
        </button>
      </Hero>


      {!!dirty.length && (
        <NoteBar tone="amber" icon="alert"
          action={(
            <span className="fbacts">
              <button type="button" className="fbtb" onClick={discard}>Discard</button>
              <button type="button" className="fbtb fbtb--primary" onClick={save} disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </button>
            </span>
          )}>
          <b>{dirty.length} unsaved change{dirty.length === 1 ? '' : 's'}</b> — {dirty.map((k) => LABELS[k]).join(', ')}.
          Nothing takes effect until you save, and a campaign already running keeps the settings it started with.
        </NoteBar>
      )}

      <div className="fbgrid fbgrid--3">
        <Panel icon="fileDoc" tone="blue" title="Campaign Defaults"
          subtitle="Default values used when creating a new feedback campaign.">
          <div className="fbfields fbfields--2">
            <div className="fbfield">
              <label>Anonymous by default</label>
              <Toggle label="" value={draft.defaultAnonymous} onChange={(v) => set('defaultAnonymous', v)} />
              <small>Hide student identity from teachers unless changed.</small>
            </div>
            <NumberField label="Minimum responses" min={1} value={draft.defaultMinimumResponses}
              onChange={(v) => set('defaultMinimumResponses', v)}
              hint="Below this, teacher analytics stay hidden." />
          </div>
          <div className="fbfields fbfields--2" style={{ marginTop: 16 }}>
            <NumberField label="Default campaign length (days)" min={1} value={draft.defaultCampaignDays}
              onChange={(v) => set('defaultCampaignDays', v)}
              hint="Length of time a campaign remains active." />
          </div>
        </Panel>

        <Panel icon="eye" tone="green" title="Teacher Visibility"
          subtitle="Control what teachers can see in feedback results.">
          <Toggle label="Teachers can read student comments"
            hint="Aggregated scores always show; written comments can be withheld."
            value={draft.teacherCanSeeComments} onChange={(v) => set('teacherCanSeeComments', v)} />
          <Toggle label="Teachers can see historical trends"
            hint="Allow teachers to view their past feedback data and progress."
            value={draft.teacherCanSeeTrends} onChange={(v) => set('teacherCanSeeTrends', v)} />
          <Toggle label="Publish results only after campaign closes"
            hint="Teachers see nothing while a campaign is still collecting responses."
            value={draft.publishToTeachersOnClose} onChange={(v) => set('publishToTeachersOnClose', v)} />
        </Panel>

        <Panel icon="bell" tone="amber" title="Notifications"
          subtitle="Manage reminders and communication settings.">
          <Toggle label="Notify students when a campaign starts"
            value={draft.notifyOnCampaignStart} onChange={(v) => set('notifyOnCampaignStart', v)} />
          <Toggle label="Send reminders to students who have not responded"
            value={draft.notifyReminders} onChange={(v) => set('notifyReminders', v)} />
          <Toggle label="Warn students before a campaign closes"
            value={draft.notifyBeforeClose} onChange={(v) => set('notifyBeforeClose', v)} />
          <Toggle label="Confirm to the student after they submit"
            value={draft.notifyOnSubmission} onChange={(v) => set('notifyOnSubmission', v)} />
          <Toggle label="Also send by email"
            hint="Uses the school's own SMTP settings when configured."
            value={draft.emailNotifications} onChange={(v) => set('emailNotifications', v)} />
          <div className="fbfields fbfields--2" style={{ marginTop: 14 }}>
            <NumberField label="Reminder every (days)" min={1} value={draft.reminderIntervalDays}
              disabled={!draft.notifyReminders} onChange={(v) => set('reminderIntervalDays', v)} />
            <NumberField label="Closing-soon warning (days before)" min={1} value={draft.closingSoonDays}
              disabled={!draft.notifyBeforeClose} onChange={(v) => set('closingSoonDays', v)} />
          </div>
        </Panel>
      </div>

      <div className="fbgrid fbgrid--2">
        <Panel icon="activity" tone="purple" title="Automation"
          subtitle="Automate campaign lifecycle to reduce manual work.">
          <Toggle label="Activate scheduled campaigns automatically"
            hint="A campaign scheduled for a future date goes live on its start date."
            value={draft.autoActivateScheduled} onChange={(v) => set('autoActivateScheduled', v)} />
          <Toggle label="Close campaigns automatically at the end date"
            hint="Outstanding assignments are marked expired. No data is deleted."
            value={draft.autoCloseExpired} onChange={(v) => set('autoCloseExpired', v)} />
        </Panel>

        {/* Data & Privacy is read-only on purpose: the two things that would
            belong here — a retention sweep and an export permission — have no
            model field and no job behind them, and a switch that silently does
            nothing is worse than no switch. What IS enforced is stated instead. */}
        <Panel icon="key" tone="pink" title="Data & Privacy"
          subtitle="What the module enforces, whatever the settings above say.">
          <ul className="fbrules">
            <li>
              <Icon name="checkCircle" size={15} />
              <span>
                <b>The response floor is absolute.</b> Below <b>{draft.defaultMinimumResponses}</b> responses a
                teacher&rsquo;s figures are hidden from the teacher, the principal and the admin alike — and from
                every Excel, CSV and PDF export.
              </span>
            </li>
            <li>
              <Icon name="checkCircle" size={15} />
              <span>
                <b>No screen pairs a student with an answer.</b> A campaign&rsquo;s tracking tab says who has
                submitted so the school can chase the rest; it never shows what anybody wrote.
              </span>
            </li>
            <li>
              <Icon name="checkCircle" size={15} />
              <span>
                <b>Who reaches this module at all</b> is the Designation permission for Feedback, not a setting
                here — <Link to="/admin/designations">Designations</Link> decides that.
              </span>
            </li>
          </ul>
        </Panel>
      </div>

      <div className="fbcard">
        <Toolbar>
          <span className="fbpanel__icon tint-indigo"><Icon name="clock" size={17} /></span>
          <div className="fbtools__title">
            <b>Activity Log</b>
            <small>Track changes made to feedback settings.</small>
          </div>
          <Spacer />
          <Search value={search} onChange={setSearch} placeholder="Search the log…" />
          <Pick value={action} onChange={(v) => { setAction(v); setLogPage(1); }} all="All actions"
            label="Action" options={Object.keys(ACTION_TONE)} />
        </Toolbar>

        <Table
          loading={logLoading}
          startIndex={(logPage - 1) * logLimit}
          rows={logRows}
          numbered={false}
          columns={[
            {
              key: 'when', label: 'Date & Time',
              render: (r) => (
                <span className="fbdate">
                  {fmtDate(r.createdAt)}, {new Date(r.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }).toUpperCase()}
                </span>
              ),
            },
            { key: 'by', label: 'By', render: (r) => r.user?.name || <span className="fbdash">System</span> },
            {
              key: 'action', label: 'Action',
              render: (r) => <Tag tone={ACTION_TONE[r.actionType] || 'slate'}>{r.actionType}</Tag>,
            },
            { key: 'details', className: 'fbq', label: 'Details', render: (r) => <span className="fbdesc">{r.description}</span> },
          ]}
          empty={(
            <EmptyState icon="🧾"
              title={term || action ? 'Nothing in the log matches' : 'Nothing logged yet'}
              message="Creating a campaign, editing a question or changing a setting all leave an entry here." />
          )}
        />

        <Foot page={logPage} pages={logPages} total={logTotal} limit={logLimit}
          count={logRows.length} noun="entry" plural="entries" onPage={setLogPage} />
      </div>
    </div>
  );
}
