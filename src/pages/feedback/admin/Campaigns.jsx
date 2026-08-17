import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/feedback.api';
import {
  PageHeader, Table, Button, Modal, Badge, Pagination, Spinner,
  Input, Select, Textarea, Confirm,
} from '../../../components/ui/index';
import { Score, CampaignBadge, fmtDate } from '../shared/kit';

const STATUSES = ['draft', 'scheduled', 'active', 'closed', 'archived'];
const todayIso = () => new Date().toISOString().slice(0, 10);
const isoPlus = (days) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

// Campaign management (spec §4). Create / edit / duplicate / activate / close /
// archive / delete-draft, plus the response-rate summary per campaign.
export default function Campaigns() {
  const [rows, setRows]     = useState([]);
  const [pg, setPg]         = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad]  = useState(true);
  const [status, setStatus] = useState('');
  const [meta, setMeta]     = useState(null);
  const [form, setForm]     = useState(null);
  const [busy, setBusy]     = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const res = await api.getCampaigns({ page, limit: 20, status, includeArchived: status === 'archived' });
      const d = res.data ?? res;
      setRows(d.data || []);
      setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [status]);

  useEffect(() => { load(1); }, [load]);
  useEffect(() => { api.getMeta().then((r) => setMeta(r.data ?? r)).catch(() => {}); }, []);

  const act = async (row, action) => {
    setBusy(row._id);
    try {
      if (action === 'activate') {
        const res = await api.activateCampaign(row._id);
        const d = res.data ?? res;
        toast.success(`Campaign ${d.status === 'scheduled' ? 'scheduled' : 'activated'} — ${d.created} assignment(s) created`);
      } else if (action === 'close')     { await api.closeCampaign(row._id);   toast.success('Campaign closed'); }
      else if (action === 'archive')     { await api.archiveCampaign(row._id); toast.success('Campaign archived'); }
      else if (action === 'delete')      { await api.deleteCampaign(row._id);  toast.success('Draft campaign deleted'); }
      else if (action === 'duplicate')   { await api.duplicateCampaign(row._id, {}); toast.success('Campaign duplicated'); }
      else if (action === 'reminders')   {
        const res = await api.sendReminders(row._id);
        toast.success(`Reminder sent to ${(res.data ?? res).reminded} student(s)`);
      }
      load(pg.page);
    } catch (err) { toast.error(err.message); } finally { setBusy(''); setConfirmAction(null); }
  };

  const columns = [
    {
      key: 'name', label: 'Campaign',
      render: (r) => (
        <div>
          <Link to={`/admin/feedback/campaigns/${r._id}`} style={{ fontWeight: 600 }}>{r.name}</Link>
          <div className="text-xs text-muted">
            {[r.term, r.academicYear?.yearName, `${r.questionCount} questions`].filter(Boolean).join(' · ')}
          </div>
        </div>
      ),
    },
    { key: 'status', label: 'Status', render: (r) => <CampaignBadge status={r.status} /> },
    { key: 'window', label: 'Window', render: (r) => <span className="text-sm">{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</span> },
    { key: 'responses', label: 'Responses', render: (r) => `${r.submitted} / ${r.assigned}` },
    {
      key: 'rate', label: 'Response %',
      render: (r) => (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ background: '#eef2f7', borderRadius: 99, height: 6, width: 52, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${r.responseRate}%`, height: '100%', background: 'var(--primary)' }} />
          </span>
          {r.responseRate}%
        </span>
      ),
    },
    { key: 'avg', label: 'Avg Rating', render: (r) => <Score value={r.avgRating} size="sm" showLabel={false} /> },
    { key: 'anon', label: 'Privacy', render: (r) => <Badge variant={r.isAnonymous ? 'info' : 'muted'}>{r.isAnonymous ? 'Anonymous' : 'Named'}</Badge> },
    {
      key: 'actions', label: '',
      render: (r) => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {r.status === 'draft' && <>
            <Button size="sm" onClick={() => setConfirmAction({ row: r, action: 'activate' })} loading={busy === r._id}>Activate</Button>
            <Button size="sm" variant="secondary" onClick={() => setForm(toForm(r))}>Edit</Button>
          </>}
          {['scheduled', 'active'].includes(r.status) && <>
            <Button size="sm" variant="secondary" onClick={() => setForm(toForm(r))}>Edit</Button>
            {r.status === 'active' && <Button size="sm" variant="secondary" onClick={() => act(r, 'reminders')} loading={busy === r._id}>Remind</Button>}
            <Button size="sm" variant="warning" onClick={() => setConfirmAction({ row: r, action: 'close' })}>Close</Button>
          </>}
          {r.status === 'closed' && <Button size="sm" variant="secondary" onClick={() => setConfirmAction({ row: r, action: 'archive' })}>Archive</Button>}
          <Button size="sm" variant="secondary" onClick={() => act(r, 'duplicate')} loading={busy === r._id}>Duplicate</Button>
          {r.status === 'draft' && <Button size="sm" variant="danger" onClick={() => setConfirmAction({ row: r, action: 'delete' })}>Delete</Button>}
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        title="Feedback Campaigns"
        subtitle="Create and run teacher evaluation drives"
        action={<Button onClick={() => setForm(blankForm(meta))}>+ New Campaign</Button>}
      />

      <div className="filters-bar" style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 190 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All (except archived)</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📋" emptyTitle="No campaigns yet" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      {form && (
        <CampaignForm
          form={form} setForm={setForm} meta={meta}
          onSaved={() => { setForm(null); load(pg.page); }}
        />
      )}

      <Confirm
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={() => act(confirmAction.row, confirmAction.action)}
        title={{
          activate: 'Activate campaign?', close: 'Close campaign?',
          archive: 'Archive campaign?', delete: 'Delete draft campaign?',
        }[confirmAction?.action]}
        message={{
          activate: 'Feedback assignments will be generated for every matching student and they will be notified. Targeting can no longer be changed after this.',
          close: 'Students will no longer be able to submit. Nothing is deleted — all collected feedback stays available.',
          archive: 'The campaign is hidden from the default lists but all data is kept.',
          delete: 'This draft and its generated assignments will be permanently removed.',
        }[confirmAction?.action]}
      />
    </div>
  );
}

// ── Create / edit form ───────────────────────────────────────────────────────
const blankForm = (meta) => ({
  _id: null,
  name: '', academicYear: meta?.activeYear?._id || '', term: '',
  feedbackType: 'student_teacher', description: '', instructions: '',
  startDate: todayIso(), endDate: isoPlus(14),
  isAnonymous: true, minimumResponses: 5,
  targetClasses: [], targetSections: [], targetSubjects: [], targetTeachers: [],
  template: meta?.templates?.find((t) => t.isDefault)?._id || meta?.templates?.[0]?._id || '',
  reminderEnabled: true, reminderIntervalDays: 3, allowResubmission: false,
});

const toForm = (r) => ({
  _id: r._id,
  name: r.name || '',
  academicYear: r.academicYear?._id || r.academicYear || '',
  term: r.term || '',
  feedbackType: r.feedbackType || 'student_teacher',
  description: r.description || '', instructions: r.instructions || '',
  startDate: r.startDate ? new Date(r.startDate).toISOString().slice(0, 10) : todayIso(),
  endDate: r.endDate ? new Date(r.endDate).toISOString().slice(0, 10) : isoPlus(14),
  isAnonymous: !!r.isAnonymous,
  minimumResponses: r.minimumResponses ?? 5,
  targetClasses: (r.targetClasses || []).map(String),
  targetSections: (r.targetSections || []).map(String),
  targetSubjects: (r.targetSubjects || []).map(String),
  targetTeachers: (r.targetTeachers || []).map(String),
  template: '',
  reminderEnabled: r.reminderEnabled !== false,
  reminderIntervalDays: r.reminderIntervalDays ?? 3,
  allowResubmission: !!r.allowResubmission,
  status: r.status,
});

function CampaignForm({ form, setForm, meta, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const live = ['active', 'scheduled'].includes(form.status);

  const toggleIn = (key, id) => setForm((f) => ({
    ...f,
    [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
  }));

  const save = async () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Campaign name is required';
    if (!form.startDate) e.startDate = 'Required';
    if (!form.endDate) e.endDate = 'Required';
    if (form.startDate && form.endDate && form.endDate < form.startDate) e.endDate = 'End date cannot be before the start date';
    if (!form._id && !form.template) e.template = 'Pick a question template';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    try {
      if (form._id) { await api.updateCampaign(form._id, form); toast.success('Campaign updated'); }
      else          { await api.createCampaign(form);           toast.success('Campaign created as a draft'); }
      onSaved();
    } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };

  // Sections narrow to the chosen classes so the picker cannot offer a section
  // outside the campaign's own scope.
  const sections = (meta?.sections || []).filter(
    (s) => !form.targetClasses.length || form.targetClasses.includes(String(s.class)),
  );

  return (
    <Modal
      open
      onClose={() => setForm(null)}
      title={form._id ? 'Edit Campaign' : 'New Feedback Campaign'}
      maxWidth={760}
      footer={<>
        <Button variant="secondary" onClick={() => setForm(null)}>Cancel</Button>
        <Button onClick={save} loading={saving}>{form._id ? 'Save changes' : 'Create draft'}</Button>
      </>}
    >
      {live && (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          This campaign is already live — only the name, description, deadline, privacy threshold and reminders can be changed.
          Targeting is locked so responses already collected stay valid.
        </div>
      )}

      <div className="form-row form-row-2">
        <Input label="Campaign Name" required value={form.name} error={errors.name}
          onChange={(e) => set('name', e.target.value)} placeholder="e.g. Term 1 Teacher Feedback 2026" />
        <Input label="Term" value={form.term} onChange={(e) => set('term', e.target.value)} placeholder="e.g. Term 1" />
      </div>

      <div className="form-row form-row-2">
        <Select label="Academic Year" value={form.academicYear} disabled={live}
          onChange={(e) => set('academicYear', e.target.value)}>
          <option value="">Active year</option>
          {(meta?.academicYears || []).map((y) => <option key={y._id} value={y._id}>{y.yearName}</option>)}
        </Select>
        <Select label="Feedback Type" value={form.feedbackType} disabled={live}
          onChange={(e) => set('feedbackType', e.target.value)}>
          <option value="student_teacher">Student → Teacher</option>
          <option value="parent_teacher" disabled>Parent → Teacher (coming soon)</option>
        </Select>
      </div>

      <div className="form-row form-row-2">
        <Input label="Start Date" type="date" required value={form.startDate} error={errors.startDate}
          disabled={live} onChange={(e) => set('startDate', e.target.value)} />
        <Input label="End Date" type="date" required value={form.endDate} error={errors.endDate}
          onChange={(e) => set('endDate', e.target.value)} />
      </div>

      <Textarea label="Description" value={form.description} rows={2}
        onChange={(e) => set('description', e.target.value)} />
      <Textarea label="Instructions shown to students" value={form.instructions} rows={2}
        onChange={(e) => set('instructions', e.target.value)}
        placeholder="Your feedback is confidential and helps your teachers improve…" />

      {!form._id && (
        <Select label="Question Template" required value={form.template} error={errors.template}
          onChange={(e) => set('template', e.target.value)}>
          <option value="">Select a template…</option>
          {(meta?.templates || []).map((t) => (
            <option key={t._id} value={t._id}>{t.name} ({t.questionCount} questions)</option>
          ))}
        </Select>
      )}

      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="form-label">Anonymous Feedback</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem' }}>
            <input type="checkbox" checked={form.isAnonymous} disabled={live}
              onChange={(e) => set('isAnonymous', e.target.checked)} />
            Hide student identity from teachers
          </label>
          <div className="form-hint">Submissions are always recorded internally for audit and duplicate prevention.</div>
        </div>
        <Input label="Minimum Responses" type="number" min={1} value={form.minimumResponses}
          onChange={(e) => set('minimumResponses', e.target.value)}
          hint="Teacher analytics stay hidden until this many students respond." />
      </div>

      {!live && (
        <>
          <TargetPicker label="Target Classes" items={meta?.classes || []} idKey="_id"
            labelOf={(c) => c.className} selected={form.targetClasses} onToggle={(id) => toggleIn('targetClasses', id)} />
          <TargetPicker label="Target Sections" items={sections} idKey="_id"
            labelOf={(s) => `${(meta?.classes || []).find((c) => c._id === s.class)?.className || ''} ${s.sectionName}`.trim()}
            selected={form.targetSections} onToggle={(id) => toggleIn('targetSections', id)} />
          <TargetPicker label="Target Subjects" items={meta?.subjects || []} idKey="_id"
            labelOf={(s) => s.subjectName} selected={form.targetSubjects} onToggle={(id) => toggleIn('targetSubjects', id)} />
          <TargetPicker label="Target Teachers" items={meta?.teachers || []} idKey="_id"
            labelOf={(t) => t.name} selected={form.targetTeachers} onToggle={(id) => toggleIn('targetTeachers', id)} />
          <p className="text-xs text-muted" style={{ marginTop: -6, marginBottom: 12 }}>
            Leave a list empty to include everything. Students are matched to teachers automatically
            from the section–subject–teacher allocations — nobody is assigned by hand.
          </p>
        </>
      )}

      <div className="form-row form-row-2">
        <div className="form-group">
          <label className="form-label">Reminders</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem' }}>
            <input type="checkbox" checked={form.reminderEnabled} onChange={(e) => set('reminderEnabled', e.target.checked)} />
            Remind students who have not responded
          </label>
        </div>
        <Input label="Reminder every (days)" type="number" min={1} value={form.reminderIntervalDays}
          disabled={!form.reminderEnabled} onChange={(e) => set('reminderIntervalDays', e.target.value)} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem' }}>
        <input type="checkbox" checked={form.allowResubmission} onChange={(e) => set('allowResubmission', e.target.checked)} />
        Allow an admin to reopen a submitted feedback for correction
      </label>
    </Modal>
  );
}

function TargetPicker({ label, items, idKey, labelOf, selected, onToggle }) {
  return (
    <div className="form-group">
      <label className="form-label">{label} <span className="text-muted text-xs">({selected.length ? `${selected.length} selected` : 'all'})</span></label>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 108, overflowY: 'auto',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 8,
      }}>
        {!items.length && <span className="text-xs text-muted">Nothing configured</span>}
        {items.map((it) => {
          const id = String(it[idKey]);
          const active = selected.includes(id);
          return (
            <button key={id} type="button" onClick={() => onToggle(id)}
              style={{
                cursor: 'pointer', fontSize: '.76rem', padding: '4px 10px', borderRadius: 999,
                border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                background: active ? 'rgba(79,70,229,.08)' : '#fff',
                color: active ? 'var(--primary)' : 'var(--text)',
              }}>
              {active ? '✓ ' : ''}{labelOf(it)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
