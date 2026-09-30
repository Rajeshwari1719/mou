import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Briefcase,
  BookOpen,
  FileCheck,
  BarChart3,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const menuItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/', roles: ['admin', 'viewer'] },
  { icon: FileText, label: 'MOUs', path: '/mous', roles: ['admin', 'viewer'] },
  { icon: Briefcase, label: 'Interns', path: '/interns', roles: ['admin', 'viewer'] },
  { icon: BookOpen, label: 'Projects', path: '/projects', roles: ['admin', 'viewer'] },
  { icon: FileCheck, label: 'Documents', path: '/documents', roles: ['admin', 'viewer'] },
  { icon: BarChart3, label: 'Reports & Notifications', path: '/reports', roles: ['admin', 'viewer'] },
  { icon: ShieldCheck, label: 'Audit Logs', path: '/audit-logs', roles: ['admin'] },
];

export const Sidebar = ({ isOpen, onClose }) => {
  const { hasAnyRole } = useAuth();
  const location = useLocation();

  const visibleItems = menuItems.filter((item) =>
    hasAnyRole(item.roles)
  );

  return (
    <>
      <aside
        className={`fixed left-0 top-16 h-[calc(100vh-64px)] w-64 bg-white border-r border-gray-200 overflow-y-auto transform transition-transform lg:translate-x-0 z-40 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 lg:hidden flex justify-end">
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={20} />
          </button>
        </div>

        <nav className="p-4 space-y-2">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-2 rounded-lg transition ${
                  isActive
                    ? 'bg-blue-100 text-blue-600 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon size={20} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

      </aside>
    </>
  );
};

export default Sidebar;
