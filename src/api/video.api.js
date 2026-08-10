import api from './axios';

// ═══════════════════════════════ SUPER ADMIN ════════════════════════════════
export const adminMeta       = ()          => api.get('/video/admin/meta');
export const adminOverview   = ()          => api.get('/video/admin/overview');
export const adminAudit      = (params)    => api.get('/video/admin/audit', { params });

export const listVideos      = (params)    => api.get('/video/admin/videos', { params });
export const getVideo        = (id)        => api.get(`/video/admin/videos/${id}`);
export const createVideo     = (d)         => api.post('/video/admin/videos', d);
export const updateVideo     = (id, d)     => api.put(`/video/admin/videos/${id}`, d);
export const deleteVideo     = (id)        => api.delete(`/video/admin/videos/${id}`);
export const archiveVideo    = (id, d)     => api.post(`/video/admin/videos/${id}/archive`, d);
export const duplicateVideo  = (id)        => api.post(`/video/admin/videos/${id}/duplicate`);
export const publishVideo    = (id)        => api.post(`/video/admin/videos/${id}/publish`);
export const scheduleVideo   = (id, d)     => api.post(`/video/admin/videos/${id}/schedule`, d);
export const featureVideo    = (id, d)     => api.post(`/video/admin/videos/${id}/feature`, d);
export const setTaxonomy     = (id, d)     => api.put(`/video/admin/videos/${id}/taxonomy`, d);
export const videoAnalytics  = (id)        => api.get(`/video/admin/videos/${id}/analytics`);

export const uploadTarget    = (params)    => api.get('/video/admin/upload-target', { params });
export const uploadMedia     = (id, form)  => api.post(`/video/admin/videos/${id}/media`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
export const addAsset        = (id, form)  => api.post(`/video/admin/videos/${id}/assets`, form, { headers: { 'Content-Type': 'multipart/form-data' } });

export const listPlaylists   = (params)    => api.get('/video/admin/playlists', { params });
export const createPlaylist  = (d)         => api.post('/video/admin/playlists', d);
export const getPlaylist     = (id)        => api.get(`/video/admin/playlists/${id}`);
export const updatePlaylist  = (id, d)     => api.put(`/video/admin/playlists/${id}`, d);
export const listCourses     = (params)    => api.get('/video/admin/courses', { params });
export const createCourse    = (d)         => api.post('/video/admin/courses', d);
export const getCourse       = (id)        => api.get(`/video/admin/courses/${id}`);
export const updateCourse    = (id, d)     => api.put(`/video/admin/courses/${id}`, d);

export const bulkImport      = (d)         => api.post('/video/admin/bulk/import', d);
export const bulkExport      = (params)    => api.get('/video/admin/bulk/export', { params });

// ═══════════════════════════════ SCHOOL ADMIN ═══════════════════════════════
export const schoolSettings      = ()       => api.get('/video/school/settings');
export const updateSchoolSettings= (d)      => api.put('/video/school/settings', d);
export const schoolOverview      = ()       => api.get('/video/school/overview');
export const browseMaster        = (params) => api.get('/video/school/browse', { params });
export const enableVideo         = (id, d)  => api.post(`/video/school/videos/${id}/enable`, d);
export const setSchoolVisibility = (id, d)  => api.post(`/video/school/videos/${id}/visibility`, d);
export const approvalQueue       = (params) => api.get('/video/school/approvals', { params });
export const approveVideo        = (id)     => api.post(`/video/school/approvals/${id}/approve`);
export const rejectVideo         = (id, d)  => api.post(`/video/school/approvals/${id}/reject`, d);
export const schoolPlaylists     = ()       => api.get('/video/school/playlists');
export const createSchoolPlaylist= (d)      => api.post('/video/school/playlists', d);
export const schoolAssignments   = (params) => api.get('/video/school/assignments', { params });
export const createSchoolAssignment = (d)   => api.post('/video/school/assignments', d);
export const deleteSchoolAssignment = (id)  => api.delete(`/video/school/assignments/${id}`);

// ═══════════════════════════════ TEACHER ════════════════════════════════════
export const teacherScope        = ()       => api.get('/video/teacher/scope');
export const teacherCatalog      = (params) => api.get('/video/teacher/catalog', { params });
export const teacherAddVideo     = (d)      => api.post('/video/teacher/videos', d);
export const teacherMyVideos     = ()       => api.get('/video/teacher/videos');
export const teacherPlaylists    = ()       => api.get('/video/teacher/playlists');
export const teacherAssignments  = (params) => api.get('/video/teacher/assignments', { params });
export const teacherAssign       = (d)      => api.post('/video/teacher/assignments', d);
export const teacherDeleteAssignment = (id) => api.delete(`/video/teacher/assignments/${id}`);
export const teacherAssignmentProgress = (id) => api.get(`/video/teacher/assignments/${id}/progress`);

// ═══════════════════════════════ STUDENT ════════════════════════════════════
export const studentDashboard    = ()       => api.get('/video/student/dashboard');
export const studentShelf        = (params) => api.get('/video/student/shelf', { params });
export const studentPlayer       = (id)     => api.get(`/video/student/videos/${id}/player`);
export const reportProgress      = (d)      => api.post('/video/student/progress', d);
export const reportEvents        = (d)      => api.post('/video/student/events', d);
export const interact            = (d)      => api.post('/video/student/interact', d);
export const deleteInteraction   = (id)     => api.delete(`/video/student/interact/${id}`);
