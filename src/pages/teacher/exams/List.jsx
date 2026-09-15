/**
 * Teacher → Aptitude Exams (landing).
 *
 * The same frame as the admin screen: marked header with Import and Create,
 * figures, then the list — scoped to the exams this teacher wrote and the ones
 * set for a section they class-teach. Between the two sits "Needs your
 * attention": results waiting on this teacher's approval, drafts that cannot
 * be published yet and why, and exams running right now.
 *
 * One read (`/teacher/exams/board`) carries rows and figures; filtering is
 * client-side because a teacher's own exams are a short list.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/teacher.api';
import { Alert, Button, Confirm, Empty } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { SearchField, MenuItem, MenuSep } from '../../admin/documentParts';
import {
  ExamHero, ExamStats, ExamStat, Panel, ExamTable, ExamGrid, ViewSwitch, ExamMark, StagePill,
  fmtExamDay, fmtClock, fmtShortDate,
} from '../../admin/examParts';
import ExamForm from '../../admin/ExamForm';
import ImportQuestions from '../../admin/ImportQuestions';
import { Pills, PublishMenuItem, YearPicker, plural } from '../../exams/examShared';

const unwrap = (res) => res?.data ?? res;
const errText = (err) => err?.data?.message || err?.message || 'Something went wrong';

export const TEACHER_IMPORT_API = {
  listDrafts: async () => (unwrap(await api.getExamBoard())?.exams || []).filter((e) => e.stage === 'draft' && e.isAuthor),
  importQuestions: api.importExamQuestions,
  template: api.getExamQuestionTemplate,
};

const FILTERS = {
  all:       () => true,
  draft:     (e) => e.stage === 'draft',
  upcoming:  (e) => ['scheduled', 'live'].includes(e.stage),
  completed: (e) => e.stage === 'completed',
  cancelled: (e) => e.stage === 'cancelled',
};

export default function TeacherExamsList() {
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('list');
  const [year, setYear] = useState('');   // '' = the current academic year

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [meta, setMeta] = useState(null);
  const [saving, setSaving] = useState(false);
  const [importFor, setImportFor] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setBoard(unwrap(await api.getExamBoard(year ? { year } : undefined))); setError(''); }
    catch (err) { setError(errText(err)); setBoard({ exams: [], tiles: {} }); }
  }, [year]);
  useEffect(() => { load(); }, [load]);

  const exams = board?.exams || [];
  const t = board?.tiles || {};
  const open = (e, tab = '') => navigate(`/teacher/exams/${e._id}${tab ? `/${tab}` : ''}`);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return exams.filter(FILTERS[filter]).filter((e) => !q
      || e.title.toLowerCase().includes(q) || (e.subjectName || '').toLowerCase().includes(q)
      || (e.audience?.label || '').toLowerCase().includes(q));
  }, [exams, filter, search]);

  const count = (k) => exams.filter(FILTERS[k]).length;

  // ── Needs your attention ───────────────────────────────────────────────────
  const attention = useMemo(() => {
    const items = [];
    exams.filter((e) => e.task).forEach((e) => items.push({
      e, icon: 'checkCircle', tone: 'violet', tab: 'results', cta: 'Review results',
      text: e.task === 'subject' ? 'Confirm the scores before the class teacher publishes them' : 'Approve and publish the results',
    }));
    exams.filter((e) => e.stage === 'live').forEach((e) => items.push({
      e, icon: 'activity', tone: 'green', tab: 'submissions', cta: 'Watch submissions',
      text: `Live now — ${e.submitted} of ${plural(e.eligible, 'student')} submitted`,
    }));
    exams.filter((e) => e.stage === 'draft' && e.isAuthor && !e.readiness?.ready).forEach((e) => items.push({
      e, icon: 'alert', tone: 'amber', tab: 'questions', cta: 'Finish exam',
      text: `Not ready to publish — ${e.readiness.checks.find((c) => !c.ok)?.detail}`,
    }));
    return items.slice(0, 5);
  }, [exams]);

  // ── Create / edit ──────────────────────────────────────────────────────────
  const ensureMeta = async () => {
    if (meta) return;
    try { setMeta(unwrap(await api.getExamMeta())); } catch (err) { toast.error(errText(err)); }
  };
  const openCreate = () => { setEditing(null); setFormOpen(true); ensureMeta(); };
  const openEdit = (e) => {
    if (!e.isAuthor || e.stage !== 'draft') return;
    setEditing(e); setFormOpen(true); ensureMeta();
  };

  const save = async (body) => {
    setSaving(true);
    try {
      if (editing) {
        await api.updateExam(editing._id, body);
        toast.success('Exam updated');
        setFormOpen(false);
        load();
      } else {
        const created = unwrap(await api.createExam(body));
        toast.success('Draft created — now add its questions');
        setFormOpen(false);
        navigate(`/teacher/exams/${created._id}/questions`);
      }
    } catch (err) { toast.error(errText(err)); }
    finally { setSaving(false); }
  };

  const runConfirm = async () => {
    setBusy(true);
    try {
      if (confirm.kind === 'publish') { await api.publishExam(confirm.exam._id); toast.success('Exam published'); }
      else { await api.deleteExam(confirm.exam._id); toast.success('Draft deleted'); }
      setConfirm(null);
      load();
    } catch (err) { toast.error(errText(err)); }
    finally { setBusy(false); }
  };

  /** Publishing an incomplete exam says what is missing and opens its checklist. */
  const askPublish = (e) => {
    if (!e.readiness?.ready) {
      toast.error(e.readiness?.message || 'This exam is not ready to publish', { duration: 6000 });
      open(e, 'questions');
      return;
    }
    setConfirm({ kind: 'publish', exam: e });
  };

  const menu = (e) => (
    <>
      <MenuItem icon="eye" onClick={() => open(e)}>Open exam</MenuItem>
      <MenuItem icon="list" onClick={() => open(e, 'questions')}>{e.stage === 'draft' && e.isAuthor ? 'Manage questions' : 'View questions'}</MenuItem>
      {e.stage === 'draft' && e.isAuthor && <MenuItem icon="upload" onClick={() => setImportFor(e._id)}>Import questions</MenuItem>}
      {e.stage === 'draft' && e.isAuthor && <PublishMenuItem exam={e} onPublish={() => askPublish(e)} />}
      {e.stage !== 'draft' && (
        <>
          <MenuSep />
          <MenuItem icon="users" onClick={() => open(e, 'submissions')}>Submissions</MenuItem>
          <MenuItem icon="chart" onClick={() => open(e, 'analytics')}>Analytics</MenuItem>
          <MenuItem icon="checkCircle" onClick={() => open(e, 'results')}>Results approval</MenuItem>
        </>
      )}
      {e.stage === 'draft' && e.isAuthor && (
        <><MenuSep /><MenuItem icon="trash" danger onClick={() => setConfirm({ kind: 'delete', exam: e })}>Delete draft</MenuItem></>
      )}
    </>
  );

  const filtered = !!search || filter !== 'all';
  const List = view === 'grid' ? ExamGrid : ExamTable;
  const empty = (
    <Empty icon={filtered ? '🔍' : '📝'}
      title={filtered ? 'No exams match' : year === 'all' ? 'No aptitude exams yet' : 'No exams in this academic year'}
      message={filtered ? 'Try another filter or search term.' : 'Create an exam for your sections, add its questions, then publish it.'}
      action={filtered
        ? <button type="button" className="btn btn-secondary" onClick={() => { setSearch(''); setFilter('all'); }}>Clear filters</button>
        : <button type="button" className="btn btn-primary" onClick={openCreate}><Icon name="plus" size={16} /> Create Exam</button>} />
  );
  const next = exams.find((e) => e.stage === 'scheduled');

  return (
    <div className="page apxpg">
      <ExamHero title="Aptitude Exams" subtitle="Create exams for your sections, add questions and follow every result"
        actions={
          <>
            <Button variant="secondary" className="btn btn-secondary apxhero__btn" onClick={() => navigate('/teacher/exams/analytics')}>
              <Icon name="chart" size={17} /> Analytics
            </Button>
            <Button variant="secondary" className="btn btn-secondary apxhero__btn" onClick={() => setImportFor('')}>
              <Icon name="upload" size={17} /> Import Questions
            </Button>
            <Button className="btn btn-primary apxhero__btn" onClick={openCreate}>
              <Icon name="plus" size={17} /> Create Exam
            </Button>
          </>
        } />

      <ExamStats>
        <ExamStat icon="fileDoc" tone="indigo" label="My Exams" value={board ? t.total : null}
          chip={{ text: `${t.authored || 0} written by you`, tone: 'flat' }} />
        <ExamStat icon="pencil" tone="amber" label="Drafts" value={board ? t.drafts : null}
          chip={t.notReady ? { text: `${t.notReady} not ready`, tone: 'warn' } : { text: t.drafts ? 'all ready' : '—', tone: t.drafts ? 'up' : 'flat' }}
          on={filter === 'draft'} onClick={() => setFilter(filter === 'draft' ? 'all' : 'draft')} />
        <ExamStat icon="calendar" tone="blue" label="Scheduled" value={board ? t.scheduled : null}
          chip={t.live ? { text: `${t.live} live now`, tone: 'up' } : next ? { text: `next ${fmtShortDate(next.startsAt)}`, tone: 'flat' } : { text: '—', tone: 'flat' }}
          on={filter === 'upcoming'} onClick={() => setFilter(filter === 'upcoming' ? 'all' : 'upcoming')} />
        <ExamStat icon="checkCircle" tone="green" label="Awaiting You" value={board ? t.tasks : null}
          chip={t.tasks ? { text: 'results to approve', tone: 'warn' } : { text: 'nothing pending', tone: 'flat' }}
          on={filter === 'completed'} onClick={() => setFilter(filter === 'completed' ? 'all' : 'completed')} />
        <ExamStat icon="trophy" tone="violet" label="Average Score" value={t.average == null ? '—' : `${t.average}%`}
          chip={{ text: 'closed exams', tone: 'flat' }} />
      </ExamStats>

      {error && <Alert variant="danger">{error}</Alert>}

      {attention.length > 0 && (
        <Panel icon="bell" title="Needs your attention" subtitle="Waiting on you, most urgent first">
          <ul className="apxtodo">
            {attention.map(({ e, icon, tone, text, tab, cta }) => (
              <li key={`${e._id}-${tab}`}>
                <span className={`apxtodo__icon apxtodo__icon--${tone}`}><Icon name={icon} size={17} /></span>
                <ExamMark exam={e} size={38} />
                <span className="apxtodo__text">
                  <button type="button" className="apxlink" onClick={() => open(e)}>{e.title}</button>
                  <small>{text}</small>
                </span>
                <span className="apxtodo__when">{fmtExamDay(e)} · {fmtClock(e.startTime)}</span>
                <StagePill stage={e.stage} />
                <button type="button" className="btn btn-secondary apxup__btn" onClick={() => open(e, tab)}>{cta}</button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel icon="fileDoc" title="My Exams" className="apxall"
        subtitle={`${year === 'all' ? 'Every academic year' : (board?.academicYears || []).find((y) => (year ? y._id === year : y.current))?.name || 'This academic year'} · exams you wrote, and exams for the sections you class-teach`}
        action={
          <div className="apxtools">
            <SearchField value={search} onChange={setSearch} placeholder="Search exams…" />
            <YearPicker years={board?.academicYears} value={year} onChange={setYear} />
            <ViewSwitch value={view} onChange={setView} />
          </div>
        }>
        <div className="apxsubbar">
          <Pills label="Filter exams" value={filter} onChange={setFilter} items={[
            { value: 'all', label: 'All', count: exams.length },
            { value: 'draft', label: 'Drafts', count: count('draft') },
            { value: 'upcoming', label: 'Scheduled & live', count: count('upcoming') },
            { value: 'completed', label: 'Completed', count: count('completed') },
            ...(count('cancelled') ? [{ value: 'cancelled', label: 'Cancelled', count: count('cancelled') }] : []),
          ]} />
        </div>
        <List rows={shown} loading={!board} empty={empty}
          onView={(e) => open(e)} onEdit={openEdit} menu={menu}
          canEdit={(e) => e.isAuthor} tag={(e) => (e.isAuthor ? null : 'Your class')} />
        {board && (
          <div className="apxfoot">
            <span>Showing {plural(shown.length, 'exam')}{shown.length !== exams.length ? ` of ${exams.length}` : ''}</span>
          </div>
        )}
      </Panel>

      <ExamForm open={formOpen} editing={editing} meta={meta} metaLoading={formOpen && !meta}
        saving={saving} onClose={() => setFormOpen(false)} onSave={save} />

      <ImportQuestions open={importFor !== null} examId={importFor || ''} api={TEACHER_IMPORT_API}
        onClose={() => setImportFor(null)} onImported={load} />

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={runConfirm} loading={busy}
        title={confirm?.kind === 'publish' ? 'Publish exam' : 'Delete draft'}
        confirmLabel={confirm?.kind === 'publish' ? 'Publish' : 'Delete'}
        message={confirm?.kind === 'publish'
          ? `Publish “${confirm.exam.title}”? ${plural(confirm.exam.eligible, 'student')} will see it, and it opens on ${fmtExamDay(confirm.exam)} at ${fmtClock(confirm.exam.startTime)}. Its questions lock once published.`
          : confirm ? `Delete the draft “${confirm.exam.title}” and its ${plural(confirm.exam.questionCount, 'question')}?` : ''} />
    </div>
  );
}
