import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { getAcademicYears } from '../../../api/admin.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Card, Button, Table, Spinner, Badge, Modal, Alert } from '../../../components/ui/index';
import { DAY_SHORT, Stat } from './shared';

/**
 * What the published week actually looks like once it is running: who is
 * carrying how much, which rooms are working and which sit empty, and the
 * one-click way to start next year from this year's plan.
 */
export default function TimetableReports() {
  const [tab, setTab] = useState('teachers');
  const [yearId, setYearId] = useState('');
  const [workload, setWorkload] = useState(null);
  const [rooms, setRooms] = useState(null);
  const [loading, setLoading] = useState(true);

  const { data: yearsRaw } = useFetch(getAcademicYears, []);
  const years = yearsRaw || [];

  useEffect(() => {
    if (years.length && !yearId) {
      const active = years.find(y => y.status === 'active');
      if (active) setYearId(active._id);
    }
  }, [years]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, r] = await Promise.all([
        api.getTeacherWorkload(yearId || undefined),
        api.getRoomUtilisation(yearId || undefined),
      ]);
      setWorkload(w.data ?? w);
      setRooms(r.data ?? r);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [yearId]);

  useEffect(() => { load(); }, [load]);

  const days = workload?.days || [];

  return (
    <div>
      <PageHeader
        title="Timetable Reports"
        subtitle="The published week — teaching load, room use, and next year's starting point"
        action={
          <select className="form-control" style={{ width: 200 }} value={yearId}
            onChange={e => setYearId(e.target.value)}>
            {years.map(y => (
              <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (active)' : ''}</option>
            ))}
          </select>
        }
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['teachers', 'Teaching load'], ['rooms', 'Room use'], ['carry', 'Carry forward']].map(([k, label]) => (
          <button key={k} className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {loading && tab !== 'carry' ? <Spinner /> : null}

      {/* ── Teaching load ─────────────────────────────────────────────────── */}
      {!loading && tab === 'teachers' && workload && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat label="Teaching" value={workload.summary.teaching} />
            <Stat label="Nothing timetabled" value={workload.summary.idle} />
            <Stat label="Average load" value={`${workload.summary.average} / wk`} />
            <Stat label="Busiest" value={`${workload.summary.busiest} / wk`} />
            <Stat label="Over their cap" value={workload.summary.overCap} />
          </div>
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <Table
                columns={[
                  { key: 'name', label: 'Teacher' },
                  {
                    key: 'periods', label: 'Periods',
                    render: r => (
                      <span style={{ fontWeight: 700, color: r.overCap ? 'var(--danger)' : 'var(--text)' }}>
                        {r.periods}{r.cap > 0 && <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}> / {r.cap}</span>}
                      </span>
                    ),
                  },
                  { key: 'freePeriods', label: 'Free' },
                  { key: 'sections', label: 'Sections' },
                  { key: 'busiestDay', label: 'Heaviest day', render: r => DAY_SHORT[r.busiestDay] || '—' },
                  {
                    key: 'spread', label: 'Across the week',
                    render: r => (
                      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 22 }}>
                        {days.map(d => {
                          const n = r.byDay[d] || 0;
                          const max = Math.max(1, ...days.map(x => r.byDay[x] || 0));
                          return (
                            <span key={d} title={`${d}: ${n}`} style={{
                              width: 9, height: `${Math.max(2, (n / max) * 22)}px`,
                              background: n ? 'var(--primary)' : 'var(--border)', borderRadius: 2,
                            }} />
                          );
                        })}
                      </div>
                    ),
                  },
                  {
                    key: 'bySubject', label: 'Subjects',
                    render: r => r.bySubject.length
                      ? <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
                          {r.bySubject.map(s => `${s.subjectName} ${s.periods}`).join(' · ')}
                        </span>
                      : <span style={{ color: 'var(--text-light)' }}>—</span>,
                  },
                ]}
                data={workload.teachers}
                emptyTitle="Nothing published yet"
              />
            </div>
          </Card>
        </>
      )}

      {/* ── Room use ──────────────────────────────────────────────────────── */}
      {!loading && tab === 'rooms' && rooms && (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
            <Stat label="Rooms" value={rooms.summary.total} />
            <Stat label="In use" value={rooms.summary.used} />
            <Stat label="Never used" value={rooms.summary.idle} />
            <Stat label="Periods with no room" value={rooms.summary.periodsWithoutARoom} />
          </div>
          {rooms.summary.idle > 0 && (
            <Alert variant="info">
              {rooms.summary.idle} room{rooms.summary.idle === 1 ? ' is' : 's are'} not used by the timetable at all.
              Either nothing requires them, or no subject is set to need that room type.
            </Alert>
          )}
          <Card>
            <div style={{ overflowX: 'auto' }}>
              <Table
                columns={[
                  { key: 'roomName', label: 'Room' },
                  { key: 'roomType', label: 'Type', render: r => <Badge label={r.roomType} /> },
                  { key: 'periods', label: 'Periods used' },
                  { key: 'freeSlots', label: 'Free' },
                  {
                    key: 'utilisation', label: 'Utilisation',
                    render: r => (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
                        <div style={{ flex: 1, height: 7, background: 'var(--bg-secondary)', borderRadius: 4 }}>
                          <div style={{
                            width: `${r.utilisation}%`, height: '100%', borderRadius: 4,
                            background: r.utilisation > 85 ? 'var(--danger)' : r.utilisation > 0 ? 'var(--primary)' : 'transparent',
                          }} />
                        </div>
                        <span style={{ fontSize: '.8rem', width: 34, textAlign: 'right' }}>{r.utilisation}%</span>
                      </div>
                    ),
                  },
                  { key: 'sections', label: 'Sections' },
                ]}
                data={rooms.rooms}
                emptyTitle="No rooms configured"
              />
            </div>
          </Card>
        </>
      )}

      {tab === 'carry' && <CarryForward years={years} currentYearId={yearId} onDone={load} />}
    </div>
  );
}

/* ── Carry forward ─────────────────────────────────────────────────────────── */
function CarryForward({ years, currentYearId, onDone }) {
  const [fromYearId, setFrom] = useState(currentYearId || '');
  const [toYearId, setTo] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => { setFrom(currentYearId || ''); }, [currentYearId]);

  const run = async (apply) => {
    if (!fromYearId || !toYearId) return toast.error('Pick both years');
    setBusy(true);
    try {
      const res = await api.carryForward({ fromYearId, toYearId, ...(apply ? { apply: true } : {}) });
      const d = res.data ?? res;
      setPreview(d);
      if (apply) { toast.success('Plan carried forward'); setConfirm(false); onDone?.(); }
    } catch (e) { toast.error(e.message); setConfirm(false); }
    finally { setBusy(false); }
  };

  return (
    <Card title="Start a year from another year's plan">
      <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: '68ch' }}>
        Copies the subject requirements, combined classes, period grid and solver settings across.
        Sections are matched by class and section name. The <strong>placements are not copied</strong> —
        you still generate, so the schedule fits this year&rsquo;s staff.
      </p>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 190 }}>
          <label className="form-label">Copy from</label>
          <select className="form-control" value={fromYearId} onChange={e => { setFrom(e.target.value); setPreview(null); }}>
            <option value="">— Choose —</option>
            {years.map(y => <option key={y._id} value={y._id}>{y.yearName}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ marginBottom: 0, minWidth: 190 }}>
          <label className="form-label">Into</label>
          <select className="form-control" value={toYearId} onChange={e => { setTo(e.target.value); setPreview(null); }}>
            <option value="">— Choose —</option>
            {years.filter(y => y._id !== fromYearId).map(y => <option key={y._id} value={y._id}>{y.yearName}</option>)}
          </select>
        </div>
        <Button variant="secondary" loading={busy} onClick={() => run(false)}
          disabled={!fromYearId || !toYearId}>
          Check what would move
        </Button>
      </div>

      {preview && !preview.applied && (
        <>
          <Alert variant="info">
            <strong>{preview.sections.length} section(s) matched</strong> between {preview.fromYear} and {preview.toYear}.
          </Alert>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '12px 0' }}>
            <Stat label="Subject requirements" value={preview.requirements} />
            <Stat label="Combined classes" value={preview.merges} />
            <Stat label="Period grids" value={preview.periodStructures} />
          </div>
          {preview.unmatchedSections?.length > 0 && (
            <Alert variant="warning">
              No match in {preview.toYear} for: {preview.unmatchedSections.join(', ')}. Create those sections
              first if they should carry across.
            </Alert>
          )}
          {preview.mergesDropped > 0 && (
            <Alert variant="warning">
              {preview.mergesDropped} combined class dropped — not all of its sections exist in {preview.toYear}.
            </Alert>
          )}
          <Button variant="danger" onClick={() => setConfirm(true)} disabled={!preview.requirements && !preview.merges}>
            Carry it forward
          </Button>
        </>
      )}

      {preview?.applied && (
        <Alert variant="success">
          Carried {preview.requirements} requirement(s), {preview.merges} combined class(es) and{' '}
          {preview.periodStructures} period grid(s) into {preview.toYear}. Generate when you are ready.
        </Alert>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Replace the target year's plan?" maxWidth={460}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => run(true)}>Carry forward</Button>
          </>
        }>
        <p style={{ marginTop: 0 }}>
          Any subject requirements and combined classes already set up in {preview?.toYear} will be replaced
          by {preview?.fromYear}&rsquo;s. Published timetables are not touched.
        </p>
      </Modal>
    </Card>
  );
}
