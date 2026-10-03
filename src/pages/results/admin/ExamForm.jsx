/**
 * Create Formal Exam / Edit Exam — the four-step popup (Oct 2026, to the
 * user's mockup).
 *
 *   1 Exam Details      name, type, year, code, dates, description — beside a
 *                       live summary — and the options: result date, status,
 *                       student portal, overall result, grace marks
 *   2 Class & Subjects  the classes and sections sitting it, and its papers
 *   3 Marks & Grading   each paper's maximum, pass mark and date; the grade
 *                       scale; how much grace, in how many subjects
 *   4 Publish Settings  who is told, what the scorecard shows, and a review
 *
 * One exam is created per ticked section: each section has its own teachers,
 * marks sheets and class teacher to validate them. The sections may span
 * several classes of the year — each class then sits only the papers it is
 * taught, and the form says so beside each subject before anything exists.
 *
 * Every option does something (services/resultExams on the server):
 *   Status Active           opens mark entry as the exam is created, and the
 *                           subject teachers are told; Draft keeps it with the office
 *   Show in student portal  off → students and parents never see the results,
 *                           and nobody is notified
 *   Include in overall      counts towards the year's overall result (Analytics)
 *   Allow grace marks       a student short of passing by at most N marks, in
 *                           at most M subjects, is given them at publishing
 *   Notify / Show rank      the notice on publishing; the rank on the scorecard
 *
 * The exam types and the grading scale are the school's own (Results →
 * Settings): a type is one of its own names, and what it counts as — only a
 * final-kind type offers the promotion.
 *
 * Editing is the same form for one section's exam. Once mark entry has opened
 * its type is fixed. While marks are still being entered a forgotten paper can
 * be added, and a paper nobody has entered marks for taken off or re-scored;
 * once the marks have been submitted the subjects and their marks are fixed
 * and shown so (paper dates and times can always move). Everything checked
 * here is checked again by the server.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import useFetch from '../../../hooks/useFetch';
import { Btn, Ico, fmtDay, fmtRange, inputDay, plural } from '../rsUI';
import { StepModal, Card, Field, TagSelect, CheckRow, SumList, Note, Review } from '../rsForm';
import { EXAM_TYPES, typeLabel, statusOf, classLine, gradeTone, gradeRange } from '../resultMeta';

const STEPS = [
  { key: 'details', title: 'Exam Details', sub: 'Basic information', icon: 'sheetBold' },
  { key: 'classes', title: 'Class & Subjects', sub: 'Select classes and subjects', icon: 'bookOpen' },
  { key: 'marks', title: 'Marks & Grading', sub: 'Define marks and grading', icon: 'chartUp' },
  { key: 'publish', title: 'Publish Settings', sub: 'Result publication options', icon: 'settings' },
];
/** Which errors belong to which step, so checking a step clears only its own. */
const STEP_ERRORS = {
  details: ['title', 'year', 'code', 'startDate', 'endDate', 'publishDate', 'marksDueDate', 'description'],
  classes: ['sections', 'subjects'],
  marks: ['rows', 'gracePer', 'graceSubjects'],
  publish: [],
};

const GRACE = { per: [1, 20], subjects: [1, 10] };

const ACTIVE = { value: 'active', label: 'Active', tone: 'green', icon: 'powerBold', option: 'Active — open for mark entry now' };
const DRAFT = { value: 'draft', label: 'Draft', tone: 'slate', icon: 'pencil', option: 'Draft — open mark entry later' };

const BLANK = {
  title: '', examType: 'MID_TERM', year: '', code: '', description: '',
  startDate: '', endDate: '', publishDate: '', status: 'active',
  showInPortal: true, includeInOverall: false, allowGraceMarks: false, gracePer: 5, graceSubjects: 2,
  notifyOnPublish: true, showRank: true, sectionIds: [],
  // Oct 2026: the school's term the exam belongs to, when the marks are due,
  // and whether families see the timetable now or once the office shares it.
  term: '', marksDueDate: '', shareTimetable: true,
  // A final exam promotes the students who pass, unless switched off here;
  // those who do not pass stay where they are, or repeat the class next year.
  promoteOnPass: true, promoteSection: 'same', failedPlacement: 'stay',
};

/** A paper's parts as the form edits them. */
const partsIn = (list) => (Array.isArray(list) && list.length
  ? list.map((c) => ({ key: c.key || '', label: c.label || '', maxMarks: String(c.maxMarks ?? ''), passingMarks: String(c.passingMarks ?? '') }))
  : null);
/** What a paper is out of: its parts' sum, nothing when it is graded, else its maximum. */
const maxOf = (s) => (s.gradeOnly ? 0 : s.components ? s.components.reduce((t, c) => t + (Number(c.maxMarks) || 0), 0) : Number(s.maxMarks) || 0);
/** What is wrong with a paper's parts, if anything (the server checks the same). */
function partsProblem(parts) {
  if (parts.length < 2 || parts.length > 4) return 'A paper is split into 2 to 4 parts';
  const names = new Set();
  for (const c of parts) {
    const label = c.label.trim();
    if (!label) return 'Name every part';
    if (names.has(label.toLowerCase())) return `Two parts are called "${label}"`;
    names.add(label.toLowerCase());
    const max = Number(c.maxMarks); const pass = c.passingMarks === '' ? 0 : Number(c.passingMarks);
    if (!Number.isFinite(max) || max < 1 || max > 1000) return `${label}: out of 1 to 1000 marks`;
    if (!Number.isFinite(pass) || pass < 0 || pass > max) return `${label}: the pass mark is between 0 and ${max}`;
  }
  return '';
}
/** The parts a paper is usually split into, to start from. */
const PART_PRESETS = {
  tp: [{ label: 'Theory', maxMarks: '70', passingMarks: '23' }, { label: 'Practical', maxMarks: '30', passingMarks: '10' }],
  ti: [{ label: 'Theory', maxMarks: '80', passingMarks: '26' }, { label: 'Internal Assessment', maxMarks: '20', passingMarks: '7' }],
};

export default function ExamForm({ open, exam, onClose, onSaved }) {
  // Mounted only while open, and afresh for each exam: nothing of the last
  // exam edited can be left in the fields of the next.
  return open ? <Form key={exam?._id || 'new'} exam={exam} onClose={onClose} onSaved={onSaved} /> : null;
}

function Form({ exam, onClose, onSaved }) {
  const editing = !!exam?._id;
  const { data: meta, error: metaError } = useFetch(api.getResultFormMeta, []);
  const [f, setF] = useState(BLANK);
  const [detail, setDetail] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [subjectsState, setSubjectsState] = useState('idle');   // idle | loading | ready
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);
  const [all, setAll] = useState({ maxMarks: 100, passingMarks: 33, startTime: '', endTime: '' });
  const nav = useRef(null);

  /** Change fields, and forget what was wrong with them. */
  const set = (patch) => {
    setF((s) => ({ ...s, ...patch }));
    setErrors((e) => {
      const keys = Object.keys(patch).map((k) => ({ sectionIds: 'sections', gracePer: 'gracePer', graceSubjects: 'graceSubjects' }[k] || k));
      if (!keys.some((k) => e[k])) return e;
      const next = { ...e }; keys.forEach((k) => delete next[k]); return next;
    });
  };

  // Editing: once mark entry has opened, the type is fixed (`locked`). While
  // marks are being entered the subjects can still change around the marks
  // already entered (`marksOpen`); once they have been submitted, not at all.
  const locked = editing && !!detail && detail.status !== 'DRAFT';
  const marksOpen = locked && ['MARKS_PENDING', 'REOPENED'].includes(detail.status);
  const subjectsFixed = locked && !marksOpen;
  /** A paper with marks entered keeps its place and its maximum. */
  const hasMarks = (s) => marksOpen && (s.entered || 0) > 0;

  /* The exam being edited — the board's row has no subject list, so fetch it. */
  useEffect(() => {
    if (!editing) return undefined;
    let alive = true;
    api.getFormalExam(exam._id).then((res) => {
      if (!alive) return;
      const d = res.data ?? res;
      const o = d.options || {};
      setDetail(d);
      setF({
        ...BLANK,
        title: d.title, examType: d.typeKey || d.examType, year: d.academicYear?._id || '', code: d.code || '', description: d.description || '',
        startDate: inputDay(d.startDate), endDate: inputDay(d.endDate), publishDate: inputDay(d.publishDate),
        status: d.status === 'DRAFT' ? 'draft' : 'active',
        showInPortal: o.showInPortal !== false, includeInOverall: !!o.includeInOverall, allowGraceMarks: !!o.allowGraceMarks,
        gracePer: o.grace?.perSubject || 5, graceSubjects: o.grace?.maxSubjects || 2,
        notifyOnPublish: o.notifyOnPublish !== false, showRank: o.showRank !== false,
        promoteOnPass: d.examType === 'FINAL' ? !!o.promoteOnPass : true, promoteSection: o.promoteSection === 'none' ? 'none' : 'same',
        failedPlacement: o.failedPlacement === 'repeat' ? 'repeat' : 'stay',
        sectionIds: d.section?._id ? [d.section._id] : [],
        term: d.term || '', marksDueDate: inputDay(d.marksDueDate), shareTimetable: d.timetableShared !== false,
      });
      setSubjects((d.subjects || []).map((s) => ({
        subject: s.subject._id, name: s.subject.subjectName, code: s.subject.subjectCode, include: true,
        maxMarks: s.maxMarks, passingMarks: s.passingMarks, examDate: inputDay(s.examDate),
        startTime: s.startTime || '', endTime: s.endTime || '', entered: s.sheet?.entered || 0,
        gradeOnly: !!s.gradeOnly, components: partsIn(s.components),
        teachers: s.teachers || [], untaught: s.teachers?.length ? [] : [d.section?._id], classes: [d.class?._id],
      })));
    }).catch((e) => { toast.error(e.message); onClose(); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A new exam starts in the year the school is working in, as a type the school offers. */
  useEffect(() => {
    if (editing || !meta) return;
    const year = f.year ? null : meta.years.find((y) => y.current) || meta.years[0];
    const offered = meta.examTypes || [];
    const type = offered.length && !offered.some((t) => t.value === f.examType) ? offered[0].value : null;
    if (year || type) setF((s) => ({ ...s, ...(year ? { year: year._id } : null), ...(type ? { examType: type } : null) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  /*
   * The school's exam types: those it offers, and the one being edited even if
   * it has since been switched off. `kind` is what the type behaves as.
   */
  const allTypes = meta?.allExamTypes || EXAM_TYPES;
  const typeOptions = allTypes.filter((t) => t.active !== false || t.value === f.examType);
  const pickedType = allTypes.find((t) => t.value === f.examType);
  const typeName = pickedType?.label || detail?.examTypeLabel || typeLabel(f.examType);
  const isFinal = (pickedType?.kind || f.examType) === 'FINAL';
  const scale = meta?.scale || [];

  const years = meta?.years || [];
  const yearName = years.find((y) => String(y._id) === String(f.year))?.yearName || detail?.yearName || '';
  const yearClasses = useMemo(() => (meta?.classes || []).filter((c) => String(c.academicYear) === String(f.year)), [meta, f.year]);

  /* Where each section sits, for the notes ("No teacher in Class 7 – B"). */
  const sectionInfo = useMemo(() => {
    const m = new Map();
    (meta?.classes || []).forEach((c) => c.sections.forEach((s) => m.set(String(s._id), { ...s, classId: String(c._id), className: c.className })));
    if (detail?.section?._id) m.set(String(detail.section._id), { _id: detail.section._id, sectionName: detail.sectionName, classId: String(detail.class?._id || ''), className: detail.className, students: detail.roster });
    return m;
  }, [meta, detail]);
  const sectionLabel = (id) => { const s = sectionInfo.get(String(id)); return s ? classLine(s) : ''; };

  /* The classes with a ticked section, in the order the school lists them. */
  const chosen = useMemo(() => {
    const byClass = new Map();
    f.sectionIds.forEach((id) => {
      const s = sectionInfo.get(String(id));
      if (!s) return;
      if (!byClass.has(s.classId)) byClass.set(s.classId, { _id: s.classId, className: s.className, sections: [] });
      byClass.get(s.classId).sections.push(s);
    });
    const order = (meta?.classes || []).map((c) => String(c._id));
    return [...byClass.values()]
      .sort((a, b) => order.indexOf(a._id) - order.indexOf(b._id))
      .map((c) => ({ ...c, sections: c.sections.sort((a, b) => String(a.sectionName).localeCompare(String(b.sectionName))) }));
  }, [f.sectionIds, sectionInfo, meta]);
  const multi = chosen.length > 1;

  /*
   * The subjects on offer follow the ticked sections. What has been typed
   * against a subject survives a change of sections; a subject is ticked by
   * default only where somebody actually teaches it.
   */
  const sectionKey = f.sectionIds.slice().sort().join(',');
  useEffect(() => {
    if (subjectsFixed || (editing && !detail)) return undefined;
    if (!f.sectionIds.length) { if (!editing) setSubjects([]); setSubjectsState('idle'); return undefined; }
    let alive = true;
    setSubjectsState('loading');
    const t = setTimeout(() => {
      api.getResultFormSubjects(f.sectionIds).then((res) => {
        if (!alive) return;
        const offered = res.data ?? res ?? [];
        setSubjects((prev) => {
          const old = new Map(prev.map((s) => [s.subject, s]));
          const merged = offered.map((s) => {
            const o = old.get(s._id);
            old.delete(s._id);
            return {
              subject: s._id, name: s.subjectName, code: s.subjectCode, teachers: s.teachers || [], untaught: s.untaught || [],
              classes: (s.classes || []).map(String),
              include: o ? o.include : (editing ? false : (s.teachers || []).length > 0),
              maxMarks: o?.maxMarks ?? 100, passingMarks: o?.passingMarks ?? 33, examDate: o?.examDate ?? '',
              startTime: o?.startTime ?? '', endTime: o?.endTime ?? '', entered: o?.entered ?? 0,
              gradeOnly: o?.gradeOnly ?? false, components: o?.components ?? null,
            };
          });
          // A subject already on the exam stays on the list even if it is no
          // longer linked to the class.
          const kept = editing ? [...old.values()].filter((s) => s.include) : [];
          return [...kept, ...merged];
        });
        setSubjectsState('ready');
      }).catch(() => { if (alive) setSubjectsState('ready'); });
    }, 120);
    return () => { alive = false; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionKey, subjectsFixed, !!detail]);

  const included = subjects.filter((s) => s.include);
  const setRow = (id, patch) => {
    setSubjects((rows) => rows.map((r) => (r.subject === id ? { ...r, ...patch } : r)));
    setErrors((e) => (e.rows?.[id] || e.subjects ? { ...e, subjects: undefined, rows: e.rows ? { ...e.rows, [id]: undefined } : undefined } : e));
  };
  /** The chosen classes a subject is a paper for: all of them, with one class. */
  const appliesTo = (s) => (multi ? chosen.filter((c) => s.classes?.includes(c._id)) : chosen);
  /** Chosen classes left with none of the ticked subjects — refused, by name. */
  const bare = multi ? chosen.filter((c) => !included.some((s) => s.classes?.includes(c._id))).map((c) => c.className) : [];

  /* Totals: a class sits only its own papers, so classes may differ. */
  const totals = chosen.length
    ? chosen.map((c) => included.filter((s) => !multi || s.classes?.includes(c._id)).reduce((t, s) => t + maxOf(s), 0))
    : [included.reduce((t, s) => t + maxOf(s), 0)];
  const totalLow = Math.min(...totals); const totalHigh = Math.max(...totals);
  const totalText = !included.length ? '' : totalLow === totalHigh ? String(totalHigh) : `${totalLow} – ${totalHigh}`;

  const toggleSection = (id) => set({ sectionIds: f.sectionIds.includes(id) ? f.sectionIds.filter((x) => x !== id) : [...f.sectionIds, id] });
  const toggleClass = (c) => {
    const ids = c.sections.map((s) => s._id);
    const allOn = ids.every((id) => f.sectionIds.includes(id));
    set({ sectionIds: allOn ? f.sectionIds.filter((id) => !ids.includes(id)) : [...new Set([...f.sectionIds, ...ids])] });
  };

  /* ── Checks: the server's rules, so most refusals never leave the form ──── */
  const rules = (key) => {
    const e = {};
    if (key === 'details') {
      const title = f.title.trim();
      if (!title) e.title = 'Give the exam a name';
      else if (title.length > 120) e.title = 'Keep the name under 120 characters';
      if (!editing && !f.year) e.year = 'Choose the academic year';
      const code = f.code.trim();
      if (code.length > 20) e.code = '20 characters at most';
      else if (code && !/^[A-Za-z0-9][A-Za-z0-9 ._/-]*$/.test(code)) e.code = 'Letters, digits, spaces and . _ / - only';
      if (!f.startDate) e.startDate = 'Choose the first day of the exam';
      if (!f.endDate) e.endDate = 'Choose the last day of the exam';
      else if (f.startDate && f.endDate < f.startDate) e.endDate = 'The exam cannot end before it starts';
      if (f.publishDate && f.endDate && f.publishDate < f.endDate) e.publishDate = 'Results cannot come out before the exam ends';
      if (f.marksDueDate && f.startDate && f.marksDueDate < f.startDate) e.marksDueDate = 'Marks cannot be due before the exam starts';
      else if (f.marksDueDate && f.publishDate && f.marksDueDate > f.publishDate) e.marksDueDate = 'Marks cannot be due after the result date';
      if (f.description.trim().length > 500) e.description = '500 characters at most';
    }
    if (key === 'classes') {
      if (!editing && !f.sectionIds.length) e.sections = 'Tick at least one section';
      else if (subjectsState === 'loading') e.subjects = 'The subjects are still loading';
      else if (!included.length) e.subjects = subjects.length ? 'Tick at least one subject' : 'No subject is linked to these classes yet — link subjects under Academics → Classes first';
      else if (bare.length) {
        e.subjects = `${bare.join(', ')} ${bare.length === 1 ? 'has' : 'have'} none of the ticked subjects — tick one of ${bare.length === 1 ? 'its' : 'their'} subjects, or untick ${bare.length === 1 ? 'that class' : 'those classes'}`;
      }
    }
    if (key === 'marks') {
      const rows = {};
      included.forEach((s) => {
        const max = maxOf(s); const pass = Number(s.passingMarks);
        const partError = s.components ? partsProblem(s.components) : '';
        if (s.gradeOnly) { /* graded: no marks to check */ }
        else if (partError) rows[s.subject] = partError;
        else if (s.maxMarks === '' || !Number.isFinite(max) || max < 1 || max > 1000) rows[s.subject] = 'Maximum marks: 1 to 1000';
        else if ((s.passingMarks === '' && !s.components) || (s.passingMarks !== '' && (!Number.isFinite(pass) || pass < 0))) rows[s.subject] = 'Pass marks cannot be blank or negative';
        else if (pass > max) rows[s.subject] = `Pass marks cannot be more than ${max}`;
        if (rows[s.subject]) return;
        if (s.examDate && f.startDate && f.endDate && (s.examDate < f.startDate || s.examDate > f.endDate)) rows[s.subject] = `Date it within the exam, ${fmtRange(f.startDate, f.endDate)}`;
        else if ((s.startTime || s.endTime) && !s.examDate) rows[s.subject] = 'Give the paper a date to go with its time';
        else if (s.endTime && !s.startTime) rows[s.subject] = 'Give the time it starts as well as when it ends';
        else if (s.startTime && s.endTime && s.endTime <= s.startTime) rows[s.subject] = 'The paper cannot end before it starts';
      });
      // One student sits every paper of their class, so two on the same day
      // cannot overlap — where a class has both. Class 6's paper and Class 8's
      // may share a morning.
      const together = (a, b) => !multi || appliesTo(a).some((c) => appliesTo(b).includes(c));
      const timed = included.filter((s) => s.examDate && s.startTime && !rows[s.subject]);
      timed.forEach((b, i) => timed.slice(0, i).forEach((a) => {
        if (a.examDate !== b.examDate || rows[b.subject] || !together(a, b)) return;
        const aEnd = a.endTime || a.startTime; const bEnd = b.endTime || b.startTime;
        if ((a.startTime < bEnd && b.startTime < aEnd) || a.startTime === b.startTime) rows[b.subject] = `Overlaps ${a.name} on ${fmtDay(b.examDate)} — a student cannot sit both`;
      }));
      if (Object.keys(rows).length) e.rows = rows;
      if (f.allowGraceMarks) {
        const per = Number(f.gracePer); const n = Number(f.graceSubjects);
        if (!Number.isInteger(per) || per < GRACE.per[0] || per > GRACE.per[1]) e.gracePer = `${GRACE.per[0]} to ${GRACE.per[1]} marks`;
        if (!Number.isInteger(n) || n < GRACE.subjects[0] || n > GRACE.subjects[1]) e.graceSubjects = `${GRACE.subjects[0]} to ${GRACE.subjects[1]} subjects`;
      }
    }
    return e;
  };
  const check = (key) => {
    const e = rules(key);
    setErrors((prev) => {
      const next = { ...prev };
      STEP_ERRORS[key].forEach((k) => delete next[k]);
      return { ...next, ...e };
    });
    return !Object.keys(e).length;
  };

  /* ── Saving ─────────────────────────────────────────────────────────────── */
  const statusFrom = detail ? (detail.status === 'DRAFT' ? 'draft' : 'active') : null;
  const canFlip = !editing || detail?.status === 'DRAFT' || !!detail?.can?.toDraft;

  const save = async () => {
    setBanner('');
    const payload = {
      title: f.title.trim(), examType: f.examType, code: f.code.trim(), description: f.description.trim(),
      startDate: f.startDate, endDate: f.endDate, publishDate: f.publishDate || null,
      subjects: included.map((s) => ({
        subject: s.subject, maxMarks: maxOf(s) || 100, passingMarks: s.gradeOnly ? 0 : Number(s.passingMarks),
        examDate: s.examDate || null, startTime: s.startTime || '', endTime: s.endTime || '',
        gradeOnly: !!s.gradeOnly,
        components: !s.gradeOnly && s.components ? s.components.map((c) => ({
          ...(c.key ? { key: c.key } : null), label: c.label.trim(), maxMarks: Number(c.maxMarks), passingMarks: c.passingMarks === '' ? 0 : Number(c.passingMarks),
        })) : null,
      })),
      term: f.term || '', marksDueDate: f.marksDueDate || null, timetableShared: f.shareTimetable,
      showInPortal: f.showInPortal, includeInOverall: f.includeInOverall, allowGraceMarks: f.allowGraceMarks,
      grace: f.allowGraceMarks ? { perSubject: Number(f.gracePer), maxSubjects: Number(f.graceSubjects) } : null,
      notifyOnPublish: f.notifyOnPublish, showRank: f.showRank,
      promoteOnPass: isFinal && f.promoteOnPass, promoteSection: f.promoteSection,
      failedPlacement: isFinal && f.promoteOnPass ? f.failedPlacement : 'stay',
    };
    setSaving(true);
    try {
      if (editing) {
        await api.updateFormalExam(exam._id, payload);
        // The status asked for, if it moved: open mark entry, or take it back.
        if (canFlip && f.status !== statusFrom) {
          if (f.status === 'active') await api.openFormalExamMarks(exam._id);
          else await api.draftFormalExam(exam._id);
        }
        toast.success(f.status !== statusFrom ? `Exam saved${f.status === 'active' ? ' and opened for mark entry' : ' as a draft'}` : 'Exam updated');
        onSaved({ created: false });
      } else {
        const res = await api.createFormalExam({ ...payload, shareTimetable: f.shareTimetable, academicYear: f.year, sectionIds: f.sectionIds, openMarksEntry: f.status === 'active' });
        const n = res.created ?? 1;
        toast.success(`${plural(n, 'exam')} created${f.status === 'active' ? ' and opened for mark entry' : ' as a draft'}`);
        onSaved({ created: true });
      }
    } catch (err) {
      setBanner(err.message || 'The exam could not be saved');
      setSaving(false);
    }
  };

  /* ── What the summary and the review say ────────────────────────────────── */
  const classesText = chosen.length
    ? chosen.map((c) => (editing ? classLine({ className: c.className, sectionName: c.sections[0]?.sectionName }) : `${c.className} (${c.sections.map((s) => s.sectionName).join(', ')})`)).join(', ')
    : '';
  const portalText = !f.showInPortal ? 'Not shown in the student portal'
    : f.publishDate ? `From ${fmtDay(f.publishDate)}` : 'As soon as they are published';
  const statusOptions = !editing ? [ACTIVE, DRAFT]
    : canFlip ? (statusFrom === 'draft' ? [DRAFT, ACTIVE] : [ACTIVE, DRAFT])
      : [{ value: 'active', label: statusOf(detail?.status).label, tone: statusOf(detail?.status).tone, icon: 'lock' }];
  const exams = f.sectionIds.length;
  const err = (k) => errors[k];
  const classById = new Map((meta?.classes || []).map((c) => [String(c._id), c]));
  // Once the promotion has moved anyone, its settings are facts (the server refuses changes).
  const promotionRan = !!detail?.promotion?.ranAt && ['done', 'waiting', 'running'].includes(detail?.promotion?.state);
  const go = (i) => nav.current?.(i);

  return (
    <StepModal open onClose={saving ? () => {} : onClose} steps={STEPS} check={check} busy={saving} onSubmit={save} navRef={nav}
      icon="sheetBold" title={editing ? 'Edit Exam' : 'Create Formal Exam'}
      subtitle={editing
        ? (detail ? `Change this exam's details · ${classLine(detail)} · ${detail.yearName}` : 'Loading…')
        : 'Set up a new examination for a class or section with all necessary details.'}
      submitLabel={editing ? 'Save Changes' : exams > 1 ? `Create ${exams} Exams` : 'Create Exam'} submitIcon="check"
      banner={banner || metaError || ''}>

      {/* ── 1 · Exam Details ─────────────────────────────────────────────── */}
      <div className="rsf-row" data-step="details">
        <Card icon="sheetBold" title="Exam Details" sub="Provide the basic information about the examination." bodyClass="rsf-grid rsf-grid--details">
          <Field label="Exam Title" required error={err('title')}>
            <input value={f.title} maxLength={120} placeholder="e.g. Mid Term Examination" onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Exam Type" required select>
            <select value={f.examType} onChange={(e) => set({ examType: e.target.value })} disabled={locked}>
              {typeOptions.map((t) => <option key={t.value} value={t.value}>{t.label}{t.active === false ? ' (switched off)' : ''}</option>)}
            </select>
          </Field>
          <Field label="Academic Year" required icon="calendarBold" select error={err('year')}>
            <select value={f.year} disabled={editing || !years.length}
              onChange={(e) => set({ year: e.target.value, sectionIds: [] })}>
              {!years.length ? <option value="">{meta ? 'No academic years' : 'Loading…'}</option> : null}
              {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
            </select>
          </Field>
          <Field label="Exam Code" optional error={err('code')}>
            <input value={f.code} maxLength={20} placeholder="e.g. MT2026" autoComplete="off" spellCheck={false}
              onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Start Date" required icon="calendarBold" error={err('startDate')}>
            <input type="date" className={f.startDate ? '' : 'is-empty'} value={f.startDate} max={f.endDate || undefined}
              onChange={(e) => set({ startDate: e.target.value })} />
          </Field>
          <Field label="End Date" required icon="calendarBold" error={err('endDate')}>
            <input type="date" className={f.endDate ? '' : 'is-empty'} value={f.endDate} min={f.startDate || undefined}
              onChange={(e) => set({ endDate: e.target.value })} />
          </Field>
          <Field label="Description" optional wide count={[f.description.length, 500]} error={err('description')}>
            <textarea value={f.description} maxLength={500} rows={3} placeholder="Add exam description, instructions, or notes..."
              onChange={(e) => set({ description: e.target.value })} />
          </Field>
        </Card>

        <Card icon="docSolid" tone="solid" title="Exam Summary" sub="Overview of the exam configuration." className="rsf-sum">
          <SumList rows={[
            ['sheet', 'Title', f.title.trim()],
            ['fileDoc', 'Type', typeName],
            ['calendar', 'Academic Year', yearName],
            ['calendar', 'Start Date', f.startDate ? fmtDay(f.startDate) : ''],
            ['calendar', 'End Date', f.endDate ? fmtDay(f.endDate) : ''],
            ['bookOpen', 'Classes', classesText, 'Not selected'],
            ['sheet', 'Subjects', included.length ? plural(included.length, 'subject') : '', 'Not selected'],
            ['penSquare', 'Total Marks', totalText],
            ['settings', 'Result Publish', f.publishDate ? fmtDay(f.publishDate) : '', 'Not set'],
          ]} />
          <Note>{editing ? 'You can review all changes before saving the exam.' : 'You can review all details before creating the exam.'}</Note>
        </Card>
      </div>

      <Card step="details" icon="settings" size="lg" title="Additional Settings" sub="Configure optional settings for this examination." className="rsf-more">
        <div className="rsf-grid rsf-grid--more">
          <Field label="Result Publish Date" optional icon="calendarBold" error={err('publishDate')}>
            <input type="date" className={f.publishDate ? '' : 'is-empty'} value={f.publishDate} min={f.endDate || undefined}
              onChange={(e) => set({ publishDate: e.target.value })} />
          </Field>
          <Field label="Marks Due By" optional icon="calendarBold" error={err('marksDueDate')}
            hint={!f.marksDueDate && meta?.marksDueDays !== null && meta?.marksDueDays !== undefined && !editing ? `Left empty: ${meta.marksDueDays} day${meta.marksDueDays === 1 ? '' : 's'} after the exam ends` : undefined}>
            <input type="date" className={f.marksDueDate ? '' : 'is-empty'} value={f.marksDueDate} min={f.startDate || undefined} max={f.publishDate || undefined}
              onChange={(e) => set({ marksDueDate: e.target.value })} />
          </Field>
          {(meta?.terms || []).length ? (
            <Field label="Term" optional select>
              <select value={f.term} onChange={(e) => set({ term: e.target.value })}>
                <option value="">No term — the year as one</option>
                {meta.terms.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </Field>
          ) : null}
          <div className="rsf-fld">
            <label className="rsf-fld__label" htmlFor="rsf-status">Status</label>
            <TagSelect id="rsf-status" label="Status" value={canFlip ? f.status : 'active'} options={statusOptions}
              disabled={!canFlip} onChange={(v) => set({ status: v })} />
          </div>
        </div>
        <div className="rsf-checks">
          <CheckRow checked={f.showInPortal} onChange={(v) => set({ showInPortal: v })}
            label="Show exam in student portal" hint="Students can view marks after publication" />
          <CheckRow checked={f.includeInOverall} onChange={(v) => set({ includeInOverall: v })}
            label="Include in overall result" hint="Consider this exam in final result calculation" />
          <CheckRow checked={f.allowGraceMarks} onChange={(v) => set({ allowGraceMarks: v })}
            label="Allow grace marks" hint="Enable grace marks during evaluation" />
          <CheckRow checked={f.shareTimetable} onChange={(v) => set({ shareTimetable: v })}
            label="Share the timetable with families now"
            hint={f.shareTimetable ? 'Students and parents see the dates on their exam schedule, and are told' : 'Kept as the office\'s plan — share it from the exam when it is settled'} />
        </div>
      </Card>

      {/* ── 2 · Class & Subjects ─────────────────────────────────────────── */}
      <Card step="classes" icon="bookOpen" title="Classes & Sections"
        sub={editing ? 'An exam belongs to one section; to cover another, create an exam for it.' : 'Tick the classes sitting this exam, and their sections. One exam is created for each section.'}
        extra={exams ? <span className="rsf-count-chip">{plural(exams, 'section')} · {plural(chosen.length, 'class', 'classes')}</span> : null}>
        {editing ? (
          <p className="rsf-fixed"><Ico name="users" size={17} />{detail ? `${classLine(detail)} · ${detail.yearName} · ${plural(detail.roster, 'student')}` : 'Loading…'}</p>
        ) : !meta ? <p className="rsf-hint">Loading classes…</p>
          : !yearClasses.length ? <p className="rsf-hint">{yearName || 'This year'} has no classes yet — add them under Academics → Classes.</p>
            : (
              <div className="rsf-classes" data-bad={err('sections') ? 'true' : undefined}>
                {yearClasses.map((c) => {
                  const ids = c.sections.map((s) => s._id);
                  const on = ids.filter((id) => f.sectionIds.includes(id));
                  const students = c.sections.reduce((t, s) => t + (s.students || 0), 0);
                  return (
                    <div key={c._id} className={`rsf-class${on.length ? ' is-on' : ''}`}>
                      <label className="rsf-class__name">
                        <input type="checkbox" className="rsf-box" disabled={!ids.length}
                          checked={!!ids.length && on.length === ids.length}
                          ref={(el) => { if (el) el.indeterminate = on.length > 0 && on.length < ids.length; }}
                          onChange={() => toggleClass(c)} />
                        <span><strong>{c.className}</strong><small>{ids.length ? `${plural(ids.length, 'section')} · ${plural(students, 'student')}` : 'No sections yet'}</small></span>
                      </label>
                      <div className="rsf-class__secs" role="group" aria-label={`${c.className} sections`}>
                        {c.sections.map((s) => {
                          const picked = f.sectionIds.includes(s._id);
                          return (
                            <label key={s._id} className={`rsf-chip${picked ? ' is-on' : ''}`} title={s.classTeacher ? `Class teacher: ${s.classTeacher}` : 'No class teacher — the office validates its marks'}>
                              <input type="checkbox" checked={picked} onChange={() => toggleSection(s._id)} aria-label={`${c.className} section ${s.sectionName}`} />
                              <Ico name="check" size={13} />
                              <b>{s.sectionName}</b><small>{s.students}</small>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
        {err('sections') ? <p className="rsf-err">{err('sections')}</p> : null}
      </Card>

      <Card step="classes" icon="fileSheet" title="Subjects"
        sub={multi ? 'The papers this exam has. Each class sits only the subjects it is taught.' : 'The papers this exam has.'}
        extra={included.length ? <span className="rsf-count-chip">{plural(included.length, 'subject')}</span> : null}>
        {subjectsFixed ? <Note tone="amber">The marks have been submitted, so this exam's subjects and their marks are fixed. Paper dates and times can still change.</Note>
          : marksOpen ? <Note>Mark entry is open. You can add a subject that was left off, and take off or change one nobody has entered marks for yet — its teachers are told.</Note> : null}
        {subjectsState === 'loading' && !subjects.length ? <p className="rsf-hint">Loading subjects…</p>
          : !subjects.length ? (
            <p className="rsf-hint">
              {f.sectionIds.length
                ? 'No subject is linked to these classes or taught in these sections yet. Link subjects under Academics → Classes, or assign subject teachers to the sections.'
                : 'Tick the classes and sections above to list the subjects they can be examined in.'}
            </p>
          ) : (
            <div className="rsf-subjects" data-bad={err('subjects') ? 'true' : undefined}>
              {subjects.map((s) => {
                const to = appliesTo(s);
                const partial = multi && to.length < chosen.length;
                const gaps = (s.untaught || []).map(sectionLabel).filter(Boolean);
                const allGaps = gaps.length && gaps.length >= to.reduce((t, c) => t + c.sections.length, 0);
                const fixed = subjectsFixed || (s.include && hasMarks(s));
                return (
                  <label key={s.subject} className={`rsf-subj${s.include ? ' is-on' : ''}${fixed ? ' is-locked' : ''}`}>
                    <input type="checkbox" className="rsf-box" checked={s.include} disabled={fixed}
                      onChange={(e) => setRow(s.subject, { include: e.target.checked })} />
                    <span className="rsf-subj__text">
                      <span className="rsf-subj__name"><strong>{s.name}</strong>{s.code ? <em>{s.code}</em> : null}</span>
                      {partial ? <small className="rsf-subj__note"><Ico name="info" size={13} />{to.length ? `Only for ${to.map((c) => c.className).join(', ')}` : 'Not taught in the ticked classes'}</small> : null}
                      {hasMarks(s) ? <small className="rsf-subj__note"><Ico name="lock" size={13} />{plural(s.entered, 'mark')} entered — stays on the exam</small> : null}
                      {gaps.length ? (
                        <small className="rsf-subj__note is-warn"><Ico name="alert" size={13} />
                          {allGaps || editing ? 'No teacher assigned — the office enters these marks' : `No teacher in ${gaps.join(', ')}`}
                        </small>
                      ) : null}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        {err('subjects') ? <p className="rsf-err">{err('subjects')}</p> : null}
      </Card>

      {/* ── 3 · Marks & Grading ──────────────────────────────────────────── */}
      <Card step="marks" icon="chartUp" title="Marks & Schedule" sub="Each paper's maximum and pass marks, and when it is sat. The dates and times are the exam schedule students, parents and teachers see."
        extra={included.length ? <span className="rsf-count-chip">{totalText} marks in all</span> : null}>
        {!included.length ? <p className="rsf-hint">Tick the subjects under Class &amp; Subjects first.</p> : (
          <>
            {included.length > 1 ? (
              <div className="rsf-all">
                <span>{subjectsFixed ? 'Set the time for every paper' : 'Set for every subject'}</span>
                {subjectsFixed ? null : (
                  <>
                    <label>Max <input type="number" min="1" max="1000" value={all.maxMarks} onChange={(e) => setAll((a) => ({ ...a, maxMarks: e.target.value }))} aria-label="Maximum marks for every subject" /></label>
                    <label>Pass <input type="number" min="0" max="1000" value={all.passingMarks} onChange={(e) => setAll((a) => ({ ...a, passingMarks: e.target.value }))} aria-label="Pass marks for every subject" /></label>
                  </>
                )}
                <label>Time
                  <input type="time" className={all.startTime ? '' : 'is-empty'} value={all.startTime} onChange={(e) => setAll((a) => ({ ...a, startTime: e.target.value }))} aria-label="Start time for every paper" />
                  to
                  <input type="time" className={all.endTime ? '' : 'is-empty'} value={all.endTime} onChange={(e) => setAll((a) => ({ ...a, endTime: e.target.value }))} aria-label="End time for every paper" />
                </label>
                <Btn size="sm" onClick={() => {
                  // Marks always (while they may still change); the time only
                  // when one was given.
                  setSubjects((rows) => rows.map((r) => (r.include ? {
                    ...r,
                    // A maximum never changes under marks already entered.
                    ...(subjectsFixed ? null : { passingMarks: all.passingMarks, ...(hasMarks(r) ? null : { maxMarks: all.maxMarks }) }),
                    ...(all.startTime ? { startTime: all.startTime, endTime: all.endTime } : null),
                  } : r)));
                  setErrors((e) => ({ ...e, rows: undefined }));
                }}>Apply</Btn>
              </div>
            ) : null}
            <div className="rsf-marks">
              <table>
                <thead><tr><th>Subject</th><th>Marked as</th><th>Max marks</th><th>Pass marks</th><th>Paper date <small>(Optional)</small></th><th>Starts</th><th>Ends</th></tr></thead>
                <tbody>
                  {included.map((s) => {
                    const bad = errors.rows?.[s.subject];
                    // How the paper is marked is fixed once marks are entered against it.
                    const shapeFixed = subjectsFixed || hasMarks(s);
                    const mode = s.gradeOnly ? 'graded' : s.components ? 'parts' : 'marks';
                    const setMode = (m) => setRow(s.subject, m === 'graded' ? { gradeOnly: true, components: null }
                      : m === 'parts' ? { gradeOnly: false, components: PART_PRESETS.tp.map((c) => ({ ...c, key: '' })), passingMarks: '' }
                        : { gradeOnly: false, components: null, passingMarks: s.passingMarks === '' ? 33 : s.passingMarks });
                    const setPart = (j, patch) => setRow(s.subject, { components: s.components.map((c, k) => (k === j ? { ...c, ...patch } : c)) });
                    return (
                      <React.Fragment key={s.subject}>
                        <tr className={bad ? 'is-bad' : undefined} data-bad={bad ? 'true' : undefined}>
                          <th scope="row"><strong>{s.name}</strong>{multi && appliesTo(s).length < chosen.length ? <small>{appliesTo(s).map((c) => c.className).join(', ')}</small> : null}</th>
                          <td>
                            <select className="rsf-marks__mode" value={mode} disabled={shapeFixed} aria-label={`How ${s.name} is marked`} onChange={(e) => setMode(e.target.value)}
                              title={shapeFixed ? 'Marks have been entered — how the paper is marked stays as it is' : undefined}>
                              <option value="marks">Marks</option>
                              <option value="parts">In parts</option>
                              <option value="graded">Graded only</option>
                            </select>
                          </td>
                          <td>{s.gradeOnly ? <span className="rsf-marks__na" title="A graded paper is out of nothing — it counts in no total">—</span>
                            : s.components ? <span className="rsf-marks__sum" title="What its parts add up to">{maxOf(s)}</span>
                              : <input type="number" min="1" max="1000" value={s.maxMarks} disabled={shapeFixed} title={hasMarks(s) ? 'Marks have been entered out of this maximum' : undefined} aria-label={`Maximum marks for ${s.name}`} onChange={(e) => setRow(s.subject, { maxMarks: e.target.value })} />}</td>
                          <td>{s.gradeOnly ? <span className="rsf-marks__na">—</span>
                            : <input type="number" min="0" max="1000" value={s.passingMarks} disabled={subjectsFixed} placeholder={s.components ? 'Parts' : undefined}
                              title={s.components ? 'Left empty: the parts\' pass marks added up' : undefined} aria-label={`Pass marks for ${s.name}`} onChange={(e) => setRow(s.subject, { passingMarks: e.target.value })} />}</td>
                          <td><input type="date" className={s.examDate ? '' : 'is-empty'} value={s.examDate} min={f.startDate || undefined} max={f.endDate || undefined} aria-label={`Paper date for ${s.name}`} onChange={(e) => setRow(s.subject, { examDate: e.target.value })} /></td>
                          <td><input type="time" className={s.startTime ? '' : 'is-empty'} value={s.startTime} aria-label={`Start time for ${s.name}`} onChange={(e) => setRow(s.subject, { startTime: e.target.value })} /></td>
                          <td><input type="time" className={s.endTime ? '' : 'is-empty'} value={s.endTime} aria-label={`End time for ${s.name}`} onChange={(e) => setRow(s.subject, { endTime: e.target.value })} /></td>
                        </tr>
                        {s.components ? (
                          <tr className="rsf-marks__parts">
                            <td colSpan={7}>
                              <div className="rsf-parts" role="group" aria-label={`${s.name}'s parts`}>
                                {s.components.map((c, j) => (
                                  <span key={j} className="rsf-part">
                                    <input value={c.label} maxLength={30} placeholder="Part" disabled={shapeFixed} aria-label={`Name of part ${j + 1} of ${s.name}`}
                                      onChange={(e) => setPart(j, { label: e.target.value })} />
                                    <label>out of <input type="number" min="1" max="1000" value={c.maxMarks} disabled={shapeFixed} aria-label={`${c.label || 'Part'} maximum`} onChange={(e) => setPart(j, { maxMarks: e.target.value })} /></label>
                                    <label>pass <input type="number" min="0" max="1000" value={c.passingMarks} disabled={shapeFixed} placeholder="—" aria-label={`${c.label || 'Part'} pass mark`} onChange={(e) => setPart(j, { passingMarks: e.target.value })} /></label>
                                    {!shapeFixed && s.components.length > 2 ? (
                                      <button type="button" className="rsf-part__x" aria-label={`Take ${c.label || 'this part'} off`}
                                        onClick={() => setRow(s.subject, { components: s.components.filter((_, k) => k !== j) })}><Ico name="close" size={13} /></button>
                                    ) : null}
                                  </span>
                                ))}
                                {!shapeFixed && s.components.length < 4 ? (
                                  <Btn size="sm" icon="plus" onClick={() => setRow(s.subject, { components: [...s.components, { key: '', label: '', maxMarks: '10', passingMarks: '' }] })}>Add a part</Btn>
                                ) : null}
                                {!shapeFixed ? (
                                  <Btn size="sm" onClick={() => setRow(s.subject, { components: PART_PRESETS.ti.map((c) => ({ ...c, key: '' })) })}>Theory + Internal</Btn>
                                ) : null}
                                <small className="rsf-parts__say">A part with a pass mark must be passed, as well as the paper's own.</small>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                        {bad ? <tr className="rsf-marks__err"><td colSpan={7}>{s.name}: {bad}</td></tr> : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <Card step="marks" icon="trophy" title="Grading" sub="How a percentage becomes a grade, and how much grace is allowed.">
        <div className="rsf-grades" aria-label="Grade scale">
          {scale.map((r) => (
            <span key={r.grade} className={`rs-t-${gradeTone(r.grade, scale)}`}><b>{r.grade}</b>{gradeRange(r)}</span>
          ))}
          <span className="rs-t-slate"><b>AB</b>Absent</span>
        </div>
        <p className="rsf-hint">The school's grading scale — it is changed under Results → Settings. A student passes a subject at its pass mark, and passes the exam by passing every subject. An absent paper is graded AB and counts as not passed.</p>
        <div className="rsf-grace">
          <CheckRow checked={f.allowGraceMarks} onChange={(v) => set({ allowGraceMarks: v })} label="Allow grace marks"
            hint="Given when the results are worked out, only where they let a student pass every subject" />
          {f.allowGraceMarks ? (
            <div className="rsf-grace__nums">
              <Field label="Most grace in a subject" error={err('gracePer')}>
                <input type="number" min={GRACE.per[0]} max={GRACE.per[1]} value={f.gracePer} onChange={(e) => set({ gracePer: e.target.value })} />
              </Field>
              <Field label="In at most" error={err('graceSubjects')}>
                <input type="number" min={GRACE.subjects[0]} max={GRACE.subjects[1]} value={f.graceSubjects} onChange={(e) => set({ graceSubjects: e.target.value })} />
              </Field>
              <p className="rsf-grace__say">
                A student short of the pass mark by up to <b>{Number(f.gracePer) || 0} {Number(f.gracePer) === 1 ? 'mark' : 'marks'}</b> in no more than <b>{plural(Number(f.graceSubjects) || 0, 'subject')}</b> is given the difference. Anyone it cannot carry through every subject is given none.
              </p>
            </div>
          ) : null}
        </div>
      </Card>

      {/* ── 4 · Publish Settings ─────────────────────────────────────────── */}
      <Card step="publish" icon="megaphone" title="Publication" sub="Who is told, and what the scorecard shows.">
        <div className="rsf-checks rsf-checks--two">
          <CheckRow checked={f.showInPortal && f.notifyOnPublish} disabled={!f.showInPortal} onChange={(v) => set({ notifyOnPublish: v })}
            label="Notify students and parents"
            hint={f.showInPortal ? 'A notice goes out when the results are published' : 'Off — the exam is not shown in the student portal'} />
          <CheckRow checked={f.showRank} onChange={(v) => set({ showRank: v })}
            label="Show rank on the scorecard" hint="Families see the student's place in the section" />
        </div>
        <dl className="rsf-when">
          <div><dt>Results reach families</dt><dd>{portalText}<button type="button" className="rsf-link" onClick={() => go(0)}>Change</button></dd></div>
          <div><dt>Mark entry</dt><dd>{!canFlip ? statusOf(detail?.status).label : f.status === 'active' ? (editing && statusFrom === 'active' ? 'Open' : 'Opens as the exam is saved — subject teachers are told') : 'Stays closed until you open it'}</dd></div>
        </dl>
      </Card>

      {isFinal ? (
        <Card step="publish" icon="gradCap" title="Promotion" sub="What happens to the students who pass this final exam.">
          {promotionRan ? (
            <Note tone="amber">The students have already been promoted on these results. Withdrawing the results is what takes the promotion back.</Note>
          ) : null}
          <CheckRow checked={f.promoteOnPass} disabled={promotionRan} onChange={(v) => set({ promoteOnPass: v })}
            label="Promote students who pass to the next class"
            hint={`On the result publish date${f.publishDate ? ` (${fmtDay(f.publishDate)})` : ' — or when the results are published, as no date is set'}. Students who do not pass stay in their class.`} />
          {f.promoteOnPass ? (
            <>
              <div className="rsf-radios" role="radiogroup" aria-label="Promote into">
                {[
                  ['same', 'Same section', 'Section A moves up to section A of the next class, B to B. Where that class has no such section, or it is full, the student goes in without one.'],
                  ['none', 'No section', 'Students go into the next class without a section, for the school to place them — by hand, or with the section shuffle.'],
                ].map(([v, label, hint]) => (
                  <label key={v} className={`rsf-radio${f.promoteSection === v ? ' is-on' : ''}${promotionRan ? ' is-disabled' : ''}`}>
                    <input type="radio" name="promoteSection" value={v} checked={f.promoteSection === v} disabled={promotionRan} onChange={() => set({ promoteSection: v })} />
                    <span className="rsf-radio__dot" aria-hidden />
                    <span><strong>{label}</strong><small>{hint}</small></span>
                  </label>
                ))}
              </div>
              <div className="rsf-radios" role="radiogroup" aria-label="Students who do not pass">
                {[
                  ['stay', 'Who does not pass stays', 'They stay in their class and section, for the school to place by hand — after a re-exam, for instance.'],
                  ['repeat', 'Who does not pass repeats', 'They go into the same class in the next year, by the same section rule. A re-exam pass later moves them up.'],
                ].map(([v, label, hint]) => (
                  <label key={v} className={`rsf-radio${f.failedPlacement === v ? ' is-on' : ''}${promotionRan ? ' is-disabled' : ''}`}>
                    <input type="radio" name="failedPlacement" value={v} checked={f.failedPlacement === v} disabled={promotionRan} onChange={() => set({ failedPlacement: v })} />
                    <span className="rsf-radio__dot" aria-hidden />
                    <span><strong>{label}</strong><small>{hint}</small></span>
                  </label>
                ))}
              </div>
              {chosen.length ? (
                <ul className="rsf-targets">
                  {chosen.map((c) => {
                    const t = classById.get(String(c._id))?.next;
                    const sections = c.sections.map((x) => x.sectionName);
                    const missing = f.promoteSection === 'same' && t?.class ? sections.filter((n) => !t.sections.map((x) => String(x).toUpperCase()).includes(String(n).toUpperCase())) : [];
                    return (
                      <li key={c._id} className={!t || t.missing ? 'is-warn' : undefined}>
                        <strong>{c.className}</strong>
                        <Ico name="arrowRight" size={14} />
                        {!t ? <span>Where this class goes up to is not known.</span>
                          : t.missing === 'last' ? <span>The school's highest class — nobody moves up from it.</span>
                            : t.missing === 'year' ? <span>No academic year after this one yet — create it, with its classes, before the result date, or the promotion waits until you do.</span>
                              : t.missing === 'class' ? <span>{t.year.yearName} has no class above this one yet — set it up before the result date, or the promotion waits until you do.</span>
                                : (
                                  <span>
                                    <strong>{t.class.className}</strong>, {t.year.yearName}
                                    {f.promoteSection === 'same' ? ` · ${sections.map((n) => `${n} → ${missing.includes(n) ? 'no section' : n}`).join(', ')}` : ' · no section'}
                                  </span>
                                )}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </>
          ) : null}
        </Card>
      ) : null}

      <Card step="publish" icon="checkCircle" title="Review" sub={editing ? 'What the exam will be saved with.' : 'Everything the exam will be created with.'}>
        <Review onEdit={go} groups={[
          { title: 'Exam details', step: 0, rows: [
            ['Title', f.title.trim()], ['Type', typeName], ['Code', f.code.trim()], ['Academic year', yearName],
            ['Dates', f.startDate && f.endDate ? fmtRange(f.startDate, f.endDate) : ''], ['Description', f.description.trim()],
          ] },
          { title: 'Classes & subjects', step: 1, rows: [
            ['Sections', chosen.length ? chosen.map((c) => (editing ? classLine({ className: c.className, sectionName: c.sections[0]?.sectionName }) : `${c.className} – ${c.sections.map((s) => s.sectionName).join(', ')}`)).join(' · ') : ''],
            ['Subjects', included.map((s) => s.name).join(', ')],
          ] },
          { title: 'Marks & grading', step: 2, rows: [
            ['Total marks', totalText],
            ['Marking', [included.filter((s) => s.components).length ? `${plural(included.filter((s) => s.components).length, 'paper')} in parts` : '',
              included.filter((s) => s.gradeOnly).length ? `${plural(included.filter((s) => s.gradeOnly).length, 'paper')} graded only` : ''].filter(Boolean).join(' · ') || 'Marks'],
            ['Schedule', included.length ? `${included.filter((s) => s.examDate).length} of ${plural(included.length, 'paper')} dated${included.some((s) => s.startTime) ? `, ${included.filter((s) => s.startTime).length} timed` : ''}` : ''],
            ['Grace marks', f.allowGraceMarks ? `Up to ${f.gracePer} in at most ${plural(Number(f.graceSubjects) || 0, 'subject')}` : 'Not allowed'],
          ] },
          { title: 'Settings', step: 0, rows: [
            ['Status', !canFlip ? statusOf(detail?.status).label : f.status === 'active' ? 'Active' : 'Draft'],
            ['Student portal', f.showInPortal ? 'Shown' : 'Not shown'],
            ['Overall result', f.includeInOverall ? 'Included' : 'Not included'],
            ['Result date', f.publishDate ? fmtDay(f.publishDate) : 'Not set'],
            ['Marks due', f.marksDueDate ? fmtDay(f.marksDueDate) : 'No deadline'],
            ['Timetable', f.shareTimetable ? 'Shared with families' : 'Kept by the office for now'],
            ...((meta?.terms || []).length ? [['Term', meta.terms.find((t) => t.key === f.term)?.label || 'None']] : []),
            ...(isFinal ? [['Promotion', f.promoteOnPass ? `Who passes moves up — ${f.promoteSection === 'none' ? 'no section' : 'same section'}; who does not ${f.failedPlacement === 'repeat' ? 'repeats the class' : 'stays'}` : 'Off']] : []),
          ] },
        ]} />
        {!editing && exams ? (
          <Note>
            {exams === 1 ? 'One exam will be created' : `${exams} exams will be created — one for each section`}
            {chosen.length ? `: ${chosen.map((c) => `${c.className} ${c.sections.map((s) => s.sectionName).join(', ')}`).join('; ')}` : ''}.
            {' '}Each has its own marks sheets and its own class teacher to validate them.
          </Note>
        ) : null}
      </Card>
    </StepModal>
  );
}
