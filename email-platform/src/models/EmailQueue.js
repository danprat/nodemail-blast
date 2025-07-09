const { getDatabase } = require('../database/connection');

class EmailQueue {
    constructor() {
        this.db = getDatabase();
    }

    // Tambah email ke antrian
    async add(campaignId, contactId, smtpAccountId, priority = 1, scheduledAt = null) {
        const sql = `
            INSERT INTO email_queue (campaign_id, contact_id, smtp_account_id, priority, scheduled_at)
            VALUES (?, ?, ?, ?, ?)
        `;
        const params = [
            campaignId,
            contactId,
            smtpAccountId,
            priority,
            scheduledAt || new Date().toISOString()
        ];
        
        const result = await this.db.run(sql, params);
        return result.id;
    }

    // Tambah banyak email ke antrian (bulk)
    async bulkAdd(emails) {
        const results = [];
        
        await this.db.transaction(async (db) => {
            for (const email of emails) {
                const sql = `
                    INSERT INTO email_queue (campaign_id, contact_id, smtp_account_id, priority, scheduled_at)
                    VALUES (?, ?, ?, ?, ?)
                `;
                const params = [
                    email.campaign_id,
                    email.contact_id,
                    email.smtp_account_id,
                    email.priority || 1,
                    email.scheduled_at || new Date().toISOString()
                ];
                
                const result = await db.run(sql, params);
                results.push(result.id);
            }
        });

        return results;
    }

    // Ambil email berikutnya untuk dikirim
    async getNext(limit = 1) {
        const sql = `
            SELECT 
                eq.*,
                c.email as contact_email,
                c.first_name,
                c.last_name,
                c.company,
                camp.subject,
                camp.html_content,
                camp.text_content,
                sa.host as smtp_host,
                sa.port as smtp_port,
                sa.username as smtp_username,
                sa.password as smtp_password,
                sa.from_name,
                sa.from_email
            FROM email_queue eq
            JOIN contacts c ON eq.contact_id = c.id
            JOIN campaigns camp ON eq.campaign_id = camp.id
            JOIN smtp_accounts sa ON eq.smtp_account_id = sa.id
            WHERE eq.status = 'pending' 
            AND eq.scheduled_at <= CURRENT_TIMESTAMP
            AND sa.is_active = 1
            AND sa.emails_sent_today < sa.daily_limit
            ORDER BY eq.priority DESC, eq.created_at ASC
            LIMIT ?
        `;
        
        if (limit === 1) {
            return await this.db.get(sql, [limit]);
        } else {
            return await this.db.query(sql, [limit]);
        }
    }

    // Update status email di antrian
    async updateStatus(id, status, errorMessage = null, messageId = null) {
        let sql = `
            UPDATE email_queue 
            SET status = ?, updated_at = CURRENT_TIMESTAMP
        `;
        let params = [status];

        if (status === 'sent') {
            sql += ', sent_at = CURRENT_TIMESTAMP';
        }

        if (errorMessage) {
            sql += ', error_message = ?';
            params.push(errorMessage);
        }

        if (status === 'failed' || status === 'retry') {
            sql += ', retry_count = retry_count + 1';
        }

        sql += ' WHERE id = ?';
        params.push(id);

        const result = await this.db.run(sql, params);
        
        // Log ke email_logs
        await this.logEmail(id, status, errorMessage, messageId);
        
        return result;
    }

    // Log email ke tabel email_logs
    async logEmail(queueId, status, responseMessage = null, messageId = null) {
        // Ambil data queue untuk logging
        const queueData = await this.db.get(`
            SELECT eq.campaign_id, c.email, eq.smtp_account_id
            FROM email_queue eq
            JOIN contacts c ON eq.contact_id = c.id
            WHERE eq.id = ?
        `, [queueId]);

        if (!queueData) return;

        const sql = `
            INSERT INTO email_logs (queue_id, campaign_id, contact_email, smtp_account_id, status, message_id, response_message)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        const params = [
            queueId,
            queueData.campaign_id,
            queueData.email,
            queueData.smtp_account_id,
            status,
            messageId,
            responseMessage
        ];

        return await this.db.run(sql, params);
    }

    // Retry email yang gagal
    async retryFailed(maxRetries = 3) {
        const sql = `
            UPDATE email_queue 
            SET status = 'pending', 
                scheduled_at = datetime('now', '+' || (retry_count * 5) || ' minutes'),
                updated_at = CURRENT_TIMESTAMP
            WHERE status = 'failed' 
            AND retry_count < ?
        `;
        
        return await this.db.run(sql, [maxRetries]);
    }

    // Ambil statistik antrian
    async getStats() {
        const sql = `
            SELECT 
                status,
                COUNT(*) as count
            FROM email_queue
            GROUP BY status
        `;
        
        const stats = await this.db.query(sql);
        
        // Convert ke object untuk kemudahan akses
        const result = {
            pending: 0,
            sending: 0,
            sent: 0,
            failed: 0,
            retry: 0
        };

        stats.forEach(stat => {
            result[stat.status] = stat.count;
        });

        return result;
    }

    // Ambil antrian berdasarkan kampanye
    async getByCampaign(campaignId, page = 1, limit = 100) {
        const offset = (page - 1) * limit;
        
        const sql = `
            SELECT 
                eq.*,
                c.email as contact_email,
                c.first_name,
                c.last_name,
                sa.name as smtp_account_name
            FROM email_queue eq
            JOIN contacts c ON eq.contact_id = c.id
            JOIN smtp_accounts sa ON eq.smtp_account_id = sa.id
            WHERE eq.campaign_id = ?
            ORDER BY eq.created_at DESC
            LIMIT ? OFFSET ?
        `;
        
        const countSql = `
            SELECT COUNT(*) as total 
            FROM email_queue 
            WHERE campaign_id = ?
        `;
        
        const emails = await this.db.query(sql, [campaignId, limit, offset]);
        const totalResult = await this.db.get(countSql, [campaignId]);
        
        return {
            emails,
            total: totalResult.total,
            page,
            limit,
            totalPages: Math.ceil(totalResult.total / limit)
        };
    }

    // Hapus email dari antrian (hanya yang pending)
    async remove(id) {
        const sql = 'DELETE FROM email_queue WHERE id = ? AND status = "pending"';
        const result = await this.db.run(sql, [id]);
        
        if (result.changes === 0) {
            throw new Error('Email tidak dapat dihapus (mungkin sudah diproses)');
        }
        
        return result;
    }

    // Bersihkan antrian lama (email yang sudah terkirim > 30 hari)
    async cleanup(daysOld = 30) {
        const sql = `
            DELETE FROM email_queue 
            WHERE status IN ('sent', 'failed') 
            AND updated_at < datetime('now', '-' || ? || ' days')
        `;
        
        return await this.db.run(sql, [daysOld]);
    }

    // Pause semua email dalam kampanye
    async pauseCampaign(campaignId) {
        const sql = `
            UPDATE email_queue 
            SET status = 'paused',
                updated_at = CURRENT_TIMESTAMP
            WHERE campaign_id = ? AND status = 'pending'
        `;
        
        return await this.db.run(sql, [campaignId]);
    }

    // Resume semua email dalam kampanye
    async resumeCampaign(campaignId) {
        const sql = `
            UPDATE email_queue 
            SET status = 'pending',
                updated_at = CURRENT_TIMESTAMP
            WHERE campaign_id = ? AND status = 'paused'
        `;
        
        return await this.db.run(sql, [campaignId]);
    }
}

module.exports = EmailQueue;
