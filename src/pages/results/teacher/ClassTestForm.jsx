/**
 * New Class Test — a teacher's own short test in a subject they teach — and
 * the same form to correct one (`test` given) while it is a draft or reopened:
 * its name, day, topic and marks. A typo used to mean deleting the test and
 * setting it again. The class and subject of an existing test do not change.
 *
 * The class and subject come from what the teacher actually teaches
 * (GET /teacher/results/test-options), as one choice: "Class 8 – A ·
 * Mathematics". The old form offered the Aptitude module's lists, and failed
 * outright for a school without that module. The server checks the pair again.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/teacher.api';
import { Modal } from '../../../components/ui/index';
import { Btn, Ico, inputDay } from '../rsUI';
import { classLine } from '../resultMeta';
import { Field } from '../rsForm';

/** Today on the reader's own calendar — toISOString() is UTC, the day before until 5:30 in India. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function ClassTestForm({ open, test, options, onClose, onCreated }) {
  return open ? <Form key={test?._id || 'new'} test={test} options={options} onClose={onClose} onCreated={onCreated} /> : null;
}

function Form({ test, options, onClose, onCreated }) {
  const editing = !!test?._id;
  const [f, setF] = useState(editing
    ? { pair: 'fixed', title: test.title || '', testDate: inputDay(test.testDate), maxMarks: test.maxMarks, passingMarks: test.passingMarks, topic: test.topic || '' }
    : { pair: options.length === 1 ? `${options[0].sectionId}|${options[0].subjectId}` : '', title: '', testDate: today(), maxMarks: 20, passingMarks: 8, topic: '' });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (patch) => { setF((s) => ({ ...s, ...patch })); setErrors((e) => { const n = { ...e }; Object.keys(patch).forEach((k) => delete n[k]); return n; }); };

  const choices = useMemo(() => options.map((o) => ({
    value: `${o.sectionId}|${o.subjectId}`,
    label: `${[o.className, o.sectionName].filter(Boolean).join(' – ')} · ${o.subjectName}${o.current ? '' : ` (${o.yearName})`}`,
  })), [options]);

  const submit = async (e) => {
    e.preventDefault();
    const err = {};
    if (!f.pair) err.pair = 'Choose the class and subject';
    if (!f.title.trim()) err.title = 'Give the test a name';
    if (!f.testDate) err.testDate = 'Choose the day of the test';
    const max = Number(f.maxMarks); const pass = Number(f.passingMarks);
    if (!Number.isFinite(max) || max < 1 || max > 1000) err.maxMarks = '1 to 1000';
    if (f.passingMarks === '' || !Number.isFinite(pass) || pass < 0) err.passingMarks = 'Cannot be blank or negative';
    else if (Number.isFinite(max) && pass > max) err.passingMarks = `Cannot be more than ${max}`;
    setErrors(err);
    if (Object.keys(err).length) return;
    setSaving(true); setBanner('');
    try {
      const fields = { title: f.title.trim(), testDate: f.testDate, maxMarks: max, passingMarks: pass, topic: f.topic.trim() };
      let res;
      if (editing) {
        res = await api.updateClassTest(test._id, fields);
        toast.success('Class test updated');
      } else {
        const [sectionId, subjectId] = f.pair.split('|');
        res = await api.createClassTest({ sectionId, subjectId, ...fields });
        toast.success('Class test created — enter its marks once it has been marked');
      }
      onCreated(res.data ?? res);
    } catch (err2) {
      setBanner(err2.message || 'The test could not be created');
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={saving ? () => {} : onClose} maxWidth={620}
      title={(
        <span className="rs-ask__title rs-t-amber">
          <i><Ico name="clipboard" size={18} /></i>
          <span>{editing ? 'Edit Class Test' : 'New Class Test'}<small>{editing
            ? `${test.subjectName} · ${classLine(test)}`
            : 'A short test in a subject you teach. The class teacher approves its marks before students see them.'}</small></span>
        </span>
      )}
      footer={(
        <span className="rs-form__foot">
          <Btn onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn kind="primary" type="submit" form="rs-newtest" busy={saving} icon="check">{editing ? 'Save Changes' : 'Create Test'}</Btn>
        </span>
      )}>
      <form id="rs-newtest" className="rs-testform" onSubmit={submit} noValidate>
        {banner ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{banner}</p> : null}
        <div className="rsf-grid rs-testform__grid">
          {editing ? null : (
            <Field label="Class and subject" required select error={errors.pair} wide>
              <select value={f.pair} onChange={(e) => set({ pair: e.target.value })}>
                <option value="">Choose…</option>
                {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Test name" required error={errors.title} wide>
            <input value={f.title} maxLength={120} placeholder="e.g. Chapter 4 — Fractions" onChange={(e) => set({ title: e.target.value })} />
          </Field>
          <Field label="Date" required icon="calendarBold" error={errors.testDate}>
            <input type="date" className={f.testDate ? '' : 'is-empty'} value={f.testDate} onChange={(e) => set({ testDate: e.target.value })} />
          </Field>
          <Field label="Topic" optional>
            <input value={f.topic} maxLength={200} placeholder="e.g. Fractions" onChange={(e) => set({ topic: e.target.value })} />
          </Field>
          <Field label="Maximum marks" required error={errors.maxMarks}>
            <input type="number" min="1" max="1000" value={f.maxMarks} onChange={(e) => set({ maxMarks: e.target.value })} />
          </Field>
          <Field label="Pass marks" required error={errors.passingMarks}>
            <input type="number" min="0" max="1000" value={f.passingMarks} onChange={(e) => set({ passingMarks: e.target.value })} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
