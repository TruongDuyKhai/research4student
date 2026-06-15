import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, User, Calendar, BookOpen, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import client from '../api/client';
import Avatar from '../components/Avatar';
import './PublicProfilePage.css';

const PublicProfilePage = () => {
  const { t } = useTranslation();
  const { username } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const fetchPublicProfile = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const res = await client.get(`/users/${username}`);
        setProfile(res.data.data);
      } catch (err) {
        console.error('Failed to get public profile:', err);
        if (err.response?.status === 404) {
          setErrorMsg('User profile not found.');
        } else {
          setErrorMsg('An error occurred while loading this profile.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPublicProfile();
  }, [username]);

  if (loading) {
    return <div className="empty-state">{t('common.loading')}</div>;
  }

  if (errorMsg || !profile) {
    return (
      <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
        <span>{errorMsg || 'Failed to load profile.'}</span>
        <button className="btn-back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          <span>Go Back</span>
        </button>
      </div>
    );
  }

  const formattedDate = new Date(profile.created_at.replace(' ', 'T') + 'Z').toLocaleDateString();
  const isTeacher = profile.role === 'teacher';

  return (
    <div className="public-profile-container">
      
      {/* Back button */}
      <div>
        <button className="btn-back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={16} />
          <span>Go Back</span>
        </button>
      </div>

      {/* Main Profile Info Card */}
      <div className="public-profile-card">
        
        {/* Top Profile Header Block */}
        <div className="public-profile-header">
          <Avatar
            avatarUrl={profile.avatar_url}
            name={profile.display_name || profile.username}
            size={140}
            className="public-avatar"
          />

          <div className="public-user-meta">
            <div className="display-name-row">
              <h2 className="public-display-name">{profile.display_name}</h2>
              {profile.role === 'admin' && (
                <span className="admin-verified-badge" title="Administrator">
                  <ShieldCheck size={16} />
                  <span>Admin</span>
                </span>
              )}
            </div>
            
            <span className="public-username">@{profile.username}</span>

            {/* Meta details badges */}
            <div className="public-badges-row">
              <span className={`role-badge role-${profile.role}`}>
                <User size={12} style={{ marginRight: '4px' }} />
                {profile.role}
              </span>
              
              {isTeacher && profile.department && (
                <span className="dept-badge">
                  <BookOpen size={12} style={{ marginRight: '4px' }} />
                  {profile.department}
                </span>
              )}
            </div>

            <div className="joined-timestamp">
              <Calendar size={14} style={{ marginRight: '6px' }} />
              <span>Joined on {formattedDate}</span>
            </div>
          </div>
        </div>

        {/* Bio content block */}
        <div className="public-profile-body">
          <h4 className="body-section-title">About Me</h4>
          <p className="public-bio-text">
            {profile.bio || `Hello! I am a ${profile.role} at FPT University. Feel free to connect with me.`}
          </p>
        </div>

      </div>

    </div>
  );
};

export default PublicProfilePage;
