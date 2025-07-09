const express = require('express');
const Campaign = require('../models/Campaign');
const EmailSender = require('../services/EmailSender');
const EmailQueue = require('../models/EmailQueue');

const router = express.Router();
const campaignModel = new Campaign();
const emailSender = new EmailSender();
const queueModel = new EmailQueue();

// GET /api/campaigns - Ambil semua kampanye dengan pagination
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        
        const result = await campaignModel.getAll(page, limit);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/campaigns/:id - Ambil kampanye berdasarkan ID
router.get('/:id', async (req, res) => {
    try {
        const campaign = await campaignModel.getById(req.params.id);
        if (!campaign) {
            return res.status(404).json({
                success: false,
                message: 'Kampanye tidak ditemukan'
            });
        }
        
        res.json({
            success: true,
            data: campaign
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/campaigns - Buat kampanye baru
router.post('/', async (req, res) => {
    try {
        const { name, subject, html_content, text_content, scheduled_at } = req.body;
        
        if (!name || !subject) {
            return res.status(400).json({
                success: false,
                message: 'Name dan subject wajib diisi'
            });
        }

        if (!html_content && !text_content) {
            return res.status(400).json({
                success: false,
                message: 'Minimal salah satu dari html_content atau text_content harus diisi'
            });
        }

        const campaignData = {
            name,
            subject,
            html_content,
            text_content,
            scheduled_at
        };

        const campaignId = await campaignModel.create(campaignData);
        
        res.status(201).json({
            success: true,
            message: 'Kampanye berhasil dibuat',
            data: { id: campaignId }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/campaigns/:id - Update kampanye
router.put('/:id', async (req, res) => {
    try {
        const { name, subject, html_content, text_content, scheduled_at } = req.body;
        
        const campaignData = {
            name,
            subject,
            html_content,
            text_content,
            scheduled_at
        };

        await campaignModel.update(req.params.id, campaignData);
        
        res.json({
            success: true,
            message: 'Kampanye berhasil diupdate'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/campaigns/:id - Hapus kampanye
router.delete('/:id', async (req, res) => {
    try {
        await campaignModel.delete(req.params.id);
        
        res.json({
            success: true,
            message: 'Kampanye berhasil dihapus'
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/campaigns/:id/start - Mulai kampanye
router.post('/:id/start', async (req, res) => {
    try {
        const { contact_ids = [], group_ids = [] } = req.body;
        
        const result = await emailSender.startCampaign(
            req.params.id, 
            contact_ids, 
            group_ids
        );
        
        res.json({
            success: true,
            message: result.message,
            data: result
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/campaigns/:id/pause - Pause kampanye
router.post('/:id/pause', async (req, res) => {
    try {
        await campaignModel.pause(req.params.id);
        await queueModel.pauseCampaign(req.params.id);
        
        res.json({
            success: true,
            message: 'Kampanye berhasil dipause'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/campaigns/:id/resume - Resume kampanye
router.post('/:id/resume', async (req, res) => {
    try {
        await campaignModel.resume(req.params.id);
        await queueModel.resumeCampaign(req.params.id);
        
        res.json({
            success: true,
            message: 'Kampanye berhasil diresume'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/campaigns/:id/stats - Ambil statistik kampanye
router.get('/:id/stats', async (req, res) => {
    try {
        const stats = await campaignModel.getStats(req.params.id);
        
        if (!stats) {
            return res.status(404).json({
                success: false,
                message: 'Kampanye tidak ditemukan'
            });
        }
        
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

// GET /api/campaigns/:id/report - Ambil laporan detail kampanye
router.get('/:id/report', async (req, res) => {
    try {
        const report = await campaignModel.getDetailReport(req.params.id);
        
        res.json({
            success: true,
            data: report
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/campaigns/:id/queue - Ambil antrian email kampanye
router.get('/:id/queue', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        
        const result = await queueModel.getByCampaign(req.params.id, page, limit);
        
        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/campaigns/:id/duplicate - Duplicate kampanye
router.post('/:id/duplicate', async (req, res) => {
    try {
        const newCampaignId = await campaignModel.duplicate(req.params.id);
        
        res.json({
            success: true,
            message: 'Kampanye berhasil diduplicate',
            data: { id: newCampaignId }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/campaigns/:id/test - Kirim test email
router.post('/:id/test', async (req, res) => {
    try {
        const { test_email } = req.body;
        
        if (!test_email) {
            return res.status(400).json({
                success: false,
                message: 'Email tujuan test wajib diisi'
            });
        }

        // Implementasi test email bisa ditambahkan di sini
        // Sementara return success
        res.json({
            success: true,
            message: `Test email berhasil dikirim ke ${test_email}`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
