/**
 * Protected Carrier CSV Upload Route
 * 
 * Intercepts, parses, and persists Carrier rate sheet CSV files.
 * Enforces role authorization via authorizeRole('carrier').
 */

const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const authorizeRole = require('./authMiddleware'); // Gatekeeper middleware

// Import database pool
let pool;
try {
  pool = require('./db');
} catch (e) {
  // db configuration offline
}

const router = express.Router();

// Configure Multer to temporarily save uploaded files in an 'uploads' folder
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({ dest: 'uploads/' });

// The Route: Chained authorizeRole('carrier') and upload.single('rateSheet')
router.post('/api/rates/upload-csv', authorizeRole('carrier'), upload.single('rateSheet'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No CSV file was uploaded.' });
  }

  const parsedRates = [];

  // Read the file stream and parse the CSV rows into JSON objects
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (row) => {
      // Basic validation checks
      const origin = row.OriginZone || row['Origin Zone'] || row.origin_zone;
      const dest = row.DestinationZone || row['Destination Zone'] || row.destination_zone;
      const weight = parseFloat(row.MaxWeight || row['Max Weight (kg)'] || row.max_weight);
      const base = parseFloat(row.BaseRate || row['Base Rate (ZAR)'] || row.base_rate);
      const perKg = parseFloat(row.PerKgRate || row['Per Kg Rate (ZAR)'] || row.per_kg_rate);

      if (origin && dest && !isNaN(weight) && !isNaN(base) && !isNaN(perKg)) {
        parsedRates.push({
          OriginZone: origin.trim(),
          DestinationZone: dest.trim(),
          MaxWeight: weight,
          BaseRate: base,
          PerKgRate: perKg
        });
      }
    })
    .on('end', async () => {
      // Delete the temporary file from the server to save space
      fs.unlinkSync(req.file.path);

      if (parsedRates.length === 0) {
        return res.status(400).json({ error: 'The uploaded CSV file is empty or contains invalid rows.' });
      }

      if (!pool) {
        console.log('⚠ Database offline. CSV parsed data:', parsedRates.length);
        return res.status(200).json({
          success: true,
          message: 'Rates successfully parsed (Database offline - dry run).',
          data: parsedRates
        });
      }

      // Get a dedicated client from the pool for a transaction
      const client = await pool.connect();

      try {
        // Start the SQL transaction
        await client.query('BEGIN');

        // The SQL query template with conflict upsert to keep rates updated
        const insertQuery = `
          INSERT INTO carrier_rates 
          (carrier_id, origin_zone, dest_zone, max_weight, base_rate, per_kg_rate) 
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (carrier_id, origin_zone, dest_zone, max_weight)
          DO UPDATE SET
            base_rate = EXCLUDED.base_rate,
            per_kg_rate = EXCLUDED.per_kg_rate,
            updated_at = CURRENT_TIMESTAMP
        `;

        // Loop through the CSV rows and insert them. 
        // Note: req.user.id is mapped from our JWT Auth Middleware payload
        const userId = req.user.userId || req.user.id;

        for (const row of parsedRates) {
          await client.query(insertQuery, [
            userId,                    // $1
            row.OriginZone,            // $2
            row.DestinationZone,       // $3
            parseFloat(row.MaxWeight), // $4
            parseFloat(row.BaseRate),  // $5
            parseFloat(row.PerKgRate)  // $6
          ]);
        }

        // Commit the transaction if everything succeeded
        await client.query('COMMIT');

        console.log('Successfully parsed and saved CSV rows to database:', parsedRates.length);

        return res.status(200).json({ 
          success: true, 
          message: `Successfully uploaded and saved ${parsedRates.length} rates.` 
        });

      } catch (dbError) {
        // If any row fails, rollback the entire upload so we don't get partial data
        await client.query('ROLLBACK');
        console.error('Database Insertion Error:', dbError);
        return res.status(500).json({ error: 'Failed to save rates to the database.' });
      } finally {
        // Always release the client back to the pool
        client.release();
      }
    })
    .on('error', (error) => {
      console.error('CSV Parsing Error:', error.message);
      return res.status(500).json({ error: 'Failed to process the CSV file.' });
    });
});

module.exports = router;
