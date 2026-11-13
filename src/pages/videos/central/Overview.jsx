/**
 * Super Admin → Video Library → Overview.
 *
 * The library at a glance: how much content there is, what still needs
 * attention (chapters with no videos, videos mapped nowhere, uploads being
 * processed, requests waiting), and which schools and books are in use.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useFetch from '../../../hooks/useFetch';
import { central as api } from '../../../api/video.api';
import { Button, Empty, Alert } from '../../../components/ui/index';
import { ListStats, ListStat, Stack } from '../../admin/listParts';
import { Head, Panel, Loadable, StatusBadge, Icon, bytes, dayTime, spent } from '../vlParts';

export default function CentralVideoOverview() {
  const [fresh, setFresh] = useState(0);
  const { data, loading, error, refetch } = useFetch(() => api.overview(fresh ? { fresh: 1 } : undefined), [fresh]);
  const meta = useFetch(api.meta);
  const t = data?.totals;
  const target = (meta.data?.providers || []).find((p) => p.isDefault);

  return (
    <div className="page vl-page">
      <Head title="Video Library" subtitle="One central library — Board → Class → Subject → Book → Chapter → Videos — shared by every school.">
        <Button variant="secondary" onClick={() => setFresh((n) => n + 1)}><Icon name="refresh" size={16} /> Refresh</Button>
      </Head>
      <Loadable loading={loading && !data} error={error} onRetry={refetch}>
        {t ? (
          <>
            {meta.data && (!target || !target.usable) ? (
              <Alert variant="warning">
                {target ? `${target.label} is chosen for uploads but is not fully set up` : 'No storage provider is chosen for uploads'} — video files cannot be uploaded until this is done.{' '}
                <Link to="/super-admin/videos/providers">Open Providers</Link>
              </Alert>
            ) : null}

            <div className="vl-five"><ListStats>
              <ListStat icon="layers" tone="indigo" value={t.boards} label="Boards" caption={`${t.subjects} subjects`} to="/super-admin/videos/boards" />
              <ListStat icon="bookOpen" tone="blue" value={t.books} label="Books" caption={`${t.chapters} chapters`} to="/super-admin/videos/books" />
              <ListStat icon="film" tone="purple" value={t.videos} label="Video assets" caption={`${t.videosReady} ready · ${bytes(t.storageBytes)} stored`} to="/super-admin/videos/assets" />
              <ListStat icon="school" tone="green" value={t.schoolsUsing} label="Schools using" caption={`${t.liveReleases} live releases`} />
              <ListStat icon="mail" tone="amber" value={t.requestsPending} label="Requests pending" caption={`${t.requestsInHand} in hand`} to="/super-admin/videos/requests?status=open" />
            </ListStats></div>

            <ListStats>
              <ListStat icon="alert" tone="orange" value={t.chaptersWithoutVideos} label="Chapters without videos" caption="Waiting for content" />
              <ListStat icon="files" tone="slate" value={t.videosUnmapped} label="Videos not mapped" caption="In the library, in no chapter" to="/super-admin/videos/assets?mapped=false" />
              <ListStat icon="users" tone="teal" value={t.studentsWatching} label="Students watching" caption={`${spent(t.watchSeconds)} watched in all`} />
              <ListStat icon="checkCircle" tone="green" value={t.videosCompleted} label="Videos completed" caption="Student completions, all schools" />
            </ListStats>

            <div className="vl-two">
              <Panel title="Most used books" flush>
                {data.topBooks.length ? (
                  <div className="table-wrap"><table className="table ltable">
                    <thead><tr><th>Book</th><th>Schools</th><th>Students watching</th></tr></thead>
                    <tbody>{data.topBooks.map((b) => (
                      <tr key={b._id}><td><Link to={`/super-admin/videos/books/${b._id}`}><Stack main={b.title} sub={`${b.boardCode} · ${b.classLabel} · ${b.subjectName}`} /></Link></td><td>{b.schools}</td><td>{b.viewers}</td></tr>
                    ))}</tbody>
                  </table></div>
                ) : <Empty icon="📚" title="No school follows a book yet" message="Books appear here once schools select them." />}
              </Panel>
              <Panel title="Uploads and processing" flush>
                {data.queue.length ? (
                  <div className="table-wrap"><table className="table ltable"><tbody>{data.queue.map((v) => (
                    <tr key={v._id}><td><Stack main={v.title} sub={v.processingError || dayTime(v.updatedAt)} /></td><td className="ltable__acts"><StatusBadge status={v.processingStatus} /></td></tr>
                  ))}</tbody></table></div>
                ) : <Empty icon="✅" title="Nothing waiting" message="Every uploaded video has been processed." />}
              </Panel>
            </div>

            <div className="vl-two">
              <Panel title="Schools" subtitle="Schools that have chosen a board for the current year" flush>
                {data.schools.length ? (
                  <div className="table-wrap"><table className="table ltable">
                    <thead><tr><th>School</th><th>Board</th><th>Books</th><th>Live releases</th><th>Students watching</th></tr></thead>
                    <tbody>{data.schools.map((s) => (<tr key={s._id}><td><b>{s.name}</b></td><td>{s.boardCode}</td><td>{s.books}</td><td>{s.liveReleases}</td><td>{s.viewers}</td></tr>))}</tbody>
                  </table></div>
                ) : <Empty icon="🏫" title="No school has set up Video Learning yet" />}
              </Panel>
              <Panel title="Recent activity" action={<Link to="/super-admin/videos/activity" className="vl-link vl-small">See all</Link>}>
                {data.recent.length ? (
                  <ul className="vl-timeline">{data.recent.map((a, i) => (<li key={i}><div>{a.summary || a.action}<time>{dayTime(a.createdAt)}{a.actorName ? ` · ${a.actorName}` : ''}</time></div></li>))}</ul>
                ) : <p className="vl-muted vl-small">Nothing yet.</p>}
              </Panel>
            </div>
          </>
        ) : null}
      </Loadable>
    </div>
  );
}
