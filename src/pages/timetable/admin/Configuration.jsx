/**
 * Admin → Timetable → Configuration.
 *
 * The rules the generator works inside, per academic year. Six tabs, in the
 * order a school sets them up:
 *
 *   General       the day: when it starts and ends, which days it runs, where
 *                 lunch goes, and the two limits everything else hangs off
 *   Period Grid   the actual bells — the weekday template, and Saturday's if it
 *                 differs
 *   Working Days  which days run, and what each one holds
 *   Constraints   the hard rules: never violated, whatever the weights say
 *   Optimiser     what the solver pursues once the hard rules hold
 *   Advanced      solver budget, saved rule sets, and carrying a year forward
 *
 * Nothing here is saved until Save Configuration, and a year with nothing saved
 * simply uses the defaults — sections keep their own period structures until a
 * school-wide grid exists.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { Button, Modal, Confirm } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  TtHead, Seg, Card, Body, Panel, KV, Field, Chip, Note, Loading, SetCard,
  SwitchRow, CheckRow, Weight, Check, plural, duration, toMinutes, timeRange,
} from './ttUI';
import { DAYS, DAY_SHORT, PERIOD_TYPES } from './shared';

const unwrap = (res) => res?.data ?? res;

const TABS = [
  ['general',   'General'],
  ['grid',      'Period Grid'],
  ['days',      'Working Days'],
  ['limits',    'Constraints'],
  ['optimiser', 'Optimiser'],
  ['advanced',  'Advanced'],
];

/* Named in the order they matter, not alphabetically: the first five are what
   the General tab shows, and they are the five schools actually change. */
const WEIGHTS = [
  ['sameSubjectTwiceADay', 'Avoid same subject twice a day'],
  ['difficultConsecutive', 'Avoid back-to-back hard subjects'],
  ['studentGaps',          'Minimise student free gaps'],
  ['sameSubjectAdjacent',  'Avoid same subject in adjacent periods'],
  ['spreadAcrossWeek',     'Spread subjects across the week'],
  ['difficultLastPeriod',  'Avoid hard subjects in the last period'],
  ['teacherLoadBalance',   'Balance teacher load across days'],
  ['teacherGaps',          'Minimise teacher free gaps'],
  ['teacherPreferred',     'Honour teacher day and period preferences'],
  ['subjectPreferred',     'Honour subject day and period preferences'],
  ['dailyOverload',        'Avoid overloading a single day'],
];
const PRIMARY_WEIGHTS = WEIGHTS.slice(0, 5);

const blankPeriod = (n, type) => ({
  periodNumber: type === 'Teaching' ? n : 0,
  startTime: '', endTime: '', periodType: type, label: type === 'Teaching' ? '' : type,
});

export default function TimetableConfiguration() {
  const [cfg, setCfg]       = useState(null);
  const [saved, setSaved]   = useState(null);     // what is on the server, for the dirty check
  const [years, setYears]   = useState([]);
  const [yearId, setYearId] = useState('');
  const [loading, setLoad]  = useState(true);
  const [saving, setSave]   = useState(false);
  const [tab, setTab]       = useState('general');
  const [more, setMore]     = useState(false);
  const [reset, setReset]   = useState(false);
  const [carry, setCarry]   = useState(null);
  const [template, setTemplate] = useState(null);

  const load = useCallback(async (yid) => {
    setLoad(true);
    try {
      const [cRes, mRes] = await Promise.all([api.getConfig(yid), years.length ? null : api.getMeta(yid)]);
      const c = unwrap(cRes);
      const shaped = {
        ...c,
        periodTemplate: c.periodTemplate || [],
        saturdayTemplate: c.saturdayTemplate || [],
        ruleTemplates: c.ruleTemplates || [],
      };
      setCfg(shaped);
      setSaved(JSON.stringify(shaped));
      if (!yid) setYearId(String(c.selectedYearId || ''));
      if (mRes) setYears(unwrap(mRes).years || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoad(false); }
  }, [years.length]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set        = (k, v) => setCfg((c) => ({ ...c, [k]: v }));
  const setDefault = (k, v) => setCfg((c) => ({ ...c, defaults: { ...c.defaults, [k]: v } }));
  const setWeight  = (k, v) => setCfg((c) => ({ ...c, softWeights: { ...c.softWeights, [k]: Number(v) } }));
  const setSolver  = (k, v) => setCfg((c) => ({ ...c, solver: { ...c.solver, [k]: Number(v) } }));

  const dirty = cfg && saved !== JSON.stringify(cfg);

  const save = async () => {
    if (!cfg.workingDays?.length) return toast.error('A school runs on at least one day');
    setSave(true);
    try {
      await api.saveConfig({ ...cfg, yearId });
      toast.success('Configuration saved');
      await load(yearId);
    } catch (e) { toast.error(e?.data?.message || e.message); }
    finally { setSave(false); }
  };

  /* ── The grid editors ──────────────────────────────────────────────────── */
  const setPeriod = (key, i, patch) =>
    setCfg((c) => ({ ...c, [key]: c[key].map((p, k) => (k === i ? { ...p, ...patch } : p)) }));
  const removePeriod = (key, i) =>
    setCfg((c) => ({ ...c, [key]: c[key].filter((_, k) => k !== i) }));
  const addPeriod = (key, type) => setCfg((c) => {
    const n = c[key].filter((p) => p.periodType === 'Teaching').length + 1;
    return { ...c, [key]: [...c[key], blankPeriod(n, type)] };
  });

  /** The same equal-split maths the section editor uses, so the two agree. */
  const autoCalc = (key) => {
    const toMin = (t) => { const [h, m] = String(t || '').split(':'); return (+h) * 60 + (+m); };
    const toStr = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const n = Math.max(1, Number(cfg.autoPeriods) || 8);
    const lunch = Math.max(0, Number(cfg.lunchMinutes) || 0);
    const after = Math.max(0, Number(cfg.lunchAfterPeriod) || 0);
    let cur = toMin(cfg.dayStartsAt || '08:00');
    const total = toMin(cfg.dayEndsAt || '14:00') - cur - lunch;
    if (total < n) return toast.error('The school day is too short for that many periods');
    const len = Math.floor(total / n);
    const rem = total % n;

    const out = [];
    let p = 1;
    if (cfg.includeAssembly) {
      out.push({ periodNumber: 0, startTime: toStr(cur), endTime: toStr(cur + 15), periodType: 'Assembly', label: 'Assembly' });
      cur += 15;
    }
    for (let i = 1; i <= n + 1; i++) {
      if (i - 1 === after && lunch > 0) {
        out.push({ periodNumber: 0, startTime: toStr(cur), endTime: toStr(cur + lunch), periodType: 'Lunch', label: 'Lunch Break' });
        cur += lunch;
      }
      if (p <= n) {
        const dur = len + (p === n ? rem : 0);
        out.push({ periodNumber: p, startTime: toStr(cur), endTime: toStr(cur + dur), periodType: 'Teaching', label: '' });
        cur += dur;
        p += 1;
      }
    }
    set(key, out);
    toast.success(`${n} periods laid out`);
  };

  if (loading || !cfg) return <div className="page tt-page"><Loading label="Loading the configuration…" /></div>;

  const teaching = cfg.periodTemplate.filter((p) => (p.periodType || 'Teaching') === 'Teaching');
  const lunchRow = cfg.periodTemplate.find((p) => p.periodType === 'Lunch');

  // Saturday runs only if this year's working days say so.
  const saturdayOpen = cfg.workingDays.includes('Saturday');
  // Which days the weekday grid actually covers — with Saturday open and no
  // grid of its own, "Mon–Fri" is a lie about what the admin is editing.
  const gridDays = cfg.workingDays.filter((d) => d !== 'Sunday'
    && !(d === 'Saturday' && cfg.saturdayTemplate.length));
  const weekdayLabel = gridDays.length
    ? (gridDays.length === 1
      ? DAY_SHORT[gridDays[0]]
      : `${DAY_SHORT[gridDays[0]]}–${DAY_SHORT[gridDays[gridDays.length - 1]]}`)
    : 'no working days';

  return (
    <div className="page tt-page">
      <TtHead icon="settings" title="Timetable Configuration"
        subtitle="Set up school timings, working days, constraints and optimisation preferences.">
        <Button variant="secondary" onClick={() => setReset(true)}>
          <Icon name="refresh" size={16} /> Reset to Defaults
        </Button>
        <Button onClick={save} loading={saving} disabled={!dirty}>
          <Icon name="save" size={16} /> Save Configuration
        </Button>
      </TtHead>

      <div style={{ overflowX: 'auto' }}>
        <Seg value={tab} onChange={setTab} options={TABS} />
      </div>

      {!cfg.isSaved && (
        <Note tone="info">
          Nothing is saved for this year yet — these are the defaults. Sections keep using their own
          period structures until a school-wide grid is saved here.
        </Note>
      )}

      <div className="tt-split tt-split--wide">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ══ General ══════════════════════════════════════════════════ */}
          {tab === 'general' && (
            <div className="tt-setgrid tt-setgrid--pair">
              <SetCard tone="indigo" icon="calendar" title="Academic Year"
                hint="Select the academic year for these settings.">
                <Field label="Academic Year">
                  <select className="form-control" value={yearId}
                    onChange={(e) => { setYearId(e.target.value); load(e.target.value); }}>
                    {years.map((y) => (
                      <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (Active)' : ''}</option>
                    ))}
                  </select>
                </Field>
              </SetCard>

              <SetCard tone="violet" icon="calendarDays" title="Working Days"
                hint="Select the days when classes are conducted.">
                <DayPicker value={cfg.workingDays} onChange={(v) => set('workingDays', v)} />
                <Note tone="info">
                  Sections that are not open on a selected day are excluded automatically.
                </Note>
              </SetCard>

              <SetCard tone="blue" icon="clock" title="Default Timing"
                hint="Set the school start and end time.">
                <div style={{ display: 'flex', gap: 12 }}>
                  <Field label="School starts at">
                    <input type="time" className="form-control" value={cfg.dayStartsAt || '08:00'}
                      onChange={(e) => set('dayStartsAt', e.target.value)} />
                  </Field>
                  <Field label="School ends at">
                    <input type="time" className="form-control" value={cfg.dayEndsAt || '14:00'}
                      onChange={(e) => set('dayEndsAt', e.target.value)} />
                  </Field>
                </div>
                <span style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
                  These are what the period grid is built from — the grid itself stays the authority
                  on what is taught when.
                </span>
              </SetCard>

              <SetCard tone="amber" icon="clock" title="Break &amp; Lunch"
                hint="Configure break and lunch duration.">
                <div style={{ display: 'flex', gap: 12 }}>
                  <Field label="Lunch after period">
                    <input type="number" min="0" max="12" className="form-control"
                      value={cfg.lunchAfterPeriod ?? 4}
                      onChange={(e) => set('lunchAfterPeriod', Number(e.target.value))} />
                  </Field>
                  <Field label="Lunch duration (minutes)">
                    <input type="number" min="0" max="120" className="form-control"
                      value={cfg.lunchMinutes ?? 30}
                      onChange={(e) => set('lunchMinutes', Number(e.target.value))} />
                  </Field>
                </div>
                <SwitchRow lead checked={cfg.autoBreaks !== false} onChange={(v) => set('autoBreaks', v)}
                  title="Auto-calculate break times"
                  hint="Breaks are distributed automatically when the grid is laid out." />
                <SwitchRow lead checked={!!cfg.includeAssembly} onChange={(v) => set('includeAssembly', v)}
                  title="Include assembly in timetable"
                  hint="Adds a morning assembly row rather than letting it eat period 1." />
              </SetCard>

              <SetCard tone="green" icon="shieldCheck" title="Hard Limits"
                hint="Set limits that must never be violated.">
                <div style={{ display: 'flex', gap: 12 }}>
                  <Field label="Max periods per teacher / day">
                    <input type="number" min="0" max="14" className="form-control"
                      value={cfg.defaults.maxTeacherPeriodsPerDay ?? ''}
                      onChange={(e) => setDefault('maxTeacherPeriodsPerDay', Number(e.target.value))} />
                  </Field>
                  <Field label="Max periods per teacher / week">
                    <input type="number" min="0" max="80" className="form-control"
                      value={cfg.defaults.maxTeacherPeriodsPerWeek ?? ''}
                      onChange={(e) => setDefault('maxTeacherPeriodsPerWeek', Number(e.target.value))} />
                  </Field>
                </div>
                <CheckRow checked={cfg.defaults.hardTeacherDailyLimit !== false}
                  onChange={(v) => setDefault('hardTeacherDailyLimit', v)}>
                  Teacher daily limit is a hard rule
                </CheckRow>
                <CheckRow checked={cfg.defaults.enforceTeacherQualified !== false}
                  onChange={(v) => setDefault('enforceTeacherQualified', v)}>
                  Only teachers assigned to a subject may teach it
                </CheckRow>
                <CheckRow checked={!!cfg.allowSubjectsInActivity}
                  onChange={(v) => set('allowSubjectsInActivity', v)}>
                  Allow subjects to be scheduled in “Activity” periods
                </CheckRow>
              </SetCard>

              <SetCard tone="teal" icon="sliders" title="Optimiser Weights"
                hint="Adjust how strongly each rule influences the result.">
                {PRIMARY_WEIGHTS.map(([k, label]) => (
                  <Weight key={k} label={label} value={cfg.softWeights?.[k] ?? 0}
                    onChange={(v) => setWeight(k, v)} />
                ))}
                <button type="button" className="btn btn-secondary btn-sm"
                  onClick={() => { setTab('optimiser'); setMore(true); }}
                  style={{ alignSelf: 'flex-start' }}>
                  <Icon name="chevronDown" size={14} /> Show more weights
                </button>
              </SetCard>
            </div>
          )}

          {/* ══ Period Grid ══════════════════════════════════════════════ */}
          {tab === 'grid' && (
            <>
              <GridEditor
                title={`Period Grid (${weekdayLabel})`}
                hint="The default grid for every section with no structure of its own. Only “Teaching” periods can hold a subject."
                rows={cfg.periodTemplate} cfg={cfg} set={set}
                onAuto={() => autoCalc('periodTemplate')}
                onChange={(i, patch) => setPeriod('periodTemplate', i, patch)}
                onRemove={(i) => removePeriod('periodTemplate', i)}
                onAdd={(t) => addPeriod('periodTemplate', t)} />

              {/* A Saturday grid is only meaningful on a Saturday the school is
                  open. With the day switched off, the editor is an invitation to
                  configure something that can never run. */}
              {saturdayOpen ? (
                <GridEditor
                  title="Saturday Grid (optional)"
                  hint="Leave this empty to reuse the weekday grid. Use it for a shorter or half-day Saturday."
                  rows={cfg.saturdayTemplate} cfg={cfg} set={set}
                  onAuto={() => autoCalc('saturdayTemplate')}
                  onChange={(i, patch) => setPeriod('saturdayTemplate', i, patch)}
                  onRemove={(i) => removePeriod('saturdayTemplate', i)}
                  onAdd={(t) => addPeriod('saturdayTemplate', t)} />
              ) : cfg.saturdayTemplate.length ? (
                // Hiding the editor must not strand the rows behind it: say they
                // are there, and offer the only action that makes sense.
                <Card icon="calendarDays" title="Saturday Grid"
                  subtitle="Saturday is not a working day, so this grid is never used."
                  actions={<Button size="sm" variant="secondary" onClick={() => set('saturdayTemplate', [])}>
                    <Icon name="trash" size={15} /> Remove it
                  </Button>}>
                  <Body>
                    <Note tone="warn">
                      A Saturday grid of {plural(cfg.saturdayTemplate.filter((x) => (x.periodType || 'Teaching') === 'Teaching').length, 'teaching period')} is
                      still saved. It is kept in case Saturday is switched back on — turn Saturday on
                      under Working Days to edit it, or remove it here.
                    </Note>
                  </Body>
                </Card>
              ) : (
                <Card icon="calendarDays" title="Saturday Grid"
                  subtitle="Nothing to set: Saturday is not a working day.">
                  <Body>
                    <Note tone="quiet">
                      Switch Saturday on under <strong>Working Days</strong> — or in{' '}
                      <a href="/admin/school-settings">School Settings</a> for the school as a whole —
                      and a grid for it appears here.
                    </Note>
                  </Body>
                </Card>
              )}
            </>
          )}

          {/* ══ Working Days ═════════════════════════════════════════════ */}
          {tab === 'days' && (
            <Card icon="calendarDays" title="Working Days"
              subtitle="Which days the school runs, and what each of them holds.">
              <Body>
                <DayPicker value={cfg.workingDays} onChange={(v) => set('workingDays', v)} big />
                <div style={{ marginTop: 18 }}>
                  <div className="tt-tablewrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
                    <table className="tt-table">
                      <thead>
                        <tr><th>Day</th><th>Runs</th><th>Grid used</th><th>Teaching periods</th><th>Day length</th></tr>
                      </thead>
                      <tbody>
                        {DAYS.map((d) => {
                          const on = cfg.workingDays.includes(d);
                          const sat = on && d === 'Saturday' && cfg.saturdayTemplate.length > 0;
                          const rows = sat ? cfg.saturdayTemplate : cfg.periodTemplate;
                          const teach = rows.filter((p) => (p.periodType || 'Teaching') === 'Teaching').length;
                          const first = rows[0];
                          const last = rows[rows.length - 1];
                          const mins = first && last
                            ? (toMinutes(last.endTime) || 0) - (toMinutes(first.startTime) || 0) : 0;
                          return (
                            <tr key={d} style={on ? undefined : { opacity: .5 }}>
                              <td><strong>{d}</strong></td>
                              <td>
                                <Chip tone={on ? 'green' : 'slate'} dot>{on ? 'Open' : 'Closed'}</Chip>
                              </td>
                              <td>
                                {!on ? <span className="tt-table__muted">—</span>
                                  : sat ? <Chip tone="amber">Saturday grid</Chip>
                                  : <Chip tone="indigo">Weekday grid</Chip>}
                              </td>
                              <td className="tt-num">{on ? teach : '—'}</td>
                              <td className="tt-table__muted">{on && mins > 0 ? duration(mins) : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
                <Note tone="info">
                  Whether Saturday runs at all — and which Saturdays — is a school-wide setting, not
                  a timetable one. Change it in <a href="/admin/school-settings">School Settings</a>;
                  sections closed on a day are excluded from it automatically.
                </Note>
              </Body>
            </Card>
          )}

          {/* ══ Constraints ══════════════════════════════════════════════ */}
          {tab === 'limits' && (
            <div className="tt-setgrid">
              <SetCard tone="green" icon="shieldCheck" title="Teacher Limits"
                hint="Never violated, whatever the optimiser weights say.">
                <div style={{ display: 'flex', gap: 12 }}>
                  <Field label="Max periods / day" hint="Per teacher, school default">
                    <input type="number" min="0" max="14" className="form-control"
                      value={cfg.defaults.maxTeacherPeriodsPerDay ?? ''}
                      onChange={(e) => setDefault('maxTeacherPeriodsPerDay', Number(e.target.value))} />
                  </Field>
                  <Field label="Max periods / week" hint="Per teacher, school default">
                    <input type="number" min="0" max="80" className="form-control"
                      value={cfg.defaults.maxTeacherPeriodsPerWeek ?? ''}
                      onChange={(e) => setDefault('maxTeacherPeriodsPerWeek', Number(e.target.value))} />
                  </Field>
                </div>
                <SwitchRow lead checked={cfg.defaults.hardTeacherDailyLimit !== false}
                  onChange={(v) => setDefault('hardTeacherDailyLimit', v)}
                  title="The daily limit is a hard rule"
                  hint="Off makes it something the optimiser aims for rather than something it must obey." />
                <Note tone="quiet">
                  An individual teacher’s own ceiling, set under Teacher Availability, always wins
                  over these defaults.
                </Note>
              </SetCard>

              <SetCard tone="indigo" icon="book" title="Subject &amp; Teacher Rules"
                hint="What may be placed where.">
                <SwitchRow lead checked={cfg.defaults.enforceTeacherQualified !== false}
                  onChange={(v) => setDefault('enforceTeacherQualified', v)}
                  title="Only assigned teachers may teach a subject"
                  hint="Off lets the solver put anybody in front of any class — useful only where subject assignments are not kept up to date." />
                <SwitchRow lead checked={!!cfg.allowSubjectsInActivity}
                  onChange={(v) => set('allowSubjectsInActivity', v)}
                  title="Allow subjects in “Activity” periods"
                  hint="Treats an Activity row as teachable rather than reserved." />
              </SetCard>

              <SetCard tone="amber" icon="alert" title="What is never negotiable"
                hint="These hold whatever else is configured.">
                <Check state="ok">One teacher, one place, one period</Check>
                <Check state="ok">One room, one class, one period</Check>
                <Check state="ok">One section, one lesson, one period</Check>
                <Check state="ok">A blocked availability slot is never used</Check>
                <Check state="ok">A blocked room slot is never used</Check>
                <Check state="ok">Nothing is placed outside a Teaching period</Check>
              </SetCard>
            </div>
          )}

          {/* ══ Optimiser ════════════════════════════════════════════════ */}
          {tab === 'optimiser' && (
            <Card icon="sliders" title="Optimiser Weights"
              subtitle="How hard the solver pushes on each soft rule once every hard rule holds. 0 switches one off.">
              <Body>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14 }}>
                  {(more ? WEIGHTS : PRIMARY_WEIGHTS).map(([k, label]) => (
                    <Weight key={k} label={label} value={cfg.softWeights?.[k] ?? 0}
                      onChange={(v) => setWeight(k, v)} />
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <Button size="sm" variant="secondary" onClick={() => setMore((m) => !m)}>
                    <Icon name={more ? 'arrowUp' : 'chevronDown'} size={14} />
                    {more ? ' Show the five that matter most' : ` Show all ${WEIGHTS.length} weights`}
                  </Button>
                </div>
                <Note tone="info">
                  Weights are trade-offs, not targets. Raising one does not guarantee it; it makes
                  the solver give up more elsewhere to get it.
                </Note>
              </Body>
            </Card>
          )}

          {/* ══ Advanced ═════════════════════════════════════════════════ */}
          {tab === 'advanced' && (
            <>
              <Card icon="gauge" title="Solver Budget"
                subtitle="How long the generator is allowed to think. Raise these for a very large school.">
                <Body>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
                    <Field label="Time budget (seconds)" hint="How long one attempt may run">
                      <input type="number" min="5" max="180" className="form-control"
                        value={Math.round((cfg.solver?.timeBudgetMs ?? 20000) / 1000)}
                        onChange={(e) => setSolver('timeBudgetMs', (Number(e.target.value) || 20) * 1000)} />
                    </Field>
                    <Field label="Restarts on failure" hint="Fresh attempts from a new random start">
                      <input type="number" min="1" max="10" className="form-control"
                        value={cfg.solver?.maxRestarts ?? 3}
                        onChange={(e) => setSolver('maxRestarts', e.target.value)} />
                    </Field>
                    <Field label="Optimisation rounds" hint="Improvement passes once a valid grid exists">
                      <input type="number" min="0" max="20000" className="form-control"
                        value={cfg.solver?.optimiseRounds ?? 2000}
                        onChange={(e) => setSolver('optimiseRounds', e.target.value)} />
                    </Field>
                  </div>
                </Body>
              </Card>

              <Card icon="save" title="Saved Rule Sets"
                subtitle="Keep a configuration you like and reload it next term."
                actions={<Button size="sm" variant="secondary" onClick={() => setTemplate({ name: '' })}>
                  <Icon name="plus" size={15} /> Save current as a rule set
                </Button>}>
                <Body>
                  {!cfg.ruleTemplates.length ? (
                    <Note tone="quiet">
                      No rule sets saved. One holds the optimiser weights, the hard limits and the
                      solver budget — not the period grid, which is per year.
                    </Note>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {cfg.ruleTemplates.map((t, i) => (
                        <div key={i} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px',
                          border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                        }}>
                          <Icon name="fileDoc" size={17} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <strong style={{ fontSize: '.88rem' }}>{t.name}</strong>
                            <div style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>
                              Saved {new Date(t.savedAt).toLocaleDateString('en-IN')}
                            </div>
                          </div>
                          <Button size="sm" variant="secondary" onClick={() => {
                            setCfg((c) => ({
                              ...c,
                              defaults: { ...c.defaults, ...(t.defaults || {}) },
                              softWeights: { ...c.softWeights, ...(t.softWeights || {}) },
                              solver: { ...c.solver, ...(t.solver || {}) },
                            }));
                            toast.success(`Loaded “${t.name}” — save to keep it`);
                          }}>Load</Button>
                          <Button size="sm" variant="danger" onClick={() => {
                            set('ruleTemplates', cfg.ruleTemplates.filter((_, k) => k !== i));
                          }}>
                            <Icon name="trash" size={14} />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </Body>
              </Card>

              <CarryForward years={years} currentYearId={yearId} />
            </>
          )}
        </div>

        {/* ── The rail ─────────────────────────────────────────────────── */}
        <div className="tt-rail">
          <Panel icon="lifebuoy" title="Configuration Tips">
            <Check state="ok">These settings shape everything the generator builds.</Check>
            <Check state="ok">Change them whenever you like — nothing published is touched.</Check>
            <Check state="ok">Press Save Configuration to apply them.</Check>
            <Check state="warn" hint="A weight of 10 on everything is the same as a weight of 1 on everything.">
              Use sensible weights for the best results.
            </Check>
            <Check state="ok">Hard limits are always respected, whatever the weights say.</Check>
          </Panel>

          <Panel icon="info" title="Current Configuration">
            <KV icon="calendar" k="Academic Year"
              v={years.find((y) => String(y._id) === yearId)?.yearName || '—'} />
            <KV icon="calendarDays" k="Working Days"
              v={cfg.workingDays.length
                ? `${DAY_SHORT[cfg.workingDays[0]]} – ${DAY_SHORT[cfg.workingDays[cfg.workingDays.length - 1]]}`
                : 'None'} />
            <KV icon="layers" k="Periods per day" v={teaching.length || '—'} />
            <KV icon="clock" k="Lunch after period" v={cfg.lunchAfterPeriod ?? '—'} />
            <KV icon="clock" k="Lunch duration"
              v={duration(lunchRow
                ? Math.max(0, (toMinutes(lunchRow.endTime) || 0) - (toMinutes(lunchRow.startTime) || 0))
                : (cfg.lunchMinutes ?? 30))} />
            <KV icon="user" k="Max per teacher (day)" v={cfg.defaults.maxTeacherPeriodsPerDay ?? '—'} />
            <KV icon="users" k="Max per teacher (week)" v={cfg.defaults.maxTeacherPeriodsPerWeek ?? '—'} />
            <KV icon="gauge" k="Solver budget"
              v={`${Math.round((cfg.solver?.timeBudgetMs ?? 20000) / 1000)}s`} />
          </Panel>

          {dirty && (
            <Note tone="warn">
              You have unsaved changes. Nothing takes effect until you press Save Configuration.
            </Note>
          )}

          <Panel icon="trash" title="Danger Zone" tone="danger">
            <span style={{ fontSize: '.82rem', color: 'var(--text-muted)' }}>
              Reset every value on this screen to its default. The period grid goes with it;
              published timetables do not.
            </span>
            <Button variant="danger" onClick={() => setReset(true)}>
              <Icon name="refresh" size={15} /> Reset to Default Configuration
            </Button>
          </Panel>
        </div>
      </div>

      <Confirm open={reset} onClose={() => setReset(false)} title="Reset the configuration"
        message="Every setting on this screen goes back to its default, including the period grid. Published timetables are not touched. This is not saved until you press Save Configuration."
        confirmLabel="Reset it"
        onConfirm={() => {
          setCfg((c) => ({
            ...c,
            workingDays: DAYS.slice(0, 5),
            periodTemplate: [], saturdayTemplate: [],
            allowSubjectsInActivity: false,
            includeAssembly: false, autoBreaks: true,
            lunchAfterPeriod: 4, lunchMinutes: 30,
            dayStartsAt: '08:00', dayEndsAt: '14:00',
            defaults: {
              maxTeacherPeriodsPerDay: 6, maxTeacherPeriodsPerWeek: 30,
              enforceTeacherQualified: true, hardTeacherDailyLimit: true,
            },
            softWeights: Object.fromEntries(WEIGHTS.map(([k]) => [k, 3])),
            solver: { timeBudgetMs: 20000, maxRestarts: 3, optimiseRounds: 2000 },
          }));
          setReset(false);
          toast('Reset — press Save Configuration to keep it', { icon: 'ℹ️' });
        }} />

      <Modal open={!!template} onClose={() => setTemplate(null)} maxWidth={420} title="Save this rule set"
        footer={<>
          <Button variant="secondary" onClick={() => setTemplate(null)}>Cancel</Button>
          <Button disabled={!template?.name.trim()} onClick={() => {
            set('ruleTemplates', [...cfg.ruleTemplates, {
              name: template.name.trim(),
              savedAt: new Date().toISOString(),
              defaults: cfg.defaults,
              softWeights: cfg.softWeights,
              solver: cfg.solver,
            }].slice(-25));
            setTemplate(null);
            toast.success('Added — press Save Configuration to keep it');
          }}>Save</Button>
        </>}>
        <Field label="Name it" hint="e.g. “Exam term”, “Normal term”, “Half-day Saturdays”">
          <input className="form-control" value={template?.name || ''} maxLength={60} autoFocus
            onChange={(e) => setTemplate({ name: e.target.value })} />
        </Field>
      </Modal>
    </div>
  );
}

/* ── The day picker, shared by two tabs ────────────────────────────────────── */
function DayPicker({ value, onChange, big }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {DAYS.concat('Sunday').map((d) => {
        const on = value.includes(d);
        return (
          <button key={d} type="button"
            onClick={() => onChange(on
              ? value.filter((x) => x !== d)
              // Kept in week order however they are clicked, so "Mon – Fri"
              // never reads as "Fri – Mon" in the summary.
              : [...DAYS.concat('Sunday').filter((x) => value.includes(x) || x === d)])}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: big ? '12px 18px' : '9px 14px', borderRadius: 10,
              border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
              background: on ? 'var(--primary)' : 'var(--bg-card)',
              color: on ? '#fff' : 'var(--text-muted)',
              fontSize: '.85rem', fontWeight: 600, cursor: 'pointer',
            }}>
            <Icon name={on ? 'checkCircle' : 'closeCircle'} size={15} />
            {DAY_SHORT[d] || d.slice(0, 3)}
          </button>
        );
      })}
    </div>
  );
}

/* ── One period-grid editor ────────────────────────────────────────────────── */
function GridEditor({ title, hint, rows, cfg, set, onAuto, onChange, onRemove, onAdd }) {
  const teaching = rows.filter((p) => (p.periodType || 'Teaching') === 'Teaching').length;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const span = first && last ? (toMinutes(last.endTime) || 0) - (toMinutes(first.startTime) || 0) : 0;

  return (
    <Card icon="clock" title={title} subtitle={hint}
      actions={<>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
          <Field label="Periods">
            <input type="number" min="1" max="14" className="form-control" style={{ width: 84 }}
              value={cfg.autoPeriods ?? 8}
              onChange={(e) => set('autoPeriods', Number(e.target.value))} />
          </Field>
          <Button size="sm" variant="secondary" onClick={onAuto}>
            <Icon name="wand" size={15} /> Auto-calculate
          </Button>
        </div>
      </>}>
      <Body>
        <div className="tt-tablewrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' }}>
          <table className="tt-table">
            <thead>
              <tr><th style={{ width: 90 }}>#</th><th>Starts</th><th>Ends</th>
                <th style={{ width: 150 }}>Type</th><th>Label</th><th style={{ width: 52 }} /></tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const isTeaching = (p.periodType || 'Teaching') === 'Teaching';
                return (
                  <tr key={i} className={isTeaching ? '' : 'is-break'}>
                    <td>
                      {isTeaching
                        ? <input type="number" min="1" className="form-control" style={{ width: 70 }}
                            value={p.periodNumber}
                            onChange={(e) => onChange(i, { periodNumber: Number(e.target.value) || 0 })} />
                        : <Chip tone="amber">{p.periodType}</Chip>}
                    </td>
                    <td><input type="time" className="form-control" value={p.startTime || ''}
                      onChange={(e) => onChange(i, { startTime: e.target.value })} /></td>
                    <td><input type="time" className="form-control" value={p.endTime || ''}
                      onChange={(e) => onChange(i, { endTime: e.target.value })} /></td>
                    <td>
                      <select className="form-control" value={p.periodType}
                        onChange={(e) => onChange(i, { periodType: e.target.value })}>
                        {PERIOD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td><input className="form-control" value={p.label || ''} placeholder={p.periodType}
                      onChange={(e) => onChange(i, { label: e.target.value })} /></td>
                    <td>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => onRemove(i)}
                        aria-label="Remove this row">
                        <Icon name="trash" size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!rows.length && (
                <tr><td colSpan={6}>
                  <div className="tt-table__empty">
                    <strong>No periods here</strong>
                    <span>Auto-calculate them, or add rows one at a time.</span>
                  </div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {['Teaching', 'Break', 'Lunch', 'Assembly', 'Activity'].map((t) => (
            <Button key={t} size="sm" variant="secondary" onClick={() => onAdd(t)}>+ {t}</Button>
          ))}
          {rows.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '.8rem', color: 'var(--text-muted)' }}>
              {plural(teaching, 'teaching period')}
              {span > 0 && ` · ${timeRange(first.startTime, last.endTime)} · ${duration(span)}`}
            </span>
          )}
        </div>
      </Body>
    </Card>
  );
}

/* ── Carry a year's plan into the next one ─────────────────────────────────── */
function CarryForward({ years, currentYearId }) {
  const [from, setFrom] = useState(currentYearId || '');
  const [to, setTo]     = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => { setFrom(currentYearId || ''); }, [currentYearId]);

  const run = async (apply) => {
    if (!from || !to) return toast.error('Pick both years');
    setBusy(true);
    try {
      const d = unwrap(await api.carryForward({ fromYearId: from, toYearId: to, ...(apply ? { apply: true } : {}) }));
      setPreview(d);
      if (apply) { toast.success('Plan carried forward'); setConfirm(false); }
    } catch (e) { toast.error(e.message); setConfirm(false); }
    finally { setBusy(false); }
  };

  return (
    <Card icon="repeat" title="Start a Year From Another Year"
      subtitle="Copies the subject requirements, combined classes, period grid and solver settings across.">
      <Body>
        <Note tone="info">
          Sections are matched by class and section name — 9-A of last year and 9-A of this year are
          different records describing the same room of children. The <strong>placements are not
          copied</strong>: you still generate, so the schedule fits this year’s staff.
        </Note>

        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap', margin: '14px 0' }}>
          <Field label="Copy from">
            <select className="form-control" value={from}
              onChange={(e) => { setFrom(e.target.value); setPreview(null); }}>
              <option value="">Choose…</option>
              {years.map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
            </select>
          </Field>
          <Field label="Into">
            <select className="form-control" value={to}
              onChange={(e) => { setTo(e.target.value); setPreview(null); }}>
              <option value="">Choose…</option>
              {years.filter((y) => String(y._id) !== String(from))
                .map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
            </select>
          </Field>
          <Button variant="secondary" loading={busy} disabled={!from || !to} onClick={() => run(false)}>
            Check what would move
          </Button>
        </div>

        {preview && !preview.applied && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Note tone="info">
              <strong>{plural(preview.sections.length, 'section')} matched</strong> between{' '}
              {preview.fromYear} and {preview.toYear}.
            </Note>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Chip tone="indigo">{plural(preview.requirements, 'subject requirement')}</Chip>
              <Chip tone="violet">{plural(preview.merges, 'combined class', 'combined classes')}</Chip>
              <Chip tone="blue">{plural(preview.periodStructures, 'period grid')}</Chip>
            </div>
            {preview.unmatchedSections?.length > 0 && (
              <Note tone="warn">
                No match in {preview.toYear} for: {preview.unmatchedSections.join(', ')}. Create
                those sections first if they should carry across.
              </Note>
            )}
            {preview.mergesDropped > 0 && (
              <Note tone="warn">
                {plural(preview.mergesDropped, 'combined class')} dropped — not all of its sections
                exist in {preview.toYear}.
              </Note>
            )}
            <div>
              <Button variant="danger" onClick={() => setConfirm(true)}
                disabled={!preview.requirements && !preview.merges}>
                Carry it forward
              </Button>
            </div>
          </div>
        )}

        {preview?.applied && (
          <Note tone="good">
            Carried {plural(preview.requirements, 'requirement')},{' '}
            {plural(preview.merges, 'combined class', 'combined classes')} and{' '}
            {plural(preview.periodStructures, 'period grid')} into {preview.toYear}. Generate when
            you are ready.
          </Note>
        )}

        <Confirm open={confirm} onClose={() => setConfirm(false)} title="Replace the target year’s plan?"
          message={`Any subject requirements and combined classes already set up in ${preview?.toYear} are replaced by ${preview?.fromYear}'s. Published timetables are not touched.`}
          loading={busy} confirmLabel="Carry forward" onConfirm={() => run(true)} />
      </Body>
    </Card>
  );
}
