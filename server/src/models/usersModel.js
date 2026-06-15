const { usersDb, filesDb } = require('../db/connections');

/**
 * Find user by email
 * @param {string} email
 * @returns {object|undefined}
 */
function findByEmail(email) {
  return usersDb.prepare('SELECT * FROM users WHERE email = ?').get(email);
}

/**
 * Find user by ID
 * @param {number} id
 * @returns {object|undefined}
 */
function findById(id) {
  return usersDb.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/**
 * Find user by username
 * @param {string} username
 * @returns {object|undefined}
 */
function findByUsername(username) {
  return usersDb.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/**
 * Find user by google_id
 * @param {string} googleId
 * @returns {object|undefined}
 */
function findByGoogleId(googleId) {
  return usersDb.prepare('SELECT * FROM users WHERE google_id = ?').get(googleId);
}

/**
 * Create a new student user
 * @param {object} param0 - { email, google_id, display_name }
 * @returns {object}
 */
function createStudent({ email, google_id, display_name }) {
  const info = usersDb.prepare(`
    INSERT INTO users (role, email, google_id, display_name, status)
    VALUES ('student', ?, ?, ?, 'active')
  `).run(email, google_id, display_name);
  return findById(info.lastInsertRowid);
}

/**
 * Create a new student user with password credentials
 * @param {object} param0 - { email, password_hash, display_name }
 * @returns {object}
 */
function createStudentWithPassword({ email, password_hash, display_name }) {
  const info = usersDb.prepare(`
    INSERT INTO users (role, email, password_hash, display_name, status)
    VALUES ('student', ?, ?, ?, 'active')
  `).run(email, password_hash, display_name);
  return findById(info.lastInsertRowid);
}

/**
 * Create a new teacher user with teacher_profile in a single transaction
 * @param {object} param0 - { email, password_hash, username, display_name, employee_code, department }
 * @returns {object}
 */
function createTeacher({ email, password_hash, username, display_name, employee_code, department }) {
  const transaction = usersDb.transaction(() => {
    const info = usersDb.prepare(`
      INSERT INTO users (role, email, password_hash, must_change_password, username, display_name, status)
      VALUES ('teacher', ?, ?, 1, ?, ?, 'active')
    `).run(email, password_hash, username, display_name);

    const userId = info.lastInsertRowid;

    usersDb.prepare(`
      INSERT INTO teacher_profiles (user_id, employee_code, department)
      VALUES (?, ?, ?)
    `).run(userId, employee_code, department);

    return userId;
  });

  const userId = transaction();
  return findById(userId);
}

/**
 * Update user fields
 * @param {number} id
 * @param {object} updates
 * @returns {object}
 */
function updateUser(id, updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) return findById(id);

  const sets = keys.map(key => `${key} = ?`).join(', ');
  const values = keys.map(key => updates[key]);
  values.push(id);

  usersDb.prepare(`
    UPDATE users
    SET ${sets}, updated_at = datetime('now')
    WHERE id = ?
  `).run(...values);

  return findById(id);
}

/**
 * Update user password and clear must_change_password flag
 * @param {number} id
 * @param {string} passwordHash
 * @returns {object}
 */
function setPasswordHash(id, passwordHash) {
  usersDb.prepare(`
    UPDATE users
    SET password_hash = ?, must_change_password = 0, updated_at = datetime('now')
    WHERE id = ?
  `).run(passwordHash, id);
  return findById(id);
}

/**
 * Get teacher profile details
 * @param {number} userId
 * @returns {object|undefined}
 */
function getTeacherProfile(userId) {
  return usersDb.prepare('SELECT * FROM teacher_profiles WHERE user_id = ?').get(userId);
}

function getFullUserProfile(userId) {
  const profile = usersDb.prepare(`
    SELECT 
      u.id, u.role, u.email, u.must_change_password, u.username, u.display_name, 
      u.avatar_file_id, u.bio, u.language_pref, u.theme_pref, u.status, u.created_at, u.updated_at,
      tp.employee_code, tp.department
    FROM users u
    LEFT JOIN teacher_profiles tp ON u.id = tp.user_id
    WHERE u.id = ?
  `).get(userId);

  if (profile) {
    profile.avatar_url = null;
    if (profile.avatar_file_id) {
      const file = filesDb.prepare('SELECT cdn_url FROM files WHERE id = ?').get(profile.avatar_file_id);
      if (file) profile.avatar_url = file.cdn_url;
    }
    if (profile.role !== 'teacher') {
      delete profile.employee_code;
      delete profile.department;
    }
    profile.must_change_password = !!profile.must_change_password;
  }
  return profile;
}

module.exports = {
  findByEmail,
  findById,
  findByUsername,
  findByGoogleId,
  createStudent,
  createStudentWithPassword,
  createTeacher,
  updateUser,
  setPasswordHash,
  getTeacherProfile,
  getFullUserProfile
};
