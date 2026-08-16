import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Button, Modal, Spinner, Empty, Confirm } from '../../components/ui/index';

export default function Sections() {
  const { id }              = useParams();
  const { data, loading, refetch } = useFetch(() => api.getClassDetail(id), [id]);
  const [modal, setModal]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState({ name: '', capacity: 40 });
  const [formErr, setFormErr] = useState('');

  // Section shuffle — one redistribution per class per academic year, then locked
  const [shuffleConfirm, setShuffleConfirm] = useState(false);
  const [shuffling, setShuffling]           = useState(false);
  const [lockConfirm, setLockConfirm]       = useState(false);
  const [locking, setLocking]               = useState(false);

  const handleShuffle = async () => {
    setShuffling(true);
    try {
      const res = await api.shuffleSections(id);
      const spread = (res?.data?.sections || []).map(s => `${s.sectionName}: ${s.count}`).join(' · ');
      toast.success(`${res?.data?.students ?? 0} students shuffled — ${spread}`);
      setShuffleConfirm(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setShuffling(false); }
  };

  const handleLock = async () => {
    setLocking(true);
    try {
      await api.lockSectionShuffle(id);
      toast.success('Sections locked for this academic year');
      setLockConfirm(false);
      refetch();
    } catch (err) { toast.error(err.message); }
    finally { setLocking(false); }
  };

  const openCreate = () => { setForm({ name: '', capacity: 40 }); setFormErr(''); setModal(true); };
  const closeModal = () => { setModal(false); setFormErr(''); };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormErr('');
    if (!form.name.trim()) { setFormErr('Section name is required'); return; }
    if (!form.capacity || Number(form.capacity) < 1) { setFormErr('Capacity must be a positive number'); return; }

    // Catch the duplicate locally too, so the message shows the moment the
    // name is typed rather than only after a round trip.
    const exists = (data?.sections || []).some(
      s => s.sectionName?.trim().toUpperCase() === form.name.trim().toUpperCase()
    );
    if (exists) { setFormErr(`Section "${form.name.trim().toUpperCase()}" already exists in this class.`); return; }

    setSaving(true);
    try { await api.createSection(id, form); toast.success('Section created'); closeModal(); refetch(); }
    catch (err) { setFormErr(err.message); toast.error(err.message); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const cls       = data?.class;
  const sections  = data?.sections || [];
  const shuffle   = cls?.sectionShuffle || {};
  const isLocked  = !!shuffle.lockedAt;
  const canShuffle = sections.length >= 2 && !isLocked;

  return (
    <div className="page">
      <div className="breadcrumb">
        <Link to="/admin/classes">Classes</Link>
        <span>›</span>
        <span>{cls?.className}</span>
      </div>

      <PageHeader title={`${cls?.className || 'Class'} — Sections`}
        subtitle={`${sections.length} section${sections.length !== 1 ? 's' : ''}`}
        action={
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canShuffle && (
              <Button variant="secondary" onClick={() => setShuffleConfirm(true)}>🔀 Shuffle Sections</Button>
            )}
            {!isLocked && shuffle.shuffledAt && (
              <Button variant="secondary" onClick={() => setLockConfirm(true)}>🔒 Lock Sections</Button>
            )}
            <Button onClick={openCreate}>+ Add Section</Button>
          </div>
        } />

      {(isLocked || shuffle.shuffledAt) && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--radius)', fontSize: '.83rem',
          background: isLocked ? '#f0fdf4' : 'var(--bg)',
          border: `1px solid ${isLocked ? 'var(--success)' : 'var(--border)'}`,
          color: isLocked ? '#065f46' : 'var(--text-muted)',
        }}>
          {isLocked
            ? `🔒 Sections locked on ${new Date(shuffle.lockedAt).toLocaleDateString()} — this class cannot be reshuffled for this academic year. Individual students can still be moved from a section page.`
            : `🔀 Last shuffled ${new Date(shuffle.shuffledAt).toLocaleString()}. Reshuffle as often as you need, then lock to freeze it for the year.`}
        </div>
      )}

      {!sections.length
        ? <Empty icon="🏛️" title="No sections yet" action={<Button onClick={openCreate}>Create Section</Button>} />
        : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 16 }}>
            {sections.map(sec => (
              <div key={sec._id} className="card">
                <div className="card-body" style={{ textAlign: 'center', padding: '20px 16px' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 8 }}>📋</div>
                  <h3 style={{ marginBottom: 4 }}>Section {sec.sectionName}</h3>
                  <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 4 }}>
                    Capacity: {sec.maxStudents ?? sec.capacity ?? 40}
                  </p>
                  <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                    Students: {sec.currentCount ?? 0}
                  </p>
                  <Link to={`/admin/sections/${sec._id}`} className="btn btn-primary btn-sm">Manage</Link>
                </div>
              </div>
            ))}
          </div>
        )
      }

      <Confirm open={shuffleConfirm} onClose={() => setShuffleConfirm(false)} onConfirm={handleShuffle}
        loading={shuffling} title="Shuffle Sections"
        message={`Every student of ${cls?.className || 'this class'} — including any admitted but not placed yet — will be redistributed at random across its ${sections.length} sections, within each section's capacity. Existing roll numbers are cleared so you can reassign them afterwards. This can be repeated until you lock the sections.`} />

      <Confirm open={lockConfirm} onClose={() => setLockConfirm(false)} onConfirm={handleLock}
        loading={locking} title="Lock Sections"
        message={`Lock the section allocation for ${cls?.className || 'this class'} for this academic year. Shuffling will no longer be possible — you can still move individual students by hand. This cannot be undone.`} />

      <Modal open={modal} onClose={closeModal} title="Add Section"
        footer={<>
          <Button variant="secondary" onClick={closeModal}>Cancel</Button>
          <Button form="section-form" type="submit" loading={saving}>Create</Button>
        </>}>
        <form id="section-form" onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label required">Section Name</label>
            <input className={`form-control${formErr ? ' error' : ''}`} required value={form.name}
              onChange={e => { setFormErr(''); setForm(f => ({ ...f, name: e.target.value })); }} placeholder="A" />
            {formErr && (
              <div style={{ color: 'var(--danger)', fontSize: '.8rem', marginTop: 6 }}>{formErr}</div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Capacity</label>
            <input type="number" className="form-control" value={form.capacity}
              onChange={e => setForm(f => ({ ...f, capacity: +e.target.value }))} />
          </div>
        </form>
      </Modal>
    </div>
  );
}
