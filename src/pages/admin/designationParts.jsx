/**
 * The pieces the Designations screen is built from.
 *
 * The page itself (Designations.jsx) is the frame every account list uses —
 * hero, headcount tiles, one card holding the toolbar and the table, closing
 * panels. What is particular to a designation lives here: how a row is drawn,
 * how module access is summarised in a cell, and the two surfaces that edit it.
 *
 * Same file convention as listParts.jsx and dashboardParts.jsx: kept beside the
 * page because none of it is general.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Badge, Button, Empty, Modal } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { Blank, Drawer, DrawerFoot, fmtDate } from './listParts';

// ── Levels ───────────────────────────────────────────────────────────────────

export const LEVELS = [
  { value: 'admin', label: 'Admin',     hint: 'Manage the module',         tone: 'admin' },
  { value: 'user',  label: 'Normal',    hint: 'Use the module',            tone: 'user'  },
  { value: 'none',  label: 'No Access', hint: 'Module hidden and blocked',  tone: 'none' },
];

export const levelOf = (perms, key) => perms?.[key] || 'none';

/** How many of `keys` sit at `level` in this permission map. */
export const countBy = (perms, keys, level) => keys.filter((k) => levelOf(perms, k) === level).length;

// ── How a designation is drawn ───────────────────────────────────────────────

/**
 * An icon and a colour for a designation, chosen from its name.
 *
 * The list is scanned top to bottom, so the narrower rule has to come first —
 * "Vice Principal" contains "principal" and must not be drawn as one. Anything
 * unrecognised still gets a stable colour rather than a random one, so a
 * designation looks the same on every visit.
 */
const LOOK = [
  [/\b(vice|deputy|asst\.?|assistant)\b/i,                  { icon: 'badge',    tone: 'blue'   }],
  [/principal|head\s?master|head\s?mistress|director|dean/i, { icon: 'school',   tone: 'amber'  }],
  [/class\s*teacher|co-?ordinator|mentor/i,                  { icon: 'teacher',  tone: 'indigo' }],
  [/librar/i,                                                { icon: 'library',  tone: 'purple' }],
  [/account|finance|cashier|bursar|fee/i,                    { icon: 'wallet',   tone: 'green'  }],
  [/warden|hostel/i,                                         { icon: 'hostel',   tone: 'teal'   }],
  [/transport|driver|conductor/i,                            { icon: 'bus',      tone: 'orange' }],
  [/sport|physical|coach|games/i,                            { icon: 'trophy',   tone: 'orange' }],
  [/lab\b|laborator|technician/i,                            { icon: 'package',  tone: 'teal'   }],
  [/counsel|wellbeing|nurse|doctor/i,                        { icon: 'lifebuoy', tone: 'pink'   }],
  [/reception|front\s?desk|clerk|office|admin/i,             { icon: 'phone',    tone: 'blue'   }],
  [/teacher|faculty|lecturer|tutor|instructor/i,             { icon: 'user',     tone: 'pink'   }],
];

const TONES = ['indigo', 'blue', 'green', 'amber', 'purple', 'pink', 'teal', 'orange'];

export function lookOf(name = '') {
  for (const [re, look] of LOOK) if (re.test(name)) return look;
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
  return { icon: 'badge', tone: TONES[hash % TONES.length] };
}

/** The identity cell: the designation, drawn as itself. */
export const DesignationCell = ({ name, size = 38 }) => {
  const look = lookOf(name);
  return (
    <div className="ldesig">
      <span className={`ldesig__icon tint-${look.tone}`} style={{ width: size, height: size }}>
        <Icon name={look.icon} size={Math.round(size * 0.5)} />
      </span>
      <span className="ldesig__name">{name}</span>
    </div>
  );
};

/** Who holds it, split the way the school thinks about its staff. */
export const Holders = ({ teachers = 0, admins = 0 }) => (
  <div className="lusers">
    <span><b>{teachers}</b> teacher{teachers === 1 ? '' : 's'}</span>
    <span>{admins} admin{admins === 1 ? '' : 's'}</span>
  </div>
);

// ── Module access ────────────────────────────────────────────────────────────

// A colour per module, fixed by its position in the registry so a module wears
// the same chip everywhere it appears — the row, the drawer, the editor.
const moduleTone = (modules, key) => TONES[Math.max(0, modules.findIndex((m) => m.key === key)) % TONES.length];

const LEVEL_WORD = {
  admin: 'administrative access',
  user:  'normal access',
  none:  'no access',
};

/**
 * One module as a chip, coloured by the level it is granted at.
 *
 * Colour carries the level, not the module: the question this page is asked is
 * "what can this designation do to Fees", and a per-module palette answered a
 * question nobody had while leaving the levels invisible.
 */
export const ModuleChip = ({ module, level }) => (
  <span className={`lmod lmod--${level}`}
    title={`${module.label} — ${LEVEL_WORD[level]}`}>
    <span aria-hidden>{module.icon}</span>{module.label}
  </span>
);

/** The same chips, wrapped — for the drawer and the expanded row. */
export const ModuleChips = ({ modules, permissions, empty = 'None' }) => (
  modules.length
    ? (
      <div className="lmods">
        {modules.map((m) => (
          <ModuleChip key={m.key} module={m} level={levelOf(permissions, m.key)} />
        ))}
      </div>
    )
    : <Blank>{empty}</Blank>
);

/**
 * What a designation reaches, in the width of a table cell.
 *
 * Eighteen modules do not fit, and the three that did fit said nothing about
 * the levels — so the cell carries the shape of the access instead: a bar in
 * the three level colours and the counts behind it. Pressing it opens every
 * module underneath the row, which is the only place the full answer fits.
 */
export function AccessSummary({ modules, permissions, open, onToggle }) {
  const keys   = modules.map((m) => m.key);
  const nAdmin = countBy(permissions, keys, 'admin');
  const nUser  = countBy(permissions, keys, 'user');
  const nNone  = keys.length - nAdmin - nUser;

  if (!keys.length) return <Blank>No modules enabled</Blank>;

  return (
    <button type="button" className={`lacc${open ? ' is-open' : ''}`} onClick={onToggle}
      aria-expanded={open}
      title={`${nAdmin} administrative, ${nUser} normal, ${nNone} without access — click for the full list`}>
      <span className="lacc__bar" aria-hidden>
        {nAdmin > 0 && <i className="lacc__seg lacc__seg--admin" style={{ flexGrow: nAdmin }} />}
        {nUser  > 0 && <i className="lacc__seg lacc__seg--user"  style={{ flexGrow: nUser  }} />}
        {nNone  > 0 && <i className="lacc__seg lacc__seg--none"  style={{ flexGrow: nNone  }} />}
      </span>
      <span className="lacc__txt">
        {nAdmin > 0 && <><b className="is-admin">{nAdmin}</b> admin</>}
        {nAdmin > 0 && (nUser > 0 || nNone > 0) ? ' · ' : ''}
        {nUser > 0 && <><b className="is-user">{nUser}</b> normal</>}
        {nUser > 0 && nNone > 0 ? ' · ' : ''}
        {nNone > 0 && <><b className="is-none">{nNone}</b> none</>}
      </span>
      <Icon name="chevronDown" size={14} className="lacc__chev" />
    </button>
  );
}

/**
 * Every module and the level it is granted at, opened beneath its row.
 *
 * Grouped by level rather than listed alphabetically: "what does this
 * designation administer" is answered by reading one line, and the modules it
 * cannot touch are visibly a separate group rather than something to hunt for.
 */
export function AccessDetail({ modules, permissions, onEdit }) {
  const at = (level) => modules.filter((m) => levelOf(permissions, m.key) === level);
  const groups = [
    { level: 'admin', title: 'Administrative', note: 'can manage the module', items: at('admin') },
    { level: 'user',  title: 'Normal access',  note: 'can use the module',    items: at('user')  },
    { level: 'none',  title: 'No access',      note: 'hidden and blocked',    items: at('none')  },
  ];
  return (
    <div className="laccd">
      {groups.map((g) => (
        <div key={g.level} className="laccd__row">
          <div className={`laccd__head laccd__head--${g.level}`}>
            <span className="laccd__dot" aria-hidden />
            <span className="laccd__title">{g.title} ({g.items.length})</span>
            <span className="laccd__note">{g.note}</span>
          </div>
          <ModuleChips modules={g.items} permissions={permissions}
            empty={g.level === 'none' ? 'Every enabled module is granted' : 'None'} />
        </div>
      ))}
      {onEdit && (
        <div className="laccd__foot">
          <Button variant="secondary" size="sm" onClick={onEdit}>
            <Icon name="pencil" size={14} /> Change these levels
          </Button>
        </div>
      )}
    </div>
  );
}

// ── The editor ───────────────────────────────────────────────────────────────

/** Three-way segmented control for one module row. */
function LevelPicker({ value, onChange, adminCapable }) {
  return (
    <div className="dlevels" role="group">
      {LEVELS.map((lv) => {
        const unavailable = lv.value === 'admin' && !adminCapable;
        return (
          <button
            key={lv.value}
            type="button"
            disabled={unavailable}
            className={`dlevel dlevel--${lv.tone}${value === lv.value ? ' is-on' : ''}`}
            title={unavailable ? 'This module has no administrative surface' : lv.hint}
            onClick={() => onChange(lv.value)}>
            {lv.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * One designation, edited on its own.
 *
 * Everything about it is in one place — its name, the line that describes it and
 * the level it grants on every enabled module — and one Save writes the lot.
 * Modules the Super Admin has switched off are deliberately absent: the server
 * merges what is posted over what is stored, so the level held for a disabled
 * module survives untouched and returns the moment the module is enabled again.
 */
export function DesignationEditor({ row, modules, disabledModules, onClose, onSave, saving }) {
  const [form, setForm] = useState({ name: '', description: '' });
  const [perms, setPerms] = useState({});

  useEffect(() => {
    if (!row) return;
    setForm({ name: row.name || '', description: row.description || '' });
    setPerms({ ...(row.permissions || {}) });
  }, [row]);

  const keys   = useMemo(() => modules.map((m) => m.key), [modules]);
  const nAdmin = countBy(perms, keys, 'admin');
  const nUser  = countBy(perms, keys, 'user');
  const nNone  = keys.length - nAdmin - nUser;

  const setAll = (level) => setPerms((p) => {
    const next = { ...p };
    for (const m of modules) next[m.key] = (level === 'admin' && !m.adminCapable) ? 'user' : level;
    return next;
  });

  const submit = (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    // Only the enabled modules are sent — see the note above.
    const scoped = Object.fromEntries(keys.map((k) => [k, levelOf(perms, k)]));
    onSave({ name, description: form.description.trim(), permissions: scoped });
  };

  return (
    <Modal open={!!row} onClose={onClose} maxWidth={940}
      title={row ? `Edit “${row.name}”` : 'Edit Designation'}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button form="designation-edit" type="submit" loading={saving}>Save Changes</Button>
      </>}>
      <form id="designation-edit" onSubmit={submit}>
        {row && !row.isActive && (
          <Alert variant="warning">
            This designation is inactive — nobody holding it gets any module access until it is
            activated again, whatever is set below.
          </Alert>
        )}

        <div className="dform">
          <div className="form-group">
            <label className="form-label required">Name</label>
            <input className="form-control" maxLength={60} required value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <div className="form-hint">
              Every teacher holding it moves with the new name, so nobody loses their permissions.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <input className="form-control" maxLength={160} value={form.description}
              placeholder="e.g. Manages fees, payroll and financial records"
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            <div className="form-hint">One line, shown beside the designation in the list.</div>
          </div>
        </div>

        <div className="dgrid__head">
          <div>
            <h4>Module Access</h4>
            <p>{nAdmin} admin · {nUser} normal · {nNone} no access</p>
          </div>
          <div className="dgrid__bulk">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAll('admin')}>All Admin</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAll('user')}>All Normal</button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAll('none')}>Clear All</button>
          </div>
        </div>

        {modules.length === 0 ? (
          <Empty icon="🔒" title="No modules enabled"
            message="The Super Admin has not enabled any module for this school yet." />
        ) : (
          <div className="dgrid">
            {modules.map((m) => {
              const level = levelOf(perms, m.key);
              return (
                <div key={m.key} className={`drow drow--${level}`}>
                  <span className={`drow__icon tint-${moduleTone(modules, m.key)}`} aria-hidden>{m.icon}</span>
                  <div className="drow__text">
                    <div className="drow__label">{m.label}</div>
                    <div className="drow__desc">{m.description}</div>
                  </div>
                  <LevelPicker value={level} adminCapable={m.adminCapable}
                    onChange={(lv) => setPerms((p) => ({ ...p, [m.key]: lv }))} />
                </div>
              );
            })}
          </div>
        )}

        {disabledModules.length > 0 && (
          <p className="dnote">
            <Icon name="alert" size={14} />
            <span>
              <strong>{disabledModules.length} module{disabledModules.length === 1 ? ' is' : 's are'} switched
              off for this school</strong> ({disabledModules.map((m) => m.label).join(', ')}) and cannot be granted
              here. Whatever was configured for them is kept and comes back if they are enabled again.
            </span>
          </p>
        )}
      </form>
    </Modal>
  );
}

// ── The record, beside the list ──────────────────────────────────────────────

/** Everything about one designation, read-only — the eye icon on the row. */
export function DesignationDrawer({ row, modules, onClose, onEdit }) {
  if (!row) return null;
  const look = lookOf(row.name);
  const perms = row.permissions || {};
  const admin  = modules.filter((m) => levelOf(perms, m.key) === 'admin');
  const normal = modules.filter((m) => levelOf(perms, m.key) === 'user');

  return (
    <Drawer open onClose={onClose}>
      <div className="ldrawer__head">
        <span className={`ldesig__icon tint-${look.tone}`} style={{ width: 52, height: 52, borderRadius: 14 }}>
          <Icon name={look.icon} size={26} />
        </span>
        <div className="ldrawer__id">
          <h3>{row.name}</h3>
          {row.description ? <p>{row.description}</p> : null}
          <div className="ldrawer__tags">
            <Badge variant={row.isActive ? 'success' : 'muted'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
            <Badge variant="info">{admin.length + normal.length} of {modules.length} modules</Badge>
            {admin.length > 0 && <Badge variant="primary">{admin.length} administrative</Badge>}
          </div>
        </div>
        <button type="button" className="lact" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="ldrawer__body">
        <section className="ldrawer__sec">
          <h4>Who holds it</h4>
          <dl>
            <div className="lfield"><dt>Teachers</dt><dd>{row.teacherCount || 0}</dd></div>
            <div className="lfield"><dt>Admins</dt><dd>{row.adminCount || 0}</dd></div>
            <div className="lfield"><dt>Created</dt><dd>{fmtDate(row.createdAt) || <Blank />}</dd></div>
          </dl>
        </section>

        <section className="ldrawer__sec">
          <h4>Module access</h4>
          {/* The same breakdown the row expands into, so the two never drift. */}
          <AccessDetail modules={modules} permissions={perms} />
        </section>

        {!row.isActive && (
          <Alert variant="warning">
            Inactive: everyone holding this designation is denied every module until it is activated.
          </Alert>
        )}
      </div>

      <DrawerFoot>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={() => onEdit(row)}><Icon name="pencil" size={15} /> Edit access</Button>
      </DrawerFoot>
    </Drawer>
  );
}

// ── Who is holding it ────────────────────────────────────────────────────────

/**
 * The people on a designation.
 *
 * Opened deliberately from the row's menu, and again — unasked — when a delete
 * is refused, because "reassign them first" is only actionable next to the list
 * of who "them" is. `blocking` switches it between the two.
 */
export function HoldersModal({ state, onClose, onDownload, downloading }) {
  const teachers = state?.teachers || [];
  return (
    <Modal open={!!state} onClose={onClose} maxWidth={880}
      title={state?.blocking ? 'Cannot Delete Designation' : `Teachers — ${state?.name || ''}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={onDownload} loading={downloading} disabled={!teachers.length}>
          <Icon name="download" size={15} /> Download Excel
        </Button>
      </>}>
      {state?.blocking && (
        <Alert variant="danger">
          {state.message
            || `Cannot delete “${state.name}” — ${teachers.length} teacher${teachers.length === 1 ? '' : 's'} still ${teachers.length === 1 ? 'has' : 'have'} this designation. Reassign ${teachers.length === 1 ? 'them' : 'them all'} to another designation first.`}
        </Alert>
      )}

      <p className="dnote dnote--plain">
        {state?.blocking
          ? 'Reassign each teacher on the Teachers page, then delete the designation. Download the list to work through it offline.'
          : 'Everyone below inherits this designation’s module access. Change someone’s designation on the Teachers page.'}
      </p>

      {teachers.length ? (
        <div className="table-wrap" style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
          <table className="table ltable" style={{ margin: 0, minWidth: 720 }}>
            <thead>
              <tr>
                <th>Employee ID</th><th>Teacher</th><th>Phone</th>
                <th>Department</th><th>Joined</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t._id} data-focus-id={t._id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{t.employeeId || <Blank />}</td>
                  <td>
                    <div className="lwho__name">{t.name}</div>
                    <div className="lwho__sub">{t.email}</div>
                  </td>
                  <td>{t.phone || <Blank />}</td>
                  <td>{t.department || <Blank />}</td>
                  <td>{t.joiningDate || <Blank />}</td>
                  <td>
                    <Badge variant={t.isActive ? 'success' : 'muted'}>{t.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty icon="👥" title="Nobody holds it"
          message="No teacher has this designation, so it can be edited or deleted freely." />
      )}
    </Modal>
  );
}
