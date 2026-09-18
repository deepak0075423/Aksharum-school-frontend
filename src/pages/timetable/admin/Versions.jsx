/**
 * Admin → Timetable → Versions.
 *
 * Every generation is kept. Publishing swaps which one the school is actually
 * running; it never destroys the one it replaced, so a timetable that turns out
 * wrong on the Tuesday can be rolled back on the Tuesday.
 *
 * The list is the left column and the rail is whichever version is selected —
 * its notes, what it covers, and everything that can be done to it. Actions
 * live in one place rather than being smeared across eight buttons per row.
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as api from '../../../api/timetable.api';
import { Button, Modal, Confirm, Spinner } from '../../../components/ui/index';
import Icon from '../../../components/ui/icons';
import {
  TtHead, YearPicker, Card, Body, Filters, Pick, Search, Stats, Stat, Panel, KV,
  Chip, Note, Loading, Pager, plural, fmtWhen, fmtDay,
} from './ttUI';
import { STATUS_META } from './shared';

const unwrap = (res) => res?.data ?? res;
const PAGE = 8;

/* The module's own status vocabulary, in this screen's tints. `shared.js` keeps
   the Badge variants the older screens use; both name the same seven states. */
const TONE = {
  draft: 'amber', generating: 'blue', generated: 'indigo', conflict: 'red',
  validated: 'green', published: 'green', archived: 'slate', failed: 'red',
};

export default function TimetableVersions() {
  const navigate = useNavigate();
  const [data, setData]     = useState(null);
  const [years, setYears]   = useState([]);
  const [yearId, setYearId] = useState('');
  const [loading, setLoad]  = useState(true);
  const [busy, setBusy]     = useState('');
  const [status, setStatus] = useState('');
  const [author, setAuthor] = useState('');
  const [q, setQ]           = useState('');
  const [page, setPage]     = useState(1);
  const [picked, setPicked] = useState(null);   // the version the rail is about
  const [notes, setNotes]   = useState(null);   // { id, label, description }
  const [compare, setCompare] = useState(null);
  const [against, setAgainst] = useState('');
  const [del, setDel]       = useState(null);
  const [publish, setPub]   = useState(null);   // { version, preview }
  const [audit, setAudit]   = useState(null);

  const load = useCallback(async (yid) => {
    setLoad(true);
    try {
      const [vRes, mRes] = await Promise.all([
        api.getVersions({ ...(yid ? { yearId: yid } : {}), ...(status ? { status } : {}), ...(author ? { generatedBy: author } : {}) }),
        years.length ? null : api.getMeta(),
      ]);
      const d = unwrap(vRes);
      setData(d);
      if (!yid) setYearId(String(d.selectedYearId || ''));
      if (mRes) setYears(unwrap(mRes).years || []);
      setPage(1);
    } catch (e) { toast.error(e.message); }
    finally { setLoad(false); }
  }, [status, author, years.length]);

  useEffect(() => { load(yearId || undefined); }, [status, author]); // eslint-disable-line react-hooks/exhaustive-deps

  const versions = data?.versions || [];
  const s = data?.summary || {};

  const filtered = useMemo(() => {
    if (!q) return versions;
    const needle = q.toLowerCase();
    return versions.filter((v) => [
      `v${v.versionNumber}`, v.label, v.description, v.generatedBy?.name, v.status,
    ].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [versions, q]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const shown = filtered.slice((page - 1) * PAGE, page * PAGE);

  // The rail follows the list: a version that filtered away should not leave
  // its detail panel behind describing something no longer on screen.
  const selected = versions.find((v) => String(v._id) === String(picked)) || null;
  useEffect(() => {
    if (!selected && shown.length) setPicked(String(shown[0]._id));
  }, [shown, selected]);

  const live = versions.find((v) => v.status === 'published');

  const act = async (fn, message) => {
    setBusy('act');
    try { await fn(); toast.success(message); await load(yearId || undefined); }
    catch (e) { toast.error(e?.data?.message || e.message); }
    finally { setBusy(''); }
  };

  const openCompare = async (a, b) => {
    setCompare({ loading: true });
    try { setCompare(unwrap(await api.compareVersions(a, b))); }
    catch (e) { toast.error(e.message); setCompare(null); }
  };

  const openPublish = async (v) => {
    setPub({ version: v, loading: true });
    try { setPub({ version: v, preview: unwrap(await api.publishPreview(v._id)) }); }
    catch (e) { toast.error(e.message); setPub(null); }
  };

  const openAudit = async (v) => {
    setAudit({ version: v, loading: true });
    try {
      const d = unwrap(await api.getAudit({ versionId: v._id, limit: 100 }));
      setAudit({ version: v, logs: d.logs || [] });
    } catch (e) { toast.error(e.message); setAudit(null); }
  };

  return (
    <div className="page tt-page">
      <TtHead icon="layers" title="Timetable Versions"
        subtitle="Every generation is saved. Publish, compare, restore or create a new version anytime.">
        <Button onClick={() => navigate('/admin/timetable/generate')}>
          <Icon name="plus" size={16} /> Generate New Timetable
        </Button>
      </TtHead>

      <Stats cols={5}>
        <Stat icon="layers" tone="indigo" value={s.total ?? '—'} label="Total Versions" cap="All time" />
        <Stat icon="checkCircle" tone="green" value={s.published ?? '—'} label="Published" cap="Ready for use" />
        <Stat icon="clock" tone="amber" value={s.drafts ?? '—'} label="Drafts" cap="Not published" />
        <Stat icon="alert" tone="red" value={s.conflicts ?? '—'} label="Conflicts" cap="Need attention" />
        <Stat icon="folder" tone="slate" value={s.archived ?? '—'} label="Archived" cap="Hidden from active list" />
      </Stats>

      {live && (
        <Note tone="good">
          <strong>v{live.versionNumber} — {live.label}</strong> is live. This is the week teachers
          and students see.
        </Note>
      )}

      <div className="tt-split tt-split--wide">
        <Card flush>
          <Filters>
            <div className="tt-field tt-field--fix">
              <label>Academic Year</label>
              <select className="form-control" value={yearId}
                onChange={(e) => { setYearId(e.target.value); load(e.target.value); }}>
                {years.map((y) => (
                  <option key={y._id} value={y._id}>{y.yearName}{y.status === 'active' ? ' (Active)' : ''}</option>
                ))}
              </select>
            </div>
            <Pick label="Status" value={status} onChange={setStatus} allLabel="All statuses">
              {Object.keys(STATUS_META).map((k) => (
                <option key={k} value={k}>{STATUS_META[k].label}</option>
              ))}
            </Pick>
            <Pick label="Generated by" value={author} onChange={setAuthor} allLabel="All users">
              {(data?.generators || []).map((g) => <option key={g._id} value={g._id}>{g.name}</option>)}
            </Pick>
            <Search value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="Search versions…" />
          </Filters>

          <div className="tt-card__head" style={{ paddingBottom: 12 }}>
            <div className="tt-card__title">
              <div><h2>Versions ({filtered.length})</h2></div>
            </div>
          </div>

          {loading ? <Loading label="Loading versions…" /> : !filtered.length ? (
            <Body>
              <div className="tt-table__empty">
                <Icon name="layers" size={26} />
                <strong style={{ marginTop: 8 }}>
                  {versions.length ? 'Nothing matches those filters' : 'No timetable versions yet'}
                </strong>
                <span>
                  {versions.length
                    ? 'Clear the search or widen the status.'
                    : 'Run the generator and every attempt will be kept here.'}
                </span>
              </div>
            </Body>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 16px 4px' }}>
                {shown.map((v) => (
                  <VersionRow key={v._id} v={v} selected={String(picked) === String(v._id)}
                    onSelect={() => setPicked(String(v._id))}
                    onOpen={() => navigate(`/admin/timetable/versions/${v._id}`)}
                    onCompare={() => live && live._id !== v._id
                      ? openCompare(live._id, v._id)
                      : toast('Publish a version first, then compare against it', { icon: 'ℹ️' })}
                    onHistory={() => openAudit(v)} />
                ))}
              </div>
              <div className="tt-card__foot">
                <span className="tt-count">
                  {selected ? `v${selected.versionNumber} selected` : 'Nothing selected'} · {plural(filtered.length, 'version')}
                </span>
                <Pager page={page} pages={pages} onPage={setPage} />
              </div>
            </>
          )}
        </Card>

        <div className="tt-rail">
          <Panel icon="info" title="Version Details"
            right={selected && (
              <Button size="sm" variant="secondary"
                onClick={() => setNotes({ id: selected._id, label: selected.label || '', description: selected.description || '' })}>
                <Icon name="pencil" size={14} /> Edit Notes
              </Button>
            )}>
            {!selected ? <Note tone="quiet">Pick a version to see what it covers.</Note> : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '1rem', color: 'var(--primary)' }}>
                    v{selected.versionNumber} · {selected.label || 'Untitled'}
                  </strong>
                  <Chip tone={TONE[selected.status] || 'slate'}>
                    {(STATUS_META[selected.status] || {}).label || selected.status}
                  </Chip>
                </div>
                {selected.description
                  ? <div style={{
                      background: 'var(--bg)', borderRadius: 10, padding: '10px 12px',
                      fontSize: '.84rem', lineHeight: 1.5,
                    }}>{selected.description}</div>
                  : <span style={{ fontSize: '.82rem', color: 'var(--text-light)' }}>No notes on this version.</span>}
                <KV icon="calendar" k="Generated on" v={fmtWhen(selected.generatedAt || selected.createdAt)} />
                <KV icon="user" k="Generated by" v={selected.generatedBy?.name || 'System'} />
                <KV icon="layers" k="Classes"
                  v={selected.scopeType === 'school' ? 'Entire school'
                    : plural((selected.scopeClasses || []).length || 1, 'class', 'classes')} />
                <KV icon="grid" k="Sections" v={plural(selected.sectionCount || 0, 'section')} />
                <KV icon="calendarDays" k="Total periods" v={selected.stats?.entriesGenerated ?? '—'} />
                {selected.publishedAt && (
                  <KV icon="checkCircle" k="Published" v={fmtWhen(selected.publishedAt)} />
                )}
                {(selected.errorCount > 0 || selected.warningCount > 0) && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {selected.errorCount > 0 && <Chip tone="red">{plural(selected.errorCount, 'error')}</Chip>}
                    {selected.warningCount > 0 && <Chip tone="amber">{plural(selected.warningCount, 'warning')}</Chip>}
                  </div>
                )}
              </>
            )}
          </Panel>

          {selected && (
            <Panel icon="sliders" title="Actions">
              <Button variant="primary" onClick={() => navigate(`/admin/timetable/versions/${selected._id}`)}>
                <Icon name="externalLink" size={15} /> Open Timetable
              </Button>
              {selected.status !== 'published' && selected.status !== 'archived' && (
                <Button variant="secondary" onClick={() => openPublish(selected)}>
                  <Icon name="check" size={15} /> Set as Published
                </Button>
              )}
              {selected.status === 'archived' ? (
                <Button variant="secondary" disabled={!!busy}
                  onClick={() => act(async () => {
                    const res = unwrap(await api.restoreVersion(selected._id));
                    navigate(`/admin/timetable/versions/${res.versionId}`);
                  }, 'Restored as a new draft')}>
                  <Icon name="refresh" size={15} /> Restore Version
                </Button>
              ) : (
                <Button variant="secondary" disabled={!!busy}
                  onClick={() => act(() => api.duplicateVersion(selected._id), 'Duplicated')}>
                  <Icon name="copy" size={15} /> Duplicate Version
                </Button>
              )}
              {selected.status !== 'published' && selected.status !== 'archived' && (
                <Button variant="secondary" disabled={!!busy}
                  onClick={() => act(() => api.archiveVersion(selected._id), 'Archived')}>
                  <Icon name="folder" size={15} /> Archive Version
                </Button>
              )}
              <Button variant="secondary" onClick={() => openAudit(selected)}>
                <Icon name="history" size={15} /> View History
              </Button>
              {selected.status !== 'published' && (
                <Button variant="danger" onClick={() => setDel(selected)}>
                  <Icon name="trash" size={15} /> Delete Version
                </Button>
              )}
            </Panel>
          )}

          <Panel icon="copy" title="Compare Versions">
            <span style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
              Select another version to compare differences.
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="form-control" value={against} onChange={(e) => setAgainst(e.target.value)}>
                <option value="">Select version…</option>
                {versions.filter((v) => String(v._id) !== String(picked)).map((v) => (
                  <option key={v._id} value={v._id}>v{v.versionNumber} · {v.label || 'Untitled'}</option>
                ))}
              </select>
              <Button disabled={!against || !selected} onClick={() => openCompare(selected._id, against)}>
                Compare
              </Button>
            </div>
            {selected && (
              <button type="button" className="btn btn-secondary btn-sm"
                onClick={() => openAudit(selected)}
                style={{ alignSelf: 'flex-start' }}>
                <Icon name="history" size={14} /> View comparison history
              </button>
            )}
          </Panel>
        </div>
      </div>

      {/* ── Notes ─────────────────────────────────────────────────────────── */}
      <Modal open={!!notes} onClose={() => setNotes(null)} maxWidth={460} title="Edit this version’s notes"
        footer={<>
          <Button variant="secondary" onClick={() => setNotes(null)}>Cancel</Button>
          <Button loading={busy === 'act'} onClick={() => act(async () => {
            await api.updateVersion(notes.id, { label: notes.label, description: notes.description });
            setNotes(null);
          }, 'Notes saved')}>Save</Button>
        </>}>
        {notes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="tt-field">
              <label>Name</label>
              <input className="form-control" value={notes.label} maxLength={80}
                onChange={(e) => setNotes((n) => ({ ...n, label: e.target.value }))} />
            </div>
            <div className="tt-field">
              <label>Notes</label>
              <textarea className="form-control" rows={3} value={notes.description} maxLength={300}
                placeholder="What is different about this run?"
                onChange={(e) => setNotes((n) => ({ ...n, description: e.target.value }))} />
            </div>
          </div>
        )}
      </Modal>

      {/* ── Publish ───────────────────────────────────────────────────────── */}
      <Modal open={!!publish} onClose={() => setPub(null)} maxWidth={560}
        title={`Publish v${publish?.version?.versionNumber ?? ''}?`}
        footer={<>
          <Button variant="secondary" onClick={() => setPub(null)}>Cancel</Button>
          <Button loading={busy === 'act'} onClick={() => act(async () => {
            await api.publishVersion(publish.version._id, {});
            setPub(null);
          }, 'Published — this is the live timetable now')}>Publish it</Button>
        </>}>
        {publish?.loading ? <Loading /> : publish && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Note tone="warn">
              This becomes the timetable teachers, students and parents see. The version it
              replaces is kept and can be republished.
            </Note>
            {publish.preview && (
              <>
                <KV icon="grid" k="Sections it rewrites" v={publish.preview.sections ?? '—'} />
                <KV icon="calendarDays" k="Periods written" v={publish.preview.entries ?? '—'} />
                {publish.preview.replacing != null && (
                  <KV icon="repeat" k="Periods replaced" v={publish.preview.replacing} />
                )}
              </>
            )}
            {publish.version.errorCount > 0 && (
              <Note tone="bad">
                This version still has {plural(publish.version.errorCount, 'error')}. Publishing it
                puts those clashes into the live week.
              </Note>
            )}
          </div>
        )}
      </Modal>

      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete this version"
        message={`Delete v${del?.versionNumber} “${del?.label}”? Its draft periods go with it. The audit history is kept.`}
        loading={busy === 'act'}
        onConfirm={() => act(async () => { await api.deleteVersion(del._id); setDel(null); }, 'Version deleted')} />

      {/* ── Comparison ────────────────────────────────────────────────────── */}
      <Modal open={!!compare} onClose={() => setCompare(null)} maxWidth={820} title="Compare versions"
        footer={<Button variant="secondary" onClick={() => setCompare(null)}>Close</Button>}>
        {compare?.loading ? <Loading /> : compare && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <Chip tone={TONE[compare.from.status] || 'slate'}>
                v{compare.from.versionNumber} · {compare.from.label} · {plural(compare.from.entries, 'period')}
              </Chip>
              <Icon name="arrowRight" size={16} />
              <Chip tone={TONE[compare.to.status] || 'slate'}>
                v{compare.to.versionNumber} · {compare.to.label} · {plural(compare.to.entries, 'period')}
              </Chip>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Chip tone="green">{compare.summary.added} added</Chip>
              <Chip tone="red">{compare.summary.removed} removed</Chip>
              <Chip tone="amber">{compare.summary.changed} changed</Chip>
            </div>
            {!compare.changes.length ? (
              <Note tone="good">These two schedule every period exactly the same way.</Note>
            ) : (
              <div className="tt-tablewrap" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="tt-table">
                  <thead><tr><th>Class</th><th>Slot</th><th>Before</th><th>After</th></tr></thead>
                  <tbody>
                    {compare.changes.slice(0, 300).map((c, i) => (
                      <tr key={i}>
                        <td className="tt-nowrap">{c.section}</td>
                        <td className="tt-nowrap">{c.dayOfWeek} P{c.periodNumber}</td>
                        <td className={c.from ? '' : 'tt-table__muted'}>
                          {c.from ? `${c.from.subject}${c.from.teacher ? ` · ${c.from.teacher}` : ''}` : '—'}
                        </td>
                        <td className={c.to ? '' : 'tt-table__muted'}>
                          {c.to ? `${c.to.subject}${c.to.teacher ? ` · ${c.to.teacher}` : ''}` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {compare.changes.length > 300 && (
                  <div style={{ padding: 10, fontSize: '.8rem', color: 'var(--text-muted)' }}>
                    +{compare.changes.length - 300} more changes not listed.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── History ───────────────────────────────────────────────────────── */}
      <Modal open={!!audit} onClose={() => setAudit(null)} maxWidth={640}
        title={`History · v${audit?.version?.versionNumber ?? ''}`}
        footer={<Button variant="secondary" onClick={() => setAudit(null)}>Close</Button>}>
        {audit?.loading ? <Loading /> : audit && (
          !audit.logs?.length ? <Note tone="quiet">Nothing recorded against this version.</Note> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 440, overflowY: 'auto' }}>
              {audit.logs.map((l) => (
                <div key={l._id} style={{ borderLeft: '3px solid var(--border)', paddingLeft: 12 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '.85rem' }}>{l.user?.name || 'System'}</strong>
                    <Chip tone="blue">{l.actionType}</Chip>
                  </div>
                  <div style={{ fontSize: '.84rem' }}>{l.description}</div>
                  {l.meta?.overrideReason && (
                    <div style={{ fontSize: '.78rem', color: 'var(--danger)' }}>
                      Overridden: {l.meta.overrideReason}
                    </div>
                  )}
                  <div style={{ fontSize: '.74rem', color: 'var(--text-muted)' }}>{fmtWhen(l.createdAt)}</div>
                </div>
              ))}
            </div>
          )
        )}
      </Modal>
    </div>
  );
}

/* ── One version in the list ───────────────────────────────────────────────── */
function VersionRow({ v, selected, onSelect, onOpen, onCompare, onHistory }) {
  const [menu, setMenu] = useState(false);
  return (
    <div onClick={onSelect} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      border: `1px solid ${selected ? 'var(--primary)' : 'var(--border)'}`,
      borderRadius: 'var(--radius-lg)',
      background: selected ? '#eef2ff' : 'var(--bg-card)',
      cursor: 'pointer', position: 'relative',
    }}>
      <input type="checkbox" checked={selected} onChange={onSelect}
        style={{ accentColor: 'var(--primary)', flexShrink: 0 }} aria-label={`Select version ${v.versionNumber}`} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <strong style={{ color: 'var(--primary)', fontSize: '.92rem' }}>
            v{v.versionNumber} · {v.label || 'Untitled'}
          </strong>
          <Chip tone={TONE[v.status] || 'slate'}>{(STATUS_META[v.status] || {}).label || v.status}</Chip>
          {v.errorCount > 0 && <Chip tone="red">{plural(v.errorCount, 'error')}</Chip>}
        </div>
        <div style={{ fontSize: '.76rem', color: 'var(--text-muted)', marginTop: 3 }}>
          {v.scopeType === 'school' ? 'Entire school' : v.scopeType === 'multiple' ? 'Several sections' : 'Single section'}
          {' · '}{plural(v.sectionCount || 0, 'section')}
          {v.description ? ` · Notes: ${v.description}` : ''}
        </div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: '.9rem' }}>{v.stats?.entriesGenerated ?? '—'}</div>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>Periods</div>
      </div>

      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 130 }}>
        <div style={{ fontSize: '.78rem' }}>{fmtDay(v.generatedAt || v.createdAt)}</div>
        <div style={{ fontSize: '.72rem', color: 'var(--text-muted)' }}>
          by {v.generatedBy?.name || 'System'}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <Button size="sm" variant={selected ? 'primary' : 'secondary'} onClick={onOpen}>
          <Icon name="pencil" size={14} /> Open
        </Button>
        <Button size="sm" variant="secondary" onClick={onCompare}>
          <Icon name="copy" size={14} /> Compare
        </Button>
        <div style={{ position: 'relative' }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setMenu((m) => !m)}
            onBlur={() => setTimeout(() => setMenu(false), 150)} aria-label="More">
            <Icon name="dots" size={14} />
          </button>
          {menu && (
            <div style={{
              position: 'absolute', right: 0, top: 36, zIndex: 30, minWidth: 180, padding: 6,
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow)',
            }}>
              <button type="button" className="btn btn-secondary btn-sm" style={{ width: '100%', justifyContent: 'flex-start' }}
                onClick={onHistory}>
                <Icon name="history" size={14} /> View history
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
