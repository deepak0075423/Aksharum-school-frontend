/**
 * Admin → Timetable → Teacher Availability.
 *
 * What the generator is not allowed to do with a person: the slots they cannot
 * teach, the ceiling on their day and their week, and the days and periods they
 * would rather have. Blocked slots are hard rules; preferences are what the
 * optimiser pursues once the hard rules hold.
 *
 * The list is the staff; the rail is whoever is selected, with their week drawn
 * as a grid of slots you click. Editing in place rather than behind a dialog is
 * deliberate — an admin setting availability is comparing one teacher against
 * the others, and a modal hides exactly the list they are comparing with.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { Button, Modal } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  TtHead, YearPicker, Card, Body, Filters, Pick, Field, Search, Seg, Stats, Stat,
  Panel, KV, Chip, Note, Person, Avatar, Bar, Loading, Pager, SwitchRow, CheckRow,
  plural, fmtDay, toneFor,
} from './ttUI';
import { DAYS, DAY_SHORT } from './shared';

const unwrap = (res) => res?.data ?? res;
const PAGE = 10;

const AVAIL_META = {
  always:     { label: 'Always available', tone: 'green' },
  restricted: { label: 'With restrictions', tone: 'amber' },
  none:       { label: 'Unavailable', tone: 'red' },
};
const STATUS_META = {
  active:      { label: 'Active', tone: 'green' },
  restricted:  { label: 'Restricted', tone: 'amber' },
  overloaded:  { label: 'Overloaded', tone: 'red' },
  unavailable: { label: 'Unavailable', tone: 'red' },
};

/** A teacher as the editor holds them — the saved row plus the unsaved edits. */
const draftOf = (t) => ({
  _id: t._id,
  unavailable: [...(t.unavailable || [])],
  maxPeriodsPerDay: t.maxPeriodsPerDay ?? '',
  maxPeriodsPerWeek: t.maxPeriodsPerWeek ?? '',
  hardDailyLimit: t.hardDailyLimit !== false,
  preferredDays: [...(t.preferredDays || [])],
  preferredPeriods: [...(t.preferredPeriods || [])],
  notes: t.notes || '',
});

export default function TimetableAvailability() {
  const [data, setData]     = useState(null);
  const [years, setYears]   = useState([]);
  const [yearId, setYearId] = useState('');
  const [loading, setLoad]  = useState(true);
  const [avail, setAvail]   = useState('');
  const [subject, setSubject] = useState('');
  const [q, setQ]           = useState('');
  const [page, setPage]     = useState(1);
  const [pickedId, setPicked] = useState('');
  const [draft, setDraft]   = useState(null);
  const [tab, setTab]       = useState('availability');
  const [saving, setSaving] = useState(false);
  const [bulk, setBulk]     = useState(null);
  const [importing, setImp] = useState(null);
  const [params, setParams] = useSearchParams();
  const deepLinked = useRef(false);

  const load = useCallback(async (yid) => {
    setLoad(true);
    try {
      const [aRes, mRes] = await Promise.all([
        api.getAvailabilityOverview(yid),
        years.length ? null : api.getMeta(yid),
      ]);
      const d = unwrap(aRes);
      setData(d);
      if (!yid) setYearId(String(d.selectedYearId || ''));
      if (mRes) setYears(unwrap(mRes).years || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoad(false); }
  }, [years.length]);

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const teachers = data?.teachers || [];
  const days = data?.days?.length ? data.days : DAYS.slice(0, 5);
  const periodCount = data?.periodsPerDay || 8;
  const periods = useMemo(() => Array.from({ length: periodCount }, (_, i) => i + 1), [periodCount]);

  const allSubjects = useMemo(() => {
    const set = new Set();
    for (const t of teachers) for (const s of t.subjects) set.add(s);
    return [...set].sort();
  }, [teachers]);

  const filtered = useMemo(() => teachers.filter((t) => {
    if (avail && t.availability !== avail) return false;
    if (subject && !t.subjects.includes(subject)) return false;
    if (q) {
      const needle = q.toLowerCase();
      if (![t.name, t.designation, ...t.subjects].join(' ').toLowerCase().includes(needle)) return false;
    }
    return true;
  }), [teachers, avail, subject, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);
  const picked = teachers.find((t) => String(t._id) === String(pickedId)) || null;

  // ?teacher=<id> opens that teacher — the generator's problem cards link here
  // when somebody has more periods than free time.
  useEffect(() => {
    const wanted = params.get('teacher');
    if (!wanted || deepLinked.current || !teachers.length) return;
    deepLinked.current = true;
    const t = teachers.find((x) => String(x._id) === wanted);
    if (t) select(t);
    setParams({}, { replace: true });
  }, [teachers]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!picked && shown.length) select(shown[0]);
  }, [shown, picked]); // eslint-disable-line react-hooks/exhaustive-deps

  function select(t) {
    setPicked(String(t._id));
    setDraft(draftOf(t));
  }

  const dirty = useMemo(() => {
    if (!picked || !draft) return false;
    return JSON.stringify(draftOf(picked)) !== JSON.stringify(draft);
  }, [picked, draft]);

  const blockedAt = (day, period) =>
    !!draft?.unavailable.some((u) => u.dayOfWeek === day && u.periodNumber === period);

  const toggleSlot = (day, period) => setDraft((d) => ({
    ...d,
    unavailable: blockedAt(day, period)
      ? d.unavailable.filter((u) => !(u.dayOfWeek === day && u.periodNumber === period))
      : [...d.unavailable, { dayOfWeek: day, periodNumber: period, reason: '' }],
  }));

  const toggleDay = (day) => setDraft((d) => {
    const allBlocked = periods.every((p) => d.unavailable.some((u) => u.dayOfWeek === day && u.periodNumber === p));
    return {
      ...d,
      unavailable: allBlocked
        ? d.unavailable.filter((u) => u.dayOfWeek !== day)
        : [...d.unavailable.filter((u) => u.dayOfWeek !== day),
           ...periods.map((p) => ({ dayOfWeek: day, periodNumber: p, reason: '' }))],
    };
  });

  const save = async () => {
    setSaving(true);
    try {
      await api.saveAvailability(draft._id, {
        yearId,
        unavailable: draft.unavailable,
        maxPeriodsPerDay: draft.maxPeriodsPerDay === '' ? null : Number(draft.maxPeriodsPerDay),
        maxPeriodsPerWeek: draft.maxPeriodsPerWeek === '' ? null : Number(draft.maxPeriodsPerWeek),
        hardDailyLimit: draft.hardDailyLimit,
        preferredDays: draft.preferredDays,
        preferredPeriods: draft.preferredPeriods,
        notes: draft.notes,
      });
      toast.success(`Saved for ${picked.name}`);
      await load(yearId || undefined);
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const s = data?.summary || {};

  return (
    <div className="page tt-page">
      <TtHead icon="users" title="Teacher Availability"
        subtitle="Define when teachers are available, set blocked slots, workload limits and subject preferences.">
        <Button variant="secondary" onClick={() => setImp({ from: '', to: '', found: null, busy: false })}>
          <Icon name="upload" size={16} /> Import from leave
        </Button>
        <Button onClick={() => setBulk({ ids: [], maxPeriodsPerDay: '', maxPeriodsPerWeek: '', clearBlocks: false })}>
          <Icon name="users" size={16} /> Bulk Update
        </Button>
      </TtHead>

      <Stats cols={5}>
        <Stat icon="users" tone="indigo" value={s.total ?? '—'} label="Total Teachers" />
        <Stat icon="checkCircle" tone="green" value={s.always ?? '—'} label="Always Available"
          cap={`${s.total ? Math.round((s.always / s.total) * 100) : 0}% of staff`} />
        <Stat icon="clock" tone="amber" value={s.restricted ?? '—'} label="With Restrictions"
          cap={`${s.total ? Math.round((s.restricted / s.total) * 100) : 0}% of staff`} />
        <Stat icon="closeCircle" tone="red" value={s.none ?? '—'} label="Not Available"
          cap={`${s.total ? Math.round((s.none / s.total) * 100) : 0}% of staff`} />
        <Stat icon="chart" tone="blue" value={`${s.averageLoad ?? 0}`} label="Average Load"
          cap={data?.weekCap ? `periods/week · target ≤ ${data.weekCap}` : 'periods a week'} />
      </Stats>

      <div className="tt-split tt-split--wide">
        <Card flush>
          <Filters>
            <div className="tt-field tt-field--fix">
              <label>Academic Year</label>
              <select className="form-control" value={yearId}
                onChange={(e) => { setYearId(e.target.value); load(e.target.value); }}>
                {years.map((y) => (
                  <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (Active)' : ''}</option>
                ))}
              </select>
            </div>
            <Pick label="Availability" value={avail} onChange={(v) => { setAvail(v); setPage(1); }} allLabel="All">
              <option value="always">Always available</option>
              <option value="restricted">With restrictions</option>
              <option value="none">Unavailable</option>
            </Pick>
            <Pick label="Subject" value={subject} onChange={(v) => { setSubject(v); setPage(1); }} allLabel="All Subjects">
              {allSubjects.map((x) => <option key={x} value={x}>{x}</option>)}
            </Pick>
            <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search teachers…" />
          </Filters>

          {loading ? <Loading label="Reading the staff list…" /> : (
            <>
              <div className="tt-tablewrap">
                <table className="tt-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }} />
                      <th>Teacher</th><th>Subjects</th><th>Availability</th>
                      <th style={{ minWidth: 150 }}>Workload</th><th>Status</th>
                      <th style={{ width: 90 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((t) => {
                      const on = String(t._id) === String(pickedId);
                      const am = AVAIL_META[t.availability] || AVAIL_META.always;
                      const sm = STATUS_META[t.status] || STATUS_META.active;
                      return (
                        <tr key={t._id} className={`is-pick${on ? ' is-on' : ''}`} onClick={() => select(t)}>
                          <td onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" checked={on} onChange={() => select(t)}
                              style={{ accentColor: 'var(--primary)' }} aria-label={`Select ${t.name}`} />
                          </td>
                          <td><Person name={t.name} sub={t.designation} /></td>
                          <td>
                            <span className="tt-chiprow">
                              {t.subjects.slice(0, 2).map((x) => <Chip key={x} tone={toneFor(x)}>{x}</Chip>)}
                              {t.subjects.length > 2 && <Chip tone="slate">+{t.subjects.length - 2}</Chip>}
                              {!t.subjects.length && <span className="tt-table__muted">No subjects assigned</span>}
                            </span>
                          </td>
                          <td>
                            <Chip tone={am.tone}>
                              {t.availability === 'restricted'
                                ? plural(t.blockedCount, 'blocked slot')
                                : am.label}
                            </Chip>
                          </td>
                          <td>
                            <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                                {t.periods} / {t.cap || '—'}
                              </span>
                              <Bar value={t.periods} max={t.cap || 1} showPct={false} />
                            </span>
                          </td>
                          <td><Chip tone={sm.tone} dot>{sm.label}</Chip></td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <Button size="sm" variant="secondary" onClick={() => { select(t); setTab('availability'); }}>
                              <Icon name="pencil" size={14} />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                    {!filtered.length && (
                      <tr><td colSpan={7}>
                        <div className="tt-table__empty">
                          <strong>No teacher matches that</strong>
                          <span>Clear the filters, or widen the subject.</span>
                        </div>
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="tt-card__foot">
                <span className="tt-count">
                  {picked ? `${picked.name} selected` : 'Nobody selected'} · {plural(filtered.length, 'teacher')}
                </span>
                <Pager page={page} pages={pages} onPage={setPage} />
              </div>
            </>
          )}
        </Card>

        <div className="tt-rail">
          {!picked ? (
            <Panel icon="user" title="Nobody selected">
              <Note tone="quiet">Pick a teacher to set their week.</Note>
            </Panel>
          ) : (
            <Panel icon="user" title={null} right={null}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Avatar name={picked.name} lg />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ fontSize: '.98rem' }}>{picked.name}</strong>
                  <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
                    {picked.subjects.join(', ') || 'No subjects assigned'}
                  </div>
                </div>
                <Chip tone={(STATUS_META[picked.status] || STATUS_META.active).tone} dot>
                  {(STATUS_META[picked.status] || STATUS_META.active).label}
                </Chip>
              </div>

              <Seg quiet value={tab} onChange={setTab} options={[
                ['availability', 'Availability'], ['subjects', 'Subjects'], ['settings', 'Settings'],
              ]} />

              {tab === 'availability' && draft && (
                <>
                  <div>
                    <strong style={{ fontSize: '.88rem' }}>Weekly Availability</strong>
                    <div style={{ fontSize: '.76rem', color: 'var(--text-muted)' }}>
                      Click a slot to block it. Blocked slots are a hard rule — the generator never uses them.
                    </div>
                  </div>
                  <div className="tt-slotkey">
                    <span><i style={{ background: '#22c55e' }} />Available</span>
                    <span><i style={{ background: '#ef4444' }} />Blocked</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tt-slots">
                      <thead>
                        <tr>
                          <th />
                          {days.map((d) => (
                            <th key={d}>
                              <button type="button" onClick={() => toggleDay(d)} title={`Block or clear all of ${d}`}
                                style={{ background: 'none', border: 0, font: 'inherit', color: 'inherit', cursor: 'pointer' }}>
                                {DAY_SHORT[d] || d.slice(0, 3)}
                              </button>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {periods.map((p) => (
                          <tr key={p}>
                            <td>P{p}</td>
                            {days.map((d) => {
                              const off = blockedAt(d, p);
                              return (
                                <td key={d}>
                                  <button type="button" onClick={() => toggleSlot(d, p)}
                                    className={`tt-slot tt-slot--${off ? 'blocked' : 'free'}`}
                                    title={`${d} period ${p} — ${off ? 'blocked' : 'available'}`}>
                                    {off ? '✕' : '✓'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ display: 'flex', gap: 12 }}>
                    <Field label="Daily limit" hint="periods per day">
                      <input type="number" min="0" max="14" className="form-control" value={draft.maxPeriodsPerDay}
                        placeholder="Default"
                        onChange={(e) => setDraft((d) => ({ ...d, maxPeriodsPerDay: e.target.value }))} />
                    </Field>
                    <Field label="Weekly limit" hint="periods per week">
                      <input type="number" min="0" max="80" className="form-control" value={draft.maxPeriodsPerWeek}
                        placeholder="Default"
                        onChange={(e) => setDraft((d) => ({ ...d, maxPeriodsPerWeek: e.target.value }))} />
                    </Field>
                  </div>

                  <Field label="Notes" hint={`${draft.notes.length}/200`}>
                    <textarea className="form-control" rows={2} maxLength={200} value={draft.notes}
                      placeholder="e.g. available for senior classes only."
                      onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                  </Field>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <Button variant="secondary" onClick={() => setDraft(draftOf(picked))} disabled={!dirty}>Reset</Button>
                    <Button onClick={save} loading={saving} disabled={!dirty}>Save Changes</Button>
                  </div>
                </>
              )}

              {tab === 'subjects' && (
                <>
                  <KV icon="book" k="Subjects taught"
                    v={picked.subjects.length ? picked.subjects.join(', ') : 'None assigned'} />
                  <KV icon="briefcase" k="Designation" v={picked.designation} />
                  <KV icon="building" k="Department" v={picked.department || 'Not recorded'} />
                  <KV icon="calendarDays" k="Timetabled this week" v={plural(picked.periods, 'period')} />
                  <KV icon="clock" k="Blocked slots" v={plural(picked.blockedCount, 'slot')} />
                  <Note tone="quiet">
                    Subjects come from the sections a teacher is assigned to. Change them on the
                    section’s own page, not here.
                  </Note>
                </>
              )}

              {tab === 'settings' && draft && (
                <>
                  <SwitchRow lead checked={draft.hardDailyLimit}
                    onChange={(v) => setDraft((d) => ({ ...d, hardDailyLimit: v }))}
                    title="The daily limit is a hard rule"
                    hint="Off makes it something the optimiser aims for rather than something it must obey." />
                  <Field label="Preferred days" hint="The optimiser favours these once every hard rule holds.">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {DAYS.map((d) => {
                        const on = draft.preferredDays.includes(d);
                        return (
                          <button key={d} type="button" className={`btn btn-${on ? 'primary' : 'secondary'} btn-sm`}
                            onClick={() => setDraft((x) => ({
                              ...x,
                              preferredDays: on ? x.preferredDays.filter((v) => v !== d) : [...x.preferredDays, d],
                            }))}>
                            {DAY_SHORT[d]}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <Field label="Preferred periods">
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {periods.map((p) => {
                        const on = draft.preferredPeriods.includes(p);
                        return (
                          <button key={p} type="button" className={`btn btn-${on ? 'primary' : 'secondary'} btn-sm`}
                            onClick={() => setDraft((x) => ({
                              ...x,
                              preferredPeriods: on ? x.preferredPeriods.filter((v) => v !== p) : [...x.preferredPeriods, p],
                            }))}>
                            P{p}
                          </button>
                        );
                      })}
                    </div>
                  </Field>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                    <Button variant="secondary" onClick={() => setDraft(draftOf(picked))} disabled={!dirty}>Reset</Button>
                    <Button onClick={save} loading={saving} disabled={!dirty}>Save Changes</Button>
                  </div>
                </>
              )}
            </Panel>
          )}
        </div>
      </div>

      {bulk && (
        <BulkModal state={bulk} setState={setBulk} teachers={filtered} yearId={yearId}
          onDone={() => { setBulk(null); load(yearId || undefined); }} />
      )}
      {importing && (
        <ImportModal state={importing} setState={setImp} yearId={yearId}
          onDone={() => { setImp(null); load(yearId || undefined); }} />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Bulk update — the same ceiling across many teachers
══════════════════════════════════════════════════════════════════════════ */

function BulkModal({ state, setState, teachers, yearId, onDone }) {
  const [saving, setSaving] = useState(false);
  const toggle = (id) => setState((s) => ({
    ...s, ids: s.ids.includes(id) ? s.ids.filter((x) => x !== id) : [...s.ids, id],
  }));

  const run = async () => {
    if (!state.ids.length) return toast.error('Pick at least one teacher');
    setSaving(true);
    let done = 0;
    for (const id of state.ids) {
      const t = teachers.find((x) => String(x._id) === String(id));
      if (!t) continue;
      try {
        await api.saveAvailability(id, {
          yearId,
          // Blocked slots are per person and a bulk edit must not silently wipe
          // them — they are only cleared when that is explicitly what was asked.
          unavailable: state.clearBlocks ? [] : (t.unavailable || []),
          maxPeriodsPerDay: state.maxPeriodsPerDay === '' ? t.maxPeriodsPerDay : Number(state.maxPeriodsPerDay),
          maxPeriodsPerWeek: state.maxPeriodsPerWeek === '' ? t.maxPeriodsPerWeek : Number(state.maxPeriodsPerWeek),
          hardDailyLimit: t.hardDailyLimit,
          preferredDays: t.preferredDays,
          preferredPeriods: t.preferredPeriods,
          notes: t.notes,
        });
        done += 1;
      } catch { /* reported in the total below */ }
    }
    setSaving(false);
    toast[done === state.ids.length ? 'success' : 'error'](
      `Updated ${done} of ${plural(state.ids.length, 'teacher')}`,
    );
    onDone();
  };

  return (
    <Modal open onClose={() => setState(null)} maxWidth={620} title="Bulk update availability"
      footer={<>
        <Button variant="secondary" onClick={() => setState(null)}>Cancel</Button>
        <Button onClick={run} loading={saving} disabled={!state.ids.length}>
          Update {plural(state.ids.length, 'teacher')}
        </Button>
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Note tone="info">
          Leave a limit blank to leave it as it is. Blocked slots are kept unless you say otherwise.
        </Note>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="Daily limit">
            <input type="number" min="0" max="14" className="form-control" value={state.maxPeriodsPerDay}
              placeholder="Unchanged"
              onChange={(e) => setState((s) => ({ ...s, maxPeriodsPerDay: e.target.value }))} />
          </Field>
          <Field label="Weekly limit">
            <input type="number" min="0" max="80" className="form-control" value={state.maxPeriodsPerWeek}
              placeholder="Unchanged"
              onChange={(e) => setState((s) => ({ ...s, maxPeriodsPerWeek: e.target.value }))} />
          </Field>
        </div>
        <CheckRow checked={state.clearBlocks} onChange={(v) => setState((s) => ({ ...s, clearBlocks: v }))}>
          Also clear every blocked slot for these teachers
        </CheckRow>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <strong style={{ fontSize: '.88rem' }}>Who to update</strong>
            <button type="button" className="btn btn-secondary btn-sm"
              onClick={() => setState((s) => ({
                ...s, ids: s.ids.length === teachers.length ? [] : teachers.map((t) => String(t._id)),
              }))}>
              {state.ids.length === teachers.length ? 'Clear all' : 'Select all'}
            </button>
            <span className="tt-count" style={{ marginLeft: 'auto' }}>{state.ids.length} selected</span>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 6,
            maxHeight: 260, overflowY: 'auto', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', padding: 10,
          }}>
            {teachers.map((t) => (
              <CheckRow key={t._id} checked={state.ids.includes(String(t._id))}
                onChange={() => toggle(String(t._id))}>
                {t.name}
              </CheckRow>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Import from approved leave
══════════════════════════════════════════════════════════════════════════ */

function ImportModal({ state, setState, yearId, onDone }) {
  const [busy, setBusy] = useState(false);

  const run = async (apply) => {
    setBusy(true);
    try {
      const d = unwrap(await api.importAvailability({
        yearId, from: state.from || undefined, to: state.to || undefined, apply,
      }));
      if (apply) {
        toast.success(`${plural(d.changed, 'weekday pattern')} blocked`);
        onDone();
      } else {
        setState((s) => ({ ...s, found: d.found, range: { from: d.from, to: d.to } }));
      }
    } catch (e) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal open onClose={() => setState(null)} maxWidth={560} title="Block slots from approved leave"
      footer={<>
        <Button variant="secondary" onClick={() => setState(null)}>Cancel</Button>
        {state.found?.length > 0 && (
          <Button variant="danger" loading={busy} onClick={() => run(true)}>
            Block {plural(state.found.length, 'pattern')}
          </Button>
        )}
      </>}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Note tone="info">
          Availability is a weekly pattern; leave is a range of dates. What maps between them is a
          teacher who is away the <strong>same weekday, repeatedly</strong> — a Tuesday course, a
          standing commitment. This finds those and offers to block that weekday.
        </Note>
        <div style={{ display: 'flex', gap: 12 }}>
          <Field label="From">
            <input type="date" className="form-control" value={state.from}
              onChange={(e) => setState((s) => ({ ...s, from: e.target.value, found: null }))} />
          </Field>
          <Field label="To">
            <input type="date" className="form-control" value={state.to}
              onChange={(e) => setState((s) => ({ ...s, to: e.target.value, found: null }))} />
          </Field>
          <div style={{ alignSelf: 'flex-end' }}>
            <Button variant="secondary" loading={busy} onClick={() => run(false)}>Check</Button>
          </div>
        </div>

        {state.found && (state.found.length ? (
          <div className="tt-tablewrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
            <table className="tt-table">
              <thead><tr><th>Teacher</th><th>Weekday</th><th>Days away</th></tr></thead>
              <tbody>
                {state.found.map((f) => (
                  <tr key={`${f.teacher}${f.dayOfWeek}`}>
                    <td>{f.name}</td>
                    <td><Chip tone="amber">{f.dayOfWeek}</Chip></td>
                    <td className="tt-num">{f.days}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Note tone="quiet">
            No repeating weekday absence in that range. Nothing would change.
          </Note>
        ))}
      </div>
    </Modal>
  );
}
