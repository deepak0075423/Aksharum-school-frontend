/**
 * Admin → Results → Settings (Oct 2026). What used to be fixed in code, made
 * the school's own (school-backend services/resultSettings):
 *
 *   Grading scale   standard A+ to F, CBSE's A1 to E2, five-point A to E, or
 *                   the school's own grades, each saying whether it passes
 *   Exam types      the built-in three renamed if the school likes, and its own
 *                   ("Half Yearly"), each counting as a unit test, a mid-term or
 *                   a final — only a final can promote
 *   Report cards    the co-scholastic areas and their grades, and what a report
 *                   card shows
 *   Reminders       when teachers are reminded about marks still to enter
 *
 * Since the second audit (Oct 2026), also: classes on a scale of their own;
 * terms, and how the year's result adds up (weighted parts, best of N, a pass
 * on the aggregate); promotion and re-exam rules (classes that detain nobody,
 * the re-exam limit, re-check requests, the distinction line); the report
 * card's class figures, subject remarks, signature and seal, and a bank of
 * remarks; when marks fall due, the office's own reminders, and the school's
 * time zone — the clock every result date and reminder is read on.
 *
 * Nothing here changes a result already published: a grade is written onto a
 * result as it is published, on the scale in force that day. Everything is
 * checked again by the server, which is what the page's own checks copy.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Btn, IconBtn, Empty, Ico } from '../rsUI';
import { Card, Field, CheckRow, Note } from '../rsForm';
import { gradeTone, gradeRange } from '../resultMeta';
import { schoolLogoUrl } from '../../../utils/branding';

const CLASS_TEST = 'CLASS_TEST';
const ZONES = (() => {
  try { const z = Intl.supportedValuesOf?.('timeZone'); if (z?.length) return z; } catch { /* an older browser */ }
  return ['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'America/New_York', 'UTC'];
})();
const blankOr = (v) => (v === null || v === undefined ? '' : String(v));
/** An uploaded image's address, wherever the API is served from. */
const imageUrl = (path) => (path ? schoolLogoUrl({ logo: path }) : null);

let seq = 0;
const uid = () => `n${(seq += 1)}`;

/** The server's settings as the page edits them. */
function draftOf(c) {
  const bands = c.scale.bands.map((b) => ({
    id: uid(), grade: b.grade, min: String(b.min), point: b.point === null || b.point === undefined ? '' : String(b.point), pass: b.pass !== false,
  }));
  return {
    gradePreset: c.scale.preset,
    bands,
    examTypes: c.examTypes.map((t) => ({ id: uid(), key: t.key, label: t.label, kind: t.kind, builtIn: !!t.builtIn, active: t.active !== false })),
    coScholastic: c.coScholastic.map((a) => ({ id: uid(), key: a.key, label: a.label })),
    coGrades: c.coScholasticGrades.join(', '),
    showAttendance: c.report.showAttendance,
    showRank: c.report.showRank,
    showGradePoints: c.report.showGradePoints,
    principalTitle: c.report.principalTitle,
    footer: c.report.footer,
    remindersEnabled: c.reminders.enabled,
    afterDays: String(c.reminders.afterDays),
    repeatDays: String(c.reminders.repeatDays),
    // Oct 2026
    classScales: (c.classScales || []).map((r) => ({ id: uid(), from: String(r.from), to: String(r.to), preset: r.preset, bands: r.bands || null })),
    terms: (c.terms || []).map((t) => ({ id: uid(), key: t.key, label: t.label, weight: blankOr(t.weight) })),
    overallMethod: c.overall?.method || 'marks',
    overallParts: (c.overall?.parts || []).map((x) => ({ id: uid(), source: x.source, weight: String(x.weight), best: blankOr(x.best) })),
    passRule: c.overall?.passRule || 'every',
    passPercent: String(c.overall?.passPercent ?? 33),
    noDetentionUpTo: blankOr(c.noDetentionUpTo),
    reExamMaxSubjects: blankOr(c.reExamMaxSubjects),
    recheckDays: String(c.recheckDays || 0),
    distinctionPercent: String(c.distinctionPercent ?? 75),
    remarkBank: (c.remarkBank || []).join('\n'),
    marksDueDays: blankOr(c.marksDueDays),
    officeReminders: c.officeReminders !== false,
    timezone: c.timezone || '',
    showClassFigures: !!c.report.showClassFigures,
    showSubjectRemarks: c.report.showSubjectRemarks !== false,
  };
}
/** What is compared to tell whether anything changed: the draft without its row ids. */
const plain = (d) => JSON.stringify(d, (k, v) => (k === 'id' ? undefined : v));

/** The scale rows a band list stands for — highest first, each with the range it covers. */
function rowsOf(bands) {
  const list = bands
    .map((b) => ({ grade: b.grade.trim(), min: Number(b.min), pass: b.pass }))
    .filter((b) => b.grade && Number.isFinite(b.min))
    .sort((a, b) => b.min - a.min);
  return list.map((b, i) => ({
    grade: b.grade, pass: b.pass, from: b.min,
    to: i === 0 ? 100 : Math.max(b.min, list[i - 1].min - (Number.isInteger(list[i - 1].min) ? 1 : 0.01)),
  }));
}

/** The server's checks on a custom scale, so a mistake is named before saving. */
function bandErrors(bands) {
  if (bands.length < 2 || bands.length > 12) return 'A grading scale has between 2 and 12 grades';
  for (const [i, b] of bands.entries()) {
    const g = b.grade.trim();
    if (!g) return `Grade ${i + 1} has no name`;
    if (g.length > 6) return `"${g}" is too long for a grade (6 characters at most)`;
    if (g.toUpperCase() === 'AB') return '"AB" is kept for an absent paper — choose another grade name';
    const min = Number(b.min);
    if (b.min === '' || !Number.isFinite(min) || min < 0 || min > 100) return `${g}: the lowest percentage must be between 0 and 100`;
    if (b.point !== '' && (!Number.isFinite(Number(b.point)) || Number(b.point) < 0 || Number(b.point) > 10)) return `${g}: a grade point is between 0 and 10`;
  }
  const names = bands.map((b) => b.grade.trim().toUpperCase());
  if (new Set(names).size !== names.length) return 'Two grades have the same name';
  const mins = bands.map((b) => Number(b.min));
  if (new Set(mins).size !== mins.length) return 'Two grades start at the same percentage';
  if (Math.min(...mins) !== 0) return 'The lowest grade must start at 0%';
  if (!bands.some((b) => b.pass)) return 'At least one grade must be a passing grade';
  if (!bands.some((b) => !b.pass)) return 'At least one grade must be a failing grade — the grade for a paper that is not passed';
  const lowestPass = Math.min(...bands.filter((b) => b.pass).map((b) => Number(b.min)));
  if (bands.some((b) => !b.pass && Number(b.min) > lowestPass)) return 'Every passing grade must be above every failing grade';
  return '';
}

function check(d) {
  const e = {};
  if (d.gradePreset === 'custom') { const m = bandErrors(d.bands); if (m) e.bands = m; }
  const labels = d.examTypes.map((t) => t.label.trim().toLowerCase());
  const blank = d.examTypes.find((t) => !t.label.trim());
  if (blank) e.types = 'Every exam type needs a name';
  else if (new Set(labels).size !== labels.length) e.types = 'Two exam types have the same name';
  else if (!d.examTypes.some((t) => t.active)) e.types = 'At least one exam type must stay switched on';
  const areas = d.coScholastic.map((a) => a.label.trim().toLowerCase());
  if (d.coScholastic.some((a) => !a.label.trim())) e.areas = 'Every co-scholastic area needs a name';
  else if (new Set(areas).size !== areas.length) e.areas = 'Two areas have the same name';
  const grades = d.coGrades.split(',').map((g) => g.trim()).filter(Boolean);
  if (grades.length < 2 || grades.length > 8) e.coGrades = 'Give between 2 and 8 grades, separated by commas';
  else if (grades.some((g) => g.length > 4)) e.coGrades = 'A co-scholastic grade is 4 characters at most';
  else if (new Set(grades.map((g) => g.toUpperCase())).size !== grades.length) e.coGrades = 'Two grades are the same';
  if (!d.principalTitle.trim()) e.principalTitle = 'Give the title for the head of school\'s signature';
  const whole = (v, lo, hi) => Number.isInteger(Number(v)) && v !== '' && Number(v) >= lo && Number(v) <= hi;
  const wholeOrBlank = (v, lo, hi) => v === '' || whole(v, lo, hi);
  if (!whole(d.afterDays, 0, 30)) e.afterDays = 'A whole number of days, 0 to 30';
  if (!whole(d.repeatDays, 1, 30)) e.repeatDays = 'A whole number of days, 1 to 30';

  // Classes on their own scale: whole class numbers, in order, never two rules for one class.
  for (const [i, r] of d.classScales.entries()) {
    if (!whole(r.from, -5, 20) || !whole(r.to, -5, 20)) { e.classScales = `Scale ${i + 1}: give the classes as whole numbers`; break; }
    if (Number(r.from) > Number(r.to)) { e.classScales = `Scale ${i + 1}: the first class must come before the last`; break; }
  }
  if (!e.classScales) {
    const sorted = [...d.classScales].sort((a, b) => Number(a.from) - Number(b.from));
    if (sorted.some((r, i) => i && Number(r.from) <= Number(sorted[i - 1].to))) e.classScales = 'Two scales cover the same class';
  }
  // Terms
  const termNames = d.terms.map((t) => t.label.trim().toLowerCase());
  if (d.terms.some((t) => !t.label.trim())) e.terms = 'Every term needs a name';
  else if (new Set(termNames).size !== termNames.length) e.terms = 'Two terms have the same name';
  else if (d.terms.some((t) => t.weight !== '' && !(Number(t.weight) > 0 && Number(t.weight) <= 100))) e.terms = 'A term\'s weight is between 1 and 100 — or leave every weight empty to weigh the terms equally';
  // The year's result
  if (d.overallMethod === 'weighted') {
    if (!d.overallParts.length) e.overall = 'Give at least one part its weight';
    else if (d.overallParts.some((x) => !(Number(x.weight) > 0 && Number(x.weight) <= 100))) e.overall = 'Each part\'s weight is between 1 and 100';
    else if (d.overallParts.some((x) => !wholeOrBlank(x.best, 1, 10))) e.overall = '"Best of" is a whole number from 1 to 10, or empty for all';
    else if (new Set(d.overallParts.map((x) => x.source)).size !== d.overallParts.length) e.overall = 'Each part can be listed once';
  }
  if (d.passRule === 'aggregate' && !(d.passPercent !== '' && Number(d.passPercent) >= 0 && Number(d.passPercent) <= 100)) e.passPercent = 'A percentage, 0 to 100';
  // Promotion and re-exams
  if (!wholeOrBlank(d.noDetentionUpTo, -5, 20)) e.noDetentionUpTo = 'A class number, or empty';
  if (!wholeOrBlank(d.reExamMaxSubjects, 1, 20)) e.reExamMaxSubjects = 'A whole number, 1 to 20 — or empty for no limit';
  if (!whole(d.recheckDays, 0, 60)) e.recheckDays = 'A whole number of days, 0 to 60';
  if (!(d.distinctionPercent !== '' && Number(d.distinctionPercent) > 0 && Number(d.distinctionPercent) <= 100)) e.distinctionPercent = 'A percentage, 1 to 100';
  const remarks = d.remarkBank.split('\n').map((x) => x.trim()).filter(Boolean);
  if (remarks.length > 100) e.remarkBank = 'At most 100 remarks';
  else if (remarks.some((x) => x.length > 300)) e.remarkBank = 'A remark is 300 characters at most';
  if (!wholeOrBlank(d.marksDueDays, 0, 60)) e.marksDueDays = 'A whole number of days, 0 to 60 — or empty';
  return e;
}

export default function ResultSettings() {
  const nav = useNavigate();
  usePageCrumbs([{ label: 'Settings' }]);
  const [conf, setConf] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [d, setD] = useState(null);
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState('');
  const top = useRef(null);

  const load = () => {
    setLoadError(null);
    api.getResultSettings()
      .then((res) => { const c = res.data ?? res; setConf(c); setD(draftOf(c)); })
      .catch((e) => setLoadError(e));
  };
  useEffect(load, []);

  const base = useMemo(() => (conf ? plain(draftOf(conf)) : ''), [conf]);
  const dirty = !!d && plain(d) !== base;

  // A tab closed with changes unsaved asks first.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (patch) => { setD((s) => ({ ...s, ...patch })); setBanner(''); };
  const clear = (...keys) => setErrors((e) => { if (!keys.some((k) => e[k])) return e; const n = { ...e }; keys.forEach((k) => delete n[k]); return n; });

  if (!d) {
    return (
      <div className="rs-page">
        <PageHead title="Result Settings" subtitle="Grading, exam types, report cards and reminders for this school's results." />
        {loadError
          ? <div className="rs-acard"><Empty title="Settings could not be loaded" action={<Btn icon="refresh" onClick={load}>Try again</Btn>}>{loadError.message}</Empty></div>
          : <div className="rs-acard rs-loading" role="status">Loading settings…</div>}
      </div>
    );
  }

  const presetRows = (key) => (key === 'custom' ? rowsOf(d.bands) : conf.presets.find((p) => p.key === key)?.rows || []);
  const scaleNow = presetRows(d.gradePreset);

  const pointsIn = (key) => (key === 'custom' ? d.bands.some((b) => b.point !== '') : !!conf.presets.find((p) => p.key === key)?.rows.some((r) => r.point !== null));
  const scaleHasPoints = pointsIn(d.gradePreset);

  /* ── custom bands ── */
  const setBand = (id, patch) => { set({ bands: d.bands.map((b) => (b.id === id ? { ...b, ...patch } : b)) }); clear('bands'); };
  const addBand = () => {
    if (d.bands.length >= 12) return;
    set({ bands: [...d.bands, { id: uid(), grade: '', min: '', point: '', pass: true }] }); clear('bands');
  };
  const dropBand = (id) => { set({ bands: d.bands.filter((b) => b.id !== id) }); clear('bands'); };
  const choosePreset = (key) => {
    // A scale with grade points shows them, once the school moves to one.
    const points = !pointsIn(d.gradePreset) && pointsIn(key) ? { showGradePoints: true } : null;
    // Custom starts from the scale in force, so the school edits rather than retypes.
    if (key === 'custom' && d.gradePreset !== 'custom') {
      const from = conf.presets.find((p) => p.key === d.gradePreset);
      const src = from ? from.rows : [];
      set({ gradePreset: key, ...points, bands: src.map((r) => ({ id: uid(), grade: r.grade, min: String(r.from), point: r.point === null ? '' : String(r.point), pass: r.pass })) });
    } else set({ gradePreset: key, ...points });
    clear('bands');
  };

  /* ── exam types ── */
  const setType = (id, patch) => { set({ examTypes: d.examTypes.map((t) => (t.id === id ? { ...t, ...patch } : t)) }); clear('types'); };
  const addType = () => { set({ examTypes: [...d.examTypes, { id: uid(), key: '', label: '', kind: 'MID_TERM', builtIn: false, active: true }] }); clear('types'); };
  const dropType = (id) => { set({ examTypes: d.examTypes.filter((t) => t.id !== id) }); clear('types'); };

  /* ── co-scholastic areas ── */
  const setArea = (id, label) => { set({ coScholastic: d.coScholastic.map((a) => (a.id === id ? { ...a, label } : a)) }); clear('areas'); };
  const addArea = () => { if (d.coScholastic.length < 12) { set({ coScholastic: [...d.coScholastic, { id: uid(), key: '', label: '' }] }); clear('areas'); } };
  const dropArea = (id) => { set({ coScholastic: d.coScholastic.filter((a) => a.id !== id) }); clear('areas'); };

  /* ── classes on their own scale ── */
  // "The school's own" for a class range is the custom scale above, as it stands.
  const ownBands = () => d.bands.map((b) => ({ grade: b.grade.trim(), min: Number(b.min), point: b.point === '' ? null : Number(b.point), pass: b.pass }));
  const setRule = (id, patch) => { set({ classScales: d.classScales.map((r) => (r.id === id ? { ...r, ...patch } : r)) }); clear('classScales'); };
  const addRule = () => { if (d.classScales.length < 10) { set({ classScales: [...d.classScales, { id: uid(), from: '', to: '', preset: conf.presets[0]?.key || 'standard', bands: null }] }); clear('classScales'); } };
  const dropRule = (id) => { set({ classScales: d.classScales.filter((r) => r.id !== id) }); clear('classScales'); };

  /* ── terms, and the year's result ── */
  const setTerm = (id, patch) => { set({ terms: d.terms.map((t) => (t.id === id ? { ...t, ...patch } : t)) }); clear('terms'); };
  const addTerm = () => { if (d.terms.length < 4) { set({ terms: [...d.terms, { id: uid(), key: '', label: '', weight: '' }] }); clear('terms'); } };
  const dropTerm = (id) => { set({ terms: d.terms.filter((t) => t.id !== id) }); clear('terms'); };
  const sources = [...d.examTypes.filter((t) => t.key).map((t) => ({ value: t.key, label: t.label || t.key })), { value: CLASS_TEST, label: 'Class tests' }];
  const setPart = (id, patch) => { set({ overallParts: d.overallParts.map((x) => (x.id === id ? { ...x, ...patch } : x)) }); clear('overall'); };
  const addPart = () => {
    if (d.overallParts.length >= 8) return;
    const free = sources.find((o) => !d.overallParts.some((x) => x.source === o.value));
    set({ overallParts: [...d.overallParts, { id: uid(), source: free?.value || sources[0].value, weight: '', best: '' }] }); clear('overall');
  };
  const dropPart = (id) => { set({ overallParts: d.overallParts.filter((x) => x.id !== id) }); clear('overall'); };
  const weightSum = d.overallParts.reduce((t, x) => t + (Number(x.weight) || 0), 0);

  /* ── signature and seal: saved as they are chosen, apart from the rest ── */
  const putImage = async (kind, file) => {
    if (!file) return;
    if (!/^image\/(png|jpe?g)$/.test(file.type)) { toast.error('Choose a PNG or JPG image'); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error('The image is over 2 MB — choose a smaller one'); return; }
    setImageBusy(kind);
    try {
      const res = await api.uploadReportSignature(kind, file);
      setConf(res.data ?? res);
      toast.success(kind === 'schoolSeal' ? 'Seal saved — it prints on every report card' : 'Signature saved — it prints on every report card');
    } catch (err) { toast.error(err.message || 'The image could not be saved'); } finally { setImageBusy(''); }
  };
  const dropImage = async (kind) => {
    setImageBusy(kind);
    try {
      const res = await api.updateResultSettings({ [kind]: '' });
      setConf(res.data ?? res);
      toast.success(kind === 'schoolSeal' ? 'Seal removed' : 'Signature removed');
    } catch (err) { toast.error(err.message || 'That did not work'); } finally { setImageBusy(''); }
  };

  const save = async () => {
    const e = check(d);
    setErrors(e);
    if (Object.keys(e).length) {
      setBanner('Some settings need attention — see the notes below.');
      top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    setSaving(true); setBanner('');
    try {
      const body = {
        gradePreset: d.gradePreset,
        ...(d.gradePreset === 'custom' ? { gradeBands: d.bands.map((b) => ({ grade: b.grade.trim(), min: Number(b.min), point: b.point === '' ? null : Number(b.point), pass: b.pass })) } : null),
        examTypes: d.examTypes.map((t) => ({ ...(t.key ? { key: t.key } : null), label: t.label.trim(), kind: t.kind, active: t.active })),
        coScholastic: d.coScholastic.map((a) => ({ ...(a.key ? { key: a.key } : null), label: a.label.trim() })),
        coScholasticGrades: d.coGrades.split(',').map((g) => g.trim()).filter(Boolean),
        showAttendance: d.showAttendance, showRank: d.showRank, showGradePoints: d.showGradePoints,
        principalTitle: d.principalTitle.trim(), reportFooter: d.footer.trim(),
        remindersEnabled: d.remindersEnabled, reminderAfterDays: Number(d.afterDays), reminderRepeatDays: Number(d.repeatDays),
        classScales: d.classScales.map((r) => ({ from: Number(r.from), to: Number(r.to), preset: r.preset, ...(r.preset === 'custom' ? { bands: r.bands || ownBands() } : null) })),
        terms: d.terms.map((t) => ({ ...(t.key ? { key: t.key } : null), label: t.label.trim(), weight: t.weight === '' ? null : Number(t.weight) })),
        overall: {
          method: d.overallMethod, passRule: d.passRule, passPercent: Number(d.passPercent),
          parts: d.overallParts.map((x) => ({ source: x.source, weight: Number(x.weight), best: x.best === '' ? null : Number(x.best) })),
        },
        noDetentionUpTo: d.noDetentionUpTo === '' ? null : Number(d.noDetentionUpTo),
        reExamMaxSubjects: d.reExamMaxSubjects === '' ? null : Number(d.reExamMaxSubjects),
        recheckDays: Number(d.recheckDays),
        distinctionPercent: Number(d.distinctionPercent),
        remarkBank: d.remarkBank.split('\n').map((x) => x.trim()).filter(Boolean),
        marksDueDays: d.marksDueDays === '' ? null : Number(d.marksDueDays),
        officeReminders: d.officeReminders,
        showClassFigures: d.showClassFigures, showSubjectRemarks: d.showSubjectRemarks,
        ...(d.timezone !== (conf.timezone || '') ? { timezone: d.timezone } : null),
      };
      const res = await api.updateResultSettings(body);
      const c = res.data ?? res;
      setConf(c); setD(draftOf(c)); setErrors({});
      toast.success('Result settings saved');
    } catch (err) {
      setBanner(err.message || 'The settings could not be saved');
      top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } finally { setSaving(false); }
  };

  const discard = () => { setD(draftOf(conf)); setErrors({}); setBanner(''); };

  return (
    <div className="rs-page rs-set" ref={top}>
      <PageHead title="Result Settings" subtitle="Grading, exam types, terms, promotion, report cards and reminders for this school's results.">
        <Btn size="lg" icon="arrowLeft" onClick={() => nav('/admin/results')}>Back to Results</Btn>
        <Btn kind="primary" size="lg" icon="save" busy={saving} disabled={!dirty} onClick={save}>Save Changes</Btn>
      </PageHead>

      {banner ? <p className="rsf-banner rs-set__banner" role="alert"><Ico name="alert" size={16} />{banner}</p> : null}

      {/* ── Grading ─────────────────────────────────────────────────────── */}
      <Card icon="trophy" size="lg" title="Grading Scale" className="rs-set__card"
        sub="How a percentage becomes a grade. A result keeps the grade it was published with; a new scale grades results published from now on.">
        <div className="rs-set__scales" role="radiogroup" aria-label="Grading scale">
          {[...conf.presets.map((p) => ({ key: p.key, label: p.label })), { key: 'custom', label: 'The school\'s own' }].map((p) => {
            const rows = presetRows(p.key);
            return (
              <label key={p.key} className={`rsf-radio rs-set__scale${d.gradePreset === p.key ? ' is-on' : ''}`}>
                <input type="radio" name="gradePreset" value={p.key} checked={d.gradePreset === p.key} onChange={() => choosePreset(p.key)} />
                <span className="rsf-radio__dot" aria-hidden />
                <span>
                  <strong>{p.label}</strong>
                  <span className="rs-set__chips">
                    {p.key === 'custom' && d.gradePreset !== 'custom'
                      ? <small>Your own grades, ranges and grade points</small>
                      : rows.map((r) => <i key={r.grade} className={`rs-t-${gradeTone(r.grade, rows)}`}>{r.grade}</i>)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>

        {d.gradePreset === 'custom' ? (
          <div className="rs-set__bands" data-bad={errors.bands ? 'true' : undefined}>
            <table>
              <thead><tr><th>Grade</th><th>From (%)</th><th>Grade point <small>(optional)</small></th><th>Passing grade</th><th><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>
                {d.bands.map((b) => (
                  <tr key={b.id}>
                    <td><input className="rsf-in" value={b.grade} maxLength={6} placeholder="e.g. A1" aria-label="Grade" onChange={(e) => setBand(b.id, { grade: e.target.value })} /></td>
                    <td><input className="rsf-in" type="number" min="0" max="100" step="0.5" value={b.min} aria-label={`${b.grade || 'This grade'} starts at`} onChange={(e) => setBand(b.id, { min: e.target.value })} /></td>
                    <td><input className="rsf-in" type="number" min="0" max="10" step="0.5" value={b.point} placeholder="—" aria-label={`Grade point for ${b.grade || 'this grade'}`} onChange={(e) => setBand(b.id, { point: e.target.value })} /></td>
                    <td><label className="rs-set__pass"><input type="checkbox" className="rsf-box" checked={b.pass} onChange={(e) => setBand(b.id, { pass: e.target.checked })} />{b.pass ? 'Pass' : 'Fail'}</label></td>
                    <td><IconBtn icon="trash" label={`Remove ${b.grade || 'this grade'}`} disabled={d.bands.length <= 2} onClick={() => dropBand(b.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Btn size="sm" icon="plus" onClick={addBand} disabled={d.bands.length >= 12}>Add Grade</Btn>
            {errors.bands ? <p className="rsf-err">{errors.bands}</p> : null}
          </div>
        ) : null}

        <div className="rsf-grades rs-set__now" aria-label="The scale in force">
          {scaleNow.map((r) => <span key={r.grade} className={`rs-t-${gradeTone(r.grade, scaleNow)}`}><b>{r.grade}</b>{gradeRange(r)}</span>)}
          <span className="rs-t-slate"><b>AB</b>Absent</span>
        </div>
        <Note>
          A grade never contradicts the result beside it. A student who did not pass a subject gets the highest failing grade, however
          the percentage falls; one who passed is never given a failing grade. An absent paper is AB.
        </Note>

        <h4 className="rs-set__h rs-set__h--gap">Classes on a scale of their own</h4>
        <p className="rsf-hint">Say, five-point grades for the primary classes and the scale above for the rest. Classes not listed use the scale above.</p>
        <div className="rs-set__rules" data-bad={errors.classScales ? 'true' : undefined}>
          {d.classScales.map((r) => (
            <div key={r.id} className="rs-set__rule">
              <span>Classes</span>
              <input className="rsf-in" type="number" min="-5" max="20" value={r.from} aria-label="From class" onChange={(e) => setRule(r.id, { from: e.target.value })} />
              <span>to</span>
              <input className="rsf-in" type="number" min="-5" max="20" value={r.to} aria-label="To class" onChange={(e) => setRule(r.id, { to: e.target.value })} />
              <span>grade on</span>
              <span className="rsf-ctl is-select">
                <select className="rsf-in" value={r.preset} aria-label="Their grading scale"
                  onChange={(e) => setRule(r.id, { preset: e.target.value, bands: e.target.value === 'custom' ? (r.bands || ownBands()) : null })}>
                  {conf.presets.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
                  {d.gradePreset === 'custom' || r.preset === 'custom' ? <option value="custom">{r.preset === 'custom' && r.bands && d.gradePreset !== 'custom' ? 'Its own grades (as saved)' : 'The school\'s own (above)'}</option> : null}
                </select>
                <span className="rsf-ctl__chev" aria-hidden><Ico name="chevronDown" size={17} /></span>
              </span>
              <IconBtn icon="trash" label="Remove this class scale" onClick={() => dropRule(r.id)} />
            </div>
          ))}
          <Btn size="sm" icon="plus" onClick={addRule} disabled={d.classScales.length >= 10}>Add Classes</Btn>
          {errors.classScales ? <p className="rsf-err">{errors.classScales}</p> : null}
        </div>
      </Card>

      {/* ── Exam types ──────────────────────────────────────────────────── */}
      <Card icon="fileDoc" size="lg" title="Exam Types" className="rs-set__card"
        sub="The types offered when an exam is created. Each counts as a unit test, a mid-term or a final — only a final can promote students.">
        <div className="rs-set__list" data-bad={errors.types ? 'true' : undefined}>
          <div className="rs-set__lhead" aria-hidden><span>Name</span><span>Counts as</span><span>Offered</span><span /></div>
          {d.examTypes.map((t) => (
            <div key={t.id} className={`rs-set__lrow${t.active ? '' : ' is-off'}`}>
              <input className="rsf-in" value={t.label} maxLength={40} placeholder="e.g. Half Yearly" aria-label="Exam type name" onChange={(e) => setType(t.id, { label: e.target.value })} />
              {t.builtIn || t.key ? (
                <span className="rs-set__kind" title={t.builtIn ? 'A built-in type' : 'Fixed once the type is saved'}>
                  {conf.kinds.find((k) => k.value === t.kind)?.label}{t.builtIn ? <small>Built in</small> : null}
                </span>
              ) : (
                <span className="rsf-ctl is-select">
                  <select className="rsf-in" value={t.kind} aria-label={`What ${t.label || 'this type'} counts as`} onChange={(e) => setType(t.id, { kind: e.target.value })}>
                    {conf.kinds.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                  <span className="rsf-ctl__chev" aria-hidden><Ico name="chevronDown" size={17} /></span>
                </span>
              )}
              <label className="rs-set__on">
                <input type="checkbox" className="rsf-box" checked={t.active} onChange={(e) => setType(t.id, { active: e.target.checked })} aria-label={`Offer ${t.label || 'this type'} on the Create Exam form`} />
                <span>{t.active ? 'On' : 'Off'}</span>
              </label>
              {t.builtIn ? <span /> : <IconBtn icon="trash" label={`Remove ${t.label || 'this type'}`} onClick={() => dropType(t.id)} />}
            </div>
          ))}
          <Btn size="sm" icon="plus" onClick={addType}>Add Exam Type</Btn>
          {errors.types ? <p className="rsf-err">{errors.types}</p> : null}
        </div>
        <p className="rsf-hint">Renaming a type renames it on every exam of that type. A type an exam already uses cannot be removed — switch it off instead, and it leaves the Create Exam form while its exams keep it.</p>
      </Card>

      {/* ── Terms and the year's result ─────────────────────────────────── */}
      <Card icon="calendarDays" size="lg" title="Terms & the Year's Result" className="rs-set__card"
        sub="The terms an exam can belong to, and how the exams marked “Include in overall result” add up to the year's result — on the Overall page, the merit list and the report card.">
        <h4 className="rs-set__h">Terms</h4>
        <div className="rs-set__list" data-bad={errors.terms ? 'true' : undefined}>
          {d.terms.length ? <div className="rs-set__lhead rs-set__lhead--terms" aria-hidden><span>Name</span><span>Weight (%)</span><span /></div> : null}
          {d.terms.map((t) => (
            <div key={t.id} className="rs-set__lrow rs-set__lrow--terms">
              <input className="rsf-in" value={t.label} maxLength={30} placeholder="e.g. Term 1" aria-label="Term name" onChange={(e) => setTerm(t.id, { label: e.target.value })} />
              <input className="rsf-in" type="number" min="1" max="100" value={t.weight} placeholder="Equal" aria-label={`${t.label || 'This term'}'s weight`} onChange={(e) => setTerm(t.id, { weight: e.target.value })} />
              <IconBtn icon="trash" label={`Remove ${t.label || 'this term'}`} onClick={() => dropTerm(t.id)} />
            </div>
          ))}
          {!d.terms.length ? <p className="rsf-hint">No terms — the year is one stretch, and report cards cover it whole.</p> : null}
          <Btn size="sm" icon="plus" onClick={addTerm} disabled={d.terms.length >= 4}>Add Term</Btn>
          {errors.terms ? <p className="rsf-err">{errors.terms}</p> : null}
        </div>
        <p className="rsf-hint">An exam is put in a term when it is created; report cards can then be printed for one term. Weights make each term a share of the year — leave them empty to weigh the terms equally.</p>

        <h4 className="rs-set__h rs-set__h--gap">How the year adds up</h4>
        <div className="rs-set__scales rs-set__scales--two" role="radiogroup" aria-label="How the year's result is worked out">
          {[['marks', 'Marks added up', 'Every counted exam\'s marks together — an exam weighs what it is out of.'],
            ['weighted', 'Weighted parts', 'Each exam type — or class tests — a share of every subject, the best few if you like.']].map(([v, label, hint]) => (
            <label key={v} className={`rsf-radio${d.overallMethod === v ? ' is-on' : ''}`}>
              <input type="radio" name="overallMethod" value={v} checked={d.overallMethod === v} onChange={() => { set({ overallMethod: v }); clear('overall'); }} />
              <span className="rsf-radio__dot" aria-hidden />
              <span><strong>{label}</strong><small>{hint}</small></span>
            </label>
          ))}
        </div>
        {d.overallMethod === 'weighted' ? (
          <div className="rs-set__list rs-set__parts" data-bad={errors.overall ? 'true' : undefined}>
            <div className="rs-set__lhead rs-set__lhead--parts" aria-hidden><span>Part</span><span>Weight (%)</span><span>Best of</span><span /></div>
            {d.overallParts.map((x) => (
              <div key={x.id} className="rs-set__lrow rs-set__lrow--parts">
                <span className="rsf-ctl is-select">
                  <select className="rsf-in" value={x.source} aria-label="Exam type or class tests" onChange={(e) => setPart(x.id, { source: e.target.value })}>
                    {sources.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <span className="rsf-ctl__chev" aria-hidden><Ico name="chevronDown" size={17} /></span>
                </span>
                <input className="rsf-in" type="number" min="1" max="100" value={x.weight} aria-label="Weight" onChange={(e) => setPart(x.id, { weight: e.target.value })} />
                <input className="rsf-in" type="number" min="1" max="10" value={x.best} placeholder="All" aria-label="Best of how many" onChange={(e) => setPart(x.id, { best: e.target.value })} />
                <IconBtn icon="trash" label="Remove this part" onClick={() => dropPart(x.id)} />
              </div>
            ))}
            <Btn size="sm" icon="plus" onClick={addPart} disabled={d.overallParts.length >= 8}>Add Part</Btn>
            {errors.overall ? <p className="rsf-err">{errors.overall}</p>
              : d.overallParts.length ? <p className="rsf-hint">The weights add up to {weightSum}{weightSum === 100 ? '' : ' — they are scaled to 100, so they need not'}. “Best of 2” counts a student's best two papers of that kind in each subject.</p> : null}
          </div>
        ) : null}
        <div className="rs-set__scales rs-set__scales--two" role="radiogroup" aria-label="How a student passes the year">
          {[['every', 'Pass every exam', 'The year is passed by passing every counted exam.'],
            ['aggregate', 'Pass on the aggregate', 'Each subject is passed on its percentage for the whole year.']].map(([v, label, hint]) => (
            <label key={v} className={`rsf-radio${d.passRule === v ? ' is-on' : ''}`}>
              <input type="radio" name="passRule" value={v} checked={d.passRule === v} onChange={() => set({ passRule: v })} />
              <span className="rsf-radio__dot" aria-hidden />
              <span><strong>{label}</strong><small>{hint}</small></span>
            </label>
          ))}
        </div>
        {d.passRule === 'aggregate' ? (
          <div className="rs-set__days">
            <Field label="Pass percentage in each subject" error={errors.passPercent} hint="A subject's year percentage at or above this is a pass">
              <input type="number" min="0" max="100" value={d.passPercent} onChange={(e) => { set({ passPercent: e.target.value }); clear('passPercent'); }} />
            </Field>
          </div>
        ) : null}
      </Card>

      {/* ── Promotion, re-exams, re-checks ──────────────────────────────── */}
      <Card icon="gradCap" size="lg" title="Promotion, Re-exams & Re-checks" className="rs-set__card"
        sub="Rules a final exam's promotion and its re-exams follow, and what families may ask for once results are out.">
        <div className="rs-set__days rs-set__days--four">
          <Field label="Classes that detain nobody" optional error={errors.noDetentionUpTo} hint="Up to this class, every student moves up whatever the result — e.g. 8">
            <input type="number" min="-5" max="20" value={d.noDetentionUpTo} placeholder="None" onChange={(e) => { set({ noDetentionUpTo: e.target.value }); clear('noDetentionUpTo'); }} />
          </Field>
          <Field label="Re-exam in at most" optional error={errors.reExamMaxSubjects} hint="Papers — a student who failed more sits none">
            <input type="number" min="1" max="20" value={d.reExamMaxSubjects} placeholder="No limit" onChange={(e) => { set({ reExamMaxSubjects: e.target.value }); clear('reExamMaxSubjects'); }} />
          </Field>
          <Field label="Re-check requests within" error={errors.recheckDays} hint="Days after results reach families; 0 — not offered">
            <input type="number" min="0" max="60" value={d.recheckDays} onChange={(e) => { set({ recheckDays: e.target.value }); clear('recheckDays'); }} />
          </Field>
          <Field label="Distinction from" error={errors.distinctionPercent} hint="Percentage — counted under Analytics and on the merit list">
            <input type="number" min="1" max="100" value={d.distinctionPercent} onChange={(e) => { set({ distinctionPercent: e.target.value }); clear('distinctionPercent'); }} />
          </Field>
        </div>
        <Note>A student may still be promoted on condition, or kept back, one at a time — from the final exam's Promotion section once its results are published.</Note>
      </Card>

      {/* ── Report cards ────────────────────────────────────────────────── */}
      <Card icon="gradCap" size="lg" title="Report Cards" className="rs-set__card"
        sub="What a report card carries besides the marks. The class teacher gives the co-scholastic grades and remarks for each student.">
        <div className="rs-set__two">
          <div>
            <h4 className="rs-set__h">Co-scholastic areas</h4>
            <div className="rs-set__areas" data-bad={errors.areas ? 'true' : undefined}>
              {d.coScholastic.map((a) => (
                <div key={a.id} className="rs-set__area">
                  <input className="rsf-in" value={a.label} maxLength={40} placeholder="e.g. Art Education" aria-label="Area name" onChange={(e) => setArea(a.id, e.target.value)} />
                  <IconBtn icon="trash" label={`Remove ${a.label || 'this area'}`} onClick={() => dropArea(a.id)} />
                </div>
              ))}
              {!d.coScholastic.length ? <p className="rsf-hint">No co-scholastic areas — report cards show the marks only.</p> : null}
              <Btn size="sm" icon="plus" onClick={addArea} disabled={d.coScholastic.length >= 12}>Add Area</Btn>
              {errors.areas ? <p className="rsf-err">{errors.areas}</p> : null}
            </div>
            <Field label="Grades an area can be given" error={errors.coGrades} hint="Best first, separated by commas — e.g. A, B, C">
              <input value={d.coGrades} maxLength={60} onChange={(e) => { set({ coGrades: e.target.value }); clear('coGrades'); }} />
            </Field>
          </div>
          <div>
            <h4 className="rs-set__h">On the report card</h4>
            <div className="rs-set__checks">
              <CheckRow checked={d.showAttendance} onChange={(v) => set({ showAttendance: v })} label="Attendance" hint="Days present out of the days marked, for the year so far" />
              <CheckRow checked={d.showRank} onChange={(v) => set({ showRank: v })} label="Rank in the section" hint="Only where every exam counted shows its rank" />
              <CheckRow checked={d.showGradePoints} onChange={(v) => set({ showGradePoints: v })} label="Grade points"
                hint={scaleHasPoints ? 'Each grade\'s point on the scale' : 'This scale has no grade points — nothing to show'} disabled={!scaleHasPoints} />
              <CheckRow checked={d.showClassFigures} onChange={(v) => set({ showClassFigures: v })} label="Class average and highest"
                hint="Beside each subject: the section's average and highest marks" />
              <CheckRow checked={d.showSubjectRemarks} onChange={(v) => set({ showSubjectRemarks: v })} label="Subject teachers' remarks"
                hint="The remark a subject teacher wrote beside a student's marks" />
            </div>
            <Field label="Signature title" error={errors.principalTitle} hint="Printed under the head of school's signature">
              <input value={d.principalTitle} maxLength={40} onChange={(e) => { set({ principalTitle: e.target.value }); clear('principalTitle'); }} />
            </Field>
            <Field label="Footer" optional count={[d.footer.length, 300]}>
              <textarea rows={3} maxLength={300} value={d.footer} placeholder="e.g. School reopens on 2 April. Uniform is compulsory." onChange={(e) => set({ footer: e.target.value })} />
            </Field>
          </div>
        </div>

        <h4 className="rs-set__h rs-set__h--gap">Signature and seal</h4>
        <p className="rsf-hint">Printed on every report card, above the signature title. PNG or JPG, up to 2 MB — a signature on a white or clear background prints best. Saved as soon as it is chosen.</p>
        <div className="rs-set__imgs">
          {[['principalSignature', `${d.principalTitle.trim() || 'Principal'}'s signature`], ['schoolSeal', 'School seal']].map(([kind, label]) => {
            const url = imageUrl(conf.report[kind]);
            return (
              <div key={kind} className="rs-set__img">
                <span className="rs-set__imgbox">{url ? <img src={url} alt={label} /> : <small>None yet</small>}</span>
                <span className="rs-set__imgtext">
                  <strong>{label}</strong>
                  <span className="rs-set__imgacts">
                    <label className={`rs-btn rs-btn--outline rs-btn--sm${imageBusy === kind ? ' is-busy' : ''}`}>
                      <Ico name="upload" size={14} />{url ? 'Replace' : 'Upload'}
                      <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={!!imageBusy}
                        onChange={(e) => { putImage(kind, e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    {url ? <Btn size="sm" kind="ghost" icon="trash" disabled={!!imageBusy} onClick={() => dropImage(kind)}>Remove</Btn> : null}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        <h4 className="rs-set__h rs-set__h--gap">Remark bank</h4>
        <Field label="Remarks teachers can pick from" optional error={errors.remarkBank}
          hint={`One remark per line — offered when a class teacher writes a student's report card remarks. ${d.remarkBank.split('\n').filter((x) => x.trim()).length} of 100.`}>
          <textarea rows={5} value={d.remarkBank} placeholder={'A sincere and hard-working student.\nShows keen interest in class discussions.\nNeeds to be more regular with homework.'}
            onChange={(e) => { set({ remarkBank: e.target.value }); clear('remarkBank'); }} />
        </Field>
      </Card>

      {/* ── Reminders ───────────────────────────────────────────────────── */}
      <Card icon="bell" size="lg" title="Reminders" className="rs-set__card"
        sub="Who is reminded about marks still outstanding, and when.">
        <CheckRow checked={d.remindersEnabled} onChange={(v) => set({ remindersEnabled: v })} label="Remind teachers about marks still to enter"
          hint="Subject teachers about their sheets not yet submitted; class teachers about marks waiting for them to validate. Only exams open for mark entry or validation, and for up to 45 days after the exam ends." />
        {d.remindersEnabled ? (
          <div className="rs-set__days">
            <Field label="First reminder" error={errors.afterDays} hint="Days after the exam's last day (0 — on the day)">
              <input type="number" min="0" max="30" value={d.afterDays} onChange={(e) => { set({ afterDays: e.target.value }); clear('afterDays'); }} />
            </Field>
            <Field label="Then every" error={errors.repeatDays} hint="Days, until the marks are in">
              <input type="number" min="1" max="30" value={d.repeatDays} onChange={(e) => { set({ repeatDays: e.target.value }); clear('repeatDays'); }} />
            </Field>
          </div>
        ) : null}
        <div className="rs-set__days rs-set__days--wide">
          <Field label="Marks due" optional error={errors.marksDueDays} hint="Days after an exam's last day — the “Marks due by” date new exams start with. Teachers are reminded the day before, and the office is told when it passes.">
            <input type="number" min="0" max="60" value={d.marksDueDays} placeholder="No due date" onChange={(e) => { set({ marksDueDays: e.target.value }); clear('marksDueDays'); }} />
          </Field>
        </div>
        <CheckRow className="rs-set__gap" checked={d.officeReminders} onChange={(v) => set({ officeReminders: v })} label="Remind the office too"
          hint="About marks past their due date, validated results waiting to be published, and withdrawn results not yet published again." />

        <h4 className="rs-set__h rs-set__h--gap">The school's clock</h4>
        <Field label="Time zone" select className="rs-set__zone" hint="The day a result date, a due date or a reminder falls on is read on this clock — whatever time zone the server keeps.">
          <select value={d.timezone} onChange={(e) => set({ timezone: e.target.value })}>
            {d.timezone && !ZONES.includes(d.timezone) ? <option value={d.timezone}>{d.timezone}</option> : null}
            {ZONES.map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
      </Card>

      {dirty ? (
        <div className="rs-savebar" role="region" aria-label="Unsaved changes">
          <span><Ico name="info" size={16} />You have unsaved changes</span>
          <Btn onClick={discard} disabled={saving}>Discard</Btn>
          <Btn kind="primary" icon="save" busy={saving} onClick={save}>Save Changes</Btn>
        </div>
      ) : null}
    </div>
  );
}
