import React, { useState, useEffect } from 'react';
import { Plus, Search, Key, ShieldAlert, Trash2, X, Copy, Check } from 'lucide-react';
import client from '../api/client';

const AdminTeachersPage = () => {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  // Modals state
  const [formOpen, setFormOpen] = useState(false);
  const [tempPasswordModalOpen, setTempPasswordModalOpen] = useState(false);
  const [tempPasswordValue, setTempPasswordValue] = useState('');
  const [copied, setCopied] = useState(false);

  // Form fields state
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [employeeCode, setEmployeeCode] = useState('');
  const [department, setDepartment] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchTeachers = async (activePage = page) => {
    setLoading(true);
    try {
      const res = await client.get(`/admin/teachers?page=${activePage}&limit=${limit}&search=${encodeURIComponent(search)}`);
      setTeachers(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to load teachers list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeachers();
  }, [page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchTeachers(1);
  };

  // Create new teacher
  const handleCreateTeacher = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    const payload = {
      email: email.trim(),
      display_name: displayName.trim(),
      employee_code: employeeCode.trim(),
      department: department.trim()
    };
    if (username.trim()) {
      payload.username = username.trim();
    }

    try {
      const res = await client.post('/admin/teachers', payload);
      const { tempPassword } = res.data.data;
      
      // Close form modal, open password modal
      setFormOpen(false);
      setTempPasswordValue(tempPassword);
      setTempPasswordModalOpen(true);
      
      // Clear form
      setEmail('');
      setDisplayName('');
      setEmployeeCode('');
      setDepartment('');
      setUsername('');
      
      setPage(1);
      fetchTeachers(1);
    } catch (err) {
      console.error('Failed to create teacher:', err);
      setErrorMsg(err.response?.data?.error?.message || 'Failed to create teacher account.');
    } finally {
      setSubmitting(false);
    }
  };

  // Reset password
  const handleResetPassword = async (teacherId, teacherName) => {
    if (!window.confirm(`Are you sure you want to reset password for ${teacherName}?`)) return;

    try {
      const res = await client.post(`/admin/teachers/${teacherId}/reset-password`);
      const { tempPassword } = res.data.data;
      
      setTempPasswordValue(tempPassword);
      setTempPasswordModalOpen(true);
    } catch (err) {
      console.error('Failed to reset password:', err);
      alert('Failed to reset password.');
    }
  };

  const handleDeleteTeacher = async (teacherId, teacherName) => {
    const confirmed = window.confirm(
      `⚠️ PERMANENT DELETE\n\nThis will permanently delete the teacher account "${teacherName}" and all their data.\n\nThis action CANNOT be undone. Click OK to proceed.`
    );
    if (!confirmed) return;

    try {
      await client.delete(`/admin/teachers/${teacherId}/account`);
      fetchTeachers();
    } catch (err) {
      console.error('Failed to delete teacher account:', err);
      alert(err.response?.data?.error?.message || 'Failed to delete teacher account.');
    }
  };

  // Ban teacher
  const handleBanTeacher = async (teacherId, teacherName) => {
    if (!window.confirm(`Are you sure you want to BAN teacher "${teacherName}"?`)) return;

    try {
      await client.delete(`/admin/teachers/${teacherId}`);
      fetchTeachers();
    } catch (err) {
      console.error('Failed to ban teacher:', err);
      alert('Failed to ban teacher account.');
    }
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(tempPasswordValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Page Title & Button */}
      <div className="admin-page-title-row">
        <h2 className="admin-page-title">Manage Teachers</h2>
        <button 
          className="btn-admin-primary"
          onClick={() => {
            setErrorMsg('');
            setFormOpen(true);
          }}
        >
          <Plus size={16} />
          <span>New Teacher</span>
        </button>
      </div>

      {/* Search Filter bar */}
      <div className="admin-card" style={{ padding: '16px 20px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '12px' }}>
          <div style={{ position: 'relative', flexGrow: 1 }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: 'var(--color-text-secondary)' }} />
            <input 
              type="text" 
              className="form-input" 
              style={{ paddingLeft: '36px' }}
              placeholder="Search teachers by name, email, or employee code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-admin-primary" style={{ backgroundColor: 'var(--color-text)', color: 'var(--color-surface)' }}>
            Search
          </button>
        </form>
      </div>

      {/* Teachers Table Card */}
      <div className="admin-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>Loading teachers database...</div>
        ) : teachers.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>No teachers found.</div>
        ) : (
          <>
            <div className="admin-table-wrapper">
              <div className="table-responsive">
                <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-th">Name</th>
                    <th className="admin-th">Email</th>
                    <th className="admin-th">Code</th>
                    <th className="admin-th">Department</th>
                    <th className="admin-th">Status</th>
                    <th className="admin-th" style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {teachers.map((t) => (
                    <tr key={t.id}>
                      <td className="admin-td" style={{ fontWeight: '700' }}>{t.display_name}</td>
                      <td className="admin-td">{t.email}</td>
                      <td className="admin-td">{t.employee_code}</td>
                      <td className="admin-td">{t.department}</td>
                      <td className="admin-td">
                        <span className={`admin-status-badge status-${t.status}`}>
                          {t.status}
                        </span>
                      </td>
                      <td className="admin-td" style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        {t.status === 'active' && (
                          <>
                            <button
                              className="btn-table-action-reset"
                              onClick={() => handleResetPassword(t.id, t.display_name)}
                              title="Reset Password"
                            >
                              <Key size={12} />
                              <span>Reset</span>
                            </button>
                            <button
                              className="btn-table-action-delete"
                              onClick={() => handleBanTeacher(t.id, t.display_name)}
                              title="Ban Teacher"
                            >
                              <ShieldAlert size={12} />
                              <span>Ban</span>
                            </button>
                          </>
                        )}
                        <button
                          className="btn-table-action-delete"
                          style={{ backgroundColor: '#7f1d1d', borderColor: '#991b1b', color: 'white' }}
                          onClick={() => handleDeleteTeacher(t.id, t.display_name)}
                          title="Permanently Delete Account"
                        >
                          <Trash2 size={12} />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>

            {/* Table Pagination */}
            {total > limit && (
              <div className="admin-pagination-row">
                <span className="admin-pagination-info">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} teachers
                </span>
                <div className="admin-pagination-btns">
                  <button 
                    className="btn-community-page"
                    disabled={page === 1}
                    onClick={() => setPage(prev => prev - 1)}
                  >
                    &larr; Prev
                  </button>
                  <button 
                    className="btn-community-page"
                    disabled={page >= Math.ceil(total / limit)}
                    onClick={() => setPage(prev => prev + 1)}
                  >
                    Next &rarr;
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal: New Teacher Form */}
      {formOpen && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-container" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3 className="modal-title">New Teacher Profile</h3>
              <button className="btn-modal-close" onClick={() => setFormOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {errorMsg && (
              <div style={{ color: 'var(--color-danger)', fontSize: '0.875rem', fontWeight: '600', marginBottom: '12px' }}>
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleCreateTeacher} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Full Name *</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Dr. Nguyen Van A"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="e.g. anv@fpt.edu.vn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Employee Code *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. FE12345"
                    value={employeeCode}
                    onChange={(e) => setEmployeeCode(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">Department *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="e.g. Software Engineering"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                    disabled={submitting}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Username (Optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. nva_teacher"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={submitting}
                />
              </div>

              <div className="modal-actions-row">
                <button 
                  type="button" 
                  className="btn-modal-cancel" 
                  onClick={() => setFormOpen(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn-modal-submit"
                  disabled={submitting}
                >
                  {submitting ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Show One-Time Temporary Password */}
      {tempPasswordModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 1200 }}>
          <div className="modal-container" style={{ maxWidth: '440px', textAlign: 'center', padding: '32px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '-16px', marginRight: '-8px' }}>
              <button className="btn-modal-close" onClick={() => setTempPasswordModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                color: 'var(--color-success)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Key size={28} />
              </div>

              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--color-text)', margin: 0 }}>
                Temporary Password Generated
              </h3>

              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
                ⚠️ Save this password now. It will <strong>only be shown once</strong>. The teacher must change this password on their first login.
              </p>

              {/* Password display strip */}
              <div style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                backgroundColor: 'var(--color-surface-alt)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                fontFamily: 'monospace',
                fontSize: '1.15rem',
                fontWeight: 700,
                color: 'var(--color-text)'
              }}>
                <span>{tempPasswordValue}</span>
                <button 
                  onClick={handleCopyPassword}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: copied ? 'var(--color-success)' : 'var(--color-text-secondary)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                  title="Copy Password"
                >
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>

              <button 
                onClick={() => setTempPasswordModalOpen(false)}
                className="btn-modal-submit"
                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-sm)' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminTeachersPage;
