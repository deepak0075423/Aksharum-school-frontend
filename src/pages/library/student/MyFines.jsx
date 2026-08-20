import React from 'react';
import { useAuth } from '../../../contexts/AuthContext';
import { PageHeader } from '../../../components/ui/index';
import FinePayments from '../../../components/library/FinePayments';

// A member's own fines. Everything about paying one, and every receipt that
// came out of it, lives in FinePayments — the parent screen shows the same
// component for a child, so the two can never drift apart.

export default function LibraryMyFines() {
  const { user } = useAuth();

  return (
    <div className="page">
      <PageHeader title="My Library Fines" subtitle="What you owe, how to pay, and your receipts" />
      <FinePayments payerName={user?.name} title="Outstanding fines" />
    </div>
  );
}
