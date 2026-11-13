/**
 * Teacher → Video Learning → a book.
 *
 * The book laid out chapter by chapter, for ONE of the teacher's sections at
 * a time, with what is already out. Three things can be released from here:
 * the whole book, a chapter, or a single video — a single video opens that
 * video and nothing else in its chapter.
 */
import React, { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { teacher as api } from '../../../api/video.api';
import { Button, Empty, Alert } from '../../../components/ui/index';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import Tabs from '../../../components/ui/Tabs';
import { Head, Panel, Loadable, Cover, Thumb, Icon, clock, plural, day } from '../vlParts';
import { ReleaseDialog, ReleasedTag } from './releaseParts';

export default function TeacherVideoBook() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const section = params.get('section') || '';
  const { data, loading, error, refetch } = useFetch(() => api.book(id, section || undefined), [id, section]);
  const [target, setTarget] = useState(null);
  const book = data?.book;
  usePageCrumbs([book ? { label: book.title } : null]);

  const current = data?.section;
  const here = data?.sections?.find((s) => String(s.section) === String(current));
  const release = (level, chapter, video) => setTarget({ book, level, chapter, video });

  return (
    <div className="page vl-page">
      <Loadable loading={loading && !data} error={error} onRetry={refetch}>
        {book ? (
          <>
            <Head title={book.title} subtitle={[book.subjectName, book.publisher, book.edition].filter(Boolean).join(' · ')}>
              <Link to="/teacher/videos/books" className="btn btn-secondary"><Icon name="arrowLeft" size={16} /> My books</Link>
              <Link to={`/teacher/videos/releases?book=${book._id}`} className="btn btn-secondary"><Icon name="list" size={16} /> Releases of this book</Link>
            </Head>

            {data.sections.length > 1 ? (
              <Tabs variant="pill" label="Section" value={String(current)} onChange={(v) => setParams({ section: v })}
                items={data.sections.map((s) => ({ key: String(s.section), label: `${s.className} ${s.sectionName}`, count: s.studentCount }))} />
            ) : null}

            <div className="vl-card vl-card__body vl-row" style={{ gap: 18 }}>
              <Cover src={book.coverUrl} title={book.title} size="lg" />
              <div className="vl-grow vl-stack" style={{ gap: 8 }}>
                <div className="vl-row">
                  <b>{here ? `${here.className} ${here.sectionName}` : ''}</b>
                  <span className="vl-muted vl-small">{here ? plural(here.studentCount, 'student') : ''}</span>
                  <ReleasedTag status={data.bookRelease?.shownStatus} level="book" />
                </div>
                <p className="vl-muted vl-small">
                  {data.bookRelease
                    ? `The whole book is ${data.bookRelease.shownStatus === 'active' ? 'released' : `scheduled for ${day(data.bookRelease.releaseAt)}`} for this section — every chapter and video, including any added later.`
                    : 'Release the whole book in one go, or open it up chapter by chapter or video by video below.'}
                </p>
              </div>
              {!data.bookRelease
                ? <Button onClick={() => release('book')} disabled={!data.chapters.length}><Icon name="send" size={16} /> Release whole book</Button>
                : <Link to={`/teacher/videos/releases?book=${book._id}`} className="btn btn-secondary">Manage</Link>}
            </div>

            <Panel title="Chapters" subtitle="A released chapter opens all its videos. A released video opens only itself." flush>
              {data.chapters.length ? (
                <div className="vl-chapters">
                  {data.chapters.map((c) => {
                    const covered = c.release || data.bookRelease;
                    return (
                      <div key={c._id} className="vl-chapter">
                        <div className="vl-chapter__head">
                          <span className="vl-chapter__num tint-indigo">{c.chapterNumber}</span>
                          <span className="vl-grow">
                            <span className="vl-chapter__title">Chapter {c.chapterNumber}: {c.title}</span>
                            <span className="vl-small vl-muted" style={{ display: 'block' }}>{c.videos.length ? plural(c.videos.length, 'video') : 'No videos yet'}</span>
                          </span>
                          <ReleasedTag status={covered?.shownStatus} via={covered ? covered.level : null} level="chapter" />
                          {!covered && c.videos.length
                            ? <Button size="sm" onClick={() => release('chapter', c)}><Icon name="send" size={14} /> Release chapter</Button> : null}
                        </div>
                        {c.videos.length ? (
                          <div className="vl-chapter__videos">
                            {c.videos.map((v) => (
                              <div key={v._id} className="vl-vrow">
                                <Thumb src={v.thumbnailUrl} durationSec={v.durationSec} size="sm" />
                                <span className="vl-grow">
                                  <span className="vl-vrow__title">{v.title}</span>
                                  <span className="vl-small vl-muted" style={{ display: 'block' }}>{clock(v.durationSec)} · {v.language}</span>
                                </span>
                                <span className="vl-vrow__acts">
                                  <ReleasedTag status={v.releasedStatus} via={v.releasedVia} level="video" />
                                  {!v.releasedVia
                                    ? <Button size="sm" variant="secondary" onClick={() => release('video', c, v)}><Icon name="send" size={14} /> Release video</Button> : null}
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : <Empty icon="📖" title="This book has no chapters yet" message="Chapters and videos are added to the library by Aksharum. Your school office can request missing content." />}
            </Panel>

            <Alert variant="info">
              To take something down, change its dates or the students it is for, open <Link to={`/teacher/videos/releases?book=${book._id}`}>the releases of this book</Link>.
              Taking a release down never removes what students have already watched.
            </Alert>

            <ReleaseDialog open={!!target} target={target} sections={data.sections} section={current}
              onClose={() => setTarget(null)} onDone={refetch} />
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
