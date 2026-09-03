import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Button, Modal, Spinner, Empty, Confirm, Alert } from '../../components/ui/index';
import SectionCapacityModal from '../../components/SectionCapacityModal';

export default function Sections() {
  const { id }              = useParams();
  const { data, loading, refetch } = useFetch(() => api.getClassDetail(id), [id]);
  const [modal, setModal]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm]     = useState({ name: '', capacity: 40 });
  // The section whose seat count is being edited, or null.
  const [capSection, setCapSection] = useState(null);
  const [formErr, setFormErr] = useState('');

  // Section shuffle — one redistribution per class per academic year, then locked
  const [shuffleConfirm, setShuffleConfirm] = useState(false);
  const [shuffling, setShuffling]           = useState(false);
  const [lockConfirm, setLockConfirm]       = useState(false);
  const [locking, setLocking]               = useState(false);

  // Opening the dialog asks the server to count the students and the seats
  // first. If they do not fit, there is no Shuffle button to press.
  const [preview, setPreview]   = useState(null);
  const [previewing, setPrevw]  = useState(false);

  const askShuffle = async () => {
    setShuffleConfirm(true);
    setPreview(null);
    setPrevw(true);
    try {
      setPreview(await api.shufflePreview(id));
    } catch (err) {
      toast.error(err.message || 'Could not check this class');
      setShuffleConfirm(false);
    } finally { setPrevw(false); }
  };

  const closeShuffle = () => { setShuffleConfirm(false); setPreview(null); };

  const handleShuffle = async () => {
    setShuffling(true);
    try {
      const res = await api.shuffleSections(id);
      const spread = (res?.data?.sections || []).map(s => `${s.sectionName}: ${s.count}`).join(' · ');
      toast.success(`${res?.data?.students ?? 0} students shuffled — ${spread}`);
      closeShuffle();
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
              <Button variant="secondary" onClick={askShuffle}>🔀 Shuffle Sections</Button>
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
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link to={`/admin/sections/${sec._id}`} className="btn btn-primary btn-sm">Manage</Link>
                    {/* Editable here as well as on the section page: the shuffle
                        preview below complains about seats, and this is where
                        every section's figure is visible at once. */}
                    <button className="btn btn-secondary btn-sm" onClick={() => setCapSection(sec)}>Capacity</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      }

      <SectionCapacityModal
        open={!!capSection}
        section={capSection}
        onClose={() => setCapSection(null)}
        onSaved={refetch}
      />

      {/* Shuffle. The counts come from the server, and when the students do not
          fit in the seats the dialog says so instead of offering the action. */}
      <Modal
        open={shuffleConfirm}
        onClose={closeShuffle}
        title={preview && !preview.canShuffle ? 'Unable to shuffle' : 'Shuffle sections'}
        footer={
          <>
            <Button variant="secondary" onClick={closeShuffle}>
              {preview && !preview.canShuffle ? 'Close' : 'Cancel'}
            </Button>
            {preview?.canShuffle && (
              <Button loading={shuffling} onClick={handleShuffle}>Shuffle now</Button>
            )}
          </>
        }
      >
        {previewing && <div style={{ display: 'flex', justifyContent: 'center', padding: 28 }}><Spinner /></div>}

        {!previewing && preview && (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <span className="badge badge-info">{preview.students} students to place</span>
              <span className={`badge ${preview.students > preview.capacity ? 'badge-danger' : 'badge-success'}`}>
                {preview.capacity} seats across {preview.sectionCount} sections
              </span>
            </div>

            <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', marginBottom: 14 }}>
              <table className="table" style={{ margin: 0 }}>
                <thead><tr><th>Section</th><th>Currently</th><th>Capacity</th></tr></thead>
                <tbody>
                  {(preview.sections || []).map(s => (
                    <tr key={s._id} data-focus-id={s._id}>
                      <td style={{ fontWeight: 600 }}>{s.sectionName}</td>
                      <td>{s.currentCount}</td>
                      <td>{s.maxStudents || <span className="text-muted">not set</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview.canShuffle ? (
              <p className="text-muted text-sm">
                All {preview.students} students of {preview.className} — including any admitted but not placed yet —
                will be redistributed at random within each section&apos;s capacity. Existing roll numbers are cleared
                so you can reassign them afterwards. This can be repeated until you lock the sections.
              </p>
            ) : (
              <Alert variant="danger">{preview.reason}</Alert>
            )}
          </>
        )}
      </Modal>

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
