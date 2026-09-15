/**
 * Student → Aptitude Exams.
 *
 * What matters to a student, in the order it matters: an exam open right now
 * (with the time it closes), what is coming up, what they have sat and are
 * waiting on, and their results. Starting an exam goes through a short
 * instructions step first — the timer starts the moment the paper opens, and
 * that should never happen by a stray click.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getExams } from '../../../api/student.api';
import { Button, Empty, Modal, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  ExamHero, ExamStats, ExamStat, Panel, ExamMark, fmtExamDay, fmtClock, fmtEndClock, fmtShortDate,
} from '../../admin/examParts';
import {
  Tabs, DateBlock, AttemptPill, PctBar, Outcome, useNow, fmtGap, plural,
} from '../../exams/examShared';

const FINISHED = ['submitted', 'auto_submitted'];

/** Where one exam stands for this student. */
function standing(e, now) {
  const done = FINISHED.includes(e.attempt?.status);
  if (done && e.resultsReleased) return 'result';
  if (done) return 'awaiting';
  if (e.canAttempt) return 'live';
  if (now < new Date(e.opensAt).getTime()) return 'upcoming';
  return 'missed';
}

export default function StudentExamsList() {
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(getExams);
  const now = useNow(1000);
  const [tab, setTab] = useState(null);
  const [starting, setStarting] = useState(null);
  const [agreed, setAgreed] = useState(false);

  const groups = useMemo(() => {
    const g = { live: [], upcoming: [], awaiting: [], missed: [], result: [] };
    (Array.isArray(data) ? data : []).forEach((e) => g[standing(e, now)].push(e));
    g.upcoming.sort((a, b) => new Date(a.opensAt) - new Date(b.opensAt));
    g.live.sort((a, b) => new Date(a.closesAt) - new Date(b.closesAt));
    return g;
  }, [data, Math.floor(now / 30000)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const results = groups.result;
  const avg = results.length
    ? Math.round(results.reduce((n, e) => n + (e.result?.percentage || 0), 0) / results.length) : null;
  const active = tab || (groups.upcoming.length ? 'upcoming' : groups.awaiting.length || groups.missed.length ? 'done' : 'results');

  const start = (e) => { setAgreed(false); setStarting(e); };

  return (
    <div className="page apxpg">
      <ExamHero title="My Aptitude Exams" subtitle="Live papers, what’s coming up, and your results" />

      {error && <p className="apxwarn"><Icon name="alert" size={15} />{error}</p>}

      {groups.live.map((e) => {
        const inProgress = e.attempt?.status === 'in_progress';
        return (
          <section key={e._id} className="apxlive">
            <div className="apxlive__main">
              <span className="apxlive__badge"><span className="apxpill__dot" /> Live now</span>
              <h2>{e.title}</h2>
              <p>{e.subject?.subjectName || 'General Aptitude'} · {plural(e.questionCount, 'question')} · {e.totalMarks} marks · {e.duration} min</p>
            </div>
            <div className="apxlive__clock">
              <small>Closes in</small>
              <strong>{fmtGap(new Date(e.closesAt) - now)}</strong>
              <small>at {fmtEndClock(e)}</small>
            </div>
            <Button className="btn apxlive__cta" onClick={() => (inProgress ? navigate(`/student/exams/${e._id}/attempt`) : start(e))}>
              {inProgress ? 'Resume exam' : 'Start exam'} <Icon name="arrowRight" size={17} />
            </Button>
          </section>
        );
      })}

      <ExamStats>
        <ExamStat icon="calendar" tone="blue" label="Upcoming" value={groups.upcoming.length}
          chip={groups.upcoming[0] ? { text: `next ${fmtShortDate(groups.upcoming[0].opensAt)}`, tone: 'flat' } : { text: 'nothing scheduled', tone: 'flat' }}
          on={active === 'upcoming'} onClick={() => setTab('upcoming')} />
        <ExamStat icon="clock" tone="amber" label="Awaiting Results" value={groups.awaiting.length}
          chip={{ text: `${groups.awaiting.length + results.length} sat in all`, tone: 'flat' }}
          on={active === 'done'} onClick={() => setTab('done')} />
        <ExamStat icon="checkCircle" tone="green" label="Results Out" value={results.length}
          chip={{ text: `${results.filter((e) => e.result?.passed).length} passed`, tone: results.length ? 'up' : 'flat' }}
          on={active === 'results'} onClick={() => setTab('results')} />
        <ExamStat icon="trophy" tone="violet" label="Average Score" value={avg == null ? '—' : `${avg}%`}
          chip={{ text: results.length ? `across ${plural(results.length, 'result')}` : 'no results yet', tone: 'flat' }} />
      </ExamStats>

      <section className="card apxpanel">
        <div className="apxpanel__tabs">
          <Tabs value={active} onChange={setTab} tabs={[
            { value: 'upcoming', label: 'Upcoming', icon: 'calendar', badge: groups.upcoming.length || null },
            { value: 'done', label: 'Awaiting results', icon: 'clock', badge: groups.awaiting.length || null },
            { value: 'results', label: 'Results', icon: 'trophy', badge: results.length || null },
          ]} />
        </div>

        {active === 'upcoming' && (groups.upcoming.length === 0
          ? <Empty icon="📅" title="Nothing coming up" message="New exams for your class appear here as soon as they are published." />
          : (
            <ul className="apxcards">
              {groups.upcoming.map((e) => (
                <li key={e._id} className="apxcardrow">
                  <DateBlock exam={e} />
                  <div className="apxcardrow__main">
                    <strong>{e.title}</strong>
                    <small>{e.subject?.subjectName || 'General Aptitude'}</small>
                    <span className="apxcardrow__facts">
                      <span><Icon name="clock" size={15} />{fmtClock(e.startTime)} – {fmtEndClock(e)}</span>
                      <span><Icon name="list" size={15} />{plural(e.questionCount, 'question')}</span>
                      <span><Icon name="trophy" size={15} />{e.totalMarks} marks</span>
                      <span><Icon name="activity" size={15} />{e.duration} min</span>
                    </span>
                  </div>
                  <div className="apxcardrow__side">
                    <small>Opens in</small>
                    <strong className="apxcountdown">{fmtGap(new Date(e.opensAt) - now)}</strong>
                  </div>
                </li>
              ))}
            </ul>
          ))}

        {active === 'done' && (groups.awaiting.length + groups.missed.length === 0
          ? <Empty icon="⏳" title="Nothing waiting" message="Exams you have submitted show here until their results are published." />
          : (
            <ul className="apxcards">
              {[...groups.awaiting, ...groups.missed].map((e) => {
                const missed = !FINISHED.includes(e.attempt?.status);
                return (
                  <li key={e._id} className="apxcardrow">
                    <ExamMark exam={e} size={46} />
                    <div className="apxcardrow__main">
                      <strong>{e.title}</strong>
                      <small>{e.subject?.subjectName || 'General Aptitude'} · {fmtExamDay(e)}</small>
                    </div>
                    <div className="apxcardrow__side apxcardrow__side--row">
                      <AttemptPill status={missed ? 'missed' : e.attempt.status} />
                      <span className="apxmuted">
                        {missed ? 'You did not sit this exam'
                          : e.resultPublishDate && e.resultApprovalStatus === 'approved' ? `Results on ${fmtShortDate(e.resultPublishDate)}`
                            : 'Results pending approval'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ))}

        {active === 'results' && (results.length === 0
          ? <Empty icon="🏆" title="No results yet" message="Your score and a question-by-question review appear here once your teacher publishes results." />
          : (
            <ul className="apxcards">
              {results.map((e) => (
                <li key={e._id} className="apxcardrow apxcardrow--result">
                  <ExamMark exam={e} size={46} />
                  <div className="apxcardrow__main">
                    <strong>{e.title}</strong>
                    <small>{e.subject?.subjectName || 'General Aptitude'} · {fmtExamDay(e)}</small>
                  </div>
                  <div className="apxcardrow__score">
                    <span><b>{e.result.score}</b> / {e.totalMarks}</span>
                    <PctBar value={e.result.percentage} />
                  </div>
                  <Outcome passed={e.result.passed} />
                  <Button variant="secondary" onClick={() => navigate(`/student/exams/${e._id}/result`)}>
                    View result <Icon name="arrowRight" size={15} />
                  </Button>
                </li>
              ))}
            </ul>
          ))}
      </section>

      <Modal open={!!starting} onClose={() => setStarting(null)} maxWidth={560}
        title={
          <span className="apxdlg__head">
            <span className="apxdlg__mark"><Icon name="fileCheck" size={20} /></span>
            <span>Before you start<small>{starting?.title}</small></span>
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setStarting(null)}>Not yet</Button>
            <Button disabled={!agreed} onClick={() => navigate(`/student/exams/${starting._id}/attempt`)}>
              Start now <Icon name="arrowRight" size={15} />
            </Button>
          </>
        }>
        {starting && (
          <div className="apxrules">
            <div className="apxrules__facts">
              <span><Icon name="list" size={18} /><b>{starting.questionCount}</b> questions</span>
              <span><Icon name="trophy" size={18} /><b>{starting.totalMarks}</b> marks</span>
              <span><Icon name="clock" size={18} /><b>{starting.duration}</b> minutes</span>
            </div>
            <ul>
              <li><Icon name="clock" size={16} />The timer starts as soon as the paper opens and does not pause. The exam also ends at {fmtEndClock(starting)}, whichever comes first.</li>
              <li><Icon name="checkCircle" size={16} />Answers save the moment you pick them. You can move between questions and change answers until you submit.</li>
              <li><Icon name="alert" size={16} />Leaving this window or switching tabs is recorded. After {plural(starting.maxViolations || 3, 'switch', 'switches')} your paper is submitted automatically.</li>
              <li><Icon name="trophy" size={16} />Multiple-choice questions score only when every correct option is chosen.</li>
            </ul>
            <label className="apxrules__agree">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
              I have read these instructions and I’m ready to begin.
            </label>
          </div>
        )}
      </Modal>
    </div>
  );
}
