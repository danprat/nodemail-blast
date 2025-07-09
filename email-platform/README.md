# 🚀 LARK Email Platform

Platform pengiriman email masal dengan multiple SMTP LARK accounts. Mendukung hingga 40,000+ kontak dengan sistem antrian, load balancing, dan monitoring real-time.

## ✨ Fitur Utama

- **Multiple SMTP Accounts**: Rotasi otomatis untuk distribusi beban
- **Bulk Email**: Kirim ke ribuan kontak sekaligus
- **Queue System**: Antrian email dengan retry mechanism
- **Rate Limiting**: Mencegah blocking dari provider email
- **Contact Management**: Import/export CSV, deduplikasi
- **Campaign Management**: Buat dan kelola kampanye email
- **Real-time Monitoring**: Dashboard dengan statistik live
- **Template System**: Personalisasi email dengan placeholder

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite3
- **Email**: Nodemailer
- **Frontend**: Vanilla HTML/CSS/JS
- **File Processing**: CSV parser/writer

## 📦 Instalasi

### 1. Clone Repository
```bash
cd email-platform
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Environment
```bash
cp .env.example .env
# Edit .env dengan konfigurasi SMTP LARK Anda
```

### 4. Initialize Database
```bash
npm run init-db
```

### 5. Start Application
```bash
# Development
npm run dev

# Production
npm start
```

Aplikasi akan berjalan di `http://localhost:3000`

## ⚙️ Konfigurasi SMTP LARK

Edit file `.env` dan tambahkan akun SMTP LARK:

```env
# LARK SMTP Account 1
LARK_SMTP_HOST_1=smtp.larksuite.com
LARK_SMTP_PORT_1=587
LARK_SMTP_USER_1=your-email-1@company.com
LARK_SMTP_PASS_1=your-app-password-1

# LARK SMTP Account 2
LARK_SMTP_HOST_2=smtp.larksuite.com
LARK_SMTP_PORT_2=587
LARK_SMTP_USER_2=your-email-2@company.com
LARK_SMTP_PASS_2=your-app-password-2
```

Atau tambahkan melalui API/Dashboard setelah aplikasi berjalan.

## 📚 API Documentation

### SMTP Accounts
- `GET /api/smtp` - List SMTP accounts
- `POST /api/smtp` - Add new SMTP account
- `PUT /api/smtp/:id` - Update SMTP account
- `DELETE /api/smtp/:id` - Delete SMTP account
- `POST /api/smtp/:id/test` - Test SMTP connection

### Contacts
- `GET /api/contacts` - List contacts (with pagination)
- `POST /api/contacts` - Add new contact
- `PUT /api/contacts/:id` - Update contact
- `DELETE /api/contacts/:id` - Delete contact
- `POST /api/contacts/import` - Import from CSV
- `GET /api/contacts/export/csv` - Export to CSV

### Campaigns
- `GET /api/campaigns` - List campaigns
- `POST /api/campaigns` - Create new campaign
- `PUT /api/campaigns/:id` - Update campaign
- `POST /api/campaigns/:id/start` - Start campaign
- `POST /api/campaigns/:id/pause` - Pause campaign
- `GET /api/campaigns/:id/stats` - Campaign statistics

### Dashboard
- `GET /api/dashboard` - Dashboard overview
- `POST /api/dashboard/sender/start` - Start email sender
- `POST /api/dashboard/sender/stop` - Stop email sender
- `GET /api/dashboard/health` - Health check

## 🚀 Quick Start Guide

### 1. Tambah SMTP Account
```bash
curl -X POST http://localhost:3000/api/smtp \
  -H "Content-Type: application/json" \
  -d '{
    "name": "LARK Account 1",
    "host": "smtp.larksuite.com",
    "port": 587,
    "username": "your-email@company.com",
    "password": "your-app-password",
    "from_name": "Your Company",
    "from_email": "noreply@company.com",
    "daily_limit": 1000
  }'
```

### 2. Import Kontak dari CSV
```bash
curl -X POST http://localhost:3000/api/contacts/import \
  -F "csv_file=@contacts.csv"
```

### 3. Buat Kampanye
```bash
curl -X POST http://localhost:3000/api/campaigns \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Newsletter Januari",
    "subject": "Halo {{first_name}}, ada update terbaru!",
    "html_content": "<h1>Halo {{first_name}}!</h1><p>Terima kasih sudah bergabung dengan {{company}}.</p>",
    "text_content": "Halo {{first_name}}! Terima kasih sudah bergabung."
  }'
```

### 4. Mulai Kampanye
```bash
curl -X POST http://localhost:3000/api/campaigns/1/start \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 5. Start Email Sender
```bash
curl -X POST http://localhost:3000/api/dashboard/sender/start
```

## 📊 Monitoring

### Dashboard Web
Akses `http://localhost:3000` untuk dashboard web dengan:
- Overview statistik
- Status email sender
- Kampanye aktif
- SMTP account usage
- Error logs

### API Monitoring
```bash
# Health check
curl http://localhost:3000/api/health

# Dashboard stats
curl http://localhost:3000/api/dashboard

# Queue stats
curl http://localhost:3000/api/dashboard/queue/stats
```

## 🔧 Advanced Configuration

### Rate Limiting
```env
RATE_LIMIT_PER_MINUTE=60  # emails per minute per account
```

### Database Path
```env
DB_PATH=./data/email_platform.db
```

### Email Templates
Gunakan placeholder berikut dalam subject dan content:
- `{{first_name}}` - Nama depan
- `{{last_name}}` - Nama belakang
- `{{full_name}}` - Nama lengkap
- `{{email}}` - Email address
- `{{company}}` - Nama perusahaan

## 🛡️ Best Practices

### SMTP Configuration
1. Gunakan app password, bukan password utama
2. Set daily limit sesuai kebijakan LARK
3. Monitor usage untuk menghindari blocking
4. Test koneksi sebelum kampanye besar

### Contact Management
1. Selalu validasi email sebelum import
2. Bersihkan duplikat secara berkala
3. Respect blacklist dan unsubscribe
4. Backup data kontak secara rutin

### Campaign Management
1. Test email ke diri sendiri dulu
2. Gunakan subject line yang menarik
3. Sediakan versi text dan HTML
4. Monitor bounce rate dan deliverability

## 🐛 Troubleshooting

### Email Sender Tidak Jalan
```bash
# Check status
curl http://localhost:3000/api/dashboard/sender/status

# Start sender
curl -X POST http://localhost:3000/api/dashboard/sender/start
```

### SMTP Connection Error
```bash
# Test SMTP connection
curl -X POST http://localhost:3000/api/smtp/1/test
```

### Database Issues
```bash
# Reinitialize database
npm run init-db
```

### High Memory Usage
- Kurangi batch size import
- Cleanup queue secara berkala
- Monitor log files

## 📝 Development

### Project Structure
```
email-platform/
├── src/
│   ├── database/          # Database schema & connection
│   ├── models/           # Data models
│   ├── routes/           # API routes
│   ├── services/         # Business logic
│   └── app.js           # Main application
├── public/              # Static files (dashboard)
├── data/               # SQLite database
└── temp/               # Temporary files
```

### Running Tests
```bash
npm test
```

### Contributing
1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📄 License

MIT License - lihat file LICENSE untuk detail.

## 🤝 Support

Untuk pertanyaan atau bantuan:
- Create issue di GitHub
- Email: support@yourcompany.com

---

**⚡ Happy Emailing with LARK! ⚡**
