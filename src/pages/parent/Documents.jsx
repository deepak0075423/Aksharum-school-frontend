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
import React, { useMemo, useState } from 'react';
import useFetch from '../../hooks/useFetch';
import { getDocuments } from '../../api/parent.api';
import { Alert, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import {
  ViewerHero, ViewerStats, ViewerStat, ViewerTabs, ViewerTools, SearchField, Picker,
  ChildSwitch, DocList, DocDrawer, NothingHere, StatePill, Avatar, Field,
  TABS, SORTS, applyFilters, fmtDate, fileUrl, STATES,
} from '../documents/viewerParts';

export default function ParentDocuments() {
  const [year, setYear] = useState('');
  const { data, meta, loading, error } = useFetch(
    () => getDocuments(year ? { year } : undefined), [year],
  );

  const all      = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const children = useMemo(() => meta?.children || [], [meta]);
  const perChild = meta?.perChild || {};
  const years    = meta?.years || [];

  // '' is every child at once.
  const [who,      setWho]      = useState('');
  const [tab,      setTab]      = useState('all');
  const [category, setCategory] = useState('');
  const [search,   setSearch]   = useState('');
  const [sort,     setSort]     = useState('newest');
  const [state,    setState]    = useState('');
  const [open,     setOpen]     = useState(null);

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
  const scoped = useMemo(() => {
    const list = who ? all.filter((d) => d.forChildren.includes(who)) : all;
    return list.map((d) => (who ? { ...d, state: d.perChild?.[who]?.state ?? null } : d));
  }, [all, who]);

  const counts = who ? (perChild[who] || {}) : (meta?.counts || {});

  const shown = useMemo(
    () => applyFilters(scoped, { tab, category, search, sort, state }),
    [scoped, tab, category, search, sort, state],
  );

  const filtered = !!(category || search || state);
  const clear = () => { setCategory(''); setSearch(''); setState(''); setTab('all'); };
  const pickState = (v) => { setState(state === v ? '' : v); setTab(state === v ? 'all' : 'assignments'); };

  const live = open ? scoped.find((d) => d._id === open._id) || open : null;
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

  if (loading && !data) return <div className="loading-page"><Spinner /></div>;

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
        right={years.length > 1 && (
          <Picker value={year} onChange={setYear} all="This year" label="Academic year"
            options={[{ value: 'all', label: 'All years' },
              ...years.map((y) => ({ value: y._id, label: y.name }))]} />
        )}
      />

      {error && <Alert variant="danger">{error}</Alert>}

      {!children.length && (
        <Alert variant="info">
          No child is linked to this account yet, so there is nothing to show.
          Ask the school office to link your children.
        </Alert>
      )}

      <ChildSwitch children={children} value={who} onChange={(v) => { setWho(v); setState(''); setOpen(null); }}
        allCount={all.length} countFor={(id) => perChild[id]?.all ?? 0} />

      {children.length === 1 && children[0].className ? (
        <p className="dvnote">
          <Icon name="user" size={14} /> {children[0].name} · {children[0].className}
        </p>
      ) : null}

      <ViewerStats>
        <ViewerStat icon="files" tone="indigo" value={counts.all} label="Shared"
          caption={forChild ? `With ${forChild.name}` : 'With your children'} />
        <ViewerStat icon="clipboard" tone="purple" value={counts.assignments} label="Assignments"
          caption="Work that was set" />
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
          <Picker value={sort} onChange={setSort} options={SORTS} label="Sort documents" />
        </ViewerTools>

        <DocList
          docs={shown} loading={loading}
          onOpen={setOpen}
          empty={<NothingHere filtered={filtered} onClear={clear} />}
          badges={(d) => (who ? <StatePill state={d.state} /> : childStrip(d))}
        />
      </section>

      <DocDrawer
        doc={live}
        onClose={() => setOpen(null)}
        extra={live?.isAssignment && (
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
        foot={live?.files?.[0] && (
          <a className="btn btn-secondary" href={fileUrl(live.files[0].filePath)} target="_blank" rel="noreferrer">
            <Icon name="download" size={15} /> Open {live.fileCount > 1 ? 'first file' : 'the file'}
          </a>
        )}
      />
    </div>
  );
}
