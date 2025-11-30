const db = require("../config/db")
const json = require("./jsonDatabase")

/**
 * GET DATA WHERE column=value
 */
exports.getData = async (table, column, value) => {
    try {
        const stmt = db.prepare(`SELECT * FROM ${table} WHERE ${column} = ?`)
        const result = stmt.all(value)
        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * GET ALL ROWS
 */
exports.getDataAll = async (table) => {
    try {
        const stmt = db.prepare(`SELECT * FROM ${table}`)
        const result = stmt.all()
        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * UPDATE ONE ROW
 */
exports.updateData = async (table, columnData, columnValue, updateData, updateValue) => {
    try {
        const stmt = db.prepare(`UPDATE ${table} SET ${updateData} = ? WHERE ${columnData} = ?`)
        const result = stmt.run(updateValue, columnValue)

        // JSON Sync
        const jsonDB = json.load()
        if (jsonDB[table]) {
            jsonDB[table] = jsonDB[table].map(r => 
                r[columnData] == columnValue ? { ...r, [updateData]: updateValue } : r
            )
            json.save(jsonDB)
        }

        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * UPDATE all rows in a table
 */
exports.updateDataAll = async (table, updateData, updateValue) => {
    try {
        const stmt = db.prepare(`UPDATE ${table} SET ${updateData} = ?`)
        const result = stmt.run(updateValue)

        // JSON Sync
        const jsonDB = json.load()
        if (jsonDB[table]) {
            jsonDB[table] = jsonDB[table].map(r => ({ ...r, [updateData]: updateValue }))
            json.save(jsonDB)
        }

        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * DELETE ROW WHERE column=value
 */
exports.deleteData = async (table, deleteData, deleteValue) => {
    try {
        const stmt = db.prepare(`DELETE FROM ${table} WHERE ${deleteData} = ?`)
        const result = stmt.run(deleteValue)

        // JSON Sync
        const jsonDB = json.load()
        if (jsonDB[table]) {
            jsonDB[table] = jsonDB[table].filter(r => r[deleteData] != deleteValue)
            json.save(jsonDB)
        }

        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * TRUNCATE TABLE
 */
exports.deleteDataAll = async (table) => {
    try {
        const stmt = db.prepare(`DELETE FROM ${table}`)
        const result = stmt.run()

        // JSON Sync
        const jsonDB = json.load()
        jsonDB[table] = []
        json.save(jsonDB)

        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * NEW VISITOR
 */
exports.newVisite = async (userId, username) => {
    try {
        const timestamp = Date.now()
        const stmt = db.prepare(`
            INSERT INTO visiteurs (id, username, last_visite, first_visite)
            VALUES (?, ?, ?, ?)
        `)
        const result = stmt.run(userId, username, timestamp, timestamp)

        // JSON Sync
        const jsonDB = json.load()
        jsonDB.visiteurs ??= []
        jsonDB.visiteurs.push({
            id: userId,
            username,
            "last-visite": timestamp,
            "first-visite": timestamp
        })
        json.save(jsonDB)

        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * UPDATE LAST VISIT
 */
exports.updateVisite = async (userId) => {
    try {
        const timestamp = Date.now()
        const stmt = db.prepare(`UPDATE visiteurs SET last_visite = ? WHERE id = ?`)
        const result = stmt.run(timestamp, userId)

        // JSON sync
        const jsonDB = json.load()
        jsonDB.visiteurs = jsonDB.visiteurs.map(r =>
            r.id == userId ? { ...r, "last-visite": timestamp } : r
        )
        json.save(jsonDB)

        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * REGISTER START TIPS
 */
exports.registerStartTips = async (userId, username) => {
    try {
        const timestamp = Date.now()
        const stmt = db.prepare(
            `INSERT INTO vip_tips (id, username, started_at) VALUES (?, ?, ?)`
        )
        const result = stmt.run(userId, username, timestamp)

        // JSON
        const jsonDB = json.load()
        jsonDB["vip-tips"] ??= []
        jsonDB["vip-tips"].push({
            id: userId,
            username,
            started_at: timestamp,
            amount: 0,
            isvip: 0
        })
        json.save(jsonDB)

        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * UPDATE AMOUNT
 */
exports.registerTips = async (userId, amount) => {
    try {
        const stmt = db.prepare(`UPDATE vip_tips SET amount = ? WHERE id = ?`)
        const result = stmt.run(amount, userId)

        // JSON
        const jsonDB = json.load()
        jsonDB["vip-tips"] = jsonDB["vip-tips"].map(r =>
            r.id == userId ? { ...r, amount } : r
        )
        json.save(jsonDB)

        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * UPDATE VIP STATUS
 */
exports.updateVip = async (userId, state) => {
    try {
        const stmt = db.prepare(`UPDATE vip_tips SET isvip = ? WHERE id = ?`)
        const result = stmt.run(state, userId)

        // JSON
        const jsonDB = json.load()
        jsonDB["vip-tips"] = jsonDB["vip-tips"].map(r =>
            r.id == userId ? { ...r, isvip: state } : r
        )
        json.save(jsonDB)

        return { error: null, result }
    } catch (err) {
        return { error: err.message, result: null }
    }
}
