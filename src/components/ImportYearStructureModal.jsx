import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../api/admin.api';
import { Modal, Button, Spinner } from './ui/index';

/**
 * Copy a year's academic structure into another year.
 *
 * Setting up next year means rebuilding what this year already describes, so
 * this copies the classes, their sections, the year's subject list, which class
 * teaches what, and the teacher against each subject in each section.
 *
 * Each of those is its own tick box. The subject list and the curriculum are
 * deliberately separate: copying last year's subjects is a different request
 * from putting last year's curriculum onto this year's classes, and the Subjects
 * screen asks only for the first.
 *
 * Nothing is overwritten. Anything already in the target year is reported as
 * "already there" and left alone, so this can top up a partly-built year and a
 * second run does nothing.
 */
const KIND_LABEL = {
  class: 'Classes', section: 'Sections', subjectRow: 'Subjects', subject: 'Curriculum',
  assignment: 'Subject teachers', classTeacher: 'Class teachers',
};

/** Everything, unless the caller narrows it. */
const ALL_PARTS = { classes: true, sections: true, subjects: true, curriculum: true, assignments: true };

const PARTS = [
  { key: 'classes',     label: 'Classes',             hint: 'Class 1, Class 2, …' },
  { key: 'sections',    label: 'Sections',            hint: 'A, B, C under each class' },
  { key: 'subjects',    label: 'Subjects',            hint: 'The year\u2019s subject list — Science, Hindi, \u2026' },
  { key: 'curriculum',  label: 'Curriculum',          hint: 'Which class teaches which subject' },
  { key: 'assignments', label: 'Subject teachers',    hint: 'Who teaches a subject in one section' },
];

export default function ImportYearStructureModal({
  open, targetYear, years, onClose, onImported, defaultParts = ALL_PARTS,
}) {
  const [fromYear, setFromYear] = useState('');
  // What to copy. The Subjects screen opens this wanting the curriculum alone,
  // not 12 classes and 48 sections it did not ask for.
  const [parts, setParts] = useState(ALL_PARTS);
  const [withTeachers, setWithTeachers] = useState(false);
  const [plan, setPlan]     = useState(null);
  const [error, setError]   = useState('');
  const [loading, setLoad]  = useState(false);
  const [saving, setSaving] = useState(false);

  // Any year but the one being filled. Newest first, as the list already is.
  const options = (years || []).filter((y) => String(y._id) !== String(targetYear?._id));
  const nothingPicked = !Object.values(parts).some(Boolean);

  useEffect(() => {
    if (!open) return;
    setFromYear(options[0]?._id || '');
    setParts({ ...ALL_PARTS, ...defaultParts });
    setWithTeachers(false); setPlan(null); setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, targetYear?._id]);

  useEffect(() => {
    if (!open || !fromYear || !targetYear?._id || nothingPicked) { setPlan(null); return; }
    let alive = true;
    setLoad(true);
    api.importYearStructure(targetYear._id, {
      fromYear, include: parts, includeClassTeachers: withTeachers, preview: true,
    })
      .then((res) => { if (alive) { setPlan(res?.data ?? res); setError(''); } })
      .catch((err) => { if (alive) { setPlan(null); setError(err.message || 'Could not read that year'); } })
      .finally(() => { if (alive) setLoad(false); });
    return () => { alive = false; };
  }, [open, fromYear, withTeachers, parts, nothingPicked, targetYear?._id]);

  const total = plan
    ? plan.classesToCreate + plan.sectionsToCreate + (plan.subjectsToCreate ?? 0) + plan.linksToCreate
      + plan.assignmentsToCreate + plan.classTeachersToSet
    : 0;

  // Did the source have anything of the kinds that were actually asked for?
  const sourceIsBare = !!plan && !Object.entries(parts)
    .filter(([, on]) => on)
    .some(([key]) => (plan.sourceTotals?.[key] ?? 0) > 0);

  // A zero has three different causes and they need different actions: the
  // source had nothing, the target already has it, or something it depends on
  // is missing. Only the skip list knows which, so read it rather than guess.
  const blockingSkips = (plan?.skipped || []).filter((sk) =>
    sk.reason !== 'already in this year' && !sk.reason.endsWith('not part of this import'));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.importYearStructure(targetYear._id, {
        fromYear, include: parts, includeClassTeachers: withTeachers,
      });
      const d = res?.data ?? res;
      const made = d.createdClasses + d.createdSections + d.createdLinks + d.createdAssignments;
      toast.success(made
        ? `Imported ${d.createdClasses} class(es), ${d.createdSections} section(s), ${d.createdLinks} subject link(s) and ${d.createdAssignments} teacher assignment(s)`
        : 'Nothing to import — that structure is already in this year');
      onImported?.();
      onClose();
    } catch (err) { setError(err.message); toast.error(err.message); }
    finally { setSaving(false); }
  };

  // Skips grouped by kind and reason, so 48 identical lines read as one row.
  const grouped = [];
  for (const s of plan?.skipped || []) {
    const hit = grouped.find((g) => g.kind === s.kind && g.reason === s.reason);
    if (hit) { hit.count += 1; hit.examples.push(s.label); }
    else grouped.push({ kind: s.kind, reason: s.reason, count: 1, examples: [s.label] });
  }

  return (
    <Modal open={open} onClose={saving ? () => {} : onClose}
      title={`Import into ${targetYear?.yearName || 'this year'}`} maxWidth={580}
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button form="import-year-form" type="submit" loading={saving} disabled={!plan || !!error || !total || nothingPicked}>
          {plan && !error && total ? `Import ${total} record${total === 1 ? '' : 's'}` : 'Import'}
        </Button>
      </>}>
      <form id="import-year-form" onSubmit={submit}>
        <div className="form-group">
          <label className="form-label required">Copy from</label>
          {options.length === 0 ? (
            <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', margin: 0 }}>
              There is no other academic year to copy from yet.
            </p>
          ) : (
            <select className="form-control" value={fromYear} onChange={(e) => setFromYear(e.target.value)}>
              {options.map((y) => (
                <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (Active)' : ''}</option>
              ))}
            </select>
          )}
        </div>

        <div className="form-group">
          <label className="form-label required">What to import</label>
          <div style={{ display: 'grid', gap: 6 }}>
            {PARTS.map((part) => (
              <label key={part.key} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.85rem', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!parts[part.key]} style={{ marginTop: 3 }}
                  onChange={(e) => setParts((cur) => ({ ...cur, [part.key]: e.target.checked }))} />
                <span>
                  {part.label}
                  <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '.75rem' }}>{part.hint}</span>
                </span>
              </label>
            ))}
          </div>
          {nothingPicked && (
            <span style={{ fontSize: '.78rem', color: 'var(--danger)' }}>Tick at least one.</span>
          )}
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '.85rem', marginBottom: 14, cursor: 'pointer' }}>
          <input type="checkbox" checked={withTeachers} onChange={(e) => setWithTeachers(e.target.checked)}
            style={{ marginTop: 3 }} />
          <span>
            Also carry over the class teacher and vice class teacher of each section
            <span style={{ display: 'block', color: 'var(--text-muted)', fontSize: '.78rem' }}>
              Off by default — these change from year to year more often than the structure does.
            </span>
          </span>
        </label>

        {loading && !plan && <div style={{ padding: 20, display: 'flex', justifyContent: 'center' }}><Spinner /></div>}

        {error && (
          <div style={{ background: 'var(--danger-light,#fef2f2)', border: '1px solid var(--danger)',
            borderRadius: 8, padding: '10px 14px', fontSize: '.82rem', color: 'var(--danger)' }}>{error}</div>
        )}

        {plan && !error && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 8, marginBottom: 12 }}>
              <Tile n={plan.classesToCreate}  label="Classes" hint="Class 1, Class 2, …"
                empty={plan.sourceTotals?.classes === 0} />
              <Tile n={plan.sectionsToCreate} label="Sections" hint="A, B, C under each class"
                empty={plan.sourceTotals?.sections === 0} />
              <Tile n={plan.subjectsToCreate ?? 0} label="Subjects"
                hint="Science, Hindi, … — this year's own list"
                empty={plan.sourceTotals?.subjects === 0} />
              <Tile n={plan.linksToCreate}    label="Curriculum"
                hint="Which class teaches which subject"
                empty={plan.sourceTotals?.curriculum === 0} />
              <Tile n={plan.assignmentsToCreate} label="Subject teachers"
                hint="Who teaches a subject in one particular section"
                empty={plan.sourceTotals?.assignments === 0} />
              {withTeachers && <Tile n={plan.classTeachersToSet} label="Class teachers"
                hint="The teacher in charge of a section" />}
            </div>

            {total === 0 && (
              <p style={{ fontSize: '.82rem', margin: '0 0 12px', lineHeight: 1.7,
                color: sourceIsBare || blockingSkips.length ? 'var(--danger)' : 'var(--text-muted)' }}>
                {sourceIsBare
                  ? `${plan.fromYear.yearName} has nothing of the kind you ticked — there is nothing to copy out of it. Pick a different year to copy from, or set the structure up in ${plan.fromYear.yearName} first.`
                  : blockingSkips.length
                    ? `Nothing can be created yet — ${blockingSkips[0].reason}. Tick the parts it depends on, or see Skipped below.`
                    : `Nothing new to bring over — ${plan.toYear.yearName} already has all of it.`}
              </p>
            )}

            <p style={{ fontSize: '.76rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.7 }}>
              A zero means that row is already in {plan.toYear.yearName}, or the source year never
              had it — the Skipped list below says which. Subjects are matched by name, so one you
              already added by hand is reused rather than duplicated. Students, roll numbers and
              timetables are not brought over.
            </p>

            {grouped.length > 0 && (
              <div style={{ border: '1px solid var(--border)', borderRadius: 6, maxHeight: 190, overflowY: 'auto' }}>
                <div style={{ padding: '7px 12px', fontSize: '.78rem', fontWeight: 700, borderBottom: '1px solid var(--border)' }}>
                  Skipped
                </div>
                {grouped.map((g, i) => (
                  <div key={i} style={{ padding: '7px 12px', fontSize: '.8rem', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 600 }}>{KIND_LABEL[g.kind] || g.kind}</span>
                    <span style={{ color: 'var(--text-muted)' }}> — {g.reason} </span>
                    <span style={{ color: 'var(--text-muted)' }}>×{g.count}</span>
                    {g.reason !== 'already in this year' && (
                      <div style={{ color: 'var(--danger)', fontSize: '.75rem', marginTop: 2 }}>
                        {g.examples.slice(0, 3).join(' · ')}{g.examples.length > 3 ? ` · +${g.examples.length - 3} more` : ''}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </form>
    </Modal>
  );
}

/** `empty` means the SOURCE year has none of these — a different zero from
 *  "the target already has them", and it needs a different fix from the admin. */
function Tile({ n, label, hint, empty }) {
  return (
    <div title={hint} style={{
      border: `1px solid ${n > 0 ? 'var(--success)' : 'var(--border)'}`,
      background: n > 0 ? 'var(--success-light,#f0fdf4)' : 'var(--bg)',
      borderRadius: 8, padding: '9px 12px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: n > 0 ? 'var(--success)' : 'var(--text)' }}>{n}</div>
      <div style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      {n === 0 && empty
        ? <div style={{ fontSize: '.66rem', color: 'var(--warning)', marginTop: 3, lineHeight: 1.35, fontWeight: 600 }}>
            none in the source year
          </div>
        : hint && <div style={{ fontSize: '.66rem', color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.35 }}>{hint}</div>}
    </div>
  );
}
