/**
 * The question editor — one component for the teacher's exam workspace and the
 * admin's question page, pointed at either role's routes through `api`.
 *
 * Built around the two numbers an exam cannot be published without: the
 * questions it was set for, and total marks its questions must add up to. Both
 * are metered at the top, the full publish checklist sits beside the list, and
 * Publish stays disabled — explaining why when pressed — until every check
 * passes. The checklist is recomputed here the moment a question changes
 * (pages/exams/readiness.js); the server applies the same rules on publish.
 */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Confirm, Modal, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { QUESTION_TYPE_LABEL } from '../admin/examParts';
import { readinessFor } from './readiness';
import { QuestionReview, ReadinessPanel, PublishButton, plural } from './examShared';

const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';
const unwrap = (res) => res?.data ?? res;

const LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'];
const TF = [{ optionId: 'true', text: 'True' }, { optionId: 'false', text: 'False' }];
const blank = (marks = 1) => ({
  questionText: '', questionType: 'mcq_single', correctAnswers: [], marks,
  options: LETTERS.slice(0, 4).map((l) => ({ optionId: l, text: '' })),
});

/** A count against its target: how far along, and what is left or over. */
const Meter = ({ icon, label, have, want, unit }) => {
  const over = have > want;
  const done = want > 0 && Math.abs(have - want) < 0.001;
  const pct = want > 0 ? Math.min(100, (have / want) * 100) : 0;
  const diff = Math.round(Math.abs(want - have) * 100) / 100;
  return (
    <div className={`apxmeter${done ? ' is-done' : over ? ' is-over' : ''}`}>
      <span className="apxmeter__icon"><Icon name={icon} size={18} /></span>
      <div className="apxmeter__body">
        <div className="apxmeter__top">
          <strong>{label}</strong>
          <span><b>{Math.round(have * 100) / 100}</b> / {want || '—'}</span>
        </div>
        <div className="apxmeter__track"><span style={{ width: `${pct}%` }} /></div>
        <small>
          {want <= 0 ? `Set the exam’s ${unit}` : done ? 'Complete' : over ? `${diff} ${unit} over` : `${diff} ${unit} to go`}
        </small>
      </div>
    </div>
  );
};

export default function QuestionEditor({ exam, api, canManage, onChanged, onPublished, onEditExam, onImport }) {
  const [questions, setQuestions] = useState(null);
  const [dialog, setDialog] = useState(null);     // { editing: question|null }
  const [del, setDel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const id = exam?._id;
  const load = async () => {
    try { setQuestions(unwrap(await api.getQuestions(id)) || []); }
    catch (err) { setQuestions([]); toast.error(errText(err)); }
  };
  useEffect(() => { if (id) load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDraft = exam?.status === 'draft';
  const editable = isDraft && canManage;
  const readiness = useMemo(() => (questions ? readinessFor(exam, questions) : exam?.readiness), [exam, questions]);
  const marks = (questions || []).reduce((n, q) => n + (Number(q.marks) || 0), 0);
  const full = questions && questions.length >= (exam?.totalQuestions || 0);

  const changed = async () => { await load(); onChanged?.(); };

  const remove = async () => {
    setBusy(true);
    try { await api.deleteQuestion(id, del._id); toast.success('Question deleted'); setDel(null); await changed(); }
    catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  const publish = async () => {
    setPublishing(true);
    try {
      await api.publishExam(id);
      toast.success('Exam published — students will see it at the scheduled time');
      onPublished?.();
    } catch (err) {
      // The server names every missing piece; show the first and let the checklist show the rest.
      toast.error(errText(err));
      onChanged?.();
    } finally { setPublishing(false); }
  };

  if (!exam || questions == null) return <div className="apxloading"><Spinner /></div>;

  const addButton = (
    <Button onClick={() => (full ? null : setDialog({ editing: null }))} disabled={!editable || full}
      title={full ? `All ${exam.totalQuestions} questions are in — delete one or raise the total in Edit exam` : undefined}>
      <Icon name="plus" size={16} /> Add Question
    </Button>
  );

  return (
    <div className="apxqe">
      <div className="apxqe__main">
        <div className="card apxqe__meters">
          <Meter icon="list" label="Questions" have={questions.length} want={exam.totalQuestions} unit="questions" />
          <Meter icon="trophy" label="Marks allocated" have={marks} want={exam.totalMarks} unit="marks" />
          {editable && (
            <div className="apxqe__acts">
              {onImport && (
                <Button variant="secondary" onClick={onImport} disabled={full}>
                  <Icon name="upload" size={16} /> Import
                </Button>
              )}
              {addButton}
            </div>
          )}
        </div>

        {editable && full && questions.length === exam.totalQuestions && !readiness?.ready && readiness?.missing.includes('marks') && (
          <p className="apxwarn">
            <Icon name="alert" size={15} />
            Every question is in, but they carry {marks} marks and the exam is out of {exam.totalMarks}. Adjust a
            question’s marks{onEditExam ? <>, or <button type="button" className="apxinline" onClick={onEditExam}>change the total</button></> : ''}.
          </p>
        )}

        {!isDraft && (
          <p className="apxlock"><Icon name="key" size={16} /> This exam is {exam.stage || exam.status} — its questions are locked.</p>
        )}
        {isDraft && !canManage && (
          <p className="apxlock"><Icon name="eye" size={16} /> Only the teacher who wrote this exam can change its questions.</p>
        )}

        {questions.length === 0 ? (
          <div className="card apxqe__empty">
            <Icon name="list" size={34} />
            <h3>No questions yet</h3>
            <p>
              This exam is set for {plural(exam.totalQuestions, 'question')} worth {exam.totalMarks} marks in all.
              {editable ? ' Add them one at a time, or import a spreadsheet.' : ''}
            </p>
            {editable && (
              <div className="apxqe__emptyacts">
                {onImport && <Button variant="secondary" onClick={onImport}><Icon name="upload" size={16} /> Import spreadsheet</Button>}
                {addButton}
              </div>
            )}
          </div>
        ) : (
          <div className="apxqe__list">
            {questions.map((q, i) => (
              <QuestionReview key={q._id} q={q} index={i} showKeyOnly
                actions={editable && (
                  <>
                    <button type="button" className="apxact" title="Edit question" aria-label={`Edit question ${i + 1}`}
                      onClick={() => setDialog({ editing: q })}><Icon name="pencil" size={16} /></button>
                    <button type="button" className="apxact apxact--danger" title="Delete question" aria-label={`Delete question ${i + 1}`}
                      onClick={() => setDel(q)}><Icon name="trash" size={16} /></button>
                  </>
                )} />
            ))}
          </div>
        )}
      </div>

      <aside className="apxqe__rail">
        {isDraft ? (
          <ReadinessPanel readiness={readiness}>
            {canManage && (
              <div className="apxreadypanel__foot">
                <PublishButton readiness={readiness} onPublish={publish} busy={publishing} align="left" />
                {onEditExam && <Button variant="secondary" onClick={onEditExam}><Icon name="pencil" size={15} /> Edit exam</Button>}
              </div>
            )}
          </ReadinessPanel>
        ) : (
          <section className="apxreadypanel is-ready">
            <header><strong>Published</strong><span>{plural(questions.length, 'question')} · {marks} marks</span></header>
            <p className="apxform__hint">Questions and marks were checked when the exam was published and can no longer change.</p>
          </section>
        )}
      </aside>

      {/* Keyed so "Save & add another" starts the next question from a clean form. */}
      <QuestionDialog key={dialog?.n || 'question'} open={!!dialog} editing={dialog?.editing} exam={exam}
        otherMarks={marks - (Number(dialog?.editing?.marks) || 0)}
        room={exam.totalQuestions - questions.length}
        onClose={() => setDialog(null)}
        onSave={async (body, again) => {
          try {
            if (dialog.editing) await api.updateQuestion(id, dialog.editing._id, body);
            else await api.addQuestion(id, body);
            toast.success(dialog.editing ? 'Question updated' : 'Question added');
            await changed();
            if (again && questions.length + 1 < exam.totalQuestions) setDialog({ editing: null, n: Date.now() });
            else setDialog(null);
            return true;
          } catch (err) { toast.error(errText(err)); return false; }
        }} />

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy}
        title="Delete question" confirmLabel="Delete"
        message={del ? `Delete “${del.questionText.slice(0, 80)}${del.questionText.length > 80 ? '…' : ''}”? Its ${plural(del.marks, 'mark')} go back to be allocated.` : ''} />
    </div>
  );
}

// ── The question dialog ──────────────────────────────────────────────────────

const TYPES = [
  { value: 'mcq_single',   icon: 'checkCircle', hint: 'One correct option' },
  { value: 'mcq_multiple', icon: 'checkSquare', hint: 'Every correct option, all or nothing' },
  { value: 'true_false',   icon: 'repeat',      hint: 'A statement to judge' },
];

function QuestionDialog({ open, editing, exam, otherMarks, room, onClose, onSave }) {
  const [f, setF] = useState(blank());
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);

  const left = Math.round(((exam?.totalMarks || 0) - otherMarks) * 100) / 100;

  useEffect(() => {
    if (!open) return;
    setTried(false);
    if (editing) {
      setF({
        questionText: editing.questionText, questionType: editing.questionType,
        options: editing.questionType === 'true_false' ? TF : (editing.options || []).map((o) => ({ ...o })),
        correctAnswers: [...(editing.correctAnswers || [])], marks: editing.marks,
      });
    } else {
      // Suggest an even share of what is left, so a paper filled in one pass adds up.
      const share = room > 0 ? Math.max(0.5, Math.round((left / room) * 2) / 2) : 1;
      setF(blank(Number.isFinite(share) && share > 0 ? share : 1));
    }
  }, [open, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const setType = (t) => setF((x) => ({
    ...x, questionType: t, correctAnswers: [],
    options: t === 'true_false' ? TF : (x.questionType === 'true_false' ? LETTERS.slice(0, 4).map((l) => ({ optionId: l, text: '' })) : x.options),
  }));

  const toggleKey = (oid) => setF((x) => ({
    ...x,
    correctAnswers: x.questionType === 'mcq_multiple'
      ? (x.correctAnswers.includes(oid) ? x.correctAnswers.filter((c) => c !== oid) : [...x.correctAnswers, oid])
      : [oid],
  }));

  const setOpt = (i, text) => setF((x) => ({ ...x, options: x.options.map((o, j) => (j === i ? { ...o, text } : o)) }));

  // Options stay lettered a, b, c… in order; removing one re-letters the rest and carries the key with them.
  const removeOpt = (i) => setF((x) => {
    const kept = x.options.filter((_, j) => j !== i);
    const remap = Object.fromEntries(kept.map((o, j) => [o.optionId, LETTERS[j]]));
    return {
      ...x,
      options: kept.map((o, j) => ({ optionId: LETTERS[j], text: o.text })),
      correctAnswers: x.correctAnswers.filter((c) => remap[c]).map((c) => remap[c]),
    };
  });
  const addOpt = () => setF((x) => (x.options.length >= 6 ? x : { ...x, options: [...x.options, { optionId: LETTERS[x.options.length], text: '' }] }));

  // The rules the server applies (checkQuestion), checked before sending.
  const problems = [];
  if (!f.questionText.trim()) problems.push('Write the question');
  if (f.questionType !== 'true_false' && f.options.filter((o) => o.text.trim()).length < 2) problems.push('Give at least two options');
  if (f.questionType !== 'true_false' && f.options.some((o) => !o.text.trim())) problems.push('Fill in or remove the empty option');
  if (!f.correctAnswers.length) problems.push('Mark the correct answer');
  if (!(Number(f.marks) >= 0.5)) problems.push('Marks must be 0.5 or more');

  const afterMarks = Math.round((otherMarks + (Number(f.marks) || 0)) * 100) / 100;
  const total = exam?.totalMarks || 0;

  const save = async (again) => {
    setTried(true);
    if (problems.length) return;
    setSaving(true);
    const ok = await onSave({
      questionText: f.questionText.trim(), questionType: f.questionType,
      options: f.questionType === 'true_false' ? TF : f.options.map((o) => ({ optionId: o.optionId, text: o.text.trim() })),
      correctAnswers: f.correctAnswers, marks: Number(f.marks),
    }, again);
    setSaving(false);
    if (ok && again) setTried(false);
  };

  return (
    <Modal open={open} onClose={onClose} maxWidth={720}
      title={
        <span className="apxdlg__head">
          <span className="apxdlg__mark"><Icon name={editing ? 'pencil' : 'plus'} size={20} /></span>
          <span>
            {editing ? 'Edit question' : 'Add question'}
            <small>{exam?.title}</small>
          </span>
        </span>
      }
      footer={
        <>
          {tried && problems.length > 0 && <span className="apxdlg__err">{problems[0]}</span>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          {!editing && room > 1 && <Button variant="secondary" onClick={() => save(true)} loading={saving}>Save &amp; add another</Button>}
          <Button onClick={() => save(false)} loading={saving}>{editing ? 'Save changes' : 'Add question'}</Button>
        </>
      }>
      <div className="apxform">
        <section className="apxform__step">
          <h4><span>1</span> Question type</h4>
          <div className="apxtypes" role="radiogroup" aria-label="Question type">
            {TYPES.map((t) => (
              <button key={t.value} type="button" role="radio" aria-checked={f.questionType === t.value}
                className={`apxtypes__card${f.questionType === t.value ? ' is-on' : ''}`} onClick={() => setType(t.value)}>
                <Icon name={t.icon} size={20} />
                <strong>{QUESTION_TYPE_LABEL[t.value]}</strong>
                <small>{t.hint}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="apxform__step">
          <h4><span>2</span> Question</h4>
          <textarea className={`form-control${tried && !f.questionText.trim() ? ' is-invalid' : ''}`} rows={3} maxLength={2000}
            value={f.questionText} onChange={(e) => setF((x) => ({ ...x, questionText: e.target.value }))}
            placeholder={f.questionType === 'true_false' ? 'e.g. Every square is a rectangle.' : 'e.g. If 3x + 5 = 20, what is x?'} autoFocus />
          <small className="apxcount">{f.questionText.length} / 2000</small>
        </section>

        <section className="apxform__step">
          <h4>
            <span>3</span> {f.questionType === 'true_false' ? 'Correct answer' : 'Options'}
            <small className="apxform__reach">
              {f.questionType === 'mcq_multiple' ? 'Tick every correct option' : 'Tick the correct option'}
            </small>
          </h4>
          <ul className="apxoptedit">
            {f.options.map((o, i) => {
              const on = f.correctAnswers.includes(o.optionId);
              return (
                <li key={o.optionId} className={on ? 'is-key' : ''}>
                  <button type="button" className={`apxoptedit__key${f.questionType === 'mcq_multiple' ? ' is-multi' : ''}`}
                    aria-pressed={on} aria-label={`Mark ${f.questionType === 'true_false' ? o.text : `option ${o.optionId.toUpperCase()}`} correct`}
                    onClick={() => toggleKey(o.optionId)}>
                    {on && <Icon name="checkCircle" size={18} />}
                  </button>
                  {f.questionType === 'true_false'
                    ? <span className="apxoptedit__tf">{o.text}</span>
                    : (
                      <>
                        <span className="apxqr__letter">{o.optionId.toUpperCase()}</span>
                        <input className="form-control" value={o.text} maxLength={500}
                          placeholder={`Option ${o.optionId.toUpperCase()}`} onChange={(e) => setOpt(i, e.target.value)} />
                        {on && <em className="apxoptedit__tag">Correct</em>}
                        <button type="button" className="apxact apxact--danger" disabled={f.options.length <= 2}
                          title={f.options.length <= 2 ? 'A question needs at least two options' : 'Remove option'}
                          aria-label={`Remove option ${o.optionId.toUpperCase()}`} onClick={() => removeOpt(i)}>
                          <Icon name="close" size={15} />
                        </button>
                      </>
                    )}
                  {on && f.questionType === 'true_false' && <em className="apxoptedit__tag">Correct</em>}
                </li>
              );
            })}
          </ul>
          {f.questionType !== 'true_false' && f.options.length < 6 && (
            <button type="button" className="apxinline apxoptedit__add" onClick={addOpt}>
              <Icon name="plus" size={15} /> Add option
            </button>
          )}
        </section>

        <section className="apxform__step">
          <h4><span>4</span> Marks</h4>
          <div className="apxmarks">
            <input type="number" min="0.5" step="0.5" className="form-control" value={f.marks}
              onChange={(e) => setF((x) => ({ ...x, marks: e.target.value }))} aria-label="Marks" />
            <p className={`apxmarks__note${afterMarks > total ? ' is-over' : afterMarks === total ? ' is-done' : ''}`}>
              {afterMarks === total
                ? <>With this question the paper carries all <b>{total}</b> marks.</>
                : afterMarks > total
                  ? <>This takes the paper to <b>{afterMarks}</b> of {total} marks — <b>{Math.round((afterMarks - total) * 100) / 100} over</b>. The exam can’t be published until they match.</>
                  : <>Paper after this question: <b>{afterMarks}</b> of {total} marks · {Math.round((total - afterMarks) * 100) / 100} left for the rest.</>}
            </p>
          </div>
        </section>
      </div>
    </Modal>
  );
}
