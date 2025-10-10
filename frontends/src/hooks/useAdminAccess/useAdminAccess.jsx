// src/admin/hooks/useAdminAccess.js
import { useState, useEffect } from 'react';
import { checkIPAllowlist } from '../../admin/utils/checkIPAllowlist';

export const useAdminAccess = () => {
  const [access, setAccess] = useState(() => {
    try {
      const cached = sessionStorage.getItem('adminAccess');
      return cached ? JSON.parse(cached) : { checked: false, allowed: false };
    } catch {
      return { checked: false, allowed: false };
    }
  });

  useEffect(() => {
    if (access.checked) {
      return;
    }

    checkIPAllowlist().then((allowed) => {
      setAccess({ checked: true, allowed });
    });
  }, [access.checked]);

  return { ...access };
};