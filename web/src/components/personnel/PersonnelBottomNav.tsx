import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, FileText, ClipboardList, User, type LucideIcon } from 'lucide-react';
import './personnel-bottom-nav.css';

interface BottomNavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

const items: BottomNavItem[] = [
  { label: 'Home', path: '/personnel/home', icon: Home },
  { label: 'My 201 Files', path: '/personnel/documents', icon: FileText },
  { label: 'Transactions', path: '/personnel/transactions', icon: ClipboardList },
  { label: 'Profile', path: '/personnel/profile', icon: User },
];

export const PersonnelBottomNav: React.FC = () => {
  return (
    <nav className="personnel-bottom-nav" aria-label="Mobile Navigation">
      {items.map(item => {
        const IconComponent = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `personnel-bottom-nav-item ${isActive ? 'active' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <div className="personnel-bottom-nav-icon-wrap">
                  <IconComponent size={20} />
                </div>
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
};

export default PersonnelBottomNav;
