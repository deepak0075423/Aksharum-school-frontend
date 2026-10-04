/**
 * My ID Card — for a student, and for a teacher or any other employee
 * (Oct 2026). The card in force hangs in the showcase; every earlier card is
 * below it, a student's by academic year. GET /{student|teacher}/id-cards.
 */
import React, { useState } from 'react';
import { getMyIdCards } from '../../../api/idcards.api';
import CardViewer from '../CardViewer';
import { Page, PageHead, Spin, Empty, Btn, useLoad } from '../icUI';
import { Hero, NoCard, History, useCardFiles } from './cardParts';

export default function MyIdCard({ role = 'student' }) {
  const { data, loading, error, reload } = useLoad(() => getMyIdCards(role), role);
  const files = useCardFiles(role);
  const [view, setView] = useState(null);            // { index, present }

  const cards = data?.cards || [];
  const current = data?.current || null;
  const open = (card, present = false) => setView({ index: Math.max(0, cards.findIndex((c) => c._id === card._id)), present });

  return (
    <Page className="icm">
      <PageHead
        title="My ID Card"
        subtitle={role === 'student'
          ? `Your school identity card${current?.academicYear?.yearName ? ` for ${current.academicYear.yearName}` : ''}. Show it at the gate, download it or print it.`
          : 'Your staff identity card. It stays with you from year to year — show it, download it or print it.'}
      />
      {loading && !data ? <Spin /> : error && !data ? (
        <Empty title="Your ID card could not be loaded" action={<Btn kind="primary" icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty>
      ) : (
        <>
          {current
            ? <Hero card={current} files={files} upcoming={data.upcoming} onOpen={(c) => open(c)} onPresent={(c) => open(c, true)} />
            : <NoCard pending={data?.pending} kind={role === 'student' ? 'student' : 'staff'} />}
          <div className="icm-below">
            <History cards={cards} currentId={current?._id} onOpen={(c) => open(c)} />
          </div>
        </>
      )}
      <CardViewer
        open={!!view}
        onClose={() => setView(null)}
        cards={cards}
        index={view?.index || 0}
        onDownload={files.download}
        onPrint={files.print}
        present
        startPresenting={view?.present}
        school={data?.school}
      />
    </Page>
  );
}
