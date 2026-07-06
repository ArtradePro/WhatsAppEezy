/**
 * Rate Upload Service Validation Test
 * 
 * Verifies that the rate matrix CSV ingestion service correctly handles:
 * 1. Valid CSV input records.
 * 2. Validation errors (missing fields, invalid numbers).
 * 3. Sanitizes strings against unauthorized characters.
 */

const fs = require('fs');
const path = require('path');
const csvParser = require('csv-parser');
const { validateAndMapRow } = require('./rate_upload_service');

// 1. Setup mock CSV contents matching user's exact headers
const mockCsvValid = `Origin Zone,Destination Zone,Max Weight (kg),Base Rate (ZAR),Per Kg Rate (ZAR)
Zone A,Zone B,500,1200.00,3.50
Zone A,Zone C,1000,1500.00,2.90
Zone B,Zone C,750,950.00,4.10`;

const mockCsvInvalid = `Origin Zone,Destination Zone,Max Weight (kg),Base Rate (ZAR),Per Kg Rate (ZAR)
Zone A; DROP TABLE rates;,Zone B,500,1200.00,3.50
,Zone C,1000,-1500.00,2.90
Zone B,Zone C,abc,950.00,4.10`;

// Create temporary directory if not exists
const tmpDir = path.join(__dirname, 'tmp');
if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

const validFilePath = path.join(tmpDir, 'test_valid.csv');
const invalidFilePath = path.join(tmpDir, 'test_invalid.csv');

async function runTests() {
  console.log('==================================================');
  console.log('     CSV RATE MATRIX VALIDATION TEST              ');
  console.log('==================================================');

  // Write mock files
  fs.writeFileSync(validFilePath, mockCsvValid);
  fs.writeFileSync(invalidFilePath, mockCsvInvalid);

  try {
    console.log('\n--- TEST 1: Parsing Valid CSV File ---');
    const validResults = await parseCsv(validFilePath);
    console.log('✔ Successfully parsed valid rows:');
    console.table(validResults.records.map(r => ({
      'Origin Zone': r.origin_zone,
      'Destination Zone': r.destination_zone,
      'Max Weight': `${r.max_weight_kg}kg`,
      'Base Rate': `R${r.base_rate.toFixed(2)}`,
      'Per Kg Rate': `R${r.per_kg_rate.toFixed(2)}`
    })));

    console.log('\n--- TEST 2: Parsing Invalid CSV File ---');
    const invalidResults = await parseCsv(invalidFilePath);
    console.log('⚠ Caught validation errors:');
    invalidResults.errors.forEach(err => console.log(` - ❌ ${err}`));

  } catch (error) {
    console.error('Test script crashed:', error);
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(validFilePath)) fs.unlinkSync(validFilePath);
      if (fs.existsSync(invalidFilePath)) fs.unlinkSync(invalidFilePath);
    } catch (e) {}
  }
}

/**
 * Parses CSV and runs row-by-row validation using the service function
 */
function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    const errors = [];
    let index = 0;

    fs.createReadStream(filePath)
      .pipe(csvParser({
        mapHeaders: ({ header }) => header.trim().toLowerCase(),
      }))
      .on('data', (row) => {
        index++;
        const { error, value } = validateAndMapRow(row, index);
        if (error) {
          errors.push(error);
        } else {
          records.push(value);
        }
      })
      .on('end', () => {
        resolve({ records, errors });
      })
      .on('error', reject);
  });
}

runTests();
