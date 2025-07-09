const express = require('express');
const SmtpAccount = require('../models/SmtpAccount');

const router = express.Router();
const smtpModel = new SmtpAccount();

// GET /api/smtp - Ambil semua SMTP accounts
router.get('/', async (req, res) => {
    try {
        const accounts = await smtpModel.getActiveAccounts();
        res.json({
            success: true,
            data: accounts
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/smtp/stats - Ambil statistik penggunaan SMTP
router.get('/stats', async (req, res) => {
    try {
        const stats = await smtpModel.getUsageStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/smtp/:id - Ambil SMTP account berdasarkan ID
router.get('/:id', async (req, res) => {
    try {
        const account = await smtpModel.getById(req.params.id);
        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'SMTP account tidak ditemukan'
            });
        }
        
        // Jangan kirim password dalam response
        delete account.password;
        
        res.json({
            success: true,
            data: account
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/smtp - Tambah SMTP account baru
router.post('/', async (req, res) => {
    try {
        const { name, host, port, username, password, from_name, from_email, daily_limit } = req.body;
        
        // Validasi input
        if (!name || !host || !username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, host, username, dan password wajib diisi'
            });
        }

        const accountData = {
            name,
            host,
            port: port || 587,
            username,
            password,
            from_name: from_name || name,
            from_email: from_email || username,
            daily_limit: daily_limit || 1000
        };

        const accountId = await smtpModel.create(accountData);
        
        res.status(201).json({
            success: true,
            message: 'SMTP account berhasil ditambahkan',
            data: { id: accountId }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/smtp/:id - Update SMTP account
router.put('/:id', async (req, res) => {
    try {
        const { name, host, port, username, password, from_name, from_email, daily_limit, is_active } = req.body;
        
        const accountData = {
            name,
            host,
            port: port || 587,
            username,
            password,
            from_name,
            from_email,
            daily_limit: daily_limit || 1000,
            is_active: is_active !== undefined ? is_active : 1
        };

        await smtpModel.update(req.params.id, accountData);
        
        res.json({
            success: true,
            message: 'SMTP account berhasil diupdate'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/smtp/:id - Hapus SMTP account
router.delete('/:id', async (req, res) => {
    try {
        await smtpModel.delete(req.params.id);
        
        res.json({
            success: true,
            message: 'SMTP account berhasil dihapus'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/smtp/:id/test - Test koneksi SMTP account
router.post('/:id/test', async (req, res) => {
    try {
        const result = await smtpModel.testConnection(req.params.id);
        
        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/smtp/reset-counters - Reset daily counters
router.post('/reset-counters', async (req, res) => {
    try {
        await smtpModel.resetDailyCounters();
        
        res.json({
            success: true,
            message: 'Daily counters berhasil direset'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
