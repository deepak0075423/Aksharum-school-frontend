import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Table, Badge, Pagination, Modal, Button } from '../../../components/ui/index';
import { Filters, Field, FieldGrid, label, dt } from '../shared';

const ENTITIES = ['Hostel', 'HostelBuilding', 'HostelFloor', 'HostelRoom', 'HostelBed',
  'HostelAdmission', 'HostelAllocation', 'HostelAttendance', 'HostelLeave', 'HostelOutpass',
  'HostelVisitor', 'HostelStaffAssignment', 'HostelMess', 'HostelFeePlan', 'HostelFeeInvoice',
  'HostelComplaint', 'HostelMaintenance', 'HostelAsset', 'HostelMovement', 'HostelIncident',
  'HostelDiscipline', 'HostelDocument', 'HostelSettings'];

const TONE = {
  create: 'success', update: 'info', delete: 'danger', approve: 'success', reject: 'danger',
  allocate: 'success', transfer: 'info', release: 'warning', cancel: 'muted',
  payment: 'success', refund: 'warning', discount: 'info', fine: 'danger', export: 'muted',
};

/** The audit trail (spec §29) — who changed what, with the before/after diff. */
export default function Audit() {
  const [rows, setRows] = useState([]);
  const [pg, setPg] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({ entityType: '', actionType: '', hostel: '', from: '', to: '' });
  const [detail, setDetail] = useState(null);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try {
      const r = await api.getAudit({ page, limit: 30, ...filters });
      const d = r.data ?? r;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total });
    } catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [filters]);
  useEffect(() => { load(1); }, [filters]); // eslint-disable-line

  const columns = [
    { key: 'when', label: 'When', render: (r) => (
      <span style={{ fontSize: '.79rem', whiteSpace: 'nowrap' }}>{dt(r.createdAt)}</span>
    ) },
    { key: 'who', label: 'Who', render: (r) => (
      <div style={{ fontSize: '.82rem' }}>
        {r.userName || r.user?.name || 'System'}
        <div style={{ fontSize: '.71rem', color: 'var(--text-muted)' }}>{label(r.role)}</div>
      </div>
    ) },
    { key: 'action', label: 'Action', render: (r) => (
      <Badge variant={TONE[r.actionType] || 'muted'}>{label(r.actionType)}</Badge>
    ) },
    { key: 'entity', label: 'Entity', render: (r) => (
      <span style={{ fontSize: '.79rem' }}>{r.entityType?.replace(/^Hostel/, '') || '—'}</span>
    ) },
    { key: 'desc', label: 'Description', render: (r) => (
      <span style={{ fontSize: '.82rem' }}>{r.description}</span>
    ) },
    { key: 'diff', label: '', render: (r) => (r.before || r.after)
      ? <Button size="sm" variant="secondary" onClick={() => setDetail(r)}>Diff</Button>
      : null },
  ];

  return (
    <div className="page">
      <PageHeader title="Hostel Activity Log" subtitle={`${pg.total} audited operation(s) — append-only`} />

      <Filters>
        <select className="form-control" style={{ maxWidth: 220 }} value={filters.entityType} onChange={(e) => setFilters((f) => ({ ...f, entityType: e.target.value }))}>
          <option value="">All entities</option>
          {ENTITIES.map((e) => <option key={e} value={e}>{e.replace(/^Hostel/, '') || 'Hostel'}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 180 }} value={filters.actionType} onChange={(e) => setFilters((f) => ({ ...f, actionType: e.target.value }))}>
          <option value="">All actions</option>
          {Object.keys(TONE).map((a) => <option key={a} value={a}>{label(a)}</option>)}
        </select>
        <select className="form-control" style={{ maxWidth: 200 }} value={filters.hostel} onChange={(e) => setFilters((f) => ({ ...f, hostel: e.target.value }))}>
          <option value="">All hostels</option>
          {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
        </select>
        <input className="form-control" style={{ maxWidth: 160 }} type="date" value={filters.from} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
        <input className="form-control" style={{ maxWidth: 160 }} type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
      </Filters>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🧾" emptyTitle="No activity yet" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={!!detail} onClose={() => setDetail(null)} maxWidth={640} title="Change detail">
        {detail && (
          <div style={{ display: 'grid', gap: 16 }}>
            <FieldGrid>
              <Field label="When">{dt(detail.createdAt)}</Field>
              <Field label="Who">{detail.userName || detail.user?.name}</Field>
              <Field label="Role">{label(detail.role)}</Field>
              <Field label="Action">{label(detail.actionType)}</Field>
              <Field label="Entity">{detail.entityType}</Field>
              <Field label="IP">{detail.ip || '—'}</Field>
              <Field label="Description" wide>{detail.description}</Field>
            </FieldGrid>
            {(detail.before || detail.after) && (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead>
                  <tbody>
                    {[...new Set([...Object.keys(detail.before || {}), ...Object.keys(detail.after || {})])].map((k) => (
                      <tr key={k}>
                        <td style={{ fontSize: '.82rem', fontWeight: 600 }}>{label(k)}</td>
                        <td style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>{JSON.stringify(detail.before?.[k] ?? null)}</td>
                        <td style={{ fontSize: '.8rem' }}>{JSON.stringify(detail.after?.[k] ?? null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {detail.userAgent && (
              <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{detail.userAgent}</div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
