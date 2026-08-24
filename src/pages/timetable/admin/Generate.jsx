import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { PageHeader, Button, Card, Spinner, Alert, Empty, Modal } from '../../../components/ui/index';
import {
  SEVERITY_META, CONFLICT_LABELS, Stat, DAYS, DAY_SHORT,
  SUBJECT_TYPES, ROOM_TYPES, subjectColor,
} from './shared';

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

const ALL_SECTIONS = '__all__';

/* Merge groups are shown as A, B, C… — the stored key stays opaque. */
const GROUP_TONES = ['#4f46e5', '#0d9488', '#b45309', '#be185d', '#0369a1', '#7c3aed'];
const groupTone = (index) => GROUP_TONES[index % GROUP_TONES.length];

export default function TimetableGenerate() {
  const navigate = useNavigate();

  const [meta, setMeta]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [yearId, setYearId]     = useState('');
  const [classId, setClassId]   = useState('');
  const [sectionId, setSection] = useState('');     // a section id, or ALL_SECTIONS
  const [label, setLabel]       = useState('');
  const [options, setOptions]   = useState(defaultOptions);

  /* The subject plan: how many periods a week each subject gets, and which
     subjects are merged into the same period. Loaded per class + section pick. */
  const [plan, setPlan]           = useState(null);   // server payload
  const [planLoading, setPlanLoading] = useState(false);
  const [rules, setRules]         = useState({});     // subjectId -> full rule row
  const [merges, setMerges]       = useState({});     // subjectId -> group key
  const [picked, setPicked]       = useState([]);     // subjectIds staged for merging
  const [tuning, setTuning]       = useState(null);   // subjectId whose rules are open

  const [starting, setStarting] = useState(false);
  const [progress, setProgress] = useState(null);   // { status, progress, stats, errorCount… }
  const [versionId, setVersionId] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  // Sections taught a subject together — one teacher, one room, one lesson.
  const [sectionMerges, setSectionMerges] = useState([]);
  const [mergeDraft, setMergeDraft] = useState({ subject: '', sections: [] });
  const [mergeBusy, setMergeBusy] = useState(false);
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

  const allSections = sectionId === ALL_SECTIONS;
  const scopeSectionIds = useMemo(() => (
    allSections ? sectionsOfSelected.map(s => s._id) : (sectionId ? [sectionId] : [])
  ), [allSections, sectionId, sectionsOfSelected]);
  const scopeCount = scopeSectionIds.length;

  const reloadMerges = async () => {
    try {
      const m = await api.getMerges({
        yearId: yearId || undefined,
        sectionIds: sectionsOfSelected.map(x => x._id).join(','),
      });
      setSectionMerges(m.data ?? m ?? []);
    } catch { /* the list simply stays as it was */ }
  };

  const addMerge = async () => {
    if (!mergeDraft.subject) return toast.error('Pick the subject to merge');
    if (mergeDraft.sections.length < 2) return toast.error('Pick at least two sections');
    setMergeBusy(true);
    try {
      const res = await api.saveMerge({
        yearId: yearId || undefined,
        subject: mergeDraft.subject,
        sections: mergeDraft.sections,
      });
      const saved = res.data ?? res;
      toast.success(saved?.replaced
        ? 'Merged — an overlapping merge for this subject was replaced'
        : 'Sections merged');
      setMergeDraft({ subject: '', sections: [] });
      await reloadMerges();
    } catch (e) { toast.error(e.message); }
    finally { setMergeBusy(false); }
  };

  const removeMerge = async (id) => {
    setMergeBusy(true);
    try { await api.deleteMerge(id); await reloadMerges(); toast.success('Merge removed'); }
    catch (e) { toast.error(e.message); }
    finally { setMergeBusy(false); }
  };

  /* ── The class's subjects + what the week can actually hold ────────────── */
  useEffect(() => {
    if (!classId || !scopeCount) {
      setPlan(null); setRules({}); setMerges({}); setPicked([]); setTuning(null); setSectionMerges([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setPlanLoading(true);
      try {
        const res = await api.getClassPlan(classId, allSections ? [] : scopeSectionIds, yearId);
        const d = res.data ?? res;
        if (cancelled) return;
        setPlan(d);
        setRules(Object.fromEntries(d.subjects.map(s => [s._id, ruleFrom(s)])));
        setMerges(Object.fromEntries(d.subjects.filter(s => s.mergeGroup).map(s => [s._id, s.mergeGroup])));
        setPicked([]);
        setTuning(null);
        // Merges are per year, not per run: a merge set up while generating one
        // section must still be there when the next section is generated.
        try {
          const m = await api.getMerges({
            yearId: yearId || undefined,
            sectionIds: sectionsOfSelected.map(x => x._id).join(','),
          });
          if (!cancelled) setSectionMerges(m.data ?? m ?? []);
        } catch { if (!cancelled) setSectionMerges([]); }
      } catch (e) {
        if (!cancelled) { setPlan(null); setRules({}); setMerges({}); toast.error(e.message); }
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId, sectionId, yearId, allSections, scopeCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects = plan?.subjects || [];
  const capacity = plan?.capacity?.periodsPerWeek || 0;

  /* Merged subjects share their periods, so a group costs the week one run of
     slots — not one per member. This has to mirror the backend's arithmetic. */
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of subjects) {
      const key = merges[s._id];
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return map;
  }, [subjects, merges]);

  const groupIndex = useMemo(() => {
    const order = [...groups.keys()];
    return Object.fromEntries(order.map((k, i) => [k, i]));
  }, [groups]);

  const periodsOf = (subjectId) => Number(rules[subjectId]?.weeklyPeriods) || 0;

  const assigned = useMemo(() => {
    let total = 0;
    const counted = new Set();
    for (const s of subjects) {
      const key = merges[s._id];
      if (key) {
        if (counted.has(key)) continue;
        counted.add(key);
      }
      total += Number(rules[s._id]?.weeklyPeriods) || 0;
    }
    return total;
  }, [subjects, rules, merges]);

  const remaining = capacity - assigned;
  const lonelyGroups = [...groups.entries()].filter(([, members]) => members.length < 2);
  const subjectsMatch = plan?.structureMatches?.sameSubjects !== false;

  const patchRule = (subjectId, patch) =>
    setRules(r => ({ ...r, [subjectId]: { ...r[subjectId], ...patch } }));

  /* Editing one member of a merged group moves all of them — they run together. */
  const setPeriods = (subjectId, value) => {
    const n = Math.max(0, Math.min(60, Number(value) || 0));
    const key = merges[subjectId];
    setRules(r => {
      if (!key) return { ...r, [subjectId]: { ...r[subjectId], weeklyPeriods: n } };
      const next = { ...r };
      for (const s of subjects) {
        if (merges[s._id] === key) next[s._id] = { ...next[s._id], weeklyPeriods: n };
      }
      return next;
    });
  };

  const togglePick = (subjectId) => setPicked(p =>
    p.includes(subjectId) ? p.filter(x => x !== subjectId) : [...p, subjectId]);

  const mergePicked = () => {
    if (picked.length < 2) return toast.error('Pick at least two subjects to merge');
    const key = `merge-${Date.now().toString(36)}`;
    // The group runs as often as its most-demanding member.
    const shared = Math.max(...picked.map(periodsOf));
    setMerges(m => ({ ...m, ...Object.fromEntries(picked.map(id => [id, key])) }));
    setRules(r => {
      const next = { ...r };
      for (const id of picked) next[id] = { ...next[id], weeklyPeriods: shared };
      return next;
    });
    setPicked([]);
    toast.success('Subjects merged — they will share the same period');
  };

  const unmerge = (key) => {
    setMerges(m => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== key)));
  };

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
    if (!classId) return toast.error('Select a class');
    if (!scopeCount) return toast.error('Select a section, or choose all sections');
    if (!subjects.length) return toast.error('This class has no subjects to schedule');
    if (!subjectsMatch) return toast.error('These sections do not teach the same subjects — fix that before generating');
    if (assigned <= 0) return toast.error('Give at least one subject a weekly period count');
    if (remaining < 0) return toast.error(`The plan needs ${assigned} periods but only ${capacity} are available`);
    if (lonelyGroups.length) return toast.error('A merged group needs at least two subjects');

    setStarting(true);
    setConflicts([]);
    try {
      const res = await api.generate({
        yearId,
        classId,
        allSections,
        sectionIds: allSections ? [] : scopeSectionIds,
        label: label || undefined,
        periodsPerWeek: capacity,
        subjectPlan: subjects.map(sub => ({
          ...rules[sub._id],
          subject: sub._id,
          subjectName: sub.subjectName,
          mergeGroup: merges[sub._id] || '',
        })),
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
                <Button variant="secondary" onClick={reset}>Adjust &amp; Generate Again</Button>
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

      <Card title="1 · Class & Sections">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label required">Academic Year</label>
            <select className="form-control" value={yearId}
              onChange={e => { setYearId(e.target.value); setClassId(''); setSection(''); loadMeta(e.target.value); }}>
              {(meta?.years || []).map(y => <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (active)' : ''}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label required">Class</label>
            <select className="form-control" value={classId}
              onChange={e => { setClassId(e.target.value); setSection(''); }}>
              <option value="">Select class…</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.className}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label required">Section</label>
            <select className="form-control" value={sectionId} disabled={!classId}
              onChange={e => setSection(e.target.value)}>
              <option value="">Select section…</option>
              {sectionsOfSelected.length > 1 && (
                <option value={ALL_SECTIONS}>All sections ({sectionsOfSelected.length})</option>
              )}
              {sectionsOfSelected.map(s => (
                <option key={s._id} value={s._id}>{s.sectionName} ({s.currentCount || 0} students)</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Version name</label>
            <input className="form-control" value={label} placeholder="Auto-numbered if left blank"
              onChange={e => setLabel(e.target.value)} />
          </div>
        </div>

        {allSections && (
          <Alert variant="info">
            All {sectionsOfSelected.length} sections of {selectedClass?.className} are scheduled together, so their
            teachers and rooms are shared without clashes.
          </Alert>
        )}
        {plan && !subjectsMatch && (
          <Alert variant="danger">
            <strong>These sections do not teach the same subjects.</strong>
            <div style={{ marginTop: 4, fontSize: '.82rem' }}>{plan.structureMatches.message}</div>
            <div style={{ marginTop: 4, fontSize: '.8rem' }}>
              Give every section the same subjects, or generate one section at a time.
            </div>
          </Alert>
        )}
        {plan && subjectsMatch && !plan.capacity.uniform && (
          <Alert variant="warning">{plan.structureMatches.message}</Alert>
        )}
      </Card>

      <Card
        title="2 · Combined Classes"
        action={sectionMerges.length
          ? <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{sectionMerges.length} merged</span>
          : null}
      >
        <p style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginTop: 0 }}>
          Sections that sit together for a subject — one teacher, one room, one lesson, at the same time
          in every section&rsquo;s grid. Merges belong to the academic year, so one set up here still
          applies when you generate the other sections later, on their own.
        </p>

        {!classId || !scopeCount ? (
          <Alert variant="info">Pick a class first.</Alert>
        ) : (
          <>
            {sectionMerges.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 12 }}>
                {sectionMerges.map(m => (
                  <div key={m._id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: '.82rem', flex: 1 }}>
                      <strong>{m.subjectName}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {' '}— {m.sections.map(x => x.label).join('  +  ')}
                      </span>
                      {m.teacherName && <span style={{ color: 'var(--text-muted)' }}> · {m.teacherName}</span>}
                      {m.roomName && <span style={{ color: 'var(--text-muted)' }}> · {m.roomName}</span>}
                    </span>
                    <button className="btn btn-secondary btn-sm" disabled={mergeBusy}
                      onClick={() => removeMerge(m._id)}>Remove</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: 200 }}>
                <label className="form-label">Subject</label>
                <select className="form-control" value={mergeDraft.subject}
                  onChange={e => setMergeDraft(d => ({ ...d, subject: e.target.value }))}>
                  <option value="">— Choose —</option>
                  {subjects.map(sub => (
                    <option key={sub._id} value={sub._id}>{sub.subjectName}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0, flex: 1, minWidth: 240 }}>
                <label className="form-label">Sections that sit together</label>
                <div style={{
                  display: 'flex', gap: 12, flexWrap: 'wrap', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', padding: '9px 10px',
                }}>
                  {sectionsOfSelected.map(sec => (
                    <label key={sec._id} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '.82rem' }}>
                      <input type="checkbox" checked={mergeDraft.sections.includes(sec._id)}
                        onChange={() => setMergeDraft(d => ({
                          ...d,
                          sections: d.sections.includes(sec._id)
                            ? d.sections.filter(x => x !== sec._id)
                            : [...d.sections, sec._id],
                        }))} />
                      {sec.sectionName}
                    </label>
                  ))}
                  {!sectionsOfSelected.length && (
                    <span style={{ fontSize: '.78rem', color: 'var(--text-light)' }}>This class has no sections</span>
                  )}
                </div>
              </div>
              <Button variant="secondary" onClick={addMerge} loading={mergeBusy}
                disabled={!mergeDraft.subject || mergeDraft.sections.length < 2}>
                Merge
              </Button>
            </div>
            <div className="form-hint" style={{ marginTop: 6 }}>
              The teacher is whoever is assigned to the subject in every merged section. Leave the sections
              teaching it separately to schedule them independently.
            </div>
          </>
        )}
      </Card>

      <Card
        title="3 · Subjects & Weekly Periods"
        action={plan && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.8rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>Available</span>
            <strong>{capacity}</strong>
            <span style={{ color: 'var(--text-muted)' }}>· Assigned</span>
            <strong style={{ color: remaining < 0 ? 'var(--danger)' : 'var(--text)' }}>{assigned}</strong>
            <span style={{ color: 'var(--text-muted)' }}>· {remaining < 0 ? 'Over by' : 'Free'}</span>
            <strong style={{ color: remaining < 0 ? 'var(--danger)' : remaining === 0 ? 'var(--success)' : 'var(--warning, #b45309)' }}>
              {Math.abs(remaining)}
            </strong>
          </div>
        )}
      >
        {!classId || !scopeCount ? (
          <Empty icon="📚" title="Pick a class and section" message="The subjects taught and the periods the week can hold are loaded from your choice above." />
        ) : planLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div>
        ) : !plan ? (
          <Empty icon="⚠️" title="Could not load subjects" message="Check that this class has sections and subjects assigned." />
        ) : !subjects.length ? (
          <Empty icon="📚" title="No subjects" message="Assign subjects to this class before generating a timetable." />
        ) : (
          <>
            {/* How the week's capacity is arrived at, so the number is never a mystery. */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
              {(plan.capacity.breakdown || []).map(d => (
                <span key={d.day} style={{
                  border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px',
                  fontSize: '.74rem', background: 'var(--bg)',
                }}>
                  {DAY_SHORT[d.day] || d.day} · <strong>{d.periods}</strong>
                </span>
              ))}
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                = <strong>{capacity}</strong> teaching periods a week
                {allSections ? ` per section${plan.capacity.uniform ? '' : ' (smallest week)'}` : ''}
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--border)' }}>
                    <th style={{ width: 34 }} />
                    <th style={{ textAlign: 'left', padding: '8px 6px' }}>Subject</th>
                    <th style={{ textAlign: 'left', padding: '8px 6px' }}>
                      Teacher{allSections && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> (per section)</span>}
                    </th>
                    <th style={{ textAlign: 'left', padding: '8px 6px', width: 130 }}>Merged with</th>
                    <th style={{ textAlign: 'right', padding: '8px 6px', width: 160 }}>Periods / week</th>
                  </tr>
                </thead>
                <tbody>
                  {subjects.map(sub => {
                    const key = merges[sub._id];
                    const tone = key ? groupTone(groupIndex[key]) : null;
                    const partners = key ? (groups.get(key) || []).filter(x => x._id !== sub._id) : [];
                    const colour = subjectColor(sub._id);
                    return (
                      <tr key={sub._id} data-focus-id={sub._id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '6px' }}>
                          <input type="checkbox" checked={picked.includes(sub._id)} disabled={!!key}
                            title={key ? 'Already merged — unmerge it first' : 'Select to merge with another subject'}
                            onChange={() => togglePick(sub._id)} />
                        </td>
                        <td style={{ padding: '6px' }}>
                          <span style={{
                            display: 'inline-block', width: 8, height: 8, borderRadius: 2,
                            background: colour.fg, marginRight: 7,
                          }} />
                          <strong>{sub.subjectName}</strong>
                          {sub.subjectCode && <span style={{ color: 'var(--text-light)', marginLeft: 6, fontSize: '.75rem' }}>{sub.subjectCode}</span>}
                          {sub.type === 'practical' && (
                            <span style={{ marginLeft: 6, fontSize: '.68rem', color: 'var(--text-muted)' }}>practical</span>
                          )}
                          {!!sub.missingIn.length && (
                            <span style={{ marginLeft: 6, fontSize: '.7rem', color: 'var(--danger)' }}>
                              not in every section
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '6px' }}>
                          {/* Across a whole class each section keeps its own
                              subject teacher — one dropdown cannot speak for
                              all of them, so it is only offered for one section. */}
                          {allSections ? (
                            <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                              {sub.teachers.length
                                ? sub.teachers.map(t => t.name).join(', ')
                                : <span style={{ color: 'var(--danger)' }}>none assigned</span>}
                            </span>
                          ) : !sub.teachers.length ? (
                            <span style={{ fontSize: '.78rem', color: 'var(--danger)' }}
                              title="Assign a subject teacher for this section first — Sections → this section → Subjects">
                              no teacher assigned for this subject
                            </span>
                          ) : (
                            <select className="form-control" style={{ fontSize: '.8rem', padding: '4px 6px' }}
                              value={rules[sub._id]?.teacher || ''}
                              onChange={e => patchRule(sub._id, { teacher: e.target.value || null })}>
                              <option value="">No teacher</option>
                              {sub.teachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                            </select>
                          )}
                        </td>
                        <td style={{ padding: '6px' }}>
                          {key ? (
                            <span title={partners.map(p => p.subjectName).join(', ')} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.72rem',
                              border: `1px solid ${tone}`, color: tone, borderRadius: 99, padding: '1px 8px',
                            }}>
                              🔗 {partners.map(p => p.subjectName).join(' + ') || 'group'}
                            </span>
                          ) : <span style={{ color: 'var(--text-light)', fontSize: '.78rem' }}>—</span>}
                        </td>
                        <td style={{ padding: '6px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <input type="number" min={0} max={60} className="form-control"
                            style={{ width: 76, display: 'inline-block', textAlign: 'right' }}
                            value={rules[sub._id]?.weeklyPeriods ?? 0}
                            onChange={e => setPeriods(sub._id, e.target.value)} />
                          <button type="button" title="Scheduling rules for this subject"
                            onClick={() => setTuning(sub._id)}
                            style={{
                              marginLeft: 6, border: '1px solid var(--border)', background: 'var(--bg-card)',
                              borderRadius: 6, width: 30, height: 30, cursor: 'pointer', fontSize: '.85rem',
                            }}>⚙</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Merging */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
              <Button variant="secondary" size="sm" disabled={picked.length < 2} onClick={mergePicked}>
                🔗 Merge selected{picked.length ? ` (${picked.length})` : ''}
              </Button>
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                Merged subjects are taught in the same period — pick two or more, then merge.
              </span>
            </div>

            {!!groups.size && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                {[...groups.entries()].map(([key, members]) => {
                  const tone = groupTone(groupIndex[key]);
                  return (
                    <span key={key} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '.78rem',
                      background: 'var(--bg)', border: `1px solid ${tone}`, borderRadius: 'var(--radius)', padding: '4px 10px',
                    }}>
                      <strong style={{ color: tone }}>{members.map(m => m.subjectName).join(' + ')}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {periodsOf(members[0]?._id)}×/week, same period
                      </span>
                      <button type="button" onClick={() => unmerge(key)} title="Unmerge"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1 }}>×</button>
                    </span>
                  );
                })}
              </div>
            )}

            {!!lonelyGroups.length && (
              <Alert variant="warning">A merged group needs at least two subjects. Unmerge it or add a partner.</Alert>
            )}
            {remaining < 0 && (
              <Alert variant="danger">
                The plan needs <strong>{assigned}</strong> periods a week but only <strong>{capacity}</strong> are
                available. Reduce it by {Math.abs(remaining)}.
              </Alert>
            )}
            {remaining > 0 && (
              <Alert variant="info">
                {remaining} period{remaining === 1 ? '' : 's'} a week will be left free. Raise a subject's count to fill the week.
              </Alert>
            )}
          </>
        )}
      </Card>

      <Card title="4 · Optimisation Options">
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
          {scopeCount
            ? `${scopeCount} section${scopeCount === 1 ? '' : 's'} · ${assigned}/${capacity} periods a week`
            : 'Select a class and section'}
        </span>
        <Button variant="secondary" onClick={() => navigate('/admin/timetable')}>Cancel</Button>
        <Button onClick={start} loading={starting}
          disabled={!scopeCount || !subjects.length || !subjectsMatch || assigned <= 0 || remaining < 0 || !!lonelyGroups.length}>
          ⚡ Generate Timetable
        </Button>
      </div>

      {tuning && rules[tuning] && (
        <SubjectRules
          subject={subjects.find(x => x._id === tuning)}
          rule={rules[tuning]}
          teachers={subjects.find(x => x._id === tuning)?.teachers || []}
          rooms={meta?.rooms || []}
          workingDays={plan?.capacity?.days || DAYS}
          perSectionTeachers={allSections}
          periodsPerDay={Math.max(...(plan?.capacity?.breakdown || [{ periods: 8 }]).map(d => d.periods))}
          onChange={patch => patchRule(tuning, patch)}
          onClose={() => setTuning(null)}
        />
      )}
    </div>
  );
}

/* A plan row starts from what was saved for this class, or from sane defaults
   the first time a subject is scheduled. */
function ruleFrom(sub) {
  return {
    weeklyPeriods: sub.weeklyPeriods || 0,
    teacher: sub.teacher || null,
    altTeachers: sub.altTeachers || [],
    subjectType: sub.subjectType || 'Theory',
    consecutivePeriods: sub.consecutivePeriods || 1,
    maxPerDay: sub.maxPerDay || 1,
    hardMaxPerDay: sub.hardMaxPerDay !== false,
    difficulty: sub.difficulty || 3,
    priority: sub.priority || 0,
    minGapPeriods: sub.minGapPeriods || 0,
    requiresRoom: !!sub.requiresRoom,
    room: sub.room || '',
    roomTypes: sub.roomTypes || [],
    preferredDays: sub.preferredDays || [],
    preferredPeriods: sub.preferredPeriods || [],
  };
}

/* ── Scheduling rules for one subject ──────────────────────────────────────
   Everything the solver honours for a single subject, in one place. Hard rules
   sit at the top; preferences — which are optimised for, never enforced — at
   the bottom, so nothing here can make a timetable impossible. */
function SubjectRules({ subject, rule, teachers, rooms, workingDays, periodsPerDay, perSectionTeachers, onChange, onClose }) {
  const toggle = (key, value) => {
    const list = rule[key] || [];
    onChange({ [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] });
  };

  // A subject can never run fewer times a day than the week demands of it.
  const days = Math.max(1, workingDays.length);
  const minPerDay = Math.max(rule.consecutivePeriods || 1, Math.ceil((rule.weeklyPeriods || 0) / days));

  return (
    <Modal open onClose={onClose} title={`${subject?.subjectName || 'Subject'} — scheduling rules`} maxWidth={640}
      footer={<Button onClick={onClose}>Done</Button>}>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Periods per week</label>
          <input type="number" className="form-control" min={0} max={60} value={rule.weeklyPeriods}
            onChange={e => onChange({ weeklyPeriods: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} />
        </div>
        <div className="form-group">
          <label className="form-label">Subject type</label>
          <select className="form-control" value={rule.subjectType} onChange={e => onChange({ subjectType: e.target.value })}>
            {SUBJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <div className="form-hint">Practical and Laboratory subjects claim a lab room.</div>
        </div>
        <div className="form-group">
          <label className="form-label">Max periods per day</label>
          <input type="number" className="form-control" min={1} max={12} value={rule.maxPerDay}
            onChange={e => onChange({ maxPerDay: Math.max(1, Number(e.target.value) || 1) })} />
          {minPerDay > (rule.maxPerDay || 1) && (
            <div className="form-hint" style={{ color: 'var(--warning, #b45309)' }}>
              {rule.weeklyPeriods} periods across {days} working days needs at least {minPerDay} a day —
              this will be raised to {minPerDay} on generate.
            </div>
          )}
        </div>
        <div className="form-group">
          <label className="form-label">Consecutive periods per block</label>
          <input type="number" className="form-control" min={1} max={4} value={rule.consecutivePeriods}
            onChange={e => onChange({ consecutivePeriods: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })} />
          <div className="form-hint">2 schedules back-to-back pairs, as labs usually need.</div>
        </div>
        <div className="form-group">
          <label className="form-label">Difficulty (1–5)</label>
          <input type="number" className="form-control" min={1} max={5} value={rule.difficulty}
            onChange={e => onChange({ difficulty: Math.max(1, Math.min(5, Number(e.target.value) || 3)) })} />
          <div className="form-hint">Hard subjects are kept out of the last period.</div>
        </div>
        <div className="form-group">
          <label className="form-label">Minimum gap between blocks</label>
          <input type="number" className="form-control" min={0} max={8} value={rule.minGapPeriods}
            onChange={e => onChange({ minGapPeriods: Math.max(0, Number(e.target.value) || 0) })} />
        </div>
      </div>

      <div className="form-group">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
          <input type="checkbox" checked={rule.hardMaxPerDay !== false}
            onChange={e => onChange({ hardMaxPerDay: e.target.checked })} />
          Treat &quot;max per day&quot; as a hard rule (never break it)
        </label>
      </div>

      <div className="form-group">
        <label className="form-label">
          Alternate teachers
          {perSectionTeachers && (
            <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
              {' '}— each section keeps its own subject teacher as the primary
            </span>
          )}
        </label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10, maxHeight: 130, overflowY: 'auto' }}>
          {teachers.filter(t => t._id !== rule.teacher).map(t => (
            <label key={t._id} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '.8rem' }}>
              <input type="checkbox" checked={(rule.altTeachers || []).includes(t._id)}
                onChange={() => toggle('altTeachers', t._id)} />
              {t.name}
            </label>
          ))}
          {!teachers.length && (
            <span style={{ fontSize: '.78rem', color: 'var(--text-light)' }}>
              No one is assigned to teach this subject in these sections
            </span>
          )}
        </div>
        <div className="form-hint">Used when the primary teacher is unavailable or already at their limit.</div>
      </div>

      <div className="form-group">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
          <input type="checkbox" checked={!!rule.requiresRoom} onChange={e => onChange({ requiresRoom: e.target.checked })} />
          This subject needs a specific room / lab
        </label>
      </div>

      {rule.requiresRoom && (
        <>
          <div className="form-group">
            <label className="form-label">Pin to one room</label>
            <select className="form-control" value={rule.room || ''} onChange={e => onChange({ room: e.target.value })}>
              <option value="">Any compatible room</option>
              {rooms.map(r => <option key={r._id} value={r._id}>{r.roomName} ({r.roomType}, seats {r.capacity})</option>)}
            </select>
          </div>
          {!rule.room && (
            <div className="form-group">
              <label className="form-label">Acceptable room types</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ROOM_TYPES.map(t => (
                  <label key={t} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '.8rem' }}>
                    <input type="checkbox" checked={(rule.roomTypes || []).includes(t)} onChange={() => toggle('roomTypes', t)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="form-group">
        <label className="form-label">Preferred days</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {workingDays.map(d => (
            <button key={d} type="button" onClick={() => toggle('preferredDays', d)}
              className={`btn btn-${(rule.preferredDays || []).includes(d) ? 'primary' : 'secondary'} btn-sm`}>
              {DAY_SHORT[d] || d}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Preferred periods</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Array.from({ length: Math.max(1, periodsPerDay) }, (_, i) => i + 1).map(pn => (
            <button key={pn} type="button" onClick={() => toggle('preferredPeriods', pn)}
              className={`btn btn-${(rule.preferredPeriods || []).includes(pn) ? 'primary' : 'secondary'} btn-sm`}>
              P{pn}
            </button>
          ))}
        </div>
        <div className="form-hint">Preferences are optimised for, never enforced — they cannot make a timetable impossible.</div>
      </div>

      <div className="form-group" style={{ marginBottom: 0 }}>
        <label className="form-label">Priority</label>
        <input type="number" className="form-control" value={rule.priority}
          onChange={e => onChange({ priority: Number(e.target.value) || 0 })} />
        <div className="form-hint">Higher = placed earlier, so the hardest subjects get the best slots.</div>
      </div>
    </Modal>
  );
}
