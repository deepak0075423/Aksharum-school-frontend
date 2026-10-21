/**
 * The admission module's activity log — every status change, review, payment,
 * list, setting and export, with who did it. Read-only.
 */
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { admin } from '../../../api/admission.api';
import { Page, Head, Panel, Chip, Table, Toolbar, SearchBox, Select, Input, Pager, Empty, ErrorBox, Spin, useLoad } from '../admUI';
import { fmtDateTime } from '../meta';
import { useQueryState, useDebounced } from './parts';

const BASE = '/admin/admissions';
const TYPES = {
  status: ['Status', 'blue'], approval: ['Approval', 'amber'], note: ['Note', 'amber'], document: ['Document', 'blue'], payment: ['Payment', 'green'],
  exam: ['Exam', 'indigo'], result: ['Result', 'violet'], list: ['List', 'teal'], offer: ['Offer', 'teal'], conversion: ['Enrolment', 'green'],
  config: ['Settings', 'gray'], form: ['Form', 'gray'], email: ['Email', 'gray'], export: ['Export', 'gray'], bulk: ['Bulk', 'gray'], account: ['Account', 'gray'],
};

export default function Activity() {
  const [q, setQ] = useQueryState({ type: '', q: '', from: '', to: '', page: '1' });
  const [search, setSearch] = useState(q.q);
  const term = useDebounced(search);
  useEffect(() => { if (term !== q.q) setQ({ q: term }); }, [term]); // eslint-disable-line react-hooks/exhaustive-deps
  const params = { type: q.type, q: q.q, from: q.from, to: q.to, page: q.page, limit: 30 };
  const { data, meta, loading, error, reload } = useLoad(() => admin.audit(params), [JSON.stringify(params)]);
  return (
    <Page>
      <Head eyebrow="Admissions" title="Activity" subtitle="Who did what, and when — across every application and setting." />
      <Panel pad={false}>
        <Toolbar>
          <SearchBox value={search} onChange={setSearch} placeholder="Message, person or application no." />
          <Select value={q.type} onChange={(e) => setQ({ type: e.target.value })} aria-label="Kind">
            <option value="">Everything</option>
            {Object.entries(TYPES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </Select>
          <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>From <Input type="date" value={q.from} onChange={(e) => setQ({ from: e.target.value })} style={{ width: 150 }} /></label>
          <label className="adm-row" style={{ gap: 6, fontSize: '.82rem' }}>to <Input type="date" value={q.to} onChange={(e) => setQ({ to: e.target.value })} style={{ width: 150 }} /></label>
        </Toolbar>
        {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
          <>
            <Table rows={data || []} empty={<Empty icon="history" title="Nothing recorded" />}
              columns={[
                { key: 'at', label: 'When', render: (e) => <span style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.createdAt)}</span> },
                { key: 'who', label: 'Who', render: (e) => e.actorName || (e.actorRole === 'system' || !e.actorRole ? <span className="adm-muted">System</span> : e.actorRole) },
                { key: 'type', label: 'Kind', render: (e) => <Chip tone={TYPES[e.type]?.[1] || 'gray'}>{TYPES[e.type]?.[0] || e.type}</Chip> },
                { key: 'msg', label: 'What happened', render: (e) => <>{e.message}{e.visibility === 'applicant' ? <span className="adm-muted" style={{ fontSize: '.74rem' }}> · family sees this</span> : null}</> },
                { key: 'app', label: 'Application', render: (e) => (e.application ? <Link to={`${BASE}/applications/${e.application}`}>{e.applicationNumber || 'Draft'}{e.studentName ? ` · ${e.studentName}` : ''}</Link> : '—') },
              ]} />
            <Pager page={Number(q.page) || 1} pages={Math.max(1, Math.ceil((meta?.total || 0) / 30))} total={meta?.total || 0} onPage={(p) => setQ({ page: p }, { keepPage: true })} label="entries" />
          </>
        )}
      </Panel>
    </Page>
  );
}
