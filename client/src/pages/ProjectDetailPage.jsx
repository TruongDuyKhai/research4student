import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowLeft, Users, Calendar, Heart,
  MessageSquare, Flag, Image as ImageIcon, X, AlertCircle, Plus, CheckCircle, UserMinus, FileText,
  Pencil, Check, Bold, Italic, Strikethrough, Heading2, Code, List, ListOrdered, Quote, Eye, EyeOff, Trash2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
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

  // Project edit states
  const [editingProject, setEditingProject] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editVisibility, setEditVisibility] = useState('');
  const [savingProject, setSavingProject] = useState(false);
  const [editProjectError, setEditProjectError] = useState('');

  // Composer markdown toolbar
  const [composerPreview, setComposerPreview] = useState(false);
  const composerTextareaRef = useRef(null);

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
        setErrorMsg(t('projectDetail.notFound'));
      } else {
        setErrorMsg(t('projectDetail.loadFail'));
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
  const canManage = isOwner || (user && (user.role === 'admin' || user.role === 'teacher'));
  const isMember = user && members.some(m => m.user_id === user.id);

  const handleDeleteProject = async () => {
    if (!window.confirm('Bạn có chắc muốn xóa nhóm dự án này? Toàn bộ bài viết trong nhóm cũng sẽ bị xóa.')) return;
    try {
      await client.delete(`/community/projects/${id}`);
      navigate('/community/projects');
    } catch (err) {
      console.error('Failed to delete project:', err);
      alert(err.response?.data?.error?.message || 'Xóa dự án thất bại, vui lòng thử lại.');
    }
  };

  const openEditProject = () => {
    setEditName(project.name || '');
    setEditDescription(project.description || '');
    setEditStatus(project.status || 'recruiting');
    setEditVisibility(project.visibility || 'public');
    setEditProjectError('');
    setEditingProject(true);
  };

  const handleSaveProject = async () => {
    if (!editName.trim()) { setEditProjectError('Tên dự án không được để trống.'); return; }
    setSavingProject(true);
    setEditProjectError('');
    try {
      await client.patch(`/community/projects/${id}`, {
        name: editName.trim(),
        description: editDescription.trim() || null,
        status: editStatus,
        visibility: editVisibility,
      });
      setProject(prev => ({ ...prev, name: editName.trim(), description: editDescription.trim() || null, status: editStatus, visibility: editVisibility }));
      setEditingProject(false);
    } catch (err) {
      setEditProjectError(err.response?.data?.error?.message || 'Lưu thất bại, vui lòng thử lại.');
    } finally {
      setSavingProject(false);
    }
  };

  const insertMarkdownComposer = (type) => {
    const textarea = composerTextareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = postContent.substring(start, end);
    let newText;
    switch (type) {
      case 'bold':   newText = `**${selected || 'in đậm'}**`; break;
      case 'italic': newText = `*${selected || 'in nghiêng'}*`; break;
      case 'strike': newText = `~~${selected || 'văn bản'}~~`; break;
      case 'heading':newText = `\n## ${selected || 'Tiêu đề'}`; break;
      case 'code':   newText = selected.includes('\n') ? `\`\`\`\n${selected || 'code'}\n\`\`\`` : `\`${selected || 'code'}\``; break;
      case 'ul':     newText = `\n- ${selected || 'Mục danh sách'}`; break;
      case 'ol':     newText = `\n1. ${selected || 'Mục danh sách'}`; break;
      case 'quote':  newText = `\n> ${selected || 'Trích dẫn'}`; break;
      default: return;
    }
    const newContent = postContent.substring(0, start) + newText + postContent.substring(end);
    setPostContent(newContent);
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + newText.length, start + newText.length);
    }, 0);
  };

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
      let msg = err.response?.data?.error?.message || t('projectDetail.errorInvite');

      if (errCode === 'INVITE_EXISTS') {
        msg = t('projectDetail.inviteExists', { username: inviteUsername });
      }
      setInviteError(msg);
    } finally {
      setInviting(false);
    }
  };

  // Remove member handler
  const handleRemoveMember = async (userId, username) => {
    if (!window.confirm(t('projectDetail.confirmRemove', { username }))) return;

    try {
      await client.delete(`/community/projects/${id}/members/${userId}`);
      fetchProjectDetails();
    } catch (err) {
      console.error('Failed to remove member:', err);
      alert(t('projectDetail.removeFail'));
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
      setComposerError(t('projectDetail.errorImageUpload'));
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
      setComposerError(t('projectDetail.errorContent'));
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
      let msg = err.response?.data?.error?.message || t('community.forum.errorPublish');

      if (errCode === 'COOLDOWN') {
        const retryAfter = err.response?.data?.error?.retryAfterSeconds || 60;
        setCooldownCountdown(retryAfter);
        msg = t('projectDetail.errorCooldown', { seconds: retryAfter });
      }
      setComposerError(msg);
    } finally {
      setSubmittingPost(false);
    }
  };

  // Optimistic Likes Toggler
  const handleToggleLike = async (postId) => {
    if (!user) {
      alert(t('projectDetail.errorSignInReact'));
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
      alert(t('projectDetail.errorSignInReport'));
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
        <span>{errorMsg || t('projectDetail.loadFail')}</span>
        <button className="btn-back-link" onClick={() => navigate('/community/projects')}>
          <ArrowLeft size={16} />
          <span>{t('projectDetail.backToProjects')}</span>
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
          <span>{t('projectDetail.backToProjects')}</span>
        </button>
      </div>

      {/* Grid: 2 columns layout */}
      <div className="project-layout-grid">

        {/* Left Side Column: Details & internal feed */}
        <div className="project-left-panel">

          {/* Project Info Header Card */}
          <div className="project-details-header-card">
            {editingProject ? (
              <div className="project-edit-form">
                {editProjectError && (
                  <div className="composer-error-alert" style={{ marginBottom: '10px' }}>
                    <AlertCircle size={14} />
                    <span>{editProjectError}</span>
                  </div>
                )}
                <input
                  className="composer-input-title"
                  type="text"
                  placeholder="Tên dự án"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={savingProject}
                />
                <textarea
                  className="composer-textarea-content"
                  style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginTop: '10px' }}
                  placeholder="Mô tả dự án (tuỳ chọn)"
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  disabled={savingProject}
                />
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '140px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Trạng thái</label>
                    <select className="composer-input-title" value={editStatus} onChange={(e) => setEditStatus(e.target.value)} disabled={savingProject}>
                      <option value="recruiting">Đang tuyển</option>
                      <option value="in_progress">Đang thực hiện</option>
                      <option value="completed">Hoàn thành</option>
                      <option value="archived">Lưu trữ</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '140px' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Quyền truy cập</label>
                    <select className="composer-input-title" value={editVisibility} onChange={(e) => setEditVisibility(e.target.value)} disabled={savingProject}>
                      <option value="public">Công khai</option>
                      <option value="private">Riêng tư</option>
                    </select>
                  </div>
                </div>
                <div className="post-edit-actions" style={{ marginTop: '12px' }}>
                  <button className="btn-edit-cancel" onClick={() => setEditingProject(false)} disabled={savingProject}>
                    <X size={14} /> Huỷ
                  </button>
                  <button className="btn-edit-save" onClick={handleSaveProject} disabled={savingProject || !editName.trim()}>
                    <Check size={14} /> {savingProject ? 'Đang lưu...' : 'Lưu thay đổi'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="project-badge-row">
                  <span className={`project-status-badge status-${project.status}`}>
                    {project.status.replace('_', ' ')}
                  </span>
                  <span className={`project-visibility-badge visibility-${project.visibility}`}>
                    {project.visibility}
                  </span>
                  {isOwner && (
                    <button className="btn-edit-project" onClick={openEditProject} title="Chỉnh sửa dự án">
                      <Pencil size={13} />
                      <span>Chỉnh sửa</span>
                    </button>
                  )}
                  {canManage && (
                    <button className="btn-delete-project" onClick={handleDeleteProject} title="Xóa dự án">
                      <Trash2 size={13} />
                      <span>Xóa</span>
                    </button>
                  )}
                </div>

                <h2 className="project-details-title">{project.name}</h2>
                <p className="project-details-description">
                  {project.description || t('projectDetail.noDescription')}
                </p>

                <div className="project-timestamp">
                  <Calendar size={14} style={{ marginRight: '6px' }} />
                  <span>{t('projectDetail.startedOn')} {new Date(project.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</span>
                </div>
              </>
            )}
          </div>

          {/* Project Feed Section */}
          <div className="project-feed-section">
            <h3 className="feed-title">{t('projectDetail.feedTitle')}</h3>

            {/* Post Composer (Visible only to members) */}
            {isMember ? (
              <div className="post-composer-card" style={{ marginBottom: '16px' }}>
                <h4 className="composer-card-title">{t('projectDetail.composerTitle')}</h4>
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
                    placeholder={t('projectDetail.titlePlaceholder')}
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    disabled={submittingPost}
                  />

                  <div className="markdown-editor-wrapper">
                    <div className="markdown-toolbar">
                      <button type="button" className="md-btn" onClick={() => insertMarkdownComposer('bold')} title="In đậm"><Bold size={13} /></button>
                      <button type="button" className="md-btn" onClick={() => insertMarkdownComposer('italic')} title="In nghiêng"><Italic size={13} /></button>
                      <button type="button" className="md-btn" onClick={() => insertMarkdownComposer('strike')} title="Gạch ngang"><Strikethrough size={13} /></button>
                      <div className="md-toolbar-separator" />
                      <button type="button" className="md-btn" onClick={() => insertMarkdownComposer('heading')} title="Tiêu đề"><Heading2 size={13} /></button>
                      <button type="button" className="md-btn" onClick={() => insertMarkdownComposer('quote')} title="Trích dẫn"><Quote size={13} /></button>
                      <button type="button" className="md-btn" onClick={() => insertMarkdownComposer('code')} title="Code"><Code size={13} /></button>
                      <div className="md-toolbar-separator" />
                      <button type="button" className="md-btn" onClick={() => insertMarkdownComposer('ul')} title="Danh sách"><List size={13} /></button>
                      <button type="button" className="md-btn" onClick={() => insertMarkdownComposer('ol')} title="Danh sách số"><ListOrdered size={13} /></button>
                      <div className="md-toolbar-spacer" />
                      <button type="button" className={`md-btn md-btn-preview ${composerPreview ? 'active' : ''}`} onClick={() => setComposerPreview(p => !p)}>
                        {composerPreview ? <EyeOff size={13} /> : <Eye size={13} />}
                        <span>{composerPreview ? 'Sửa' : 'Xem trước'}</span>
                      </button>
                    </div>
                    {composerPreview ? (
                      <div className="markdown-preview-pane">
                        {postContent.trim()
                          ? <ReactMarkdown className="md-rendered">{postContent}</ReactMarkdown>
                          : <span className="markdown-preview-empty">Chưa có nội dung...</span>
                        }
                      </div>
                    ) : (
                      <textarea
                        ref={composerTextareaRef}
                        className="composer-textarea-content"
                        placeholder={t('projectDetail.contentPlaceholder')}
                        rows={3}
                        value={postContent}
                        onChange={(e) => setPostContent(e.target.value)}
                        required
                        disabled={submittingPost}
                      />
                    )}
                  </div>

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
                      placeholder={t('projectDetail.tagPlaceholder')}
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
                        <img src={attachmentUrl} alt="" className="attachment-img-preview" />
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
                          <span>{uploadingImage ? t('projectDetail.uploadingImage') : t('projectDetail.attachImage')}</span>
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
                        {t('projectDetail.cooldownText', { seconds: cooldownCountdown })}
                      </span>
                    )}
                    <button
                      type="submit"
                      className="btn-submit-post"
                      disabled={submittingPost || uploadingImage || !postContent.trim()}
                    >
                      {submittingPost ? t('projectDetail.posting') : t('projectDetail.postBtn')}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="non-member-feed-notice">
                {t('projectDetail.nonMemberNotice')}
              </div>
            )}

            {/* Project Posts Feed */}
            {loadingPosts ? (
              <div className="forum-empty-state">{t('projectDetail.loadingPosts')}</div>
            ) : posts.length === 0 ? (
              <div className="forum-empty-state">
                <FileText size={40} style={{ opacity: 0.4, color: 'var(--color-primary)', marginBottom: '12px' }} />
                <h3>{t('projectDetail.noUpdatesTitle')}</h3>
                <p>{t('projectDetail.noUpdatesDesc')}</p>
              </div>
            ) : (
              <div className="posts-feed-list">
                {posts.map((post) => {
                  const author = post.author || { display_name: t('community.forum.guestAuthor'), username: 'guest', avatar_url: null };
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
                        <ReactMarkdown className="post-text-content md-rendered">{post.content}</ReactMarkdown>

                        {post.attachment_url && (
                          <div className="post-content-image-wrapper">
                            <img src={post.attachment_url} alt="" className="post-attached-image" />
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

                        {user && (user.role === 'admin' || user.role === 'teacher' || post.author_id === user.id) && (
                          <button
                            className="action-btn-edit"
                            onClick={() => navigate(`/community/posts/${post.id}`, { state: { openEdit: true } })}
                            title="Chỉnh sửa bài viết"
                          >
                            <Pencil size={14} />
                          </button>
                        )}

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
                  &larr; {t('projectDetail.prevPage')}
                </button>
                <span className="community-page-indicator">
                  {t('projectDetail.pageInfo', { page: postsPage, total: Math.ceil(postsTotal / postsLimit) })}
                </span>
                <button
                  className="btn-community-page"
                  onClick={() => setPostsPage(prev => Math.min(prev + 1, Math.ceil(postsTotal / postsLimit)))}
                  disabled={postsPage >= Math.ceil(postsTotal / postsLimit)}
                >
                  {t('projectDetail.nextPage')} &rarr;
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
              <h4 className="invite-card-title">{t('projectDetail.inviteTitle')}</h4>

              {inviteSuccess && (
                <div className="invite-alert alert-success">
                  <CheckCircle size={14} />
                  <span>{t('projectDetail.inviteSuccess')}</span>
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
                  placeholder={t('projectDetail.invitePlaceholder')}
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
                  {inviting ? t('projectDetail.inviting') : t('projectDetail.inviteBtn')}
                </button>
              </form>
            </div>
          )}

          {/* Members Panel */}
          <div className="project-members-panel-card">
            <h4 className="members-panel-title">
              <Users size={16} />
              <span>{t('projectDetail.membersTitle', { count: members.length })}</span>
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
                        title={t('projectDetail.removeMemberTitle')}
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
        onSuccess={() => alert(t('projectDetail.reportSuccess'))}
      />

    </div>
  );
};

export default ProjectDetailPage;
