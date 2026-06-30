const fs = require('fs/promises');
const path = require('path');
const zlib = require('zlib');
const { COMPRESSION_THRESHOLD, BACKUP_EXT, TMP_EXT } = require('./constant');

/**
 * Checks if a buffer is zlib compressed (deflated)
 * @param {Buffer} buffer 
 * @returns {boolean}
 */
function isZlibCompressed(buffer) {
    // Check for zlib header (usually starts with 0x78)
    return buffer.length > 2 && buffer[0] === 0x78 && (
        buffer[1] === 0x01 || // No compression / low compression
        buffer[1] === 0x5e || // Default compression
        buffer[1] === 0x9c || // Default compression
        buffer[1] === 0xda    // Best compression
    );
}

/**
 * Safely reads a JSON file, automatically decompressing if needed.
 * @param {string} filePath 
 * @returns {Promise<any>}
 */
async function readJSON(filePath) {
    try {
        let content = await fs.readFile(filePath);
        
        if (isZlibCompressed(content)) {
            content = zlib.inflateSync(content);
        }
        
        return JSON.parse(content.toString('utf-8'));
    } catch (err) {
        if (err.code === 'ENOENT') {
            // Check if backup exists if main file is missing
            const backupPath = filePath + BACKUP_EXT;
            try {
                let backupContent = await fs.readFile(backupPath);
                if (isZlibCompressed(backupContent)) {
                    backupContent = zlib.inflateSync(backupContent);
                }
                return JSON.parse(backupContent.toString('utf-8'));
            } catch (backupErr) {
                // If backup also fails or doesn't exist, rethrow original error
                throw err;
            }
        }
        throw err;
    }
}

/**
 * Safely writes a JSON file with temporary buffer and backup.
 * @param {string} filePath 
 * @param {any} data 
 * @param {object} options 
 * @param {boolean} [options.compress] - Force compression or not. If undefined, uses COMPRESSION_THRESHOLD.
 * @param {boolean} [options.backup=true] - Create a backup of the previous version.
 * @returns {Promise<void>}
 */
async function writeJSON(filePath, data, options = {}) {
    const backup = options.backup !== false;
    const jsonStr = JSON.stringify(data, null, 2);
    let content = Buffer.from(jsonStr, 'utf-8');
    
    let shouldCompress = options.compress;
    if (shouldCompress === undefined) {
        const compressionThreshold = options.compressionThreshold ?? COMPRESSION_THRESHOLD;
        shouldCompress = content.length > compressionThreshold;
    }

    if (shouldCompress) {
        content = zlib.deflateSync(content);
    }

    const tmpPath = filePath + TMP_EXT;
    const backupPath = filePath + BACKUP_EXT;

    // 1. Write to temporary file
    await fs.writeFile(tmpPath, content);

    // 2. Backup existing file if requested
    if (backup) {
        try {
            await fs.access(filePath);
            await fs.rename(filePath, backupPath);
        } catch (err) {
            // filePath doesn't exist, no backup needed
        }
    }

    // 3. Rename temporary file to final destination
    await fs.rename(tmpPath, filePath);
}

module.exports = {
    readJSON,
    writeJSON
};
