import crypto from 'crypto';

/**
 * UTILIDAD DE ENCRIPTACIÓN PARA DATOS BANCARIOS
 * Usa AES-256-CBC para encriptar información sensible
 * 
 * IMPORTANTE: Asegúrate de tener estas variables en tu archivo .env:
 * ENCRYPTION_KEY=tu_clave_secreta_de_32_caracteres_exactos
 * ENCRYPTION_IV=tu_vector_inicial_de_16_caracteres
 */

// Algoritmo de encriptación
const ALGORITHM = 'aes-256-cbc';

// Clave de encriptación (debe tener exactamente 32 caracteres)
// En producción, usar variable de entorno
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default_key_32_characters_long';

// Vector de inicialización (debe tener exactamente 16 caracteres)
const IV = process.env.ENCRYPTION_IV || 'default_iv_16ch';

/**
 * Valida que la clave y el IV tengan la longitud correcta
 * @throws {Error} Si las credenciales no son válidas
 */
function validateCredentials() {
    if (ENCRYPTION_KEY.length !== 32) {
        throw new Error('ENCRYPTION_KEY debe tener exactamente 32 caracteres');
    }
    if (IV.length !== 16) {
        throw new Error('ENCRYPTION_IV debe tener exactamente 16 caracteres');
    }
}

/**
 * Encripta un texto plano
 * @param {string} text - Texto a encriptar
 * @returns {string} Texto encriptado en formato hexadecimal
 */
export function encrypt(text) {
    try {
        // Validar que text no esté vacío
        if (!text || typeof text !== 'string') {
            throw new Error('El texto a encriptar debe ser una cadena válida');
        }

        validateCredentials();

        // Crear el cipher
        const cipher = crypto.createCipheriv(
            ALGORITHM,
            Buffer.from(ENCRYPTION_KEY),
            Buffer.from(IV)
        );

        // Encriptar
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        return encrypted;
    } catch (error) {
        console.error('Error al encriptar:', error.message);
        throw new Error('Error al encriptar datos sensibles');
    }
}

/**
 * Desencripta un texto encriptado
 * @param {string} encryptedText - Texto encriptado en formato hexadecimal
 * @returns {string} Texto desencriptado
 */
export function decrypt(encryptedText) {
    try {
        // Validar que encryptedText no esté vacío
        if (!encryptedText || typeof encryptedText !== 'string') {
            throw new Error('El texto encriptado debe ser una cadena válida');
        }

        validateCredentials();

        // Crear el decipher
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            Buffer.from(ENCRYPTION_KEY),
            Buffer.from(IV)
        );

        // Desencriptar
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        console.error('Error al desencriptar:', error.message);
        throw new Error('Error al desencriptar datos sensibles');
    }
}

/**
 * Encripta múltiples campos de un objeto
 * @param {Object} data - Objeto con campos a encriptar
 * @param {Array<string>} fields - Array de nombres de campos a encriptar
 * @returns {Object} Objeto con campos encriptados
 */
export function encryptFields(data, fields) {
    const result = { ...data };
    
    fields.forEach(field => {
        if (result[field] && typeof result[field] === 'string') {
            result[field] = encrypt(result[field]);
        }
    });
    
    return result;
}

/**
 * Desencripta múltiples campos de un objeto
 * @param {Object} data - Objeto con campos encriptados
 * @param {Array<string>} fields - Array de nombres de campos a desencriptar
 * @returns {Object} Objeto con campos desencriptados
 */
export function decryptFields(data, fields) {
    const result = { ...data };
    
    fields.forEach(field => {
        if (result[field] && typeof result[field] === 'string') {
            try {
                result[field] = decrypt(result[field]);
            } catch (error) {
                console.error(`Error al desencriptar campo ${field}:`, error.message);
                result[field] = null; // O mantener encriptado
            }
        }
    });
    
    return result;
}

/**
 * Enmascara un número de cuenta bancaria
 * Muestra solo los últimos 4 dígitos
 * @param {string} accountNumber - Número de cuenta completo
 * @returns {string} Número enmascarado (ej: "****1234")
 */
export function maskAccountNumber(accountNumber) {
    if (!accountNumber || typeof accountNumber !== 'string') {
        return '****';
    }
    
    if (accountNumber.length <= 4) {
        return accountNumber;
    }
    
    const lastFour = accountNumber.slice(-4);
    const masked = '*'.repeat(accountNumber.length - 4) + lastFour;
    
    return masked;
}

/**
 * Genera un hash SHA-256 de un texto
 * Útil para comparaciones sin revelar el dato original
 * @param {string} text - Texto a hashear
 * @returns {string} Hash en formato hexadecimal
 */
export function generateHash(text) {
    if (!text || typeof text !== 'string') {
        throw new Error('El texto debe ser una cadena válida');
    }
    
    return crypto.createHash('sha256').update(text).digest('hex');
}

export default {
    encrypt,
    decrypt,
    encryptFields,
    decryptFields,
    maskAccountNumber,
    generateHash
};
