/**
 * Admin → Timetable → Generate.
 *
 * Four steps, and a rail that says whether the plan is ready:
 *   1. Select scope    which part of the school this run covers — one class and
 *                      its sections, or every class in the year
 *   2. Configure rules the weekly plan (periods per subject, who teaches it,
 *                      what runs together), the sections taught together, and
 *                      what the optimiser pursues once the hard rules hold
 *   3. Review summary  the rail: what the run will cover, and every check
 *   4. Generate        and then fix whatever it flags, right here
 *
 * The rail's checks are the page's own arithmetic plus a server dry run
 * (`POST /timetable/preflight`) that finds the problems a run would hit — a
 * teacher with more periods than free time, a subject with no teacher — before
 * anyone waits for one.
 *
 * After a run the result sits at the top of the SAME page, with the plan still
 * below it. Every problem explains itself and offers the change that fixes it;
 * "Edit weekly periods" scrolls to the row, and Regenerate re-runs from the plan
 * as it now stands — optionally replacing the attempt it supersedes, so retries
 * don't pile up under Versions.
 *
 * URL: ?version=<id> reopens a run with its scope, plan and result (the version
 * page's "Change the plan" lands here); &subject=<id>&focus=plan|rules points at
 * one subject's row or opens its rules.
 */
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { Modal, Spinner, Button } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { DAYS, DAY_SHORT, SUBJECT_TYPES, ROOM_TYPES, subjectColor } from './shared';
import {
  TtgHeader, StepCard, Note, Figures, Switch, Stepper, ProgressBar, RunSteps,
  ProblemList, Verdict, StatusPill, plural, fmtSeconds, fmtWhen, openFixInNewTab, EXTERNAL_FIXES,
} from './genParts';
import {
  TtHead, YearPicker, Card, Body, Seg, Steps, Panel, KV, Chip, Field, Check,
} from './ttUI';

const unwrap = (res) => res?.data ?? res;

/* What the optimiser improves once every hard rule holds. Each maps to solver
   weights (engine.applyOptionToggles) or, for practicals, to block size. */
const OPTIONS = [
  ['avoidSameSubjectTwiceADay', 'Avoid repeats in a day',          'A subject runs once a day where its weekly count allows.', 'calendar', 'general'],
  ['spreadAcrossWeek',          'Spread subjects across the week', 'Stops a subject bunching up on two or three days.', 'barsUp', 'general'],
  ['balanceDifficultSubjects',  'Balance difficult subjects',      'Keeps hard subjects out of the last period and apart.', 'gauge', 'general'],
  ['keepPracticalsConsecutive', 'Keep practicals back-to-back',    'Lab subjects get their periods in a row. Off: one at a time.', 'flask', 'general'],
  ['minimizeStudentGaps',       'Fewer free periods for classes',  'Fills each class’s day without holes.', 'student', 'general'],
  ['minimizeTeacherGaps',       'Fewer gaps for teachers',         'Avoids idle periods between a teacher’s lessons.', 'clock', 'staff'],
  ['preferTeacherAvailability', 'Respect teacher preferences',     'Prefers the days and periods teachers asked for.', 'teacher', 'staff'],
];

/* The tabs of "Configure Rules & Preferences". The weekly plan is a tab rather
   than a card of its own because it is one of several decisions, and the longest
   — stacked, it buried the shorter ones below the fold.
 *
 * Each label carries its own count. A tab called "Subject Distribution" with
 * nothing on it reads as a feature that is missing; "Subjects · 7" does not. */
const ruleTabs = ({ subjects, merges }) => [
  ['general',  'General'],
  ['subjects', subjects ? `Subjects · ${subjects}` : 'Subjects'],
  ['merges',   merges ? `Combined Classes · ${merges}` : 'Combined Classes'],
  ['staff',    'Teacher & Rooms'],
  ['advanced', 'Advanced'],
];

const GEN_STEPS = [
  { key: 'scope',   title: 'Select Scope',   hint: 'Classes & sections' },
  { key: 'rules',   title: 'Configure Rules', hint: 'Preferences & constraints' },
  { key: 'review',  title: 'Review Summary',  hint: 'Check before generating' },
  { key: 'run',     title: 'Generate',        hint: 'Create and validate' },
];
const defaultOptions = Object.fromEntries(OPTIONS.map(([k]) => [k, true]));

/* An attempt a new run may replace — never one somebody signed off. */
const REPLACEABLE = ['draft', 'generated', 'conflict', 'failed'];

/* Merge groups are shown by colour; the stored key stays opaque. */
const GROUP_TONES = [
  { fg: '#4f46e5', bg: '#eef2ff' }, { fg: '#0f766e', bg: '#ccfbf1' }, { fg: '#b45309', bg: '#fef3c7' },
  { fg: '#be185d', bg: '#fce7f3' }, { fg: '#0369a1', bg: '#e0f2fe' }, { fg: '#7c3aed', bg: '#ede9fe' },
];

/* A short row marker for a dry-run problem that names the subject. */
const ROW_FLAG = {
  daily_ceiling: 'Daily limit too low',
  no_teacher: 'No teacher',
  merge_teacher: 'No shared teacher',
  no_room: 'No room',
  teacher_overloaded: 'Teacher overloaded',
  merge_counts: 'Counts differ',
};

const runFrom = (v) => ({
  versionId: String(v._id ?? v.versionId),
  versionNumber: v.versionNumber,
  label: v.label || (v.versionNumber ? `Version ${v.versionNumber}` : 'Timetable'),
  status: v.status,
  progress: v.progress || {},
  stats: v.stats || {},
  errorCount: v.errorCount || 0,
  report: v.report || null,
  isDeleted: !!v.isDeleted,
  generatedAt: v.generatedAt,
});

const EMPTY_CHECK = { loading: false, report: null, planError: null, busyTeachers: [], error: null };

export default function TimetableGenerate() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  /* ── Scope ─────────────────────────────────────────────────────────────── */
  const [meta, setMeta]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [yearId, setYearId]         = useState('');
  const [classId, setClassId]       = useState('');
  const [sectionIds, setSectionIds] = useState([]);
  const [label, setLabel]           = useState('');
  const [options, setOptions]       = useState(defaultOptions);
  // 'picked' = one class and the sections chosen from it; 'all' = every active
  // section in the year, which the server resolves as scopeType 'school'.
  const [scopeMode, setScopeMode]   = useState('picked');
  const [ruleTab, setRuleTab]       = useState('general');
  const [guide, setGuide]           = useState(false);
  const [preview, setPreview]       = useState(false);
  const [templates, setTemplates]   = useState(null);   // { list, saving, name }

  /* ── The plan ──────────────────────────────────────────────────────────── */
  const [plan, setPlan]               = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [rules, setRules]             = useState({});    // subjectId -> rule row
  const [merges, setMerges]           = useState({});    // subjectId -> merge key
  const [picked, setPicked]           = useState([]);    // subjects staged for merging
  const [tuning, setTuning]           = useState(null);  // subject whose rules are open
  const [focus, setFocus]             = useState(null);  // { subjectId, at }

  const [sectionMerges, setSectionMerges] = useState([]);
  const [mergeDraft, setMergeDraft]       = useState({ subject: '', sections: [] });
  const [mergeBusy, setMergeBusy]         = useState(false);

  /* ── Checking & running ────────────────────────────────────────────────── */
  const [check, setCheck]         = useState(EMPTY_CHECK);
  const [run, setRun]             = useState(null);
  const [runSig, setRunSig]       = useState(null);
  const [mergesTouched, setMergesTouched] = useState(false);
  const [starting, setStarting]   = useState(false);
  const [replaceOld, setReplaceOld] = useState(true);
  const [confirmGo, setConfirmGo] = useState(false);

  const pollRef     = useRef(null);
  const resultRef   = useRef(null);
  const planRef     = useRef(null);
  const checkSeq    = useRef(0);
  const deepLinked  = useRef(null);   // version id whose plan signature is still to be taken
  const planTabShown = useRef(false);
  const pendingFocus = useRef(params.get('subject')
    ? { subjectId: params.get('subject'), mode: params.get('focus') || 'plan' } : null);

  /* ── Load ──────────────────────────────────────────────────────────────── */
  const loadMeta = useCallback(async (yid) => {
    setLoading(true);
    try {
      const d = unwrap(await api.getMeta(yid));
      setMeta(d);
      if (!yid) setYearId(String(d.selectedYearId || ''));
      return d;
    } catch (e) {
      toast.error(e.message);
      return null;
    } finally { setLoading(false); }
  }, []);

  const poll = useCallback((id) => {
    clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const d = unwrap(await api.getProgress(id));
        if (d.status === 'generating') {
          setRun((r) => (r && r.versionId === String(id) ? { ...r, status: d.status, progress: d.progress || r.progress } : r));
          return;
        }
        clearInterval(pollRef.current);
        const full = runFrom(unwrap(await api.getProgress(id, { report: 1 })));
        setRun(full);
        setReplaceOld(full.status === 'conflict' || full.status === 'failed');
        const problems = full.report?.summary?.errors || 0;
        if (full.status === 'failed') toast.error('Generation failed');
        else if (problems) toast(`Generated — ${plural(problems, 'problem')} to fix`, { icon: '⚠️' });
        else toast.success('Timetable generated');
      } catch (e) {
        clearInterval(pollRef.current);
        toast.error(e.message);
      }
    }, 800);
  }, []);

  useEffect(() => {
    const vid = params.get('version');
    (async () => {
      if (!vid) { loadMeta(); return; }
      try {
        const v = unwrap(await api.getProgress(vid, { report: 1 }));
        const yid = String(v.academicYear || '');
        setYearId(yid);
        const m = await loadMeta(yid);
        const ids = (v.sections || []).map(String);
        const klass = (m?.classes || []).find((c) => ids.length
          && ids.every((id) => (c.sections || []).some((s) => String(s._id) === id)));
        if (!klass) {
          toast('That version covers more than one class — pick a class to change its plan.', { icon: 'ℹ️' });
          return;
        }
        deepLinked.current = String(v._id);
        setClassId(String(klass._id));
        setSectionIds(ids);
        setOptions({ ...defaultOptions, ...Object.fromEntries(OPTIONS.map(([k]) => [k, v.options?.[k] !== false])) });
        setRun(runFrom(v));
        setReplaceOld(v.status === 'conflict' || v.status === 'failed');
        if (v.status === 'generating') poll(vid);
      } catch (e) {
        toast.error(e.message);
        setParams({}, { replace: true });
        loadMeta();
      }
    })();
    return () => clearInterval(pollRef.current);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Scope derivations ─────────────────────────────────────────────────── */
  const classes = meta?.classes || [];
  const selectedClass = classes.find((c) => String(c._id) === classId);
  const classSections = useMemo(() => selectedClass?.sections || [], [selectedClass]);
  const scopeCount = sectionIds.length;
  const allSelected = classSections.length > 0 && scopeCount === classSections.length;
  const sectionKey = [...sectionIds].sort().join(',');
  const running = run?.status === 'generating';
  const sectionName = (id) => classSections.find((s) => String(s._id) === String(id))?.sectionName || '';

  const chooseClass = (id) => {
    setClassId(id);
    const k = classes.find((c) => String(c._id) === id);
    // A class with one section has nothing to choose.
    setSectionIds(k?.sections?.length === 1 ? [String(k.sections[0]._id)] : []);
    setRun(null); setRunSig(null);
    if (params.get('version')) setParams({}, { replace: true });
  };

  const toggleSection = (id) => setSectionIds((cur) => (
    cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleAll = () => setSectionIds(allSelected ? [] : classSections.map((s) => String(s._id)));

  const changeYear = (yid) => {
    setYearId(yid); setClassId(''); setSectionIds([]); setRun(null); setRunSig(null);
    if (params.get('version')) setParams({}, { replace: true });
    loadMeta(yid);
  };

  /* ── The class's subjects + what the week can hold ─────────────────────── */
  const reloadSectionMerges = useCallback(async () => {
    try {
      const m = unwrap(await api.getMerges({
        yearId: yearId || undefined,
        sectionIds: classSections.map((x) => x._id).join(','),
      }));
      setSectionMerges(Array.isArray(m) ? m : []);
    } catch { /* the list stays as it was */ }
  }, [yearId, classSections]);

  useEffect(() => {
    if (!classId || !scopeCount) {
      setPlan(null); setRules({}); setMerges({}); setPicked([]); setTuning(null); setSectionMerges([]);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      setPlanLoading(true);
      try {
        const d = unwrap(await api.getClassPlan(classId, allSelected ? [] : sectionIds, yearId));
        if (cancelled) return;
        setPlan(d);
        setRules(Object.fromEntries(d.subjects.map((s) => [s._id, ruleFrom(s)])));
        setMerges(Object.fromEntries(d.subjects.filter((s) => s.mergeGroup).map((s) => [s._id, s.mergeGroup])));
        setPicked([]);
        setTuning(null);
        // Combined sections belong to the year, not to one run.
        try {
          const m = unwrap(await api.getMerges({
            yearId: yearId || undefined,
            sectionIds: classSections.map((x) => x._id).join(','),
          }));
          if (!cancelled) setSectionMerges(Array.isArray(m) ? m : []);
        } catch { if (!cancelled) setSectionMerges([]); }

        const want = pendingFocus.current;
        if (want && !cancelled && d.subjects.some((s) => s._id === want.subjectId)) {
          setFocus({ subjectId: want.subjectId, at: Date.now() });
          if (want.mode === 'rules') setTuning(want.subjectId);
        }
        pendingFocus.current = null;
      } catch (e) {
        if (!cancelled) { setPlan(null); setRules({}); setMerges({}); toast.error(e.message); }
      } finally {
        if (!cancelled) setPlanLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classId, sectionKey, yearId]); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects = useMemo(() => plan?.subjects || [], [plan]);
  const capacity = plan?.capacity?.periodsPerWeek || 0;
  const periodsOf = (subjectId) => Number(rules[subjectId]?.weeklyPeriods) || 0;

  /* Merged subjects share their periods, so a group costs the week one run of
     slots — mirrors the backend's validateSubjectPlan. */
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
  const groupTone = useMemo(() => {
    const keys = [...groups.keys()];
    return Object.fromEntries(keys.map((k, i) => [k, GROUP_TONES[i % GROUP_TONES.length]]));
  }, [groups]);

  /* Group members sit together in the table, so a merge reads as one block. */
  const orderedSubjects = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const s of subjects) {
      if (seen.has(s._id)) continue;
      const key = merges[s._id];
      const members = key ? groups.get(key) || [s] : [s];
      for (const m of members) { out.push(m); seen.add(m._id); }
    }
    return out;
  }, [subjects, merges, groups]);

  const assigned = useMemo(() => {
    let total = 0;
    const counted = new Set();
    for (const s of subjects) {
      const key = merges[s._id];
      if (key) { if (counted.has(key)) continue; counted.add(key); }
      total += Number(rules[s._id]?.weeklyPeriods) || 0;
    }
    return total;
  }, [subjects, rules, merges]);

  const remaining = capacity - assigned;
  const lonelyGroups = [...groups.entries()].filter(([, members]) => members.length < 2);
  const subjectsMatch = plan?.structureMatches?.sameSubjects !== false;
  const days = plan?.capacity?.days || DAYS;

  const patchRule = (subjectId, patch) => setRules((r) => ({ ...r, [subjectId]: { ...r[subjectId], ...patch } }));

  /* Editing one member of a merged group moves all of them — they run together. */
  const setPeriods = (subjectId, n) => {
    const key = merges[subjectId];
    setRules((r) => {
      if (!key) return { ...r, [subjectId]: { ...r[subjectId], weeklyPeriods: n } };
      const next = { ...r };
      for (const s of subjects) if (merges[s._id] === key) next[s._id] = { ...next[s._id], weeklyPeriods: n };
      return next;
    });
  };

  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const mergePicked = () => {
    if (picked.length < 2) return toast.error('Pick at least two subjects to teach together');
    const key = `merge-${Date.now().toString(36)}`;
    const shared = Math.max(...picked.map(periodsOf));
    setMerges((m) => ({ ...m, ...Object.fromEntries(picked.map((id) => [id, key])) }));
    setRules((r) => {
      const next = { ...r };
      for (const id of picked) next[id] = { ...next[id], weeklyPeriods: shared };
      return next;
    });
    setPicked([]);
    toast.success('Those subjects now share the same periods');
    return undefined;
  };

  const unmerge = (key) => setMerges((m) => Object.fromEntries(Object.entries(m).filter(([, v]) => v !== key)));

  /* ── Combined sections ─────────────────────────────────────────────────── */
  const addSectionMerge = async () => {
    if (!mergeDraft.subject) return toast.error('Pick the subject taught together');
    if (mergeDraft.sections.length < 2) return toast.error('Pick at least two sections');
    setMergeBusy(true);
    try {
      const saved = unwrap(await api.saveMerge({ yearId: yearId || undefined, subject: mergeDraft.subject, sections: mergeDraft.sections }));
      toast.success(saved?.replaced ? 'Combined — an overlapping combination for this subject was replaced' : 'Sections combined');
      setMergeDraft({ subject: '', sections: [] });
      setMergesTouched(true);
      await reloadSectionMerges();
    } catch (e) { toast.error(e.message); } finally { setMergeBusy(false); }
    return undefined;
  };

  const removeSectionMerge = async (id) => {
    setMergeBusy(true);
    try {
      await api.deleteMerge(id);
      setMergesTouched(true);
      await reloadSectionMerges();
      toast.success('Combination removed');
    } catch (e) { toast.error(e.message); } finally { setMergeBusy(false); }
  };

  /* ── Request body, signature, dry run ──────────────────────────────────── */
  const requestBody = () => (scopeMode === 'all'
    // Every section in the year. There is no one class plan to send — each
    // section keeps the subject requirements already saved against it, which is
    // exactly what the solver reads when no plan overrides them.
    ? { yearId, scopeType: 'school', options }
    : {
      yearId,
      classId,
      allSections: allSelected,
      sectionIds: allSelected ? [] : sectionIds,
      periodsPerWeek: capacity,
      subjectPlan: subjects.map((sub) => ({
        ...rules[sub._id],
        subject: sub._id,
        subjectName: sub.subjectName,
        mergeGroup: merges[sub._id] || '',
      })),
      options,
    });

  // Everything a run depends on, so a result can say "the plan changed since".
  const signature = useMemo(() => ((plan || scopeMode === 'all') ? JSON.stringify({
    mode: scopeMode,
    s: sectionKey,
    r: subjects.map((s) => [s._id, rules[s._id]]),
    m: subjects.map((s) => merges[s._id] || ''),
    o: options,
  }) : ''), [plan, scopeMode, sectionKey, subjects, rules, merges, options]);

  // A reopened run was generated from the plan now loaded — take its signature.
  useEffect(() => {
    if (deepLinked.current && plan && !planLoading && run && deepLinked.current === run.versionId) {
      setRunSig(signature);
      deepLinked.current = null;
    }
  }, [plan, planLoading, signature, run]);

  const dirty = !!run && !running && !!runSig && (signature !== runSig || mergesTouched);

  const clientReady = scopeMode === 'all'
    ? !!yearId
    : !!(plan && scopeCount && subjects.length && subjectsMatch
      && assigned > 0 && remaining >= 0 && !lonelyGroups.length);
  const mergeKey = sectionMerges.map((m) => m._id).sort().join(',');

  useEffect(() => {
    if (!clientReady || planLoading) {
      checkSeq.current += 1;
      setCheck(EMPTY_CHECK);
      return undefined;
    }
    const seq = ++checkSeq.current;
    setCheck((c) => ({ ...c, loading: true }));
    const timer = setTimeout(async () => {
      try {
        const d = unwrap(await api.preflight(requestBody()));
        if (seq === checkSeq.current) {
          setCheck({ loading: false, report: d.report, planError: d.planError, busyTeachers: d.busyTeachers || [], error: null });
        }
      } catch (e) {
        if (seq === checkSeq.current) setCheck({ ...EMPTY_CHECK, error: e.message });
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [signature, clientReady, planLoading, mergeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Generate / regenerate ─────────────────────────────────────────────── */
  const blockingReason = () => {
    if (!yearId) return 'Select an academic year';
    if (scopeMode === 'all') {
      // Nothing else to check on this side: with no plan on screen the server's
      // dry run is the only thing that knows whether the year can be solved.
      return check.planError || null;
    }
    if (!classId) return 'Select a class';
    if (!scopeCount) return 'Select at least one section';
    if (planLoading) return 'The plan is still loading';
    if (!subjects.length) return 'This class has no subjects to schedule';
    if (!subjectsMatch) return 'These sections teach different subjects — generate them one at a time';
    if (assigned <= 0) return 'Give at least one subject some periods';
    if (remaining < 0) return `The plan needs ${assigned} periods but the week has ${capacity}`;
    if (lonelyGroups.length) return 'A subject is set to share periods but has no partner';
    return null;
  };
  const canGenerate = !blockingReason() && !running && !starting;

  const start = async (confirmed = false) => {
    const reason = blockingReason();
    if (reason) { toast.error(reason); return; }
    if (!confirmed && (check.report?.summary?.errors || 0) > 0) { setConfirmGo(true); return; }
    setConfirmGo(false);
    setStarting(true);
    const previous = run && !running ? run : null;
    const replacing = previous && replaceOld && REPLACEABLE.includes(previous.status) && !previous.isDeleted;
    try {
      const d = unwrap(await api.generate({
        ...requestBody(),
        label: label.trim() || undefined,
        basedOn: previous?.versionId,
        replaces: replacing ? previous.versionId : undefined,
      }));
      setRun({
        ...runFrom({ ...d, _id: d.versionId, status: 'generating', label: label.trim() }),
        replacing: replacing ? previous.label : null,
      });
      setRunSig(signature);
      setMergesTouched(false);
      setLabel('');
      setParams({ version: String(d.versionId) }, { replace: true });
      poll(d.versionId);
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    } catch (e) {
      toast.error(e.message);
      const busyId = e.status === 409 && e.data?.data?.versionId;
      if (busyId) {
        setRun(runFrom({ _id: busyId, status: 'generating', progress: { percent: 0, steps: [] } }));
        poll(busyId);
      }
    } finally { setStarting(false); }
  };

  /* ── Problem fixes ─────────────────────────────────────────────────────── */
  const onFix = (fix) => {
    if (EXTERNAL_FIXES.has(fix.type)) { openFixInNewTab(fix); return; }
    if (fix.type === 'regenerate') { start(); return; }
    if (fix.type === 'grid') {
      if (!run) return;
      const q = new URLSearchParams({ tab: 'class' });
      if (fix.sectionId) q.set('section', fix.sectionId);
      if (fix.day) q.set('day', fix.day);
      if (fix.period) q.set('period', String(fix.period));
      navigate(`/admin/timetable/versions/${run.versionId}?${q}`);
      return;
    }
    // plan / rules: bring the subject's row into view.
    if (fix.subjectId && subjects.some((s) => s._id === fix.subjectId)) {
      setFocus({ subjectId: fix.subjectId, at: Date.now() });
      if (fix.type === 'rules') setTuning(fix.subjectId);
    } else {
      planRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  /* The weekly plan is the work; the toggles are the trimmings. Once a class's
     subjects have loaded, open on that tab instead of leaving the admin looking
     at preferences and wondering where the plan went. Once only, so it never
     fights a tab they picked themselves. */
  useEffect(() => {
    if (planTabShown.current || !plan || !subjects.length) return;
    planTabShown.current = true;
    setRuleTab('subjects');
  }, [plan, subjects.length]);

  useEffect(() => {
    if (!focus) return undefined;
    const row = document.querySelector(`[data-subject-row="${focus.subjectId}"]`);
    (row || planRef.current)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setFocus(null), 3200);
    return () => clearTimeout(t);
  }, [focus]);

  /* Dry-run problems that name a row. */
  const rowFlags = useMemo(() => {
    const flags = {};
    for (const p of check.report?.problems || []) {
      if (p.severity !== 'error') continue;
      const add = (id) => { if (id && !flags[id]) flags[id] = { text: ROW_FLAG[p.kind] || 'Problem', title: p.title }; };
      for (const s of p.subjects || []) add(s._id);
      if (p.kind === 'teacher_overloaded' && p.teacher) {
        for (const sub of subjects) {
          const teaches = scopeCount === 1
            ? rules[sub._id]?.teacher === p.teacher._id
            : (sub.teachers || []).some((t) => t._id === p.teacher._id);
          if (teaches && periodsOf(sub._id) > 0) add(sub._id);
        }
      }
    }
    return flags;
  }, [check.report, subjects, rules, scopeCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ══ Render ════════════════════════════════════════════════════════════ */
  if (loading && !meta) return <div className="page ttgpg"><div className="ttg-center"><Spinner /></div></div>;

  const noSectionsAtAll = classes.every((c) => !(c.sections || []).length);
  const scopeLine = selectedClass
    ? `${selectedClass.className} · ${scopeCount ? (allSelected && scopeCount > 1 ? `all ${scopeCount} sections` : sectionIds.map(sectionName).sort().join(', ')) : 'no section chosen'}`
    : 'No class chosen yet';

  const stepState = {
    scope: !scopeCount ? '' : (plan && !subjectsMatch ? 'bad' : 'done'),
    plan: !plan ? '' : (remaining < 0 || lonelyGroups.length || assigned <= 0 ? 'bad' : (remaining === 0 ? 'done' : '')),
  };

  /* Readiness: the page's own arithmetic first, then the dry run. */
  const checks = [];
  if (scopeMode === 'all') {
    const nSections = classes.reduce((n, c) => n + (c.sections || []).length, 0);
    checks.push(nSections
      ? { state: 'ok', text: 'Classes and sections selected', sub: `${plural(classes.length, 'class', 'classes')} · ${plural(nSections, 'section')}` }
      : { state: 'bad', text: 'This year has no active sections' });
    checks.push({
      state: 'ok',
      text: 'Periods per week configured',
      sub: 'Each section keeps the subject requirements already saved against it',
    });
  } else {
  checks.push(scopeCount
    ? { state: 'ok', text: 'Classes and sections selected', sub: scopeLine }
    : { state: 'todo', text: 'Choose a class and its sections' });
  if (plan && scopeCount > 1) {
    checks.push(subjectsMatch
      ? { state: 'ok', text: 'Sections teach the same subjects' }
      : { state: 'bad', text: 'Sections teach different subjects', sub: 'Generate them one section at a time' });
  }
  if (plan) {
    checks.push(assigned <= 0
      ? { state: 'todo', text: 'Give subjects their weekly periods' }
      : remaining < 0
        ? { state: 'bad', text: `Plan is ${-remaining} over the week`, sub: `${assigned} planned, ${capacity} available` }
        : remaining > 0
          ? { state: 'warn', text: `${plural(remaining, 'period')} a week left free`, sub: `${assigned} of ${capacity} planned` }
          : { state: 'ok', text: 'Plan fills the week', sub: `${assigned} of ${capacity} periods` });
    if (lonelyGroups.length) checks.push({ state: 'bad', text: 'A shared-period group has one subject', sub: 'Unmerge it or add a partner' });
  }
  }
  if (clientReady) {
    if (check.loading && !check.report) {
      checks.push({ state: 'busy', text: 'Checking teachers, rooms and limits…' });
    } else if (check.error) {
      checks.push({ state: 'warn', text: 'Could not check the plan', sub: check.error });
    } else if (check.planError) {
      checks.push({ state: 'bad', text: check.planError });
    } else if (check.report) {
      const errs = check.report.problems.filter((p) => p.severity === 'error');
      if (!errs.length) {
        checks.push({ state: 'ok', text: 'No blocking conflicts detected', sub: check.loading ? 'Re-checking…' : undefined });
        checks.push({ state: 'ok', text: 'Teacher availability loaded' });
        checks.push({ state: 'ok', text: 'Rooms available' });
      }
      for (const p of errs.slice(0, 4)) checks.push({ state: 'bad', text: p.title });
      if (errs.length > 4) checks.push({ state: 'bad', text: `and ${plural(errs.length - 4, 'more problem')}` });
    }
  }
  const dryErrors = check.report?.summary?.errors || 0;

  /* Which of the four steps the page is on. It follows the work rather than a
     Next button: an admin who scrolls back to change a section is on step one
     again, and the stepper should say so. */
  const doneSteps = [
    (scopeMode === 'all' || scopeCount) && 'scope',
    clientReady && 'rules',
    clientReady && !dryErrors && !check.loading && 'review',
    run && !running && 'run',
  ].filter(Boolean);
  const activeStep = run ? 'run'
    : !(scopeMode === 'all' || scopeCount) ? 'scope'
    : !clientReady ? 'rules'
    : 'review';

  const totalSections = scopeMode === 'all'
    ? classes.reduce((n, c) => n + (c.sections || []).length, 0)
    : scopeCount;
  const totalClasses = scopeMode === 'all' ? classes.filter((c) => (c.sections || []).length).length : (classId ? 1 : 0);
  const plannedPeriods = scopeMode === 'all' ? null : capacity * scopeCount;

  /* Rule sets are kept on the year's configuration, which is also where the
     Configuration screen reads them — one list, not two that drift apart. */
  const openTemplates = async (mode) => {
    try {
      const cfg = unwrap(await api.getConfig(yearId || undefined));
      setTemplates({ mode, list: cfg.ruleTemplates || [], cfg, name: '', saving: false });
    } catch (e) { toast.error(e.message); }
  };

  const applyTemplate = (t) => {
    setOptions((o) => ({ ...o, ...(t.options || {}) }));
    setTemplates(null);
    toast.success(`Loaded “${t.name}”`);
  };

  const saveTemplate = async () => {
    const name = templates.name.trim();
    if (!name) return toast.error('Give the rule set a name');
    setTemplates((t) => ({ ...t, saving: true }));
    try {
      await api.saveConfig({
        ...templates.cfg,
        yearId,
        ruleTemplates: [...templates.list, { name, savedAt: new Date().toISOString(), options }].slice(-25),
      });
      toast.success('Rule set saved');
      setTemplates(null);
    } catch (e) {
      toast.error(e.message);
      setTemplates((t) => ({ ...t, saving: false }));
    }
    return undefined;
  };

  const optionsIn = (group) => OPTIONS.filter(([, , , , g]) => g === group);


  return (
    <div className="page tt-page">
      <TtHead icon="wand" title="Generate Timetable"
        subtitle="Create a complete timetable automatically using your rules and preferences.">
        <YearPicker years={meta?.years || []} value={yearId} onChange={changeYear} />
        <Button variant="secondary" onClick={() => setGuide(true)}>
          <Icon name="bookOpen" size={16} /> View Guide
        </Button>
      </TtHead>

      <Card>
        <Steps steps={GEN_STEPS} current={activeStep} done={doneSteps} />
      </Card>

      {noSectionsAtAll && (
        <Note tone="warn">This academic year has no active sections yet. Create classes and sections first.</Note>
      )}

      {/* ── The latest run sits above the plan that produced it ───────────── */}
      {run && (
        <section ref={resultRef} className="ttg-card">
          <RunResult
            run={run}
            dirty={dirty}
            starting={starting}
            canGenerate={canGenerate}
            replaceOld={replaceOld}
            onReplaceOld={setReplaceOld}
            onRegenerate={() => start()}
            onReview={() => navigate(`/admin/timetable/versions/${run.versionId}`)}
            onFix={onFix}
          />
        </section>
      )}

      <div className="tt-split tt-split--wide">
        <div className={running ? 'ttg-locked' : ''} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ══ 1. Scope ═══════════════════════════════════════════════════ */}
          <Card icon="users" title="Select Classes & Sections"
            subtitle="Choose which classes and sections to include in this timetable generation."
            actions={<Seg value={scopeMode} onChange={(m) => { setScopeMode(m); setRun(null); setRunSig(null); }}
              options={[['all', 'All Classes'], ['picked', 'Selected']]} />}>
            <Body>
              {scopeMode === 'all' ? (
                <>
                  <Note tone="info">
                    Every active section in {meta?.years?.find((y) => String(y._id) === yearId)?.yearName || 'this year'} is
                    solved in one run, so teachers and rooms shared between classes never clash.
                    Each section uses the subject requirements already saved against it — switch to
                    <strong> Selected</strong> to edit a class’s plan here first.
                  </Note>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
                    {classes.filter((c) => (c.sections || []).length).map((c) => (
                      <Chip key={c._id} tone="indigo">
                        {c.className} · {plural((c.sections || []).length, 'section')}
                      </Chip>
                    ))}
                    {!classes.some((c) => (c.sections || []).length) && (
                      <span style={{ fontSize: '.84rem', color: 'var(--text-muted)' }}>No sections to generate for.</span>
                    )}
                  </div>
                  <div style={{ marginTop: 14, maxWidth: 360 }}>
                    <Field label="Version name (optional)">
                      <input className="form-control" value={label} maxLength={80}
                        placeholder="e.g. Term 2 draft"
                        onChange={(e) => setLabel(e.target.value)} />
                    </Field>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                    <Field label="Class">
                      <select className="form-control" value={classId} onChange={(e) => chooseClass(e.target.value)}>
                        <option value="">Select class…</option>
                        {classes.map((c) => (
                          <option key={c._id} value={c._id} disabled={!(c.sections || []).length}>
                            {c.className}{(c.sections || []).length ? '' : ' — no sections'}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Sections">
                      <select className="form-control"
                        value={allSelected ? 'all' : (sectionIds.length === 1 ? sectionIds[0] : '')}
                        disabled={!selectedClass}
                        onChange={(e) => {
                          if (e.target.value === 'all') setSectionIds(classSections.map((x) => String(x._id)));
                          else if (e.target.value) setSectionIds([e.target.value]);
                          else setSectionIds([]);
                        }}>
                        <option value="">
                          {sectionIds.length > 1 && !allSelected
                            ? `${plural(sectionIds.length, 'section')} chosen`
                            : 'Choose sections…'}
                        </option>
                        {classSections.length > 1 && (
                          <option value="all">All sections ({classSections.length})</option>
                        )}
                        {classSections.map((x) => (
                          <option key={x._id} value={String(x._id)}>Section {x.sectionName}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Version name (optional)">
                      <input className="form-control" value={label} maxLength={80}
                        placeholder={run ? 'e.g. Term 2 — fewer Maths periods' : 'e.g. Term 2 draft'}
                        onChange={(e) => setLabel(e.target.value)} />
                    </Field>
                  </div>

                  {selectedClass && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14, alignItems: 'center' }}>
                      {classSections.map((x) => {
                        const on = sectionIds.includes(String(x._id));
                        return (
                          <button key={x._id} type="button" onClick={() => toggleSection(String(x._id))}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                              padding: '7px 12px', borderRadius: 9,
                              border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                              background: on ? '#eef2ff' : 'var(--bg-card)',
                              color: on ? 'var(--primary)' : 'var(--text-muted)',
                              fontSize: '.83rem', fontWeight: 600, cursor: 'pointer',
                            }}>
                            {selectedClass.className} {x.sectionName}
                            <em style={{ fontStyle: 'normal', fontWeight: 400, opacity: .8 }}>
                              {plural(x.currentCount || 0, 'student')}
                            </em>
                            <Icon name={on ? 'close' : 'plus'} size={13} />
                          </button>
                        );
                      })}
                      {scopeCount > 0 && (
                        <button type="button" className="btn btn-secondary btn-sm"
                          style={{ marginLeft: 'auto' }} onClick={() => setSectionIds([])}>
                          <Icon name="trash" size={14} /> Clear all
                        </button>
                      )}
                    </div>
                  )}

                  {plan && (
                    <div style={{ marginTop: 14 }}>
                      <Note tone="info">
                        <strong>{capacity} teaching periods per week per section</strong>
                        {' ('}
                        {(plan.capacity.breakdown || [])
                          .map((d) => `${DAY_SHORT[d.day] || d.day}: ${d.periods}`).join(', ')}
                        {')'}
                        {!plan.capacity.uniform && ' — the shortest week is used where sections differ.'}
                      </Note>
                    </div>
                  )}

                  {plan && !subjectsMatch && (
                    <div style={{ marginTop: 12 }}>
                      <Note tone="bad">
                        <b>These sections don&rsquo;t teach the same subjects.</b> One plan can&rsquo;t describe them all.
                        <ul>
                          {(plan.structureMatches.differences || []).map((d) => (
                            <li key={d.subjectId}>{d.subjectName} is missing in {d.missingIn.join(', ')}</li>
                          ))}
                        </ul>
                        Choose one section at a time, or give every section the same subjects.
                      </Note>
                    </div>
                  )}
                </>
              )}
            </Body>
          </Card>

          {/* ══ 2. Rules ═══════════════════════════════════════════════════ */}
          <Card icon="settings" title="Configure Rules & Preferences"
            subtitle="Set how the generator should build the timetable."
            actions={<>
              <Button size="sm" variant="secondary" onClick={() => openTemplates('load')}>
                <Icon name="folder" size={15} /> Load from template
              </Button>
              <Button size="sm" variant="secondary" onClick={() => openTemplates('save')}>
                <Icon name="save" size={15} /> Save as template
              </Button>
            </>}>
            <div className="tt-card__tabs">
              <Seg value={ruleTab} onChange={setRuleTab}
                options={ruleTabs({ subjects: subjects.length, merges: sectionMerges.length })} />
            </div>

            {/* ── General ──────────────────────────────────────────────── */}
            {ruleTab === 'general' && (
              <Body>
                <div className="ttg-prefs">
                  {optionsIn('general').map(([key, title, hint, icon]) => (
                    <button key={key} type="button" className="ttg-pref" aria-pressed={!!options[key]}
                      onClick={() => setOptions((o) => ({ ...o, [key]: !o[key] }))}>
                      <span className="ttg-pref__icon"><Icon name={icon} size={17} /></span>
                      <Switch on={!!options[key]} />
                      <span className="ttg-pref__body"><b>{title}</b><span>{hint}</span></span>
                    </button>
                  ))}
                </div>
                <Note tone="info">
                  No clashes, teacher availability, weekly counts and lab rooms are always enforced.
                  These decide what the optimiser improves once those hold.
                </Note>
              </Body>
            )}

            {/* ── Subject Distribution ─────────────────────────────────── */}
            {ruleTab === 'subjects' && (
              scopeMode === 'all' ? (
                <Body>
                  <Note tone="info">
                    With every class in scope there is no single plan to edit here — each section
                    uses the subject requirements saved against it. Switch the scope to
                    <strong> Selected</strong> and pick a class to change its weekly plan.
                  </Note>
                </Body>
              ) : !classId || !scopeCount ? (
                <Body>
                  <PlanEmpty icon="layers" title="Choose a class and its sections"
                    text="Every subject they teach loads here, with the periods a week each one gets, who teaches it, and which subjects share a period." />
                </Body>
              ) : planLoading ? (
                <div className="ttg-center"><Spinner /></div>
              ) : !plan ? (
                <Body>
                  <PlanEmpty icon="alert" title="Could not load the subjects"
                    text="Check that this class has sections and subjects assigned." />
                </Body>
              ) : !subjects.length ? (
                <Body>
                  <PlanEmpty icon="book" title="No subjects"
                    text="Assign subjects to this class before generating a timetable." />
                </Body>
              ) : (
                <div ref={planRef}>
                  <div style={{ padding: '0 22px 2px', display: 'flex', justifyContent: 'flex-end' }}>
                    <PlanCapacity capacity={capacity} assigned={assigned} subjects={subjects}
                      rules={rules} merges={merges} />
                  </div>
                  <div className="ttg-planwrap">
                    <table className="ttg-plan">
                      <thead>
                        <tr>
                          <th aria-label="Select to share periods" />
                          <th>Subject</th>
                          <th title={scopeCount > 1 ? 'Each section keeps its own subject teacher' : undefined}>
                            {scopeCount > 1 ? 'Teachers' : 'Teacher'}
                          </th>
                          <th className="is-num">Periods / week</th>
                          <th className="is-end">Rules</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderedSubjects.map((sub) => {
                          const rule = rules[sub._id] || {};
                          const key = merges[sub._id];
                          const tone = key ? groupTone[key] : null;
                          const partners = key ? (groups.get(key) || []).filter((x) => x._id !== sub._id) : [];
                          const flag = rowFlags[sub._id];
                          const focused = focus?.subjectId === sub._id;
                          return (
                            <tr key={`${sub._id}${focused ? focus.at : ''}`} data-subject-row={sub._id}
                              className={[tone && 'is-grouped', focused && 'is-focus', !periodsOf(sub._id) && 'is-off'].filter(Boolean).join(' ')}
                              style={tone ? { '--tone': tone.fg } : undefined}>
                              <td>
                                <input type="checkbox" checked={picked.includes(sub._id)} disabled={!!key}
                                  title={key ? 'Already sharing periods — unmerge it first' : 'Select to share periods with another subject'}
                                  onChange={() => togglePick(sub._id)} />
                              </td>
                              <td>
                                <div className="ttg-subj">
                                  <span className="ttg-subj__dot" style={{ background: subjectColor(sub._id).fg }} />
                                  <div style={{ minWidth: 0 }}>
                                    <div className="ttg-subj__name">
                                      {sub.subjectName}{sub.subjectCode && <small>{sub.subjectCode}</small>}
                                    </div>
                                    <div className="ttg-subj__rules" title={ruleSummary(rule, days, meta?.rooms)}>
                                      {ruleSummary(rule, days, meta?.rooms)}
                                    </div>
                                    <div className="ttg-subj__tags">
                                      {tone && (
                                        <span className="ttg-tag ttg-tag--tone" style={{ '--tone': tone.fg, '--tone-bg': tone.bg }}>
                                          <Icon name="repeat" size={11} /> With {partners.map((x) => x.subjectName).join(' + ') || '—'}
                                        </span>
                                      )}
                                      {sub.type === 'practical' && <span className="ttg-tag">Practical</span>}
                                      {!!sub.missingIn?.length && <span className="ttg-tag ttg-tag--bad">Not in every section</span>}
                                      {flag && <span className="ttg-tag ttg-tag--bad" title={flag.title}><Icon name="alert" size={11} /> {flag.text}</span>}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td>
                                {/* One dropdown cannot speak for several sections: each keeps
                                    its own subject teacher, so it is offered for one section only. */}
                                {scopeCount > 1 ? (
                                  sub.teachers.length
                                    ? <span className="ttg-teacher">{sub.teachers.map((t) => t.name).join(', ')}</span>
                                    : <span className="ttg-teacher ttg-teacher--none">No teacher assigned</span>
                                ) : !sub.teachers.length ? (
                                  <span className="ttg-teacher ttg-teacher--none"
                                    title="Assign a subject teacher on the section page">No teacher assigned</span>
                                ) : (
                                  <select className="form-control" value={rule.teacher || ''} aria-label={`${sub.subjectName} teacher`}
                                    onChange={(e) => patchRule(sub._id, { teacher: e.target.value || null })}>
                                    <option value="">No teacher</option>
                                    {sub.teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
                                  </select>
                                )}
                              </td>
                              <td className="is-num">
                                <Stepper value={rule.weeklyPeriods ?? 0} label={`${sub.subjectName} periods per week`}
                                  onChange={(n) => setPeriods(sub._id, n)} />
                              </td>
                              <td className="is-end">
                                <button type="button" className="ttg-iconbtn" title={`${sub.subjectName} scheduling rules`}
                                  aria-label={`${sub.subjectName} scheduling rules`} onClick={() => setTuning(sub._id)}>
                                  <Icon name="sliders" size={16} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="ttg-planbar">
                    <button type="button" className="btn btn-secondary btn-sm" disabled={picked.length < 2} onClick={mergePicked}>
                      <Icon name="repeat" size={14} /> Share periods{picked.length ? ` (${picked.length})` : ''}
                    </button>
                    {[...groups.entries()].map(([key, members]) => (
                      <span key={key} className="ttg-group" style={{ '--tone': groupTone[key].fg }}>
                        <b>{members.map((m) => m.subjectName).join(' + ')}</b>
                        <span>{periodsOf(members[0]?._id)}×/week</span>
                        <button type="button" onClick={() => unmerge(key)} title="Stop sharing periods" aria-label="Unmerge">
                          <Icon name="close" size={12} />
                        </button>
                      </span>
                    ))}
                    {!groups.size && (
                      <span className="ttg-planbar__hint">Tick two or more subjects to teach them in the same period (e.g. a language choice).</span>
                    )}
                  </div>

                  {(remaining < 0 || lonelyGroups.length > 0) && (
                    <div style={{ padding: '0 22px 18px' }}>
                      <Note tone="bad">
                        {remaining < 0 && <>The plan needs <b>{assigned}</b> periods a week but the week has <b>{capacity}</b> — take {Math.abs(remaining)} away. </>}
                        {lonelyGroups.length > 0 && <>A shared-period group has only one subject — unmerge it or add a partner.</>}
                      </Note>
                    </div>
                  )}
                </div>
              )
            )}

            {/* ── Teacher & Rooms ──────────────────────────────────────── */}
            {ruleTab === 'staff' && (
              <Body>
                <div className="ttg-prefs">
                  {optionsIn('staff').map(([key, title, hint, icon]) => (
                    <button key={key} type="button" className="ttg-pref" aria-pressed={!!options[key]}
                      onClick={() => setOptions((o) => ({ ...o, [key]: !o[key] }))}>
                      <span className="ttg-pref__icon"><Icon name={icon} size={17} /></span>
                      <Switch on={!!options[key]} />
                      <span className="ttg-pref__body"><b>{title}</b><span>{hint}</span></span>
                    </button>
                  ))}
                </div>

                {!!check.busyTeachers?.length && (
                  <Note tone="info">
                    Already teaching other classes this week, so those periods are kept free:{' '}
                    {check.busyTeachers.map((t) => `${t.name} (${t.periodsElsewhere})`).join(', ')}.
                  </Note>
                )}

              </Body>
            )}

            {/* ── Combined Classes ─────────────────────────────────────
                 Sections that sit together for a subject. Its own tab rather
                 than a paragraph under Teacher & Rooms: it is a decision about
                 classes, and buried there nobody found it. */}
            {ruleTab === 'merges' && (
              <Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Note tone="info">
                    Sections that sit together for a subject — one teacher, one room, the same period
                    in every section. A language choice, a combined games period, two small sections
                    taught as one. Saved for the whole year, so they still apply when a section is
                    generated on its own.
                  </Note>

                  {scopeMode === 'all' ? (
                    <Note tone="warn">
                      Combinations are set one class at a time. Switch the scope to
                      <strong> Selected</strong>, pick the class, and its sections appear here —
                      whatever is already saved still applies to an all-classes run.
                    </Note>
                  ) : !selectedClass ? (
                    <PlanEmpty icon="layers" title="Choose a class first"
                      text="Its sections load here, and any combination already saved for them." />
                  ) : classSections.length < 2 ? (
                    <PlanEmpty icon="grid" title={`${selectedClass.className} has one section`}
                      text="There is nothing to combine it with. Combinations need two or more sections of the same class." />
                  ) : (
                    <>
                      {sectionMerges.length > 0 ? (
                        <div className="ttg-list">
                          {sectionMerges.map((m) => (
                            <div key={m._id} className="ttg-list__row">
                              <div className="ttg-list__main">
                                <b>{m.subjectName}</b> · {m.sections.map((x) => x.label).join(' + ')}
                                {(m.teacherName || m.roomName) && (
                                  <div className="ttg-list__sub">{[m.teacherName, m.roomName].filter(Boolean).join(' · ')}</div>
                                )}
                              </div>
                              <button type="button" className="btn btn-secondary btn-sm" disabled={mergeBusy}
                                onClick={() => removeSectionMerge(m._id)}>Remove</button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Note tone="quiet">
                          No sections of {selectedClass.className} are combined yet. They are
                          timetabled independently.
                        </Note>
                      )}

                      <div className="ttg-addrow">
                        <div className="ttg-field">
                          <label className="ttg-label" htmlFor="ttg-merge-subject">Subject</label>
                          <select id="ttg-merge-subject" className="form-control" value={mergeDraft.subject}
                            onChange={(e) => setMergeDraft((d) => ({ ...d, subject: e.target.value }))}>
                            <option value="">Choose…</option>
                            {subjects.map((x) => <option key={x._id} value={x._id}>{x.subjectName}</option>)}
                          </select>
                        </div>
                        <div className="ttg-field">
                          <span className="ttg-label">Sections sitting together</span>
                          <div className="ttg-chips">
                            {classSections.map((x) => {
                              const on = mergeDraft.sections.includes(x._id);
                              return (
                                <button key={x._id} type="button" className={`ttg-chip${on ? ' is-on' : ''}`}
                                  onClick={() => setMergeDraft((d) => ({
                                    ...d, sections: on ? d.sections.filter((v) => v !== x._id) : [...d.sections, x._id],
                                  }))}>
                                  <span className="ttg-chip__tick"><Icon name="check" size={11} strokeWidth={3} /></span>
                                  {x.sectionName}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <button type="button" className="btn btn-secondary" onClick={addSectionMerge}
                          disabled={mergeBusy || !mergeDraft.subject || mergeDraft.sections.length < 2}>
                          {mergeBusy ? <Spinner size="sm" /> : <Icon name="plus" size={16} />} Combine
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </Body>
            )}

            {/* ── Advanced ─────────────────────────────────────────────── */}
            {ruleTab === 'advanced' && (
              <Body>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <Note tone="info">
                    The solver’s time budget, the school-wide hard limits and the optimiser weights
                    live on <a href="/admin/timetable/configuration">Configuration</a> — they apply to
                    every run of this academic year, not just this one.
                  </Note>

                  {run && !running && REPLACEABLE.includes(run.status) && !run.isDeleted && (
                    <label className="ttg-run__replace" style={{ margin: 0 }}>
                      <input type="checkbox" checked={replaceOld} onChange={(e) => setReplaceOld(e.target.checked)} />
                      When I regenerate, replace this attempt so it doesn&rsquo;t stay under Versions
                    </label>
                  )}

                  {check.report?.problems?.length > 0 && (
                    <div>
                      <strong style={{ fontSize: '.9rem' }}>Everything the dry run found</strong>
                      <div className="ttg-issues" style={{ marginTop: 8 }}>
                        {check.report.problems.map((x) => (
                          <div key={x.key}>{x.title}<small>{x.detail}</small></div>
                        ))}
                      </div>
                    </div>
                  )}

                  {check.error && <Note tone="warn">Could not check the plan: {check.error}</Note>}
                </div>
              </Body>
            )}
          </Card>
        </div>

        {/* ══ 3 & 4. Summary, checks, and the button ═══════════════════════ */}
        <aside className="tt-rail">
          <Panel icon="fileDoc" title="Generation Summary">
            <KV icon="calendar" k="Academic Year"
              v={meta?.years?.find((y) => String(y._id) === yearId)?.yearName || '—'} />
            <KV icon="layers" k="Classes"
              v={scopeMode === 'all' ? `${totalClasses} (all)` : (selectedClass ? selectedClass.className : '—')} />
            <KV icon="grid" k="Sections" v={totalSections || '—'} />
            <KV icon="calendarDays" k="Total periods to plan"
              v={plannedPeriods != null ? (plannedPeriods || '—') : 'Per section requirements'} />
            <KV icon="book" k="Subjects"
              v={scopeMode === 'all' ? (meta?.subjects?.length ?? '—') : (subjects.length || 'To be calculated')} />
            {scopeMode === 'picked' && plan && (
              <>
                {/* What the plan on screen adds up to. Without this the rail
                    described the scope and said nothing about the work. */}
                <KV icon="calendarDays" k="Periods planned"
                  v={<span style={{ color: remaining < 0 ? 'var(--danger)' : remaining === 0 ? 'var(--success)' : 'inherit' }}>
                    {assigned} of {capacity}
                  </span>} />
                {groups.size > 0 && (
                  <KV icon="repeat" k="Subjects sharing periods"
                    v={`${plural(groups.size, 'group')} · ${[...groups.values()].reduce((n, g) => n + g.length, 0)} subjects`} />
                )}
                <KV icon="grid" k="Combined classes"
                  v={sectionMerges.length || <span className="tt-table__muted">None</span>} />
              </>
            )}
            <KV icon="users" k="Teachers" v={meta?.teachers?.length ?? '—'} />
            <KV icon="building" k="Rooms" v={meta?.rooms?.length ?? '—'} />
          </Panel>

          <Note tone="info">
            This will create a new timetable version. Your current timetable will remain unchanged.
          </Note>

          <Panel icon="checkCircle" title="Validation Check">
            {checks.map((c, i) => (
              <Check key={i} state={c.state === 'ok' ? 'ok' : c.state === 'bad' ? 'bad' : 'warn'} hint={c.sub}>
                {c.text}
              </Check>
            ))}
            {!checks.length && (
              <span style={{ fontSize: '.84rem', color: 'var(--text-muted)' }}>
                Choose a scope and the checks start running.
              </span>
            )}
          </Panel>

          <Button onClick={() => start()} disabled={!canGenerate}
            style={{ width: '100%', height: 46, justifyContent: 'center' }}>
            {starting || running ? <Spinner size="sm" /> : <Icon name={run ? 'refresh' : 'wand'} size={18} />}
            {running ? 'Generating…' : run ? 'Regenerate Timetable' : 'Generate Timetable'}
          </Button>

          <Button variant="secondary" onClick={() => setPreview(true)}
            style={{ width: '100%', height: 42, justifyContent: 'center' }}>
            <Icon name="eye" size={16} /> Preview Rules
          </Button>

          <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', lineHeight: 1.5, textAlign: 'center' }}>
            {running
              ? 'The plan is locked until this run finishes.'
              : dryErrors
                ? `${plural(dryErrors, 'problem')} above will leave gaps — you can still generate and fix them after.`
                : run
                  ? 'Saves this plan and creates a new version. The one above stays until you replace it.'
                  : 'Saves this plan for the chosen sections and creates a new draft version. Nothing is published.'}
          </p>
        </aside>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────────── */}
      {tuning && rules[tuning] && (
        <SubjectRules
          subject={subjects.find((x) => x._id === tuning)}
          rule={rules[tuning]}
          teachers={subjects.find((x) => x._id === tuning)?.teachers || []}
          rooms={meta?.rooms || []}
          workingDays={days}
          perSectionTeachers={scopeCount > 1}
          periodsPerDay={Math.max(...(plan?.capacity?.breakdown || [{ periods: 8 }]).map((d) => d.periods))}
          onChange={(patch) => patchRule(tuning, patch)}
          onPeriods={(n) => setPeriods(tuning, n)}
          onClose={() => setTuning(null)}
        />
      )}

      <Modal open={confirmGo} onClose={() => setConfirmGo(false)} title="Generate with these problems?" maxWidth={540}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setConfirmGo(false)}>Fix them first</button>
          <button type="button" className="btn btn-primary" onClick={() => start(true)}>Generate anyway</button>
        </>}>
        <div className="ttg-modal">
          <p>The check found {plural(dryErrors, 'problem')} this plan will run into. The timetable will still be generated,
            but with gaps — and it can&rsquo;t be published until they&rsquo;re fixed.</p>
          <div className="ttg-issues">
            {(check.report?.problems || []).filter((x) => x.severity === 'error').map((x) => (
              <div key={x.key}>{x.title}<small>{x.detail}</small></div>
            ))}
          </div>
        </div>
      </Modal>

      {/* What the generator is actually being told to do. */}
      <Modal open={preview} onClose={() => setPreview(false)} maxWidth={620} title="The rules this run will use"
        footer={<Button variant="secondary" onClick={() => setPreview(false)}>Close</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <strong style={{ fontSize: '.9rem' }}>Always enforced</strong>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Check state="ok">One teacher, one place, one period</Check>
              <Check state="ok">One room, one class, one period</Check>
              <Check state="ok">Blocked availability and room slots are never used</Check>
              <Check state="ok">Every subject gets the weekly periods its plan asks for</Check>
              <Check state="ok">Practicals claim a lab where one is required</Check>
            </div>
          </div>
          <div>
            <strong style={{ fontSize: '.9rem' }}>Pursued afterwards</strong>
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {OPTIONS.map(([key, title]) => (
                <Check key={key} state={options[key] ? 'ok' : 'warn'}>
                  {title}{options[key] ? '' : ' — off'}
                </Check>
              ))}
            </div>
          </div>
          {scopeMode === 'picked' && subjects.length > 0 && (
            <div>
              <strong style={{ fontSize: '.9rem' }}>This class’s plan</strong>
              <div className="tt-tablewrap" style={{ marginTop: 8, maxHeight: 240, overflowY: 'auto' }}>
                <table className="tt-table">
                  <thead><tr><th>Subject</th><th>Periods</th><th>Rules</th></tr></thead>
                  <tbody>
                    {orderedSubjects.filter((x) => periodsOf(x._id) > 0).map((x) => (
                      <tr key={x._id}>
                        <td>{x.subjectName}</td>
                        <td className="tt-num">{periodsOf(x._id)}</td>
                        <td className="tt-table__muted">{ruleSummary(rules[x._id] || {}, days, meta?.rooms)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* How the screen is meant to be used. */}
      <Modal open={guide} onClose={() => setGuide(false)} maxWidth={620} title="How generation works"
        footer={<Button variant="secondary" onClick={() => setGuide(false)}>Got it</Button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: '.88rem', lineHeight: 1.6 }}>
          <p>
            <strong>1. Choose the scope.</strong> Sections solved together never clash with each
            other, so generating a whole class — or the whole school — beats doing one section at a
            time. All Classes uses each section’s saved requirements; Selected lets you edit one
            class’s plan here first.
          </p>
          <p>
            <strong>2. Set the rules.</strong> Give every subject its periods a week under Subject
            Distribution. The toggles decide what the optimiser improves once the hard rules hold —
            they never make an impossible timetable possible.
          </p>
          <p>
            <strong>3. Read the checks.</strong> The rail runs a dry run against the real staff and
            rooms. It finds a teacher with more periods than free time, or a subject with nobody to
            teach it, before you wait for a run.
          </p>
          <p>
            <strong>4. Generate.</strong> A new version is created; the timetable in use is
            untouched until you publish it from Versions. Anything the run flags is listed above the
            plan, each with the change that fixes it.
          </p>
          <Note tone="info">
            Nothing here publishes anything. Generating as many times as you like costs the school
            nothing but a row under Versions.
          </Note>
        </div>
      </Modal>

      {/* Saved rule sets, shared with the Configuration screen. */}
      <Modal open={!!templates} onClose={() => setTemplates(null)} maxWidth={480}
        title={templates?.mode === 'save' ? 'Save these preferences' : 'Load a saved rule set'}
        footer={templates?.mode === 'save' ? (
          <>
            <Button variant="secondary" onClick={() => setTemplates(null)}>Cancel</Button>
            <Button loading={templates?.saving} onClick={saveTemplate}>Save</Button>
          </>
        ) : <Button variant="secondary" onClick={() => setTemplates(null)}>Close</Button>}>
        {templates?.mode === 'save' ? (
          <Field label="Name it" hint="e.g. “Normal term”, “Exam term”">
            <input className="form-control" value={templates.name} maxLength={60} autoFocus
              onChange={(e) => setTemplates((t) => ({ ...t, name: e.target.value }))} />
          </Field>
        ) : !templates?.list?.length ? (
          <Note tone="info">
            No rule sets saved for this year yet. Save the preferences you like and they will be
            here — and on the Configuration screen — next term.
          </Note>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {templates.list.map((t, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px',
                border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
              }}>
                <Icon name="fileDoc" size={17} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: '.88rem' }}>{t.name}</strong>
                  <div style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>
                    {t.options ? 'Generator preferences' : 'Limits and weights only'}
                    {' · '}{new Date(t.savedAt).toLocaleDateString('en-IN')}
                  </div>
                </div>
                <Button size="sm" variant="secondary" disabled={!t.options} onClick={() => applyTemplate(t)}>
                  Load
                </Button>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── The latest run: progress, then the outcome and its problems ──────────── */
function RunResult({ run, dirty, starting, canGenerate, replaceOld, onReplaceOld, onRegenerate, onReview, onFix }) {
  const p = run.progress || {};

  if (run.status === 'generating') {
    return (
      <div className="ttg-run">
        <div className="ttg-run__top">
          <div className="ttg-run__icon ttg-run__icon--busy"><Icon name="refresh" size={22} /></div>
          <div className="ttg-run__title">
            <h2>Generating {run.label}…</h2>
            <p>{run.replacing ? `Will replace ${run.replacing} when it finishes. ` : ''}It runs on the server — you can leave this page and find it under Versions.</p>
          </div>
          <strong style={{ fontSize: '1.1rem', fontVariantNumeric: 'tabular-nums' }}>{p.percent || 0}%</strong>
        </div>
        <ProgressBar percent={p.percent} />
        {!!p.steps?.length && <RunSteps steps={p.steps} />}
      </div>
    );
  }

  if (run.status === 'failed') {
    return (
      <div className="ttg-run">
        <div className="ttg-run__top">
          <div className="ttg-run__icon ttg-run__icon--bad"><Icon name="closeCircle" size={24} /></div>
          <div className="ttg-run__title">
            <h2>{run.label} <StatusPill status="failed" /></h2>
            <p>The run stopped before it finished{p.error ? `: ${p.error}` : '.'}</p>
          </div>
          <div className="ttg-run__acts">
            <button type="button" className="btn btn-primary" disabled={!canGenerate} onClick={onRegenerate}>
              {starting ? <Spinner size="sm" /> : <Icon name="refresh" size={16} />} Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stats = run.stats || {};
  const errors = run.report?.summary?.errors ?? run.errorCount ?? 0;
  const replaceable = REPLACEABLE.includes(run.status) && !run.isDeleted;
  const placedTone = stats.periodsRequired && stats.entriesGenerated < stats.periodsRequired ? 'warn' : 'good';

  return (
    <div className="ttg-run">
      <div className="ttg-run__top">
        <div className={`ttg-run__icon ttg-run__icon--${errors ? 'warn' : 'good'}`}>
          <Icon name={errors ? 'alert' : 'checkCircle'} size={24} />
        </div>
        <div className="ttg-run__title">
          <h2>
            {run.label}
            <StatusPill status={run.status} />
            {dirty && <span className="ttg-tag ttg-tag--warn">Plan changed since this run</span>}
          </h2>
          <p>
            {run.isDeleted
              ? 'This attempt was replaced by a newer run — see Versions.'
              : errors
                ? 'Generated with gaps. Fix the problems below, then regenerate.'
                : 'Generated. Review it in the grid, adjust anything by hand, then publish.'}
            {run.generatedAt ? ` · ${fmtWhen(run.generatedAt)}` : ''}
          </p>
        </div>
        <div className="ttg-run__acts">
          <button type="button" className={`btn ${errors || dirty ? 'btn-secondary' : 'btn-primary'}`} onClick={onReview} disabled={run.isDeleted}>
            Review timetable <Icon name="arrowRight" size={16} />
          </button>
          <button type="button" className={`btn ${errors || dirty ? 'btn-primary' : 'btn-secondary'}`} disabled={!canGenerate} onClick={onRegenerate}>
            {starting ? <Spinner size="sm" /> : <Icon name="refresh" size={16} />} Regenerate
          </button>
        </div>
      </div>

      <Figures items={[
        { label: 'Periods placed', value: stats.entriesGenerated ?? '—', unit: stats.periodsRequired ? `/ ${stats.periodsRequired}` : '', tone: stats.periodsRequired ? placedTone : '' },
        { label: 'Plan met', value: stats.satisfaction != null ? `${stats.satisfaction}%` : '—', tone: stats.satisfaction >= 100 ? 'good' : stats.satisfaction != null ? 'warn' : '' },
        { label: 'Problems', value: errors, tone: errors ? 'bad' : 'good' },
        { label: 'Sections', value: stats.classesProcessed ?? '—' },
        { label: 'Time taken', value: fmtSeconds(stats.generationTimeMs) },
      ]} />

      <Verdict report={run.report} />

      {replaceable && errors > 0 && (
        <label className="ttg-run__replace">
          <input type="checkbox" checked={replaceOld} onChange={(e) => onReplaceOld(e.target.checked)} />
          When I regenerate, replace this attempt so it doesn&rsquo;t stay under Versions
        </label>
      )}

      <ProblemList report={run.report} onFix={onFix} />
    </div>
  );
}

function PlanCapacity({ capacity, assigned, subjects, rules, merges }) {
  const over = assigned > capacity;
  const scale = Math.max(capacity, assigned) || 1;
  const counted = new Set();
  const segments = [];
  for (const s of subjects) {
    const key = merges[s._id];
    if (key) { if (counted.has(key)) continue; counted.add(key); }
    const n = Number(rules[s._id]?.weeklyPeriods) || 0;
    if (n > 0) segments.push({ id: s._id, name: s.subjectName, n });
  }
  const free = capacity - assigned;
  return (
    <div className="ttg-cap" style={{ width: 280, maxWidth: '100%' }}>
      <div className="ttg-cap__row">
        <span><b>{assigned}</b> of {capacity} planned</span>
        <span className={`ttg-cap__state ttg-cap__state--${over ? 'bad' : free === 0 ? 'good' : 'warn'}`}>
          {over ? `${-free} over` : free === 0 ? 'Week full' : `${free} free`}
        </span>
      </div>
      <div className={`ttg-cap__bar${over ? ' is-over' : ''}`}>
        {segments.map((seg) => (
          <i key={seg.id} title={`${seg.name}: ${seg.n}`}
            style={{ width: `${(seg.n / scale) * 100}%`, background: subjectColor(seg.id).fg }} />
        ))}
      </div>
    </div>
  );
}

const PlanEmpty = ({ icon, title, text }) => (
  <div className="ttg-empty">
    <div className="ttg-empty__icon"><Icon name={icon} size={24} /></div>
    <b>{title}</b>
    <p>{text}</p>
  </div>
);

/* One line summarising a subject's rules for its row. */
function ruleSummary(rule, days, rooms) {
  const perDayFloor = Math.max(rule.consecutivePeriods || 1, Math.ceil((rule.weeklyPeriods || 0) / Math.max(1, days.length)));
  const perDay = Math.max(rule.maxPerDay || 1, perDayFloor);
  const room = rule.requiresRoom
    ? (rule.room ? (rooms || []).find((r) => r._id === rule.room)?.roomName || 'A set room' : (rule.roomTypes?.length ? rule.roomTypes.join('/') : 'Special room'))
    : '';
  return [
    `Up to ${perDay} a day`,
    rule.consecutivePeriods > 1 && `${rule.consecutivePeriods} in a row`,
    // Practical already shows as a tag beside the name.
    rule.subjectType && !['Theory', 'Practical'].includes(rule.subjectType) && rule.subjectType,
    room,
    (rule.preferredDays?.length || rule.preferredPeriods?.length) && 'Preferences',
  ].filter(Boolean).join(' · ');
}

/* A plan row starts from what was saved for this class, or sane defaults. */
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

/* ── Scheduling rules for one subject ─────────────────────────────────────
   Hard rules first; preferences — optimised for, never enforced — last, so
   nothing at the bottom of this dialog can make a timetable impossible. */
function SubjectRules({ subject, rule, teachers, rooms, workingDays, periodsPerDay, perSectionTeachers, onChange, onPeriods, onClose }) {
  const toggle = (key, value) => {
    const list = rule[key] || [];
    onChange({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] });
  };
  const nDays = Math.max(1, workingDays.length);
  const minPerDay = Math.max(rule.consecutivePeriods || 1, Math.ceil((rule.weeklyPeriods || 0) / nDays));
  const num = (v, lo, hi, dflt) => Math.max(lo, Math.min(hi, Number(v) || dflt));

  return (
    <Modal open onClose={onClose} title={`${subject?.subjectName || 'Subject'} — scheduling rules`} maxWidth={660}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="ttg-modal">
        <div className="ttg-form">
          <div className="ttg-form__section">Every week</div>
          <div className="ttg-field">
            <label className="ttg-label">Periods per week</label>
            <Stepper value={rule.weeklyPeriods} label="Periods per week" onChange={onPeriods} />
          </div>
          <div className="ttg-field">
            <label className="ttg-label" htmlFor="rule-type">Subject type</label>
            <select id="rule-type" className="form-control" value={rule.subjectType} onChange={(e) => onChange({ subjectType: e.target.value })}>
              {SUBJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="form-hint">Practical and Laboratory subjects claim a lab room.</span>
          </div>
          <div className="ttg-field">
            <label className="ttg-label">Most periods in one day</label>
            <Stepper value={rule.maxPerDay} min={1} max={12} label="Most periods in one day" onChange={(n) => onChange({ maxPerDay: n })} />
            {minPerDay > (rule.maxPerDay || 1)
              ? <span className="form-hint" style={{ color: '#b45309' }}>{rule.weeklyPeriods} periods over {nDays} days needs at least {minPerDay} a day — it is raised to {minPerDay} when generating.</span>
              : <span className="form-hint">Treated as a hard limit unless switched off below.</span>}
          </div>
          <div className="ttg-field">
            <label className="ttg-label">Periods in a row</label>
            <Stepper value={rule.consecutivePeriods} min={1} max={4} label="Periods in a row" onChange={(n) => onChange({ consecutivePeriods: n })} />
            <span className="form-hint">2 places back-to-back pairs, as labs usually need.</span>
          </div>
          <label className="ttg-tick ttg-field--wide">
            <input type="checkbox" checked={rule.hardMaxPerDay !== false} onChange={(e) => onChange({ hardMaxPerDay: e.target.checked })} />
            <span>Never go over the daily limit<small>Off: the limit becomes a preference the optimiser may break.</small></span>
          </label>

          <div className="ttg-form__section">Teachers</div>
          <div className="ttg-field ttg-field--wide">
            <span className="ttg-label">Alternate teachers {perSectionTeachers && <em>— each section keeps its own subject teacher first</em>}</span>
            <div className="ttg-checkgrid">
              {teachers.filter((t) => t._id !== rule.teacher).map((t) => (
                <label key={t._id}>
                  <input type="checkbox" checked={(rule.altTeachers || []).includes(t._id)} onChange={() => toggle('altTeachers', t._id)} />
                  {t.name}
                </label>
              ))}
              {!teachers.filter((t) => t._id !== rule.teacher).length && (
                <span className="form-hint">No other teacher is assigned to this subject in these sections.</span>
              )}
            </div>
            <span className="form-hint">Used when the main teacher is busy or already at their limit.</span>
          </div>

          <div className="ttg-form__section">Room</div>
          <label className="ttg-tick ttg-field--wide">
            <input type="checkbox" checked={!!rule.requiresRoom} onChange={(e) => onChange({ requiresRoom: e.target.checked })} />
            <span>Needs a specific room or lab</span>
          </label>
          {rule.requiresRoom && (
            <>
              <div className="ttg-field ttg-field--wide">
                <label className="ttg-label" htmlFor="rule-room">Always this room</label>
                <select id="rule-room" className="form-control" value={rule.room || ''} onChange={(e) => onChange({ room: e.target.value })}>
                  <option value="">Any suitable room</option>
                  {rooms.map((r) => <option key={r._id} value={r._id}>{r.roomName} ({r.roomType})</option>)}
                </select>
              </div>
              {!rule.room && (
                <div className="ttg-field ttg-field--wide">
                  <span className="ttg-label">Suitable room types</span>
                  <div className="ttg-toggles">
                    {ROOM_TYPES.map((t) => (
                      <button key={t} type="button" className={`ttg-toggle${(rule.roomTypes || []).includes(t) ? ' is-on' : ''}`}
                        onClick={() => toggle('roomTypes', t)}>{t}</button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <div className="ttg-form__section">Preferences — never enforced</div>
          <div className="ttg-field">
            <label className="ttg-label">Difficulty</label>
            <Stepper value={rule.difficulty} min={1} max={5} label="Difficulty" onChange={(n) => onChange({ difficulty: n })} />
            <span className="form-hint">1 easy – 5 hard. Hard subjects stay out of the last period.</span>
          </div>
          <div className="ttg-field">
            <label className="ttg-label">Gap between its periods in a day</label>
            <Stepper value={rule.minGapPeriods} min={0} max={8} label="Minimum gap" onChange={(n) => onChange({ minGapPeriods: n })} />
            <span className="form-hint">0 lets them sit next to each other.</span>
          </div>
          <div className="ttg-field ttg-field--wide">
            <span className="ttg-label">Preferred days</span>
            <div className="ttg-toggles">
              {workingDays.map((d) => (
                <button key={d} type="button" className={`ttg-toggle${(rule.preferredDays || []).includes(d) ? ' is-on' : ''}`}
                  onClick={() => toggle('preferredDays', d)}>{DAY_SHORT[d] || d}</button>
              ))}
            </div>
          </div>
          <div className="ttg-field ttg-field--wide">
            <span className="ttg-label">Preferred periods</span>
            <div className="ttg-toggles">
              {Array.from({ length: Math.max(1, periodsPerDay) }, (_, i) => i + 1).map((pn) => (
                <button key={pn} type="button" className={`ttg-toggle${(rule.preferredPeriods || []).includes(pn) ? ' is-on' : ''}`}
                  onClick={() => toggle('preferredPeriods', pn)}>P{pn}</button>
              ))}
            </div>
          </div>
          <div className="ttg-field">
            <label className="ttg-label" htmlFor="rule-priority">Placement priority</label>
            <input id="rule-priority" type="number" className="form-control" value={rule.priority}
              onChange={(e) => onChange({ priority: num(e.target.value, -99, 99, 0) })} />
            <span className="form-hint">Higher is placed earlier and gets the best slots.</span>
          </div>
        </div>
      </div>
    </Modal>
  );
}
