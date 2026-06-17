import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Layouts
import MainLayout from './layouts/MainLayout';
import AuthLayout from './layouts/AuthLayout';
import AdminLayout from './layouts/AdminLayout';

// Pages
import HomePage from './pages/HomePage';
import ResourcesPage from './pages/ResourcesPage';
import ResourceDetailPage from './pages/ResourceDetailPage';
import KnowledgePage from './pages/KnowledgePage';
import ArticleDetailPage from './pages/ArticleDetailPage';
import GuidesPage from './pages/GuidesPage';
import GuideDetailPage from './pages/GuideDetailPage';
import CommunityPage from './pages/CommunityPage';
import PostDetailPage from './pages/PostDetailPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import ProfilePage from './pages/ProfilePage';
import SearchPage from './pages/SearchPage';
import PublicProfilePage from './pages/PublicProfilePage';
import SetUsernamePage from './pages/SetUsernamePage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
// TeacherLoginPage removed — teacher login now unified in LoginPage
import TeacherChangePasswordPage from './pages/TeacherChangePasswordPage';
import AdminLoginPage from './pages/AdminLoginPage';

// Admin Subpages
import AdminHomePage from './pages/AdminHomePage';
import AdminTeachersPage from './pages/AdminTeachersPage';
import AdminApplicationsPage from './pages/AdminApplicationsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import AdminBanlistPage from './pages/AdminBanlistPage';
import AdminReportsPage from './pages/AdminReportsPage';

const adminRoute = import.meta.env.VITE_ADMIN_ROUTE || '/portal-mgmt-7f3a';
const cleanAdminRoute = adminRoute.startsWith('/') ? adminRoute.substring(1) : adminRoute;

// Inline Admin Wrapper: Renders AdminLoginPage if unauthenticated/non-admin, AdminLayout otherwise
const AdminRouteWrapper = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>
        <span>Loading console...</span>
      </div>
    );
  }

  if (!user || user.role !== 'admin') {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <AdminLoginPage />
        </div>
      </div>
    );
  }

  return <AdminLayout />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Main Layout containing pages with sidebar & topbar */}
          <Route path="/" element={<MainLayout />}>
            <Route index element={<HomePage />} />
            
            {/* Public and Resource Directory Routes */}
            <Route path="search" element={<SearchPage />} />
            <Route path="resources" element={<ResourcesPage />} />
            <Route path="resources/:id" element={<ResourceDetailPage />} />
            <Route path="knowledge" element={<KnowledgePage />} />
            <Route path="knowledge/articles/:id" element={<ArticleDetailPage />} />
            <Route path="guides" element={<GuidesPage />} />
            <Route path="guides/:id" element={<GuideDetailPage />} />
            
            {/* Community Routes (Require login for full feature usage) */}
            <Route path="community" element={<CommunityPage defaultTab="forum" />} />
            <Route path="community/posts/:id" element={<PostDetailPage />} />
            
            {/* Protected Collaborative Projects Area */}
            <Route 
              path="community/projects" 
              element={
                <ProtectedRoute roles={['student', 'teacher', 'admin']}>
                  <CommunityPage defaultTab="projects" />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="community/projects/:id" 
              element={
                <ProtectedRoute roles={['student', 'teacher', 'admin']}>
                  <ProjectDetailPage />
                </ProtectedRoute>
              } 
            />

            {/* Protected User Profile Settings */}
            <Route 
              path="profile" 
              element={
                <ProtectedRoute roles={['student', 'teacher', 'admin']}>
                  <ProfilePage />
                </ProtectedRoute>
              } 
            />
            <Route path="u/:username" element={<PublicProfilePage />} />
            
            <Route 
              path="set-username" 
              element={
                <ProtectedRoute roles={['student']}>
                  <SetUsernamePage />
                </ProtectedRoute>
              } 
            />
          </Route>

          {/* Admin Dashboard Protected Group Router */}
          <Route path={cleanAdminRoute} element={<AdminRouteWrapper />}>
            <Route index element={<AdminHomePage />} />
            <Route path="teachers" element={<AdminTeachersPage />} />
            <Route path="users" element={<AdminUsersPage />} />
            <Route path="banned-keywords" element={<AdminBanlistPage />} />
            <Route path="reports" element={<AdminReportsPage />} />
            <Route path="teacher-applications" element={<AdminApplicationsPage />} />
          </Route>

          {/* Standalone auth pages (self-contained layout) */}
          <Route path="login" element={<LoginPage />} />
          <Route path="register" element={<RegisterPage />} />
          {/* Legacy teacher-login redirect */}
          <Route path="teacher-login" element={<Navigate to="/login" replace />} />

          {/* Auth Layout for teacher password change */}
          <Route element={<AuthLayout />}>
            <Route
              path="teacher/change-password"
              element={
                <ProtectedRoute roles={['teacher']}>
                  <TeacherChangePasswordPage />
                </ProtectedRoute>
              }
            />
          </Route>

          {/* Fallback redirect to Home */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
