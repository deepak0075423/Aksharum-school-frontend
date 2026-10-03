/**
 * Admin → Results → Activity (Oct 2026): the module's school-wide trail —
 * what has no exam left to carry it. A draft deleted, a class test handed
 * over or deleted, electives set, report cards released or sent (school-backend
 * models/ResultAuditLog). Each exam keeps its own history in its drawer.
 *
 * Newest first, a hundred at a time; "Show older" reads on from the last one
 * shown. The search narrows what is on screen.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '../../../api/admin.api';
import { usePageCrumbs } from '../../../contexts/BreadcrumbContext';
import { PageHead, Btn, Badge, Empty, SearchBox, fmtStamp, fmtTime } from '../rsUI';

const ENTITY = {
  Exam: ['Exam', 'indigo'], ClassTest: ['Class test', 'blue'], Settings: ['Settings', 'slate'], Electives: ['Electives', 'violet'],
  ReportCards: ['Report cards', 'green'], Recheck: ['Re-check', 'amber'], ExamDay: ['Exam day', 'blue'],
};
const ROLE = { school_admin: 'Office', admin: 'Office', teacher: 'Teacher', office: 'Office', student: 'Student', parent: 'Parent' };

export default function ResultActivity() {
  const nav = useNavigate();
  usePageCrumbs([{ label: 'Activity' }]);
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async (before = null) => {
    setLoading(true); setError(null);
    try {
      const res = await api.getResultActivity({ limit: 100, ...(before ? { before } : null) });
      setRows((r) => (before ? [...r, ...(res.data || [])] : res.data || []));
      setMore(!!res.more);
    } catch (e) { setError(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const q = search.trim().toLowerCase();
  const shown = q ? rows.filter((r) => `${r.description} ${r.by} ${r.action} ${r.entity}`.toLowerCase().includes(q)) : rows;

  return (
    <div className="rs-page">
      <PageHead title="Results Activity" subtitle="What has been done in Results that no exam carries — drafts deleted, class tests handed over, electives, report cards released and sent.">
        <Btn size="lg" icon="arrowLeft" onClick={() => nav('/admin/results')}>Back to Results</Btn>
      </PageHead>

      <section className="rs-card" aria-label="Results activity">
        <div className="rs-card__top">
          <span className="rs-card__title">Newest first</span>
          <div className="rs-tools">
            <SearchBox value={search} onChange={setSearch} placeholder="Search the activity..." label="Search the activity" />
          </div>
        </div>
        <div className="rs-tablearea">
          {shown.length ? (
            <ol className="rs-timeline rs-activity">
              {shown.map((a) => {
                const [label, tone] = ENTITY[a.entity] || [a.entity, 'slate'];
                return (
                  <li key={a._id}>
                    <strong>{a.description || a.action}</strong>
                    <span>
                      <Badge tone={tone} dot={false}>{label}</Badge>
                      {[a.by ? `${a.by}${ROLE[a.role] ? ` (${ROLE[a.role]})` : ''}` : '', `${fmtStamp(a.at)}, ${fmtTime(a.at)}`].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : loading && !rows.length ? <div className="rs-loading" role="status">Loading…</div>
            : error && !rows.length ? <Empty title="The activity could not be loaded" action={<Btn icon="refresh" onClick={() => load()}>Try again</Btn>}>{error.message}</Empty>
              : <Empty title={q ? 'Nothing matches' : 'Nothing yet'}>{q ? 'Nothing on this page matches the search.' : 'Things done in Results that no exam carries are listed here as they happen.'}</Empty>}
          {more ? (
            <div className="rs-activity__more">
              <Btn busy={loading} onClick={() => load(rows[rows.length - 1]?.at)}>Show Older</Btn>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
