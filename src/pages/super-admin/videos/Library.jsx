import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/video.api';
import {
  PageHeader, StatCard, Card, Button, Input, Select, Textarea,
  Table, Badge, Modal, Confirm, Pagination, Spinner, Empty,
} from '../../../components/ui/index';

// ─────────────────────────────────────────────────────────────────────────────
//  Super Admin — Master Video Library manager. List + rich filters + create/
//  edit + lifecycle actions (publish / schedule / duplicate / archive / feature).
//  This is the control room for the globally-shared, never-duplicated library.
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_VARIANT = { draft: 'muted', scheduled: 'warning', published: 'success', archived: 'danger' };
const SOURCE_ICON = { s3: '🟠 S3', youtube: '▶️ YouTube', vimeo: '🔷 Vimeo' };
const fmtDur = (s) => { if (!s) return '—'; const m = Math.floor(s / 60), sec = s % 60; return `${m}:${String(sec).padStart(2, '0')}`; };
const cap = (s) => (s || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const BLANK = {
  title: '', source: 'youtube', sourceUrl: '', s3Key: '', shortDescription: '', longDescription: '',
  category: 'concept_explanation', difficulty: 'beginner', language: 'English', medium: 'English',
  durationSec: 0, estimatedStudyTimeMin: 0, learningOutcome: '', tags: '', keywords: '',
  downloadAllowed: false, taxonomy: { board: '', grade: '', subject: '', chapter: '', topic: '' },
};

export default function VideoLibrary() {
  const [meta, setMeta]       = useState(null);
  const [overview, setOverview] = useState(null);
  const [data, setData]       = useState({ items: [], total: 0, page: 1, pages: 0 });
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: '', source: '', category: '', board: '', grade: '', subject: '', search: '' });
  const [page, setPage]       = useState(1);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState(null);
  const [form, setForm]         = useState(BLANK);
  const [saving, setSaving]     = useState(false);
  const [confirm, setConfirm]   = useState(null); // { id, action }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 12 };
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v; });
      const res = await api.listVideos(params);
      setData(res.data ?? res);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  }, [page, filters]);

  useEffect(() => { api.adminMeta().then(r => setMeta(r.data ?? r)).catch(() => {}); api.adminOverview().then(r => setOverview(r.data ?? r)).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const setF = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(1); };

  const openCreate = () => { setEditing(null); setForm(BLANK); setShowForm(true); };
  const openEdit = async (v) => {
    try {
      const full = (await api.getVideo(v._id)).data ?? await api.getVideo(v._id);
      const d = full.data ?? full;
      setEditing(d._id);
      setForm({
        ...BLANK, ...d,
        tags: (d.tags || []).join(', '), keywords: (d.keywords || []).join(', '),
        taxonomy: {
          board: (d.taxonomy?.board || []).map(x => x.value ?? x).join(', '),
          grade: (d.taxonomy?.grade || []).map(x => x.value ?? x).join(', '),
          subject: (d.taxonomy?.subject || []).map(x => x.value ?? x).join(', '),
          chapter: (d.taxonomy?.chapter || []).map(x => x.value ?? x).join(', '),
          topic: (d.taxonomy?.topic || []).map(x => x.value ?? x).join(', '),
        },
      });
      setShowForm(true);
    } catch (e) { toast.error(e.message); }
  };

  const submit = async () => {
    if (!form.title.trim()) return toast.error('Title is required');
    if (form.source !== 's3' && !form.sourceUrl.trim()) return toast.error('Provide the video URL');
    setSaving(true);
    try {
      const toArr = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
      const payload = {
        ...form,
        tags: toArr(form.tags), keywords: toArr(form.keywords),
        taxonomy: Object.fromEntries(Object.entries(form.taxonomy).map(([k, v]) => [k, toArr(v)])),
      };
      if (editing) { await api.updateVideo(editing, payload); toast.success('Video updated'); }
      else { await api.createVideo(payload); toast.success('Video created (draft)'); }
      setShowForm(false); load(); api.adminOverview().then(r => setOverview(r.data ?? r)).catch(() => {});
    } catch (e) { toast.error(e.message); }
    finally { setSaving(false); }
  };

  const act = async (id, action) => {
    try {
      if (action === 'publish')   await api.publishVideo(id);
      if (action === 'duplicate') await api.duplicateVideo(id);
      if (action === 'archive')   await api.archiveVideo(id, {});
      if (action === 'delete')    await api.deleteVideo(id);
      if (action === 'feature')   await api.featureVideo(id, { featured: true });
      toast.success(`Video ${action}d`);
      setConfirm(null); load();
    } catch (e) { toast.error(e.message); }
  };

  const columns = [
    { key: 'title', label: 'Video', render: (r) => (
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ width: 56, height: 34, borderRadius: 6, background: r.thumbnailUrl ? `center/cover url(${r.thumbnailUrl})` : 'var(--bg-muted, #eef2ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', flexShrink: 0 }}>
          {!r.thumbnailUrl && '🎬'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 }}>{r.title}{r.featured && ' ⭐'}</div>
          <div className="text-muted text-sm">{SOURCE_ICON[r.source]} · {fmtDur(r.durationSec)} · v{r.version}</div>
        </div>
      </div>
    ) },
    { key: 'category', label: 'Category', render: (r) => <span className="text-sm">{cap(r.category)}</span> },
    { key: 'taxonomy', label: 'Mapping', render: (r) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: 200 }}>
        {(r.taxonomy?.board || []).slice(0, 2).map((b, i) => <Badge key={`b${i}`} variant="info">{b}</Badge>)}
        {(r.taxonomy?.grade || []).slice(0, 2).map((g, i) => <Badge key={`g${i}`} variant="primary">{g}</Badge>)}
        {(r.taxonomy?.subject || []).slice(0, 1).map((s, i) => <Badge key={`s${i}`} variant="muted">{s}</Badge>)}
      </div>
    ) },
    { key: 'views', label: 'Views', render: (r) => <span className="text-sm">👁 {r.viewsCount || 0} · 👍 {r.likesCount || 0}</span> },
    { key: 'status', label: 'Status', render: (r) => <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge> },
    { key: 'actions', label: '', render: (r) => (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>Edit</Button>
        {r.status !== 'published' && <Button size="sm" variant="primary" onClick={() => act(r._id, 'publish')}>Publish</Button>}
        <Button size="sm" variant="ghost" onClick={() => act(r._id, 'duplicate')}>Duplicate</Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm({ id: r._id, action: 'delete' })}>🗑</Button>
      </div>
    ) },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Master Video Library"
        subtitle="Global, reusable video catalogue — one source of truth, mapped to boards, classes & subjects"
        action={<Button onClick={openCreate}>+ Add Video</Button>}
      />

      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14, marginBottom: 18 }}>
          <StatCard icon="🎬" label="Total Videos" value={overview.counts?.total} color="blue" />
          <StatCard icon="✅" label="Published" value={overview.counts?.published} color="green" />
          <StatCard icon="📝" label="Drafts" value={overview.counts?.draft} color="amber" />
          <StatCard icon="⏰" label="Scheduled" value={overview.counts?.scheduled} color="purple" />
        </div>
      )}

      <Card>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
          <Input placeholder="🔍 Search title…" value={filters.search} onChange={e => setF('search', e.target.value)} />
          <Select value={filters.status} onChange={e => setF('status', e.target.value)}>
            <option value="">All statuses</option>{['draft', 'scheduled', 'published', 'archived'].map(s => <option key={s} value={s}>{cap(s)}</option>)}
          </Select>
          <Select value={filters.source} onChange={e => setF('source', e.target.value)}>
            <option value="">All sources</option>{['s3', 'youtube', 'vimeo'].map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Select value={filters.category} onChange={e => setF('category', e.target.value)}>
            <option value="">All categories</option>{(meta?.categories || []).map(c => <option key={c} value={c}>{cap(c)}</option>)}
          </Select>
          <Select value={filters.board} onChange={e => setF('board', e.target.value)}>
            <option value="">All boards</option>{(meta?.boards || []).map(b => <option key={b} value={b}>{b}</option>)}
          </Select>
          <Select value={filters.grade} onChange={e => setF('grade', e.target.value)}>
            <option value="">All classes</option>{(meta?.grades || []).map(g => <option key={g} value={g}>{g}</option>)}
          </Select>
        </div>

        <Table columns={columns} data={data.items} loading={loading} emptyIcon="🎬" emptyTitle="No videos yet — add your first" />
        <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
      </Card>

      {/* Create / Edit modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} maxWidth={720}
        title={editing ? 'Edit Video' : 'Add Video to Master Library'}
        footer={<>
          <Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{editing ? 'Save Changes' : 'Create Draft'}</Button>
        </>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <Input label="Title" required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Photosynthesis — Light Reactions" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Select label="Source" value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}>
              <option value="youtube">YouTube</option><option value="vimeo">Vimeo</option><option value="s3">Amazon S3</option>
            </Select>
            <Select label="Category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {(meta?.categories || []).map(c => <option key={c} value={c}>{cap(c)}</option>)}
            </Select>
          </div>
          {form.source === 's3'
            ? <Input label="S3 Object Key" value={form.s3Key} onChange={e => setForm(f => ({ ...f, s3Key: e.target.value }))} hint="Upload media after creating the draft, or paste an existing key" />
            : <Input label={`${cap(form.source)} URL`} required value={form.sourceUrl} onChange={e => setForm(f => ({ ...f, sourceUrl: e.target.value }))} placeholder="https://youtu.be/…" />}
          <Textarea label="Short Description" rows={2} value={form.shortDescription} onChange={e => setForm(f => ({ ...f, shortDescription: e.target.value }))} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Select label="Difficulty" value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
              {['beginner', 'intermediate', 'advanced'].map(d => <option key={d} value={d}>{cap(d)}</option>)}
            </Select>
            <Input label="Duration (sec)" type="number" value={form.durationSec} onChange={e => setForm(f => ({ ...f, durationSec: e.target.value }))} />
            <Select label="Language" value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))}>
              {(meta?.languages || ['English', 'Hindi']).map(l => <option key={l} value={l}>{l}</option>)}
            </Select>
          </div>

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>🔗 Mappings (comma-separated — one video, many mappings)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Input label="Boards" value={form.taxonomy.board} onChange={e => setForm(f => ({ ...f, taxonomy: { ...f.taxonomy, board: e.target.value } }))} placeholder="CBSE, ICSE" />
              <Input label="Classes" value={form.taxonomy.grade} onChange={e => setForm(f => ({ ...f, taxonomy: { ...f.taxonomy, grade: e.target.value } }))} placeholder="Class 9, Class 10" />
              <Input label="Subjects" value={form.taxonomy.subject} onChange={e => setForm(f => ({ ...f, taxonomy: { ...f.taxonomy, subject: e.target.value } }))} placeholder="Science, Biology" />
              <Input label="Chapters" value={form.taxonomy.chapter} onChange={e => setForm(f => ({ ...f, taxonomy: { ...f.taxonomy, chapter: e.target.value } }))} placeholder="Life Processes" />
              <Input label="Topics" value={form.taxonomy.topic} onChange={e => setForm(f => ({ ...f, taxonomy: { ...f.taxonomy, topic: e.target.value } }))} placeholder="Photosynthesis" />
              <Input label="Tags" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} placeholder="ncert, board-exam" />
            </div>
          </div>
        </div>
      </Modal>

      <Confirm open={!!confirm} onClose={() => setConfirm(null)} onConfirm={() => act(confirm.id, confirm.action)}
        title="Delete video?" message="This soft-deletes the video (analytics & assignments are preserved). It can be restored by support." />
    </div>
  );
}
