import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/video.api';
import { Card, Input, Select, Badge, Button, Pagination, Spinner, Empty, Modal, Textarea } from '../../../components/ui/index';

// Teacher — browse the videos available to their school and assign them.
const cap = (s) => (s || '').replace(/_/g, ' ');

export default function TeacherCatalog() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 0 });
  const [meta, setMeta] = useState(null);
  const [scope, setScope] = useState(null);
  const [loading, setLoading] = useState(true);
  const [f, setF] = useState({ search: '', category: '' });
  const [page, setPage] = useState(1);
  const [assign, setAssign] = useState(null); // video being assigned
  const [form, setForm] = useState({ title: '', section: '', subject: '', mandatory: false, minWatchPercent: 80, endDate: '', instructions: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 12 }; Object.entries(f).forEach(([k, v]) => { if (v) params[k] = v; });
      setData((await api.teacherCatalog(params)).data);
    } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [page, f]);

  useEffect(() => {
    api.adminMeta?.().then(r => setMeta(r.data ?? r)).catch(() => {});
    api.teacherScope().then(r => setScope(r.data ?? r)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const openAssign = (v) => { setAssign(v); setForm({ title: `Watch: ${v.title}`, section: scope?.classSectionIds?.[0] || scope?.subjectSectionIds?.[0] || '', subject: scope?.subjectIds?.[0] || '', mandatory: false, minWatchPercent: 80, endDate: '', instructions: '' }); };

  const doAssign = async () => {
    if (!form.section) return toast.error('Select a section you teach');
    setSaving(true);
    try {
      await api.teacherAssign({ contentType: 'video', video: assign._id, targetType: 'section', ...form });
      toast.success('Assigned to your students'); setAssign(null);
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="page">
      <Card title="🎥 Available Videos">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 14 }}>
          <Input placeholder="🔍 Search…" value={f.search} onChange={e => { setF(s => ({ ...s, search: e.target.value })); setPage(1); }} />
          <Select value={f.category} onChange={e => { setF(s => ({ ...s, category: e.target.value })); setPage(1); }}>
            <option value="">All categories</option>{(meta?.categories || ['concept_explanation', 'revision', 'practical']).map(c => <option key={c} value={c}>{cap(c)}</option>)}
          </Select>
        </div>
        {loading ? <div style={{ padding: 40, textAlign: 'center' }}><Spinner /></div>
          : !data.items.length ? <Empty icon="🎬" title="No videos available" message="Ask your school admin to enable videos, or add your own YouTube/Vimeo link." />
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 16 }}>
              {data.items.map(v => (
                <div key={v._id} style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                  <div style={{ aspectRatio: '16/9', background: v.thumbnailUrl ? `center/cover url(${v.thumbnailUrl})` : 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{!v.thumbnailUrl && <span style={{ fontSize: 30 }}>🎬</span>}</div>
                  <div style={{ padding: 12 }}>
                    <div style={{ fontWeight: 600, fontSize: '.9rem', minHeight: 38, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{v.title}</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '8px 0' }}>{(v.taxonomy?.subject || []).slice(0, 2).map((s, i) => <Badge key={i} variant="muted">{s}</Badge>)}</div>
                    <Button size="sm" onClick={() => openAssign(v)} style={{ width: '100%' }}>Assign to class</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
      </Card>

      <Modal open={!!assign} onClose={() => setAssign(null)} title="Assign Video" maxWidth={520}
        footer={<><Button variant="secondary" onClick={() => setAssign(null)}>Cancel</Button><Button onClick={doAssign} loading={saving}>Assign</Button></>}>
        {assign && (
          <div style={{ display: 'grid', gap: 12 }}>
            <Input label="Assignment title" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            <Select label="Section (you teach)" value={form.section} onChange={e => setForm(f => ({ ...f, section: e.target.value }))}>
              <option value="">Select section…</option>
              {[...new Set([...(scope?.classSectionIds || []), ...(scope?.subjectSectionIds || [])])].map(id => <option key={id} value={id}>{id.slice(0, 8)}…</option>)}
            </Select>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Min watch %" type="number" value={form.minWatchPercent} onChange={e => setForm(f => ({ ...f, minWatchPercent: e.target.value }))} />
              <Input label="Due date" type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={form.mandatory} onChange={e => setForm(f => ({ ...f, mandatory: e.target.checked }))} /> Mandatory completion
            </label>
            <Textarea label="Instructions" rows={2} value={form.instructions} onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))} />
          </div>
        )}
      </Modal>
    </div>
  );
}
