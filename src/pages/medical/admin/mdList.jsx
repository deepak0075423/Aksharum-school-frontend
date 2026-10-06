/**
 * The frame of every Medical Room list (Oct 2026): status tabs with their
 * counts, a search and the filters, the table and the pager — the query kept
 * in the URL, so a reload, the back button or a notification's link
 * (?tab=follow_up&focus=…) lands on exactly the same view.
 */
import React, { useEffect, useRef } from 'react';
import * as api from '../../../api/medical.api';
import { Panel, LineTabs, SearchBox, Select, Table, Pager, Toolbar, Btn, LoadError, useLoad, useQueryState } from '../mdUI';
import { toCsv, downloadText } from '../mdMeta';

/** A board's rows for the query in the URL. `defaults` holds the default tab and filters. */
export function useBoard(screen, defaults = {}) {
  const [q, setQ] = useQueryState({ page: '1', q: '', ...defaults });
  const { focus, ...query } = q;
  const res = useLoad(() => api.getMedBoard(screen, { ...query, limit: query.limit || 20 }), { screen, ...query });
  return { q, setQ, focus, defaults, ...res };
}

/** Open the drawer for `?focus=<id>` once, when the page arrives with one (and is `ready`). */
export function useFocusOpen(focus, open, ready = true) {
  const done = useRef(null);
  useEffect(() => {
    if (ready && focus && done.current !== focus) { done.current = focus; open(focus); }
  }, [focus, open, ready]);
}

/** The classes and sections filter pair, from meta. */
export function ClassFilter({ meta, q, setQ }) {
  const classes = meta?.classes || [];
  const sections = classes.find((c) => c._id === q.classId)?.sections || [];
  return (
    <>
      <Select value={q.classId} onChange={(v) => setQ({ classId: v, sectionId: '' })} all="All classes" label="Class" options={classes.map((c) => ({ value: c._id, label: c.className }))} />
      {q.classId && sections.length ? <Select value={q.sectionId} onChange={(v) => setQ({ sectionId: v })} all="All sections" label="Section" options={sections.map((x) => ({ value: x._id, label: `Section ${x.sectionName}` }))} /> : null}
    </>
  );
}

export function DateFilter({ q, setQ }) {
  return (
    <>
      <input className="md-input" type="date" value={q.from || ''} onChange={(e) => setQ({ from: e.target.value })} aria-label="From date" />
      <input className="md-input" type="date" value={q.to || ''} onChange={(e) => setQ({ to: e.target.value })} aria-label="To date" />
    </>
  );
}

/**
 * The list panel. `board` is useBoard's result; `columns` the table's;
 * `filters` extra controls for the toolbar; `exportName` adds a CSV export of
 * what is on screen.
 */
export function BoardPanel({
  board, columns, onRow, filters, actions, empty, noun = 'record', many, searchPlaceholder = 'Search', title, sub, icon, tone,
  rowClass, minWidth, exportName, exportColumns, hideSearch,
}) {
  const { q, setQ, data, loading, error, reload, focus, defaults = {} } = board;
  // Only what the person chose counts as a filter — not a value the screen
  // fixes for itself (the inventory's `kind`), nor the row it was opened on.
  const own = Object.keys(q).filter((k) => !['tab', 'page', 'limit', 'focus'].includes(k));
  const clear = own.some((k) => q[k] && q[k] !== defaults[k]);
  const exportCsv = () => {
    const cols = exportColumns || columns.filter((c) => c.csv || c.key).map((c) => ({ key: c.key, label: c.label, csv: c.csv }));
    downloadText(toCsv(cols, data?.rows || []), `${exportName}.csv`);
  };
  return (
    <Panel title={title} sub={sub} icon={icon} tone={tone} pad={false} right={actions}>
      {data?.tabs?.length ? (
        <div className="md-listhead">
          <LineTabs items={data.tabs} value={data.tab} onChange={(t) => setQ({ tab: t })} />
          {exportName && data?.rows?.length ? <span className="md-listhead__side"><Btn size="sm" kind="ghost" icon="download" onClick={exportCsv}>Export</Btn></span> : null}
        </div>
      ) : null}
      <Toolbar>
        {!hideSearch ? <SearchBox value={q.q} onChange={(v) => setQ({ q: v })} placeholder={searchPlaceholder} /> : null}
        {filters}
        {clear ? <Btn size="sm" kind="ghost" icon="close" onClick={() => setQ(Object.fromEntries(own.map((k) => [k, ''])))}>Clear</Btn> : null}
      </Toolbar>
      {error && !data ? <LoadError error={error} onRetry={reload} /> : (
        <Table columns={columns} rows={data?.rows || []} loading={loading} onRow={onRow} empty={empty} rowClass={rowClass} minWidth={minWidth} focusId={focus} />
      )}
      {data ? <Pager page={data.page} pages={data.pages} total={data.total} limit={data.limit} noun={noun} many={many} onPage={(n) => setQ({ page: n }, { keepPage: true })} /> : null}
    </Panel>
  );
}
