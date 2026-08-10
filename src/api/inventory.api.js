import api from './axios';

// ── Admin ─────────────────────────────────────────────────────────────────────
export const getDashboard = () => api.get('/inventory/admin/dashboard');
export const getMeta      = () => api.get('/inventory/admin/meta');

// Categories
export const getCategories   = ()       => api.get('/inventory/admin/categories');
export const createCategory  = (data)   => api.post('/inventory/admin/categories', data);
export const updateCategory  = (id, d)  => api.put(`/inventory/admin/categories/${id}`, d);
export const deleteCategory  = (id)     => api.delete(`/inventory/admin/categories/${id}`);

// Vendors
export const getVendors  = ()      => api.get('/inventory/admin/vendors');
export const createVendor = (d)    => api.post('/inventory/admin/vendors', d);
export const updateVendor = (id, d) => api.put(`/inventory/admin/vendors/${id}`, d);
export const deleteVendor = (id)   => api.delete(`/inventory/admin/vendors/${id}`);

// Warehouses
export const getWarehouses  = ()      => api.get('/inventory/admin/warehouses');
export const createWarehouse = (d)    => api.post('/inventory/admin/warehouses', d);
export const updateWarehouse = (id, d) => api.put(`/inventory/admin/warehouses/${id}`, d);
export const deleteWarehouse = (id)   => api.delete(`/inventory/admin/warehouses/${id}`);

// Departments
export const getDepartments  = ()      => api.get('/inventory/admin/departments');
export const createDepartment = (d)    => api.post('/inventory/admin/departments', d);
export const updateDepartment = (id, d) => api.put(`/inventory/admin/departments/${id}`, d);
export const deleteDepartment = (id)   => api.delete(`/inventory/admin/departments/${id}`);

// Items
export const getItems   = (params) => api.get('/inventory/admin/items', { params });
export const getItem    = (id)     => api.get(`/inventory/admin/items/${id}`);
export const createItem = (d)      => api.post('/inventory/admin/items', d);
export const updateItem = (id, d)  => api.put(`/inventory/admin/items/${id}`, d);
export const deleteItem = (id)     => api.delete(`/inventory/admin/items/${id}`);

// Stock
export const getStock        = (params) => api.get('/inventory/admin/stock', { params });
export const getTransactions = (params) => api.get('/inventory/admin/stock/transactions', { params });
export const adjustStock     = (d)      => api.post('/inventory/admin/stock/adjust', d);
export const transferStock   = (d)      => api.post('/inventory/admin/stock/transfer', d);

// Purchase Requests (admin)
export const getRequests    = (params) => api.get('/inventory/admin/requests', { params });
export const getRequest     = (id)     => api.get(`/inventory/admin/requests/${id}`);
export const actOnRequest   = (id, d)  => api.post(`/inventory/admin/requests/${id}/act`, d);
export const fulfilRequest  = (id)     => api.post(`/inventory/admin/requests/${id}/fulfil`);

// Purchase Orders
export const getOrders     = (params) => api.get('/inventory/admin/orders', { params });
export const getOrder      = (id)     => api.get(`/inventory/admin/orders/${id}`);
export const createOrder   = (d)      => api.post('/inventory/admin/orders', d);
export const receiveOrder  = (id, d)  => api.post(`/inventory/admin/orders/${id}/receive`, d);
export const cancelOrder   = (id)     => api.post(`/inventory/admin/orders/${id}/cancel`);

// Issue / Return
export const getIssues   = (params) => api.get('/inventory/admin/issues', { params });
export const createIssue = (d)      => api.post('/inventory/admin/issues', d);
export const returnIssue = (id, d)  => api.post(`/inventory/admin/issues/${id}/return`, d);

// Assets & Repairs
export const getAssets    = (params) => api.get('/inventory/admin/assets', { params });
export const getAsset     = (id)     => api.get(`/inventory/admin/assets/${id}`);
export const createAsset  = (d)      => api.post('/inventory/admin/assets', d);
export const updateAsset  = (id, d)  => api.put(`/inventory/admin/assets/${id}`, d);
export const deleteAsset  = (id)     => api.delete(`/inventory/admin/assets/${id}`);
export const addRepair    = (id, d)  => api.post(`/inventory/admin/assets/${id}/repairs`, d);
export const updateRepair = (id, rid, d) => api.put(`/inventory/admin/assets/${id}/repairs/${rid}`, d);

// Audit
export const getAuditLog = (params) => api.get('/inventory/admin/audit', { params });

// ── Teacher ───────────────────────────────────────────────────────────────────
export const getTeacherMeta      = ()     => api.get('/inventory/teacher/meta');
export const getMyRequests       = ()     => api.get('/inventory/teacher/requests');
export const getMyRequest        = (id)   => api.get(`/inventory/teacher/requests/${id}`);
export const createMyRequest     = (d)    => api.post('/inventory/teacher/requests', d);
export const cancelMyRequest     = (id)   => api.post(`/inventory/teacher/requests/${id}/cancel`);
