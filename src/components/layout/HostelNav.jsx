import React from 'react';
import ModuleNav, { HOSTEL_ADMIN_TABS } from './ModuleNav';
import { useHostelAccess } from '../../pages/hostel/admin/hsAccess';

/**
 * The hostel's section rail. The module's admins get all of it; a teacher
 * posted to a hostel gets the day-to-day sections only — the same split the
 * server makes on the routes.
 */
export default function HostelNav() {
  const { full, may } = useHostelAccess();
  return <ModuleNav tabs={full ? HOSTEL_ADMIN_TABS : HOSTEL_ADMIN_TABS.filter((t) => may(t.to))} size="compact" />;
}
