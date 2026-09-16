/**
 * Where each role lands, and how each role is named to a person.
 *
 * One place, because four screens need the same answer — sign-in, the magic
 * link, the account chooser and the switcher in the header — and a role that
 * landed somewhere different depending on which of them opened it would be a
 * bug nobody notices until a teacher ends up on a parent's dashboard.
 */
export const roleHome = {
  super_admin:  '/super-admin/dashboard',
  school_admin: '/admin/dashboard',
  teacher:      '/teacher/dashboard',
  student:      '/student/dashboard',
  parent:       '/parent/dashboard',
};

export const ROLE_LABEL = {
  super_admin:  'Platform Admin',
  school_admin: 'School Admin',
  teacher:      'Teacher',
  student:      'Student',
  parent:       'Parent',
};

export const ROLE_ICON = {
  super_admin:  'shield',
  school_admin: 'briefcase',
  teacher:      'users',
  student:      'gradCap',
  parent:       'user',
};
