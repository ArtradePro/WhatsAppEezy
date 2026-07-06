import React, { useState, useRef } from 'react';
import './CarrierDashboard.css';

export default function CarrierDashboard() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  
  // Client-side validation / parsing states
  const [parseResult, setParseResult] = useState(null);
  const [clientErrors, setClientErrors] = useState([]);
  
  // API life-cycle states
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState(null);
  const [apiSuccess, setApiSuccess] = useState(null);
  
  // Active rates matrix state (mocked loaded state, updates on upload)
  const [activeRates, setActiveRates] = useState([
    { origin: 'Gauteng Hub', destination: 'Western Cape Hub', maxWeight: 500, baseRate: 1500, perKgRate: 4.20 },
    { origin: 'Gauteng Hub', destination: 'Western Cape Hub', maxWeight: 2000, baseRate: 2500, perKgRate: 3.80 },
    { origin: 'Gauteng Hub', destination: 'KwaZulu-Natal Hub', maxWeight: 500, baseRate: 1200, perKgRate: 3.10 },
  ]);

  const fileInputRef = useRef(null);

  // 1. Drag and Drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileSelected(droppedFile);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current.click();
  };

  // 2. Client-side CSV Parser & Validator
  const handleFileSelected = (selectedFile) => {
    setApiError(null);
    setApiSuccess(null);
    setClientErrors([]);
    setParseResult(null);

    // Validate file type extension
    if (!selectedFile.name.endsWith('.csv')) {
      setApiError('Invalid file type. Please select a .csv file.');
      return;
    }

    setFile(selectedFile);

    // Read and parse client-side for dynamic feedback
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      parseAndValidateCSV(text);
    };
    reader.readAsText(selectedFile);
  };

  const parseAndValidateCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length <= 1) {
      setClientErrors(['The CSV file is empty or missing data rows.']);
      return;
    }

    // Parse headers and normalize
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Check required columns: origin zone, destination zone, max weight (kg), base rate (zar), per kg rate (zar)
    const expectedHeaders = ['origin zone', 'destination zone', 'max weight (kg)', 'base rate (zar)', 'per kg rate (zar)'];
    const missingHeaders = expectedHeaders.filter(eh => !headers.includes(eh));

    if (missingHeaders.length > 0) {
      setClientErrors([`Missing required headers: [${missingHeaders.join(', ')}].`]);
      return;
    }

    const rows = [];
    const errors = [];

    // Map rows
    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const values = lines[i].split(',').map(v => v.trim());

      // Skip blank rows
      if (values.length === 1 && values[0] === '') continue;

      if (values.length < headers.length) {
        errors.push(`Row ${rowNum}: Column count mismatch. Expected ${headers.length} values.`);
        continue;
      }

      // Map values to header names
      const row = {};
      headers.forEach((h, index) => {
        row[h] = values[index];
      });

      // Validations
      const origin = row['origin zone'];
      const destination = row['destination zone'];
      const maxWeight = parseFloat(row['max weight (kg)']);
      const baseRate = parseFloat(row['base rate (zar)']);
      const perKgRate = parseFloat(row['per kg rate (zar)']);

      if (!origin) errors.push(`Row ${rowNum}: "Origin Zone" is required.`);
      if (!destination) errors.push(`Row ${rowNum}: "Destination Zone" is required.`);
      
      if (isNaN(maxWeight) || maxWeight <= 0) {
        errors.push(`Row ${rowNum}: "Max Weight (kg)" must be a positive number.`);
      }
      if (isNaN(baseRate) || baseRate < 0) {
        errors.push(`Row ${rowNum}: "Base Rate (ZAR)" must be a positive number.`);
      }
      if (isNaN(perKgRate) || perKgRate < 0) {
        errors.push(`Row ${rowNum}: "Per Kg Rate (ZAR)" must be a positive number.`);
      }

      // Safe character checks
      const safeStringRegex = /^[a-zA-Z0-9\s\-\,\.\/]+$/;
      if (origin && !safeStringRegex.test(origin)) {
        errors.push(`Row ${rowNum}: "Origin Zone" contains invalid characters.`);
      }
      if (destination && !safeStringRegex.test(destination)) {
        errors.push(`Row ${rowNum}: "Destination Zone" contains invalid characters.`);
      }

      if (errors.length === 0) {
        rows.push({
          origin,
          destination,
          maxWeight,
          baseRate,
          perKgRate
        });
      }
    }

    setClientErrors(errors);
    setParseResult({
      total: lines.length - 1,
      valid: rows.length,
      invalid: errors.length,
      data: rows
    });
  };

  const handleRemoveFile = () => {
    setFile(null);
    setParseResult(null);
    setClientErrors([]);
    setApiSuccess(null);
    setApiError(null);
  };

  // 3. API Upload Handler
  const handleUploadToServer = async () => {
    if (!file || clientErrors.length > 0) return;

    setLoading(true);
    setApiError(null);
    setApiSuccess(null);

    const formData = new FormData();
    formData.append('rateSheet', file); // Maps to Multer's single('rateSheet') file check

    try {
      const token = localStorage.getItem('token');
      const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';

      const response = await fetch(`${apiBaseUrl}/api/rates/upload-csv`, {
        method: 'POST',
        headers: {
          // Token is required to authorizeRole('carrier') gatekeeper
          'Authorization': token || 'Bearer dummy-token-for-development'
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || result.details || 'Ingestion endpoint rejected file upload.');
      }

      setApiSuccess(result.message || 'Rates successfully uploaded and saved to the database.');
      
      // Update Rates Matrix View Dashboard with new parsed data
      if (parseResult && parseResult.data) {
        setActiveRates(parseResult.data);
      }
      
      // Reset upload container
      setFile(null);
      setParseResult(null);

    } catch (err) {
      setApiError(err.message || 'An error occurred while uploading rates.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="carrier-container">
      <header className="carrier-header">
        <h1>Carrier Rate Administration</h1>
        <p>Manage shipment lane structures, pricing rules, and upload bulk rate tables securely using ZAR matrices.</p>
      </header>

      <div className="dashboard-layout">
        {/* Left Side: Upload Console */}
        <section className="upload-panel">
          <h2 className="panel-section-title">Ingest Rate Matrix</h2>

          {apiError && <div className="alert-banner error"><span>❌</span> {apiError}</div>}
          {apiSuccess && <div className="alert-banner success"><span>✔</span> {apiSuccess}</div>}

          {!file ? (
            <div 
              className={`dropzone ${dragActive ? 'active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={onButtonClick}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                style={{ display: 'none' }}
                accept=".csv"
                onChange={handleFileChange}
              />
              <div className="upload-icon">📁</div>
              <h3>Drag & drop rate CSV or click to browse</h3>
              <p className="file-specs">Strictly CSV file types under 5MB. Standard South African column formats only.</p>
            </div>
          ) : (
            <div className="file-preview-card">
              <div className="file-info">
                <span className="file-name">{file.name}</span>
                <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
              </div>
              <button 
                type="button" 
                className="remove-file-btn"
                onClick={handleRemoveFile}
                disabled={loading}
              >
                ✕ Remove
              </button>
            </div>
          )}

          {/* Client-Side Validation Feedback */}
          {parseResult && (
            <div className="validation-summary-card">
              <h3>CSV Structure Preview</h3>
              <div className="summary-stats">
                <div className="stat-item">
                  <span className="stat-val">{parseResult.total}</span>
                  <span className="stat-lbl">Total Rows</span>
                </div>
                <div className="stat-item" style={parseResult.invalid > 0 ? { color: 'var(--danger)' } : { color: 'var(--success)' }}>
                  <span className="stat-val">{parseResult.invalid}</span>
                  <span className="stat-lbl">Format Errors</span>
                </div>
              </div>

              {clientErrors.length > 0 && (
                <ul className="row-error-list">
                  {clientErrors.map((err, index) => (
                    <li key={index}>⚠️ {err}</li>
                  ))}
                </ul>
              )}

              <button
                type="button"
                className="upload-action-btn"
                onClick={handleUploadToServer}
                disabled={loading || clientErrors.length > 0}
              >
                {loading ? 'Uploading & Seeding Database...' : 'Upload Rates to Server'}
              </button>
            </div>
          )}
        </section>

        {/* Right Side: Active Rates Dashboard */}
        <section className="matrix-panel">
          <h2 className="panel-section-title">Active Carrier Rate Matrix</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            Live weight breaks and pricing rules registered to your carrier profile.
          </p>

          <div className="rates-table-container">
            <table className="rates-table">
              <thead>
                <tr>
                  <th>Origin Zone</th>
                  <th>Destination Zone</th>
                  <th>Max Weight</th>
                  <th>Base Rate</th>
                  <th>Per Kg Rate</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeRates.map((rate, index) => (
                  <tr key={index}>
                    <td>{rate.origin}</td>
                    <td>{rate.destination}</td>
                    <td>{rate.maxWeight} kg</td>
                    <td>R {rate.baseRate.toFixed(2)}</td>
                    <td>R {rate.perKgRate.toFixed(2)}</td>
                    <td><span className="rate-badge">Active</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
