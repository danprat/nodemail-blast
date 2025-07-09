const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Contact = require('../models/Contact');
const ContactImporter = require('../services/ContactImporter');

const router = express.Router();
const contactModel = new Contact();
const importer = new ContactImporter();

// Setup multer untuk upload file
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = './temp';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `import_${Date.now()}_${file.originalname}`);
    }
});

const upload = multer({ 
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || path.extname(file.originalname) === '.csv') {
            cb(null, true);
        } else {
            cb(new Error('Hanya file CSV yang diperbolehkan'));
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    }
});

// GET /api/contacts - Ambil semua kontak dengan pagination
router.get('/', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const search = req.query.search || '';
        
        const result = await contactModel.getAll(page, limit, search);
        
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

// GET /api/contacts/stats - Ambil statistik kontak
router.get('/stats', async (req, res) => {
    try {
        const stats = await contactModel.getStats();
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

// GET /api/contacts/:id - Ambil kontak berdasarkan ID
router.get('/:id', async (req, res) => {
    try {
        const contact = await contactModel.getById(req.params.id);
        if (!contact) {
            return res.status(404).json({
                success: false,
                message: 'Kontak tidak ditemukan'
            });
        }
        
        res.json({
            success: true,
            data: contact
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/contacts - Tambah kontak baru
router.post('/', async (req, res) => {
    try {
        const { email, first_name, last_name, company, phone, tags } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email wajib diisi'
            });
        }

        const contactData = {
            email: email.toLowerCase(),
            first_name,
            last_name,
            company,
            phone,
            tags: tags || []
        };

        const contactId = await contactModel.create(contactData);
        
        res.status(201).json({
            success: true,
            message: 'Kontak berhasil ditambahkan',
            data: { id: contactId }
        });
    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
});

// PUT /api/contacts/:id - Update kontak
router.put('/:id', async (req, res) => {
    try {
        const { email, first_name, last_name, company, phone, tags } = req.body;
        
        const contactData = {
            email: email.toLowerCase(),
            first_name,
            last_name,
            company,
            phone,
            tags: tags || []
        };

        await contactModel.update(req.params.id, contactData);
        
        res.json({
            success: true,
            message: 'Kontak berhasil diupdate'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// DELETE /api/contacts/:id - Hapus kontak
router.delete('/:id', async (req, res) => {
    try {
        await contactModel.delete(req.params.id);
        
        res.json({
            success: true,
            message: 'Kontak berhasil dihapus'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/contacts/:id/blacklist - Blacklist kontak
router.post('/:id/blacklist', async (req, res) => {
    try {
        await contactModel.blacklist(req.params.id);
        
        res.json({
            success: true,
            message: 'Kontak berhasil diblacklist'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/contacts/import - Import kontak dari CSV
router.post('/import', upload.single('csv_file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'File CSV wajib diupload'
            });
        }

        const options = {
            emailColumn: req.body.email_column || 'email',
            firstNameColumn: req.body.first_name_column || 'first_name',
            lastNameColumn: req.body.last_name_column || 'last_name',
            companyColumn: req.body.company_column || 'company',
            phoneColumn: req.body.phone_column || 'phone'
        };

        const result = await importer.importFromCSV(req.file.path, options);
        
        res.json({
            success: true,
            message: 'Import berhasil',
            data: result
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/contacts/validate-csv - Validasi file CSV sebelum import
router.post('/validate-csv', upload.single('csv_file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'File CSV wajib diupload'
            });
        }

        const validation = await importer.validateCSV(req.file.path);
        
        // Hapus file setelah validasi
        fs.unlinkSync(req.file.path);
        
        res.json({
            success: true,
            data: validation
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/contacts/template/csv - Download template CSV
router.get('/template/csv', (req, res) => {
    try {
        const template = importer.generateTemplate();
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="contacts_template.csv"');
        res.send(template);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/contacts/export/csv - Export kontak ke CSV
router.get('/export/csv', async (req, res) => {
    try {
        const result = await importer.exportToCSV();
        
        res.download(result.file_path, 'contacts_export.csv', (err) => {
            if (!err) {
                // Hapus file setelah download
                fs.unlinkSync(result.file_path);
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// GET /api/contacts/duplicates - Cari kontak duplikat
router.get('/duplicates', async (req, res) => {
    try {
        const duplicates = await contactModel.findDuplicates();
        res.json({
            success: true,
            data: duplicates
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// POST /api/contacts/remove-duplicates - Hapus kontak duplikat
router.post('/remove-duplicates', async (req, res) => {
    try {
        const result = await contactModel.removeDuplicates();
        res.json({
            success: true,
            message: `${result.changes} kontak duplikat berhasil dihapus`
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router;
