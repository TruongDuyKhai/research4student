import React, { useState, useEffect } from 'react';
import { Search, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react';
import client from '../api/client';

const AdminUsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  const fetchUsers = async (activePage = page) => {
    setLoading(true);
    try {
      const res = await client.get(`/admin/users?role=student&page=${activePage}&limit=${limit}&search=${encodeURIComponent(search)}`);
      setUsers(res.data.data || []);
      setTotal(res.data.pagination?.total || 0);
    } catch (err) {
      console.error('Failed to load students list:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchUsers(1);
  };

  const handleDeleteUser = async (userId, username) => {
    const confirmed = window.confirm(
      `⚠️ PERMANENT DELETE\n\nThis will permanently delete the account "@${username}" and all their data.\n\nThis action CANNOT be undone. Type the username to confirm:\n\n(Click OK to proceed)`
    );
    if (!confirmed) return;

    try {
      await client.delete(`/admin/users/${userId}`);
      fetchUsers();
    } catch (err) {
      console.error('Failed to delete student:', err);
      alert(err.response?.data?.error?.message || 'Failed to delete student account.');
    }
  };

  // Toggle user status (active / banned)
  const handleToggleStatus = async (userId, username, currentStatus) => {
    const nextStatus = currentStatus === 'active' ? 'banned' : 'active';
    const actionLabel = currentStatus === 'active' ? 'BAN' : 'UNBAN';
    
    if (!window.confirm(`Are you sure you want to ${actionLabel} student "@${username}"?`)) return;

    try {
      await client.patch(`/admin/users/${userId}/status`, { status: nextStatus });
      fetchUsers();
    } catch (err) {
      console.error('Failed to toggle user status:', err);
      alert('Failed to update student status.');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Page Title */}
      <div className="admin-page-title-row">
        <h2 className="admin-page-title">Manage Students</h2>
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
              placeholder="Search students by username, name, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn-admin-primary" style={{ backgroundColor: 'var(--color-text)', color: 'var(--color-surface)' }}>
            Search
          </button>
        </form>
      </div>

      {/* Students Table Card */}
      <div className="admin-card">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>Loading students database...</div>
        ) : users.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>No students found.</div>
        ) : (
          <>
            <div className="admin-table-wrapper">
              <div className="table-responsive">
                <table className="admin-table">
                <thead>
                  <tr>
                    <th className="admin-th">Username</th>
                    <th className="admin-th">Display Name</th>
                    <th className="admin-th">Email</th>
                    <th className="admin-th">Joined</th>
                    <th className="admin-th">Status</th>
                    <th className="admin-th" style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const formattedDate = new Date(u.created_at.replace(' ', 'T') + 'Z').toLocaleDateString();
                    return (
                      <tr key={u.id}>
                        <td className="admin-td" style={{ fontWeight: '700' }}>@{u.username}</td>
                        <td className="admin-td">{u.display_name}</td>
                        <td className="admin-td">{u.email}</td>
                        <td className="admin-td">{formattedDate}</td>
                        <td className="admin-td">
                          <span className={`admin-status-badge status-${u.status}`}>
                            {u.status}
                          </span>
                        </td>
                        <td className="admin-td" style={{ textAlign: 'right', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                          {u.status === 'active' ? (
                            <button
                              className="btn-table-action-delete"
                              onClick={() => handleToggleStatus(u.id, u.username, u.status)}
                              title="Ban Student"
                            >
                              <ShieldAlert size={12} />
                              <span>Ban</span>
                            </button>
                          ) : (
                            <button
                              className="btn-table-action-edit"
                              style={{ borderColor: 'var(--color-success)', color: 'var(--color-success)', backgroundColor: 'transparent' }}
                              onClick={() => handleToggleStatus(u.id, u.username, u.status)}
                              title="Unban Student"
                            >
                              <ShieldCheck size={12} style={{ color: 'var(--color-success)' }} />
                              <span>Unban</span>
                            </button>
                          )}
                          <button
                            className="btn-table-action-delete"
                            style={{ backgroundColor: '#7f1d1d', borderColor: '#991b1b', color: 'white' }}
                            onClick={() => handleDeleteUser(u.id, u.username)}
                            title="Permanently Delete Account"
                          >
                            <Trash2 size={12} />
                            <span>Delete</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                </table>
              </div>
            </div>

            {/* Table Pagination */}
            {total > limit && (
              <div className="admin-pagination-row">
                <span className="admin-pagination-info">
                  Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} students
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

    </div>
  );
};

export default AdminUsersPage;
