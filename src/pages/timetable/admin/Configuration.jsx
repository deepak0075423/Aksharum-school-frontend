import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { PageHeader, Button, Card, Spinner, Alert, Input } from '../../../components/ui/index';
import { DAYS, DAY_SHORT, PERIOD_TYPES } from './shared';

const WEIGHT_LABELS = {
  sameSubjectTwiceADay: 'Avoid the same subject twice a day',
  spreadAcrossWeek:     'Spread subjects across the week',
  difficultLastPeriod:  'Avoid hard subjects in the last period',
  difficultConsecutive: 'Avoid back-to-back hard subjects',
  teacherLoadBalance:   'Balance teacher workload across days',
  teacherGaps:          'Minimise teacher free gaps',
  studentGaps:          'Minimise student free gaps',
  teacherPreferred:     'Honour teacher day/period preferences',
  subjectPreferred:     'Honour subject day/period preferences',
  sameSubjectAdjacent:  'Avoid the same subject in adjacent periods',
  dailyOverload:        'Avoid overloading a single day',
};

const blankPeriod = (n) => ({ periodNumber: n, startTime: '', endTime: '', periodType: 'Teaching', label: '' });

export default function TimetableConfiguration() {
  const [cfg, setCfg]       = useState(null);
  const [years, setYears]   = useState([]);
  const [yearId, setYearId] = useState('');
  const [loading, setLoad]  = useState(true);
  const [saving, setSave]   = useState(false);
  const [autoCalc, setAuto] = useState({ start: '08:00', end: '14:00', periods: 8, lunchAfter: 4, lunchMins: 30 });

  const load = useCallback(async (yid) => {
    setLoad(true);
    try {
      const [cRes, mRes] = await Promise.all([api.getConfig(yid), years.length ? null : api.getMeta()]);
      const c = cRes.data ?? cRes;
      setCfg({
        ...c,
        periodTemplate: c.periodTemplate?.length ? c.periodTemplate : [],
        saturdayTemplate: c.saturdayTemplate || [],
      });
      if (!yid) setYearId(c.selectedYearId || '');
      if (mRes) setYears((mRes.data ?? mRes).years || []);
    } catch (e) { toast.error(e.message); } finally { setLoad(false); }
  }, [years.length]);

  useEffect(() => { load(); }, []); // eslint-disable-line

  const set = (k, v) => setCfg(c => ({ ...c, [k]: v }));
  const setDefault = (k, v) => setCfg(c => ({ ...c, defaults: { ...c.defaults, [k]: v } }));
  const setWeight  = (k, v) => setCfg(c => ({ ...c, softWeights: { ...c.softWeights, [k]: Number(v) } }));
  const setSolver  = (k, v) => setCfg(c => ({ ...c, solver: { ...c.solver, [k]: Number(v) } }));

  const setPeriod = (key, i, patch) =>
    setCfg(c => ({ ...c, [key]: c[key].map((p, k) => (k === i ? { ...p, ...patch } : p)) }));
  const removePeriod = (key, i) =>
    setCfg(c => ({ ...c, [key]: c[key].filter((_, k) => k !== i) }));
  const addPeriod = (key, type = 'Teaching') =>
    setCfg(c => {
      const teaching = c[key].filter(p => p.periodType === 'Teaching').length;
      return { ...c, [key]: [...c[key], { ...blankPeriod(type === 'Teaching' ? teaching + 1 : 0), periodType: type, label: type === 'Teaching' ? '' : type }] };
    });

  /** Same equal-split maths the section timetable editor already uses. */
  const runAutoCalc = (key) => {
    const toMin = (t) => { const [h, m] = t.split(':'); return (+h) * 60 + (+m); };
    const toStr = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const n = Math.max(1, Number(autoCalc.periods) || 8);
    const lunch = Math.max(0, Number(autoCalc.lunchMins) || 0);
    const after = Math.max(0, Number(autoCalc.lunchAfter) || 0);
    let cur = toMin(autoCalc.start);
    const total = toMin(autoCalc.end) - cur - lunch;
    if (total < n) return toast.error('The school day is too short for that many periods');
    const len = Math.floor(total / n);
    const rem = total % n;

    const out = [];
    let p = 1;
    for (let i = 1; i <= n + 1; i++) {
      if (i - 1 === after && lunch > 0) {
        out.push({ periodNumber: 0, startTime: toStr(cur), endTime: toStr(cur + lunch), periodType: 'Lunch', label: 'Lunch' });
        cur += lunch;
      }
      if (p <= n) {
        const dur = len + (p === n ? rem : 0);
        out.push({ periodNumber: p, startTime: toStr(cur), endTime: toStr(cur + dur), periodType: 'Teaching', label: '' });
        cur += dur;
        p++;
      }
    }
    set(key, out);
    toast.success('Periods calculated');
  };

  const save = async () => {
    if (!cfg.workingDays?.length) return toast.error('Select at least one working day');
    setSave(true);
    try {
      await api.saveConfig({ ...cfg, yearId });
      toast.success('Configuration saved');
      await load(yearId);
    } catch (e) { toast.error(e.message); } finally { setSave(false); }
  };

  if (loading || !cfg) return <div className="page" style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>;

  const renderTemplate = (key, title, hint) => (
    <Card title={title}>
      <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 0 }}>{hint}</p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <div className="form-group" style={{ marginBottom: 0, flex: '0 0 110px' }}>
          <label className="form-label">Day starts</label>
          <input type="time" className="form-control" value={autoCalc.start} onChange={e => setAuto(a => ({ ...a, start: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: '0 0 110px' }}>
          <label className="form-label">Day ends</label>
          <input type="time" className="form-control" value={autoCalc.end} onChange={e => setAuto(a => ({ ...a, end: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: '0 0 100px' }}>
          <label className="form-label">Periods</label>
          <input type="number" className="form-control" min="1" max="14" value={autoCalc.periods} onChange={e => setAuto(a => ({ ...a, periods: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: '0 0 120px' }}>
          <label className="form-label">Lunch after P#</label>
          <input type="number" className="form-control" min="0" value={autoCalc.lunchAfter} onChange={e => setAuto(a => ({ ...a, lunchAfter: e.target.value }))} />
        </div>
        <div className="form-group" style={{ marginBottom: 0, flex: '0 0 110px' }}>
          <label className="form-label">Lunch (min)</label>
          <input type="number" className="form-control" min="0" value={autoCalc.lunchMins} onChange={e => setAuto(a => ({ ...a, lunchMins: e.target.value }))} />
        </div>
        <Button variant="secondary" onClick={() => runAutoCalc(key)}>⚡ Auto-calculate</Button>
      </div>

      <div className="table-wrap">
        <table className="table" style={{ marginBottom: 0 }}>
          <thead>
            <tr><th style={{ width: 90 }}>#</th><th>Start</th><th>End</th><th style={{ width: 140 }}>Type</th><th>Label</th><th style={{ width: 50 }}></th></tr>
          </thead>
          <tbody>
            {cfg[key].map((p, i) => (
              <tr key={i} style={{ background: p.periodType !== 'Teaching' ? 'var(--bg)' : undefined }}>
                <td>
                  {p.periodType === 'Teaching'
                    ? <input type="number" className="form-control" min="1" value={p.periodNumber}
                        onChange={e => setPeriod(key, i, { periodNumber: Number(e.target.value) || 0 })} />
                    : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td><input type="time" className="form-control" value={p.startTime || ''} onChange={e => setPeriod(key, i, { startTime: e.target.value })} /></td>
                <td><input type="time" className="form-control" value={p.endTime || ''} onChange={e => setPeriod(key, i, { endTime: e.target.value })} /></td>
                <td>
                  <select className="form-control" value={p.periodType} onChange={e => setPeriod(key, i, { periodType: e.target.value })}>
                    {PERIOD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td><input className="form-control" value={p.label || ''} placeholder={p.periodType} onChange={e => setPeriod(key, i, { label: e.target.value })} /></td>
                <td><Button size="sm" variant="danger" onClick={() => removePeriod(key, i)}>×</Button></td>
              </tr>
            ))}
            {!cfg[key].length && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                No periods — use auto-calculate or add them one by one.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={() => addPeriod(key, 'Teaching')}>+ Teaching period</Button>
        <Button size="sm" variant="secondary" onClick={() => addPeriod(key, 'Break')}>+ Break</Button>
        <Button size="sm" variant="secondary" onClick={() => addPeriod(key, 'Lunch')}>+ Lunch</Button>
        <Button size="sm" variant="secondary" onClick={() => addPeriod(key, 'Assembly')}>+ Assembly</Button>
        <Button size="sm" variant="secondary" onClick={() => addPeriod(key, 'Activity')}>+ Activity</Button>
      </div>
    </Card>
  );

  return (
    <div className="page">
      <PageHeader
        title="Timetable Configuration"
        subtitle="Working days, the period grid, and how hard the optimiser pushes on each soft rule"
        action={<Button onClick={save} loading={saving}>Save Configuration</Button>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 200 }} value={yearId}
          onChange={e => { setYearId(e.target.value); load(e.target.value); }}>
          {years.map(y => <option key={y._id} value={y._id}>{y.yearName}</option>)}
        </select>
      </div>

      {!cfg.isSaved && (
        <Alert variant="info">
          No configuration saved for this year yet — these are the defaults. Sections keep using their own period
          structure until you save a school-wide grid here.
        </Alert>
      )}

      <Card title="Working Days">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DAYS.map(d => (
            <button key={d} type="button"
              className={`btn btn-${cfg.workingDays.includes(d) ? 'primary' : 'secondary'} btn-sm`}
              onClick={() => set('workingDays', cfg.workingDays.includes(d)
                ? cfg.workingDays.filter(x => x !== d)
                : [...DAYS.filter(x => cfg.workingDays.includes(x) || x === d)])}>
              {DAY_SHORT[d]}
            </button>
          ))}
        </div>
        <div className="form-hint">Sections that are not open on Saturday are excluded automatically.</div>
      </Card>

      {renderTemplate('periodTemplate', 'Period Grid (Mon–Fri)',
        'The default grid for every section that has no structure of its own. Only "Teaching" periods can hold a subject.')}

      {renderTemplate('saturdayTemplate', 'Saturday Grid (optional)',
        'Leave empty to reuse the weekday grid. Use this for a shorter or half-day Saturday.')}

      <Card title="Hard Limits">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <Input label="Default max periods per teacher / day" type="number" min="0" max="14"
            value={cfg.defaults.maxTeacherPeriodsPerDay ?? ''} onChange={e => setDefault('maxTeacherPeriodsPerDay', Number(e.target.value))} />
          <Input label="Default max periods per teacher / week" type="number" min="0" max="80"
            value={cfg.defaults.maxTeacherPeriodsPerWeek ?? ''} onChange={e => setDefault('maxTeacherPeriodsPerWeek', Number(e.target.value))} />
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
          {[
            ['hardTeacherDailyLimit',   'Teacher daily limit is a hard rule'],
            ['enforceTeacherQualified', 'Only teachers assigned to a subject may teach it'],
          ].map(([key, label]) => (
            <label key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
              <input type="checkbox" checked={cfg.defaults[key] !== false} onChange={e => setDefault(key, e.target.checked)} />
              {label}
            </label>
          ))}
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
            <input type="checkbox" checked={!!cfg.allowSubjectsInActivity} onChange={e => set('allowSubjectsInActivity', e.target.checked)} />
            Allow subjects to be scheduled in "Activity" periods
          </label>
        </div>
      </Card>

      <Card title="Optimiser Weights">
        <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', marginTop: 0 }}>
          How strongly each soft rule pulls on the result. 0 turns it off. Hard rules are never affected by these.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
          {Object.entries(WEIGHT_LABELS).map(([key, label]) => (
            <div key={key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontSize: '.8rem', flex: 1 }}>{label}</span>
              <input type="range" min="0" max="10" value={cfg.softWeights?.[key] ?? 0}
                onChange={e => setWeight(key, e.target.value)} style={{ width: 100 }} />
              <span style={{ fontSize: '.78rem', width: 18, textAlign: 'right', color: 'var(--text-muted)' }}>{cfg.softWeights?.[key] ?? 0}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Solver Budget">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <Input label="Time budget (seconds)" type="number" min="5" max="120"
            value={Math.round((cfg.solver?.timeBudgetMs ?? 20000) / 1000)}
            onChange={e => setSolver('timeBudgetMs', (Number(e.target.value) || 20) * 1000)}
            hint="Raise this for very large schools" />
          <Input label="Restarts on failure" type="number" min="1" max="10"
            value={cfg.solver?.maxRestarts ?? 3} onChange={e => setSolver('maxRestarts', e.target.value)} />
          <Input label="Optimisation rounds" type="number" min="0" max="20000"
            value={cfg.solver?.optimiseRounds ?? 2000} onChange={e => setSolver('optimiseRounds', e.target.value)} />
        </div>
      </Card>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <Button onClick={save} loading={saving}>Save Configuration</Button>
      </div>
    </div>
  );
}
