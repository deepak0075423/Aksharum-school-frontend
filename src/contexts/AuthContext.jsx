import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, switchAccount } from '../api/auth.api';
import { roleHome } from '../pages/auth/roleHome';
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

  /**
   * Change school or role without signing out.
   *
   * The whole app is reloaded rather than re-rendered. A session carries far
   * more than `user`: the modules context, the chat socket, every page's cached
   * data and the branding all belong to the school being left, and a soft
   * switch would leave one of them behind pointing at the old one. A reload on
   * the new token is the only way to be sure none of it survives — and the
   * person keeps their session either way, which is what "without logging out"
   * asks for.
   */
  const switchTo = async (accountId) => {
    const res = await switchAccount(accountId);
    if (!res?.token || !res?.user) throw new Error('Could not switch account');
    localStorage.setItem('token', res.token);
    localStorage.setItem('refreshToken', res.refreshToken);
    if (res.user?.school) rememberSchoolBranding(res.user.school);
    window.location.replace(roleHome[res.user.role] || '/');
    return res.user;
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
    <AuthContext.Provider value={{ user, loading, signIn, signOut, switchTo, accounts: user?.accounts || [], reload: loadUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
