import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Spinner, Confirm } from '../../components/ui/index';
import SectionCapacityModal from '../../components/SectionCapacityModal';

const TYPE_ORDER  = ['theory', 'practical', 'elective'];
const TYPE_LABEL  = { theory: 'Theory', practical: 'Practical', elective: 'Elective' };
const TYPE_COLOR  = { theory: 'var(--primary)', practical: 'var(--success)', elective: 'var(--warning)' };

function TeacherCard({ label, teacher, onAssign, badgeVariant = 'success' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0',
      borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="avatar avatar-sm" style={{ background: badgeVariant === 'warning' ? 'var(--warning)' : 'var(--primary)' }}>
          {teacher ? teacher.name?.[0] : '?'}
        </div>
        <div>
          <div style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
          {teacher
            ? <>
                <div style={{ fontWeight: 600 }}>{teacher.name}</div>
                <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{teacher.email}</div>
              </>
            : <div style={{ color: 'var(--text-muted)', fontSize: '.87rem' }}>Not assigned</div>
          }
        </div>
      </div>
      <button className="btn btn-secondary btn-sm" onClick={onAssign}>
        {teacher ? 'Change' : 'Assign'}
      </button>
    </div>
  );
}

export default function SectionDetail() {
  const { id } = useParams();
  const { data: section, loading: loadSec, refetch: refetchSec } = useFetch(() => api.getSectionDetail(id), [id]);
  const { data: sst,     loading: loadSST, refetch: refetchSST } = useFetch(() => api.getSectionSubjectTeachers(id), [id]);
  const { data: subjects }    = useFetch(api.getSubjects);
  // Teacher list with class-teacher availability for this section's academic year
  const { data: teacherOpts, refetch: refetchOpts } = useFetch(() => api.getSectionTeacherOptions(id), [id]);
  const { data: chatGroup, refetch: refetchGroup }  = useFetch(() => api.getSectionChatGroup(id), [id]);
  // The other sections of this class. Hindi in Class 5 is rarely section A
  // alone, so the assign dialog offers its siblings alongside it.
  const classId = section?.class;
  const { data: classDetail } = useFetch(
    () => (classId ? api.getClassDetail(classId) : Promise.resolve(null)),
    [classId],
  );

  // Teacher assignment modal (shared for class teacher + vice teacher)
  const [teacherModal, setTeacherModal]   = useState(false);
  const [teacherRole, setTeacherRole]     = useState('class'); // 'class' | 'vice'
  const [selectedTeacher, setSelectedTeacher] = useState('');
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [teacherErr, setTeacherErr]       = useState('');
  const [syncingGroup, setSyncingGroup]   = useState(false);

  // Roll numbers
  const [assigningRolls, setAssigningRolls] = useState(false);
  const [assignConfirm, setAssignConfirm]   = useState(false);
  const [rollEdit, setRollEdit]             = useState(null);   // { _id, name, value }
  const [savingRoll, setSavingRoll]         = useState(false);

  // Capacity — editable after the section exists, because a class grows and the
  // seat count set on day one stops being true.
  const [capModal, setCapModal] = useState(false);

  // Subject assignment modal
  const [subjectModal, setSubjectModal]   = useState(false);
  const [savingSubject, setSavingSubject] = useState(false);
  const [subjectForm, setSubjectForm]     = useState({ subject: '', teacher: '' });
  // Section ids this assignment goes to. Seeded with the section being viewed,
  // which is the only one the old single-section dialog could ever reach.
  const [subjectSections, setSubjectSections] = useState([]);

  const openTeacherModal = (role) => {
    setTeacherRole(role);
    setTeacherErr('');
    setSelectedTeacher(
      role === 'class' ? (section?.classTeacher?._id || '') : (section?.substituteTeacher?._id || '')
    );
    setTeacherModal(true);
  };

  const handleAssignTeacher = async (e) => {
    e.preventDefault();
    setTeacherErr('');
    setSavingTeacher(true);
    try {
      const payload = teacherRole === 'class'
        ? { teacherId:     selectedTeacher }
        : { viceTeacherId: selectedTeacher };
      await api.updateSectionTeacher(id, payload);
      toast.success(teacherRole === 'class' ? 'Class teacher assigned' : 'Vice class teacher assigned');
      setTeacherModal(false);
      refetchSec();
      refetchOpts();
      refetchGroup();
    } catch (err) { setTeacherErr(err.message); toast.error(err.message); }
    finally { setSavingTeacher(false); }
  };

  const handleSyncGroup = async () => {
    setSyncingGroup(true);
    try {
      await api.syncSectionChatGroup(id);
      toast.success(chatGroup?._id ? 'Group chat updated' : 'Group chat created');
      refetchGroup();
    } catch (err) { toast.error(err.message); }
    finally { setSyncingGroup(false); }
  };

  const handleAssignRollNumbers = async () => {
    setAssigningRolls(true);
    try {
      const res = await api.assignSectionRollNumbers(id);
      toast.success(`Roll numbers assigned to ${res?.data?.assigned ?? 0} students`);
      setAssignConfirm(false);
      refetchSec();
    } catch (err) { toast.error(err.message); }
    finally { setAssigningRolls(false); }
  };

  const handleSaveRoll = async (e) => {
    e.preventDefault();
    setSavingRoll(true);
    try {
      await api.updateStudentRollNumber(id, rollEdit._id, rollEdit.value.trim());
      toast.success(`Roll number updated for ${rollEdit.name}`);
      setRollEdit(null);
      refetchSec();   // the student's own record is updated server-side too
    } catch (err) { toast.error(err.message); }
    finally { setSavingRoll(false); }
  };

  const openSubjectModal = () => {
    setSubjectForm({ subject: '', teacher: '' });
    setSubjectSections([String(id)]);
    setSubjectModal(true);
  };

  const toggleSubjectSection = (secId) => setSubjectSections((cur) =>
    cur.includes(secId) ? cur.filter((x) => x !== secId) : [...cur, secId]);

  /**
   * One section still goes through the single-section endpoint it always did;
   * several go through the class-scoped one, which checks they are all siblings
   * and skips any that already hold this exact subject-and-teacher pairing.
   */
  const handleAssignSubject = async (e) => {
    e.preventDefault();
    if (!subjectSections.length) { toast.error('Pick at least one section'); return; }
    setSavingSubject(true);
    try {
      if (subjectSections.length === 1) {
        await api.assignSectionSubjectTeacher(subjectSections[0], subjectForm);
        toast.success('Subject assigned');
      } else {
        const res = await api.assignSubjectToSections(classId, { ...subjectForm, sectionIds: subjectSections });
        const d = res?.data ?? res;
        toast.success(d.created
          ? `${d.subjectName} assigned to section${d.created === 1 ? '' : 's'} ${d.toCreate.join(', ')}`
          : 'Those sections already had this teacher for this subject');
      }
      setSubjectModal(false);
      setSubjectForm({ subject: '', teacher: '' });
      refetchSST();
      refetchGroup();
    } catch (err) { toast.error(err.message); }
    finally { setSavingSubject(false); }
  };

  const [unassignConfirm, setUnassignConfirm] = useState(null); // { subjectId, teacherId, teacherName, subjectName }
  const [unassigning, setUnassigning]         = useState(false);

  // Student enrollment — the picker is multi-select, so it holds a set of
  // chosen ids and enrols them in one call.
  const [studentModal, setStudentModal]         = useState(false);
  const [studentSearch, setStudentSearch]       = useState('');
  const [pool, setPool]                         = useState(null);   // { students, total, truncated, seats }
  const [poolLoading, setPoolLoading]           = useState(false);
  const [picked, setPicked]                     = useState([]);     // student ids, in click order
  const [showTaken, setShowTaken]               = useState(false);  // reveal students another section holds
  const [enrolling, setEnrolling]               = useState(false);
  const [removeStudentConfirm, setRemoveStudentConfirm] = useState(null);
  const [removingStudent, setRemovingStudent]   = useState(false);
  const studentSearchTimer = React.useRef(null);

  const handleUnassignTeacher = async () => {
    setUnassigning(true);
    try {
      await api.removeSectionSubjectTeacher(id, unassignConfirm.subjectId, unassignConfirm.teacherId);
      toast.success('Teacher unassigned');
      setUnassignConfirm(null);
      refetchSST();
      refetchGroup();
    } catch (err) { toast.error(err.message); }
    finally { setUnassigning(false); }
  };

  // The server decides who is a candidate — it already knows this section's
  // roster and every sibling section's, so students enrolled here never come
  // back at all and those held elsewhere come back flagged.
  const loadPool = React.useCallback(async (search = '') => {
    setPoolLoading(true);
    try {
      const res = await api.getAssignableStudents(id, { search: search.trim(), limit: 200 });
      setPool(res?.data ?? res);
    } catch (err) {
      toast.error(err.message || 'Could not load students');
      setPool({ students: [], total: 0 });
    } finally { setPoolLoading(false); }
  }, [id]);

  const openStudentModal = () => {
    setStudentModal(true);
    setStudentSearch('');
    setPicked([]);
    setShowTaken(false);
    loadPool('');
  };

  const handleStudentSearch = (val) => {
    setStudentSearch(val);
    clearTimeout(studentSearchTimer.current);
    studentSearchTimer.current = setTimeout(() => loadPool(val), 350);
  };

  const togglePick = (studentId) => {
    setPicked(prev => prev.includes(studentId)
      ? prev.filter(x => x !== studentId)
      : [...prev, studentId]);
  };

  const handleEnrollPicked = async () => {
    if (!picked.length) return;
    setEnrolling(true);
    try {
      const res = await api.assignStudentsToSection(id, picked);
      const d = res?.data ?? res;
      if (d?.enrolled?.length) {
        toast.success(d.enrolled.length === 1
          ? `${d.enrolled[0].name} enrolled`
          : `${d.enrolled.length} students enrolled`);
      }
      // Partial success is the normal case for a batch — say what did not go in
      // rather than closing on a silent half-result.
      (d?.failed || []).forEach(f => toast.error(`${f.name}: ${f.reason}`));
      if (d?.enrolled?.length) {
        setStudentModal(false);
        setPicked([]);
        refetchSec();
      } else {
        setPicked([]);
        loadPool(studentSearch);
      }
    } catch (err) { toast.error(err.message); }
    finally { setEnrolling(false); }
  };

  const handleRemoveStudent = async () => {
    setRemovingStudent(true);
    try {
      await api.removeStudentFromSection(id, removeStudentConfirm._id);
      toast.success(`${removeStudentConfirm.name} removed`);
      setRemoveStudentConfirm(null);
      refetchSec();
    } catch (err) { toast.error(err.message); }
    finally { setRemovingStudent(false); }
  };

  // Group subjects by type
  const groupedSST = (() => {
    if (!sst?.length) return [];
    const subjectMap = {};
    sst.forEach(row => {
      const sid = row.subject?._id;
      if (!subjectMap[sid]) subjectMap[sid] = { subject: row.subject, teachers: [] };
      if (row.teacher) subjectMap[sid].teachers.push(row.teacher);
    });
    const typeMap = {};
    Object.values(subjectMap).forEach(entry => {
      const type = entry.subject?.type || 'theory';
      if (!typeMap[type]) typeMap[type] = [];
      typeMap[type].push(entry);
    });
    return TYPE_ORDER.filter(t => typeMap[t]).map(t => ({ type: t, rows: typeMap[t] }));
  })();

  const teachers = teacherOpts?.teachers || [];
  // useFetch falls back to the whole envelope when data is null — a real group
  // always carries an _id.
  const group = chatGroup?._id ? chatGroup : null;

  // Rules enforced by the API, mirrored here so the picker never offers an
  // invalid choice: the two roles must differ, and a teacher may lead only one
  // class (being vice class teacher of several sections stays allowed).
  const counterpartId = teacherRole === 'class'
    ? section?.substituteTeacher?._id
    : section?.classTeacher?._id;
  const teacherChoices = teachers
    .filter(t => String(t._id) !== String(counterpartId || ''))
    .map(t => ({ ...t, blocked: teacherRole === 'class' && !!t.classTeacherOf }));

  const selectedSubject = (subjects || []).find(s => s._id === subjectForm.subject);
  const alreadyAssigned = new Set(
    (sst || []).filter(r => r.subject?._id === subjectForm.subject).map(r => r.teacher?._id).filter(Boolean)
  );
  const subjectTeachers = (selectedSubject?.teachers || []).filter(t => !alreadyAssigned.has(t._id));

  /**
   * "Anita Sharma — Maths 3 · Science 2 · total 5"
   *
   * The subject being assigned comes first, so the number that matters for this
   * decision is the one right after the name. A teacher with nothing yet is
   * labelled as such rather than left looking the same as a loaded one.
   */
  const teacherLabel = (teacher) => {
    const load = teacherOpts?.load?.[teacher._id];
    if (!load?.bySubject?.length) return `${teacher.name} — no classes yet`;
    const here  = load.bySubject.filter(x => x.subject === subjectForm.subject);
    const other = load.bySubject.filter(x => x.subject !== subjectForm.subject);
    const parts = [...here, ...other].map(x => `${x.subjectName} ${x.sections}`);
    return `${teacher.name} — ${parts.join(' · ')} · total ${load.total}`;
  };
  const enrolled = section?.enrolledStudents || [];
  const rollsAssigned = !!section?.rollNumbersAssignedAt;

  // ── Student picker, derived ────────────────────────────────────────────────
  const candidates     = pool?.students || [];
  const freeCandidates = candidates.filter(c => c.assignable);
  const takenCount     = candidates.length - freeCandidates.length;
  // Students another section holds are hidden by default — they cannot be
  // picked, and burying the real choices behind them helps nobody.
  const visibleCandidates = showTaken ? candidates : freeCandidates;
  const allFreePicked  = freeCandidates.length > 0 && freeCandidates.every(c => picked.includes(c._id));
  const toggleSelectAll = () =>
    setPicked(allFreePicked ? [] : freeCandidates.map(c => c._id));
  // null when the section has no capacity set, which the server reads as unlimited
  const seatsFree    = pool?.seats?.free ?? null;
  const overCapacity = seatsFree !== null && picked.length > seatsFree;

  if (loadSec) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <div className="breadcrumb" style={{ marginBottom: 12, fontSize: '.85rem', color: 'var(--text-muted)' }}>
        <Link to="/admin/classes" style={{ color: 'var(--primary)' }}>Classes</Link>
        <span style={{ margin: '0 6px' }}>›</span>
        <span>Section {section?.sectionName}</span>
      </div>

      <PageHeader title={`Section ${section?.sectionName || ''}`}
        subtitle={`${section?.currentCount ?? 0} / ${section?.maxStudents ?? 40} students enrolled`}
        action={<Button variant="secondary" onClick={() => setCapModal(true)}>Edit capacity</Button>} />

      {/* ── Teachers card ─────────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h3 style={{ margin: 0 }}>Teachers</h3>
        </div>
        <div className="card-body" style={{ paddingBottom: 4 }}>
          <TeacherCard
            label="Class Teacher"
            teacher={section?.classTeacher}
            onAssign={() => openTeacherModal('class')}
          />
          <TeacherCard
            label="Vice Class Teacher"
            teacher={section?.substituteTeacher}
            onAssign={() => openTeacherModal('vice')}
            badgeVariant="warning"
          />
        </div>
      </div>

      {/* ── Section teacher group chat ────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Teacher Group Chat</h3>
          <Button variant="secondary" onClick={handleSyncGroup} loading={syncingGroup}>
            {group ? 'Sync members' : 'Create group'}
          </Button>
        </div>
        <div className="card-body">
          {group ? (
            <>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>💬 {group.name}</div>
              <div style={{ fontSize: '.82rem', color: 'var(--text-muted)', marginBottom: 10 }}>
                Class teacher, vice class teacher and every subject teacher of this section.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(group.members || []).map(m => (
                  <span key={m._id} style={{
                    background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
                    padding: '2px 8px', fontSize: '.78rem',
                  }}>
                    {m.name}{m.memberRole === 'admin' ? ' (owner)' : ''}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '.88rem', margin: 0 }}>
              No group yet. It is created automatically when teachers are assigned — use “Create group” to do it now.
            </p>
          )}
        </div>
      </div>

      {/* ── Subjects grouped by type ──────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Subject Teachers</h3>
          <Button onClick={openSubjectModal}>+ Assign Subject</Button>
        </div>
        <div className="card-body" style={{ padding: loadSST ? 32 : 0 }}>
          {loadSST
            ? <div style={{ display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : !sst?.length
              ? <div style={{ padding: '24px 20px', color: 'var(--text-muted)', fontSize: '.9rem' }}>No subjects assigned yet.</div>
              : groupedSST.map(({ type, rows }) => (
                <div key={type}>
                  <div style={{
                    padding: '8px 20px', fontSize: '.75rem', fontWeight: 700, letterSpacing: '.05em',
                    textTransform: 'uppercase', color: TYPE_COLOR[type],
                    background: 'var(--bg)', borderBottom: '1px solid var(--border)',
                  }}>
                    {TYPE_LABEL[type]} ({rows.length})
                  </div>
                  <Table
                    columns={[
                      { key: 'subject',  label: 'Subject',  render: r => <strong>{r.subject?.subjectName || '—'}</strong> },
                      { key: 'code',     label: 'Code',     render: r => r.subject?.subjectCode || '—' },
                      { key: 'teachers', label: 'Teachers', render: r => r.teachers.length
                        ? <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {r.teachers.map(t => (
                              <span key={t._id} style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                background: 'var(--bg)', border: '1px solid var(--border)',
                                borderRadius: 4, padding: '2px 6px 2px 8px', fontSize: '.78rem',
                              }}>
                                {t.name}
                                <button
                                  onClick={() => setUnassignConfirm({ subjectId: r.subject._id, teacherId: t._id, teacherName: t.name, subjectName: r.subject.subjectName })}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', padding: 0, lineHeight: 1, fontSize: '.85rem' }}
                                  title="Unassign teacher"
                                >×</button>
                              </span>
                            ))}
                          </div>
                        : <span style={{ color: 'var(--text-muted)' }}>—</span>
                      },
                    ]}
                    data={rows}
                    emptyTitle=""
                  />
                </div>
              ))
          }
        </div>
      </div>

      {/* ── Enrolled Students ─────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>Enrolled Students
            <span style={{ marginLeft: 10, fontSize: '.85rem', fontWeight: 400, color: 'var(--text-muted)' }}>
              ({enrolled.length})
            </span>
          </h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {rollsAssigned ? (
              <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                ✓ Roll numbers assigned {new Date(section.rollNumbersAssignedAt).toLocaleDateString()} — edit individually below
              </span>
            ) : (
              <Button variant="secondary" onClick={() => setAssignConfirm(true)} disabled={!enrolled.length}>
                Assign Roll Numbers
              </Button>
            )}
            <Button onClick={openStudentModal}>+ Assign Students</Button>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <Table
            columns={[
              { key: 'rollNumber', label: 'Roll No', render: r => (
                <button
                  onClick={() => setRollEdit({ _id: r._id, name: r.name, value: r.rollNumber || '' })}
                  title="Click to edit roll number"
                  style={{
                    background: 'none', border: '1px dashed var(--border)', borderRadius: 4,
                    padding: '2px 10px', cursor: 'pointer', fontWeight: r.rollNumber ? 600 : 400,
                    color: r.rollNumber ? 'var(--text)' : 'var(--text-muted)', minWidth: 46,
                  }}>
                  {r.rollNumber || 'Set'}
                </button>
              )},
              { key: 'name', label: 'Student', render: r => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar avatar-sm" style={{ background: 'var(--success)' }}>{r.name?.[0]}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{r.email}</div>
                  </div>
                </div>
              )},
              { key: 'gender',     label: 'Gender',  render: r => r.gender     || '—' },
              { key: 'admNo',      label: 'Adm. No', render: r => r.admissionNumber || '—' },
              { key: 'actions',    label: '',        render: r => (
                <button className="btn btn-danger btn-sm" onClick={() => setRemoveStudentConfirm(r)}>Remove</button>
              )},
            ]}
            data={enrolled}
            emptyIcon="👨‍🎓"
            emptyTitle="No students enrolled in this section"
          />
        </div>
      </div>

      {/* ── Assign Teacher Modal ─────────────────────────────────────────── */}
      <Modal open={teacherModal} onClose={() => setTeacherModal(false)}
        title={teacherRole === 'class' ? 'Assign Class Teacher' : 'Assign Vice Class Teacher'}
        footer={<>
          <Button variant="secondary" onClick={() => setTeacherModal(false)}>Cancel</Button>
          <Button form="teacher-assign-form" type="submit" loading={savingTeacher}>Save</Button>
        </>}>
        <form id="teacher-assign-form" onSubmit={handleAssignTeacher}>
          {teacherErr && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
              borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: '.85rem', marginBottom: 14 }}>
              {teacherErr}
            </div>
          )}
          <div className="form-group">
            <label className="form-label">Select Teacher</label>
            <select className={`form-control${teacherErr ? ' error' : ''}`} value={selectedTeacher}
              onChange={e => { setTeacherErr(''); setSelectedTeacher(e.target.value); }}>
              <option value="">— None / Remove —</option>
              {teacherChoices.map(t => (
                <option key={t._id} value={t._id} disabled={t.blocked}>
                  {t.name}{t.classTeacherOf ? ` — class teacher of ${t.classTeacherOf}` : ''}
                </option>
              ))}
            </select>
            <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginTop: 6 }}>
              {teacherRole === 'class'
                ? 'A teacher can be class teacher of only one class. Teachers already leading a class are greyed out.'
                : 'A vice class teacher may also be a class teacher elsewhere, and may be vice class teacher of several sections — only this section’s class teacher is excluded.'}
            </p>
          </div>
        </form>
      </Modal>

      {/* ── Unassign Teacher Confirm ─────────────────────────────────────── */}
      <Confirm
        open={!!unassignConfirm}
        onClose={() => setUnassignConfirm(null)}
        onConfirm={handleUnassignTeacher}
        loading={unassigning}
        title="Unassign Teacher"
        message={unassignConfirm
          ? `Are you sure you want to remove ${unassignConfirm.teacherName} from teaching ${unassignConfirm.subjectName} in this section?`
          : ''}
      />

      <SectionCapacityModal
        open={capModal}
        section={section}
        onClose={() => setCapModal(false)}
        onSaved={() => { refetchSec(); refetchOpts(); }}
      />

      {/* ── Assign Subject Modal ─────────────────────────────────────────── */}
      <Modal open={subjectModal} onClose={() => setSubjectModal(false)} title="Assign Subject Teacher"
        footer={<>
          <Button variant="secondary" onClick={() => setSubjectModal(false)}>Cancel</Button>
          <Button form="subject-assign-form" type="submit" loading={savingSubject} disabled={!subjectSections.length}>
            {subjectSections.length > 1 ? `Assign to ${subjectSections.length} sections` : 'Assign'}
          </Button>
        </>}>
        <form id="subject-assign-form" onSubmit={handleAssignSubject}>
          <div className="form-group">
            <label className="form-label required">Subject</label>
            <select className="form-control" required value={subjectForm.subject}
              onChange={e => setSubjectForm(f => ({ ...f, subject: e.target.value, teacher: '' }))}>
              <option value="">— Choose subject —</option>
              {(subjects || []).map(s => (
                <option key={s._id} value={s._id}>
                  {s.subjectName}{s.subjectCode ? ` (${s.subjectCode})` : ''} — {TYPE_LABEL[s.type] || s.type}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Teacher</label>
            {subjectForm.subject && subjectTeachers.length === 0
              ? <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginTop: 6 }}>
                  No teachers assigned to this subject. Assign teachers from the Subjects page first.
                </p>
              : <select className="form-control" required value={subjectForm.teacher}
                  onChange={e => setSubjectForm(f => ({ ...f, teacher: e.target.value }))}
                  disabled={!subjectForm.subject}>
                  <option value="">— Choose teacher —</option>
                  {subjectTeachers.map(t => (
                    <option key={t._id} value={t._id}>{teacherLabel(t)}</option>
                  ))}
                </select>
            }
          </div>

          {/* Sections of this class. Ticking several writes the subject to all
              of them in one action — the whole point on a setup day, where
              Hindi goes to A, B, C and D identically. */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label required">Sections</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(classDetail?.sections || []).map((sec) => {
                const sid = String(sec._id);
                const on  = subjectSections.includes(sid);
                return (
                  <button key={sid} type="button" onClick={() => toggleSubjectSection(sid)}
                    style={{
                      border: `1px solid ${on ? 'var(--primary)' : 'var(--border)'}`,
                      background: on ? 'var(--primary)' : 'var(--bg-card)',
                      color: on ? 'var(--text-on-primary)' : 'var(--text)',
                      borderRadius: 99, padding: '5px 14px', fontSize: '.82rem', fontWeight: 600,
                      cursor: 'pointer',
                    }}>
                    {sec.sectionName}{sid === String(id) ? ' · this one' : ''}
                  </button>
                );
              })}
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', margin: '8px 0 0', lineHeight: 1.6 }}>
              {subjectSections.length > 1
                ? `This teacher takes this subject in ${subjectSections.length} sections. Any section that already has this exact pairing is left alone.`
                : 'Tick more sections to assign the same subject and teacher to all of them at once.'}
            </p>
          </div>
        </form>
      </Modal>

      {/* ── Assign Students Modal ────────────────────────────────────────── */}
      <Modal open={studentModal} onClose={() => setStudentModal(false)} title="Assign Students to Section" maxWidth={620}
        footer={<>
          <span style={{ flex: 1, alignSelf: 'center', fontSize: '.82rem', color: 'var(--text-muted)' }}>
            {picked.length ? `${picked.length} selected` : 'Select one or more students'}
          </span>
          <Button variant="secondary" onClick={() => setStudentModal(false)}>Cancel</Button>
          <Button onClick={handleEnrollPicked} loading={enrolling} disabled={!picked.length || overCapacity}>
            {picked.length > 1 ? `Enroll ${picked.length} students` : 'Enroll'}
          </Button>
        </>}>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label className="form-label">Search by name or email</label>
          <input className="form-control" placeholder="Type to search — or pick from the list below…"
            value={studentSearch} onChange={e => handleStudentSearch(e.target.value)} autoFocus />
        </div>

        {/* Seats left, so a batch bigger than the section is caught before saving */}
        {seatsFree !== null && (
          <p style={{ fontSize: '.78rem', margin: '0 0 10px',
            color: overCapacity ? 'var(--danger)' : 'var(--text-muted)' }}>
            {overCapacity
              ? `Only ${seatsFree} seat${seatsFree === 1 ? '' : 's'} left in this section — ${picked.length} selected.`
              : `${seatsFree} of ${pool?.seats?.capacity} seat${seatsFree === 1 ? '' : 's'} free.`}
          </p>
        )}

        {poolLoading ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}><Spinner /></div>
        ) : visibleCandidates.length === 0 ? (
          <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>
            {studentSearch
              ? 'No students match that search who are not already in this section.'
              : 'Every student is already enrolled in a section.'}
          </p>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6, fontSize: '.78rem' }}>
              <button type="button" onClick={toggleSelectAll}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0 }}>
                {allFreePicked ? 'Clear selection' : `Select all ${freeCandidates.length}`}
              </button>
              <span style={{ color: 'var(--text-muted)' }}>
                {freeCandidates.length} available
                {takenCount > 0 && ` · ${takenCount} in another section`}
              </span>
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', maxHeight: 340, overflowY: 'auto' }}>
              {visibleCandidates.map(st => {
                const checked  = picked.includes(st._id);
                const blocked  = !st.assignable;
                return (
                  <label key={st._id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
                      borderBottom: '1px solid var(--border)',
                      cursor: blocked ? 'not-allowed' : 'pointer',
                      background: checked ? '#eef2ff' : 'transparent',
                      opacity: blocked ? .55 : 1,
                    }}>
                    <input type="checkbox" checked={checked} disabled={blocked}
                      onChange={() => togglePick(st._id)} style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '.88rem' }}>{st.name}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--text-muted)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {st.email}{st.admissionNumber ? ` · Adm. ${st.admissionNumber}` : ''}
                      </div>
                    </div>
                    {blocked
                      ? <span style={{ fontSize: '.72rem', color: 'var(--warning)', flexShrink: 0 }}>{st.enrolledIn}</span>
                      : st.sameClass
                        ? <Badge variant="success">This class</Badge>
                        : <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>No section</span>}
                  </label>
                );
              })}
            </div>

            {takenCount > 0 && (
              <button type="button" onClick={() => setShowTaken(v => !v)}
                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer',
                  padding: '8px 0 0', fontSize: '.78rem' }}>
                {showTaken
                  ? 'Hide students enrolled elsewhere'
                  : `Show ${takenCount} student${takenCount === 1 ? '' : 's'} enrolled in another section`}
              </button>
            )}
            {pool?.truncated && (
              <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 8, marginBottom: 0 }}>
                Showing the first {pool.students.length} of {pool.total} — narrow it down with the search box.
              </p>
            )}
          </>
        )}
      </Modal>

      {/* ── Assign Roll Numbers Confirm ──────────────────────────────────── */}
      <Confirm
        open={assignConfirm}
        onClose={() => setAssignConfirm(false)}
        onConfirm={handleAssignRollNumbers}
        loading={assigningRolls}
        title="Assign Roll Numbers"
        message={`Roll numbers 1–${enrolled.length} will be given to the ${enrolled.length} enrolled student${enrolled.length !== 1 ? 's' : ''} in alphabetical name order. This can only be done once — afterwards you can still edit individual roll numbers.`}
      />

      {/* ── Edit single roll number ──────────────────────────────────────── */}
      <Modal open={!!rollEdit} onClose={() => setRollEdit(null)} title="Update Roll Number"
        footer={<>
          <Button variant="secondary" onClick={() => setRollEdit(null)}>Cancel</Button>
          <Button form="roll-form" type="submit" loading={savingRoll}>Save</Button>
        </>}>
        <form id="roll-form" onSubmit={handleSaveRoll}>
          <div className="form-group">
            <label className="form-label">Roll number for <strong>{rollEdit?.name}</strong></label>
            <input className="form-control" autoFocus value={rollEdit?.value || ''}
              onChange={e => setRollEdit(r => ({ ...r, value: e.target.value }))}
              placeholder="e.g. 12" />
            <p style={{ fontSize: '.75rem', color: 'var(--text-muted)', marginTop: 6, marginBottom: 0 }}>
              Must be unique within this section. Leave blank to clear it. The change also updates the student's record.
            </p>
          </div>
        </form>
      </Modal>

      {/* ── Remove Student Confirm ───────────────────────────────────────── */}
      <Confirm
        open={!!removeStudentConfirm}
        onClose={() => setRemoveStudentConfirm(null)}
        onConfirm={handleRemoveStudent}
        loading={removingStudent}
        title="Remove Student"
        message={removeStudentConfirm ? `Remove ${removeStudentConfirm.name} from this section?` : ''}
      />
    </div>
  );
}
