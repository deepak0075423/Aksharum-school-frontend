/**
 * Inventory → My Requests → New Purchase Request (teacher).
 *
 * The admin raises a request through the module's step wizard, because an admin
 * raising one on a department's behalf is filling in a lot of fields. A teacher
 * is doing something smaller: what, how many, and why. So this is one modal with
 * three numbered sections and everything visible at once — no steps to walk
 * through, no rail to scroll.
 *
 * The one thing it keeps from the teacher's side of the model: a line may carry
 * a NAME instead of a catalogue id, because a teacher may need something the
 * school has never bought and the approver decides what to order.
 */
import React, { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import * as api from '../../../api/inventory.api';
import {
  Modal, Btn, IconBtn, Field, Input, Select, Textarea, FormGrid, Note, Ico,
  money, count, num,
} from '../admin/invUI';
import { Sec, Affix, ItemTable, AddItemRow, PCard, PRows } from '../admin/invWizard';
import { useForm } from '../admin/invForms';

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const GUIDELINES = [
  'Request only items required for academic and school activities.',
  'Your request will be reviewed by the inventory department.',
  'You will be notified once your request is approved or rejected.',
  'Include clear justification to avoid delays.',
];

const REASON_MAX = 500;
const blank = () => ({ item: '', itemName: '', quantity: 1, price: '' });

/**
 * One control that searches the catalogue and accepts what is typed.
 *
 * The line needs to do two things a plain dropdown cannot: filter a catalogue
 * of hundreds as you type, and let a teacher name something the school has
 * never bought. A native input with a datalist does both — typing narrows the
 * list, and text that matches nothing stays as text. Picking a listed item
 * resolves it to its id, so an approver sees a real item rather than a name
 * that has to be matched up by hand.
 */
function ItemPicker({ id, items, line, onPick, onName }) {
  const byLabel = useMemo(() => {
    const m = new Map();
    items.forEach(i => { m.set(i.name.toLowerCase(), i); if (i.itemCode) m.set(i.itemCode.toLowerCase(), i); });
    return m;
  }, [items]);

  const take = (text) => {
    const hit = byLabel.get(String(text).trim().toLowerCase());
    if (hit) onPick(String(hit._id), hit);
    else onName(text);
  };

  return (
    <>
      <Input data-text="title"
        list={id}
        value={line.itemName}
        onChange={(e) => take(e.target.value)}
        placeholder="Search or select an item..."
      />
      <datalist id={id}>
        {items.map(i => <option key={i._id} value={i.name}>{i.itemCode}</option>)}
      </datalist>
    </>
  );
}

export function TeacherRequestForm({ open, meta = {}, onClose, onDone }) {
  const items = meta.items || [];
  const departments = meta.departments || [];

  const initial = useMemo(() => ({
    department: '', priority: 'normal', purpose: '',
    lines: [blank(), blank()],
    reason: '',
  }), []);

  // A line counts if it names something — from the list or typed in.
  const usable = useCallback((l) => !!(l.item || String(l.itemName || '').trim()), []);

  const validate = useCallback((v) => {
    const e = {};
    if (!v.department) e.department = 'Pick the department this is for';
    if (!String(v.purpose).trim()) e.purpose = 'Say what the items are for';
    if (!v.lines.some(l => usable(l) && num(l.quantity) > 0)) {
      e.lines = 'Add at least one item — choose one from the list or type a name';
    }
    if (String(v.reason || '').length > REASON_MAX) e.reason = `Keep the justification under ${REASON_MAX} characters`;
    return e;
  }, [usable]);

  const f = useForm(initial, validate);

  const setLine = (i, patch) => f.set('lines', f.values.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const live = f.values.lines.filter(l => usable(l) && num(l.quantity) > 0);
  const estimated = live.reduce((s, l) => s + num(l.quantity) * num(l.price), 0);
  const dept = departments.find(d => String(d._id) === String(f.values.department));

  const save = () => f.submit(async (v) => {
    try {
      await api.createMyRequest({
        department: v.department || null,
        priority: v.priority,
        // The purpose is the headline; the justification, when there is one,
        // is the detail behind it. The server stores one reason, so they are
        // joined here rather than lost.
        reason: [v.purpose.trim(), String(v.reason || '').trim()].filter(Boolean).join(' — '),
        items: v.lines.filter(l => usable(l) && num(l.quantity) > 0).map(l => ({
          item: l.item || null,
          itemName: l.itemName || items.find(x => String(x._id) === String(l.item))?.name || '',
          quantity: num(l.quantity),
          unit: items.find(x => String(x._id) === String(l.item))?.unit || 'Nos',
          estimatedPrice: num(l.price),
        })),
      });
      toast.success('Request submitted — you will hear when somebody acts on it');
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(e?.message || 'That request could not be submitted');
    }
  });

  return (
    <Modal
      open={open} onClose={onClose} xl
      icon="request" iconTone="violet"
      title="New Purchase Request"
      sub="Request items from the inventory department for your classroom or activities."
      foot={<>
        <Btn onClick={onClose} disabled={f.busy}>Cancel</Btn>
        <Btn kind="primary" onClick={save} disabled={f.busy}>
          {f.busy ? 'Submitting…' : 'Submit Request'}
        </Btn>
      </>}
    >
      <div className="itr">
        <div className="itr__main">
          <Sec id="details" n="1" title="Request details" sub="Provide basic information about your request.">
            <FormGrid>
              <Field label="Department" required error={f.err('department')}>
                <Affix icon="users">
                  <Select data-field="department" value={f.values.department}
                    onChange={(v) => f.set('department', v)}
                    options={departments.map(d => ({ value: String(d._id), label: d.name }))}
                    placeholder="Select department" />
                </Affix>
              </Field>
              <Field label="Priority" info="Urgent requests are looked at first, so keep them for things that cannot wait.">
                <Affix icon="alert">
                  <Select value={f.values.priority} onChange={(v) => f.set('priority', v)} options={PRIORITIES} />
                </Affix>
              </Field>
              <Field label="Purpose" required error={f.err('purpose')} span2>
                <Input data-field="purpose" value={f.values.purpose}
                  onChange={(e) => f.set('purpose', e.target.value)}
                  placeholder="e.g. Classroom use, Practical, Event, Project etc." />
              </Field>
            </FormGrid>
          </Sec>

          <Sec id="items" n="2" title="Requested items" sub="Add the items you need. You can add multiple items to this request.">
            <ItemTable
              cols={[
                {
                  key: 'item', label: 'Item', className: 'ivw-items__item',
                  cell: (l, i) => {
                    const it = items.find(x => String(x._id) === String(l.item));
                    return (
                      <>
                        <ItemPicker
                          id={`itr-items-${i}`} items={items} line={l}
                          onPick={(id_, hit) => setLine(i, { item: id_, itemName: hit.name, price: hit.purchasePrice ?? '' })}
                          onName={(name) => setLine(i, { item: '', itemName: name })}
                        />
                        {it ? (
                          <span className="itr__hit">
                            <Ico name="checkCircle" size={13} aria-hidden />
                            {it.itemCode}
                            {it.available != null ? ` · ${count(it.available)} in stock` : ''}
                          </span>
                        ) : (String(l.itemName || '').trim() ? (
                          <span className="itr__new">
                            <Ico name="info" size={13} aria-hidden />
                            Not in the catalogue — the office will decide what to order
                          </span>
                        ) : null)}
                      </>
                    );
                  },
                },
                {
                  key: 'qty', label: 'Quantity', width: 108,
                  cell: (l, i) => (
                    <Input type="number" min="1" value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  ),
                },
                {
                  key: 'price', label: 'Estimated Price (₹)', width: 168,
                  cell: (l, i) => (
                    <Input type="number" min="0" step="0.01" value={l.price}
                      onChange={(e) => setLine(i, { price: e.target.value })} placeholder="0.00" />
                  ),
                },
                {
                  key: 'act', label: 'Actions', className: 'ivw-items__act',
                  cell: (_, i) => (
                    <IconBtn icon="trash" kind="danger" label="Remove this line"
                      disabled={f.values.lines.length === 1}
                      onClick={() => f.set('lines', f.values.lines.filter((_, j) => j !== i))} />
                  ),
                },
              ]}
              rows={f.values.lines}
            />
            <AddItemRow onClick={() => f.set('lines', [...f.values.lines, blank()])} />
            {f.err('lines') ? <span className="inv-field__err">{f.err('lines')}</span> : null}
          </Sec>

          <Sec id="reason" n="3" title="Reason / Justification" sub="Explain why you need these items.">
            <div className="itr__reason">
              <Textarea rows={4} value={f.values.reason}
                maxLength={REASON_MAX}
                onChange={(e) => f.set('reason', e.target.value)}
                placeholder="Describe the purpose, expected use and any additional details..." />
              <span className="itr__count">{String(f.values.reason || '').length}/{REASON_MAX}</span>
            </div>
          </Sec>
        </div>

        <aside className="itr__aside">
          <PCard title="Request summary">
            <div className="itr__mark"><Ico name="cart" size={26} /></div>
            <PRows rows={[
              ['Department', dept?.name || <span className="inv-dim">Not selected</span>],
              ['Items', count(live.length)],
              ['Estimated cost', money(estimated, { dec: 2 })],
              ['Priority', PRIORITIES.find(p => p.value === f.values.priority)?.label || 'Normal'],
            ]} />
          </PCard>

          <Note tone="info" title="Guidelines">
            <ul className="itr__rules">
              {GUIDELINES.map((g, i) => <li key={i}>{g}</li>)}
            </ul>
          </Note>
        </aside>
      </div>
    </Modal>
  );
}
