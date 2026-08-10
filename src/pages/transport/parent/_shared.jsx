import React, { useState, useEffect } from 'react';
import * as api from '../../../api/transport.api';

// Shared child-picker used across the parent transport pages. Returns the
// selected studentId, the children list, and a ready-to-render picker element.
export function useChildPicker() {
  const [children, setChildren] = useState([]);
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.parentChildren().then(r => {
      const list = r.data ?? r;
      setChildren(list);
      if (list.length) setStudentId(list[0].studentId);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const picker = children.length > 1 ? (
    <select className="form-control" style={{ maxWidth: 240 }} value={studentId} onChange={e => setStudentId(e.target.value)}>
      {children.map(c => <option key={c.studentId} value={c.studentId}>{c.name}</option>)}
    </select>
  ) : null;

  return { children, studentId, setStudentId, picker, loading };
}
