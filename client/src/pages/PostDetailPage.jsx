import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { ArrowLeft, Heart, MessageSquare, Flag, AlertCircle, CornerDownRight, Calendar, Trash2 } from 'lucide-react';
import client from '../api/client';
import Turnstile from '../components/Turnstile';
import ReportModal from '../components/ReportModal';
import Avatar from '../components/Avatar';
import ReactMarkdown from 'react-markdown';
import './PostDetailPage.css';

// Recursive Comment Node Component
const CommentNode = ({ comment, postId, user, onReplySuccess, onReport }) => {
  const { t } = useTranslation();
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [submittingReply, setSubmittingReply] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleReplySubmit = async (e) => {
    e.preventDefault();
    if (!replyContent.trim()) return;
    if (!turnstileToken) {
      setErrorMsg(t('postDetail.comment.errorTurnstile'));
      return;
    }

    setSubmittingReply(true);
    setErrorMsg('');

    try {
      await client.post(`/community/posts/${postId}/comments`, {
        content: replyContent.trim(),
        parent_comment_id: comment.id,
        turnstileToken
      });

      setReplyContent('');
      setShowReplyForm(false);
      setTurnstileToken(null);
      if (onReplySuccess) onReplySuccess();
    } catch (err) {
      console.error('Failed to reply:', err);
      const errCode = err.response?.data?.error?.code;
      let msg = err.response?.data?.error?.message || t('postDetail.comment.errorFail');
      if (errCode === 'COOLDOWN') {
        const retrySec = err.response?.data?.error?.retryAfterSeconds || 15;
        msg = t('postDetail.comment.errorCooldown', { seconds: retrySec });
      }
      setErrorMsg(msg);
      setTurnstileToken(null);
    } finally {
      setSubmittingReply(false);
    }
  };

  const author = comment.author || { display_name: t('postDetail.comment.guestAuthor'), username: 'guest', avatar_url: null };
  const formattedDate = new Date(comment.created_at.replace(' ', 'T') + 'Z').toLocaleString();

  return (
    <div className="comment-node-wrapper">
      <div className="comment-card">
        {/* Comment Header */}
        <div className="comment-header">
          <Avatar
            avatarUrl={author.avatar_url}
            name={author.display_name || author.username}
            size={32}
            className="comment-user-avatar"
          />

          <div className="comment-user-info">
            <span className="comment-user-name">{author.display_name}</span>
            <span className="comment-user-handle">@{author.username}</span>
            <span className="comment-time">{formattedDate}</span>
          </div>

          <button
            className="comment-btn-report"
            onClick={() => onReport('comment', comment.id)}
            title={t('postDetail.comment.reportTitle')}
          >
            <Flag size={12} />
          </button>
        </div>

        {/* Comment Body */}
        <div className="comment-body-content">
          {comment.status === 'deleted' ? (
            <span className="comment-deleted-text">{t('postDetail.comment.deletedText')}</span>
          ) : (
            <p className="comment-text">{comment.content}</p>
          )}
        </div>

        {/* Comment Actions */}
        {user && comment.status !== 'deleted' && (
          <div className="comment-actions-row">
            <button
              className="comment-btn-reply-toggle"
              onClick={() => {
                setShowReplyForm(!showReplyForm);
                setErrorMsg('');
                setTurnstileToken(null);
              }}
            >
              <MessageSquare size={12} />
              <span>{t('postDetail.comment.replyBtn')}</span>
            </button>
          </div>
        )}

        {/* Reply Form */}
        {showReplyForm && (
          <form onSubmit={handleReplySubmit} className="reply-composer-form">
            {errorMsg && (
              <div className="reply-error-text">
                {errorMsg}
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <CornerDownRight size={16} className="reply-arrow-icon" />
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <textarea
                  className="reply-textarea"
                  placeholder={t('postDetail.comment.replyPlaceholder')}
                  rows={2}
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  required
                  disabled={submittingReply}
                />

                <div style={{ alignSelf: 'flex-start', transform: 'scale(0.85)', transformOrigin: 'top left' }}>
                  <Turnstile onVerify={(token) => setTurnstileToken(token)} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-reply-cancel"
                    onClick={() => setShowReplyForm(false)}
                    disabled={submittingReply}
                  >
                    {t('postDetail.comment.cancelBtn')}
                  </button>
                  <button
                    type="submit"
                    className="btn-reply-submit"
                    disabled={submittingReply || !turnstileToken || !replyContent.trim()}
                  >
                    {t('postDetail.comment.sendBtn')}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* Render children replies recursively */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies-thread">
          {comment.replies.map(reply => (
            <CommentNode
              key={reply.id}
              comment={reply}
              postId={postId}
              user={user}
              onReplySuccess={onReplySuccess}
              onReport={onReport}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const PostDetailPage = () => {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingComments, setLoadingComments] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Top-level comment composer states
  const [commentContent, setCommentContent] = useState('');
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  // Report Modal states
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState(null); // { type, id }

  // 1. Fetch Post Detail + React stats
  const fetchPostDetail = async () => {
    try {
      const res = await client.get(`/community/posts/${id}`);
      const p = res.data.data;

      // Inject like stats
      try {
        const rxRes = await client.get(`/community/reactions?target_type=post&target_id=${id}`);
        setPost({
          ...p,
          liked: rxRes.data.data.reactedByMe,
          likesCount: rxRes.data.data.count
        });
      } catch (rxErr) {
        setPost({
          ...p,
          liked: false,
          likesCount: p.reactionCount || 0
        });
      }
    } catch (err) {
      console.error('Failed to fetch post details:', err);
      if (err.response?.status === 404) {
        setErrorMsg(t('postDetail.notFound'));
      } else {
        setErrorMsg(t('postDetail.loadFail'));
      }
    } finally {
      setLoading(false);
    }
  };

  // 2. Fetch comments tree
  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const res = await client.get(`/community/posts/${id}/comments?limit=100`);
      setComments(res.data.data || []);
    } catch (err) {
      console.error('Failed to load comments:', err);
    } finally {
      setLoadingComments(false);
    }
  };

  useEffect(() => {
    fetchPostDetail();
    fetchComments();
  }, [id]);

  // Handle post reaction toggle
  const handleToggleLike = async () => {
    if (!user) {
      alert(t('postDetail.errorSignInReact'));
      return;
    }
    if (!post) return;

    // Optimistic toggle
    const oldLiked = post.liked;
    const oldLikesCount = post.likesCount;
    setPost(prev => ({
      ...prev,
      liked: !prev.liked,
      likesCount: prev.liked ? prev.likesCount - 1 : prev.likesCount + 1
    }));

    try {
      await client.post('/community/reactions', {
        target_type: 'post',
        target_id: parseInt(id, 10),
        type: 'like'
      });
    } catch (err) {
      console.error(err);
      // Revert on failure
      setPost(prev => ({
        ...prev,
        liked: oldLiked,
        likesCount: oldLikesCount
      }));
    }
  };

  // Submit top-level comment
  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    setCommentError('');

    if (!commentContent.trim()) return;
    if (!turnstileToken) {
      setCommentError(t('postDetail.errorTurnstile'));
      return;
    }

    setSubmittingComment(true);

    try {
      await client.post(`/community/posts/${id}/comments`, {
        content: commentContent.trim(),
        turnstileToken
      });

      setCommentContent('');
      setTurnstileToken(null);
      fetchComments();
      fetchPostDetail(); // Refresh commentCount in header
    } catch (err) {
      console.error('Failed to create comment:', err);
      const errCode = err.response?.data?.error?.code;
      let msg = err.response?.data?.error?.message || t('postDetail.errorComment');
      if (errCode === 'COOLDOWN') {
        const retrySec = err.response?.data?.error?.retryAfterSeconds || 15;
        msg = t('postDetail.errorCooldown', { seconds: retrySec });
      }
      setCommentError(msg);
      setTurnstileToken(null); // Reset Turnstile
    } finally {
      setSubmittingComment(false);
    }
  };

  const triggerReport = (type, targetId) => {
    if (!user) {
      alert(t('postDetail.errorSignInReport'));
      return;
    }
    setReportTarget({ type, id: targetId });
    setReportModalOpen(true);
  };

  const handleDeletePost = async () => {
    if (!post) return;
    if (window.confirm(t('postDetail.confirmDelete'))) {
      try {
        await client.delete(`/community/posts/${id}`);
        navigate('/community');
      } catch (err) {
        console.error('Failed to delete post:', err);
        alert(t('postDetail.deleteFail'));
      }
    }
  };

  if (loading) {
    return <div className="empty-state">{t('common.loading')}</div>;
  }

  if (errorMsg || !post) {
    return (
      <div className="empty-state" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
        <span>{errorMsg || t('postDetail.loadFail')}</span>
        <button className="btn-back-link" onClick={() => navigate('/community')}>
          <ArrowLeft size={16} />
          <span>{t('postDetail.backToForum')}</span>
        </button>
      </div>
    );
  }

  const author = post.author || { display_name: t('postDetail.comment.guestAuthor'), username: 'guest', avatar_url: null };
  const formattedPostDate = new Date(post.created_at.replace(' ', 'T') + 'Z').toLocaleString();
  const isOwnerOrAdmin = user && (user.role === 'admin' || post.author_id === user.id);

  return (
    <div className="post-detail-page-container">

      {/* Back button */}
      <div>
        <button className="btn-back-link" onClick={() => navigate('/community')}>
          <ArrowLeft size={16} />
          <span>{t('postDetail.backToForum')}</span>
        </button>
      </div>

      {/* Main Post Card */}
      <div className="detailed-post-card">

        {/* Header author details */}
        <div className="detailed-post-header">
          <Avatar
            avatarUrl={author.avatar_url}
            name={author.display_name || author.username}
            size={48}
            className="post-detail-avatar"
          />

          <div className="post-detail-user-meta">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span className="post-detail-display-name">{author.display_name}</span>
              <span className="post-detail-username">@{author.username}</span>
            </div>
            <div className="post-detail-timestamp">
              <Calendar size={12} style={{ marginRight: '4px' }} />
              <span>{formattedPostDate}</span>
            </div>
          </div>

          {/* Delete controls if owner/admin */}
          {isOwnerOrAdmin && (
            <button className="btn-delete-post" onClick={handleDeletePost} title={t('postDetail.deletePostTitle')}>
              <Trash2 size={16} />
            </button>
          )}
        </div>

        {/* Post Title & Content */}
        <div className="detailed-post-body">
          {post.title && <h3 className="detailed-post-title">{post.title}</h3>}
          <ReactMarkdown className="detailed-post-text md-rendered">{post.content}</ReactMarkdown>

          {/* Attachment render */}
          {post.attachment_url && (
            <div className="detailed-post-image-wrapper">
              <img src={post.attachment_url} alt="" className="detailed-post-image" />
            </div>
          )}

          {/* Tag Chips */}
          {post.tags && post.tags.length > 0 && (
            <div className="detailed-post-tags">
              {post.tags.map(tag => (
                <span key={tag} className="detailed-tag-chip">#{tag}</span>
              ))}
            </div>
          )}
        </div>

        {/* Action button row */}
        <div className="detailed-post-actions">
          <button
            className={`action-btn-react ${post.liked ? 'liked' : ''}`}
            onClick={handleToggleLike}
          >
            <Heart size={18} fill={post.liked ? 'currentColor' : 'none'} />
            <span>{t('postDetail.reacts', { count: post.likesCount })}</span>
          </button>

          <div className="action-comments-indicator">
            <MessageSquare size={18} />
            <span>{t('postDetail.comments', { count: post.commentCount })}</span>
          </div>

          <button
            className="action-btn-report"
            onClick={() => triggerReport('post', post.id)}
            style={{ margin: 0 }}
          >
            <Flag size={16} />
            <span>{t('postDetail.reportPost')}</span>
          </button>
        </div>

      </div>

      {/* Discussion Thread Section */}
      <div className="discussion-thread-section">
        <h4 className="discussion-section-title">{t('postDetail.discussionTitle')}</h4>

        {/* Comment Composer */}
        {user ? (
          <form onSubmit={handleCommentSubmit} className="main-comment-composer">
            <h5 style={{ margin: '0 0 8px 0', fontSize: '0.9rem', fontWeight: 700 }}>{t('postDetail.writeComment')}</h5>
            {commentError && (
              <div className="comment-error-alert" style={{ marginBottom: '12px' }}>
                <AlertCircle size={14} />
                <span>{commentError}</span>
              </div>
            )}

            <textarea
              className="composer-textarea-content"
              placeholder={t('postDetail.commentPlaceholder')}
              rows={3}
              value={commentContent}
              onChange={(e) => setCommentContent(e.target.value)}
              required
              disabled={submittingComment}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                <Turnstile onVerify={(token) => setTurnstileToken(token)} />
              </div>

              <button
                type="submit"
                className="btn-submit-post"
                disabled={submittingComment || !turnstileToken || !commentContent.trim()}
              >
                {submittingComment ? t('postDetail.sendingComment') : t('postDetail.sendCommentBtn')}
              </button>
            </div>
          </form>
        ) : (
          <div className="guest-thread-notice">
            {t('postDetail.guestNotice')}
          </div>
        )}

        {/* Comments Tree list */}
        {loadingComments ? (
          <div className="thread-loading">{t('postDetail.loadingComments')}</div>
        ) : comments.length === 0 ? (
          <div className="thread-empty-state">
            {t('postDetail.noComments')}
          </div>
        ) : (
          <div className="comments-tree-list">
            {comments.map((comment) => (
              <CommentNode
                key={comment.id}
                comment={comment}
                postId={post.id}
                user={user}
                onReplySuccess={() => {
                  fetchComments();
                  fetchPostDetail();
                }}
                onReport={triggerReport}
              />
            ))}
          </div>
        )}
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
        onSuccess={() => alert(t('postDetail.reportSuccessAlert'))}
      />

    </div>
  );
};

export default PostDetailPage;
