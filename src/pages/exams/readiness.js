/**
 * Whether an aptitude exam can be published — the browser's twin of
 * `publishReadiness()` in school-backend/services/aptitudeExam.js.
 *
 * The server is the authority: it refuses to publish anything this says is not
 * ready, and every exam it sends already carries its own `readiness`. The twin
 * exists for the question editor, which recomputes the verdict the moment a
 * question is added, edited or deleted rather than waiting on a round trip.
 * Keep the wording and the rules in step with the server's.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const s_ = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function answerKeyProblems(questions) {
  return (questions || []).filter((q) => {
    const ids = new Set(q.questionType === 'true_false' ? ['true', 'false'] : (q.options || []).map((o) => String(o.optionId)));
    const key = (q.correctAnswers || []).map(String);
    if (!key.length || key.some((k) => !ids.has(k))) return true;
    if (q.questionType !== 'true_false' && (q.options || []).length < 2) return true;
    return q.questionType !== 'mcq_multiple' && key.length !== 1;
  }).length;
}

export function publishReadiness({
  totalQuestions, totalMarks, questionCount, questionMarks, answerKeyProblems: badKeys = 0, endsAt, sectionCount = 1, now = new Date(),
}) {
  const want = Number(totalQuestions) || 0;
  const have = Number(questionCount) || 0;
  const total = round2(totalMarks);
  const marks = round2(questionMarks);
  const checks = [];

  checks.push({
    key: 'questions',
    label: 'Questions',
    ok: want >= 1 && have === want,
    detail: want < 1 ? 'Set how many questions the exam has'
      : have === want ? `All ${s_(want, 'question')} added`
        : have < want ? `${have} of ${want} added — add ${s_(want - have, 'more question')}`
          : `${have} added but the exam is set for ${want} — remove ${s_(have - want, 'question')} or raise the total`,
  });

  checks.push({
    key: 'marks',
    label: 'Total marks',
    ok: total > 0 && marks === total,
    detail: total <= 0 ? 'Set the exam’s total marks'
      : marks === total ? `Questions carry all ${total} marks`
        : have === 0 ? `No marks allocated yet — the questions must add up to ${total}`
          : marks < total ? `${marks} of ${total} marks allocated — ${round2(total - marks)} still to allocate`
            : `Questions carry ${marks} marks but the exam is out of ${total} — ${round2(marks - total)} over`,
  });

  checks.push({
    key: 'answers',
    label: 'Answer keys',
    ok: badKeys === 0,
    detail: badKeys === 0 ? 'Every question has a correct answer'
      : `${s_(badKeys, 'question')} ${badKeys === 1 ? 'has' : 'have'} no usable correct answer`,
  });

  const late = endsAt && new Date(endsAt) <= now;
  checks.push({
    key: 'schedule',
    label: 'Schedule',
    ok: !late,
    detail: late ? 'The exam date and time have already passed — pick a later slot' : 'Scheduled for a future slot',
  });

  checks.push({
    key: 'audience',
    label: 'Sections',
    ok: sectionCount > 0,
    detail: sectionCount > 0 ? `Reaches ${s_(sectionCount, 'section')}` : 'Choose at least one section',
  });

  const missing = checks.filter((c) => !c.ok);
  return {
    ready: missing.length === 0,
    checks,
    missing: missing.map((c) => c.key),
    message: missing.length ? `Not ready to publish: ${missing.map((c) => c.detail).join('; ')}` : 'Ready to publish',
  };
}

/** The verdict for an exam and (optionally) its loaded questions. */
export function readinessFor(exam, questions) {
  if (!exam) return null;
  if (!questions) return exam.readiness || null;
  return publishReadiness({
    totalQuestions: exam.totalQuestions,
    totalMarks: exam.totalMarks,
    questionCount: questions.length,
    questionMarks: questions.reduce((n, q) => n + (Number(q.marks) || 0), 0),
    answerKeyProblems: answerKeyProblems(questions),
    endsAt: exam.endsAt,
    sectionCount: exam.sections?.length ?? exam.audience?.items?.length ?? 1,
  });
}
