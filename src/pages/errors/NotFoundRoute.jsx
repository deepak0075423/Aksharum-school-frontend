/**
 * The catch-all route.
 *
 * Separate from ErrorPage so the page itself stays a dumb presentational
 * component that any guard can render, while this one knows the one thing only
 * the route knows: which address was asked for. Telling somebody the address
 * back is most of what makes a 404 useful — it is how they spot the typo, or
 * see that a link they were sent is truncated.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import ErrorPage from './ErrorPage';

export default function NotFoundRoute() {
  const { pathname } = useLocation();
  return <ErrorPage code={404} what={pathname} />;
}
