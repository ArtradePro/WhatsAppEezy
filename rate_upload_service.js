/**
 * Carrier CSV Rate Ingestion Service
 * 
 * Exposes Express middleware and route handlers to allow carriers to upload their
 * rate matrix CSVs, validate rows, and execute transactional upserts.
 * 
 * Expected CSV Headers:
 * - Origin Zone
 * - Destination Zone
 * - Max Weight (kg)
 * - Base Rate (ZAR)
 * - Per Kg Rate (ZAR)
 */

const fs = require('fs');
const path = require('path');
const multer = require('multer');
const csvParser = require('csv-parser');

// Import database pool from rating controller (or configure local pool fallback)
let pool;
try {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/freight_brokerage',
  });
} catch (e) {
  // pg module not installed
}

// 1. Configure Multer Security Parameters
const tempDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Generate secure randomized filename to prevent Directory Traversal and overwrites
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `rates-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

// File filter to restrict uploads to CSV format only
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.csv'];
  const allowedMimeTypes = ['text/csv', 'application/vnd.ms-excel'];
  
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype;

  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(mime)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only CSV files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // Strict 5MB limit to prevent DoS
  }
});

/**
 * Express Handler for processing Carrier CSV zone rate uploads.
 */
async function handleRateUpload(req, res) {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No CSV file uploaded.' });
  }

  const filePath = req.file.path;
  const carrierId = req.user?.id || req.body.carrier_id; 

  if (!carrierId) {
    cleanupFile(filePath);
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Valid carrier_id must be provided in request context.' 
    });
  }

  // Fallback if DB is not installed
  if (!pool) {
    cleanupFile(filePath);
    return res.status(500).json({
      success: false,
      error: 'Database connection driver missing. CSV processing aborted.',
    });
  }

  const dbClient = await pool.connect();

  try {
    // 2. Parse and validate CSV data
    const records = [];
    const validationErrors = [];

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csvParser({
          mapHeaders: ({ header }) => header.trim().toLowerCase(), // Normalize headers to lowercase
        }))
        .on('data', (row, index) => {
          const rowNum = index + 1;
          const { error, value } = validateAndMapRow(row, rowNum);
          if (error) {
            validationErrors.push(error);
          } else {
            records.push(value);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // If validation fails on any row, abort before performing any DB operations (all-or-nothing policy)
    if (validationErrors.length > 0) {
      cleanupFile(filePath);
      return res.status(400).json({
        success: false,
        error: 'CSV Validation failed',
        details: validationErrors,
      });
    }

    if (records.length === 0) {
      cleanupFile(filePath);
      return res.status(400).json({ success: false, error: 'The uploaded CSV file is empty.' });
    }

    // 3. Database Transaction & Ingestion
    await dbClient.query('BEGIN');

    const upsertedRecords = [];

    for (const record of records) {
      // Secure upsert query utilizing parameterized mappings
      const upsertQuery = `
        INSERT INTO carrier_zone_rates (
          carrier_id, 
          origin_zone, 
          destination_zone, 
          max_weight_kg, 
          base_rate, 
          per_kg_rate
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (carrier_id, origin_zone, destination_zone, max_weight_kg)
        DO UPDATE SET
          base_rate = EXCLUDED.base_rate,
          per_kg_rate = EXCLUDED.per_kg_rate,
          updated_at = CURRENT_TIMESTAMP
        RETURNING id;
      `;

      const values = [
        carrierId,
        record.origin_zone,
        record.destination_zone,
        record.max_weight_kg,
        record.base_rate,
        record.per_kg_rate,
      ];

      const resUpsert = await dbClient.query(upsertQuery, values);
      upsertedRecords.push(resUpsert.rows[0].id);
    }

    await dbClient.query('COMMIT');

    cleanupFile(filePath);

    return res.status(200).json({
      success: true,
      message: `Successfully processed and upserted ${records.length} rate records.`,
      upserted_count: upsertedRecords.length,
    });

  } catch (error) {
    await dbClient.query('ROLLBACK');
    cleanupFile(filePath);
    
    console.error('CSV Ingestion Error:', error);
    return res.status(422).json({
      success: false,
      error: 'Failed to process CSV rate ingestion.',
      details: error.message,
    });
  } finally {
    dbClient.release();
  }
}

/**
 * Validates CSV row format and maps to correct types.
 * Normalizes headers (mapping spaces, weights, currencies).
 */
function validateAndMapRow(row, rowNum) {
  // Support both standard lowercase snake_case and spaced headers with units
  const origin_zone = row['origin zone'] || row['origin_zone'];
  const destination_zone = row['destination zone'] || row['destination_zone'];
  
  const rawMaxWeight = row['max weight (kg)'] || row['max_weight_kg'] || row['max_weight'];
  const rawBaseRate = row['base rate (zar)'] || row['base_rate_zar'] || row['base_rate'];
  const rawPerKgRate = row['per kg rate (zar)'] || row['per_kg_rate_zar'] || row['per_kg_rate'] || row['per_km_rate'];

  // Required checks
  if (!origin_zone || origin_zone.trim() === '') {
    return { error: `Row ${rowNum}: "Origin Zone" is a required field.` };
  }
  if (!destination_zone || destination_zone.trim() === '') {
    return { error: `Row ${rowNum}: "Destination Zone" is a required field.` };
  }

  // Parse numeric values
  const max_weight_kg = parseFloat(rawMaxWeight);
  const base_rate = parseFloat(rawBaseRate);
  const per_kg_rate = parseFloat(rawPerKgRate);

  // Numeric checks and sanitization
  if (isNaN(max_weight_kg) || max_weight_kg <= 0) {
    return { error: `Row ${rowNum}: "Max Weight (kg)" must be a positive number.` };
  }
  if (isNaN(base_rate) || base_rate < 0) {
    return { error: `Row ${rowNum}: "Base Rate (ZAR)" must be a non-negative number.` };
  }
  if (isNaN(per_kg_rate) || per_kg_rate < 0) {
    return { error: `Row ${rowNum}: "Per Kg Rate (ZAR)" must be a non-negative number.` };
  }

  // Character sanitization check (block malicious injections or control chars)
  const safeStringRegex = /^[a-zA-Z0-9\s\-\,\.\/]+$/;
  if (!safeStringRegex.test(origin_zone.trim())) {
    return { error: `Row ${rowNum}: "Origin Zone" contains invalid characters.` };
  }
  if (!safeStringRegex.test(destination_zone.trim())) {
    return { error: `Row ${rowNum}: "Destination Zone" contains invalid characters.` };
  }

  return {
    value: {
      rowNum,
      origin_zone: origin_zone.trim(),
      destination_zone: destination_zone.trim(),
      max_weight_kg,
      base_rate,
      per_kg_rate,
    }
  };
}

/**
 * Deletes files safely from local disk
 */
function cleanupFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Failed to delete temporary upload file:', err);
  }
}

module.exports = {
  upload,
  handleRateUpload,
  validateAndMapRow
};
