/**
 * Inventory — every form the twelve admin screens open (Sep 29 2026 redesign,
 * to the user's eleven pop-up mockups).
 *
 * All of them are the same dialog: `Wizard` from invWizard.jsx gives the icon
 * header, the numbered step rail, the sectioned form, the preview column and
 * the footer. A form here only supplies its steps, its sections and its
 * submit; nothing lays out its own modal.
 *
 * Validation runs on submit and then live, per field, once a field has been
 * touched — validating everything from the first keystroke marks a form the
 * user has barely started as full of errors.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  Field, Input, Textarea, Select, Btn, IconBtn, Check, Badge, StatusBadge, Note,
  Thumb, Modal, FormGrid, IconPicker, Ico, invalidateMeta,
  money, num, isoDay, count, fmtDate, words, GLYPH_NAMES,
} from './invUI';
import {
  Wizard, Sec, ResetBtn, Affix, Stepper, Readout, Strip, TilePicker, Swatches, COLOURS,
  Counted, SwitchRow, PCard, PHero, PRows, PLines, HL, ItemTable, AddItemRow, Totals,
  Grand, StockChip, RailArt,
} from './invWizard';

/* ── A very small form engine ────────────────────────────────────────────── */

export function useForm(initial, validate) {
  const [values, setValues] = useState(initial);
  const [touched, setTouched] = useState({});
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  // `initial` is rebuilt on every render by its caller, so it is compared by
  // identity only when the row being edited actually changes.
  useEffect(() => { setValues(initial); setTouched({}); setTried(false); }, [initial]);

  const errors = useMemo(() => validate(values) || {}, [values, validate]);
  const set = useCallback((k, v) => {
    setValues(prev => ({ ...prev, [k]: v }));
    setTouched(prev => ({ ...prev, [k]: true }));
  }, []);
  const err = (k) => ((tried || touched[k]) ? errors[k] : undefined);
  const reset = useCallback(() => { setValues(initial); setTouched({}); setTried(false); }, [initial]);

  const submit = async (fn) => {
    setTried(true);
    const first = Object.keys(errors)[0];
    if (first) {
      toast.error(errors[first]);
      const el = document.querySelector(`[data-field="${first}"]`);
      el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
      el?.focus?.({ preventScroll: true });
      return;
    }
    setBusy(true);
    try { await fn(values); } finally { setBusy(false); }
  };
  return { values, set, setValues, err, errors, busy, submit, reset };
}

const opt = (list, labelKey = 'name') =>
  (list || []).map(x => ({ value: String(x._id ?? x.value ?? x), label: x[labelKey] ?? x.label ?? String(x) }));

/** The item the form is working on, out of the shared meta list. */
const itemById = (meta, id) => (meta.items || []).find(i => String(i._id) === String(id)) || null;
/** A reference that may already be populated, as the plain id a Select wants. */
const idOf = (v) => (v && typeof v === 'object' ? String(v._id || '') : (v ? String(v) : ''));
const whById   = (meta, id) => (meta.warehouses || []).find(w => String(w._id) === String(id)) || null;
const catById  = (meta, id) => (meta.categories || []).find(c => String(c._id) === String(id)) || null;

/** Items as options that carry their code, so a picker is not ambiguous. */
const itemOptions = (meta) =>
  (meta.items || []).map(i => ({ value: i._id, label: `${i.name} · ${i.itemCode}` }));

/* ══════════════════════════════════════════════════════════════════════════
   Items
   ══════════════════════════════════════════════════════════════════════════ */

const ITEM_STEPS = [
  { id: 'basic',    title: 'Basic Information', sub: 'Name, code, category' },
  { id: 'pricing',  title: 'Stock & Pricing',   sub: 'Unit, cost, tax, reorder' },
  { id: 'storage',  title: 'Storage Details',   sub: 'Warehouse, rack, bin' },
  { id: 'tracking', title: 'Tracking Options',  sub: 'Batch, serial, expiry' },
  { id: 'extra',    title: 'Additional Information', sub: 'Brand, model, description' },
];
const GST_RATES = ['0', '5', '12', '18', '28'];

export function ItemForm({ open, item, meta = {}, onClose, onDone }) {
  const initial = useMemo(() => ({
    name: item?.name || '',
    itemCode: item?.itemCode || '',
    description: item?.description || '',
    category: item?.categoryId || item?.category?._id || '',
    brand: item?.brand || '',
    model: item?.model || '',
    unit: item?.unit || 'Nos',
    purchasePrice: item?.purchasePrice ?? '',
    gst: item?.gst ?? '',
    hsnCode: item?.hsnCode || '',
    reorderLevel: item?.reorderLevel ?? '',
    warehouse: item?.warehouseId || item?.warehouse?._id || '',
    rack: item?.rack || '', shelf: item?.shelf || '', bin: item?.bin || '',
    barcode: item?.barcode || '',
    trackSerial: !!item?.trackSerial,
    trackBatch: !!item?.trackBatch,
    hasExpiry: !!item?.hasExpiry,
    isAsset: !!item?.isAsset,
    isActive: item?.isActive !== false,
  }), [item]);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Give the item a name';
    if (!v.category) e.category = 'Pick a category';
    if (v.purchasePrice === '' || num(v.purchasePrice) < 0) e.purchasePrice = 'Enter what a unit costs';
    if (v.reorderLevel !== '' && num(v.reorderLevel) < 0) e.reorderLevel = 'A reorder level cannot be negative';
    if (v.gst !== '' && (num(v.gst) < 0 || num(v.gst) > 100)) e.gst = 'GST is a percentage between 0 and 100';
    return e;
  }, []);

  const f = useForm(initial, validate);

  // Picking a category fills what that category sets defaults for, but never
  // overwrites something already typed.
  const pickCategory = (id) => {
    f.set('category', id);
    const c = catById(meta, id);
    if (!c) return;
    if (c.defaultUnit && !f.values.unit) f.set('unit', c.defaultUnit);
    if (c.defaultGst && f.values.gst === '') f.set('gst', String(c.defaultGst));
    if (c.defaultHsnCode && !f.values.hsnCode) f.set('hsnCode', c.defaultHsnCode);
    if (c.defaultWarehouse && !f.values.warehouse) f.set('warehouse', c.defaultWarehouse);
  };

  // A code the school can read, from the category's initials and a count.
  const suggestCode = () => {
    const c = catById(meta, f.values.category);
    const src = (c?.name || f.values.name || 'ITM').replace(/[^A-Za-z ]/g, '').trim();
    const abbr = src.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase() || 'ITM';
    const n = (meta.items || []).filter(i => String(i.itemCode).startsWith(`${abbr}-`)).length + 1;
    f.set('itemCode', `${abbr}-${String(n).padStart(3, '0')}`);
  };

  const save = () => f.submit(async (v) => {
    const body = {
      ...v,
      purchasePrice: num(v.purchasePrice), gst: num(v.gst),
      reorderLevel: num(v.reorderLevel),
      category: v.category || null, warehouse: v.warehouse || null,
    };
    try {
      if (item?._id) await api.updateItem(item._id, body);
      else await api.createItem(body);
      invalidateMeta();
      toast.success(item?._id ? `${v.name} updated` : `${v.name} added to the item master`);
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That item could not be saved'); }
  });

  return (
    <Wizard
      open={open} onClose={onClose} icon="package" iconTone="brown"
      title={item?._id ? 'Edit Item' : 'Add Item'}
      sub="Create a new inventory item. One item can be purchased and issued multiple times."
      steps={ITEM_STEPS}
      railArt={<RailArt name="box" />}
      railNote="Add clear item details to improve inventory tracking and reporting."
      onSubmit={save} submitting={f.busy}
      submitLabel={item?._id ? 'Save changes' : 'Add Item'}
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="basic" n="1" title="Basic Information" sub="Provide the essential details about the item.">
        <FormGrid>
          <Field label="Item name" required error={f.err('name')}>
            <Input data-field="name" value={f.values.name} onChange={(e) => f.set('name', e.target.value)}
              placeholder="e.g. A4 Sheet (White)" autoFocus />
          </Field>
          <Field label="Item code" required={false} hint={item?._id ? undefined : 'Leave blank to auto-generate'}>
            <div className="ivw-withbtn">
              <Input value={f.values.itemCode} onChange={(e) => f.set('itemCode', e.target.value)} placeholder="PAP-001" />
              <IconBtn icon="refresh" label="Suggest a code" onClick={suggestCode} />
            </div>
          </Field>
          <Field label="Category" required error={f.err('category')}>
            <Select data-field="category" value={f.values.category} onChange={pickCategory}
              options={opt(meta.categories)} placeholder="Uncategorised" />
          </Field>
          <Field label="Short description">
            <Textarea rows={2} value={f.values.description} onChange={(e) => f.set('description', e.target.value)}
              placeholder="e.g. 70 GSM, Standard size" />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="pricing" n="2" title="Stock & Pricing" sub="Define unit, cost and tax details.">
        <FormGrid three>
          <Field label="Unit" required>
            <Select value={f.values.unit} onChange={(v) => f.set('unit', v)} options={meta.units || ['Nos']} />
          </Field>
          <Field label="Purchase price (₹)" required error={f.err('purchasePrice')}>
            <Affix icon="rupee">
              <Input data-field="purchasePrice" type="number" min="0" step="0.01" value={f.values.purchasePrice}
                onChange={(e) => f.set('purchasePrice', e.target.value)} placeholder="0.00" />
            </Affix>
          </Field>
          <Field label="GST %" error={f.err('gst')}>
            <Select data-field="gst" value={String(f.values.gst)} onChange={(v) => f.set('gst', v)}
              options={GST_RATES.map(r => ({ value: r, label: `${r}%` }))} placeholder="Select GST %" />
          </Field>
          <Field label="Reorder level" error={f.err('reorderLevel')}
            hint="Below this, item will be shown as low stock" span2>
            <Input data-field="reorderLevel" type="number" min="0" value={f.values.reorderLevel}
              onChange={(e) => f.set('reorderLevel', e.target.value)} placeholder="e.g. 10" />
          </Field>
          <Field label="HSN code">
            <Input value={f.values.hsnCode} onChange={(e) => f.set('hsnCode', e.target.value)} placeholder="e.g. 4820" />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="storage" n="3" title="Storage Details" sub="Set default storage location for this item.">
        <FormGrid three>
          <Field label="Default store">
            <Affix icon="hotel">
              <Select value={f.values.warehouse} onChange={(v) => f.set('warehouse', v)}
                options={opt(meta.warehouses)} placeholder="No default store" />
            </Affix>
          </Field>
          <Field label="Rack"><Input value={f.values.rack} onChange={(e) => f.set('rack', e.target.value)} placeholder="e.g. R1" /></Field>
          <Field label="Shelf"><Input value={f.values.shelf} onChange={(e) => f.set('shelf', e.target.value)} placeholder="e.g. S1" /></Field>
          <Field label="Bin"><Input value={f.values.bin} onChange={(e) => f.set('bin', e.target.value)} placeholder="e.g. B1" /></Field>
        </FormGrid>
      </Sec>

      <Sec id="tracking" n="4" title="Tracking Options" sub="Choose how this item is tracked in inventory.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
          <Check checked={f.values.trackBatch} onChange={(v) => f.set('trackBatch', v)} label="Track batch numbers on receipt" />
          <Check checked={f.values.trackSerial} onChange={(v) => f.set('trackSerial', v)} label="Track serial numbers on receipt" />
          <Check checked={f.values.hasExpiry} onChange={(v) => f.set('hasExpiry', v)} label="Batches carry an expiry date" />
          <Check checked={f.values.isAsset} onChange={(v) => f.set('isAsset', v)} label="Each unit is also tracked individually as an asset" />
        </div>
        {f.values.hasExpiry ? (
          <div style={{ marginTop: 16 }}>
            <Note tone="info" title="Expiry dates are captured on receipt">
              Each goods receipt against a purchase order records its own batch and expiry, so the same item can hold two batches at once.
            </Note>
          </div>
        ) : null}
      </Sec>

      <Sec id="extra" n="5" title="Additional Information" sub="Brand, model and identification.">
        <FormGrid three>
          <Field label="Brand"><Input value={f.values.brand} onChange={(e) => f.set('brand', e.target.value)} /></Field>
          <Field label="Model"><Input value={f.values.model} onChange={(e) => f.set('model', e.target.value)} /></Field>
          <Field label="Barcode">
            <Input value={f.values.barcode} onChange={(e) => f.set('barcode', e.target.value)} />
          </Field>
        </FormGrid>
        {item?._id ? (
          <div style={{ marginTop: 16 }}>
            <Check checked={f.values.isActive} onChange={(v) => f.set('isActive', v)}
              label="Active — can be requested, ordered and issued" />
          </div>
        ) : null}
      </Sec>
    </Wizard>
  );
}

/** The bulk-action dialog behind the Items screen's "Bulk Actions" menu. */
export function BulkItemsForm({ open, action, ids = [], meta = {}, onClose, onDone }) {
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTarget(''); }, [action, open]);

  const needsTarget = action === 'category' || action === 'warehouse';
  const list = action === 'category' ? meta.categories : meta.warehouses;
  const TITLES = {
    activate: 'Activate items', deactivate: 'Deactivate items',
    category: 'Move items to a category', warehouse: 'Move items to a store',
    delete: 'Delete items',
  };

  const run = async () => {
    setBusy(true);
    try {
      const r = await api.bulkItems({ ids, action, [action]: target || undefined });
      toast.success(r?.data?.message || r?.message || 'Done');
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That bulk action could not be applied'); }
    finally { setBusy(false); }
  };

  return (
    <Modal
      open={open} onClose={onClose} slim
      icon={action === 'delete' ? 'bang' : 'layers'} iconTone={action === 'delete' ? 'red' : 'indigo'}
      title={TITLES[action] || 'Bulk action'}
      sub={`${count(ids.length)} item${ids.length === 1 ? '' : 's'} selected`}
      foot={
        <>
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind={action === 'delete' ? 'danger' : 'primary'} onClick={run} disabled={busy || (needsTarget && !target)}>
            {busy ? 'Working…' : 'Apply'}
          </Btn>
        </>
      }
    >
      {needsTarget ? (
        <Field label={action === 'category' ? 'Move to category' : 'Move to store'} required>
          <Select value={target} onChange={setTarget} options={opt(list)} placeholder="Choose one…" />
        </Field>
      ) : null}
      {action === 'delete' ? (
        <Note tone="warn" title="Items still holding stock are kept">
          Deleting an item that has stock would strand its stock rows and its ledger entries, so those are skipped and reported back. Set their stock to zero first if you really mean to remove them.
        </Note>
      ) : null}
      {action === 'deactivate' ? (
        <Note tone="info">A deactivated item stays in reports and past orders; it just cannot be requested, ordered or issued any more.</Note>
      ) : null}
    </Modal>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Stock
   ══════════════════════════════════════════════════════════════════════════ */

const ADJUST_STEPS = [
  { id: 'basic',    title: 'Basic Details', sub: 'Item, store and quantity' },
  { id: 'movement', title: 'Movement Info', sub: 'Type, cost, batch, expiry' },
  { id: 'reason',   title: 'Reason & Notes', sub: 'Why this adjustment' },
];

// The five movements the screen offers, and which way each moves stock.
const ADJUST_TYPES = [
  { value: 'purchase',  label: 'Stock In',   icon: 'arrowUp',    tone: '#16a34a', dir: +1 },
  { value: 'issue',     label: 'Stock Out',  icon: 'arrowDown',  tone: '#dc2626', dir: -1 },
  { value: 'damage',    label: 'Damage',     icon: 'alert',      tone: '#d97706', dir: -1 },
  { value: 'scrap',     label: 'Expired',    icon: 'calendar',   tone: '#dc2626', dir: -1 },
  { value: 'audit',     label: 'Correction', icon: 'pencil',     tone: '#4f46e5', dir: 0 },
];
const ADJUST_REASONS = {
  purchase: ['Goods received outside a purchase order', 'Opening balance', 'Returned by a department', 'Donation received'],
  issue:    ['Consumed without an issue record', 'Taken for an event', 'Transferred out manually'],
  damage:   ['Damaged in storage', 'Damaged in transit', 'Broken during use'],
  scrap:    ['Past its expiry date', 'No longer usable', 'Disposed of'],
  audit:    ['Physical count is higher than the system', 'Physical count is lower than the system', 'Correcting a data-entry mistake'],
};

export function AdjustStockForm({ open, preset, meta = {}, onClose, onDone }) {
  const initial = useMemo(() => ({
    item: preset?.itemId || preset?._id || '',
    warehouse: preset?.warehouseId || '',
    type: 'purchase',
    direction: 'in',
    quantity: 0,
    unitCost: '',
    batchNumber: '',
    expiryDate: '',
    reason: '',
    reference: '',
    note: '',
  }), [preset]);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.item) e.item = 'Pick the item';
    if (!v.warehouse) e.warehouse = 'Pick the store';
    if (!(num(v.quantity) > 0)) e.quantity = 'Quantity must be more than zero';
    if (!v.reason) e.reason = 'Say why this adjustment is being made';
    return e;
  }, []);
  const f = useForm(initial, validate);

  const item = itemById(meta, f.values.item);
  const wh = whById(meta, f.values.warehouse);
  const kind = ADJUST_TYPES.find(t => t.value === f.values.type) || ADJUST_TYPES[0];

  // What is on hand where, so the preview is about this store, not the item.
  const onHand = num(preset?.current ?? item?.onHand);
  const cost = num(f.values.unitCost) || num(item?.purchasePrice);
  const dir = kind.dir !== 0 ? kind.dir : (f.values.direction === 'out' ? -1 : +1);
  const change = dir * num(f.values.quantity);
  const after = Math.max(0, onHand + change);

  const save = () => f.submit(async (v) => {
    try {
      await api.adjustStock({
        item: v.item, warehouse: v.warehouse, type: v.type,
        direction: v.direction,
        quantity: num(v.quantity),
        unitCost: num(v.unitCost) || undefined,
        batchNumber: v.batchNumber,
        expiryDate: v.expiryDate || null,
        note: [v.reason, v.reference && `Ref ${v.reference}`, v.note].filter(Boolean).join(' — '),
      });
      toast.success('Stock adjusted, and the movement is on the ledger');
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That adjustment could not be applied'); }
  });

  const aside = (
    <>
      <PCard title="Item Summary">
        {item ? (
          <>
            <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 12 }}>
              <Thumb src={item.image} icon="box" lg />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '.92rem' }}>{item.name}</strong>
                  <Badge tone="green" square>Active</Badge>
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--inv-muted)' }}>{item.itemCode}</div>
              </div>
            </div>
            <PRows rows={[
              ['Category', catById(meta, item.category)?.name || 'Uncategorised'],
              ['Unit', item.unit],
              ['Current Stock', `${count(onHand)} ${item.unit}`],
              ['Unit Cost', money(cost, { dec: 2 })],
              ['Total Value', money(onHand * cost, { dec: 2 })],
            ]} />
          </>
        ) : <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--inv-muted)' }}>Pick an item and its figures appear here.</p>}
      </PCard>

      <PCard title="Adjustment Preview">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '.78rem', color: 'var(--inv-muted)' }}>New Quantity</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>{count(onHand)} {item?.unit || ''}</div>
          </div>
          <Ico name="arrowRight" size={18} aria-hidden />
          <div style={{ marginLeft: 'auto' }}>
            <HL tone={change > 0 ? 'green' : change < 0 ? 'amber' : undefined}>
              {count(after)} {item?.unit || ''}
            </HL>
          </div>
        </div>
        <PRows rows={[
          ['Change', <span className={change > 0 ? 'inv-strong' : change < 0 ? 'inv-danger' : undefined}>
            {change > 0 ? '+' : ''}{count(change)} {item?.unit || ''}
          </span>],
          ['New Stock Value', money(after * cost, { dec: 2 })],
        ]} />
      </PCard>
    </>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="gauge" title="Adjust Stock"
      sub="Update stock quantity for an item. This creates a new inventory log entry."
      steps={ADJUST_STEPS} aside={aside}
      onSubmit={save} submitting={f.busy} submitLabel="Apply Adjustment"
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="basic" n="1" title="Basic Details" sub="Select the item, store and quantity to adjust.">
        <FormGrid one>
          <Field label="Item" required error={f.err('item')}>
            <Affix icon="package">
              <Select data-field="item" value={f.values.item} onChange={(v) => f.set('item', v)}
                options={itemOptions(meta)} placeholder="Choose an item…" />
            </Affix>
          </Field>
          <Field label="Store / Warehouse" required error={f.err('warehouse')}>
            <Affix icon="hotel">
              <Select data-field="warehouse" value={f.values.warehouse} onChange={(v) => f.set('warehouse', v)}
                options={opt(meta.warehouses)} placeholder="Choose a store…" />
            </Affix>
          </Field>
        </FormGrid>
        <div style={{ marginTop: 15 }}>
          <FormGrid>
            <Field label="Current Stock">
              <Readout icon="boxes" value={count(onHand)} unit={item?.unit || ''} />
            </Field>
            <Field label="Adjust Quantity" required error={f.err('quantity')}>
              <Stepper data-field="quantity" value={f.values.quantity} onChange={(v) => f.set('quantity', v)} min={0} />
            </Field>
          </FormGrid>
        </div>
      </Sec>

      <Sec id="movement" n="2" title="Movement Information" sub="Specify the adjustment type and optional cost/batch details.">
        <Field label="Adjustment Type" required>
          <TilePicker label="Adjustment type" items={ADJUST_TYPES} value={f.values.type}
            onChange={(v) => { f.set('type', v); f.set('reason', ''); }} />
        </Field>
        {f.values.type === 'audit' ? (
          <div style={{ marginTop: 15 }}>
            <Field label="Which way does the count go?">
              <Select value={f.values.direction} onChange={(v) => f.set('direction', v)} options={[
                { value: 'in', label: 'Physical count is higher — add the difference' },
                { value: 'out', label: 'Physical count is lower — remove the difference' },
              ]} />
            </Field>
          </div>
        ) : null}
        <div style={{ marginTop: 15 }}>
          <FormGrid>
            <Field label="Unit Cost (₹)" hint="Used for stock value calculation">
              <Affix icon="rupee">
                <Input type="number" min="0" step="0.01" value={f.values.unitCost}
                  onChange={(e) => f.set('unitCost', e.target.value)} placeholder="0.00" />
              </Affix>
            </Field>
            <Field label="Batch Number">
              <Affix icon="listDots">
                <Input value={f.values.batchNumber} onChange={(e) => f.set('batchNumber', e.target.value)}
                  placeholder="e.g. BATCH-001" />
              </Affix>
            </Field>
            <Field label="Expiry Date">
              <Affix icon="calendar">
                <Input type="date" value={f.values.expiryDate} onChange={(e) => f.set('expiryDate', e.target.value)} />
              </Affix>
            </Field>
          </FormGrid>
        </div>
      </Sec>

      <Sec id="reason" n="3" title="Reason & Notes" sub="Provide a reason for this adjustment. This will be recorded in the activity log.">
        <FormGrid>
          <Field label="Reason" required error={f.err('reason')}>
            <Select data-field="reason" value={f.values.reason} onChange={(v) => f.set('reason', v)}
              options={(ADJUST_REASONS[f.values.type] || []).map(r => ({ value: r, label: r }))}
              placeholder="Select a reason" />
          </Field>
          <Field label="Reference No. (Optional)">
            <Affix icon="fileDoc">
              <Input value={f.values.reference} onChange={(e) => f.set('reference', e.target.value)}
                placeholder="e.g. PO-2026-012" />
            </Affix>
          </Field>
          <Field label="Notes (Optional)" span2>
            <Counted value={f.values.note} onChange={(v) => f.set('note', v)} rows={3} maxLength={500}
              placeholder="e.g. Physical count found 4 more boxes than system held." />
          </Field>
        </FormGrid>
      </Sec>
    </Wizard>
  );
}

const TRANSFER_STEPS = [
  { id: 'what',  title: 'What moves', sub: 'Item and quantity' },
  { id: 'where', title: 'Where it goes', sub: 'From and to' },
];

export function TransferStockForm({ open, preset, meta = {}, onClose, onDone }) {
  const initial = useMemo(() => ({
    item: preset?.itemId || '', from: preset?.warehouseId || '', to: '', quantity: 1, note: '',
  }), [preset]);
  const validate = useCallback((v) => {
    const e = {};
    if (!v.item) e.item = 'Pick the item';
    if (!v.from) e.from = 'Pick where it is now';
    if (!v.to) e.to = 'Pick where it is going';
    if (v.from && v.to && v.from === v.to) e.to = 'Pick a different store to move it to';
    if (!(num(v.quantity) > 0)) e.quantity = 'Quantity must be more than zero';
    return e;
  }, []);
  const f = useForm(initial, validate);
  const item = itemById(meta, f.values.item);

  const save = () => f.submit(async (v) => {
    try {
      await api.transferStock({
        item: v.item, fromWarehouse: v.from, toWarehouse: v.to,
        quantity: num(v.quantity), note: v.note,
      });
      toast.success('Stock transferred');
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That transfer could not be made'); }
  });

  const aside = (
    <PCard title="What this does">
      <PLines lines={[
        ['package', item ? `${item.name} · ${item.itemCode}` : 'Pick an item'],
        ['hotel', whById(meta, f.values.from)?.name || 'Pick where it is now'],
        ['arrowDown', `${count(f.values.quantity)} ${item?.unit || 'units'} move`],
        ['hotel', whById(meta, f.values.to)?.name || 'Pick where it is going'],
      ]} />
      <div style={{ marginTop: 14 }}>
        <Note tone="info">The total on hand does not change — only where it is held.</Note>
      </div>
    </PCard>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="swap" title="Transfer Stock"
      sub="Move units between two stores. The total on hand does not change."
      steps={TRANSFER_STEPS} aside={aside} size="md"
      onSubmit={save} submitting={f.busy} submitLabel="Transfer"
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="what" n="1" title="What moves" sub="Choose the item and how much of it.">
        <FormGrid>
          <Field label="Item" required error={f.err('item')} span2>
            <Affix icon="package">
              <Select data-field="item" value={f.values.item} onChange={(v) => f.set('item', v)}
                options={itemOptions(meta)} placeholder="Choose an item…" />
            </Affix>
          </Field>
          <Field label="Quantity" required error={f.err('quantity')} hint={item ? `In ${item.unit}` : undefined}>
            <Stepper data-field="quantity" value={f.values.quantity} onChange={(v) => f.set('quantity', v)} min={1} />
          </Field>
          <Field label="Note">
            <Input value={f.values.note} onChange={(e) => f.set('note', e.target.value)} placeholder="Moved for the science fair" />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="where" n="2" title="Where it goes" sub="The store it leaves and the store it lands in.">
        <FormGrid>
          <Field label="From store" required error={f.err('from')}>
            <Affix icon="hotel">
              <Select value={f.values.from} onChange={(v) => f.set('from', v)} options={opt(meta.warehouses)} placeholder="Choose…" />
            </Affix>
          </Field>
          <Field label="To store" required error={f.err('to')}>
            <Affix icon="hotel">
              <Select data-field="to" value={f.values.to} onChange={(v) => f.set('to', v)} options={opt(meta.warehouses)} placeholder="Choose…" />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>
    </Wizard>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Requests and purchase orders
   ══════════════════════════════════════════════════════════════════════════ */

const PRIORITIES = [
  { value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' }, { value: 'urgent', label: 'Urgent' },
];
const blankLine = () => ({ item: '', itemName: '', quantity: 1, unit: 'Nos', rate: '', gst: '' });

/** The item cell both line-item tables share: a picker, or the picked item. */
const LineItemCell = ({ line, meta, onPick, freeText, onName }) => {
  const it = itemById(meta, line.item);
  if (!it) {
    return (
      <>
        <Select value={line.item} onChange={onPick} options={itemOptions(meta)}
          placeholder="Choose an item…" />
        {/* A teacher may want something the school has never bought. The
            catalogue cannot contain it yet, so the line carries a name instead
            of an id and whoever approves it decides what to order. */}
        {freeText ? (
          <Input value={line.itemName} onChange={(e) => onName?.(e.target.value)} style={{ marginTop: 6 }}
            placeholder="…or type something not in the list" />
        ) : null}
      </>
    );
  }
  return (
    <span className="inv-cellrow">
      <Thumb src={it.image} icon="box" />
      <span className="inv-cell2">
        <span className="inv-cell2__top inv-trunc">{it.name}</span>
        <span className="inv-cell2__sub">{it.itemCode}</span>
      </span>
    </span>
  );
};

const REQUEST_STEPS = [
  { id: 'details', title: 'Request Details', sub: 'Department, purpose, priority' },
  { id: 'items',   title: 'Items',           sub: 'What is being asked for' },
  { id: 'extra',   title: 'Additional Information', sub: 'Notes and references' },
];

/**
 * One request wizard, two callers.
 *
 * The admin raises a request on a department's behalf and picks from the
 * catalogue. A teacher raises one for themselves and may ask for something the
 * school has never bought — so `freeText` lets a line carry a name instead of
 * an id, and `submit` lets the teacher portal post to its own endpoint.
 */
export function RequestForm({ open, meta = {}, onClose, onDone, freeText = false, submit, title, sub, railNote }) {
  const initial = useMemo(() => ({
    department: '', priority: 'normal', reason: '', notes: '', reference: '',
    items: [blankLine()],
  }), []);
  const usable = useCallback((l) => (freeText ? (l.item || String(l.itemName || '').trim()) : l.item), [freeText]);
  const validate = useCallback((v) => {
    const e = {};
    if (!v.reason.trim()) e.reason = 'Say what the items are for';
    if (!v.items.some(l => usable(l) && num(l.quantity) > 0)) {
      e.items = freeText
        ? 'Add at least one item — pick one from the list or type a name'
        : 'Add at least one item with a quantity';
    }
    return e;
  }, [freeText, usable]);
  const f = useForm(initial, validate);

  const setLine = (i, patch) => f.set('items', f.values.items.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i, id) => {
    const it = itemById(meta, id);
    setLine(i, { item: id, itemName: it?.name || '', unit: it?.unit || 'Nos', rate: it?.purchasePrice ?? '' });
  };
  const total = f.values.items.reduce((s, l) => s + num(l.quantity) * num(l.rate), 0);

  const save = () => f.submit(async (v) => {
    const body = {
      department: v.department || null,
      reason: [v.reason, v.reference && `Ref ${v.reference}`, v.notes].filter(Boolean).join(' — '),
      priority: v.priority,
      items: v.items.filter(l => usable(l) && num(l.quantity) > 0).map(l => ({
        item: l.item || null,
        itemName: l.itemName || itemById(meta, l.item)?.name || '',
        quantity: num(l.quantity), unit: l.unit,
        estimatedPrice: num(l.rate),
      })),
    };
    try {
      await (submit ? submit(body) : api.createRequest(body));
      toast.success('Request raised and sent for approval');
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That request could not be raised'); }
  });

  return (
    <Wizard
      open={open} onClose={onClose} icon="request" iconTone="blue"
      title={title || 'New Request'}
      sub={sub || 'Ask for items on behalf of a department. Nothing is ordered until it is approved.'}
      steps={REQUEST_STEPS}
      railArt={<RailArt name="doc" />}
      railNote={railNote || 'Requests are checked against stock before anybody is asked to buy anything.'} 
      onSubmit={save} submitting={f.busy} submitLabel="Raise Request"
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="details" n="1" title="Request Details" sub="Select the department, purpose and priority for this request.">
        <FormGrid>
          <Field label="Department" required={false}>
            <Affix icon="users">
              <Select value={f.values.department} onChange={(v) => f.set('department', v)}
                options={opt(meta.departments)} placeholder="No department" />
            </Affix>
          </Field>
          <Field label="Priority" required>
            <Affix icon="alert">
              <Select value={f.values.priority} onChange={(v) => f.set('priority', v)} options={PRIORITIES} />
            </Affix>
          </Field>
          <Field label="Purpose" required error={f.err('reason')} span2
            hint="Provide a clear reason for this request (e.g. classroom use, lab activity, event, maintenance etc.)">
            <Affix icon="chat">
              <Input data-field="reason" value={f.values.reason} onChange={(e) => f.set('reason', e.target.value)}
                placeholder="Classroom use for Grade 8 practicals" />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="items" n="2" title="Items" sub="Add the items you want to request. You can add multiple items.">
        <ItemTable
          cols={[
            {
              key: 'item', label: 'Item', className: 'ivw-items__item',
              cell: (l, i) => (
                <LineItemCell line={l} meta={meta} onPick={(id) => pick(i, id)}
                  freeText={freeText} onName={(v) => setLine(i, { itemName: v })} />
              ),
            },
            {
              key: 'stock', label: 'Available Stock', width: 118,
              cell: (l) => {
                const it = itemById(meta, l.item);
                if (!it) return <span className="inv-dim">—</span>;
                // What is FREE, not what is on the shelf: stock already
                // promised to an approved request cannot meet this one.
                const free = it.available ?? Math.max(0, num(it.onHand) - num(it.reserved));
                return <StockChip qty={free} unit={it.unit} low={free <= num(it.reorderLevel)} />;
              },
            },
            {
              key: 'qty', label: 'Quantity', width: 96,
              cell: (l, i) => (
                <Input type="number" min="1" value={l.quantity}
                  onChange={(e) => setLine(i, { quantity: e.target.value })} />
              ),
            },
            {
              key: 'unit', label: 'Unit', width: 106,
              cell: (l, i) => (
                <Select value={l.unit} onChange={(v) => setLine(i, { unit: v })} options={meta.units || ['Nos']} />
              ),
            },
            {
              key: 'rate', label: 'Est. Rate (₹)', width: 120,
              cell: (l, i) => (
                <Input type="number" min="0" step="0.01" value={l.rate}
                  onChange={(e) => setLine(i, { rate: e.target.value })} />
              ),
            },
            {
              key: 'total', label: 'Est. Total (₹)', width: 112,
              cell: (l) => <span className="inv-num">{money(num(l.quantity) * num(l.rate), { sym: '', dec: 2 })}</span>,
            },
            {
              key: 'act', label: 'Actions', className: 'ivw-items__act',
              cell: (_, i) => (
                <IconBtn icon="trash" kind="danger" label="Remove this line"
                  disabled={f.values.items.length === 1}
                  onClick={() => f.set('items', f.values.items.filter((_, j) => j !== i))} />
              ),
            },
          ]}
          rows={f.values.items}
        />
        <AddItemRow onClick={() => f.set('items', [...f.values.items, blankLine()])} />
        {f.err('items') ? <span className="inv-field__err">{f.err('items')}</span> : null}
        <Grand label="Total Estimated Amount" value={money(total, { dec: 2 })} />
      </Sec>

      <Sec id="extra" n="3" title="Additional Information" sub="Add any notes or references to help with approval (optional).">
        <FormGrid>
          <Field label="Notes (Optional)">
            <Affix icon="fileDoc" top>
              <Textarea rows={3} value={f.values.notes} onChange={(e) => f.set('notes', e.target.value)}
                placeholder="Any additional details, specifications or special instructions…" />
            </Affix>
          </Field>
          <Field label="Reference (Optional)">
            <Affix icon="externalLink" top>
              <Textarea rows={3} value={f.values.reference} onChange={(e) => f.set('reference', e.target.value)}
                placeholder="e.g. Event name, class, project, PO reference etc." />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>
    </Wizard>
  );
}

/** Approve, reject or put a request on hold, with the comment the log keeps. */
export function RequestActionForm({ open, request, action, onClose, onDone }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setComment(''); }, [request, action, open]);

  const LOOK = {
    approved: ['check', 'green', 'Approve request', 'Approve'],
    rejected: ['x', 'red', 'Reject request', 'Reject'],
    hold: ['clock', 'amber', 'Put request on hold', 'Put on hold'],
  };
  const [icon, tone, title, label] = LOOK[action] || LOOK.approved;

  const run = async () => {
    if (action === 'rejected' && !comment.trim()) { toast.error('Say why it is being rejected'); return; }
    setBusy(true);
    try {
      await api.actOnRequest(request._id, { action, comment, stage: 'Inventory Admin' });
      toast.success(`${request.requestNumber} ${action === 'hold' ? 'put on hold' : action}`);
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That could not be recorded'); }
    finally { setBusy(false); }
  };

  if (!request) return null;
  return (
    <Modal
      open={open} onClose={onClose} slim icon={icon} iconTone={tone}
      title={title} sub={`${request.requestNumber} · ${request.requestedBy?.name || ''}`}
      foot={
        <>
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn kind={action === 'rejected' ? 'danger' : 'primary'} onClick={run} disabled={busy}>{busy ? 'Saving…' : label}</Btn>
        </>
      }
    >
      <Field label="Comment" required={action === 'rejected'} hint="Recorded against the request and shown to whoever raised it">
        <Counted value={comment} onChange={setComment} rows={4} maxLength={500}
          placeholder={action === 'rejected' ? 'Already covered by PO-2026-018.' : 'Approved for the autumn term.'} />
      </Field>
      {request.checks?.stockAvailable ? (
        <Note tone="warn" title="This is already in stock">
          The items on this request are on hand. Fulfilling it from stock avoids a purchase.
        </Note>
      ) : null}
    </Modal>
  );
}

const ORDER_STEPS = [
  { id: 'details',  title: 'Order Details',  sub: 'Vendor, department, dates' },
  { id: 'items',    title: 'Items',          sub: 'Add items and quantities' },
  { id: 'delivery', title: 'Delivery & Terms', sub: 'Address and conditions' },
  { id: 'review',   title: 'Review & Submit', sub: 'Verify and create order' },
];

export function OrderForm({ open, order, meta = {}, onClose, onDone }) {
  // The same wizard raises an order and edits one. Only an order that has not
  // been committed can be edited — the server refuses anything past
  // `pending_approval` — so the button, the title and the message all change
  // rather than the form.
  const editing = !!order?._id;
  const initial = useMemo(() => (editing ? {
    vendor: idOf(order.vendor), department: idOf(order.department), budget: idOf(order.budget),
    warehouse: idOf(order.warehouse),
    expectedDelivery: order.expectedDelivery ? String(order.expectedDelivery).slice(0, 10) : '',
    priority: 'normal', discount: order.discount ?? '',
    terms: order.terms || '', deliveryAddress: order.deliveryAddress || '',
    items: (order.items || []).length
      ? order.items.map(l => ({
          item: idOf(l.item), itemName: l.itemName || '', quantity: l.quantity ?? '',
          unit: l.unit || 'Nos', rate: l.unitPrice ?? '', gst: l.gst ?? '',
        }))
      : [blankLine()],
  } : {
    vendor: '', department: '', budget: '', warehouse: '',
    expectedDelivery: '', priority: 'normal', discount: '',
    terms: '', deliveryAddress: '',
    items: [blankLine()],
  }), [editing, order]);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.vendor) e.vendor = 'Pick the vendor';
    if (!v.warehouse) e.warehouse = 'Pick the store the goods will arrive at';
    if (!v.expectedDelivery) e.expectedDelivery = 'Give a date the goods are expected';
    if (!v.deliveryAddress.trim()) e.deliveryAddress = 'Say where the goods should be delivered';
    if (!v.items.some(l => l.item && num(l.quantity) > 0)) e.items = 'Add at least one item with a quantity';
    return e;
  }, []);
  const f = useForm(initial, validate);

  const setLine = (i, patch) => f.set('items', f.values.items.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i, id) => {
    const it = itemById(meta, id);
    setLine(i, {
      item: id, itemName: it?.name || '', unit: it?.unit || 'Nos',
      rate: it?.purchasePrice ?? '', gst: it?.gst ?? '',
    });
  };

  const sub = f.values.items.reduce((s, l) => s + num(l.quantity) * num(l.rate), 0);
  const tax = f.values.items.reduce((s, l) => s + num(l.quantity) * num(l.rate) * (num(l.gst) / 100), 0);
  const grand = Math.max(0, sub + tax - num(f.values.discount));
  const gstPct = sub ? Math.round((tax / sub) * 100) : 0;

  const save = () => f.submit(async (v) => {
    const body = {
      vendor: v.vendor, department: v.department || null, budget: v.budget || null,
      warehouse: v.warehouse, expectedDelivery: v.expectedDelivery || null,
      discount: num(v.discount), terms: v.terms, deliveryAddress: v.deliveryAddress,
      items: v.items.filter(l => l.item && num(l.quantity) > 0).map(l => ({
        item: l.item, itemName: l.itemName, quantity: num(l.quantity),
        unit: l.unit, unitPrice: num(l.rate), gst: num(l.gst),
      })),
    };
    try {
      if (editing) {
        await api.updateOrder(order._id, body);
        toast.success(`${order.poNumber || 'The order'} has been updated`);
      } else {
        await api.createOrder(body);
        toast.success('Purchase order created and sent for approval');
      }
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e?.message || `That purchase order could not be ${editing ? 'updated' : 'created'}`);
    }
  });

  return (
    <Wizard
      open={open} onClose={onClose} icon="cart" iconTone="violet"
      title={editing ? `Edit ${order.poNumber || 'Purchase Order'}` : 'Create Purchase Order'}
      sub={editing
        ? 'Change an order that has not been approved yet. The order number stays the same.'
        : 'Raise a purchase order for required items. It will be sent to the vendor for approval.'}
      steps={ORDER_STEPS}
      onSubmit={save} submitting={f.busy}
      submitLabel={editing ? 'Save Changes' : 'Create Purchase Order'}
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="details" n="1" title="Order Details" sub="Select vendor, department and basic information for this purchase order.">
        <FormGrid>
          <Field label="Vendor" required error={f.err('vendor')}>
            <Affix icon="building">
              <Select data-field="vendor" value={f.values.vendor} onChange={(v) => f.set('vendor', v)}
                options={opt(meta.vendors)} placeholder="Choose a vendor..." />
            </Affix>
          </Field>
          <Field label="Department">
            <Affix icon="users">
              <Select value={f.values.department} onChange={(v) => f.set('department', v)}
                options={opt(meta.departments)} placeholder="No department" />
            </Affix>
          </Field>
          <Field label="Receiving Store" required error={f.err('warehouse')}>
            <Affix icon="hotel">
              <Select data-field="warehouse" value={f.values.warehouse} onChange={(v) => f.set('warehouse', v)}
                options={opt(meta.warehouses)} placeholder="Choose a store..." />
            </Affix>
          </Field>
          <Field label="Charge to Budget" hint="Optional — pins the spend to one budget">
            <Affix icon="wallet">
              <Select value={f.values.budget} onChange={(v) => f.set('budget', v)}
                options={opt(meta.budgets)} placeholder="Match by department and category" />
            </Affix>
          </Field>
          <Field label="Expected Delivery Date" required error={f.err('expectedDelivery')}>
            <Affix icon="calendar">
              <Input data-field="expectedDelivery" type="date" min={isoDay(new Date())}
                value={f.values.expectedDelivery} onChange={(e) => f.set('expectedDelivery', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Priority">
            <Affix icon="alert">
              <Select value={f.values.priority} onChange={(v) => f.set('priority', v)} options={PRIORITIES} />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="items" n="2" title="Items" sub="Add the items you want to purchase.">
        <ItemTable
          cols={[
            { key: 'n', label: '#', className: 'ivw-items__num', cell: (_, i) => i + 1 },
            {
              key: 'item', label: 'Item', className: 'ivw-items__item',
              cell: (l, i) => <LineItemCell line={l} meta={meta} onPick={(id) => pick(i, id)} />,
            },
            {
              key: 'stock', label: 'Available Stock', width: 118,
              cell: (l) => {
                const it = itemById(meta, l.item);
                if (!it) return <span className="inv-dim">—</span>;
                return <StockChip qty={it.onHand ?? 0} unit={it.unit} low={num(it.onHand) <= num(it.reorderLevel)} />;
              },
            },
            {
              key: 'qty', label: 'Qty', width: 92,
              cell: (l, i) => <Input type="number" min="1" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />,
            },
            {
              key: 'unit', label: 'Unit', width: 108,
              cell: (l, i) => <Select value={l.unit} onChange={(v) => setLine(i, { unit: v })} options={meta.units || ['Nos']} />,
            },
            {
              key: 'rate', label: 'Rate (₹)', width: 116,
              cell: (l, i) => <Input type="number" min="0" step="0.01" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} />,
            },
            {
              key: 'gst', label: 'GST %', width: 96,
              cell: (l, i) => (
                <Select value={String(l.gst)} onChange={(v) => setLine(i, { gst: v })}
                  options={GST_RATES.map(r => ({ value: r, label: `${r}%` }))} placeholder="—" />
              ),
            },
            {
              key: 'total', label: 'Total (₹)', width: 118,
              cell: (l) => <strong className="inv-num">{money(num(l.quantity) * num(l.rate) * (1 + num(l.gst) / 100))}</strong>,
            },
            {
              key: 'act', label: 'Actions', className: 'ivw-items__act',
              cell: (_, i) => (
                <IconBtn icon="trash" kind="danger" label="Remove this line"
                  disabled={f.values.items.length === 1}
                  onClick={() => f.set('items', f.values.items.filter((_, j) => j !== i))} />
              ),
            },
          ]}
          rows={f.values.items}
        />
        <AddItemRow onClick={() => f.set('items', [...f.values.items, blankLine()])}>Add Item</AddItemRow>
        {f.err('items') ? <span className="inv-field__err">{f.err('items')}</span> : null}
        <div style={{ display: 'flex', marginTop: 16 }}>
          <Totals
            rows={[
              ['Sub total', money(sub, { dec: 2 })],
              [`GST (${gstPct}%)`, money(tax, { dec: 2 })],
              ...(num(f.values.discount) ? [['Discount', `−${money(num(f.values.discount), { dec: 2 })}`]] : []),
            ]}
            grand={['Grand total', money(grand, { dec: 2 })]}
          />
        </div>
      </Sec>

      <Sec id="delivery" n="3" title="Delivery & Terms" sub="Provide delivery address and additional terms.">
        <FormGrid>
          <Field label="Delivery Address" required error={f.err('deliveryAddress')}>
            <Affix icon="mapPin" top>
              <Textarea data-field="deliveryAddress" rows={3} value={f.values.deliveryAddress}
                onChange={(e) => f.set('deliveryAddress', e.target.value)} placeholder="Enter delivery address..." />
            </Affix>
          </Field>
          <Field label="Terms & Conditions (Optional)">
            <Affix icon="fileDoc" top>
              <Textarea rows={3} value={f.values.terms} onChange={(e) => f.set('terms', e.target.value)}
                placeholder="e.g. Payment within 30 days, damaged goods to be replaced within 7 days, etc." />
            </Affix>
          </Field>
          <Field label="Discount (₹)">
            <Affix icon="rupee">
              <Input type="number" min="0" step="0.01" value={f.values.discount}
                onChange={(e) => f.set('discount', e.target.value)} placeholder="0.00" />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="review" n="4" title="Review & Submit" sub="Verify the order before it is created.">
        <FormGrid>
          <Field label="Vendor"><Readout icon="building" value={opt(meta.vendors).find(o => o.value === f.values.vendor)?.label || 'Not chosen'} /></Field>
          <Field label="Receiving store"><Readout icon="hotel" value={whById(meta, f.values.warehouse)?.name || 'Not chosen'} /></Field>
          <Field label="Items"><Readout icon="package" value={count(f.values.items.filter(l => l.item).length)} unit="lines" /></Field>
          <Field label="Grand total"><Readout icon="rupee" value={money(grand, { dec: 2 })} /></Field>
        </FormGrid>
        <div style={{ marginTop: 16 }}>
          <Note tone="info" title="Nothing is committed yet">
            The order is raised as <strong>pending approval</strong>. It is only placed with the vendor once somebody approves it.
          </Note>
        </div>
      </Sec>
    </Wizard>
  );
}

/** The goods-received note: what actually turned up, line by line. */
export function ReceiveForm({ open, order, onClose, onDone }) {
  const [lines, setLines] = useState([]);
  const [invoice, setInvoice] = useState({ number: '', date: '', amount: '' });
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!open || !order?._id) { setDetail(null); return undefined; }
    let alive = true;
    api.getOrder(order._id).then((r) => {
      if (!alive) return;
      const o = r?.data ?? r;
      setDetail(o);
      setLines((o.items || []).map(li => ({
        itemId: String(li._id), name: li.itemName,
        ordered: num(li.quantity), already: num(li.receivedQty),
        receivedQty: Math.max(0, num(li.quantity) - num(li.receivedQty)),
        batchNumber: '', expiryDate: '',
      })));
      setInvoice({
        number: o.invoice?.number || '',
        date: o.invoice?.date ? isoDay(o.invoice.date) : '',
        amount: o.invoice?.amount || '',
      });
    }).catch(() => { if (alive) toast.error('That purchase order could not be loaded'); });
    return () => { alive = false; };
  }, [open, order]);

  const setLine = (i, patch) => setLines(ls => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const run = async () => {
    const send = lines.filter(l => num(l.receivedQty) > 0);
    if (!send.length) { toast.error('Enter what actually arrived'); return; }
    const over = send.find(l => num(l.receivedQty) > l.ordered - l.already);
    if (over) { toast.error(`${over.name}: more than the ${count(over.ordered - over.already)} still outstanding`); return; }
    setBusy(true);
    try {
      await api.receiveOrder(order._id, {
        lines: send.map(l => ({
          itemId: l.itemId, receivedQty: num(l.receivedQty),
          batchNumber: l.batchNumber, expiryDate: l.expiryDate || null,
        })),
        invoice: invoice.number || invoice.amount
          ? { ...invoice, amount: num(invoice.amount), date: invoice.date || null }
          : undefined,
      });
      toast.success('Goods received and added to stock');
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That receipt could not be recorded'); }
    finally { setBusy(false); }
  };

  const outstanding = lines.reduce((s, l) => s + Math.max(0, l.ordered - l.already), 0);
  const arriving = lines.reduce((s, l) => s + num(l.receivedQty), 0);

  const aside = (
    <>
      <PCard title="Order Summary">
        <PRows rows={[
          ['Purchase order', order?.poNumber],
          ['Vendor', order?.vendor?.name],
          ['Receiving store', order?.warehouse?.name],
          ['Expected', order?.expectedDelivery ? fmtDate(order.expectedDelivery) : '—'],
          ['Still outstanding', `${count(outstanding)} units`],
        ]} />
        <div style={{ marginTop: 12 }}>
          <HL tone="green" icon="package">{count(arriving)} arriving now</HL>
        </div>
      </PCard>
      <Note tone="info" title="Stock goes up as you record this">
        Each line becomes a purchase movement on the ledger at the order&rsquo;s own rate, which is what keeps the weighted average cost honest.
      </Note>
    </>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="package" iconTone="amber" title="Receive Goods"
      sub={order ? `${order.poNumber} · ${order.vendor?.name || ''}` : ''}
      steps={[
        { id: 'lines', title: 'What arrived', sub: 'Quantities, batch, expiry' },
        { id: 'invoice', title: 'Invoice', sub: 'Number, date and amount' },
      ]}
      aside={aside}
      onSubmit={run} submitting={busy} submitLabel="Record receipt"
    >
      <Sec id="lines" n="1" title="What arrived" sub="Enter the quantity received against each line of the order.">
        {!detail ? <p style={{ color: 'var(--inv-muted)' }}>Loading the order…</p> : (
          <ItemTable
            cols={[
              { key: 'name', label: 'Item', cell: (l) => <strong>{l.name}</strong> },
              {
                key: 'out', label: 'Outstanding',
                cell: (l) => {
                  const left = l.ordered - l.already;
                  return <Badge tone={left ? 'amber' : 'green'} square>{left ? `${count(left)} left` : 'Fully received'}</Badge>;
                },
              },
              {
                key: 'got', label: 'Received now', width: 120,
                cell: (l, i) => (
                  <Input type="number" min="0" max={l.ordered - l.already} value={l.receivedQty}
                    onChange={(e) => setLine(i, { receivedQty: e.target.value })} />
                ),
              },
              {
                key: 'batch', label: 'Batch number', width: 150,
                cell: (l, i) => <Input value={l.batchNumber} onChange={(e) => setLine(i, { batchNumber: e.target.value })} />,
              },
              {
                key: 'exp', label: 'Expiry date', width: 160,
                cell: (l, i) => <Input type="date" value={l.expiryDate} onChange={(e) => setLine(i, { expiryDate: e.target.value })} />,
              },
            ]}
            rows={lines}
            rowKey={(l) => l.itemId}
          />
        )}
      </Sec>

      <Sec id="invoice" n="2" title="Invoice" sub="Record the vendor's invoice against this receipt.">
        <FormGrid three>
          <Field label="Invoice number">
            <Affix icon="fileDoc">
              <Input value={invoice.number} onChange={(e) => setInvoice(s => ({ ...s, number: e.target.value }))} />
            </Affix>
          </Field>
          <Field label="Invoice date">
            <Affix icon="calendar">
              <Input type="date" value={invoice.date} onChange={(e) => setInvoice(s => ({ ...s, date: e.target.value }))} />
            </Affix>
          </Field>
          <Field label="Amount (₹)">
            <Affix icon="rupee">
              <Input type="number" min="0" step="0.01" value={invoice.amount}
                onChange={(e) => setInvoice(s => ({ ...s, amount: e.target.value }))} />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>
    </Wizard>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Issue and return
   ══════════════════════════════════════════════════════════════════════════ */

const ISSUE_STEPS = [
  { id: 'item',   title: 'Item Details', sub: 'Select item and quantity' },
  { id: 'who',    title: 'Recipient',    sub: 'Teacher, student or staff' },
  { id: 'extra',  title: 'Additional Details', sub: 'Department, condition, return' },
  { id: 'review', title: 'Review & Submit', sub: 'Confirm and issue' },
];
const RECIPIENTS = [
  { value: 'teacher',    label: 'Teacher',    icon: 'user' },
  { value: 'student',    label: 'Student',    icon: 'student' },
  { value: 'staff',      label: 'Staff',      icon: 'users' },
  { value: 'class',      label: 'Class',      icon: 'school' },
  { value: 'department', label: 'Department', icon: 'building' },
];
const CONDITIONS_OUT = [
  { value: 'Good', label: 'Good' }, { value: 'Used', label: 'Used' }, { value: 'Fair', label: 'Fair' },
];

export function IssueForm({ open, preset, meta = {}, onClose, onDone }) {
  const initial = useMemo(() => ({
    item: preset?.item?._id || '', warehouse: preset?.warehouse?._id || '',
    recipientType: 'teacher', issuedToUser: '', issuedToName: '', classLabel: '',
    department: '', quantity: 1, expectedReturn: '', conditionOut: 'Good',
    returnable: true, note: '',
  }), [preset]);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.item) e.item = 'Pick the item';
    if (!v.warehouse) e.warehouse = 'Pick the store it comes out of';
    if (!(num(v.quantity) > 0)) e.quantity = 'Quantity must be more than zero';
    const named = ['student', 'teacher', 'staff'].includes(v.recipientType);
    if (named && !v.issuedToUser && !v.issuedToName.trim()) e.issuedToName = 'Say who is receiving it';
    if (v.recipientType === 'class' && !v.classLabel.trim()) e.classLabel = 'Name the class';
    if (v.recipientType === 'department' && !v.department) e.department = 'Pick the department';
    if (v.returnable && !v.expectedReturn) e.expectedReturn = 'Give a date it is expected back';
    return e;
  }, []);
  const f = useForm(initial, validate);

  const item = itemById(meta, f.values.item);
  const wh = whById(meta, f.values.warehouse);
  const named = ['student', 'teacher', 'staff'].includes(f.values.recipientType);
  // An issue comes out of ONE store, so the figure that governs it is what is
  // free THERE — not the total across every store, and not the on-hand figure,
  // which may include stock already promised to an approved request.
  const at = item?.byWarehouse?.[f.values.warehouse] || null;
  const onHand = num(at ? at.onHand : item?.onHand);
  const reserved = num(at ? at.reserved : item?.reserved);
  const free = Math.max(0, onHand - reserved);
  const short = item && f.values.warehouse && num(f.values.quantity) > free;

  const save = () => f.submit(async (v) => {
    try {
      await api.createIssue({
        item: v.item, warehouse: v.warehouse, quantity: num(v.quantity),
        issuedToUser: v.issuedToUser || null,
        issuedToName: v.issuedToName
          || (meta.staff || []).find(s => String(s._id) === String(v.issuedToUser))?.name || '',
        recipientType: v.recipientType, classLabel: v.classLabel,
        department: v.department || null,
        expectedReturn: v.returnable ? v.expectedReturn : null,
        conditionOut: v.conditionOut, returnable: v.returnable, note: v.note,
      });
      toast.success('Issued, and stock has come down by that much');
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That issue could not be recorded'); }
  });

  const aside = (
    <>
      <PCard title="Item Summary">
        {item ? (
          <>
            <div style={{ display: 'flex', gap: 11, alignItems: 'center', marginBottom: 12 }}>
              <Thumb src={item.image} icon="box" lg />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '.92rem' }}>{item.name}</strong>
                  <StatusBadge value={free <= 0 ? 'out_of_stock' : free <= num(item.reorderLevel) ? 'low_stock' : 'in_stock'} noIcon />
                </div>
                <div style={{ fontSize: '.78rem', color: 'var(--inv-muted)' }}>{item.itemCode}</div>
              </div>
            </div>
            <PRows rows={[
              ['Category', catById(meta, item.category)?.name || 'Uncategorised'],
              ['Unit', item.unit],
              [wh ? `On hand at ${wh.name}` : 'On hand (all stores)', `${count(onHand)} ${item.unit}`],
              ...(reserved > 0 ? [['Reserved', `${count(reserved)} ${item.unit}`]] : []),
              ['Free to issue', `${count(free)} ${item.unit}`],
              ['Reorder Level', `${count(item.reorderLevel)} ${item.unit}`],
            ]} />
            <div style={{ marginTop: 12 }}>
              <HL icon="package">
                Issuing {count(f.values.quantity)} {item.unit}
                {wh ? ` from ${wh.name}${wh.code ? ` (${wh.code})` : ''}` : ''}
              </HL>
            </div>
            {short ? (
              <div style={{ marginTop: 10 }}>
                <Note tone="warn" title="More than is free to issue">
                  {wh ? `${wh.name} has ${count(free)} ${item.unit} free` : `Only ${count(free)} ${item.unit} are free`}
                  {reserved > 0 ? ` — ${count(reserved)} of the ${count(onHand)} on hand is reserved against approved requests.` : '.'}
                </Note>
              </div>
            ) : null}
          </>
        ) : <p style={{ margin: 0, fontSize: '.85rem', color: 'var(--inv-muted)' }}>Pick an item and its figures appear here.</p>}
      </PCard>
      {f.values.returnable ? (
        <Note tone="warn" title="Return Tracking">
          This item will be tracked as an outstanding return. You can mark it as returned later.
        </Note>
      ) : (
        <Note tone="info" title="A consumable">
          This will not be tracked as an outstanding return — it is gone once issued.
        </Note>
      )}
    </>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="send" iconTone="blue" title="Issue Item"
      sub="Takes units out of a store and records who has them."
      steps={ISSUE_STEPS} aside={aside}
      onSubmit={save} submitting={f.busy} submitLabel="Issue Item"
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="item" n="1" title="Item Details" sub="Select the item, store and quantity to issue.">
        <FormGrid one>
          <Field label="Item" required error={f.err('item')}>
            <Affix icon="package">
              <Select data-field="item" value={f.values.item} onChange={(v) => f.set('item', v)}
                options={itemOptions(meta)} placeholder="Choose an item…" />
            </Affix>
          </Field>
          <Field label="From store" required error={f.err('warehouse')}>
            <Affix icon="hotel">
              <Select data-field="warehouse" value={f.values.warehouse} onChange={(v) => f.set('warehouse', v)}
                options={opt(meta.warehouses)} placeholder="Choose a store…" />
            </Affix>
          </Field>
        </FormGrid>
        {item ? (
          <div style={{ marginTop: 14 }}>
            <Strip items={[
              ['Available Stock', <StockChip qty={onHand} unit={item.unit} low={onHand <= num(item.reorderLevel)} />],
              ['Reorder Level', `${count(item.reorderLevel)} ${item.unit}`],
              ['Unit', item.unit],
            ]} />
          </div>
        ) : null}
        <div style={{ marginTop: 15 }}>
          <FormGrid>
            <Field label="Quantity" required error={f.err('quantity')}>
              <Stepper data-field="quantity" value={f.values.quantity} onChange={(v) => f.set('quantity', v)} min={1} />
            </Field>
            <Field label="Unit">
              <Input value={item?.unit || ''} placeholder="Nos" readOnly disabled />
            </Field>
          </FormGrid>
        </div>
      </Sec>

      <Sec id="who" n="2" title="Issue To" sub="Select who will receive the item.">
        <TilePicker label="Kind of recipient" items={RECIPIENTS} value={f.values.recipientType}
          onChange={(v) => f.set('recipientType', v)} />
        <div style={{ marginTop: 15 }}>
          {named ? (
            <FormGrid>
              <Field label={words(f.values.recipientType)} required={!f.values.issuedToName}>
                <Affix icon="user">
                  <Select value={f.values.issuedToUser}
                    onChange={(v) => { f.set('issuedToUser', v); if (v) f.set('issuedToName', ''); }}
                    options={(meta.staff || []).map(s => ({ value: s._id, label: s.name }))}
                    placeholder={`Choose a ${f.values.recipientType}...`} />
                </Affix>
              </Field>
              <Field label="Or enter name (optional)" error={f.err('issuedToName')}>
                <Input data-field="issuedToName" value={f.values.issuedToName} disabled={!!f.values.issuedToUser}
                  onChange={(e) => f.set('issuedToName', e.target.value)} placeholder="e.g. Rohan Mehta" />
              </Field>
            </FormGrid>
          ) : f.values.recipientType === 'class' ? (
            <Field label="Class / section" required error={f.err('classLabel')}>
              <Affix icon="school">
                <Input data-field="classLabel" value={f.values.classLabel}
                  onChange={(e) => f.set('classLabel', e.target.value)} placeholder="e.g. Class 5B" />
              </Affix>
            </Field>
          ) : (
            <Field label="Department" required error={f.err('department')}>
              <Affix icon="building">
                <Select data-field="department" value={f.values.department} onChange={(v) => f.set('department', v)}
                  options={opt(meta.departments)} placeholder="Choose a department…" />
              </Affix>
            </Field>
          )}
        </div>
      </Sec>

      <Sec id="extra" n="3" title="Additional Information" sub="Provide department, item condition and return details.">
        <FormGrid>
          <Field label="Department">
            <Affix icon="building">
              <Select value={f.values.department} onChange={(v) => f.set('department', v)}
                options={opt(meta.departments)} placeholder="No department" />
            </Affix>
          </Field>
          <Field label="Condition going out" required>
            <Select value={f.values.conditionOut} onChange={(v) => f.set('conditionOut', v)} options={CONDITIONS_OUT} />
          </Field>
        </FormGrid>
        <div style={{ marginTop: 15 }}>
          <SwitchRow
            checked={f.values.returnable} onChange={(v) => f.set('returnable', v)}
            title="Comes back? (Track as outstanding return)"
            note="Enable if the item is temporary and will be returned."
          />
        </div>
        <div style={{ marginTop: 15 }}>
          <FormGrid>
            {f.values.returnable ? (
              <Field label="Expected return date" required error={f.err('expectedReturn')}>
                <Affix icon="calendar">
                  <Input data-field="expectedReturn" type="date" min={isoDay(new Date())}
                    value={f.values.expectedReturn} onChange={(e) => f.set('expectedReturn', e.target.value)} />
                </Affix>
              </Field>
            ) : null}
            <Field label="Note (Optional)" span2={!f.values.returnable}>
              <Affix icon="fileDoc">
                <Input value={f.values.note} onChange={(e) => f.set('note', e.target.value)}
                  placeholder="e.g. For the Grade 8 practical" />
              </Affix>
            </Field>
          </FormGrid>
        </div>
      </Sec>

      <Sec id="review" n="4" title="Review & Submit" sub="Confirm what is going out and to whom.">
        <FormGrid>
          <Field label="Item"><Readout icon="package" value={item ? item.name : 'Not chosen'} /></Field>
          <Field label="Quantity"><Readout icon="boxes" value={count(f.values.quantity)} unit={item?.unit || ''} /></Field>
          <Field label="Goes to"><Readout icon="user" value={
            f.values.issuedToName
            || (meta.staff || []).find(s => String(s._id) === String(f.values.issuedToUser))?.name
            || f.values.classLabel
            || opt(meta.departments).find(o => o.value === f.values.department)?.label
            || 'Not chosen'
          } /></Field>
          <Field label="Back by"><Readout icon="calendar" value={f.values.returnable ? (f.values.expectedReturn ? fmtDate(f.values.expectedReturn) : 'Not set') : 'Not returnable'} /></Field>
        </FormGrid>
      </Sec>
    </Wizard>
  );
}

const RETURN_CONDITIONS = [
  { value: 'good', label: 'Good' }, { value: 'used', label: 'Used' },
  { value: 'partially_used', label: 'Partially used' }, { value: 'repair_needed', label: 'Needs repair' },
  { value: 'damaged', label: 'Damaged' }, { value: 'lost', label: 'Lost' },
];
const CONDITION_DOT = {
  good: '#22c55e', used: '#f59e0b', partially_used: '#f59e0b',
  repair_needed: '#8b5cf6', damaged: '#ef4444', lost: '#ef4444',
};

export function ReturnForm({ open, txn, meta = {}, onClose, onDone }) {
  const outstanding = num(txn?.outstanding) || num(txn?.quantity);
  const initial = useMemo(() => ({
    returnQty: outstanding, condition: 'good', restock: true, note: '',
  }), [outstanding]);
  const validate = useCallback((v) => {
    const e = {};
    if (!(num(v.returnQty) > 0)) e.returnQty = 'How many are coming back?';
    if (num(v.returnQty) > outstanding) e.returnQty = `Only ${count(outstanding)} are outstanding`;
    return e;
  }, [outstanding]);
  const f = useForm(initial, validate);
  const writeOff = ['damaged', 'lost'].includes(f.values.condition);

  const save = () => f.submit(async (v) => {
    try {
      await api.returnIssue(txn.issueId, {
        returnQty: num(v.returnQty), condition: v.condition,
        restock: writeOff ? false : v.restock, note: v.note,
      });
      toast.success('Return recorded');
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That return could not be recorded'); }
  });

  if (!txn) return null;

  // No step rail: the left column is the record being returned, which is what
  // the person needs in front of them before they type anything.
  const master = itemById(meta, txn.item?._id);
  // Derived, not assumed: the panel prints Current Stock right underneath, and
  // a green "In Stock" over a zero is the kind of thing nobody believes twice.
  const stockState = !master ? null
    : num(master.onHand) <= 0 ? 'out_of_stock'
    : (num(master.reorderLevel) > 0 && num(master.onHand) <= num(master.reorderLevel)) ? 'low_stock'
    : 'in_stock';
  const aside = (
    <PCard title="Item Details">
      <div className="ivw-subject">
        <Thumb src={txn.item?.image} icon={txn.item?.category?.icon || 'box'} lg />
        <div className="ivw-subject__t">
          <div className="ivw-subject__name">
            <strong title={txn.item?.name}>{txn.item?.name}</strong>
            {stockState ? <StatusBadge value={stockState} noIcon /> : null}
          </div>
          <div className="ivw-subject__sub">{txn.item?.itemCode}</div>
          {txn.item?.category?.name ? (
            <div className="ivw-subject__sub">Category: {txn.item.category.name}</div>
          ) : null}
        </div>
      </div>
      <PRows rows={[
        ...(master ? [
          ['Current Stock', `${count(master.onHand ?? 0)} ${master.unit}`],
          ['Reorder Level', `${count(master.reorderLevel)} ${master.unit}`],
        ] : []),
        ['Unit', txn.item?.unit],
        ['Location', txn.warehouse ? `${txn.warehouse.name}${txn.warehouse.code ? ` (${txn.warehouse.code})` : ''}` : '—'],
        ['Issued to', txn.user?.name],
        ['Issue Reference', txn.txnNumber],
        ['Issue Date', fmtDate(txn.date)],
      ]} />
      <div style={{ marginTop: 14 }}>
        <Note tone="tip">
          You are returning items that were previously issued. This quantity will be added back to the stock.
        </Note>
      </div>
    </PCard>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="undo" iconTone="violet" title="Return Item"
      sub="Add the quantity to the store and record the return information."
      aside={aside} asideSide="left" size="md"
      onSubmit={save} submitting={f.busy} submitLabel="Record return" submitIcon="reply"
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="details" n="1" title="Return Details" sub="Enter the quantity and condition of the returned item.">
        <FormGrid>
          <Field label="Quantity returned" required error={f.err('returnQty')} hint={`${count(outstanding)} outstanding`}>
            <Stepper data-field="returnQty" value={f.values.returnQty} onChange={(v) => f.set('returnQty', v)}
              min={1} max={outstanding} />
          </Field>
          <Field label="Condition" required>
            <Affix dot={CONDITION_DOT[f.values.condition]}>
              <Select value={f.values.condition} onChange={(v) => f.set('condition', v)} options={RETURN_CONDITIONS} />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="stock" n="2" title="Stock Update" sub="Choose whether to add the items back to the store.">
        {writeOff ? (
          <Note tone="warn" title={f.values.condition === 'lost' ? 'This will be written off as lost' : 'This will be written off as damaged'}>
            The return is recorded and then immediately written back out, so the ledger shows both the return and the loss. Stock does not rise.
          </Note>
        ) : (
          <>
            <SwitchRow
              plain
              checked={f.values.restock} onChange={(v) => f.set('restock', v)}
              title="Put back into stock"
              note={f.values.restock ? 'Yes — add it back to the store it came from' : 'No — hold it aside'}
            />
            {f.values.restock ? (
              <div style={{ marginTop: 15 }}>
                <Field label="Return to store" hint="Items will be added to this store.">
                  <Readout icon="hotel" value={txn.warehouse ? `${txn.warehouse.name}${txn.warehouse.code ? ` (${txn.warehouse.code})` : ''}` : '—'} />
                </Field>
              </div>
            ) : null}
          </>
        )}
      </Sec>

      <Sec id="extra" n="3" title="Additional Information" sub="Add any notes about the return (optional).">
        <Field label="Note (Optional)">
          <Counted value={f.values.note} onChange={(v) => f.set('note', v)} rows={3} maxLength={500}
            placeholder="e.g. Returned in good condition, box opened, etc." />
        </Field>
      </Sec>
    </Wizard>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Assets
   ══════════════════════════════════════════════════════════════════════════ */

const ASSET_STEPS = [
  { id: 'basic',    title: 'Basic Details',  sub: 'Name, category and identity' },
  { id: 'purchase', title: 'Purchase Information', sub: 'Cost and date' },
  { id: 'cover',    title: 'Cover and Service', sub: 'Warranty, AMC and insurance' },
  { id: 'where',    title: 'Location and Ownership', sub: 'Store, assignment and status' },
  { id: 'extra',    title: 'Additional Information', sub: 'Condition, notes and files' },
];
const ASSET_STATUSES = [
  { value: 'in_use', label: 'In Use' }, { value: 'in_store', label: 'In Store' },
  { value: 'under_repair', label: 'Under Maintenance' }, { value: 'out_of_service', label: 'Out of Service' },
  { value: 'retired', label: 'Retired' },
];
const ASSET_CONDITIONS = [
  { value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' },
  { value: 'poor', label: 'Poor' }, { value: 'damaged', label: 'Damaged' },
];

export function AssetForm({ open, asset, meta = {}, onClose, onDone }) {
  const initial = useMemo(() => ({
    name: asset?.name || '', assetCode: asset?.assetCode || '',
    category: asset?.categoryId || '', item: asset?.item || '',
    serialNumber: asset?.serialNumber || '',
    purchaseDate: asset?.purchaseDate ? isoDay(asset.purchaseDate) : '',
    purchaseCost: asset?.purchaseCost ?? '',
    currentValue: asset?.currentValue ?? '',
    vendor: '', invoiceRef: '',
    warrantyExpiry: asset?.warrantyExpiry ? isoDay(asset.warrantyExpiry) : '',
    amcExpiry: asset?.amcExpiry ? isoDay(asset.amcExpiry) : '',
    insuranceExpiry: asset?.insuranceExpiry ? isoDay(asset.insuranceExpiry) : '',
    nextMaintenance: asset?.nextMaintenance ? isoDay(asset.nextMaintenance) : '',
    warehouse: asset?.warehouse?._id || '',
    location: asset?.location || '',
    assignedTo: asset?.assignedTo?._id || '',
    assignedName: asset?.assignedTo?._id ? '' : (asset?.assignedTo?.name || ''),
    condition: asset?.condition || 'good',
    status: asset?.state === 'under_maintenance' ? 'under_repair' : (asset?.state || 'in_store'),
    note: asset?.note || '',
  }), [asset]);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Give the asset a name';
    if (!v.assetCode.trim()) e.assetCode = 'Give it an asset code';
    if (!v.category) e.category = 'Pick a category';
    if (!v.purchaseDate) e.purchaseDate = 'When was it bought?';
    if (v.purchaseCost === '' || num(v.purchaseCost) < 0) e.purchaseCost = 'Enter what it cost';
    if (v.warrantyExpiry && v.purchaseDate && v.warrantyExpiry < v.purchaseDate) e.warrantyExpiry = 'The warranty ends before it was bought';
    return e;
  }, []);
  const f = useForm(initial, validate);
  const cat = catById(meta, f.values.category);

  const save = () => f.submit(async (v) => {
    const body = {
      ...v,
      purchaseCost: num(v.purchaseCost),
      currentValue: num(v.currentValue) || num(v.purchaseCost),
      category: v.category || null, item: v.item || null,
      warehouse: v.warehouse || null, assignedTo: v.assignedTo || null,
      purchaseDate: v.purchaseDate || null,
      warrantyExpiry: v.warrantyExpiry || null, amcExpiry: v.amcExpiry || null,
      insuranceExpiry: v.insuranceExpiry || null, nextMaintenance: v.nextMaintenance || null,
      note: [v.note, v.invoiceRef && `Invoice ${v.invoiceRef}`].filter(Boolean).join(' — '),
    };
    try {
      if (asset?._id) await api.updateAsset(asset._id, body);
      else await api.createAsset(body);
      toast.success(asset?._id ? `${v.name} updated` : `${v.name} added to the asset register`);
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That asset could not be saved'); }
  });

  const aside = (
    <PCard title="Asset Preview">
      <PHero
        icon={cat?.icon || 'monitor'} iconTone="pink"
        image={asset?.image}
        name={f.values.name || 'New asset'}
        chips={<Badge tone={f.values.status === 'retired' ? 'slate' : 'green'} square>
          {ASSET_STATUSES.find(s => s.value === f.values.status)?.label || 'In Store'}
        </Badge>}
      />
      <div style={{ marginTop: 14 }}>
        <PRows rows={[
          ['Asset Code', f.values.assetCode || '—'],
          ['Category', cat?.name || 'Not chosen'],
          ['Serial Number', f.values.serialNumber || '—'],
          ['Location', f.values.location || 'Not set'],
          ['Assigned To', f.values.assignedName
            || (meta.staff || []).find(s => String(s._id) === String(f.values.assignedTo))?.name
            || 'Not assigned'],
          ['Purchase Date', f.values.purchaseDate ? fmtDate(f.values.purchaseDate) : '—'],
          ['Current Value', money(num(f.values.currentValue) || num(f.values.purchaseCost), { dec: 2 })],
        ]} />
      </div>
    </PCard>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="monitor" iconTone="pink"
      title={asset?._id ? 'Edit Asset' : 'Add Asset'}
      sub="Register a physical asset and start tracking its details, location and lifecycle."
      steps={ASSET_STEPS} aside={aside}
      onSubmit={save} submitting={f.busy} submitLabel={asset?._id ? 'Save changes' : 'Add Asset'}
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="basic" n="1" title="Basic Details" sub="Provide the asset name, category and identity information.">
        <FormGrid>
          <Field label="Asset name" required error={f.err('name')} span2>
            <Input data-field="name" value={f.values.name} onChange={(e) => f.set('name', e.target.value)}
              placeholder="Computer (Dell OptiPlex)" autoFocus />
          </Field>
          <Field label="Asset code" required error={f.err('assetCode')} hint="Unique code for this asset">
            <Input data-field="assetCode" value={f.values.assetCode} onChange={(e) => f.set('assetCode', e.target.value)} placeholder="IT-001" />
          </Field>
          <Field label="Category" required error={f.err('category')}>
            <Affix icon="folder">
              <Select data-field="category" value={f.values.category} onChange={(v) => f.set('category', v)}
                options={opt(meta.categories)} placeholder="Choose a category…" />
            </Affix>
          </Field>
          <Field label="Serial number" hint="Manufacturer serial number (if available)">
            <Input value={f.values.serialNumber} onChange={(e) => f.set('serialNumber', e.target.value)} placeholder="7X3K9F2" />
          </Field>
          <Field label="Linked inventory item" hint="Link to an inventory item (optional)">
            <Select value={f.values.item} onChange={(v) => f.set('item', v)}
              options={itemOptions(meta)} placeholder="Not linked" />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="purchase" n="2" title="Purchase Information" sub="Add purchase cost and date for accounting and tracking.">
        <FormGrid three>
          <Field label="Purchase date" required error={f.err('purchaseDate')}>
            <Affix icon="calendar">
              <Input data-field="purchaseDate" type="date" value={f.values.purchaseDate}
                onChange={(e) => f.set('purchaseDate', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Purchase cost (₹)" required error={f.err('purchaseCost')}>
            <Affix icon="rupee">
              <Input data-field="purchaseCost" type="number" min="0" step="0.01" value={f.values.purchaseCost}
                onChange={(e) => f.set('purchaseCost', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Current value (₹)" hint="Defaults to purchase cost">
            <Affix icon="rupee">
              <Input type="number" min="0" step="0.01" value={f.values.currentValue}
                onChange={(e) => f.set('currentValue', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Supplier / Vendor">
            <Affix icon="building">
              <Select value={f.values.vendor} onChange={(v) => f.set('vendor', v)}
                options={opt(meta.vendors)} placeholder="Choose a vendor..." />
            </Affix>
          </Field>
          <Field label="Invoice / Reference No.">
            <Affix icon="fileDoc">
              <Input value={f.values.invoiceRef} onChange={(e) => f.set('invoiceRef', e.target.value)} placeholder="INV-2026-118" />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="cover" n="3" title="Cover and Service"
        sub="Track warranty, AMC and insurance details. Anything due inside 60 days is reported on the Assets screen.">
        <FormGrid>
          <Field label="Warranty expires" error={f.err('warrantyExpiry')}>
            <Affix icon="calendar">
              <Input data-field="warrantyExpiry" type="date" value={f.values.warrantyExpiry}
                onChange={(e) => f.set('warrantyExpiry', e.target.value)} />
            </Affix>
          </Field>
          <Field label="AMC expires">
            <Affix icon="calendar">
              <Input type="date" value={f.values.amcExpiry} onChange={(e) => f.set('amcExpiry', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Insurance expires">
            <Affix icon="calendar">
              <Input type="date" value={f.values.insuranceExpiry} onChange={(e) => f.set('insuranceExpiry', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Next maintenance">
            <Affix icon="calendar">
              <Input type="date" value={f.values.nextMaintenance} onChange={(e) => f.set('nextMaintenance', e.target.value)} />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="where" n="4" title="Location and Ownership" sub="Where the asset sits and who is responsible for it.">
        <FormGrid>
          <Field label="Store">
            <Affix icon="hotel">
              <Select value={f.values.warehouse} onChange={(v) => f.set('warehouse', v)}
                options={opt(meta.warehouses)} placeholder="No store" />
            </Affix>
          </Field>
          <Field label="Location" hint="The room it actually sits in">
            <Affix icon="mapPin">
              <Input value={f.values.location} onChange={(e) => f.set('location', e.target.value)} placeholder="Computer Lab" />
            </Affix>
          </Field>
          <Field label="Assigned to">
            <Affix icon="user">
              <Select value={f.values.assignedTo}
                onChange={(v) => { f.set('assignedTo', v); if (v) f.set('assignedName', ''); }}
                options={(meta.staff || []).map(s => ({ value: s._id, label: s.name }))} placeholder="Not assigned" />
            </Affix>
          </Field>
          <Field label="Or a name">
            <Input value={f.values.assignedName} disabled={!!f.values.assignedTo}
              onChange={(e) => f.set('assignedName', e.target.value)} placeholder="Driver (Ramesh)" />
          </Field>
          <Field label="Status">
            <Select value={f.values.status} onChange={(v) => f.set('status', v)} options={ASSET_STATUSES} />
          </Field>
          <Field label="Condition">
            <Select value={f.values.condition} onChange={(v) => f.set('condition', v)} options={ASSET_CONDITIONS} />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="extra" n="5" title="Additional Information" sub="Anything else worth recording against this asset.">
        <Field label="Note">
          <Counted value={f.values.note} onChange={(v) => f.set('note', v)} rows={3} maxLength={500}
            placeholder="e.g. Bought with the 2026 lab refresh." />
        </Field>
      </Sec>
    </Wizard>
  );
}

/** The quick status / condition change from an asset row's menu. */
export function AssetStateForm({ open, asset, meta = {}, onClose, onDone }) {
  const initial = useMemo(() => ({
    status: asset?.state === 'under_maintenance' ? 'under_repair' : (asset?.state || 'in_store'),
    condition: asset?.condition || 'good',
    location: asset?.location || '',
    assignedTo: asset?.assignedTo?._id || '',
    nextMaintenance: asset?.nextMaintenance ? isoDay(asset.nextMaintenance) : '',
  }), [asset]);
  const f = useForm(initial, useCallback(() => ({}), []));
  const unassigned = ['retired', 'out_of_service', 'in_store'].includes(f.values.status);

  const save = () => f.submit(async (v) => {
    try {
      await api.setAssetState(asset._id, {
        ...v,
        assignedName: (meta.staff || []).find(s => String(s._id) === String(v.assignedTo))?.name || '',
        nextMaintenance: v.nextMaintenance || null,
      });
      toast.success(`${asset.name} updated`);
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That change could not be saved'); }
  });

  if (!asset) return null;
  return (
    <Wizard
      open={open} onClose={onClose} icon="wrench" iconTone="amber" title="Update Asset"
      sub={`${asset.assetCode} · ${asset.name}`}
      steps={[
        { id: 'state', title: 'Status & condition', sub: 'Where it stands' },
        { id: 'where', title: 'Location & holder', sub: 'Room and person' },
      ]}
      size="md"
      onSubmit={save} submitting={f.busy} submitLabel="Save"
    >
      <Sec id="state" n="1" title="Status & condition" sub="What state the asset is in.">
        <FormGrid>
          <Field label="Status"><Select value={f.values.status} onChange={(v) => f.set('status', v)} options={ASSET_STATUSES} /></Field>
          <Field label="Condition"><Select value={f.values.condition} onChange={(v) => f.set('condition', v)} options={ASSET_CONDITIONS} /></Field>
          <Field label="Next maintenance" span2>
            <Affix icon="calendar">
              <Input type="date" value={f.values.nextMaintenance} onChange={(e) => f.set('nextMaintenance', e.target.value)} />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>
      <Sec id="where" n="2" title="Location & holder" sub="Where it sits and who has it.">
        <FormGrid>
          <Field label="Location">
            <Affix icon="mapPin">
              <Input value={f.values.location} onChange={(e) => f.set('location', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Assigned to"
            hint={unassigned ? 'Taking it out of use also clears whoever had it' : undefined}>
            <Affix icon="user">
              <Select value={f.values.assignedTo} onChange={(v) => f.set('assignedTo', v)} disabled={unassigned}
                options={(meta.staff || []).map(s => ({ value: s._id, label: s.name }))} placeholder="Not assigned" />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>
    </Wizard>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Master data: vendors, categories, warehouses, departments, budgets
   ══════════════════════════════════════════════════════════════════════════ */

const VENDOR_STEPS = [
  { id: 'business', title: 'Business Details', sub: 'Name, category and basics' },
  { id: 'contact',  title: 'Contact Information', sub: 'Person, address and communication' },
  { id: 'tax',      title: 'Tax & Payment', sub: 'GST, PAN and bank details' },
  { id: 'terms',    title: 'Terms & Status', sub: 'Payment terms and preferences' },
];
const BUSINESS_TYPES = ['Supplier', 'Manufacturer', 'Distributor', 'Service Provider', 'Contractor'];
const STATES = ['Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Odisha',
  'Punjab', 'Rajasthan', 'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

export function VendorForm({ open, vendor, meta = {}, onClose, onDone }) {
  const [again, setAgain] = useState(false);
  const initial = useMemo(() => ({
    name: vendor?.name || '', code: '', businessType: 'Supplier',
    vendorCategory: vendor?.vendorCategory || '', supplies: vendor?.supplies || '',
    tagline: vendor?.tagline || '',
    contactPerson: vendor?.contactPerson || '', phone: vendor?.phone || '',
    email: vendor?.email || '', website: vendor?.website || '',
    address: vendor?.address || '', city: vendor?.city || '',
    state: vendor?.state || '', pincode: vendor?.pincode || '',
    gstNumber: vendor?.gstNumber || '', pan: vendor?.pan || '',
    bankName: vendor?.bankDetails?.bankName || '',
    accountName: vendor?.bankDetails?.accountName || '',
    accountNumber: vendor?.bankDetails?.accountNumber || '',
    ifsc: vendor?.bankDetails?.ifsc || '',
    paymentTerms: vendor?.paymentTerms || '',
    preferred: !!vendor?.preferred, isActive: vendor?.isActive !== false,
  }), [vendor]);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Give the vendor a name';
    if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) e.email = 'That does not look like an email address';
    if (v.phone && !/^[+\d][\d\s-]{6,17}$/.test(v.phone.trim())) e.phone = 'That does not look like a phone number';
    if (v.gstNumber && !/^[0-9A-Z]{15}$/i.test(v.gstNumber.trim())) e.gstNumber = 'A GSTIN is 15 characters';
    if (v.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/i.test(v.pan.trim())) e.pan = 'A PAN is five letters, four digits and a letter';
    if (v.pincode && !/^\d{6}$/.test(v.pincode.trim())) e.pincode = 'A PIN code is six digits';
    return e;
  }, []);
  const f = useForm(initial, validate);

  const save = () => f.submit(async (v) => {
    const body = {
      name: v.name, vendorCategory: v.vendorCategory, supplies: v.supplies, tagline: v.tagline,
      contactPerson: v.contactPerson, phone: v.phone, email: v.email, website: v.website,
      address: v.address, city: v.city, state: v.state, pincode: v.pincode,
      gstNumber: v.gstNumber.toUpperCase(), pan: v.pan.toUpperCase(),
      paymentTerms: v.paymentTerms, preferred: v.preferred, isActive: v.isActive,
      bankDetails: {
        bankName: v.bankName, accountName: v.accountName,
        accountNumber: v.accountNumber, ifsc: v.ifsc.toUpperCase(),
      },
    };
    try {
      if (vendor?._id) await api.updateVendor(vendor._id, body);
      else await api.createVendor(body);
      invalidateMeta();
      toast.success(vendor?._id ? `${v.name} updated` : `${v.name} added`);
      onDone?.();
      if (again && !vendor?._id) f.reset(); else onClose();
    } catch (e) { toast.error(e?.message || 'That vendor could not be saved'); }
  });

  const aside = (
    <>
      <PCard title="Vendor Preview">
        <PHero
          round icon="building" iconTone="orange"
          name={f.values.name || 'New vendor'}
          chips={
            <>
              {f.values.code ? <Badge tone="slate" square>{f.values.code}</Badge> : null}
              <Badge tone="indigo" square>{f.values.businessType}</Badge>
            </>
          }
        />
        <div style={{ marginTop: 14 }}>
          <PLines lines={[
            ['mail', f.values.supplies || f.values.vendorCategory || 'No category set'],
            ['user', f.values.contactPerson || 'No contact added'],
            ['mapPin', [f.values.address, f.values.city].filter(Boolean).join(', ') || 'No address added'],
          ]} />
        </div>
      </PCard>
      <Note tone="info">
        You can update additional details like tax information, payment terms and bank details in the next steps.
      </Note>
    </>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="building" iconTone="orange"
      title={vendor?._id ? 'Edit Vendor' : 'Add Vendor'}
      sub="Register a new vendor or supplier to streamline your procurement and payments."
      steps={VENDOR_STEPS} aside={aside} nextFlow
      onSubmit={save} submitting={f.busy} submitLabel={vendor?._id ? 'Save changes' : 'Add Vendor'}
      left={vendor?._id ? <ResetBtn onClick={f.reset} disabled={f.busy} />
        : <Check checked={again} onChange={setAgain} label="Save and add another vendor" />}
    >
      <Sec id="business" n="1" title="Business Details" sub="Basic information about the vendor and what they supply.">
        <FormGrid>
          <Field label="Company name" required error={f.err('name')}>
            <Input data-field="name" value={f.values.name} onChange={(e) => f.set('name', e.target.value)}
              placeholder="e.g. S.K. Stationery" autoFocus />
          </Field>
          <Field label="Vendor code" hint="Unique code for this vendor (auto or manual)">
            <Input value={f.values.code} onChange={(e) => f.set('code', e.target.value)} placeholder="VEN-001" />
          </Field>
          <Field label="Business type">
            <Select value={f.values.businessType} onChange={(v) => f.set('businessType', v)} options={BUSINESS_TYPES} />
          </Field>
          <Field label="Category">
            <Affix icon="folder">
              <Input value={f.values.vendorCategory} onChange={(e) => f.set('vendorCategory', e.target.value)}
                placeholder="Stationery" />
            </Affix>
          </Field>
          <Field label="What they supply">
            <Input value={f.values.supplies} onChange={(e) => f.set('supplies', e.target.value)}
              placeholder="e.g. Stationery, Books, Lab Equipment" />
          </Field>
          <Field label="Tagline (Optional)">
            <Input value={f.values.tagline} onChange={(e) => f.set('tagline', e.target.value)}
              placeholder="e.g. Stationery & Office Supplies" />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="contact" n="2" title="Contact Information" sub="Primary contact person and address for this vendor.">
        <FormGrid>
          <Field label="Contact person">
            <Affix icon="user">
              <Input value={f.values.contactPerson} onChange={(e) => f.set('contactPerson', e.target.value)}
                placeholder="e.g. Rohan Mehta" />
            </Affix>
          </Field>
          <Field label="Phone number" error={f.err('phone')}>
            <Affix icon="phone">
              <Input data-field="phone" value={f.values.phone} onChange={(e) => f.set('phone', e.target.value)}
                placeholder="+91 98765 43210" />
            </Affix>
          </Field>
          <Field label="Email address" error={f.err('email')}>
            <Affix icon="mail">
              <Input data-field="email" type="email" value={f.values.email}
                onChange={(e) => f.set('email', e.target.value)} placeholder="vendor@example.com" />
            </Affix>
          </Field>
          <Field label="Website (Optional)">
            <Affix icon="externalLink">
              <Input value={f.values.website} onChange={(e) => f.set('website', e.target.value)}
                placeholder="https://www.example.com" />
            </Affix>
          </Field>
          <Field label="Address" span2>
            <Affix icon="mapPin">
              <Input value={f.values.address} onChange={(e) => f.set('address', e.target.value)}
                placeholder="Shop No. 12, Park Street, Kolkata" />
            </Affix>
          </Field>
          <Field label="City"><Input value={f.values.city} onChange={(e) => f.set('city', e.target.value)} placeholder="Kolkata" /></Field>
          <Field label="State">
            <Select value={f.values.state} onChange={(v) => f.set('state', v)} options={STATES} placeholder="Choose a state…" />
          </Field>
          <Field label="PIN code" error={f.err('pincode')}>
            <Input data-field="pincode" inputMode="numeric" value={f.values.pincode}
              onChange={(e) => f.set('pincode', e.target.value)} placeholder="700016" />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="tax" n="3" title="Tax & Payment" sub="Add tax registration and bank details for invoices and payments.">
        <FormGrid>
          <Field label="GST number" error={f.err('gstNumber')}>
            <Input data-field="gstNumber" value={f.values.gstNumber}
              onChange={(e) => f.set('gstNumber', e.target.value.toUpperCase())} placeholder="19ABCDE1234F1Z5" />
          </Field>
          <Field label="PAN" error={f.err('pan')}>
            <Input data-field="pan" value={f.values.pan}
              onChange={(e) => f.set('pan', e.target.value.toUpperCase())} placeholder="ABCDE1234F" />
          </Field>
          <Field label="Bank name">
            <Affix icon="bank">
              <Input value={f.values.bankName} onChange={(e) => f.set('bankName', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Account name">
            <Input value={f.values.accountName} onChange={(e) => f.set('accountName', e.target.value)} />
          </Field>
          <Field label="Account number">
            <Input value={f.values.accountNumber} onChange={(e) => f.set('accountNumber', e.target.value)} />
          </Field>
          <Field label="IFSC">
            <Input value={f.values.ifsc} onChange={(e) => f.set('ifsc', e.target.value.toUpperCase())} />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="terms" n="4" title="Terms & Status" sub="Payment terms and how this vendor is treated on new orders.">
        <FormGrid>
          <Field label="Payment terms">
            <Input value={f.values.paymentTerms} onChange={(e) => f.set('paymentTerms', e.target.value)} placeholder="30 Days" />
          </Field>
        </FormGrid>
        <div style={{ display: 'grid', gap: 12, marginTop: 15 }}>
          <SwitchRow checked={f.values.preferred} onChange={(v) => f.set('preferred', v)}
            title="Preferred vendor" note="Shortlisted for this kind of purchase." />
          <SwitchRow checked={f.values.isActive} onChange={(v) => f.set('isActive', v)}
            title="Active" note="Inactive vendors cannot be used on new purchase orders." />
        </div>
      </Sec>
    </Wizard>
  );
}

const CATEGORY_STEPS = [
  { id: 'basic',    title: 'Basic Details', sub: 'Name, description and icon' },
  { id: 'defaults', title: 'Defaults',      sub: 'Unit, tax and store' },
  { id: 'review',   title: 'Review',        sub: 'Confirm and create' },
];
const CATEGORY_ICONS = ['monitor', 'layers', 'laptop', 'book', 'flask', 'ball', 'shirt', 'wrench', 'medical', 'bulb', 'drop', 'folder', 'box', 'boxes', 'bus', 'broom'];

export function CategoryForm({ open, category, meta = {}, onClose, onDone }) {
  const initial = useMemo(() => ({
    name: category?.name || '', description: category?.description || '',
    parent: category?.parentId || category?.parent?._id || '',
    tagline: '',
    icon: category?.icon || 'monitor', color: category?.color || COLOURS[0],
    defaultUnit: category?.defaultUnit || '', defaultGst: category?.defaultGst ?? '',
    defaultHsnCode: category?.defaultHsnCode || '', defaultWarehouse: category?.defaultWarehouse || '',
    isActive: category?.isActive !== false,
  }), [category]);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Give the category a name';
    if (category?._id && v.parent && String(v.parent) === String(category._id)) e.parent = 'A category cannot be its own parent';
    if (v.defaultGst !== '' && (num(v.defaultGst) < 0 || num(v.defaultGst) > 100)) e.defaultGst = 'GST is a percentage between 0 and 100';
    return e;
  }, [category]);
  const f = useForm(initial, validate);
  const [moreIcons, setMoreIcons] = useState(false);

  const parents = (meta.categories || []).filter(c => String(c._id) !== String(category?._id) && !c.parent);

  const save = () => f.submit(async (v) => {
    const body = {
      ...v, defaultGst: num(v.defaultGst),
      parent: v.parent || null, defaultWarehouse: v.defaultWarehouse || null,
    };
    try {
      if (category?._id) await api.updateCategory(category._id, body);
      else await api.createCategory(body);
      invalidateMeta();
      toast.success(category?._id ? `${v.name} updated` : `${v.name} added`);
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That category could not be saved'); }
  });

  const aside = (
    <>
      <PCard title="Category Preview">
        <PHero
          icon={f.values.icon} iconTone="indigo"
          name={f.values.name || 'New category'}
          sub={f.values.tagline || f.values.description?.slice(0, 60)}
          chips={<Badge tone="slate" square>
            {f.values.parent
              ? `Under ${parents.find(p => String(p._id) === String(f.values.parent))?.name || 'a category'}`
              : 'Top level category'}
          </Badge>}
        />
        <div style={{ marginTop: 16 }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '.85rem', fontWeight: 700 }}>Default settings</h4>
          <PRows rows={[
            ['Unit', f.values.defaultUnit || 'No default'],
            ['GST', `${num(f.values.defaultGst)}%`],
            ['Store', whById(meta, f.values.defaultWarehouse)?.name || 'No default'],
            ['HSN', f.values.defaultHsnCode || 'Not set'],
          ]} />
        </div>
      </PCard>
      <Note tone="info">You can change these defaults anytime from the category settings.</Note>
    </>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="folder" iconTone="sky"
      title={category?._id ? 'Edit Category' : 'Add Category'}
      sub="Create a new category to organise your inventory items."
      steps={CATEGORY_STEPS} aside={aside}
      onSubmit={save} submitting={f.busy} submitLabel={category?._id ? 'Save changes' : 'Create category'}
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="basic" n="1" title="Basic Details" sub="Name your category and choose how it appears.">
        <FormGrid one>
          <Field label="Category name" required error={f.err('name')}>
            <Input data-field="name" value={f.values.name} onChange={(e) => f.set('name', e.target.value)}
              placeholder="e.g. Audio Visual" autoFocus />
          </Field>
          <Field label="Description">
            <Counted value={f.values.description} onChange={(v) => f.set('description', v)} rows={3} maxLength={250}
              placeholder="Briefly describe what items belong to this category..." />
          </Field>
        </FormGrid>
        <div style={{ marginTop: 15 }}>
          <FormGrid>
            <Field label="Parent category" error={f.err('parent')} hint="Create a sub-category under an existing category.">
              <Select data-field="parent" value={f.values.parent} onChange={(v) => f.set('parent', v)}
                options={opt(parents)} placeholder="None — top level" />
            </Field>
            <Field label="Tagline (Optional)" hint="A short label shown under the category name.">
              <Input value={f.values.tagline} onChange={(e) => f.set('tagline', e.target.value)}
                placeholder="e.g. Projectors, speakers, screens" />
            </Field>
          </FormGrid>
        </div>
        <div style={{ marginTop: 18 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: '.95rem', fontWeight: 700 }}>Icon &amp; colour</h4>
          <p style={{ margin: '0 0 12px', fontSize: '.84rem', color: 'var(--inv-muted)' }}>
            Choose an icon and colour to easily identify this category.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <IconPicker value={f.values.icon} onChange={(v) => f.set('icon', v)}
              options={moreIcons ? GLYPH_NAMES : CATEGORY_ICONS.slice(0, 9)} />
            {!moreIcons ? (
              <IconBtn icon="dots" label="More icons" onClick={() => setMoreIcons(true)} />
            ) : null}
          </div>
          <div style={{ marginTop: 14 }}>
            <span className="inv-field__label" style={{ display: 'block', marginBottom: 8 }}>Colour</span>
            <Swatches value={f.values.color} onChange={(v) => f.set('color', v)} />
          </div>
        </div>
      </Sec>

      <Sec id="defaults" n="2" title="Defaults for new items"
        sub="Set default values that will be applied to items added in this category.">
        <FormGrid three>
          <Field label="Default unit">
            <Select value={f.values.defaultUnit} onChange={(v) => f.set('defaultUnit', v)}
              options={meta.units || []} placeholder="No default" />
          </Field>
          <Field label="Default GST %" error={f.err('defaultGst')}>
            <Affix suffix="%">
              <Input data-field="defaultGst" type="number" min="0" max="100" value={f.values.defaultGst}
                onChange={(e) => f.set('defaultGst', e.target.value)} placeholder="0" />
            </Affix>
          </Field>
          <Field label="Default store" hint="Items will be added to this store by default.">
            <Select value={f.values.defaultWarehouse} onChange={(v) => f.set('defaultWarehouse', v)}
              options={opt(meta.warehouses)} placeholder="No default store" />
          </Field>
          <Field label="Default HSN code" hint="Used for tax reporting.">
            <Input value={f.values.defaultHsnCode} onChange={(e) => f.set('defaultHsnCode', e.target.value)} placeholder="e.g. 8504" />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="review" n="3" title="Review" sub="Confirm the category before it is created.">
        <FormGrid>
          <Field label="Name"><Readout icon={f.values.icon} value={f.values.name || 'Not named'} /></Field>
          <Field label="Sits under"><Readout icon="folder" value={
            f.values.parent ? (parents.find(p => String(p._id) === String(f.values.parent))?.name || '—') : 'Top level'
          } /></Field>
        </FormGrid>
        {category?._id ? (
          <div style={{ marginTop: 15 }}>
            <SwitchRow checked={f.values.isActive} onChange={(v) => f.set('isActive', v)}
              title="Active" note="Inactive categories cannot be chosen for new items." />
          </div>
        ) : null}
      </Sec>
    </Wizard>
  );
}

const WAREHOUSE_STEPS = [
  { id: 'basic',    title: 'Basic Details',    sub: 'Name, type and location' },
  { id: 'capacity', title: 'Capacity & Access', sub: 'Stock limits and control' },
  { id: 'contact',  title: 'Contact & Settings', sub: 'In charge and status' },
];
const WAREHOUSE_TYPES = [
  { value: 'main', label: 'Main Store' },
  { value: 'department', label: 'Department Store' },
  { value: 'secondary', label: 'Secondary Store' },
];

export function WarehouseForm({ open, warehouse, meta = {}, onClose, onDone }) {
  const initial = useMemo(() => ({
    name: warehouse?.name || '', code: warehouse?.code || '',
    type: warehouse?.type || 'main',
    department: '', description: warehouse?.description || '',
    campus: warehouse?.campus || 'Main Campus', location: warehouse?.location || '',
    capacity: warehouse?.capacity ?? '', lowCapacityAt: warehouse?.lowCapacityAt ?? 80,
    contactPerson: warehouse?.contactPerson || '', phone: warehouse?.phone || '',
    isActive: warehouse?.isActive !== false,
  }), [warehouse]);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Give the store a name';
    if (v.capacity !== '' && num(v.capacity) < 0) e.capacity = 'A capacity cannot be negative';
    if (num(v.lowCapacityAt) < 1 || num(v.lowCapacityAt) > 100) e.lowCapacityAt = 'A percentage between 1 and 100';
    return e;
  }, []);
  const f = useForm(initial, validate);

  const save = () => f.submit(async (v) => {
    const body = { ...v, capacity: num(v.capacity), lowCapacityAt: num(v.lowCapacityAt) };
    try {
      if (warehouse?._id) await api.updateWarehouse(warehouse._id, body);
      else await api.createWarehouse(body);
      invalidateMeta();
      toast.success(warehouse?._id ? `${v.name} updated` : `${v.name} added`);
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That store could not be saved'); }
  });

  const aside = (
    <>
      <PCard title="Warehouse Preview">
        <PHero
          icon="warehouse" iconTone="green"
          name={f.values.name || 'New warehouse'}
          chips={
            <>
              {f.values.code ? <Badge tone="slate" square>{f.values.code}</Badge> : null}
              <Badge tone={f.values.isActive ? 'green' : 'red'} square>{f.values.isActive ? 'Active' : 'Inactive'}</Badge>
            </>
          }
        />
        <div style={{ marginTop: 14 }}>
          <PLines lines={[
            ['hotel', WAREHOUSE_TYPES.find(t => t.value === f.values.type)?.label || '—'],
            ['users', `Department: ${f.values.department || 'General'}`],
            ['building', `Campus: ${f.values.campus || 'Not set'}`],
            ['mapPin', `Location: ${f.values.location || 'Not set'}`],
            ['boxes', `Capacity: ${f.values.capacity ? `${count(f.values.capacity)} units` : 'Not set'}`],
            ['alert', `Low capacity alert: ${num(f.values.lowCapacityAt)}%`],
            ['user', `In charge: ${f.values.contactPerson || 'Not assigned'}`],
          ]} />
        </div>
      </PCard>
      <Note tone="info" title="What's next?">
        After creating the warehouse, you can manage access, track stock and transfer items between warehouses.
      </Note>
    </>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="warehouse" iconTone="green"
      title={warehouse?._id ? 'Edit Warehouse' : 'Add Warehouse'}
      sub="Create a new warehouse to store and manage inventory items."
      steps={WAREHOUSE_STEPS} aside={aside}
      onSubmit={save} submitting={f.busy} submitLabel={warehouse?._id ? 'Save changes' : 'Create warehouse'}
    >
      <Sec id="basic" n="1" title="Basic Details" sub="Essential information about the warehouse.">
        <FormGrid>
          <Field label="Store name" required error={f.err('name')}>
            <Input data-field="name" value={f.values.name} onChange={(e) => f.set('name', e.target.value)}
              placeholder="e.g. Main Store" autoFocus />
          </Field>
          <Field label="Warehouse code" hint="Leave blank, one will be generated">
            <Input value={f.values.code} onChange={(e) => f.set('code', e.target.value)} placeholder="e.g. WH-001" />
          </Field>
          <Field label="Warehouse type">
            <Affix icon="layers">
              <Select value={f.values.type} onChange={(v) => f.set('type', v)} options={WAREHOUSE_TYPES} />
            </Affix>
          </Field>
          <Field label="Department (Optional)">
            <Select value={f.values.department} onChange={(v) => f.set('department', v)}
              options={opt(meta.departments)} placeholder="General" />
          </Field>
          <Field label="Description" span2>
            <Counted value={f.values.description} onChange={(v) => f.set('description', v)} rows={3} maxLength={250}
              placeholder="Primary inventory warehouse for the school" />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="capacity" n="2" title="Location & Capacity" sub="Where the warehouse is located and how much it can hold.">
        <FormGrid>
          <Field label="Campus">
            <Affix icon="building">
              <Input value={f.values.campus} onChange={(e) => f.set('campus', e.target.value)} placeholder="Main Campus" />
            </Affix>
          </Field>
          <Field label="Location / Address">
            <Affix icon="mapPin">
              <Input value={f.values.location} onChange={(e) => f.set('location', e.target.value)}
                placeholder="e.g. Building A, Room 101" />
            </Affix>
          </Field>
          <Field label="Capacity (units)" error={f.err('capacity')} hint="Leave blank if there is no fixed limit">
            <Affix icon="boxes">
              <Input data-field="capacity" type="number" min="0" value={f.values.capacity}
                onChange={(e) => f.set('capacity', e.target.value)} placeholder="e.g. 1000" />
            </Affix>
          </Field>
          <Field label="Report low capacity at" error={f.err('lowCapacityAt')}
            hint="Get notified when stock falls below this percentage">
            <Affix suffix="%">
              <Input data-field="lowCapacityAt" type="number" min="1" max="100" value={f.values.lowCapacityAt}
                onChange={(e) => f.set('lowCapacityAt', e.target.value)} />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="contact" n="3" title="In Charge & Settings" sub="Assign responsibility and control access to this warehouse.">
        <FormGrid>
          <Field label="In charge">
            <Affix icon="user">
              <Input value={f.values.contactPerson} onChange={(e) => f.set('contactPerson', e.target.value)}
                placeholder="Not assigned" />
            </Affix>
          </Field>
          <Field label="Contact phone (Optional)">
            <Affix icon="phone">
              <Input value={f.values.phone} onChange={(e) => f.set('phone', e.target.value)} placeholder="+91 98765 43210" />
            </Affix>
          </Field>
        </FormGrid>
        <div style={{ marginTop: 15 }}>
          <SwitchRow checked={f.values.isActive} onChange={(v) => f.set('isActive', v)}
            title="Active — can receive and issue stock"
            note="Inactive warehouses cannot be selected while issuing or receiving items." />
        </div>
      </Sec>
    </Wizard>
  );
}

export function DepartmentForm({ open, department, onClose, onDone }) {
  const initial = useMemo(() => ({
    name: department?.name || '', headName: department?.headName || '',
    financialYear: department?.financialYear || '',
    isActive: department?.isActive !== false,
  }), [department]);
  const validate = useCallback((v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Give the department a name';
    return e;
  }, []);
  const f = useForm(initial, validate);

  const save = () => f.submit(async (v) => {
    const body = { ...v };
    try {
      if (department?._id) await api.updateDepartment(department._id, body);
      else await api.createDepartment(body);
      invalidateMeta();
      toast.success(department?._id ? `${v.name} updated` : `${v.name} added`);
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That department could not be saved'); }
  });

  return (
    <Wizard
      open={open} onClose={onClose} icon="building" iconTone="teal"
      title={department?._id ? 'Edit Department' : 'Add Department'}
      sub="Requests and purchase orders are raised against a department. Money is set on the Budgets screen."
      steps={[{ id: 'basic', title: 'Department', sub: 'Name and head' }]}
      size="sm"
      onSubmit={save} submitting={f.busy} submitLabel={department?._id ? 'Save changes' : 'Add department'}
    >
      <Sec id="basic" n="1" title="Department" sub="Who owns the spending. What they may spend is a budget, created on the Budgets screen.">
        <FormGrid one>
          <Field label="Department name" required error={f.err('name')}>
            <Input data-field="name" value={f.values.name} onChange={(e) => f.set('name', e.target.value)}
              placeholder="Science" autoFocus />
          </Field>
          <Field label="Head of department">
            <Affix icon="user">
              <Input value={f.values.headName} onChange={(e) => f.set('headName', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Financial year">
            <Input value={f.values.financialYear} onChange={(e) => f.set('financialYear', e.target.value)} placeholder="2026-2027" />
          </Field>
        </FormGrid>
        <div style={{ marginTop: 15 }}>
          <SwitchRow checked={f.values.isActive} onChange={(v) => f.set('isActive', v)} title="Active" />
        </div>
      </Sec>
    </Wizard>
  );
}

const BUDGET_STEPS = [
  { id: 'details',    title: 'Budget details', sub: 'Name, type and description' },
  { id: 'allocation', title: 'Allocation',     sub: 'Department or category' },
  { id: 'amount',     title: 'Amount and period', sub: 'Set budget amount and duration' },
  { id: 'alerts',     title: 'Alerts and settings', sub: 'Control and notifications' },
  { id: 'review',     title: 'Review',         sub: 'Confirm and create' },
];
const BUDGET_ICONS = ['wallet', 'coins', 'rupee', 'bank', 'flask', 'monitor', 'book', 'ball', 'bus', 'briefcase'];
const SCOPES = [
  { value: 'department', label: 'A department' },
  { value: 'category', label: 'A category' },
  { value: 'both', label: 'Both department and category' },
];

export function BudgetForm({ open, budget, meta = {}, onClose, onDone }) {
  const activeYear = (meta.years || []).find(y => y.status === 'active');
  const initial = useMemo(() => ({
    name: budget?.name || '', code: budget?.code || '',
    scope: budget?.scope || 'department',
    department: budget?.department?._id || budget?.departmentId || '',
    category: budget?.category?._id || budget?.categoryId || '',
    academicYear: budget?.academicYear?._id || budget?.academicYearId || activeYear?._id || '',
    periodStart: budget?.periodStart ? isoDay(budget.periodStart) : '',
    periodEnd: budget?.periodEnd ? isoDay(budget.periodEnd) : '',
    allocated: budget?.allocated ?? '',
    warn: true,
    alertAt: budget?.alertAt ?? 80,
    description: budget?.description || '',
    icon: budget?.icon || 'wallet',
    isActive: (budget?.status || 'active') === 'active',
  }), [budget, activeYear]);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.name.trim()) e.name = 'Give the budget a name';
    if (!(num(v.allocated) > 0)) e.allocated = 'Allocate an amount greater than zero';
    if (v.scope !== 'category' && !v.department) e.department = 'Pick the department this budget belongs to';
    if (v.scope !== 'department' && !v.category) e.category = 'Pick the category this budget covers';
    if (!v.academicYear) e.academicYear = 'Pick the academic year';
    if (v.periodStart && v.periodEnd && v.periodEnd < v.periodStart) e.periodEnd = 'The period ends before it starts';
    if (v.warn && (num(v.alertAt) < 1 || num(v.alertAt) > 100)) e.alertAt = 'A percentage between 1 and 100';
    return e;
  }, []);
  const f = useForm(initial, validate);

  // Picking an academic year fills the period with that year's own dates.
  const pickYear = (id) => {
    f.set('academicYear', id);
    const y = (meta.years || []).find(x => String(x._id) === String(id));
    if (y?.startDate && !f.values.periodStart) f.set('periodStart', isoDay(y.startDate));
    if (y?.endDate && !f.values.periodEnd) f.set('periodEnd', isoDay(y.endDate));
  };

  const dep = opt(meta.departments).find(o => o.value === f.values.department);
  const cat = catById(meta, f.values.category);
  const year = (meta.years || []).find(y => String(y._id) === String(f.values.academicYear));

  const save = () => f.submit(async (v) => {
    const body = {
      name: v.name, code: v.code, scope: v.scope, icon: v.icon, description: v.description,
      allocated: num(v.allocated), alertAt: v.warn ? num(v.alertAt) : 100,
      department: v.scope === 'category' ? null : (v.department || null),
      category: v.scope === 'department' ? null : (v.category || null),
      academicYear: v.academicYear || null,
      periodStart: v.periodStart || null, periodEnd: v.periodEnd || null,
      status: v.isActive ? 'active' : 'closed',
    };
    try {
      if (budget?._id) await api.updateBudget(budget._id, body);
      else await api.createBudget(body);
      invalidateMeta();
      toast.success(budget?._id ? `${v.name} updated` : `${v.name} created`);
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That budget could not be saved'); }
  });

  const aside = (
    <>
      <PCard title="Budget summary">
        <PHero
          icon={f.values.icon} iconTone="rose"
          name={f.values.name || 'New budget'}
          chips={
            <>
              {f.values.code ? <Badge tone="slate" square>{f.values.code}</Badge> : null}
              <Badge tone={f.values.isActive ? 'green' : 'slate'} square>{f.values.isActive ? 'Active' : 'Closed'}</Badge>
            </>
          }
        />
        <div style={{ marginTop: 14 }}>
          <PRows rows={[
            ['Type', SCOPES.find(s => s.value === f.values.scope)?.label || '—'],
            ...(f.values.scope !== 'category' ? [['Department', dep?.label || 'Not chosen']] : []),
            ...(f.values.scope !== 'department' ? [['Category', cat?.name || 'Not chosen']] : []),
            ['Amount', money(num(f.values.allocated))],
            ['Period', f.values.periodStart || f.values.periodEnd
              ? `${f.values.periodStart ? fmtDate(f.values.periodStart) : 'Any'} – ${f.values.periodEnd ? fmtDate(f.values.periodEnd) : 'Open'}`
              : 'Not set'],
            ['Alert at', f.values.warn ? `${num(f.values.alertAt)}%` : 'Off'],
            ['Academic year', year?.name || 'Not chosen'],
          ]} />
        </div>
      </PCard>
      <Note tone="info" title="This budget will be used for">
        All purchase orders and expenses under {f.values.scope === 'category'
          ? (cat?.name || 'the chosen category')
          : (dep?.label || 'the chosen department')} during the selected period.
      </Note>
    </>
  );

  return (
    <Wizard
      open={open} onClose={onClose} icon="wallet" iconTone="rose"
      title={budget?._id ? 'Edit budget' : 'Create budget'}
      sub="Set a budget to plan and track purchases for a department, category or both."
      steps={BUDGET_STEPS} aside={aside} nextFlow
      onSubmit={save} submitting={f.busy} submitLabel={budget?._id ? 'Save changes' : 'Create budget'}
      left={<ResetBtn onClick={f.reset} disabled={f.busy} />}
    >
      <Sec id="details" n="1" title="Budget details" sub="Basic information about this budget.">
        <FormGrid>
          <Field label="Budget name" required error={f.err('name')}>
            <Input data-field="name" value={f.values.name} onChange={(e) => f.set('name', e.target.value)}
              placeholder="Science Lab Budget" autoFocus />
          </Field>
          <Field label="Budget code" hint="Leave blank, one is generated automatically.">
            <Input value={f.values.code} onChange={(e) => f.set('code', e.target.value)} placeholder="BUD-SCI-2026" />
          </Field>
          <Field label="Icon" span2>
            <IconPicker value={f.values.icon} onChange={(v) => f.set('icon', v)} options={BUDGET_ICONS} />
          </Field>
          <Field label="Description" span2>
            <Counted value={f.values.description} onChange={(v) => f.set('description', v)} rows={3} maxLength={250}
              placeholder="Procurement of laboratory equipment, chemicals and consumables." />
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="allocation" n="2" title="Allocation" sub="Choose what this budget applies to.">
        <div className="inv-seg" role="group" style={{ marginBottom: 16 }}>
          {SCOPES.map(s => (
            <button key={s.value} type="button" className={f.values.scope === s.value ? 'is-on' : ''}
              onClick={() => f.set('scope', s.value)}>{s.label}</button>
          ))}
        </div>
        <FormGrid one>
          {f.values.scope !== 'category' ? (
            <Field label="Department" required error={f.err('department')}
              hint="Budget will apply to all purchases under this department.">
              <Affix icon="building">
                <Select data-field="department" value={f.values.department} onChange={(v) => f.set('department', v)}
                  options={opt(meta.departments)} placeholder="Choose a department…" />
              </Affix>
            </Field>
          ) : null}
          {f.values.scope !== 'department' ? (
            <Field label="Category" required error={f.err('category')}
              hint="Budget will apply to all purchases in this category.">
              <Affix icon="folder">
                <Select data-field="category" value={f.values.category} onChange={(v) => f.set('category', v)}
                  options={opt(meta.categories)} placeholder="Choose a category…" />
              </Affix>
            </Field>
          ) : null}
        </FormGrid>
      </Sec>

      <Sec id="amount" n="3" title="Amount and period" sub="Set the total budget amount and time period.">
        <FormGrid>
          <Field label="Allocated amount (₹)" required error={f.err('allocated')}>
            <Affix icon="rupee">
              <Input data-field="allocated" type="number" min="0" step="0.01" value={f.values.allocated}
                onChange={(e) => f.set('allocated', e.target.value)} placeholder="500000" />
            </Affix>
          </Field>
          <Field label="Academic year" required error={f.err('academicYear')}>
            <Affix icon="calendar">
              <Select data-field="academicYear" value={f.values.academicYear} onChange={pickYear}
                options={opt(meta.years)} placeholder="Choose a year…" />
            </Affix>
          </Field>
          <Field label="Period starts">
            <Affix icon="calendar">
              <Input type="date" value={f.values.periodStart} onChange={(e) => f.set('periodStart', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Period ends" error={f.err('periodEnd')}>
            <Affix icon="calendar">
              <Input data-field="periodEnd" type="date" value={f.values.periodEnd}
                onChange={(e) => f.set('periodEnd', e.target.value)} />
            </Affix>
          </Field>
        </FormGrid>
      </Sec>

      <Sec id="alerts" n="4" title="Alerts and settings" sub="Get notified when spending reaches a certain percentage.">
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 300px' }}>
            <SwitchRow checked={f.values.warn} onChange={(v) => f.set('warn', v)}
              title="Warn at % spent" note="Turn this off to never be warned about this budget." />
          </div>
          <div style={{ flex: '0 1 160px' }}>
            <Field label="Threshold" error={f.err('alertAt')}>
              <Affix suffix="%">
                <Input data-field="alertAt" type="number" min="1" max="100" value={f.values.alertAt}
                  disabled={!f.values.warn} onChange={(e) => f.set('alertAt', e.target.value)} />
              </Affix>
            </Field>
          </div>
        </div>
        <div style={{ marginTop: 15 }}>
          <Check checked={f.values.isActive} onChange={(v) => f.set('isActive', v)}
            label="Active budget — inactive budgets cannot be used for new purchases." />
        </div>
      </Sec>

      <Sec id="review" n="5" title="Review" sub="Confirm the budget before it is created.">
        <Note tone="info" title="Spend is counted, not typed">
          What a budget has spent is summed from the purchase orders inside its scope and period every time the screen loads, so it cannot drift away from them.
        </Note>
      </Sec>
    </Wizard>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Asset repairs
   ══════════════════════════════════════════════════════════════════════════ */

const REPAIR_STAGES = [
  { value: 'reported', label: 'Reported' }, { value: 'assigned', label: 'Assigned' },
  { value: 'in_progress', label: 'In progress' }, { value: 'completed', label: 'Completed' },
  { value: 'returned', label: 'Back in service' },
];

/**
 * Log a fault against an asset.
 *
 * The endpoint has always existed and nothing called it, so an asset could be
 * "Under Maintenance" with no way to say why — or to get it back out again.
 */
export function RepairForm({ open, asset, onClose, onDone }) {
  const initial = useMemo(() => ({ complaint: '', technician: '', note: '' }), []);
  const validate = useCallback((v) => (
    v.complaint.trim() ? {} : { complaint: 'Say what is wrong with it' }
  ), []);
  const f = useForm(initial, validate);

  const save = () => f.submit(async (v) => {
    try {
      await api.addRepair(asset._id, v);
      toast.success(`${asset.name} sent for repair`);
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That repair could not be logged'); }
  });

  if (!asset) return null;
  return (
    <Wizard
      open={open} onClose={onClose} icon="wrench" iconTone="amber" title="Log a repair"
      sub={`${asset.assetCode} · ${asset.name}`}
      steps={[{ id: 'fault', title: 'The fault', sub: 'What is wrong and who is fixing it' }]}
      size="sm" onSubmit={save} submitting={f.busy} submitLabel="Log repair"
    >
      <Sec id="fault" n="1" title="The fault" sub="This marks the asset as under maintenance until the repair is closed.">
        <FormGrid one>
          <Field label="Complaint" required error={f.err('complaint')}>
            <Counted value={f.values.complaint} onChange={(v) => f.set('complaint', v)} rows={3} maxLength={500}
              placeholder="e.g. Lamp flickers after 20 minutes" />
          </Field>
          <Field label="Technician" hint="Leave blank to log it as reported but not yet assigned">
            <Affix icon="user">
              <Input value={f.values.technician} onChange={(e) => f.set('technician', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Note">
            <Input value={f.values.note} onChange={(e) => f.set('note', e.target.value)} />
          </Field>
        </FormGrid>
      </Sec>
    </Wizard>
  );
}

/** Move a repair along, or close it and put the asset back into service. */
export function RepairUpdateForm({ open, asset, repair, onClose, onDone }) {
  const initial = useMemo(() => ({
    status: repair?.status || 'in_progress',
    technician: repair?.technician || '',
    cost: repair?.cost ?? '',
    note: repair?.note || '',
  }), [repair]);
  const validate = useCallback((v) => (
    v.cost !== '' && num(v.cost) < 0 ? { cost: 'A cost cannot be negative' } : {}
  ), []);
  const f = useForm(initial, validate);
  const closing = ['completed', 'returned'].includes(f.values.status);

  const save = () => f.submit(async (v) => {
    try {
      await api.updateRepair(asset._id, repair._id, { ...v, cost: num(v.cost) });
      toast.success(closing ? `${asset.name} is back in service` : 'Repair updated');
      onDone?.();
      onClose();
    } catch (e) { toast.error(e?.message || 'That repair could not be updated'); }
  });

  if (!asset || !repair) return null;
  return (
    <Wizard
      open={open} onClose={onClose} icon="wrench" iconTone="amber" title="Update repair"
      sub={repair.complaint}
      steps={[{ id: 'stage', title: 'Progress', sub: 'Stage, technician and cost' }]}
      size="sm" onSubmit={save} submitting={f.busy} submitLabel={closing ? 'Close repair' : 'Save'}
    >
      <Sec id="stage" n="1" title="Progress" sub="Closing the last open repair returns the asset to service.">
        <FormGrid>
          <Field label="Stage">
            <Select value={f.values.status} onChange={(v) => f.set('status', v)} options={REPAIR_STAGES} />
          </Field>
          <Field label="Cost (₹)" error={f.err('cost')}>
            <Affix icon="rupee">
              <Input data-field="cost" type="number" min="0" step="0.01" value={f.values.cost}
                onChange={(e) => f.set('cost', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Technician" span2>
            <Affix icon="user">
              <Input value={f.values.technician} onChange={(e) => f.set('technician', e.target.value)} />
            </Affix>
          </Field>
          <Field label="Note" span2>
            <Counted value={f.values.note} onChange={(v) => f.set('note', v)} rows={2} maxLength={500} />
          </Field>
        </FormGrid>
        {closing ? (
          <div style={{ marginTop: 15 }}>
            <Note tone="ok" title="This closes the repair">
              If it is the last one open, the asset goes back to whoever had it, or to its store.
            </Note>
          </div>
        ) : null}
      </Sec>
    </Wizard>
  );
}
