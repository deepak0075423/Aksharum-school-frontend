/**
 * My Section — the teacher's own corner of the school.
 *
 * Three questions, in the order a teacher asks them: which class is mine, what
 * else am I responsible for, and what has been said to my class lately. The
 * headline tiles are the summary; everything under them is the detail, and
 * every row opens the same section drawer.
 */
import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { useModules } from '../../contexts/ModulesContext';
import { getMySection, createAnnouncement, deleteAnnouncement } from '../../api/teacher.api';
import { Button, Modal, Spinner, Confirm } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  Tile, Panel, Fact, SectionRow, RoleRow, AnnouncementRow, NoRows, SectionDrawer,
  HeroArt, chipFor, classLabel, secLabel, plural, YearTag,
} from './sectionParts';

const SHOWN = 3;   // rows a card shows before "View All" opens the rest

export default function MySection() {
  const { data, loading, refetch } = useFetch(getMySection);
  const { isEnabled } = useModules();

  const [drawer,   setDrawer]   = useState(null);
  const [annOpen,  setAnnOpen]  = useState(false);
  const [annForm,  setAnnForm]  = useState({ title: '', message: '' });
  const [saving,   setSaving]   = useState(false);
  const [delAnn,   setDelAnn]   = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [allVice,  setAllVice]  = useState(false);
  const [allSubj,  setAllSubj]  = useState(false);
  const [allAnn,   setAllAnn]   = useState(false);

  const mineRef = useRef(null);
  const viceRef = useRef(null);
  const subjRef = useRef(null);
  const goTo = (ref) => () => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const {
    section, role, canPost, currentYear = '',
    classTeacherOf = [], viceOf = [], subjectClasses = [], announcements = [], monitors = [],
  } = data || {};

  // "Mathematics (Class 4A, 5B)" — one line per subject, however many sections
  const subjectSummary = useMemo(() => {
    const bySubject = new Map();
    subjectClasses.forEach((s) => {
      const where = s.classNumber != null ? `${s.classNumber}${s.sectionName}` : secLabel(s);
      if (!bySubject.has(s.subject)) bySubject.set(s.subject, []);
      bySubject.get(s.subject).push(where);
    });
    return [...bySubject.entries()].map(([name, where]) => `${name} (${where.join(', ')})`).join(' · ');
  }, [subjectClasses]);

  const postAnnouncement = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createAnnouncement(annForm);
      toast.success('Announcement posted');
      setAnnOpen(false);
      setAnnForm({ title: '', message: '' });
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const removeAnnouncement = async () => {
    setDeleting(true);
    try {
      await deleteAnnouncement(delAnn._id);
      toast.success('Announcement deleted');
      setDelAnn(null);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setDeleting(false); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const nothing = !section && !viceOf.length && !subjectClasses.length;
  const viceRows = allVice ? viceOf : viceOf.slice(0, SHOWN);
  const subjRows = allSubj ? subjectClasses : subjectClasses.slice(0, SHOWN);
  const annRows  = allAnn  ? announcements : announcements.slice(0, SHOWN);
  const isClassTeacher = role === 'classTeacher';

  return (
    <div className="page tsecpg">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="tsec-hero">
        <span className="tsec-ico tsec-ico--xl tsec-t--indigo"><Icon name="users" size={28} /></span>
        <div className="tsec-hero__body">
          <h1>My Section</h1>
          <p>View your class section, responsibilities and related information.</p>
        </div>
        <div className="tsec-hero__art">
          <HeroArt />
          <span className="tsec-quote">&ldquo;Teachers plant seeds that grow forever.&rdquo;</span>
        </div>
      </header>

      {nothing ? (
        <div className="alert alert-warning">
          You are not attached to any section yet — no class teacher, vice class teacher or
          subject teacher assignment. Your school office sets these up on the class.
        </div>
      ) : (
        <>
          {/* ── The three headline tiles ─────────────────────────────── */}
          <div className="tsec-tiles">
            <Tile tone="indigo" icon="teacher" label="Class Teacher"
              value={classTeacherOf.length ? classLabel(classTeacherOf[0]) : 'Not assigned'}
              sub={classTeacherOf[0]
                ? `Academic Year ${classTeacherOf[0].yearName || currentYear || '—'}`
                : 'No section of your own'}
              onClick={classTeacherOf.length ? goTo(mineRef) : undefined} />
            <Tile tone="green" icon="users" label="Vice Class Teacher"
              value={viceOf.length ? plural(viceOf.length, 'Class', 'Classes') : 'None'}
              sub={viceOf.length ? 'You are vice class teacher' : 'Not covering any class'}
              onClick={viceOf.length ? goTo(viceRef) : undefined} />
            <Tile tone="violet" icon="bookOpen" label="Subject Teacher"
              value={subjectClasses.length ? plural(subjectClasses.length, 'Class', 'Classes') : 'None'}
              sub={subjectClasses.length ? 'Across different sections' : 'No subject assignments'}
              onClick={subjectClasses.length ? goTo(subjRef) : undefined} />
          </div>

          <div className="tsec-grid">
            {/* ── Main column ───────────────────────────────────────── */}
            <div className="tsec-col">

              {section && (
                <div ref={mineRef}>
                  <Panel
                    title={`My Class (${isClassTeacher ? 'Class Teacher' : 'Vice Class Teacher'})`}
                    link={{ label: 'View Details', onClick: () => setDrawer(section) }}>
                    <div className="tsec-mine">
                      <span className="tsec-chip tsec-chip--lg tsec-t--indigo">{chipFor(section)}</span>
                      <div className="tsec-mine__body">
                        <div className="tsec-mine__title">
                          {classLabel(section)}
                          <span className="tsec-badge tsec-t--indigo">
                            {isClassTeacher ? 'Class Teacher' : 'Vice Class Teacher'}
                          </span>
                          <YearTag row={section} />
                        </div>
                        <div className="tsec-row__facts">
                          <Fact icon="layers">Section {section.sectionName}</Fact>
                          <Fact icon="users">{plural(section.studentCount, 'Student')}</Fact>
                          <Fact icon="calendarDays">Academic Year {section.yearName || currentYear || '—'}</Fact>
                        </div>
                      </div>
                    </div>

                    <div className="tsec-actions">
                      <button type="button" className="tsec-act" onClick={() => setDrawer(section)}>
                        <Icon name="users" size={17} />View Students
                      </button>
                      {isEnabled('attendance') && (
                        <Link className="tsec-act" to="/teacher/attendance">
                          <Icon name="checkSquare" size={17} />Take Attendance
                        </Link>
                      )}
                      {isEnabled('timetable') && (
                        <Link className="tsec-act" to="/teacher/timetable">
                          <Icon name="clock" size={17} />View Timetable
                        </Link>
                      )}
                      {canPost && (
                        <button type="button" className="tsec-act" onClick={() => setAnnOpen(true)}>
                          <Icon name="megaphone" size={17} />Post Announcement
                        </button>
                      )}
                    </div>

                    {/* A teacher can hold more than one class of their own */}
                    {classTeacherOf.length > 1 && (
                      <div className="tsec-rows tsec-rows--tight">
                        {classTeacherOf.slice(1).map((s) => (
                          <SectionRow key={s._id} row={s} tone="indigo"
                            title={classLabel(s)}
                            facts={<>
                              <Fact icon="layers">Section {s.sectionName}</Fact>
                              <Fact icon="users">{plural(s.studentCount, 'Student')}</Fact>
                            </>}
                            badge="Class Teacher" onOpen={() => setDrawer(s)} />
                        ))}
                      </div>
                    )}
                  </Panel>
                </div>
              )}

              {viceOf.length > 0 && (
                <div ref={viceRef}>
                  <Panel title="Vice Class Teacher" count={viceOf.length}
                    link={viceOf.length > SHOWN
                      ? { label: allVice ? 'Show Less' : 'View All', onClick: () => setAllVice(!allVice) }
                      : null}>
                    <div className="tsec-rows">
                      {viceRows.map((s) => (
                        <SectionRow key={s._id} row={s} tone="green"
                          title={classLabel(s)}
                          facts={<>
                            <Fact icon="layers">Section {s.sectionName}</Fact>
                            <Fact icon="users">{plural(s.studentCount, 'Student')}</Fact>
                          </>}
                          badge="Vice Class Teacher" onOpen={() => setDrawer(s)} />
                      ))}
                    </div>
                  </Panel>
                </div>
              )}

              {section && (
                <Panel title="Recent Announcements"
                  link={announcements.length > SHOWN
                    ? { label: allAnn ? 'Show Less' : 'View All', onClick: () => setAllAnn(!allAnn) }
                    : null}>
                  {annRows.length ? (
                    <div className="tsec-rows tsec-rows--tight">
                      {annRows.map((a, i) => (
                        <AnnouncementRow key={a._id} ann={a} tone={i % 2 ? 'green' : 'indigo'}
                          onDelete={canPost ? () => setDelAnn(a) : null} />
                      ))}
                    </div>
                  ) : (
                    <NoRows icon="megaphone">
                      Nothing posted to {secLabel(section)} yet.
                      {canPost && ' Use Post Announcement above to tell your class something.'}
                    </NoRows>
                  )}
                </Panel>
              )}
            </div>

            {/* ── Side column ───────────────────────────────────────── */}
            <div className="tsec-col">
              <Panel title="My Responsibilities">
                <div className="tsec-rows tsec-rows--tight">
                  {classTeacherOf.length > 0 && (
                    <RoleRow tone="indigo" icon="teacher" label="Class Teacher"
                      sub={classTeacherOf.map(secLabel).join(', ')}
                      onClick={() => setDrawer(classTeacherOf[0])} />
                  )}
                  {viceOf.length > 0 && (
                    <RoleRow tone="green" icon="users" label="Vice Class Teacher"
                      sub={viceOf.map(secLabel).join(', ')}
                      onClick={goTo(viceRef)} />
                  )}
                  {subjectClasses.length > 0 && (
                    <RoleRow tone="violet" icon="bookOpen" label="Subject Teacher"
                      sub={subjectSummary} onClick={goTo(subjRef)} />
                  )}
                </div>
              </Panel>

              {subjectClasses.length > 0 && (
                <div ref={subjRef}>
                  <Panel title="Subject Classes" count={subjectClasses.length}
                    link={subjectClasses.length > SHOWN
                      ? { label: allSubj ? 'Show Less' : 'View All', onClick: () => setAllSubj(!allSubj) }
                      : null}>
                    <div className="tsec-rows">
                      {subjRows.map((s) => (
                        <SectionRow key={`${s._id}:${s.subject}`} row={s} tone="rose"
                          chip={String(s.subject || '?')[0].toUpperCase()}
                          title={s.subject || 'Subject'}
                          facts={<Fact icon="layers">{secLabel(s)}</Fact>}
                          right={<span className="tsec-count">
                            <Icon name="users" size={15} />{plural(s.studentCount, 'Student')}
                          </span>}
                          onOpen={() => setDrawer(s)} />
                      ))}
                    </div>
                  </Panel>
                </div>
              )}

              {monitors.length > 0 && (
                <Panel title="Class Monitors" count={monitors.length}>
                  <div className="tsec-mons">
                    {monitors.map((m) => (
                      <span key={m._id} className="tsec-mon">
                        <span className="tsec-student__av">{String(m.name || '?')[0].toUpperCase()}</span>
                        {m.name}
                      </span>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}

      {drawer && <SectionDrawer section={drawer} onClose={() => setDrawer(null)} />}

      <Modal open={annOpen} onClose={() => setAnnOpen(false)} title="Post Announcement"
        footer={<>
          <Button variant="secondary" onClick={() => setAnnOpen(false)}>Cancel</Button>
          <Button form="tsec-ann" type="submit" loading={saving}>Post</Button>
        </>}>
        <form id="tsec-ann" onSubmit={postAnnouncement}>
          <p className="text-muted text-sm" style={{ marginBottom: 14 }}>
            Goes to {section ? secLabel(section) : 'your class'} — every student in the section
            sees it on their class page.
          </p>
          <div className="form-group">
            <label className="form-label required">Title</label>
            <input className="form-control" required maxLength={120} value={annForm.title}
              onChange={(e) => setAnnForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label required">Message</label>
            <textarea className="form-control" rows={4} required value={annForm.message}
              onChange={(e) => setAnnForm((f) => ({ ...f, message: e.target.value }))} />
          </div>
        </form>
      </Modal>

      <Confirm open={!!delAnn} onClose={() => setDelAnn(null)} onConfirm={removeAnnouncement}
        loading={deleting} title="Delete Announcement"
        message={delAnn ? `Remove "${delAnn.title}"? Students will no longer see it.` : ''} />
    </div>
  );
}
