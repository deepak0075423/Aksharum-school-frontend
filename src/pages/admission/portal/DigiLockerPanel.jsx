/**
 * "Fetch from DigiLocker" on the family's application (Oct 2026): connect —
 * DigiLocker asks the family to sign in and allow it, then sends them back
 * here — and pick which issued document is which paper the school asks for.
 * The file goes through the same checks as an upload (school-backend
 * services/admission/digilocker.js). Draws nothing where DigiLocker is off.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { portal as api } from '../../../api/admission.api';
import { useLoad, Panel, Btn, Note, Select, Chip } from '../admUI';
import { errMsg, fmtTime } from '../meta';

export default function DigiLockerPanel({ appId, requirements = [], onFetched }) {
  const { data, reload } = useLoad(() => api.digilocker(appId), [appId]);
  const [busy, setBusy] = useState('');
  const [pick, setPick] = useState({});
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('digilocker');
    if (!q) return;
    if (q === 'connected') toast.success('DigiLocker connected — choose the documents to use');
    else toast.error('DigiLocker could not be connected — try again');
    const url = new URL(window.location.href);
    url.searchParams.delete('digilocker');
    window.history.replaceState(null, '', url.toString());
  }, []);
  if (!data?.available) return null;
  const connect = async () => {
    setBusy('connect');
    try { const r = await api.digilockerStart(appId); window.location.assign(r.data.url); } catch (e) { toast.error(errMsg(e)); setBusy(''); }
  };
  const fetchOne = async (f) => {
    const docKey = pick[f.uri];
    if (!docKey) return;
    setBusy(f.uri);
    try {
      const r = await api.digilockerImport(appId, { uri: f.uri, docKey });
      toast.success(`${r.data.name} added from DigiLocker${r.data.verified ? ' — verified' : ''}`);
      onFetched?.();
      reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(''); }
  };
  const connected = data.status === 'connected';
  return (
    <Panel title="Fetch documents from DigiLocker" icon="shieldCheck" tone="teal"
      sub={connected ? `Connected${data.account?.name ? ` as ${data.account.name}` : ''} until ${fmtTime(data.expiresAt)}.` : 'Documents issued to you — a birth certificate, mark sheets, a transfer certificate — come straight from the issuer, no scanning.'}>
      {data.error ? <Note tone="red" icon="alert">{data.error}</Note> : null}
      {!connected ? (
        <Btn kind="primary" icon="externalLink" busy={busy === 'connect'} onClick={connect}>Connect DigiLocker</Btn>
      ) : data.files.length ? (
        <div className="adm-doclist">
          {data.files.map((f) => (
            <div key={f.uri} className="adm-row adm-row--between" style={{ flexWrap: 'wrap' }}>
              <span style={{ minWidth: 0 }}><b>{f.name}</b>{f.issuer ? <span className="adm-muted"> · {f.issuer}</span> : null}</span>
              <span className="adm-row" style={{ gap: 6 }}>
                <Select value={pick[f.uri] || ''} onChange={(e) => setPick({ ...pick, [f.uri]: e.target.value })} aria-label={`Use ${f.name} as`} style={{ width: 'auto' }}>
                  <option value="">Use as…</option>
                  {requirements.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}
                </Select>
                <Btn size="sm" kind="primary" busy={busy === f.uri} disabled={!pick[f.uri]} onClick={() => fetchOne(f)}>Fetch</Btn>
              </span>
            </div>
          ))}
          {data.account && !data.account.dobMatchesStudent ? <p className="adm-muted" style={{ fontSize: '.78rem', margin: 0 }}><Chip tone="gray">Note</Chip> This DigiLocker account&rsquo;s date of birth is not the student&rsquo;s — fine if it is a parent&rsquo;s locker; the school sees the same.</p> : null}
        </div>
      ) : <Note tone="gray" icon="info">No issued documents in this DigiLocker account.</Note>}
    </Panel>
  );
}
