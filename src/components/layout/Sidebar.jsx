import { useRef, useLayoutEffect } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useModules } from '../../contexts/ModulesContext';
import { useChatNotify } from '../../contexts/ChatNotifyContext';
import { ADMIN_CAPABLE_MODULES } from '../../utils/modules';
import logoIcon from '../../assets/logo-icon.svg';
import { schoolLogoUrl } from '../../utils/branding';
import Icon from '../ui/icons';

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

const SUPER_ADMIN_NAV = [
  { section: 'Overview' },
  { to: '/super-admin/dashboard',   icon: 'home', label: 'Dashboard' },
  { section: 'Management' },
  { to: '/super-admin/schools',     icon: 'school', label: 'Schools' },
  { to: '/super-admin/users',       icon: 'users', label: 'Users' },
  { to: '/super-admin/videos',      icon: 'video', label: 'Video Library' },
  { to: '/super-admin/permissions', icon: 'key', label: 'Permissions' },
  { section: 'System' },
  { to: '/super-admin/notifications', icon: 'bell', label: 'Notifications' },
  { to: '/profile',                   icon: 'user', label: 'Profile' },
];

const ADMIN_NAV = [
  { section: 'Overview' },
  { to: '/admin/dashboard',         icon: 'home', label: 'Dashboard' },
  { section: 'People' },
  { to: '/admin/teachers',          icon: 'teacher', label: 'Teachers' },
  { to: '/admin/students',          icon: 'student', label: 'Students' },
  { to: '/admin/admins',            icon: 'user', label: 'Admins' },
  { to: '/admin/designations',      icon: 'badge', label: 'Designations' },
  { to: '/admin/employee-directory/dashboard', icon: 'folder', label: 'Employee Directory', module: 'employeeDirectory' },
  { section: 'Academics' },
  { to: '/admin/academic-years',    icon: 'calendar', label: 'Academic Years' },
  { to: '/admin/classes',           icon: 'building', label: 'Classes' },
  { to: '/admin/subjects',          icon: 'book', label: 'Subjects' },
  { to: '/admin/timetable',         icon: 'clock', label: 'Timetable',     module: 'timetable' },
  { to: '/admin/exams',             icon: 'fileCheck', label: 'Aptitude Exams', module: 'aptitudeExam' },
  { to: '/admin/results',           icon: 'chart', label: 'Results',       module: 'result' },
  { to: '/admin/attendance',        icon: 'checkSquare', label: 'Attendance',    module: 'attendance' },
  { to: '/admin/student-analytics', icon: 'compass', label: 'Student Analytics' },
  { section: 'Modules' },
  { to: '/admin/fees/dashboard',    icon: 'wallet', label: 'Fees',          module: 'fees' },
  { to: '/admin/payroll/dashboard', icon: 'banknote', label: 'Payroll',       module: 'payroll' },
  { to: '/admin/library/dashboard', icon: 'bookOpen', label: 'Library',       module: 'library' },
  { to: '/admin/inventory/dashboard', icon: 'package', label: 'Inventory',   module: 'inventory' },
  { to: '/admin/transport/dashboard', icon: 'bus', label: 'Transport',   module: 'transport' },
  { to: '/admin/hostel/dashboard',  icon: 'hotel', label: 'Hostel',        module: 'hostel' },
  { to: '/admin/videos/browse',     icon: 'video', label: 'Video Learning', module: 'videoLibrary' },
  { to: '/admin/feedback/dashboard', icon: 'star', label: 'Teacher Feedback', module: 'feedback' },
  { to: '/admin/leave',             icon: 'umbrella', label: 'Leave',         module: 'leave' },
  { to: '/admin/documents',         icon: 'files', label: 'Documents',     module: 'document' },
  { to: '/admin/holidays',          icon: 'party', label: 'Holidays',      module: 'holiday' },
  { to: '/admin/notifications',     icon: 'bell', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: 'chat', label: 'Chat',          module: 'chat' },
  { to: '/admin/reports',           icon: 'trending', label: 'Reports' },
  { section: 'Settings' },
  { to: '/admin/school-settings',   icon: 'settings', label: 'School Settings' },
  { section: 'Account' },
  { to: '/profile',                 icon: 'user', label: 'Profile' },
];

const TEACHER_NAV = [
  { section: 'Overview' },
  { to: '/teacher/dashboard',       icon: 'home', label: 'Dashboard' },
  { section: 'My Class' },
  { to: '/teacher/my-section',      icon: 'building', label: 'My Section' },
  { to: '/teacher/attendance',      icon: 'checkSquare', label: 'Attendance',    module: 'attendance' },
  { to: '/teacher/timetable',       icon: 'clock', label: 'Timetable',     module: 'timetable' },
  { to: '/teacher/substitutions',   icon: 'repeat', label: 'My Substitutions', module: 'timetable' },
  { to: '/teacher/student-analytics', icon: 'compass', label: 'Student Analytics' },
  { to: '/teacher/employee-directory/employees', icon: 'folder', label: 'Employee Directory', module: 'employeeDirectory' },
  { section: 'Academics' },
  { to: '/teacher/exams',           icon: 'fileCheck', label: 'Aptitude Exams', module: 'aptitudeExam' },
  { to: '/teacher/results',         icon: 'chart', label: 'Results',       module: 'result' },
  { section: 'Modules' },
  { to: '/teacher/leave',           icon: 'umbrella', label: 'My Leave',      module: 'leave' },
  { to: '/teacher/documents',       icon: 'files', label: 'Documents',     module: 'document' },
  { to: '/teacher/payroll/ctc',     icon: 'banknote', label: 'Payroll',       module: 'payroll' },
  { to: '/teacher/library',         icon: 'bookOpen', label: 'Library',       module: 'library' },
  { to: '/teacher/manage-library/dashboard', icon: 'book', label: 'Manage Library', module: 'library', requires: 'isLibrarian' },
  { to: '/teacher/inventory/requests', icon: 'package', label: 'Inventory',   module: 'inventory' },
  { to: '/teacher/videos/catalog',  icon: 'video', label: 'Video Learning', module: 'videoLibrary' },
  { to: '/teacher/feedback/dashboard', icon: 'star', label: 'My Feedback', module: 'feedback' },
  { to: '/teacher/feedback-review/dashboard', icon: 'school', label: 'Feedback Review', module: 'feedback', requires: 'isPrincipal' },
  { to: '/teacher/holidays',        icon: 'party', label: 'Holidays',      module: 'holiday' },
  { to: '/teacher/notifications',   icon: 'bell', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: 'chat', label: 'Chat',          module: 'chat' },
  { section: 'Account' },
  { to: '/profile',                 icon: 'user', label: 'Profile' },
];

const STUDENT_NAV = [
  { section: 'Overview' },
  { to: '/student/dashboard',       icon: 'home', label: 'Dashboard' },
  { section: 'Academics' },
  { to: '/student/my-class',        icon: 'building', label: 'My Class' },
  { to: '/student/timetable',       icon: 'clock', label: 'Timetable',     module: 'timetable' },
  { to: '/student/attendance',      icon: 'checkSquare', label: 'Attendance',    module: 'attendance' },
  { to: '/student/exams',           icon: 'fileCheck', label: 'Exams',         module: 'aptitudeExam' },
  { to: '/student/results',         icon: 'chart', label: 'Results',       module: 'result' },
  { section: 'Resources' },
  { to: '/student/documents',       icon: 'files', label: 'Documents',     module: 'document' },
  { to: '/student/holidays',        icon: 'party', label: 'Holidays',      module: 'holiday' },
  { to: '/student/fees',            icon: 'wallet', label: 'Fees',          module: 'fees' },
  { to: '/student/transport',       icon: 'bus', label: 'Transport',     module: 'transport' },
  { to: '/student/hostel',          icon: 'hotel', label: 'Hostel',        module: 'hostel' },
  { to: '/student/videos',          icon: 'video', label: 'Video Learning', module: 'videoLibrary' },
  { to: '/student/library',         icon: 'bookOpen', label: 'Library',       module: 'library' },
  { to: '/student/feedback',        icon: 'star', label: 'Teacher Feedback', module: 'feedback' },
  { to: '/student/notifications',   icon: 'bell', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: 'chat', label: 'Chat',          module: 'chat' },
  { section: 'Account' },
  { to: '/profile',                 icon: 'user', label: 'Profile' },
];

const PARENT_NAV = [
  { section: 'Overview' },
  { to: '/parent/dashboard',        icon: 'home', label: 'Dashboard' },
  { section: "My Child" },
  { to: '/parent/child-class',      icon: 'building', label: 'Class Info' },
  { to: '/parent/child-attendance', icon: 'checkSquare', label: 'Attendance',    module: 'attendance' },
  { to: '/parent/exams',            icon: 'fileCheck', label: 'Exams',         module: 'aptitudeExam' },
  { to: '/parent/results',          icon: 'chart', label: 'Results',       module: 'result' },
  { section: 'Resources' },
  { to: '/parent/documents',        icon: 'files', label: 'Documents',     module: 'document' },
  { to: '/parent/holidays',         icon: 'party', label: 'Holidays',      module: 'holiday' },
  { to: '/parent/child-fees',       icon: 'wallet', label: 'Fees',          module: 'fees' },
  { to: '/parent/transport/track',  icon: 'bus', label: 'Transport',     module: 'transport' },
  { to: '/parent/hostel',           icon: 'hotel', label: 'Hostel',        module: 'hostel' },
  { to: '/parent/notifications',    icon: 'bell', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: 'chat', label: 'Chat',          module: 'chat' },
  { section: 'Account' },
  { to: '/profile',                 icon: 'user', label: 'Profile' },
];

const HOME_BY_ROLE = {
  super_admin:  '/super-admin/dashboard',
  school_admin: '/admin/dashboard',
  teacher:      '/teacher/dashboard',
  student:      '/student/dashboard',
  parent:       '/parent/dashboard',
};
const homeFor = (role) => HOME_BY_ROLE[role] || '/';

const NAV_MAP = {
  super_admin:  SUPER_ADMIN_NAV,
  school_admin: ADMIN_NAV,
  teacher:      TEACHER_NAV,
  student:      STUDENT_NAV,
  parent:       PARENT_NAV,
};

// Modules a teacher administers through their own /teacher route tree rather than
// the shared /admin one — they already have a dedicated entry above.
const TEACHER_OWN_ADMIN = new Set(['library', 'feedback']);

export default function Sidebar({ onLinkClick, collapsed }) {
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
  // Inserted just before the Account section so it reads as part of the modules.
  let navWithManage = nav;
  if (manageNav.length) {
    const at = nav.findIndex(item => item.section === 'Account');
    const cut = at === -1 ? nav.length : at;
    navWithManage = [...nav.slice(0, cut), { section: 'Module Admin' }, ...manageNav, ...nav.slice(cut)];
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
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `sidebar__link${isActive ? ' active' : ''}`}
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
            </NavLink>
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
