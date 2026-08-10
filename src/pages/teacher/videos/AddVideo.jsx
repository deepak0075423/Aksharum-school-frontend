import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/video.api';
import { Card, Input, Select, Textarea, Button, Table, Badge } from '../../../components/ui/index';

// Teacher — submit a YouTube/Vimeo link (enters the approval workflow).
const BLANK = { title: '', sourceUrl: '', category: 'concept_explanation', difficulty: 'beginner', shortDescription: '' };

export default function TeacherAddVideo() {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState([]);
  const [meta, setMeta] = useState(null);

  const load = useCallback(() => { api.teacherMyVideos().then(r => setMine(r.data ?? r)).catch(() => {}); }, []);
  useEffect(() => { load(); api.adminMeta?.().then(r => setMeta(r.data ?? r)).catch(() => {}); }, [load]);

  const submit = async () => {
    if (!form.title.trim() || !form.sourceUrl.trim()) return toast.error('Title and URL are required');
    setSaving(true);
    try {
      const res = (await api.teacherAddVideo(form)).data;
      toast.success(res?.requiresApproval ? 'Submitted for admin approval' : 'Published');
      setForm(BLANK); load();
    } catch (e) { toast.error(e.message); } finally { setSaving(false); }
  };

  const columns = [
    { key: 'title', label: 'Video', render: r => <div><div style={{ fontWeight: 600 }}>{r.title}</div><span className="text-sm text-muted">{r.source}</span></div> },
    { key: 'approvalStatus', label: 'Approval', render: r => <Badge variant={r.approvalStatus === 'approved' ? 'success' : r.approvalStatus === 'pending' ? 'warning' : 'danger'}>{r.approvalStatus}</Badge> },
    { key: 'status', label: 'Status', render: r => <Badge variant={r.status === 'published' ? 'success' : 'muted'}>{r.status}</Badge> },
    { key: 'createdAt', label: 'Added', render: r => new Date(r.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="page" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(320px,420px) 1fr', alignItems: 'start' }}>
      <Card title="➕ Add YouTube / Vimeo Video">
        <div style={{ display: 'grid', gap: 12 }}>
          <Input label="Title" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Input label="YouTube / Vimeo URL" required value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://youtu.be/… or https://vimeo.com/…" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {(meta?.categories || ['concept_explanation', 'revision', 'practical', 'homework']).map(c => <option key={c} value={c}>{(c || '').replace(/_/g, ' ')}</option>)}
            </Select>
            <Select label="Difficulty" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
              {['beginner', 'intermediate', 'advanced'].map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>
          <Textarea label="Short description" rows={2} value={form.shortDescription} onChange={e => setForm(f => ({ ...f, shortDescription: e.target.value }))} />
          <Button onClick={submit} loading={saving}>Submit for approval</Button>
          <div className="text-muted text-sm">🔒 Teachers can only add embedded links. S3 uploads are reserved for the platform team. Submitted videos go to your school admin for approval before students can watch them.</div>
        </div>
      </Card>

      <Card title="📼 My Submitted Videos">
        <Table columns={columns} data={mine} emptyIcon="📼" emptyTitle="You haven't added any videos yet" />
      </Card>
    </div>
  );
}
