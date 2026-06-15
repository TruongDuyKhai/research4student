import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { Camera, Lock, Eye, CheckCircle2, AlertCircle, User, Key, Settings, Globe, Palette } from 'lucide-react';
import client from '../api/client';
import './ProfilePage.css';
import Avatar from '../components/Avatar';
import ImageCropperModal from '../components/ImageCropperModal';

const ProfilePage = () => {
  const { t, i18n } = useTranslation();
  const { user, updateUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  // Profile fields state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [languagePref, setLanguagePref] = useState('en');
  const [themePref, setThemePref] = useState('light');

  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [cropperImageSrc, setCropperImageSrc] = useState(null);

  // 1. Redirect admin away from /profile
  useEffect(() => {
    if (user && user.role === 'admin') {
      navigate('/');
    }
  }, [user, navigate]);

  // 2. Initialize state with user profile values
  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '');
      setBio(user.bio || '');
      setLanguagePref(user.language_pref || 'en');
      setThemePref(user.theme_pref || 'light');
    }
  }, [user]);

  if (!user || user.role === 'admin') return null;

  // Handle immediate avatar selection and open cropper modal
  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Only image files are allowed.');
      return;
    }

    setCropperImageSrc(URL.createObjectURL(file));
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload cropped image
  const handleCroppedAvatarUpload = async (blob) => {
    const formData = new FormData();
    formData.append('file', blob, 'avatar.jpg');
    formData.append('purpose', 'avatar');

    setUploadingAvatar(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await client.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      updateUser({ ...user, avatar_file_id: res.data.data.avatar_file_id, avatar_url: res.data.data.avatar_url });
      setSuccessMsg('Avatar updated successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      setErrorMsg('Failed to upload avatar. Max size is 10MB.');
    } finally {
      setUploadingAvatar(false);
      if (cropperImageSrc) {
        URL.revokeObjectURL(cropperImageSrc);
        setCropperImageSrc(null);
      }
    }
  };

  const triggerAvatarSelect = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Submit profile edits (display_name, bio)
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const payload = {};
      if (user.role === 'student') {
        payload.display_name = displayName.trim();
        payload.bio = bio.trim();
      }

      const res = await client.patch('/users/me', payload);
      updateUser(res.data.data);
      setSuccessMsg('Profile updated successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setErrorMsg(err.response?.data?.error?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  // Handle Preference Dropdowns
  const handleLanguageChange = async (e) => {
    const val = e.target.value;
    setLanguagePref(val);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await client.patch('/users/me', { language_pref: val });
      updateUser(res.data.data);
      
      // Sync React-i18next language
      i18n.changeLanguage(val);
      setSuccessMsg('Language preference updated!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Failed to save language pref:', err);
      setErrorMsg('Failed to save language preference.');
    }
  };

  const handleThemeChange = async (e) => {
    const val = e.target.value;
    setThemePref(val);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await client.patch('/users/me', { theme_pref: val });
      updateUser(res.data.data);
      
      // Sync ThemeContext theme
      setTheme(val);
      setSuccessMsg('Theme preference updated!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      console.error('Failed to save theme pref:', err);
      setErrorMsg('Failed to save theme preference.');
    }
  };

  const isStudent = user.role === 'student';

  return (
    <div className="profile-container">
      
      {/* Messages */}
      {successMsg && (
        <div className="profile-success-alert">
          <CheckCircle2 size={16} />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="profile-error-alert">
          <AlertCircle size={16} />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="profile-layout-grid">
        
        {/* Left Side: Avatar Panel */}
        <div className="avatar-card-panel">
          <div className="avatar-preview-container">
            <Avatar
              avatarUrl={user.avatar_url}
              name={user.display_name || user.username}
              size={140}
              className="profile-large-avatar"
            />
            
            {/* Upload Hover Overlay */}
            <div className="avatar-upload-overlay" onClick={triggerAvatarSelect}>
              <Camera size={24} />
              <span>{uploadingAvatar ? 'Uploading...' : 'Change Avatar'}</span>
            </div>
            
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*"
              onChange={handleAvatarChange}
              disabled={uploadingAvatar}
            />
          </div>

          <h3 className="profile-panel-display-name">{user.display_name}</h3>
          <span className="profile-panel-username">@{user.username}</span>

          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <div className="profile-badge-row">
              <span className={`profile-role-badge role-${user.role}`}>
                <User size={12} style={{ marginRight: '4px' }} />
                {user.role.toUpperCase()}
              </span>
            </div>
            
            <button 
              className="btn-view-public-profile"
              onClick={() => navigate(`/u/${user.username}`)}
            >
              <Eye size={14} />
              <span>View Public Profile</span>
            </button>
          </div>
        </div>

        {/* Right Side: Fields Forms */}
        <div className="settings-fields-card">
          <h3 className="settings-title">
            <Settings size={18} />
            <span>Profile Settings</span>
          </h3>

          <form onSubmit={handleProfileSubmit} className="profile-settings-form">
            
            {/* Display Name */}
            <div className="form-group">
              <label className="form-label">
                <span>Display Name</span>
                {!isStudent && <span className="locked-label"><Lock size={10} /> Locked by Admin</span>}
              </label>
              <input 
                type="text" 
                className="form-input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                disabled={saving || !isStudent}
              />
              {!isStudent && (
                <span className="input-caption">Teachers' display names can only be modified by system administrators.</span>
              )}
            </div>

            {/* Locked Teacher specific fields */}
            {!isStudent && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Employee Code</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={user.employee_code || ''} 
                    disabled 
                  />
                  <span className="input-caption">Set by admin</span>
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={user.department || ''} 
                    disabled 
                  />
                  <span className="input-caption">Set by admin</span>
                </div>
              </div>
            )}

            {/* Bio descriptions for Students */}
            {isStudent && (
              <div className="form-group">
                <label className="form-label">Bio / Objectives</label>
                <textarea 
                  className="form-input"
                  rows={4}
                  placeholder="Share details about your academic interests, research goals, or outlines..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  disabled={saving}
                />
              </div>
            )}

            {/* Save Button for profile fields */}
            {isStudent && (
              <button 
                type="submit" 
                className="btn-save-profile"
                disabled={saving || displayName.trim() === ''}
              >
                {saving ? 'Saving...' : 'Save Profile Details'}
              </button>
            )}

            {/* Password section for teachers */}
            {!isStudent && (
              <div className="teacher-password-block">
                <h4 className="settings-subtitle">Account Credentials</h4>
                <p className="settings-desc">To secure your academic account, change your password regularly.</p>
                <button 
                  type="button" 
                  className="btn-change-password"
                  onClick={() => navigate('/teacher/change-password')}
                >
                  <Key size={14} />
                  <span>Change Password</span>
                </button>
              </div>
            )}

            <hr className="divider-line" />

            {/* Preferences Section */}
            <h4 className="settings-subtitle">System Preferences</h4>
            
            <div className="form-row">
              {/* Language Preference */}
              <div className="form-group">
                <label className="form-label">
                  <Globe size={14} style={{ marginRight: '4px' }} />
                  <span>Language Preference</span>
                </label>
                <select 
                  className="form-input"
                  value={languagePref}
                  onChange={handleLanguageChange}
                >
                  <option value="en">English</option>
                  <option value="vi">Tiếng Việt</option>
                </select>
              </div>

              {/* Theme Preference */}
              <div className="form-group">
                <label className="form-label">
                  <Palette size={14} style={{ marginRight: '4px' }} />
                  <span>Theme Mode</span>
                </label>
                <select 
                  className="form-input"
                  value={themePref}
                  onChange={handleThemeChange}
                >
                  <option value="light">Light Mode</option>
                  <option value="dark">Dark Mode</option>
                  <option value="system">Follow System Settings</option>
                </select>
              </div>
            </div>

          </form>
        </div>

      </div>

      {cropperImageSrc && (
        <ImageCropperModal
          imageSrc={cropperImageSrc}
          onCancel={() => {
            URL.revokeObjectURL(cropperImageSrc);
            setCropperImageSrc(null);
          }}
          onCropDone={handleCroppedAvatarUpload}
        />
      )}
    </div>
  );
};

export default ProfilePage;
