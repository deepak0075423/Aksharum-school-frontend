/**
 * Student / Teacher / Staff / Parent ID Cards (Oct 2026) — one screen, four
 * kinds. A list of PEOPLE, each with where their card stands: a student with
 * no card yet is a Pending row, a card whose holder's details changed after it
 * was printed is flagged, a card of someone who left says so.
 *
 * Students carry the academic year: the current year by default, earlier
 * years as read-only history ("Previous ID Cards"), a coming year to prepare
 * ahead. Generate Cards covers one student, ticked rows, chosen classes or
 * sections, or everyone (GenerateDialog). Ticked rows can be printed as one
 * PDF — A4 sheets or card-printer pages (PrintDialog).
 *
 * GET /admin/id-cards/list — rows, tab counts and filter options in one.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { getIdCardList, downloadIdCardAdmin } from '../../../api/idcards.api';
import {
  Page, PageHead, Btn, IconBtn, Kebab, LineTabs, SearchBox, Select, Check, Person, StatusBadge,
  Pager, Empty, Spin, Note, Ico, useLoad, useDebounced,
} from '../icUI';
import { KIND, count, errorText, fmtDate, pdfName, plural, saveBlob } from '../icMeta';
import { useCardActions, PrintDialog } from './dialogs';
import GenerateDialog from './GenerateDialog';
import CardDrawer from './CardDrawer';

const TAB_LABEL = {
  all: 'All', pending: 'Pending', active: 'Active', generated: 'Generated', blocked: 'Blocked',
  lost: 'Lost / Damaged', attention: 'Needs attention', unprinted: 'Not printed', expired: 'Expired', cancelled: 'Replaced / Cancelled',
};
const SORTS = {
  student: [{ value: 'class', label: 'Class & roll' }, { value: 'name', label: 'Name' }, { value: 'issued', label: 'Recently issued' }],
  other: [{ value: 'name', label: 'Name' }, { value: 'issued', label: 'Recently issued' }],
};

const SUBTITLE = {
  student: 'One card per student per academic year. Earlier years stay on record exactly as they were issued.',
  teacher: 'One card per teacher, kept from year to year — reissued only when it is lost, damaged or its details change.',
  staff: 'One card per non-teaching employee and administrator, kept from year to year.',
  parent: 'One card per parent, kept from year to year. It names the children the parent may collect.',
};

/** A row's card as the dialogs want it. */
const cardOf = (row, kind) => (row.card ? { ...row.card, kind, name: row.name, snapshot: { name: row.name }, academicYear: { yearName: row.card.yearName } } : null);

function Flags({ row }) {
  const out = [];
  if (row.changes?.length) out.push(<span key="c" className="ic-flag ic-flag--warn" title={row.changes.map((c) => `${c.label}: ${c.was || '—'} → ${c.now || '—'}`).join('\n')}><Ico name="regen" size={12} />{row.changes.some((c) => c.key === 'kind') ? 'Wrong card type' : 'Details changed'}</span>);
  if (row.leftWithCard) out.push(<span key="l" className="ic-flag ic-flag--bad"><Ico name="logOut" size={12} />Account off</span>);
  if (!row.inScope && !row.leftWithCard && row.card && !row.removed) out.push(<span key="o" className="ic-flag">Not in this list any more</span>);
  if (row.state === 'pending' && row.noPhoto) out.push(<span key="p" className="ic-flag ic-flag--warn"><Ico name="user" size={12} />No photo</span>);
  if ((row.state === 'lost' || row.state === 'damaged') && !row.card?.replacedBy) out.push(<span key="r" className="ic-flag ic-flag--warn">Not replaced</span>);
  return out.length ? <span className="ic-flags">{out}</span> : null;
}

export default function CardList({ kind = 'student' }) {
  const k = KIND[kind];
  const student = kind === 'student';
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  const dq = useDebounced(q, 300);
  const [tab, setTab] = useState(params.get('tab') || 'all');
  const [year, setYear] = useState(params.get('year') || '');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [sort, setSort] = useState(student ? 'class' : 'name');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sel, setSel] = useState(new Map());            // holderId → row
  const [drawer, setDrawer] = useState(null);           // { cardId, holderId, kind, name }
  const [version, setVersion] = useState(0);
  const [gen, setGen] = useState(null);                 // { selected }
  const [print, setPrint] = useState(null);             // [cards]

  // A different kind of card is a different list.
  useEffect(() => { setTab(params.get('tab') || 'all'); setQ(''); setClassId(''); setSectionId(''); setSel(new Map()); setPage(1); setSort(student ? 'class' : 'name'); setDrawer(null); }, [kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = useMemo(() => ({ kind, year: year || undefined, tab, q: dq || undefined, classId: classId || undefined, sectionId: sectionId || undefined, sort, page, limit, v: version }),
    [kind, year, tab, dq, classId, sectionId, sort, page, limit, version]);
  const { data, loading, error, reload } = useLoad(({ v, ...p }) => getIdCardList(p), query);
  const refresh = useCallback(() => setVersion((n) => n + 1), []);

  // Keep the year and tab in the address, so a link (or a refresh) lands back here.
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (tab && tab !== 'all') next.set('tab', tab); else next.delete('tab');
    if (student && year) next.set('year', year); else next.delete('year');
    next.delete('q');
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [tab, year]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1); }, [dq, tab, classId, sectionId, year, sort, kind]);
  useEffect(() => { setSel(new Map()); }, [tab, year, kind]);

  const { act, dialogs } = useCardActions(() => { refresh(); });

  const rows = data?.rows || [];
  const viewYear = data?.year || null;
  const pastYear = student && viewYear?.phase === 'past';
  const issuable = (data?.years || []).filter((y) => y.phase !== 'past');
  const counts = data?.counts || {};
  const tabs = useMemo(() => {
    const list = ['all', ...(pastYear ? [] : ['pending']), 'active', 'generated', 'blocked', 'lost', 'attention', 'unprinted', 'expired', 'cancelled'];
    return list.filter((t) => t === 'all' || t === 'pending' || t === 'active' || counts[t] || t === tab)
      .map((t) => ({ key: t, label: TAB_LABEL[t], count: counts[t] }));
  }, [counts, pastYear, tab]);

  const classes = data?.classes || [];
  const sections = (classes.find((c) => c._id === classId)?.sections || []);

  /* Selection. */
  const allIds = data?.ids || [];
  const pageAll = rows.length > 0 && rows.every((r) => sel.has(r._id));
  const pageSome = rows.some((r) => sel.has(r._id));
  const toggle = (row) => setSel((m) => { const n = new Map(m); if (n.has(row._id)) n.delete(row._id); else n.set(row._id, row); return n; });
  const togglePage = () => setSel((m) => { const n = new Map(m); if (pageAll) rows.forEach((r) => n.delete(r._id)); else rows.forEach((r) => n.set(r._id, r)); return n; });
  const selectEvery = () => setSel(new Map(allIds.map((x) => [x._id, { _id: x._id, card: x.card ? { _id: x.card } : null, state: x.state, name: rows.find((r) => r._id === x._id)?.name || '' }])));
  const chosen = [...sel.values()];
  const chosenPending = chosen.filter((r) => r.state === 'pending');
  const chosenCards = chosen.filter((r) => r.card?._id).map((r) => ({ _id: r.card._id, number: r.card.number, snapshot: { name: r.name } }));

  const download = async (card) => {
    try { saveBlob(await downloadIdCardAdmin(card._id, 'card'), pdfName(card)); toast.success('Card downloaded'); refresh(); }
    catch (e) { toast.error(await errorText(e, 'The card could not be downloaded')); }
  };

  const rowMenu = (row) => {
    const c = cardOf(row, kind);
    const open = row.state && !['expired', 'reissued', 'cancelled', 'none'].includes(row.state) && !pastYear;
    if (!c) {
      return [
        row.state === 'pending' && row.isActive ? { label: 'Generate card', icon: 'cardStack', onClick: () => setGen({ selected: [{ _id: row._id, name: row.name }] }) } : null,
        { label: 'Earlier cards', icon: 'history', onClick: () => setDrawer({ cardId: null, holderId: row._id, kind, name: row.name }) },
      ];
    }
    const live = ['active', 'generated', 'blocked'].includes(row.state);
    return [
      { label: 'View card', icon: 'eye', onClick: () => setDrawer({ cardId: c._id, holderId: row._id, kind, name: row.name }) },
      { label: 'Download PDF', icon: 'download', onClick: () => download(c) },
      { label: 'Print', icon: 'printer', onClick: () => setPrint([c]) },
      '-',
      live && open ? { label: row.changes?.length ? (c.printedAt ? 'Reissue with latest details' : 'Update card details') : (c.printedAt ? 'Reissue card' : 'Update card details'), icon: 'regen', onClick: () => act('regenerate', c, { changes: row.changes }) } : null,
      live && open ? { label: 'Report lost', icon: 'search', onClick: () => act('report', c, { status: 'lost' }) } : null,
      live && open ? { label: 'Report damaged', icon: 'alert', onClick: () => act('report', c, { status: 'damaged' }) } : null,
      ['lost', 'damaged'].includes(row.state) && !row.card.replacedBy && !pastYear && row.isActive ? { label: 'Issue replacement', icon: 'cardStack', onClick: () => act('replace', c) } : null,
      '-',
      ['active', 'generated'].includes(row.state) && !pastYear ? { label: 'Block card', icon: 'ban', onClick: () => act('block', c) } : null,
      row.state === 'blocked' && !pastYear ? { label: 'Activate card', icon: 'checkCircle', onClick: () => act('activate', c) } : null,
      live && !pastYear ? { label: 'Cancel card', icon: 'trash', danger: true, onClick: () => act('cancel', c) } : null,
    ];
  };

  const headActs = (
    <>
      {student ? (
        <Select value={year || viewYear?._id || ''} onChange={(v) => { setYear(v); setClassId(''); setSectionId(''); }} label="Academic year" width={210}
          options={(data?.years || []).map((y) => ({ value: y._id, label: `${y.yearName}${y.phase === 'current' ? ' · current' : y.phase === 'past' ? ' · previous' : ' · coming'}` }))} />
      ) : null}
      <Btn kind="primary" icon="cardStack" disabled={!data || (student && !issuable.length)} onClick={() => setGen({ selected: chosenPending.map((r) => ({ _id: r._id, name: r.name })) })}>Generate Cards</Btn>
    </>
  );

  return (
    <Page className="icl">
      <PageHead title={k.cards} subtitle={SUBTITLE[kind]}>{headActs}</PageHead>

      {data?.noYear ? (
        <div className="icl-gap"><Note tone="amber" icon="calendar">This school has no academic year yet. Student cards belong to a year — add one under Academics → Academic Years.</Note></div>
      ) : null}
      {pastYear ? (
        <div className="icl-gap"><Note tone="slate" icon="history"><b>{viewYear.yearName} is a previous year.</b> Its cards are kept exactly as they were issued — the class, section and roll they printed — and can be viewed, downloaded and printed, but not changed.</Note></div>
      ) : null}
      {student && viewYear?.phase === 'upcoming' ? (
        <div className="icl-gap"><Note tone="indigo" icon="hourglass"><b>{viewYear.yearName} has not begun.</b> Cards issued now show as Generated and come into force by themselves when it becomes the current year.</Note></div>
      ) : null}
      {!pastYear && counts.attention && tab !== 'attention' ? (
        <div className="icl-gap">
          <Note tone="amber" icon="alertTri" action={<Btn size="sm" onClick={() => setTab('attention')}>Review</Btn>}>
            <b>{plural(counts.attention, 'card needs', 'cards need')} attention</b> — details changed since printing, a card lost and not replaced, or a holder who has left.
          </Note>
        </div>
      ) : null}

      <section className="ic-panel icl-card">
        <div className="icl-top">
          <LineTabs items={tabs} value={tab} onChange={setTab} label="Cards by status" />
        </div>
        <div className="icl-filters">
          <div className="icl-search"><SearchBox value={q} onChange={setQ} placeholder={`Search name, ${student ? 'admission no.' : kind === 'parent' ? 'parent ID' : 'employee ID'} or card no.`} /></div>
          {student ? (
            <>
              <Select value={classId} onChange={(v) => { setClassId(v); setSectionId(''); }} all="All classes" label="Class" width={170}
                options={classes.map((c) => ({ value: c._id, label: c.className }))} />
              <Select value={sectionId} onChange={setSectionId} all="All sections" label="Section" width={150} disabled={!classId}
                options={sections.map((s) => ({ value: s._id, label: `Section ${s.sectionName}` }))} />
            </>
          ) : null}
          <Select value={sort} onChange={setSort} label="Sort by" width={180} options={SORTS[student ? 'student' : 'other']} />
          {(q || classId || sectionId || tab !== 'all') ? <Btn kind="ghost" size="sm" icon="refresh" onClick={() => { setQ(''); setClassId(''); setSectionId(''); setTab('all'); }}>Reset</Btn> : null}
          <span className="icl-count">{loading ? 'Loading…' : `${count(data?.total || 0)} ${data?.total === 1 ? k.who : k.plural.toLowerCase()}`}</span>
        </div>

        {sel.size ? (
          <div className="icl-bulk" role="region" aria-label="Selected rows">
            <strong>{count(sel.size)} selected</strong>
            {allIds.length > sel.size ? <button type="button" className="icl-bulk__all" onClick={selectEvery}>Select all {count(allIds.length)}</button> : null}
            <span className="icl-bulk__sp" />
            {chosenPending.length && !pastYear ? <Btn size="sm" kind="primary" icon="cardStack" onClick={() => setGen({ selected: chosenPending.map((r) => ({ _id: r._id, name: r.name })) })}>Generate {count(chosenPending.length)}</Btn> : null}
            {chosenCards.length ? <Btn size="sm" icon="printer" onClick={() => setPrint(chosenCards)}>Print {count(chosenCards.length)}</Btn> : null}
            <Btn size="sm" kind="ghost" icon="close" onClick={() => setSel(new Map())}>Clear</Btn>
          </div>
        ) : null}

        {loading && !data ? <Spin /> : error && !data ? (
          <Empty title="The list could not be loaded" action={<Btn kind="primary" icon="refresh" onClick={reload}>Try again</Btn>}>{error.message}</Empty>
        ) : !rows.length ? (
          <Empty title={q || classId || tab !== 'all' ? 'Nothing matches' : student ? `No students in ${viewYear?.yearName || 'this year'}` : `No ${k.plural.toLowerCase()} yet`}>
            {q || classId || tab !== 'all' ? 'Try another search, filter or tab.' : student ? 'Students appear here once they are placed in a class of the year.' : `${k.plural} appear here once their accounts are added.`}
          </Empty>
        ) : (
          <div className="icl-scroll">
            <table className="ic-table">
              <thead>
                <tr>
                  <th className="ic-table__check"><Check checked={pageAll} indeterminate={pageSome} onChange={togglePage} label="Select every row on this page" /></th>
                  <th>{student ? 'Student' : kind === 'parent' ? 'Parent' : 'Employee'}</th>
                  <th>{student ? 'Class & Section' : kind === 'parent' ? 'Children' : 'Designation'}</th>
                  <th>Card</th>
                  <th>Status</th>
                  <th>Issued</th>
                  <th className="ic-table__acts">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const on = sel.has(r._id);
                  const openRow = () => setDrawer({ cardId: r.card?._id || null, holderId: r._id, kind, name: r.name });
                  return (
                    <tr key={r._id} className={`${on ? 'is-sel' : ''}${!r.isActive ? ' is-off' : ''}`} onClick={openRow}>
                      <td className="ic-table__check" onClick={(e) => e.stopPropagation()}><Check checked={on} onChange={() => toggle(r)} label={`Select ${r.name}`} /></td>
                      <td>
                        <Person name={r.name} photo={r.photo} tone={k.tone} sub={r.code || (student ? 'No admission no.' : kind === 'parent' ? 'Parent ID on first card' : 'No employee ID')} />
                      </td>
                      <td>
                        {student ? (
                          <span className="icl-two"><b>{[r.className, r.sectionName].filter(Boolean).join(' – ') || 'No class'}</b><em>{r.rollNumber ? `Roll ${r.rollNumber}` : '—'}</em></span>
                        ) : (
                          <span className="icl-two"><b title={r.line}>{r.line || '—'}</b></span>
                        )}
                      </td>
                      <td>
                        {r.card ? (
                          <span className="icl-two"><b className="icl-mono">{r.card.number}</b><em>{r.card.reissueNo ? `Reissue ${r.card.reissueNo}` : student ? r.card.yearName : 'Original'}</em></span>
                        ) : <span className="icl-none">—</span>}
                      </td>
                      <td>
                        <span className="icl-status"><StatusBadge status={r.state} /><Flags row={r} /></span>
                      </td>
                      <td>
                        {r.card ? (
                          <span className="icl-two"><b>{fmtDate(r.card.issuedAt)}</b><em className={r.card.printedAt ? '' : 'is-warn'}>{r.card.printedAt ? `Printed${r.card.printCount > 1 ? ` ${r.card.printCount}×` : ''}` : 'Not printed'}</em></span>
                        ) : <span className="icl-none">—</span>}
                      </td>
                      <td className="ic-table__acts" onClick={(e) => e.stopPropagation()}>
                        <span className="icl-acts">
                          {r.card ? <IconBtn icon="eye" label="View card" onClick={openRow} />
                            : r.state === 'pending' && r.isActive ? <Btn size="sm" kind="soft" icon="cardStack" onClick={() => setGen({ selected: [{ _id: r._id, name: r.name }] })}>Generate</Btn> : null}
                          <Kebab items={rowMenu(r)} label={`Actions for ${r.name}`} />
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total ? (
          <Pager page={data.page} pages={data.pages} total={data.total} limit={data.limit} noun={k.who} many={k.plural.toLowerCase()}
            onPage={setPage} sizes={[10, 20, 50, 100]} onLimit={(n) => { setLimit(n); setPage(1); }} />
        ) : null}
      </section>

      <CardDrawer
        open={!!drawer}
        target={drawer}
        version={version}
        locked={!!dialogs || !!print || !!gen}
        onClose={() => setDrawer(null)}
        act={act}
        onPrint={(cards) => setPrint(cards)}
        onDownload={download}
        onGenerate={(h) => setGen({ selected: [{ _id: h._id, name: h.name }] })}
      />
      <GenerateDialog
        open={!!gen}
        onClose={() => setGen(null)}
        kind={kind}
        years={issuable}
        yearId={viewYear && viewYear.phase !== 'past' ? viewYear._id : issuable.find((y) => y.phase === 'current')?._id}
        selected={gen?.selected || []}
        onDone={() => { refresh(); setSel(new Map()); }}
        onPrint={(cards) => setPrint(cards.map((c) => ({ _id: c._id, number: c.number, snapshot: { name: c.name } })))}
      />
      <PrintDialog open={!!print} onClose={() => setPrint(null)} cards={print || []} onDone={refresh} />
      {dialogs}
    </Page>
  );
}
