/**
 * Residents, as the hostel list screens show and pick them: the student cell
 * (photo, name, roll), where they live in one line, and the picker every
 * "file something for a resident" form uses.
 */
import React, { useEffect, useState } from 'react';
import * as api from '../../../api/hostel.api';
import { Person } from './hsList';

/** "B1 - R101 (Bed 1)" — building code, the room number shortened, the bed. */
export const roomShort = (r, { bed = true } = {}) => {
  if (!r?.roomNumber) return '—';
  const b = r.buildingCode || r.buildingName || '';
  const room = String(r.roomNumber).replace(/^room\s*/i, 'R');
  return `${b ? `${b} - ` : ''}${room}${bed && r.bedNumber ? ` (Bed ${r.bedNumber})` : ''}`;
};
/** "B1-R101" */
export const roomTight = (r) => {
  if (!r?.roomNumber) return '';
  const b = r.buildingCode || '';
  return `${b ? `${b}-` : ''}${String(r.roomNumber).replace(/^room\s*/i, 'R')}`;
};

/**
 * A board row's resident: avatar, name and roll number (admission no. when
 * there is no roll). A member of staff is marked as one, with their employee id.
 */
export const StudentCell = ({ r, size = 36, strong = false, sub }) => (
  <Person name={r.studentName} src={r.studentPhoto} size={size} strong={strong}
    sub={sub ?? (r.studentKind === 'teacher'
      ? ['Teacher', r.studentAdmissionNo].filter(Boolean).join(' · ')
      : (r.studentRoll ? `Roll ${r.studentRoll}` : r.studentAdmissionNo))} />
);

/**
 * The hostel's current residents, fetched when a form that needs them opens.
 * One query for the lot: the board already carries class, roll and room.
 */
export function useResidents(enabled) {
  const [list, setList] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    api.getBoard('allocations', { tab: 'active', limit: 2000, sort: 'student', dir: 'asc' })
      .then((r) => alive && setList((r.data ?? r).rows || []))
      .catch(() => alive && setList([]));
    return () => { alive = false; };
  }, [enabled]);
  return list;
}

/** The resident picker: name, class and room in each option, the student's id as the value. */
export const ResidentSelect = ({ residents, value, onChange, required = true, placeholder = '— select a resident —', id }) => (
  <select id={id} className="form-control" required={required} value={value} onChange={(e) => onChange(e.target.value)}>
    <option value="">{placeholder}</option>
    {residents.map((a) => (
      <option key={a.studentId} value={a.studentId}>
        {[a.studentName, a.studentClass, a.roomNumber].filter(Boolean).join(' · ')}
      </option>
    ))}
  </select>
);
