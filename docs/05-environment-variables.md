# Các biến môi trường (Environment Variables)

Các cấu hình hệ thống ở môi trường Development và Production được kiểm soát qua các tệp tin `.env` đặt tại gốc thư mục `client/` và `server/`.

---

## 1. Cấu hình Frontend (`client/.env`)

| Biến môi trường | Ý nghĩa | Tập tin sử dụng | Giá trị mẫu / Mặc định |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Địa chỉ gốc dẫn tới API Backend của hệ thống. | `client/src/api/client.js` | `http://localhost:4000/api` |
| `VITE_GOOGLE_CLIENT_ID` | Client ID công khai dùng để hiển thị nút Đăng nhập bằng Google. | `client/src/pages/LoginPage.jsx` | `(Để trống mặc định)` |
| `VITE_ADMIN_ROUTE` | Đường dẫn bí mật dẫn tới trang Đăng nhập Quản trị viên. | `client/src/App.jsx`, `LoginPage.jsx` | `/portal-mgmt-7f3a` |
| `VITE_TURNSTILE_SITE_KEY` | Khóa công khai của Cloudflare Turnstile để render widget Captcha. | `client/src/components/Turnstile.jsx` | `(Để trống mặc định)` |

---

## 2. Cấu hình Backend (`server/.env`)

| Biến môi trường | Ý nghĩa | Tập tin sử dụng | Giá trị mẫu / Mặc định |
| :--- | :--- | :--- | :--- |
| `PORT` | Cổng dịch vụ lắng nghe yêu cầu HTTP của Express. | `server/src/index.js` | `4000` |
| `CLIENT_URL` | Tên miền nguồn gốc của Client phục vụ cấu hình CORS. | `server/src/app.js` | `http://localhost:5173` |
| `JWT_SECRET` | Chuỗi ký tự khóa bí mật dùng để tạo chữ ký cho phiên JWT. | `server/src/utils/jwt.js` | `(Để trống mặc định)` |
| `JWT_EXPIRES_IN` | Thời hạn hiệu lực tối đa của Token JWT. | `server/src/utils/jwt.js` | `7d` |
| `GOOGLE_CLIENT_ID` | Client ID dùng để xác thực token Google gửi lên. Phải trùng khớp 100% với biến phía Client. | `server/src/routes/auth.js`, `server/src/config/features.js` | `(Để trống mặc định)` |
| `ADMIN_EMAIL` | Email đăng nhập của tài khoản Quản trị viên tĩnh duy nhất. | `server/src/routes/auth.js` | `admin@research4student.io.vn` |
| `ADMIN_PASSWORD` | Mật khẩu tài khoản Quản trị viên tĩnh duy nhất. | `server/src/routes/auth.js` | `change-me-please` |
| `DISCORD_BOT_TOKEN` | Mã Token kết nối với Bot Discord để lưu trữ tệp CDN. | `server/src/services/discordClient.js`, `server/src/config/features.js` | `(Để trống mặc định)` |
| `DISCORD_STORAGE_CHANNEL_ID` | ID của Text Channel dùng làm kho lưu trữ CDN tệp tin đính kèm. | `server/src/services/discordStorage.js`, `server/src/config/features.js` | `(Để trống mặc định)` |
| `MAX_UPLOAD_SIZE_MB` | Kích thước tệp tin tối đa (MB) cho phép tải lên hệ thống. | `server/src/routes/files.js`, `server/src/routes/users.js` | `10` |
| `CDN_REFRESH_CRON` | Chu kỳ cron tự động chạy nền làm mới các tệp Discord CDN hết hạn. | `server/src/services/cdnRefresher.js` | `*/10 * * * *` |
| `CDN_REFRESH_MARGIN_MINUTES` | Ký lại URL trước thời điểm hết hạn bao nhiêu phút. | `server/src/services/discordStorage.js` | `60` |
| `PUBLIC_FILE_BASE_URL` | Origin tuyệt đối của API, chỉ cần khi Client và Server khác domain. Để trống sẽ phát URL tương đối `/api/files/:id/raw`. | `server/src/services/discordStorage.js` | `(Để trống mặc định)` |
| `TURNSTILE_SECRET_KEY` | Khóa bí mật dùng để gửi yêu cầu xác minh Captcha lên Cloudflare. | `server/src/middleware/turnstile.js`, `server/src/config/features.js` | `(Để trống mặc định)` |
