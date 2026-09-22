/**
 * Payroll → Salary Structures (mockup 4).
 *
 * A structure is a rule set, not a list of amounts — "50% of CTC" rather than
 * "₹25,000" — so the Basic Salary column shows the rule and the rail shows what
 * the rule pays at a real CTC. That distinction is the whole reason this module
 * used to pay everyone on one structure exactly the same however different
 * their CTC.
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import useFetch from '../../../hooks/useFetch';
import * as api from '../../../api/payroll.api';
import {
  SectionBar, Crumbs, PrHead, Tiles, Tile, Card, CardHead, Panel, QuickActions, HelpCard,
  Btn, Select, Search, Check, Badge, StatusBadge, IconBtn, RowMenu, MenuItem, Mark, Glyph,
  Loading, Empty, TableWrap, Pager, Facts, Fact, Note, PillTabs, Ledger, NetBar, LinkBtn, BulkBar, runBulk,
  money, fmtDate, saveFile, STRUCTURE_TYPE, STRUCTURE_STATUS, COMPONENT_TYPE,
} from './prUI';
import { StructureDialog, TemplateDialog, AssignDialog, ConfirmDialog } from './prForms';

export default function PayrollStructures() {
  const [sp, setSp] = useSearchParams();
  const selected = sp.get('structure') || '';

  const [yearId, setYearId] = useState('');
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [picked, setPicked] = useState([]);

  const [editing, setEditing] = useState(null);     // a structure, or `true` for a new one
  const [templating, setTemplating] = useState(false);
  const [assigning, setAssigning] = useState(null); // a structure id to assign onto
  const [confirm, setConfirm] = useState(null);
  const [preview, setPreview] = useState(null);
  const [sampleCtc, setSampleCtc] = useState(600000);
  const [busy, setBusy] = useState(false);

  const { data: rows, meta, loading, refetch } = useFetch(
    () => api.getStructures({ tab, search, type, page, limit }), [tab, search, type, page, limit]);

  const summary = meta?.summary || {};
  const detail = (rows || []).find(r => r._id === selected) || null;

  useEffect(() => {
    if (selected || !rows?.length) return;
    setSp(p => { p.set('structure', rows[0]._id); return p; }, { replace: true });
  }, [rows, selected, setSp]);

  // What the selected structure pays at a sample CTC.
  useEffect(() => {
    if (!detail) { setPreview(null); return undefined; }
    let cancelled = false;
    api.previewStructure({ structureId: detail._id, annualCtc: sampleCtc, units: detail.payBasis === 'rate' ? 20 : 0 })
      .then(r => { if (!cancelled) setPreview(r.data); })
      .catch(() => { if (!cancelled) setPreview(null); });
    return () => { cancelled = true; };
  }, [detail?._id, sampleCtc, detail?.updatedAt]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast.success(okMsg); await refetch(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); setConfirm(null); }
  };

  const bulk = async (on) => {
    setBusy(true);
    try {
      const { ok: done, failed, reason } = await runBulk(picked,
        (id) => api.toggleStructure(id, { isActive: on, force: true }));
      if (done) toast.success(`${done} structure${done === 1 ? '' : 's'} switched ${on ? 'on' : 'off'}`);
      if (failed) toast.error(`${failed} could not be changed${reason ? ` — ${reason}` : ''}`);
      setPicked([]);
      await refetch();
    } finally { setBusy(false); }
  };

  const exportCsv = () => {
    const cols = ['Structure', 'Description', 'Type', 'Pay basis', 'Basic', 'Components', 'Earnings', 'Deductions', 'Employer', 'Employees', 'Status'];
    const cell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
    const body = (rows || []).map(r => [
      r.name, r.description, STRUCTURE_TYPE[r.type]?.[1], r.payBasis === 'rate' ? `${money(r.rate)} per ${r.rateUnit}` : 'Monthly CTC',
      `${r.basic.label} ${r.basic.caption}`.trim(), r.counts.total, r.counts.earnings, r.counts.deductions, r.counts.employer,
      r.employees, r.isDefault ? 'Default' : r.isActive ? 'Active' : 'Inactive',
    ].map(cell).join(','));
    saveFile('﻿' + [cols.join(','), ...body].join('\n'), 'salary_structures.csv');
  };

  return (
    <div className="pr-page">
      <Crumbs trail={[{ label: 'Payroll', to: '/admin/payroll/dashboard' }, { label: 'Structures' }]} />
      <SectionBar years={[]} hideYear>
        <Btn glyph="layers" onClick={() => setTemplating(true)}>Use a Template</Btn>
        <Btn variant="primary" icon="plus" onClick={() => setEditing(true)}>Create Structure</Btn>
      </SectionBar>

      <PrHead title="Salary Structures" subtitle="Create and manage salary structures with earnings, deductions and components" />

      <Note tone="blue" glyph="info" action={<Btn size="sm" onClick={() => toast(
        'A component is either a fixed amount, a percentage of CTC or of another component, or the balance of CTC. The balance component is what makes a structure add up to the CTC exactly.',
        { icon: 'ℹ️', duration: 8000 })}>Learn More</Btn>}>
        Salary structures define how an employee's salary is calculated using different components like basic pay,
        allowances and deductions.
      </Note>

      <Tiles n={4}>
        <Tile glyph="layers" tone="indigo" valueFirst label="Total Structures"
          value={loading ? '—' : (summary.total ?? 0)} caption="All pay structures" />
        <Tile glyph="checkCircle" tone="green" valueFirst label="Active Structures"
          value={loading ? '—' : (summary.active ?? 0)} caption="Currently in use" />
        <Tile glyph="pause" tone="orange" valueFirst label="Inactive Structures"
          value={loading ? '—' : (summary.inactive ?? 0)} caption="Not in use" />
        <Tile glyph="users" tone="blue" valueFirst label="Employees Assigned"
          value={loading ? '—' : (summary.employees ?? 0)} caption="Across all structures" />
      </Tiles>

      <div className="pr-split">
        <div className="pr-stack">
          <Card>
            <div className="pr-cardhead" style={{ paddingBottom: 0 }}>
              <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                <PillTabs value={tab} onChange={v => { setTab(v); setPage(1); }} items={[
                  { value: 'all', label: 'All Structures', count: summary.total },
                  { value: 'active', label: 'Active', count: summary.active },
                  { value: 'inactive', label: 'Inactive', count: summary.inactive },
                  { value: 'default', label: 'Default', count: summary.default },
                ]} />
              </div>
              <div className="pr-cardhead__acts">
                <Search value={q} onChange={setQ} onEnter={() => { setSearch(q); setPage(1); }}
                  placeholder="Search structures by name or description…" className="pr-search" />
                <Select value={type} all="All Types" onChange={v => { setType(v); setPage(1); }}
                  options={Object.entries(STRUCTURE_TYPE).map(([value, [, label]]) => ({ value, label }))} ariaLabel="Type" />
              </div>
            </div>
            <div className="pr-cardbody pr-cardbody--flush" style={{ marginTop: 12 }}>
              {loading ? <Loading rows={6} /> : !rows?.length ? (
                <Empty glyph="sitemap" title="No salary structures"
                  hint="A structure turns an employee's CTC into earnings and deductions. Start from a template, or build one.">
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                    <Btn glyph="layers" onClick={() => setTemplating(true)}>Use a Template</Btn>
                    <Btn variant="primary" icon="plus" onClick={() => setEditing(true)}>Create Structure</Btn>
                  </div>
                </Empty>
              ) : (
                <>
                  <BulkBar count={picked.length} noun={`structure${picked.length === 1 ? '' : 's'} selected`} onClear={() => setPicked([])}>
                    <Btn size="sm" glyph="play" onClick={() => bulk(true)}>Switch on</Btn>
                    <Btn size="sm" glyph="pause" onClick={() => bulk(false)}>Switch off</Btn>
                  </BulkBar>
                  <TableWrap>
                    <table className="pr-table pr-table--stickyend">
                      <thead>
                        <tr>
                          <th style={{ width: 34 }}>
                            <Check checked={picked.length > 0 && picked.length === rows.length}
                              indeterminate={picked.length > 0 && picked.length < rows.length}
                              onChange={on => setPicked(on ? rows.map(r => r._id) : [])} label="Select all" />
                          </th>
                          <th className="pr-idx">#</th>
                          <th>Structure Name</th>
                          <th>Type</th>
                          <th style={{ textAlign: 'right' }}>Basic Salary</th>
                          <th style={{ textAlign: 'right' }}>Total Components</th>
                          <th style={{ textAlign: 'right' }}>Employees</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => {
                          const [tone, label] = STRUCTURE_TYPE[r.type] || ['slate', 'General'];
                          return (
                            <tr key={r._id} data-focus-id={r._id} className={r._id === selected ? 'is-on' : ''}>
                              <td>
                                <Check checked={picked.includes(r._id)} label={`Select ${r.name}`}
                                  onChange={on => setPicked(p => (on ? [...p, r._id] : p.filter(x => x !== r._id)))} />
                              </td>
                              <td className="pr-idx">{(page - 1) * limit + i + 1}</td>
                              <td><div className="pr-cell2 pr-cell2--wrap"><b>{r.name}</b><small>{r.description || '—'}</small></div></td>
                              <td><Badge tone={tone}>{label}</Badge></td>
                              <td className="pr-num">
                                <div className="pr-cell2" style={{ textAlign: 'right' }}>
                                  <b>{r.basic.label}</b>
                                  {r.basic.caption ? <small>{r.basic.caption}</small> : null}
                                </div>
                              </td>
                              <td className="pr-num">
                                <div className="pr-cell2" style={{ textAlign: 'right' }}>
                                  <b>{r.counts.total}</b><small>{r.componentsBreak}</small>
                                </div>
                              </td>
                              <td className="pr-num">{r.employees}</td>
                              <td><StatusBadge status={r.status} map={STRUCTURE_STATUS} /></td>
                              <td>
                                <div className="pr-acts" style={{ justifyContent: 'flex-end' }}>
                                  <IconBtn glyph="eye" label="View" onClick={() => setSp(p => { p.set('structure', r._id); return p; })} />
                                  <IconBtn glyph="pencil" label="Edit" onClick={() => setEditing(r)} />
                                  <RowMenu label={`Actions for ${r.name}`}>
                                    <MenuItem glyph="copy" onClick={() => act(() => api.duplicateStructure(r._id), 'Structure duplicated')}>Duplicate</MenuItem>
                                    <MenuItem glyph="userPlus" onClick={() => setAssigning(r._id)}>Assign an employee</MenuItem>
                                    {!r.isDefault && r.isActive && (
                                      <MenuItem glyph="checkCircle" onClick={() => act(() => api.setDefaultStructure(r._id), `“${r.name}” is now the default`)}>
                                        Make default
                                      </MenuItem>
                                    )}
                                    <MenuItem glyph={r.isActive ? 'pause' : 'play'} onClick={() => setConfirm({
                                      title: r.isActive ? 'Switch this structure off?' : 'Switch this structure on?',
                                      body: r.isActive
                                        ? `${r.employees} employee${r.employees === 1 ? ' is' : 's are'} paid on “${r.name}”. While it is off, a payroll run will skip them.`
                                        : `“${r.name}” becomes available to assign again.`,
                                      confirm: r.isActive ? 'Switch Off' : 'Switch On', danger: r.isActive && r.employees > 0,
                                      run: () => api.toggleStructure(r._id, { isActive: !r.isActive, force: true }),
                                      msg: r.isActive ? 'Structure switched off' : 'Structure switched on',
                                    })}>
                                      {r.isActive ? 'Switch off' : 'Switch on'}
                                    </MenuItem>
                                    <MenuItem glyph="trash" danger onClick={() => setConfirm({
                                      title: 'Delete this structure?',
                                      body: `“${r.name}” will be removed. This is refused while any assignment or payroll entry still points at it — switch it off instead.`,
                                      confirm: 'Delete', danger: true,
                                      run: () => api.deleteStructure(r._id), msg: 'Structure deleted',
                                    })}>Delete</MenuItem>
                                  </RowMenu>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </TableWrap>
                  <Pager page={meta?.page || 1} pages={meta?.pages || 1} total={meta?.total || 0} limit={limit}
                    noun="structures" onPage={setPage} onLimit={v => { setLimit(v); setPage(1); }} />
                </>
              )}
            </div>
          </Card>
        </div>

        <div className="pr-rail">
          {!detail ? (
            <Panel title="Structure Details">
              <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--pr-muted)' }}>
                Pick a structure to see its components and what they pay.
              </p>
            </Panel>
          ) : (
            <>
              <Panel title="Structure Details" status={<StatusBadge status={detail.status} map={STRUCTURE_STATUS} />} flush>
                <div className="pr-who pr-who--rail">
                  <Mark glyph="sitemap" tone={STRUCTURE_TYPE[detail.type]?.[0] || 'slate'} size={40} glyphSize={20} />
                  <div className="pr-who__txt"><b>{detail.name}</b><small>{detail.description || '—'}</small></div>
                </div>
                <div className="pr-panel__body">
                  <Facts>
                    <Fact label="Type">
                      <Badge tone={STRUCTURE_TYPE[detail.type]?.[0] || 'slate'}>{STRUCTURE_TYPE[detail.type]?.[1] || 'General'}</Badge>
                    </Fact>
                    <Fact label="Basic Salary">{detail.basic.label} {detail.basic.caption}</Fact>
                    <Fact label="Total Components">
                      {detail.counts.total} ({detail.counts.earnings} earnings + {detail.counts.deductions} deductions
                      {detail.counts.employer ? ` + ${detail.counts.employer} employer` : ''})
                    </Fact>
                    <Fact label="Employees Assigned">{detail.employees}</Fact>
                    <Fact label="Last Updated">
                      {fmtDate(detail.updatedAt)}{detail.updatedByName ? ` by ${detail.updatedByName}` : ''}
                    </Fact>
                  </Facts>

                  <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <label className="pr-label" style={{ marginBottom: 0 }}>
                      {detail.payBasis === 'rate' ? 'Pays at 20 units' : 'What it pays at'}
                    </label>
                    {detail.payBasis !== 'rate' && (
                      <Select className="pr-select--block" value={String(sampleCtc)} onChange={v => setSampleCtc(Number(v))}
                        options={[300000, 480000, 600000, 900000, 1200000].map(v => ({ value: String(v), label: `${money(v)} a year` }))} />
                    )}
                    {!preview ? <Loading rows={3} /> : (
                      <>
                        <Ledger title="Earnings" rows={preview.earnings} total={preview.grossSalary} />
                        {preview.deductions.length > 0 && (
                          <Ledger title="Deductions" rows={preview.deductions} total={preview.totalDeductions} tone="red" />
                        )}
                        <NetBar value={preview.netSalary} />
                        {!preview.balances && (
                          <Note tone="amber" glyph="bang">
                            Earnings plus employer cost come to {money(preview.monthlyCost)}, not the {money(preview.monthlyCtc)} a
                            month this CTC implies. Add a “Balance of CTC” earning.
                          </Note>
                        )}
                      </>
                    )}
                  </div>

                  <Btn variant="primary" className="pr-btn--block" glyph="pencil" style={{ marginTop: 14 }}
                    onClick={() => setEditing(detail)}>
                    Edit Structure
                  </Btn>
                </div>
              </Panel>

              <QuickActions items={[
                { glyph: 'plusCircle', tone: 'indigo', label: 'Create New Structure', hint: 'Set up a new salary structure', onClick: () => setEditing(true) },
                { glyph: 'copy', tone: 'blue', label: 'Duplicate Structure', hint: 'Copy an existing structure', onClick: () => act(() => api.duplicateStructure(detail._id), 'Structure duplicated') },
                { glyph: 'layers', tone: 'orange', label: 'Component Library', hint: 'Manage earnings and deductions', onClick: () => setEditing(detail) },
                { glyph: 'userPlus', tone: 'green', label: 'Assign to Employees', hint: 'Put someone on this structure', onClick: () => setAssigning(detail._id) },
                { glyph: 'upload', tone: 'purple', label: 'Export Structures', hint: 'Download all structures', onClick: exportCsv },
              ]} />

              <HelpCard text="Learn more about salary structures."
                action="View Guide" onAction={() => toast('Order matters: a percentage can only cite a component defined above it. One “Balance of CTC” earning soaks up the remainder.', { icon: '📘', duration: 8000 })} />
            </>
          )}
        </div>
      </div>

      <StructureDialog open={editing === true || !!editing} structure={editing === true ? null : editing}
        onClose={() => setEditing(null)}
        onDone={(s) => { setEditing(null); refetch(); if (s?._id) setSp(p => { p.set('structure', s._id); return p; }); }} />
      <TemplateDialog open={templating} onClose={() => setTemplating(false)}
        onDone={(s) => { setTemplating(false); refetch(); if (s?._id) setSp(p => { p.set('structure', s._id); return p; }); }} />
      <AssignDialog open={!!assigning} presetStructure={assigning} onClose={() => setAssigning(null)}
        onDone={() => { setAssigning(null); refetch(); }} />
      <ConfirmDialog open={!!confirm} onClose={() => setConfirm(null)}
        title={confirm?.title} body={confirm?.body} confirm={confirm?.confirm} danger={confirm?.danger}
        onConfirm={() => act(confirm.run, confirm.msg)} />
    </div>
  );
}
