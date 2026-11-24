/**
 * Student → Documents.
 *
 * The shelf as the person who has to act on it sees it: what has been set, when
 * it is due, whether they have handed it in and what they got for it. The
 * figures at the top are the three questions a student actually has — is
 * anything late, is anything due, has anything come back marked — and each one
 * filters the list below it.
 *
 * Built on the shared viewer kit (pages/documents/viewerParts.jsx), so a PDF, a
 * type pill and a due date read the same here as they do for a parent or in the
 * office.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getDocuments, submitAssignment, markDocumentRead, markDocumentsRead,
  getDocumentComments, addDocumentComment, updateDocumentComment, deleteDocumentComment,
} from '../../api/student.api';
import { Alert, Button, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  ViewerHero, ViewerStats, ViewerStat, ViewerTabs, ViewerTools, SearchField, Picker, YearPicker,
  ReaderList, useReaderView, DocDrawer, NothingHere, StatePill, FileRows, Field, FileDrop, DocComments, UnreadNote, OpenFile,
  ReaderPicks, tickProps,
  TABS, sortsFor, sortOn, useShelf, useReadMarks, fmtDate, HANDIN_TYPES,
} from '../documents/viewerParts';
import { ResetFilters, ViewSwitch, DocFoot } from '../admin/documentParts';
import useCardPaging from '../../hooks/useCardPaging';
import { useSelection } from '../admin/listParts';

export default function StudentDocuments() {
  const [year, setYear] = useState('');
  const [tab,      setTab]      = useState('all');
  const [category, setCategory] = useState('');
  const [search,   setSearch]   = useState('');
  const [sort,     setSort]     = useState('newest');
  const [state,    setState]    = useState('');   // set by the tiles
  const [limit,    setLimit]    = useState(10);
  // List or Card on a laptop, cards only on a phone; a page of cards is whole rows.
  const rv     = useReaderView('student.documents.view');
  const paging = useCardPaging({ cards: rv.asCards });

  const [open,     setOpen]     = useState(null); // the document in the drawer
  const [files,    setFiles]    = useState([]);
  const [sending,  setSending]  = useState(false);

  // A notification names one document (`?focus=`); the drawer's own document
  // is asked for the same way, so it stays current whatever page it is on.
  const [urlParams] = useSearchParams();
  const wanted   = useRef(urlParams.get('focus'));
  const focusRef = useRef(wanted.current);

  // The server narrows, counts and pages; this page only says what it wants.
  const params = useMemo(
    () => ({ year, tab: tab === 'all' ? '' : tab, category, search, sort: sortOn(tab, sort), state }),
    [year, tab, category, search, sort, state],
  );
  const { docs: loaded, meta, loading, error, page, pages, total, setPage, refetch } = useShelf(getDocuments, params, { focusRef, limit });

  // The same list, with what has been opened on this visit already marked read.
  const { docs, read, readAll, stillUnread } = useReadMarks(loaded, { one: markDocumentRead, many: markDocumentsRead });
  const counts   = meta?.counts || {};
  const years    = meta?.years || [];
  const myClass  = meta?.who?.label || '';
  const shown    = docs;
  const unread   = stillUnread(meta?.unreadIds);

  const filtered = !!(category || search || state);
  const clear = () => { setCategory(''); setSearch(''); setState(''); setTab('all'); };

  // Ticked to act on together (Nov 24 2026) — mark read, save their files.
  // A new page or new filters start with nothing ticked.
  const sel = useSelection(shown, `${tab}|${category}|${search}|${sort}|${state}|${year}|${page}|${limit}`);

  // The drawer holds a copy; re-point it at the refreshed row after a submit so
  // it shows the submission that was just made rather than the state before it.
  const live = open
    ? docs.find((d) => d._id === open._id)
      || (meta?.focused && String(meta.focused._id) === String(open._id) ? meta.focused : open)
    : null;

  // The notified document is opened, not just flagged — the marks, the
  // feedback and the reply are inside it. The server finds it wherever it is
  // filed (`meta.focused`), so there is no year to guess at.
  useEffect(() => {
    if (!wanted.current || !meta) return;
    const hit = meta.focused;
    wanted.current = null;
    if (hit) { setOpen(hit); setFiles([]); read(hit); }
    else { focusRef.current = null; toast.error('That document is no longer on your shelf'); }
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const mine    = live?.mySubmission || null;
  const handed  = !!mine && (mine.status === 'submitted' || mine.status === 'late');
  // Looked at by the teacher: the marks and feedback describe the work that
  // was read, so it can no longer be swapped for something else.
  const settled = !!mine && (mine.marks != null || !!mine.reviewedAt);
  const pastDue = !!live?.dueDate && Date.now() > new Date(live.dueDate).getTime();

  const submit = async () => {
    if (!files.length) return toast.error('Attach at least one file');
    setSending(true);
    try {
      const res = await submitAssignment(live._id, (() => {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        return fd;
      })());
      toast.success(res?.message === 'Submitted late' ? 'Handed in — after the due date, so it is marked late' : 'Handed in');
      setFiles([]);
      await refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSending(false);
    }
  };

  const pickState = (v) => { setState(state === v ? '' : v); setTab(state === v ? 'all' : 'assignments'); };

  if (loading && !meta) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page dvpg">
      <ViewerHero
        icon="files"
        title="Documents & Assignments"
        subtitle={myClass
          ? `Everything shared with ${myClass} and with the whole school.`
          : 'Everything shared with your class and with the whole school.'}
        right={years.length > 1 && <YearPicker years={years} value={year} onChange={setYear} />}
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <ViewerStats>
        {/* Opens what it counts: everything on the shelf, no filter (Nov 23 2026). */}
        <ViewerStat icon="files" tone="indigo" value={counts.all} label="Shared with you"
          caption={myClass || 'Your class and the school'} on={!state && tab === 'all'}
          onClick={() => { setState(''); setCategory(''); setSearch(''); setTab('all'); }} />
        <ViewerStat icon="clock" tone="amber" value={counts.pending} label="Still to do"
          caption="Assignments not handed in" on={state === 'pending'} onClick={() => pickState('pending')} />
        <ViewerStat icon="alert" tone="red" value={counts.missed} label="Missed"
          caption="Past their due date" on={state === 'missed'} onClick={() => pickState('missed')} />
        <ViewerStat icon="star" tone="green" value={counts.marked} label="Marked"
          caption="Feedback is waiting" on={state === 'marked'} onClick={() => pickState('marked')} />
      </ViewerStats>

      <section className="card dvpanel">
        <ViewerTabs tabs={TABS} value={tab} counts={counts}
          onChange={(v) => { setTab(v); setState(''); }} />

        <ViewerTools>
          <SearchField value={search} onChange={setSearch} />
          <Picker value={category} onChange={setCategory} all="All categories"
            options={meta?.categories || []} label="Filter by category" />
          <span className="dvtools__sep" />
          <UnreadNote count={unread.length} onClear={() => readAll(unread)} />
          <Picker value={sortOn(tab, sort)} onChange={setSort} options={sortsFor(tab)} label="Sort documents"
            on={sortOn(tab, sort) !== 'newest'} />
          <ResetFilters on={!!(search || category || state || sort !== 'newest')}
            onClick={() => { setSearch(''); setCategory(''); setState(''); setSort('newest'); }} />
          {!rv.cardsOnly && <ViewSwitch value={rv.view} onChange={rv.setView} />}
        </ViewerTools>

        <ReaderPicks sel={sel} total={shown.length} read={readAll} />

        <ReaderList asCards={rv.asCards} gridRef={paging.gridRef}
          docs={shown} loading={loading} {...tickProps(sel)}
          onOpen={(d) => { focusRef.current = d._id; setOpen(d); setFiles([]); read(d); }}
          empty={<NothingHere filtered={filtered} onClear={clear} />}
          badges={(d) => (d.state ? <StatePill state={d.state} /> : null)}
        />

        <DocFoot page={page} pages={pages} total={total} limit={limit} count={shown.length}
          onPage={setPage} sizes={paging.sizes} onLimit={(n) => { setLimit(n); setPage(1); }} />
      </section>

      <DocDrawer
        doc={live}
        onClose={() => { focusRef.current = null; setOpen(null); setFiles([]); }}
        extra={live && (
          <>
          {live.isAssignment && (
          <section className="dvdrawer__sec">
            <h4>Your submission</h4>

            {mine ? (
              <>
                <dl>
                  <Field label="Status"><StatePill state={live.state} /></Field>
                  <Field label="Handed in">
                    {handed ? fmtDate(mine.submittedAt) : 'Nothing was handed in here'}
                  </Field>
                  {mine.marks != null && (
                    <Field label="Marks">
                      <b>{mine.marks}</b>{live.totalMarks ? ` / ${live.totalMarks}` : ''}
                    </Field>
                  )}
                </dl>
                {/* Where the marks came from, when the paper was marked
                    question by question. */}
                {mine.questionScores?.some((q) => q.score != null) && (
                  <ul className="dvscores">
                    {mine.questionScores.filter((q) => q.score != null).map((q) => (
                      <li key={q.label}><span>{q.label}</span><b>{q.score}</b></li>
                    ))}
                  </ul>
                )}
                {handed && <FileRows files={mine.files} caption="Your submission" empty="Handed in with no files" />}
                {mine.feedback && (
                  <div className="dvfeedback">
                    <h5><Icon name="chat" size={14} /> Teacher feedback</h5>
                    <p>{mine.feedback}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="dvnone">You have not handed anything in yet.</p>
            )}

            {settled ? (
              <p className="dvnote dvnote--calm">
                <Icon name="info" size={14} />
                This has been marked, so it can no longer be replaced. Ask your teacher if you need to hand it in again.
              </p>
            ) : live.allowSubmission ? (
              <div className="dvsubmit">
                <span className="form-label">
                  {handed ? 'Replace what you handed in' : 'Attach your work'}
                </span>
                {/* The shared picker rather than a bare file input: it lists
                    what was chosen and lets each file be taken back out, which
                    matters most right before handing the wrong one in. */}
                <FileDrop id="dv-files" files={files} onChange={setFiles} max={5}
                  types={HANDIN_TYPES} typeRule="assignments are handed in as PDF files only"
                  hint="PDF only — up to 5 files, 10 MB each" />
                {/* Said before the button is pressed, and for a replacement
                    too: work handed in on time and swapped after the due date
                    used to turn late without a word. */}
                {pastDue && (
                  <p className="dvwarn">
                    <Icon name="alert" size={14} />
                    {handed && mine.status !== 'late'
                      ? 'The due date has passed — replacing your work now will mark it late.'
                      : 'The due date has passed — this will be marked late.'}
                  </p>
                )}
                <Button onClick={submit} loading={sending} disabled={sending || !files.length}>
                  <Icon name="upload" size={15} /> {handed ? 'Replace submission' : 'Submit'}
                </Button>
              </div>
            ) : (
              <p className="dvnone">Submissions are closed for this one.</p>
            )}
          </section>
          )}

          <DocComments docId={live._id} load={getDocumentComments} post={addDocumentComment}
            update={updateDocumentComment} remove={deleteDocumentComment} />
          </>
        )}
        foot={live?.files?.[0] && <OpenFile files={live.files} caption={live.title} />}
      />
    </div>
  );
}
