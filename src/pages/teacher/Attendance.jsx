/**
 * Teacher → Attendance.
 *
 * Four tabs — Mark Students, Class Ranking, My Attendance, Student Corrections —
 * each in pages/teacher/attendance/, sharing the frame in parts.jsx.
 *
 * The tab keys are a URL contract: notifications link to ?tab=mine and
 * ?tab=corrections&focus=<id>, My Section to ?section=<id>. The older keys
 * (?tab=correct, ?tab=mark) still open where they used to.
 */
import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TABS } from '../../components/attendance/parts';
import MarkStudents from './attendance/MarkStudents';
import ClassRanking from './attendance/ClassRanking';
import MyAttendance from './attendance/MyAttendance';
import StudentCorrections from './attendance/StudentCorrections';

const ALIASES = { correct: 'corrections', ranking: 'ranking', mine: 'mine', mark: 'mark' };

export default function TeacherAttendance() {
  const [params, setParams] = useSearchParams();
  const wanted = ALIASES[params.get('tab')] || params.get('tab');
  const [tab, setTabState] = useState(TABS.some((t) => t.value === wanted) ? wanted : 'mark');
  // Read once: a section or request named by the link that opened the page.
  const [initialSection] = useState(params.get('section') || '');
  const [focus] = useState(params.get('focus') || '');

  const onTab = (value) => {
    setTabState(value);
    setParams({ tab: value }, { replace: true });
  };

  if (tab === 'ranking') return <ClassRanking tab={tab} onTab={onTab} initialSection={initialSection} />;
  if (tab === 'mine') return <MyAttendance tab={tab} onTab={onTab} />;
  if (tab === 'corrections') return <StudentCorrections tab={tab} onTab={onTab} focus={wanted === 'corrections' ? focus : ''} />;
  return <MarkStudents tab={tab} onTab={onTab} initialSection={initialSection} />;
}
