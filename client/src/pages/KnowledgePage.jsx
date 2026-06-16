import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Plus, BookOpen, ChevronDown, ChevronRight, File, FileText, Pencil, Trash2 } from 'lucide-react';
import client from '../api/client';
import SubjectFormModal from '../components/SubjectFormModal';
import TopicFormModal from '../components/TopicFormModal';
import ArticleFormModal from '../components/ArticleFormModal';
import './KnowledgePage.css';

const KnowledgePage = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [subjects, setSubjects] = useState([]);
  const [subjectTopics, setSubjectTopics] = useState({}); // mapping: { [subjectId]: [...topics] }
  const [expandedSubjects, setExpandedSubjects] = useState({}); // mapping: { [subjectId]: boolean }
  
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [articles, setArticles] = useState([]);
  
  const [loadingSubjects, setLoadingSubjects] = useState(true);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // Pagination states for articles
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  // Modals management
  const [subjectModalOpen, setSubjectModalOpen] = useState(false);
  const [topicModalOpen, setTopicModalOpen] = useState(false);
  const [articleModalOpen, setArticleModalOpen] = useState(false);
  
  const [activeSubjectForTopicAdd, setActiveSubjectForTopicAdd] = useState(null);
  const [subjectToEdit, setSubjectToEdit] = useState(null);
  const [topicToEdit, setTopicToEdit] = useState(null);

  // Fetch subjects on mount
  const fetchSubjects = async () => {
    setLoadingSubjects(true);
    try {
      const res = await client.get('/knowledge/subjects');
      setSubjects(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch subjects:', err);
    } finally {
      setLoadingSubjects(false);
    }
  };
  // Fetch articles under selected topic
  const fetchArticles = async (topicId, activePage = page) => {
    if (!topicId) return;
    setLoadingArticles(true);
    try {
      const res = await client.get(`/knowledge/articles?topic_id=${topicId}&page=${activePage}&limit=${limit}`);
      setArticles(res.data.data || []);
      const pag = res.data.pagination;
      if (pag) {
        setTotal(pag.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch articles:', err);
    } finally {
      setLoadingArticles(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSubjects();
  }, []);

  // Handle state passed from breadcrumbs/details pages (e.g. from ArticleDetailPage)
  useEffect(() => {
    const initFromLocationState = async () => {
      if (location.state && location.state.subjectId) {
        const subId = location.state.subjectId;
        
        // 1. Expand the subject
        setExpandedSubjects(prev => ({ ...prev, [subId]: true }));
        
        // 2. Fetch its topics if they aren't loaded yet
        let topicsList = subjectTopics[subId];
        if (!topicsList) {
          try {
            const res = await client.get(`/knowledge/subjects/${subId}/topics`);
            topicsList = res.data.data || [];
            setSubjectTopics(prev => ({ ...prev, [subId]: topicsList }));
          } catch (err) {
            console.error('Failed to load topics for expanded subject:', err);
          }
        }
        
        // 3. Find and select the topic if topicId is provided
        const matchedSubject = subjects.find(s => s.id === subId);
        if (matchedSubject) {
          setSelectedSubject(matchedSubject);
        }
        
        if (location.state.topicId && topicsList) {
          const matchedTopic = topicsList.find(t => t.id === location.state.topicId);
          if (matchedTopic) {
            setSelectedTopic(matchedTopic);
            setPage(1);
            fetchArticles(matchedTopic.id, 1);
          }
        }
      }
    };

    if (subjects.length > 0) {
      initFromLocationState();
    }
  }, [location.state, subjects]);

  // Toggle subject expansion and lazy-load topics
  const handleSubjectToggle = async (e, subject) => {
    // Prevent event bubbling if clicking nested buttons
    if (e.target.closest('.btn-add-topic') || e.target.closest('.btn-edit-subject') || e.target.closest('.btn-delete-subject')) return;

    const subId = subject.id;
    const isExpanded = !expandedSubjects[subId];
    setExpandedSubjects(prev => ({ ...prev, [subId]: isExpanded }));

    if (isExpanded && !subjectTopics[subId]) {
      try {
        const res = await client.get(`/knowledge/subjects/${subId}/topics`);
        setSubjectTopics(prev => ({ ...prev, [subId]: res.data.data || [] }));
      } catch (err) {
        console.error(`Failed to fetch topics for subject ${subId}:`, err);
      }
    }
  };

  const handleTopicSelect = (subject, topic) => {
    setSelectedSubject(subject);
    setSelectedTopic(topic);
    setPage(1);
    fetchArticles(topic.id, 1);
  };

  const handleDeleteSubject = async (subject) => {
    const confirmMessage = t('knowledge.deleteSubjectConfirm', { name: subject.name });
    if (!window.confirm(confirmMessage)) return;

    try {
      await client.delete(`/knowledge/subjects/${subject.id}`);
      alert(t('knowledge.deleteSubjectSuccess'));
      
      setSubjects(prev => prev.filter(s => s.id !== subject.id));
      
      if (selectedSubject?.id === subject.id) {
        setSelectedSubject(null);
        setSelectedTopic(null);
        setArticles([]);
        setTotal(0);
      }
    } catch (err) {
      console.error('Failed to delete subject:', err);
      const errorText = err.response?.status === 403
        ? t('knowledge.errorForbiddenAction')
        : (err.response?.data?.error?.message || t('knowledge.errorGeneral'));
      alert(t('knowledge.deleteSubjectError', { error: errorText }));
    }
  };

  const handleDeleteTopic = async (subject, topic) => {
    const confirmMessage = t('knowledge.deleteTopicConfirm', { name: topic.name });
    if (!window.confirm(confirmMessage)) return;

    try {
      await client.delete(`/knowledge/topics/${topic.id}`);
      alert(t('knowledge.topicDeletedSuccess'));
      
      setSubjectTopics(prev => {
        const updatedTopics = (prev[subject.id] || []).filter(t => t.id !== topic.id);
        return {
          ...prev,
          [subject.id]: updatedTopics
        };
      });
      
      if (selectedTopic?.id === topic.id) {
        setSelectedTopic(null);
        setArticles([]);
        setTotal(0);
      }
    } catch (err) {
      console.error('Failed to delete topic:', err);
      const errorText = err.response?.status === 403
        ? t('knowledge.errorForbiddenAction')
        : (err.response?.data?.error?.message || t('knowledge.errorGeneral'));
      alert(t('knowledge.deleteTopicError', { error: errorText }));
    }
  };

  // Callback after successful topic creation
  const handleTopicCreateSuccess = async () => {
    if (!activeSubjectForTopicAdd) return;
    try {
      const res = await client.get(`/knowledge/subjects/${activeSubjectForTopicAdd}/topics`);
      setSubjectTopics(prev => ({ ...prev, [activeSubjectForTopicAdd]: res.data.data || [] }));
    } catch (err) {
      console.error('Failed to reload topics:', err);
    }
  };

  const isTeacherOrAdmin = user && (user.role === 'teacher' || user.role === 'admin');

  return (
    <div className="knowledge-container">
      
      {/* Sidebar 220px listing subjects/topics */}
      <aside className="knowledge-sidebar">
        <details className="knowledge-subject-nav" defaultOpen={window.innerWidth > 768}>
          <summary>Browse subjects</summary>
          <div className="sidebar-title-row">
            <span className="sidebar-title">Subjects</span>
            {isTeacherOrAdmin && (
              <button 
                className="btn-add-subject" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setSubjectToEdit(null);
                  setSubjectModalOpen(true);
                }}
                title="Add Subject"
              >
                <Plus size={16} />
              </button>
            )}
          </div>

          {loadingSubjects ? (
            <div style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)' }}>Loading...</div>
          ) : subjects.length === 0 ? (
            <div style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)' }}>No subjects added yet.</div>
          ) : (
            <div className="subjects-list">
              {subjects.map((sub) => {
                const isExpanded = !!expandedSubjects[sub.id];
                const topicsList = subjectTopics[sub.id] || [];

                return (
                  <div key={sub.id} className="subject-item">
                    <button 
                      className="subject-header"
                      onClick={(e) => handleSubjectToggle(e, sub)}
                    >
                      <div className="subject-header-left">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                          {sub.name}
                        </span>
                      </div>
                      {isTeacherOrAdmin && (
                        <div className="subject-actions">
                          {isExpanded && (
                            <button 
                              className="btn-add-topic"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setTopicToEdit(null);
                                setActiveSubjectForTopicAdd(sub.id);
                                setTopicModalOpen(true);
                              }}
                              title="Add Topic"
                            >
                              <Plus size={12} />
                            </button>
                          )}
                          <button 
                            className="btn-edit-subject"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setSubjectToEdit(sub);
                              setSubjectModalOpen(true);
                            }}
                            title="Edit Subject"
                          >
                            <Pencil size={12} />
                          </button>
                          <button 
                            className="btn-delete-subject"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteSubject(sub);
                            }}
                            title="Delete Subject"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </button>

                    {/* Expanded Nested Topics list */}
                    {isExpanded && (
                      <div className="topics-sublist">
                        {topicsList.length === 0 ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', padding: '4px 8px' }}>
                            No topics
                          </span>
                        ) : (
                          topicsList.map((topic) => (
                            <div key={topic.id} className="topic-item-row">
                              <button
                                className={`topic-btn ${selectedTopic?.id === topic.id ? 'active' : ''}`}
                                onClick={() => handleTopicSelect(sub, topic)}
                              >
                                {topic.name}
                              </button>
                              {isTeacherOrAdmin && (
                                <div className="topic-actions">
                                  <button 
                                    className="btn-edit-topic"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setTopicToEdit(topic);
                                      setActiveSubjectForTopicAdd(sub.id);
                                      setTopicModalOpen(true);
                                    }}
                                    title="Edit Topic"
                                  >
                                    <Pencil size={10} />
                                  </button>
                                  <button 
                                    className="btn-delete-topic"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDeleteTopic(sub, topic);
                                    }}
                                    title="Delete Topic"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </details>
      </aside>

      {/* Main Content Pane (Right side) */}
      <main className="knowledge-main">
        {selectedTopic ? (
          <>
            {/* Header info */}
            <div className="topic-header-row">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.825rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  {selectedSubject.name} &gt;
                </span>
                <h2 className="topic-title">{selectedTopic.name}</h2>
              </div>
              {isTeacherOrAdmin && (
                <button 
                  className="btn-new-article"
                  onClick={() => setArticleModalOpen(true)}
                >
                  <Plus size={16} />
                  <span>New Article</span>
                </button>
              )}
            </div>

            {/* Articles List */}
            {loadingArticles ? (
              <div className="empty-state">{t('common.loading')}</div>
            ) : articles.length === 0 ? (
              <div className="empty-state" style={{ minHeight: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
                <FileText size={40} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} />
                <span>No articles under this topic yet.</span>
                {isTeacherOrAdmin && (
                  <button 
                    className="btn-new-article"
                    onClick={() => setArticleModalOpen(true)}
                    style={{ marginTop: '8px' }}
                  >
                    <Plus size={16} />
                    <span>Create first article</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="articles-list">
                {articles.map((art) => (
                  <div 
                    key={art.id} 
                    className="article-card"
                    onClick={() => navigate(`/knowledge/articles/${art.id}`)}
                  >
                    <div className="article-card-header">
                      <h4 className="article-title">{art.title}</h4>
                      {art.pdf_file_id && (
                        <span className="pdf-icon-indicator">
                          <File size={12} />
                          <span>PDF</span>
                        </span>
                      )}
                    </div>
                    <p className="article-snippet">
                      {art.content 
                        ? art.content.replace(/[#*`_]/g, '') // strip markdown markers for snippet
                        : 'No text content available.'}
                    </p>
                    <div className="article-meta-row">
                      <span>Created: {new Date(art.created_at.replace(' ', 'T') + 'Z').toLocaleDateString()}</span>
                      {isTeacherOrAdmin && (
                        <span className={`article-status-badge status-${art.status}`}>
                          {art.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Paging */}
            {total > limit && (
              <div className="pagination-row">
                <button 
                  className="btn-page"
                  onClick={() => {
                    const prev = page - 1;
                    setPage(prev);
                    fetchArticles(selectedTopic.id, prev);
                  }}
                  disabled={page === 1}
                >
                  &larr; Prev
                </button>
                <span className="page-indicator">
                  Page {page} of {Math.ceil(total / limit)}
                </span>
                <button 
                  className="btn-page"
                  onClick={() => {
                    const next = page + 1;
                    setPage(next);
                    fetchArticles(selectedTopic.id, next);
                  }}
                  disabled={page >= Math.ceil(total / limit)}
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </>
        ) : (
          /* Initial Placeholder state */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1, gap: '20px', color: 'var(--color-text-secondary)' }}>
            <BookOpen size={48} style={{ opacity: 0.6, color: 'var(--color-primary)' }} />
            <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: 'var(--color-text)' }}>Research Basics Directory</h3>
            <p style={{ maxWidth: '360px', textAlign: 'center', lineHeight: '1.6', fontSize: '0.925rem' }}>
              Select a subject and topic from the left sidebar to browse academic research guides, guides on writing outlines, and article content.
            </p>
          </div>
        )}
      </main>

      {/* Form Modals */}
      <SubjectFormModal 
        isOpen={subjectModalOpen}
        onClose={() => {
          setSubjectModalOpen(false);
          setSubjectToEdit(null);
        }}
        onSuccess={fetchSubjects}
        subjectToEdit={subjectToEdit}
      />

      <TopicFormModal 
        isOpen={topicModalOpen}
        onClose={() => {
          setTopicModalOpen(false);
          setTopicToEdit(null);
        }}
        onSuccess={handleTopicCreateSuccess}
        subjectId={activeSubjectForTopicAdd}
        topicToEdit={topicToEdit}
      />

      <ArticleFormModal 
        isOpen={articleModalOpen}
        onClose={() => setArticleModalOpen(false)}
        onSuccess={() => fetchArticles(selectedTopic.id, page)}
        activeSubjectId={selectedSubject?.id}
        activeTopicId={selectedTopic?.id}
      />

    </div>
  );
};

export default KnowledgePage;
