import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { GraduationCap, BookOpen, ChevronLeft, CheckCircle, Clock } from 'lucide-react';
import client from '../api/client';
import EmailPasswordForm from '../components/EmailPasswordForm';
import './AuthPage.css';

const RegisterPage = () => {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();

  // 'pick' | 'student' | 'teacher' | 'teacher-pending'
  const [mode, setMode] = useState('pick');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Teacher form state
  const [tDisplayName, setTDisplayName] = useState('');
  const [tEmail, setTEmail] = useState('');
  const [tEmployeeCode, setTEmployeeCode] = useState('');
  const [tDepartment, setTDepartment] = useState('');
  const [tPassword, setTPassword] = useState('');
  const [tConfirm, setTConfirm] = useState('');

  const handleModeChange = (next) => {
    setErrorMsg('');
    setMode(next);
  };

  const handleStudentRegister = async ({ email, password, display_name }) => {
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await client.post('/auth/student/register', { email, password, display_name });
      const { token, user } = res.data.data;
      login(token, user);
      navigate('/set-username');
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setErrorMsg(
        code === 'EMAIL_ALREADY_EXISTS' ? t('auth.errorEmailExists') :
        code === 'INVALID_EMAIL_DOMAIN' ? t('auth.gmailOnlyNote') :
        code === 'WEAK_PASSWORD' ? t('auth.errorWeakPassword') :
        err.response?.data?.error?.message || t('auth.errorGeneric')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleTeacherApply = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (tPassword !== tConfirm) {
      setErrorMsg(t('auth.errorPasswordMismatch'));
      return;
    }
    if (tPassword.length < 8) {
      setErrorMsg(t('auth.errorWeakPassword'));
      return;
    }

    setSubmitting(true);
    try {
      await client.post('/auth/teacher/apply', {
        email: tEmail.trim(),
        password: tPassword,
        display_name: tDisplayName.trim(),
        employee_code: tEmployeeCode.trim(),
        department: tDepartment.trim(),
      });
      setMode('teacher-pending');
    } catch (err) {
      const code = err.response?.data?.error?.code;
      setErrorMsg(
        code === 'EMAIL_ALREADY_EXISTS' ? t('auth.errorEmailExists') :
        code === 'APPLICATION_ALREADY_EXISTS' ? t('auth.errorAppExists') :
        err.response?.data?.error?.message || t('auth.errorGeneric')
      );
    } finally {
      setSubmitting(false);
    }
  };

  // ── Role Picker ──────────────────────────────────────────────
  if (mode === 'pick') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <GraduationCap className="auth-logo" />
            <h2 className="auth-title">Research 4 Student</h2>
            <p className="auth-subtitle">{t('auth.registerSelectRole')}</p>
          </div>

          <div className="role-picker">
            <button className="role-card" onClick={() => handleModeChange('student')}>
              <BookOpen size={32} className="role-card-icon" />
              <span className="role-card-label">{t('auth.roleStudent')}</span>
              <span className="role-card-desc">{t('auth.roleStudentRegDesc')}</span>
            </button>
            <button className="role-card" onClick={() => handleModeChange('teacher')}>
              <GraduationCap size={32} className="role-card-icon" />
              <span className="role-card-label">{t('auth.roleTeacher')}</span>
              <span className="role-card-desc">{t('auth.roleTeacherRegDesc')}</span>
            </button>
          </div>

          <p className="auth-footer-link">
            {t('auth.haveAccountShort')}{' '}
            <NavLink to="/login">{t('auth.loginBtn')}</NavLink>
          </p>
        </div>
      </div>
    );
  }

  // ── Student Register ─────────────────────────────────────────
  if (mode === 'student') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <button className="auth-back-btn" onClick={() => handleModeChange('pick')}>
            <ChevronLeft size={16} /> {t('auth.back')}
          </button>

          <div className="auth-header">
            <BookOpen className="auth-logo" />
            <h2 className="auth-title">{t('auth.studentRegisterTitle')}</h2>
            <p className="auth-subtitle">{t('auth.studentRegisterSubtitle')}</p>
          </div>

          {errorMsg && <div className="auth-error">{errorMsg}</div>}

          <EmailPasswordForm
            mode="register"
            submitLabel={t('auth.register')}
            onSubmit={handleStudentRegister}
            submitting={submitting}
          />

          <p className="auth-footer-link">
            {t('auth.haveAccountShort')}{' '}
            <NavLink to="/login">{t('auth.loginBtn')}</NavLink>
          </p>
        </div>
      </div>
    );
  }

  // ── Teacher Pending ──────────────────────────────────────────
  if (mode === 'teacher-pending') {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-header">
            <Clock size={48} className="auth-logo" style={{ color: 'var(--color-warning, #f59e0b)' }} />
            <h2 className="auth-title">{t('auth.pendingTitle')}</h2>
            <p className="auth-subtitle">{t('auth.pendingSubtitle')}</p>
          </div>

          <div className="pending-info-box">
            <CheckCircle size={18} style={{ color: 'var(--color-success, #16a34a)', flexShrink: 0 }} />
            <p>{t('auth.pendingDesc')}</p>
          </div>

          <NavLink to="/" className="submit-btn" style={{ textDecoration: 'none', justifyContent: 'center' }}>
            {t('auth.backToHome')}
          </NavLink>
        </div>
      </div>
    );
  }

  // ── Teacher Apply Form ───────────────────────────────────────
  return (
    <div className="auth-page">
      <div className="auth-card">
        <button className="auth-back-btn" onClick={() => handleModeChange('pick')}>
          <ChevronLeft size={16} /> {t('auth.back')}
        </button>

        <div className="auth-header">
          <GraduationCap className="auth-logo" />
          <h2 className="auth-title">{t('auth.teacherRegisterTitle')}</h2>
          <p className="auth-subtitle">{t('auth.teacherRegisterSubtitle')}</p>
        </div>

        {errorMsg && <div className="auth-error">{errorMsg}</div>}

        <form onSubmit={handleTeacherApply} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div className="form-group">
            <label className="form-label">{t('auth.displayName')} *</label>
            <input type="text" className="form-input" placeholder="Nguyễn Văn A"
              value={tDisplayName} onChange={e => setTDisplayName(e.target.value)}
              required disabled={submitting} />
          </div>

          <div className="form-group">
            <label className="form-label">{t('auth.email')} *</label>
            <input type="email" className="form-input" placeholder="teacher@fpt.edu.vn"
              value={tEmail} onChange={e => setTEmail(e.target.value)}
              required disabled={submitting} />
          </div>

          <div className="auth-form-row">
            <div className="form-group">
              <label className="form-label">{t('auth.employeeCode')} *</label>
              <input type="text" className="form-input" placeholder="FE12345"
                value={tEmployeeCode} onChange={e => setTEmployeeCode(e.target.value)}
                required disabled={submitting} />
            </div>
            <div className="form-group">
              <label className="form-label">{t('auth.department')} *</label>
              <input type="text" className="form-input" placeholder="Software Engineering"
                value={tDepartment} onChange={e => setTDepartment(e.target.value)}
                required disabled={submitting} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('auth.password')} *</label>
            <input type="password" className="form-input" placeholder="••••••••"
              value={tPassword} onChange={e => setTPassword(e.target.value)}
              required disabled={submitting} />
          </div>
          <div className="form-group">
            <label className="form-label">{t('auth.confirmPassword')} *</label>
            <input type="password" className="form-input" placeholder="••••••••"
              value={tConfirm} onChange={e => setTConfirm(e.target.value)}
              required disabled={submitting} />
          </div>

          <div className="teacher-apply-note">
            <Clock size={14} />
            {t('auth.teacherApplyNote')}
          </div>

          <button type="submit" className="submit-btn" disabled={submitting}>
            {submitting ? t('auth.submitting') : t('auth.submitApplication')}
          </button>
        </form>

        <p className="auth-footer-link">
          {t('auth.haveAccountShort')}{' '}
          <NavLink to="/login">{t('auth.loginBtn')}</NavLink>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
