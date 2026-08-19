import React, { useState } from 'react';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/hostel.api';
import { PageHeader, Spinner, Empty, Badge } from '../../../components/ui/index';
import { BedTile, BedLegend, Filters, label } from '../shared';

/**
 * The drill-down occupancy map (spec §32): Hostel → Building → Floor → Room →
 * Bed → Student. Every level is collapsible and shows its own roll-up, so the
 * same screen answers "how full is the campus" and "who is in bed 3 of room 204".
 */
const countBeds = (node) => {
  if (node.type === 'bed') return { total: 1, occupied: node.status === 'occupied' ? 1 : 0 };
  return (node.children || []).reduce((acc, c) => {
    const r = countBeds(c);
    return { total: acc.total + r.total, occupied: acc.occupied + r.occupied };
  }, { total: 0, occupied: 0 });
};

const ICON = { hostel: '🏨', building: '🏗', floor: '🪜', room: '🚪' };

function Node({ node, depth, expandedAll }) {
  const [open, setOpen] = useState(depth < 1);
  React.useEffect(() => { if (expandedAll != null) setOpen(expandedAll); }, [expandedAll]);

  const { total, occupied } = countBeds(node);
  const pct = total ? Math.round((occupied / total) * 100) : 0;
  const isRoom = node.type === 'room';

  return (
    <div style={{ marginLeft: depth ? 16 : 0, borderLeft: depth ? '1px solid var(--border)' : 'none', paddingLeft: depth ? 12 : 0 }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px',
          textAlign: 'left', fontFamily: 'inherit', borderBottom: '1px solid var(--border)',
        }}>
        <span style={{ width: 12, color: 'var(--text-muted)', fontSize: '.8rem' }}>{open ? '▾' : '▸'}</span>
        <span>{ICON[node.type] || '•'}</span>
        <span style={{ fontWeight: depth === 0 ? 700 : 600, fontSize: depth === 0 ? '.95rem' : '.86rem' }}>
          {node.type === 'room' ? `Room ${node.name}` : node.name}
        </span>
        {node.roomType && <Badge variant="muted">{label(node.roomType)}</Badge>}
        {node.status && node.type !== 'bed' && node.status !== 'active' && node.status !== 'available' && (
          <Badge variant={['maintenance', 'inactive'].includes(node.status) ? 'danger' : 'warning'}>{label(node.status)}</Badge>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>{occupied}/{total} beds</span>
          <span style={{ width: 60, height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: pct >= 90 ? '#ef4444' : pct >= 60 ? '#f59e0b' : '#10b981' }} />
          </span>
        </span>
      </button>

      {open && (
        isRoom ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '10px 0 10px 24px' }}>
            {(node.children || []).length
              ? node.children.map((b) => <BedTile key={b._id} bed={{ ...b, bedNumber: b.name }} />)
              : <span className="text-muted" style={{ fontSize: '.8rem' }}>No beds laid out.</span>}
          </div>
        ) : (
          <div style={{ paddingBottom: 4 }}>
            {(node.children || []).length
              ? node.children.map((c) => <Node key={c._id} node={c} depth={depth + 1} expandedAll={expandedAll} />)
              : <div style={{ fontSize: '.8rem', color: 'var(--text-muted)', padding: '8px 0 8px 24px' }}>Nothing here yet.</div>}
          </div>
        )
      )}
    </div>
  );
}

export default function Occupancy() {
  const [hostel, setHostel] = useState('');
  const [expandAll, setExpandAll] = useState(null);
  const { data: meta } = useFetch(api.getMeta, []);
  const { data, loading, error } = useFetch(() => api.getOccupancy({ hostel: hostel || undefined }), [hostel]);

  const tree = data || [];
  const totals = tree.reduce((acc, h) => {
    const r = countBeds(h);
    return { total: acc.total + r.total, occupied: acc.occupied + r.occupied };
  }, { total: 0, occupied: 0 });

  return (
    <div className="page">
      <PageHeader title="Occupancy Map"
        subtitle={`${totals.occupied} of ${totals.total} beds occupied · drill from hostel down to the student`} />

      <Filters>
        <select className="form-control" style={{ maxWidth: 260 }} value={hostel} onChange={(e) => setHostel(e.target.value)}>
          <option value="">All hostels</option>
          {(meta?.hostels || []).map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setExpandAll(true)}>Expand all</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setExpandAll(false)}>Collapse all</button>
      </Filters>

      <div style={{ marginBottom: 14 }}><BedLegend /></div>

      <div className="card"><div className="card-body">
        {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><Spinner /></div>
          : error ? <Empty icon="⚠️" title="Could not load the map" message={error} />
          : !tree.length ? <Empty icon="🗺" title="Nothing to show" message="Create a hostel, building, floor and rooms first." />
          : tree.map((h) => <Node key={h._id} node={h} depth={0} expandedAll={expandAll} />)}
      </div></div>
    </div>
  );
}
