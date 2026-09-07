/**
 * Student Analytics → one student.
 *
 * The whole record of a child in one place: who they are, and then a tab per
 * module the school runs — attendance, results, aptitude, fees, library,
 * transport, videos, assignments, timetable, inventory and alerts.
 *
 * Three things govern it.
 *
 * **The server decides what is here.** It sends a block per enabled module and
 * a viewer scope; a teacher only ever reaches a student sitting in one of their
 * own sections (the API refuses the rest with a 403, and this page shows that
 * refusal rather than an empty dashboard).
 *
 * **Null is not zero.** Every figure that can be "not measured" says so.
 *
 * **The open tab is in the URL** (`?tab=fees`), so a link to a fee question
 * opens on the fees, and the browser's Back button walks the tabs.
 */
import React, { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../contexts/AuthContext';
import { getStudentAnalytics } from '../../api/analytics.api';
import { Empty, Spinner } from '../../components/ui/index';
import Icon from '../../components/ui/icons';
import { fmtMoney } from './viz';
import { Crumbs, Identity, TabStrip, Tile, Tiles } from './studentDetailParts';
import {
  AlertsTab, AptitudeTab, AssignmentsTab, AttendanceTab, FeesTab, GeneralTab,
  InventoryTab, LibraryTab, ResultsTab, TimetableTab, TransportTab, VideosTab,
} from './studentTabs';

// key → label, icon, and the module flag that has to be on for it to exist.
const TABS = [
  { key: 'general',     label: 'General',     icon: 'user' },
  { key: 'attendance',  label: 'Attendance',  icon: 'checkSquare', module: 'attendance' },
  { key: 'results',     label: 'Results',     icon: 'chart',       module: 'result' },
  { key: 'aptitude',    label: 'Aptitude',    icon: 'compass',     module: 'aptitudeExam' },
  { key: 'fees',        label: 'Fees',        icon: 'wallet',      module: 'fees' },
  { key: 'library',     label: 'Library',     icon: 'library',     module: 'library' },
  { key: 'transport',   label: 'Transport',   icon: 'bus',         module: 'transport' },
  { key: 'videos',      label: 'Videos',      icon: 'video',       module: 'videoLibrary' },
  { key: 'assignments', label: 'Assignments', icon: 'documents',   module: 'document' },
  { key: 'timetable',   label: 'Timetable',   icon: 'calendarDays', module: 'timetable' },
  { key: 'inventory',   label: 'Inventory',   icon: 'package',     module: 'inventory' },
  { key: 'alerts',      label: 'Alerts',      icon: 'bell',        module: 'notification' },
];

export default function StudentDetail() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const base = isTeacher ? '/teacher/student-analytics' : '/admin/student-analytics';

  const [params, setParams] = useSearchParams();
  const { data, loading, error } = useFetch(() => getStudentAnalytics(studentId), [studentId]);

  const modules = data?.modules || {};
  const tabs = useMemo(
    () => TABS.filter((t) => !t.module || modules[t.module]),
    [modules],
  );

  const wanted = params.get('tab') || 'general';
  // A tab named in the URL for a module this school has switched off (an old
  // link, a school that dropped a module) falls back rather than blanking.
  const tab = tabs.some((t) => t.key === wanted) ? wanted : 'general';
  const go = (key) => setParams((p) => {
    if (key === 'general') p.delete('tab'); else p.set('tab', key);
    return p;
  }, { replace: true });

  // The page is long; a tab change should start at the top of the new tab.
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, [tab]);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  if (error) {
    return (
      <div className="page sdpg">
        <Crumbs base={base} name="Student" />
        <Empty icon="🚫" title="Could not open this student" message={error}
          action={<button type="button" className="btn btn-secondary" onClick={() => navigate(base)}>
            Back to students
          </button>} />
      </div>
    );
  }

  if (!data?.general) {
    return (
      <div className="page sdpg">
        <Crumbs base={base} name="Student" />
        <Empty icon="🔍" title="Student not found"
          message="This student is no longer on the roll, or was never in your scope."
          action={<Link to={base} className="btn btn-secondary">Back to students</Link>} />
      </div>
    );
  }

  const { general } = data;
  const student = general.student;
  const att = data.attendance;
  const res = data.results?.summary;
  const fees = data.fees?.summary;
  const lib = data.library?.summary;

  return (
    <div className="page sdpg">
      <div className="sdtop">
        <Crumbs base={base} name={student.name} />
        <div className="sdtop__actions">
          <Link to={base} className="btn btn-secondary">
            <Icon name="chevronLeft" size={16} /> All students
          </Link>
          {/* One wizard admits and edits a student; this opens that one, on this
              student. A teacher has no business editing the record, so only an
              admin is offered it. */}
          {!isTeacher && (
            <Link className="btn btn-secondary"
              to={`/admin/students?search=${encodeURIComponent(student.name)}&edit=${encodeURIComponent(student._id)}`}>
              <Icon name="pencil" size={16} /> Edit student
            </Link>
          )}
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            <Icon name="files" size={16} /> Print
          </button>
        </div>
      </div>

      <Identity general={general} year={data.academicYear} roles={data.viewer?.roles} />

      {/* The headline of each module, and the way into the tab that explains it. */}
      <Tiles>
        {modules.attendance && (
          <Tile icon="checkSquare" tone="green" value={att?.percent} unit="%" label="Attendance"
            caption={att?.tracked ? `${att.present + att.late} of ${att.total} marked days` : 'No register taken yet'}
            empty="Not marked yet" onClick={() => go('attendance')} />
        )}
        {modules.result && (
          <Tile icon="chart" tone="purple" value={res?.average} unit="%" label="Academic result"
            caption={`${res?.examsTaken || 0} exam${res?.examsTaken === 1 ? '' : 's'} · ${res?.testsTaken || 0} class test${res?.testsTaken === 1 ? '' : 's'}`}
            empty="Not assessed" onClick={() => go('results')} />
        )}
        {modules.fees && (
          <Tile icon="wallet" tone={fees?.balance > 0 ? 'amber' : 'green'} value={fmtMoney(fees?.balance)}
            label="Fee balance"
            caption={fees?.charged ? `${fmtMoney(fees.paid)} paid of ${fmtMoney(fees.charged)}` : 'Nothing charged yet'}
            onClick={() => go('fees')} />
        )}
        {modules.library && (
          <Tile icon="library" tone="blue" value={lib?.currentlyOut ?? 0} label="Library books"
            caption={`${lib?.totalIssued || 0} borrowed · ${lib?.overdue || 0} overdue`}
            onClick={() => go('library')} />
        )}
      </Tiles>

      <TabStrip tabs={tabs} active={tab} onPick={go} />

      <div className="sdbody">
        {tab === 'general'     && <GeneralTab general={general} />}
        {tab === 'attendance'  && <AttendanceTab a={data.attendance} />}
        {tab === 'results'     && <ResultsTab r={data.results} />}
        {tab === 'aptitude'    && <AptitudeTab a={data.aptitude} />}
        {tab === 'fees'        && <FeesTab f={data.fees} />}
        {tab === 'library'     && <LibraryTab l={data.library} />}
        {tab === 'transport'   && <TransportTab t={data.transport} />}
        {tab === 'videos'      && <VideosTab v={data.videos} />}
        {tab === 'assignments' && <AssignmentsTab d={data.documents} />}
        {tab === 'timetable'   && <TimetableTab t={data.timetable} />}
        {tab === 'inventory'   && <InventoryTab i={data.inventory} />}
        {tab === 'alerts'      && <AlertsTab n={data.notifications} />}
      </div>

      {/* Printing should give the student, not the application around them. */}
      <style>{'@media print{.sidebar,.header,.breadcrumb,.sdtop__actions,.sdtabs,.sdmore{display:none!important}.page{padding:0}.card{border:1px solid #e2e8f0;break-inside:avoid}}'}</style>
    </div>
  );
}
