/**
 * Student → My Results → Report Card, and Parent → Results → Report Card
 * (Oct 2026). The student's year on the school's letterhead, as the office
 * prints it — from what the family may see: published results past their
 * result date, and the class teacher's remarks and co-scholastic grades once
 * the year's final results are out. Until then it is a Progress Report.
 *
 *   GET /student/results/report-card?academicYear=
 *   GET /parent/results/report-card?childId=&academicYear=
 *
 * A parent picks the child with the switch every parent page uses (?child=).
 *
 * Since Oct 2026: a card for one term, where the school has terms; the
 * teacher's remarks as soon as the school releases the cards; and a withheld
 * result says so — with the school's reason — and shows nothing else.
 */
import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as studentApi from '../../../api/student.api';
import * as parentApi from '../../../api/parent.api';
import { ChildSwitch, useChild } from '../../../components/parent/ChildSwitch';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Btn, SelectField, Empty, Ico, KidSchool, useBoard } from '../rsUI';
import ReportCardSheet from './ReportCardSheet';
import PrintCards from './PrintCards';
import { savePdf, pdfName } from './savePdf';

export default function FamilyReportCard({ parent = false }) {
  const nav = useNavigate();
  usePageCrumbs([{ label: 'Report Card' }]);
  const [params] = useSearchParams();
  const wanted = parent ? params.get('child') || '' : '';
  const [year, setYear] = useState('');
  const [term, setTerm] = useState('');
  const fetcher = useMemo(() => (parent ? (q) => parentApi.getReportCard(q.child, q.year, q.term) : (q) => studentApi.getReportCard(q.year, q.term)), [parent]);
  const { body, loading, error, reload } = useBoard(fetcher, { child: wanted, year, term });
  const d = body?.data;
  const children = d?.children || [];
  const { child: asked, pick } = useChild(children);
  const child = children.find((c) => c._id === d?.child) || asked;
  const [printing, setPrinting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const download = async () => {
    setDownloading(true);
    try {
      const t = d.frame?.term || undefined;
      await savePdf(() => (parent ? parentApi.getReportCardPdf(d.child || wanted || undefined, d.year?._id, t) : studentApi.getReportCardPdf(d.year?._id, t)),
        pdfName(`${d.card.student.name}${d.frame?.termLabel ? ` ${d.frame.termLabel}` : ''}`, d.year?.yearName));
    } catch (e) { toast.error(e.message || 'The PDF could not be made'); } finally { setDownloading(false); }
  };

  const card = d?.card;
  const withheld = d?.withheld || null;
  const back = parent ? `/parent/results${wanted ? `?child=${wanted}` : ''}` : '/student/results';
  const title = card && !card.complete ? 'Progress Report' : 'Report Card';
  const terms = d?.frame?.terms || [];

  return (
    <div className="rs-page rc-page rc-page--family">
      {parent ? (
        <ChildSwitch children={children} child={child} onPick={(c) => { setYear(''); setTerm(''); pick(c); }} label="Whose report card"
          badge={d?.multiSchool ? (c) => <KidSchool name={c.schoolName} /> : undefined} />
      ) : null}
      <PageHead title={title}
        subtitle={card ? `${card.student.name} · ${d.year?.yearName || ''}` : 'The year on one sheet, as the school prints it.'}>
        <Btn size="lg" icon="arrowLeft" onClick={() => nav(back)}>Back to Results</Btn>
        <Btn kind="tint" size="lg" icon="download" busy={downloading} disabled={!card || downloading} onClick={download}>Download PDF</Btn>
        <Btn kind="primary" size="lg" icon="printer" disabled={!card || printing} onClick={() => setPrinting(true)}>Print</Btn>
      </PageHead>

      {d?.years?.length > 1 || terms.length ? (
        <div className="rs-afilters">
          {d.years?.length > 1 ? (
            <SelectField label="Academic Year" width={200} value={year || d.year?._id || ''} onChange={(v) => { setYear(v); setTerm(''); }}
              options={d.years.map((y) => ({ value: y._id, label: `${y.yearName}${y.current ? ' (Current)' : ''}` }))} />
          ) : null}
          {terms.length ? (
            <SelectField label="Report for" width={180} value={term || d.frame?.term || ''} onChange={setTerm}
              options={[{ value: '', label: 'The whole year' }, ...terms.map((t) => ({ value: t.key, label: t.label }))]} />
          ) : null}
        </div>
      ) : null}

      {!d && loading ? <div className="rs-acard rs-loading" role="status">Loading the report card…</div> : null}
      {!d && error ? <div className="rs-acard"><Empty title="The report card could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></div> : null}
      {d && parent && !children.length ? <div className="rs-acard"><Empty title="No children linked">Ask the school office to link your children to your account.</Empty></div> : null}
      {d && parent && children.length && d.resultsOn === false ? (
        <div className="rs-acard"><Empty title="No report card here">{d.school?.name || 'This school'} does not use the Results module.</Empty></div>
      ) : null}
      {withheld ? (
        <div className="rs-acard rc-held" role="status">
          <Ico name="lock" size={22} />
          <div>
            <strong>{withheld.student?.name ? `${withheld.student.name}'s report card is withheld` : 'This report card is withheld'}</strong>
            <p>The school is holding it back for now{withheld.reason ? ` — ${withheld.reason}` : ''}. Please contact the school office.</p>
          </div>
        </div>
      ) : null}
      {d && (!parent || (children.length && d.resultsOn !== false)) && !card && !withheld ? (
        <div className="rs-acard"><Empty title="No report card yet">A report card appears once the school publishes results for the year.</Empty></div>
      ) : null}

      {card ? (
        <div className={`rc-preview rc-preview--family${loading ? ' is-loading' : ''}`}>
          {!card.complete ? (
            <p className="rs-dnote">
              This is a progress report: the results published so far. The class teacher's remarks and the co-scholastic grades are added
              when the school releases the report cards{d.frame?.term ? '' : ', or the final results come out'}.
            </p>
          ) : null}
          <ReportCardSheet frame={d.frame} card={card} family />
        </div>
      ) : null}

      {printing && card ? <PrintCards frame={d.frame} cards={[card]} family onDone={() => setPrinting(false)} /> : null}
    </div>
  );
}
