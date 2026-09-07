/**
 * The administrative view of one employee — the shell around the tabs.
 *
 * Who sees this: a school admin, and a teacher whose designation grants ADMIN
 * access to the employee directory. Both arrive as `viewer.isAdmin` from the
 * server, which is also what decided how much of the record was sent; a
 * colleague without that access gets the compact profile instead and never
 * reaches any of this.
 *
 * Nothing here re-decides access. If a block is missing from the payload the
 * viewer was not entitled to it, and the tab for it is not offered.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createPortal } from 'react-dom';
import Icon from '../../components/ui/icons';
import { Badge } from '../../components/ui/index';
import { Avatar, STATUS_LABEL, STATUS_TONE, fmtDate } from './parts';

// ── Header ───────────────────────────────────────────────────────────────────

export const Crumbs = ({ base, name }) => (
  <div className="breadcrumb">
    <Link to="/admin/dashboard">Dashboard</Link>
    <span aria-hidden>›</span>
    <Link to={`${base}/employees`}>Employees</Link>
    <span aria-hidden>›</span>
    <span>{name}</span>
  </div>
);

/** The overflow menu on the header — everything that is not the primary action. */
export function MoreMenu({ children }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc  = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="epmore" ref={ref}>
      <button type="button" className="btn btn-secondary" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        More <Icon name="chevronDown" size={14} />
      </button>
      {open && <div className="epmore__panel" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}

export const MenuAction = ({ icon, children, onClick, to, href, danger }) => {
  const cls = `epmore__item${danger ? ' is-danger' : ''}`;
  const body = <><Icon name={icon} size={15} />{children}</>;
  if (to)   return <Link className={cls} to={to}>{body}</Link>;
  if (href) return <a className={cls} href={href}>{body}</a>;
  return <button type="button" className={cls} onClick={onClick}>{body}</button>;
};

/**
 * Who this is, and what can be done about them.
 *
 * The identity band carries the three things an administrator needs before any
 * tab is opened — who, what they do, and whether their account is live — and
 * the actions sit beside it rather than at the bottom of a menu.
 */
export const ProfileHeader = ({ o, base, modules, onEdit, onToggle, toggling }) => {
  const active = o.employmentStatus !== 'inactive' && o.isActive !== false;
  return (
    <header className="ephero">
      <Avatar name={o.name} src={o.profileImage} size={84} />

      <div className="ephero__id">
        <h1>
          {o.name}
          <Badge variant={STATUS_TONE[o.employmentStatus] || 'muted'}>
            {STATUS_LABEL[o.employmentStatus] || 'Unknown'}
          </Badge>
        </h1>
        <p className="ephero__meta">
          {[o.employeeId, o.designation, o.department].filter(Boolean).join(' · ') || 'No employment details on file'}
        </p>
        <p className="ephero__contact">
          {o.officialEmail && <span><Icon name="mail" size={14} /> {o.officialEmail}</span>}
          {o.officialPhone && <span><Icon name="phone" size={14} /> {o.officialPhone}</span>}
          {o.joiningDate && <span><Icon name="calendar" size={14} /> Joined {fmtDate(o.joiningDate)}</span>}
        </p>
      </div>

      <div className="ephero__acts">
        <button type="button" className="btn btn-secondary" onClick={onEdit}>
          <Icon name="pencil" size={16} /> Edit
        </button>
        {o.officialEmail && (
          <a className="btn btn-secondary" href={`mailto:${o.officialEmail}`}>
            <Icon name="mail" size={16} /> Email
          </a>
        )}
        <MoreMenu>
          {/* Only when the school runs chat, and it opens THIS person's
              conversation rather than the chat screen at large. */}
          {modules?.chat && (
            <MenuAction icon="chat" to={`/chat?user=${o._id}`}>Message on chat</MenuAction>
          )}
          {o.officialPhone && (
            <MenuAction icon="phone" href={`tel:${String(o.officialPhone).replace(/\s/g, '')}`}>Call</MenuAction>
          )}
          <MenuAction icon="users" to={`${base}/employees`}>Back to the directory</MenuAction>
          <div className="epmore__sep" />
          <MenuAction icon="power" danger={active} onClick={onToggle}>
            {toggling ? 'Working…' : active ? 'Deactivate employee' : 'Activate employee'}
          </MenuAction>
        </MoreMenu>
        <Link className="btn btn-primary" to={`${base}/employees`}>
          <Icon name="chevronLeft" size={15} /> Back to Employees
        </Link>
      </div>
    </header>
  );
};

/** The four facts that identify an employment, above everything else. */
export const SummaryTiles = ({ o }) => (
  <div className="eptiles">
    <div className="eptile">
      <span className="eptile__icon tint-indigo"><Icon name="idCard" size={20} /></span>
      <div><small>Employee ID</small><b>{o.employeeId || 'Not set'}</b></div>
    </div>
    <div className="eptile">
      <span className="eptile__icon tint-amber"><Icon name="building" size={20} /></span>
      <div><small>Department</small><b>{o.department || 'Unassigned'}</b></div>
    </div>
    <div className="eptile">
      <span className="eptile__icon tint-purple"><Icon name="badge" size={20} /></span>
      <div><small>Designation</small><b>{o.designation || 'Not set'}</b></div>
    </div>
    <div className="eptile">
      <span className="eptile__icon tint-blue"><Icon name="teacher" size={20} /></span>
      <div>
        <small>Employment type</small>
        <b>{o.staffType === 'teaching' ? 'Teaching staff' : o.staffType ? 'Non-teaching staff' : 'Not set'}</b>
      </div>
    </div>
  </div>
);

/** The tab strip. Scrolls rather than wrapping, so the page never jumps a row. */
export const ProfileTabs = ({ tabs, active, onPick }) => (
  <nav className="eptabs" aria-label="Employee record">
    {tabs.map((t) => (
      <button key={t.key} type="button" onClick={() => onPick(t.key)}
        className={`eptab${active === t.key ? ' is-on' : ''}`} aria-pressed={active === t.key}>
        <Icon name={t.icon} size={15} /> {t.label}
      </button>
    ))}
  </nav>
);

// ── Overview ─────────────────────────────────────────────────────────────────

/**
 * Which part of the record each missing field belongs to.
 *
 * The server returns the completion as a flat list of what is not filled in
 * (COMPLETION_FIELDS in employeeDirectoryService.js). An administrator does not
 * think in fields, they think "whose contact details are missing" — so the
 * areas are reassembled here from the same keys the server counts.
 */
const AREA_OF = {
  name: 'personal', dob: 'personal', gender: 'personal', bloodGroup: 'personal',
  fatherOrHusbandName: 'personal', emergencyContactName: 'personal', emergencyContactPhone: 'personal',

  email: 'contact', phone: 'contact', currentAddress: 'contact', currentCity: 'contact',
  currentState: 'contact', currentPincode: 'contact', permanentAddress: 'contact',

  aadhaarNumber: 'identity', aadhaarFrontFile: 'identity', aadhaarBackFile: 'identity',
  panNumber: 'identity', panCardFile: 'identity',

  qualification: 'education',

  employmentType: 'employment', joiningDate: 'employment', employeeId: 'employment',
  totalExperience: 'employment', previousSchool: 'employment', lastDesignation: 'employment',
  resignationLetterFile: 'employment',

  bankAccountHolder: 'bank', bankAccountNumber: 'bank', bankIfsc: 'bank', bankBranch: 'bank',
};

const AREAS = [
  { key: 'personal',   label: 'Personal details',   icon: 'user',    tab: 'personal' },
  { key: 'contact',    label: 'Contact information', icon: 'phone',  tab: 'contact' },
  { key: 'employment', label: 'Employment details', icon: 'badge',   tab: 'employment' },
  { key: 'education',  label: 'Education details',  icon: 'bookOpen', tab: 'education' },
  { key: 'identity',   label: 'Government ID',      icon: 'idCard',  tab: 'governmentIds' },
  { key: 'bank',       label: 'Bank details',       icon: 'banknote', tab: 'bank' },
];

export const areasFrom = (completion) => {
  const missing = completion?.missing || [];
  const byArea = {};
  for (const m of missing) {
    const area = AREA_OF[m.key] || 'employment';
    (byArea[area] ||= []).push(m.label);
  }
  return AREAS.map((a) => ({ ...a, missing: byArea[a.key] || [] }));
};

/**
 * How much of the record is on file.
 *
 * The percentage answers "is this finished"; the list answers "finish what",
 * which is the only reason anyone opens this card. Each incomplete area names
 * what it is waiting for and opens the tab that fixes it.
 */
export const Completion = ({ completion, onGo }) => {
  if (!completion) return null;
  const areas = areasFrom(completion);
  const done  = areas.filter((a) => !a.missing.length).length;

  return (
    <section className="card epcard">
      <header className="epcard__head">
        <span className="epcard__icon tint-indigo"><Icon name="activity" size={18} /></span>
        <h2>Profile completion</h2>
        <b className="epcomp__pct">{completion.percent}%</b>
      </header>
      <div className="epcard__body">
        <div className="epcomp__bar"><i style={{ width: `${completion.percent}%` }} /></div>
        <p className="epcomp__sub">
          {completion.filled} of {completion.total} fields on file · {done} of {areas.length} sections complete
        </p>

        <ul className="epcomp__list">
          {areas.map((a) => (
            <li key={a.key} className={a.missing.length ? 'is-open' : 'is-done'}>
              <Icon name={a.missing.length ? 'alert' : 'checkCircle'} size={15} />
              <span>
                <b>{a.label}</b>
                {a.missing.length > 0 && (
                  <small title={a.missing.join(', ')}>
                    {a.missing.length} missing — {a.missing.slice(0, 2).join(', ')}
                    {a.missing.length > 2 ? '…' : ''}
                  </small>
                )}
              </span>
              {a.missing.length > 0 && (
                <button type="button" onClick={() => onGo(a.tab)}>Open</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};

/** The photograph on file, at a size somebody can actually recognise. */
export const PhotoCard = ({ o, onOpen }) => (
  <section className="card epcard">
    <header className="epcard__head">
      <span className="epcard__icon tint-green"><Icon name="userCircle" size={18} /></span>
      <h2>Profile photo</h2>
    </header>
    <div className="epcard__body epphoto">
      {o.profileImage
        ? (
          <button type="button" className="epphoto__hit" onClick={onOpen} title="Open full size">
            <Avatar name={o.name} src={o.profileImage} size={132} />
          </button>
        )
        : <Avatar name={o.name} size={132} />}
      <b>{o.name}</b>
      <small>{[o.designation, o.department].filter(Boolean).join(' · ') || 'No employment details'}</small>
      {!o.profileImage && <p className="epphoto__none">No photograph on file.</p>}
    </div>
  </section>
);

/** The things done to an employee rather than read about them. */
export const QuickActions = ({ o, base, modules, onToggle, toggling, onEdit }) => {
  const active = o.employmentStatus !== 'inactive' && o.isActive !== false;
  return (
    <section className="card epcard">
      <header className="epcard__head">
        <span className="epcard__icon tint-purple"><Icon name="sparkle" size={18} /></span>
        <h2>Quick actions</h2>
      </header>
      <div className="epcard__body epquick">
        <button type="button" onClick={onEdit}><Icon name="pencil" size={16} /> Edit the record</button>
        {modules?.chat && (
          <Link to={`/chat?user=${o._id}`}><Icon name="chat" size={16} /> Message on chat</Link>
        )}
        {o.officialPhone && (
          <a href={`tel:${String(o.officialPhone).replace(/\s/g, '')}`}><Icon name="phone" size={16} /> Call</a>
        )}
        {o.officialEmail && (
          <a href={`mailto:${o.officialEmail}`}><Icon name="mail" size={16} /> Send an email</a>
        )}
        <Link to={`${base}/employees`}><Icon name="users" size={16} /> View in the directory</Link>
        <button type="button" className={active ? 'is-danger' : ''} onClick={onToggle} disabled={toggling}>
          <Icon name="power" size={16} />
          {toggling ? 'Working…' : active ? 'Deactivate employee' : 'Activate employee'}
        </button>
      </div>
    </section>
  );
};

/** A titled block of label/value rows — the shape every overview panel takes. */
export const FactCard = ({ icon, tone = 'indigo', title, rows }) => (
  <section className="card epcard">
    <header className="epcard__head">
      <span className={`epcard__icon tint-${tone}`}><Icon name={icon} size={18} /></span>
      <h2>{title}</h2>
    </header>
    <div className="epcard__body">
      <dl className="epfacts">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value === 0 || value ? value : <span className="ed-none">Not on file</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  </section>
);

/** The photograph, over the page. */
export function PhotoLightbox({ src, name, onClose }) {
  useEffect(() => {
    if (!src) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', esc);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', esc);
    };
  }, [src, onClose]);

  if (!src) return null;
  return createPortal(
    <div className="verlight" role="dialog" aria-modal="true" aria-label={`${name}'s photograph`} onClick={onClose}>
      <div className="verlight__bar">
        <span>{name}</span>
        <button type="button" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
      </div>
      <div className="verlight__stage" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={name} />
      </div>
    </div>,
    document.body,
  );
}
