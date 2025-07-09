const { getDatabase } = require('../database/connection');

class SmtpAccount {
    constructor() {
        this.db = getDatabase();
    }

    // Ambil semua SMTP accounts yang aktif
    async getActiveAccounts() {
        const sql = `
            SELECT * FROM smtp_accounts 
            WHERE is_active = 1 
            ORDER BY emails_sent_today ASC, last_used ASC
        `;
        return await this.db.query(sql);
    }

    // Ambil account berdasarkan ID
    async getById(id) {
        const sql = 'SELECT * FROM smtp_accounts WHERE id = ?';
        return await this.db.get(sql, [id]);
    }

    // Tambah SMTP account baru
    async create(accountData) {
        const sql = `
            INSERT INTO smtp_accounts (name, host, port, username, password, from_name, from_email, daily_limit)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            accountData.name,
            accountData.host,
            accountData.port || 587,
            accountData.username,
            accountData.password,
            accountData.from_name,
            accountData.from_email,
            accountData.daily_limit || 1000
        ];
        
        const result = await this.db.run(sql, params);
        return result.id;
    }

    // Update SMTP account
    async update(id, accountData) {
        const sql = `
            UPDATE smtp_accounts 
            SET name = ?, host = ?, port = ?, username = ?, password = ?, 
                from_name = ?, from_email = ?, daily_limit = ?, is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        const params = [
            accountData.name,
            accountData.host,
            accountData.port,
            accountData.username,
            accountData.password,
            accountData.from_name,
            accountData.from_email,
            accountData.daily_limit,
            accountData.is_active,
            id
        ];
        
        return await this.db.run(sql, params);
    }

    // Hapus SMTP account
    async delete(id) {
        const sql = 'DELETE FROM smtp_accounts WHERE id = ?';
        return await this.db.run(sql, [id]);
    }

    // Pilih account terbaik untuk pengiriman (load balancing)
    async selectBestAccount() {
        const sql = `
            SELECT * FROM smtp_accounts 
            WHERE is_active = 1 AND emails_sent_today < daily_limit
            ORDER BY emails_sent_today ASC, last_used ASC
            LIMIT 1
        `;
        return await this.db.get(sql);
    }

    // Update counter pengiriman email
    async incrementEmailCount(id) {
        const sql = `
            UPDATE smtp_accounts 
            SET emails_sent_today = emails_sent_today + 1,
                last_used = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        return await this.db.run(sql, [id]);
    }

    // Reset counter harian (untuk dijadwalkan setiap hari)
    async resetDailyCounters() {
        const sql = `
            UPDATE smtp_accounts 
            SET emails_sent_today = 0,
                updated_at = CURRENT_TIMESTAMP
        `;
        return await this.db.run(sql);
    }

    // Ambil statistik penggunaan
    async getUsageStats() {
        const sql = `
            SELECT 
                id,
                name,
                emails_sent_today,
                daily_limit,
                ROUND((emails_sent_today * 100.0 / daily_limit), 2) as usage_percentage,
                is_active,
                last_used
            FROM smtp_accounts
            ORDER BY usage_percentage DESC
        `;
        return await this.db.query(sql);
    }

    // Test koneksi SMTP account
    async testConnection(id) {
        const account = await this.getById(id);
        if (!account) {
            throw new Error('SMTP account tidak ditemukan');
        }

        const nodemailer = require('nodemailer');
        
        const transporter = nodemailer.createTransport({
            host: account.host,
            port: account.port,
            secure: account.port === 465,
            auth: {
                user: account.username,
                pass: account.password
            }
        });

        try {
            await transporter.verify();
            return { success: true, message: 'Koneksi berhasil' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }
}

module.exports = SmtpAccount;
