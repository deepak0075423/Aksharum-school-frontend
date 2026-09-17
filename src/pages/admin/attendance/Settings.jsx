/**
 * Admin → Attendance → Settings.
 *
 * How the school registers student attendance:
 *   day      one register per section per day, taken by the class teacher or
 *            vice class teacher
 *   subject  one register per subject for each section per day, taken by that
 *            subject's teacher (or the class / vice class teacher, who covers)
 *
 * The teacher's Mark Students tab follows this setting. Registers already taken
 * are kept whichever way the school switches, and keep counting.
 * Only the school admin can change it (a teacher holding admin on the module
 * sees it read-only — the server refuses the save).
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { useAuth } from '../../../contexts/AuthContext';
import { getAttendanceSettings, saveAttendanceSettings } from '../../../api/admin.api';
import { Button, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { Card, EmptyNote, STATUS, fmtDay } from '../attendanceParts';

const MODES = [
  {
    value: 'day', icon: 'calendar', title: 'Day-wise registration',
    lead: 'One register per section per day.',
    points: [
      'Taken by the class teacher or vice class teacher.',
      'Each school day counts once towards a student’s attendance.',
      'The Mark Students register shows "General / Homeroom".',
    ],
  },
  {
    value: 'subject', icon: 'layers', title: 'Subject-wise registration',
    lead: 'One register for every subject, for each section, each day.',
    points: [
      'Taken by that subject’s teacher; the class and vice class teacher can take any subject.',
      'Attendance % counts every subject register a student attends.',
      'On calendars, a day with some subjects missed shows as a half day.',
    ],
  },
];

const CREDIT = [
  { key: 'present', text: 'counts as a full day attended' },
  { key: 'late', text: 'counts as attended' },
  { key: 'half-day', text: 'counts as half a day attended' },
  { key: 'absent', text: 'counts as not attended' },
];

export default function AttendanceSettings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === 'school_admin';
  const { data, loading, error, refetch } = useFetch(getAttendanceSettings);
  const [mode, setMode] = useState('day');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (data?.registrationMode) setMode(data.registrationMode); }, [data]);

  const saved = data?.registrationMode || 'day';
  const regs = data?.registers || { day: 0, subject: 0 };
  const changing = mode !== saved;
  const leaving = saved === 'day' ? regs.day : regs.subject;

  const save = async () => {
    setSaving(true);
    try {
      await saveAttendanceSettings({ registrationMode: mode });
      toast.success(mode === 'subject' ? 'Attendance is now taken subject-wise' : 'Attendance is now taken day-wise');
      refetch();
    } catch (e) { toast.error(e?.message || 'Could not save the setting'); }
    finally { setSaving(false); }
  };

  if (loading && !data) return <div className="atn-center"><Spinner /></div>;
  if (error) return <EmptyNote icon="alert" title="Settings could not be loaded">{error}</EmptyNote>;

  return (
    <div className="atn-body atn-body--form">
      <Card title="Attendance registration"
        sub="How teachers take student attendance. The Mark Students register follows this choice.">
        <div className="atn-modes" role="radiogroup" aria-label="Registration mode">
          {MODES.map((m) => (
            <button key={m.value} type="button" role="radio" aria-checked={mode === m.value} disabled={!canEdit}
              className={`atn-mode${mode === m.value ? ' is-on' : ''}`} onClick={() => setMode(m.value)}>
              <span className="atn-mode__top">
                <span className="atn-mode__icon"><Icon name={m.icon} size={22} /></span>
                <span className="atn-mode__title">
                  <b>{m.title}</b>
                  {saved === m.value ? <span className="atn-pill atn-pill--green">In use</span> : null}
                </span>
                <span className="atn-mode__radio" aria-hidden>{mode === m.value ? <Icon name="check" size={13} /> : null}</span>
              </span>
              <span className="atn-mode__lead">{m.lead}</span>
              <ul>{m.points.map((p) => <li key={p}>{p}</li>)}</ul>
              <span className="atn-mode__count">
                This year: <b>{(m.value === 'day' ? regs.day : regs.subject).toLocaleString('en-IN')}</b> {m.value === 'day' ? 'day' : 'subject'} registers
                {(m.value === 'day' ? regs.lastDay : regs.lastSubject) ? ` · last ${fmtDay(m.value === 'day' ? regs.lastDay : regs.lastSubject)}` : ''}
              </span>
            </button>
          ))}
        </div>

        {changing && (
          <div className="atn-callout atn-callout--warn atn-modes__note">
            <Icon name="alert" size={17} />
            <span>
              From the moment you save, teachers take {mode === 'subject' ? 'a register for each subject' : 'one register a day per section'}.
              {leaving ? ` The ${leaving.toLocaleString('en-IN')} ${saved}-wise registers already taken this year stay as they are and keep counting.` : ''}
            </span>
          </div>
        )}

        <div className="atn-formfoot">
          {!canEdit && <span className="atn-muted">Only the school admin can change how attendance is registered.</span>}
          {canEdit && changing && <button type="button" className="atn-textbtn" onClick={() => setMode(saved)}>Keep {saved}-wise</button>}
          <Button loading={saving} disabled={!canEdit || !changing} onClick={save}>Save setting</Button>
        </div>
      </Card>

      <aside className="atn-rail">
        <Card title="How marks count">
          <ul className="atn-credit">
            {CREDIT.map((c) => (
              <li key={c.key}><span className={`atn-pill atn-pill--${STATUS[c.key].tone}`}>{STATUS[c.key].label}</span>{c.text}</li>
            ))}
          </ul>
          <p className="atn-muted atn-credit__foot">The same rule is used on every attendance figure — teacher, student, parent and admin screens.</p>
        </Card>
        <Card title="Working days">
          <p className="atn-credit__foot">Which Saturdays the school works and its holidays decide the days a register is expected.</p>
          <button type="button" className="atn-link atn-credit__link" onClick={() => navigate('/admin/school-settings?section=days')}>
            <span className="atn-link__icon"><Icon name="settings" size={16} /></span>
            <span className="atn-link__label">Open working-day settings</span>
            <Icon name="chevronRight" size={16} />
          </button>
        </Card>
      </aside>
    </div>
  );
}
