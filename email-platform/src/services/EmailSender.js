const nodemailer = require('nodemailer');
const SmtpAccount = require('../models/SmtpAccount');
const EmailQueue = require('../models/EmailQueue');
const Campaign = require('../models/Campaign');

class EmailSender {
    constructor() {
        this.smtpModel = new SmtpAccount();
        this.queueModel = new EmailQueue();
        this.campaignModel = new Campaign();
        this.isRunning = false;
        this.rateLimitPerMinute = parseInt(process.env.RATE_LIMIT_PER_MINUTE) || 60;
        this.transporters = new Map(); // Cache transporters
    }

    // Buat atau ambil transporter untuk SMTP account
    async getTransporter(smtpAccount) {
        const key = `${smtpAccount.id}`;
        
        if (this.transporters.has(key)) {
            return this.transporters.get(key);
        }

        const transporter = nodemailer.createTransport({
            host: smtpAccount.smtp_host || smtpAccount.host,
            port: smtpAccount.smtp_port || smtpAccount.port,
            secure: (smtpAccount.smtp_port || smtpAccount.port) === 465,
            auth: {
                user: smtpAccount.smtp_username || smtpAccount.username,
                pass: smtpAccount.smtp_password || smtpAccount.password
            },
            pool: true, // Use connection pooling
            maxConnections: 5,
            maxMessages: 100,
            rateLimit: this.rateLimitPerMinute // emails per minute
        });

        this.transporters.set(key, transporter);
        return transporter;
    }

    // Kirim single email
    async sendEmail(queueItem) {
        try {
            console.log(`📧 Mengirim email ke: ${queueItem.contact_email}`);
            
            // Update status ke sending
            await this.queueModel.updateStatus(queueItem.id, 'sending');

            // Ambil transporter
            const transporter = await this.getTransporter(queueItem);

            // Personalisasi konten email
            const personalizedContent = this.personalizeContent(queueItem);

            // Setup email options
            const mailOptions = {
                from: `"${queueItem.from_name}" <${queueItem.from_email}>`,
                to: queueItem.contact_email,
                subject: personalizedContent.subject,
                html: personalizedContent.html,
                text: personalizedContent.text
            };

            // Kirim email
            const info = await transporter.sendMail(mailOptions);
            
            // Update status ke sent
            await this.queueModel.updateStatus(queueItem.id, 'sent', null, info.messageId);
            
            // Update counter SMTP account
            await this.smtpModel.incrementEmailCount(queueItem.smtp_account_id);
            
            // Update counter campaign
            await this.campaignModel.incrementEmailSent(queueItem.campaign_id);

            console.log(`✅ Email berhasil dikirim ke: ${queueItem.contact_email}`);
            return { success: true, messageId: info.messageId };

        } catch (error) {
            console.error(`❌ Gagal mengirim email ke: ${queueItem.contact_email}`, error.message);
            
            // Update status ke failed
            await this.queueModel.updateStatus(queueItem.id, 'failed', error.message);
            
            // Update counter campaign
            await this.campaignModel.incrementEmailFailed(queueItem.campaign_id);

            return { success: false, error: error.message };
        }
    }

    // Personalisasi konten email
    personalizeContent(queueItem) {
        const replacements = {
            '{{first_name}}': queueItem.first_name || '',
            '{{last_name}}': queueItem.last_name || '',
            '{{full_name}}': `${queueItem.first_name || ''} ${queueItem.last_name || ''}`.trim(),
            '{{email}}': queueItem.contact_email,
            '{{company}}': queueItem.company || ''
        };

        let subject = queueItem.subject;
        let html = queueItem.html_content || '';
        let text = queueItem.text_content || '';

        // Replace placeholders
        Object.keys(replacements).forEach(placeholder => {
            const value = replacements[placeholder];
            subject = subject.replace(new RegExp(placeholder, 'g'), value);
            html = html.replace(new RegExp(placeholder, 'g'), value);
            text = text.replace(new RegExp(placeholder, 'g'), value);
        });

        return { subject, html, text };
    }

    // Proses antrian email (main worker)
    async processQueue() {
        if (this.isRunning) {
            console.log('⚠️  Email sender sudah berjalan');
            return;
        }

        this.isRunning = true;
        console.log('🚀 Memulai email sender...');

        try {
            while (this.isRunning) {
                // Ambil email berikutnya dari antrian
                const queueItem = await this.queueModel.getNext(1);
                
                if (!queueItem) {
                    // Tidak ada email dalam antrian, tunggu sebentar
                    await this.sleep(5000); // 5 detik
                    continue;
                }

                // Kirim email
                await this.sendEmail(queueItem);

                // Rate limiting - tunggu sebentar sebelum email berikutnya
                const delayMs = (60 / this.rateLimitPerMinute) * 1000;
                await this.sleep(delayMs);
            }
        } catch (error) {
            console.error('❌ Error dalam email sender:', error);
        } finally {
            this.isRunning = false;
            console.log('⏹️  Email sender dihentikan');
        }
    }

    // Hentikan email sender
    stop() {
        console.log('🛑 Menghentikan email sender...');
        this.isRunning = false;
        
        // Tutup semua transporter connections
        this.transporters.forEach(transporter => {
            transporter.close();
        });
        this.transporters.clear();
    }

    // Helper function untuk sleep
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Mulai kampanye email
    async startCampaign(campaignId, contactIds = [], groupIds = []) {
        try {
            console.log(`🚀 Memulai kampanye: ${campaignId}`);

            // Ambil data kampanye
            const campaign = await this.campaignModel.getById(campaignId);
            if (!campaign) {
                throw new Error('Kampanye tidak ditemukan');
            }

            if (campaign.status !== 'draft' && campaign.status !== 'scheduled') {
                throw new Error('Kampanye tidak dapat dimulai (status: ' + campaign.status + ')');
            }

            // Ambil kontak untuk kampanye
            const Contact = require('../models/Contact');
            const contactModel = new Contact();
            
            let contacts;
            if (contactIds.length > 0) {
                // Gunakan kontak yang dipilih
                contacts = [];
                for (const id of contactIds) {
                    const contact = await contactModel.getById(id);
                    if (contact && contact.is_active && !contact.is_blacklisted) {
                        contacts.push(contact);
                    }
                }
            } else {
                // Ambil semua kontak aktif (atau berdasarkan grup)
                contacts = await contactModel.getForCampaign(groupIds);
            }

            if (contacts.length === 0) {
                throw new Error('Tidak ada kontak yang valid untuk kampanye ini');
            }

            // Distribusi email ke SMTP accounts
            const emailsToQueue = await this.distributeEmails(campaignId, contacts);

            // Tambahkan ke antrian
            await this.queueModel.bulkAdd(emailsToQueue);

            // Update status kampanye
            await this.campaignModel.updateStatus(campaignId, 'sending', {
                total_recipients: contacts.length
            });

            console.log(`✅ Kampanye dimulai: ${contacts.length} email ditambahkan ke antrian`);
            
            return {
                success: true,
                total_recipients: contacts.length,
                message: 'Kampanye berhasil dimulai'
            };

        } catch (error) {
            console.error('❌ Error memulai kampanye:', error);
            throw error;
        }
    }

    // Distribusi email ke multiple SMTP accounts (load balancing)
    async distributeEmails(campaignId, contacts) {
        const activeAccounts = await this.smtpModel.getActiveAccounts();
        
        if (activeAccounts.length === 0) {
            throw new Error('Tidak ada SMTP account yang aktif');
        }

        const emailsToQueue = [];
        let accountIndex = 0;

        for (const contact of contacts) {
            // Pilih SMTP account dengan round-robin
            const smtpAccount = activeAccounts[accountIndex % activeAccounts.length];
            
            emailsToQueue.push({
                campaign_id: campaignId,
                contact_id: contact.id,
                smtp_account_id: smtpAccount.id,
                priority: 1,
                scheduled_at: new Date().toISOString()
            });

            accountIndex++;
        }

        return emailsToQueue;
    }

    // Ambil status email sender
    getStatus() {
        return {
            is_running: this.isRunning,
            rate_limit: this.rateLimitPerMinute,
            active_transporters: this.transporters.size
        };
    }
}

module.exports = EmailSender;
