import React, { useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import useFetch from '../../../hooks/useFetch';
import { PageHeader, Button, Card, Alert, Badge } from '../../../components/ui/index';
import { label } from '../shared';

const AUDIENCES = [
  { v: 'residents', l: 'Residents', d: 'Every student currently living in the hostel' },
  { v: 'parents', l: 'Parents', d: 'The parents of every resident' },
  { v: 'residents_and_parents', l: 'Residents & parents', d: 'Both, in one send' },
  { v: 'staff', l: 'Hostel staff', d: 'Wardens, supervisors and assigned staff' },
];

// A few starting points — the warden edits them before sending.
const TEMPLATES = [
  { l: '🔔 General announcement', title: '', body: '' },
  { l: '💳 Fee reminder', title: 'Hostel fee reminder', body: 'This is a reminder that hostel fees for the current period are due. Please clear any outstanding amount at the fee counter.' },
  { l: '🍽 Mess notice', title: 'Mess notice', body: 'Please note the following change to the mess schedule:' },
  { l: '🔧 Maintenance notice', title: 'Planned maintenance', body: 'Maintenance work is scheduled in the hostel. Water and power may be interrupted during:' },
  { l: '🚨 Emergency', title: 'Urgent hostel notice', body: '', urgent: true },
];

/**
 * Hostel announcements. The audience is resolved server-side from live
 * allocations and staff assignments, then handed to the school's existing
 * notification service — in-app, the unread badge, the socket push and email
 * through the school's own SMTP all come from there.
 */
export default function Communication() {
  const [form, setForm] = useState({ hostel: '', audience: 'residents', title: '', body: '', email: false, urgent: false });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  const { data: meta } = useFetch(api.getMeta, []);
  const hostels = meta?.hostels || [];

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const applyTemplate = (t) => setForm((f) => ({ ...f, title: t.title, body: t.body, urgent: !!t.urgent, email: !!t.urgent }));

  const send = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      const r = await api.sendAnnouncement({ ...form, hostel: form.hostel || null });
      const d = r.data ?? r;
      toast.success(`Sent to ${d.sent} recipient(s)`);
      setSent(d);
      setForm((f) => ({ ...f, title: '', body: '' }));
    } catch (err) { toast.error(err.message); } finally { setSending(false); }
  };

  const audience = AUDIENCES.find((a) => a.v === form.audience);

  return (
    <div className="page">
      <PageHeader title="Hostel Announcements" subtitle="Reaches residents, parents and staff through the school's existing notification channels" />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 16, alignItems: 'start' }}>
        <Card title="Compose">
          <form onSubmit={send}>
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Hostel</label>
                <select className="form-control" value={form.hostel} onChange={(e) => set('hostel', e.target.value)}>
                  <option value="">All hostels I manage</option>
                  {hostels.map((h) => <option key={h._id} value={h._id}>{h.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Audience</label>
                <select className="form-control" value={form.audience} onChange={(e) => set('audience', e.target.value)}>
                  {AUDIENCES.map((a) => <option key={a.v} value={a.v}>{a.l}</option>)}
                </select>
                <div className="form-hint">{audience?.d}</div>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label required">Title</label>
              <input className="form-control" required value={form.title} onChange={(e) => set('title', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label required">Message</label>
              <textarea className="form-control" rows={7} required value={form.body} onChange={(e) => set('body', e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 14 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.86rem' }}>
                <input type="checkbox" checked={form.email} onChange={(e) => set('email', e.target.checked)} />
                Also send by email
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '.86rem' }}>
                <input type="checkbox" checked={form.urgent} onChange={(e) => set('urgent', e.target.checked)} />
                Mark urgent (always emailed)
              </label>
            </div>
            <Button type="submit" loading={sending}>Send announcement</Button>
          </form>
        </Card>

        <div style={{ display: 'grid', gap: 16 }}>
          <Card title="Start from a template">
            {TEMPLATES.map((t) => (
              <button key={t.l} type="button" onClick={() => applyTemplate(t)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', background: 'none',
                  border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
                  marginBottom: 8, cursor: 'pointer', fontSize: '.85rem', fontFamily: 'inherit',
                }}>
                {t.l}
              </button>
            ))}
          </Card>

          {sent && (
            <Card title="Last send">
              <div style={{ fontSize: '.86rem' }}>
                Delivered to <strong>{sent.sent}</strong> recipient(s)
                <div style={{ marginTop: 6 }}><Badge variant="muted">{label(sent.audience)}</Badge></div>
              </div>
            </Card>
          )}

          <Alert variant="info">
            Leave, outpass, fee, complaint, maintenance, incident and discipline updates already
            notify the people involved automatically — this screen is for everything else.
          </Alert>
        </div>
      </div>
    </div>
  );
}
