/**
 * The gate: look a pass up by its token, then record the exit or the return.
 * One dialog, opened from Outpass and from Security — a guard does the same
 * thing on either screen.
 *
 * The pass is resolved from the token itself (never from an id somebody typed),
 * so a student cannot present another student's pass.
 */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/hostel.api';
import { DrawerFields } from '../../../components/ui/Drawer';
import { PassQr } from '../shared';
import { words } from './hsUI';
import { fmtDate, fmtTime } from './hsList';
import { FormModal, FormSection, Fld } from './hsForm';

const stamp = (d) => (d ? `${fmtDate(d)}, ${fmtTime(d)}` : '');

export function GateModal({ open, token: initial = '', onClose, onDone }) {
  const [token, setToken] = useState('');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);

  const lookup = async (t = token) => {
    const value = String(t || '').trim();
    if (!value) return;
    try {
      const r = await api.verifyOutpass(value);
      setFound(r.data ?? r);
    } catch (err) { toast.error(err.message); setFound(null); }
  };

  useEffect(() => {
    if (!open) return;
    setToken(initial); setFound(null);
    if (initial) lookup(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const record = async (direction) => {
    setBusy(true);
    try {
      const r = await api.gateScan({ token: token.trim(), direction, gate: 'Main Gate' });
      const d = r.data ?? r;
      toast.success(direction === 'out' ? 'Departure recorded' : 'Return recorded');
      if (d.lateMinutes > 0) toast(`${d.lateMinutes} minute(s) late${d.fine ? ' — a late fee was raised' : ''}`, { icon: '⏰', duration: 6000 });
      onDone?.(d);
      onClose();
    } catch (err) { toast.error(err.message); } finally { setBusy(false); }
  };

  const action = found?.valid ? found.expectedAction : null;
  return (
    <FormModal open={open} onClose={onClose} busy={busy} width={580} icon="qr" title="Gate Verification"
      subtitle="Scan or paste the pass token. The pass is found from the token itself, so no one can present another student's pass."
      onSubmit={() => (action ? record(action) : lookup())} hideSubmit={!!found && !action}
      submitLabel={action === 'out' ? 'Record Departure' : action === 'in' ? 'Record Return' : 'Look Up Pass'}
      submitIcon={action === 'out' ? 'logOut' : action === 'in' ? 'logIn' : 'search'}>
      <FormSection>
        <Fld label="Pass Token" required icon="qr" hint={found && !found.valid ? 'This pass is not usable.' : ''} hintTone="bad">
          <input data-text="token" value={token} autoComplete="off" placeholder="Paste the QR token…" onChange={(e) => { setToken(e.target.value); setFound(null); }} />
        </Fld>
        {found ? (
          <div className="hs-gatecard">
            <h4>{found.outpassNumber}</h4>
            <DrawerFields fields={[
              ['Student', found.student?.name], ['Room', found.room?.roomNumber], ['Purpose', found.purpose],
              ['Destination', found.destination], ['Expected back', stamp(found.expectedReturnAt)],
              ['Status', words(found.status)],
            ]} />
            {found.qrImage ? <div className="hsf-center"><PassQr image={found.qrImage} size={160} caption="Compare against the pass the student is showing" /></div> : null}
          </div>
        ) : null}
      </FormSection>
    </FormModal>
  );
}
