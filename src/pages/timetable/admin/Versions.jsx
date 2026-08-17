import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { PageHeader, Button, Card, Table, Modal, Confirm, Badge, Spinner, Empty, Alert } from '../../../components/ui/index';
import { StatusBadge, STATUS_META } from './shared';

const fmt = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

export default function TimetableVersions() {
  const navigate = useNavigate();
  const [rows, setRows]     = useState([]);
  const [years, setYears]   = useState([]);
  const [yearId, setYearId] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoad]  = useState(true);
  const [busy, setBusy]     = useState(false);
  const [rename, setRename] = useState(null);
  const [del, setDel]       = useState(null);
  const [compare, setCompare] = useState(null);
  const [audit, setAudit]   = useState(null);

  const load = useCallback(async (yid = yearId) => {
    setLoad(true);
    try {
      const [vRes, mRes] = await Promise.all([
        api.getVersions({ ...(yid ? { yearId: yid } : {}), ...(status ? { status } : {}) }),
        years.length ? null : api.getMeta(),
      ]);
      const v = vRes.data ?? vRes;
      setRows(v.versions || []);
      if (!yid) setYearId(v.selectedYearId || '');
      if (mRes) setYears((mRes.data ?? mRes).years || []);
    } catch (e) { toast.error(e.message); } finally { setLoad(false); }
  }, [yearId, status, years.length]);

  useEffect(() => { load(); }, [status]); // eslint-disable-line

  const act = async (fn, message) => {
    setBusy(true);
    try { await fn(); toast.success(message); await load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };

  const doCompare = async (a, b) => {
    setCompare({ loading: true });
    try {
      const res = await api.compareVersions(a, b);
      setCompare(res.data ?? res);
    } catch (e) { toast.error(e.message); setCompare(null); }
  };

  const openAudit = async (version) => {
    setAudit({ loading: true, version });
    try {
      const res = await api.getAudit({ versionId: version._id, limit: 100 });
      setAudit({ version, logs: (res.data ?? res).logs || [] });
    } catch (e) { toast.error(e.message); setAudit(null); }
  };

  const published = rows.find(r => r.status === 'published');

  const columns = [
    {
      key: 'v', label: 'Version', render: r => (
        <div>
          <strong style={{ cursor: 'pointer', color: 'var(--primary)' }} onClick={() => navigate(`/admin/timetable/versions/${r._id}`)}>
            v{r.versionNumber} · {r.label || 'Untitled'}
          </strong>
          <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
            {r.scopeType === 'school' ? 'Entire school' : r.scopeType === 'multiple' ? 'Multiple classes' : 'Single class'}
            {' · '}{r.sectionCount} section(s)
            {r.description ? ` · ${r.description}` : ''}
          </div>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: r => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <StatusBadge status={r.status} />
        {r.errorCount > 0 && <Badge variant="danger">{r.errorCount} err</Badge>}
        {r.warningCount > 0 && <Badge variant="warning">{r.warningCount} warn</Badge>}
      </div>
    )},
    { key: 'entries', label: 'Periods', render: r => r.stats?.entriesGenerated ?? '—' },
    { key: 'created', label: 'Generated', render: r => (
      <div style={{ fontSize: '.78rem' }}>
        {fmt(r.generatedAt || r.createdAt)}
        <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{r.generatedBy?.name || ''}</div>
      </div>
    )},
    { key: 'published', label: 'Published', render: r => (
      r.publishedAt
        ? <div style={{ fontSize: '.78rem' }}>{fmt(r.publishedAt)}<div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{r.publishedBy?.name || ''}</div></div>
        : <span style={{ color: 'var(--text-light)' }}>—</span>
    )},
    { key: 'a', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Button size="sm" variant="secondary" onClick={() => navigate(`/admin/timetable/versions/${r._id}`)}>Open</Button>
        <Button size="sm" variant="secondary" onClick={() => openAudit(r)}>History</Button>
        {published && published._id !== r._id && (
          <Button size="sm" variant="secondary" onClick={() => doCompare(published._id, r._id)}>Compare</Button>
        )}
        {r.status === 'archived'
          ? <Button size="sm" variant="secondary" disabled={busy}
              onClick={() => act(async () => {
                const res = await api.restoreVersion(r._id);
                navigate(`/admin/timetable/versions/${(res.data ?? res).versionId}`);
              }, 'Restored as a new draft')}>Restore</Button>
          : <Button size="sm" variant="secondary" disabled={busy}
              onClick={() => act(() => api.duplicateVersion(r._id), 'Duplicated')}>Duplicate</Button>}
        {r.status !== 'published' && r.status !== 'archived' && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => api.archiveVersion(r._id), 'Archived')}>Archive</Button>
        )}
        {r.status !== 'published' && (
          <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
        )}
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader
        title="Timetable Versions"
        subtitle="Every generation is kept — publishing never destroys the previous schedule"
        action={<Button onClick={() => navigate('/admin/timetable/generate')}>⚡ Generate Timetable</Button>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 220 }} value={yearId}
          onChange={e => { setYearId(e.target.value); load(e.target.value); }}>
          {years.map(y => <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (active)' : ''}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 180 }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_META).map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
        </select>
      </div>

      {published && (
        <Alert variant="success">
          <strong>v{published.versionNumber} — {published.label}</strong> is live. Teachers and students see this schedule.
        </Alert>
      )}

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🗓️" emptyTitle="No timetable versions yet" />
      </div></div>

      <Confirm
        open={!!del} onClose={() => setDel(null)}
        title="Delete version"
        message={`Delete v${del?.versionNumber} "${del?.label}"? Its draft periods will be removed. The audit history is kept.`}
        loading={busy}
        onConfirm={() => act(async () => { await api.deleteVersion(del._id); setDel(null); }, 'Version deleted')}
      />

      {/* ── Version comparison ──────────────────────────────────────────── */}
      <Modal open={!!compare} onClose={() => setCompare(null)} title="Compare versions" maxWidth={780}>
        {compare?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div> : compare && (
          <>
            <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
              <div><strong>v{compare.from.versionNumber}</strong> {compare.from.label} <StatusBadge status={compare.from.status} /> · {compare.from.entries} periods</div>
              <div style={{ color: 'var(--text-muted)' }}>→</div>
              <div><strong>v{compare.to.versionNumber}</strong> {compare.to.label} <StatusBadge status={compare.to.status} /> · {compare.to.entries} periods</div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <Badge variant="success">{compare.summary.added} added</Badge>
              <Badge variant="danger">{compare.summary.removed} removed</Badge>
              <Badge variant="warning">{compare.summary.changed} changed</Badge>
            </div>
            {!compare.changes.length
              ? <Empty icon="🟰" title="Identical" message="These two versions schedule every period the same way." />
              : (
                <div className="table-wrap" style={{ maxHeight: 380, overflowY: 'auto' }}>
                  <table className="table">
                    <thead><tr><th>Class</th><th>Slot</th><th>Before</th><th>After</th></tr></thead>
                    <tbody>
                      {compare.changes.slice(0, 300).map((c, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: '.8rem' }}>{c.section}</td>
                          <td style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>{c.dayOfWeek} P{c.periodNumber}</td>
                          <td style={{ fontSize: '.8rem', color: c.from ? 'var(--text)' : 'var(--text-light)' }}>
                            {c.from ? `${c.from.subject}${c.from.teacher ? ` · ${c.from.teacher}` : ''}` : '—'}
                          </td>
                          <td style={{ fontSize: '.8rem', color: c.to ? 'var(--text)' : 'var(--text-light)' }}>
                            {c.to ? `${c.to.subject}${c.to.teacher ? ` · ${c.to.teacher}` : ''}` : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {compare.changes.length > 300 && <div style={{ padding: 8, fontSize: '.78rem', color: 'var(--text-muted)' }}>+{compare.changes.length - 300} more changes</div>}
                </div>
              )}
          </>
        )}
      </Modal>

      {/* ── Audit history for a version ─────────────────────────────────── */}
      <Modal open={!!audit} onClose={() => setAudit(null)} title={`History · v${audit?.version?.versionNumber ?? ''}`} maxWidth={680}>
        {audit?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 30 }}><Spinner /></div> : audit && (
          !audit.logs?.length ? <Empty icon="📜" title="No activity recorded" /> : (
            <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflowY: 'auto' }}>
              {audit.logs.map(l => (
                <div key={l._id} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 10 }}>
                  <div style={{ fontSize: '.82rem' }}>
                    <strong>{l.user?.name || 'System'}</strong> <Badge variant="info">{l.actionType}</Badge>
                  </div>
                  <div style={{ fontSize: '.82rem', color: 'var(--text)' }}>{l.description}</div>
                  {l.meta?.overrideReason && (
                    <div style={{ fontSize: '.75rem', color: 'var(--danger)' }}>Override reason: {l.meta.overrideReason}</div>
                  )}
                  <div style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>{fmt(l.createdAt)}</div>
                </div>
              ))}
            </div>
          )
        )}
      </Modal>
    </div>
  );
}
