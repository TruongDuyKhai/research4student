import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { 
  ArrowLeft, Users, Folder, Lock, Unlock, Calendar, Heart, 
  MessageSquare, Flag, Image as ImageIcon, X, AlertCircle, Plus, Send, UserMinus
} from 'lucide-react';
import client from '../api/client';
import ReportModal from '../components/ReportModal';
import Avatar from '../components/Avatar';
import './ProjectDetailPage.css';

const ProjectDetailPage = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Project posts feed states
  const [posts, setPosts] = useState([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [postsPage, setPostsPage] = useState(1);
  const [postsLimit] = useState(10);
  const [postsTotal, setPostsTotal] = useState(0);

  // Composer states for project posts
  const [postTitle, setPostTitle] = useState('');
  const [postContent, setPostContent] = useState('');
  const [postTagInput, setPostTagInput] = useState('');
  const [postTags, setPostTags] = useState([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [attachmentFileId, setAttachmentFileId] = useState(null);
  const [attachmentUrl, setAttachmentUrl] = useState(null);
  const [composerError, setComposerError] = useState('');
  const [cooldownCountdown, setCooldownCountdown] = useState(0);
  const [submittingPost, setSubmittingPost] = useState(false);

  // Invite member state
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const [inviteError, setInviteError] = useState('');

  // Report Modal states
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // { type, id }

  // Cooldown countdown
  useEffect(() => {
    if (cooldownCountdown > 0) {
      const timer = setTimeout(() => setCooldownCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownCountdown]);

  // Fetch Project Metadata & Members List
  const fetchProjectDetails = async () => {
    try {
      const res = await client.get(`/community/projects/${id}`);
      setProject(res.data.data);
      setMembers(res.data.data.members || []);
    } catch (err) {
      console.error('Failed to fetch project details:', err);
      if (err.response?.status === 404) {
        setErrorMsg('Project not found.');
      } else {
        setErrorMsg('Failed to load project details.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch Project Posts
  const fetchProjectPosts = async (activePage = postsPage) => {
    setLoadingPosts(true);
    try {
      const res = await client.get(`/community/projects/${id}/posts?page=${activePage}&limit=${postsLimit}`);
      const postsList = res.data.data || [];
      
      // Inject reactions
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
      console.error('Failed to load project posts:', err);
    } finally {
      setLoadingPosts(false);
    }
  };

  useEffect(() => {
    fetchProjectDetails();
    fetchProjectPosts();
  }, [id]);

  useEffect(() => {
    fetchProjectPosts();
  }, [postsPage]);

  // Member checking
  const projectOwner = members.find(m => m.role === 'owner');
  const isOwner = user && projectOwner && projectOwner.user_id === user.id;
  const isMember = user && members.some(m => m.user_id === user.id);

  // Invite member handler
  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    setInviteError('');
    setInviteSuccess(false);

    if (!inviteUsername.trim()) return;

    setInviting(true);
    try {
      await client.post(`/community/projects/${id}/invite`, {
        username: inviteUsername.trim()
      });
      setInviteSuccess(true);
      setInviteUsername('');
      setTimeout(() => setInviteSuccess(false), 5000);
    } catch (err) {
      console.error('Failed to invite member:', err);
      const errCode = err.response?.data?.error?.code;
      let msg = err.response?.data?.error?.message || 'Failed to send invitation.';
      
      if (errCode === 'INVITE_EXISTS') {
        msg = `User @${inviteUsername} has already been invited or is currently a member.`;
      }
      setInviteError(msg);
    } finally {
      setInviting(false);
    }
  };

  // Remove member handler
  const handleRemoveMember = async (userId, username) => {
    if (!window.confirm(`Are you sure you want to remove @${username} from the project?`)) return;

    try {
      await client.delete(`/community/projects/${id}/members/${userId}`);
      // Refresh details
      fetchProjectDetails();
    } catch (err) {
      console.error('Failed to remove member:', err);
      alert('Failed to remove member. Please try again.');
    }
  };

  // Tags chip handlers
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

  // Upload photo attachment
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

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
      console.error(err);
      setComposerError('Image upload failed. Max size is 10MB.');
    } finally {
      setUploadingImage(false);
    }
  };

  const handleRemoveAttachment = () => {
    setAttachmentFileId(null);
    setAttachmentUrl(null);
  };

  // Submit project feed post (Turnstile not required as per requirements)
  const handlePostSubmit = async (e) => {
    e.preventDefault();
    setComposerError('');

    if (!postContent.trim()) {
      setComposerError('Post content is required.');
      return;
    }

    setSubmittingPost(true);
    const payload = {
      title: postTitle.trim() || null,
      content: postContent,
      tags: postTags,
      attachment_file_id: attachmentFileId
    };

    try {
      await client.post(`/community/projects/${id}/posts`, payload);
      
      setPostTitle('');
      setPostContent('');
      setPostTags([]);
      setAttachmentFileId(null);
      setAttachmentUrl(null);
      
      setPostsPage(1);
      fetchProjectPosts(1);
    } catch (err) {
      console.error('Failed to post in project:', err);
      const errCode = err.response?.data?.error?.code;
      let msg = err.response?.data?.error?.message || 'An error occurred while posting.';
      
      if (errCode === 'COOLDOWN') {
        const retryAfter = err.response?.data?.error?.retryAfterSeconds || 60;
        setCooldownCountdown(retryAfter);
        msg = `Please wait ${retryAfter} seconds.`;
      }
      setComposerError(msg);
    } finally {
      setSubmittingPost(false);
    }
  };

  // Optimistic Likes Toggler
  const handleToggleLike = async (postId) => {
    if (!user) {
      alert('Please sign in to react to posts.');
      return;
    }

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

    try {
      await client.post('/community/reactions', {
        target_type: 'post',
        target_id: postId,
        type: 'like'
      });
    } catch (err) {
      console.error(err);
      fetchProjectPosts();
    }
  };

  const triggerReport = (type, postId) => {
    if (!user) {
      alert('Please sign in to report content.');
      return;
    }
    setReportTarget({ type, id: postId });
    setReportModalOpen(true);
  };

  if (loading) {
    return <div className="empty-state">{t('common.loading')}</div>;
  }

  if (errorMsg || !project) {
    return (
      <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
        <span>{errorMsg || 'Failed to load project details.'}</span>
        <button className="btn-back-link" onClick={() => navigate('/community/projects')}>
          <ArrowLeft size={16} />
          <span>Back to Projects</span>
        </button>
      </div>
    );
  }

  return (
    <div className="project-detail-container">
      
      {/* Back button */}
      <div>
        <button className="btn-back-link" onClick={() => navigate('/community/projects')}>
          <ArrowLeft size={16} />
          <span>Back to Projects</span>
        </button>
      </div>

      {/* Grid: 2 columns layout */}
      <div className="project-layout-grid">
        
        {/* Left Side Column: Details & internal feed */}
        <div className="project-left-panel">
          
          {/* Project Info Header Card */}
          <div className="project-details-header-card">
            <div className="project-badge-row">
              <span className={`project-status-badge status-${project.status}`}>
                {project.status.replace('_', ' ')}
              </span>
              <span className={`project-visibility-badge visibility-${project.visibility}`}>
                {project.visibility}
              </span>
            </div>
            
            <h2 className="project-details-title">{project.name}</h2>
            <p className="project-details-description">
              {project.description || 'No detailed objectives or scopes outlined for this project.'}
            </p>

            <div className="project-timestamp">
              <Calendar size={14} style={{ marginRight: '6px' }} />
              <span>Started on {new Date(project.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</span>
            </div>
          </div>

          {/* Project Feed Section */}
          <div className="project-feed-section">
            <h3 className="feed-title">Project Collaboration Feed</h3>

            {/* Post Composer (Visible only to members) */}
            {isMember ? (
              <div className="post-composer-card" style={{ marginBottom: '16px' }}>
                <h4 className="composer-card-title">Share updates with the project group</h4>
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
                    placeholder="Title (Optional)"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    disabled={submittingPost}
                  />
                  
                  <textarea 
                    className="composer-textarea-content"
                    placeholder="Provide a progress report, document link, or task outline..."
                    rows={3}
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    required
                    disabled={submittingPost}
                  />

                  {/* Tag chips */}
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
                      placeholder="Add tag (Press Enter)"
                      value={postTagInput}
                      onChange={(e) => setPostTagInput(e.target.value)}
                      onKeyDown={handleAddTag}
                      disabled={submittingPost}
                    />
                  </div>

                  {/* Attachment Row */}
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
                          <span>{uploadingImage ? 'Uploading...' : 'Attach Image'}</span>
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

                  <div className="composer-actions-row">
                    {cooldownCountdown > 0 && (
                      <span className="cooldown-countdown-text">
                        Wait {cooldownCountdown}s
                      </span>
                    )}
                    <button 
                      type="submit" 
                      className="btn-submit-post"
                      disabled={submittingPost || uploadingImage || !postContent.trim()}
                    >
                      {submittingPost ? 'Posting...' : 'Post Update'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="non-member-feed-notice">
                🔒 You must be a member of this project group to publish updates or view discussions in the collaboration feed.
              </div>
            )}

            {/* Project Posts Feed Feed */}
            {loadingPosts ? (
              <div className="forum-empty-state">Loading project posts...</div>
            ) : posts.length === 0 ? (
              <div className="forum-empty-state">
                <FileText size={40} style={{ opacity: 0.4, color: 'var(--color-primary)', marginBottom: '12px' }} />
                <h3>No Updates Posted</h3>
                <p>Collaborative project posts and notes will appear here once published by members.</p>
              </div>
            ) : (
              <div className="posts-feed-list">
                {posts.map((post) => {
                  const author = post.author || { display_name: 'Guest User', username: 'guest', avatar_url: null };
                  const formattedDate = new Date(post.created_at.replace(' ', 'T') + 'Z').toLocaleString();
                  
                  return (
                    <div key={post.id} className="post-feed-card">
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

                      <div className="post-card-content">
                        {post.title && <h4 className="post-title-content">{post.title}</h4>}
                        <p className="post-text-content">{post.content}</p>
                        
                        {post.attachment_url && (
                          <div className="post-content-image-wrapper">
                            <img src={post.attachment_url} alt="Attached" className="post-attached-image" />
                          </div>
                        )}

                        {post.tags && post.tags.length > 0 && (
                          <div className="post-tags-list">
                            {post.tags.map(tag => (
                              <span key={tag} className="post-tag-chip">#{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>

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
                        >
                          <Flag size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Paging */}
            {postsTotal > postsLimit && (
              <div className="community-pagination">
                <button 
                  className="btn-community-page"
                  onClick={() => setPostsPage(prev => Math.max(prev - 1, 1))}
                  disabled={postsPage === 1}
                >
                  &larr; Prev
                </button>
                <span className="community-page-indicator">
                  Page {postsPage} of {Math.ceil(postsTotal / postsLimit)}
                </span>
                <button 
                  className="btn-community-page"
                  onClick={() => setPostsPage(prev => Math.min(prev + 1, Math.ceil(postsTotal / postsLimit)))}
                  disabled={postsPage >= Math.ceil(postsTotal / postsLimit)}
                >
                  Next &rarr;
                </button>
              </div>
            )}

          </div>

        </div>

        {/* Right Side Column: Members List Panel & Owner Invites */}
        <div className="project-right-panel">
          
          {/* Owner Invites Console */}
          {isOwner && (
            <div className="project-invite-card">
              <h4 className="invite-card-title">Invite Researcher</h4>
              
              {inviteSuccess && (
                <div className="invite-alert alert-success">
                  <CheckCircle size={14} />
                  <span>Invitation sent successfully.</span>
                </div>
              )}

              {inviteError && (
                <div className="invite-alert alert-danger">
                  <AlertCircle size={14} />
                  <span>{inviteError}</span>
                </div>
              )}

              <form onSubmit={handleInviteSubmit} className="invite-form">
                <input 
                  type="text" 
                  className="composer-input-title"
                  placeholder="Username (e.g. janesmith)"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                  required
                  disabled={inviting}
                />
                <button 
                  type="submit" 
                  className="btn-invite-submit"
                  disabled={inviting || !inviteUsername.trim()}
                >
                  {inviting ? 'Inviting...' : 'Invite'}
                </button>
              </form>
            </div>
          )}

          {/* Members Panel */}
          <div className="project-members-panel-card">
            <h4 className="members-panel-title">
              <Users size={16} />
              <span>Project Members ({members.length})</span>
            </h4>
            
            <div className="members-list-container">
              {members.map((m) => (
                <div key={m.user_id} className="member-strip-item">
                  <div className="member-info-col">
                    <Avatar
                      avatarUrl={m.avatar_url}
                      name={m.display_name || m.username}
                      size={32}
                      className="member-avatar"
                    />
                    <div className="member-details">
                      <span className="member-display-name">{m.display_name}</span>
                      <span className="member-username">@{m.username}</span>
                    </div>
                  </div>

                  <div className="member-badge-col">
                    <span className={`role-badge role-${m.role}`}>
                      {m.role}
                    </span>
                    {isOwner && m.role !== 'owner' && (
                      <button 
                        className="btn-remove-member-trigger"
                        onClick={() => handleRemoveMember(m.user_id, m.username)}
                        title="Remove member"
                      >
                        <UserMinus size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Report Modal */}
      <ReportModal 
        isOpen={reportModalOpen}
        onClose={() => {
          setReportModalOpen(false);
          setReportTarget(null);
        }}
        targetType={reportTarget?.type}
        targetId={reportTarget?.id}
        onSuccess={() => alert('Content reported successfully. Admin review is pending.')}
      />

    </div>
  );
};

export default ProjectDetailPage;
