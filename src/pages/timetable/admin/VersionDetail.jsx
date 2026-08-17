import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { PageHeader, Button, Card, Spinner, Modal, Alert, Empty, Badge } from '../../../components/ui/index';
import {
  DAY_SHORT, StatusBadge, SEVERITY_META, CONFLICT_LABELS,
  periodTypeOf, isTeaching, subjectColor, triggerBlobDownload,
  cellBase, headCell, PeriodCard, Stat,
} from './shared';

const VIEWS = [
  ['class',   '🏫 Class View'],
  ['teacher', '🧑‍🏫 Teacher View'],
  ['room',    '🚪 Room View'],
  ['day',     '📅 Day View'],
  ['conflicts', '⚠️ Conflicts'],
];

export default function TimetableVersionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState(params.get('tab') || 'class');
  const [sectionId, setSectionId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [roomId, setRoomId]       = useState('');
  const [day, setDay]             = useState('Monday');

  const [drag, setDrag]       = useState(null);     // entry being dragged
  const [busy, setBusy]       = useState(false);
  const [cellModal, setCell]  = useState(null);     // { entry } | { section, day, period }
  const [conflictModal, setConflictModal] = useState(null); // blocked-move explanation
  const [publishModal, setPublish] = useState(false);
  const [validation, setValidation] = useState(null);
  const [exporting, setExporting] = useState('');
  const releasedRef = useRef(false);

  /* ── Load ──────────────────────────────────────────────────────────────── */
  const load = useCallback(async () => {
    try {
      const res = await api.getVersion(id);
      const d = res.data ?? res;
      setData(d);
      setSectionId(prev => prev || d.sections[0]?._id || '');
      setDay(prev => (d.days.includes(prev) ? prev : d.days[0] || 'Monday'));
    } catch (e) {
      toast.error(e.message);
      if (e.status === 404) navigate('/admin/timetable/versions');
    } finally { setLoading(false); }
  }, [id, navigate]);

  useEffect(() => { load(); }, [load]);

  // Hand the soft edit lock back when the admin leaves, so the next one in
  // isn't told "somebody is editing" for 15 minutes.
  useEffect(() => () => {
    if (!releasedRef.current) { releasedRef.current = true; api.releaseLock(id).catch(() => {}); }
  }, [id]);

  useEffect(() => { setParams(view === 'class' ? {} : { tab: view }, { replace: true }); }, [view]); // eslint-disable-line

  /* ── Derived lookups ───────────────────────────────────────────────────── */
  const maps = useMemo(() => {
    if (!data) return null;
    return {
      subject: new Map(data.subjects.map(s => [s._id, s])),
      teacher: new Map(data.teachers.map(t => [t._id, t])),
      room:    new Map(data.rooms.map(r => [r._id, r])),
      section: new Map(data.sections.map(s => [s._id, s])),
    };
  }, [data]);

  const bySlot = useMemo(() => {
    const m = new Map();
    for (const e of data?.entries || []) m.set(`${e.section}#${e.dayOfWeek}#${e.periodNumber}`, e);
    return m;
  }, [data]);

  const teachersInUse = useMemo(() => {
    if (!data) return [];
    const ids = [...new Set(data.entries.map(e => e.teacher).filter(Boolean))];
    return ids.map(tid => maps.teacher.get(tid)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }, [data, maps]);

  const roomsInUse = useMemo(() => {
    if (!data) return [];
    const ids = [...new Set(data.entries.map(e => e.room).filter(Boolean))];
    return ids.map(rid => maps.room.get(rid)).filter(Boolean).sort((a, b) => a.roomName.localeCompare(b.roomName));
  }, [data, maps]);

  useEffect(() => { if (!teacherId && teachersInUse.length) setTeacherId(teachersInUse[0]._id); }, [teachersInUse]); // eslint-disable-line
  useEffect(() => { if (!roomId && roomsInUse.length) setRoomId(roomsInUse[0]._id); }, [roomsInUse]); // eslint-disable-line

  if (loading) return <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>;
  if (!data) return null;

  const { version, sections, days, structures, conflicts } = data;
  const editable = ['draft', 'generated', 'conflict', 'validated', 'failed'].includes(version.status);
  const readOnlyReason = version.status === 'published'
    ? 'This is the live timetable. Duplicate it into a new draft to make changes.'
    : version.status === 'archived' ? 'Archived versions are read-only. Restore it to edit.' : null;

  const structureFor = (secId) => structures[secId] || [];
  const nameOf = {
    subject: (sid) => maps.subject.get(sid)?.subjectName || '—',
    teacher: (tid) => maps.teacher.get(tid)?.name || '',
    room:    (rid) => maps.room.get(rid)?.roomName || '',
    section: (sid) => maps.section.get(sid)?.label || '',
  };

  /* ── Drag & drop ───────────────────────────────────────────────────────── */
  const onDrop = async (targetSectionId, targetDay, targetPeriod) => {
    if (!drag) return;
    const entry = drag;
    setDrag(null);
    if (entry.section !== targetSectionId) {
      return toast.error('A period can only be moved within its own class.');
    }
    if (entry.dayOfWeek === targetDay && entry.periodNumber === targetPeriod) return;

    setBusy(true);
    try {
      await api.moveEntry(id, entry._id, { dayOfWeek: targetDay, periodNumber: targetPeriod });
      toast.success('Period moved');
      await load();
    } catch (e) {
      if (e.status === 409 && e.data?.data?.conflicts) {
        setConflictModal({ entry, targetDay, targetPeriod, conflicts: e.data.data.conflicts, message: e.message });
      } else {
        toast.error(e.message);
      }
    } finally { setBusy(false); }
  };

  const forceMove = async (reason) => {
    const { entry, targetDay, targetPeriod } = conflictModal;
    setBusy(true);
    try {
      await api.moveEntry(id, entry._id, {
        dayOfWeek: targetDay, periodNumber: targetPeriod, override: true, overrideReason: reason,
      });
      toast.success('Move forced — the override is recorded in the audit log');
      setConflictModal(null);
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
      const res = await api.validateVersion(id);
      const d = res.data ?? res;
      setValidation(d);
      d.valid ? toast.success(d.message) : toast.error(d.message);
      await load();
      return d;
    } catch (e) { toast.error(e.message); return null; } finally { setBusy(false); }
  };

  const openPublish = async () => {
    const result = await runValidate();
    if (result?.valid) setPublish(true);
    else setView('conflicts');
  };

  const doPublish = async () => {
    setBusy(true);
    try {
      const res = await api.publishVersion(id);
      const d = res.data ?? res;
      toast.success(d.message || 'Timetable published');
      setPublish(false);
      await load();
    } catch (e) {
      toast.error(e.message);
      setPublish(false);
      if (e.data?.data?.conflicts) setView('conflicts');
      await load();
    } finally { setBusy(false); }
  };

  const doExport = async (fmt) => {
    const exportView = ['class', 'teacher', 'room'].includes(view) ? view : 'class';
    setExporting(fmt);
    try {
      const blob = await api.exportVersion(id, exportView, fmt);
      triggerBlobDownload(blob, `timetable-v${version.versionNumber}-${exportView}.${fmt === 'excel' ? 'xlsx' : 'pdf'}`);
    } catch (e) { toast.error('Export failed'); } finally { setExporting(''); }
  };

  const duplicate = async () => {
    try {
      const res = await api.duplicateVersion(id);
      const d = res.data ?? res;
      toast.success('Duplicated into a new draft');
      navigate(`/admin/timetable/versions/${d._id}`);
    } catch (e) { toast.error(e.message); }
  };

  /* ── Grid renderers ────────────────────────────────────────────────────── */

  const renderClassGrid = () => {
    const section = maps.section.get(sectionId);
    if (!section) return <Empty icon="🏫" title="Pick a class" />;
    const periods = structureFor(sectionId);
    const activeDays = days.filter(d => d !== 'Saturday' || section.openOnSaturday !== false);
    if (!periods.length) return <Empty icon="🕒" title="No period structure" message="Set up periods for this section under Configuration." />;

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, minWidth: 92 }}>Period</th>
              {activeDays.map(d => <th key={d} style={headCell}>{DAY_SHORT[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {periods.map((p, idx) => {
              const type = periodTypeOf(p);
              if (!isTeaching(p)) {
                const tone = type === 'Assembly' ? { bg: '#e0e7ff', fg: '#3730a3' } : type === 'Activity' ? { bg: '#dcfce7', fg: '#166534' } : { bg: '#fef9c3', fg: '#92400e' };
                return (
                  <tr key={idx}>
                    <td style={{ ...cellBase, background: tone.bg, color: tone.fg, fontSize: '.72rem', fontStyle: 'italic', height: 34 }}>
                      {p.recessName || type}
                    </td>
                    <td colSpan={activeDays.length} style={{ ...cellBase, background: tone.bg, color: tone.fg, textAlign: 'center', fontSize: '.75rem', fontStyle: 'italic', height: 34 }}>
                      {p.recessName || type} {p.startTime && `· ${p.startTime}–${p.endTime}`}
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={idx}>
                  <td style={{ ...cellBase, background: 'var(--bg)', whiteSpace: 'nowrap' }}>
                    <div style={{ fontWeight: 700, fontSize: '.82rem' }}>P{p.periodNumber}</div>
                    {p.startTime && <div style={{ fontSize: '.65rem', color: 'var(--text-muted)' }}>{p.startTime}–{p.endTime}</div>}
                  </td>
                  {activeDays.map(d => {
                    const entry = bySlot.get(`${sectionId}#${d}#${p.periodNumber}`);
                    return (
                      <td key={d} style={{ ...cellBase, background: drag && !entry ? 'rgba(79,70,229,.05)' : undefined }}
                        onDragOver={e => editable && e.preventDefault()}
                        onDrop={() => editable && onDrop(sectionId, d, p.periodNumber)}
                        onClick={() => editable && !entry && setCell({ section: sectionId, day: d, period: p.periodNumber })}
                      >
                        {entry ? (
                          <PeriodCard
                            subject={nameOf.subject(entry.subject)}
                            teacher={nameOf.teacher(entry.teacher)}
                            room={nameOf.room(entry.room)}
                            tone={subjectColor(entry.subject)}
                            draggable={editable && !entry.isLocked}
                            manual={entry.isManual}
                            locked={entry.isLocked}
                            dim={drag?._id === entry._id}
                            onDragStart={() => setDrag(entry)}
                            onClick={() => editable && setCell({ entry })}
                          />
                        ) : (
                          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-light)', fontSize: '.72rem' }}>
                            {editable ? '+' : ''}
                          </div>
                        )}
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

  /** Teacher and room views pivot the same entries — one renderer, two filters. */
  const renderPivotGrid = (filterFn, describe) => {
    const rows = data.entries.filter(filterFn);
    if (!rows.length) return <Empty icon="📭" title="Nothing scheduled" />;
    const periodNumbers = [...new Set(
      sections.flatMap(s => structureFor(s._id).filter(isTeaching).map(p => p.periodNumber)),
    )].sort((a, b) => a - b);

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ ...headCell, minWidth: 70 }}>Period</th>
              {days.map(d => <th key={d} style={headCell}>{DAY_SHORT[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {periodNumbers.map(pn => (
              <tr key={pn}>
                <td style={{ ...cellBase, background: 'var(--bg)', fontWeight: 700, fontSize: '.82rem' }}>P{pn}</td>
                {days.map(d => {
                  const hit = rows.find(e => e.dayOfWeek === d && e.periodNumber === pn);
                  return (
                    <td key={d} style={cellBase}>
                      {hit ? <PeriodCard {...describe(hit)} tone={subjectColor(hit.subject)} onClick={() => editable && setCell({ entry: hit })} /> : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 8 }}>
          {rows.length} period(s) scheduled
        </div>
      </div>
    );
  };

  const renderDayGrid = () => {
    const periodNumbers = [...new Set(
      sections.flatMap(s => structureFor(s._id).filter(isTeaching).map(p => p.periodNumber)),
    )].sort((a, b) => a - b);
    const activeSections = sections.filter(s => day !== 'Saturday' || s.openOnSaturday !== false);

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ ...headCell, minWidth: 70, position: 'sticky', left: 0, zIndex: 2 }}>Period</th>
              {activeSections.map(s => <th key={s._id} style={{ ...headCell, minWidth: 120 }}>{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {periodNumbers.map(pn => (
              <tr key={pn}>
                <td style={{ ...cellBase, background: 'var(--bg)', fontWeight: 700, fontSize: '.82rem', position: 'sticky', left: 0 }}>P{pn}</td>
                {activeSections.map(s => {
                  const entry = bySlot.get(`${s._id}#${day}#${pn}`);
                  return (
                    <td key={s._id} style={cellBase}
                      onDragOver={e => editable && e.preventDefault()}
                      onDrop={() => editable && onDrop(s._id, day, pn)}>
                      {entry ? (
                        <PeriodCard
                          subject={nameOf.subject(entry.subject)}
                          teacher={nameOf.teacher(entry.teacher)}
                          room={nameOf.room(entry.room)}
                          tone={subjectColor(entry.subject)}
                          draggable={editable && !entry.isLocked}
                          manual={entry.isManual}
                          locked={entry.isLocked}
                          onDragStart={() => setDrag(entry)}
                          onClick={() => editable && setCell({ entry })}
                        />
                      ) : null}
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

  const renderConflicts = () => {
    if (!conflicts.length) {
      return <Empty icon="✅" title="No conflicts" message="Every hard constraint is satisfied. This version can be published." />;
    }
    const groups = { ERROR: [], WARNING: [], INFO: [] };
    for (const c of conflicts) (groups[c.severity] || groups.INFO).push(c);

    return (
      <div style={{ display: 'grid', gap: 16 }}>
        {['ERROR', 'WARNING', 'INFO'].map(sev => groups[sev].length > 0 && (
          <div key={sev}>
            <h4 style={{ fontSize: '.85rem', margin: '0 0 8px', color: SEVERITY_META[sev].color }}>
              {SEVERITY_META[sev].icon} {groups[sev].length} {SEVERITY_META[sev].label}{groups[sev].length === 1 ? '' : 's'}
              {sev === 'ERROR' && <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}> — must be resolved before publishing</span>}
            </h4>
            <div style={{ display: 'grid', gap: 8 }}>
              {groups[sev].map((c, i) => (
                <div key={c._id || i} style={{
                  background: SEVERITY_META[sev].bg, borderLeft: `3px solid ${SEVERITY_META[sev].color}`,
                  borderRadius: 6, padding: '10px 12px',
                }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge variant={sev === 'ERROR' ? 'danger' : sev === 'WARNING' ? 'warning' : 'info'}>
                      {CONFLICT_LABELS[c.type] || c.type}
                    </Badge>
                    {c.section && <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{nameOf.section(c.section)}</span>}
                    {c.dayOfWeek && <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{c.dayOfWeek}{c.periodNumber ? ` P${c.periodNumber}` : ''}</span>}
                  </div>
                  <div style={{ fontSize: '.85rem', marginTop: 4 }}>{c.description}</div>
                  {c.suggestion && <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: 3 }}>💡 {c.suggestion}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const stats = version.stats || {};

  return (
    <div className="page">
      <PageHeader
        title={version.label || `Version ${version.versionNumber}`}
        subtitle={`${data.yearName} · ${sections.length} section(s) · ${data.entries.length} periods`}
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button variant="secondary" onClick={() => navigate('/admin/timetable/versions')}>← Versions</Button>
            {version.status === 'published' && <Button variant="secondary" onClick={duplicate}>Duplicate to Draft</Button>}
          </div>
        }
      />

      {/* Status strip */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <StatusBadge status={version.status} />
        {version.errorCount > 0 && <Badge variant="danger">{version.errorCount} error(s)</Badge>}
        {version.warningCount > 0 && <Badge variant="warning">{version.warningCount} warning(s)</Badge>}
        {version.publishedAt && <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Published {new Date(version.publishedAt).toLocaleString('en-IN')}</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" variant="secondary" loading={exporting === 'pdf'} onClick={() => doExport('pdf')}>⬇ PDF</Button>
          <Button size="sm" variant="secondary" loading={exporting === 'excel'} onClick={() => doExport('excel')}>⬇ Excel</Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>🖨 Print</Button>
          {editable && <Button size="sm" variant="secondary" loading={busy} onClick={runValidate}>✓ Validate</Button>}
          {editable && <Button size="sm" loading={busy} onClick={openPublish}>🚀 Publish</Button>}
        </div>
      </div>

      {readOnlyReason && <Alert variant="info">{readOnlyReason}</Alert>}

      {validation && (
        <Alert variant={validation.valid ? 'success' : 'danger'}>
          {validation.message}
        </Alert>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <Stat label="Entries"  value={data.entries.length} />
        <Stat label="Fill rate" value={stats.fillRate != null ? `${stats.fillRate}%` : '—'} />
        <Stat label="Requirement met" value={stats.satisfaction != null ? `${stats.satisfaction}%` : '—'} />
        <Stat label="Teachers" value={teachersInUse.length} />
        <Stat label="Rooms"    value={roomsInUse.length} />
        <Stat label="Conflicts" value={conflicts.length} tone={version.errorCount ? 'var(--danger)' : 'var(--success)'} />
      </div>

      {/* View switcher */}
      <div className="tabs" style={{ marginBottom: 12 }}>
        {VIEWS.map(([key, label]) => (
          <button key={key} className={`tab${view === key ? ' active' : ''}`} onClick={() => setView(key)}>
            {label}{key === 'conflicts' && conflicts.length ? ` (${conflicts.length})` : ''}
          </button>
        ))}
      </div>

      <Card>
        {/* Per-view selector */}
        {view === 'class' && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <select className="form-control" style={{ maxWidth: 240 }} value={sectionId} onChange={e => setSectionId(e.target.value)}>
              {sections.map(s => <option key={s._id} value={s._id}>{s.label}</option>)}
            </select>
            {editable && <span style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
              Drag a period to move it · click a period to edit · click an empty slot to add
            </span>}
          </div>
        )}
        {view === 'teacher' && (
          <select className="form-control" style={{ maxWidth: 280, marginBottom: 12 }} value={teacherId} onChange={e => setTeacherId(e.target.value)}>
            {teachersInUse.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
          </select>
        )}
        {view === 'room' && (
          <select className="form-control" style={{ maxWidth: 280, marginBottom: 12 }} value={roomId} onChange={e => setRoomId(e.target.value)}>
            {roomsInUse.map(r => <option key={r._id} value={r._id}>{r.roomName}</option>)}
          </select>
        )}
        {view === 'day' && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            {days.map(d => (
              <button key={d} className={`btn btn-${day === d ? 'primary' : 'secondary'} btn-sm`} onClick={() => setDay(d)}>{DAY_SHORT[d]}</button>
            ))}
          </div>
        )}

        {view === 'class'   && renderClassGrid()}
        {view === 'teacher' && (teachersInUse.length
          ? renderPivotGrid(e => e.teacher === teacherId, e => ({
              subject: nameOf.subject(e.subject), teacher: nameOf.section(e.section), room: nameOf.room(e.room),
            }))
          : <Empty icon="🧑‍🏫" title="No teachers assigned" />)}
        {view === 'room' && (roomsInUse.length
          ? renderPivotGrid(e => e.room === roomId, e => ({
              subject: nameOf.subject(e.subject), teacher: nameOf.section(e.section), room: nameOf.teacher(e.teacher),
            }))
          : <Empty icon="🚪" title="No rooms allocated" message="Add rooms and mark subjects as requiring one." />)}
        {view === 'day'       && renderDayGrid()}
        {view === 'conflicts' && renderConflicts()}
      </Card>

      {/* ── Cell editor ─────────────────────────────────────────────────── */}
      {cellModal && (
        <CellEditor
          cell={cellModal}
          data={data}
          maps={maps}
          busy={busy}
          onClose={() => setCell(null)}
          onSave={saveCell}
          onClear={clearCell}
        />
      )}

      {/* ── Blocked-move explanation ────────────────────────────────────── */}
      <Modal
        open={!!conflictModal}
        onClose={() => setConflictModal(null)}
        title="Cannot move this timetable entry"
        maxWidth={520}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConflictModal(null)}>Cancel</Button>
            <OverrideButton busy={busy} onForce={forceMove} />
          </>
        }
      >
        {conflictModal && (
          <>
            <p style={{ marginTop: 0 }}>
              Moving <strong>{nameOf.subject(conflictModal.entry.subject)}</strong> to{' '}
              <strong>{conflictModal.targetDay} P{conflictModal.targetPeriod}</strong> would break a hard rule:
            </p>
            <div style={{ display: 'grid', gap: 8 }}>
              {conflictModal.conflicts.map((c, i) => (
                <div key={i} style={{ background: 'rgba(239,68,68,.08)', borderLeft: '3px solid var(--danger)', borderRadius: 6, padding: '8px 12px' }}>
                  <div style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--danger)' }}>{CONFLICT_LABELS[c.type] || c.type}</div>
                  <div style={{ fontSize: '.85rem' }}>{c.description}</div>
                  {c.suggestion && <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 2 }}>💡 {c.suggestion}</div>}
                </div>
              ))}
            </div>
          </>
        )}
      </Modal>

      {/* ── Publish confirmation ────────────────────────────────────────── */}
      <Modal
        open={publishModal}
        onClose={() => setPublish(false)}
        title="Publish Timetable"
        maxWidth={480}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPublish(false)}>Cancel</Button>
            <Button loading={busy} onClick={doPublish}>Publish</Button>
          </>
        }
      >
        <Alert variant="success">Timetable is ready to publish.</Alert>
        <p>
          Publishing this timetable will make it visible to teachers and students, and will replace the
          currently published schedule for these {sections.length} section(s). Continue?
        </p>
        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
          The previous published version is archived, not deleted — you can restore it at any time.
        </p>
      </Modal>
    </div>
  );
}

/* ── Override button (requires a reason, which is audited) ─────────────────── */
function OverrideButton({ busy, onForce }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState('');
  if (!asking) return <Button variant="danger" onClick={() => setAsking(true)}>Override anyway…</Button>;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1 }}>
      <input className="form-control" placeholder="Reason (recorded in the audit log)" value={reason}
        onChange={e => setReason(e.target.value)} style={{ flex: 1 }} />
      <Button variant="danger" loading={busy} disabled={!reason.trim()} onClick={() => onForce(reason.trim())}>Force</Button>
    </div>
  );
}

/* ── Add / edit a single period ────────────────────────────────────────────── */
function CellEditor({ cell, data, maps, busy, onClose, onSave, onClear }) {
  const entry = cell.entry;
  const [subject, setSubject] = useState(entry?.subject || '');
  const [teacher, setTeacher] = useState(entry?.teacher || '');
  const [room, setRoom]       = useState(entry?.room || '');
  const [locked, setLocked]   = useState(!!entry?.isLocked);
  const [note, setNote]       = useState(entry?.note || '');

  const sectionId = entry?.section || cell.section;
  const label = maps.section.get(sectionId)?.label || '';
  const when = entry ? `${entry.dayOfWeek} P${entry.periodNumber}` : `${cell.day} P${cell.period}`;

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? `Edit ${label} · ${when}` : `Add period · ${label} · ${when}`}
      maxWidth={480}
      footer={
        <>
          {entry && <Button variant="danger" onClick={onClear} loading={busy} style={{ marginRight: 'auto' }}>Clear period</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button loading={busy} disabled={!subject}
            onClick={() => onSave(entry
              ? { subject, teacher: teacher || null, room: room || null, isLocked: locked, note }
              : { subject, teacher: teacher || null, room: room || null })}>
            Save
          </Button>
        </>
      }
    >
      <div className="form-group">
        <label className="form-label required">Subject</label>
        <select className="form-control" value={subject} onChange={e => setSubject(e.target.value)}>
          <option value="">Select subject…</option>
          {data.subjects.map(s => <option key={s._id} value={s._id}>{s.subjectName}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Teacher</label>
        <select className="form-control" value={teacher} onChange={e => setTeacher(e.target.value)}>
          <option value="">No teacher</option>
          {data.teachers.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Room</label>
        <select className="form-control" value={room} onChange={e => setRoom(e.target.value)}>
          <option value="">No room</option>
          {data.rooms.map(r => <option key={r._id} value={r._id}>{r.roomName}{r.roomNumber ? ` (${r.roomNumber})` : ''}</option>)}
        </select>
      </div>
      {entry && (
        <>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem', marginBottom: 10 }}>
            <input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} />
            Lock this period (kept in place when regenerating)
          </label>
          <div className="form-group">
            <label className="form-label">Note</label>
            <input className="form-control" value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </>
      )}
      <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
        Changes are validated against teacher, class and room clashes before they are saved.
      </div>
    </Modal>
  );
}
