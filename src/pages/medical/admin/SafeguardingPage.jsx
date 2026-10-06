/** Safeguarding for the medical staff and the school admins (the shared screen, pages/medical/Safeguarding). */
import React from 'react';
import { Page, PageHead } from '../mdUI';
import Safeguarding from '../Safeguarding';

export default function MedicalSafeguardingPage() {
  return (
    <Page>
      <PageHead icon="shieldCheck" tone="red" title="Safeguarding" subtitle="Raise a concern about a child's welfare. Only the designated safeguarding leads read the log — nothing of it appears in the medical record, the lists or the notifications." />
      <Safeguarding role="staff" />
    </Page>
  );
}
