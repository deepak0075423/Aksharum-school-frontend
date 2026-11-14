/**
 * What to call the signed-in person under their name (header, sidebar, menu).
 *
 * A school admin is "School Admin" whatever designation they also carry; a
 * teacher or staff member is their designation ("Librarian", "Vice Principal")
 * when the school has set one; everyone else is their role.
 */
const ROLE = {
  school_admin: 'School Admin',
  super_admin: 'Super Admin',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent',
};

export function roleTitle(user) {
  if (!user) return '';
  if (user.role === 'school_admin') return ROLE.school_admin;
  const designation = String(user.designation || '').trim();
  if (designation && user.role === 'teacher') return designation;
  return ROLE[user.role] || String(user.role || '').replace(/_/g, ' ');
}
