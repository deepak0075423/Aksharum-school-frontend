import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { PageHeader, Button, Card, Spinner, Modal, Badge, Empty, Input } from '../../../components/ui/index';
import { DAYS, DAY_SHORT } from './shared';

const MAX_PERIODS = 10;

export default function TimetableAvailability() {
  const [teachers, setTeachers] = useState([]);
  const [years, setYears]       = useState([]);
  const [yearId, setYearId]     = useState('');
  const [search, setSearch]     = useState('');
  const [loading, setLoad]      = useState(true);
  const [edit, setEdit]         = useState(null);
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async (yid) => {
    setLoad(true);
    try {
      const [aRes, mRes] = await Promise.all([
        api.getAvailability(yid),
        years.length ? null : api.getMeta(),
      ]);
      const d = aRes.data ?? aRes;
      setTeachers(d.teachers || []);
      if (!yid) setYearId(d.selectedYearId || '');
      if (mRes) setYears((mRes.data ?? mRes).years || []);
    } catch (e) { toast.error(e.message); } finally { setLoad(false); }
  }, [years.length]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const save = async () => {
    setSaving(true);
    try {
      await api.saveAvailability(edit._id, {
        yearId,
        unavailable: edit.unavailable,
        maxPeriodsPerDay: edit.maxPeriodsPerDay === '' ? null : edit.maxPeriodsPerDay,
        maxPeriodsPerWeek: edit.maxPeriodsPerWeek === '' ? null : edit.maxPeriodsPerWeek,
        hardDailyLimit: edit.hardDailyLimit,
        preferredDays: edit.preferredDays,
        preferredPeriods: edit.preferredPeriods,
        notes: edit.notes,
      });
      toast.success(`Availability saved for ${edit.name}`);
      setEdit(null);
      await load(yearId);
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const toggleSlot = (day, period) => setEdit(t => {
    const has = t.unavailable.some(u => u.dayOfWeek === day && u.periodNumber === period);
    return {
      ...t,
      unavailable: has
        ? t.unavailable.filter(u => !(u.dayOfWeek === day && u.periodNumber === period))
        : [...t.unavailable, { dayOfWeek: day, periodNumber: period, reason: '' }],
    };
  });

  const toggleDay = (day) => setEdit(t => {
    const all = Array.from({ length: MAX_PERIODS }, (_, i) => i + 1);
    const allBlocked = all.every(p => t.unavailable.some(u => u.dayOfWeek === day && u.periodNumber === p));
    return {
      ...t,
      unavailable: allBlocked
        ? t.unavailable.filter(u => u.dayOfWeek !== day)
        : [...t.unavailable.filter(u => u.dayOfWeek !== day), ...all.map(p => ({ dayOfWeek: day, periodNumber: p, reason: '' }))],
    };
  });

  const filtered = teachers.filter(t => !search
    || t.name.toLowerCase().includes(search.toLowerCase())
    || (t.subjects || []).some(s => s.toLowerCase().includes(search.toLowerCase())));

  if (loading) return <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader
        title="Teacher Availability"
        subtitle="Blocked slots and workload limits the generator must respect"
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={yearId}
          onChange={e => { setYearId(e.target.value); load(e.target.value); }}>
          {years.map(y => <option key={y._id} value={y._id}>{y.yearName}</option>)}
        </select>
        <input className="form-control" style={{ maxWidth: 300 }} placeholder="🔍 Search teacher or subject…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {!filtered.length ? <Empty icon="🧑‍🏫" title="No teachers found" /> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {filtered.map(t => {
            const blocked = t.unavailable?.length || 0;
            return (
              <div key={t._id} className="card">
                <div className="card-body" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: '.9rem' }}>{t.name}</strong>
                      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {(t.subjects || []).join(', ') || 'No subjects assigned'}
                      </div>
                    </div>
                    <Badge variant={t.configured ? 'success' : 'muted'}>{t.configured ? 'Set' : 'Default'}</Badge>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
                    <Badge variant={blocked ? 'warning' : 'info'}>{blocked ? `${blocked} blocked slot(s)` : 'Always available'}</Badge>
                    {t.maxPeriodsPerDay ? <Badge variant="muted">≤{t.maxPeriodsPerDay}/day</Badge> : null}
                    {t.maxPeriodsPerWeek ? <Badge variant="muted">≤{t.maxPeriodsPerWeek}/week</Badge> : null}
                  </div>

                  <Button size="sm" variant="secondary" onClick={() => setEdit({
                    ...t,
                    unavailable: [...(t.unavailable || [])],
                    preferredDays: [...(t.preferredDays || [])],
                    preferredPeriods: [...(t.preferredPeriods || [])],
                    maxPeriodsPerDay: t.maxPeriodsPerDay ?? '',
                    maxPeriodsPerWeek: t.maxPeriodsPerWeek ?? '',
                    notes: t.notes || '',
                  })}>
                    Edit availability
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {edit && (
        <Modal open onClose={() => setEdit(null)} title={`${edit.name} — availability`} maxWidth={680}
          footer={<>
            <Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button>
            <Button onClick={save} loading={saving}>Save</Button>
          </>}>
          <div className="form-group">
            <label className="form-label">Unavailable slots</label>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '.75rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: 4 }}></th>
                    {Array.from({ length: MAX_PERIODS }, (_, i) => <th key={i} style={{ padding: 4, fontWeight: 600 }}>P{i + 1}</th>)}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map(day => (
                    <tr key={day}>
                      <td style={{ padding: 4, fontWeight: 600 }}>{DAY_SHORT[day]}</td>
                      {Array.from({ length: MAX_PERIODS }, (_, i) => {
                        const period = i + 1;
                        const off = edit.unavailable.some(u => u.dayOfWeek === day && u.periodNumber === period);
                        return (
                          <td key={period} style={{ padding: 2 }}>
                            <button type="button" onClick={() => toggleSlot(day, period)} title={off ? 'Unavailable' : 'Available'}
                              style={{
                                width: 28, height: 24, borderRadius: 4, cursor: 'pointer',
                                border: `1px solid ${off ? 'var(--danger)' : 'var(--border)'}`,
                                background: off ? 'rgba(239,68,68,.15)' : 'rgba(16,185,129,.10)',
                                color: off ? 'var(--danger)' : 'var(--success)', fontSize: '.7rem', fontWeight: 700,
                              }}>
                              {off ? '✕' : '✓'}
                            </button>
                          </td>
                        );
                      })}
                      <td style={{ padding: 2 }}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleDay(day)}>All</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-hint">✓ available · ✕ unavailable. The generator never assigns a blocked slot.</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Input label="Max periods per day" type="number" min="0" max="12" value={edit.maxPeriodsPerDay}
              onChange={e => setEdit(t => ({ ...t, maxPeriodsPerDay: e.target.value }))} hint="Blank = school default" />
            <Input label="Max periods per week" type="number" min="0" max="60" value={edit.maxPeriodsPerWeek}
              onChange={e => setEdit(t => ({ ...t, maxPeriodsPerWeek: e.target.value }))} hint="Blank = school default" />
          </div>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem', marginBottom: 12 }}>
            <input type="checkbox" checked={edit.hardDailyLimit}
              onChange={e => setEdit(t => ({ ...t, hardDailyLimit: e.target.checked }))} />
            The daily limit is a hard rule (otherwise it is only optimised for)
          </label>

          <div className="form-group">
            <label className="form-label">Preferred days</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DAYS.map(d => (
                <button key={d} type="button"
                  className={`btn btn-${edit.preferredDays.includes(d) ? 'primary' : 'secondary'} btn-sm`}
                  onClick={() => setEdit(t => ({
                    ...t, preferredDays: t.preferredDays.includes(d) ? t.preferredDays.filter(x => x !== d) : [...t.preferredDays, d],
                  }))}>
                  {DAY_SHORT[d]}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Preferred periods</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Array.from({ length: MAX_PERIODS }, (_, i) => i + 1).map(p => (
                <button key={p} type="button"
                  className={`btn btn-${edit.preferredPeriods.includes(p) ? 'primary' : 'secondary'} btn-sm`}
                  onClick={() => setEdit(t => ({
                    ...t, preferredPeriods: t.preferredPeriods.includes(p) ? t.preferredPeriods.filter(x => x !== p) : [...t.preferredPeriods, p],
                  }))}>
                  P{p}
                </button>
              ))}
            </div>
          </div>

          <Input label="Notes" value={edit.notes} onChange={e => setEdit(t => ({ ...t, notes: e.target.value }))} />
        </Modal>
      )}
    </div>
  );
}
