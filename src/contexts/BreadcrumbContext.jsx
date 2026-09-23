/**
 * Where a page says what it is called.
 *
 * The breadcrumb itself is drawn once, by the layout, from the navigation tree
 * (see components/layout/navTree.js) — that is what makes it universal and
 * what keeps its order the same on every screen. But the tree only knows about
 * pages, not about the row you opened: it can say "Home › Students", not
 * "Home › Students › Rahul Sharma".
 *
 * So a detail screen calls `usePageCrumbs` with the steps it adds, and they
 * are appended to the automatic trail. Nothing decides where a trail starts or
 * what the steps in between are called except the tree.
 */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CrumbContext = createContext({ extra: [], setExtra: () => {} });

export function BreadcrumbProvider({ children }) {
  const [extra, setExtra] = useState([]);
  const value = useMemo(() => ({ extra, setExtra }), [extra]);
  return <CrumbContext.Provider value={value}>{children}</CrumbContext.Provider>;
}

/** Read the registered steps. For the renderer; pages use `usePageCrumbs`. */
export const usePageCrumbState = () => useContext(CrumbContext);

/**
 * Append steps to this page's trail.
 *
 *   usePageCrumbs([{ label: student.name }]);
 *   usePageCrumbs([{ label: 'Class 8', to: '/admin/classes/8' }, { label: 'Section A' }]);
 *
 * A step without `to` is where you are. Falsy entries are dropped, so a name
 * that has not loaded yet simply leaves the trail one step shorter instead of
 * flashing "undefined". The steps are cleared when the page unmounts.
 */
export function usePageCrumbs(steps) {
  const { setExtra } = useContext(CrumbContext);
  // Compared by content, so a page may build the array inline on every render.
  const key = JSON.stringify(
    (Array.isArray(steps) ? steps : [steps])
      .filter(s => s && (s.label || typeof s === 'string'))
      .map(s => (typeof s === 'string' ? { label: s } : { label: s.label, to: s.to }))
  );

  useEffect(() => {
    setExtra(JSON.parse(key));
    return () => setExtra([]);
  }, [key, setExtra]);
}
