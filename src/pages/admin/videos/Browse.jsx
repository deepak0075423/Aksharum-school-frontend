import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/video.api';
import { Card, Input, Select, Button, Badge, Pagination, Spinner, Empty, StatCard } from '../../../components/ui/index';

// School Admin — browse the master library and enable videos for the school.
const cap = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export default function VideoBrowse() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 0 });
  const [meta, setMeta] = useState(null);
  const [ov, setOv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ search: '', category: '', board: '', grade: '' });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 12 };
      Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
      setData((await api.browseMaster(params)).data);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [page, f]);

  useEffect(() => { api.adminMeta().then(r => setMeta(r.data ?? r)).catch(() => {}); api.schoolOverview().then(r => setOv(r.data ?? r)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const toggle = async (v) => {
    try { await api.enableVideo(v._id, { enabled: !v.enabled }); toast.success(!v.enabled ? 'Enabled for your school' : 'Disabled'); load(); }
    catch (e) { toast.error(e.message); }
  };
  const set = (k, val) => { setF(s => ({ ...s, [k]: val })); setPage(1); };

  return (
    <div className="page">
      {ov && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 16 }}>
          <StatCard icon="📺" label="Enabled Videos" value={ov.counts?.enabledCount} color="blue" />
          <StatCard icon="📌" label="Assignments" value={ov.counts?.assignmentCount} color="purple" />
          <StatCard icon="⏳" label="Pending Approvals" value={ov.counts?.pendingApprovals} color="amber" />
          <StatCard icon="✅" label="Completions" value={ov.completion?.completed || 0} color="green" />
        </div>
      )}
      <Card title="📚 Master Library — enable videos for your school">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
          <Input placeholder="🔍 Search…" value={f.search} onChange={e => set('search', e.target.value)} />
          <Select value={f.category} onChange={e => set('category', e.target.value)}><option value="">All categories</option>{(meta?.categories || []).map(c => <option key={c} value={c}>{cap(c)}</option>)}</Select>
          <Select value={f.board} onChange={e => set('board', e.target.value)}><option value="">All boards</option>{(meta?.boards || []).map(b => <option key={b} value={b}>{b}</option>)}</Select>
          <Select value={f.grade} onChange={e => set('grade', e.target.value)}><option value="">All classes</option>{(meta?.grades || []).map(g => <option key={g} value={g}>{g}</option>)}</Select>
        </div>

        {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          : !data.items.length ? <Empty icon="🎬" title="No videos found" />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 16 }}>
              {data.items.map(v => (
                <div key={v._id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ aspectRatio: '16/9', background: v.thumbnailUrl ? `center/cover url(${v.thumbnailUrl})` : 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{!v.thumbnailUrl && <span style={{ fontSize: 30 }}>🎬</span>}</div>
                  <div style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: '.9rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 38 }}>{v.title}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '8px 0' }}>
                      {(v.taxonomy?.board || []).slice(0, 2).map((b, i) => <Badge key={i} variant="info">{b}</Badge>)}
                      {(v.taxonomy?.grade || []).slice(0, 1).map((g, i) => <Badge key={i} variant="primary">{g}</Badge>)}
                    </div>
                    <Button size="sm" variant={v.enabled ? 'secondary' : 'primary'} onClick={() => toggle(v)} style={{ width: '100%' }}>
                      {v.enabled ? '✓ Enabled — click to disable' : 'Enable for school'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
      </Card>
    </div>
  );
}
