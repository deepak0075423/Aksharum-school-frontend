/**
 * The module registry, frontend side. Mirrors school-backend/config/modules.js
 * and adds the one thing only the frontend knows: where each module's
 * administrative screens live.
 *
 * `adminBase` is the URL prefix of a module's admin area under /admin, and
 * `adminHome` is where a module admin should land. Both are used twice:
 *   • the sidebar builds a teacher's "manage" links from them, and
 *   • AdminAreaGuard maps the current path back to a module key to decide
 *     whether a teacher holding admin on that module may be there.
 */

export const MODULES = [
  { key: 'attendance',   label: 'Attendance',       icon: 'checkSquare', adminBase: '/admin/attendance',  adminHome: '/admin/attendance' },
  { key: 'timetable',    label: 'Timetable',        icon: 'clock', adminBase: '/admin/timetable',   adminHome: '/admin/timetable' },
  { key: 'result',       label: 'Results',          icon: 'chart', adminBase: '/admin/results',     adminHome: '/admin/results' },
  { key: 'aptitudeExam', label: 'Aptitude Exams',   icon: 'fileCheck', adminBase: '/admin/exams',       adminHome: '/admin/exams' },
  { key: 'fees',         label: 'Fees',             icon: 'wallet', adminBase: '/admin/fees',        adminHome: '/admin/fees/dashboard' },
  { key: 'payroll',      label: 'Payroll',          icon: 'banknote', adminBase: '/admin/payroll',     adminHome: '/admin/payroll/dashboard' },
  { key: 'library',      label: 'Library',          icon: 'bookOpen', adminBase: '/admin/library',     adminHome: '/admin/library/dashboard' },
  { key: 'inventory',    label: 'Inventory',        icon: 'package', adminBase: '/admin/inventory',   adminHome: '/admin/inventory/dashboard' },
  { key: 'transport',    label: 'Transport',        icon: 'bus', adminBase: '/admin/transport',   adminHome: '/admin/transport/dashboard' },
  { key: 'hostel',       label: 'Hostel',           icon: 'hotel', adminBase: '/admin/hostel',      adminHome: '/admin/hostel/dashboard' },
  { key: 'videoLibrary', label: 'Video Learning',   icon: 'video', adminBase: '/admin/videos',      adminHome: '/admin/videos/browse' },
  { key: 'feedback',     label: 'Teacher Feedback', icon: 'star', adminBase: '/admin/feedback',    adminHome: '/admin/feedback/dashboard' },
  { key: 'leave',        label: 'Leave',            icon: 'umbrella', adminBase: '/admin/leave',       adminHome: '/admin/leave' },
  { key: 'document',     label: 'Documents',        icon: 'files', adminBase: '/admin/documents',   adminHome: '/admin/documents' },
  { key: 'holiday',      label: 'Holidays',         icon: 'party', adminBase: '/admin/holidays',    adminHome: '/admin/holidays' },
  { key: 'notification', label: 'Notifications',    icon: 'bell', adminBase: '/admin/notifications', adminHome: '/admin/notifications' },
  { key: 'employeeDirectory', label: 'Employee Directory', icon: 'folder', adminBase: '/admin/employee-directory', adminHome: '/admin/employee-directory/dashboard' },
  { key: 'chat',         label: 'Chat',             icon: 'chat' },   // no administrative surface
];

export const ADMIN_CAPABLE_MODULES = MODULES.filter(m => m.adminBase);

/** The module whose admin area `pathname` belongs to, or null for the rest of /admin. */
export function moduleForAdminPath(pathname) {
  const hit = ADMIN_CAPABLE_MODULES.find(m =>
    pathname === m.adminBase || pathname.startsWith(`${m.adminBase}/`));
  return hit ? hit.key : null;
}
