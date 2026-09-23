import React, { useRef, useLayoutEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useModules } from '../../contexts/ModulesContext';
import { useChatNotify } from '../../contexts/ChatNotifyContext';
import { ADMIN_CAPABLE_MODULES } from '../../utils/modules';
import logoIcon from '../../assets/logo-icon.svg';
import { schoolLogoUrl } from '../../utils/branding';
import Icon from '../ui/icons';
// The tree itself lives in navTree.js, so the rail and the app's breadcrumb
// are drawn from one description of the site rather than two.
import { NAV_MAP, homeFor } from './navTree';

const NavIcon = ({ name }) => (
  <span className="sidebar__link-icon"><Icon name={name} size={19} /></span>
);

// Where the footer's Settings row goes. Only an admin has school settings to
// reach; everyone else lands on their own profile, which is where their
// settings actually live.
const SETTINGS_TO = {
  school_admin: '/admin/school-settings',
  super_admin:  '/profile',
};

// Where "Need Help?" goes when a school has no email of its own on file.
const SUPPORT_EMAIL = 'admin@aksharum.com';

// Who is offered the help card at all.
const HELP_ROLES = new Set(['student', 'parent']);

// What this person's copy of the app is called, under the school's name.
const PORTAL_LABEL = {
  super_admin:  'Control Panel',
  school_admin: 'School ERP',
  teacher:      'Teacher Portal',
  student:      'Student Portal',
  parent:       'Parent Portal',
};

/**
 * How far the rail was scrolled, kept OUTSIDE the component on purpose.
 *
 * /chat and /profile mount their own <AppLayout> (see App.jsx), so navigating
 * to either from a role's own tree unmounts this sidebar and mounts a fresh
 * one — which starts at the top and throws away the reader's place. Chat and
 * Profile sit at the bottom of a long nav, so that is exactly where it is felt:
 * you click the last item and the menu jumps to the first.
 *
 * A module-level value survives the remount, and restoring it in a layout
 * effect happens before paint, so the jump is never drawn.
 */
let navScrollTop = 0;
let navScrollRole = null;


// Modules a teacher administers through their own /teacher route tree rather than
// the shared /admin one — they already have a dedicated entry above.
const TEACHER_OWN_ADMIN = new Set(['library', 'feedback']);

export default function Sidebar({ onLinkClick, collapsed }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { unreadTotal } = useChatNotify();
  const { modules, ready: modulesReady } = useModules();

  const rawNav = NAV_MAP[user?.role] || [];
  // While loading show everything; once ready filter by effective access (the
  // per-module boolean already folds in the designation permission).
  const nav = (modulesReady && modules)
    ? rawNav.filter(item =>
        (!item.module   || modules[item.module]) &&
        (!item.requires || modules[item.requires]))
    : rawNav.filter(item => !item.requires);

  // A teacher whose designation grants administrative access to a module gets
  // that module's admin screens, mounted under /admin and gated by
  // AdminAreaGuard. Built from the permission map, so it appears and disappears
  // with the designation and with the school-level module flag.
  const manageNav = (user?.role === 'teacher' && modulesReady && modules?.moduleAdmin)
    ? ADMIN_CAPABLE_MODULES
        .filter(m => modules.moduleAdmin[m.key] && !TEACHER_OWN_ADMIN.has(m.key))
        .map(m => ({ to: m.adminHome, icon: m.icon, label: `Manage ${m.label}` }))
    : [];
  // Some submenus belong only to some people — a plain teacher has one
  // directory screen, so it must not sprout the administrator's sections.
  const navResolved = nav.map(item => (
    item.children && item.childrenIf && !item.childrenIf(modules)
      ? { ...item, children: undefined }
      : item));

  // Inserted just before the Account section so it reads as part of the modules.
  let navWithManage = navResolved;
  if (manageNav.length) {
    const at = navResolved.findIndex(item => item.section === 'Account');
    const cut = at === -1 ? navResolved.length : at;
    navWithManage = [...navResolved.slice(0, cut), { section: 'Module Admin' }, ...manageNav, ...navResolved.slice(cut)];
  }

  const settingsTo = SETTINGS_TO[user?.role] || '/profile';

  /**
   * The help affordance students and parents get: the school's own address when
   * it has one on file, and the product's support address when it does not — so
   * the card always leads somewhere a person actually reads.
   */
  const showHelp  = HELP_ROLES.has(user?.role);
  const helpEmail = user?.school?.email?.trim() || SUPPORT_EMAIL;

  const navRef = useRef(null);
  useLayoutEffect(() => {
    // A different role has a different nav; its offset means nothing here.
    if (navScrollRole !== user?.role) { navScrollTop = 0; navScrollRole = user?.role; }
    if (navRef.current) navRef.current.scrollTop = navScrollTop;
  }, [user?.role]);

  return (
    <nav className="sidebar">
      <Link to={homeFor(user?.role)} className="sidebar__logo" onClick={onLinkClick}>
        <img
          src={schoolLogoUrl(user?.school) || logoIcon}
          alt={user?.school?.name || 'Aksharum'}
          style={schoolLogoUrl(user?.school) ? { background: '#fff', objectFit: 'contain' } : undefined}
        />
        {!collapsed && (
          <span className="sidebar__brand">
            <span className="sidebar__brand-name" title={user?.school?.name || 'Aksharum'}>
              {user?.school?.name || 'Aksharum'}
            </span>
            <span className="sidebar__brand-sub">{PORTAL_LABEL[user?.role] || 'School ERP'}</span>
          </span>
        )}
        {/* Mobile-only close button for the off-canvas drawer */}
        <button
          className="sidebar__close"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onLinkClick?.(); }}
          aria-label="Close menu"
        >
          <Icon name="close" size={18} />
        </button>
      </Link>

      <div
        className="sidebar__nav"
        ref={navRef}
        onScroll={e => { navScrollTop = e.currentTarget.scrollTop; }}
      >
        {navWithManage.map((item, i) => {
          if (item.section) {
            return collapsed ? null : (
              <div key={i} className="sidebar__section-title">{item.section}</div>
            );
          }
          const inside = item.match && (pathname === item.match || pathname.startsWith(`${item.match}/`));
          const subOpen = !collapsed && item.children && inside;
          return (
            <React.Fragment key={item.to}>
            <NavLink
              to={item.to}
              // `match` marks an entry that opens one tab of a wider module, so
              // the whole module stays lit while you move between its tabs.
              className={({ isActive }) => {
                const on = item.match
                  ? pathname === item.match || pathname.startsWith(`${item.match}/`)
                  : isActive;
                return `sidebar__link${on ? ' active' : ''}`;
              }}
              onClick={onLinkClick}
              title={collapsed ? item.label : undefined}
            >
              <NavIcon name={item.icon} />
              {!collapsed && <span className="sidebar__link-text">{item.label}</span>}
              {item.to === '/chat' && unreadTotal > 0 && (
                <span className="sidebar__badge">{unreadTotal > 99 ? '99+' : unreadTotal}</span>
              )}
              {!collapsed && item.badge && (
                <span className="sidebar__badge">{item.badge}</span>
              )}
              {!collapsed && item.children && (
                <span className={`sidebar__chev${subOpen ? ' is-open' : ''}`}><Icon name="chevronDown" size={15} /></span>
              )}
            </NavLink>
            {subOpen && (
              <div className="sidebar__sub">
                {item.children.map(c => (
                  <NavLink key={c.to} to={c.to} end={c.end} onClick={onLinkClick}
                    className={({ isActive }) => `sidebar__sublink${isActive ? ' active' : ''}`}>
                    {({ isActive }) => (<>{isActive ? <span className="sidebar__submark">✦</span> : null}{c.label}</>)}
                  </NavLink>
                ))}
              </div>
            )}
            </React.Fragment>
          );
        })}
      </div>

      {!collapsed && (
        <div className="sidebar__footer">
          {showHelp && (
            <a href={`mailto:${helpEmail}`} className="sidebar__help" title={helpEmail}>
              <span className="sidebar__help-icon"><Icon name="lifebuoy" size={19} /></span>
              <span className="sidebar__help-text">
                <span className="sidebar__help-title">Need Help?</span>
                <span className="sidebar__help-sub">{helpEmail}</span>
              </span>
            </a>
          )}

          <Link to="/profile" className="sidebar__me" onClick={onLinkClick}>
            <div className="avatar avatar-sm sidebar__me-avatar"
              style={{ fontSize: user?.profileIcon ? '1rem' : '.8rem' }}>
              {user?.profileIcon ? user.profileIcon : user?.name?.[0]?.toUpperCase()}
            </div>
            <div className="sidebar__me-text">
              <div className="sidebar__me-name">{user?.name}</div>
              <div className="sidebar__me-role">{user?.role?.replace('_', ' ')}</div>
            </div>
            <Icon name="chevronDown" size={15} />
          </Link>

          <NavLink to={settingsTo} onClick={onLinkClick}
            className={({ isActive }) => `sidebar__link sidebar__settings${isActive ? ' active' : ''}`}>
            <NavIcon name="settings" />
            <span className="sidebar__link-text">Settings</span>
          </NavLink>
        </div>
      )}
    </nav>
  );
}
