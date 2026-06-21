# Research 4 Student

Nền tảng hỗ trợ tự học, định hướng và cộng tác nghiên cứu khoa học dành cho sinh viên và giảng viên tại Đại học FPT. Dự án sử dụng mô hình Monorepo chứa cả mã nguồn Client (React) và Server (Node.js).

---

## PHẦN 1 — Tổng quan & Yêu cầu hệ thống

**Research 4 Student (R4S)** là cổng thông tin trực tuyến tích hợp giúp sinh viên dễ dàng tiếp cận danh mục tài liệu nghiên cứu, duyệt kiến thức khoa học cơ bản, tải thư viện đề cương mẫu, và tương tác trao đổi học thuật thông qua diễn đàn chung hoặc nhóm cộng tác nghiên cứu.

### 1. Yêu cầu hệ thống
Để triển khai dự án này, hệ thống cần đáp ứng các điều kiện sau:
- **Node.js**: Phiên bản `>= 20.x` (khuyên dùng bản LTS mới nhất).
- **npm**: Quản lý gói thư viện (đi kèm Node.js).
- **PM2**: Quản lý tiến trình Node.js chạy ngầm ở môi trường Production.
- **Nginx & Certbot**: Cài đặt trên VPS Ubuntu làm reverse proxy và tự động gia hạn chứng chỉ HTTPS.

### 2. Cấu trúc thư mục Monorepo
```text
research4student/
├── .env                    # Biến môi trường (KHÔNG commit lên Git)
├── .env.example            # Mẫu biến môi trường (an toàn để commit)
├── client/                 # Mã nguồn React Frontend (Vite)
│   ├── dist/               # Thư mục chứa các file static sau khi build
│   ├── src/                # File code React (Components, Pages, Contexts, Layouts)
│   └── package.json
├── server/                 # Mã nguồn Express Backend
│   ├── src/
│   │   ├── db/
│   │   │   ├── connections.js # Kết nối 7 cơ sở dữ liệu SQLite riêng biệt
│   │   │   ├── data/       # Chứa các file dữ liệu vật lý (.db)
│   │   │   └── schema/     # File SQL cấu trúc khởi tạo các bảng
│   │   ├── index.js        # Điểm chạy chính của Backend Server
│   │   └── app.js          # Khởi tạo Express app
│   └── package.json
└── README.md               # Tài liệu hướng dẫn thiết lập hệ thống (file này)
```

---

## PHẦN 2 — Thiết lập đăng nhập Google (Google Cloud Console)

Hệ thống sử dụng **Google Identity Services (GIS)** với nút bấm đăng nhập trực tiếp tại Frontend để lấy ID Token (credential) rồi gửi lên Backend xác thực. Luồng này chỉ sử dụng **Client ID** (không cần Client Secret hay Redirect URI).

Quy trình thiết lập như sau:

1. Truy cập vào **[Google Cloud Console](https://console.cloud.google.com/)**, tạo một Project mới hoặc chọn một Project đã có sẵn của bạn.
2. Thiết lập màn hình đồng ý OAuth (**OAuth consent screen**):
   - Vào menu bên trái chọn **APIs & Services** > **OAuth consent screen**.
   - Chọn User Type là **External** và nhấn **Create**.
   - Điền đầy đủ thông tin bắt buộc: Tên ứng dụng (*Research 4 Student*), email hỗ trợ, và thông tin liên hệ nhà phát triển.
   - Tại màn hình **Scopes**, thêm các quyền cơ bản: `.../auth/userinfo.email` và `.../auth/userinfo.profile`.
   - **Quan trọng (Testing Mode)**: Tại màn hình **Test users**, bạn cần thêm danh sách các tài khoản email Google sẽ dùng để đăng nhập thử nghiệm. Nếu không thêm, tài khoản đó sẽ bị Google từ chối truy cập cho đến khi ứng dụng được Publish.
3. Tạo thông tin xác thực OAuth (**Credentials**):
   - Chọn tab **Credentials** ở menu bên trái.
   - Nhấn **Create Credentials** ở trên cùng và chọn **OAuth client ID**.
   - Chọn Application type là **Web application**.
4. Thiết lập nguồn gốc JavaScript hợp lệ (**Authorized JavaScript origins**):
   - Tại mục này, bạn điền toàn bộ các URL nguồn gốc sẽ chạy giao diện Frontend:
     - Môi trường phát triển: `http://localhost:5173`
     - Môi trường Production: `https://research4student.io.vn` và `https://www.research4student.io.vn`
   - **Lưu ý đặc biệt**: Mục **Authorized redirect URIs** để trống hoàn toàn (KHÔNG điền gì cả) vì chúng ta sử dụng luồng đăng nhập GIS một chạm thay vì cơ chế chuyển hướng truyền thống.
5. Sau khi lưu, Google sẽ hiển thị thông tin Client của bạn. Copy chuỗi **Client ID** (chuỗi ký tự có đuôi `.apps.googleusercontent.com`). Bạn không cần lưu trữ hay sử dụng Client Secret.
6. Dán Client ID đã copy vào file `.env` ở thư mục gốc ở **cả 2 biến** (phải đảm bảo giống hệt nhau):
   - `GOOGLE_CLIENT_ID` (dùng ở phía Backend)
   - `VITE_GOOGLE_CLIENT_ID` (dùng ở phía Frontend)
   > [!IMPORTANT]
   > Giá trị Client ID ở cả client và server bắt buộc phải khớp nhau tuyệt đối. Backend dùng Client ID này làm `audience` để giải mã và xác thực token gửi lên; nếu hai đầu lệch nhau, việc đăng nhập sẽ luôn báo lỗi xác thực token không hợp lệ (`INVALID_GOOGLE_TOKEN`).
7. **Lưu ý về HTTPS**: Thư viện Google Identity Services chặn tất cả các yêu cầu đăng nhập từ nguồn gốc không mã hóa (HTTP) ở Production. Vì thế, nút đăng nhập Google chỉ hoạt động ở môi trường thực tế sau khi bạn hoàn thành cấu hình tên miền HTTPS hợp lệ (Xem chi tiết ở Phần 5).
8. Khi ứng dụng đã sẵn sàng cho tất cả sinh viên đăng nhập ngoài danh sách thử nghiệm, truy cập lại mục **OAuth consent screen** và nhấn nút **Publish App**.

---

## PHẦN 3 — Bảng giải thích toàn bộ biến môi trường

File `.env` được đặt duy nhất tại **thư mục gốc** (`research4student/.env`) và được khai báo trong `.gitignore` để đảm bảo an toàn bảo mật. Bạn cần tạo file này bằng cách nhân bản từ `.env.example` rồi điền giá trị thật tương ứng:

```bash
cp .env.example .env
# Mở file .env vừa tạo và điền các giá trị thật vào
```

### 1. Biến môi trường phía Backend (Server)

| Tên biến | Ý nghĩa | Cách lấy giá trị / Ví dụ |
| :--- | :--- | :--- |
| `PORT` | Cổng dịch vụ Backend lắng nghe nhận yêu cầu. | Mặc định: `4000` |
| `CLIENT_URL` | Domain của Frontend, dùng để định hình cấu hình CORS. | Dev: `http://localhost:5173`<br>Prod: `https://research4student.io.vn` |
| `JWT_SECRET` | Chuỗi ký tự bí mật để ký và xác thực token JWT phiên làm việc. | **Tạo ngẫu nhiên** qua Terminal bằng lệnh:<br>`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `JWT_EXPIRES_IN` | Thời hạn hiệu lực của Token phiên làm việc. | Ví dụ: `7d` (7 ngày) |
| `GOOGLE_CLIENT_ID` | Client ID dùng để giải mã xác thực thông tin đăng nhập Google. | Lấy từ Google Cloud Console (Xem Phần 2). |
| `ADMIN_EMAIL` | Email đăng nhập của tài khoản Quản trị viên hệ thống duy nhất. | Ví dụ: `admin@research4student.io.vn` |
| `ADMIN_PASSWORD` | Mật khẩu tài khoản Quản trị viên hệ thống duy nhất. | Nhập một mật khẩu ngẫu nhiên có độ bảo mật cao, đổi giá trị mặc định trước khi chạy thực tế. |
| `DISCORD_BOT_TOKEN` | Token điều khiển Discord Bot để lưu trữ file tài liệu. | Truy cập [Discord Developer Portal](https://discord.com/developers/applications), tạo ứng dụng, vào tab **Bot** > Bấm **Reset Token** và sao chép. |
| `DISCORD_STORAGE_CHANNEL_ID` | ID của Channel Text trên Discord dùng làm kho lưu trữ file. | Bật chế độ nhà phát triển (Developer Mode) trong Discord, nhấn chuột phải vào channel cần lưu trữ chọn **Copy Channel ID**. |
| `MAX_UPLOAD_SIZE_MB` | Dung lượng tối đa (MB) cho phép tải lên hệ thống. | Ví dụ: `10` |
| `CDN_REFRESH_CRON` | Chu kỳ cron tự động làm mới liên kết CDN hết hạn của Discord. | Mặc định: `0 */12 * * *` (Chạy định kỳ mỗi 12 giờ) |
| `TURNSTILE_SECRET_KEY` | Khóa bí mật dùng để xác thực captcha chống spam Cloudflare. | Đăng nhập [Cloudflare Dashboard](https://dash.cloudflare.com/), vào phần **Turnstile**, tạo site và lấy khóa **Secret Key**. |

> [!WARNING]
> Discord Bot của bạn bắt buộc phải được mời vào server chứa channel lưu trữ và được phân quyền tối thiểu: `Send Messages` (Gửi tin nhắn), `Attach Files` (Đính kèm file), và `Read Message History` (Đọc lịch sử tin nhắn) trên channel được chọn.

### 2. Biến môi trường phía Frontend (Client — tiền tố `VITE_`)

| Tên biến | Ý nghĩa | Cách lấy giá trị / Ví dụ |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Đường dẫn API Endpoint gốc mà Client sẽ gọi. | Dev: `http://localhost:4000/api`<br>Prod: `/api` |
| `VITE_GOOGLE_CLIENT_ID` | Client ID đồng bộ để render nút đăng nhập Google ở Client. | **Phải khớp 100%** với `GOOGLE_CLIENT_ID` ở trên. |
| `VITE_ADMIN_ROUTE` | Đường dẫn URL bí mật dẫn tới trang đăng nhập Quản trị viên. | Ví dụ: `/portal-mgmt-7f3a`. Khuyến khích đổi sang chuỗi ngẫu nhiên khó đoán để tránh tấn công dò mật khẩu. |
| `VITE_TURNSTILE_SITE_KEY` | Khóa công khai của Cloudflare Turnstile để render widget captcha. | Lấy từ trang cấu hình Turnstile trên Cloudflare (Khóa **Site Key**, khác với Secret Key). |

---

## PHẦN 4 — Chạy ở môi trường Development

### Bước 1: Tạo file môi trường
Tại thư mục gốc của dự án, tạo file `.env` từ mẫu và điền các giá trị thật:
```bash
cp .env.example .env
# Mở file .env vừa tạo và điền các giá trị thật vào
```

### Bước 2: Khởi động Backend Server
Mở một cửa sổ Terminal mới tại thư mục gốc của dự án:
```bash
cd server
npm install
npm run dev
```
*Lưu ý*: Trong lần đầu tiên khởi động, hệ thống sẽ tự động quét thư mục `src/db/schema/` để tạo các file cơ sở dữ liệu SQLite trống (dạng `.db`) đặt tại thư mục `server/src/db/data/`.

### Bước 3: Khởi động Client
Mở thêm một cửa sổ Terminal thứ hai tại thư mục gốc của dự án:
```bash
cd client
npm install
npm run dev
```
Sau đó truy cập giao diện phát triển tại địa chỉ: `http://localhost:5173`

---

## PHẦN 5 — Build & chạy Production (VPS Ubuntu + Nginx)

Hướng dẫn này giả định bạn đã có một máy chủ ảo VPS chạy hệ điều hành Ubuntu, đã trỏ tên miền `research4student.io.vn` về IP của máy chủ.

### 1. Build ứng dụng Frontend tĩnh
Tại môi trường phát triển hoặc ngay trên VPS (nếu RAM >= 2GB), di chuyển vào thư mục client và tiến hành đóng gói:
```bash
cd client
npm install
npm run build
```
Mã nguồn tĩnh hoàn chỉnh sẽ được tạo ra tại thư mục `client/dist/`. Bạn cần copy thư mục `client/dist/` này lên thư mục lưu trữ static của VPS (ví dụ: `/var/www/research4student/client/dist`).

### 2. Thiết lập và chạy Backend bằng PM2
Di chuyển vào thư mục server trên máy chủ VPS:
```bash
cd server
npm install --omit=dev
npm install -g pm2
pm2 start src/index.js --name r4s-api
pm2 save
pm2 startup
```
*Ghi chú*: Hãy đảm bảo file `.env` ở thư mục gốc trên VPS đã được cấu hình biến `CLIENT_URL=https://research4student.io.vn` để chính sách CORS của Node.js chấp nhận yêu cầu từ tên miền chính thức của bạn.

### 3. Cấu hình Nginx Reverse Proxy
Tạo một file cấu hình Nginx mới trên VPS:
```bash
sudo nano /etc/nginx/sites-available/research4student.io.vn
```
Dán nội dung cấu hình mẫu dưới đây vào file (hãy chắc chắn điều chỉnh đường dẫn `root` cho đúng thực tế):
```nginx
server {
    listen 80;
    server_name research4student.io.vn www.research4student.io.vn;

    # Đường dẫn trỏ tới thư mục chứa code Frontend tĩnh đã build
    root /var/www/research4student/client/dist;
    index index.html;

    # Cấu hình định tuyến cho React Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy các yêu cầu API về cho Node.js chạy ở PORT 4000
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
Kích hoạt cấu hình và tải lại Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/research4student.io.vn /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 4. Cấu hình HTTPS SSL bằng Certbot
Để nút đăng nhập Google hoạt động bình thường, máy chủ bắt buộc phải chạy HTTPS. Hãy chạy các câu lệnh dưới đây để Certbot tự động lấy chứng chỉ Let's Encrypt và tự động ghi đè cấu hình HTTPS lên file Nginx:
```bash
sudo apt update
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d research4student.io.vn -d www.research4student.io.vn
```
Chọn tùy chọn tự động redirect tất cả lưu lượng truy cập HTTP sang HTTPS khi được hỏi.

### 5. Checklist sau khi triển khai hệ thống
Sau khi hoàn thành tất cả các bước cấu hình, bạn cần kiểm thử thủ công theo danh sách sau để đảm bảo hệ thống vận hành đúng chuẩn:
- [ ] Truy cập đường dẫn `https://research4student.io.vn` tải được giao diện Web mượt mà, không gặp lỗi.
- [ ] Truy cập trực tiếp đường dẫn kiểm tra sức khỏe hệ thống `https://research4student.io.vn/api/health` trả về kết quả JSON dạng `{"data":{"status":"ok"}}`.
- [ ] Nút **Sign in with Google** hiển thị đầy đủ ở giao diện đăng nhập và thực hiện đăng nhập tài khoản sinh viên thành công.
- [ ] Truy cập đường dẫn ẩn quản trị viên `https://research4student.io.vn<VITE_ADMIN_ROUTE>` hiển thị giao diện đăng nhập hệ thống nội bộ và đăng nhập thành công với tài khoản Admin.
- [ ] Vào cài đặt hồ sơ cá nhân (`/profile`), thử tải lên một hình ảnh đại diện (avatar) mới, xác nhận ảnh tải lên thành công và hiển thị nguồn ảnh trỏ từ Discord CDN.
- [ ] Vào mục cộng đồng nghiên cứu, đăng thử một bài viết mới và kiểm tra xem hệ thống kiểm soát cooldown spam và Turnstile Captcha hoạt động bình thường.

### 6. Ghi chú vận hành và bảo trì
- **Sao lưu cơ sở dữ liệu**: Toàn bộ dữ liệu của dự án được phân chia độc lập tại 7 file `.db` trong thư mục `server/src/db/data/`. SQLite không tự động sao lưu trực tuyến, do đó bạn nên viết script cron định kỳ copy các file dữ liệu này sang một phân vùng lưu trữ dự phòng ngoài VPS.
- **Áp dụng cập nhật mã nguồn**:
  - Khi thay đổi mã nguồn Backend: Cần chạy lệnh `pm2 restart r4s-api` trên VPS để Node.js khởi động lại và nhận mã mới.
  - Khi thay đổi mã nguồn Frontend: Chạy build lại ở Client (`npm run build`) và copy đè thư mục build mới vào `/var/www/research4student/client/dist`. Bạn không cần phải khởi động lại Nginx.
  - Khi thay đổi cấu hình file cấu hình Nginx: Chạy lệnh `sudo systemctl reload nginx` để áp dụng.
- **Bảo mật**: Tuyệt đối không tiết lộ mật khẩu quản trị viên (`ADMIN_PASSWORD`), các khóa bí mật (`JWT_SECRET`, `TURNSTILE_SECRET_KEY`), Discord Bot Token, và đường dẫn quản trị ẩn (`VITE_ADMIN_ROUTE`) lên các kênh công khai hoặc kho lưu trữ Git dùng chung.

## Bật các tính năng tuỳ chọn sau khi đã có cấu hình

| Tính năng | Biến môi trường cần điền | Sau khi điền |
|---|---|---|
| Đăng nhập Google | `.env`: `GOOGLE_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID` (2 giá trị phải GIỐNG NHAU) | Build lại client (`npm run build`) và restart server (`pm2 restart r4s-api`) |
| CAPTCHA (Cloudflare Turnstile) | `.env`: `TURNSTILE_SECRET_KEY` + `VITE_TURNSTILE_SITE_KEY` | Build lại client và restart server |
| Lưu file qua Discord | `.env`: `DISCORD_BOT_TOKEN` + `DISCORD_STORAGE_CHANNEL_ID` | Restart server |

Có thể kiểm tra trạng thái hiện tại của 3 tính năng bằng cách gọi `GET /api/config`.

