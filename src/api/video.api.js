/**
 * Video Learning — the API, one function per endpoint.
 *
 *     Board → Class → Subject → Book → Chapter → Videos
 *
 * central.*  Super Admin   the content library, providers, school requests
 * school.*   School Admin  what the school follows; requests; school figures
 * teacher.*  Teacher       releases and their students' progress
 * student.*  Student       their books, watching, their own history
 *
 * The axios instance already returns the response body, so each call resolves
 * to `{ success, data, … }` (hooks/useFetch unwraps `data` and keeps the rest
 * as `meta` — paging lives there).
 */
import api from './axios';

const form = { headers: { 'Content-Type': 'multipart/form-data' } };

export const central = {
  meta:        ()            => api.get('/video/central/meta'),
  overview:    (params)      => api.get('/video/central/overview', { params }),
  audit:       (params)      => api.get('/video/central/audit', { params }),
  uploadImage: (file)        => { const fd = new FormData(); fd.append('file', file); return api.post('/video/central/images', fd, form); },

  boards:         (params)   => api.get('/video/central/boards', { params }),
  board:          (id)       => api.get(`/video/central/boards/${id}`),
  createBoard:    (d)        => api.post('/video/central/boards', d),
  updateBoard:    (id, d)    => api.put(`/video/central/boards/${id}`, d),
  setBoardActive: (id, active) => api.post(`/video/central/boards/${id}/active`, { active }),
  removeBoard:    (id)       => api.delete(`/video/central/boards/${id}`),

  subjects:      (params)    => api.get('/video/central/subjects', { params }),
  createSubject: (d)         => api.post('/video/central/subjects', d),
  updateSubject: (id, d)     => api.put(`/video/central/subjects/${id}`, d),
  removeSubject: (id)        => api.delete(`/video/central/subjects/${id}`),

  books:         (params)    => api.get('/video/central/books', { params }),
  book:          (id)        => api.get(`/video/central/books/${id}`),
  createBook:    (d)         => api.post('/video/central/books', d),
  updateBook:    (id, d)     => api.put(`/video/central/books/${id}`, d),
  setBookStatus: (id, status) => api.post(`/video/central/books/${id}/status`, { status }),
  newEdition:    (id, d)     => api.post(`/video/central/books/${id}/editions`, d),
  removeBook:    (id)        => api.delete(`/video/central/books/${id}`),

  createChapter:   (bookId, d)   => api.post(`/video/central/books/${bookId}/chapters`, d),
  updateChapter:   (id, d)       => api.put(`/video/central/chapters/${id}`, d),
  reorderChapters: (bookId, order) => api.put(`/video/central/books/${bookId}/chapters/order`, { order }),
  removeChapter:   (id)          => api.delete(`/video/central/chapters/${id}`),
  mapVideos:       (chapterId, videos) => api.post(`/video/central/chapters/${chapterId}/videos`, { videos }),
  reorderChapterVideos: (chapterId, order) => api.put(`/video/central/chapters/${chapterId}/videos/order`, { order }),
  unmapVideo:      (mappingId)   => api.delete(`/video/central/mappings/${mappingId}`),

  videos:         (params)   => api.get('/video/central/videos', { params }),
  video:          (id)       => api.get(`/video/central/videos/${id}`),
  lookupEmbed:    (d)        => api.post('/video/central/videos/lookup', d),
  createVideo:    (d)        => api.post('/video/central/videos', d),
  updateVideo:    (id, d)    => api.put(`/video/central/videos/${id}`, d),
  setVideoActive: (id, active) => api.post(`/video/central/videos/${id}/active`, { active }),
  previewVideo:   (id)       => api.post(`/video/central/videos/${id}/preview`),
  reprocessVideo: (id)       => api.post(`/video/central/videos/${id}/process`),
  removeVideo:    (id)       => api.delete(`/video/central/videos/${id}`),

  initUpload:     (videoId, d) => api.post(`/video/central/videos/${videoId}/uploads`, d),
  uploadStatus:   (uploadId)   => api.get(`/video/central/uploads/${uploadId}`),
  uploadChunk:    (uploadId, index, blob, onUploadProgress) => api.put(`/video/central/uploads/${uploadId}/chunks/${index}`, blob,
    { headers: { 'Content-Type': 'application/octet-stream' }, timeout: 120000, onUploadProgress }),
  completeUpload: (uploadId)   => api.post(`/video/central/uploads/${uploadId}/complete`),
  abortUpload:    (uploadId)   => api.delete(`/video/central/uploads/${uploadId}`),

  providers:     ()          => api.get('/video/central/providers'),
  saveProvider:  (name, d)   => api.put(`/video/central/providers/${name}`, d),
  checkProvider: (name)      => api.post(`/video/central/providers/${name}/check`),
  saveSettings:  (d)         => api.put('/video/central/settings', d),

  requests:         (params) => api.get('/video/central/requests', { params }),
  request:          (id)     => api.get(`/video/central/requests/${id}`),
  setRequestStatus: (id, d)  => api.post(`/video/central/requests/${id}/status`, d),
  requestAttachment: (id)    => api.get(`/video/central/requests/${id}/attachment`, { responseType: 'blob' }),
};

export const school = {
  setup:            (params)  => api.get('/video/school/setup', { params }),
  setBoard:         (d)       => api.put('/video/school/board', d),
  setClassSubjects: (classId, subjects) => api.put(`/video/school/classes/${classId}/subjects`, { subjects }),
  availableBooks:   (classId, subject)  => api.get(`/video/school/classes/${classId}/books`, { params: { subject } }),
  assignBook:       (d)       => api.put('/video/school/books/assignment', d),
  history:          (params)  => api.get('/video/school/assignments/history', { params }),

  requests:      (params)     => api.get('/video/school/requests', { params }),
  request:       (id)         => api.get(`/video/school/requests/${id}`),
  createRequest: (fields, file) => {
    if (!file) return api.post('/video/school/requests', fields);
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, v); });
    fd.append('file', file);
    return api.post('/video/school/requests', fd, form);
  },
  withdrawRequest:   (id)     => api.delete(`/video/school/requests/${id}`),
  requestAttachment: (id)     => api.get(`/video/school/requests/${id}/attachment`, { responseType: 'blob' }),

  settings:     ()            => api.get('/video/school/settings'),
  saveSettings: (d)           => api.put('/video/school/settings', d),
  analytics:    (params)      => api.get('/video/school/analytics', { params }),
  students:     (params)      => api.get('/video/school/analytics/students', { params }),
  audit:        (params)      => api.get('/video/school/audit', { params }),
};

export const teacher = {
  workspace:       ()             => api.get('/video/teacher/workspace'),
  book:            (id, section)  => api.get(`/video/teacher/books/${id}`, { params: { section } }),
  sectionStudents: (sectionId)    => api.get(`/video/teacher/sections/${sectionId}/students`),

  releases:   (params)   => api.get('/video/teacher/releases', { params }),
  release:    (id)       => api.get(`/video/teacher/releases/${id}`),
  create:     (d)        => api.post('/video/teacher/releases', d),
  update:     (id, d)    => api.put(`/video/teacher/releases/${id}`, d),
  unpublish:  (id)       => api.post(`/video/teacher/releases/${id}/unpublish`),
  publish:    (id)       => api.post(`/video/teacher/releases/${id}/publish`),
  revoke:     (id, reason) => api.post(`/video/teacher/releases/${id}/revoke`, { reason }),
  rerelease:  (id, d)    => api.post(`/video/teacher/releases/${id}/rerelease`, d),

  analytics:     (params)     => api.get('/video/teacher/analytics', { params }),
  students:      (params)     => api.get('/video/teacher/analytics/students', { params }),
  studentReport: (id, params) => api.get(`/video/teacher/analytics/students/${id}`, { params }),
  exportClass:   (params)     => api.get('/video/teacher/analytics/export', { params, responseType: 'blob', timeout: 60000 }),
  exportStudent: (id, format) => api.get(`/video/teacher/analytics/students/${id}/export`, { params: { format }, responseType: 'blob', timeout: 60000 }),
};

export const student = {
  home:      ()          => api.get('/video/student/home'),
  book:      (id)        => api.get(`/video/student/books/${id}`),
  chapter:   (id)        => api.get(`/video/student/chapters/${id}`),
  history:   (params)    => api.get('/video/student/history', { params }),
  authorize: (chapterVideoId) => api.post(`/video/student/watch/${chapterVideoId}/authorize`),
  renew:     (sessionId) => api.post(`/video/student/sessions/${sessionId}/renew`),
  heartbeat: (sessionId, d) => api.post(`/video/student/sessions/${sessionId}/heartbeat`, d, { timeout: 10000 }),
  end:       (sessionId) => api.post(`/video/student/sessions/${sessionId}/end`),
};

/**
 * The absolute address of something the API serves by path (a video stream, an
 * HLS playlist): `/video/stream/<token>` → `https://api…/api/video/stream/<token>`.
 */
export const apiUrl = (path) => `${(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')}${path}`;
