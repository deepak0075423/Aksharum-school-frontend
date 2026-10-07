/**
 * The two changes a published exam can still take, without withdrawing every
 * student's result (school-backend services/resultExams):
 *
 *   Rename        its title, code and description. The dates, subjects, marks
 *                 and grace the results were worked out from stay fixed.
 *   Result date   moved, or the results released now — only while they have
 *                 not yet reached families. A promotion on a final exam moves
 *                 with it, and families are told the new day.
 *
 * Both were impossible before: a typo in a published exam's name meant
 * withdrawing the results, and the result date could not move at all.
 */
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/admin.api';
import { Modal } from '../../../components/ui/index';
import { Btn, Ico, fmtDay, inputDay } from '../rsUI';
import { classLine } from '../resultMeta';

/** `edit` is { kind: 'rename' | 'resultDate', r } — r a board row or the drawer's exam. */
export default function PublishedEdit({ edit, onClose, onDone }) {
  if (!edit) return null;
  return edit.kind === 'rename'
    ? <Rename key={`r:${edit.r._id}`} r={edit.r} onClose={onClose} onDone={onDone} />
    : <ResultDate key={`d:${edit.r._id}`} r={edit.r} onClose={onClose} onDone={onDone} />;
}

const Title = ({ icon, tone, text, r }) => (
  <span className={`rs-ask__title rs-t-${tone}`}>
    <i><Ico name={icon} size={18} /></i>
    <span>{text}<small>{[r.title, classLine(r)].filter(Boolean).join(' · ')}</small></span>
  </span>
);

function Rename({ r, onClose, onDone }) {
  const [f, setF] = useState({ title: r.title || '', code: r.code || '', description: r.description || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => { setF((s) => ({ ...s, ...patch })); setError(''); };

  const save = async () => {
    const title = f.title.trim(); const code = f.code.trim().toUpperCase();
    if (!title) { setError('Give the exam a name'); return; }
    if (code && !/^[A-Z0-9][A-Z0-9 ._/-]*$/.test(code)) { setError('The code may use letters, digits, spaces and . _ / - only'); return; }
    setBusy(true);
    try {
      await api.updateFormalExam(r._id, { title, code, description: f.description.trim() });
      toast.success('Exam renamed — the published results are unchanged');
      onDone();
    } catch (e) { setError(e.message || 'The exam could not be renamed'); setBusy(false); }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={520}
      title={<Title icon="pencil" tone="indigo" text="Rename Exam" r={r} />}
      footer={<>
        <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn kind="primary" busy={busy} onClick={save}>Save Name</Btn>
      </>}>
      <div className="rs-ask">
        <p>The results are published, so only what the exam is called can change. Its dates, subjects and marks stay as they were.</p>
        <label className="rs-ask__reason">
          <span>Exam title <b aria-hidden>*</b></span>
          <input value={f.title} maxLength={120} autoFocus onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="rs-ask__reason">
          <span>Exam code <i>optional</i></span>
          <input data-text="code" value={f.code} maxLength={20} autoComplete="off" spellCheck={false} onChange={(e) => set({ code: e.target.value.toUpperCase() })} />
        </label>
        <label className="rs-ask__reason">
          <span>Description <i>optional</i></span>
          <textarea rows={3} maxLength={500} value={f.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}

function ResultDate({ r, onClose, onDone }) {
  const [date, setDate] = useState(inputDay(r.publishDate));
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const end = inputDay(r.endDate);
  const promotes = r.examType === 'FINAL' && r.options?.promoteOnPass;

  const save = async (releaseNow) => {
    if (!releaseNow && !date) { setError('Choose the day, or release the results now'); return; }
    if (!releaseNow && end && date < end) { setError('Results cannot be dated before the exam ends'); return; }
    setBusy(releaseNow ? 'now' : 'date'); setError('');
    try {
      const res = await api.setFormalExamResultDate(r._id, releaseNow ? null : date);
      toast.success(res?.data?.released ? 'Results released — students and parents can see them now' : `Results will reach families on ${fmtDay(date)}`);
      onDone();
    } catch (e) { setError(e.message || 'The result date could not be changed'); setBusy(''); }
  };

  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={500}
      title={<Title icon="calendar" tone="blue" text="Change Result Date" r={r} />}
      footer={<>
        <Btn onClick={onClose} disabled={!!busy}>Cancel</Btn>
        <Btn icon="send" busy={busy === 'now'} disabled={!!busy} onClick={() => save(true)}>Release Now</Btn>
        <Btn kind="primary" busy={busy === 'date'} disabled={!!busy} onClick={() => save(false)}>Save Date</Btn>
      </>}>
      <div className="rs-ask">
        <p>These results are published and reach students and parents on <strong>{r.publishDate ? fmtDay(r.publishDate) : 'their result date'}</strong>. Until then the day can move.</p>
        <ul>
          <li>Students and parents are told the new day.</li>
          {promotes ? <li>The promotion of the students who passed moves with it.</li> : null}
          <li>Once the day has come, it is fixed — withdrawing the results is the way back.</li>
        </ul>
        <label className="rs-ask__reason">
          <span>New result date</span>
          <input type="date" value={date} min={end || undefined} onChange={(e) => { setDate(e.target.value); setError(''); }} />
        </label>
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}
