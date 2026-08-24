import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/superAdmin.api';
import { PageHeader, Button, Table, Badge, Modal, Spinner, Empty, SchoolLogo } from '../../components/ui/index';

export default function Schools() {
  const [page, setPage]         = useState(1);
  const [search, setSearch]     = useState('');
  const [del, setDel]           = useState(null);   // the school the dialog is about
  const [check, setCheck]       = useState(null);   // server's verdict on deleting it
  const [checking, setChecking] = useState(false);
  const [delLoading, setDelLoad]= useState(false);
  const [downloading, setDown]  = useState(false);

  const { data, loading, refetch } = useFetch(
    () => api.getSchools({ page, search, limit: 20 }),
    [page, search],
  );

  // Opening the dialog asks the server whether this school may be deleted at
  // all. The answer decides what the dialog offers — there is no delete button
  // to press while accounts still belong to the school.
  const askDelete = async (school) => {
    setDel(school);
    setCheck(null);
    setChecking(true);
    try {
      const res = await api.checkSchoolDeletable(school._id);
      setCheck(res?.data ?? res);
    } catch (err) {
      toast.error(err.message || 'Could not check this school');
      setDel(null);
    } finally { setChecking(false); }
  };

  const closeDelete = () => { setDel(null); setCheck(null); };

  const handleDelete = async () => {
    setDelLoad(true);
    try {
      await api.deleteSchool(del._id);
      toast.success('School deleted');
      closeDelete();
      refetch();
    } catch (err) {
      // The server re-checks on delete, so a school that gained a user between
      // opening the dialog and confirming is still refused — show why.
      if (err.status === 409) {
        toast.error(err.message);
        setCheck((c) => ({ ...(c || {}), canDelete: false, userCount: err.data?.data?.userCount ?? c?.userCount }));
        try {
          const res = await api.checkSchoolDeletable(del._id);
          setCheck(res?.data ?? res);
        } catch { /* keep what we have */ }
      } else {
        toast.error(err.message);
      }
    } finally { setDelLoad(false); }
  };

  const handleDownloadUsers = async () => {
    setDown(true);
    try {
      await api.downloadSchoolUsers(del._id, del.name);
      toast.success('User list downloaded');
    } catch (err) { toast.error(err.message || 'Download failed'); }
    finally { setDown(false); }
  };

  const columns = [
    {
      key: 'logo', label: 'Logo', render: r => <SchoolLogo school={r} size={40} />,
    },
    {
      key: 'name', label: 'School Name', render: r => (
        <div style={{ fontWeight: 600 }}>{r.name}</div>
      ),
    },
    {
      key: 'code', label: 'Code', render: r => r.code
        ? <span style={{ fontFamily: 'monospace', background: 'var(--bg)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 4, fontSize: '.8rem', fontWeight: 600 }}>{r.code}</span>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    { key: 'board',  label: 'Board',  render: r => r.board || <span style={{ color: 'var(--text-muted)' }}>—</span> },
    { key: 'email',  label: 'Email',  render: r => r.email || '—' },
    { key: 'phone',  label: 'Phone',  render: r => r.phone || '—' },
    {
      key: 'website', label: 'Website', render: r => r.website
        ? <a href={r.website} target="_blank" rel="noreferrer"
            style={{ color: 'var(--primary)', fontSize: '.85rem', maxWidth: 140, display: 'inline-block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.website.replace(/^https?:\/\//, '')}
          </a>
        : <span style={{ color: 'var(--text-muted)' }}>—</span>,
    },
    {
      key: 'status', label: 'Status', render: r =>
        <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions', label: '', render: r => (
        <div className="actions">
          <Link to={`/super-admin/schools/${r._id}/edit`} className="btn btn-secondary btn-sm">Edit</Link>
          <button className="btn btn-danger btn-sm" onClick={() => askDelete(r)}>Delete</button>
        </div>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader title="Schools" subtitle="Manage all registered schools"
        action={<Link to="/super-admin/schools/create" className="btn btn-primary">+ Add School</Link>} />

      <div className="card">
        <div className="card-header">
          <input className="form-control" style={{ maxWidth: 300 }}
            placeholder="🔍 Search schools…"
            value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {loading
            ? <div style={{ padding: 48, display: 'flex', justifyContent: 'center' }}><Spinner /></div>
            : <Table columns={columns} data={data?.data} emptyIcon="🏫" emptyTitle="No schools found" />
          }
        </div>
      </div>

      {/* Delete confirmation. A school that still has accounts is not
          deletable — the dialog says so, lists who is blocking it, and offers
          the list as a spreadsheet instead of a delete button. */}
      <Modal
        open={!!del}
        onClose={closeDelete}
        title={check && !check.canDelete ? 'Cannot delete this school' : 'Delete school'}
        maxWidth={480}
        footer={
          <>
            <Button variant="secondary" onClick={closeDelete}>
              {check && !check.canDelete ? 'Close' : 'Cancel'}
            </Button>
            {check?.canDelete && (
              <Button variant="danger" loading={delLoading} onClick={handleDelete}>
                Delete permanently
              </Button>
            )}
            {check && !check.canDelete && (
              <Button loading={downloading} onClick={handleDownloadUsers}>
                ⬇ Download user list (Excel)
              </Button>
            )}
          </>
        }
      >
        {checking && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div>
        )}

        {!checking && check?.canDelete && (
          <>
            <p style={{ marginBottom: 12 }}>
              Delete <strong>{del?.name}</strong>?
            </p>
            <p className="text-muted text-sm">
              This school has no accounts in it. Deleting it cannot be undone.
            </p>
          </>
        )}

        {!checking && check && !check.canDelete && (
          <>
            <p style={{ marginBottom: 14 }}>
              <strong>{del?.name}</strong> still has{' '}
              <strong>{check.userCount}</strong> account{check.userCount === 1 ? '' : 's'}.
              Every student record, payroll run and document in the system belongs to those
              accounts, so the school cannot be deleted while they exist.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              {(check.byRole || []).map((r) => (
                <span key={r.role} className="badge badge-warning">{r.label}: {r.count}</span>
              ))}
            </div>

          </>
        )}

        {!checking && !check && (
          <Empty icon="🔌" title="Could not check this school" message="Please close and try again." />
        )}
      </Modal>
    </div>
  );
}
