/**
 * Vaccinations → Schedule & Coverage (Oct 2026). The school's vaccination
 * schedule against every current student: per dose, how many it applies to,
 * given, exempt, due, overdue and with no record — and, for one dose, the
 * students in each state, with "ask the families" for the ones to chase.
 * Nothing here is stored: it is worked out from dates of birth and records
 * (services/medicalSchedule).
 */
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Page, PageHead, Panel, Btn, Badge, Table, Empty, Spin, LoadError, LineTabs, Toolbar, Note, StudentCell, ConfirmDialog, useLoad, useQueryState } from '../mdUI';
import { fmtDay, errorText } from '../mdMeta';
import { ClassFilter } from './mdList';
import { useMeta } from './mdForms';
import { ExemptionDialog } from '../programmeParts';

const STATUS_TABS = [
  { key: '', label: 'All' }, { key: 'overdue', label: 'Overdue' }, { key: 'due', label: 'Due now' }, { key: 'due_soon', label: 'Due soon' },
  { key: 'no_record', label: 'No record' }, { key: 'exempt', label: 'Exempt' }, { key: 'done', label: 'Given' }, { key: 'unknown', label: 'Date of birth missing' },
];

function TurnOn({ templates, onDone }) {
  const [busy, setBusy] = useState('');
  const choose = async (key) => {
    setBusy(key);
    try { await api.saveMedSettings({ vaccineSchedule: { programme: key, remind: false, entries: [] } }); toast.success('Schedule chosen — reminders stay off until you turn them on in Settings'); onDone(); } catch (e) { toast.error(errorText(e)); } finally { setBusy(''); }
  };
  return (
    <Panel title="Choose the school's vaccination schedule" icon="syringe" tone="green"
      sub="Each child's doses are then worked out from their date of birth and vaccination records. You can change the doses in Settings → Programmes.">
      <Note tone="amber" icon="info">These are the school-age doses of the published schedules — a starting point for your school doctor to check. Families are not told anything until you turn reminders on.</Note>
      <div className="mdpr-templates">
        {(templates || []).map((t) => (
          <div key={t.key} className="mdpr-template">
            <h4>{t.label}</h4>
            <ul>{t.entries.map((e) => <li key={e.key}><b>{e.label}</b><em>{e.window}{e.sex ? ` · ${e.sex === 'female' ? 'girls' : 'boys'}` : ''}</em></li>)}</ul>
            <Btn kind="primary" busy={busy === t.key} onClick={() => choose(t.key)}>Use this schedule</Btn>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default function VaccineCoverage() {
  const nav = useNavigate();
  const { meta } = useMeta();
  const [q, setQ] = useQueryState({ entry: '', status: '', classId: '', sectionId: '' });
  const r = useLoad(() => api.getVaccineCoverage(q), q);
  const [ask, setAsk] = useState(false);
  const [exempt, setExempt] = useState(null);
  const d = r.data;
  if (r.error && !d) return <Page><LoadError error={r.error} onRetry={r.reload} /></Page>;
  if (!d) return <Page><Spin /></Page>;
  if (!d.on) return <Page><TurnOn templates={d.templates} onDone={r.reload} /></Page>;
  const entry = d.entries.find((e) => e.key === d.entry) || d.entries[0];
  const askable = ['due', 'overdue', 'no_record'].includes(d.status);
  const send = async () => {
    try { const out = await api.askVaccineFamilies({ entry: d.entry, status: d.status, classId: q.classId, sectionId: q.sectionId }); const x = out?.data ?? out; toast.success(`${x.told} famil${x.told === 1 ? 'y' : 'ies'} asked${x.skipped ? ` · ${x.skipped} already asked today` : ''}`); }
    catch (e) { toast.error(errorText(e)); }
  };
  return (
    <Page>
      <PageHead icon="syringe" tone="green" title="Schedule & Coverage"
        subtitle={`${d.students} current students against the school's vaccination schedule${d.noDob ? ` — ${d.noDob} have no date of birth, so their doses cannot be worked out` : ''}.`} />
      {!d.remind ? <Note tone="slate" icon="info">Families are not reminded automatically — turn reminders on in Settings → Programmes, or ask them from a list below.</Note> : null}
      <Panel pad={false} title="Doses" icon="syringe" tone="green" right={<Toolbar><ClassFilter meta={meta} q={q} setQ={setQ} /></Toolbar>}>
        <div className="mdc-readings" style={{ border: 0, borderRadius: 0 }}>
          <table>
            <thead><tr><th>Dose</th><th>When</th><th>Applies to</th><th>Given</th><th>Exempt</th><th>Due now</th><th>Overdue</th><th>No record</th><th>Coverage</th></tr></thead>
            <tbody>
              {d.entries.map((e) => (
                <tr key={e.key} className={e.key === d.entry ? 'is-on' : ''} onClick={() => setQ({ entry: e.key })} style={{ cursor: 'pointer' }}>
                  <td><b>{e.label}</b></td><td>{e.window}</td><td>{e.applies}</td><td>{e.done}</td><td>{e.exempt}</td>
                  <td className={e.due ? 'is-warning' : ''}>{e.due}</td><td className={e.overdue ? 'is-critical' : ''}>{e.overdue}</td><td>{e.no_record}</td>
                  <td>{e.coverage === null ? '—' : <Badge tone={e.coverage >= 90 ? 'green' : e.coverage >= 70 ? 'amber' : 'red'} size="sm">{e.coverage}%</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel pad={false} title={entry ? entry.label : 'Students'} sub={entry ? entry.window : ''} icon="users" tone="indigo"
        right={askable ? <Btn kind="primary" icon="send" onClick={() => setAsk(true)} disabled={!d.rows.length}>Ask these families</Btn> : null}>
        <div className="md-listhead"><LineTabs items={STATUS_TABS} value={d.status} onChange={(v) => setQ({ status: v })} /></div>
        <Table rows={d.rows} rowKey="studentId" minWidth={760} onRow={(x) => nav(`/admin/medical/students/${x.studentId}?tab=vaccinations`)}
          columns={[
            { key: 'student', label: 'Student', primary: true, render: (x) => <StudentCell row={x} /> },
            { key: 'dob', label: 'Born', render: (x) => (x.dob ? fmtDay(x.dob) : <span className="md-none">—</span>) },
            { key: 'when', label: 'Due / given', render: (x) => (x.givenOn ? `Given ${fmtDay(x.givenOn)}` : x.dueOn ? `Due ${fmtDay(x.dueOn)}` : '—') },
            { key: 'status', label: 'Status', render: (x) => <Badge tone={x.tone} size="sm">{x.statusLabel}</Badge> },
            { key: 'acts', label: '', align: 'right', stop: true, render: (x) => (!['done', 'exempt', 'unknown'].includes(x.status) ? <Btn size="sm" kind="ghost" onClick={() => setExempt(x)}>Exempt</Btn> : null) },
          ]}
          empty={<Empty compact title="Nobody here">No current student is in this state for this dose.</Empty>} />
        {d.total > d.rows.length ? <p className="md-muted" style={{ padding: '8px 16px' }}>Showing the first {d.rows.length} of {d.total} — narrow it to a class.</p> : null}
      </Panel>
      <ConfirmDialog open={ask} onClose={() => setAsk(false)} title="Ask these families?" confirmLabel="Ask them"
        message={`The families of the ${d.rows.length} student${d.rows.length === 1 ? '' : 's'} listed are asked about ${entry?.label} — to send the certificate if it was given, or to see their doctor. Nobody is asked twice in a day.`}
        onConfirm={async () => { await send(); setAsk(false); }} />
      {exempt ? <ExemptionDialog entry={{ key: exempt.key, vaccine: exempt.vaccine, label: exempt.label }} studentId={exempt.studentId} onClose={() => setExempt(null)} onDone={() => { setExempt(null); r.reload(); }} /> : null}
    </Page>
  );
}
