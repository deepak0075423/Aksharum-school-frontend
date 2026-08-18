import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useModules } from '../../contexts/ModulesContext';
import { useChatNotify } from '../../contexts/ChatNotifyContext';
import { ADMIN_CAPABLE_MODULES } from '../../utils/modules';
import logoIcon from '../../assets/logo-icon.svg';
import { schoolLogoUrl } from '../../utils/branding';

const Icon = ({ name }) => <span className="sidebar__link-icon">{name}</span>;

const SUPER_ADMIN_NAV = [
  { section: 'Overview' },
  { to: '/super-admin/dashboard',   icon: '🏠', label: 'Dashboard' },
  { section: 'Management' },
  { to: '/super-admin/schools',     icon: '🏫', label: 'Schools' },
  { to: '/super-admin/users',       icon: '👥', label: 'Users' },
  { to: '/super-admin/videos',      icon: '🎬', label: 'Video Library' },
  { to: '/super-admin/permissions', icon: '🔑', label: 'Permissions' },
  { section: 'System' },
  { to: '/super-admin/notifications', icon: '🔔', label: 'Notifications' },
  { to: '/profile',                   icon: '👤', label: 'Profile' },
];

const ADMIN_NAV = [
  { section: 'Overview' },
  { to: '/admin/dashboard',         icon: '🏠', label: 'Dashboard' },
  { section: 'People' },
  { to: '/admin/teachers',          icon: '👨‍🏫', label: 'Teachers' },
  { to: '/admin/students',          icon: '👨‍🎓', label: 'Students' },
  { to: '/admin/admins',            icon: '👤', label: 'Admins' },
  { to: '/admin/designations',      icon: '🎫', label: 'Designations' },
  { to: '/admin/employee-directory/dashboard', icon: '🗂️', label: 'Employee Directory', module: 'employeeDirectory' },
  { section: 'Academics' },
  { to: '/admin/academic-years',    icon: '📅', label: 'Academic Years' },
  { to: '/admin/classes',           icon: '🏛️', label: 'Classes' },
  { to: '/admin/subjects',          icon: '📚', label: 'Subjects' },
  { to: '/admin/timetable',         icon: '🕐', label: 'Timetable',     module: 'timetable' },
  { to: '/admin/exams',             icon: '📝', label: 'Aptitude Exams', module: 'aptitudeExam' },
  { to: '/admin/results',           icon: '📊', label: 'Results',       module: 'result' },
  { to: '/admin/attendance',        icon: '✅', label: 'Attendance',    module: 'attendance' },
  { to: '/admin/student-analytics', icon: '🧭', label: 'Student Analytics' },
  { section: 'Modules' },
  { to: '/admin/fees/dashboard',    icon: '💰', label: 'Fees',          module: 'fees' },
  { to: '/admin/payroll/dashboard', icon: '💵', label: 'Payroll',       module: 'payroll' },
  { to: '/admin/library/dashboard', icon: '📖', label: 'Library',       module: 'library' },
  { to: '/admin/inventory/dashboard', icon: '📦', label: 'Inventory',   module: 'inventory' },
  { to: '/admin/transport/dashboard', icon: '🚌', label: 'Transport',   module: 'transport' },
  { to: '/admin/videos/browse',     icon: '🎬', label: 'Video Learning', module: 'videoLibrary' },
  { to: '/admin/feedback/dashboard', icon: '⭐', label: 'Teacher Feedback', module: 'feedback' },
  { to: '/admin/leave',             icon: '🏖️', label: 'Leave',         module: 'leave' },
  { to: '/admin/documents',         icon: '📁', label: 'Documents',     module: 'document' },
  { to: '/admin/holidays',          icon: '🎉', label: 'Holidays',      module: 'holiday' },
  { to: '/admin/notifications',     icon: '🔔', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: '💬', label: 'Chat',          module: 'chat' },
  { to: '/admin/reports',           icon: '📈', label: 'Reports' },
  { section: 'Settings' },
  { to: '/admin/school-settings',   icon: '⚙️', label: 'School Settings' },
  { section: 'Account' },
  { to: '/profile',                 icon: '👤', label: 'Profile' },
];

const TEACHER_NAV = [
  { section: 'Overview' },
  { to: '/teacher/dashboard',       icon: '🏠', label: 'Dashboard' },
  { section: 'My Class' },
  { to: '/teacher/my-section',      icon: '🏛️', label: 'My Section' },
  { to: '/teacher/attendance',      icon: '✅', label: 'Attendance',    module: 'attendance' },
  { to: '/teacher/timetable',       icon: '🕐', label: 'Timetable',     module: 'timetable' },
  { to: '/teacher/student-analytics', icon: '🧭', label: 'Student Analytics' },
  { to: '/teacher/employee-directory/employees', icon: '🗂️', label: 'Employee Directory', module: 'employeeDirectory' },
  { section: 'Academics' },
  { to: '/teacher/exams',           icon: '📝', label: 'Aptitude Exams', module: 'aptitudeExam' },
  { to: '/teacher/results',         icon: '📊', label: 'Results',       module: 'result' },
  { section: 'Modules' },
  { to: '/teacher/leave',           icon: '🏖️', label: 'My Leave',      module: 'leave' },
  { to: '/teacher/documents',       icon: '📁', label: 'Documents',     module: 'document' },
  { to: '/teacher/payroll/ctc',     icon: '💵', label: 'Payroll',       module: 'payroll' },
  { to: '/teacher/library',         icon: '📖', label: 'Library',       module: 'library' },
  { to: '/teacher/manage-library/dashboard', icon: '📚', label: 'Manage Library', module: 'library', requires: 'isLibrarian' },
  { to: '/teacher/inventory/requests', icon: '📦', label: 'Inventory',   module: 'inventory' },
  { to: '/teacher/videos/catalog',  icon: '🎬', label: 'Video Learning', module: 'videoLibrary' },
  { to: '/teacher/feedback/dashboard', icon: '⭐', label: 'My Feedback', module: 'feedback' },
  { to: '/teacher/feedback-review/dashboard', icon: '🏫', label: 'Feedback Review', module: 'feedback', requires: 'isPrincipal' },
  { to: '/teacher/holidays',        icon: '🎉', label: 'Holidays',      module: 'holiday' },
  { to: '/teacher/notifications',   icon: '🔔', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: '💬', label: 'Chat',          module: 'chat' },
  { section: 'Account' },
  { to: '/profile',                 icon: '👤', label: 'Profile' },
];

const STUDENT_NAV = [
  { section: 'Overview' },
  { to: '/student/dashboard',       icon: '🏠', label: 'Dashboard' },
  { section: 'Academics' },
  { to: '/student/my-class',        icon: '🏛️', label: 'My Class' },
  { to: '/student/timetable',       icon: '🕐', label: 'Timetable',     module: 'timetable' },
  { to: '/student/attendance',      icon: '✅', label: 'Attendance',    module: 'attendance' },
  { to: '/student/exams',           icon: '📝', label: 'Exams',         module: 'aptitudeExam' },
  { to: '/student/results',         icon: '📊', label: 'Results',       module: 'result' },
  { section: 'Resources' },
  { to: '/student/documents',       icon: '📁', label: 'Documents',     module: 'document' },
  { to: '/student/holidays',        icon: '🎉', label: 'Holidays',      module: 'holiday' },
  { to: '/student/fees',            icon: '💰', label: 'Fees',          module: 'fees' },
  { to: '/student/transport',       icon: '🚌', label: 'Transport',     module: 'transport' },
  { to: '/student/videos',          icon: '🎬', label: 'Video Learning', module: 'videoLibrary' },
  { to: '/student/library',         icon: '📖', label: 'Library',       module: 'library' },
  { to: '/student/feedback',        icon: '⭐', label: 'Teacher Feedback', module: 'feedback' },
  { to: '/student/notifications',   icon: '🔔', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: '💬', label: 'Chat',          module: 'chat' },
  { section: 'Account' },
  { to: '/profile',                 icon: '👤', label: 'Profile' },
];

const PARENT_NAV = [
  { section: 'Overview' },
  { to: '/parent/dashboard',        icon: '🏠', label: 'Dashboard' },
  { section: "My Child" },
  { to: '/parent/child-class',      icon: '🏛️', label: 'Class Info' },
  { to: '/parent/child-attendance', icon: '✅', label: 'Attendance',    module: 'attendance' },
  { to: '/parent/exams',            icon: '📝', label: 'Exams',         module: 'aptitudeExam' },
  { to: '/parent/results',          icon: '📊', label: 'Results',       module: 'result' },
  { section: 'Resources' },
  { to: '/parent/documents',        icon: '📁', label: 'Documents',     module: 'document' },
  { to: '/parent/holidays',         icon: '🎉', label: 'Holidays',      module: 'holiday' },
  { to: '/parent/child-fees',       icon: '💰', label: 'Fees',          module: 'fees' },
  { to: '/parent/transport/track',  icon: '🚌', label: 'Transport',     module: 'transport' },
  { to: '/parent/notifications',    icon: '🔔', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: '💬', label: 'Chat',          module: 'chat' },
  { section: 'Account' },
  { to: '/profile',                 icon: '👤', label: 'Profile' },
];

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

  return (
    <nav className="sidebar">
      <div className="sidebar__logo">
        <img
          src={schoolLogoUrl(user?.school) || logoIcon}
          alt={user?.school?.name || 'Aksharum'}
          style={schoolLogoUrl(user?.school) ? { background: '#fff', borderRadius: 6, padding: 2, objectFit: 'contain' } : undefined}
        />
        {!collapsed && (
          <span title={user?.school?.name || 'Aksharum'}>{user?.school?.name || 'Aksharum'}</span>
        )}
        {/* Mobile-only close button for the off-canvas drawer */}
        <button className="sidebar__close" onClick={onLinkClick} aria-label="Close menu">✕</button>
      </div>

      <div className="sidebar__nav">
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
              <Icon name={item.icon} />
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
          <div className="sidebar__link" style={{ cursor: 'default' }}>
            <div className="avatar avatar-sm" style={{ background: 'rgba(255,255,255,.2)', fontSize: user?.profileIcon ? '1rem' : '.85rem' }}>
              {user?.profileIcon ? user.profileIcon : user?.name?.[0]?.toUpperCase()}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ color: '#fff', fontSize: '.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user?.name}
              </div>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: '.75rem', textTransform: 'capitalize' }}>
                {user?.role?.replace('_', ' ')}
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
