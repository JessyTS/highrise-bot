const db = require('../config/db')

/**
 * @param {string} table 
 * @param {string} column 
 * @param {string} value 
 * @returns {Promise<{error: string|null, result: object|null}>}
 */
exports.getData = async (table, column, value) => {
    try {
        const [rows] = await db.execute(
            `SELECT * FROM \`${table}\` WHERE \`${column}\` = ?`,
            [value]
        )
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * @param {string} table 
 * @returns {Promise<{error: string|null, result: object|null}>}
 */
exports.getDataAll = async (table) => {
    try {
        const [rows] = await db.execute(`SELECT * FROM \`${table}\``)
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * @param {string} table 
 * @param {string} columnData 
 * @param {string} columnValue 
 * @param {string} updateData 
 * @param {string} updateValue 
 * @returns {Promise<{error: string|null, result: object|null}>}
 */
exports.updateData = async (table, columnData, columnValue, updateData, updateValue) => {
    try {
        const [rows] = await db.execute(
            `UPDATE \`${table}\` SET \`${updateData}\` = ? WHERE \`${columnData}\` = ?`,
            [updateValue, columnValue]
        )
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * @param {string} table 
 * @param {string} updateData 
 * @param {string} updateValue 
 * @returns {Promise<{error: string|null, result: object|null}>}
 */
exports.updateDataAll = async (table, updateData, updateValue) => {
    try {
        const [rows] = await db.execute(
            `UPDATE \`${table}\` SET \`${updateData}\` = ?`,
            [updateValue]
        )
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * @param {string} table 
 * @param {string} deleteData 
 * @param {string} deleteValue 
 * @returns {Promise<{error: string|null, result: object|null}>}
 */
exports.deleteData = async (table, deleteData, deleteValue) => {
    try {
        const [rows] = await db.execute(
            `DELETE FROM \`${table}\` WHERE \`${deleteData}\` = ?`,
            [deleteValue]
        )
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

/**
 * @param {string} table 
 * @returns {Promise<{error: string|null, result: object|null}>}
 */
exports.deleteDataAll = async (table) => {
    try {
        const [rows] = await db.execute(`TRUNCATE TABLE \`${table}\``)
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

exports.newVisite = async (userId, username) => {
    try {
        const timestamp = Date.now()
        const [rows] = await db.execute(
            `INSERT INTO visiteurs (id, username, \`last-visite\`, \`first-visite\`) VALUES (?, ?, ?, ?)`,
            [userId, username, timestamp, timestamp]
        )
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

exports.updateVisite = async (userId) => {
    try {
        const timestamp = Date.now()
        const [rows] = await db.execute(
            `UPDATE visiteurs SET \`last-visite\` = ? WHERE id = ?`,
            [timestamp, userId]
        )
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

exports.registerStartTips = async (userId, username) => {
    try {
        const timestamp = Date.now()
        const [rows] = await db.execute(
            `INSERT INTO \`vip-tips\` (id, username, started_at) VALUES (?, ?, ?)`,
            [userId, username, timestamp]
        )
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

exports.registerTips = async (userId, amount) => {
    try {
        const [rows] = await db.execute(
            `UPDATE \`vip-tips\` SET amount = ? WHERE id = ?`,
            [amount, userId]
        )
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}

exports.updateVip = async (userId, state) => {
    try {
        const [rows] = await db.execute(
            `UPDATE \`vip-tips\` SET isvip = ? WHERE id = ?`,
            [state, userId]
        )
        return { error: null, result: rows }
    } catch (err) {
        return { error: err.message, result: null }
    }
}