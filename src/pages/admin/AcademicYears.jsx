import React, { useState } from 'react';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/admin.api';
import { PageHeader, Table, Badge, Button, Modal, Confirm, Spinner } from '../../components/ui/index';
import ImportYearStructureModal from '../../components/ImportYearStructureModal';

export default function AcademicYears() {
  const { data: years, loading, refetch } = useFetch(api.getAcademicYears);
  const [modal, setModal]     = useState(false);
  const [editYr, setEditYr]   = useState(null);
  const [del, setDel]         = useState(null);
  const [saving, setSaving]   = useState(false);
  const [delLoad, setDL]      = useState(false);
  const [form, setForm]       = useState({ yearName: '', startDate: '', endDate: '' });
  const [formErr, setFormErr] = useState('');

  const openCreate = () => { setForm({ yearName: '', startDate: '', endDate: '' }); setEditYr(null); setFormErr(''); setModal(true); };
  const openEdit   = (r)  => { setForm({ yearName: r.yearName, startDate: r.startDate?.slice(0,10) || '', endDate: r.endDate?.slice(0,10) || '' }); setEditYr(r); setFormErr(''); setModal(true); };
  const closeModal = () => { setModal(false); setFormErr(''); };

  // Two years of the same school may not cover the same dates — check locally
  // for instant feedback; the API enforces the same rule.
  const overlaps = () => {
    if (!form.startDate || !form.endDate) return null;
    const s = new Date(form.startDate), e = new Date(form.endDate);
    return (years || []).find(y =>
      y._id !== editYr?._id &&
      new Date(y.startDate) <= e && new Date(y.endDate) >= s
    );
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setFormErr('');
    if (!form.yearName.trim()) { setFormErr('Year name is required'); return; }
    if (!form.startDate) { setFormErr('Start date is required'); return; }
    if (!form.endDate) { setFormErr('End date is required'); return; }
    if (new Date(form.endDate) <= new Date(form.startDate)) { setFormErr('End date must be after start date'); return; }
    const clash = overlaps();
    if (clash) {
      setFormErr(`These dates overlap "${clash.yearName}" (${new Date(clash.startDate).toLocaleDateString()} – ${new Date(clash.endDate).toLocaleDateString()}). Academic years cannot overlap.`);
      return;
    }
    setSaving(true);
    try {
      if (editYr) {
        await api.updateAcademicYear(editYr._id, form);
        toast.success('Year updated');
      } else {
        await api.createAcademicYear(form);
        toast.success('Year created');
      }
      closeModal();
      refetch();
    } catch (err) { setFormErr(err.message); toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDL(true);
    try { await api.deleteAcademicYear(del._id); toast.success('Deleted'); setDel(null); refetch(); }
    catch (err) { toast.error(err.message); }
    finally { setDL(false); }
  };

  const handleSetActive = async (id) => {
    try { await api.setActiveYear(id); toast.success('Set as active year'); refetch(); }
    catch (err) { toast.error(err.message); }
  };

  // The year being filled from another year's structure, or null.
  const [importInto, setImportInto] = useState(null);

  const columns = [
    { key: 'yearName',  label: 'Year',   render: r => <strong>{r.yearName}</strong> },
    { key: 'startDate', label: 'Start',  render: r => r.startDate ? new Date(r.startDate).toLocaleDateString() : '—' },
    { key: 'endDate',   label: 'End',    render: r => r.endDate   ? new Date(r.endDate).toLocaleDateString()   : '—' },
    { key: 'status',    label: 'Status', render: r =>
      <Badge variant={r.status === 'active' ? 'success' : 'muted'}>{r.status === 'active' ? '✓ Active' : 'Inactive'}</Badge> },
    { key: 'actions', label: 'Actions', render: r => (
      <div className="actions">
        <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>Edit</button>
        {/* Building next year starts here: copy this year's classes, sections,
            subjects and subject teachers rather than retyping them. */}
        <button className="btn btn-secondary btn-sm" onClick={() => setImportInto(r)}>Import Structure</button>
        {r.status !== 'active' && <button className="btn btn-primary btn-sm" onClick={() => handleSetActive(r._id)}>Set Active</button>}
        <button className="btn btn-danger btn-sm" onClick={() => setDel(r)}>Delete</button>
      </div>
    )},
  ];

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page">
      <PageHeader title="Academic Years" subtitle="Manage school academic years"
        action={<Button onClick={openCreate}>+ Add Year</Button>} />

      <ImportYearStructureModal
        open={!!importInto}
        targetYear={importInto}
        years={years}
        onClose={() => setImportInto(null)}
        onImported={refetch}
      />

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <Table columns={columns} data={years} emptyIcon="📅" emptyTitle="No academic years" />
        </div>
      </div>

      <Modal open={modal} onClose={closeModal} title={editYr ? 'Edit Academic Year' : 'Add Academic Year'}
        footer={<>
          <Button variant="secondary" onClick={closeModal}>Cancel</Button>
          <Button form="year-form" type="submit" loading={saving}>{editYr ? 'Update' : 'Create'}</Button>
        </>}>
        <form id="year-form" onSubmit={handleSave}>
          {formErr && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
              borderRadius: 'var(--radius)', padding: '10px 12px', fontSize: '.85rem', marginBottom: 14 }}>
              {formErr}
            </div>
          )}
          <div className="form-group">
            <label className="form-label required">Year Name</label>
            <input className="form-control" required value={form.yearName}
              onChange={e => { setFormErr(''); setForm(f => ({ ...f, yearName: e.target.value })); }} placeholder="2024-25" />
          </div>
          <div className="form-row form-row-2">
            <div className="form-group">
              <label className="form-label">Start Date</label>
              <input type="date" className={`form-control${formErr ? ' error' : ''}`} value={form.startDate}
                onChange={e => { setFormErr(''); setForm(f => ({ ...f, startDate: e.target.value })); }} />
            </div>
            <div className="form-group">
              <label className="form-label">End Date</label>
              <input type="date" className={`form-control${formErr ? ' error' : ''}`} value={form.endDate}
                onChange={e => { setFormErr(''); setForm(f => ({ ...f, endDate: e.target.value })); }} />
            </div>
          </div>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} onConfirm={handleDelete}
        loading={delLoad} title="Delete Academic Year" message={`Delete "${del?.yearName}"?`} />
    </div>
  );
}
