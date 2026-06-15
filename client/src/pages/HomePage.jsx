import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { 
  BookOpen, 
  FileText, 
  ThumbsUp, 
  MessageSquare, 
  Globe, 
  Users, 
  ArrowRight,
  ExternalLink
} from 'lucide-react';
import client from '../api/client';
import Avatar from '../components/Avatar';
import './HomePage.css';

const HomePage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [resources, setResources] = useState([]);
  const [posts, setPosts] = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);

  // Fetch Recommended Websites and Community Posts on load
  useEffect(() => {
    const fetchResources = async () => {
      try {
        const res = await client.get('/resources?limit=4');
        setResources(res.data.data || []);
      } catch (err) {
        console.error('Failed to fetch recommended websites:', err.message);
      } finally {
        setLoadingResources(false);
      }
    };

    const fetchPosts = async () => {
      try {
        const res = await client.get('/community/posts?limit=5');
        setPosts(res.data.data || []);
      } catch (err) {
        console.error('Failed to fetch community posts:', err.message);
      } finally {
        setLoadingPosts(false);
      }
    };

    fetchResources();
    fetchPosts();
  }, []);

  return (
    <div className="home-container">
      <div className="home-grid">
        {/* Main Left Column */}
        <div className="home-main">
          
          {/* Hero Banner Section */}
          <section className="hero-banner">
            <h2 className="hero-title">Research 4 Student</h2>
            <p className="hero-subtitle">{t('home.heroSubtitle')}</p>
            <div className="hero-cta">
              <button 
                className="btn-cta-primary" 
                onClick={() => navigate('/resources')}
              >
                {t('home.exploreResources')}
              </button>
              <button 
                className="btn-cta-secondary" 
                onClick={() => navigate('/community')}
              >
                {t('home.joinCommunity')}
              </button>
            </div>
          </section>

          {/* Recommended Websites Section */}
          <section className="resources-section">
            <div className="section-header">
              <h3 className="section-title">{t('home.recommendedWebsites')}</h3>
              <button 
                className="section-link" 
                onClick={() => navigate('/resources')}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                {t('home.viewAll')} &rarr;
              </button>
            </div>

            {loadingResources ? (
              <div className="empty-state">{t('common.loading')}</div>
            ) : resources.length === 0 ? (
              <div className="empty-state">
                {t('home.emptyWebsites')}
              </div>
            ) : (
              <div className="resources-grid">
                {resources.map((resItem) => (
                  <div key={resItem.id} className="resource-card">
                    <div className="resource-card-header">
                      <div className="resource-meta">
                        <span className="resource-name">{resItem.name}</span>
                        <span className={`resource-badge badge-${resItem.access_type}`}>
                          {resItem.access_type}
                        </span>
                      </div>
                      <Globe className="logo-icon" style={{ color: 'var(--color-primary-hover)' }} />
                    </div>
                    <p className="resource-desc">{resItem.short_description}</p>
                    <button 
                      className="btn-visit"
                      onClick={() => navigate(`/resources/${resItem.id}`)}
                    >
                      {t('home.visit')}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Research Basics & Outline Guides Large Cards Section */}
          <section className="quick-links-grid">
            {/* Research Basics Card */}
            <div className="quick-card">
              <BookOpen className="quick-card-icon" />
              <h4 className="quick-card-title">{t('home.researchBasics')}</h4>
              <p className="quick-card-desc">{t('home.researchBasicsDesc')}</p>
              <button 
                className="btn-browse"
                onClick={() => navigate('/knowledge')}
              >
                {t('home.browse')}
              </button>
            </div>

            {/* Outline Guides Card */}
            <div className="quick-card">
              <FileText className="quick-card-icon" />
              <h4 className="quick-card-title">{t('home.outlineGuides')}</h4>
              <p className="quick-card-desc">{t('home.outlineGuidesDesc')}</p>
              <button 
                className="btn-browse"
                onClick={() => navigate('/guides')}
              >
                {t('home.browse')}
              </button>
            </div>
          </section>

        </div>

        {/* Sidebar Right Column (Hidden on <1024px) */}
        <aside className="home-sidebar">
          
          {/* Community Forum Posts Widget */}
          <div className="widget-card">
            <h3 className="widget-title">{t('home.communityForum')}</h3>
            <div className="widget-divider"></div>

            {loadingPosts ? (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', padding: '8px' }}>
                {t('common.loading')}
              </div>
            ) : posts.length === 0 ? (
              <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', padding: '8px', textAlign: 'center' }}>
                No active discussions yet.
              </div>
            ) : (
              <div className="sidebar-post-list">
                {posts.map((post) => (
                  <div 
                    key={post.id} 
                    className="sidebar-post-item"
                    onClick={() => navigate(`/community/posts/${post.id}`)}
                  >
                    <div className="post-item-header">
                      <Avatar
                        avatarUrl={post.author?.avatar_url}
                        name={post.author?.display_name || post.author?.username}
                        size={24}
                        className="post-item-avatar"
                      />
                      <span className="post-item-author">
                        {post.author?.display_name || post.author?.username || 'User'}
                      </span>
                    </div>
                    <p className="post-item-snippet">
                      {post.content.length > 80 
                        ? `${post.content.substring(0, 80)}...` 
                        : post.content}
                    </p>
                    <div className="post-item-meta">
                      <div className="meta-group">
                        <ThumbsUp size={12} />
                        <span>{post.reactionCount || 0}</span>
                      </div>
                      <div className="meta-group">
                        <MessageSquare size={12} />
                        <span>{post.commentCount || 0}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* If user is not authenticated, show Sign In CTA Box */}
            {!user && (
              <div className="promo-box">
                <span className="promo-text">
                  {t('home.signInToJoin')}
                </span>
                <button 
                  className="btn-promo-login"
                  onClick={() => navigate('/login')}
                >
                  Sign In
                </button>
              </div>
            )}

            <button 
              className="btn-sidebar-action"
              onClick={() => navigate('/community')}
              style={{ marginTop: '8px' }}
            >
              {t('home.goToCommunity')}
            </button>
          </div>

        </aside>
      </div>
    </div>
  );
};

export default HomePage;
