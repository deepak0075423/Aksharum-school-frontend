import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import { getFeeSettings, updateFeeSettings } from '../../../api/fees.api';
import { PageHeader, Spinner, Button, Alert } from '../../../components/ui/index';

// Gateway credentials used to live here. They now belong to the school, because
// library fines check out through the same merchant account — one set of keys,
// configured once, in Settings → Payment Gateway. What is left on this page is
// how fees are counted and how their receipts are numbered.

const EMPTY = {
  currency: 'INR', currencySymbol: '₹', receiptPrefix: 'REC', roundingRule: 'none',
};

const ROUNDING = [
  ['none',  'No rounding — charge the exact amount'],
  ['round', 'Round to the nearest rupee'],
  ['ceil',  'Always round up'],
  ['floor', 'Always round down'],
];

export default function FeesSettings() {
  const { data, loading, refetch } = useFetch(getFeeSettings);
  const [form, setForm]     = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setForm({
      currency:       data.currency       || 'INR',
      currencySymbol: data.currencySymbol || '₹',
      receiptPrefix:  data.receiptPrefix  || 'REC',
      roundingRule:   data.roundingRule   || 'none',
    });
  }, [data]);

  const f = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.receiptPrefix.trim()) return toast.error('Enter a receipt prefix');
    setSaving(true);
    try {
      await updateFeeSettings(form);
      toast.success('Fee settings saved');
      refetch();
    } catch (err) { toast.error(err?.message || 'Could not save the settings'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const onlineLive = !!data?.onlinePaymentEnabled;

  return (
    <div className="page">
      <PageHeader title="Fees Settings" subtitle="Currency, rounding and receipt numbering" />

      {/* Where the gateway went, and whether fees can currently take payments. */}
      <div style={{ marginBottom: 16 }}>
        <Alert variant={onlineLive ? 'success' : 'info'}>
          {onlineLive ? (
            <>Online fee payment is <strong>live</strong> through {data?.paymentGatewayProvider === 'razorpay' ? 'Razorpay' : 'Stripe'}.
              {' '}Credentials live in <Link to="/admin/settings">Settings → Payment Gateway</Link>, shared with any other module that takes payments.</>
          ) : (
            <>Online fee payment is <strong>off</strong>. The payment gateway is now configured for the whole school
              in <Link to="/admin/settings">Settings → Payment Gateway</Link> — switch it on there and tick
              <strong> Fees</strong> among the modules that may use it.</>
          )}
        </Alert>
      </div>

      <form onSubmit={handleSave}>
        <div className="card">
          <div className="card-header"><h2>Money</h2></div>
          <div className="card-body">
            <div className="form-row form-row-2">
              <div className="form-group">
                <label className="form-label">Currency code</label>
                <input className="form-control" value={form.currency} onChange={f('currency')} placeholder="INR" />
              </div>
              <div className="form-group">
                <label className="form-label">Currency symbol</label>
                <input className="form-control" value={form.currencySymbol} onChange={f('currencySymbol')} placeholder="₹" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Rounding</label>
              <select className="form-control" value={form.roundingRule} onChange={f('roundingRule')}>
                {ROUNDING.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2>Receipts</h2></div>
          <div className="card-body">
            <div className="form-group" style={{ maxWidth: 280 }}>
              <label className="form-label required">Receipt prefix</label>
              <input className="form-control" value={form.receiptPrefix} onChange={f('receiptPrefix')} placeholder="REC" />
              <div className="form-hint">
                Receipts are numbered {form.receiptPrefix || 'REC'}-000001 and upwards.
              </div>
            </div>
            <Alert variant="info">
              How a fee receipt <em>looks</em> is set in{' '}
              <Link to="/admin/settings">Settings → Receipt Designs</Link>, where you can use one design for
              counter payments and another for online ones.
            </Alert>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <Button type="submit" loading={saving}>Save settings</Button>
        </div>
      </form>
    </div>
  );
}
