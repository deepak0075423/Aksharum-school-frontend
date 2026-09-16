import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { magicLogin } from '../../api/auth.api';
import { useAuth } from '../../contexts/AuthContext';
import { roleHome } from './roleHome';

export default function MagicLogin() {
  const { token }   = useParams();
  const navigate    = useNavigate();
  const { signIn, signOut } = useAuth();
  const attempted   = useRef(false);

  useEffect(() => {
    // React 18 Strict Mode mounts effects twice in dev — ref prevents double API call
    // (which would consume the one-time token on the first call and fail on the second)
    if (attempted.current) return;
    attempted.current = true;

    magicLogin(token)
      .then((res) => {
        // The person behind the link holds posts at more than one school (or in
        // more than one role). The link is already spent, so the question is
        // asked on the same screen a password sign-in uses — and whatever
        // session this browser had before is ended first, or the chooser (a
        // signed-out screen) would bounce straight back into it.
        if (res?.requiresSelection) {
          signOut();
          navigate('/choose-account', { replace: true, state: {
            selectionToken: res.selectionToken,
            accounts:       res.accounts,
            name:           res.name,
            email:          res.email,
          } });
          return;
        }
        signIn(res.token, res.refreshToken, res.user);
        // window.location.replace clears the page before toast renders,
        // so persist the message in sessionStorage and show it after reload
        sessionStorage.setItem('welcome_msg', `Welcome, ${res.user.name}!`);
        window.location.replace(roleHome[res.user.role] || '/');
      })
      .catch((err) => {
        // A spent link and a switched-off account are different problems; say
        // which one it is when the server has told us.
        toast.error(err?.status === 403 && err.message ? err.message : 'Invalid or expired magic link');
        navigate('/login');
      });
  }, [token]);

  return (
    <div className="loading-page">
      <div className="spinner" />
      <p>Authenticating via magic link…</p>
    </div>
  );
}
