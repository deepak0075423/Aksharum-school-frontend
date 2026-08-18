import React, { useMemo } from 'react';
import * as api from '../../api/admin.api';
import DesignationPermissions from '../../components/DesignationPermissions';

/**
 * Designation → module access, for the signed-in admin's own school.
 * The grid itself lives in components/DesignationPermissions.jsx, shared with the
 * super admin's per-school version.
 */
export default function Designations() {
  const bridge = useMemo(() => ({
    key: 'own-school',
    load:   ()          => api.getDesignationMatrix(),
    save:   (rows)      => api.saveDesignationMatrix(rows),
    create: (data)      => api.createDesignation(data),
    update: (id, patch) => api.updateDesignation(id, patch),
    remove: (id)        => api.deleteDesignation(id),
    teachers:      (id) => api.getDesignationTeachers(id),
    exportTeachers:(id) => api.exportDesignationTeachers(id),
  }), []);

  return (
    <DesignationPermissions
      api={bridge}
      title="Designations & Module Access"
      subtitle="What each teacher designation may reach, and with which privileges" />
  );
}
