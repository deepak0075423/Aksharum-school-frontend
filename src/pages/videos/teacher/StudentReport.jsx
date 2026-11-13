/**
 * Teacher → Video Learning → Progress → one student.
 *
 * What this student was given in the subjects this teacher takes, what they
 * have watched of it, and each sitting behind those figures. A teacher never
 * sees a student's viewing of another teacher's subject.
 */
import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { teacher as api } from '../../../api/video.api';
import { Button, Empty } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { ListStats, ListStat, Stack } from '../../admin/listParts';
import { Head, Panel, Loadable, Meter, StatusBadge, Icon, clock, dayTime, spent, errText, saveBlob, plural } from '../vlParts';

const ENDED = { ended: 'Left the video', idle: 'Went quiet', superseded: 'Opened elsewhere', revoked: 'Access revoked', unpublished: 'Taken down', expired: 'Release expired', access_ended: 'Access ended', audience_changed: 'Removed from the release' };

export default function TeacherVideoStudentReport() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useFetch(() => api.studentReport(id), [id]);
  const [exporting, setExporting] = useState('');
  const s = data?.student;
  const t = data?.totals;
  usePageCrumbs([s ? { label: s.name } : null]);

  const exportAs = async (format) => {
    setExporting(format);
    try { saveBlob(await api.exportStudent(id, format), `video-report-${(s?.name || 'student').replace(/\s+/g, '-').toLowerCase()}.${format}`); }
    catch (e) { toast.error(errText(e)); }
    finally { setExporting(''); }
  };

  return (
    <div className="page vl-page">
      <Loadable loading={loading} error={error} onRetry={refetch}>
        {s ? (
          <>
            <Head title={s.name} subtitle={`${s.className} ${s.sectionName}${s.rollNumber ? ` · Roll no ${s.rollNumber}` : ''}`}>
              <Link to="/teacher/videos/progress" className="btn btn-secondary"><Icon name="arrowLeft" size={16} /> Progress</Link>
              <Button variant="secondary" loading={exporting === 'xlsx'} onClick={() => exportAs('xlsx')}><Icon name="fileSheet" size={16} /> Excel</Button>
              <Button variant="secondary" loading={exporting === 'pdf'} onClick={() => exportAs('pdf')}><Icon name="filePdf" size={16} /> PDF</Button>
            </Head>

            <div className="vl-five"><ListStats>
              <ListStat icon="bookOpen" tone="indigo" value={t.assignedBooks} label="Books" caption={`${plural(t.releasedChapters, 'chapter')} released`} />
              <ListStat icon="film" tone="blue" value={`${t.watched} / ${t.videos}`} label="Videos watched" caption={`${t.notWatched} not watched`} />
              <ListStat icon="checkCircle" tone="green" value={t.completed} label="Completed" caption={<StatusBadge status={t.status} />} />
              <ListStat icon="target" tone="purple" value={`${t.percent}%`} label="Watch percentage" caption="Across the released videos" />
              <ListStat icon="clock" tone="teal" value={spent(t.watchSeconds)} label="Valid watch time" caption={t.lastWatchedAt ? `Last watched ${dayTime(t.lastWatchedAt)}` : 'Never watched'} />
            </ListStats></div>

            <Panel title="Released videos" subtitle="Everything released to this student in your subjects" flush>
              {data.videos.length ? (
                <div className="table-wrap"><table className="table ltable">
                  <thead><tr><th>Video</th><th>Book</th><th>Length</th><th style={{ minWidth: 150 }}>Watched</th><th>Watch time</th><th>Last watched</th><th>Status</th></tr></thead>
                  <tbody>{data.videos.map((v) => (
                    <tr key={v.chapterVideo}>
                      <td><Stack main={v.title} sub={`Chapter ${v.chapterNumber}: ${v.chapterTitle}`} /></td>
                      <td>{v.bookTitle}</td>
                      <td>{clock(v.durationSec)}</td>
                      <td><Meter percent={v.watchedPercent} small label={`Watched of ${v.title}`} /></td>
                      <td><Stack main={spent(v.watchSeconds)} sub={v.sessions ? plural(v.sessions, 'sitting') : ''} /></td>
                      <td>{v.lastWatchedAt ? dayTime(v.lastWatchedAt) : <span className="vl-muted">Never</span>}</td>
                      <td><StatusBadge status={v.status} /></td>
                    </tr>
                  ))}</tbody>
                </table></div>
              ) : <Empty icon="🎬" title="Nothing is released to this student" message="Videos appear here once you release content to their section." />}
            </Panel>

            <Panel title="Viewing history" subtitle="The most recent sittings, newest first" flush>
              {data.sessions.length ? (
                <div className="table-wrap"><table className="table ltable">
                  <thead><tr><th>Started</th><th>Video</th><th>Watch time</th><th>Ended</th></tr></thead>
                  <tbody>{data.sessions.map((x, i) => (
                    <tr key={i}>
                      <td>{dayTime(x.startedAt)}</td>
                      <td>{x.title}{x.chapterNumber ? <span className="vl-muted"> · Chapter {x.chapterNumber}</span> : null}</td>
                      <td>{spent(x.watchSeconds)}{x.seekViolations ? <span className="vl-muted vl-small"> · {plural(x.seekViolations, 'skip attempt')}</span> : null}</td>
                      <td>{x.status === 'open' ? <StatusBadge status="in_progress">Watching now</StatusBadge> : <span className="vl-muted">{ENDED[x.closeReason] || 'Ended'}</span>}</td>
                    </tr>
                  ))}</tbody>
                </table></div>
              ) : <Empty icon="🕑" title="No viewing yet" />}
            </Panel>
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
