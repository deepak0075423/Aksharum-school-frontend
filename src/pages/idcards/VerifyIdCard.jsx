/**
 * /verify/id/:code — where an ID card's QR code points (Oct 2026).
 *
 * Whoever scans the card — a guard at the gate, a bus conductor, someone who
 * found it — sees at once whether it is valid, and whose it is: the name,
 * the photo (unless the school chose not to show it), and what the card
 * itself prints. Never a date of birth, a phone number or an address.
 * No sign-in (school-backend services/idCardViews.verify).
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fileUrl, initials } from './icMeta';
import '../../styles/idcards.css';

const API = String(import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

const Mark = ({ ok }) => (
  <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true">
    <circle cx="32" cy="32" r="30" fill="currentColor" />
    {ok
      ? <path d="m19 33 9 9 17-19" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" strokeLinejoin="round" />
      : <path d="m22 22 20 20M42 22 22 42" fill="none" stroke="#fff" strokeWidth="5.5" strokeLinecap="round" />}
  </svg>
);

export default function VerifyIdCard() {
  const { code } = useParams();
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    let alive = true;
    // Plain fetch: this page is for people with no account, so no session rides along.
    fetch(`${API}/public/id-card/${encodeURIComponent(code || '')}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!alive) return;
        if (r.ok && body?.data) setState({ loading: false, data: body.data, error: '' });
        else setState({ loading: false, data: null, error: body?.message || 'No ID card has this code' });
      })
      .catch(() => { if (alive) setState({ loading: false, data: null, error: 'The check could not be made — try again in a moment' }); });
    return () => { alive = false; };
  }, [code]);

  useEffect(() => { document.title = 'Verify an ID card'; }, []);

  const d = state.data;
  const checked = d?.checkedAt ? new Date(d.checkedAt) : null;
  return (
    <main className="icvf">
      <section className={`icvf-card${d ? (d.valid ? ' is-valid' : ' is-void') : state.loading ? '' : ' is-void'}`} aria-live="polite">
        {state.loading ? <p className="icvf-wait" role="status"><span />Checking the card…</p> : d ? (
          <>
            <header className="icvf-school">
              {d.school?.logo ? <img src={fileUrl(d.school.logo)} alt="" /> : <span className="icvf-school__mono">{initials(d.school?.name)}</span>}
              <div>
                <strong>{d.school?.name || 'The school'}</strong>
                {d.school?.place ? <small>{d.school.place}</small> : null}
              </div>
            </header>

            <div className="icvf-verdict">
              <Mark ok={d.valid} />
              <h1>{d.valid ? 'Valid ID Card' : d.title}</h1>
              <p>{d.message}{d.statusSince ? ` (since ${d.statusSince})` : ''}</p>
            </div>

            <div className="icvf-holder">
              {d.photo ? <img className="icvf-photo" src={fileUrl(d.photo)} alt={`Photo on the card of ${d.name}`} />
                : <span className="icvf-photo icvf-photo--none">{initials(d.name)}</span>}
              <div className="icvf-holder__text">
                <span className={`icvf-kind icvf-kind--${d.kind}`}>{d.kindLabel} card</span>
                <strong>{d.name}</strong>
              </div>
            </div>

            <dl className="icvf-lines">
              {d.lines.filter(([k]) => !['Student', 'Teacher', 'Staff', 'Parent'].includes(k)).map(([k, v]) => (
                <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
              ))}
              <div><dt>Card No.</dt><dd className="icvf-mono">{d.number}{d.duplicate ? ` · reissue ${d.duplicate}` : ''}</dd></div>
              <div><dt>Issued on</dt><dd>{d.issuedOn}</dd></div>
              {d.validTill ? <div><dt>Valid till</dt><dd>{d.validTill}</dd></div> : null}
            </dl>

            <p className="icvf-foot">
              Checked {checked ? checked.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'just now'} · code <b>{d.code}</b>.
              If the card in your hands shows a different name, photo or number, it is not the card the school issued.
            </p>
          </>
        ) : (
          <>
            <div className="icvf-verdict">
              <Mark ok={false} />
              <h1>Card not recognised</h1>
              <p>{state.error}</p>
            </div>
            <p className="icvf-foot">Check that you scanned the QR code on the back of the card — this link ends in <b>{String(code || '').toUpperCase()}</b> — or ask the school that issued it.</p>
          </>
        )}
      </section>
      <p className="icvf-brand">Verified by Aksharum School ERP</p>
    </main>
  );
}
