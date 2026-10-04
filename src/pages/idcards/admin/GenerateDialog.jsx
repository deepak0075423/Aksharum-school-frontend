/**
 * Generate ID cards (Oct 2026) — the office's one way to issue cards, for one
 * person or a whole school:
 *
 *   1  Who     students of an academic year (all of them, chosen classes,
 *              chosen sections, or the rows ticked on the list) — or teachers,
 *              staff, parents (everyone without a card, or the ticked rows)
 *   2  Check   the server's plan: how many cards, who is skipped and why,
 *              who has no photo or no ID number on record
 *   3  Done    what was issued, and the way straight to printing them
 *
 * Nobody who already holds a card in force is ever given a second one: the
 * server skips them (services/idCardService.issue).
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { previewIdCards, generateIdCards, getIdCardList } from '../../../api/idcards.api';
import { Btn, Ico, Switch, Note, Spin, Select } from '../icUI';
import { KIND, count, errorText, plural } from '../icMeta';
import { Dialog } from './dialogs';

const STEPS = ['Who', 'Check', 'Done'];

function Steps({ at }) {
  return (
    <ol className="ic-steps" aria-label="Steps">
      {STEPS.map((s, i) => (
        <li key={s} className={i < at ? 'is-done' : i === at ? 'is-on' : ''}>
          <span>{i < at ? <Ico name="check" size={13} /> : i + 1}</span>{s}
        </li>
      ))}
    </ol>
  );
}

function Choice({ on, onPick, icon, title, sub, disabled }) {
  return (
    <button type="button" className={`ic-choice${on ? ' is-on' : ''}`} onClick={onPick} disabled={disabled} aria-pressed={on}>
      <span className="ic-choice__mark"><Ico name={icon} size={18} /></span>
      <span className="ic-choice__text"><strong>{title}</strong>{sub ? <em>{sub}</em> : null}</span>
      <span className="ic-choice__dot" aria-hidden />
    </button>
  );
}

function Chips({ items, value, onChange }) {
  const set = new Set(value);
  return (
    <div className="ic-chips">
      {items.map((it) => (
        <button key={it.value} type="button" className={set.has(it.value) ? 'is-on' : ''}
          onClick={() => onChange(set.has(it.value) ? value.filter((v) => v !== it.value) : [...value, it.value])}>
          {set.has(it.value) ? <Ico name="check" size={13} /> : null}{it.label}
        </button>
      ))}
    </div>
  );
}

function PeopleList({ title, list, total, tone = 'amber', icon = 'alert' }) {
  if (!total) return null;
  return (
    <details className={`ic-plist ic-t-${tone}`}>
      <summary><Ico name={icon} size={16} /><span>{title}</span><b>{count(total)}</b><Ico name="chevronDown" size={15} /></summary>
      <ul>
        {list.map((p) => <li key={p.holder}><span>{p.name}</span>{p.reason ? <em>{p.reason}</em> : null}</li>)}
        {total > list.length ? <li className="ic-plist__more">and {count(total - list.length)} more</li> : null}
      </ul>
    </details>
  );
}

/**
 * props: open, onClose, kind, years (the ones cards may be issued for),
 * yearId (to start on), selected [{ _id, name }] (rows ticked on the list),
 * onDone({ cards }) — after issuing; onPrint(cards) — print what was issued.
 */
export default function GenerateDialog({ open, onClose, kind = 'student', years = [], yearId, selected = [], presetClassId, onDone, onPrint }) {
  const k = KIND[kind];
  const student = kind === 'student';
  const [step, setStep] = useState(0);
  const [year, setYear] = useState(yearId || years[0]?._id || '');
  const [scope, setScope] = useState(selected.length ? 'selected' : 'all');
  const [classIds, setClassIds] = useState([]);
  const [sectionIds, setSectionIds] = useState([]);
  const [notify, setNotify] = useState(true);
  const [classes, setClasses] = useState([]);
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!open) return;
    setStep(0); setPlan(null); setResult(null); setBusy(false);
    setScope(presetClassId ? 'classes' : selected.length ? 'selected' : 'all');
    setClassIds(presetClassId ? [presetClassId] : []); setSectionIds([]); setNotify(true);
    setYear(yearId && years.some((y) => y._id === yearId) ? yearId : years[0]?._id || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The classes and sections of the chosen year.
  useEffect(() => {
    if (!open || !student || !year) return;
    let alive = true;
    getIdCardList({ kind: 'student', year, limit: 5 }).then((r) => { if (alive) setClasses(r?.data?.classes || []); }).catch(() => {});
    return () => { alive = false; };
  }, [open, student, year]);

  const body = useMemo(() => ({
    kind,
    yearId: student ? year : undefined,
    holderIds: scope === 'selected' ? selected.map((s) => s._id) : undefined,
    scope: scope === 'classes' ? { classIds } : scope === 'sections' ? { sectionIds } : undefined,
    notify,
  }), [kind, student, year, scope, selected, classIds, sectionIds, notify]);

  const ready = scope === 'classes' ? classIds.length > 0 : scope === 'sections' ? sectionIds.length > 0 : true;

  const check = async () => {
    setBusy(true);
    try {
      const r = await previewIdCards(body);
      setPlan(r.data);
      setStep(1);
    } catch (e) {
      toast.error(await errorText(e, 'The cards could not be checked'));
    } finally { setBusy(false); }
  };

  const issue = async () => {
    setBusy(true);
    try {
      const r = await generateIdCards(body);
      setResult(r.data);
      setStep(2);
      onDone?.(r.data);
    } catch (e) {
      toast.error(await errorText(e, 'The cards could not be issued'));
    } finally { setBusy(false); }
  };

  const yearName = years.find((y) => y._id === year)?.yearName || '';
  const sectionChips = classes.flatMap((c) => c.sections.map((s) => ({ value: s._id, label: `${c.className} – ${s.sectionName}` })));

  let footer;
  if (step === 0) {
    footer = <><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" icon="arrowRight" busy={busy} disabled={!ready || (student && !year)} onClick={check}>Check who gets a card</Btn></>;
  } else if (step === 1) {
    footer = <><Btn icon="arrowLeft" onClick={() => setStep(0)} disabled={busy}>Back</Btn><Btn kind="primary" icon="cardStack" busy={busy} disabled={!plan?.toIssue} onClick={issue}>{plan?.toIssue ? `Issue ${plural(plan.toIssue, 'card')}` : 'Nothing to issue'}</Btn></>;
  } else {
    footer = <><Btn onClick={onClose}>Close</Btn>{result?.issued && onPrint ? <Btn kind="primary" icon="printer" onClick={() => { onPrint(result.cards); onClose(); }}>Print {plural(result.issued, 'new card')}</Btn> : null}</>;
  }

  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={`Generate ${k.cards}`} icon="cardStack" width={640} footer={footer}>
      <Steps at={step} />
      {step === 0 ? (
        <div className="ic-gen">
          {student ? (
            <label className="ic-field">
              <span className="ic-field__label">Academic year</span>
              <Select value={year} onChange={(v) => { setYear(v); setClassIds([]); setSectionIds([]); if (scope === 'classes' || scope === 'sections') setScope('all'); }} label="Academic year"
                options={years.map((y) => ({ value: y._id, label: `${y.yearName}${y.phase === 'current' ? ' — current' : y.phase === 'upcoming' ? ' — coming' : ''}` }))} />
              <span className="ic-field__hint">A student card belongs to one year and says that year’s class, section and roll. Earlier years’ cards are never changed.</span>
            </label>
          ) : null}
          <div className="ic-field">
            <span className="ic-field__label">Who gets a card</span>
            <div className="ic-choices">
              <Choice on={scope === 'all'} onPick={() => setScope('all')} icon="users"
                title={student ? `Every student in ${yearName || 'the year'}` : `Every ${k.label.toLowerCase()}`}
                sub="Only those without a card in force — nobody gets a second one." />
              {student ? <Choice on={scope === 'classes'} onPick={() => setScope('classes')} icon="building" title="Chosen classes" sub="Every section of the classes you pick." /> : null}
              {student ? <Choice on={scope === 'sections'} onPick={() => setScope('sections')} icon="grid" title="Chosen sections" sub="Only the sections you pick." /> : null}
              {selected.length ? <Choice on={scope === 'selected'} onPick={() => setScope('selected')} icon="checkSquare" title={`The ${plural(selected.length, k.who)} you ticked`} sub={selected.slice(0, 3).map((s) => s.name).join(', ') + (selected.length > 3 ? ` and ${selected.length - 3} more` : '')} /> : null}
            </div>
          </div>
          {scope === 'classes' ? (
            <div className="ic-field">
              <span className="ic-field__label">Classes</span>
              {classes.length ? <Chips items={classes.map((c) => ({ value: c._id, label: c.className }))} value={classIds} onChange={setClassIds} /> : <span className="ic-field__hint">This year has no classes yet.</span>}
            </div>
          ) : null}
          {scope === 'sections' ? (
            <div className="ic-field">
              <span className="ic-field__label">Sections</span>
              {sectionChips.length ? <Chips items={sectionChips} value={sectionIds} onChange={setSectionIds} /> : <span className="ic-field__hint">This year has no sections yet.</span>}
            </div>
          ) : null}
          <Switch checked={notify} onChange={setNotify} label={student ? 'Tell the students and their parents' : `Tell each ${k.label.toLowerCase()}`} hint="A notification that the card is ready to view, download or print." />
        </div>
      ) : null}

      {step === 1 && plan ? (
        <div className="ic-gen">
          <div className="ic-plan">
            <div className="ic-plan__big">
              <strong>{count(plan.toIssue)}</strong>
              <span>{plan.toIssue === 1 ? 'card will be issued' : 'cards will be issued'}{plan.year ? ` for ${plan.year.yearName}` : ''}</span>
            </div>
            <div className="ic-plan__side">
              <span><b>{count(plan.total)}</b> in scope</span>
              <span><b>{count(plan.skippedCount)}</b> skipped</span>
            </div>
          </div>
          {plan.year?.phase === 'upcoming' ? <Note tone="indigo" icon="hourglass">These cards are for a year that has not begun. They show as <b>Generated</b> until {plan.year.yearName} becomes the current year, then they come into force by themselves.</Note> : null}
          <PeopleList title="Skipped" list={plan.skipped} total={plan.skippedCount} tone="slate" icon="info" />
          <PeopleList title={`No photo on record${plan.requirePhoto ? '' : ' — their cards show initials'}`} list={plan.noPhoto} total={plan.noPhotoCount} />
          <PeopleList title={student ? 'No admission number on record' : 'No employee ID on record'} list={plan.noCode} total={plan.noCodeCount} />
          {!plan.toIssue ? <Note tone="green" icon="checkCircle">Everyone in scope already has a card in force.</Note> : null}
        </div>
      ) : null}

      {step === 1 && !plan ? <Spin /> : null}

      {step === 2 && result ? (
        <div className="ic-done">
          <span className="ic-done__mark"><Ico name="checkDisc" size={46} /></span>
          <h3>{result.issued ? `${plural(result.issued, 'card')} issued` : 'No new cards were needed'}</h3>
          <p>{result.issued ? 'They are live now — each can be viewed, verified, downloaded and printed. Print them now, or any time from the list (filter “Not printed”).' : 'Everyone in scope already had a card.'}</p>
          {result.skippedCount ? <PeopleList title="Skipped" list={result.skipped} total={result.skippedCount} tone="slate" icon="info" /> : null}
        </div>
      ) : null}
    </Dialog>
  );
}
