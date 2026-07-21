# Chi tiết Lược đồ Cơ sở dữ liệu (Database Schema)

Dự án sử dụng **7 kết nối cơ sở dữ liệu SQLite riêng biệt**, nằm độc lập tại thư mục `server/src/db/data/`. Do không chia sẻ kết nối chung nên **không thực hiện câu lệnh SQL JOIN chéo giữa các database**.

Dưới đây là chi tiết cấu hình lược đồ (schema) và mục đích sử dụng của từng bảng:

---

## 1. users.sql (Database: `users.db`)
Lưu trữ thông tin tài khoản người dùng và thông tin chi tiết của giảng viên.

### Bảng `users`
*Mục đích*: Lưu thông tin định danh tài khoản, phân quyền, cấu hình giao diện cá nhân và trạng thái hoạt động.
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('student','teacher')),
  email TEXT NOT NULL UNIQUE,
  google_id TEXT UNIQUE,
  password_hash TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  username TEXT UNIQUE,
  display_name TEXT,
  avatar_file_id INTEGER,
  bio TEXT,
  language_pref TEXT NOT NULL DEFAULT 'en',
  theme_pref TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','banned')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
```

### Bảng `teacher_profiles`
*Mục đích*: Lưu trữ thông tin chi tiết của giảng viên (mã giảng viên, khoa công tác) liên kết với bảng `users`.
```sql
CREATE TABLE IF NOT EXISTS teacher_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  employee_code TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL,
  created_by_admin_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 2. community.sql (Database: `community.db`)
Lưu trữ thông tin về bài viết diễn đàn, bình luận, tương tác và các nhóm dự án nghiên cứu khoa học.

### Bảng `posts`
*Mục đích*: Lưu bài viết trong diễn đàn chung hoặc trong nhóm dự án nghiên cứu khoa học.
```sql
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL,
  project_id INTEGER,
  title TEXT,
  content TEXT NOT NULL,
  tags TEXT,
  attachment_file_id INTEGER,
  status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden','deleted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
```

### Bảng `comments`
*Mục đích*: Lưu trữ bình luận của bài viết, hỗ trợ cấu trúc lồng nhau phân cấp cây (replies).
```sql
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL,
  parent_comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden','deleted')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Bảng `reactions`
*Mục đích*: Lưu trữ tương tác thể hiện cảm xúc (like) của người dùng đối với bài viết hoặc bình luận.
```sql
CREATE TABLE IF NOT EXISTS reactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL CHECK(target_type IN ('post','comment')),
  target_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'like',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_type, target_id, user_id)
);
```

### Bảng `projects`
*Mục đích*: Lưu thông tin chung của nhóm nghiên cứu do sinh viên thiết lập.
```sql
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'recruiting' CHECK(status IN ('recruiting','in_progress','completed','archived')),
  visibility TEXT NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','private')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
```

### Bảng `project_members`
*Mục đích*: Quản lý danh sách thành viên thuộc nhóm nghiên cứu.
```sql
CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('owner','member')),
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);
```

### Bảng `project_invites`
*Mục đích*: Lưu trữ trạng thái lời mời cộng tác tham gia dự án gửi tới các sinh viên khác.
```sql
CREATE TABLE IF NOT EXISTS project_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  invited_user_id INTEGER NOT NULL,
  invited_by INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 3. files.sql (Database: `files.db`)
Lưu trữ thông tin siêu dữ liệu các tệp tin đính kèm được lưu trữ tại Discord CDN.

### Bảng `files`
*Mục đích*: Quản lý liên kết CDN, ngày tệp tin hết hạn (Discord CDN hết hạn sau 24h) phục vụ tác vụ refresh liên kết tự động.
```sql
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uploader_id INTEGER NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  purpose TEXT NOT NULL,
  discord_message_id TEXT NOT NULL,
  discord_channel_id TEXT NOT NULL,
  cdn_url TEXT NOT NULL,
  cdn_url_expires_at TEXT,
  last_refreshed_at TEXT NOT NULL DEFAULT (datetime('now')),
  refresh_failed_at TEXT,
  is_dead INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 4. guides.sql (Database: `guides.db`)
Lưu trữ thư viện các mẫu đề cương hướng dẫn nghiên cứu khoa học.

### Bảng `guides`
*Mục đích*: Lưu trữ thông tin tài liệu, tệp đính kèm và cấu hình phân quyền truy cập (Free/Pro).
```sql
CREATE TABLE IF NOT EXISTS guides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  file_id INTEGER NOT NULL,
  access_level TEXT NOT NULL DEFAULT 'free' CHECK(access_level IN ('free','pro')),
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
```

---

## 5. knowledge.sql (Database: `knowledge.db`)
Lưu trữ danh mục kiến thức cơ bản về nghiên cứu khoa học.

### Bảng `subjects`
*Mục đích*: Lưu trữ thông tin môn học nghiên cứu khoa học (ví dụ: Phương pháp nghiên cứu).
```sql
CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Bảng `topics`
*Mục đích*: Lưu trữ các chủ đề nghiên cứu khoa học nằm trong một môn học.
```sql
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  UNIQUE(subject_id, slug)
);
```

### Bảng `articles`
*Mục đích*: Lưu trữ nội dung hướng dẫn chi tiết (hỗ trợ Markdown) của từng chủ đề.
```sql
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  pdf_file_id INTEGER,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
```

---

## 6. moderation.sql (Database: `moderation.db`)
Lưu trữ thông tin liên quan tới tác vụ kiểm duyệt nội dung và chống spam.

### Bảng `banned_keywords`
*Mục đích*: Lưu trữ các từ khóa bị cấm lọc tự động ở bài viết/bình luận.
```sql
CREATE TABLE IF NOT EXISTS banned_keywords (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL UNIQUE,
  match_type TEXT NOT NULL DEFAULT 'contains' CHECK(match_type IN ('contains','exact','regex')),
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Bảng `reports`
*Mục đích*: Hàng đợi báo cáo vi phạm nội dung của người dùng gửi lên Admin phê duyệt.
```sql
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','resolved','dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Bảng `action_logs`
*Mục đích*: Lưu trữ lịch sử ghi nhận hoạt động gửi bài viết/bình luận phục vụ tính năng cooldown chống spam tặc.
```sql
CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## 7. resources.sql (Database: `resources.db`)
Lưu trữ danh mục trang web, công cụ hữu ích cho nghiên cứu khoa học.

### Bảng `research_websites`
*Mục đích*: Quản lý thông tin công cụ, phân loại truy cập, liên kết, danh sách từ khóa tags (lưu dạng JSON string).
```sql
CREATE TABLE IF NOT EXISTS research_websites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_by INTEGER NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  short_description TEXT,
  full_description TEXT,
  access_type TEXT NOT NULL DEFAULT 'free' CHECK(access_type IN ('free','paid')),
  icon_file_id INTEGER,
  target_audience TEXT,
  features TEXT,
  status TEXT NOT NULL DEFAULT 'published' CHECK(status IN ('draft','published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);
```
