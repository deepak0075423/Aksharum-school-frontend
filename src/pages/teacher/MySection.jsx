/**
 * My Section — the teacher's own corner of the school.
 *
 * Three questions, in the order a teacher asks them: which class is mine, what
 * else am I responsible for, and what has been said to my class lately. The
 * headline tiles are the summary; everything under them is the detail, and
 * every row opens the same section drawer.
 *
 * It is for any teacher attached to a section this year — class teacher, vice
 * class teacher or subject teacher (MySectionGuard in App.jsx; the endpoint
 * answers 403 MY_SECTION_NOT_ASSIGNED to a teacher attached to nothing).
 *
 * A section is shown ONCE, in the place of the strongest tie the teacher has to
 * it as a class:
 *   • class teacher        → "My Class", their vice classes in a list beside it;
 *   • vice class teacher   → the class they cover IS their class, so it is the
 *     only                   "My Class" panel and is not listed a second time;
 *   • subject teacher only → no class of their own: the classes they teach
 *                            take the main column instead.
 * The subjects a teacher takes are listed per subject, so a class they also run
 * can appear there too — that row is about the subject, not the class.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../contexts/AuthContext';
import { useModules } from '../../contexts/ModulesContext';
import { Forbidden } from '../errors/ErrorPage';
import { getMySection, createAnnouncement, deleteAnnouncement } from '../../api/teacher.api';
import { Button, Modal, Spinner, Confirm, Empty } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  Tile, Panel, Fact, SectionRow, SectionActions, SectionBlock, RoleRow, AnnouncementRow,
  NoRows, SectionDrawer, HeroArt, chipFor, classLabel, secLabel, plural, YearTag,
} from './sectionParts';

const SHOWN = 3;   // rows a card shows before "View All" opens the rest

export default function MySection() {
  const { isEnabled, reload: reloadModules } = useModules();
  const { user: me } = useAuth();
  const [denied, setDenied] = useState(false);
  const { data, loading, error, refetch } = useFetch(() => getMySection().catch((err) => {
    if (err?.data?.code === 'MY_SECTION_NOT_ASSIGNED') setDenied(true);
    throw err;
  }));

  // The server can refuse AFTER the page has loaded: the module map said this
  // teacher runs a section and the section endpoint disagrees, which happens
  // while the map is stale. Reload it so the guard takes over on the next
  // navigation, and show the same page the guard would have shown.
  useEffect(() => {
    if (denied) reloadModules();
  }, [denied]); // eslint-disable-line react-hooks/exhaustive-deps

  const [drawer,   setDrawer]   = useState(null);
  // The section being posted to, not a boolean — a teacher can post to their
  // own class, a class they cover as vice, or one they only take a subject in.
  const [annOpen,  setAnnOpen]  = useState(null);
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
      await createAnnouncement({ ...annForm, section: annOpen._id });
      toast.success(`Posted to ${secLabel(annOpen)}`);
      setAnnOpen(null);
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

  // The server's refusal is the current answer, whatever the module map said
  // when this page was opened — a teacher taken off their class since, or one
  // let through because the map could not be loaded at all (MySectionGuard).
  // It gets the same page the guard shows, which says why. (A redirect to the
  // dashboard sat in front of this line and made it unreachable: being bounced
  // home without a word is what that page exists to replace.)
  if (denied) return <Forbidden reason="class_teacher" what="My Section" />;
  if (loading) return <div className="loading-page"><Spinner /></div>;
  // Not loaded is not the same as empty: drawing the page around nothing told a
  // class teacher they had no class, no vice post and no subjects.
  if (error && !data) {
    return (
      <div className="page tsecpg">
        <Empty icon="⚠️" title="My Section could not be loaded" message={error}
          action={<Button onClick={refetch}>Try again</Button>} />
      </div>
    );
  }

  const isClassTeacher = role === 'classTeacher';
  // What "My Class" holds. A vice class teacher with no class of their own has
  // the class they cover as their class — and that used to be drawn twice: once
  // here, and again in the "Vice Class Teacher" list below it. The list is now
  // only for a class teacher's ADDITIONAL vice classes.
  const ownRows  = isClassTeacher ? classTeacherOf : viceOf;
  const ownRole  = isClassTeacher ? 'classTeacher' : 'vice';
  const ownLabel = isClassTeacher ? 'Class Teacher' : 'Vice Class Teacher';
  const viceList = isClassTeacher ? viceOf : [];
  // Where "Vice Class Teacher" on a tile or a responsibility leads.
  const toVice   = viceList.length ? goTo(viceRef) : goTo(mineRef);

  const viceRows = allVice ? viceList : viceList.slice(0, SHOWN);
  const subjRows = allSubj ? subjectClasses : subjectClasses.slice(0, SHOWN);
  const annRows  = allAnn  ? announcements : announcements.slice(0, SHOWN);

  // Posting is open to anyone attached to the section; taking a notice down is
  // not — you wrote it, or it is on the board of a class you are class teacher
  // of. The server enforces the same rule.
  const canRemove = (ann) => isClassTeacher || String(ann.createdBy) === String(me?.id || me?._id);

  // One panel, two places: beside the teacher's own class, or — when they have
  // none — in the main column, where it is the page.
  const subjectPanel = subjectClasses.length > 0 && (
    <div ref={subjRef}>
      <Panel title="Subject Classes" count={subjectClasses.length}
        link={subjectClasses.length > SHOWN
          ? { label: allSubj ? 'Show Less' : 'View All', onClick: () => setAllSubj(!allSubj) }
          : null}>
        <div className="tsec-rows">
          {subjRows.map((s) => (
            <SectionBlock key={`${s._id}:${s.subject}`}>
              <SectionRow row={s} tone="rose"
                chip={String(s.subject || '?')[0].toUpperCase()}
                title={s.subject || 'Subject'}
                facts={<Fact icon="layers">{secLabel(s)}</Fact>}
                right={<span className="tsec-count">
                  <Icon name="users" size={15} />{plural(s.studentCount, 'Student')}
                </span>}
                onOpen={() => setDrawer(s)} />
              {/* No attendance: the day is recorded by the section,
                  and a subject teacher has the class for a period. */}
              <SectionActions row={s} role="subject" isEnabled={isEnabled}
                onStudents={setDrawer} onAnnounce={setAnnOpen} />
            </SectionBlock>
          ))}
        </div>
      </Panel>
    </div>
  );

  return (
    <div className="page tsecpg">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="tsec-hero">
        <span className="tsec-ico tsec-ico--xl tsec-t--indigo"><Icon name="users" size={28} /></span>
        <div className="tsec-hero__body">
          <h1>My Section</h1>
          <p>
            Your class section, responsibilities and related information
            {currentYear ? ` for ${currentYear}` : ''}.
          </p>
        </div>
        <div className="tsec-hero__art">
          <HeroArt />
          <span className="tsec-quote">&ldquo;Teachers plant seeds that grow forever.&rdquo;</span>
        </div>
      </header>

      {/* ── The three headline tiles ─────────────────────────────── */}
      <div className="tsec-tiles">
        {/* Class alone is ambiguous — a teacher holds one SECTION of it, so
            the tile names both. */}
        <Tile tone="indigo" icon="teacher" label="Class Teacher"
          value={classTeacherOf.length ? secLabel(classTeacherOf[0]) : 'Not assigned'}
          sub={classTeacherOf[0]
            ? `Academic Year ${classTeacherOf[0].yearName || currentYear || '—'}`
            : 'No section of your own'}
          onClick={classTeacherOf.length ? goTo(mineRef) : undefined} />
        <Tile tone="green" icon="users" label="Vice Class Teacher"
          value={viceOf.length ? plural(viceOf.length, 'Class', 'Classes') : 'None'}
          sub={viceOf.length ? 'You are vice class teacher' : 'Not covering any class'}
          onClick={viceOf.length ? toVice : undefined} />
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
                title={`My Class (${ownLabel})`}
                link={{ label: 'View Details', onClick: () => setDrawer(section) }}>
                <div className="tsec-mine">
                  <span className="tsec-chip tsec-chip--lg tsec-t--indigo">{chipFor(section)}</span>
                  <div className="tsec-mine__body">
                    <div className="tsec-mine__title">
                      {classLabel(section)}
                      <span className="tsec-badge tsec-t--indigo">{ownLabel}</span>
                      <YearTag row={section} />
                    </div>
                    <div className="tsec-row__facts">
                      <Fact icon="layers">Section {section.sectionName}</Fact>
                      <Fact icon="users">{plural(section.studentCount, 'Student')}</Fact>
                      <Fact icon="calendarDays">Academic Year {section.yearName || currentYear || '—'}</Fact>
                    </div>
                  </div>
                </div>

                <SectionActions row={section} role={ownRole}
                  isEnabled={isEnabled} canAnnounce={canPost}
                  onStudents={setDrawer} onAnnounce={setAnnOpen} />

                {/* A teacher can hold more than one class of their own — or,
                    with none of their own, cover more than one as vice. */}
                {ownRows.length > 1 && (
                  <div className="tsec-rows tsec-rows--tight">
                    {ownRows.slice(1).map((s) => (
                      <SectionBlock key={s._id}>
                        <SectionRow row={s} tone="indigo"
                          title={classLabel(s)}
                          facts={<>
                            <Fact icon="layers">Section {s.sectionName}</Fact>
                            <Fact icon="users">{plural(s.studentCount, 'Student')}</Fact>
                          </>}
                          badge={ownLabel} onOpen={() => setDrawer(s)} />
                        <SectionActions row={s} role={ownRole} isEnabled={isEnabled}
                          onStudents={setDrawer} onAnnounce={setAnnOpen} />
                      </SectionBlock>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          )}

          {viceList.length > 0 && (
            <div ref={viceRef}>
              <Panel title="Vice Class Teacher" count={viceList.length}
                link={viceList.length > SHOWN
                  ? { label: allVice ? 'Show Less' : 'View All', onClick: () => setAllVice(!allVice) }
                  : null}>
                <div className="tsec-rows">
                  {viceRows.map((s) => (
                    <SectionBlock key={s._id}>
                      <SectionRow row={s} tone="green"
                        title={classLabel(s)}
                        facts={<>
                          <Fact icon="layers">Section {s.sectionName}</Fact>
                          <Fact icon="users">{plural(s.studentCount, 'Student')}</Fact>
                        </>}
                        badge="Vice Class Teacher" onOpen={() => setDrawer(s)} />
                      {/* A vice class teacher covers the class — the same
                          four things the class teacher does, on the class
                          they actually cover. */}
                      <SectionActions row={s} role="vice" isEnabled={isEnabled}
                        onStudents={setDrawer} onAnnounce={setAnnOpen} />
                    </SectionBlock>
                  ))}
                </div>
              </Panel>
            </div>
          )}

          {/* With no class of their own, the classes a teacher takes a subject
              in are what the page is about — they get the main column. */}
          {!section && subjectPanel}

          {/* The board of the teacher's own class, plus what they themselves
              posted to the other classes they teach (each named for where it
              went) — a notice sent to a subject class used to vanish from the
              page the moment it was posted. */}
          <Panel title="Recent Announcements"
            link={announcements.length > SHOWN
              ? { label: allAnn ? 'Show Less' : 'View All', onClick: () => setAllAnn(!allAnn) }
              : null}>
            {annRows.length ? (
              <div className="tsec-rows tsec-rows--tight">
                {annRows.map((a, i) => (
                  <AnnouncementRow key={a._id} ann={a} tone={i % 2 ? 'green' : 'indigo'}
                    onDelete={canRemove(a) ? () => setDelAnn(a) : null} />
                ))}
              </div>
            ) : section ? (
              <NoRows icon="megaphone">
                Nothing posted to {secLabel(section)} yet.
                {canPost && ' Use Post Announcement above to tell your class something.'}
              </NoRows>
            ) : (
              <NoRows icon="megaphone">
                Nothing posted yet. What you post to the classes you teach is listed here.
              </NoRows>
            )}
          </Panel>
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
                  onClick={toVice} />
              )}
              {subjectClasses.length > 0 && (
                <RoleRow tone="violet" icon="bookOpen" label="Subject Teacher"
                  sub={subjectSummary} onClick={goTo(subjRef)} />
              )}
            </div>
          </Panel>

          {section && subjectPanel}

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

      {drawer && <SectionDrawer section={drawer} onClose={() => setDrawer(null)} />}

      <Modal open={!!annOpen} onClose={() => setAnnOpen(null)}
        title={annOpen ? `Post to ${secLabel(annOpen)}` : 'Post Announcement'}
        footer={<>
          <Button variant="secondary" onClick={() => setAnnOpen(null)}>Cancel</Button>
          <Button form="tsec-ann" type="submit" loading={saving}>Post</Button>
        </>}>
        <form id="tsec-ann" onSubmit={postAnnouncement}>
          <p className="text-muted text-sm" style={{ marginBottom: 14 }}>
            Goes to {annOpen ? secLabel(annOpen) : 'your class'} — every student in that section
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
