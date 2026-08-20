import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { getPaymentGateway, updatePaymentGateway } from '../../api/admin.api';
import { Button, Spinner, Alert } from '../ui/index';

// The school's merchant account, configured once here rather than inside each
// module. Fees and library fines both charge through it, and `modules` decides
// which of them is allowed to — a school can take fee payments online without
// also opening library fines to card payments.

const MODULE_LABEL = {
  fees:    { name: 'Fees', hint: 'Students and parents pay term fees online' },
  library: { name: 'Library fines', hint: 'Members settle overdue and damage charges online' },
};

export default function PaymentGatewayCard() {
  const [data,    setData]    = useState(null);
  const [form,    setForm]    = useState(null);
  const [saving,  setSaving]  = useState(false);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getPaymentGateway()
      .then(res => {
        const d = res?.data;
        setData(d);
        setForm({
          enabled: !!d.enabled,
          provider: d.provider || 'none',
          razorpayKeyId: d.razorpayKeyId || '',
          razorpayKeySecret: '',
          stripePublishableKey: d.stripePublishableKey || '',
          stripeSecretKey: '',
          currency: d.currency || 'INR',
          currencySymbol: d.currencySymbol || '₹',
          modules: { fees: !!d.modules?.fees, library: !!d.modules?.library },
        });
      })
      .catch(err => toast.error(err?.message || 'Could not load the gateway settings'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (loading) return <div className="card"><div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spinner /></div></div>;
  if (!form || !data) return null;

  // Nothing here is meaningful for a school that runs neither module.
  const available = Object.keys(MODULE_LABEL).filter(k => data.availableModules?.[k]);
  if (!available.length) return null;

  const set = (key) => (e) => {
    const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(p => ({ ...p, [key]: v }));
  };
  const toggleModule = (key) => (e) =>
    setForm(p => ({ ...p, modules: { ...p.modules, [key]: e.target.checked } }));

  const save = async (e) => {
    e.preventDefault();
    if (form.enabled) {
      if (form.provider === 'none') return toast.error('Choose a gateway before switching online payment on');
      if (form.provider === 'razorpay' && (!form.razorpayKeyId.trim() || (!form.razorpayKeySecret && !data.hasRazorpaySecret)))
        return toast.error('Enter both the Razorpay key id and key secret');
      if (form.provider === 'stripe' && (!form.stripePublishableKey.trim() || (!form.stripeSecretKey && !data.hasStripeSecret)))
        return toast.error('Enter both the Stripe publishable key and secret key');
      if (!available.some(k => form.modules[k]))
        return toast.error('Pick at least one module that should use this gateway');
    }
    setSaving(true);
    try {
      await updatePaymentGateway(form);
      toast.success('Payment gateway saved');
      load();
    } catch (err) { toast.error(err?.message || 'Could not save the gateway settings'); }
    finally { setSaving(false); }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header"><strong>Payment Gateway</strong></div>
      <div className="card-body">
        <p className="text-muted text-sm" style={{ marginTop: 0 }}>
          Your school's own gateway account. Money goes directly to it — the platform never holds it.
          One account serves every module you switch on below.
        </p>

        <form onSubmit={save}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 16 }}>
            <input type="checkbox" checked={form.enabled} onChange={set('enabled')} style={{ marginTop: 3 }} />
            <span>
              <strong>Accept online payments</strong>
              <div className="form-hint" style={{ marginTop: 2 }}>
                Off means every payment is recorded at the counter by staff.
              </div>
            </span>
          </label>

          {form.enabled && (
            <>
              <div className="form-row form-row-2">
                <div className="form-group">
                  <label className="form-label required">Gateway</label>
                  <select className="form-control" value={form.provider} onChange={set('provider')}>
                    <option value="none">Choose…</option>
                    <option value="razorpay">Razorpay</option>
                    <option value="stripe">Stripe</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Currency</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="form-control" style={{ width: 100 }} value={form.currency}
                      onChange={set('currency')} placeholder="INR" />
                    <input className="form-control" style={{ width: 70 }} value={form.currencySymbol}
                      onChange={set('currencySymbol')} placeholder="₹" />
                  </div>
                </div>
              </div>

              {form.provider === 'razorpay' && (
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label className="form-label required">Key ID</label>
                    <input className="form-control" value={form.razorpayKeyId} onChange={set('razorpayKeyId')}
                      placeholder="rzp_live_…" />
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Key Secret</label>
                    <input type="password" className="form-control" value={form.razorpayKeySecret}
                      onChange={set('razorpayKeySecret')}
                      placeholder={data.hasRazorpaySecret ? 'Saved — type to replace' : 'Key secret'} />
                    <div className="form-hint">Leave blank to keep the saved secret.</div>
                  </div>
                </div>
              )}

              {form.provider === 'stripe' && (
                <div className="form-row form-row-2">
                  <div className="form-group">
                    <label className="form-label required">Publishable key</label>
                    <input className="form-control" value={form.stripePublishableKey}
                      onChange={set('stripePublishableKey')} placeholder="pk_live_…" />
                  </div>
                  <div className="form-group">
                    <label className="form-label required">Secret key</label>
                    <input type="password" className="form-control" value={form.stripeSecretKey}
                      onChange={set('stripeSecretKey')}
                      placeholder={data.hasStripeSecret ? 'Saved — type to replace' : 'sk_live_…'} />
                    <div className="form-hint">Leave blank to keep the saved secret.</div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Which modules may charge through it</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 6 }}>
                  {available.map(key => (
                    <label key={key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
                      <input type="checkbox" checked={form.modules[key]} onChange={toggleModule(key)} style={{ marginTop: 3 }} />
                      <span>
                        <strong style={{ fontSize: '.92rem' }}>{MODULE_LABEL[key].name}</strong>
                        <div className="form-hint" style={{ marginTop: 2 }}>{MODULE_LABEL[key].hint}</div>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {form.provider === 'stripe' && form.modules.library && (
                <Alert variant="warning">
                  Library fines check out through Razorpay only. With Stripe selected, members will still see
                  their fines but will have to pay at the counter.
                </Alert>
              )}
            </>
          )}

          <div style={{ marginTop: 8 }}>
            <Button type="submit" loading={saving}>Save gateway</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
