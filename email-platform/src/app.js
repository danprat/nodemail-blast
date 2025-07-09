require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

// Import routes
const smtpRoutes = require('./routes/smtp');
const contactRoutes = require('./routes/contacts');
const campaignRoutes = require('./routes/campaigns');
const dashboardRoutes = require('./routes/dashboard');

// Import database
const { getDatabase } = require('./database/connection');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files untuk UI
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/smtp', smtpRoutes);
app.use('/api/contacts', contactRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Root endpoint
app.get('/api', (req, res) => {
    res.json({
        success: true,
        message: 'LARK Email Platform API',
        version: '1.0.0',
        endpoints: {
            smtp: '/api/smtp',
            contacts: '/api/contacts',
            campaigns: '/api/campaigns',
            dashboard: '/api/dashboard'
        }
    });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        const db = getDatabase();
        await db.get('SELECT 1');
        
        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: 'connected'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            database: 'disconnected',
            error: error.message
        });
    }
});

// Serve UI untuk semua route yang tidak dimulai dengan /api
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, '../public/index.html');
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.json({
            success: true,
            message: 'LARK Email Platform',
            note: 'UI belum tersedia. Gunakan API endpoints.',
            api_docs: '/api'
        });
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
            success: false,
            message: 'File terlalu besar. Maksimal 10MB.'
        });
    }
    
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            success: false,
            message: 'Invalid JSON format'
        });
    }
    
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
    });
});

// 404 handler untuk API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint tidak ditemukan',
        available_endpoints: [
            '/api/smtp',
            '/api/contacts', 
            '/api/campaigns',
            '/api/dashboard'
        ]
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down gracefully...');
    
    // Stop email sender jika berjalan
    try {
        const EmailSender = require('./services/EmailSender');
        const emailSender = new EmailSender();
        emailSender.stop();
    } catch (error) {
        console.error('Error stopping email sender:', error);
    }
    
    // Close database connection
    try {
        const db = getDatabase();
        db.close();
    } catch (error) {
        console.error('Error closing database:', error);
    }
    
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down gracefully...');
    
    // Stop email sender jika berjalan
    try {
        const EmailSender = require('./services/EmailSender');
        const emailSender = new EmailSender();
        emailSender.stop();
    } catch (error) {
        console.error('Error stopping email sender:', error);
    }
    
    // Close database connection
    try {
        const db = getDatabase();
        db.close();
    } catch (error) {
        console.error('Error closing database:', error);
    }
    
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 LARK Email Platform berjalan di port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`🔗 API: http://localhost:${PORT}/api`);
    
    // Initialize database jika belum ada
    const DatabaseInitializer = require('./database/init');
    const initializer = new DatabaseInitializer();
    initializer.init().catch(error => {
        console.error('❌ Gagal inisialisasi database:', error);
    });
});

module.exports = app;
