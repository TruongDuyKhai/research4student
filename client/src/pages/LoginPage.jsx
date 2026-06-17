import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useFeatures } from '../contexts/FeaturesContext';
import { GraduationCap, BookOpen, ChevronLeft } from 'lucide-react';
import client from '../api/client';
import EmailPasswordForm from '../components/EmailPasswordForm';
import './AuthPage.css';

const LoginPage = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const { features } = useFeatures();
  const navigate = useNavigate();
  const googleButtonRef = useRef(null);

  // 'pick' | 'student' | 'teacher'
  const [mode, setMode] = useState('pick');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCredentialResponse = async (response) => {
    try {
      setErrorMsg('');
      const res = await client.post('/auth/google', { credential: response.credential });
      const { token, user, needsUsername } = res.data.data;
      login(token, user);
      navigate(needsUsername ? '/set-username' : '/');
    } catch (err) {
      const errMsg = err.response?.data?.error?.message || 'Failed to authenticate with Google.';
      setErrorMsg(errMsg);
    }
  };

  const handleStudentLogin = async ({ email, password }) => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await client.post('/auth/student/login', { email, password });
      const { token, user, needsUsername } = res.data.data;
      login(token, user);
      navigate(needsUsername ? '/set-username' : '/');
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setErrorMsg(
        code === 'INVALID_CREDENTIALS' ? t('auth.errorInvalidCredentials') :
        code === 'ACCOUNT_BANNED' ? t('auth.errorBanned') :
        err.response?.data?.error?.message || t('auth.errorGeneric')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleTeacherLogin = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = form.email.value;
    const password = form.password.value;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await client.post('/auth/teacher/login', { email, password });
      const { token, user, mustChangePassword } = res.data.data;
      login(token, user);
      navigate(mustChangePassword ? '/teacher/change-password' : '/');
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || t('auth.errorInvalidCredentials'));
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (mode !== 'student') return;
    if (!features.googleAuth || !import.meta.env.VITE_GOOGLE_CLIENT_ID) return;

    const init = () => {
      if (window.google?.accounts) {
        window.google.accounts.id.initialize({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
          callback: handleCredentialResponse,
        });
        if (googleButtonRef.current) {
          window.google.accounts.id.renderButton(googleButtonRef.current, {
            theme: 'outline', size: 'large', text: 'signin_with',
          });
        }
      } else {
        setTimeout(init, 100);
      }
    };
    init();
  }, [mode, features.googleAuth]);

  const handleModeChange = (next) => {
    setErrorMsg('');
    setMode(next);
  };

  // ── Role Picker ──────────────────────────────────────────────
  if (mode === 'pick') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <GraduationCap className="auth-logo" />
            <h2 className="auth-title">Research 4 Student</h2>
            <p className="auth-subtitle">{t('auth.loginSelectRole')}</p>
          </div>

          <div className="role-picker">
            <button className="role-card" onClick={() => handleModeChange('student')}>
              <BookOpen size={32} className="role-card-icon" />
              <span className="role-card-label">{t('auth.roleStudent')}</span>
              <span className="role-card-desc">{t('auth.roleStudentDesc')}</span>
            </button>
            <button className="role-card" onClick={() => handleModeChange('teacher')}>
              <GraduationCap size={32} className="role-card-icon" />
              <span className="role-card-label">{t('auth.roleTeacher')}</span>
              <span className="role-card-desc">{t('auth.roleTeacherDesc')}</span>
            </button>
          </div>

          <p className="auth-footer-link">
            {t('auth.noAccountShort')}{' '}
            <NavLink to="/register">{t('auth.registerBtn')}</NavLink>
          </p>
        </div>
      </div>
    );
  }

  // ── Student Login ────────────────────────────────────────────
  if (mode === 'student') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <button className="auth-back-btn" onClick={() => handleModeChange('pick')}>
            <ChevronLeft size={16} /> {t('auth.back')}
          </button>

          <div className="auth-header">
            <BookOpen className="auth-logo" />
            <h2 className="auth-title">{t('auth.studentLoginTitle')}</h2>
            <p className="auth-subtitle">{t('auth.studentLoginSubtitle')}</p>
          </div>

          {errorMsg && <div className="auth-error">{errorMsg}</div>}

          {features.googleAuth && import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <div ref={googleButtonRef} />
              </div>
              <div className="auth-divider">
                <span>{t('auth.orDivider')}</span>
              </div>
            </>
          )}

          <EmailPasswordForm
            mode="login"
            submitLabel={t('auth.loginWithEmail')}
            onSubmit={handleStudentLogin}
            submitting={submitting}
          />

          <p className="auth-footer-link">
            {t('auth.noAccountShort')}{' '}
            <NavLink to="/register">{t('auth.registerBtn')}</NavLink>
          </p>
        </div>
      </div>
    );
  }

  // ── Teacher Login ────────────────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="auth-back-btn" onClick={() => handleModeChange('pick')}>
          <ChevronLeft size={16} /> {t('auth.back')}
        </button>

        <div className="auth-header">
          <GraduationCap className="auth-logo" />
          <h2 className="auth-title">{t('auth.teacherLoginTitle')}</h2>
          <p className="auth-subtitle">{t('auth.teacherLoginSubtitle')}</p>
        </div>

        {errorMsg && <div className="auth-error">{errorMsg}</div>}

        <form onSubmit={handleTeacherLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">{t('auth.email')}</label>
            <input name="email" type="email" className="form-input"
              placeholder="teacher@fpt.edu.vn" required disabled={submitting} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('auth.password')}</label>
            <input name="password" type="password" className="form-input"
              placeholder="••••••••" required disabled={submitting} />
          </div>
          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? t('auth.signingIn') : t('auth.loginBtn')}
          </button>
        </form>

        <p className="auth-footer-link">
          {t('auth.noAccountShort')}{' '}
          <NavLink to="/register">{t('auth.registerBtn')}</NavLink>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
