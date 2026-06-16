import { useState } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { slugify } from '../utils/slugify';
import client from '../api/client';
import './ResourceFormModal.css'; // Reuse modal styles

const SubjectFormModal = ({ isOpen, onClose, onSuccess, subjectToEdit }) => {
  const { t } = useTranslation();
  const [name, setName] = useState(subjectToEdit ? subjectToEdit.name : '');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMsg(t('knowledge.subjectModal.nameLabel'));
      return;
    }

    const slug = slugify(trimmedName);
    setSubmitting(true);

    try {
      if (subjectToEdit) {
        await client.patch(`/knowledge/subjects/${subjectToEdit.id}`, { name: trimmedName, slug });
      } else {
        await client.post('/knowledge/subjects', { name: trimmedName, slug });
      }
      setName('');
      onSuccess();
      onClose();
    } catch (err) {
      console.error('Failed to save subject:', err);
      const msg = err.response?.status === 403
        ? t('knowledge.subjectModal.errorForbidden')
        : err.response?.status === 409
          ? t('knowledge.subjectModal.errorConflict')
          : (err.response?.data?.error?.message || t('knowledge.subjectModal.errorConflict'));
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
            {subjectToEdit ? t('knowledge.subjectModal.titleEdit') : t('knowledge.subjectModal.titleNew')}
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
            <label className="form-label">{t('knowledge.subjectModal.nameLabel')}</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. Phương pháp luận"
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
                ? (subjectToEdit ? t('knowledge.subjectModal.saving') : t('knowledge.subjectModal.creating')) 
                : (subjectToEdit ? t('knowledge.subjectModal.saveBtn') : t('knowledge.subjectModal.createBtn'))}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubjectFormModal;
