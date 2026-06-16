import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { slugify } from '../utils/slugify';
import client from '../api/client';
import './ResourceFormModal.css';

const TopicFormModal = ({ isOpen, onClose, onSuccess, subjectId, topicToEdit }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(topicToEdit ? topicToEdit.name : '');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg(t('knowledge.topicModal.nameLabel'));
      return;
    }

    if (!subjectId && !topicToEdit) {
      setErrorMsg('Subject ID is missing.');
      return;
    }

    const slug = slugify(trimmedName);
    setSubmitting(true);

    try {
      if (topicToEdit) {
        await client.patch(`/knowledge/topics/${topicToEdit.id}`, { 
          name: trimmedName, 
          slug 
        });
      } else {
        await client.post('/knowledge/topics', { 
          subject_id: subjectId, 
          name: trimmedName, 
          slug 
        });
      }
      setName('');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save topic:', err);
      const msg = err.response?.status === 403
        ? t('knowledge.topicModal.errorForbidden')
        : err.response?.status === 409
          ? t('knowledge.topicModal.errorConflict')
          : (err.response?.data?.error?.message || t('knowledge.topicModal.errorConflict'));
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-container" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {topicToEdit ? t('knowledge.topicModal.titleEdit') : t('knowledge.topicModal.titleNew')}
          </h3>
          <button className="btn-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {errorMsg && (
          <div style={{ color: 'var(--color-danger)', fontSize: '0.875rem', fontWeight: '600' }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">{t('knowledge.topicModal.nameLabel')}</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Thu thập dữ liệu"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={submitting}
              autoFocus
            />
            {name && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                Slug: <strong>{slugify(name)}</strong>
              </div>
            )}
          </div>

          <div className="modal-actions-row">
            <button 
              type="button" 
              className="btn-modal-cancel" 
              onClick={onClose}
              disabled={submitting}
            >
              {t('common.cancel')}
            </button>
            <button 
              type="submit" 
              className="btn-modal-submit"
              disabled={submitting}
            >
              {submitting 
                ? (topicToEdit ? t('knowledge.topicModal.saving') : t('knowledge.topicModal.creating')) 
                : (topicToEdit ? t('knowledge.topicModal.saveBtn') : t('knowledge.topicModal.createBtn'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TopicFormModal;
