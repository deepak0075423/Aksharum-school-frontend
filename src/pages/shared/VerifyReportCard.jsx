/**
 * /verify/report-card/:code — where a printed report card's QR code points
 * (Oct 2026). Anybody holding the paper — another school, an employer — can
 * check that the school issued exactly this card: the name, the class, the
 * year and the figures, as the school recorded them when the card was
 * released. No sign-in, and nothing beyond what the card itself prints
 * (school-backend services/reportCard.verify, GET /api/public/report-card/:code).
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { schoolLogoUrl } from '../../utils/branding';
import { Ico, fmtStamp } from '../results/rsUI';

const API = String(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

export default function VerifyReportCard() {
  const { code } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let alive = true;
    // Plain fetch: this page is for people with no account, so no session rides along.
    fetch(`${API}/public/report-card/${encodeURIComponent(code || '')}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok && body?.data) setState({ loading: false, data: body.data, error: '' });
        else setState({ loading: false, data: null, error: body?.message || 'No report card has this code' });
      })
      .catch(() => { if (alive) setState({ loading: false, data: null, error: 'The check could not be made — try again in a moment' }); });
    return () => { alive = false; };
  }, [code]);

  useEffect(() => { document.title = 'Verify a report card'; }, []);

  const d = state.data;
  const c = d?.card || {};
  const logo = d?.school?.logo ? schoolLogoUrl({ logo: d.school.logo }) : null;
  return (
    <main className="rcv">
      <section className="rcv__card" aria-live="polite">
        {state.loading ? <p className="rcv__wait" role="status">Checking the code…</p> : d ? (
          <>
            <header className="rcv__school">
              {logo ? <img src={logo} alt="" /> : null}
              <div>
                <strong>{d.school?.name || 'The school'}</strong>
                {d.school?.place ? <small>{d.school.place}</small> : null}
              </div>
            </header>
            <p className="rcv__ok"><Ico name="checkCircle" size={22} />This report card was issued by {d.school?.name || 'the school'}.</p>
            <dl className="rcv__who">
              <div><dt>Student</dt><dd>{c.name}</dd></div>
              <div><dt>Class &amp; Section</dt><dd>{[c.className, c.sectionName].filter(Boolean).join(' – ') || '—'}</dd></div>
              {c.rollNumber ? <div><dt>Roll No.</dt><dd>{c.rollNumber}</dd></div> : null}
              {c.admissionNumber ? <div><dt>Admission No.</dt><dd>{c.admissionNumber}</dd></div> : null}
              <div><dt>Academic Year</dt><dd>{[c.yearName, c.termLabel].filter(Boolean).join(' · ')}</dd></div>
              {c.percentage !== null && c.percentage !== undefined ? <div><dt>Overall</dt><dd>{c.percentage}%{c.grade ? ` · Grade ${c.grade}` : ''}</dd></div> : null}
              {c.result ? <div><dt>Result</dt><dd className={c.result === 'Passed' ? 'is-pass' : 'is-fail'}>{c.result}</dd></div> : null}
              {c.promotion ? <div><dt>Next year</dt><dd>{c.promotion}</dd></div> : null}
            </dl>
            {Array.isArray(c.exams) && c.exams.length ? (
              <table className="rcv__exams">
                <thead><tr><th>Exam</th><th>Percentage</th><th>Grade</th></tr></thead>
                <tbody>{c.exams.map((e, i) => <tr key={`${e.title}${i}`}><td>{e.title}</td><td>{e.percentage}%</td><td>{e.grade}</td></tr>)}</tbody>
              </table>
            ) : null}
            <p className="rcv__foot">
              Code <b>{d.code}</b> · issued {fmtStamp(d.issuedAt)}{d.updatedAt && fmtStamp(d.updatedAt) !== fmtStamp(d.issuedAt) ? `, figures as of ${fmtStamp(d.updatedAt)}` : ''}.
              If the paper in your hands says anything different, it is not the card the school issued.
            </p>
          </>
        ) : (
          <>
            <p className="rcv__bad"><Ico name="closeCircle" size={22} />{state.error}</p>
            <p className="rcv__foot">Check the link printed beside the QR on the card — this one ends in <b>{String(code || '').toUpperCase()}</b> — or ask the school that issued it.</p>
          </>
        )}
      </section>
    </main>
  );
}
