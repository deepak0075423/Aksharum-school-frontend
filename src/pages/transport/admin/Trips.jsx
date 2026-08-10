import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Table, Button, Modal, Badge, Pagination, Spinner } from '../../../components/ui/index';

const ST = { scheduled: 'muted', started: 'success', paused: 'warning', completed: 'info', cancelled: 'danger' };
const ATT = { pending: 'muted', boarded: 'success', dropped: 'info', absent: 'danger', no_show: 'danger' };
const today = () => new Date().toISOString().slice(0, 10);

export default function TransportTrips() {
  const [rows, setRows] = useState([]);
  const [pg, setPg]     = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoad] = useState(true);
  const [date, setDate] = useState(today());
  const [shift, setShift] = useState('');
  const [status, setStatus] = useState('');
  const [genOpen, setGen] = useState(false);
  const [genDate, setGenDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [trip, setTrip] = useState(null);   // detail
  const [attDraft, setAttDraft] = useState({});

  const load = useCallback(async (page = 1) => {
    setLoad(true);
    try { const res = await api.getTrips({ page, limit: 20, date, shift, status }); const d = res.data ?? res;
      setRows(d.data || []); setPg({ page: d.page, pages: d.pages, total: d.total }); }
    catch (err) { toast.error(err.message); } finally { setLoad(false); }
  }, [date, shift, status]);
  useEffect(() => { load(1); }, [date, shift, status]); // eslint-disable-line

  const generate = async () => {
    setBusy(true);
    try { const res = await api.generateTrips({ date: genDate }); const d = res.data ?? res;
      toast.success(`${d.created} trip(s) generated`); setGen(false); setDate(genDate); load(1); }
    catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };
  const openTrip = async (row) => {
    setTrip({ loading: true });
    try { const r = await api.getTrip(row._id); const t = r.data ?? r;
      setTrip(t); setAttDraft(Object.fromEntries((t.studentAttendance || []).map(s => [s.student?._id || s.student, s.status]))); }
    catch (err) { toast.error(err.message); setTrip(null); }
  };
  const refreshTrip = async () => { if (trip?._id) { const r = await api.getTrip(trip._id); setTrip(r.data ?? r); } };
  const action = async (a, extra = {}) => {
    try { await api.tripAction(trip._id, { action: a, ...extra }); toast.success(`Trip ${a}`); await refreshTrip(); load(pg.page); }
    catch (err) { toast.error(err.message); }
  };
  const reach = async (ev, st) => { try { await api.reachStop(trip._id, { stopId: ev._id, status: st }); await refreshTrip(); } catch (err) { toast.error(err.message); } };
  const saveAtt = async () => {
    try { const entries = Object.entries(attDraft).map(([student, status]) => ({ student, status }));
      await api.markAttendance(trip._id, { entries }); toast.success('Attendance saved'); await refreshTrip(); load(pg.page); }
    catch (err) { toast.error(err.message); }
  };

  const columns = [
    { key: 'code', label: 'Trip', render: r => <div><strong style={{ cursor: 'pointer' }} onClick={() => openTrip(r)}>{r.tripCode || r.route?.name}</strong><div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.route?.name}</div></div> },
    { key: 'dir', label: 'Shift', render: r => <Badge variant="info">{r.shift} · {r.direction}</Badge> },
    { key: 'veh', label: 'Vehicle / Driver', render: r => <div style={{ fontSize: '.8rem' }}>{r.vehicle?.vehicleNumber || '—'}<div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>{r.driver?.name || '—'}</div></div> },
    { key: 'att', label: 'Boarded', render: r => <Badge variant={r.absent ? 'warning' : 'success'}>{r.boarded}/{r.total}</Badge> },
    { key: 'delay', label: 'Delay', render: r => r.delayMinutes ? <Badge variant="danger">{r.delayMinutes}m</Badge> : '—' },
    { key: 'status', label: 'Status', render: r => <Badge variant={ST[r.status]}>{r.status}</Badge> },
    { key: 'a', label: '', render: r => <Button size="sm" variant="secondary" onClick={() => openTrip(r)}>Open</Button> },
  ];

  const t = trip && !trip.loading ? trip : null;
  return (
    <div className="page">
      <PageHeader title="Daily Trips" subtitle="Generate, run & track pickup / drop trips"
        action={<Button onClick={() => { setGenDate(date); setGen(true); }}>⚙️ Generate Trips</Button>} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <input type="date" className="form-control" style={{ maxWidth: 180 }} value={date} onChange={e => setDate(e.target.value)} />
        <select className="form-control" style={{ maxWidth: 150 }} value={shift} onChange={e => setShift(e.target.value)}><option value="">All shifts</option><option value="morning">Morning</option><option value="evening">Evening</option></select>
        <select className="form-control" style={{ maxWidth: 160 }} value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{Object.keys(ST).map(s => <option key={s} value={s}>{s}</option>)}</select>
      </div>
      <div className="card"><div className="card-body" style={{ padding: 0 }}>
        <Table columns={columns} data={rows} loading={loading} emptyIcon="📅" emptyTitle="No trips for this day — click Generate Trips" />
      </div></div>
      <Pagination page={pg.page} pages={pg.pages} total={pg.total} onPage={load} />

      <Modal open={genOpen} onClose={() => setGen(false)} title="Generate Daily Trips" maxWidth={440}
        footer={<><Button variant="secondary" onClick={() => setGen(false)}>Cancel</Button><Button onClick={generate} loading={busy}>Generate</Button></>}>
        <p style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>Creates pickup & drop trips for every active route with an assigned vehicle. Existing trips for the day are skipped.</p>
        <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-control" value={genDate} onChange={e => setGenDate(e.target.value)} /></div>
      </Modal>

      <Modal open={!!trip} onClose={() => setTrip(null)} title={t ? `${t.tripCode} · ${t.route?.name}` : 'Trip'} maxWidth={760}>
        {trip?.loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div> : t && (
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <Badge variant={ST[t.status]}>{t.status}</Badge>
              <Badge variant="info">{t.shift} · {t.direction}</Badge>
              <Badge variant="muted">{t.vehicle?.vehicleNumber}</Badge>
              <Badge variant="muted">👨‍✈️ {t.driver?.name || '—'}</Badge>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {t.status === 'scheduled' && <Button size="sm" onClick={() => action('start')}>▶ Start Trip</Button>}
              {t.status === 'started' && <Button size="sm" variant="secondary" onClick={() => action('pause')}>⏸ Pause</Button>}
              {t.status === 'paused' && <Button size="sm" onClick={() => action('resume')}>▶ Resume</Button>}
              {['started','paused'].includes(t.status) && <Button size="sm" onClick={() => action('complete')}>✅ Complete</Button>}
              {!['completed','cancelled'].includes(t.status) && <Button size="sm" variant="danger" onClick={() => action('cancel', { reason: 'Cancelled by manager' })}>✕ Cancel</Button>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ fontSize: '.8rem', fontWeight: 700, marginBottom: 6 }}>Stops</div>
                {(t.stopEvents || []).map(ev => (
                  <div key={ev._id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '.8rem', flex: 1 }}>{ev.sequence}. {ev.name}<span style={{ color: 'var(--text-muted)', fontSize: '.72rem' }}> {ev.plannedTime}</span></span>
                    {ev.status === 'reached' ? <Badge variant="success">reached</Badge>
                      : ev.status === 'skipped' ? <Badge variant="danger">skipped</Badge>
                      : <><button className="btn btn-secondary btn-sm" onClick={() => reach(ev, 'reached')}>✓</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => reach(ev, 'skipped')}>skip</button></>}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 700 }}>Attendance</div>
                  <Button size="sm" onClick={saveAtt}>Save</Button>
                </div>
                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {(t.studentAttendance || []).map(s => {
                    const id = s.student?._id || s.student;
                    return (
                      <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
                        <span style={{ flex: 1, fontSize: '.8rem' }}>{s.student?.name || 'Student'}</span>
                        <select className="form-control" style={{ padding: '3px 6px', fontSize: '.75rem', width: 110 }}
                          value={attDraft[id] || 'pending'} onChange={e => setAttDraft(d => ({ ...d, [id]: e.target.value }))}>
                          {['pending','boarded','dropped','absent','no_show'].map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                    );
                  })}
                  {(t.studentAttendance || []).length === 0 && <div style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>No students on this trip.</div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
