import api from './axios';

// ── Admin: the redesigned screens (Sep 2026) ─────────────────────────────────
//
// One call per screen. Each returns that screen's tiles, charts, filter options
// and page of rows already joined, so a screen never fans out to six endpoints
// and reconciles them in the browser. The per-collection calls further down are
// the write side and still serve the teacher portal.
const q = (params) => ({ params });

export const getOverview       = (params)   => api.get('/inventory/admin/overview', q(params));
export const getItemBoard      = (params)   => api.get('/inventory/admin/item-board', q(params));
export const getItemDetail     = (id)       => api.get(`/inventory/admin/item-board/${id}`);
export const getLedgerBoard    = (params)   => api.get('/inventory/admin/ledger-board', q(params));
export const getStockBoard     = (params)   => api.get('/inventory/admin/stock-board', q(params));
export const getRequestBoard   = (params)   => api.get('/inventory/admin/request-board', q(params));
export const getOrderBoard     = (params)   => api.get('/inventory/admin/order-board', q(params));
export const getIssueBoard     = (params)   => api.get('/inventory/admin/issue-board', q(params));
export const getAssetBoard     = (params)   => api.get('/inventory/admin/asset-board', q(params));
export const getVendorBoard    = (params)   => api.get('/inventory/admin/vendor-board', q(params));
export const getVendorDetail   = (id)       => api.get(`/inventory/admin/vendor-board/${id}`);
export const getCategoryBoard  = (params)   => api.get('/inventory/admin/category-board', q(params));
export const getCategoryDetail = (id)       => api.get(`/inventory/admin/category-board/${id}`);
export const getWarehouseBoard = (params)   => api.get('/inventory/admin/warehouse-board', q(params));
export const getWarehouseDetail= (id)       => api.get(`/inventory/admin/warehouse-board/${id}`);
export const getBudgetBoard    = (params)   => api.get('/inventory/admin/budget-board', q(params));
export const getBudgetDetail   = (id)       => api.get(`/inventory/admin/budget-board/${id}`);
export const getActivityBoard  = (params)   => api.get('/inventory/admin/activity-board', q(params));
export const getActivityDetail = (id)       => api.get(`/inventory/admin/activity-board/${id}`);
export const getFormMeta       = ()         => api.get('/inventory/admin/form-meta');

// The export is a CSV stream, not JSON — the response interceptor unwraps
// `res.data`, which for a blob response is the blob itself.
export const exportActivity    = (params)   => api.get('/inventory/admin/activity-export', { params, responseType: 'blob' });

export const createBudget = (d)     => api.post('/inventory/admin/budgets', d);
export const updateBudget = (id, d) => api.put(`/inventory/admin/budgets/${id}`, d);
export const deleteBudget = (id)    => api.delete(`/inventory/admin/budgets/${id}`);

export const approveOrder  = (id)     => api.post(`/inventory/admin/orders/${id}/approve`);
export const dispatchOrder = (id, d)  => api.post(`/inventory/admin/orders/${id}/dispatch`, d);
export const createRequest = (d)      => api.post('/inventory/admin/requests', d);
export const bulkItems     = (d)      => api.post('/inventory/admin/items/bulk', d);
export const reorderItem   = (d)      => api.post('/inventory/admin/items/reorder', d);
export const setAssetState = (id, d)  => api.post(`/inventory/admin/assets/${id}/state`, d);
export const fulfilFromStock = (id, d) => api.post(`/inventory/admin/requests/${id}/fulfil`, d);

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
export const updateOrder   = (id, d)  => api.put(`/inventory/admin/orders/${id}`, d);
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

// Reports — six of them, one shape.
export const getReportMeta = ()             => api.get('/inventory/admin/reports');
export const getReport     = (kind, params) => api.get(`/inventory/admin/reports/${kind}`, { params });

// Bulk item import — `check` validates and reports without writing anything.
export const getImportTemplate = ()        => api.get('/inventory/admin/items-import/template');
export const importItems       = (rows, check) =>
  api.post('/inventory/admin/items-import', { rows, check: !!check });

// Printable documents — HTML the browser prints or saves as PDF.
export const getOrderPrint = (id) => api.get(`/inventory/admin/orders/${id}/print`, { responseType: 'text' });
export const getOrderGrn   = (id) => api.get(`/inventory/admin/orders/${id}/grn`,   { responseType: 'text' });
export const getIssueSlip  = (id) => api.get(`/inventory/admin/issues/${id}/slip`,  { responseType: 'text' });

// Audit
export const getAuditLog = (params) => api.get('/inventory/admin/audit', { params });

// ── Teacher ───────────────────────────────────────────────────────────────────
export const getTeacherMeta      = ()     => api.get('/inventory/teacher/meta');
export const getMyRequestBoard   = (params) => api.get('/inventory/teacher/request-board', { params });
export const getMyRequests       = ()     => api.get('/inventory/teacher/requests');
export const getMyRequest        = (id)   => api.get(`/inventory/teacher/requests/${id}`);
export const createMyRequest     = (d)    => api.post('/inventory/teacher/requests', d);
export const cancelMyRequest     = (id)   => api.post(`/inventory/teacher/requests/${id}/cancel`);
