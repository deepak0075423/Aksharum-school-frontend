import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { PageHeader, Button, Card, Spinner, Alert, Empty } from '../../../components/ui/index';
import { SEVERITY_META, CONFLICT_LABELS, Stat } from './shared';

/* Options exactly as the module spec lists them, mapped to solver weights. */
const OPTIONS = [
  ['avoidSameSubjectTwiceADay', 'Avoid the same subject twice in one day'],
  ['balanceDifficultSubjects',  'Balance difficult subjects across the day'],
  ['minimizeTeacherGaps',       'Minimise teacher free gaps'],
  ['minimizeStudentGaps',       'Minimise student free gaps'],
  ['preferTeacherAvailability', 'Prefer teacher availability & preferences'],
  ['keepPracticalsConsecutive', 'Keep practical periods consecutive'],
  ['spreadAcrossWeek',          'Spread subjects evenly across the week'],
];

const defaultOptions = Object.fromEntries(OPTIONS.map(([k]) => [k, true]));

export default function TimetableGenerate() {
  const navigate = useNavigate();

  const [meta, setMeta]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [yearId, setYearId]     = useState('');
  const [scopeType, setScope]   = useState('single');
  const [classId, setClassId]   = useState('');
  const [sectionIds, setSecIds] = useState([]);
  const [classIds, setClassIds] = useState([]);
  const [label, setLabel]       = useState('');
  const [options, setOptions]   = useState(defaultOptions);

  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState(null);   // { status, progress, stats, errorCount… }
  const [versionId, setVersionId] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const pollRef = useRef(null);

  /* ── Load dropdown data ────────────────────────────────────────────────── */
  const loadMeta = useCallback(async (yid) => {
    setLoading(true);
    try {
      const res = await api.getMeta(yid);
      const d = res.data ?? res;
      setMeta(d);
      if (!yid) setYearId(d.selectedYearId || '');
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => () => clearInterval(pollRef.current), []);

  const classes = meta?.classes || [];
  const selectedClass = classes.find(c => c._id === classId);
  const sectionsOfSelected = selectedClass?.sections || [];
  const totalSections = classes.reduce((n, c) => n + (c.sections?.length || 0), 0);

  const scopeCount =
    scopeType === 'school'   ? totalSections
    : scopeType === 'multiple' ? (sectionIds.length || classes.filter(c => classIds.includes(c._id)).reduce((n, c) => n + (c.sections?.length || 0), 0))
    : (sectionIds.length ? 1 : 0);

  /* ── Poll while the solver runs ────────────────────────────────────────── */
  const startPolling = (id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.getProgress(id);
        const d = res.data ?? res;
        setProgress(d);
        if (d.status !== 'generating') {
          clearInterval(pollRef.current);
          if (d.status === 'failed') {
            toast.error('Generation failed');
          } else if (d.errorCount > 0) {
            toast('Timetable generated with conflicts', { icon: '⚠️' });
            const c = await api.getConflicts(id);
            setConflicts((c.data ?? c).conflicts || []);
          } else {
            toast.success('Timetable generated successfully');
          }
        }
      } catch (e) {
        clearInterval(pollRef.current);
        toast.error(e.message);
      }
    }, 700);
  };

  const start = async () => {
    if (!yearId) return toast.error('Select an academic year');
    if (scopeType === 'single' && sectionIds.length !== 1) return toast.error('Select a class and section');
    if (scopeType === 'multiple' && !sectionIds.length && !classIds.length) return toast.error('Select at least one class or section');

    setStarting(true);
    setConflicts([]);
    try {
      const res = await api.generate({
        yearId, scopeType, label: label || undefined,
        sectionIds: scopeType === 'school' ? [] : sectionIds,
        classIds: scopeType === 'multiple' ? classIds : [],
        options,
      });
      const d = res.data ?? res;
      setVersionId(d.versionId);
      setProgress({ status: 'generating', progress: d.progress });
      startPolling(d.versionId);
    } catch (e) {
      if (e.status === 409 && e.data?.data?.versionId) {
        toast.error(e.message);
        setVersionId(e.data.data.versionId);
        setProgress({ status: 'generating', progress: { percent: 0, steps: [] } });
        startPolling(e.data.data.versionId);
      } else {
        toast.error(e.message);
      }
    } finally { setStarting(false); }
  };

  const reset = () => {
    clearInterval(pollRef.current);
    setProgress(null); setVersionId(null); setConflicts([]);
  };

  if (loading) return <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>;

  /* ══ RESULT / PROGRESS ══════════════════════════════════════════════════ */
  if (progress) {
    const p = progress.progress || {};
    const running  = progress.status === 'generating';
    const failed   = progress.status === 'failed';
    const conflicted = progress.errorCount > 0;
    const stats = progress.stats || {};

    return (
      <div className="page">
        <PageHeader
          title={running ? 'Generating Timetable…' : failed ? 'Generation Failed' : conflicted ? 'Generated with Conflicts' : 'Timetable Generated'}
          subtitle={running ? 'This runs on the server — you can leave this page and come back.' : progress.label}
          action={!running && <Button variant="secondary" onClick={reset}>← New Generation</Button>}
        />

        <Card>
          {/* Step list */}
          <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
            {(p.steps || []).map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '.85rem' }}>
                <span style={{ width: 18, textAlign: 'center' }}>
                  {s.status === 'done' ? <span style={{ color: 'var(--success)' }}>✓</span>
                    : s.status === 'active' ? <Spinner size="sm" />
                    : <span style={{ color: 'var(--text-light)' }}>○</span>}
                </span>
                <span style={{ color: s.status === 'pending' ? 'var(--text-light)' : 'var(--text)', fontWeight: s.status === 'active' ? 600 : 400 }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ background: 'var(--bg)', borderRadius: 99, height: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <div style={{
              width: `${p.percent || 0}%`, height: '100%',
              background: failed ? 'var(--danger)' : conflicted ? 'var(--warning)' : 'var(--primary)',
              transition: 'width .3s ease',
            }} />
          </div>
          <div style={{ textAlign: 'right', fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 6 }}>
            Progress: {p.percent || 0}%
          </div>

          {failed && <Alert variant="danger">Unable to generate a complete timetable. {p.error}</Alert>}

          {!running && !failed && (
            <>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                <Stat label="Classes"   value={stats.classesProcessed ?? '—'} />
                <Stat label="Teachers"  value={stats.teachersProcessed ?? '—'} />
                <Stat label="Subjects"  value={stats.subjectsProcessed ?? '—'} />
                <Stat label="Slots"     value={stats.periodsProcessed ?? '—'} />
                <Stat label="Entries"   value={stats.entriesGenerated ?? '—'} />
                <Stat label="Conflicts" value={progress.conflictCount ?? 0} tone={progress.errorCount ? 'var(--danger)' : 'var(--success)'} />
                <Stat label="Time"      value={stats.generationTimeMs != null ? `${(stats.generationTimeMs / 1000).toFixed(1)}s` : '—'} />
              </div>

              {conflicted
                ? <Alert variant="warning">
                    <strong>Timetable generated with conflicts.</strong> {progress.errorCount} issue(s) must be resolved before this version can be published.
                  </Alert>
                : <Alert variant="success"><strong>Timetable generated successfully.</strong> Preview it, adjust anything by hand, then publish.</Alert>}

              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <Button onClick={() => navigate(`/admin/timetable/versions/${versionId}`)}>Preview Timetable →</Button>
                {conflicted && <Button variant="secondary" onClick={() => navigate(`/admin/timetable/versions/${versionId}?tab=conflicts`)}>View Conflicts</Button>}
                <Button variant="secondary" onClick={() => navigate('/admin/timetable/requirements')}>Adjust Configuration</Button>
                <Button variant="secondary" onClick={() => { reset(); }}>Generate Again</Button>
              </div>
            </>
          )}
        </Card>

        {conflicts.length > 0 && (
          <Card title={`${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} found`}>
            <div style={{ display: 'grid', gap: 8 }}>
              {conflicts.slice(0, 15).map((c, i) => {
                const sev = SEVERITY_META[c.severity] || SEVERITY_META.INFO;
                return (
                  <div key={c._id || i} style={{ background: sev.bg, borderLeft: `3px solid ${sev.color}`, borderRadius: 6, padding: '8px 12px' }}>
                    <div style={{ fontSize: '.78rem', fontWeight: 700, color: sev.color }}>
                      {sev.icon} {i + 1}. {CONFLICT_LABELS[c.type] || c.type}
                    </div>
                    <div style={{ fontSize: '.83rem', marginTop: 2 }}>{c.description}</div>
                    {c.suggestion && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>💡 {c.suggestion}</div>}
                  </div>
                );
              })}
              {conflicts.length > 15 && (
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                  +{conflicts.length - 15} more —{' '}
                  <a href={`/admin/timetable/versions/${versionId}?tab=conflicts`} style={{ color: 'var(--primary)' }}>see all</a>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    );
  }

  /* ══ THE FORM ═══════════════════════════════════════════════════════════ */
  return (
    <div className="page">
      <PageHeader
        title="Generate Timetable"
        subtitle="Build a conflict-free schedule from your period structure, subject requirements, teacher availability and rooms"
        action={<Button variant="secondary" onClick={() => navigate('/admin/timetable/versions')}>Version History</Button>}
      />

      {!totalSections && (
        <Alert variant="warning">This academic year has no active sections yet. Create classes and sections first.</Alert>
      )}

      <Card title="1 · Scope">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label required">Academic Year</label>
            <select className="form-control" value={yearId}
              onChange={e => { setYearId(e.target.value); setSecIds([]); setClassIds([]); setClassId(''); loadMeta(e.target.value); }}>
              {(meta?.years || []).map(y => <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (active)' : ''}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Version name</label>
            <input className="form-control" value={label} placeholder="Auto-numbered if left blank"
              onChange={e => setLabel(e.target.value)} />
          </div>
        </div>

        <div style={{ marginTop: 18 }}>
          <label className="form-label">Generation Scope</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {[
              ['single',   'Single Class',    'One section only'],
              ['multiple', 'Multiple Classes', 'Pick classes or specific sections'],
              ['school',   'Entire School',   `All ${totalSections} active section(s)`],
            ].map(([value, title, sub]) => (
              <label key={value} style={{
                flex: '1 1 200px', display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer',
                border: `1px solid ${scopeType === value ? 'var(--primary)' : 'var(--border)'}`,
                background: scopeType === value ? 'rgba(79,70,229,.05)' : 'var(--bg-card)',
                borderRadius: 'var(--radius)', padding: '10px 12px',
              }}>
                <input type="radio" name="scope" checked={scopeType === value} style={{ marginTop: 3 }}
                  onChange={() => { setScope(value); setSecIds([]); setClassIds([]); }} />
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{title}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{sub}</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {scopeType === 'single' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 16 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required">Class</label>
              <select className="form-control" value={classId} onChange={e => { setClassId(e.target.value); setSecIds([]); }}>
                <option value="">Select class…</option>
                {classes.map(c => <option key={c._id} value={c._id}>{c.className}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label required">Section</label>
              <select className="form-control" value={sectionIds[0] || ''} disabled={!classId}
                onChange={e => setSecIds(e.target.value ? [e.target.value] : [])}>
                <option value="">Select section…</option>
                {sectionsOfSelected.map(s => <option key={s._id} value={s._id}>{s.sectionName} ({s.currentCount || 0} students)</option>)}
              </select>
            </div>
          </div>
        )}

        {scopeType === 'multiple' && (
          <div style={{ marginTop: 16 }}>
            <label className="form-label">Classes &amp; Sections</label>
            <div style={{ display: 'grid', gap: 8, maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 12 }}>
              {classes.map(c => {
                const secs = c.sections || [];
                const allChecked = secs.length > 0 && secs.every(s => sectionIds.includes(s._id));
                return (
                  <div key={c._id}>
                    <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, fontSize: '.85rem' }}>
                      <input type="checkbox" checked={allChecked}
                        onChange={e => setSecIds(prev => e.target.checked
                          ? [...new Set([...prev, ...secs.map(s => s._id)])]
                          : prev.filter(id => !secs.some(s => s._id === id)))} />
                      {c.className}
                      <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '.75rem' }}>({secs.length} sections)</span>
                    </label>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingLeft: 24, marginTop: 4 }}>
                      {secs.map(s => (
                        <label key={s._id} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '.8rem' }}>
                          <input type="checkbox" checked={sectionIds.includes(s._id)}
                            onChange={e => setSecIds(prev => e.target.checked ? [...prev, s._id] : prev.filter(id => id !== s._id))} />
                          {s.sectionName}
                        </label>
                      ))}
                      {!secs.length && <span style={{ fontSize: '.75rem', color: 'var(--text-light)' }}>No sections</span>}
                    </div>
                  </div>
                );
              })}
              {!classes.length && <Empty icon="🏫" title="No classes" message="Create classes for this academic year first." />}
            </div>
          </div>
        )}

        {scopeType === 'school' && (
          <Alert variant="info">
            Every active section in this academic year will be scheduled together, so teachers and rooms are shared without clashes.
          </Alert>
        )}
      </Card>

      <Card title="2 · Optimisation Options">
        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 0 }}>
          Hard rules (no teacher/class/room clash, availability, weekly requirements, lab rooms) are always enforced.
          These control what the optimiser tries to improve afterwards.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 8 }}>
          {OPTIONS.map(([key, text]) => (
            <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={!!options[key]}
                onChange={e => setOptions(o => ({ ...o, [key]: e.target.checked }))} />
              {text}
            </label>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8, flexWrap: 'wrap' }}>
        <span style={{ marginRight: 'auto', alignSelf: 'center', fontSize: '.82rem', color: 'var(--text-muted)' }}>
          {scopeCount} section{scopeCount === 1 ? '' : 's'} will be scheduled
        </span>
        <Button variant="secondary" onClick={() => navigate('/admin/timetable')}>Cancel</Button>
        <Button onClick={start} loading={starting} disabled={!scopeCount}>⚡ Generate Timetable</Button>
      </div>
    </div>
  );
}
