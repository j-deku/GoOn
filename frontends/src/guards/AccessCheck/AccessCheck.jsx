import React from 'react';
import NotFound from '../../admin/Pages/NotFound/NotFound';
import { useAdminAccess } from '../../hooks/useAdminAccess/useAdminAccess';
import AccessChecking from '../../user/Pages/AcccessChecking/AccessChecking';

const AccessCheck = ({ children }) => {
  const { checked, allowed } = useAdminAccess();

  if (!checked) {
    return <AccessChecking />;
  }

  if (!allowed) {
    return <NotFound />;
  }

  return children;
};

export default AccessCheck;