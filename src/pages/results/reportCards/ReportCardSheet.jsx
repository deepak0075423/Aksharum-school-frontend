/**
 * One report card, on the school's letterhead (Oct 2026) — the card
 * school-backend services/reportCard builds. The same sheet is the screen's
 * preview and the page that prints: A4 portrait, one card a page.
 *
 *   frame  what every card of the page shares: the school, the year, the
 *          grading scale, whether grade points show, the signature title
 *   card   one student's year: the exams as columns and the subjects as rows,
 *          the overall result, attendance, co-scholastic grades, remarks
 *
 * A family's card before the year's final results is a Progress Report: the
 * marks so far, with the teacher's remarks still to come.
 *
 * Since Oct 2026 a card can be for one term; a graded paper shows its grade
 * alone, and a paper in parts its parts; beside each subject the section's
 * average and highest (when the school shows them), the subject teachers'
 * remarks under the marks, the rank across the class, the head of school's
 * signature and seal, and — once the cards are released — the QR that proves
 * the school issued exactly this card. A withheld card says so, for the office.
 */
import React from 'react';
import { schoolLogoUrl } from '../../../utils/branding';
import { fmtDay } from '../rsUI';
import { classLine, gradeRange } from '../resultMeta';

const pct = (v) => (v === null || v === undefined ? '—' : `${v}%`);
/** An uploaded image (signature, seal), wherever the API is served from. */
const imageUrl = (path) => (path ? schoolLogoUrl({ logo: path }) : null);
/** The QR of a released card, drawn by the server. */
const qrUrl = (code) => `${String(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '')}/public/report-card/${encodeURIComponent(code)}/qr.svg`;

/** A subject's marks in one exam: marks out of the maximum, the grade, and its point. */
function Cells({ x, points }) {
  if (x?.gradeOnly) {
    return (
      <>
        <td className="rc-na" aria-label="Graded only">—</td>
        <td className="rc-grade">{x.absent ? 'AB' : x.grade || '—'}</td>
        {points ? <td className="rc-na" /> : null}
      </>
    );
  }
  if (!x) {
    return (
      <>
        <td className="rc-na" aria-label="Not examined">—</td>
        <td className="rc-na" />
        {points ? <td className="rc-na" /> : null}
      </>
    );
  }
  return (
    <>
      <td className={`rc-num${x.absent ? ' is-ab' : x.passed === false ? ' is-low' : ''}`} title={x.grace ? `Includes ${x.grace} grace marks` : undefined}>
        {x.absent ? 'AB' : x.marks}<small>/{x.max}</small>{x.grace ? <sup>*</sup> : null}
        {!x.absent && x.components?.length ? <span className="rc-parts">{x.components.map((p) => `${p.label} ${p.marks ?? '—'}/${p.max}`).join(' · ')}</span> : null}
      </td>
      <td className="rc-grade">{x.absent ? 'AB' : x.grade || '—'}</td>
      {points ? <td className="rc-num">{x.absent ? '—' : x.point ?? '—'}</td> : null}
    </>
  );
}

export default function ReportCardSheet({ frame, card, family = false }) {
  const { school, year } = frame;
  const c = card;
  // The card's own scale — its class's — else the school's.
  const points = c.showGradePoints ?? !!frame.showGradePoints;
  const scale = c.scale?.length ? c.scale : frame.scale;
  const span = points ? 3 : 2;
  const many = c.exams.length > 1;
  const cols = [...c.exams, ...(many && c.overall ? [{ _id: 'total', overall: true }] : [])];
  const logo = schoolLogoUrl(school);
  const title = `${family && !c.complete ? 'Progress Report' : 'Report Card'}${c.termLabel ? ` · ${c.termLabel}` : ''}`;
  const ranked = c.exams.some((e) => e.rank) || c.overall?.rank;
  const graced = c.subjects.some((s) => s.cells.some((x) => x?.grace));
  const figures = c.subjects.some((s) => s.classFigures);
  const remarked = c.subjects.filter((s) => s.remarks);
  const o = c.overall;
  // The rank across the class says something only where the class has more than this section.
  const classWide = o?.classRank && o?.classOutOf && o.classOutOf > (o.outOf || 0);
  const signature = imageUrl(frame.principalSignature);
  const seal = imageUrl(frame.schoolSeal);
  // Before the year's final exam the overall result is only as far as it goes.
  const overallText = (passed) => (c.complete ? (passed ? 'Passed' : 'Not passed') : (passed ? 'Passing so far' : 'Not passing so far'));

  return (
    <article className="rc-sheet" aria-label={`${title} — ${c.student.name}`}>
      {c.withheld && !family ? (
        <p className="rc-withheld" role="note">Withheld from the family{c.withheld.reason ? ` — ${c.withheld.reason}` : ''}. They see that the result is withheld, not this card.</p>
      ) : null}
      <header className="rc-head">
        {logo ? <img src={logo} alt="" className="rc-head__logo" /> : null}
        <div className="rc-head__text">
          <h2>{school?.name}</h2>
          {school?.address ? <p>{school.address}</p> : null}
          <p className="rc-head__meta">
            {[school?.board, school?.code ? `School code ${school.code}` : '', school?.phone, school?.email].filter(Boolean).join(' · ')}
          </p>
        </div>
      </header>

      <div className="rc-title">
        <strong>{title}</strong>
        <span>Academic Year {year?.yearName}</span>
      </div>

      <dl className="rc-who">
        <div><dt>Student</dt><dd>{c.student.name}</dd></div>
        <div><dt>Admission No.</dt><dd>{c.student.admissionNumber || '—'}</dd></div>
        <div><dt>Class &amp; Section</dt><dd>{classLine(c.student)}</dd></div>
        <div><dt>Roll No.</dt><dd>{c.student.rollNumber || '—'}</dd></div>
        <div><dt>Date of Birth</dt><dd>{c.student.dob ? fmtDay(c.student.dob) : '—'}</dd></div>
        <div><dt>Parent / Guardian</dt><dd>{c.student.parents?.length ? c.student.parents.join(', ') : '—'}</dd></div>
      </dl>

      <section className="rc-block">
        <h3>Scholastic Areas</h3>
        {c.exams.length ? (
          <div className="rc-tablebox">
            <table className="rc-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="rc-subj">Subject</th>
                  {cols.map((e) => (
                    <th key={e._id} colSpan={span} className="rc-exam">
                      {e.overall ? (c.method === 'weighted' ? 'Weighted' : 'Total') : e.title}
                      {e.overall ? null : <small>{[e.examTypeLabel, e.code].filter(Boolean).join(' · ')}</small>}
                    </th>
                  ))}
                  {figures ? <th rowSpan={2} className="rc-exam rc-fig">Class<small>average · highest</small></th> : null}
                </tr>
                <tr>
                  {cols.map((e) => (
                    <React.Fragment key={e._id}>
                      <th>Marks</th><th>Grade</th>{points ? <th>GP</th> : null}
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.subjects.map((s) => (
                  <tr key={s._id}>
                    <th scope="row" className="rc-subj">{s.subjectName}{s.gradeOnly ? <small className="rc-graded">graded</small> : null}</th>
                    {s.cells.map((x, i) => <Cells key={c.exams[i]._id} x={x} points={points} />)}
                    {many && o ? <Cells x={s.gradeOnly ? s.cells.filter(Boolean).at(-1) : s.total || s.cells.find(Boolean)} points={points} /> : null}
                    {figures ? <td className="rc-num rc-fig">{s.classFigures ? `${s.classFigures.avgPct}% · ${s.classFigures.topPct}%` : '—'}</td> : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="rc-subj">Total</th>
                  {c.exams.map((e) => (
                    <React.Fragment key={e._id}>
                      <td className="rc-num">{e.total}<small>/{e.max}</small></td>
                      <td className="rc-grade">{e.grade}</td>
                      {points ? <td className="rc-num">{e.point ?? '—'}</td> : null}
                    </React.Fragment>
                  ))}
                  {many && o ? (
                    <>
                      <td className="rc-num">{o.marks}<small>/{o.max}</small></td>
                      <td className="rc-grade">{o.grade}</td>
                      {points ? <td className="rc-num">{o.point ?? '—'}</td> : null}
                    </>
                  ) : null}
                  {figures ? <td className="rc-fig" /> : null}
                </tr>
                <tr>
                  <th scope="row" className="rc-subj">Percentage</th>
                  {cols.map((e) => <td key={e._id} colSpan={span} className="rc-num">{pct(e.overall ? o.percentage : e.percentage)}</td>)}
                  {figures ? <td className="rc-fig" /> : null}
                </tr>
                <tr>
                  <th scope="row" className="rc-subj">Result</th>
                  {cols.map((e) => {
                    const passed = e.overall ? o.isPassed : e.isPassed;
                    return <td key={e._id} colSpan={span} className={passed ? 'rc-pass' : 'rc-fail'}>{e.overall ? overallText(passed) : passed ? 'Passed' : 'Not passed'}</td>;
                  })}
                  {figures ? <td className="rc-fig" /> : null}
                </tr>
                {frame.showRank && ranked ? (
                  <tr>
                    <th scope="row" className="rc-subj">Rank</th>
                    {cols.map((e) => {
                      const r = e.overall ? o : e;
                      return <td key={e._id} colSpan={span} className="rc-num">{r.rank ? `${r.rank} of ${r.outOf}` : '—'}</td>;
                    })}
                    {figures ? <td className="rc-fig" /> : null}
                  </tr>
                ) : null}
              </tfoot>
            </table>
          </div>
        ) : <p className="rc-none">No results have been published for this year yet.</p>}
        {graced ? <p className="rc-note">* Includes grace marks.</p> : null}
        {c.basis === 'all' && c.exams.length > 1 ? <p className="rc-note">Every published exam of the year is shown; none is marked to count towards the overall result, so the total adds them all.</p> : null}
        {c.method === 'weighted' && many ? <p className="rc-note">The overall result weighs each kind of exam as the school's rule sets it, so it is not the marks added up.</p> : null}
      </section>

      {remarked.length ? (
        <section className="rc-block">
          <h3>Subject Teachers' Remarks</h3>
          <dl className="rc-subremarks">
            {remarked.map((s) => <div key={s._id}><dt>{s.subjectName}</dt><dd>{s.remarks}</dd></div>)}
          </dl>
        </section>
      ) : null}

      {o ? (
        <div className="rc-overall">
          <span><small>Overall</small><strong>{o.marks} / {o.max}</strong></span>
          <span><small>Percentage</small><strong>{pct(o.percentage)}</strong></span>
          <span><small>Grade</small><strong>{o.grade}{points && o.point !== null && o.point !== undefined ? ` (${o.point})` : ''}</strong></span>
          <span><small>Result</small><strong className={o.isPassed ? 'rc-pass' : 'rc-fail'}>{overallText(o.isPassed)}</strong></span>
          {frame.showRank && o.rank ? <span><small>Rank in section</small><strong>{o.rank} of {o.outOf}</strong></span> : null}
          {frame.showRank && classWide ? <span><small>Rank in class</small><strong>{o.classRank} of {o.classOutOf}</strong></span> : null}
        </div>
      ) : null}

      <div className="rc-two">
        {c.coScholastic.length ? (
          <section className="rc-block">
            <h3>Co-scholastic Areas</h3>
            <table className="rc-table rc-table--co">
              <tbody>
                {c.coScholastic.map((a) => <tr key={a.key}><th scope="row">{a.label}</th><td className="rc-grade">{a.grade || '—'}</td></tr>)}
              </tbody>
            </table>
          </section>
        ) : null}
        {c.attendance ? (
          <section className="rc-block">
            <h3>Attendance</h3>
            <p className="rc-att">
              {c.attendance.total
                ? <><strong>{c.attendance.attended} / {c.attendance.total}</strong> days · {pct(c.attendance.percentage)}</>
                : 'No attendance has been marked this year.'}
            </p>
            {c.attendance.total ? <p className="rc-note">{fmtDay(c.attendance.from)} to {fmtDay(c.attendance.to)}. A half day counts as half.</p> : null}
          </section>
        ) : null}
      </div>

      <section className="rc-block">
        <h3>Class Teacher's Remarks</h3>
        <p className="rc-remarks">
          {c.remarks || (family && !c.complete ? 'The class teacher\'s remarks are given with the final results.' : '')}
        </p>
      </section>

      {c.promotion ? (
        <p className="rc-promo">
          {c.promotion.kind === 'passedOut'
            ? <>Passed out of <strong>{classLine(c.promotion)}</strong>.</>
            : <>{c.promotion.kind === 'repeated' ? 'Continues in' : 'Promoted to'} <strong>{classLine(c.promotion)}</strong>{c.promotion.yearName ? ` for ${c.promotion.yearName}` : ''}.</>}
        </p>
      ) : null}

      <p className="rc-scale">
        Grades: {scale.map((r) => `${r.grade} ${gradeRange(r)}${points && r.point !== null && r.point !== undefined ? ` (${r.point})` : ''}`).join(' · ')} · AB Absent
      </p>

      <footer className="rc-sign">
        <div><span />Class Teacher</div>
        <div><span />Parent / Guardian</div>
        <div className="rc-sign__head">
          {signature ? <img src={signature} alt="" className="rc-sign__img" /> : null}
          {seal ? <img src={seal} alt="" className="rc-sign__seal" /> : null}
          <span />{frame.principalTitle || 'Principal'}
        </div>
      </footer>
      {c.verification ? (
        <div className="rc-verify">
          <img src={qrUrl(c.verification.code)} alt={`QR code to verify this card: ${c.verification.url}`} width={64} height={64} />
          <p>Scan to check this card was issued by {school?.name || 'the school'}, or open <span>{c.verification.url}</span></p>
        </div>
      ) : null}
      {frame.footer ? <p className="rc-foot">{frame.footer}</p> : null}
    </article>
  );
}
