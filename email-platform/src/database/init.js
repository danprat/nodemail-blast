const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

class DatabaseInitializer {
    constructor() {
        this.dbPath = process.env.DB_PATH || './data/email_platform.db';
        this.dataDir = path.dirname(this.dbPath);
    }

    async init() {
        try {
            // Buat folder data jika belum ada
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
                console.log(`✅ Folder data dibuat: ${this.dataDir}`);
            }

            // Baca schema SQL
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');

            // Buat database dan tabel
            const db = new sqlite3.Database(this.dbPath);
            
            await new Promise((resolve, reject) => {
                db.exec(schema, (err) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });

            console.log('✅ Database berhasil diinisialisasi');
            
            // Insert sample SMTP accounts jika belum ada
            await this.insertSampleData(db);
            
            db.close();
            console.log('✅ Setup database selesai');
            
        } catch (error) {
            console.error('❌ Error saat inisialisasi database:', error);
            process.exit(1);
        }
    }

    async insertSampleData(db) {
        return new Promise((resolve, reject) => {
            // Cek apakah sudah ada SMTP accounts
            db.get('SELECT COUNT(*) as count FROM smtp_accounts', (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }

                if (row.count === 0) {
                    // Insert sample SMTP account
                    const sampleAccount = `
                        INSERT INTO smtp_accounts (name, host, port, username, password, from_name, from_email, daily_limit)
                        VALUES (
                            'LARK Account 1',
                            'smtp.larksuite.com',
                            587,
                            'your-email@yourcompany.com',
                            'your-app-password',
                            'Your Company',
                            'noreply@yourcompany.com',
                            1000
                        )
                    `;

                    db.run(sampleAccount, (err) => {
                        if (err) {
                            console.log('⚠️  Warning: Gagal insert sample SMTP account:', err.message);
                        } else {
                            console.log('✅ Sample SMTP account berhasil ditambahkan');
                        }
                        resolve();
                    });
                } else {
                    console.log('ℹ️  SMTP accounts sudah ada, skip sample data');
                    resolve();
                }
            });
        });
    }
}

// Jalankan jika file ini dipanggil langsung
if (require.main === module) {
    require('dotenv').config();
    const initializer = new DatabaseInitializer();
    initializer.init();
}

module.exports = DatabaseInitializer;
