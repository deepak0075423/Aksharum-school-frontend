/**
 * Admin → Timetable → Section Editor.
 *
 * One section's week, built by hand. The module's other screens generate,
 * version and report on timetables; this is the one where somebody sits down
 * and says "Monday period 1 is English with Ms Sharma".
 *
 * Four steps, in the order the work actually happens:
 *   1  Class & section   whose week this is
 *   2  Periods           when the bells go — the section's own grid, or the
 *                        school-wide one from Configuration
 *   3  Subjects          the grid itself: drag a subject onto a slot, or click
 *                        a slot to choose subject, teacher, a split period and
 *                        the sections taught alongside it
 *   4  Review            what is about to be written, and what is still missing
 *
 * Nothing is saved until Save Timetable, and the server refuses a save that
 * would double-book a teacher or a room — that refusal is shown as the list of
 * clashes, with the option to overrule it.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import {
  getClassesWithSections, getSubjects, getSchoolSettings, getAcademicYears,
  getSectionTimetable, saveTimetableStructure,
  getSectionEntries, saveTimetableEntries,
  getSectionSubjectTeachers, getTimetableTeachers,
  downloadSectionTimetable, downloadAllTimetables,
} from '../../api/admin.api';
import * as ttApi from '../../api/timetable.api';
import { Modal, Button, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  TtHead, YearPicker, Card, Body, Filters, Field, Pick, Seg, Steps, Search,
  Chip, Note, Panel, Loading, plural, duration, timeRange, toneFor, TONE_BG, TONE_INK,
} from '../timetable/admin/ttUI';
import {
  DAYS, defaultPeriods, isTeaching, gridMinutes,
  PeriodStructure, CellModal, AutoFillModal, CopyModal, ImportModal, FullWeekModal, ReviewPanel,
} from '../timetable/admin/editorParts';

const unwrap = (res) => res?.data ?? res;

const STEPS = [
  { key: 'scope',   title: 'Select Class & Section', hint: 'Choose class, section and view' },
  { key: 'periods', title: 'Configure Periods',      hint: 'Set time slots and breaks' },
  { key: 'grid',    title: 'Assign Subjects',        hint: 'Create your timetable' },
  { key: 'review',  title: 'Review & Save',          hint: 'Check and publish' },
];

function blobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/** A rough fill of this section's empty week. Deliberately not the solver. */
function scatter(subjects, perWeek, days, periods) {
  const slots = [];
  for (const day of days) for (const p of periods.filter(isTeaching)) slots.push({ day, period: p.periodNumber });
  const queue = [];
  for (const s of subjects) for (let i = 0; i < (perWeek[s._id] || 0); i++) queue.push(s);
  for (let i = queue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [queue[i], queue[j]] = [queue[j], queue[i]];
  }
  const out = {};
  let q = 0;
  for (const slot of slots) {
    if (q >= queue.length) break;
    const s = queue[q++];
    out[`${slot.day}-${slot.period}`] = {
      subject: s._id, teacher: s.teacher?._id || '',
      subjectName: s.subjectName || '', teacherName: s.teacher?.name || '',
      additionalSubjects: [], mergedSections: [],
    };
  }
  return out;
}

export default function AdminTimetable() {
  /* ── What we are looking at ────────────────────────────────────────────── */
  const [years, setYears]       = useState([]);
  const [yearId, setYearId]     = useState('');
  const [classes, setClasses]   = useState([]);
  const [classId, setClassId]   = useState('');
  const [sectionId, setSectionId] = useState('');
  const [view, setView]         = useState('week');       // week | day
  const [day, setDay]           = useState('Monday');
  const [step, setStep]         = useState('scope');
  const [booting, setBooting]   = useState(true);

  /* ── The section's own data ────────────────────────────────────────────── */
  const [ttId, setTtId]           = useState(null);
  const [loadingSection, setLoad] = useState(false);
  const [cells, setCells]         = useState({});
  const [subjects, setSubjects]   = useState([]);
  const [saturday, setSaturday]   = useState({ working: true, halfDay: false, mode: 'all' });
  const [form, setForm]           = useState({ schoolStartTime: '', schoolEndTime: '', periods: defaultPeriods() });
  const [autoCalc, setAutoCalc]   = useState({ totalPeriods: 8, lunchTimeTotalInMinutes: 30, lunchAfterPeriod: 4 });
  const [dirty, setDirty]         = useState(false);

  /* ── Editing ───────────────────────────────────────────────────────────── */
  const [edit, setEdit]       = useState(null);           // { day, period }
  const [modal, setModal]     = useState({ subject: '', teacher: '', extra: [], merged: [] });
  const [teacherOpts, setTeacherOpts]   = useState([]);
  const [teacherBusy, setTeacherBusy]   = useState(false);
  const [extraOpts, setExtraOpts]       = useState([]);
  const [extraBusy, setExtraBusy]       = useState([]);
  const [armed, setArmed]     = useState(null);           // subject clicked in the rail
  const [dragOver, setDragOver] = useState(null);
  const [palette, setPalette] = useState('');

  /* ── Things that open on top ───────────────────────────────────────────── */
  const [saving, setSaving]     = useState(false);
  const [structSaving, setStructSaving] = useState(false);
  const [blocked, setBlocked]   = useState(null);         // the save the server refused
  const [autofill, setAutofill] = useState(null);         // { subjects, ppw, days }
  const [copying, setCopying]   = useState(false);
  const [importing, setImporting] = useState(null);       // { versions, loading }
  const [fullWeek, setFullWeek] = useState(null);
  const [busy, setBusy]         = useState('');
  const [menu, setMenu]         = useState(false);
  const menuRef = useRef(null);

  /* ── Boot ──────────────────────────────────────────────────────────────── */
  useEffect(() => {
    (async () => {
      try {
        const [y, c, s] = await Promise.all([
          getAcademicYears(), getClassesWithSections(true), getSchoolSettings(),
        ]);
        const yr = unwrap(y) || [];
        setYears(yr);
        setClasses(unwrap(c) || []);
        const ls = unwrap(s)?.leaveSettings;
        if (ls) {
          setSaturday({
            working: ls.saturdayWorking !== false,
            mode: ls.saturdayMode || 'all',
            halfDay: !!ls.saturdayHalfDay,
          });
        }
        const active = yr.find((x) => x.status === 'active') || yr[0];
        if (active) setYearId(String(active._id));
      } catch (e) { toast.error(e.message || 'Could not load the timetable module'); }
      finally { setBooting(false); }
    })();
  }, []);

  // Close the More-options menu on any click outside it.
  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);

  const klass = classes.find((c) => String(c._id) === classId);
  const sections = useMemo(() => klass?.sections || [], [klass]);
  const section = useMemo(() => {
    const s = sections.find((x) => String(x._id) === sectionId);
    return s ? { ...s, className: klass.className, classId: klass._id } : null;
  }, [sections, sectionId, klass]);

  const periods = form.periods.length ? form.periods : defaultPeriods();
  const days = useMemo(() => DAYS.filter((d) => d !== 'Saturday' || saturday.working), [saturday.working]);
  const teaching = periods.filter(isTeaching);
  const slotCount = teaching.length * days.length;
  const filled = Object.values(cells).filter((c) => c?.subject).length;
  const mins = gridMinutes(periods);

  /* ── Load one section ──────────────────────────────────────────────────── */
  const loadSection = useCallback(async (secId, yid) => {
    if (!secId) return;
    setLoad(true);
    setCells({});
    setTtId(null);
    setEdit(null);
    setDirty(false);
    try {
      const [ttRes, entryRes, subjRes] = await Promise.all([
        getSectionTimetable(secId, yid),
        getSectionEntries(secId, yid),
        getSectionSubjectTeachers(secId).catch(() => ({ data: [] })),
      ]);
      const tt = unwrap(ttRes);
      const entries = unwrap(entryRes) || [];

      const seen = new Set();
      setSubjects((unwrap(subjRes) || [])
        .map((row) => ({
          _id: row.subject?._id || row.subject,
          subjectName: row.subject?.subjectName || row.subject?.name || '',
          teacher: row.teacher ? { _id: row.teacher._id, name: row.teacher.name } : null,
        }))
        .filter((s) => s._id && !seen.has(s._id) && seen.add(s._id)));

      setForm({
        schoolStartTime: tt?.schoolStartTime || '',
        schoolEndTime: tt?.schoolEndTime || '',
        periods: tt?.periodsStructure?.length ? tt.periodsStructure : defaultPeriods(),
      });
      if (tt?.saturdayConfig) setSaturday(tt.saturdayConfig);
      setTtId(tt?._id || null);

      const map = {};
      for (const e of entries) {
        map[`${e.dayOfWeek}-${e.periodNumber}`] = {
          subject: e.subject?._id || '',
          teacher: e.teacher?._id || '',
          subjectName: e.subject?.subjectName || '',
          teacherName: e.teacher?.name || '',
          additionalSubjects: (e.additionalSubjects || []).map((a) => ({
            subject: a.subject?._id || '', teacher: a.teacher?._id || '',
            subjectName: a.subject?.subjectName || '', teacherName: a.teacher?.name || '',
          })),
          mergedSections: (e.mergedSections || []).map((m) => m?._id || m).filter(Boolean),
        };
      }
      setCells(map);
      setStep((cur) => (cur === 'scope' ? 'grid' : cur));
    } catch (e) { toast.error(e.message || 'Could not load this section'); }
    finally { setLoad(false); }
  }, []);

  useEffect(() => { if (sectionId && yearId) loadSection(sectionId, yearId); }, [sectionId, yearId, loadSection]);

  const chooseClass = (id) => {
    setClassId(id);
    const k = classes.find((c) => String(c._id) === id);
    const only = k?.sections?.length === 1 ? String(k.sections[0]._id) : '';
    setSectionId(only);
    if (!only) { setCells({}); setStep('scope'); }
  };

  /* ── The grid ──────────────────────────────────────────────────────────── */
  const setCell = (key, value) => {
    setCells((prev) => {
      const next = { ...prev };
      if (value) next[key] = value; else delete next[key];
      return next;
    });
    setDirty(true);
  };

  const place = (key, subject) => {
    setCell(key, {
      subject: subject._id, teacher: subject.teacher?._id || '',
      subjectName: subject.subjectName, teacherName: subject.teacher?.name || '',
      additionalSubjects: [], mergedSections: [],
    });
  };

  const openCell = async (d, period) => {
    const cur = cells[`${d}-${period}`] || {};
    const extra = cur.additionalSubjects || [];
    setModal({ subject: cur.subject || '', teacher: cur.teacher || '', extra, merged: cur.mergedSections || [] });
    setTeacherOpts([]);
    setExtraOpts(extra.map(() => []));
    setExtraBusy(extra.map(() => false));
    setEdit({ day: d, period });

    if (cur.subject) loadTeachers(cur.subject, d, period);
    if (extra.length) {
      const lists = await Promise.all(extra.map((e) => (e.subject
        ? getTimetableTeachers({ subjectId: e.subject, day: d, period, timetableId: ttId, sectionId })
          .then((r) => unwrap(r) || []).catch(() => [])
        : Promise.resolve([]))));
      setExtraOpts(lists);
    }
  };

  const loadTeachers = async (subjectId, d, period) => {
    setTeacherBusy(true);
    try {
      const res = await getTimetableTeachers({ subjectId, day: d, period, timetableId: ttId, sectionId });
      setTeacherOpts(unwrap(res) || []);
    } catch { setTeacherOpts([]); }
    finally { setTeacherBusy(false); }
  };

  const onModalSubject = (id) => {
    setModal((m) => ({ ...m, subject: id, teacher: '' }));
    setTeacherOpts([]);
    if (id && edit) loadTeachers(id, edit.day, edit.period);
  };

  const onExtraSubject = async (i, subjectId) => {
    if (!subjectId || !edit) return;
    setExtraBusy((p) => { const n = [...p]; n[i] = true; return n; });
    try {
      const res = await getTimetableTeachers({
        subjectId, day: edit.day, period: edit.period, timetableId: ttId, sectionId,
      });
      setExtraOpts((p) => { const n = [...p]; n[i] = unwrap(res) || []; return n; });
    } catch {
      setExtraOpts((p) => { const n = [...p]; n[i] = []; return n; });
    } finally {
      setExtraBusy((p) => { const n = [...p]; n[i] = false; return n; });
    }
  };

  const saveCell = () => {
    if (!edit) return;
    const key = `${edit.day}-${edit.period}`;
    if (!modal.subject) { setCell(key, null); setEdit(null); return; }

    const ids = [modal.subject, ...modal.extra.filter((e) => e.subject).map((e) => e.subject)];
    if (new Set(ids).size !== ids.length) {
      toast.error('The same subject cannot appear twice in one period');
      return;
    }
    const subject = subjects.find((s) => s._id === modal.subject);
    const teacher = teacherOpts.find((t) => t._id === modal.teacher);
    setCell(key, {
      subject: modal.subject,
      teacher: modal.teacher,
      subjectName: subject?.subjectName || '',
      teacherName: teacher?.name || '',
      additionalSubjects: modal.extra.filter((e) => e.subject).map((e, i) => {
        const es = subjects.find((s) => s._id === e.subject);
        const et = (extraOpts[i] || []).find((t) => t._id === e.teacher);
        return { subject: e.subject, teacher: e.teacher, subjectName: es?.subjectName || '', teacherName: et?.name || '' };
      }),
      mergedSections: modal.merged.filter(Boolean),
    });
    setEdit(null);
  };

  /* ── Saving ────────────────────────────────────────────────────────────── */
  const save = async (force = false) => {
    if (!sectionId) return;
    setSaving(true);
    try {
      const entries = [];
      for (const d of DAYS) {
        for (const p of teaching) {
          const cell = cells[`${d}-${p.periodNumber}`];
          if (!cell?.subject) continue;
          entries.push({
            dayOfWeek: d, periodNumber: p.periodNumber,
            subject: cell.subject, teacher: cell.teacher || null,
            additionalSubjects: (cell.additionalSubjects || []).filter((a) => a.subject),
            mergedSections: (cell.mergedSections || []).filter(Boolean),
          });
        }
      }
      const res = await saveTimetableEntries(sectionId, {
        entries, yearId: yearId || undefined, ...(force ? { force: true } : {}),
      });
      if (unwrap(res)?.timetableId && !ttId) setTtId(String(unwrap(res).timetableId));
      setBlocked(null);
      setDirty(false);
      const warnings = (unwrap(res)?.conflicts || []).filter((c) => c.severity === 'warning');
      if (force) toast.success('Saved, clashes and all');
      else if (warnings.length) toast.success(`Saved — ${plural(warnings.length, 'thing')} worth a look`);
      else toast.success('Timetable saved');
    } catch (e) {
      if (e?.status === 409 && e?.data?.data?.conflicts) setBlocked(e.data.data.conflicts);
      else toast.error(e?.data?.message || e.message || 'Could not save');
    } finally { setSaving(false); }
  };

  const saveStructure = async () => {
    if (!form.schoolStartTime || !form.schoolEndTime) return toast.error('Set the school start and end time first');
    if (form.schoolStartTime >= form.schoolEndTime) return toast.error('The day has to end after it starts');
    if (!teaching.length) return toast.error('Add at least one teaching period');
    setStructSaving(true);
    try {
      const res = await saveTimetableStructure(sectionId, {
        schoolStartTime: form.schoolStartTime,
        schoolEndTime: form.schoolEndTime,
        periods: form.periods,
        periodsStructure: form.periods,
        yearId: yearId || undefined,
      });
      setTtId(unwrap(res)?._id || ttId);
      toast.success('Period structure saved');
      setStep('grid');
    } catch (e) { toast.error(e.message || 'Could not save the structure'); }
    finally { setStructSaving(false); }
  };

  /* ── Step 2 helpers ────────────────────────────────────────────────────── */
  const runAutoCalc = () => {
    const { schoolStartTime: start, schoolEndTime: end } = form;
    if (!start || !end) return toast.error('Set the school start and end time first');
    const toMin = (t) => { const [h, m] = t.split(':'); return (+h) * 60 + (+m); };
    const fmt = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const n = Math.max(1, Number(autoCalc.totalPeriods) || 8);
    const lunch = Math.max(0, Number(autoCalc.lunchTimeTotalInMinutes) || 0);
    const after = Math.max(0, Number(autoCalc.lunchAfterPeriod) || 0);
    let cur = toMin(start);
    const avail = toMin(end) - cur - lunch;
    if (avail < n) return toast.error('The day is too short for that many periods');
    const len = Math.floor(avail / n);
    const rem = avail % n;
    const out = [];
    let p = 1;
    for (let i = 1; i <= n + 1; i++) {
      if (i - 1 === after && lunch > 0) {
        out.push({ periodNumber: 0, startTime: fmt(cur), endTime: fmt(cur + lunch), isRecess: true, recessName: 'Lunch Break' });
        cur += lunch;
      }
      if (p <= n) {
        const dur = len + (p === n ? rem : 0);
        out.push({ periodNumber: p, startTime: fmt(cur), endTime: fmt(cur + dur), isRecess: false });
        cur += dur; p += 1;
      }
    }
    setForm((f) => ({ ...f, periods: out }));
    toast.success(`${n} periods laid out`);
  };

  const loadTemplate = async () => {
    try {
      const cfg = unwrap(await ttApi.getConfig(yearId || undefined));
      const rows = cfg?.periodTemplate || [];
      if (!rows.length) return toast.error('No school-wide grid is saved yet — set one in Configuration');
      setForm((f) => ({
        ...f,
        schoolStartTime: f.schoolStartTime || cfg.dayStartsAt || '',
        schoolEndTime: f.schoolEndTime || cfg.dayEndsAt || '',
        periods: rows.map((p) => ({
          periodNumber: p.periodType === 'Teaching' ? Number(p.periodNumber) || 0 : 0,
          startTime: p.startTime || '', endTime: p.endTime || '',
          isRecess: (p.periodType || 'Teaching') !== 'Teaching',
          recessName: p.label || p.periodType || 'Break',
        })),
      }));
      toast.success('School grid loaded — save it to keep it for this section');
    } catch (e) { toast.error(e.message || 'Could not load the school grid'); }
  };

  /* ── Auto fill / copy / import / full week ─────────────────────────────── */
  const openAutofill = async () => {
    setAutofill({ loading: true, subjects: [], ppw: {}, days: days.filter((d) => d !== 'Saturday' || saturday.working) });
    try {
      const rows = unwrap(await getSectionSubjectTeachers(sectionId)) || [];
      const seen = new Set();
      const list = rows.map((row) => ({
        _id: row.subject?._id || row.subject,
        subjectName: row.subject?.subjectName || row.subject?.name || '',
        teacher: row.teacher ? { _id: row.teacher._id, name: row.teacher.name } : null,
      })).filter((s) => s._id && !seen.has(s._id) && seen.add(s._id));
      const ppw = {};
      for (const s of list) ppw[s._id] = 1;
      setAutofill((a) => ({ ...a, loading: false, subjects: list, ppw }));
    } catch (e) {
      toast.error(e.message || 'Could not load this section’s subjects');
      setAutofill(null);
    }
  };

  const runAutofill = () => {
    const total = Object.values(autofill.ppw).reduce((n, v) => n + (v || 0), 0);
    const slots = autofill.days.length * teaching.length;
    if (total > slots) return toast.error(`${total} periods will not fit in ${slots} slots`);
    setCells(scatter(autofill.subjects, autofill.ppw, autofill.days, periods));
    setDirty(true);
    setAutofill(null);
    setStep('grid');
    toast.success(`${plural(total, 'period')} placed — check them and save`);
  };

  const copyFrom = async (fromId, withTeachers) => {
    setBusy('copy');
    try {
      const entries = unwrap(await getSectionEntries(fromId, yearId)) || [];
      const map = {};
      for (const e of entries) {
        map[`${e.dayOfWeek}-${e.periodNumber}`] = {
          subject: e.subject?._id || '',
          teacher: withTeachers ? (e.teacher?._id || '') : '',
          subjectName: e.subject?.subjectName || '',
          teacherName: withTeachers ? (e.teacher?.name || '') : '',
          additionalSubjects: [],
          // Merges name sections of the SOURCE class, which mean nothing here.
          mergedSections: [],
        };
      }
      setCells(map);
      setDirty(true);
      setCopying(false);
      setStep('grid');
      toast.success(`${plural(Object.keys(map).length, 'period')} copied — review and save`);
    } catch (e) { toast.error(e.message || 'Could not copy that section'); }
    finally { setBusy(''); }
  };

  const openImport = async () => {
    setImporting({ loading: true, versions: [] });
    try {
      const d = unwrap(await ttApi.getVersions({ yearId: yearId || undefined }));
      setImporting({
        loading: false,
        versions: (d?.versions || []).filter((v) => v.status !== 'generating' && v.status !== 'failed'),
      });
    } catch (e) { toast.error(e.message); setImporting(null); }
  };

  const runImport = async (versionId) => {
    setBusy('import');
    try {
      const d = unwrap(await ttApi.getVersion(versionId));
      const mine = (d.entries || []).filter((e) => String(e.section?._id || e.section) === String(sectionId));
      if (!mine.length) {
        toast.error('That version does not cover this section');
        return;
      }
      const map = {};
      for (const e of mine) {
        map[`${e.dayOfWeek}-${e.periodNumber}`] = {
          subject: e.subject?._id || e.subject || '',
          teacher: e.teacher?._id || e.teacher || '',
          subjectName: e.subject?.subjectName || e.subjectName || '',
          teacherName: e.teacher?.name || e.teacherName || '',
          additionalSubjects: [],
          mergedSections: [],
        };
      }
      setCells(map);
      setDirty(true);
      setImporting(null);
      setStep('grid');
      toast.success(`${plural(Object.keys(map).length, 'period')} imported — review and save`);
    } catch (e) { toast.error(e.message || 'Could not import that version'); }
    finally { setBusy(''); }
  };

  const openFullWeek = async () => {
    setFullWeek({ loading: true, weeks: [] });
    try {
      const weeks = await Promise.all(sections.map(async (s) => {
        const [tt, entries] = await Promise.all([
          getSectionTimetable(s._id, yearId).catch(() => null),
          getSectionEntries(s._id, yearId).catch(() => ({ data: [] })),
        ]);
        const map = {};
        for (const e of unwrap(entries) || []) {
          map[`${e.dayOfWeek}-${e.periodNumber}`] = {
            subject: e.subject?._id || '',
            subjectName: e.subject?.subjectName || '',
            teacherName: e.teacher?.name || '',
          };
        }
        return {
          sectionId: s._id,
          sectionName: s.sectionName,
          periods: unwrap(tt)?.periodsStructure?.length ? unwrap(tt).periodsStructure : periods,
          cells: map,
        };
      }));
      setFullWeek({ loading: false, weeks: weeks.filter((w) => Object.keys(w.cells).length) });
    } catch (e) { toast.error(e.message); setFullWeek(null); }
  };

  const download = async (what) => {
    setBusy(what);
    try {
      const res = what === 'section'
        ? await downloadSectionTimetable(sectionId, yearId || undefined)
        : await downloadAllTimetables(yearId ? { year: yearId } : {});
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'application/pdf' });
      blobDownload(blob, what === 'section'
        ? `timetable-${section.className}-${section.sectionName}.pdf`
        : 'all-timetables.pdf');
    } catch { toast.error('That download failed'); }
    finally { setBusy(''); setMenu(false); }
  };

  /* ── Render ────────────────────────────────────────────────────────────── */
  if (booting) return <div className="page tt-page"><Loading label="Loading the timetable module…" /></div>;

  const doneSteps = [
    sectionId && 'scope',
    teaching.length && ttId && 'periods',
    filled > 0 && 'grid',
  ].filter(Boolean);

  const paletteList = subjects.filter((s) => !palette
    || s.subjectName.toLowerCase().includes(palette.toLowerCase()));

  const dayCells = (d) => teaching.map((p) => ({ p, cell: cells[`${d}-${p.periodNumber}`] }));

  return (
    <div className="page tt-page">
      <TtHead icon="calendar" title="Timetable"
        subtitle="Create, manage and publish class timetables">
        <YearPicker years={years} value={yearId} onChange={setYearId} />
      </TtHead>

      <Card icon="calendarDays" title="Create Timetable (Manual)"
        subtitle="Set class-wise subjects, assign teachers and configure time slots"
        actions={<>
          <Button size="sm" variant="secondary" disabled={!sectionId} onClick={openImport}>
            <Icon name="upload" size={15} /> Import
          </Button>
          <Button size="sm" variant="secondary" disabled={!sectionId} onClick={() => setCopying(true)}>
            <Icon name="copy" size={15} /> Copy from Existing
          </Button>
          <Button size="sm" disabled={!sectionId} onClick={openFullWeek}>
            <Icon name="grid" size={15} /> View Full Timetable
          </Button>
        </>}>
        <Steps steps={STEPS} current={step} done={doneSteps}
          onPick={(k) => { if (k === 'scope' || sectionId) setStep(k); }} />

        <Filters>
          <Pick label="Academic Year" value={yearId} onChange={setYearId}>
            {years.map((y) => (
              <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (Active)' : ''}</option>
            ))}
          </Pick>
          <Pick label="Class" value={classId} onChange={chooseClass} allLabel="Choose a class…">
            {classes.map((c) => <option key={c._id} value={c._id}>{c.className}</option>)}
          </Pick>
          <Pick label="Section" value={sectionId} onChange={setSectionId} allLabel="Choose a section…"
            disabled={!classId}>
            {sections.map((s) => <option key={s._id} value={s._id}>{s.sectionName}</option>)}
          </Pick>
          <Field label="View Mode" fix>
            <Seg value={view} onChange={setView} options={[['week', 'Weekly View'], ['day', 'Day View']]} />
          </Field>
          {view === 'day' && (
            <Pick label="Day" value={day} onChange={setDay}>
              {days.map((d) => <option key={d} value={d}>{d}</option>)}
            </Pick>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, position: 'relative' }} ref={menuRef}>
            <Button variant="secondary" disabled={!sectionId} onClick={() => setMenu((m) => !m)}>
              <Icon name="sliders" size={15} /> More Options
            </Button>
            <Button variant="secondary" disabled={!sectionId} onClick={loadTemplate}>
              <Icon name="fileDoc" size={15} /> Load Template
            </Button>
            {menu && (
              <div style={{
                position: 'absolute', top: 48, right: 0, zIndex: 40, minWidth: 230,
                background: 'var(--bg-card)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)', padding: 6,
              }}>
                <MenuItem icon="filePdf" label="Download this section (PDF)" disabled={!ttId || !!busy}
                  onClick={() => download('section')} />
                <MenuItem icon="files" label="Download every section (PDF)" disabled={!!busy}
                  onClick={() => download('all')} />
                <MenuItem icon="clock" label="Edit the period structure"
                  onClick={() => { setStep('periods'); setMenu(false); }} />
                <MenuItem icon="trash" label="Clear the whole week" danger
                  onClick={() => { setCells({}); setDirty(true); setMenu(false); }} />
              </div>
            )}
          </div>
        </Filters>

        {!sectionId && (
          <Body>
            <Note tone="info">
              Pick a class and a section to start. Everything below is that section’s own week —
              its periods, its subjects and its teachers.
            </Note>
          </Body>
        )}
      </Card>

      {sectionId && loadingSection && <Card><Loading label="Loading this section…" /></Card>}

      {sectionId && !loadingSection && step === 'periods' && (
        <Card icon="clock" title="Configure Periods"
          subtitle={`When the bells go for ${section.className} · Section ${section.sectionName}`}>
          <PeriodStructure
            form={form} setForm={(u) => { setForm(u); setDirty(true); }}
            autoCalc={autoCalc} setAutoCalc={setAutoCalc}
            onAutoCalc={runAutoCalc} onLoadTemplate={loadTemplate}
            saving={structSaving} onSave={saveStructure} saturday={saturday}
          />
        </Card>
      )}

      {sectionId && !loadingSection && step === 'review' && (
        <Card icon="checkSquare" title="Review & Save" subtitle="What is about to be written">
          <ReviewPanel section={section} periods={periods} days={days} cells={cells}
            subjects={subjects} onJump={() => setStep('grid')} />
        </Card>
      )}

      {sectionId && !loadingSection && step === 'grid' && (
        <div className="tt-split tt-split--wide">
          <Card icon="calendarDays"
            title={view === 'week' ? 'Weekly Timetable' : `${day} Timetable`}
            subtitle="Drag and drop subjects to assign. Click a cell to edit."
            actions={<>
              <Button size="sm" variant="secondary" onClick={openAutofill}>
                <Icon name="sparkle" size={15} /> Auto Fill
              </Button>
              <Button size="sm" variant="secondary" onClick={() => { setCells({}); setDirty(true); }}>
                <Icon name="trash" size={15} /> Clear All
              </Button>
            </>}>
            <div className="tt-card__body">
              {!teaching.length ? (
                <Note tone="warn">
                  This section has no periods yet. <button type="button" className="btn btn-sm btn-secondary"
                    onClick={() => setStep('periods')}>Set them up</button>
                </Note>
              ) : view === 'week' ? (
                <div className="tt-tablewrap">
                  <table className="tt-week">
                    <thead>
                      <tr>
                        <th>Period</th>
                        <th style={{ width: 100 }}>Time</th>
                        {days.map((d) => <th key={d}>{d}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((p, i) => (p.isRecess ? (
                        <tr key={`b${i}`}>
                          <td className="tt-week__rowhead tt-week__break-head">
                            <Icon name="clock" size={16} />
                          </td>
                          <td className="tt-week__break">{timeRange(p.startTime, p.endTime)}</td>
                          <td className="tt-week__break" colSpan={days.length}>{p.recessName || 'Break'}</td>
                        </tr>
                      ) : (
                        <tr key={`p${p.periodNumber}`}>
                          <td className="tt-week__rowhead"><span className="tt-period">{p.periodNumber}</span></td>
                          <td className="tt-week__rowhead"><small>{timeRange(p.startTime, p.endTime)}</small></td>
                          {days.map((d) => {
                            const key = `${d}-${p.periodNumber}`;
                            return (
                              <td key={d}>
                                <GridCell cell={cells[key]} over={dragOver === key}
                                  onClick={() => (armed ? (place(key, armed), setArmed(null)) : openCell(d, p.periodNumber))}
                                  onDragOver={(e) => { e.preventDefault(); setDragOver(key); }}
                                  onDragLeave={() => setDragOver((k) => (k === key ? null : k))}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    setDragOver(null);
                                    const id = e.dataTransfer.getData('text/plain');
                                    const subject = subjects.find((s) => s._id === id);
                                    if (subject) place(key, subject);
                                  }} />
                              </td>
                            );
                          })}
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dayCells(day).map(({ p, cell }) => {
                    const key = `${day}-${p.periodNumber}`;
                    const tone = toneFor(cell?.subject);
                    return (
                      <button key={p.periodNumber} type="button"
                        onClick={() => (armed ? (place(key, armed), setArmed(null)) : openCell(day, p.periodNumber))}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px',
                          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                          background: 'var(--bg-card)', textAlign: 'left', width: '100%', cursor: 'pointer',
                        }}>
                        <span className="tt-period">{p.periodNumber}</span>
                        <span style={{ fontSize: '.8rem', color: 'var(--text-muted)', width: 110 }}>
                          {timeRange(p.startTime, p.endTime)}
                        </span>
                        {cell?.subject ? (
                          <>
                            <Chip tone={tone}>{cell.subjectName}</Chip>
                            <span style={{ fontSize: '.84rem', color: 'var(--text-muted)' }}>
                              {cell.teacherName || 'No teacher'}
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: '.84rem', color: 'var(--text-light)' }}>Nothing assigned</span>
                        )}
                        <Icon name="chevronRight" size={16} style={{ marginLeft: 'auto' }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>

          <div className="tt-rail">
            <Panel icon="book" title="Subjects" right={<span className="tt-count">Drag to assign</span>}>
              <Search value={palette} onChange={setPalette} placeholder="Search subjects…" />
              {!subjects.length ? (
                <Note tone="warn">
                  No subjects are assigned to this section yet. Set them on the section’s own page first.
                </Note>
              ) : (
                <div className="tt-palette">
                  {paletteList.map((s) => {
                    const tone = toneFor(s._id);
                    const used = Object.values(cells).filter((c) => c?.subject === s._id).length;
                    return (
                      <button key={s._id} type="button" draggable
                        className={`tt-pal${armed?._id === s._id ? ' is-armed' : ''}`}
                        style={{ background: TONE_BG[tone], color: TONE_INK[tone], borderColor: `${TONE_INK[tone]}33` }}
                        onDragStart={(e) => e.dataTransfer.setData('text/plain', s._id)}
                        onClick={() => setArmed((a) => (a?._id === s._id ? null : s))}
                        title={s.teacher?.name ? `Usually ${s.teacher.name}` : 'No teacher assigned'}>
                        <span className="tt-pal__dot" />
                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.subjectName}</span>
                        {used > 0 && <span className="tt-pal__n">{used}</span>}
                      </button>
                    );
                  })}
                  {!paletteList.length && (
                    <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>No subject matches that.</span>
                  )}
                </div>
              )}
              {armed && (
                <Note tone="info">
                  <strong>{armed.subjectName}</strong> is armed — click any slot to drop it there.
                </Note>
              )}
            </Panel>
          </div>
        </div>
      )}

      {sectionId && !loadingSection && (
        <Card>
          <div className="tt-card__foot" style={{ borderTop: 0 }}>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Chip tone="indigo"><Icon name="layers" size={14} /> Total Periods {teaching.length}</Chip>
              <Chip tone="green"><Icon name="clock" size={14} /> Working Hours {duration(mins.teaching)}</Chip>
              <Chip tone="amber"><Icon name="clock" size={14} /> Break Time {duration(mins.breaks)}</Chip>
              <Chip tone={filled === slotCount && slotCount ? 'green' : 'slate'}>
                {filled} of {slotCount} slots filled
              </Chip>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {dirty && <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>Unsaved changes</span>}
              <Button variant="secondary" onClick={() => loadSection(sectionId, yearId)}>Cancel</Button>
              {step === 'review'
                ? <Button onClick={() => save(false)} loading={saving}>
                    <Icon name="save" size={15} /> Save Timetable
                  </Button>
                : <>
                    <Button variant="secondary" onClick={() => setStep('review')}>Review</Button>
                    <Button onClick={() => save(false)} loading={saving}>
                      <Icon name="save" size={15} /> Save Timetable
                    </Button>
                  </>}
            </div>
          </div>
        </Card>
      )}

      {/* ── What the server refused, and why ──────────────────────────────── */}
      <Modal open={!!blocked} onClose={() => setBlocked(null)} maxWidth={560}
        title="This week clashes with itself"
        footer={<>
          <Button variant="secondary" onClick={() => setBlocked(null)}>Go back and fix it</Button>
          <Button variant="danger" loading={saving} onClick={() => save(true)}>Save it anyway</Button>
        </>}>
        <Note tone="bad">
          Saved as it stands, this would put a teacher or a room in two places at once.
          Fix the periods below, or overrule it if you know something the timetable does not.
        </Note>
        <div className="tt-tablewrap" style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
          <table className="tt-table">
            <tbody>
              {(blocked || []).map((c, i) => (
                <tr key={i}>
                  <td className="tt-nowrap">
                    <Chip tone={c.severity === 'error' ? 'red' : 'amber'}>
                      {c.dayOfWeek} P{c.periodNumber}
                    </Chip>
                  </td>
                  <td>{c.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {edit && (
        <CellModal
          day={edit.day} period={edit.period}
          subjects={subjects} teachers={teacherOpts} teacherLoading={teacherBusy}
          subject={modal.subject} teacher={modal.teacher}
          extraSubs={modal.extra} merged={modal.merged}
          sameSections={sections.filter((s) => String(s._id) !== String(sectionId))
            .map((s) => ({ _id: s._id, sectionName: s.sectionName, className: klass.className }))}
          extraTeacherOpts={extraOpts} extraTeacherLoading={extraBusy}
          onSubjectChange={onModalSubject}
          onTeacherChange={(v) => setModal((m) => ({ ...m, teacher: v }))}
          onExtraChange={(v) => setModal((m) => ({ ...m, extra: v }))}
          onExtraSubjectChange={onExtraSubject}
          onMergedChange={(v) => setModal((m) => ({ ...m, merged: v }))}
          onSave={saveCell}
          onClose={() => setEdit(null)}
          onClear={() => { setCell(`${edit.day}-${edit.period}`, null); setEdit(null); }}
        />
      )}

      {autofill && (
        <AutoFillModal
          subjects={autofill.subjects} loading={autofill.loading}
          ppw={autofill.ppw} setPpw={(fn) => setAutofill((a) => ({ ...a, ppw: typeof fn === 'function' ? fn(a.ppw) : fn }))}
          days={days} genDays={autofill.days}
          setGenDays={(fn) => setAutofill((a) => ({ ...a, days: typeof fn === 'function' ? fn(a.days) : fn }))}
          slots={autofill.days.length * teaching.length}
          busy={false} onRun={runAutofill} onClose={() => setAutofill(null)}
        />
      )}

      {copying && (
        <CopyModal classes={classes} current={section} busy={busy === 'copy'}
          onCopy={copyFrom} onClose={() => setCopying(false)} />
      )}

      {importing && (
        <ImportModal versions={importing.versions} loading={importing.loading} busy={busy === 'import'}
          onImport={runImport} onClose={() => setImporting(null)} />
      )}

      {fullWeek && (
        <FullWeekModal klass={klass} weeks={fullWeek.weeks} days={days}
          loading={fullWeek.loading} onClose={() => setFullWeek(null)} />
      )}
    </div>
  );
}

/* ── One slot of the grid ──────────────────────────────────────────────────── */
function GridCell({ cell, over, onClick, onDragOver, onDragLeave, onDrop }) {
  const tone = toneFor(cell?.subject);
  const extras = (cell?.additionalSubjects || []).filter((a) => a.subject);
  return (
    <button type="button"
      className={`tt-cell${cell?.subject ? ' is-set' : ''}${over ? ' is-over' : ''}`}
      style={cell?.subject ? {
        background: TONE_BG[tone], borderColor: `${TONE_INK[tone]}55`, color: TONE_INK[tone],
      } : undefined}
      onClick={onClick} onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}>
      {cell?.subject ? (
        <>
          <span className="tt-cell__subject">{cell.subjectName}</span>
          <span className="tt-cell__teacher">
            {cell.teacherName || <span style={{ color: '#b45309' }}>No teacher</span>}
          </span>
          {extras.map((a, i) => (
            <span key={i} className="tt-cell__extra">
              {a.subjectName}{a.teacherName ? ` · ${a.teacherName}` : ''}
            </span>
          ))}
          {(cell.mergedSections || []).length > 0 && (
            <span className="tt-cell__extra">with {cell.mergedSections.length} more section(s)</span>
          )}
        </>
      ) : (
        <span className="tt-cell__empty">+ Assign</span>
      )}
    </button>
  );
}

function MenuItem({ icon, label, onClick, disabled, danger }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 11px',
        borderRadius: 8, background: 'none', border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: '.85rem', color: danger ? 'var(--danger)' : 'var(--text)', opacity: disabled ? .5 : 1,
        textAlign: 'left',
      }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = 'var(--bg)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}>
      <Icon name={icon} size={16} />{label}
    </button>
  );
}
