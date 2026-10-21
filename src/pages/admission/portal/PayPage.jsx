/**
 * /<slug>/pay/<token> — paying a fee by a link the school sent (Oct 2026), with
 * no sign-in: for the family that cannot find its password, or the relative
 * who pays. The link names one fee of one application at this school; the page
 * shows the application number, the child's first name and the amount — and
 * can only pay (school-backend services/admission/payLink.js).
 *
 * The gateway's confirmation is what makes a payment paid: the browser hands
 * it to the server, which checks the signature before anything is recorded.
 */
import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { pub, openProtected } from '../../../api/admission.api';
import { openCheckout } from '../../../utils/razorpay';
import { useLoad, Spin, Btn, Note, KV, Ico } from '../admUI';
import { fmtDate, fmtDateTime, money, errMsg } from '../meta';
import { usePortal } from './PortalShell';

export default function PayPage() {
  const { token } = useParams();
  const portal = usePortal();
  const { data, loading, error, reload } = useLoad(() => pub.payLink(portal.slug, token), [portal.slug, token]);
  const [busy, setBusy] = useState('');
  const [paid, setPaid] = useState(null);

  if (loading && !data) return <Spin label="Opening the payment…" />;
  if (error && !data) {
    return (
      <div className="adm-authcard" style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1>{/expired/i.test(error) ? 'This link has expired' : 'This link does not work'}</h1>
        <p>{error}</p>
        <p className="adm-muted">Ask the school&rsquo;s admission office for a new link, or sign in and pay from your application&rsquo;s page.</p>
        <Link to={`/${portal.slug}/login`} className="btn btn-primary">Sign in</Link>
      </div>
    );
  }

  const next = data.nextInstalment;
  const pay = async (part) => {
    setBusy(part);
    try {
      const order = await pub.payLinkOrder(portal.slug, token, part);
      await openCheckout({
        order: order.data, amount: order.data.due, name: data.schoolName, description: `${data.kindLabel} — ${data.applicationNumber}`,
        onVerify: async (resp) => {
          try {
            const r = await pub.payLinkVerify(portal.slug, token, resp);
            setPaid(r.data);
            toast.success('Payment received');
            reload();
          } catch (e) { toast.error(errMsg(e)); }
        },
        onError: (e) => toast.error(e.message),
      });
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const receipt = () => openProtected(pub.payLinkReceiptUrl(portal.slug, token, paid.paymentId)).catch((e) => toast.error(e.message));

  return (
    <div className="adm-authcard" style={{ maxWidth: 600, margin: '0 auto' }}>
      <div className="adm-head__eyebrow">Payment</div>
      <h1 style={{ textTransform: 'none' }}>The {data.kindLabel} for {data.studentFirstName || 'your child'}</h1>
      <p>{data.schoolName} · application <span className="adm-num">{data.applicationNumber}</span></p>
      {paid ? (
        <Note tone="green" icon="checkCircle" action={<Btn size="sm" icon="fileCheck" onClick={receipt}>Receipt</Btn>}>
          {money(paid.amount)} received on {fmtDateTime(paid.paidAt)} — receipt <b className="adm-num">{paid.receiptNumber}</b>. The school has been told.
        </Note>
      ) : null}
      <KV cols={2} items={[['Still due', <b key="d">{money(data.due)}</b>], ['Link works until', fmtDate(data.expiresAt)]]} />
      {data.due <= 0 ? (
        <Note tone="green" icon="checkCircle">Nothing is due on this fee.</Note>
      ) : !data.online ? (
        <Note tone="gray" icon="info">The school is not taking this fee online at the moment — please pay at the admission office.</Note>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
          {next ? (
            <>
              <Note tone="indigo" icon="calendar">The fee is paid in instalments. Next: <b>{next.label}</b> — {money(Math.min(next.owing, data.due))}, due by {fmtDate(next.dueAt)}.</Note>
              <div className="adm-row">
                <Btn kind="primary" icon="wallet" busy={busy === 'instalment'} disabled={!!busy} onClick={() => pay('instalment')}>Pay {money(Math.min(next.owing, data.due))}</Btn>
                {data.due > next.owing ? <Btn busy={busy === 'all'} disabled={!!busy} onClick={() => pay('all')}>Pay all {money(data.due)}</Btn> : null}
              </div>
            </>
          ) : (
            <div className="adm-row"><Btn kind="primary" icon="wallet" busy={busy === 'all'} disabled={!!busy} onClick={() => pay('all')}>Pay {money(data.due)}</Btn></div>
          )}
          <p className="adm-muted" style={{ fontSize: '.8rem', display: 'flex', gap: 6, alignItems: 'center' }}>
            <Ico name="lock" size={13} />Paid through the school&rsquo;s payment gateway. A payment counts once the gateway confirms it.
          </p>
        </div>
      )}
    </div>
  );
}
