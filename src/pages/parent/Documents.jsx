/**
 * Parent → Documents.
 *
 * A parent can have more than one child, and their shelves are not the same: a
 * school notice reaches both, an assignment set for Class 9 - A reaches one. So
 * the page is told per child — a switch across the top picks whose documents
 * are on screen, and with "All children" showing, every card says whose it is
 * and where each of them stands on it.
 *
 * That distinction only exists because the endpoint now returns it. It used to
 * read `parent.children[0]` and nothing else, so a second child's homework was
 * invisible and nothing on the page said a second child existed.
 *
 * Read-only by design: handing work in is the student's own account. This page
 * answers "what has my child been given, and have they done it".
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  getDocuments, markDocumentRead, markDocumentsRead, getDocumentComments,
} from '../../api/parent.api';
import { Alert, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  ViewerHero, ViewerStats, ViewerStat, ViewerTabs, ViewerTools, SearchField, Picker, YearPicker,
  ChildSwitch, ReaderList, useReaderView, DocDrawer, NothingHere, StatePill, Avatar, Field, UnreadNote, OpenFile, DocComments,
  ReaderPicks, tickProps,
  TABS, sortsFor, sortOn, useShelf, useReadMarks, fmtDate, STATES,
} from '../documents/viewerParts';
import { ResetFilters, ViewSwitch, DocFoot } from '../admin/documentParts';
import useCardPaging from '../../hooks/useCardPaging';
import { useSelection } from '../admin/listParts';

export default function ParentDocuments() {
  const [year, setYear] = useState('');
  // '' is every child at once.
  const [who,      setWho]      = useState('');
  const [tab,      setTab]      = useState('all');
  const [category, setCategory] = useState('');
  const [search,   setSearch]   = useState('');
  const [sort,     setSort]     = useState('newest');
  const [state,    setState]    = useState('');
  const [open,     setOpen]     = useState(null);
  const [limit,    setLimit]    = useState(10);
  // List or Card on a laptop, cards only on a phone; a page of cards is whole rows.
  const rv     = useReaderView('parent.documents.view');
  const paging = useCardPaging({ cards: rv.asCards });

  // A notification names one document (`?focus=`); the server finds it
  // wherever it is filed.
  const [urlParams] = useSearchParams();
  const wanted   = useRef(urlParams.get('focus'));
  const focusRef = useRef(wanted.current);

  // The server narrows, counts and pages — whose shelf included.
  const params = useMemo(
    () => ({ year, child: who, tab: tab === 'all' ? '' : tab, category, search, sort: sortOn(tab, sort), state }),
    [year, who, tab, category, search, sort, state],
  );
  const { docs: loaded, meta, loading, error, page, pages, total, setPage } = useShelf(getDocuments, params, { focusRef, limit });

  // The same list, with what has been opened on this visit already marked read.
  const { docs: all, read, readAll, stillUnread } = useReadMarks(loaded, { one: markDocumentRead, many: markDocumentsRead });
  const children = useMemo(() => meta?.children || [], [meta]);
  const perChild = meta?.perChild || {};
  const years    = meta?.years || [];
  const unread   = stillUnread(meta?.unreadIds);

  const nameOf = useMemo(
    () => Object.fromEntries(children.map((c) => [String(c._id), c.name])),
    [children],
  );

  /**
   * The shelf for whoever is selected.
   *
   * With one child picked the card carries that child's own state, so the
   * status pill and the "still to do" tile mean the same thing. With all of
   * them showing there is no single state — the card lists them instead.
   */
  const scoped = useMemo(
    () => all.map((d) => (who ? { ...d, state: d.perChild?.[who]?.state ?? null } : d)),
    [all, who],
  );

  const counts = who ? (perChild[who] || {}) : (meta?.counts || {});
  const shown  = scoped;

  const filtered = !!(category || search || state);
  const clear = () => { setCategory(''); setSearch(''); setState(''); setTab('all'); };

  // Ticked to act on together (Nov 24 2026) — mark read, save their files.
  // Another child, page or filter starts with nothing ticked.
  const sel = useSelection(shown, `${who}|${tab}|${category}|${search}|${sort}|${state}|${year}|${page}|${limit}`);
  const pickState = (v) => { setState(state === v ? '' : v); setTab(state === v ? 'all' : 'assignments'); };

  const live = open
    ? scoped.find((d) => d._id === open._id)
      || (meta?.focused && String(meta.focused._id) === String(open._id) ? meta.focused : open)
    : null;

  // The notified document is opened, not just flagged.
  useEffect(() => {
    if (!wanted.current || !meta) return;
    const hit = meta.focused;
    wanted.current = null;
    if (hit) { setOpen(hit); read(hit); }
    else { focusRef.current = null; toast.error('That document is no longer on the shelf'); }
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps
  const forChild = who ? children.find((c) => String(c._id) === who) : null;

  /**
   * Whose it is, and how each of them is doing.
   *
   * Only drawn when the document does NOT reach every child, or when there is
   * something per child to say about it. A school notice that went to both of
   * them needs no chips saying so — the switch above already answers that, and
   * a chip on every row is noise the eye learns to skip past.
   */
  const childStrip = (doc) => {
    if (who || children.length < 2) return null;
    const forAll = doc.forChildren.length === children.length;
    const states = doc.forChildren.some((id) => doc.perChild?.[id]?.state);
    if (forAll && !states) return null;
    return (
      <span className="dvkids">
        {doc.forChildren.map((id) => {
          const st = doc.perChild?.[id]?.state;
          return (
            <span key={id} className={`dvkid${st ? ` dvkid--${STATES[st]?.tone}` : ''}`}
              title={st ? `${nameOf[id]} — ${STATES[st].label}` : nameOf[id]}>
              {nameOf[id]?.split(' ')[0] || 'Child'}
              {st ? <em>{STATES[st].label}</em> : null}
            </span>
          );
        })}
      </span>
    );
  };

  if (loading && !meta) return <div className="loading-page"><Spinner /></div>;

  return (
    <div className="page dvpg">
      <ViewerHero
        icon="files"
        title="Documents & Assignments"
        subtitle={forChild
          ? `What ${forChild.name}'s school and class have shared.`
          : children.length > 1
            ? 'What the school has shared — for each of your children.'
            : 'What your child’s school and class have shared.'}
        right={years.length > 1 && <YearPicker years={years} value={year} onChange={setYear} />}
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {!children.length && (
        <Alert variant="info">
          No child is linked to this account yet, so there is nothing to show.
          Ask the school office to link your children.
        </Alert>
      )}

      <ChildSwitch children={children} value={who} onChange={(v) => { setWho(v); setState(''); setOpen(null); }}
        allCount={meta?.counts?.all ?? 0} countFor={(id) => perChild[id]?.all ?? 0} />

      {children.length === 1 && children[0].className ? (
        <p className="dvnote">
          <Icon name="user" size={14} /> {children[0].name} · {children[0].className}
        </p>
      ) : null}

      <ViewerStats>
        {/* Both open what they count (Nov 23 2026): everything, and every assignment. */}
        <ViewerStat icon="files" tone="indigo" value={counts.all} label="Shared"
          caption={forChild ? `With ${forChild.name}` : 'With your children'}
          on={!state && tab === 'all'}
          onClick={() => { setState(''); setCategory(''); setSearch(''); setTab('all'); }} />
        <ViewerStat icon="clipboard" tone="purple" value={counts.assignments} label="Assignments"
          caption="Work that was set" on={!state && tab === 'assignments'}
          onClick={() => { setState(''); setCategory(''); setSearch(''); setTab(!state && tab === 'assignments' ? 'all' : 'assignments'); }} />
        <ViewerStat icon="clock" tone="amber" value={counts.pending} label="Still to do"
          caption="Not handed in yet" on={state === 'pending'} onClick={() => pickState('pending')} />
        <ViewerStat icon="alert" tone="red" value={counts.missed} label="Missed"
          caption="Past their due date" on={state === 'missed'} onClick={() => pickState('missed')} />
      </ViewerStats>

      <section className="card dvpanel">
        <ViewerTabs tabs={TABS} value={tab} counts={counts}
          onChange={(v) => { setTab(v); setState(''); }} />

        <ViewerTools>
          <SearchField value={search} onChange={setSearch} />
          <Picker value={category} onChange={setCategory} all="All categories"
            options={meta?.categories || []} label="Filter by category" />
          <span className="dvtools__sep" />
          <UnreadNote count={unread.length} onClear={() => readAll(unread)} />
          <Picker value={sortOn(tab, sort)} onChange={setSort} options={sortsFor(tab)} label="Sort documents"
            on={sortOn(tab, sort) !== 'newest'} />
          <ResetFilters on={!!(search || category || state || sort !== 'newest')}
            onClick={() => { setSearch(''); setCategory(''); setState(''); setSort('newest'); }} />
          {!rv.cardsOnly && <ViewSwitch value={rv.view} onChange={rv.setView} />}
        </ViewerTools>

        <ReaderPicks sel={sel} total={shown.length} read={readAll} />

        <ReaderList asCards={rv.asCards} gridRef={paging.gridRef}
          docs={shown} loading={loading} {...tickProps(sel)}
          onOpen={(d) => { focusRef.current = d._id; setOpen(d); read(d); }}
          empty={<NothingHere filtered={filtered} onClear={clear} />}
          // One child, or one picked: that child's own state ("Submitted"),
          // which the row now carries. A parent of one child never picks one,
          // so their cards used to show only the due date.
          badges={(d) => (who || children.length < 2 ? (d.state ? <StatePill state={d.state} /> : null) : childStrip(d))}
        />

        <DocFoot page={page} pages={pages} total={total} limit={limit} count={shown.length}
          onPage={setPage} sizes={paging.sizes} onLimit={(n) => { setLimit(n); setPage(1); }} />
      </section>

      <DocDrawer
        doc={live}
        onClose={() => { focusRef.current = null; setOpen(null); }}
        extra={live && (
          <>
          {live.isAssignment && (
          <section className="dvdrawer__sec">
            <h4>{who ? 'How it is going' : 'Each of your children'}</h4>
            <ul className="dvkidlist">
              {live.forChildren.map((id) => {
                const c  = children.find((x) => String(x._id) === id);
                const st = live.perChild?.[id] || {};
                return (
                  <li key={id}>
                    <Avatar name={c?.name} src={c?.photo} size={32} />
                    <div>
                      <b>{c?.name || 'Child'}</b>
                      <small>{c?.className}</small>
                    </div>
                    <div className="dvkidlist__end">
                      <StatePill state={st.state} />
                      {st.marks != null && (
                        <span className="dvmarks">{st.marks}{live.totalMarks ? ` / ${live.totalMarks}` : ''}</span>
                      )}
                      {st.submittedAt && <small>{fmtDate(st.submittedAt)}</small>}
                    </div>
                  </li>
                );
              })}
            </ul>
            {live.forChildren.some((id) => live.perChild?.[id]?.feedback) && (
              <div className="dvfeedback">
                <h5><Icon name="chat" size={14} /> Teacher feedback</h5>
                {live.forChildren.filter((id) => live.perChild?.[id]?.feedback).map((id) => (
                  <p key={id}><b>{nameOf[id]}:</b> {live.perChild[id].feedback}</p>
                ))}
              </div>
            )}
            <p className="dvnote dvnote--calm">
              <Icon name="info" size={14} />
              Work is handed in from your child’s own account.
            </p>
          </section>
          )}

          {/* Read only (Nov 2026): a parent reads the discussion and writes
              nothing in it — no box, no reply, no edit. The server has no
              route for a parent to write one either. */}
          <DocComments docId={live._id} load={getDocumentComments} />
          </>
        )}
        foot={live?.files?.[0] && <OpenFile files={live.files} caption={live.title} />}
      />
    </div>
  );
}
