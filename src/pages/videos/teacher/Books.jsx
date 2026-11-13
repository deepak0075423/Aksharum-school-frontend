/**
 * Teacher → Video Learning → My books.
 *
 * The books of the sections where this teacher takes the subject — nothing
 * else exists for them here. A teacher with no subject assigned in a section
 * sees why the page is empty rather than a blank list.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { teacher as api } from '../../../api/video.api';
import { Empty } from '../../../components/ui/index';
import { Head, Loadable, Cover, Icon, plural } from '../vlParts';

export default function TeacherVideoBooks() {
  const { data, loading, error, refetch } = useFetch(api.workspace);
  const books = data?.books || [];
  const sections = data?.sections || [];

  return (
    <div className="page vl-page">
      <Head title="My books" subtitle="The books your sections follow for the subjects you teach. Open one to release its chapters and videos to your students." />
      <Loadable loading={loading} error={error} onRetry={refetch}>
        {!sections.length ? (
          <div className="vl-card"><Empty icon="🧑‍🏫" title="No subject is assigned to you yet"
            message="Books appear here for the sections where you are the subject teacher. Ask the school office to assign your subject to your sections." /></div>
        ) : !books.length ? (
          <div className="vl-card"><Empty icon="📚" title="No books for your subjects yet"
            message="The school has not chosen video lesson books for the subjects you teach. The school office does this under Video Learning › Setup." /></div>
        ) : (
          <div className="vl-grid vl-grid--wide">
            {books.map((b) => (
              <Link key={b._id} to={`/teacher/videos/books/${b._id}`} className="vl-book">
                <Cover src={b.coverUrl} title={b.title} size="lg" />
                <div className="vl-book__body">
                  <span className="vl-book__title">{b.title}</span>
                  <span className="vl-book__sub">{[b.subjectName, b.publisher, b.edition].filter(Boolean).join(' · ')}</span>
                  <span className="vl-book__sub">{plural(b.chapterCount, 'chapter')} · {plural(b.videoCount, 'video')}</span>
                  <div className="vl-chips">
                    {b.sections.map((s) => (
                      <span key={s.section} className="vl-chip" title={`${plural(s.studentCount, 'student')}`}>
                        <Icon name="users" size={13} /> {s.className} {s.sectionName}
                        {s.liveReleases ? ` · ${s.liveReleases} released` : ' · nothing released'}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Loadable>
    </div>
  );
}
