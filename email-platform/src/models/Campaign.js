const { getDatabase } = require('../database/connection');

class Campaign {
    constructor() {
        this.db = getDatabase();
    }

    // Ambil semua kampanye dengan pagination
    async getAll(page = 1, limit = 20) {
        const offset = (page - 1) * limit;
        const sql = `
            SELECT 
                c.*,
                ROUND((c.emails_sent * 100.0 / NULLIF(c.total_recipients, 0)), 2) as progress_percentage
            FROM campaigns c
            ORDER BY c.created_at DESC 
            LIMIT ? OFFSET ?
        `;
        
        const countSql = 'SELECT COUNT(*) as total FROM campaigns';
        
        const campaigns = await this.db.query(sql, [limit, offset]);
        const totalResult = await this.db.get(countSql);
        
        return {
            campaigns,
            total: totalResult.total,
            page,
            limit,
            totalPages: Math.ceil(totalResult.total / limit)
        };
    }

    // Ambil kampanye berdasarkan ID
    async getById(id) {
        const sql = `
            SELECT 
                c.*,
                ROUND((c.emails_sent * 100.0 / NULLIF(c.total_recipients, 0)), 2) as progress_percentage
            FROM campaigns c
            WHERE c.id = ?
        `;
        return await this.db.get(sql, [id]);
    }

    // Buat kampanye baru
    async create(campaignData) {
        const sql = `
            INSERT INTO campaigns (name, subject, html_content, text_content, scheduled_at)
            VALUES (?, ?, ?, ?, ?)
        `;
        const params = [
            campaignData.name,
            campaignData.subject,
            campaignData.html_content || null,
            campaignData.text_content || null,
            campaignData.scheduled_at || null
        ];
        
        const result = await this.db.run(sql, params);
        return result.id;
    }

    // Update kampanye
    async update(id, campaignData) {
        const sql = `
            UPDATE campaigns 
            SET name = ?, subject = ?, html_content = ?, text_content = ?, 
                scheduled_at = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'draft'
        `;
        const params = [
            campaignData.name,
            campaignData.subject,
            campaignData.html_content,
            campaignData.text_content,
            campaignData.scheduled_at,
            id
        ];
        
        const result = await this.db.run(sql, params);
        if (result.changes === 0) {
            throw new Error('Kampanye tidak dapat diupdate (mungkin sudah berjalan)');
        }
        return result;
    }

    // Hapus kampanye (hanya yang draft)
    async delete(id) {
        const sql = 'DELETE FROM campaigns WHERE id = ? AND status = "draft"';
        const result = await this.db.run(sql, [id]);
        if (result.changes === 0) {
            throw new Error('Kampanye tidak dapat dihapus (mungkin sudah berjalan)');
        }
        return result;
    }

    // Update status kampanye
    async updateStatus(id, status, additionalData = {}) {
        let sql = 'UPDATE campaigns SET status = ?, updated_at = CURRENT_TIMESTAMP';
        let params = [status];

        if (status === 'sending' && !additionalData.started_at) {
            sql += ', started_at = CURRENT_TIMESTAMP';
        }
        
        if (status === 'completed' && !additionalData.completed_at) {
            sql += ', completed_at = CURRENT_TIMESTAMP';
        }

        if (additionalData.total_recipients) {
            sql += ', total_recipients = ?';
            params.push(additionalData.total_recipients);
        }

        sql += ' WHERE id = ?';
        params.push(id);

        return await this.db.run(sql, params);
    }

    // Update counter email terkirim
    async incrementEmailSent(id) {
        const sql = `
            UPDATE campaigns 
            SET emails_sent = emails_sent + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        return await this.db.run(sql, [id]);
    }

    // Update counter email gagal
    async incrementEmailFailed(id) {
        const sql = `
            UPDATE campaigns 
            SET emails_failed = emails_failed + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        return await this.db.run(sql, [id]);
    }

    // Ambil kampanye yang siap dikirim
    async getReadyToSend() {
        const sql = `
            SELECT * FROM campaigns 
            WHERE status = 'scheduled' 
            AND (scheduled_at IS NULL OR scheduled_at <= CURRENT_TIMESTAMP)
            ORDER BY scheduled_at ASC
        `;
        return await this.db.query(sql);
    }

    // Ambil statistik kampanye
    async getStats(id) {
        const sql = `
            SELECT 
                c.id,
                c.name,
                c.status,
                c.total_recipients,
                c.emails_sent,
                c.emails_failed,
                COUNT(eq.id) as queued_emails,
                COUNT(CASE WHEN eq.status = 'sent' THEN 1 END) as sent_count,
                COUNT(CASE WHEN eq.status = 'failed' THEN 1 END) as failed_count,
                COUNT(CASE WHEN eq.status = 'pending' THEN 1 END) as pending_count
            FROM campaigns c
            LEFT JOIN email_queue eq ON c.id = eq.campaign_id
            WHERE c.id = ?
            GROUP BY c.id
        `;
        return await this.db.get(sql, [id]);
    }

    // Ambil laporan detail kampanye
    async getDetailReport(id) {
        const campaign = await this.getById(id);
        if (!campaign) {
            throw new Error('Kampanye tidak ditemukan');
        }

        // Statistik per SMTP account
        const smtpStats = await this.db.query(`
            SELECT 
                sa.name as smtp_name,
                COUNT(eq.id) as total_emails,
                COUNT(CASE WHEN eq.status = 'sent' THEN 1 END) as sent,
                COUNT(CASE WHEN eq.status = 'failed' THEN 1 END) as failed
            FROM email_queue eq
            JOIN smtp_accounts sa ON eq.smtp_account_id = sa.id
            WHERE eq.campaign_id = ?
            GROUP BY sa.id, sa.name
        `, [id]);

        // Email yang gagal dengan error message
        const failedEmails = await this.db.query(`
            SELECT 
                c.email,
                eq.error_message,
                eq.retry_count,
                eq.updated_at
            FROM email_queue eq
            JOIN contacts c ON eq.contact_id = c.id
            WHERE eq.campaign_id = ? AND eq.status = 'failed'
            ORDER BY eq.updated_at DESC
            LIMIT 100
        `, [id]);

        return {
            campaign,
            smtp_stats: smtpStats,
            failed_emails: failedEmails
        };
    }

    // Pause kampanye
    async pause(id) {
        return await this.updateStatus(id, 'paused');
    }

    // Resume kampanye
    async resume(id) {
        return await this.updateStatus(id, 'sending');
    }

    // Duplicate kampanye
    async duplicate(id) {
        const original = await this.getById(id);
        if (!original) {
            throw new Error('Kampanye tidak ditemukan');
        }

        const newCampaign = {
            name: `${original.name} (Copy)`,
            subject: original.subject,
            html_content: original.html_content,
            text_content: original.text_content
        };

        return await this.create(newCampaign);
    }
}

module.exports = Campaign;
