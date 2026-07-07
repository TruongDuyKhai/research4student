import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import {
  BookOpen,
  FileText,
  ThumbsUp,
  MessageSquare,
  Globe,
  Search,
  TrendingUp
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

  // Search bar state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searched yet, object = searched
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchFormRef = useRef(null);
  const searchDebounceRef = useRef(null);

  // Server-side trending searches
  const [topSearches, setTopSearches] = useState([]);

  useEffect(() => {
    client.get('/search/trending')
      .then(res => setTopSearches(res.data.data || []))
      .catch(() => {});
  }, []);

  // Close dropdown when clicking outside the search form
  useEffect(() => {
    const handleOutside = (e) => {
      if (searchFormRef.current && !searchFormRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

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

  const handleSearchInput = (e) => {
    const val = e.target.value;
    setSearchQuery(val);

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    if (val.trim().length < 2) {
      setSearchResults(null);
      setSearchError(false);
      setDropdownOpen(true); // stay open to show trending
      return;
    }

    setDropdownOpen(true);

    searchDebounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(false);
      try {
        const res = await client.get(`/search?q=${encodeURIComponent(val.trim())}&limit=5`);
        setSearchResults(res.data.data);
      } catch (err) {
        console.error('Search error:', err?.response?.data || err.message);
        setSearchResults({ resources: [], guides: [], articles: [] });
        setSearchError(true);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed.length >= 2) {
      setDropdownOpen(false);
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }
  };

  const handleTopSearchClick = (term) => {
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <div className="home-container">
      <div className="home-grid">
        {/* Main Left Column */}
        <div className="home-main">
          
          {/* Hero Banner Section */}
          <section className="hero-banner">
            <h2 className="hero-title">Research 4 Student</h2>
            <p className="hero-subtitle">{t('home.heroSubtitle')}</p>
            {/* Global Search Bar */}
            <form className="hero-search-form" onSubmit={handleSearchSubmit} ref={searchFormRef}>
              <div className="hero-search-wrap">
                <Search size={18} className="hero-search-icon" />
                <input
                  className="hero-search-input"
                  type="text"
                  value={searchQuery}
                  onChange={handleSearchInput}
                  onFocus={() => setDropdownOpen(true)}
                  placeholder={t('search.placeholder')}
                  autoComplete="off"
                />
                <button type="submit" className="hero-search-btn">
                  {t('search.searchBtn')}
                </button>
              </div>

              {/* Inline dropdown: trending when empty, autocomplete when typing */}
              {dropdownOpen && (
                <div className="hero-search-dropdown">
                  {searchQuery.trim().length < 2 ? (
                    // Show trending suggestions when input is empty
                    topSearches.length > 0 ? (
                      <>
                        <div className="search-drop-section-label">
                          <TrendingUp size={12} style={{ marginRight: 5 }} />
                          {t('search.trending')}
                        </div>
                        {topSearches.map((item, i) => (
                          <div
                            key={item.term}
                            className="search-drop-item"
                            onMouseDown={() => { setDropdownOpen(false); navigate(`/search?q=${encodeURIComponent(item.term)}`); }}
                          >
                            <span className="drop-trending-rank">#{i + 1}</span>
                            <span style={{ flex: 1 }}>{item.term}</span>
                            {item.count > 0 && <span className="drop-tag">{item.count}</span>}
                          </div>
                        ))}
                      </>
                    ) : null
                  ) : (
                    // Show autocomplete when typing
                    searchLoading ? (
                      <div className="search-drop-loading">{t('common.loading')}</div>
                    ) : searchError ? (
                      <div className="search-drop-loading" style={{ color: 'var(--color-danger, #dc2626)' }}>
                        {t('search.error')}
                      </div>
                    ) : (
                      <>
                        {(() => {
                          const total = (searchResults?.resources?.length || 0) +
                            (searchResults?.guides?.length || 0) +
                            (searchResults?.articles?.length || 0);
                          if (total === 0) {
                            return (
                              <div className="search-drop-loading" style={{ color: 'var(--color-text-secondary)' }}>
                                {t('search.noResults', { q: searchQuery.trim() })}
                              </div>
                            );
                          }
                          return (
                            <>
                              {searchResults?.resources?.map(r => (
                                <div key={`r-${r.id}`} className="search-drop-item"
                                  onMouseDown={() => { setDropdownOpen(false); navigate(`/resources/${r.id}`); }}>
                                  <Globe size={13} className="drop-icon" />
                                  <span>{r.title}</span>
                                  <span className="drop-tag">{t('nav.resources')}</span>
                                </div>
                              ))}
                              {searchResults?.guides?.map(g => (
                                <div key={`g-${g.id}`} className="search-drop-item"
                                  onMouseDown={() => { setDropdownOpen(false); navigate(`/guides/${g.id}`); }}>
                                  <FileText size={13} className="drop-icon" />
                                  <span>{g.title}</span>
                                  <span className="drop-tag">{t('nav.guides')}</span>
                                </div>
                              ))}
                              {searchResults?.articles?.map(a => (
                                <div key={`a-${a.id}`} className="search-drop-item"
                                  onMouseDown={() => { setDropdownOpen(false); navigate(`/knowledge/articles/${a.id}`); }}>
                                  <BookOpen size={13} className="drop-icon" />
                                  <span>{a.title}</span>
                                  <span className="drop-tag">{t('nav.knowledge')}</span>
                                </div>
                              ))}
                            </>
                          );
                        })()}
                        <div
                          className="search-drop-viewall"
                          onMouseDown={() => { setDropdownOpen(false); navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`); }}
                        >
                          {t('search.viewAllResults')}
                        </div>
                      </>
                    )
                  )}
                </div>
              )}
            </form>

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

          {/* Most Searched Widget */}
          {topSearches.length > 0 && (
            <div className="widget-card">
              <h3 className="widget-title">
                <TrendingUp size={16} style={{ display: 'inline', marginRight: 6, color: 'var(--color-primary)' }} />
                {t('search.mostSearched')}
              </h3>
              <div className="widget-divider"></div>
              <div className="top-searches-list">
                {topSearches.map((item, idx) => (
                  <button
                    key={item.term}
                    className="top-search-item"
                    onClick={() => handleTopSearchClick(item.term)}
                  >
                    <span className="top-search-rank">#{idx + 1}</span>
                    <span className="top-search-term">{item.term}</span>
                    {item.count > 0 && <span className="top-search-count">{item.count}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
          
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
