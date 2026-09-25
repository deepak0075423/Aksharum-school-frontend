/**
 * The app's navigation tree — the single source of truth for what the site
 * contains and how its pages nest.
 *
 * It used to live inside Sidebar.jsx, which meant the rail knew the hierarchy
 * and nothing else did: every page then hand-wrote its own breadcrumb, and
 * fifty-eight of them disagreed about where a trail starts and what the steps
 * in between are called. The tree moved out here so the rail and the crumb are
 * drawn from the same data and can never drift.
 *
 * Shape of an entry:
 *   { section }                      a heading in the rail; not a destination
 *   { to, label, icon }              a page
 *   { match }                        the path prefix that means "inside here",
 *                                    when `to` points at a landing tab
 *   { children: [{ to, label }] }    the module's own sections
 *   { module, requires, childrenIf } access rules, applied by the rail
 */
import {
  FEES_ADMIN_TABS, PAYROLL_ADMIN_TABS, PAYROLL_TEACHER_TABS, LIBRARY_ADMIN_TABS, LIBRARY_MANAGE_TABS,
  LIBRARY_STUDENT_TABS, LIBRARY_PARENT_TABS, INVENTORY_ADMIN_TABS, TRANSPORT_ADMIN_TABS, TRANSPORT_PARENT_TABS,
  HOSTEL_ADMIN_TABS, VIDEO_ADMIN_TABS, VIDEO_TEACHER_TABS, FEEDBACK_ADMIN_TABS, FEEDBACK_TEACHER_TABS,
  FEEDBACK_PRINCIPAL_TABS, TIMETABLE_ADMIN_TABS, DIRECTORY_TABS,
} from './ModuleNav';

/**
 * A module's tab strip, as rows in the rail. The rail carries no emoji, so the
 * leading one is dropped; `end` rides along because a module's index tab would
 * otherwise stay lit on every tab below it.
 *
 * A module with a single tab gets no submenu — one row under a row it repeats
 * is noise, not navigation.
 */
export const sub = (tabs) => (tabs.length > 1
  ? tabs.map(t => ({ to: t.to, label: t.label.replace(/^[^A-Za-z]+/, ''), end: t.end }))
  : undefined);

export const SUPER_ADMIN_NAV = [
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

export const ADMIN_NAV = [
  { section: 'Overview' },
  { to: '/admin/dashboard',         icon: 'home', label: 'Dashboard' },
  { section: 'People' },
  { to: '/admin/teachers',          icon: 'teacher', label: 'Teachers' },
  { to: '/admin/students',          icon: 'student', label: 'Students' },
  { to: '/admin/admins',            icon: 'user', label: 'Admins' },
  { to: '/admin/designations',      icon: 'badge', label: 'Designations' },
  { to: '/admin/employee-directory/dashboard', match: '/admin/employee-directory', icon: 'folder', label: 'Employee Directory', module: 'employeeDirectory',
    children: sub(DIRECTORY_TABS('/admin/employee-directory')) },
  { section: 'Academics' },
  { to: '/admin/academic-years',    icon: 'calendar', label: 'Academic Years' },
  { to: '/admin/classes',           icon: 'building', label: 'Classes' },
  { to: '/admin/subjects',          icon: 'book', label: 'Subjects' },
  { to: '/admin/timetable', match: '/admin/timetable', icon: 'clock', label: 'Timetable', module: 'timetable',
    children: sub(TIMETABLE_ADMIN_TABS) },
  { to: '/admin/exams',             icon: 'fileCheck', label: 'Aptitude Exams', module: 'aptitudeExam' },
  { to: '/admin/results',           icon: 'chart', label: 'Results',       module: 'result' },
  { to: '/admin/attendance',        icon: 'checkSquare', label: 'Attendance',    module: 'attendance' },
  { to: '/admin/student-analytics', icon: 'compass', label: 'Student Analytics' },
  { section: 'Modules' },
  // `children` open under the entry while you are inside the module, so its
  // sections are reachable from the rail as well as from the tab strip.
  { to: '/admin/fees/dashboard', match: '/admin/fees',    icon: 'wallet', label: 'Fees',          module: 'fees',
    children: sub(FEES_ADMIN_TABS) },
  { to: '/admin/payroll/dashboard', match: '/admin/payroll', icon: 'banknote', label: 'Payroll',       module: 'payroll',
    children: sub(PAYROLL_ADMIN_TABS) },
  { to: '/admin/library/dashboard', match: '/admin/library', icon: 'bookOpen', label: 'Library',       module: 'library',
    children: sub(LIBRARY_ADMIN_TABS) },
  { to: '/admin/inventory/dashboard', match: '/admin/inventory', icon: 'package', label: 'Inventory',   module: 'inventory',
    children: sub(INVENTORY_ADMIN_TABS) },
  { to: '/admin/transport/dashboard', match: '/admin/transport', icon: 'bus', label: 'Transport',   module: 'transport',
    children: sub(TRANSPORT_ADMIN_TABS) },
  { to: '/admin/hostel/dashboard', match: '/admin/hostel',  icon: 'hotel', label: 'Hostel',        module: 'hostel',
    children: sub(HOSTEL_ADMIN_TABS) },
  { to: '/admin/videos/browse', match: '/admin/videos',     icon: 'video', label: 'Video Learning', module: 'videoLibrary',
    children: sub(VIDEO_ADMIN_TABS) },
  { to: '/admin/feedback/overview', match: '/admin/feedback', icon: 'star', label: 'Teacher Feedback', module: 'feedback',
    children: sub(FEEDBACK_ADMIN_TABS) },
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

export const TEACHER_NAV = [
  { section: 'Overview' },
  { to: '/teacher/dashboard',       icon: 'home', label: 'Dashboard' },
  { section: 'My Class' },
  { to: '/teacher/my-section',      icon: 'building', label: 'My Section',    requires: 'hasMySection' },
  { to: '/teacher/attendance',      icon: 'checkSquare', label: 'Attendance',    module: 'attendance' },
  { to: '/teacher/timetable',       icon: 'clock', label: 'Timetable',     module: 'timetable' },
  { to: '/teacher/substitutions',   icon: 'repeat', label: 'My Substitutions', module: 'timetable' },
  { to: '/teacher/student-analytics', icon: 'compass', label: 'Student Analytics' },
  // A plain teacher has one directory screen and no tab bar; only a teacher
  // who administers the module gets the sections, exactly as the routes do.
  { to: '/teacher/employee-directory/employees', match: '/teacher/employee-directory', icon: 'folder', label: 'Employee Directory', module: 'employeeDirectory',
    children: sub(DIRECTORY_TABS('/teacher/employee-directory')),
    childrenIf: (m) => !!m?.moduleAdmin?.employeeDirectory },
  { section: 'Academics' },
  { to: '/teacher/exams',           icon: 'fileCheck', label: 'Aptitude Exams', module: 'aptitudeExam' },
  { to: '/teacher/results',         icon: 'chart', label: 'Results',       module: 'result' },
  { section: 'Modules' },
  { to: '/teacher/leave',           icon: 'umbrella', label: 'My Leave',      module: 'leave' },
  { to: '/teacher/documents',       icon: 'files', label: 'Documents',     module: 'document' },
  // A teacher sees Transport when they ride the bus themselves or crew one.
  { to: '/teacher/transport',       icon: 'bus', label: 'Transport',     module: 'transport', requires: 'transportEnrolled' },
  { to: '/teacher/payroll/ctc', match: '/teacher/payroll',     icon: 'banknote', label: 'Payroll',       module: 'payroll',
    children: sub(PAYROLL_TEACHER_TABS) },
  { to: '/teacher/library', match: '/teacher/library', icon: 'bookOpen', label: 'Library', module: 'library',
    children: sub(LIBRARY_STUDENT_TABS('/teacher')) },
  { to: '/teacher/manage-library/dashboard', match: '/teacher/manage-library', icon: 'book', label: 'Manage Library', module: 'library', requires: 'isLibrarian',
    children: sub(LIBRARY_MANAGE_TABS('/teacher/manage-library')) },
  { to: '/teacher/inventory/requests', match: '/teacher/inventory', icon: 'package', label: 'Inventory',   module: 'inventory' },
  { to: '/teacher/videos/catalog', match: '/teacher/videos',  icon: 'video', label: 'Video Learning', module: 'videoLibrary',
    children: sub(VIDEO_TEACHER_TABS) },
  { to: '/teacher/feedback/dashboard', match: '/teacher/feedback', icon: 'star', label: 'My Feedback', module: 'feedback',
    children: sub(FEEDBACK_TEACHER_TABS) },
  { to: '/teacher/feedback-review/overview', match: '/teacher/feedback-review', icon: 'school', label: 'Feedback Review', module: 'feedback', requires: 'isPrincipal',
    children: sub(FEEDBACK_PRINCIPAL_TABS) },
  { to: '/teacher/holidays',        icon: 'party', label: 'Holidays',      module: 'holiday' },
  { to: '/teacher/notifications',   icon: 'bell', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: 'chat', label: 'Chat',          module: 'chat' },
  { section: 'Account' },
  { to: '/profile',                 icon: 'user', label: 'Profile' },
];

export const STUDENT_NAV = [
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
  // Only for a student actually enrolled in the service — services/
  // transportEnrolment on the server decides, and enforces it on the routes too.
  { to: '/student/transport',       icon: 'bus', label: 'Transport',     module: 'transport', requires: 'transportEnrolled' },
  { to: '/student/hostel',          icon: 'hotel', label: 'Hostel',        module: 'hostel' },
  { to: '/student/videos',          icon: 'video', label: 'Video Learning', module: 'videoLibrary' },
  { to: '/student/library', match: '/student/library', icon: 'bookOpen', label: 'Library', module: 'library',
    children: sub(LIBRARY_STUDENT_TABS('/student')) },
  { to: '/student/feedback',        icon: 'star', label: 'Teacher Feedback', module: 'feedback' },
  { to: '/student/notifications',   icon: 'bell', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: 'chat', label: 'Chat',          module: 'chat' },
  { section: 'Account' },
  { to: '/profile',                 icon: 'user', label: 'Profile' },
];

export const PARENT_NAV = [
  { section: 'Overview' },
  { to: '/parent/dashboard',        icon: 'home', label: 'Dashboard' },
  { section: "My Child" },
  { to: '/parent/child-class',      icon: 'building', label: 'Class Info' },
  { to: '/parent/timetable',        icon: 'clock', label: 'Timetable',     module: 'timetable' },
  { to: '/parent/child-attendance', icon: 'checkSquare', label: 'Attendance',    module: 'attendance' },
  { to: '/parent/exams',            icon: 'fileCheck', label: 'Exams',         module: 'aptitudeExam' },
  { to: '/parent/results',          icon: 'chart', label: 'Results',       module: 'result' },
  { section: 'Resources' },
  { to: '/parent/documents',        icon: 'files', label: 'Documents',     module: 'document' },
  { to: '/parent/holidays',         icon: 'party', label: 'Holidays',      module: 'holiday' },
  { to: '/parent/feedback',         icon: 'star', label: 'Teacher Feedback', module: 'feedback' },
  { to: '/parent/child-fees',       icon: 'wallet', label: 'Fees',          module: 'fees' },
  { to: '/parent/library', match: '/parent/library', icon: 'bookOpen', label: 'Library',       module: 'library',
    children: sub(LIBRARY_PARENT_TABS) },
  // Only when one of their children rides.
  { to: '/parent/transport/track', match: '/parent/transport',  icon: 'bus', label: 'Transport',     module: 'transport',
    requires: 'transportEnrolled', children: sub(TRANSPORT_PARENT_TABS) },
  { to: '/parent/hostel',           icon: 'hotel', label: 'Hostel',        module: 'hostel' },
  { to: '/parent/notifications',    icon: 'bell', label: 'Notifications', module: 'notification' },
  { to: '/chat',                    icon: 'chat', label: 'Chat',          module: 'chat' },
  { section: 'Account' },
  { to: '/profile',                 icon: 'user', label: 'Profile' },
];

export const HOME_BY_ROLE = {
  super_admin:  '/super-admin/dashboard',
  school_admin: '/admin/dashboard',
  teacher:      '/teacher/dashboard',
  student:      '/student/dashboard',
  parent:       '/parent/dashboard',
};
export const homeFor = (role) => HOME_BY_ROLE[role] || '/';

export const NAV_MAP = {
  super_admin:  SUPER_ADMIN_NAV,
  school_admin: ADMIN_NAV,
  teacher:      TEACHER_NAV,
  student:      STUDENT_NAV,
  parent:       PARENT_NAV,
};

// ── Trail resolution ─────────────────────────────────────────────────────────

/**
 * Pages that are reached from another page rather than from the rail, and so
 * have no row of their own to be found under. Each names the rail entry it
 * belongs beneath, so a detail screen's trail still walks back through the
 * list it was opened from.
 *
 * Matched longest-prefix-first, so `/admin/classes/:id/sections` can sit under
 * Classes while `/admin/classes` is the rail row itself.
 */
const UNDER = [
  ['/admin/classes/',               '/admin/classes'],
  ['/admin/sections/',              '/admin/classes'],
  ['/admin/students/',              '/admin/students'],
  ['/admin/teachers/',              '/admin/teachers'],
  ['/admin/admins/',                '/admin/admins'],
  ['/admin/documents/',             '/admin/documents'],
  ['/admin/student-analytics/',     '/admin/student-analytics'],
  ['/admin/exams/',                 '/admin/exams'],
  ['/admin/results/',               '/admin/results'],
  ['/admin/leave/',                 '/admin/leave'],
  ['/admin/notifications/',         '/admin/notifications'],
  ['/teacher/student-analytics/',   '/teacher/student-analytics'],
  ['/teacher/exams/',               '/teacher/exams'],
  ['/teacher/documents/',           '/teacher/documents'],
  ['/student/exams/',               '/student/exams'],
  ['/student/documents/',           '/student/documents'],
  ['/parent/exams/',                '/parent/exams'],
  ['/parent/documents/',            '/parent/documents'],
];

const under = (pathname) => {
  let best = null;
  for (const [prefix, parent] of UNDER) {
    if (pathname.startsWith(prefix) && (!best || prefix.length > best[0].length)) best = [prefix, parent];
  }
  return best?.[1] || null;
};

/** Does `pathname` sit inside the area this entry owns? */
const inside = (entry, pathname) => {
  const root = entry.match || entry.to;
  if (!root || root === '/') return false;
  return pathname === root || pathname.startsWith(`${root}/`);
};

/** Turns "/admin/hostel/room-types" into ["Hostel", "Room Types"]. */
const titled = (seg) => seg.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

/**
 * A path segment that is an id rather than a name.
 *
 * Any digit is enough: every page in this app is reached by a worded slug
 * (`student-fees`, `room-types`, `all-chats`), and every id is a number, a
 * UUID or a short hash. "9c1" has to read as an id, or a student's crumb says
 * Students › 9c1 › Rahul Sharma.
 */
const isId = (seg) => /\d/.test(seg) || seg.length > 24;

const ROLE_PREFIX = new Set(['admin', 'teacher', 'student', 'parent', 'super-admin']);

/** The last-resort trail: the URL, read as words. */
const fromPath = (pathname) => pathname
  .split('/')
  .filter(seg => seg && !ROLE_PREFIX.has(seg) && !isId(seg))
  // Tagged, so a page that names itself can displace these — the URL is the
  // fallback, not the authority.
  .map(seg => ({ label: titled(seg), fromUrl: true }));

/**
 * The steps from the role's home page to wherever `pathname` is, in the order
 * every screen in the app shows them:
 *
 *     Home › Module › Section › (whatever the page adds)
 *
 * `Section` appears only when the module has sections of its own, and only
 * when the one you are on is not the module's landing tab — "Fees › Fees" is
 * not a trail. Nothing here knows about a particular page: a screen that wants
 * to name itself (a student, a book, an assignment) appends to this with
 * `usePageCrumbs`, and its steps land after these ones.
 *
 * Returns [{ label, to }] with `to` omitted on the step you are standing on.
 */
export function trailFor(pathname, role) {
  const nav  = NAV_MAP[role] || [];
  const home = homeFor(role);
  const trail = [{ label: 'Home', to: home }];
  if (!pathname || pathname === home) return [{ label: 'Home' }];

  // The rail row this page belongs to — either its own, or the list it was
  // opened from when it has no row.
  const target = under(pathname) || pathname;
  let entry = nav.find(e => e.to && !e.section && inside(e, target));
  // A page under another page: find the row by its path, prefix match included.
  if (!entry) entry = nav.find(e => e.to === target || (e.match && target.startsWith(e.match)));
  // Nothing in the rail owns this page — a screen reached only from another
  // screen, or one whose row this person cannot see. The URL still describes
  // where they are, so the trail is read off that rather than stopping dead:
  // a crumb that exists on 90% of pages is the problem this replaced.
  if (!entry) return [...trail, ...fromPath(pathname)];

  trail.push({ label: entry.label, to: entry.to });

  // The module's own section. Longest match wins: a module's landing tab is a
  // prefix of every tab below it, so matching the first would have put
  // "Library › Library" on the search screen and never named the section.
  let child = null;
  for (const c of entry.children || []) {
    if (pathname !== c.to && !pathname.startsWith(`${c.to}/`)) continue;
    if (!child || c.to.length > child.to.length) child = c;
  }
  if (child && child.label !== entry.label) trail.push({ label: child.label, to: child.to });

  // Deeper than the rail and the module's tabs go — a hostel's room types, a
  // section of a screen that was never a tab. Without this the trail stopped
  // at the module and two different pages inside it read identically.
  const known = child?.to || entry.match || entry.to;
  if (pathname.startsWith(`${known}/`)) trail.push(...fromPath(pathname.slice(known.length)));

  return trail;
}
