/**
 * ID Cards for a parent (Oct 2026): their own parent card, and each child's
 * — the card in force and every year before it. A child at another school
 * the parent also belongs to is shown with that school named.
 * GET /parent/id-cards.
 */
import React, { useState } from 'react';
import { getMyIdCards } from '../../../api/idcards.api';
import CardViewer, { cardWords } from '../CardViewer';
import IdCardFace from '../IdCardFace';
import { Page, PageHead, Spin, Empty, Btn, Ico, Avatar, StatusBadge, Panel, useLoad } from '../icUI';
import { fmtDay, plural } from '../icMeta';
import { Hero, NoCard, useCardFiles } from './cardParts';

function ChildPanel({ child, onOpen }) {
  const cur = child.current;
  const where = [child.className, child.sectionName ? `Section ${child.sectionName}` : ''].filter(Boolean).join(' — ') || 'No class yet';
  return (
    <article className="icf-child">
      <header className="icf-child__head">
        <Avatar name={child.name} photo={cur?.snapshot?.photo || child.photo} size={46} tone="blue" />
        <div className="icf-child__who">
          <strong>{child.name}</strong>
          <span>{where}</span>
          {child.otherSchool ? <span className="icf-child__school"><Ico name="school" size={12} />{child.schoolName}</span> : null}
        </div>
        {cur ? <StatusBadge status={cur.status} /> : null}
      </header>
      {!child.idCardOn ? (
        <p className="icf-child__off">{child.schoolName} does not issue ID cards through Aksharum.</p>
      ) : cur ? (
        <div className="icf-child__body">
          <button type="button" className="icf-child__card" onClick={() => onOpen(child, cur)} aria-label={`Open ${child.name}'s ID card`}>
            <IdCardFace card={cur} side="front" />
          </button>
          <div className="icf-child__facts">
            <div className={`icf-child__state${cur.status === 'active' ? '' : ' is-void'}`}><Ico name={cur.status === 'active' ? 'checkDisc' : 'crossDisc'} size={15} />{cardWords(cur)}</div>
            <dl>
              <div><dt>Academic year</dt><dd>{cur.academicYear?.yearName || '—'}</dd></div>
              <div><dt>Card number</dt><dd>{cur.number}</dd></div>
              <div><dt>Valid till</dt><dd>{fmtDay(cur.validUntil || cur.snapshot?.yearEnd) || '—'}</dd></div>
            </dl>
            <div className="icf-child__acts">
              <Btn kind="primary" size="sm" icon="eye" onClick={() => onOpen(child, cur)}>View ID Card</Btn>
              {child.cards.length > 1 ? <Btn size="sm" icon="history" onClick={() => onOpen(child, child.cards[child.cards.length - 1])}>History · {child.cards.length}</Btn> : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="icf-child__pending">
          <Ico name="hourglass" size={18} />
          <div>
            <b>{child.pending ? `The ${child.pending.yearName} card has not been issued yet.` : 'No ID card has been issued yet.'}</b>
            <span>You will be notified when the school office issues it.</span>
          </div>
          {child.cards.length ? <Btn size="sm" icon="history" onClick={() => onOpen(child, child.cards[0])}>Earlier cards · {child.cards.length}</Btn> : null}
        </div>
      )}
      {child.upcoming ? (
        <button type="button" className="icf-child__next" onClick={() => onOpen(child, child.upcoming)}>
          <Ico name="sparkle" size={14} />{child.upcoming.academicYear?.yearName} card ready — in force from {fmtDay(child.upcoming.validFrom)}
        </button>
      ) : null}
    </article>
  );
}

export default function FamilyIdCards() {
  const { data, loading, error, reload } = useLoad(() => getMyIdCards('parent'), 'parent');
  const files = useCardFiles('parent');
  const [view, setView] = useState(null);   // { cards, index, title, present }

  const mine = data?.mine || { cards: [] };
  const children = data?.children || [];
  const openMine = (card, present = false) => setView({ cards: mine.cards, index: Math.max(0, mine.cards.findIndex((c) => c._id === card._id)), title: card.snapshot?.name, present });
  const openChild = (child, card) => setView({ cards: child.cards, index: Math.max(0, child.cards.findIndex((c) => c._id === card._id)), title: child.name });

  return (
    <Page className="icm icf">
      <PageHead title="ID Cards" subtitle="Your parent ID card, and the ID cards of your children — this year's and every year before." />
      {loading && !data ? <Spin /> : error && !data ? (
        <Empty title="ID cards could not be loaded" action={<Btn kind="primary" icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty>
      ) : (
        <>
          <h2 className="icf-h2"><Ico name="user" size={18} />My ID Card</h2>
          {mine.current
            ? <Hero card={mine.current} files={files} compact onOpen={(c) => openMine(c)} onPresent={(c) => openMine(c, true)} />
            : <NoCard kind="parent" />}

          <h2 className="icf-h2"><Ico name="users" size={18} />My Children&rsquo;s ID Cards <em>{plural(children.length, 'child', 'children')}</em></h2>
          {children.length ? (
            <div className="icf-children">
              {children.map((c) => <ChildPanel key={c._id} child={c} onOpen={openChild} />)}
            </div>
          ) : (
            <Panel><Empty compact title="No children linked to your account">Ask the school office to link your children to your parent account.</Empty></Panel>
          )}
        </>
      )}
      <CardViewer
        open={!!view}
        onClose={() => setView(null)}
        cards={view?.cards || []}
        index={view?.index || 0}
        title={view?.title}
        onDownload={files.download}
        onPrint={files.print}
        present
        startPresenting={view?.present}
        school={data?.school}
      />
    </Page>
  );
}
