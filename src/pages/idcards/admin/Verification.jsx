/**
 * ID card verification desk (Oct 2026) — for the gate, the front office, a
 * bus. Three ways in, one answer:
 *
 *   type      the card number off the card ("ST2627-00042")
 *   scanner   a USB/Bluetooth QR scanner types the card's link and presses
 *             Enter — the box takes it as it is
 *   camera    this device's camera, where the browser can read QR codes
 *             (BarcodeDetector — Chrome, Edge, Android)
 *
 * The answer is the public check plus the card itself, and the check is
 * written to the card's timeline ("verified at the desk"). Only this
 * school's cards (GET /admin/id-cards/lookup).
 */
import React, { useEffect, useRef, useState } from 'react';
import { lookupIdCard, getIdCardActivity } from '../../../api/idcards.api';
import IdCard3D from '../IdCard3D';
import { Page, PageHead, Panel, Btn, Ico, Note, Empty, KindChip, useLoad } from '../icUI';
import { ago, errorText, fmtStamp } from '../icMeta';

const canScan = () => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

function Camera({ onCode, onClose }) {
  const video = useRef(null);
  const [err, setErr] = useState('');
  // The page hands a new function every render; the camera must not restart for it.
  const found = useRef(onCode);
  found.current = onCode;
  useEffect(() => {
    let stream = null; let timer = 0; let alive = true;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s) => {
        if (!alive) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        video.current.srcObject = s;
        video.current.play().catch(() => {});
        const tick = async () => {
          if (!alive) return;
          try {
            const codes = await detector.detect(video.current);
            if (codes?.[0]?.rawValue) { found.current(codes[0].rawValue); return; }
          } catch { /* a frame that is not ready yet */ }
          timer = setTimeout(tick, 220);
        };
        tick();
      })
      .catch(() => setErr('The camera could not be opened — allow camera access for this site, or type the card number.'));
    return () => { alive = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="icv-cam">
      {err ? <Note tone="red" icon="alert">{err}</Note> : (
        <div className="icv-cam__view">
          <video ref={video} muted playsInline />
          <span className="icv-cam__frame" aria-hidden><i /><i /><i /><i /></span>
          <span className="icv-cam__hint">Hold the QR code on the back of the card inside the frame</span>
        </div>
      )}
      <Btn icon="close" onClick={onClose}>Stop camera</Btn>
    </div>
  );
}

function Result({ res, onAgain }) {
  const r = res.result;
  const c = res.card;
  return (
    <section className={`icvd-result${r.valid ? ' is-valid' : ' is-void'}`} aria-live="assertive">
      <div className="icvd-verdict">
        <Ico name={r.valid ? 'checkDisc' : 'crossDisc'} size={44} />
        <div>
          <h2>{r.valid ? 'Valid ID card' : r.title}</h2>
          <p>{r.message}{r.statusSince ? ` (since ${r.statusSince})` : ''}</p>
        </div>
        <Btn kind={r.valid ? 'primary' : 'outline'} icon="scan" onClick={onAgain}>Check another</Btn>
      </div>
      <div className="icvd-body">
        <div className="icvd-card"><IdCard3D card={c} width={190} entrance={false} /></div>
        <div className="icvd-facts">
          <div className="icvd-name"><strong>{r.name}</strong><KindChip kind={r.kind} /></div>
          <dl>
            {r.lines.filter(([k]) => !['Student', 'Teacher', 'Staff', 'Parent'].includes(k)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            <div><dt>Card No.</dt><dd>{r.number}{r.duplicate ? ` · reissue ${r.duplicate}` : ''}</dd></div>
            <div><dt>Issued on</dt><dd>{r.issuedOn}</dd></div>
            {r.validTill ? <div><dt>Valid till</dt><dd>{r.validTill}</dd></div> : null}
            <div><dt>Checked</dt><dd>{fmtStamp(r.checkedAt)}</dd></div>
          </dl>
          <p className="icvd-tip">Compare the face in front of you with the photo — a card is only proof of identity for the person it shows.</p>
        </div>
      </div>
    </section>
  );
}

export default function Verification() {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [camera, setCamera] = useState(false);
  const input = useRef(null);
  const recent = useLoad(() => getIdCardActivity({ limit: 60, scans: '1' }), 'recent');

  const check = async (value) => {
    const v = String(value ?? q).trim();
    if (!v) { setErr('Scan a card or type its number'); return; }
    setBusy(true); setErr(''); setCamera(false);
    try {
      const r = await lookupIdCard(v);
      setRes(r.data);
      recent.reload();
    } catch (e) {
      setRes(null);
      setErr(await errorText(e, 'That card could not be checked'));
    } finally {
      setBusy(false);
      setTimeout(() => input.current?.select(), 0);
    }
  };
  const again = () => { setRes(null); setErr(''); setQ(''); input.current?.focus(); };
  const checks = (recent.data || []).filter((a) => a.action === 'verified' || a.action === 'scanned').slice(0, 14);

  return (
    <Page className="icvd">
      <PageHead title="Verification" subtitle="Check an ID card: scan its QR code — with a QR scanner or this device's camera — or type the card number printed on it." />

      <section className="icvd-box">
        <div className="icvd-box__row">
          <label className="icvd-input">
            <Ico name="qr" size={22} />
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onFocus={(e) => e.target.select()} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } }}
              placeholder="Scan a card, or type a card number like ST2627-00042" aria-label="Card number, code or scanned link" spellCheck={false} autoComplete="off" />
          </label>
          <Btn kind="primary" size="lg" icon="shieldCheck" busy={busy} onClick={() => check()}>Check card</Btn>
          {canScan() ? <Btn size="lg" icon="scan" onClick={() => setCamera((c) => !c)}>{camera ? 'Close camera' : 'Use camera'}</Btn> : null}
        </div>
        <p className="icvd-box__hint">
          A handheld QR scanner works here as it is — point it at the card and it fills the box and checks.
          {canScan() ? '' : ' (This browser cannot read QR codes from the camera; a phone camera app opens the card’s verification page directly.)'}
        </p>
        {camera ? <Camera onCode={(code) => { setQ(code); check(code); }} onClose={() => setCamera(false)} /> : null}
        {err ? <Note tone="red" icon="alert">{err}</Note> : null}
      </section>

      {res ? <Result res={res} onAgain={again} /> : null}

      <Panel title="Recent checks" sub="Cards verified at this desk, and QR scans of the school's cards" icon="history" tone="slate" pad={false}>
        {checks.length ? (
          <ul className="icvd-log">
            {checks.map((a) => (
              <li key={a._id}>
                <span className={`icvd-log__dot${a.action === 'verified' ? '' : ' is-scan'}`}><Ico name={a.action === 'verified' ? 'shieldCheck' : 'qr'} size={14} /></span>
                <span className="icvd-log__text">
                  <b>{a.holderName || 'Card'}</b> <em>{a.number}</em>
                  <small>{a.action === 'verified' ? `Checked at the desk${a.by ? ` by ${a.by}` : ''}` : 'QR code scanned'} · {ago(a.createdAt)}</small>
                </span>
                <KindChip kind={a.kind} />
              </li>
            ))}
          </ul>
        ) : <Empty compact title="No checks yet">Every card checked here, and every QR scan, is listed here.</Empty>}
      </Panel>
    </Page>
  );
}
