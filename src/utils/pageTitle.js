/**
 * The name of the screen the user is on, for the header.
 *
 * Derived from the path rather than declared per route, because routes are
 * added in a dozen files and a hand-kept map would drift the first time one
 * moved. Everything below is the small set of rules that turns a URL into the
 * label a person would use for that page.
 */

// Role prefixes carry no meaning in a title — the sidebar already says whose
// area this is.
const ROLE_SEGMENTS = new Set(['admin', 'teacher', 'student', 'parent', 'super-admin', 'chat']);

// Segments that name a view rather than a subject. When one of these ends the
// path, the segment before it is the real title ("/admin/fees/dashboard" is the
// Fees screen, not another Dashboard).
const VIEW_SEGMENTS = new Set(['dashboard', 'browse', 'catalog', 'list', 'index']);

const IS_ID = (s) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || /^\d+$/.test(s);

// Where kebab-casing alone gets the words wrong or too terse.
const LABELS = {
  dashboard:            'Dashboard',
  admins:               'Administrators',
  'academic-years':     'Academic Years',
  'school-settings':    'School Settings',
  'student-analytics':  'Student Analytics',
  'employee-directory': 'Employee Directory',
  'my-section':         'My Section',
  'my-class':           'My Class',
  'child-class':        'Class Information',
  'child-fees':         'Fees',
  'child-attendance':   'Attendance',
  'manage-library':     'Manage Library',
  'fine-rules':         'Fine Rules',
  'student-fees':       'Student Fees',
  'purchase-requests':  'Purchase Requests',
  'purchase-orders':    'Purchase Orders',
  fees:                 'Fees Management',
  leave:                'Leave Management',
  exams:                'Aptitude Exams',
  videos:               'Video Learning',
  feedback:             'Teacher Feedback',
  chat:                 'Chat',
  profile:              'My Profile',
};

const titleCase = (seg) =>
  seg.split('-').filter(Boolean)
     .map(w => w.charAt(0).toUpperCase() + w.slice(1))
     .join(' ');

// Modules whose header names the module on every one of its screens — the
// fees mockups read "Fees Management" above all ten tabs.
// Fees is one module wherever you stand in it, so every tab of it keeps the
// module's name in the bar rather than the tab's.
const MODULE_HEADERS = {
  'admin/fees': 'Fees Management',
  'student/fees': 'Fees Management',
  'parent/child-fees': 'Fees Management',
  // Payroll draws its own tab strip inside the page, so the bar above it names
  // the module — otherwise the header read "Runs" while the page read
  // "Payroll Runs".
  'admin/payroll': 'Payroll',
  'teacher/payroll': 'Payroll',
};

/** The header title for a pathname. Falls back to the app name at the root. */
export default function pageTitle(pathname = '') {
  const parts = pathname.split('/').filter(Boolean).filter(s => !IS_ID(s));
  if (!parts.length) return 'Dashboard';
  const module = MODULE_HEADERS[parts.slice(0, 2).join('/')];
  if (module) return module;

  // Trim the view suffix, but never down to nothing.
  let words = parts;
  while (words.length > 1 && VIEW_SEGMENTS.has(words[words.length - 1])) {
    words = words.slice(0, -1);
  }

  const last = words[words.length - 1];
  // A bare role prefix means the role's own landing screen.
  if (ROLE_SEGMENTS.has(last) && words.length === 1) return LABELS[last] || 'Dashboard';

  return LABELS[last] || titleCase(last);
}
