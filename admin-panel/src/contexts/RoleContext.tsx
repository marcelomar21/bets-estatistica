'use client';

import { createContext, useContext } from 'react';

type Role = 'super_admin' | 'group_admin';

const RoleContext = createContext<Role | undefined>(undefined);

export function RoleProvider({
  role,
  children,
}: {
  role?: Role;
  children: React.ReactNode;
}) {
  return (
    <RoleContext.Provider value={role}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): Role | undefined {
  return useContext(RoleContext);
}
