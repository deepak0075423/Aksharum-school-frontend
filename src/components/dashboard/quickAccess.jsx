/**
 * Quick Access customisation, shared by the dashboards that offer it.
 *
 * The state and the picker dialog live here; each dashboard still renders its
 * own tiles, because an admin's tile (name + what the module does) and a
 * student's (a round glyph and a word) are different shapes for different jobs.
 * Only the "which tiles, and remembering that" part is common.
 *
 * The choice is kept in this browser rather than on the server: it is a
 * per-device preference about one panel's layout, not part of anybody's record.
 * Every access is guarded — a browser with site data blocked throws on read as
 * well as write, and a dashboard must not fail to render over a shortcut list.
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Modal, Button } from '../ui/index';
import Icon from '../ui/icons';

const storageKey = (scope, userId) => `${scope}.quickTiles.${userId || 'anon'}`;

function readPrefs(scope, userId) {
  try {
    const raw = localStorage.getItem(storageKey(scope, userId));
    const arr = raw ? JSON.parse(raw) : null;
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}

function writePrefs(scope, userId, keys) {
  try { localStorage.setItem(storageKey(scope, userId), JSON.stringify(keys)); }
  catch { /* a preference that cannot be saved is not worth an error */ }
}

/**
 * `scope`     namespaces the stored list, so an admin who is also a parent on
 *             the same browser does not inherit the other role's shortcuts.
 * `available` is the already-permission-filtered list of tiles, each `{ key }`.
 *
 * Returns the tiles to render plus everything <QuickAccessPicker> needs.
 */
export function useQuickAccess({ scope, userId, available }) {
  const [chosen,   setChosen]   = useState(() => readPrefs(scope, userId));
  const [pickerOn, setPickerOn] = useState(false);
  const [draft,    setDraft]    = useState([]);

  // Preferences are read before `user` resolves on a cold load; pick them up
  // once the id is known.
  useEffect(() => { setChosen(readPrefs(scope, userId)); }, [scope, userId]);

  // A saved preference is intersected with what is available, so a module the
  // school later switches off cannot leave a dead tile behind — and one it
  // switches on simply is not shown until it is added.
  const tiles = useMemo(() => {
    if (!chosen) return available;
    const keep = available.filter(t => chosen.includes(t.key));
    return keep.length ? keep : available;
  }, [available, chosen]);

  const open = useCallback(() => {
    setDraft(tiles.map(t => t.key));
    setPickerOn(true);
  }, [tiles]);

  const close     = useCallback(() => setPickerOn(false), []);
  const toggle    = useCallback((key) => setDraft(d => (
    d.includes(key) ? d.filter(k => k !== key) : [...d, key]
  )), []);
  const selectAll = useCallback(() => setDraft(available.map(t => t.key)), [available]);

  const save = useCallback(() => {
    // An empty selection would leave the panel blank with no way back to the
    // picker, so it falls back to showing everything.
    const keys = draft.length ? draft : available.map(t => t.key);
    setChosen(keys);
    writePrefs(scope, userId, keys);
    setPickerOn(false);
  }, [draft, available, scope, userId]);

  return { tiles, pickerOn, draft, open, close, toggle, selectAll, save };
}

/** The header affordance that opens the picker. */
export const CustomizeButton = ({ onClick }) => (
  <button type="button" className="dpanel__link dpanel__link--btn" onClick={onClick}>
    <Icon name="sliders" size={15} /> Customize
  </button>
);

/** The dialog itself. Driven entirely by what useQuickAccess returns. */
export function QuickAccessPicker({ state, available, note }) {
  const { pickerOn, draft, close, toggle, selectAll, save } = state;
  return (
    <Modal
      open={pickerOn}
      onClose={close}
      title="Customize Quick Access"
      footer={(
        <>
          <Button variant="secondary" onClick={selectAll}>Select all</Button>
          <Button onClick={save}>Save</Button>
        </>
      )}
    >
      <p className="text-muted text-sm mb-16">
        {note || 'Choose the shortcuts you want on your dashboard. This is saved on this device.'}
      </p>
      <div className="sqt-picker">
        {available.map(t => {
          const on = draft.includes(t.key);
          return (
            <button
              key={t.key}
              type="button"
              className={`sqt-pick${on ? ' on' : ''}`}
              onClick={() => toggle(t.key)}
              aria-pressed={on}
            >
              <span className={`sqt-pick__icon tint-${t.tone}`}><Icon name={t.icon} size={18} /></span>
              <span className="sqt-pick__label">{t.label}</span>
              <Icon name={on ? 'checkCircle' : 'plus'} size={16} className="sqt-pick__mark" />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
