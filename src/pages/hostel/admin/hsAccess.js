import { useAuth } from '../../../contexts/AuthContext';
import { useModules } from '../../../contexts/ModulesContext';
import { wardenMay } from '../../../utils/hostelDuty';

/**
 * How much of the hostel the person looking at a management screen runs.
 *
 *   full    the school admin, or a teacher whose designation administers it
 *   warden  a teacher posted to a hostel: the day-to-day screens, their hostel
 *
 * `may(path)` answers "can they open this?", so a screen can leave out a link
 * that would only lead to a refusal.
 */
export function useHostelAccess() {
  const { user } = useAuth();
  const { modules, isAdmin } = useModules();
  const full = user?.role === 'school_admin' || !!isAdmin?.('hostel');
  const warden = !full && !!modules?.hostelDuty;
  return { full, warden, may: (path) => full || (warden && wardenMay(path)) };
}
