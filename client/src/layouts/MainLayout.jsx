import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../contexts/ThemeContext';
import { 
  Home, 
  Globe, 
  BookOpen, 
  FileText, 
  Users, 
  Sun, 
  Moon, 
  User, 
  LogOut, 
  ChevronDown, 
  GraduationCap,
  Shield,
  Menu
} from 'lucide-react';
import Avatar from '../components/Avatar';
import './MainLayout.css';

const MainLayout = () => {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const navigate = useRef(useNavigate()); // Avoid unused variable warnings if not used, or use it for custom nav
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const dropdownRef = useRef(null);

  // Sync user info from localStorage
  useEffect(() => {
    const checkUser = () => {
      const token = localStorage.getItem('r4s_token');
      const storedUser = localStorage.getItem('r4s_user');
      if (token && storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          setUser(null);
        }
      } else {
        setUser(null);
      }
    };

    checkUser();
    // Listen to storage changes to dynamically sync login state across windows
    window.addEventListener('storage', checkUser);
    return () => window.removeEventListener('storage', checkUser);
  }, []);

  // Close dropdown on clicking outside
  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Handle language change
  const handleLangChange = (e) => {
    const lang = e.target.value;
    i18n.changeLanguage(lang);
    localStorage.setItem('r4s_lang', lang);
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('r4s_token');
    localStorage.removeItem('r4s_user');
    setUser(null);
    setDropdownOpen(false);
    // Redirect to login page
    window.location.href = '/login';
  };

  // Get current page title dynamically from route location
  const getPageTitle = () => {
    const path = location.pathname;
    if (path === '/') return t('nav.home');
    if (path.startsWith('/resources')) return t('nav.resources');
    if (path.startsWith('/knowledge')) return t('nav.knowledge');
    if (path.startsWith('/guides')) return t('nav.guides');
    if (path.startsWith('/community')) return t('nav.community');
    if (path.startsWith('/profile') || path.startsWith('/u/')) return t('nav.profile');
    if (path.startsWith('/set-username')) return t('nav.profile');
    if (path.startsWith('/portal-mgmt')) return t('nav.admin');
    return 'Research 4 Student';
  };

  return (
    <div className="layout-container">
      {/* Fixed Sidebar */}
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <aside className={`sidebar ${sidebarOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand-section">
          <div className="sidebar-header">
            <GraduationCap className="logo-icon" />
            <span className="logo-text">Research 4 Student</span>
          </div>

          {/* Navigation Links */}
          <nav className="sidebar-menu">
            <NavLink to="/" className="menu-link" onClick={() => setSidebarOpen(false)} end>
              <Home className="menu-icon" />
              <span>{t('nav.home')}</span>
            </NavLink>
            <NavLink to="/resources" className="menu-link" onClick={() => setSidebarOpen(false)}>
              <Globe className="menu-icon" />
              <span>{t('nav.resources')}</span>
            </NavLink>
            <NavLink to="/knowledge" className="menu-link" onClick={() => setSidebarOpen(false)}>
              <BookOpen className="menu-icon" />
              <span>{t('nav.knowledge')}</span>
            </NavLink>
            <NavLink to="/guides" className="menu-link" onClick={() => setSidebarOpen(false)}>
              <FileText className="menu-icon" />
              <span>{t('nav.guides')}</span>
            </NavLink>
            <NavLink to="/community" className="menu-link" onClick={() => setSidebarOpen(false)}>
              <Users className="menu-icon" />
              <span>{t('nav.community')}</span>
            </NavLink>
            
            {/* Admin link displayed to admin user */}
            {user && user.role === 'admin' && (
              <NavLink to={import.meta.env.VITE_ADMIN_ROUTE || '/portal-mgmt-7f3a'} className="menu-link" onClick={() => setSidebarOpen(false)}>
                <Shield className="menu-icon" />
                <span>{t('nav.admin')}</span>
              </NavLink>
            )}
          </nav>
        </div>

        {/* Footer controls: language select + theme toggle */}
        <div className="sidebar-footer">
          <div className="controls-row">
            <select 
              className="lang-select" 
              value={i18n.language} 
              onChange={handleLangChange}
            >
              <option value="en">English (EN)</option>
              <option value="vi">Tiếng Việt (VI)</option>
            </select>

            <button 
              className="theme-toggle-btn" 
              onClick={toggleTheme}
              title="Toggle theme"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main layout contents (right of sidebar) */}
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {/* Topbar */}
        <header className="topbar">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(o => !o)} aria-label="Toggle menu">
            <Menu size={24} />
          </button>
          <h1 className="page-title">{getPageTitle()}</h1>
          
          <div className="topbar-right">
            {user ? (
              /* Logged In Widget */
              <div className="user-widget" ref={dropdownRef}>
                <button 
                  className="avatar-btn" 
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                >
                  <Avatar
                    avatarUrl={user.avatar_url}
                    name={user.display_name || user.username}
                    size={32}
                  />
                  <span className="username-text">
                    {user.display_name || user.username || 'User'}
                  </span>
                  <ChevronDown size={16} />
                </button>

                {/* Dropdown Options */}
                {dropdownOpen && (
                  <div className="user-dropdown">
                    <NavLink 
                      to="/profile" 
                      className="dropdown-item"
                      onClick={() => setDropdownOpen(false)}
                    >
                      <User size={16} />
                      <span>{t('nav.profile')}</span>
                    </NavLink>
                    <div className="dropdown-divider"></div>
                    <button 
                      className="dropdown-item" 
                      onClick={handleLogout}
                      style={{ color: 'var(--color-danger)' }}
                    >
                      <LogOut size={16} />
                      <span>{t('auth.logout')}</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Unauthenticated Actions */
              <div className="auth-actions">
                <NavLink to="/login" className="btn-primary">
                  {t('auth.loginBtn')}
                </NavLink>
                <NavLink to="/register" className="btn-register">
                  {t('auth.registerBtn')}
                </NavLink>
              </div>
            )}
          </div>
        </header>

        {/* Dynamic Route Content */}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default MainLayout;
