/**
 * Admin → Timetable → one version: review it, fix it, regenerate it, publish it.
 *
 * The header says what the version is and whether it can go live; the verdict
 * under it says what stops it, in the server's problem report
 * (services/timetable/problems.js). Class / Teacher / Room / Day are views of the
 * grid — the class grid marks every slot a problem points at — and Problems lists
 * them with the change that fixes each:
 *   - "Show in grid" (or a slot chip) switches to that section and flashes the slot;
 *   - "Edit weekly periods" / rules open Generate on this version's scope, where
 *     the plan can be changed and regenerated in place;
 *   - Regenerate re-solves this scope into a new version from here, keeping hand
 *     edits if asked and optionally replacing this attempt.
 *
 * URL: ?tab=class|teacher|room|day|problems (the old ?tab=conflicts still opens
 * Problems), &section=&day=&period= flashes one slot on arrival.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { Spinner, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  DAY_SHORT, CONFLICT_LABELS, periodTypeOf, isTeaching, subjectColor, triggerBlobDownload,
} from './shared';
import {
  TtgHeader, Note, Figures, ProgressBar, RunSteps, ProblemList, Verdict, StatusPill, EmptyState,
  plural, fmtWhen, openFixInNewTab, EXTERNAL_FIXES,
} from './genParts';

const unwrap = (res) => res?.data ?? res;
/* Some saved structures carry "010:00"; show it as 10:00. */
const clock = (t) => String(t || '').replace(/^0(\d{2}:)/, '$1');

const VIEWS = [
  ['class', 'Class'],
  ['teacher', 'Teacher'],
  ['room', 'Room'],
  ['day', 'Day'],
  ['problems', 'Problems'],
];
const VIEW_ALIASES = { conflicts: 'problems' };
const EDITABLE = ['draft', 'generated', 'conflict', 'validated', 'failed'];
const REPLACEABLE = ['draft', 'generated', 'conflict', 'failed'];

export default function TimetableVersionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const arrival = useRef({
    section: params.get('section'),
    day: params.get('day'),
    period: Number(params.get('period')) || null,
    handled: false,
  });

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState(() => {
    const t = params.get('tab');
    return VIEW_ALIASES[t] || (VIEWS.some(([k]) => k === t) ? t : 'class');
  });
  const [sectionId, setSectionId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [roomId, setRoomId]       = useState('');
  const [day, setDay]             = useState('Monday');
  const [flash, setFlash]         = useState(null);   // { key, at }

  const [drag, setDrag]       = useState(null);
  const [busy, setBusy]       = useState(false);
  const [cellModal, setCell]  = useState(null);      // { entry } | { section, day, period }
  const [blocked, setBlocked] = useState(null);      // a move the rules refused
  const [publishModal, setPublish] = useState(false);
  const [exporting, setExporting]  = useState('');
  const [regenModal, setRegen]     = useState(false);
  const [regenProgress, setRegenProgress] = useState(null);
  // Publishing reprojects every section from this draft; the server refuses
  // until live hand edits / outside clashes are acknowledged. Declared up here
  // with the rest of the state — a hook below the loading bail-out breaks the page.
  const [liveEdits, setLiveEdits] = useState(null);
  const [outside, setOutside]     = useState(null);
  const releasedRef = useRef(false);
  const pollRef = useRef(null);

  /* ── Load ──────────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    try {
      const d = unwrap(await api.getVersion(id));
      setData(d);
      setSectionId((prev) => {
        if (prev) return prev;
        const wanted = arrival.current.section;
        return wanted && d.sections.some((s) => String(s._id) === wanted) ? wanted : String(d.sections[0]?._id || '');
      });
      setDay((prev) => (d.days.includes(arrival.current.day) && !arrival.current.handled
        ? arrival.current.day
        : (d.days.includes(prev) ? prev : d.days[0] || 'Monday')));
    } catch (e) {
      toast.error(e.message);
      if (e.status === 404) navigate('/admin/timetable/versions');
    } finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { setLoading(true); setData(null); load(); }, [load]);

  // A regenerate lands on another version with ?tab=… — same component, new id.
  useEffect(() => {
    const t = params.get('tab');
    const next = VIEW_ALIASES[t] || (VIEWS.some(([k]) => k === t) ? t : null);
    if (next) setView(next);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hand the soft edit lock back on the way out.
  useEffect(() => () => {
    if (!releasedRef.current) { releasedRef.current = true; api.releaseLock(id).catch(() => {}); }
  }, [id]);
  useEffect(() => () => clearInterval(pollRef.current), []);

  useEffect(() => { setParams(view === 'class' ? {} : { tab: view }, { replace: true }); }, [view]); // eslint-disable-line

  // Arriving with a slot: flash it once the grid exists.
  useEffect(() => {
    const a = arrival.current;
    if (!data || a.handled) return;
    a.handled = true;
    if (a.section && a.day && a.period) setFlash({ key: `${a.section}#${a.day}#${a.period}`, at: Date.now() });
  }, [data]);

  useEffect(() => {
    if (!flash) return undefined;
    const el = document.querySelector(`[data-slot="${flash.key}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const t = setTimeout(() => setFlash(null), 4600);
    return () => clearTimeout(t);
  }, [flash]);

  /* ── Derived lookups ───────────────────────────────────────────────────── */
  const maps = useMemo(() => {
    if (!data) return null;
    return {
      subject: new Map(data.subjects.map((s) => [String(s._id), s])),
      teacher: new Map(data.teachers.map((t) => [String(t._id), t])),
      room:    new Map(data.rooms.map((r) => [String(r._id), r])),
      section: new Map(data.sections.map((s) => [String(s._id), s])),
    };
  }, [data]);

  const bySlot = useMemo(() => {
    const m = new Map();
    for (const e of data?.entries || []) m.set(`${e.section}#${e.dayOfWeek}#${e.periodNumber}`, e);
    return m;
  }, [data]);

  /* Merged subjects share one row; teacher and room views need a line each. */
  const occupants = useMemo(() => (data?.entries || []).flatMap((e) => [
    e,
    ...(e.additionalSubjects || []).map((m) => ({
      ...e, subject: m.subject, teacher: m.teacher, room: m.room, additionalSubjects: [], mergedPartner: true,
    })),
  ]), [data]);

  const teachersInUse = useMemo(() => {
    if (!maps) return [];
    const ids = [...new Set(occupants.map((e) => e.teacher).filter(Boolean).map(String))];
    return ids.map((tid) => maps.teacher.get(tid)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }, [maps, occupants]);

  const roomsInUse = useMemo(() => {
    if (!maps) return [];
    const ids = [...new Set(occupants.map((e) => e.room).filter(Boolean).map(String))];
    return ids.map((rid) => maps.room.get(rid)).filter(Boolean).sort((a, b) => a.roomName.localeCompare(b.roomName));
  }, [maps, occupants]);

  useEffect(() => { if (!teacherId && teachersInUse.length) setTeacherId(String(teachersInUse[0]._id)); }, [teachersInUse]); // eslint-disable-line
  useEffect(() => { if (!roomId && roomsInUse.length) setRoomId(String(roomsInUse[0]._id)); }, [roomsInUse]); // eslint-disable-line

  /* Every slot a problem points at, for the red corner in the class grid. */
  const problemAt = useMemo(() => {
    const m = new Map();
    for (const p of data?.report?.problems || []) {
      if (p.severity === 'info') continue;
      for (const s of p.slots || []) {
        const key = `${s.sectionId}#${s.day}#${s.period}`;
        if (!m.has(key)) m.set(key, p.title);
      }
    }
    return m;
  }, [data]);

  if (loading) return <div className="page ttgpg"><div className="ttg-center"><Spinner /></div></div>;
  if (!data) return null;

  const { version, sections, days, structures, report } = data;
  const summary = report?.summary || { errors: 0, warnings: 0 };
  const editable = EDITABLE.includes(version.status);
  const stats = version.stats || {};
  const singleClass = sections.length > 0 && new Set(sections.map((s) => s.classId)).size === 1;
  const manualCount = data.entries.filter((e) => e.isManual || e.isLocked).length;
  const readOnlyReason = version.status === 'published'
    ? 'This is the live timetable. Duplicate it into a draft to change it, or regenerate into a new version.'
    : version.status === 'archived' ? 'Archived versions are read-only. Restore it from Versions to edit it.' : null;

  const structureFor = (secId) => structures[secId] || [];
  const nameOf = {
    subject: (sid) => maps.subject.get(String(sid))?.subjectName || '—',
    teacher: (tid) => maps.teacher.get(String(tid))?.name || '',
    room:    (rid) => maps.room.get(String(rid))?.roomName || '',
    section: (sid) => maps.section.get(String(sid))?.label || '',
  };

  /* One slot, possibly several subjects: "Maths + Computer" with both teachers. */
  const uniqJoin = (values, sep) => [...new Set(values.filter(Boolean))].join(sep);
  const slot = {
    withSections: (e) => (e.mergedSections || []).map(nameOf.section).filter(Boolean).join(', '),
    subject: (e) => uniqJoin([e.subject, ...(e.additionalSubjects || []).map((m) => m.subject)].map(nameOf.subject), ' + '),
    teacher: (e) => uniqJoin([e.teacher, ...(e.additionalSubjects || []).map((m) => m.teacher)].map(nameOf.teacher), ' · '),
    room:    (e) => uniqJoin([e.room, ...(e.additionalSubjects || []).map((m) => m.room)].map(nameOf.room), ' · '),
  };

  const sectionsText = singleClass && sections.length > 1
    ? `${sections[0].className} ${sections.map((s) => s.sectionName).join(', ')}`
    : sections.map((s) => s.label).join(', ');

  /* ── Regenerate ────────────────────────────────────────────────────────── */
  const regenerate = async ({ reuseSeed, preserveManualEdits, replaceSource }) => {
    setBusy(true);
    try {
      const d = unwrap(await api.regenerate(id, {
        reuseSeed,
        replaceSource,
        options: { ...(version.options || {}), preserveManualEdits },
      }));
      setRegen(false);
      setRegenProgress({ versionId: d.versionId, versionNumber: d.versionNumber, percent: 0, steps: [], replacing: replaceSource });

      clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const p = unwrap(await api.getProgress(d.versionId));
          setRegenProgress((cur) => ({ ...cur, ...(p.progress || {}), status: p.status }));
          if (p.status === 'generating') return;
          clearInterval(pollRef.current);
          if (p.status === 'failed') toast.error('Regeneration failed');
          else if (p.errorCount > 0) toast('Regenerated — some problems remain', { icon: '⚠️' });
          else toast.success('Regenerated with no problems');
          setRegenProgress(null);
          navigate(`/admin/timetable/versions/${d.versionId}${p.errorCount > 0 || p.status === 'failed' ? '?tab=problems' : ''}`);
        } catch (e) {
          clearInterval(pollRef.current);
          setRegenProgress(null);
          toast.error(e.message);
        }
      }, 800);
    } catch (e) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  const editPlan = (fix) => {
    const q = new URLSearchParams({ version: id });
    if (fix?.subjectId) { q.set('subject', fix.subjectId); q.set('focus', fix.type === 'rules' ? 'rules' : 'plan'); }
    navigate(`/admin/timetable/generate?${q}`);
  };

  const showInGrid = (fix) => {
    setView('class');
    if (fix.sectionId && maps.section.has(String(fix.sectionId))) setSectionId(String(fix.sectionId));
    if (fix.day) setDay(fix.day);
    if (fix.sectionId && fix.day && fix.period) setFlash({ key: `${fix.sectionId}#${fix.day}#${fix.period}`, at: Date.now() });
  };

  const onFix = (fix) => {
    if (EXTERNAL_FIXES.has(fix.type)) return openFixInNewTab(fix);
    if (fix.type === 'grid') return showInGrid(fix);
    if (fix.type === 'regenerate') return setRegen(true);
    if (fix.type === 'plan' || fix.type === 'rules') {
      if (!singleClass) return toast('This version covers several classes — change each class’s plan under Generate.', { icon: 'ℹ️' });
      return editPlan(fix);
    }
    return undefined;
  };

  /* ── Drag & drop ───────────────────────────────────────────────────────── */
  const onDrop = async (targetSectionId, targetDay, targetPeriod) => {
    if (!drag) return;
    const entry = drag;
    setDrag(null);
    if (String(entry.section) !== String(targetSectionId)) {
      toast.error('A period can only be moved within its own class.');
      return;
    }
    if (entry.dayOfWeek === targetDay && entry.periodNumber === targetPeriod) return;

    setBusy(true);
    try {
      const d = unwrap(await api.moveEntry(id, entry._id, { dayOfWeek: targetDay, periodNumber: targetPeriod }));
      toast.success(d?.swapped ? 'Periods swapped' : 'Period moved');
      await load();
    } catch (e) {
      if (e.status === 409 && e.data?.data?.conflicts) {
        setBlocked({ entry, targetDay, targetPeriod, conflicts: e.data.data.conflicts });
      } else {
        toast.error(e.message);
      }
    } finally { setBusy(false); }
  };

  const forceMove = async (reason) => {
    const { entry, targetDay, targetPeriod } = blocked;
    setBusy(true);
    try {
      const d = unwrap(await api.moveEntry(id, entry._id, { dayOfWeek: targetDay, periodNumber: targetPeriod, override: true, overrideReason: reason }));
      toast.success(`${d?.swapped ? 'Swapped' : 'Moved'} — the override is recorded in the audit log`);
      setBlocked(null);
      await load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  /* ── Cell actions ──────────────────────────────────────────────────────── */
  const saveCell = async (form) => {
    setBusy(true);
    try {
      if (cellModal.entry) {
        await api.updateEntry(id, cellModal.entry._id, form);
        toast.success('Period updated');
      } else {
        await api.createEntry(id, { ...form, section: cellModal.section, dayOfWeek: cellModal.day, periodNumber: cellModal.period });
        toast.success('Period added');
      }
      setCell(null);
      await load();
    } catch (e) {
      if (e.status === 409 && e.data?.data?.conflicts?.length) toast.error(e.data.data.conflicts[0].description);
      else toast.error(e.message);
    } finally { setBusy(false); }
  };

  const clearCell = async () => {
    setBusy(true);
    try {
      await api.deleteEntry(id, cellModal.entry._id);
      toast.success('Period cleared');
      setCell(null);
      await load();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  /* ── Workflow ──────────────────────────────────────────────────────────── */
  const runValidate = async () => {
    setBusy(true);
    try {
      const d = unwrap(await api.validateVersion(id));
      if (d.valid) toast.success('No problems — ready to publish');
      else toast.error(`${plural(d.report?.summary?.errors || d.errorCount || 0, 'problem')} to fix before publishing`);
      await load();
      return d;
    } catch (e) { toast.error(e.message); return null; } finally { setBusy(false); }
  };

  const openPublish = async () => {
    const result = await runValidate();
    if (result?.valid) setPublish(true);
    else if (result) setView('problems');
  };

  const doPublish = async (overwriteLiveEdits = false) => {
    setBusy(true);
    try {
      const d = unwrap(await api.publishVersion(id, overwriteLiveEdits ? { overwriteLiveEdits: true } : undefined));
      toast.success(d.message || 'Timetable published');
      setPublish(false); setLiveEdits(null); setOutside(null);
      await load();
    } catch (e) {
      if (e.status === 409 && e.data?.data?.outsideClashes) {
        setPublish(false);
        setOutside(e.data.data.outsideClashes);
      } else if (e.status === 409 && e.data?.data?.liveEdits) {
        setPublish(false);
        setLiveEdits(e.data.data.liveEdits);
      } else {
        toast.error(e.message);
        setPublish(false);
        if (e.data?.data?.conflicts) setView('problems');
        await load();
      }
    } finally { setBusy(false); }
  };

  const doExport = async (fmt) => {
    const exportView = ['class', 'teacher', 'room'].includes(view) ? view : 'class';
    setExporting(fmt);
    try {
      const blob = await api.exportVersion(id, exportView, fmt);
      triggerBlobDownload(blob, `timetable-v${version.versionNumber}-${exportView}.${fmt === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch { toast.error('Export failed'); } finally { setExporting(''); }
  };

  const duplicate = async () => {
    try {
      const d = unwrap(await api.duplicateVersion(id));
      toast.success('Duplicated into a new draft');
      navigate(`/admin/timetable/versions/${d._id}`);
    } catch (e) { toast.error(e.message); }
  };

  /* ── Grids ─────────────────────────────────────────────────────────────── */
  const card = (entry, extra = {}) => (
    <PeriodCard
      subject={slot.subject(entry)}
      teacher={slot.teacher(entry)}
      room={slot.room(entry)}
      withSections={slot.withSections(entry)}
      tone={subjectColor(entry.subject)}
      draggable={editable && !entry.isLocked}
      manual={entry.isManual}
      locked={entry.isLocked}
      dim={drag?._id === entry._id}
      onDragStart={() => setDrag(entry)}
      onDragEnd={() => setDrag(null)}
      onClick={editable ? () => setCell({ entry }) : undefined}
      {...extra}
    />
  );

  const cellClass = (key, entry) => [
    'ttg-cell',
    !entry && editable && 'ttg-cell--add',
    drag && !entry && 'is-drop',
    problemAt.has(key) && 'is-problem',
    flash?.key === key && 'is-flash',
  ].filter(Boolean).join(' ');

  const renderClassGrid = () => {
    const section = maps.section.get(sectionId);
    if (!section) return <EmptyState icon="grid" title="Pick a section" />;
    const periods = structureFor(sectionId);
    const activeDays = days.filter((d) => d !== 'Saturday' || section.openOnSaturday !== false);
    if (!periods.length) {
      return <EmptyState icon="clock" title="No period structure">Set up periods for this section under Configuration.</EmptyState>;
    }

    return (
      <div className="ttg-gridwrap">
        <table className="ttg-grid">
          <thead>
            <tr><th>Period</th>{activeDays.map((d) => <th key={d}>{DAY_SHORT[d]}</th>)}</tr>
          </thead>
          <tbody>
            {periods.map((p, idx) => {
              if (!isTeaching(p)) {
                const type = periodTypeOf(p);
                return (
                  <tr key={`b${idx}`} className={`ttg-grid__break ttg-grid__break--${type.toLowerCase()}`}>
                    <td>{p.startTime ? `${clock(p.startTime)}–${clock(p.endTime)}` : ''}</td>
                    <td colSpan={activeDays.length}>{p.recessName || type}</td>
                  </tr>
                );
              }
              return (
                <tr key={`p${idx}`}>
                  <td className="ttg-grid__period">
                    <b>P{p.periodNumber}</b>
                    {p.startTime && <span>{clock(p.startTime)}–{clock(p.endTime)}</span>}
                  </td>
                  {activeDays.map((d) => {
                    const key = `${sectionId}#${d}#${p.periodNumber}`;
                    const entry = bySlot.get(key);
                    return (
                      <td key={`${d}${flash?.key === key ? flash.at : ''}`} data-slot={key}
                        className={cellClass(key, entry)} title={problemAt.get(key) || undefined}
                        onDragOver={(e) => editable && e.preventDefault()}
                        onDrop={() => editable && onDrop(sectionId, d, p.periodNumber)}
                        onClick={() => editable && !entry && setCell({ section: sectionId, day: d, period: p.periodNumber })}>
                        {entry
                          ? card(entry)
                          : editable ? <div className="ttg-cell__add"><Icon name="plus" size={16} /></div> : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const teachingPeriodNumbers = () => [...new Set(
    sections.flatMap((s) => structureFor(String(s._id)).filter(isTeaching).map((p) => p.periodNumber)),
  )].sort((a, b) => a - b);

  /** Teacher and room views pivot the same entries — one renderer, two filters. */
  const renderPivotGrid = (filterFn, describe) => {
    const rows = occupants.filter(filterFn);
    if (!rows.length) return <EmptyState icon="calendar" title="Nothing scheduled" />;
    return (
      <>
        <div className="ttg-gridwrap">
          <table className="ttg-grid">
            <thead><tr><th>Period</th>{days.map((d) => <th key={d}>{DAY_SHORT[d]}</th>)}</tr></thead>
            <tbody>
              {teachingPeriodNumbers().map((pn) => (
                <tr key={pn}>
                  <td className="ttg-grid__period"><b>P{pn}</b></td>
                  {days.map((d) => {
                    const hit = rows.find((e) => e.dayOfWeek === d && e.periodNumber === pn);
                    return (
                      <td key={d} className="ttg-cell">
                        {hit ? (
                          <PeriodCard {...describe(hit)} tone={subjectColor(hit.subject)}
                            onClick={editable && !hit.mergedPartner ? () => setCell({ entry: hit }) : undefined} />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="ttg-hint" style={{ marginTop: 10 }}>{plural(rows.length, 'period')} a week</div>
      </>
    );
  };

  const renderDayGrid = () => {
    const activeSections = sections.filter((s) => day !== 'Saturday' || s.openOnSaturday !== false);
    return (
      <div className="ttg-gridwrap">
        <table className="ttg-grid ttg-grid--sticky" style={{ minWidth: 104 + activeSections.length * 150 }}>
          <thead>
            <tr><th>Period</th>{activeSections.map((s) => <th key={s._id}>{s.label}</th>)}</tr>
          </thead>
          <tbody>
            {teachingPeriodNumbers().map((pn) => (
              <tr key={pn}>
                <td className="ttg-grid__period"><b>P{pn}</b></td>
                {activeSections.map((s) => {
                  const key = `${s._id}#${day}#${pn}`;
                  const entry = bySlot.get(key);
                  return (
                    <td key={s._id} data-slot={key} className={cellClass(key, entry).replace(' ttg-cell--add', '')}
                      title={problemAt.get(key) || undefined}
                      onDragOver={(e) => editable && e.preventDefault()}
                      onDrop={() => editable && onDrop(String(s._id), day, pn)}>
                      {entry ? card(entry) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderProblems = () => {
    if (!report?.problems?.length) {
      return (
        <EmptyState good icon="checkCircle" title="No problems — ready to publish"
          actions={editable && (
            <>
              <button type="button" className="btn btn-primary" onClick={openPublish} disabled={busy}>
                <Icon name="upload" size={16} /> Publish
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setRegen(true)}>
                <Icon name="refresh" size={16} /> Regenerate anyway
              </button>
            </>
          )}>
          Every hard rule holds: no clashes, weekly counts met, teachers and rooms available.
        </EmptyState>
      );
    }
    return (
      <div className="ttg-problems">
        <div className="ttg-toolbar">
          <span className="ttg-hint">
            {summary.needsChange
              ? 'Problems marked "Change the weekly plan" or "Fix the school setup" need that change before a regenerate can clear them.'
              : 'Fix what is flagged in the grid, or regenerate for a fresh arrangement. Every edit is re-checked.'}
          </span>
          <div className="ttg-toolbar__left">
            {singleClass && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => editPlan()}>
                <Icon name="sliders" size={14} /> Edit plan &amp; regenerate
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={runValidate} disabled={busy || !editable}>
              <Icon name="checkCircle" size={14} /> Check again
            </button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setRegen(true)} disabled={busy}>
              <Icon name="refresh" size={14} /> Regenerate
            </button>
          </div>
        </div>
        <ProblemList report={report} onFix={onFix} openWarnings={!summary.errors} />
      </div>
    );
  };

  const placed = data.entries.length;
  const required = stats.periodsRequired || 0;

  return (
    <div className="page ttgpg">
      <TtgHeader
        icon="calendarDays"
        title={version.label || `Version ${version.versionNumber}`}
        aside={<StatusPill status={version.status} />}
        subtitle={[
          data.yearName,
          sectionsText,
          plural(placed, 'period'),
          version.publishedAt ? `published ${fmtWhen(version.publishedAt)}` : version.generatedAt ? `generated ${fmtWhen(version.generatedAt)}` : '',
        ].filter(Boolean).join(' · ')}
      >
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/admin/timetable/versions')}>
          <Icon name="arrowLeft" size={16} /> Versions
        </button>
        <div className="ttg-seg" role="group" aria-label="Export">
          <button type="button" onClick={() => doExport('pdf')} disabled={!!exporting}>
            {exporting === 'pdf' ? <Spinner size="sm" /> : <Icon name="download" size={15} />} PDF
          </button>
          <button type="button" onClick={() => doExport('excel')} disabled={!!exporting}>
            {exporting === 'excel' ? <Spinner size="sm" /> : <Icon name="download" size={15} />} Excel
          </button>
          <button type="button" onClick={() => window.print()}>Print</button>
        </div>
        {version.status === 'published' && (
          <button type="button" className="btn btn-secondary" onClick={duplicate}><Icon name="copy" size={16} /> Duplicate to draft</button>
        )}
        {editable && (
          <button type="button" className="btn btn-primary" onClick={openPublish} disabled={busy}>
            {busy ? <Spinner size="sm" /> : <Icon name="upload" size={16} />} Publish
          </button>
        )}
      </TtgHeader>

      {readOnlyReason && <Note tone="info">{readOnlyReason}</Note>}

      <Verdict report={report}>
        {summary.errors > 0 && view !== 'problems' && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setView('problems')}>See problems</button>
        )}
        {summary.errors > 0 && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setRegen(true)} disabled={busy}>
            <Icon name="refresh" size={14} /> Regenerate
          </button>
        )}
        {!summary.errors && editable && version.status !== 'validated' && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={runValidate} disabled={busy}>
            <Icon name="checkCircle" size={14} /> Check again
          </button>
        )}
      </Verdict>

      <Figures items={[
        { label: 'Periods placed', value: placed, unit: required ? `/ ${required}` : '', tone: required ? (placed >= required ? 'good' : 'warn') : '' },
        { label: 'Plan met', value: required ? `${Math.min(100, Math.round((placed / required) * 100))}%` : '—' },
        { label: 'Problems', value: summary.errors, tone: summary.errors ? 'bad' : 'good' },
        { label: 'Teachers', value: teachersInUse.length },
        { label: 'Rooms', value: roomsInUse.length },
      ]} />

      <div className="ttg-tabrow">
        <nav className="ttg-tabs" aria-label="Views">
          {VIEWS.map(([key, text]) => (
            <button key={key} type="button" className={`ttg-tab${view === key ? ' is-on' : ''}`} onClick={() => setView(key)}>
              {text}
              {key === 'problems' && (summary.errors
                ? <span className="ttg-tab__count">{summary.errors}</span>
                : <span className="ttg-tab__count ttg-tab__count--ok"><Icon name="check" size={11} strokeWidth={3} /></span>)}
            </button>
          ))}
        </nav>
      </div>

      <section className="ttg-card">
        <div className="ttg-card__body" style={{ paddingTop: 16 }}>
          {view === 'class' && (
            <div className="ttg-toolbar">
              <div className="ttg-toolbar__left">
                <select className="form-control" value={sectionId} onChange={(e) => setSectionId(e.target.value)} aria-label="Section">
                  {sections.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}
                </select>
                {problemAt.size > 0 && <span className="ttg-hint"><span style={{ color: '#dc2626' }}>●</span> marks a period with a problem</span>}
              </div>
              {editable && <span className="ttg-hint">Drag a period to move it (onto another to swap) · click it to edit · click an empty slot to add</span>}
            </div>
          )}
          {view === 'teacher' && teachersInUse.length > 0 && (
            <div className="ttg-toolbar">
              <select className="form-control" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} aria-label="Teacher">
                {teachersInUse.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {view === 'room' && roomsInUse.length > 0 && (
            <div className="ttg-toolbar">
              <select className="form-control" value={roomId} onChange={(e) => setRoomId(e.target.value)} aria-label="Room">
                {roomsInUse.map((r) => <option key={r._id} value={r._id}>{r.roomName}</option>)}
              </select>
            </div>
          )}
          {view === 'day' && (
            <div className="ttg-toolbar">
              <div className="ttg-daypick" role="group" aria-label="Day">
                {days.map((d) => (
                  <button key={d} type="button" className={day === d ? 'is-on' : ''} onClick={() => setDay(d)}>{DAY_SHORT[d]}</button>
                ))}
              </div>
              {editable && <span className="ttg-hint">Drag a period within its own column to move it</span>}
            </div>
          )}

          {view === 'class' && renderClassGrid()}
          {view === 'teacher' && (teachersInUse.length
            ? renderPivotGrid((e) => String(e.teacher) === teacherId, (e) => ({
              subject: nameOf.subject(e.subject), teacher: nameOf.section(e.section), room: nameOf.room(e.room),
            }))
            : <EmptyState icon="teacher" title="No teachers assigned" />)}
          {view === 'room' && (roomsInUse.length
            ? renderPivotGrid((e) => String(e.room) === roomId, (e) => ({
              subject: nameOf.subject(e.subject), teacher: nameOf.section(e.section), room: nameOf.teacher(e.teacher),
            }))
            : <EmptyState icon="building" title="No rooms allocated">Add rooms and mark subjects as needing one.</EmptyState>)}
          {view === 'day' && renderDayGrid()}
          {view === 'problems' && renderProblems()}
        </div>
      </section>

      {/* ── Cell editor ───────────────────────────────────────────────── */}
      {cellModal && (
        <CellEditor cell={cellModal} data={data} maps={maps} busy={busy}
          onClose={() => setCell(null)} onSave={saveCell} onClear={clearCell} />
      )}

      {/* ── A move the rules refused ──────────────────────────────────── */}
      <Modal open={!!blocked} onClose={() => setBlocked(null)} title="This move breaks a rule" maxWidth={540}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setBlocked(null)}>Keep it where it is</button>
          <OverrideButton busy={busy} onForce={forceMove} />
        </>}>
        {blocked && (
          <div className="ttg-modal">
            <p>
              {bySlot.has(`${blocked.entry.section}#${blocked.targetDay}#${blocked.targetPeriod}`) ? 'Swapping' : 'Moving'}{' '}
              <b>{nameOf.subject(blocked.entry.subject)}</b> {bySlot.has(`${blocked.entry.section}#${blocked.targetDay}#${blocked.targetPeriod}`) ? 'with the period at' : 'to'}{' '}
              <b>{blocked.targetDay} P{blocked.targetPeriod}</b> would cause:
            </p>
            <div className="ttg-issues">
              {blocked.conflicts.map((c, i) => (
                <div key={i}><b>{CONFLICT_LABELS[c.type] || 'Problem'}</b> — {c.description}{c.suggestion && <small>{c.suggestion}</small>}</div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* ── Publish ───────────────────────────────────────────────────── */}
      <Modal open={publishModal} onClose={() => setPublish(false)} title="Publish this timetable?" maxWidth={500}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setPublish(false)}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => doPublish(false)} disabled={busy}>
            {busy && <Spinner size="sm" />} Publish
          </button>
        </>}>
        <div className="ttg-modal">
          <Note tone="good">Every hard rule holds — it&rsquo;s ready to go live.</Note>
          <p>
            Teachers, students and parents will see it straight away, and it replaces the timetable currently published for {sectionsText}.
            The version it replaces is archived, not deleted.
          </p>
        </div>
      </Modal>

      {/* Teachers or rooms already committed elsewhere at the same time. */}
      <Modal open={!!outside} onClose={() => setOutside(null)} title="Clashes with other classes" maxWidth={560}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setOutside(null)}>Go back</button>
          <button type="button" className="btn btn-danger" onClick={() => doPublish(true)} disabled={busy}>Publish anyway</button>
        </>}>
        <div className="ttg-modal">
          <p>
            This version is fine on its own, but {plural(outside?.length || 0, 'period')} would collide with timetables
            already published for classes it doesn&rsquo;t cover. Regenerating now keeps those teachers and rooms free automatically.
          </p>
          <div className="ttg-issues">
            {(outside || []).map((c, i) => <div key={i}>{c.message}</div>)}
          </div>
        </div>
      </Modal>

      {/* Live grid corrections publishing is about to reproject over. */}
      <Modal open={!!liveEdits} onClose={() => setLiveEdits(null)} title="Hand edits will be replaced" maxWidth={540}
        footer={<>
          <button type="button" className="btn btn-secondary" onClick={() => setLiveEdits(null)}>Keep them, cancel</button>
          <button type="button" className="btn btn-danger" onClick={() => doPublish(true)} disabled={busy}>Replace and publish</button>
        </>}>
        <div className="ttg-modal">
          <p>
            {plural(liveEdits?.length || 0, 'period')} in the live timetable {liveEdits?.length === 1 ? 'was' : 'were'} edited
            by hand since the last publish. Publishing rebuilds every section from this version, so those edits will be lost.
          </p>
          <div className="ttg-issues">
            {(liveEdits || []).map((e, i) => (
              <div key={i}><b>{e.sectionName}</b> · {e.dayOfWeek} P{e.periodNumber} · {e.subjectName}</div>
            ))}
          </div>
          <p className="ttg-muted" style={{ fontSize: '.82rem' }}>To keep them, cancel and make the same changes in this version first.</p>
        </div>
      </Modal>

      {/* ── Regenerate ────────────────────────────────────────────────── */}
      {regenModal && (
        <RegenerateModal
          version={version}
          summary={summary}
          manualCount={manualCount}
          canEditPlan={singleClass}
          busy={busy}
          onClose={() => setRegen(false)}
          onRun={regenerate}
          onEditPlan={() => editPlan()}
        />
      )}

      {regenProgress && (
        <Modal open onClose={() => {}} title={`Regenerating — version ${regenProgress.versionNumber}`} maxWidth={560} footer={null}>
          <div className="ttg-modal">
            <ProgressBar percent={regenProgress.percent} />
            <RunSteps steps={regenProgress.steps || []} />
            <p className="ttg-muted" style={{ fontSize: '.82rem' }}>
              It runs on the server — you&rsquo;ll be taken to the new version when it&rsquo;s ready.
              {regenProgress.replacing ? ' This version is then removed from the list.' : ' This version stays as it is.'}
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── One period in a grid ─────────────────────────────────────────────────── */
function PeriodCard({ subject, teacher, room, withSections, tone, draggable, onDragStart, onDragEnd, onClick, dim, locked, manual }) {
  return (
    <div
      className={`ttg-pc${dim ? ' is-dim' : ''}`}
      draggable={!!draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      title={[subject, teacher, room, withSections && `together with ${withSections}`, locked && 'locked', manual && !locked && 'edited by hand'].filter(Boolean).join(' · ')}
      style={{ background: tone.bg, borderColor: tone.br, borderLeftColor: tone.fg, cursor: draggable ? 'grab' : onClick ? 'pointer' : 'default' }}
    >
      <div className="ttg-pc__subject" style={{ color: tone.fg }}>
        <span>{subject}</span>
        {locked && <Icon name="lock" size={11} />}
        {manual && !locked && <Icon name="pencil" size={11} />}
      </div>
      {teacher && <div className="ttg-pc__line">{teacher}</div>}
      {room && <div className="ttg-pc__line ttg-pc__line--light">{room}</div>}
      {withSections && <div className="ttg-pc__line" style={{ color: tone.fg }}>With {withSections}</div>}
    </div>
  );
}

/* ── Regenerate this version's scope into a new version ───────────────────── */
function RegenerateModal({ version, summary, manualCount, canEditPlan, busy, onClose, onRun, onEditPlan }) {
  const [fresh, setFresh] = useState(true);
  const [preserve, setPreserve] = useState(manualCount > 0);
  const replaceable = REPLACEABLE.includes(version.status);
  const [replace, setReplace] = useState(replaceable && ['conflict', 'failed'].includes(version.status) && manualCount === 0);

  return (
    <Modal open onClose={onClose} title="Regenerate timetable" maxWidth={560}
      footer={<>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy}
          onClick={() => onRun({ reuseSeed: !fresh, preserveManualEdits: preserve && manualCount > 0, replaceSource: replaceable && replace })}>
          {busy ? <Spinner size="sm" /> : <Icon name="refresh" size={16} />} Regenerate
        </button>
      </>}>
      <div className="ttg-modal">
        {summary.needsChange ? (
          <Note tone="warn">
            <b>Some problems need a change to the plan or setup first</b> — regenerating alone won&rsquo;t clear them.
            {canEditPlan && (
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onEditPlan}>
                  <Icon name="sliders" size={14} /> Edit the plan, then regenerate
                </button>
              </div>
            )}
          </Note>
        ) : summary.errors ? (
          <Note tone="info">A fresh attempt usually places what this one couldn&rsquo;t.</Note>
        ) : (
          <Note tone="good">This version has no problems — regenerating just tries for a better arrangement.</Note>
        )}

        <p>
          The same {plural((version.sections || []).length, 'section')} are solved again from the plan saved for them, into a
          <b> new version</b>. Teachers already teaching other classes are kept free.
        </p>

        <button type="button" className={`ttg-option${fresh ? ' is-on' : ''}`} onClick={() => setFresh(true)}>
          <span className="ttg-option__radio" />
          <div><b>Try a different arrangement</b><span>A new starting point — the usual way out of problems.</span></div>
        </button>
        <button type="button" className={`ttg-option${!fresh ? ' is-on' : ''}`} onClick={() => setFresh(false)}>
          <span className="ttg-option__radio" />
          <div><b>Repeat this exact run</b><span>Same starting point, so only changes to the plan or setup make a difference.</span></div>
        </button>

        <label className={`ttg-tick${manualCount ? '' : ' is-disabled'}`}>
          <input type="checkbox" checked={preserve && manualCount > 0} disabled={!manualCount} onChange={(e) => setPreserve(e.target.checked)} />
          <span>
            Keep my hand edits in place
            <small>{manualCount ? `${plural(manualCount, 'period')} edited or locked by hand stay where they are.` : 'No period in this version has been edited by hand.'}</small>
          </span>
        </label>

        {replaceable && (
          <label className="ttg-tick">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            <span>
              Replace {version.label || `version ${version.versionNumber}`} with the new one
              <small>Removed from Versions once the new run finishes. Leave off to keep both and compare.</small>
            </span>
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ── Override button (a reason is required, and audited) ──────────────────── */
function OverrideButton({ busy, onForce }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  if (!asking) return <button type="button" className="btn btn-danger" onClick={() => setAsking(true)}>Move it anyway…</button>;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
      <input className="form-control" placeholder="Why? (recorded in the audit log)" value={reason} autoFocus
        onChange={(e) => setReason(e.target.value)} style={{ flex: 1 }} />
      <button type="button" className="btn btn-danger" disabled={busy || !reason.trim()} onClick={() => onForce(reason.trim())}>Move</button>
    </div>
  );
}

/* ── Add / edit one period ────────────────────────────────────────────────── */
function CellEditor({ cell, data, maps, busy, onClose, onSave, onClear }) {
  const entry = cell.entry;
  const [subject, setSubject] = useState(entry?.subject || '');
  const [teacher, setTeacher] = useState(entry?.teacher || '');
  const [room, setRoom]       = useState(entry?.room || '');
  const [locked, setLocked]   = useState(!!entry?.isLocked);
  const [note, setNote]       = useState(entry?.note || '');

  const sectionId = entry?.section || cell.section;
  const label = maps.section.get(String(sectionId))?.label || '';
  const when = entry ? `${DAY_SHORT[entry.dayOfWeek]} P${entry.periodNumber}` : `${DAY_SHORT[cell.day]} P${cell.period}`;

  return (
    <Modal open onClose={onClose} title={entry ? `${label} · ${when}` : `Add a period · ${label} · ${when}`} maxWidth={500}
      footer={<>
        {entry && (
          <button type="button" className="btn btn-danger" onClick={onClear} disabled={busy} style={{ marginRight: 'auto' }}>
            <Icon name="trash" size={15} /> Clear period
          </button>
        )}
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy || !subject}
          onClick={() => onSave(entry
            ? { subject, teacher: teacher || null, room: room || null, isLocked: locked, note }
            : { subject, teacher: teacher || null, room: room || null })}>
          {busy && <Spinner size="sm" />} Save
        </button>
      </>}>
      <div className="ttg-modal">
        {!!(entry?.additionalSubjects || []).length && (
          <Note tone="info">
            This period is <b>shared</b> with {entry.additionalSubjects.map((m) => maps.subject.get(String(m.subject))?.subjectName || 'a subject').join(' and ')},
            each with its own teacher. Editing here changes the main subject only — change the sharing under Generate.
          </Note>
        )}
        <div className="ttg-form">
          <div className="ttg-field ttg-field--wide">
            <label className="ttg-label" htmlFor="cell-subject">Subject</label>
            <select id="cell-subject" className="form-control" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Select subject…</option>
              {data.subjects.map((s) => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
            </select>
          </div>
          <div className="ttg-field">
            <label className="ttg-label" htmlFor="cell-teacher">Teacher</label>
            <select id="cell-teacher" className="form-control" value={teacher} onChange={(e) => setTeacher(e.target.value)}>
              <option value="">No teacher</option>
              {data.teachers.map((t) => <option key={t._id} value={t._id}>{t.name}</option>)}
            </select>
          </div>
          <div className="ttg-field">
            <label className="ttg-label" htmlFor="cell-room">Room</label>
            <select id="cell-room" className="form-control" value={room} onChange={(e) => setRoom(e.target.value)}>
              <option value="">No room</option>
              {data.rooms.map((r) => <option key={r._id} value={r._id}>{r.roomName}{r.roomNumber ? ` (${r.roomNumber})` : ''}</option>)}
            </select>
          </div>
          {entry && (
            <>
              <div className="ttg-field ttg-field--wide">
                <label className="ttg-label" htmlFor="cell-note">Note</label>
                <input id="cell-note" className="form-control" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <label className="ttg-tick ttg-field--wide">
                <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
                <span>Lock this period<small>A locked period is kept in place when you regenerate with hand edits kept.</small></span>
              </label>
            </>
          )}
        </div>
        <p className="ttg-muted" style={{ fontSize: '.8rem' }}>Every change is checked against teacher, class and room clashes before it is saved.</p>
      </div>
    </Modal>
  );
}
