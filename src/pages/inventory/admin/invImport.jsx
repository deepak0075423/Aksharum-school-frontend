/**
 * Inventory → Items → Import.
 *
 * The button used to say import was on the roadmap. A school arriving with a
 * spreadsheet of four hundred items had to type each one through a seven-step
 * wizard, which is not a thing anybody does — so those schools did not use the
 * item master at all.
 *
 * The file is read here, in the browser, because that is where the file is. The
 * server does the part the browser cannot: resolve category and store names
 * against what this school actually has, check codes against the ones already
 * taken, and write the survivors.
 *
 * Nothing is written until the person has seen what will happen. Picking a file
 * runs a check that changes nothing and reports row by row; only then does the
 * Import button do anything.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import { Modal, Btn, Note, Badge, Empty, SkeletonRows, saveFile, count } from './invUI';

/**
 * A CSV parser that handles the three things a spreadsheet export actually
 * does: quoted fields, commas inside them, and doubled quotes for a literal
 * one. Splitting on commas would corrupt any description with a comma in it,
 * which is most of them.
 */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  const src = String(text || '').replace(/^﻿/, '');   // Excel's byte-order mark
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }      // "" is one quote
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(cell => String(cell).trim() !== ''));
}

/** Spreadsheet headers are never spelled the way the API is. */
const HEADER_ALIASES = {
  name: ['name', 'item', 'item name', 'itemname', 'description of item', 'product'],
  itemCode: ['code', 'item code', 'itemcode', 'sku', 'article code'],
  category: ['category', 'item category', 'group'],
  unit: ['unit', 'uom', 'units', 'unit of measure'],
  purchasePrice: ['purchase price', 'price', 'rate', 'cost', 'unit price', 'purchaseprice'],
  gst: ['gst', 'gst %', 'gst%', 'tax', 'tax %'],
  hsnCode: ['hsn', 'hsn code', 'hsncode'],
  reorderLevel: ['reorder level', 'reorderlevel', 'reorder', 'min stock', 'minimum stock'],
  warehouse: ['default store', 'store', 'warehouse', 'location'],
  brand: ['brand', 'make'],
  model: ['model', 'model no', 'model number'],
  barcode: ['barcode', 'bar code'],
  description: ['description', 'notes', 'remarks'],
};

function mapHeaders(header) {
  const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return header.map((h) => {
    const n = norm(h);
    const hit = Object.entries(HEADER_ALIASES).find(([, names]) => names.includes(n));
    return hit ? hit[0] : null;
  });
}

export function ImportItemsDialog({ open, onClose, onDone }) {
  const fileRef = useRef(null);
  const [meta, setMeta] = useState(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [parseError, setParseError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFileName(''); setRows([]); setReport(null); setParseError(''); setBusy(false);
    api.getImportTemplate().then((r) => setMeta(r?.data ?? r)).catch(() => setMeta(null));
  }, [open]);

  const template = () => {
    if (!meta) return;
    const head = meta.columns.map(c => c.label);
    // One filled example row, so the format is obvious without reading a guide.
    const sample = meta.columns.map(c => ({
      name: 'Whiteboard Marker', itemCode: '', category: meta.categories?.[0] || '',
      unit: 'Piece', purchasePrice: '25', gst: '12', hsnCode: '9608',
      reorderLevel: '20', warehouse: meta.warehouses?.[0] || '',
      brand: '', model: '', barcode: '', description: '',
    }[c.key] ?? ''));
    const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    saveFile('inventory-items-template.csv', [head, sample].map(r => r.map(esc).join(',')).join('\n'));
    toast.success('Template saved — fill it in and bring it back here');
  };

  const take = useCallback(async (file) => {
    if (!file) return;
    setParseError(''); setReport(null); setRows([]);
    setFileName(file.name);
    try {
      const grid = parseCsv(await file.text());
      if (grid.length < 2) { setParseError('That file has a header but no rows.'); return; }
      const keys = mapHeaders(grid[0]);
      if (!keys.includes('name')) {
        setParseError('No "Name" column found. Download the template to see the headings this expects.');
        return;
      }
      const parsed = grid.slice(1).map((cells, i) => {
        const o = { __line: i + 2 };
        keys.forEach((k, c) => { if (k) o[k] = cells[c] ?? ''; });
        return o;
      });
      setRows(parsed);
      setBusy(true);
      // The dry run: this writes nothing and tells us exactly what would happen.
      const res = await api.importItems(parsed, true);
      setReport(res?.data ?? res);
    } catch (e) {
      setParseError(e?.message || 'That file could not be read.');
    } finally { setBusy(false); }
  }, []);

  const commit = async () => {
    setBusy(true);
    try {
      const raw = await api.importItems(rows, false);
      const res = raw?.data ?? raw;
      toast.success(`${count(res.created)} item${res.created === 1 ? '' : 's'} imported`);
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e?.message || 'Nothing was imported');
    } finally { setBusy(false); }
  };

  const problems = useMemo(() => (report?.rows || []).filter(r => r.errors.length), [report]);
  const cautions = useMemo(() => (report?.rows || []).filter(r => !r.errors.length && r.warnings.length), [report]);

  const foot = (
    <>
      <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
      <Btn kind="primary" icon="upload" onClick={commit}
        disabled={busy || !report || !report.valid}>
        {report?.valid ? `Import ${count(report.valid)} item${report.valid === 1 ? '' : 's'}` : 'Import'}
      </Btn>
    </>
  );

  return (
    <Modal
      open={open} onClose={onClose} wide icon="upload" iconTone="violet"
      title="Import Items"
      sub="Bring a spreadsheet of items in at once. Nothing is saved until you have seen what will happen."
      foot={foot}
    >
      {!fileName ? (
        <>
          <div
            className={`inv-drop${drag ? ' is-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}
            onClick={() => fileRef.current?.click()}
            role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
          >
            <strong>Drop a CSV here, or click to choose one</strong>
            <span>Headings are matched loosely — “Item Name”, “Rate” and “Store” all land in the right place.</span>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden
            onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />

          <div className="inv-drop__aside">
            <Btn icon="download" onClick={template} disabled={!meta}>Download the template</Btn>
            {meta ? (
              <span className="inv-dim">
                Categories and stores must already exist. This school has{' '}
                {count(meta.categories.length)} categor{meta.categories.length === 1 ? 'y' : 'ies'} and{' '}
                {count(meta.warehouses.length)} store{meta.warehouses.length === 1 ? '' : 's'}.
              </span>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="inv-imp__file">
            <Badge tone="indigo" icon="fileSheet" square>{fileName}</Badge>
            <Btn size="sm" icon="refresh" onClick={() => { setFileName(''); setRows([]); setReport(null); }}>
              Choose a different file
            </Btn>
          </div>

          {parseError ? <Note tone="danger" title="That file could not be used">{parseError}</Note> : null}
          {busy && !report ? <SkeletonRows rows={4} /> : null}

          {report ? (
            <>
              <div className="inv-imp__sum">
                <div className="inv-imp__stat"><b>{count(report.total)}</b><span>rows read</span></div>
                <div className="inv-imp__stat is-ok"><b>{count(report.valid)}</b><span>ready to import</span></div>
                <div className={`inv-imp__stat${report.invalid ? ' is-bad' : ''}`}>
                  <b>{count(report.invalid)}</b><span>will be skipped</span>
                </div>
              </div>

              {!report.valid ? (
                <Note tone="danger" title="Nothing here can be imported">
                  Every row has a problem. Fix them in the file and bring it back.
                </Note>
              ) : report.invalid ? (
                <Note tone="warn" title={`${count(report.invalid)} row${report.invalid === 1 ? '' : 's'} will be skipped`}>
                  The other {count(report.valid)} will be imported. Nothing is changed for the skipped rows —
                  fix them and import the file again if you want them too.
                </Note>
              ) : (
                <Note tone="ok" title="Every row checks out">
                  {count(report.valid)} item{report.valid === 1 ? '' : 's'} will be created.
                </Note>
              )}

              {problems.length ? (
                <div className="inv-imp__list">
                  <h4>Rows with a problem</h4>
                  {problems.slice(0, 60).map((r) => (
                    <div key={r.line} className="inv-imp__row is-bad">
                      <span className="inv-imp__ln">Line {r.line}</span>
                      <span className="inv-imp__nm">{r.name}</span>
                      <span className="inv-imp__why">{r.errors.join(' · ')}</span>
                    </div>
                  ))}
                  {problems.length > 60 ? (
                    <div className="inv-dim">…and {count(problems.length - 60)} more.</div>
                  ) : null}
                </div>
              ) : null}

              {cautions.length ? (
                <div className="inv-imp__list">
                  <h4>Worth a look</h4>
                  {cautions.slice(0, 20).map((r) => (
                    <div key={r.line} className="inv-imp__row">
                      <span className="inv-imp__ln">Line {r.line}</span>
                      <span className="inv-imp__nm">{r.name}</span>
                      <span className="inv-imp__why">{r.warnings.join(' · ')}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {!busy && !report && !parseError ? (
            <Empty icon="fileSheet" title="Nothing read from that file">
              It had no rows this screen could use.
            </Empty>
          ) : null}
        </>
      )}
    </Modal>
  );
}
