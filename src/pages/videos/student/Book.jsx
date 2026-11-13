/**
 * Student → Video Learning → a book.
 *
 * The book's chapters in order. A chapter the teacher has not released is
 * shown locked — its place in the book, nothing more — and cannot be opened.
 */
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { student as api } from '../../../api/video.api';
import { Empty } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { Head, Panel, Loadable, Cover, Meter, StatusBadge, Icon, plural } from '../vlParts';

const TONE = { locked: 'slate', available: 'indigo', in_progress: 'amber', completed: 'green' };

export default function StudentVideoBook() {
  const { id } = useParams();
  const { data, loading, error, refetch } = useFetch(() => api.book(id), [id]);
  const book = data?.book;
  usePageCrumbs([book ? { label: book.title } : null]);

  return (
    <div className="page vl-page">
      <Loadable loading={loading} error={error} onRetry={refetch}>
        {book ? (
          <>
            <Head title={book.title} subtitle={[book.subjectName, book.publisher, book.edition].filter(Boolean).join(' · ')}>
              <Link to="/student/videos" className="btn btn-secondary"><Icon name="arrowLeft" size={16} /> All books</Link>
            </Head>

            <div className="vl-card vl-card__body vl-row" style={{ gap: 18, alignItems: 'flex-start' }}>
              <Cover src={book.coverUrl} title={book.title} size="lg" />
              <div className="vl-grow vl-stack" style={{ gap: 10 }}>
                {book.description ? <p className="vl-muted">{book.description}</p> : null}
                <div className="vl-chips">
                  <span className="vl-chip"><Icon name="layers" size={13} /> {plural(data.totals.releasedChapters, 'chapter')} released of {data.chapters.length}</span>
                  <span className="vl-chip"><Icon name="film" size={13} /> {plural(data.totals.videos, 'video')}</span>
                  <span className="vl-chip"><Icon name="checkCircle" size={13} /> {data.totals.completed} completed</span>
                </div>
                {data.totals.videos ? <div style={{ maxWidth: 420 }}><Meter percent={data.totals.percent} label="Progress in this book" /></div> : null}
              </div>
            </div>

            <Panel title="Chapters" flush>
              {data.chapters.length ? (
                <div className="vl-chapters">
                  {data.chapters.map((c) => {
                    const locked = c.status === 'locked';
                    const body = (
                      <>
                        <span className={`vl-chapter__num tint-${TONE[c.status]}`}>{locked ? <Icon name="lock" size={16} /> : c.chapterNumber}</span>
                        <span className="vl-grow">
                          <span className="vl-chapter__title">Chapter {c.chapterNumber}: {c.title}</span>
                          <span className="vl-small vl-muted" style={{ display: 'block' }}>
                            {locked ? 'Not released yet' : `${plural(c.videoCount, 'video')} · ${c.completedCount} completed`}
                          </span>
                        </span>
                        {!locked ? <span style={{ width: 150 }}><Meter percent={c.percent} small label={`Progress in chapter ${c.chapterNumber}`} /></span> : null}
                        <StatusBadge status={c.status} />
                        {!locked ? <Icon name="chevronRight" size={18} /> : <span style={{ width: 18 }} />}
                      </>
                    );
                    return (
                      <div key={c._id} className={`vl-chapter${locked ? ' is-locked' : ''}`}>
                        {locked
                          ? <div className="vl-chapter__head" aria-disabled="true">{body}</div>
                          : <Link to={`/student/videos/chapters/${c._id}`} className="vl-chapter__head">{body}</Link>}
                      </div>
                    );
                  })}
                </div>
              ) : <Empty icon="📖" title="No chapters yet" message="This book's chapters have not been added yet." />}
            </Panel>
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
