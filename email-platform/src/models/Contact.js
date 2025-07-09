const { getDatabase } = require('../database/connection');

class Contact {
    constructor() {
        this.db = getDatabase();
    }

    // Ambil semua kontak dengan pagination
    async getAll(page = 1, limit = 100, search = '') {
        const offset = (page - 1) * limit;
        let sql = `
            SELECT * FROM contacts 
            WHERE is_active = 1
        `;
        let countSql = `
            SELECT COUNT(*) as total FROM contacts 
            WHERE is_active = 1
        `;
        let params = [];

        if (search) {
            sql += ` AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR company LIKE ?)`;
            countSql += ` AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR company LIKE ?)`;
            const searchParam = `%${search}%`;
            params = [searchParam, searchParam, searchParam, searchParam];
        }

        sql += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const contacts = await this.db.query(sql, params);
        const totalResult = await this.db.get(countSql, search ? params.slice(0, 4) : []);
        
        return {
            contacts,
            total: totalResult.total,
            page,
            limit,
            totalPages: Math.ceil(totalResult.total / limit)
        };
    }

    // Ambil kontak berdasarkan ID
    async getById(id) {
        const sql = 'SELECT * FROM contacts WHERE id = ?';
        return await this.db.get(sql, [id]);
    }

    // Ambil kontak berdasarkan email
    async getByEmail(email) {
        const sql = 'SELECT * FROM contacts WHERE email = ?';
        return await this.db.get(sql, [email]);
    }

    // Tambah kontak baru
    async create(contactData) {
        const sql = `
            INSERT INTO contacts (email, first_name, last_name, company, phone, tags)
            VALUES (?, ?, ?, ?, ?, ?)
        `;
        const params = [
            contactData.email,
            contactData.first_name || null,
            contactData.last_name || null,
            contactData.company || null,
            contactData.phone || null,
            contactData.tags ? JSON.stringify(contactData.tags) : null
        ];
        
        try {
            const result = await this.db.run(sql, params);
            return result.id;
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                throw new Error('Email sudah terdaftar');
            }
            throw error;
        }
    }

    // Update kontak
    async update(id, contactData) {
        const sql = `
            UPDATE contacts 
            SET email = ?, first_name = ?, last_name = ?, company = ?, 
                phone = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        const params = [
            contactData.email,
            contactData.first_name || null,
            contactData.last_name || null,
            contactData.company || null,
            contactData.phone || null,
            contactData.tags ? JSON.stringify(contactData.tags) : null,
            id
        ];
        
        return await this.db.run(sql, params);
    }

    // Hapus kontak (soft delete)
    async delete(id) {
        const sql = `
            UPDATE contacts 
            SET is_active = 0, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        return await this.db.run(sql, [id]);
    }

    // Blacklist kontak
    async blacklist(id) {
        const sql = `
            UPDATE contacts 
            SET is_blacklisted = 1, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        return await this.db.run(sql, [id]);
    }

    // Import kontak dari array
    async bulkImport(contacts) {
        const results = {
            success: 0,
            failed: 0,
            duplicates: 0,
            errors: []
        };

        for (const contact of contacts) {
            try {
                // Cek apakah email sudah ada
                const existing = await this.getByEmail(contact.email);
                if (existing) {
                    results.duplicates++;
                    continue;
                }

                await this.create(contact);
                results.success++;
            } catch (error) {
                results.failed++;
                results.errors.push({
                    email: contact.email,
                    error: error.message
                });
            }
        }

        return results;
    }

    // Ambil kontak untuk kampanye (tidak blacklisted)
    async getForCampaign(groupIds = []) {
        let sql = `
            SELECT DISTINCT c.* FROM contacts c
            WHERE c.is_active = 1 AND c.is_blacklisted = 0
        `;
        let params = [];

        if (groupIds.length > 0) {
            sql += `
                AND c.id IN (
                    SELECT cgm.contact_id FROM contact_group_members cgm
                    WHERE cgm.group_id IN (${groupIds.map(() => '?').join(',')})
                )
            `;
            params = groupIds;
        }

        sql += ` ORDER BY c.created_at DESC`;
        
        return await this.db.query(sql, params);
    }

    // Statistik kontak
    async getStats() {
        const sql = `
            SELECT 
                COUNT(*) as total,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) as active,
                COUNT(CASE WHEN is_blacklisted = 1 THEN 1 END) as blacklisted,
                COUNT(CASE WHEN company IS NOT NULL AND company != '' THEN 1 END) as with_company
            FROM contacts
        `;
        return await this.db.get(sql);
    }

    // Cari duplikat email
    async findDuplicates() {
        const sql = `
            SELECT email, COUNT(*) as count
            FROM contacts
            GROUP BY email
            HAVING count > 1
            ORDER BY count DESC
        `;
        return await this.db.query(sql);
    }

    // Hapus duplikat (keep yang terbaru)
    async removeDuplicates() {
        const sql = `
            DELETE FROM contacts 
            WHERE id NOT IN (
                SELECT MIN(id) 
                FROM contacts 
                GROUP BY email
            )
        `;
        return await this.db.run(sql);
    }
}

module.exports = Contact;
