/**
 * Admin → Classes → a class → one section.
 *
 * The bottom of the academic tree, and the only page where the three things a
 * section is made of meet: the teachers in front of it, the subjects taught in
 * it, and the students sitting in it. Laid out in that order, on the same frame
 * as the lists above it (listParts.jsx) — a compact identity header, four
 * tiles, the panels, then what still needs doing.
 *
 * The panels are display only (sectionDetailParts.jsx); every dialog stays here,
 * because each one is wired to a fetch and a mutation.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { useAuth } from '../../contexts/AuthContext';
import { Alert, Badge, Button, Confirm, Modal, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import SectionCapacityModal from '../../components/SectionCapacityModal';
import {
  Crumbs, ListStats, ListStat, ListTable, ListFooter, SearchField,
  RowActions, IconAction, RowMenu, MenuItem, MenuSep, PageFoot,
} from './listParts';
import { SectionChip, StatusBadge, fillOf } from './sectionParts';
import {
  Blank, ChatPanel, RollButton, SectionMeta, SectionSetupPanel, StudentIdentity,
  SubjectBoard, TeacherSlot, TYPE_LABEL, TYPE_ORDER,
} from './sectionDetailParts';

const ROLL_FILTERS = [
  { value: '',     label: 'All students' },
  { value: 'with', label: 'With a roll number' },
  { value: 'none', label: 'Without a roll number' },
];

const STATUSES = [
  { value: '',         label: 'All status' },
  { value: 'active',   label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

export default function SectionDetail() {
  const { id } = useParams();
  const { user: me } = useAuth();

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

  const [unassignConfirm, setUnassignConfirm] = useState(null);
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

  // The roster's own controls: it is the longest thing on the page, and in a
  // full section it is 40 rows.
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterTerm,   setRosterTerm]   = useState('');
  const [rollFilter,   setRollFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page,  setPage]  = useState(1);
  const [limit, setLimit] = useState(10);

  useEffect(() => {
    const t = setTimeout(() => { setRosterTerm(rosterSearch.trim().toLowerCase()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [rosterSearch]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const openTeacherModal = (role) => {
    setTeacherRole(role);
    setTeacherErr('');
    setSelectedTeacher(
      role === 'class' ? (section?.classTeacher?._id || '') : (section?.substituteTeacher?._id || ''),
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
    setPicked((prev) => (prev.includes(studentId)
      ? prev.filter((x) => x !== studentId)
      : [...prev, studentId]));
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
      (d?.failed || []).forEach((f) => toast.error(`${f.name}: ${f.reason}`));
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

  // ── Derived ────────────────────────────────────────────────────────────────
  // Subjects grouped by type, each with everyone who takes it here.
  const groupedSST = useMemo(() => {
    if (!sst?.length) return [];
    const bySubject = {};
    sst.forEach((row) => {
      const sid = row.subject?._id;
      if (!bySubject[sid]) bySubject[sid] = { subject: row.subject, teachers: [] };
      if (row.teacher) bySubject[sid].teachers.push(row.teacher);
    });
    const byType = {};
    Object.values(bySubject).forEach((entry) => {
      const type = entry.subject?.type || 'theory';
      (byType[type] = byType[type] || []).push(entry);
    });
    return TYPE_ORDER.filter((t) => byType[t]).map((t) => ({ type: t, rows: byType[t] }));
  }, [sst]);

  const subjectsTaught = useMemo(
    () => new Set((sst || []).map((r) => r.subject?._id).filter(Boolean)).size,
    [sst],
  );

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
    .filter((t) => String(t._id) !== String(counterpartId || ''))
    .map((t) => ({ ...t, blocked: teacherRole === 'class' && !!t.classTeacherOf }));

  const selectedSubject = (subjects || []).find((s) => s._id === subjectForm.subject);
  const alreadyAssigned = new Set(
    (sst || []).filter((r) => r.subject?._id === subjectForm.subject).map((r) => r.teacher?._id).filter(Boolean),
  );
  const subjectTeachers = (selectedSubject?.teachers || []).filter((t) => !alreadyAssigned.has(t._id));

  /**
   * "Anita Sharma (Maths · PGT) — Maths 3 · Science 2 · total 5"
   *
   * Who they are, then how loaded they are. The department and designation are
   * what separate two teachers with the same name; the load is what decides
   * between them once you know which one you mean. The subject being assigned
   * comes first among the counts, so the number that matters for this decision
   * is the one right after the dash.
   */
  const teacherIdentity = (teacher) => {
    const bits = [teacher.department, teacher.designation].filter(Boolean);
    return bits.length ? `${teacher.name} (${bits.join(' · ')})` : teacher.name;
  };
  const teacherLabel = (teacher) => {
    const who  = teacherIdentity(teacher);
    const load = teacherOpts?.load?.[teacher._id];
    if (!load?.bySubject?.length) return `${who} — no classes yet`;
    const here  = load.bySubject.filter((x) => x.subject === subjectForm.subject);
    const other = load.bySubject.filter((x) => x.subject !== subjectForm.subject);
    const parts = [...here, ...other].map((x) => `${x.subjectName} ${x.sections}`);
    return `${who} — ${parts.join(' · ')} · total ${load.total}`;
  };

  const enrolled = useMemo(() => section?.enrolledStudents || [], [section]);
  const rollsAssigned = !!section?.rollNumbersAssignedAt;
  const withRoll = enrolled.filter((s) => s.rollNumber).length;

  // ── The roster ─────────────────────────────────────────────────────────────
  const roster = useMemo(() => enrolled.filter((s) => {
    if (rollFilter === 'with' && !s.rollNumber) return false;
    if (rollFilter === 'none' && s.rollNumber)  return false;
    if (statusFilter === 'active'   && s.isActive === false) return false;
    if (statusFilter === 'inactive' && s.isActive !== false) return false;
    if (rosterTerm && !`${s.name} ${s.email || ''} ${s.admissionNumber || ''}`.toLowerCase().includes(rosterTerm)) return false;
    return true;
  }), [enrolled, rollFilter, statusFilter, rosterTerm]);

  const pages = Math.max(1, Math.ceil(roster.length / limit));
  const start = (Math.min(page, pages) - 1) * limit;
  const shown = roster.slice(start, start + limit);
  const rosterFiltered = !!rosterTerm || !!rollFilter || !!statusFilter;
  const resetRoster = () => { setRosterSearch(''); setRosterTerm(''); setRollFilter(''); setStatusFilter(''); setPage(1); };

  // ── Student picker, derived ────────────────────────────────────────────────
  const candidates     = pool?.students || [];
  const freeCandidates = candidates.filter((c) => c.assignable);
  const takenCount     = candidates.length - freeCandidates.length;
  // Students another section holds are hidden by default — they cannot be
  // picked, and burying the real choices behind them helps nobody.
  const visibleCandidates = showTaken ? candidates : freeCandidates;
  const allFreePicked  = freeCandidates.length > 0 && freeCandidates.every((c) => picked.includes(c._id));
  const toggleSelectAll = () => setPicked(allFreePicked ? [] : freeCandidates.map((c) => c._id));
  // null when the section has no capacity set, which the server reads as unlimited
  const seatsFree    = pool?.seats?.free ?? null;
  const overCapacity = seatsFree !== null && picked.length > seatsFree;

  if (loadSec && !section) return <div className="loading-page"><Spinner /></div>;

  if (!section) {
    return (
      <div className="page listpg">
        <Crumbs here="Section" trail={[{ to: '/admin/classes', label: 'Classes' }]} />
        <Alert variant="danger">This section could not be found.</Alert>
        <div><Link to="/admin/classes" className="btn btn-secondary">Back to Classes</Link></div>
      </div>
    );
  }

  const fill = fillOf({ ...section, studentCount: enrolled.length });

  const columns = [
    {
      key: 'roll',
      className: 'sdcol-roll',
      label: 'Roll No',
      render: (s) => <RollButton student={s} onEdit={(st) => setRollEdit({ _id: st._id, name: st.name, value: st.rollNumber || '' })} />,
    },
    { key: 'student', className: 'sdcol-name', label: 'Student', render: (s) => <StudentIdentity student={s} /> },
    { key: 'gender',  className: 'sdcol-small', label: 'Gender',  render: (s) => s.gender || <Blank /> },
    { key: 'adm',     className: 'sdcol-small', label: 'Adm. No', render: (s) => s.admissionNumber || <Blank /> },
    {
      key: 'status',
      className: 'sdcol-small',
      label: 'Status',
      render: (s) => <Badge variant={s.isActive === false ? 'muted' : 'success'}>{s.isActive === false ? 'Inactive' : 'Active'}</Badge>,
    },
    {
      key: 'actions',
      className: 'ltable__acts',
      label: 'Actions',
      render: (s) => (
        <RowActions>
          <IconAction icon="idCard" label="Edit roll number"
            onClick={() => setRollEdit({ _id: s._id, name: s.name, value: s.rollNumber || '' })} />
          <RowMenu>
            <MenuItem icon="user" to={`/admin/students?search=${encodeURIComponent(s.name)}`}>Open in Students</MenuItem>
            <MenuSep />
            <MenuItem icon="logOut" danger onClick={() => setRemoveStudentConfirm(s)}>Remove from section</MenuItem>
          </RowMenu>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="page listpg">
      <div className="sectop">
        <Crumbs
          here={`Section ${section.sectionName}`}
          trail={[
            { to: '/admin/classes', label: 'Classes' },
            ...(section.className ? [{ to: `/admin/classes/${section.class}`, label: section.className }] : []),
          ]}
        />
        <div className="sectop__acts">
          <Link to={`/admin/classes/${section.class}`} className="btn btn-secondary btn-sm">
            <Icon name="chevronLeft" size={14} /> Back to {section.className || 'class'}
          </Link>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCapModal(true)}>
            <Icon name="sliders" size={14} /> Edit capacity
          </button>
        </div>
      </div>

      {/* A detail page names one record, so the header is the record itself —
          no spot drawing, no quotation. */}
      <header className="sdhero">
        <SectionChip sec={section} size={54} />
        <div className="sdhero__id">
          <h1>Section {section.sectionName} <StatusBadge status={section.status} /></h1>
          <SectionMeta section={section} />
        </div>
      </header>

      <ListStats>
        <ListStat icon="student" tone="indigo" value={enrolled.length} label="Enrolled Students"
          caption={(
            <>
              of {section.maxStudents ?? 0} seats · {fill.pct}% full
              <span className="secmeter" aria-hidden><span style={{ width: `${fill.pct}%` }} /></span>
            </>
          )} />
        <ListStat icon="teacher" tone="green" value={section.classTeacher ? 1 : 0} label="Class Teacher"
          caption={section.classTeacher ? section.classTeacher.name : 'Nobody assigned yet'} />
        <ListStat icon="users" tone="amber" value={sst?.length || 0} label="Subject Teachers"
          caption={subjectsTaught ? `Across ${subjectsTaught} subject${subjectsTaught === 1 ? '' : 's'}` : 'None assigned'} />
        <ListStat icon="book" tone="blue" value={subjectsTaught} label="Subjects Taught"
          caption={section.classSubjectCount
            ? `of ${section.classSubjectCount} on ${section.className || 'the class'}`
            : 'The class has no subjects yet'} />
      </ListStats>

      {section.classStatus && section.classStatus !== 'active' && (
        <Alert variant="info">
          {section.className} is {section.classStatus}. This section is kept exactly as it is and stays out
          of the active class list until the class is activated again.
        </Alert>
      )}

      <div className="sdgrid">
        {/* ── Teachers ───────────────────────────────────────────────────── */}
        <section className="card sdpanel">
          <div className="sdpanel__head">
            <div>
              <h2>Teachers</h2>
              <p>Who leads this section, and who stands in.</p>
            </div>
          </div>
          <div className="sdpanel__body">
            <TeacherSlot
              label="Class teacher"
              hint="Runs the section — attendance, the roster and the parents."
              teacher={section.classTeacher}
              tone="indigo"
              onAssign={() => openTeacherModal('class')}
            />
            <TeacherSlot
              label="Vice class teacher"
              hint="Stands in when the class teacher is away. Optional."
              teacher={section.substituteTeacher}
              tone="amber"
              onAssign={() => openTeacherModal('vice')}
            />
          </div>
        </section>

        {/* ── Subjects ───────────────────────────────────────────────────── */}
        <section className="card sdpanel">
          <div className="sdpanel__head">
            <div>
              <h2>Subjects &amp; subject teachers</h2>
              <p>
                {section.classSubjectCount
                  ? `${subjectsTaught} of ${section.classSubjectCount} subjects on ${section.className} are taught here.`
                  : 'Assign the class its subjects first, on the Subjects page.'}
              </p>
            </div>
            <Button onClick={openSubjectModal}><Icon name="plus" size={15} /> Assign Subject</Button>
          </div>
          <div className="sdpanel__body sdpanel__body--flush">
            <SubjectBoard
              groups={groupedSST}
              loading={loadSST}
              onAssign={openSubjectModal}
              onUnassign={(subject, teacher) => setUnassignConfirm({
                subjectId: subject._id, teacherId: teacher._id,
                teacherName: teacher.name, subjectName: subject.subjectName,
              })}
            />
          </div>
        </section>
      </div>

      {/* ── Enrolled students ────────────────────────────────────────────── */}
      <section className="card">
        <div className="sdpanel__head">
          <div>
            <h2>Enrolled students <span className="sdcount">{enrolled.length}</span></h2>
            <p>
              {rollsAssigned
                ? `Roll numbers were given out on ${new Date(section.rollNumbersAssignedAt).toLocaleDateString()} — edit any of them below.`
                : enrolled.length
                  ? `${withRoll} of ${enrolled.length} have a roll number.`
                  : 'Nobody is in this section yet.'}
            </p>
          </div>
          <div className="ltools__acts">
            {!rollsAssigned && (
              <Button variant="secondary" onClick={() => setAssignConfirm(true)} disabled={!enrolled.length}>
                <Icon name="idCard" size={16} /> Assign Roll Numbers
              </Button>
            )}
            <Button onClick={openStudentModal}><Icon name="userPlus" size={16} /> Add Students</Button>
          </div>
        </div>

        {enrolled.length > 0 && (
          <div className="ltools">
            <SearchField value={rosterSearch} onChange={setRosterSearch}
              placeholder="Search this section by name, email or admission number…" />
            <select className={`form-control lsel${rollFilter ? ' lfsel--on' : ''}`} value={rollFilter}
              onChange={(e) => { setRollFilter(e.target.value); setPage(1); }} aria-label="Roll number">
              {ROLL_FILTERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select className={`form-control lsel${statusFilter ? ' lfsel--on' : ''}`} value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} aria-label="Account status">
              {STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {rosterFiltered && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={resetRoster}>
                <Icon name="refresh" size={14} /> Reset
              </button>
            )}
          </div>
        )}

        <ListTable
          columns={columns}
          rows={shown}
          startIndex={start}
          emptyIcon={rosterFiltered ? '🔍' : '🪑'}
          emptyTitle={rosterFiltered ? 'No students match' : 'Nobody is in this section yet'}
          emptyMessage={rosterFiltered
            ? 'Try another search term or filter.'
            : 'Add students admitted to this class, or shuffle the class to spread them across its sections.'}
          emptyAction={rosterFiltered
            ? <Button variant="secondary" onClick={resetRoster}>Clear filters</Button>
            : <Button onClick={openStudentModal}>Add students</Button>}
        />

        {enrolled.length > 0 && (
          <ListFooter
            page={Math.min(page, pages)} pages={pages} total={roster.length}
            limit={limit} count={shown.length} noun="student"
            onPage={setPage} onLimit={(n) => { setLimit(n); setPage(1); }}
          />
        )}
      </section>

      <div className="lbottom">
        <SectionSetupPanel
          section={section}
          subjectsTaught={subjectsTaught}
          onAssignTeacher={() => openTeacherModal('class')}
          onAssignSubject={openSubjectModal}
          onAssignRolls={() => setAssignConfirm(true)}
        />
        <ChatPanel group={group} syncing={syncingGroup} onSync={handleSyncGroup} />
      </div>

      <PageFoot schoolName={me?.school?.name} />

      {/* ── Assign Teacher Modal ─────────────────────────────────────────── */}
      <Modal open={teacherModal} onClose={() => setTeacherModal(false)}
        title={teacherRole === 'class' ? 'Assign Class Teacher' : 'Assign Vice Class Teacher'}
        footer={<>
          <Button variant="secondary" onClick={() => setTeacherModal(false)}>Cancel</Button>
          <Button form="teacher-assign-form" type="submit" loading={savingTeacher}>Save</Button>
        </>}>
        <form id="teacher-assign-form" onSubmit={handleAssignTeacher}>
          {teacherErr && <div style={{ marginBottom: 14 }}><Alert variant="danger">{teacherErr}</Alert></div>}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Select teacher</label>
            <select className={`form-control${teacherErr ? ' error' : ''}`} value={selectedTeacher}
              onChange={(e) => { setTeacherErr(''); setSelectedTeacher(e.target.value); }}>
              <option value="">— None / Remove —</option>
              {teacherChoices.map((t) => (
                <option key={t._id} value={t._id} disabled={t.blocked}>
                  {t.name}{t.classTeacherOf ? ` — class teacher of ${t.classTeacherOf}` : ''}
                </option>
              ))}
            </select>
            <div className="form-hint">
              {teacherRole === 'class'
                ? 'A teacher can be class teacher of only one class. Teachers already leading a class are greyed out.'
                : 'A vice class teacher may also be a class teacher elsewhere, and may be vice class teacher of several sections — only this section’s class teacher is excluded.'}
            </div>
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
          ? `Remove ${unassignConfirm.teacherName} from teaching ${unassignConfirm.subjectName} in this section? The teacher and the subject are both untouched everywhere else.`
          : ''}
      />

      <SectionCapacityModal
        open={capModal}
        section={{ ...section, studentCount: enrolled.length }}
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
              onChange={(e) => setSubjectForm((f) => ({ ...f, subject: e.target.value, teacher: '' }))}>
              <option value="">— Choose subject —</option>
              {(subjects || []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.subjectName}{s.subjectCode ? ` (${s.subjectCode})` : ''} — {TYPE_LABEL[s.type] || s.type}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label required">Teacher</label>
            {subjectForm.subject && subjectTeachers.length === 0
              ? (
                <Alert variant="info">
                  No teachers are attached to this subject yet. Add them on the Subjects page first.
                </Alert>
              )
              : (
                <select className="form-control" required value={subjectForm.teacher}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, teacher: e.target.value }))}
                  disabled={!subjectForm.subject}>
                  <option value="">— Choose teacher —</option>
                  {subjectTeachers.map((t) => (
                    <option key={t._id} value={t._id}>{teacherLabel(t)}</option>
                  ))}
                </select>
              )}
          </div>

          {/* Sections of this class. Ticking several writes the subject to all
              of them in one action — the whole point on a setup day, where
              Hindi goes to A, B, C and D identically. */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label required">Sections</label>
            <div className="sdpicks">
              {(classDetail?.sections || []).map((sec) => {
                const sid = String(sec._id);
                const on  = subjectSections.includes(sid);
                return (
                  <button key={sid} type="button" onClick={() => toggleSubjectSection(sid)}
                    className={`sdpick${on ? ' sdpick--on' : ''}`} aria-pressed={on}>
                    {sec.sectionName}{sid === String(id) ? ' · this one' : ''}
                  </button>
                );
              })}
            </div>
            <div className="form-hint">
              {subjectSections.length > 1
                ? `This teacher takes this subject in ${subjectSections.length} sections. Any section that already has this exact pairing is left alone.`
                : 'Tick more sections to assign the same subject and teacher to all of them at once.'}
            </div>
          </div>
        </form>
      </Modal>

      {/* ── Assign Students Modal ────────────────────────────────────────── */}
      <Modal open={studentModal} onClose={() => setStudentModal(false)} title="Add Students to Section" maxWidth={620}
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
            value={studentSearch} onChange={(e) => handleStudentSearch(e.target.value)} autoFocus />
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

            <div className="sdpool">
              {visibleCandidates.map((st) => {
                const checked = picked.includes(st._id);
                const blocked = !st.assignable;
                return (
                  <label key={st._id} className={`sdpool__row${checked ? ' is-picked' : ''}${blocked ? ' is-blocked' : ''}`}>
                    <input type="checkbox" checked={checked} disabled={blocked}
                      onChange={() => togglePick(st._id)} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="sdpool__name">{st.name}</div>
                      <div className="sdpool__sub">
                        {st.email}{st.admissionNumber ? ` · Adm. ${st.admissionNumber}` : ''}
                      </div>
                    </div>
                    {blocked
                      ? <span className="sdpool__tag">{st.enrolledIn}</span>
                      : st.sameClass
                        ? <Badge variant="success">This class</Badge>
                        : <span className="sdpool__tag sdpool__tag--muted">No section</span>}
                  </label>
                );
              })}
            </div>

            {takenCount > 0 && (
              <button type="button" onClick={() => setShowTaken((v) => !v)}
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
      <Modal open={!!rollEdit} onClose={() => setRollEdit(null)} title="Update Roll Number" maxWidth={420}
        footer={<>
          <Button variant="secondary" onClick={() => setRollEdit(null)}>Cancel</Button>
          <Button form="roll-form" type="submit" loading={savingRoll}>Save</Button>
        </>}>
        <form id="roll-form" onSubmit={handleSaveRoll}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Roll number for <strong>{rollEdit?.name}</strong></label>
            <input className="form-control" autoFocus value={rollEdit?.value || ''}
              onChange={(e) => setRollEdit((r) => ({ ...r, value: e.target.value }))}
              placeholder="e.g. 12" />
            <div className="form-hint">
              Must be unique within this section. Leave blank to clear it. The change also updates the
              student&rsquo;s own record.
            </div>
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
        message={removeStudentConfirm
          ? `Remove ${removeStudentConfirm.name} from Section ${section.sectionName}? They stay admitted to the school and can be placed in another section.`
          : ''}
      />
    </div>
  );
}
