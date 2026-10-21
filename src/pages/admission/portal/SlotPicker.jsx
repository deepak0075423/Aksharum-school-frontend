/**
 * Choosing (or moving) an exam or interview time from the ones the school
 * published (school-backend services/admission/slots.js). The server holds the
 * rules — room left, how late a time may change, how many changes — and its
 * answer is what counts; this only lays the times out by day.
 */
import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { portal as api } from '../../../api/admission.api';
import { useLoad, Dialog, Btn, Note, Spin, ErrorBox } from '../admUI';
import { fmtDate, fmtTime, fmtDateTime, errMsg } from '../meta';

export default function SlotPicker({ appId, exam, onClose, onDone }) {
  const { data, loading, error, reload } = useLoad(() => api.examSlots(appId, exam.examId), [appId, exam.examId]);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const days = useMemo(() => {
    const m = new Map();
    for (const s of data?.slots || []) {
      const k = new Date(s.startsAt).toDateString();
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(s);
    }
    return [...m.values()];
  }, [data]);
  const go = async () => {
    setBusy(true);
    try {
      await api.chooseSlot(appId, exam.examId, pick);
      toast.success('Time booked');
      onDone();
    } catch (e) { toast.error(errMsg(e)); reload(); } finally { setBusy(false); }
  };
  const mine = data?.mine;
  return (
    <Dialog open onClose={onClose} title={`${mine ? 'Change the time' : 'Choose a time'} — ${exam.name}`} width={640}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" busy={busy} disabled={!pick || pick === mine?.id || !data?.canChoose} onClick={go}>{mine ? 'Move to this time' : 'Book this time'}</Btn></>}>
      {loading && !data ? <Spin /> : error && !data ? <ErrorBox error={error} onRetry={reload} /> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mine ? <Note tone="indigo" icon="calendar">Booked now: <b>{fmtDateTime(mine.startsAt)}</b>{mine.room ? `, ${mine.room}` : ''}.{data.changesLeft != null ? ` You can change it ${data.changesLeft} more time${data.changesLeft === 1 ? '' : 's'}.` : ''}</Note> : null}
          {!data.canChoose ? <Note tone="amber" icon="info">The time can no longer be changed here — please call the admission office.</Note> : null}
          {data.changeUntilHours ? <p className="adm-muted" style={{ fontSize: '.82rem', margin: 0 }}>Times can be booked or changed up to {data.changeUntilHours} hours before they start.</p> : null}
          {days.length ? days.map((list) => (
            <div key={list[0].startsAt}>
              <div className="adm-slotday">{fmtDate(list[0].startsAt)}</div>
              <div className="adm-slots" role="radiogroup" aria-label={`Times on ${fmtDate(list[0].startsAt)}`}>
                {list.map((s) => {
                  const full = s.left <= 0 && s.id !== mine?.id;
                  return (
                    <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} disabled={full || !data.canChoose}
                      className={`adm-slot ${pick === s.id ? 'is-on' : ''} ${s.id === mine?.id ? 'is-mine' : ''}`} onClick={() => setPick(s.id)}>
                      <b>{fmtTime(s.startsAt)}</b>
                      <em>{s.id === mine?.id ? 'Yours' : full ? 'Full' : `${s.left} left`}{s.room ? ` · ${s.room}` : ''}</em>
                    </button>
                  );
                })}
              </div>
            </div>
          )) : <Note tone="gray" icon="info">No times are open just now — the school will add more, or call the admission office.</Note>}
        </div>
      )}
    </Dialog>
  );
}
