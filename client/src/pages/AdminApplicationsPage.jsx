import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import client from '../api/client';

const TAB_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
};

const AdminApplicationsPage = () => {
  const [tab, setTab] = useState('pending');
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState(null); // { id, name }
  const [rejectReason, setRejectReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const fetchApps = async (status = tab) => {
    setLoading(true);
    try {
      const res = await client.get(`/admin/teacher-applications?status=${status}`);
      setApps(res.data.data || []);
    } catch (err) {
      console.error('Failed to load applications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApps(tab);
  }, [tab]);

  const handleApprove = async (id, name) => {
    if (!window.confirm(`Approve application from "${name}"? This will create their teacher account.`)) return;
    setActionLoading(true);
    try {
      await client.post(`/admin/teacher-applications/${id}/approve`);
      fetchApps();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to approve application.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await client.post(`/admin/teacher-applications/${rejectModal.id}/reject`, { reason: rejectReason });
      setRejectModal(null);
      setRejectReason('');
      fetchApps();
    } catch (err) {
      alert(err.response?.data?.error?.message || 'Failed to reject application.');
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (d) => d ? new Date(d.replace(' ', 'T') + 'Z').toLocaleString() : '—';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="admin-page-title-row">
        <h2 className="admin-page-title">Teacher Applications</h2>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {Object.entries(TAB_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: '8px 20px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              borderColor: tab === key ? 'var(--color-primary)' : 'var(--color-border)',
              background: tab === key ? 'var(--color-primary)' : 'var(--color-surface)',
              color: tab === key ? 'var(--color-on-primary)' : 'var(--color-text)',
              transition: 'all 0.2s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="admin-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
            Loading applications...
          </div>
        ) : apps.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
            No {tab} applications found.
          </div>
        ) : (
          <div className="admin-table-wrapper">
            <div className="table-responsive">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-th">Name</th>
                    <th className="admin-th">Email</th>
                    <th className="admin-th">Code</th>
                    <th className="admin-th">Department</th>
                    <th className="admin-th">Submitted</th>
                    {tab !== 'pending' && <th className="admin-th">Reviewed</th>}
                    {tab === 'rejected' && <th className="admin-th">Reason</th>}
                    {tab === 'pending' && <th className="admin-th" style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {apps.map(app => (
                    <tr key={app.id}>
                      <td className="admin-td" style={{ fontWeight: 700 }}>{app.display_name}</td>
                      <td className="admin-td">{app.email}</td>
                      <td className="admin-td">{app.employee_code}</td>
                      <td className="admin-td">{app.department}</td>
                      <td className="admin-td">{formatDate(app.created_at)}</td>
                      {tab !== 'pending' && <td className="admin-td">{formatDate(app.reviewed_at)}</td>}
                      {tab === 'rejected' && (
                        <td className="admin-td" style={{ color: 'var(--color-text-secondary)', fontSize: '0.825rem' }}>
                          {app.reject_reason || '—'}
                        </td>
                      )}
                      {tab === 'pending' && (
                        <td className="admin-td" style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          <button
                            className="btn-table-action-edit"
                            style={{ borderColor: 'var(--color-success, #16a34a)', color: 'var(--color-success, #16a34a)' }}
                            onClick={() => handleApprove(app.id, app.display_name)}
                            disabled={actionLoading}
                            title="Approve"
                          >
                            <CheckCircle size={12} />
                            <span>Approve</span>
                          </button>
                          <button
                            className="btn-table-action-delete"
                            onClick={() => { setRejectModal({ id: app.id, name: app.display_name }); setRejectReason(''); }}
                            disabled={actionLoading}
                            title="Reject"
                          >
                            <XCircle size={12} />
                            <span>Reject</span>
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectModal && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-container" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Reject Application</h3>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: '0 0 16px' }}>
              Rejecting application from <strong>{rejectModal.name}</strong>. Optionally provide a reason.
            </p>
            <form onSubmit={handleRejectSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Reason (optional)</label>
                <textarea
                  className="form-input"
                  rows={3}
                  placeholder="e.g. Employee code not found in system..."
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  disabled={actionLoading}
                  style={{ resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
              <div className="modal-actions-row">
                <button type="button" className="btn-modal-cancel"
                  onClick={() => setRejectModal(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit"
                  style={{ backgroundColor: 'var(--color-danger, #dc2626)', borderColor: 'var(--color-danger, #dc2626)' }}
                  disabled={actionLoading}>
                  {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminApplicationsPage;
