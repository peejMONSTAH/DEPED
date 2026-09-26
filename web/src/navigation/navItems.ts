import type { UserRole } from '../types';

/**
 * The one navigation list. The Sidebar and the Command Palette both read it,
 * so a destination has one name and is offered only to roles whose route
 * guard (App.tsx RequireAuth) admits them.
 */
export interface NavItem {
  label: string;
  icon: string;
  path: string;
  roles?: UserRole[];
  badge?: number;
}

export const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { label: 'Dashboard',         icon: 'dashboard',     path: '/admin/dashboard',    roles: ['SYSTEM_ADMIN', 'AO_II', 'HRMO'] },
      { label: 'Notifications',     icon: 'notifications', path: '/admin/notifications', roles: ['SYSTEM_ADMIN', 'AO_II', 'HRMO'] },
    ],
  },
  {
    label: 'Transactions & Validation',
    items: [
      { label: 'Transaction Queue',  icon: 'transactions', path: '/admin/transactions', roles: ['AO_II', 'HRMO'] },
      { label: 'Doc. Validation',    icon: 'validation',   path: '/admin/documents',    roles: ['AO_II'] },
      { label: 'HRMO Approvals',     icon: 'approvals',    path: '/admin/approvals',    roles: ['HRMO'] },
    ],
  },
  {
    label: 'HR & Digital 201',
    items: [
      { label: 'Personnel',          icon: 'personnel',    path: '/admin/personnel',    roles: ['AO_II', 'HRMO'] },
      { label: 'Plantilla Registry', icon: 'employment',   path: '/admin/plantilla',    roles: ['HRMO'] },
      { label: 'Credentials',        icon: 'credentials',  path: '/admin/credentials',  roles: ['SYSTEM_ADMIN', 'AO_II'] },
      { label: 'Compliance & YOS',   icon: 'compliance',   path: '/admin/compliance',   roles: ['HRMO'] },
      { label: 'Promotions',         icon: 'promotions',   path: '/admin/promotions',   roles: ['AO_II', 'HRMO'] },
    ],
  },
  {
    label: 'System Administration',
    items: [
      { label: 'Reports',            icon: 'reports',      path: '/admin/reports',      roles: ['SYSTEM_ADMIN'] },
      { label: 'Audit Trail',        icon: 'audit',        path: '/admin/audit',        roles: ['SYSTEM_ADMIN'] },
      { label: 'System Security',    icon: 'settings',     path: '/admin/settings',     roles: ['SYSTEM_ADMIN'] },
    ],
  },
  {
    label: 'Personnel Portal',
    items: [
      { label: 'Portal Home',       icon: 'home',            path: '/personnel/home',            roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'My 201 Files',       icon: 'document',        path: '/personnel/documents',       roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'My Transactions',   icon: 'transactions',    path: '/personnel/transactions',    roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'Notifications',     icon: 'notifications',   path: '/personnel/notifications',   roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'Service Record',    icon: 'repository',      path: '/personnel/service-record',     roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
      { label: 'Profile',           icon: 'profile',         path: '/personnel/profile',            roles: ['TEACHING_PERSONNEL', 'NON_TEACHING_PERSONNEL'] },
    ],
  },
];

export const navSectionsFor = (role: string | undefined) =>
  NAV_SECTIONS
    .map(section => ({ ...section, items: section.items.filter(item => !item.roles || (role ? item.roles.includes(role as UserRole) : false)) }))
    .filter(section => section.items.length > 0);
