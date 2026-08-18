import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import useFetch from '../../hooks/useFetch';
import * as api from '../../api/superAdmin.api';
import DesignationPermissions from '../../components/DesignationPermissions';
import { Spinner } from '../../components/ui/index';

/**
 * Designation → module access for any school.
 *
 * The middle layer of the hierarchy the Super Admin owns: /super-admin/permissions
 * decides which modules a school has at all, this decides what its designations
 * may do with them. Same grid component the school admin uses.
 */
export default function SuperAdminDesignations() {
  const [params, setParams] = useSearchParams();
  const [schoolId, setSchoolId] = useState(params.get('school') || '');

  const { data: schools, loading } = useFetch(api.getPermissions);
  const list = Array.isArray(schools) ? schools : [];

  // Land on a school straight away when only one exists, or when arriving from
  // the Permissions page with ?school=…
  useEffect(() => {
    if (!schoolId && list.length === 1) setSchoolId(list[0]._id);
  }, [list, schoolId]);

  const pick = (id) => {
    setSchoolId(id);
    if (id) setParams({ school: id }, { replace: true });
    else setParams({}, { replace: true });
  };

  const bridge = useMemo(() => ({
    key: schoolId || 'none',
    ready: !!schoolId,
    load:   ()          => api.getDesignationMatrix(schoolId),
    save:   (rows)      => api.saveDesignationMatrix(schoolId, rows),
    create: (data)      => api.createDesignation(schoolId, data),
    update: (id, patch) => api.updateDesignation(schoolId, id, patch),
    remove: (id)        => api.deleteDesignation(schoolId, id),
    teachers:      (id) => api.getDesignationTeachers(schoolId, id),
    exportTeachers:(id) => api.exportDesignationTeachers(schoolId, id),
  }), [schoolId]);

  if (loading) return <div className="loading-page"><Spinner /></div>;

  const school = list.find(s => s._id === schoolId);

  return (
    <>
      <div style={{ padding: '16px 24px 0', maxWidth: 420 }}>
        <label className="form-label">School</label>
        <select className="form-control" value={schoolId} onChange={e => pick(e.target.value)}>
          <option value="">— Select a school —</option>
          {list.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
      </div>
      <DesignationPermissions
        api={bridge}
        title="Designation Access"
        subtitle="What each designation may reach inside the modules this school has"
        schoolLabel={school?.name} />
    </>
  );
}
