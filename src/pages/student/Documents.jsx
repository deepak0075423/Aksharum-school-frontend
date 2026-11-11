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
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import {
  getDocuments, submitAssignment, markDocumentRead, markDocumentsRead,
  getDocumentComments, addDocumentComment, updateDocumentComment, deleteDocumentComment,
} from '../../api/student.api';
import { Alert, Button, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  ViewerHero, ViewerStats, ViewerStat, ViewerTabs, ViewerTools, SearchField, Picker,
  DocList, DocDrawer, NothingHere, StatePill, FileRows, Field, FileDrop, DocComments, UnreadNote, OpenFile,
  TABS, sortsFor, sortOn, applyFilters, useReadMarks, fmtDate,
} from '../documents/viewerParts';

export default function StudentDocuments() {
  const [year, setYear] = useState('');
  const { data, meta, loading, error, refetch } = useFetch(
    () => getDocuments(year ? { year } : undefined), [year],
  );

  const loaded   = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  // The same list, with what has been opened on this visit already marked read.
  const { docs, read, readAll } = useReadMarks(loaded, { one: markDocumentRead, many: markDocumentsRead });
  const counts   = meta?.counts || {};
  const years    = meta?.years || [];
  const myClass  = meta?.who?.label || '';

  const [tab,      setTab]      = useState('all');
  const [category, setCategory] = useState('');
  const [search,   setSearch]   = useState('');
  const [sort,     setSort]     = useState('newest');
  const [state,    setState]    = useState('');   // set by the tiles

  const [open,     setOpen]     = useState(null); // the document in the drawer
  const [files,    setFiles]    = useState([]);
  const [sending,  setSending]  = useState(false);

  const shown = useMemo(
    () => applyFilters(docs, { tab, category, search, sort: sortOn(tab, sort), state }),
    [docs, tab, category, search, sort, state],
  );

  const filtered = !!(category || search || state);
  const clear = () => { setCategory(''); setSearch(''); setState(''); setTab('all'); };

  // The drawer holds a copy; re-point it at the refreshed row after a submit so
  // it shows the submission that was just made rather than the state before it.
  const live = open ? docs.find((d) => d._id === open._id) || open : null;

  const submit = async () => {
    if (!files.length) return toast.error('Attach at least one file');
    setSending(true);
    try {
      await submitAssignment(live._id, (() => {
        const fd = new FormData();
        files.forEach((f) => fd.append('files', f));
        return fd;
      })());
      toast.success(live.state === 'missed' ? 'Submitted — it will be marked late' : 'Submitted');
      setFiles([]);
      await refetch();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message);
    } finally {
      setSending(false);
    }
  };

  const pickState = (v) => { setState(state === v ? '' : v); setTab(state === v ? 'all' : 'assignments'); };

  if (loading && !data) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page dvpg">
      <ViewerHero
        icon="files"
        title="Documents & Assignments"
        subtitle={myClass
          ? `Everything shared with ${myClass} and with the whole school.`
          : 'Everything shared with your class and with the whole school.'}
        right={years.length > 1 && (
          <Picker value={year} onChange={setYear} all="This year" label="Academic year"
            options={[{ value: 'all', label: 'All years' },
              ...years.map((y) => ({ value: y._id, label: y.name }))]} />
        )}
      />

      {error && <Alert variant="danger">{error}</Alert>}

      <ViewerStats>
        <ViewerStat icon="files" tone="indigo" value={counts.all} label="Shared with you"
          caption={myClass || 'Your class and the school'} />
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
          <UnreadNote docs={docs} onClear={() => readAll(docs)} />
          <Picker value={sortOn(tab, sort)} onChange={setSort} options={sortsFor(tab)} label="Sort documents" />
        </ViewerTools>

        <DocList
          docs={shown} loading={loading}
          onOpen={(d) => { setOpen(d); setFiles([]); read(d); }}
          empty={<NothingHere filtered={filtered} onClear={clear} />}
          badges={(d) => <StatePill state={d.state} />}
        />
      </section>

      <DocDrawer
        doc={live}
        onClose={() => { setOpen(null); setFiles([]); }}
        extra={live && (
          <>
          {live.isAssignment && (
          <section className="dvdrawer__sec">
            <h4>Your submission</h4>

            {live.mySubmission ? (
              <>
                <dl>
                  <Field label="Status"><StatePill state={live.state} /></Field>
                  <Field label="Handed in">{fmtDate(live.mySubmission.submittedAt)}</Field>
                  {live.mySubmission.marks != null && (
                    <Field label="Marks">
                      <b>{live.mySubmission.marks}</b>{live.totalMarks ? ` / ${live.totalMarks}` : ''}
                    </Field>
                  )}
                </dl>
                <FileRows files={live.mySubmission.files} caption="Your submission" empty="Handed in with no files" />
                {live.mySubmission.feedback && (
                  <div className="dvfeedback">
                    <h5><Icon name="chat" size={14} /> Teacher feedback</h5>
                    <p>{live.mySubmission.feedback}</p>
                  </div>
                )}
              </>
            ) : (
              <p className="dvnone">You have not handed anything in yet.</p>
            )}

            {live.allowSubmission ? (
              <div className="dvsubmit">
                <span className="form-label">
                  {live.mySubmission ? 'Replace what you handed in' : 'Attach your work'}
                </span>
                {/* The shared picker rather than a bare file input: it lists
                    what was chosen and lets each file be taken back out, which
                    matters most right before handing the wrong one in. */}
                <FileDrop id="dv-files" files={files} onChange={setFiles} max={5}
                  hint="Up to 5 files" />
                {live.state === 'missed' && (
                  <p className="dvwarn">
                    <Icon name="alert" size={14} /> The due date has passed — this will be marked late.
                  </p>
                )}
                <Button onClick={submit} loading={sending} disabled={sending || !files.length}>
                  <Icon name="upload" size={15} /> {live.mySubmission ? 'Replace submission' : 'Submit'}
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
