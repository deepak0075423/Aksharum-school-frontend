/**
 * A member's own library fines.
 *
 * Everything about paying one, and every receipt that came out of it, lives in
 * FinePayments — the parent screen shows the same component for a child, so the
 * two can never drift apart. This page is the frame around it.
 */
import React from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import Icon from '../../../components/ui/icons';
import FinePayments from '../../../components/library/FinePayments';

/** Books, a receipt and a coin. Ornament only — no data, no links. */
const FinesArt = () => (
  <svg className="libfn-art" viewBox="0 0 244 104" aria-hidden="true" focusable="false">
    <path d="M26 64c-11-2-16-10-14-21 10-1 16 7 14 21Z" fill="#34d399" />
    <path d="M28 64c9-3 13-12 9-22-9 2-13 11-9 22Z" fill="#10b981" />
    <path d="M27 64V48" stroke="#047857" strokeWidth="1.7" strokeLinecap="round" />
    <path d="M16 66h22l-3 26H19l-3-26Z" fill="#a5b4fc" />

    <rect x="58" y="76" width="104" height="14" rx="3" fill="#f472b6" />
    <rect x="64" y="61" width="92"  height="14" rx="3" fill="#fbbf24" />
    <rect x="70" y="46" width="80"  height="14" rx="3" fill="#60a5fa" />
    <rect x="76" y="31" width="68"  height="14" rx="3" fill="#6366f1" />
    <rect x="68" y="82" width="26" height="4" rx="2" fill="#fff" opacity=".5" />
    <rect x="74" y="67" width="22" height="4" rx="2" fill="#fff" opacity=".5" />

    <rect x="166" y="24" width="62" height="68" rx="5" fill="#fff" stroke="currentColor"
      strokeOpacity=".3" strokeWidth="2" />
    <text x="177" y="45" fill="currentColor" fontSize="11" fontWeight="700" opacity=".7">LIBRARY</text>
    <rect x="177" y="54" width="40" height="4" rx="2" fill="currentColor" opacity=".22" />
    <rect x="177" y="63" width="34" height="4" rx="2" fill="currentColor" opacity=".22" />
    <rect x="177" y="72" width="28" height="4" rx="2" fill="currentColor" opacity=".22" />
    <circle cx="222" cy="80" r="15" fill="#fbbf24" />
    <text x="217" y="86" fill="#78350f" fontSize="15" fontWeight="800">₹</text>

    <rect x="10" y="95" width="224" height="5" rx="2.5" fill="currentColor" opacity=".12" />
  </svg>
);

export default function LibraryMyFines() {
  const { user } = useAuth();

  return (
    <div className="page libfnpg">
      <header className="liblg-hero">
        <span className="liblg-ico liblg-ico--xl liblg-t--violet"><Icon name="wallet" size={28} /></span>
        <div className="liblg-hero__body">
          <h1>My Fines</h1>
          <p>View your outstanding fines, payment history and receipts.</p>
        </div>
        <div className="liblg-hero__art">
          <FinesArt />
          <blockquote className="liblg-quote">
            &ldquo;Take care of books, they take care of your future.&rdquo;
          </blockquote>
        </div>
      </header>

      <FinePayments payerName={user?.name} title="Outstanding Fines" />
    </div>
  );
}
