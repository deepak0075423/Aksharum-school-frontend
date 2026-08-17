import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { PageHeader, Button, Card, Spinner, Alert, Empty, Badge, Modal } from '../../../components/ui/index';
import { SUBJECT_TYPES, ROOM_TYPES, DAYS, DAY_SHORT } from './shared';

/**
 * Per-section weekly subject requirements — how many periods each subject owes,
 * who teaches it, and the rules the generator must respect for it.
 */
export default function TimetableRequirements() {
  const [meta, setMeta]       = useState(null);
  const [yearId, setYearId]   = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSecId] = useState('');
  const [data, setData]       = useState(null);
  const [rows, setRows]       = useState([]);
  const [loading, setLoad]    = useState(true);
  const [saving, setSaving]   = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [advanced, setAdv]    = useState(null);   // index of the row being fine-tuned

  useEffect(() => {
    (async () => {
      try {
        const res = await api.getMeta();
        const d = res.data ?? res;
        setMeta(d);
        setYearId(d.selectedYearId || '');
        const firstClass = d.classes?.[0];
        if (firstClass) {
          setClassId(firstClass._id);
          if (firstClass.sections?.[0]) setSecId(firstClass.sections[0]._id);
        }
      } catch (e) { toast.error(e.message); } finally { setLoad(false); }
    })();
  }, []);

  const load = useCallback(async (sid = sectionId) => {
    if (!sid) { setData(null); setRows([]); return; }
    setLoad(true);
    try {
      const res = await api.getRequirements(sid, yearId);
      const d = res.data ?? res;
      setData(d);
      setRows((d.requirements || []).map(normalise));
    } catch (e) { toast.error(e.message); } finally { setLoad(false); }
  }, [sectionId, yearId]);

  useEffect(() => { if (sectionId) load(sectionId); }, [sectionId]); // eslint-disable-line

  const classes = meta?.classes || [];
  const sectionsOf = classes.find(c => c._id === classId)?.sections || [];

  const setRow = (i, patch) => setRows(rs => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const removeRow = (i) => setRows(rs => rs.filter((_, k) => k !== i));

  const addSubject = (subjectId) => {
    const missing = data.missingSubjects.find(m => m._id === subjectId);
    setRows(rs => [...rs, normalise({
      subject: subjectId,
      weeklyPeriods: 4,
      teacher: missing?.suggestedTeacher || '',
      subjectType: 'Theory',
      consecutivePeriods: 1,
      maxPerDay: 1,
      difficulty: 3,
    })]);
  };

  const save = async () => {
    if (!rows.length) return toast.error('Add at least one subject');
    setSaving(true);
    try {
      await api.saveRequirements(sectionId, { yearId, requirements: rows });
      toast.success('Requirements saved');
      await load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const seedAll = async () => {
    setSeeding(true);
    try {
      const res = await api.seedRequirements({ yearId });
      const d = res.data ?? res;
      toast.success(`Seeded ${d.created} requirement(s) across ${d.sections} section(s)`);
      await load();
    } catch (e) { toast.error(e.message); } finally { setSeeding(false); }
  };

  const totalWeekly = rows.reduce((n, r) => n + (Number(r.weeklyPeriods) || 0), 0);
  const capacity = data ? data.periodsPerDay * (data.section.openOnSaturday ? 6 : 5) : 0;
  const over = capacity > 0 && totalWeekly > capacity;

  if (loading && !data) return <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>;

  const subjectName = (id) => (meta?.subjects || []).find(s => s._id === id)?.subjectName
    || (data?.subjects || []).find(s => s._id === id)?.subjectName || 'Subject';

  return (
    <div className="page">
      <PageHeader
        title="Subject Requirements"
        subtitle="Weekly periods, teachers and scheduling rules per class"
        action={<Button variant="secondary" loading={seeding} onClick={seedAll}>↻ Seed from subject assignments</Button>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={yearId} onChange={e => setYearId(e.target.value)}>
          {(meta?.years || []).map(y => <option key={y._id} value={y._id}>{y.yearName}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 200 }} value={classId}
          onChange={e => { setClassId(e.target.value); const s = classes.find(c => c._id === e.target.value)?.sections?.[0]; setSecId(s?._id || ''); }}>
          {classes.map(c => <option key={c._id} value={c._id}>{c.className}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 200 }} value={sectionId} onChange={e => setSecId(e.target.value)}>
          <option value="">Select section…</option>
          {sectionsOf.map(s => <option key={s._id} value={s._id}>Section {s.sectionName}</option>)}
        </select>
      </div>

      {!sectionId ? <Empty icon="🏫" title="Pick a class and section" /> : !data ? <Spinner /> : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
            <Badge variant={over ? 'danger' : 'info'}>{totalWeekly} periods/week required</Badge>
            <Badge variant="muted">{capacity} teaching slots available</Badge>
            <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              {data.section.className} {data.section.sectionName} · {data.section.strength} students
            </span>
          </div>

          {over && (
            <Alert variant="danger">
              This section demands {totalWeekly} periods but only has {capacity} teaching slots a week.
              Generation will report a shortage until you reduce it by {totalWeekly - capacity}.
            </Alert>
          )}

          <Card>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ marginBottom: 0 }}>
                <thead>
                  <tr>
                    <th style={{ minWidth: 150 }}>Subject</th>
                    <th style={{ width: 100 }}>Per week</th>
                    <th style={{ minWidth: 150 }}>Teacher</th>
                    <th style={{ width: 120 }}>Type</th>
                    <th style={{ width: 90 }}>Max/day</th>
                    <th style={{ width: 100 }}>Consecutive</th>
                    <th style={{ width: 100 }}>Difficulty</th>
                    <th style={{ width: 120 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.subject || i}>
                      <td><strong style={{ fontSize: '.85rem' }}>{subjectName(r.subject)}</strong></td>
                      <td>
                        <input type="number" className="form-control" min="0" max="60" value={r.weeklyPeriods}
                          onChange={e => setRow(i, { weeklyPeriods: e.target.value })} />
                      </td>
                      <td>
                        <select className="form-control" value={r.teacher || ''} onChange={e => setRow(i, { teacher: e.target.value })}>
                          <option value="">No teacher</option>
                          {(data.teachers || []).map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <select className="form-control" value={r.subjectType} onChange={e => setRow(i, { subjectType: e.target.value })}>
                          {SUBJECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" className="form-control" min="1" max="12" value={r.maxPerDay}
                          onChange={e => setRow(i, { maxPerDay: e.target.value })} />
                      </td>
                      <td>
                        <input type="number" className="form-control" min="1" max="4" value={r.consecutivePeriods}
                          onChange={e => setRow(i, { consecutivePeriods: e.target.value })} />
                      </td>
                      <td>
                        <select className="form-control" value={r.difficulty} onChange={e => setRow(i, { difficulty: e.target.value })}>
                          {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <Button size="sm" variant="secondary" onClick={() => setAdv(i)}>
                            More{(r.requiresRoom || r.preferredDays?.length || r.preferredPeriods?.length || r.altTeachers?.length) ? ' •' : ''}
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => removeRow(i)}>×</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                      No requirements yet — add subjects below or seed them from the section's subject assignments.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {data.missingSubjects?.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginBottom: 6 }}>Add a subject this section teaches:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {data.missingSubjects.map(m => (
                    <Button key={m._id} size="sm" variant="secondary" onClick={() => addSubject(m._id)}>+ {m.subjectName}</Button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Button variant="secondary" onClick={() => load()}>Reset</Button>
              <Button onClick={save} loading={saving}>Save Requirements</Button>
            </div>
          </Card>
        </>
      )}

      {/* ── Advanced rules for one subject ──────────────────────────────── */}
      {advanced != null && rows[advanced] && (
        <AdvancedModal
          row={rows[advanced]}
          subjectName={subjectName(rows[advanced].subject)}
          teachers={data.teachers || []}
          rooms={data.rooms || []}
          onChange={patch => setRow(advanced, patch)}
          onClose={() => setAdv(null)}
        />
      )}
    </div>
  );
}

function normalise(r) {
  return {
    subject: r.subject?._id || r.subject || '',
    weeklyPeriods: r.weeklyPeriods ?? 4,
    teacher: r.teacher?._id || r.teacher || '',
    altTeachers: (r.altTeachers || []).map(t => t._id || t),
    subjectType: r.subjectType || 'Theory',
    room: r.room?._id || r.room || '',
    roomTypes: r.roomTypes || [],
    requiresRoom: !!r.requiresRoom,
    consecutivePeriods: r.consecutivePeriods ?? 1,
    maxPerDay: r.maxPerDay ?? 1,
    hardMaxPerDay: r.hardMaxPerDay !== false,
    minGapPeriods: r.minGapPeriods ?? 0,
    preferredPeriods: r.preferredPeriods || [],
    preferredDays: r.preferredDays || [],
    difficulty: r.difficulty ?? 3,
    priority: r.priority ?? 0,
    isActive: r.isActive !== false,
  };
}

function AdvancedModal({ row, subjectName, teachers, rooms, onChange, onClose }) {
  const toggle = (key, value) => {
    const list = row[key] || [];
    onChange({ [key]: list.includes(value) ? list.filter(v => v !== value) : [...list, value] });
  };

  return (
    <Modal open onClose={onClose} title={`${subjectName} — advanced rules`} maxWidth={620}
      footer={<Button onClick={onClose}>Done</Button>}>
      <div className="form-group">
        <label className="form-label">Alternate teachers</label>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10, maxHeight: 130, overflowY: 'auto' }}>
          {teachers.filter(t => t._id !== row.teacher).map(t => (
            <label key={t._id} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '.8rem' }}>
              <input type="checkbox" checked={(row.altTeachers || []).includes(t._id)} onChange={() => toggle('altTeachers', t._id)} />
              {t.name}
            </label>
          ))}
        </div>
        <div className="form-hint">Used when the primary teacher is unavailable or already at their limit.</div>
      </div>

      <div className="form-group">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
          <input type="checkbox" checked={row.requiresRoom} onChange={e => onChange({ requiresRoom: e.target.checked })} />
          This subject needs a specific room / lab
        </label>
      </div>

      {row.requiresRoom && (
        <>
          <div className="form-group">
            <label className="form-label">Pin to one room</label>
            <select className="form-control" value={row.room || ''} onChange={e => onChange({ room: e.target.value })}>
              <option value="">Any compatible room</option>
              {rooms.map(r => <option key={r._id} value={r._id}>{r.roomName} ({r.roomType}, seats {r.capacity})</option>)}
            </select>
          </div>
          {!row.room && (
            <div className="form-group">
              <label className="form-label">Acceptable room types</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {ROOM_TYPES.map(t => (
                  <label key={t} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '.8rem' }}>
                    <input type="checkbox" checked={(row.roomTypes || []).includes(t)} onChange={() => toggle('roomTypes', t)} />
                    {t}
                  </label>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Minimum gap between periods</label>
          <input type="number" className="form-control" min="0" max="8" value={row.minGapPeriods}
            onChange={e => onChange({ minGapPeriods: Number(e.target.value) || 0 })} />
        </div>
        <div className="form-group">
          <label className="form-label">Priority</label>
          <input type="number" className="form-control" value={row.priority}
            onChange={e => onChange({ priority: Number(e.target.value) || 0 })} />
          <div className="form-hint">Higher = placed earlier.</div>
        </div>
      </div>

      <div className="form-group">
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
          <input type="checkbox" checked={row.hardMaxPerDay} onChange={e => onChange({ hardMaxPerDay: e.target.checked })} />
          Treat "max per day" as a hard rule (never break it)
        </label>
      </div>

      <div className="form-group">
        <label className="form-label">Preferred days</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DAYS.map(d => (
            <button key={d} type="button" onClick={() => toggle('preferredDays', d)}
              className={`btn btn-${(row.preferredDays || []).includes(d) ? 'primary' : 'secondary'} btn-sm`}>
              {DAY_SHORT[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="form-group">
        <label className="form-label">Preferred periods</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(p => (
            <button key={p} type="button" onClick={() => toggle('preferredPeriods', p)}
              className={`btn btn-${(row.preferredPeriods || []).includes(p) ? 'primary' : 'secondary'} btn-sm`}>
              P{p}
            </button>
          ))}
        </div>
        <div className="form-hint">Preferences are optimised for, never enforced — they cannot make a timetable impossible.</div>
      </div>
    </Modal>
  );
}
