const express = require('express');
const SmtpAccount = require('../models/SmtpAccount');
const Contact = require('../models/Contact');
const Campaign = require('../models/Campaign');
const EmailQueue = require('../models/EmailQueue');
const EmailSender = require('../services/EmailSender');

const router = express.Router();
const smtpModel = new SmtpAccount();
const contactModel = new Contact();
const campaignModel = new Campaign();
const queueModel = new EmailQueue();
const emailSender = new EmailSender();

// GET /api/dashboard - Dashboard utama
router.get('/', async (req, res) => {
    try {
        // Statistik umum
        const contactStats = await contactModel.getStats();
        const queueStats = await queueModel.getStats();
        const smtpStats = await smtpModel.getUsageStats();
        const senderStatus = emailSender.getStatus();

        // Kampanye terbaru
        const recentCampaigns = await campaignModel.getAll(1, 5);

        // Aktivitas hari ini (bisa diperluas)
        const todayActivity = {
            emails_sent: queueStats.sent || 0,
            emails_failed: queueStats.failed || 0,
            emails_pending: queueStats.pending || 0
        };

        res.json({
            success: true,
            data: {
                overview: {
                    total_contacts: contactStats.total,
                    active_contacts: contactStats.active,
                    blacklisted_contacts: contactStats.blacklisted,
                    total_smtp_accounts: smtpStats.length,
                    active_smtp_accounts: smtpStats.filter(s => s.is_active).length,
                    emails_in_queue: queueStats.pending + queueStats.retry,
                    sender_running: senderStatus.is_running
                },
                today_activity: todayActivity,
                smtp_usage: smtpStats,
                recent_campaigns: recentCampaigns.campaigns,
                queue_stats: queueStats,
                sender_status: senderStatus
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/dashboard/stats/hourly - Statistik per jam (24 jam terakhir)
router.get('/stats/hourly', async (req, res) => {
    try {
        // Query untuk statistik per jam
        const { getDatabase } = require('../database/connection');
        const db = getDatabase();
        
        const hourlyStats = await db.query(`
            SELECT 
                strftime('%H', created_at) as hour,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
            FROM email_logs 
            WHERE created_at >= datetime('now', '-24 hours')
            GROUP BY strftime('%H', created_at)
            ORDER BY hour
        `);

        // Fill missing hours with 0
        const hours = Array.from({ length: 24 }, (_, i) => {
            const hour = i.toString().padStart(2, '0');
            const existing = hourlyStats.find(s => s.hour === hour);
            return {
                hour,
                sent: existing ? existing.sent : 0,
                failed: existing ? existing.failed : 0
            };
        });

        res.json({
            success: true,
            data: hours
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/dashboard/stats/daily - Statistik per hari (30 hari terakhir)
router.get('/stats/daily', async (req, res) => {
    try {
        const { getDatabase } = require('../database/connection');
        const db = getDatabase();
        
        const dailyStats = await db.query(`
            SELECT 
                date(created_at) as date,
                COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent,
                COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
            FROM email_logs 
            WHERE created_at >= datetime('now', '-30 days')
            GROUP BY date(created_at)
            ORDER BY date
        `);

        res.json({
            success: true,
            data: dailyStats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/dashboard/campaigns/active - Kampanye yang sedang aktif
router.get('/campaigns/active', async (req, res) => {
    try {
        const { getDatabase } = require('../database/connection');
        const db = getDatabase();
        
        const activeCampaigns = await db.query(`
            SELECT 
                c.*,
                COUNT(eq.id) as queued_emails,
                COUNT(CASE WHEN eq.status = 'sent' THEN 1 END) as sent_count,
                COUNT(CASE WHEN eq.status = 'failed' THEN 1 END) as failed_count,
                COUNT(CASE WHEN eq.status = 'pending' THEN 1 END) as pending_count,
                ROUND((COUNT(CASE WHEN eq.status = 'sent' THEN 1 END) * 100.0 / NULLIF(COUNT(eq.id), 0)), 2) as progress
            FROM campaigns c
            LEFT JOIN email_queue eq ON c.id = eq.campaign_id
            WHERE c.status IN ('sending', 'scheduled')
            GROUP BY c.id
            ORDER BY c.started_at DESC
        `);

        res.json({
            success: true,
            data: activeCampaigns
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/dashboard/errors/recent - Error terbaru
router.get('/errors/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        
        const { getDatabase } = require('../database/connection');
        const db = getDatabase();
        
        const recentErrors = await db.query(`
            SELECT 
                el.contact_email,
                el.response_message,
                el.created_at,
                c.name as campaign_name,
                sa.name as smtp_account_name
            FROM email_logs el
            JOIN campaigns c ON el.campaign_id = c.id
            JOIN smtp_accounts sa ON el.smtp_account_id = sa.id
            WHERE el.status = 'failed'
            ORDER BY el.created_at DESC
            LIMIT ?
        `, [limit]);

        res.json({
            success: true,
            data: recentErrors
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/dashboard/sender/start - Mulai email sender
router.post('/sender/start', async (req, res) => {
    try {
        if (emailSender.isRunning) {
            return res.status(400).json({
                success: false,
                message: 'Email sender sudah berjalan'
            });
        }

        // Jalankan email sender di background
        emailSender.processQueue().catch(error => {
            console.error('Error dalam email sender:', error);
        });

        res.json({
            success: true,
            message: 'Email sender berhasil dimulai'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/dashboard/sender/stop - Hentikan email sender
router.post('/sender/stop', async (req, res) => {
    try {
        emailSender.stop();
        
        res.json({
            success: true,
            message: 'Email sender berhasil dihentikan'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/dashboard/sender/status - Status email sender
router.get('/sender/status', (req, res) => {
    try {
        const status = emailSender.getStatus();
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/dashboard/queue/retry-failed - Retry email yang gagal
router.post('/queue/retry-failed', async (req, res) => {
    try {
        const result = await queueModel.retryFailed();
        
        res.json({
            success: true,
            message: `${result.changes} email berhasil dijadwalkan ulang`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/dashboard/queue/cleanup - Bersihkan antrian lama
router.post('/queue/cleanup', async (req, res) => {
    try {
        const daysOld = parseInt(req.body.days_old) || 30;
        const result = await queueModel.cleanup(daysOld);
        
        res.json({
            success: true,
            message: `${result.changes} email lama berhasil dihapus`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/dashboard/health - Health check
router.get('/health', async (req, res) => {
    try {
        const { getDatabase } = require('../database/connection');
        const db = getDatabase();
        
        // Test database connection
        await db.get('SELECT 1');
        
        // Check SMTP accounts
        const activeSmtpAccounts = await smtpModel.getActiveAccounts();
        
        const health = {
            database: 'ok',
            smtp_accounts: activeSmtpAccounts.length > 0 ? 'ok' : 'warning',
            email_sender: emailSender.isRunning ? 'running' : 'stopped',
            timestamp: new Date().toISOString()
        };

        res.json({
            success: true,
            data: health
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
            data: {
                database: 'error',
                timestamp: new Date().toISOString()
            }
        });
    }
});

module.exports = router;
