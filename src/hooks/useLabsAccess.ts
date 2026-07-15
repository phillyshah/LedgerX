import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

export interface LabsHousehold {
  id: string;
  name: string;
  flags: Record<string, boolean>;
}

/**
 * Which households the current user belongs to have opted into which
 * `labs_*` experiment flags (households.features_enabled). Contractors are
 * always excluded — Labs experiments are member/admin tools. Full admins
 * bypass per-household flags entirely, same as everywhere else in this app.
 */
export function useLabsAccess() {
  const { user, isAdmin, isContractor } = useAuth();
  const [households, setHouseholds] = useState<LabsHousehold[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || isContractor) {
      setHouseholds([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from('household_members')
      .select('household_id, households(id, name, features_enabled)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (cancelled) return;
        const hh = (data || [])
          .map((row) => row.households)
          .filter(Boolean) as unknown as { id: string; name: string; features_enabled: Record<string, boolean> | null }[];
        setHouseholds(hh.map((h) => ({ id: h.id, name: h.name, flags: h.features_enabled ?? {} })));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, isContractor]);

  const labsHouseholds = households.filter((h) =>
    Object.entries(h.flags).some(([key, on]) => key.startsWith('labs_') && on)
  );

  const hasFlag = (key: string) => isAdmin || households.some((h) => h.flags[key] === true);

  return {
    loading,
    households,
    labsHouseholds,
    hasAnyLabsFlag: isAdmin || labsHouseholds.length > 0,
    hasFlag,
  };
}
