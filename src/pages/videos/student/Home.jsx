/**
 * Student → Video Learning.
 *
 * What the student has been given and how far they are through it: their
 * subjects, the books their section follows, and anything half-watched to pick
 * up again. Only released content is counted — a book with nothing released
 * yet is shown, so the student knows it is theirs, with nothing to open.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { student as api } from '../../../api/video.api';
import { Empty } from '../../../components/ui/index';
import { ListStats, ListStat } from '../../admin/listParts';
import { Head, Panel, Loadable, Cover, Thumb, Meter, Icon, clock, plural } from '../vlParts';

export default function StudentVideoHome() {
  const { data, loading, error, refetch } = useFetch(api.home);
  const t = data?.totals;
  const where = data?.where;

  return (
    <div className="page vl-page">
      <Head title="Video Learning"
        subtitle={where?.placed ? `${where.className} ${where.sectionName} · ${where.yearName}` : 'Lessons your teachers release to you'}>
        <Link to="/student/videos/history" className="btn btn-secondary"><Icon name="history" size={16} /> Watch history</Link>
      </Head>

      <Loadable loading={loading} error={error} onRetry={refetch}>
        {data && !where?.placed ? (
          <div className="vl-card"><Empty icon="🎒" title="You are not in a section yet"
            message="Video lessons follow your class and section. They will appear here once the school places you in one." /></div>
        ) : data && !data.books.length ? (
          <div className="vl-card"><Empty icon="📚" title="No books yet"
            message="Your school has not chosen video lesson books for your section yet." /></div>
        ) : data ? (
          <>
            <ListStats>
              <ListStat icon="bookOpen" tone="indigo" value={t.books} label="Books" caption={`${plural(t.subjects, 'subject')} · ${plural(t.releasedChapters, 'chapter')} released`} />
              <ListStat icon="film" tone="blue" value={t.videos} label="Videos available" caption={t.videos ? `${t.notStarted} not started` : 'Nothing released yet'} />
              <ListStat icon="checkCircle" tone="green" value={t.completed} label="Completed" caption={`${t.inProgress} in progress`} />
              <ListStat icon="target" tone="purple" value={`${t.percent}%`} label="Overall progress" caption="Across everything released to you" />
            </ListStats>

            {data.continueWatching.length > 0 && (
              <Panel title="Continue watching" subtitle="Pick up where you left off">
                <div className="vl-grid vl-grid--wide">
                  {data.continueWatching.map((v) => (
                    <Link key={v.chapterVideo} to={`/student/videos/watch/${v.chapterVideo}`} className="vl-video">
                      <Thumb src={v.thumbnailUrl} durationSec={v.durationSec} percent={v.watchedPercent} />
                      <div className="vl-video__body">
                        <span className="vl-video__title vl-clip">{v.title}</span>
                        <span className="vl-small vl-muted vl-clip">Chapter {v.chapterNumber} · {v.bookTitle}</span>
                        <span className="vl-small"><b>Resume at {clock(v.resumePositionSec)}</b></span>
                      </div>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}

            {data.subjects.map((s) => (
              <Panel key={s._id} title={s.name}
                subtitle={`${plural(s.books, 'book')} · ${s.videos ? `${s.completed} of ${plural(s.videos, 'video')} completed` : 'nothing released yet'}`}>
                <div className="vl-grid vl-grid--wide">
                  {data.books.filter((b) => String(b.lmsSubject) === String(s._id)).map((b) => (
                    <Link key={b._id} to={`/student/videos/books/${b._id}`} className="vl-book">
                      <Cover src={b.coverUrl} title={b.title} size="lg" />
                      <div className="vl-book__body">
                        <span className="vl-book__title">{b.title}</span>
                        <span className="vl-book__sub">{[b.publisher, b.edition].filter(Boolean).join(' · ') || b.language}</span>
                        <span className="vl-book__sub">
                          {b.videos ? `${plural(b.releasedChapters, 'chapter')} · ${plural(b.videos, 'video')}` : 'Nothing released yet'}
                        </span>
                        {b.videos ? <Meter percent={b.percent} small label={`Progress in ${b.title}`} /> : null}
                      </div>
                    </Link>
                  ))}
                </div>
              </Panel>
            ))}
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
