/**
 * Results → Electives (Oct 2026): who in a section takes which optional
 * subject (school-backend services/resultElectives).
 *
 * Every subject of an exam used to be every student's, so a student who takes
 * French was marked absent in Sanskrit — and failed the exam for it. A subject
 * given takers here is theirs alone: on its marks sheets, class tests, results
 * and exam timetable. A subject with none is the whole section's, as before.
 *
 * The office sets them for any section (`role="admin"`); a class or vice class
 * teacher for their own sections (`role="teacher"`, the teacher endpoints).
 * Published results keep the figures they were published with — the reply
 * says so when the subject is on one.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as adminApi from '../../../api/admin.api';
import * as teacherApi from '../../../api/teacher.api';
import { Modal } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Btn, Badge, Check, Empty, Ico, SearchBox, SelectField, fmtStamp, plural, useBoard } from '../rsUI';

/** Choose a subject's takers — or give it back to the whole section. */
function Takers({ subject, students, onClose, onSave }) {
  const [everyone, setEveryone] = useState(!subject.elective);
  const [picked, setPicked] = useState(() => new Set(subject.students || []));
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const q = search.trim().toLowerCase();
  const shown = q ? students.filter((s) => `${s.name} ${s.rollNumber} ${s.admissionNumber}`.toLowerCase().includes(q)) : students;
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allShown = shown.length > 0 && shown.every((s) => picked.has(s._id));
  const go = async () => {
    if (!everyone && !picked.size) { setError('Tick the students who take it — or let the whole section take it'); return; }
    setBusy(true); setError('');
    try { await onSave(everyone ? null : [...picked]); } catch (e) { setError(e.message || 'That did not work'); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={560}
      title={<span className="rs-ask__title rs-t-indigo"><i><Ico name="users" size={18} /></i><span>{subject.subjectName}<small>Who takes it</small></span></span>}
      footer={<>
        <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn kind="primary" busy={busy} onClick={go}>{everyone ? 'Save — Whole Section' : `Save — ${plural(picked.size, 'Student')}`}</Btn>
      </>}>
      <div className="rs-ask">
        <div className="rs-elx__mode" role="radiogroup" aria-label="Who takes it">
          <label className={`rsf-radio${everyone ? ' is-on' : ''}`}>
            <input type="radio" name="elx-mode" checked={everyone} onChange={() => setEveryone(true)} />
            <span className="rsf-radio__dot" aria-hidden />
            <span><strong>The whole section</strong><small>Every student is examined in it</small></span>
          </label>
          <label className={`rsf-radio${!everyone ? ' is-on' : ''}`}>
            <input type="radio" name="elx-mode" checked={!everyone} onChange={() => setEveryone(false)} />
            <span className="rsf-radio__dot" aria-hidden />
            <span><strong>Only some students</strong><small>An elective: only its takers sit it</small></span>
          </label>
        </div>
        {!everyone ? (
          <>
            <div className="rs-elx__tools">
              <SearchBox value={search} onChange={setSearch} placeholder="Search students..." label="Search students" />
              <Btn size="sm" onClick={() => setPicked((s) => {
                const n = new Set(s);
                shown.forEach((x) => (allShown ? n.delete(x._id) : n.add(x._id)));
                return n;
              })}>{allShown ? 'Untick These' : 'Tick These'}</Btn>
            </div>
            <ul className="rs-pick">
              {shown.map((s) => (
                <li key={s._id}>
                  <Check checked={picked.has(s._id)} onChange={() => toggle(s._id)} label={s.name} />
                  <span><strong>{s.name}</strong><small>{[s.rollNumber ? `Roll ${s.rollNumber}` : '', s.admissionNumber].filter(Boolean).join(' · ')}</small></span>
                </li>
              ))}
              {!shown.length ? <li className="rs-muted">{students.length ? 'Nobody matches this search.' : 'This section has no students.'}</li> : null}
            </ul>
            <p className="rs-elx__count">{plural(picked.size, 'student')} of {students.length} take {subject.subjectName}.</p>
          </>
        ) : null}
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}

export default function Electives({ role = 'admin' }) {
  const nav = useNavigate();
  const api = role === 'teacher' ? teacherApi : adminApi;
  const home = role === 'teacher' ? '/teacher/results' : '/admin/results';
  usePageCrumbs([{ label: 'Electives' }]);
  const [year, setYear] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [editing, setEditing] = useState(null);
  const query = useMemo(() => ({ ...(year ? { academicYear: year } : null), ...(sectionId ? { sectionId } : null) }), [year, sectionId]);
  const { body, loading, error, reload } = useBoard(api.getElectives, query);
  const b = body?.data || null;
  // The server picks the year and section when none is chosen: show its pick.
  useEffect(() => {
    if (!b) return;
    if (!year && b.year?._id) setYear(String(b.year._id));
    if (!sectionId && b.section?._id) setSectionId(String(b.section._id));
  }, [b, year, sectionId]);

  const save = async (students) => {
    const res = await api.saveElective({ sectionId: b.section._id, subjectId: editing._id, students });
    const out = res.data ?? res;
    toast.success(students ? `${editing.subjectName}: ${plural(students.length, 'student')} take it` : `${editing.subjectName} is the whole section's subject again`);
    if (out?.note) toast(out.note, { duration: 8000, icon: 'ℹ️' });
    setEditing(null);
    reload();
  };

  const subjects = b?.subjects || [];
  const students = b?.students || [];
  const nameOf = new Map(students.map((s) => [String(s._id), s.name]));
  return (
    <div className="rs-page">
      <PageHead title="Electives" subtitle="Who takes which optional subject. A subject with takers is theirs alone — on its marks sheets, class tests, results and exam timetable.">
        <Btn size="lg" icon="arrowLeft" onClick={() => nav(home)}>Back to Results</Btn>
      </PageHead>

      <section className="rs-card" aria-label="Electives">
        <div className="rs-filters">
          <SelectField label="Academic Year" width={200} value={year} onChange={(v) => { setYear(v); setSectionId(''); }}
            options={(b?.years || []).map((y) => ({ value: String(y._id), label: `${y.yearName}${y.current ? ' (Current)' : ''}` }))} />
          <SelectField label="Section" width={220} value={sectionId} onChange={setSectionId}
            options={(b?.sections || []).map((s) => ({ value: String(s._id), label: [s.className, s.sectionName].filter(Boolean).join(' – ') }))} />
        </div>

        <div className="rs-tablearea">
          <div className={`rs-tablebox${loading && body ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
            {!b && loading ? <div className="rs-loading" role="status">Loading…</div>
              : error && !b ? <Empty title="Electives could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty>
                : !b?.section ? (
                  <Empty title="No section to show">{role === 'teacher' ? 'Electives are set by a section\'s class teacher — you are not the class teacher of a section this year.' : 'This year has no sections yet.'}</Empty>
                ) : !subjects.length ? (
                  <Empty title="No subjects">This section's class has no subjects, and none is taught in it yet.</Empty>
                ) : (
                  <div className="rs-tablescroll">
                    <table className="rs-table rs-table--rows">
                      <thead><tr><th>Subject</th><th>Taken by</th><th>Last set</th><th className="is-right rs-table__acts">Actions</th></tr></thead>
                      <tbody>
                        {subjects.map((s) => (
                          <tr key={s._id}>
                            <td>
                              <span className="rs-name rs-name--static">
                                <strong>{s.subjectName}</strong>
                                <span className="rs-sub">{[s.subjectCode, s.type === 'elective' ? 'an elective subject' : ''].filter(Boolean).join(' · ')}</span>
                              </span>
                            </td>
                            <td data-label="Taken by">
                              {s.elective ? (
                                <>
                                  <Badge tone="violet" dot={false}>{plural(s.students.length, 'student')}</Badge>
                                  <span className="rs-sub rs-elx__names" title={s.students.map((id) => nameOf.get(String(id))).filter(Boolean).join(', ')}>
                                    {s.students.slice(0, 4).map((id) => nameOf.get(String(id))).filter(Boolean).join(', ')}{s.students.length > 4 ? ` and ${s.students.length - 4} more` : ''}
                                  </span>
                                </>
                              ) : <span className="rs-muted">The whole section ({students.length})</span>}
                            </td>
                            <td data-label="Last set">{s.updatedAt ? [s.updatedBy, fmtStamp(s.updatedAt)].filter(Boolean).join(' · ') : <span className="rs-muted">—</span>}</td>
                            <td className="is-right rs-table__acts">
                              <Btn size="sm" icon="users" onClick={() => setEditing(s)}>{s.elective ? 'Change Takers' : 'Make Elective'}</Btn>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
          </div>
        </div>
      </section>
      <p className="rs-pagenote">A subject's takers are used from the next marks sheet, class test or result worked out. Results already published keep the figures they were published with, until they are withdrawn and published again.</p>

      {editing && b?.section ? <Takers subject={editing} students={students} onClose={() => setEditing(null)} onSave={save} /> : null}
    </div>
  );
}
