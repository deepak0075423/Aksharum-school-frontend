import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/transport.api';
import { PageHeader, Button, Spinner, Card } from '../../../components/ui/index';

const METHODS = ['rfid', 'qr', 'manual', 'face', 'biometric'];

export default function TransportSettings() {
  const [s, setS] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getSettings().then(r => setS(r.data ?? r)).catch(e => toast.error(e.message)); }, []);
  if (!s) return <div className="loading-page"><Spinner /></div>;

  const set = (k, v) => setS(o => ({ ...o, [k]: v }));
  const setCh = (k, v) => setS(o => ({ ...o, channels: { ...o.channels, [k]: v } }));
  const toggleMethod = (m) => setS(o => ({ ...o, attendanceMethods: o.attendanceMethods?.includes(m) ? o.attendanceMethods.filter(x => x !== m) : [...(o.attendanceMethods || []), m] }));

  const save = async () => {
    setSaving(true);
    try { await api.updateSettings(s); toast.success('Settings saved'); } catch (err) { toast.error(err.message); } finally { setSaving(false); }
  };
  const Toggle = ({ label, k, group }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', padding: '4px 0' }}>
      <input type="checkbox" checked={group ? s.channels?.[k] : s[k]} onChange={e => group ? setCh(k, e.target.checked) : set(k, e.target.checked)} /> {label}
    </label>
  );

  return (
    <div className="page">
      <PageHeader title="Transport Settings" subtitle="Attendance, notifications, geofencing & reminders"
        action={<Button onClick={save} loading={saving}>Save Settings</Button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>
        <Card title="Regional">
          <div className="form-row form-row-2">
            <div className="form-group"><label className="form-label">Timezone</label><input className="form-control" value={s.timezone} onChange={e => set('timezone', e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Currency</label><input className="form-control" value={s.currency} onChange={e => set('currency', e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Document reminder (days before expiry)</label><input type="number" className="form-control" value={s.documentReminderDays} onChange={e => set('documentReminderDays', +e.target.value)} /></div>
        </Card>
        <Card title="Attendance Methods">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {METHODS.map(m => (
              <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem', padding: '4px 0' }}>
                <input type="checkbox" checked={s.attendanceMethods?.includes(m)} onChange={() => toggleMethod(m)} /> <span style={{ textTransform: 'uppercase' }}>{m}</span>
              </label>
            ))}
          </div>
        </Card>
        <Card title="Notifications">
          <Toggle label="Notify on board (pickup)" k="notifyOnBoard" />
          <Toggle label="Notify on drop" k="notifyOnDrop" />
          <Toggle label="Notify on reaching school" k="notifyOnReachSchool" />
          <Toggle label="Notify on delay" k="notifyOnDelay" />
          <Toggle label="Notify on trip start" k="notifyOnTripStart" />
          <div className="form-group" style={{ marginTop: 8 }}><label className="form-label">Delay threshold (min)</label><input type="number" className="form-control" value={s.delayThresholdMin} onChange={e => set('delayThresholdMin', +e.target.value)} /></div>
        </Card>
        <Card title="Channels & Geofencing">
          <Toggle label="SMS" k="sms" group /><Toggle label="Email" k="email" group />
          <Toggle label="WhatsApp" k="whatsapp" group /><Toggle label="Push" k="push" group />
          <div className="form-row form-row-2" style={{ marginTop: 8 }}>
            <div className="form-group"><label className="form-label">Geofence radius (m)</label><input type="number" className="form-control" value={s.geofenceRadiusM} onChange={e => set('geofenceRadiusM', +e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Deviation alert (m)</label><input type="number" className="form-control" value={s.deviationAlertM} onChange={e => set('deviationAlertM', +e.target.value)} /></div>
          </div>
        </Card>
      </div>
    </div>
  );
}
