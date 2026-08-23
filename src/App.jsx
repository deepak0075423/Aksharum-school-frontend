import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ModulesProvider } from './contexts/ModulesContext';
import AppLayout from './components/layout/AppLayout';
import AdminAreaGuard from './components/AdminAreaGuard';
import ModuleNav, {
  FEES_ADMIN_TABS, PAYROLL_ADMIN_TABS, LIBRARY_ADMIN_TABS,
  LIBRARY_STUDENT_TABS, PAYROLL_TEACHER_TABS, LIBRARY_MANAGE_TABS,
  INVENTORY_ADMIN_TABS, INVENTORY_TEACHER_TABS,
  TRANSPORT_ADMIN_TABS, TRANSPORT_PARENT_TABS, HOSTEL_ADMIN_TABS,
  VIDEO_ADMIN_TABS, VIDEO_TEACHER_TABS,
  FEEDBACK_ADMIN_TABS, FEEDBACK_TEACHER_TABS, FEEDBACK_PRINCIPAL_TABS,
  TIMETABLE_ADMIN_TABS, DIRECTORY_TABS,
} from './components/layout/ModuleNav';

// ── Auth Pages ────────────────────────────────────────────────────────────────
const Login          = lazy(() => import('./pages/auth/Login'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const VerifyOtp      = lazy(() => import('./pages/auth/VerifyOtp'));
const NewPassword    = lazy(() => import('./pages/auth/NewPassword'));
const ResetPassword  = lazy(() => import('./pages/auth/ResetPassword'));
const MagicLogin     = lazy(() => import('./pages/auth/MagicLogin'));

// ── Super Admin ───────────────────────────────────────────────────────────────
const SADashboard      = lazy(() => import('./pages/super-admin/Dashboard'));
const SASchools        = lazy(() => import('./pages/super-admin/Schools'));
const SASchoolForm     = lazy(() => import('./pages/super-admin/SchoolForm'));
const SAUsers          = lazy(() => import('./pages/super-admin/Users'));
const SAPermissions    = lazy(() => import('./pages/super-admin/Permissions'));
const SANotifications  = lazy(() => import('./pages/super-admin/Notifications'));
const SAVideoLibrary   = lazy(() => import('./pages/super-admin/videos/Library'));

// ── Admin ─────────────────────────────────────────────────────────────────────
const ADashboard    = lazy(() => import('./pages/admin/Dashboard'));
const ATeachers     = lazy(() => import('./pages/admin/Teachers'));
const ADesignations = lazy(() => import('./pages/admin/Designations'));
const AStudents     = lazy(() => import('./pages/admin/Students'));
const AClasses      = lazy(() => import('./pages/admin/Classes'));
const ASections     = lazy(() => import('./pages/admin/Sections'));
const ASectionDetail= lazy(() => import('./pages/admin/SectionDetail'));
const ASubjects     = lazy(() => import('./pages/admin/Subjects'));
const AAcademicYears= lazy(() => import('./pages/admin/AcademicYears'));
const ATimetable    = lazy(() => import('./pages/admin/Timetable'));
// ── Timetable generation ──────────────────────────────────────────────────────
const TTGenerate      = lazy(() => import('./pages/timetable/admin/Generate'));
const TTVersions      = lazy(() => import('./pages/timetable/admin/Versions'));
const TTVersionDetail = lazy(() => import('./pages/timetable/admin/VersionDetail'));
const TTAvailability  = lazy(() => import('./pages/timetable/admin/Availability'));
const TTRooms         = lazy(() => import('./pages/timetable/admin/Rooms'));
const TTReports       = lazy(() => import('./pages/timetable/admin/Reports'));
const TTConfiguration = lazy(() => import('./pages/timetable/admin/Configuration'));
const ASubstitutions  = lazy(() => import('./pages/admin/Substitutions'));
const ANotifications= lazy(() => import('./pages/admin/Notifications'));
const AResults      = lazy(() => import('./pages/admin/Results'));
const ALeave        = lazy(() => import('./pages/admin/Leave'));
const ADocuments    = lazy(() => import('./pages/admin/Documents'));
const AHolidays     = lazy(() => import('./pages/admin/Holidays'));
const AAttendance   = lazy(() => import('./pages/admin/Attendance'));
const AExams        = lazy(() => import('./pages/admin/Exams'));
const AAdmins       = lazy(() => import('./pages/admin/Admins'));
const AReports         = lazy(() => import('./pages/admin/Reports'));
const ASchoolSettings  = lazy(() => import('./pages/admin/SchoolSettings'));

// ── Shared ────────────────────────────────────────────────────────────────────
const SharedNotifications = lazy(() => import('./pages/shared/Notifications'));

// ── Student Analytics (admin + teacher, same pages, scope resolved server-side)
const StudentAnalytics       = lazy(() => import('./pages/analytics/StudentAnalytics'));
const StudentAnalyticsDetail = lazy(() => import('./pages/analytics/StudentDetail'));

// ── Employee Directory (admin + teacher, same pages; the API returns only the
//    fields the caller's designation level is entitled to)
const EdDashboard    = lazy(() => import('./pages/directory/Dashboard'));
const EdEmployees    = lazy(() => import('./pages/directory/Employees'));
const EdProfile      = lazy(() => import('./pages/directory/EmployeeProfile'));
const EdDepartments  = lazy(() => import('./pages/directory/Departments'));
const EdDesignations = lazy(() => import('./pages/directory/Designations'));
const EdOrgStructure = lazy(() => import('./pages/directory/OrgStructure'));
const EdVerification = lazy(() => import('./pages/directory/Verification'));
const EdReports      = lazy(() => import('./pages/directory/Reports'));

// One route subtree, mounted under /admin and /teacher. `isAdmin` only decides
// which tabs are drawn — every endpoint behind them is guarded server-side.
const directoryRoutes = (base, isAdmin) => (
  // A teacher has exactly one directory screen, so there is no tab bar to draw —
  // a single-item ModuleNav would render a stray rule across the page and no
  // navigation. Administrators get the real tab bar.
  <Route
    path="employee-directory"
    element={isAdmin ? <ModuleNav tabs={DIRECTORY_TABS(base)} /> : <Outlet />}
  >
    <Route index element={<Navigate to={isAdmin ? 'dashboard' : 'employees'} replace />} />
    <Route path="employees"      element={<EdEmployees />} />
    <Route path="employees/:id"  element={<EdProfile />} />
    {/* Administrative views. Their endpoints are admin-only, so registering
        the routes for a normal user would only produce a 403 page. */}
    {isAdmin && <Route path="dashboard"     element={<EdDashboard />} />}
    {isAdmin && <Route path="departments"   element={<EdDepartments />} />}
    {isAdmin && <Route path="designations"  element={<EdDesignations />} />}
    {isAdmin && <Route path="org-structure" element={<EdOrgStructure />} />}
    {isAdmin && <Route path="verification"  element={<EdVerification />} />}
    {isAdmin && <Route path="reports"       element={<EdReports />} />}
  </Route>
);

// ── Teacher ───────────────────────────────────────────────────────────────────
const TDashboard    = lazy(() => import('./pages/teacher/Dashboard'));
const TMySection    = lazy(() => import('./pages/teacher/MySection'));
const TAttendance   = lazy(() => import('./pages/teacher/Attendance'));
const TTimetable    = lazy(() => import('./pages/teacher/Timetable'));
const TExams        = lazy(() => import('./pages/teacher/Exams'));
const TResults      = lazy(() => import('./pages/teacher/Results'));
const TLeave        = lazy(() => import('./pages/teacher/Leave'));
const TDocuments    = lazy(() => import('./pages/teacher/Documents'));
const THolidays     = lazy(() => import('./pages/teacher/Holidays'));
const TSubstitutions = lazy(() => import('./pages/teacher/MySubstitutions'));

// ── Student ───────────────────────────────────────────────────────────────────
const SDashboard    = lazy(() => import('./pages/student/Dashboard'));
const SMyClass      = lazy(() => import('./pages/student/MyClass'));
const SAttendance   = lazy(() => import('./pages/student/Attendance'));
const STimetable    = lazy(() => import('./pages/student/Timetable'));
const SExams        = lazy(() => import('./pages/student/Exams'));
const SResults      = lazy(() => import('./pages/student/Results'));
const SDocuments    = lazy(() => import('./pages/student/Documents'));
const SHolidays     = lazy(() => import('./pages/student/Holidays'));
const SFees         = lazy(() => import('./pages/fees/student/MyFees'));
const SLibrary      = lazy(() => import('./pages/library/student/Dashboard'));
const SLibSearch    = lazy(() => import('./pages/library/student/Search'));
const SLibMyBooks   = lazy(() => import('./pages/library/student/MyBooks'));
const SLibMyFines   = lazy(() => import('./pages/library/student/MyFines'));

// ── Parent ────────────────────────────────────────────────────────────────────
const PDashboard    = lazy(() => import('./pages/parent/Dashboard'));
const PChildClass   = lazy(() => import('./pages/parent/ChildClass'));
const PAttendance   = lazy(() => import('./pages/parent/ChildAttendance'));
const PExams        = lazy(() => import('./pages/parent/Exams'));
const PResults      = lazy(() => import('./pages/parent/Results'));
const PDocuments    = lazy(() => import('./pages/parent/Documents'));
const PHolidays     = lazy(() => import('./pages/parent/Holidays'));
const PFees         = lazy(() => import('./pages/parent/ChildFees'));

// ── Fees (Admin) ──────────────────────────────────────────────────────────────
const FAdminDash    = lazy(() => import('./pages/fees/admin/Dashboard'));
const FCategories   = lazy(() => import('./pages/fees/admin/FeeCategories'));
const FHeads        = lazy(() => import('./pages/fees/admin/FeeHeads'));
const FStructures   = lazy(() => import('./pages/fees/admin/FeeStructures'));
const FFineRules    = lazy(() => import('./pages/fees/admin/FineRules'));
const FConcessions  = lazy(() => import('./pages/fees/admin/Concessions'));
const FStudentFees  = lazy(() => import('./pages/fees/admin/StudentFees'));
const FPayments     = lazy(() => import('./pages/fees/admin/Payments'));
const FReports      = lazy(() => import('./pages/fees/admin/Reports'));
const FSettings     = lazy(() => import('./pages/fees/admin/Settings'));

// ── Payroll ───────────────────────────────────────────────────────────────────
const PayDashboard  = lazy(() => import('./pages/payroll/admin/Dashboard'));
const PayStructures = lazy(() => import('./pages/payroll/admin/Structures'));
const PayAssignments= lazy(() => import('./pages/payroll/admin/Assignments'));
const PayRuns       = lazy(() => import('./pages/payroll/admin/Runs'));
const PayMyCtc      = lazy(() => import('./pages/payroll/teacher/MyCtc'));
const PayMyPayslips = lazy(() => import('./pages/payroll/teacher/Payslips'));

// ── Library ───────────────────────────────────────────────────────────────────
const LibDashboard  = lazy(() => import('./pages/library/librarian/Dashboard'));
const LibBooks      = lazy(() => import('./pages/library/librarian/Books'));
const LibBookDetail = lazy(() => import('./pages/library/librarian/BookDetail'));
const LibReports    = lazy(() => import('./pages/library/librarian/Reports'));
const LibCirculation= lazy(() => import('./pages/library/librarian/Circulation'));
const LibReservations=lazy(() => import('./pages/library/librarian/Reservations'));
const LibFines      = lazy(() => import('./pages/library/librarian/Fines'));
const LibPolicy     = lazy(() => import('./pages/library/librarian/Policy'));

// ── Inventory ─────────────────────────────────────────────────────────────────
const InvDashboard   = lazy(() => import('./pages/inventory/admin/Dashboard'));
const InvItems       = lazy(() => import('./pages/inventory/admin/Items'));
const InvStock       = lazy(() => import('./pages/inventory/admin/Stock'));
const InvRequests    = lazy(() => import('./pages/inventory/admin/PurchaseRequests'));
const InvOrders      = lazy(() => import('./pages/inventory/admin/PurchaseOrders'));
const InvIssues      = lazy(() => import('./pages/inventory/admin/Issues'));
const InvAssets      = lazy(() => import('./pages/inventory/admin/Assets'));
const InvVendors     = lazy(() => import('./pages/inventory/admin/Vendors'));
const InvCategories  = lazy(() => import('./pages/inventory/admin/Categories'));
const InvWarehouses  = lazy(() => import('./pages/inventory/admin/Warehouses'));
const InvDepartments = lazy(() => import('./pages/inventory/admin/Departments'));
const InvAudit       = lazy(() => import('./pages/inventory/admin/Audit'));
const InvTeacherRequests = lazy(() => import('./pages/inventory/teacher/PurchaseRequests'));

// ── Transport ─────────────────────────────────────────────────────────────────
const TrDashboard   = lazy(() => import('./pages/transport/admin/Dashboard'));
const TrLive        = lazy(() => import('./pages/transport/admin/LiveTracking'));
const TrVehicles    = lazy(() => import('./pages/transport/admin/Vehicles'));
const TrStaff       = lazy(() => import('./pages/transport/admin/Staff'));
const TrRoutes      = lazy(() => import('./pages/transport/admin/Routes'));
const TrAssignments = lazy(() => import('./pages/transport/admin/Assignments'));
const TrTrips       = lazy(() => import('./pages/transport/admin/Trips'));
const TrFuel        = lazy(() => import('./pages/transport/admin/Fuel'));
const TrMaintenance = lazy(() => import('./pages/transport/admin/Maintenance'));
const TrIncidents   = lazy(() => import('./pages/transport/admin/Incidents'));
const TrComplaints  = lazy(() => import('./pages/transport/admin/Complaints'));
const TrFeePlans    = lazy(() => import('./pages/transport/admin/FeePlans'));
const TrInvoices    = lazy(() => import('./pages/transport/admin/Invoices'));
const TrRequests    = lazy(() => import('./pages/transport/admin/Requests'));
const TrReports     = lazy(() => import('./pages/transport/admin/Reports'));
const TrSettings    = lazy(() => import('./pages/transport/admin/Settings'));
const TrAudit       = lazy(() => import('./pages/transport/admin/Audit'));
const TrParentTrack      = lazy(() => import('./pages/transport/parent/Track'));
const TrParentDetails    = lazy(() => import('./pages/transport/parent/Details'));
const TrParentAttendance = lazy(() => import('./pages/transport/parent/Attendance'));
const TrParentFees       = lazy(() => import('./pages/transport/parent/Fees'));
const TrParentRequests   = lazy(() => import('./pages/transport/parent/Requests'));
const TrStudent          = lazy(() => import('./pages/transport/student/Transport'));

// ── Hostel ────────────────────────────────────────────────────────────────────
const HsDashboard    = lazy(() => import('./pages/hostel/admin/Dashboard'));
const HsHostels      = lazy(() => import('./pages/hostel/admin/Hostels'));
const HsStructure    = lazy(() => import('./pages/hostel/admin/Structure'));
const HsRooms        = lazy(() => import('./pages/hostel/admin/Rooms'));
const HsOccupancy    = lazy(() => import('./pages/hostel/admin/Occupancy'));
const HsAdmissions   = lazy(() => import('./pages/hostel/admin/Admissions'));
const HsAllocations  = lazy(() => import('./pages/hostel/admin/Allocations'));
const HsAttendance   = lazy(() => import('./pages/hostel/admin/Attendance'));
const HsLeave        = lazy(() => import('./pages/hostel/admin/Leave'));
const HsOutpass      = lazy(() => import('./pages/hostel/admin/Outpass'));
const HsVisitors     = lazy(() => import('./pages/hostel/admin/Visitors'));
const HsMovement     = lazy(() => import('./pages/hostel/admin/Movement'));
const HsStaff        = lazy(() => import('./pages/hostel/admin/Staff'));
const HsMess         = lazy(() => import('./pages/hostel/admin/Mess'));
const HsFees         = lazy(() => import('./pages/hostel/admin/Fees'));
const HsComplaints   = lazy(() => import('./pages/hostel/admin/Complaints'));
const HsMaintenance  = lazy(() => import('./pages/hostel/admin/Maintenance'));
const HsAssets       = lazy(() => import('./pages/hostel/admin/Assets'));
const HsIncidents    = lazy(() => import('./pages/hostel/admin/Incidents'));
const HsDiscipline   = lazy(() => import('./pages/hostel/admin/Discipline'));
const HsDocuments    = lazy(() => import('./pages/hostel/admin/Documents'));
const HsCommunication= lazy(() => import('./pages/hostel/admin/Communication'));
const HsReports      = lazy(() => import('./pages/hostel/admin/Reports'));
const HsSettings     = lazy(() => import('./pages/hostel/admin/Settings'));
const HsAudit        = lazy(() => import('./pages/hostel/admin/Audit'));
const HsStudent      = lazy(() => import('./pages/hostel/student/Hostel'));
const HsParent       = lazy(() => import('./pages/hostel/parent/Hostel'));

// ── Video Learning ────────────────────────────────────────────────────────────
const VidAdmBrowse    = lazy(() => import('./pages/admin/videos/Browse'));
const VidAdmApprovals = lazy(() => import('./pages/admin/videos/Approvals'));
const VidAdmSettings  = lazy(() => import('./pages/admin/videos/Settings'));
const VidTchCatalog   = lazy(() => import('./pages/teacher/videos/Catalog'));
const VidTchAdd       = lazy(() => import('./pages/teacher/videos/AddVideo'));
const VidTchAssign    = lazy(() => import('./pages/teacher/videos/Assignments'));
const VidStuDash      = lazy(() => import('./pages/student/videos/Dashboard'));
const VidStuPlayer    = lazy(() => import('./pages/student/videos/Player'));

// ── Teacher Feedback ──────────────────────────────────────────────────────────
const FbAdmDashboard   = lazy(() => import('./pages/feedback/admin/Dashboard'));
const FbAdmCampaigns   = lazy(() => import('./pages/feedback/admin/Campaigns'));
const FbAdmCampaign    = lazy(() => import('./pages/feedback/admin/CampaignDetail'));
const FbAdmQuestions   = lazy(() => import('./pages/feedback/admin/QuestionBank'));
const FbAdmCategories  = lazy(() => import('./pages/feedback/admin/Categories'));
const FbAdmTeachers    = lazy(() => import('./pages/feedback/admin/TeacherFeedback'));
const FbAdmTeacher     = lazy(() => import('./pages/feedback/admin/TeacherDetail'));
const FbAdmDepartments = lazy(() => import('./pages/feedback/admin/Departments'));
const FbAdmTrends      = lazy(() => import('./pages/feedback/admin/Trends'));
const FbAdmReports     = lazy(() => import('./pages/feedback/admin/Reports'));
const FbAdmTemplates   = lazy(() => import('./pages/feedback/admin/Templates'));
const FbAdmSettings    = lazy(() => import('./pages/feedback/admin/Settings'));
const FbTchDashboard   = lazy(() => import('./pages/feedback/teacher/Dashboard'));
const FbTchBreakdown   = lazy(() => import('./pages/feedback/teacher/Breakdown'));
const FbTchTrends      = lazy(() => import('./pages/feedback/teacher/Trends'));
const FbStuList        = lazy(() => import('./pages/feedback/student/MyFeedback'));
const FbStuForm        = lazy(() => import('./pages/feedback/student/FeedbackForm'));
const FbStuDetail      = lazy(() => import('./pages/feedback/student/SubmissionDetail'));

// ── Chat ─────────────────────────────────────────────────────────────────────
const Chat = lazy(() => import('./pages/Chat'));

// ── Profile ───────────────────────────────────────────────────────────────────
const Profile = lazy(() => import('./pages/Profile'));

// ── Spinner fallback ──────────────────────────────────────────────────────────
const PageLoader = () => (
  <div className="loading-page">
    <div className="spinner" />
    <span>Loading…</span>
  </div>
);

const roleHome = {
  super_admin:  '/super-admin/dashboard',
  school_admin: '/admin/dashboard',
  teacher:      '/teacher/dashboard',
  student:      '/student/dashboard',
  parent:       '/parent/dashboard',
};

// ── Protected Route (must be logged in) ───────────────────────────────────────
const Protected = ({ children, roles }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.isFirstLogin) return <Navigate to="/reset-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
};

// ── Guest Only (redirect to dashboard if already logged in) ───────────────────
const GuestOnly = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (user) return <Navigate to={roleHome[user.role] || '/'} replace />;
  return children;
};

const HomeRedirect = () => {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={roleHome[user.role] || '/login'} replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <ModulesProvider>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public — redirect to dashboard if already logged in */}
          <Route path="/login"          element={<GuestOnly><Login /></GuestOnly>} />
          <Route path="/forgot-password"element={<GuestOnly><ForgotPassword /></GuestOnly>} />
          <Route path="/verify-otp"     element={<GuestOnly><VerifyOtp /></GuestOnly>} />
          <Route path="/new-password"   element={<GuestOnly><NewPassword /></GuestOnly>} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/auth/magic/:token" element={<MagicLogin />} />
          <Route path="/" element={<HomeRedirect />} />

          {/* Super Admin */}
          <Route path="/super-admin" element={
            <Protected roles={['super_admin']}><AppLayout /></Protected>
          }>
            <Route path="dashboard"    element={<SADashboard />} />
            <Route path="schools"      element={<SASchools />} />
            <Route path="schools/create" element={<SASchoolForm />} />
            <Route path="schools/:id/edit" element={<SASchoolForm />} />
            <Route path="users"         element={<SAUsers />} />
            <Route path="permissions"   element={<SAPermissions />} />
            <Route path="videos"        element={<SAVideoLibrary />} />
            <Route path="notifications" element={<SANotifications />} />
          </Route>

          {/* Admin — school admins everywhere, plus teachers whose designation
              grants ADMIN access to the specific module area they are entering
              (AdminAreaGuard decides, matching the server-side guard). */}
          <Route path="/admin" element={
            <Protected roles={['school_admin', 'teacher']}>
              <AdminAreaGuard><AppLayout /></AdminAreaGuard>
            </Protected>
          }>
            <Route path="dashboard"       element={<ADashboard />} />
            <Route path="teachers"        element={<ATeachers />} />
            <Route path="designations"    element={<ADesignations />} />
            <Route path="students"        element={<AStudents />} />
            <Route path="admins"          element={<AAdmins />} />
            <Route path="academic-years"  element={<AAcademicYears />} />
            <Route path="classes"         element={<AClasses />} />
            <Route path="classes/:id"     element={<ASections />} />
            <Route path="sections/:id"    element={<ASectionDetail />} />
            <Route path="subjects"        element={<ASubjects />} />
            {/* Timetable — the index route is the existing section editor, so
                /admin/timetable behaves exactly as it did before this module. */}
            <Route path="timetable" element={<ModuleNav tabs={TIMETABLE_ADMIN_TABS} />}>
              <Route index                    element={<ATimetable />} />
              <Route path="substitutions"     element={<ASubstitutions />} />
              <Route path="generate"          element={<TTGenerate />} />
              <Route path="versions"          element={<TTVersions />} />
              <Route path="versions/:id"      element={<TTVersionDetail />} />
              <Route path="availability"      element={<TTAvailability />} />
              <Route path="rooms"             element={<TTRooms />} />
              <Route path="reports"           element={<TTReports />} />
              <Route path="configuration"     element={<TTConfiguration />} />
            </Route>
            <Route path="notifications"   element={<ANotifications />} />
            <Route path="exams"           element={<AExams />} />
            <Route path="results/*"       element={<AResults />} />
            <Route path="leave/*"         element={<ALeave />} />
            <Route path="documents"       element={<ADocuments />} />
            <Route path="holidays"        element={<AHolidays />} />
            <Route path="attendance"      element={<AAttendance />} />
            <Route path="student-analytics"             element={<StudentAnalytics />} />
            <Route path="student-analytics/:studentId"  element={<StudentAnalyticsDetail />} />
            {directoryRoutes('/admin/employee-directory', true)}
            <Route path="reports"          element={<AReports />} />
            <Route path="school-settings" element={<ASchoolSettings />} />
            {/* Fees */}
            <Route path="fees" element={<ModuleNav tabs={FEES_ADMIN_TABS} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"      element={<FAdminDash />} />
              <Route path="categories"     element={<FCategories />} />
              <Route path="heads"          element={<FHeads />} />
              <Route path="structures"     element={<FStructures />} />
              <Route path="fine-rules"     element={<FFineRules />} />
              <Route path="concessions"    element={<FConcessions />} />
              <Route path="student-fees"   element={<FStudentFees />} />
              <Route path="payments"       element={<FPayments />} />
              <Route path="reports"        element={<FReports />} />
              <Route path="settings"       element={<FSettings />} />
            </Route>
            {/* Payroll */}
            <Route path="payroll" element={<ModuleNav tabs={PAYROLL_ADMIN_TABS} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"   element={<PayDashboard />} />
              <Route path="structures"  element={<PayStructures />} />
              <Route path="assignments" element={<PayAssignments />} />
              <Route path="runs"        element={<PayRuns />} />
            </Route>
            {/* Library */}
            <Route path="library" element={<ModuleNav tabs={LIBRARY_ADMIN_TABS} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"   element={<LibDashboard />} />
              <Route path="books"       element={<LibBooks />} />
              <Route path="books/:id"   element={<LibBookDetail />} />
              <Route path="circulation" element={<LibCirculation />} />
              <Route path="reservations"element={<LibReservations />} />
              <Route path="fines"       element={<LibFines />} />
              <Route path="reports"     element={<LibReports />} />
              <Route path="policy"      element={<LibPolicy />} />
            </Route>
            {/* Inventory */}
            <Route path="inventory" element={<ModuleNav tabs={INVENTORY_ADMIN_TABS} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"   element={<InvDashboard />} />
              <Route path="items"       element={<InvItems />} />
              <Route path="stock"       element={<InvStock />} />
              <Route path="requests"    element={<InvRequests />} />
              <Route path="orders"      element={<InvOrders />} />
              <Route path="issues"      element={<InvIssues />} />
              <Route path="assets"      element={<InvAssets />} />
              <Route path="vendors"     element={<InvVendors />} />
              <Route path="categories"  element={<InvCategories />} />
              <Route path="warehouses"  element={<InvWarehouses />} />
              <Route path="departments" element={<InvDepartments />} />
              <Route path="audit"       element={<InvAudit />} />
            </Route>
            {/* Transport */}
            <Route path="transport" element={<ModuleNav tabs={TRANSPORT_ADMIN_TABS} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"   element={<TrDashboard />} />
              <Route path="live"        element={<TrLive />} />
              <Route path="vehicles"    element={<TrVehicles />} />
              <Route path="staff"       element={<TrStaff />} />
              <Route path="routes"      element={<TrRoutes />} />
              <Route path="assignments" element={<TrAssignments />} />
              <Route path="trips"       element={<TrTrips />} />
              <Route path="fuel"        element={<TrFuel />} />
              <Route path="maintenance" element={<TrMaintenance />} />
              <Route path="incidents"   element={<TrIncidents />} />
              <Route path="complaints"  element={<TrComplaints />} />
              <Route path="fee-plans"   element={<TrFeePlans />} />
              <Route path="invoices"    element={<TrInvoices />} />
              <Route path="requests"    element={<TrRequests />} />
              <Route path="reports"     element={<TrReports />} />
              <Route path="settings"    element={<TrSettings />} />
              <Route path="audit"       element={<TrAudit />} />
            </Route>
            {/* Hostel */}
            <Route path="hostel" element={<ModuleNav tabs={HOSTEL_ADMIN_TABS} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"     element={<HsDashboard />} />
              <Route path="hostels"       element={<HsHostels />} />
              <Route path="structure"     element={<HsStructure />} />
              <Route path="rooms"         element={<HsRooms />} />
              <Route path="occupancy"     element={<HsOccupancy />} />
              <Route path="admissions"    element={<HsAdmissions />} />
              <Route path="allocations"   element={<HsAllocations />} />
              <Route path="attendance"    element={<HsAttendance />} />
              <Route path="leave"         element={<HsLeave />} />
              <Route path="outpass"       element={<HsOutpass />} />
              <Route path="visitors"      element={<HsVisitors />} />
              <Route path="movement"      element={<HsMovement />} />
              <Route path="staff"         element={<HsStaff />} />
              <Route path="mess"          element={<HsMess />} />
              <Route path="fees"          element={<HsFees />} />
              <Route path="complaints"    element={<HsComplaints />} />
              <Route path="maintenance"   element={<HsMaintenance />} />
              <Route path="assets"        element={<HsAssets />} />
              <Route path="incidents"     element={<HsIncidents />} />
              <Route path="discipline"    element={<HsDiscipline />} />
              <Route path="documents"     element={<HsDocuments />} />
              <Route path="communication" element={<HsCommunication />} />
              <Route path="reports"       element={<HsReports />} />
              <Route path="settings"      element={<HsSettings />} />
              <Route path="audit"         element={<HsAudit />} />
            </Route>
            {/* Video Learning */}
            <Route path="videos" element={<ModuleNav tabs={VIDEO_ADMIN_TABS} />}>
              <Route index element={<Navigate to="browse" replace />} />
              <Route path="browse"    element={<VidAdmBrowse />} />
              <Route path="approvals" element={<VidAdmApprovals />} />
              <Route path="settings"  element={<VidAdmSettings />} />
            </Route>
            {/* Teacher Feedback */}
            <Route path="feedback" element={<ModuleNav tabs={FEEDBACK_ADMIN_TABS} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"     element={<FbAdmDashboard />} />
              <Route path="campaigns"     element={<FbAdmCampaigns />} />
              <Route path="campaigns/:id" element={<FbAdmCampaign />} />
              <Route path="questions"     element={<FbAdmQuestions />} />
              <Route path="categories"    element={<FbAdmCategories />} />
              <Route path="teachers"      element={<FbAdmTeachers />} />
              <Route path="teachers/:id"  element={<FbAdmTeacher />} />
              <Route path="departments"   element={<FbAdmDepartments />} />
              <Route path="trends"        element={<FbAdmTrends />} />
              <Route path="reports"       element={<FbAdmReports />} />
              <Route path="templates"     element={<FbAdmTemplates />} />
              <Route path="settings"      element={<FbAdmSettings />} />
            </Route>
          </Route>

          {/* Teacher */}
          <Route path="/teacher" element={
            <Protected roles={['teacher']}><AppLayout /></Protected>
          }>
            <Route path="dashboard"    element={<TDashboard />} />
            <Route path="my-section"   element={<TMySection />} />
            <Route path="attendance"   element={<TAttendance />} />
            <Route path="student-analytics"            element={<StudentAnalytics />} />
            <Route path="student-analytics/:studentId" element={<StudentAnalyticsDetail />} />
            {directoryRoutes('/teacher/employee-directory', false)}
            <Route path="timetable"    element={<TTimetable />} />
            <Route path="substitutions" element={<TSubstitutions />} />
            <Route path="exams/*"      element={<TExams />} />
            <Route path="results/*"    element={<TResults />} />
            <Route path="leave"        element={<TLeave />} />
            <Route path="documents"    element={<TDocuments />} />
            <Route path="payroll" element={<ModuleNav tabs={PAYROLL_TEACHER_TABS} />}>
              <Route index element={<Navigate to="ctc" replace />} />
              <Route path="ctc"      element={<PayMyCtc />} />
              <Route path="payslips" element={<PayMyPayslips />} />
            </Route>
            <Route element={<ModuleNav tabs={LIBRARY_STUDENT_TABS('/teacher')} />}>
              <Route path="library"          element={<SLibrary />} />
              <Route path="library/search"   element={<SLibSearch />} />
              <Route path="library/my-books" element={<SLibMyBooks />} />
              <Route path="library/my-fines" element={<SLibMyFines />} />
            </Route>
            {/* Library management for teachers with the Librarian designation
                (backend enforces the designation on every endpoint) */}
            <Route path="manage-library" element={<ModuleNav tabs={LIBRARY_MANAGE_TABS('/teacher/manage-library')} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"   element={<LibDashboard />} />
              <Route path="books"       element={<LibBooks />} />
              <Route path="books/:id"   element={<LibBookDetail />} />
              <Route path="circulation" element={<LibCirculation />} />
              <Route path="reservations"element={<LibReservations />} />
              <Route path="fines"       element={<LibFines />} />
              <Route path="reports"     element={<LibReports />} />
              <Route path="policy"      element={<LibPolicy />} />
            </Route>
            <Route path="inventory" element={<ModuleNav tabs={INVENTORY_TEACHER_TABS} />}>
              <Route index element={<Navigate to="requests" replace />} />
              <Route path="requests" element={<InvTeacherRequests />} />
            </Route>
            <Route path="videos" element={<ModuleNav tabs={VIDEO_TEACHER_TABS} />}>
              <Route index element={<Navigate to="catalog" replace />} />
              <Route path="catalog"     element={<VidTchCatalog />} />
              <Route path="add"         element={<VidTchAdd />} />
              <Route path="assignments" element={<VidTchAssign />} />
            </Route>
            {/* My own feedback results */}
            <Route path="feedback" element={<ModuleNav tabs={FEEDBACK_TEACHER_TABS} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<FbTchDashboard />} />
              <Route path="breakdown" element={<FbTchBreakdown />} />
              <Route path="trends"    element={<FbTchTrends />} />
            </Route>
            {/* School-wide feedback review — Principal / Vice Principal designation.
                The backend re-checks the designation on every request, so these
                routes are safe even if the nav item is reached directly. */}
            <Route path="feedback-review" element={<ModuleNav tabs={FEEDBACK_PRINCIPAL_TABS} />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard"    element={<FbAdmDashboard />} />
              <Route path="teachers"     element={<FbAdmTeachers />} />
              <Route path="teachers/:id" element={<FbAdmTeacher />} />
              <Route path="departments"  element={<FbAdmDepartments />} />
              <Route path="trends"       element={<FbAdmTrends />} />
              <Route path="reports"      element={<FbAdmReports />} />
            </Route>
            <Route path="holidays"         element={<THolidays />} />
            <Route path="notifications"    element={<SharedNotifications />} />
          </Route>

          {/* Student */}
          <Route path="/student" element={
            <Protected roles={['student']}><AppLayout /></Protected>
          }>
            <Route path="dashboard"        element={<SDashboard />} />
            <Route path="my-class"         element={<SMyClass />} />
            <Route path="attendance"       element={<SAttendance />} />
            <Route path="timetable"        element={<STimetable />} />
            <Route path="exams/*"          element={<SExams />} />
            <Route path="results/*"        element={<SResults />} />
            <Route path="documents"        element={<SDocuments />} />
            <Route path="holidays"         element={<SHolidays />} />
            <Route path="fees/*"           element={<SFees />} />
            <Route path="transport"        element={<TrStudent />} />
            <Route path="hostel"           element={<HsStudent />} />
            <Route path="videos"           element={<VidStuDash />} />
            <Route path="videos/:id"       element={<VidStuPlayer />} />
            <Route path="feedback"           element={<FbStuList />} />
            <Route path="feedback/:id"       element={<FbStuForm />} />
            <Route path="feedback/:id/view"  element={<FbStuDetail />} />
            <Route element={<ModuleNav tabs={LIBRARY_STUDENT_TABS('/student')} />}>
              <Route path="library"          element={<SLibrary />} />
              <Route path="library/search"   element={<SLibSearch />} />
              <Route path="library/my-books" element={<SLibMyBooks />} />
              <Route path="library/my-fines" element={<SLibMyFines />} />
            </Route>
            <Route path="notifications"    element={<SharedNotifications />} />
          </Route>

          {/* Parent */}
          <Route path="/parent" element={
            <Protected roles={['parent']}><AppLayout /></Protected>
          }>
            <Route path="dashboard"        element={<PDashboard />} />
            <Route path="child-class"      element={<PChildClass />} />
            <Route path="child-attendance" element={<PAttendance />} />
            <Route path="exams"            element={<PExams />} />
            <Route path="results/*"        element={<PResults />} />
            <Route path="documents"        element={<PDocuments />} />
            <Route path="holidays"         element={<PHolidays />} />
            <Route path="child-fees"       element={<PFees />} />
            {/* Transport */}
            <Route path="transport" element={<ModuleNav tabs={TRANSPORT_PARENT_TABS} />}>
              <Route index element={<Navigate to="track" replace />} />
              <Route path="track"      element={<TrParentTrack />} />
              <Route path="details"    element={<TrParentDetails />} />
              <Route path="attendance" element={<TrParentAttendance />} />
              <Route path="fees"       element={<TrParentFees />} />
              <Route path="requests"   element={<TrParentRequests />} />
            </Route>
            <Route path="hostel"           element={<HsParent />} />
            <Route path="notifications"    element={<SharedNotifications />} />
          </Route>

          {/* Chat (all authenticated roles) */}
          <Route path="/chat" element={
            <Protected><AppLayout /></Protected>
          }>
            <Route index element={<Chat />} />
          </Route>

          {/* Profile (all roles) */}
          <Route path="/profile" element={
            <Protected><AppLayout /></Protected>
          }>
            <Route index element={<Profile />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      </ModulesProvider>
    </AuthProvider>
  );
}
