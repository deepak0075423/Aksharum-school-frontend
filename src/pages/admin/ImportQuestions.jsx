/**
 * Import questions into a draft from a spreadsheet.
 *
 * Two steps, the way the holiday import works: the file is checked first — the
 * server runs every rule and writes nothing — and only what that check
 * accepted is imported. Rows it refused are listed with their sheet row
 * number, so they can be fixed and the same file sent again: questions already
 * in the exam are skipped, not added twice.
 */
import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Button, Modal, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { getExams, importAptitudeQuestions, getAptitudeQuestionTemplate } from '../../api/admin.api';
import { saveFile } from '../../utils/downloadFile';
import { QUESTION_TYPE_LABEL, fmtExamDay } from './examParts';

const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';

const ADMIN_API = {
  listDrafts: async () => (await getExams({ stage: 'draft', limit: 100 })).data || [],
  importQuestions: importAptitudeQuestions,
  template: getAptitudeQuestionTemplate,
};

/**
 * `api` points the dialog at a role's routes — the admin's by default; the
 * teacher's workspace passes its own `{ listDrafts, importQuestions, template }`.
 */
export default function ImportQuestions({ open, examId, onClose, onImported, api = ADMIN_API }) {
  const [drafts, setDrafts]   = useState(null);
  const [target, setTarget]   = useState('');
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy]       = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setTarget(examId || ''); setFile(null); setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
    (async () => {
      try {
        setDrafts(await api.listDrafts());
      } catch (err) { setDrafts([]); toast.error(errText(err)); }
    })();
  }, [open, examId]);

  const chosen = drafts?.find((d) => d._id === target);

  const template = async () => {
    try { saveFile(await api.template(), 'aptitude_questions_template.xlsx'); }
    catch { toast.error('Failed to download the template'); }
  };

  const check = async () => {
    if (!target) return toast.error('Choose the exam to import into');
    if (!file) return toast.error('Choose a spreadsheet');
    setBusy(true);
    try {
      const res = await api.importQuestions(target, file, true);
      setPreview(res.data);
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  const run = async () => {
    setBusy(true);
    try {
      const res = await api.importQuestions(target, file, false);
      toast.success(`${res.data.imported} question${res.data.imported === 1 ? '' : 's'} imported`);
      onImported?.(target);
      onClose();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  const back = () => { setPreview(null); };

  return (
    <Modal open={open} onClose={onClose} maxWidth={760}
      title={
        <span className="apxdlg__head">
          <span className="apxdlg__mark"><Icon name="upload" size={20} /></span>
          <span>
            Import Questions
            <small>{preview ? 'Check what will be added before importing.' : 'Add questions to a draft exam from an Excel or CSV sheet.'}</small>
          </span>
        </span>
      }
      footer={preview
        ? (
          <>
            <Button variant="secondary" onClick={back} disabled={busy}>Back</Button>
            <Button onClick={run} loading={busy} disabled={!preview.valid}>
              Import {preview.valid} question{preview.valid === 1 ? '' : 's'}
            </Button>
          </>
        )
        : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={check} loading={busy} disabled={!target || !file}>Check file</Button>
          </>
        )}>
      {!preview && (
        <div className="apxform">
          <section className="apxform__step">
            <h4><span>1</span> Exam</h4>
            {drafts == null
              ? <div className="apxloading apxloading--sm"><Spinner /></div>
              : drafts.length === 0
                ? <p className="apxnone">There are no draft exams. Questions can only be added to a draft — create one first, or move a scheduled exam back to draft.</p>
                : (
                  <>
                    <select className="form-control" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Exam">
                      <option value="">Choose a draft exam…</option>
                      {drafts.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.title} — {fmtExamDay(d)} ({d.questionCount}/{d.totalQuestions} questions{d.questionCount >= d.totalQuestions ? ', full' : ''})
                        </option>
                      ))}
                    </select>
                    {chosen && (
                      <p className="apxform__hint">
                        {chosen.audience?.label} · {chosen.questionCount} of {chosen.totalQuestions} questions so far ·
                        out of {chosen.totalMarks} marks
                      </p>
                    )}
                  </>
                )}
          </section>

          <section className="apxform__step">
            <h4><span>2</span> Spreadsheet</h4>
            <label className={`apxdrop${file ? ' is-on' : ''}`}>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setPreview(null); }} />
              <Icon name={file ? 'fileSheet' : 'upload'} size={26} />
              <strong>{file ? file.name : 'Drop a file here, or click to choose'}</strong>
              <small>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : '.xlsx, .xls or .csv · up to 500 questions'}</small>
            </label>
            <div className="apxcols">
              <div>
                <strong>Columns</strong>
                <p>Question · Type · Option A … Option F · Correct · Marks</p>
              </div>
              <div>
                <strong>Correct</strong>
                <p>The option letter — <code>B</code>, or <code>A, C</code> for multiple choice. <code>True</code> / <code>False</code> for true-or-false.</p>
              </div>
              <div>
                <strong>Type</strong>
                <p><code>single</code>, <code>multiple</code> or <code>true_false</code>. Blank works it out from Correct.</p>
              </div>
            </div>
            <button type="button" className="btn btn-secondary" onClick={template}>
              <Icon name="download" size={15} /> Download template
            </button>
          </section>
        </div>
      )}

      {preview && (
        <div className="apximport">
          <div className="apximport__sum">
            <span className="apxstat__chip apxstat__chip--up"><Icon name="checkCircle" size={13} />{preview.valid} ready</span>
            {preview.invalid > 0 && (
              <span className="apxstat__chip apxstat__chip--warn"><Icon name="alert" size={13} />{preview.invalid} skipped</span>
            )}
            <span className="apximport__after">
              After import: {preview.after} of {preview.required} questions · {preview.marksAfter} of {preview.totalMarks} marks
            </span>
          </div>
          {preview.after < preview.required && (
            <p className="apxwarn"><Icon name="alert" size={15} />Still {preview.required - preview.after} short of what the exam needs to be published.</p>
          )}
          {preview.errors?.some((e) => e.overflow) && (
            <p className="apxwarn">
              <Icon name="alert" size={15} />
              The exam is set for {preview.required} questions and had room for {preview.room}. Rows past that are skipped —
              raise the exam’s total questions first to import them.
            </p>
          )}
          {preview.after === preview.required && preview.marksAfter !== preview.totalMarks && (
            <p className="apxwarn">
              <Icon name="alert" size={15} />
              All questions will be in, but they carry {preview.marksAfter} marks and the exam is out of {preview.totalMarks}.
              It can’t be published until those match.
            </p>
          )}
          {preview.rows?.length > 0 && (
            <div className="table-wrap apximport__table">
              <table className="table">
                <thead><tr><th>Row</th><th>Question</th><th>Type</th><th>Answer</th><th>Marks</th></tr></thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row}>
                      <td className="apxmuted">{r.row}</td>
                      <td className="apximport__q">{r.questionText}</td>
                      <td className="apxnowrap">{QUESTION_TYPE_LABEL[r.questionType]}</td>
                      <td className="apxnowrap">{r.correct.map((c) => c.toUpperCase()).join(', ')}</td>
                      <td>{r.marks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {preview.valid > (preview.rows?.length || 0) && (
            <p className="apxform__hint">Showing the first {preview.rows.length} of {preview.valid}.</p>
          )}
          {preview.errors?.length > 0 && (
            <div className="apximport__errs">
              <strong>Skipped rows</strong>
              <ul>
                {preview.errors.map((e) => (
                  <li key={e.row}><span>Row {e.row}</span>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
