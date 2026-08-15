import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe } from '../api/auth.api';
import { applySchoolFavicon, rememberSchoolBranding, getRememberedBranding } from '../utils/branding';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    try {
      const data = await getMe();
      setUser(data.user);
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUser(); }, [loadUser]);

  // Browser tab follows the signed-in user's school branding. Re-runs when the
  // admin uploads a new logo, since reload() refreshes user.school; before
  // sign-in it falls back to the last school used in this browser.
  useEffect(() => {
    if (user?.school) rememberSchoolBranding(user.school);
    applySchoolFavicon(user?.school);
  }, [user?.school?.logo, user?.school?._id]);

  const signIn = (token, refreshToken, userData) => {
    localStorage.setItem('token', token);
    localStorage.setItem('refreshToken', refreshToken);
    if (userData?.school) rememberSchoolBranding(userData.school);
    setUser(userData);
  };

  const signOut = () => {
    // Keep the school branding across sign-out so the login screen the user
    // comes back to still shows their school's logo.
    const branding = getRememberedBranding();
    localStorage.clear();
    if (branding) rememberSchoolBranding(branding);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut, reload: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
