import React, { useState, useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import Sidebar from './Sidebar';
import Header  from './Header';
import { ChatNotifyProvider } from '../../contexts/ChatNotifyContext';
import useFocusHighlight from '../../hooks/useFocusHighlight';

export default function AppLayout() {
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const location    = useLocation();
  const prevPath    = useRef(location.pathname);

  // A notification's link carries ?focus=<id>; this finds that row on whatever
  // page it landed on and flags it. Mounted here so no page has to opt in.
  useFocusHighlight();

  useEffect(() => {
    const msg = sessionStorage.getItem('welcome_msg');
    if (msg) { toast.success(msg); sessionStorage.removeItem('welcome_msg'); }
  }, []);

  useEffect(() => {
    // Tablet (769–992px): collapse to an icon rail.
    // Phone (≤768px): sidebar becomes an off-canvas drawer and must stay FULL —
    // collapsed mode would render icons without labels inside the drawer.
    const check = () => setSidebarCollapsed(window.innerWidth <= 992 && window.innerWidth > 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Only re-trigger animation when the actual path segment changes (not query/hash)
  useEffect(() => {
    if (location.pathname !== prevPath.current) {
      prevPath.current = location.pathname;
      setAnimKey(k => k + 1);
    }
  }, [location.pathname]);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <ChatNotifyProvider>
    <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
      <div className={`sidebar-overlay${sidebarOpen ? ' show' : ''}`} onClick={closeSidebar} />

      <aside className={`app-sidebar${sidebarOpen ? ' open' : ''}`}>
        <Sidebar onLinkClick={closeSidebar} collapsed={sidebarCollapsed} />
      </aside>

      <header className="app-header">
        <Header
          onMenuClick={() => setSidebarOpen(o => !o)}
          onCollapseClick={() => setSidebarCollapsed(c => !c)}
        />
      </header>

      <main className="app-main">
        {/* key on div (not Outlet) avoids remounting page components; CSS handles the fade */}
        <div key={animKey} className="page-transition">
          <Outlet />
        </div>
      </main>
    </div>
    </ChatNotifyProvider>
  );
}
