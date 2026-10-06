/**
 * Settings → Import and → New year (Oct 2026).
 *
 *   ImportPanel    a CSV of allergies, conditions, vaccinations or heights and
 *                  weights: read here, checked row by row on the server
 *                  (nothing written), then imported (services/medicalImport)
 *   RolloverPanel  what the year end leaves behind, with a button for what is
 *                  safe to do in bulk (services/medicalRollover)
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/medical.api';
import { Panel, Btn, Badge, Note, Segmented, Spin, LoadError, ConfirmDialog, useLoad } from '../mdUI';
import { fmtDay, fmtStamp, errorText } from '../mdMeta';

const KINDS = [
  { value: 'allergies', label: 'Allergies' }, { value: 'conditions', label: 'Conditions' },
  { value: 'vaccinations', label: 'Vaccinations' }, { value: 'measurements', label: 'Height & weight' },
];
const what = (kind, v = {}) => {
  if (kind === 'allergies') return `${v.allergen} · ${String(v.category || '').replace(/_/g, ' ')} · ${String(v.severity || '').replace(/_/g, '-')}`;
  if (kind === 'conditions') return `${v.condition} · ${String(v.severity || '')}`;
  if (kind === 'vaccinations') return `${v.vaccine}${v.dose ? ` (${v.dose})` : ''} · ${v.givenOn ? fmtDay(v.givenOn) : '?'}`;
  return `${v.measuredOn ? fmtDay(v.measuredOn) : '?'} · ${v.heightCm ?? '—'} cm · ${v.weightKg ?? '—'} kg`;
};

export function ImportPanel() {
  const [kind, setKind] = useState('allergies');
  const [file, setFile] = useState(null);
  const [csv, setCsv] = useState('');
  const [pre, setPre] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const read = (f) => {
    setFile(f); setPre(null);
    if (!f) { setCsv(''); return; }
    const r = new FileReader();
    r.onload = () => setCsv(String(r.result || ''));
    r.readAsText(f);
  };
  const check = async () => {
    setBusy(true);
    try { const r = await api.previewImport({ kind, csv }); setPre(r?.data ?? r); } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  const go = async () => {
    setBusy(true);
    try {
      const r = await api.commitImport({ kind, csv, fileName: file?.name });
      const x = r?.data ?? r;
      toast.success(`Imported ${x.created}${x.skipped ? ` · ${x.skipped} already on record` : ''}${x.failed.length ? ` · ${x.failed.length} failed` : ''}`);
      setPre(null); setFile(null); setCsv(''); setConfirm(false);
    } catch (e) { toast.error(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <Panel title="Import records" icon="upload" tone="indigo" sub="Bring in the records the school already keeps — a CSV saved from Excel. Each row is checked first; nothing is written until you import. Families are not messaged for imported history.">
      <Segmented value={kind} onChange={(v) => { setKind(v); setPre(null); }} label="What the file holds" options={KINDS} />
      <div className="mdp-tabhead" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
        <Btn size="sm" icon="download" onClick={() => api.downloadFile(api.importTemplateUrl(kind), `medical-${kind}-template.csv`, 'text/csv').catch((e) => toast.error(errorText(e)))}>Download the template</Btn>
        <input type="file" accept=".csv,text/csv" onChange={(e) => read(e.target.files?.[0] || null)} aria-label="CSV file" />
        <Btn size="sm" kind="primary" busy={busy && !pre} disabled={!csv} onClick={check}>Check the file</Btn>
      </div>
      <p className="md-muted" style={{ margin: '8px 0 0' }}>Students are matched by admission number. Dates as YYYY-MM-DD or DD/MM/YYYY.</p>
      {pre ? (
        <>
          <div className="mdrep-sum" style={{ padding: '12px 0', border: 0 }}>
            <div className="md-t-green"><span>Ready to import</span><strong>{pre.counts.ok}</strong></div>
            <div><span>Already on record</span><strong>{pre.counts.skipped}</strong></div>
            <div className="md-t-red"><span>With a problem</span><strong>{pre.counts.errors}</strong></div>
          </div>
          <div className="mdc-readings" style={{ maxHeight: 380, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Line</th><th>Admission no.</th><th>Student</th><th>Record</th><th>Result</th></tr></thead>
              <tbody>
                {pre.rows.slice(0, 500).map((r) => (
                  <tr key={r.line}>
                    <td>{r.line}</td><td>{r.admissionNumber || '—'}</td><td>{r.studentName || '—'}</td>
                    <td className="mdc-readings__note">{what(pre.kind, r.values)}{r.warnings.length ? <em>{r.warnings.join(' · ')}</em> : null}</td>
                    <td className="mdc-readings__note">{r.errors.length ? <Badge tone="red" size="sm">{r.errors.join(' · ')}</Badge> : r.skip ? <Badge tone="slate" size="sm">{r.skip}</Badge> : <Badge tone="green" size="sm">Ready</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mdp-tabhead" style={{ marginTop: 10 }}>
            <Btn kind="primary" icon="upload" disabled={!pre.counts.ok} onClick={() => setConfirm(true)}>Import {pre.counts.ok} row{pre.counts.ok === 1 ? '' : 's'}</Btn>
          </div>
        </>
      ) : null}
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} title={`Import ${pre?.counts.ok || 0} ${(pre?.label || '').toLowerCase()}?`} confirmLabel="Import"
        message="The rows marked Ready are added to the students' Medical Room records, as brought in by you. Rows with a problem, and rows already on record, are left out." onConfirm={go} />
    </Panel>
  );
}

export function RolloverPanel() {
  const r = useLoad(() => api.getRollover(), 'rollover');
  const [ask, setAsk] = useState(null);
  if (r.error && !r.data) return <LoadError error={r.error} onRetry={r.reload} />;
  if (!r.data) return <Spin />;
  const run = async (step) => {
    try { const x = await api.rolloverAct(step.key); toast.success((x?.data ?? x).message || 'Done'); setAsk(null); r.reload(); } catch (e) { toast.error(errorText(e)); }
  };
  return (
    <Panel title={`The start of a new year${r.data.year ? ` — ${r.data.year.name}` : ''}`} icon="calendarCheck" tone="teal"
      sub="What the year end leaves behind. The buttons do only what is safe in bulk; the rest is listed for someone to look at.">
      <div className="mdro">
        {r.data.steps.map((s) => (
          <section key={s.key} className={`mdro-step${s.count ? '' : ' is-done'}`}>
            <div className="mdro-head">
              <Badge tone={s.count ? s.tone : 'green'} size="sm">{s.count ? s.count : 'None'}</Badge>
              <div><b>{s.title}</b><em>{s.about}</em></div>
              {s.action && s.count ? <Btn size="sm" kind="primary" onClick={() => setAsk(s)}>{s.action}</Btn> : null}
            </div>
            {s.rows.length ? (
              <ul className="mdro-rows">
                {s.rows.map((x) => <li key={x._id}><b>{x.studentName}</b> — {x.number || x.medicineName || x.title || x.name || x.label}{x.arrivedAt ? ` · ${fmtStamp(x.arrivedAt)}` : x.createdAt ? ` · ${fmtStamp(x.createdAt)}` : x.endDate ? ` · ended ${fmtDay(x.endDate)}` : x.reviewDue ? ` · review ${fmtDay(x.reviewDue)}` : x.expiresOn ? ` · expires ${fmtDay(x.expiresOn)}` : x.from ? ` · since ${fmtDay(x.from)}` : ''}</li>)}
                {s.count > s.rows.length ? <li className="md-muted">…and {s.count - s.rows.length} more</li> : null}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
      <Note tone="slate" icon="info">Leavers are noted by themselves (Privacy &amp; Records → Former students). Nothing here deletes a record.</Note>
      <ConfirmDialog open={!!ask} onClose={() => setAsk(null)} title={ask ? `${ask.action}?` : ''} confirmLabel={ask?.action || 'Go'} message={ask ? `${ask.title}: ${ask.count}. ${ask.about}` : ''} onConfirm={() => run(ask)} />
    </Panel>
  );
}
