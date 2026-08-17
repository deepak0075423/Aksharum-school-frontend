import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { PageHeader, Button, Table, Modal, Confirm, Badge, Input, Select } from '../../../components/ui/index';
import { ROOM_TYPES, DAYS, DAY_SHORT } from './shared';

const empty = {
  roomName: '', roomNumber: '', roomType: 'Classroom', capacity: 40,
  building: '', homeSection: '', subjects: [], unavailable: [], notes: '', isActive: true,
};

const TYPE_ICON = {
  'Classroom': '🏫', 'Science Lab': '🔬', 'Computer Lab': '💻', 'Physics Lab': '🧲',
  'Chemistry Lab': '🧪', 'Biology Lab': '🧬', 'Library': '📚', 'Auditorium': '🎭',
  'Activity Room': '🎨', 'Sports': '⚽', 'Other': '📍',
};

export default function TimetableRooms() {
  const [rows, setRows]     = useState([]);
  const [meta, setMeta]     = useState(null);
  const [loading, setLoad]  = useState(true);
  const [type, setType]     = useState('');
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState(empty);
  const [editId, setEditId] = useState(null);
  const [saving, setSave]   = useState(false);
  const [del, setDel]       = useState(null);

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const [r, m] = await Promise.all([
        api.getRooms({ ...(type ? { type } : {}), active: 'all' }),
        meta ? null : api.getMeta(),
      ]);
      setRows((r.data ?? r) || []);
      if (m) setMeta(m.data ?? m);
    } catch (e) { toast.error(e.message); } finally { setLoad(false); }
  }, [type]); // eslint-disable-line

  useEffect(() => { load(); }, [type]); // eslint-disable-line

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const open = (row) => {
    if (row) {
      setEditId(row._id);
      setForm({
        ...empty, ...row,
        homeSection: row.homeSection?._id || row.homeSection || '',
        subjects: (row.subjects || []).map(s => s._id || s),
        unavailable: row.unavailable || [],
      });
    } else { setEditId(null); setForm(empty); }
    setModal(true);
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.roomName.trim()) return toast.error('Room name is required');
    setSave(true);
    try {
      const payload = { ...form, capacity: Number(form.capacity) || 0, homeSection: form.homeSection || null };
      if (editId) await api.updateRoom(editId, payload); else await api.createRoom(payload);
      toast.success(editId ? 'Room updated' : 'Room added');
      setModal(false); load();
    } catch (err) { toast.error(err.message); } finally { setSave(false); }
  };

  const remove = async () => {
    try {
      const res = await api.deleteRoom(del._id);
      const d = res.data ?? res;
      toast.success(d.retired ? d.message : 'Room deleted');
      setDel(null); load();
    } catch (e) { toast.error(e.message); setDel(null); }
  };

  const toggleSlot = (day, period) => setForm(f => {
    const has = f.unavailable.some(u => u.dayOfWeek === day && u.periodNumber === period);
    return {
      ...f,
      unavailable: has
        ? f.unavailable.filter(u => !(u.dayOfWeek === day && u.periodNumber === period))
        : [...f.unavailable, { dayOfWeek: day, periodNumber: period, reason: '' }],
    };
  });

  const allSections = (meta?.classes || []).flatMap(c => (c.sections || []).map(s => ({ ...s, className: c.className })));
  const maxPeriods = 10;

  const columns = [
    { key: 'r', label: 'Room', render: r => (
      <div>
        <strong>{TYPE_ICON[r.roomType] || '📍'} {r.roomName}</strong>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          {r.roomNumber ? `#${r.roomNumber}` : ''}{r.building ? ` · ${r.building}` : ''}
        </div>
      </div>
    )},
    { key: 'type', label: 'Type', render: r => <Badge variant="info">{r.roomType}</Badge> },
    { key: 'cap', label: 'Capacity', render: r => r.capacity || '—' },
    { key: 'home', label: 'Home class', render: r => r.homeSection
      ? <span style={{ fontSize: '.8rem' }}>{r.homeSection.sectionName ? `Sec ${r.homeSection.sectionName}` : '—'}</span>
      : <span style={{ color: 'var(--text-light)' }}>—</span> },
    { key: 'block', label: 'Blocked slots', render: r => (r.unavailable?.length
      ? <Badge variant="warning">{r.unavailable.length}</Badge>
      : <span style={{ color: 'var(--text-light)' }}>None</span>) },
    { key: 'st', label: 'Status', render: r => <Badge variant={r.isActive ? 'success' : 'muted'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { key: 'a', label: '', render: r => (
      <div style={{ display: 'flex', gap: 6 }}>
        <Button size="sm" variant="secondary" onClick={() => open(r)}>Edit</Button>
        <Button size="sm" variant="danger" onClick={() => setDel(r)}>Delete</Button>
      </div>
    )},
  ];

  return (
    <div className="page">
      <PageHeader
        title="Rooms & Labs"
        subtitle="Where classes are held. The generator allocates these and prevents double-booking."
        action={<Button onClick={() => open()}>+ Add Room</Button>}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <select className="form-control" style={{ maxWidth: 220 }} value={type} onChange={e => setType(e.target.value)}>
          <option value="">All room types</option>
          {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="🚪"
          emptyTitle="No rooms yet — add labs so practicals can be allocated automatically" />
      </div></div>

      <Modal open={modal} onClose={() => setModal(false)} title={editId ? 'Edit Room' : 'Add Room'} maxWidth={720}
        footer={<>
          <Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button>
          <Button onClick={save} loading={saving}>Save</Button>
        </>}>
        <form onSubmit={save}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <Input label="Room name" required value={form.roomName} onChange={e => set('roomName', e.target.value)} placeholder="Computer Lab" />
            <Input label="Room number" value={form.roomNumber} onChange={e => set('roomNumber', e.target.value)} placeholder="L-101" />
            <Select label="Room type" value={form.roomType} onChange={e => set('roomType', e.target.value)}>
              {ROOM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
            <Input label="Capacity" type="number" min="0" value={form.capacity} onChange={e => set('capacity', e.target.value)}
              hint="Classes larger than this are not placed here" />
            <Input label="Building / Campus" value={form.building} onChange={e => set('building', e.target.value)} placeholder="Main Block" />
            <Select label="Home class (optional)" value={form.homeSection} onChange={e => set('homeSection', e.target.value)}>
              <option value="">Not a dedicated classroom</option>
              {allSections.map(s => <option key={s._id} value={s._id}>{s.className} · {s.sectionName}</option>)}
            </Select>
          </div>

          <div className="form-group">
            <label className="form-label">Restrict to subjects (optional)</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 10, maxHeight: 130, overflowY: 'auto' }}>
              {(meta?.subjects || []).map(s => (
                <label key={s._id} style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '.8rem' }}>
                  <input type="checkbox" checked={form.subjects.includes(s._id)}
                    onChange={e => set('subjects', e.target.checked
                      ? [...form.subjects, s._id]
                      : form.subjects.filter(x => x !== s._id))} />
                  {s.subjectName}
                </label>
              ))}
              {!meta?.subjects?.length && <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>No subjects yet</span>}
            </div>
            <div className="form-hint">Leave all unchecked to allow any subject that matches the room type.</div>
          </div>

          <div className="form-group">
            <label className="form-label">Blocked slots</label>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', fontSize: '.75rem' }}>
                <thead>
                  <tr>
                    <th style={{ padding: 4 }}></th>
                    {Array.from({ length: maxPeriods }, (_, i) => <th key={i} style={{ padding: 4, fontWeight: 600 }}>P{i + 1}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map(day => (
                    <tr key={day}>
                      <td style={{ padding: 4, fontWeight: 600 }}>{DAY_SHORT[day]}</td>
                      {Array.from({ length: maxPeriods }, (_, i) => {
                        const period = i + 1;
                        const blocked = form.unavailable.some(u => u.dayOfWeek === day && u.periodNumber === period);
                        return (
                          <td key={period} style={{ padding: 2 }}>
                            <button type="button" onClick={() => toggleSlot(day, period)} title={blocked ? 'Blocked' : 'Available'}
                              style={{
                                width: 26, height: 22, borderRadius: 4, cursor: 'pointer',
                                border: `1px solid ${blocked ? 'var(--danger)' : 'var(--border)'}`,
                                background: blocked ? 'rgba(239,68,68,.15)' : 'var(--bg-card)',
                                color: blocked ? 'var(--danger)' : 'var(--text-light)', fontSize: '.7rem',
                              }}>
                              {blocked ? '✕' : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-hint">Click a slot to block the room (maintenance, external bookings…).</div>
          </div>

          <Input label="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.85rem' }}>
            <input type="checkbox" checked={form.isActive} onChange={e => set('isActive', e.target.checked)} />
            Active (available to the generator)
          </label>
        </form>
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete room"
        message={`Delete "${del?.roomName}"? If it is used by an existing timetable it will be deactivated instead.`}
        onConfirm={remove} />
    </div>
  );
}
