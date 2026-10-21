/**
 * One application: the form while it can still be edited (a draft, or sent
 * back as incomplete), the tracking page once it has been submitted.
 */
import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { portal as api } from '../../../api/admission.api';
import { useAuth } from '../../../contexts/AuthContext';
import { usePortal } from './PortalShell';
import { useLoad, Spin, ErrorBox, Ico } from '../admUI';
import Wizard from './Wizard';
import Tracker from './Tracker';

export default function ApplicationPage() {
  const { id } = useParams();
  const { slug } = usePortal();
  const { user } = useAuth();
  const { data, loading, error, reload } = useLoad(() => api.detail(id), [id]);
  if (loading && !data) return <Spin />;
  if (error && !data) return <ErrorBox error={error} onRetry={reload} />;
  return (
    <>
      <Link to={`/${slug}/dashboard`} className="adm-linkbtn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Ico name="arrowLeft" size={14} />My applications</Link>
      {data.editable
        ? <Wizard key={`${data.application._id}-${data.application.formVersionNo}`} detail={data} slug={slug} reload={reload} user={user} />
        : <Tracker detail={data} slug={slug} reload={reload} user={user} />}
    </>
  );
}
