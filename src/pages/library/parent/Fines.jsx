/**
 * A parent settling a child's library fines.
 *
 * The screen itself is FinePayments — the same component the child sees on
 * their own My Fines tab, pointed at one child. The server decides whose fines
 * a caller may see and pay, so `forUserId` is a request, not a claim, and a
 * parent asking for somebody else's child gets nothing back.
 *
 * Which child is on screen comes from `?child=` in the URL, shared with the
 * Books tab so switching tabs does not switch child.
 */
import React, { useMemo } from 'react';
import useFetch from '../../../hooks/useFetch';
import { useAuth } from '../../../contexts/AuthContext';
import { getParentOverview } from '../../../api/library.api';
import { Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import FinePayments from '../../../components/library/FinePayments';
import { useChild, ChildSwitch, NoChildren, whereOf } from './parts';

/** A receipt and a coin. Ornament only — no data, no links. */
const ReceiptArt = () => (
  <svg className="libpl-art" viewBox="0 0 220 104" aria-hidden="true" focusable="false">
    <rect x="20" y="72" width="94" height="14" rx="3" fill="#f472b6" />
    <rect x="26" y="57" width="82" height="14" rx="3" fill="#60a5fa" />
    <rect x="32" y="42" width="70" height="14" rx="3" fill="#6366f1" />
    <rect x="30" y="78" width="22" height="4" rx="2" fill="#fff" opacity=".5" />

    <rect x="130" y="20" width="62" height="70" rx="5" fill="#fff" stroke="currentColor"
      strokeOpacity=".3" strokeWidth="2" />
    <rect x="141" y="33" width="40" height="4" rx="2" fill="currentColor" opacity=".25" />
    <rect x="141" y="44" width="34" height="4" rx="2" fill="currentColor" opacity=".22" />
    <rect x="141" y="55" width="28" height="4" rx="2" fill="currentColor" opacity=".22" />
    <rect x="141" y="66" width="36" height="4" rx="2" fill="currentColor" opacity=".22" />
    <circle cx="188" cy="78" r="15" fill="#fbbf24" />
    <text x="183" y="84" fill="#78350f" fontSize="15" fontWeight="800">₹</text>
    <rect x="10" y="93" width="200" height="5" rx="2.5" fill="currentColor" opacity=".12" />
  </svg>
);

export default function ParentLibraryFines() {
  const { user } = useAuth();
  const { data, loading } = useFetch(getParentOverview);
  const children = useMemo(() => data?.children || [], [data]);
  const { child, pick } = useChild(children);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page libplpg">
      <header className="liblg-hero">
        <span className="liblg-ico liblg-ico--xl liblg-t--violet"><Icon name="wallet" size={28} /></span>
        <div className="liblg-hero__body">
          <h1>Library Fines</h1>
          <p>Settle your children&apos;s library fines and keep every receipt in one place.</p>
        </div>
        <div className="liblg-hero__art">
          <ReceiptArt />
          <blockquote className="liblg-quote">
            &ldquo;Take care of books, they take care of your future.&rdquo;
          </blockquote>
        </div>
      </header>

      {!children.length ? <NoChildren /> : (
        <>
          <ChildSwitch children={children} child={child} onPick={pick} />

          {/* Keyed on the child so switching remounts the block and reloads
              that child's fines, rather than showing the previous one's. */}
          <FinePayments key={child._id} forUserId={child._id} payerName={user?.name}
            title={`Outstanding — ${child.name}`} />

          <p className="libpl-note">
            <Icon name="user" size={15} />
            Showing {child.name} · {whereOf(child)}
            {children.length > 1 && ' — use the switch above for your other child.'}
          </p>
        </>
      )}
    </div>
  );
}
