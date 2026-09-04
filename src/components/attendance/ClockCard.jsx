import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../hooks/useFetch';
import { Button, Spinner } from '../ui/index';
import Icon from '../ui/icons';

/**
 * Self-contained "today" clock in/out card.
 * Used standalone on dashboards and at the top of the My Attendance tab.
 *
 * props:
 *   api:       { getMyAttendance({month,year}), clockIn(), clockOut() }
 *   linkTo:    optional path to the full attendance page (shown as a link)
 *   onChanged: optional callback fired after a successful clock action
 *   variant:   'card' (default, its own panel) | 'strip' (a band designed to sit
 *              inside another card — the admin dashboard's greeting panel).
 *              The behaviour is identical; only the chrome differs, so there is
 *              still one implementation of clocking in.
 */
export default function ClockCard({ api, linkTo, onChanged, variant = 'card' }) {
  const now = new Date();
  const [busy, setBusy] = useState(false);

  const { data, loading, refetch } = useFetch(
    () => api.getMyAttendance({ month: now.getMonth() + 1, year: now.getFullYear() }),
    [],
  );
  const today = data?.today;

  const act = async (fn, label) => {
    setBusy(true);
    try {
      const res = await fn();
      toast.success(`${label} at ${res.data?.[label === 'Clocked in' ? 'checkIn' : 'checkOut']}`);
      refetch();
      onChanged?.();
    } catch (err) { toast.error(err?.message || 'Failed'); }
    finally { setBusy(false); }
  };

  const strip = variant === 'strip';

  if (loading) {
    return strip ? (
      <div className="clockstrip clockstrip--loading"><Spinner size="sm" /></div>
    ) : (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'center', padding: 20 }}><Spinner /></div>
      </div>
    );
  }
  if (!today) return null;

  const dateLine = now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const statusText = today.onLeave
    ? <>You are on approved leave today ({today.leaveLabel}) — no need to clock in.</>
    : today.clockedIn
      ? <>Clocked in at <strong>{today.checkIn}</strong>{today.checkOut && <> · out at <strong>{today.checkOut}</strong></>}</>
      : 'Not clocked in yet — unmarked days count as absent.';

  const actions = !today.onLeave && (
    !today.clockedIn
      ? (
        <Button loading={busy} onClick={() => act(api.clockIn, 'Clocked in')}>
          <Icon name="logIn" size={17} /> Clock In
        </Button>
      )
      : (
        <Button variant={today.clockedOut ? 'secondary' : 'primary'} loading={busy}
          onClick={() => act(api.clockOut, 'Clocked out')}>
          <Icon name={today.clockedOut ? 'refresh' : 'logOut'} size={17} />
          {today.clockedOut ? 'Update Clock Out' : 'Clock Out'}
        </Button>
      )
  );

  // ── Strip: the band that sits inside the dashboard's greeting panel ────────
  if (strip) {
    const state = today.onLeave ? 'leave' : today.clockedIn ? 'in' : 'out';
    const chip  = { leave: 'On Leave', in: 'Clocked In', out: 'Not Clocked In' }[state];

    return (
      <div className="clockstrip">
        <div className="clockstrip__mark"><Icon name="checkCircle" size={22} /></div>

        <div className="clockstrip__when">
          <div className="clockstrip__date">{dateLine}</div>
          <div className="clockstrip__note">{statusText}</div>
        </div>

        <div className="clockstrip__status">
          <span className="clockstrip__label">Your attendance status</span>
          <span className={`clockstrip__chip clockstrip__chip--${state}`}>
            <Icon name={state === 'out' ? 'alert' : 'checkCircle'} size={14} />
            {chip}
          </span>
        </div>

        <div className="clockstrip__actions">
          {actions}
          {linkTo && (
            <Link to={linkTo} className="clockstrip__link">
              Calendar <Icon name="chevronRight" size={14} />
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ── Card: the original standalone panel ───────────────────────────────────
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ color: 'var(--primary)', display: 'flex' }}><Icon name="clock" size={30} /></div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 700 }}>
            {now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
          <div style={{ fontSize: '.85rem', color: 'var(--text-muted)' }}>{statusText}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {actions}
          {linkTo && (
            <Link to={linkTo} style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>Calendar →</Link>
          )}
        </div>
      </div>
    </div>
  );
}
