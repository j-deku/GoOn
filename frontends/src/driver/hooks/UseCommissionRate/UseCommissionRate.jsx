import { useState, useEffect } from 'react';
import axiosInstanceAdmin from '../../../../axiosInstanceAdmin';

export function UseCommissionRate() {
  const [rate, setRate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const resp = await axiosInstanceAdmin.get(`/api/admin/commission`);
        if (!isMounted) return;
        const { data } = resp;
        // ensure we have a number
        const parsed = parseFloat(data.rate);
        setRate(!isNaN(parsed) ? parsed : 0);
      } catch (err) {
        console.error('Failed to load commission rate:', err);
        if (isMounted) setRate(0);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  
  return loading ? null : rate;
}
