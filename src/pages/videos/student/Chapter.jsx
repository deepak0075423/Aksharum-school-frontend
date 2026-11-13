/**
 * Student → Video Learning → a chapter.
 *
 * The videos of the chapter that have been released to this student — and only
 * those — each with how much of it they have watched and where to resume.
 */
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { student as api } from '../../../api/video.api';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { Head, Panel, Loadable, Thumb, Meter, StatusBadge, Icon, clock, day, plural } from '../vlParts';

export default function StudentVideoChapter() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useFetch(() => api.chapter(id), [id]);
  const ch = data?.chapter;
  usePageCrumbs(ch ? [{ label: ch.bookTitle, to: `/student/videos/books/${ch.book}` }, { label: `Chapter ${ch.chapterNumber}` }] : []);

  return (
    <div className="page vl-page">
      <Loadable loading={loading} error={error} onRetry={refetch}>
        {ch ? (
          <>
            <Head title={`Chapter ${ch.chapterNumber}: ${ch.title}`} subtitle={ch.bookTitle}>
              <Link to={`/student/videos/books/${ch.book}`} className="btn btn-secondary"><Icon name="arrowLeft" size={16} /> Chapters</Link>
            </Head>
            {ch.description ? <p className="vl-muted" style={{ maxWidth: 760 }}>{ch.description}</p> : null}

            <Panel title="Videos" subtitle={`${data.totals.completed} of ${plural(data.totals.videos, 'video')} completed`}
              action={<span style={{ width: 180 }}><Meter percent={data.totals.percent} small label="Progress in this chapter" /></span>}>
              <div className="vl-videos">
                {data.videos.map((v, i) => (
                  <Link key={v.chapterVideo} to={`/student/videos/watch/${v.chapterVideo}`} className="vl-video">
                    <Thumb src={v.thumbnailUrl} durationSec={v.durationSec} percent={v.watchedPercent} />
                    <div className="vl-video__body">
                      <span className="vl-video__title">{i + 1}. {v.title}</span>
                      <span className="vl-small vl-muted">
                        {clock(v.durationSec)} long
                        {v.lastWatchedAt ? ` · last watched ${day(v.lastWatchedAt)}` : ''}
                        {v.availableUntil ? ` · available until ${day(v.availableUntil)}` : ''}
                      </span>
                      <span style={{ maxWidth: 320 }}><Meter percent={v.watchedPercent} small label={`Watched of ${v.title}`} /></span>
                    </div>
                    <StatusBadge status={v.status} />
                    <span className="btn btn-primary btn-sm">
                      {v.status === 'completed' ? 'Watch again' : v.canResume ? `Resume at ${clock(v.resumePositionSec)}` : 'Watch'}
                    </span>
                  </Link>
                ))}
              </div>
            </Panel>
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
