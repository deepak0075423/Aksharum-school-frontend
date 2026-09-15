/**
 * Student → one exam's result.
 *
 * The score as a ring and a sentence, whether it passed and against what pass
 * mark, how the answers split, and then every question with the student's
 * answer and the correct one marked in words as well as colour — filterable to
 * just the ones they got wrong or skipped.
 */
import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { getExamResult } from '../../../api/student.api';
import { Button, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import { ExamMark, fmtExamDay } from '../../admin/examParts';
import {
  BackLink, ScoreRing, Outcome, Pills, QuestionReview, useReviewFilter, fmtSpent, fmtStamp, plural,
} from '../../exams/examShared';

export default function StudentExamResult() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error } = useFetch(() => getExamResult(id), [id]);
  const review = useReviewFilter(data?.questions);

  if (loading) return <div className="loading-page"><Spinner /></div>;
  if (error || !data?.exam) {
    return (
      <div className="page apxpg">
        <BackLink to="/student/exams">My Aptitude Exams</BackLink>
        <div className="card apxqe__empty">
          <Icon name="clock" size={32} />
          <h3>Result not available yet</h3>
          <p>{error || 'Results are not published yet.'}</p>
          <Button variant="secondary" onClick={() => navigate('/student/exams')}>Back to my exams</Button>
        </div>
      </div>
    );
  }

  const exam = data.exam;
  return (
    <div className="page apxpg">
      <BackLink to="/student/exams">My Aptitude Exams</BackLink>

      <section className="card apxresult">
        <ScoreRing value={data.percentage}>
          <strong>{data.percentage}%</strong>
          <small>score</small>
        </ScoreRing>
        <div className="apxresult__main">
          <p className="apxresult__exam"><ExamMark exam={{ title: exam.title, subjectName: exam.subjectName }} size={30} />{exam.subjectName || 'General Aptitude'} · {fmtExamDay(exam)}</p>
          <h1>{exam.title}</h1>
          <p className="apxresult__line">
            <span>You scored <b>{data.score}</b> out of <b>{exam.totalMarks}</b></span>
            <Outcome passed={data.passed} />
          </p>
          <small className="apxmuted">
            Pass mark {data.passMark} · submitted {fmtStamp(data.submittedAt)} · took {fmtSpent(data.timeTaken)}
          </small>
          {data.status === 'auto_submitted' && (
            <p className="apxwarn"><Icon name="alert" size={15} />This paper was submitted automatically{data.violationCount ? ` after ${plural(data.violationCount, 'tab switch', 'tab switches')}` : ' when time ran out'}.</p>
          )}
        </div>
        <ul className="apxresult__split">
          <li className="is-correct"><Icon name="checkCircle" size={20} /><b>{data.correct}</b><span>Correct</span></li>
          <li className="is-incorrect"><Icon name="closeCircle" size={20} /><b>{data.incorrect}</b><span>Incorrect</span></li>
          <li className="is-unanswered"><Icon name="info" size={20} /><b>{data.unanswered}</b><span>Not answered</span></li>
        </ul>
      </section>

      <section className="card apxpanel">
        <header className="apxpanel__head">
          <span className="apxpanel__mark"><Icon name="list" size={20} /></span>
          <div className="apxpanel__title">
            <h2>Question review</h2>
            <p>Your answer and the correct answer for every question</p>
          </div>
          <div className="apxpanel__act">
            <Pills label="Filter questions" value={review.filter} onChange={review.setFilter} items={review.pills} />
          </div>
        </header>
        <div className="apxqe__list apxqe__list--panel">
          {review.shown.length === 0
            ? <p className="apxempty">No questions in this group.</p>
            : review.shown.map(({ q, i }) => <QuestionReview key={q._id} q={q} index={i} viewer="student" />)}
        </div>
      </section>
    </div>
  );
}
