import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus, MessageSquare, Users, Heart, Share2, Flag, Image as ImageIcon,
  X, AlertCircle, FileText, Check, CheckCircle, Trash2, ShieldAlert,
  Bold, Italic, Strikethrough, Heading2, Code, List, ListOrdered, Quote, Eye, EyeOff
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import client from '../api/client';
import Turnstile from '../components/Turnstile';
import ProjectFormModal from '../components/ProjectFormModal';
import ReportModal from '../components/ReportModal';
import Avatar from '../components/Avatar';
import './CommunityPage.css';

const CommunityPage = ({ defaultTab }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState(defaultTab || 'forum');

  // FORUM STATES
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postsPage, setPostsPage] = useState(1);
  const [postsLimit] = useState(10);
  const [postsTotal, setPostsTotal] = useState(0);

  // Composer state
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postTagInput, setPostTagInput] = useState('');
  const [postTags, setPostTags] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [attachmentFileId, setAttachmentFileId] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState(null);
  const [postTurnstileToken, setPostTurnstileToken] = useState(null);
  const [composerError, setComposerError] = useState('');
  const [cooldownCountdown, setCooldownCountdown] = useState(0);
  const [submittingPost, setSubmittingPost] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const textareaRef = useRef(null);

  // PROJECTS STATES
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsPage, setProjectsPage] = useState(1);
  const [projectsLimit] = useState(10);
  const [projectsTotal, setProjectsTotal] = useState(0);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loadingInvites, setLoadingInvites] = useState(false);

  // Modals management
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // { type, id }

  // Sync active tab state from props (routing tabs)
  useEffect(() => {
    setActiveTab(defaultTab || 'forum');
  }, [defaultTab]);

  // Tab change triggers route navigation to sync URL
  const handleTabChange = (tab) => {
    if (tab === 'forum') {
      navigate('/community');
    } else {
      navigate('/community/projects');
    }
  };

  // Cooldown timer handler
  useEffect(() => {
    if (cooldownCountdown > 0) {
      const timer = setTimeout(() => setCooldownCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownCountdown]);

  // ==========================================
  // FORUM FUNCTIONS
  // ==========================================

  // Fetch Forum Posts + Parallel Reactions status query
  const fetchPosts = async (activePage = postsPage) => {
    setLoadingPosts(true);
    try {
      const res = await client.get(`/community/posts?page=${activePage}&limit=${postsLimit}`);
      const postsList = res.data.data || [];
      
      // Inject like status for each post
      const postsWithReactions = await Promise.all(postsList.map(async (p) => {
        try {
          const rxRes = await client.get(`/community/reactions?target_type=post&target_id=${p.id}`);
          return {
            ...p,
            liked: rxRes.data.data.reactedByMe,
            likesCount: rxRes.data.data.count
          };
        } catch (rxErr) {
          return {
            ...p,
            liked: false,
            likesCount: p.reactionCount || 0
          };
        }
      }));

      setPosts(postsWithReactions);
      const pag = res.data.pagination;
      if (pag) {
        setPostsTotal(pag.total || 0);
      }
    } catch (err) {
      console.error('Failed to load posts feed:', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'forum') {
      fetchPosts();
    }
  }, [activeTab, postsPage]);

  // Tags input chip handlers
  const handleAddTag = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = postTagInput.trim().toLowerCase();
      if (val && !postTags.includes(val)) {
        setPostTags(prev => [...prev, val]);
      }
      setPostTagInput('');
    }
  };

  const handleRemoveTag = (indexToRemove) => {
    setPostTags(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  const insertMarkdown = (type) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = postContent.substring(start, end);
    let newText;
    switch (type) {
      case 'bold':      newText = `**${selected || 'in đậm'}**`; break;
      case 'italic':    newText = `*${selected || 'in nghiêng'}*`; break;
      case 'strike':    newText = `~~${selected || 'văn bản'}~~`; break;
      case 'heading':   newText = `\n## ${selected || 'Tiêu đề'}`; break;
      case 'code':      newText = selected.includes('\n') ? `\`\`\`\n${selected || 'code'}\n\`\`\`` : `\`${selected || 'code'}\``; break;
      case 'ul':        newText = `\n- ${selected || 'Mục danh sách'}`; break;
      case 'ol':        newText = `\n1. ${selected || 'Mục danh sách'}`; break;
      case 'quote':     newText = `\n> ${selected || 'Trích dẫn'}`; break;
      default: return;
    }
    const newContent = postContent.substring(0, start) + newText + postContent.substring(end);
    setPostContent(newContent);
    setTimeout(() => {
      textarea.focus();
      const cursorPos = start + newText.length;
      textarea.setSelectionRange(cursorPos, cursorPos);
    }, 0);
  };

  // Immediate upload for post image attachment
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setComposerError(t('community.forum.errorImageType'));
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('purpose', 'post_attachment');

    setUploadingImage(true);
    setComposerError('');

    try {
      const res = await client.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setAttachmentFileId(res.data.data.id);
      setAttachmentUrl(res.data.data.cdn_url);
    } catch (err) {
      console.error('Failed to upload image:', err);
      setComposerError(t('community.forum.errorImageUpload'));
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveAttachment = () => {
    setAttachmentFileId(null);
    setAttachmentUrl(null);
  };

  const handlePostSubmit = async (e) => {
    e.preventDefault();
    setComposerError('');

    if (!postContent.trim()) {
      setComposerError(t('community.forum.errorContent'));
      return;
    }

    if (!postTurnstileToken) {
      setComposerError(t('community.forum.errorSecurity'));
      return;
    }

    setSubmittingPost(true);
    const payload = {
      title: postTitle.trim() || null,
      content: postContent,
      tags: postTags,
      attachment_file_id: attachmentFileId,
      turnstileToken: postTurnstileToken
    };

    try {
      await client.post('/community/posts', payload);
      
      // Reset composer
      setPostTitle('');
      setPostContent('');
      setPostTags([]);
      setAttachmentFileId(null);
      setAttachmentUrl(null);
      setPostTurnstileToken(null);
      
      // Reload posts
      setPostsPage(1);
      fetchPosts(1);
    } catch (err) {
      console.error('Failed to publish post:', err);
      const errCode = err.response?.data?.error?.code;
      let msg = err.response?.data?.error?.message || t('community.forum.errorPublish');

      if (errCode === 'COOLDOWN') {
        const retryAfter = err.response?.data?.error?.retryAfterSeconds || 60;
        setCooldownCountdown(retryAfter);
        msg = t('community.forum.errorCooldown', { seconds: retryAfter });
      }
      setComposerError(msg);
      setPostTurnstileToken(null); // Force re-verify
    } finally {
      setSubmittingPost(false);
    }
  };

  // Optimistic Likes Toggler
  const handleToggleLike = async (postId) => {
    if (!user) {
      alert(t('community.forum.errorLikeSignIn'));
      return;
    }

    // 1. Optimistic Update
    setPosts(prevPosts => 
      prevPosts.map(p => {
        if (p.id === postId) {
          const liked = !p.liked;
          return {
            ...p,
            liked,
            likesCount: liked ? p.likesCount + 1 : p.likesCount - 1
          };
        }
        return p;
      })
    );

    // 2. Fetch API in background
    try {
      await client.post('/community/reactions', {
        target_type: 'post',
        target_id: postId,
        type: 'like'
      });
    } catch (err) {
      console.error('Failed to toggle like reaction:', err);
      // Revert state on failure
      fetchPosts();
    }
  };

  const triggerReport = (type, id) => {
    if (!user) {
      alert(t('community.forum.errorReportSignIn'));
      return;
    }
    setReportTarget({ type, id });
    setReportModalOpen(true);
  };

  // ==========================================
  // PROJECTS FUNCTIONS
  // ==========================================

  // Fetch Projects List
  const fetchProjects = async (activePage = projectsPage) => {
    setLoadingProjects(true);
    try {
      const res = await client.get(`/community/projects?page=${activePage}&limit=${projectsLimit}`);
      setProjects(res.data.data || []);
      
      const pag = res.data.pagination;
      if (pag) {
        setProjectsTotal(pag.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch projects list:', err);
    } finally {
      setLoadingProjects(false);
    }
  };

  // Fetch Pending Invitations
  const fetchPendingInvites = async () => {
    if (!user) return;
    setLoadingInvites(true);
    try {
      const res = await client.get('/community/projects/invites/me');
      setPendingInvites(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch pending invites:', err);
    } finally {
      setLoadingInvites(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'projects') {
      fetchProjects();
      fetchPendingInvites();
    }
  }, [activeTab, projectsPage]);

  // Handle invitation respond
  const handleInviteRespond = async (inviteId, action) => {
    try {
      await client.post(`/community/projects/invites/${inviteId}/respond`, { action });
      // Reload projects & invites list
      fetchPendingInvites();
      setProjectsPage(1);
      fetchProjects(1);
    } catch (err) {
      console.error(`Failed to respond to invite ${inviteId}:`, err);
      alert(t('community.projects.inviteError'));
    }
  };

  return (
    <div className="community-page-container">
      
      {/* Sub-Header Tab Bar */}
      <div className="community-tabs-nav">
        <button
          className={`community-tab-btn ${activeTab === 'forum' ? 'active' : ''}`}
          onClick={() => handleTabChange('forum')}
        >
          <MessageSquare size={18} />
          <span>{t('community.tabForum')}</span>
        </button>
        <button
          className={`community-tab-btn ${activeTab === 'projects' ? 'active' : ''}`}
          onClick={() => handleTabChange('projects')}
        >
          <Users size={18} />
          <span>{t('community.tabProjects')}</span>
        </button>
      </div>

      {/* ==========================================
         TAB PANEL: FORUM
         ========================================== */}
      {activeTab === 'forum' && (
        <div className="forum-tab-panel">
          
          {/* Post Composer card */}
          {user ? (
            <div className="post-composer-card">
              <h3 className="composer-card-title">{t('community.forum.composerTitle')}</h3>
              {composerError && (
                <div className="composer-error-alert">
                  <AlertCircle size={16} />
                  <span>{composerError}</span>
                </div>
              )}
              
              <form onSubmit={handlePostSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input 
                  type="text" 
                  className="composer-input-title"
                  placeholder={t('community.forum.titlePlaceholder')}
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  disabled={submittingPost}
                />
                
                <div className="markdown-editor-wrapper">
                  <div className="markdown-toolbar">
                    <button type="button" className="md-btn" onClick={() => insertMarkdown('bold')} title="In đậm (Ctrl+B)"><Bold size={14} /></button>
                    <button type="button" className="md-btn" onClick={() => insertMarkdown('italic')} title="In nghiêng (Ctrl+I)"><Italic size={14} /></button>
                    <button type="button" className="md-btn" onClick={() => insertMarkdown('strike')} title="Gạch ngang"><Strikethrough size={14} /></button>
                    <div className="md-toolbar-separator" />
                    <button type="button" className="md-btn" onClick={() => insertMarkdown('heading')} title="Tiêu đề"><Heading2 size={14} /></button>
                    <button type="button" className="md-btn" onClick={() => insertMarkdown('quote')} title="Trích dẫn"><Quote size={14} /></button>
                    <button type="button" className="md-btn" onClick={() => insertMarkdown('code')} title="Code"><Code size={14} /></button>
                    <div className="md-toolbar-separator" />
                    <button type="button" className="md-btn" onClick={() => insertMarkdown('ul')} title="Danh sách không thứ tự"><List size={14} /></button>
                    <button type="button" className="md-btn" onClick={() => insertMarkdown('ol')} title="Danh sách có thứ tự"><ListOrdered size={14} /></button>
                    <div className="md-toolbar-spacer" />
                    <button type="button" className={`md-btn md-btn-preview ${previewMode ? 'active' : ''}`} onClick={() => setPreviewMode(p => !p)} title={previewMode ? 'Chỉnh sửa' : 'Xem trước'}>
                      {previewMode ? <EyeOff size={14} /> : <Eye size={14} />}
                      <span>{previewMode ? 'Chỉnh sửa' : 'Xem trước'}</span>
                    </button>
                  </div>
                  {previewMode ? (
                    <div className="markdown-preview-pane">
                      {postContent.trim() ? (
                        <ReactMarkdown className="md-rendered">{postContent}</ReactMarkdown>
                      ) : (
                        <span className="markdown-preview-empty">Chưa có nội dung để xem trước...</span>
                      )}
                    </div>
                  ) : (
                    <textarea
                      ref={textareaRef}
                      className="composer-textarea-content"
                      placeholder={t('community.forum.contentPlaceholder')}
                      rows={4}
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      required
                      disabled={submittingPost}
                    />
                  )}
                </div>

                {/* Tags chips wrapper */}
                <div className="composer-tags-container">
                  <div className="composer-tags-list">
                    {postTags.map((tag, i) => (
                      <span key={tag} className="composer-tag-chip">
                        <span>#{tag}</span>
                        <button 
                          type="button" 
                          className="btn-remove-tag"
                          onClick={() => handleRemoveTag(i)}
                          disabled={submittingPost}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <input 
                    type="text" 
                    className="composer-input-tag"
                    placeholder={t('community.forum.tagPlaceholder')}
                    value={postTagInput}
                    onChange={(e) => setPostTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    disabled={submittingPost}
                  />
                </div>

                {/* Attachment Section */}
                <div className="composer-attachment-row">
                  {attachmentUrl ? (
                    <div className="attachment-preview-box">
                      <img src={attachmentUrl} alt="Upload preview" className="attachment-img-preview" />
                      <button 
                        type="button" 
                        className="btn-remove-attachment"
                        onClick={handleRemoveAttachment}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="attachment-upload-btn-wrapper">
                      <button 
                        type="button" 
                        className="btn-trigger-upload"
                        disabled={uploadingImage || submittingPost}
                      >
                        <ImageIcon size={16} />
                        <span>{uploadingImage ? t('community.forum.uploadingImage') : t('community.forum.attachImage')}</span>
                      </button>
                      <input 
                        type="file" 
                        accept="image/png, image/jpeg, image/webp" 
                        className="file-input-hidden"
                        onChange={handleImageUpload}
                        disabled={uploadingImage || submittingPost}
                      />
                    </div>
                  )}
                </div>

                {/* Cloudflare Turnstile */}
                <div style={{ alignSelf: 'flex-start' }}>
                  <Turnstile onVerify={(token) => setPostTurnstileToken(token)} />
                </div>

                {/* Submit button row */}
                <div className="composer-actions-row">
                  {cooldownCountdown > 0 && (
                    <span className="cooldown-countdown-text">
                      {t('community.forum.cooldown', { seconds: cooldownCountdown })}
                    </span>
                  )}
                  <button 
                    type="submit" 
                    className="btn-submit-post"
                    disabled={submittingPost || uploadingImage || !postTurnstileToken || !postContent.trim()}
                  >
                    {submittingPost ? t('community.forum.posting') : t('community.forum.postBtn')}
                  </button>
                </div>

              </form>
            </div>
          ) : (
            <div className="guest-composer-banner">
              <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{t('community.forum.guestTitle')}</h3>
              <p style={{ margin: '4px 0 16px 0', fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                {t('community.forum.guestDesc')}
              </p>
              <button
                className="btn-guest-login"
                onClick={() => navigate('/login')}
              >
                {t('community.forum.guestLogin')}
              </button>
            </div>
          )}

          {/* Posts Feed list */}
          {loadingPosts ? (
            <div className="forum-empty-state">{t('community.forum.loading')}</div>
          ) : posts.length === 0 ? (
            <div className="forum-empty-state">
              <MessageSquare size={40} style={{ opacity: 0.4, color: 'var(--color-primary)', marginBottom: '12px' }} />
              <h3>{t('community.forum.noPostsTitle')}</h3>
              <p>{t('community.forum.noPostsDesc')}</p>
            </div>
          ) : (
            <div className="posts-feed-list">
              {posts.map((post) => {
                const author = post.author || { display_name: t('community.forum.guestAuthor'), username: 'guest', avatar_url: null };
                const formattedDate = new Date(post.created_at.replace(' ', 'T') + 'Z').toLocaleString();
                
                return (
                  <div key={post.id} className="post-feed-card">
                    {/* User profile card header */}
                    <div className="post-card-header">
                      <Avatar
                        avatarUrl={author.avatar_url}
                        name={author.display_name || author.username}
                        size={44}
                        className="post-user-avatar"
                      />
                      
                      <div className="post-user-meta">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span className="post-user-display-name">{author.display_name}</span>
                          <span className="post-user-username">@{author.username}</span>
                        </div>
                        <span className="post-time-stamp">{formattedDate}</span>
                      </div>
                    </div>

                    {/* Post contents details */}
                    <div className="post-card-content">
                      {post.title && <h4 className="post-title-content">{post.title}</h4>}
                      <ReactMarkdown className="post-text-content md-rendered">{post.content}</ReactMarkdown>
                      
                      {/* Image attachments if any */}
                      {post.attachment_url && (
                        <div className="post-content-image-wrapper">
                          <img src={post.attachment_url} alt="Attached upload" className="post-attached-image" />
                        </div>
                      )}

                      {/* Tag chips */}
                      {post.tags && post.tags.length > 0 && (
                        <div className="post-tags-list">
                          {post.tags.map(tag => (
                            <span key={tag} className="post-tag-chip">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions panel */}
                    <div className="post-card-actions">
                      <button 
                        className={`action-btn-react ${post.liked ? 'liked' : ''}`}
                        onClick={() => handleToggleLike(post.id)}
                      >
                        <Heart size={16} fill={post.liked ? 'currentColor' : 'none'} />
                        <span>{post.likesCount}</span>
                      </button>

                      <button 
                        className="action-btn-comments"
                        onClick={() => navigate(`/community/posts/${post.id}`)}
                      >
                        <MessageSquare size={16} />
                        <span>{post.commentCount}</span>
                      </button>

                      <button 
                        className="action-btn-report"
                        onClick={() => triggerReport('post', post.id)}
                        title="Report content"
                      >
                        <Flag size={14} />
                      </button>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

          {/* Forum posts paging */}
          {postsTotal > postsLimit && (
            <div className="community-pagination">
              <button
                className="btn-community-page"
                onClick={() => setPostsPage(prev => Math.max(prev - 1, 1))}
                disabled={postsPage === 1}
              >
                &larr; {t('community.forum.prevPage')}
              </button>
              <span className="community-page-indicator">
                {t('community.forum.pageInfo', { page: postsPage, total: Math.ceil(postsTotal / postsLimit) })}
              </span>
              <button
                className="btn-community-page"
                onClick={() => setPostsPage(prev => Math.min(prev + 1, Math.ceil(postsTotal / postsLimit)))}
                disabled={postsPage >= Math.ceil(postsTotal / postsLimit)}
              >
                {t('community.forum.nextPage')} &rarr;
              </button>
            </div>
          )}

        </div>
      )}

      {/* ==========================================
         TAB PANEL: PROJECTS
         ========================================== */}
      {activeTab === 'projects' && (
        <div className="projects-tab-panel">
          
          {/* Pending Invites Banner */}
          {pendingInvites.length > 0 && (
            <div className="pending-invites-banner">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--badge-pro-text)' }}>
                <ShieldAlert size={20} />
                <h4 style={{ margin: 0, fontWeight: 700 }}>{t('community.projects.pendingTitle')}</h4>
              </div>
              <div className="invites-list">
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="invite-strip-item">
                    <span className="invite-text-desc">
                      <strong>{inv.invited_by.display_name}</strong> (@{inv.invited_by.username}) {t('community.projects.inviteText')} <strong>{inv.project.name}</strong>.
                    </span>
                    <div className="invite-strip-actions">
                      <button
                        className="btn-invite-accept"
                        onClick={() => handleInviteRespond(inv.id, 'accept')}
                      >
                        <Check size={14} />
                        <span>{t('community.projects.acceptBtn')}</span>
                      </button>
                      <button
                        className="btn-invite-decline"
                        onClick={() => handleInviteRespond(inv.id, 'decline')}
                      >
                        <X size={14} />
                        <span>{t('community.projects.declineBtn')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-Header Row */}
          <div className="projects-section-header">
            <div>
              <h3 className="section-panel-title">{t('community.projects.sectionTitle')}</h3>
              <p className="section-panel-subtitle">{t('community.projects.sectionSubtitle')}</p>
            </div>
            {user && (
              <button
                className="btn-create-project-trigger"
                onClick={() => setProjectModalOpen(true)}
              >
                <Plus size={16} />
                <span>{t('community.projects.newProject')}</span>
              </button>
            )}
          </div>

          {/* Projects List Grid */}
          {loadingProjects ? (
            <div className="projects-empty-state">{t('community.projects.loading')}</div>
          ) : projects.length === 0 ? (
            <div className="projects-empty-state">
              <Users size={40} style={{ opacity: 0.4, color: 'var(--color-primary)', marginBottom: '12px' }} />
              <h3>{t('community.projects.noProjectsTitle')}</h3>
              <p>{t('community.projects.noProjectsDesc')}</p>
            </div>
          ) : (
            <div className="projects-grid-list">
              {projects.map((proj) => {
                const owner = proj.owner || { display_name: 'Unknown User' };
                return (
                  <div 
                    key={proj.id} 
                    className="project-grid-card"
                    onClick={() => navigate(`/community/projects/${proj.id}`)}
                  >
                    <div className="project-card-header-row">
                      <span className={`project-status-badge status-${proj.status}`}>
                        {proj.status.replace('_', ' ')}
                      </span>
                      <span className={`project-visibility-badge visibility-${proj.visibility}`}>
                        {proj.visibility}
                      </span>
                    </div>

                    <h4 className="project-card-title">{proj.name}</h4>
                    <p className="project-card-desc">
                      {proj.description || t('community.projects.noDescription')}
                    </p>

                    <div className="project-card-footer">
                      <div className="project-owner-info">
                        <span className="owner-label">{t('community.projects.lead')}</span>
                        <span className="owner-name">{owner.display_name}</span>
                      </div>
                      <div className="project-members-count">
                        <Users size={14} />
                        <span>{t('community.projects.members', { count: proj.memberCount || 1 })}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Projects paging */}
          {projectsTotal > projectsLimit && (
            <div className="community-pagination">
              <button
                className="btn-community-page"
                onClick={() => setProjectsPage(prev => Math.max(prev - 1, 1))}
                disabled={projectsPage === 1}
              >
                &larr; {t('community.projects.prevPage')}
              </button>
              <span className="community-page-indicator">
                {t('community.projects.pageInfo', { page: projectsPage, total: Math.ceil(projectsTotal / projectsLimit) })}
              </span>
              <button
                className="btn-community-page"
                onClick={() => setProjectsPage(prev => Math.min(prev + 1, Math.ceil(projectsTotal / projectsLimit)))}
                disabled={projectsPage >= Math.ceil(projectsTotal / projectsLimit)}
              >
                {t('community.projects.nextPage')} &rarr;
              </button>
            </div>
          )}

        </div>
      )}

      {/* Reusable Modals */}
      <ProjectFormModal 
        isOpen={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSuccess={() => {
          setProjectsPage(1);
          fetchProjects(1);
        }}
      />

      <ReportModal 
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setReportTarget(null);
        }}
        targetType={reportTarget?.type}
        targetId={reportTarget?.id}
        onSuccess={() => alert(t('community.forum.reportSuccess'))}
      />

    </div>
  );
};

export default CommunityPage;
