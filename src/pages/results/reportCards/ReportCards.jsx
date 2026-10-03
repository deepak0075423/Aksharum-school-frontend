/**
 * Report Cards — the office's (Admin → Results → Report Cards) and the class
 * teacher's (Teacher → Results → Report Cards): one page (Oct 2026).
 *
 * Pick the year and the section. Every student on its roll is listed with how
 * far their card has got — results in, remarks written, co-scholastic grades
 * given — and the chosen student's card is shown as it prints, with the
 * remarks and grades to write above it. Print one card, or the whole section's
 * at once.
 *
 * The office sees every section of the year; a teacher, the sections they are
 * class or vice class teacher of — the server lists only those, and refuses a
 * write for any other student (school-backend services/reportCard).
 *
 * Since Oct 2026: a card for one term where the school has terms; releasing a
 * section's cards to its families (they are told, and from then on read the
 * remarks), and sending each parent their child's card by email; remarks
 * picked from the school's remark bank.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as adminApi from '../../../api/admin.api';
import * as teacherApi from '../../../api/teacher.api';
import { Modal } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Btn, SelectField, SearchBox, Badge, Empty, Ico, plural, count, fmtStamp, useBoard } from '../rsUI';
import { classLine, gradeTone } from '../resultMeta';
import ReportCardSheet from './ReportCardSheet';
import PrintCards from './PrintCards';
import { savePdf, pdfName } from './savePdf';

const REMARKS_MAX = 1000;

/** How far a card has got, for the list. */
function progress(card) {
  const areas = card.coScholastic.length;
  const graded = card.coScholastic.filter((a) => a.grade).length;
  return { results: card.exams.length, remarks: !!card.remarks.trim(), areas, graded, done: !!card.remarks.trim() && graded === areas };
}

/** The class teacher's part of one card: the remarks, and a grade in each co-scholastic area. */
function NotesEditor({ frame, card, save, onSaved, term }) {
  const [remarks, setRemarks] = useState(card.remarks || '');
  const [co, setCo] = useState(() => Object.fromEntries(card.coScholastic.map((a) => [a.key, a.grade || ''])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const before = useMemo(() => JSON.stringify({ r: (card.remarks || '').trim(), c: Object.fromEntries(card.coScholastic.map((a) => [a.key, a.grade || ''])) }), [card]);
  const dirty = JSON.stringify({ r: remarks.trim(), c: co }) !== before;

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await save({ studentId: card.student._id, academicYear: frame.year?._id, term: term || undefined, remarks: remarks.trim(), coScholastic: co });
      toast.success(`${card.student.name}'s report card saved`);
      onSaved(res.data ?? res);
    } catch (e) { setError(e.message || 'The report card could not be saved'); }
    finally { setBusy(false); }
  };

  return (
    <section className="rs-acard rc-notes" aria-label={`Remarks and grades for ${card.student.name}`}>
      <header className="rs-acard__head">
        <div>
          <h2>Remarks &amp; Co-scholastic Grades</h2>
          <p>{card.notesBy ? `Last saved by ${card.notesBy}` : 'Written by the class teacher, printed on the card'}</p>
        </div>
        <Btn kind="primary" icon="save" busy={busy} disabled={!dirty} onClick={submit}>Save</Btn>
      </header>
      {card.coScholastic.length ? (
        <div className="rc-co">
          {card.coScholastic.map((a) => (
            <div key={a.key} className="rc-co__row" role="radiogroup" aria-label={a.label}>
              <span>{a.label}</span>
              <span className="rc-co__opts">
                {frame.coScholasticGrades.map((g) => (
                  <button key={g} type="button" role="radio" aria-checked={co[a.key] === g} className={co[a.key] === g ? 'is-on' : undefined}
                    onClick={() => setCo((s) => ({ ...s, [a.key]: s[a.key] === g ? '' : g }))}>{g}</button>
                ))}
              </span>
            </div>
          ))}
        </div>
      ) : <p className="rsf-hint">The school grades no co-scholastic areas — set them under Results → Settings.</p>}
      {frame.remarkBank?.length ? (
        <label className="rc-bank">
          <span>From the remark bank</span>
          <select value="" onChange={(e) => {
            const pick = e.target.value;
            if (!pick) return;
            setRemarks((r) => (r.trim() ? `${r.trim()} ${pick}` : pick).slice(0, REMARKS_MAX));
            setError('');
          }}>
            <option value="">Add a remark…</option>
            {frame.remarkBank.map((r) => <option key={r} value={r}>{r.length > 90 ? `${r.slice(0, 89)}…` : r}</option>)}
          </select>
        </label>
      ) : null}
      <label className="rs-ask__reason rc-notes__remarks">
        <span>Class teacher's remarks</span>
        <textarea rows={3} maxLength={REMARKS_MAX} value={remarks} placeholder={`How ${card.student.name.split(' ')[0]}'s year went — strengths, and what to work on.`}
          onChange={(e) => { setRemarks(e.target.value); setError(''); }} />
        <small className="rc-notes__count">{remarks.length}/{REMARKS_MAX}</small>
      </label>
      {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
    </section>
  );
}

/** Release a section's cards to its families, or take the release back. */
function ReleaseDialog({ ask, onClose, onDone }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!ask) return null;
  const go = async () => {
    setBusy(true); setError('');
    try { const res = await ask.run(); setBusy(false); onDone(ask, res); } catch (e) { setError(e.message || 'That did not work'); setBusy(false); }
  };
  return (
    <Modal open onClose={busy ? () => {} : onClose} maxWidth={500}
      title={<span className={`rs-ask__title rs-t-${ask.tone}`}><i><Ico name={ask.icon} size={18} /></i>{ask.title}</span>}
      footer={<>
        <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
        <Btn kind={ask.danger ? 'danger-solid' : 'primary'} busy={busy} onClick={go}>{ask.confirm}</Btn>
      </>}>
      <div className="rs-ask">
        {ask.body}
        {error ? <p className="rs-ask__error" role="alert"><Ico name="alert" size={15} />{error}</p> : null}
      </div>
    </Modal>
  );
}

export default function ReportCards({ role = 'admin' }) {
  const nav = useNavigate();
  const isAdmin = role === 'admin';
  usePageCrumbs([{ label: 'Report Cards' }]);
  const api = isAdmin ? adminApi : teacherApi;
  const fetcher = api.getReportCards;
  const save = isAdmin ? adminApi.saveReportCardNotes : teacherApi.saveReportCardNotes;
  const pdf = isAdmin ? adminApi.getReportCardsPdf : teacherApi.getReportCardsPdf;
  const [downloading, setDownloading] = useState('');
  const [ask, setAsk] = useState(null);

  const [q, setQ] = useState({ academicYear: '', sectionId: '', term: '' });
  const query = useMemo(() => Object.fromEntries(Object.entries(q).filter(([, v]) => v)), [q]);
  const { body, loading, error, reload } = useBoard(fetcher, query);
  const d = body?.data;

  // A card saved here replaces the one fetched, until the next fetch.
  const [edited, setEdited] = useState({});
  useEffect(() => { setEdited({}); }, [body]);
  const cards = useMemo(() => (d?.cards || []).map((c) => edited[c.student._id] || c), [d, edited]);

  const [pickedId, setPickedId] = useState('');
  const [search, setSearch] = useState('');
  const [printing, setPrinting] = useState(null);
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? cards.filter((c) => `${c.student.name} ${c.student.rollNumber} ${c.student.admissionNumber}`.toLowerCase().includes(s)) : cards;
  }, [cards, search]);
  const card = cards.find((c) => c.student._id === pickedId) || shown[0] || null;

  const done = cards.filter((c) => progress(c).done).length;
  const withResults = cards.filter((c) => c.exams.length).length;
  const sectionName = d?.section ? classLine(d.section) : '';
  const back = isAdmin ? '/admin/results' : '/teacher/results';
  const termKey = d?.frame?.term || '';
  const termName = d?.frame?.termLabel || '';
  const what = `${termName ? `${termName} ` : ''}report cards`;
  const rel = d?.release || null;
  const scope = { academicYear: d?.year?._id, sectionId: d?.section?._id, term: termKey || undefined };
  const withheldCount = cards.filter((c) => c.withheld).length;

  const askRelease = (released) => setAsk({
    title: released ? 'Release to Families' : 'Take Back the Release', icon: released ? 'send' : 'undo', tone: released ? 'green' : 'amber',
    confirm: released ? 'Release Cards' : 'Take Back', danger: !released,
    body: released ? (
      <>
        <p>Release the {what} of <strong>{sectionName}</strong> to its families?</p>
        <ul>
          <li>Each family is told, and can read the whole card — the remarks and co-scholastic grades too — under Results → Report Card.</li>
          <li>{done < cards.length ? `${plural(cards.length - done, 'card')} still ${cards.length - done === 1 ? 'has' : 'have'} remarks or grades to come; they show as they are written.` : 'Every card has its remarks and grades.'}</li>
          {withheldCount ? <li>{plural(withheldCount, 'student')} with a withheld result {withheldCount === 1 ? 'is' : 'are'} not told, and see only that it is withheld.</li> : null}
          <li>Each card gets a QR code that proves the school issued it.</li>
        </ul>
      </>
    ) : (
      <p>Take back the release of the {what} of <strong>{sectionName}</strong>? Families stop seeing the remarks until they are released again{termKey ? '' : ' or the final results are out'}. Nobody is told.</p>
    ),
    run: () => api.releaseReportCards({ ...scope, released }),
    done: released ? 'Report cards released — families have been told' : 'Release taken back',
  });
  const askSend = () => setAsk({
    title: 'Send to Parents', icon: 'mail', tone: 'indigo', confirm: 'Send Cards',
    body: (
      <>
        <p>Email each parent their child's {what.replace(/s$/, '')} as a PDF, from the school's address?</p>
        <ul>
          <li>Parents without an email address get an in-app notice instead.</li>
          <li>Students whose result is withheld are left out.</li>
          {rel?.sentAt ? <li>These cards were sent before, on {fmtStamp(rel.sentAt)} — parents receive them again.</li> : null}
        </ul>
      </>
    ),
    run: () => api.sendReportCards(scope),
    done: (res) => {
      const n = res?.data || res;
      return `Sending ${plural(n?.students ?? 0, 'card')} to ${plural(n?.parents ?? 0, 'parent')} — it takes a minute or two`;
    },
  });

  return (
    <div className="rs-page rc-page">
      <PageHead title="Report Cards"
        subtitle={isAdmin
          ? 'Each student\'s year on one sheet. Print a section\'s cards at once, and see where the remarks are still to come.'
          : 'Your class\'s report cards. Write each student\'s remarks and co-scholastic grades, then print.'}>
        <Btn size="lg" icon="arrowLeft" onClick={() => nav(back)}>Back to Results</Btn>
        <Btn kind="tint" size="lg" icon="download" busy={downloading === 'all'} disabled={!cards.length || !!downloading}
          onClick={async () => {
            setDownloading('all');
            try { await savePdf(() => pdf(scope), pdfName(`${classLine(d.section)}${termName ? ` ${termName}` : ''}`, d.year?.yearName)); }
            catch (e) { toast.error(e.message || 'The PDF could not be made'); } finally { setDownloading(''); }
          }}>Download PDF</Btn>
        <Btn kind="primary" size="lg" icon="printer" disabled={!cards.length || !!printing} onClick={() => setPrinting(cards)}>
          Print Section{cards.length ? ` (${count(cards.length)})` : ''}
        </Btn>
      </PageHead>

      <div className="rs-afilters">
        <SelectField label="Academic Year" width={200} value={q.academicYear || d?.year?._id || ''} onChange={(v) => { setQ({ academicYear: v, sectionId: '' }); setPickedId(''); }}
          options={(d?.years || []).map((y) => ({ value: y._id, label: `${y.yearName}${y.current ? ' (Current)' : ''}` }))} />
        <SelectField label="Class / Section" width={240} value={q.sectionId || d?.section?._id || ''} onChange={(v) => { setQ((s) => ({ ...s, sectionId: v })); setPickedId(''); setSearch(''); }}
          options={(d?.sections || []).map((s) => ({ value: s._id, label: `${classLine(s)} (${s.students})` }))} disabled={!d?.sections?.length} />
        {d?.frame?.terms?.length ? (
          <SelectField label="Report for" width={180} value={q.term || termKey} onChange={(v) => setQ((s) => ({ ...s, term: v }))}
            options={[{ value: '', label: 'The whole year' }, ...d.frame.terms.map((t) => ({ value: t.key, label: t.label }))]} />
        ) : null}
        {cards.length ? (
          <p className="rc-sum">
            <span><strong>{count(withResults)}</strong> of {plural(cards.length, 'student')} with results</span>
            <span><strong>{count(done)}</strong> cards complete</span>
          </p>
        ) : null}
      </div>

      {!d && loading ? <div className="rs-acard rs-loading" role="status">Loading report cards…</div> : null}
      {!d && error ? <div className="rs-acard"><Empty title="Report cards could not be loaded" action={<Btn icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty></div> : null}
      {d && !d.year ? <div className="rs-acard"><Empty title="No academic year">{isAdmin ? 'Create an academic year under Academics first.' : 'You are not class teacher of any section yet.'}</Empty></div> : null}
      {d && d.year && !d.sections.length ? (
        <div className="rs-acard"><Empty title="No sections">{isAdmin ? `${d.year.yearName} has no sections yet.` : `You are not class teacher or vice class teacher of a section in ${d.year.yearName}.`}</Empty></div>
      ) : null}
      {d && d.section && !cards.length ? <div className="rs-acard"><Empty title="Nobody on the roll">{sectionName} has no students on its roll.</Empty></div> : null}

      {d && cards.length ? (
        <div className="rc-release" role="region" aria-label="Releasing to families">
          <span className="rc-release__state">
            <Badge tone={rel?.releasedAt ? 'green' : 'slate'}>{rel?.releasedAt ? 'Released to families' : 'Not released'}</Badge>
            <small>
              {rel?.releasedAt
                ? [`${rel.releasedBy ? `by ${rel.releasedBy}, ` : ''}${fmtStamp(rel.releasedAt)}`, rel.sentAt ? `sent to ${plural(rel.sentCount, 'parent')} ${fmtStamp(rel.sentAt)}` : 'not sent by email yet'].join(' · ')
                : termKey ? 'Families see the marks so far; the remarks once released.' : 'Families see the marks so far; the remarks once released, or with the final results.'}
            </small>
          </span>
          <span className="rc-release__acts">
            {rel?.releasedAt ? (
              <>
                <Btn size="sm" kind="ghost" icon="undo" onClick={() => askRelease(false)}>Take Back</Btn>
                <Btn size="sm" icon="mail" onClick={askSend}>{rel.sentAt ? 'Send Again' : 'Send to Parents'}</Btn>
              </>
            ) : <Btn size="sm" kind="primary" icon="send" onClick={() => askRelease(true)}>Release to Families</Btn>}
          </span>
        </div>
      ) : null}

      {d && cards.length ? (
        <div className={`rc-layout${loading ? ' is-loading' : ''}`} aria-busy={loading || undefined}>
          <aside className="rs-acard rc-list" aria-label={`${sectionName} students`}>
            <SearchBox value={search} onChange={setSearch} placeholder="Search students..." label="Search students" />
            <ul>
              {shown.map((c) => {
                const p = progress(c);
                const on = card?.student._id === c.student._id;
                return (
                  <li key={c.student._id}>
                    <button type="button" className={on ? 'is-on' : undefined} aria-current={on ? 'true' : undefined} onClick={() => setPickedId(c.student._id)}>
                      <i>{c.student.rollNumber || '—'}</i>
                      <span className="rc-list__who">
                        <strong>{c.student.name}</strong>
                        <small>
                          {c.withheld ? 'Withheld · ' : ''}{p.results ? `${c.overall ? `${c.overall.percentage}%` : ''}` : 'No results yet'}
                          {p.areas ? ` · ${p.graded}/${p.areas} graded` : ''}
                          {p.remarks ? ' · remarks' : ''}
                        </small>
                      </span>
                      {c.overall ? <Badge tone={gradeTone(c.overall.grade, d.frame?.scale)} dot={false}>{c.overall.grade}</Badge> : null}
                      {p.done ? <Ico name="checkCircle" size={16} className="rc-list__done" /> : null}
                    </button>
                  </li>
                );
              })}
              {!shown.length ? <li className="rc-list__none">Nobody matches “{search}”.</li> : null}
            </ul>
          </aside>

          {card ? (
            <div className="rc-main">
              <NotesEditor key={`${card.student._id}:${termKey}:${card.notesAt || ''}`} frame={d.frame} card={card} save={save} term={termKey}
                onSaved={(next) => { if (next) setEdited((s) => ({ ...s, [next.student._id]: next })); }} />
              <div className="rc-preview">
                <div className="rc-preview__bar">
                  <span>{card.student.name}'s card, as it prints</span>
                  <span className="rc-preview__acts">
                    <Btn size="sm" icon="download" busy={downloading === card.student._id} disabled={!!downloading}
                      onClick={async () => {
                        setDownloading(card.student._id);
                        try { await savePdf(() => pdf({ ...scope, studentId: card.student._id }), pdfName(`${card.student.name}${termName ? ` ${termName}` : ''}`, d.year?.yearName)); }
                        catch (e) { toast.error(e.message || 'The PDF could not be made'); } finally { setDownloading(''); }
                      }}>PDF</Btn>
                    <Btn size="sm" icon="printer" disabled={!!printing} onClick={() => setPrinting([card])}>Print</Btn>
                  </span>
                </div>
                <ReportCardSheet frame={d.frame} card={card} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {printing ? <PrintCards frame={d.frame} cards={printing} onDone={() => setPrinting(null)} /> : null}
      <ReleaseDialog ask={ask} onClose={() => setAsk(null)}
        onDone={(a, res) => { setAsk(null); toast.success(typeof a.done === 'function' ? a.done(res) : a.done); reload(); }} />
    </div>
  );
}
