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
import { getDocuments, submitAssignment } from '../../api/student.api';
import { Alert, Button, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  ViewerHero, ViewerStats, ViewerStat, ViewerTabs, ViewerTools, SearchField, Picker,
  DocList, DocDrawer, NothingHere, StatePill, FileRows, Field,
  TABS, SORTS, applyFilters, fmtDate, fileUrl,
} from '../documents/viewerParts';

export default function StudentDocuments() {
  const [year, setYear] = useState('');
  const { data, meta, loading, error, refetch } = useFetch(
    () => getDocuments(year ? { year } : undefined), [year],
  );

  const docs     = useMemo(() => (Array.isArray(data) ? data : []), [data]);
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
    () => applyFilters(docs, { tab, category, search, sort, state }),
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
          <Picker value={sort} onChange={setSort} options={SORTS} label="Sort documents" />
        </ViewerTools>

        <DocList
          docs={shown} loading={loading}
          onOpen={(d) => { setOpen(d); setFiles([]); }}
          empty={<NothingHere filtered={filtered} onClear={clear} />}
          badges={(d) => <StatePill state={d.state} />}
        />
      </section>

      <DocDrawer
        doc={live}
        onClose={() => { setOpen(null); setFiles([]); }}
        extra={live?.isAssignment && (
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
                <FileRows files={live.mySubmission.files} empty="Handed in with no files" />
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
                <label className="form-label" htmlFor="dv-files">
                  {live.mySubmission ? 'Replace what you handed in' : 'Attach your work'}
                </label>
                <input id="dv-files" type="file" className="form-control" multiple
                  onChange={(e) => setFiles(Array.from(e.target.files))} />
                {files.length > 0 && <div className="form-hint">{files.length} file(s) chosen</div>}
                {live.state === 'missed' && (
                  <p className="dvwarn">
                    <Icon name="alert" size={14} /> The due date has passed — this will be marked late.
                  </p>
                )}
                <Button onClick={submit} loading={sending} disabled={!files.length}>
                  <Icon name="upload" size={15} /> {live.mySubmission ? 'Replace submission' : 'Submit'}
                </Button>
              </div>
            ) : (
              <p className="dvnone">Submissions are closed for this one.</p>
            )}
          </section>
        )}
        foot={live?.files?.[0] && (
          <a className="btn btn-secondary" href={fileUrl(live.files[0].filePath)} target="_blank" rel="noreferrer">
            <Icon name="download" size={15} /> Open {live.fileCount > 1 ? 'first file' : 'the file'}
          </a>
        )}
      />
    </div>
  );
}
