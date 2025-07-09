const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseConnection {
    constructor() {
        this.dbPath = process.env.DB_PATH || './data/email_platform.db';
        this.db = null;
    }

    connect() {
        if (this.db) {
            return this.db;
        }

        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('❌ Error connecting to database:', err.message);
                throw err;
            }
            console.log('✅ Connected to SQLite database');
        });

        // Enable foreign keys
        this.db.run('PRAGMA foreign_keys = ON');
        
        return this.db;
    }

    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('❌ Error closing database:', err.message);
                } else {
                    console.log('✅ Database connection closed');
                }
            });
            this.db = null;
        }
    }

    // Helper method untuk query dengan Promise
    query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    // Helper method untuk single row query
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    // Helper method untuk insert/update/delete
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) {
                    reject(err);
                } else {
                    resolve({
                        id: this.lastID,
                        changes: this.changes
                    });
                }
            });
        });
    }

    // Helper method untuk transaction
    async transaction(callback) {
        await this.run('BEGIN TRANSACTION');
        try {
            const result = await callback(this);
            await this.run('COMMIT');
            return result;
        } catch (error) {
            await this.run('ROLLBACK');
            throw error;
        }
    }
}

// Singleton instance
let dbInstance = null;

function getDatabase() {
    if (!dbInstance) {
        dbInstance = new DatabaseConnection();
        dbInstance.connect();
    }
    return dbInstance;
}

module.exports = {
    DatabaseConnection,
    getDatabase
};
