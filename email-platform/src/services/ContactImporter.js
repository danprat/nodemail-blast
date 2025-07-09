const fs = require('fs');
const csv = require('csv-parser');
const Contact = require('../models/Contact');

class ContactImporter {
    constructor() {
        this.contactModel = new Contact();
    }

    // Import kontak dari file CSV
    async importFromCSV(filePath, options = {}) {
        return new Promise((resolve, reject) => {
            const contacts = [];
            const errors = [];
            let lineNumber = 1;

            const {
                emailColumn = 'email',
                firstNameColumn = 'first_name',
                lastNameColumn = 'last_name',
                companyColumn = 'company',
                phoneColumn = 'phone',
                skipHeader = true
            } = options;

            fs.createReadStream(filePath)
                .pipe(csv())
                .on('data', (row) => {
                    lineNumber++;
                    
                    try {
                        // Validasi email wajib
                        const email = row[emailColumn]?.trim();
                        if (!email) {
                            errors.push({
                                line: lineNumber,
                                error: 'Email tidak boleh kosong',
                                data: row
                            });
                            return;
                        }

                        // Validasi format email
                        if (!this.isValidEmail(email)) {
                            errors.push({
                                line: lineNumber,
                                error: 'Format email tidak valid',
                                data: row
                            });
                            return;
                        }

                        // Buat object kontak
                        const contact = {
                            email: email.toLowerCase(),
                            first_name: row[firstNameColumn]?.trim() || null,
                            last_name: row[lastNameColumn]?.trim() || null,
                            company: row[companyColumn]?.trim() || null,
                            phone: row[phoneColumn]?.trim() || null,
                            tags: []
                        };

                        contacts.push(contact);

                    } catch (error) {
                        errors.push({
                            line: lineNumber,
                            error: error.message,
                            data: row
                        });
                    }
                })
                .on('end', async () => {
                    try {
                        console.log(`📊 Memproses ${contacts.length} kontak dari CSV...`);
                        
                        // Import ke database
                        const result = await this.contactModel.bulkImport(contacts);
                        
                        // Hapus file temporary
                        if (fs.existsSync(filePath)) {
                            fs.unlinkSync(filePath);
                        }

                        resolve({
                            ...result,
                            total_processed: contacts.length,
                            csv_errors: errors
                        });

                    } catch (error) {
                        reject(error);
                    }
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    // Validasi format email
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Generate template CSV untuk download
    generateTemplate() {
        const headers = [
            'email',
            'first_name', 
            'last_name',
            'company',
            'phone'
        ];

        const sampleData = [
            'john.doe@example.com,John,Doe,Acme Corp,+1234567890',
            'jane.smith@example.com,Jane,Smith,Tech Inc,+0987654321'
        ];

        return headers.join(',') + '\n' + sampleData.join('\n');
    }

    // Export kontak ke CSV
    async exportToCSV(filters = {}) {
        try {
            const contacts = await this.contactModel.getForCampaign();
            
            if (contacts.length === 0) {
                throw new Error('Tidak ada kontak untuk diekspor');
            }

            const csvWriter = require('csv-writer').createObjectCsvWriter({
                path: './temp/contacts_export.csv',
                header: [
                    { id: 'email', title: 'Email' },
                    { id: 'first_name', title: 'First Name' },
                    { id: 'last_name', title: 'Last Name' },
                    { id: 'company', title: 'Company' },
                    { id: 'phone', title: 'Phone' },
                    { id: 'created_at', title: 'Created At' }
                ]
            });

            await csvWriter.writeRecords(contacts);
            
            return {
                success: true,
                file_path: './temp/contacts_export.csv',
                total_exported: contacts.length
            };

        } catch (error) {
            throw new Error('Gagal export kontak: ' + error.message);
        }
    }

    // Validasi file CSV sebelum import
    async validateCSV(filePath) {
        return new Promise((resolve, reject) => {
            const issues = [];
            const preview = [];
            let lineNumber = 0;
            let headers = [];

            fs.createReadStream(filePath)
                .pipe(csv())
                .on('headers', (headerList) => {
                    headers = headerList;
                    
                    // Cek apakah ada kolom email
                    const hasEmail = headers.some(header => 
                        header.toLowerCase().includes('email')
                    );
                    
                    if (!hasEmail) {
                        issues.push({
                            type: 'warning',
                            message: 'Tidak ditemukan kolom email. Pastikan ada kolom dengan nama "email"'
                        });
                    }
                })
                .on('data', (row) => {
                    lineNumber++;
                    
                    // Ambil 5 baris pertama untuk preview
                    if (preview.length < 5) {
                        preview.push(row);
                    }

                    // Validasi email di baris ini
                    const emailValue = row.email || row.Email || row.EMAIL;
                    if (emailValue && !this.isValidEmail(emailValue)) {
                        issues.push({
                            type: 'error',
                            line: lineNumber,
                            message: `Format email tidak valid: ${emailValue}`
                        });
                    }

                    // Stop setelah 1000 baris untuk validasi cepat
                    if (lineNumber >= 1000) {
                        return;
                    }
                })
                .on('end', () => {
                    resolve({
                        valid: issues.filter(i => i.type === 'error').length === 0,
                        headers,
                        preview,
                        issues,
                        estimated_rows: lineNumber
                    });
                })
                .on('error', (error) => {
                    reject(error);
                });
        });
    }

    // Bersihkan file temporary
    cleanupTempFiles() {
        const tempDir = './temp';
        if (fs.existsSync(tempDir)) {
            const files = fs.readdirSync(tempDir);
            files.forEach(file => {
                const filePath = `${tempDir}/${file}`;
                const stats = fs.statSync(filePath);
                
                // Hapus file yang lebih dari 1 jam
                if (Date.now() - stats.mtime.getTime() > 3600000) {
                    fs.unlinkSync(filePath);
                    console.log(`🗑️  Menghapus file temporary: ${file}`);
                }
            });
        }
    }

    // Deteksi encoding file
    detectEncoding(filePath) {
        const buffer = fs.readFileSync(filePath);
        
        // Simple detection - bisa diperbaiki dengan library seperti chardet
        if (buffer.includes(0xEF) && buffer.includes(0xBB) && buffer.includes(0xBF)) {
            return 'utf8'; // UTF-8 with BOM
        }
        
        return 'utf8'; // Default
    }

    // Statistik import
    async getImportStats(timeframe = '30 days') {
        // Implementasi statistik import bisa ditambahkan di sini
        // Misalnya: total import per hari, success rate, dll
        
        return {
            message: 'Statistik import akan diimplementasikan'
        };
    }
}

module.exports = ContactImporter;
