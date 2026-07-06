import React, { useState } from 'react';
import './CarrierUploadDashboard.css';

export default function CarrierUploadDashboard() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  // Dashboard active rates state (updates dynamically on successful upload)
  const [activeRates, setActiveRates] = useState([
    { origin: 'Gauteng Hub', destination: 'Western Cape Hub', maxWeight: 500, baseRate: 1500, perKgRate: 4.20 },
    { origin: 'Gauteng Hub', destination: 'Western Cape Hub', maxWeight: 2000, baseRate: 2500, perKgRate: 3.80 },
    { origin: 'Gauteng Hub', destination: 'KwaZulu-Natal Hub', maxWeight: 500, baseRate: 1200, perKgRate: 3.10 },
  ]);

  // Handle file selection
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setMessage({ type: '', text: '' }); // Clear old messages
  };

  const handleRemoveFile = () => {
    setFile(null);
    setMessage({ type: '', text: '' });
  };

  // Handle form submission
  const handleUpload = async (e) => {
    e.preventDefault();
    
    if (!file) {
      setMessage({ type: 'error', text: 'Please select a CSV file first.' });
      return;
    }

    setUploading(true);
    setMessage({ type: '', text: '' });

    // 1. Prepare the file using FormData
    const formData = new FormData();
    formData.append('rateSheet', file); // 'rateSheet' MUST match upload.single('rateSheet') in Express

    try {
      // Get the carrier's login token (assuming you saved it to localStorage)
      const token = localStorage.getItem('carrierToken'); 

      // 2. Send the request
      const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiBaseUrl}/api/rates/upload-csv`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}` 
          // Note: Do NOT set 'Content-Type' here. Fetch automatically sets it 
          // to 'multipart/form-data' with the correct boundaries when using FormData.
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed.');
      }

      setMessage({ type: 'success', text: data.message });
      
      // Update Rates Matrix UI View dynamically on success
      if (data.data) {
        const formatted = data.data.map(r => ({
          origin: r.OriginZone,
          destination: r.DestinationZone,
          maxWeight: r.MaxWeight,
          baseRate: r.BaseRate,
          perKgRate: r.PerKgRate
        }));
        setActiveRates(formatted);
      }
      
      setFile(null); // Reset the input

    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="carrier-container">
      <header className="carrier-header">
        <h1>Carrier Rate Administration</h1>
        <p>Manage shipment lane structures, pricing rules, and upload bulk rate tables securely using ZAR matrices.</p>
      </header>

      <div className="dashboard-layout">
        {/* Left Side: Upload Panel */}
        <section className="carrier-dashboard">
          <h2>Rate Management</h2>
          <p>Upload your latest CSV rate matrix to update your pricing.</p>

          <form onSubmit={handleUpload} className="upload-form">
            {!file ? (
              <div className="file-input-wrapper">
                <div className="upload-icon">📁</div>
                <h3>Click to browse rate CSV</h3>
                <p className="file-specs">Only CSV formats under 5MB. Must match expected column headers.</p>
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileChange} 
                  disabled={uploading}
                  className="file-input-hidden"
                  required
                />
              </div>
            ) : (
              <div className="selected-file-badge">
                <div>
                  <strong>{file.name}</strong>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
                <button 
                  type="button" 
                  className="remove-btn" 
                  onClick={handleRemoveFile}
                  disabled={uploading}
                >
                  Remove
                </button>
              </div>
            )}
            
            <button 
              type="submit" 
              className="upload-submit-btn"
              disabled={!file || uploading}
            >
              {uploading ? 'Processing & Saving...' : 'Upload Rates'}
            </button>
          </form>

          {/* Feedback Messages */}
          {message.text && (
            <div className={`message-banner ${message.type}`}>
              <span>{message.type === 'error' ? '❌' : '✔'}</span>
              {message.text}
            </div>
          )}
        </section>

        {/* Right Side: Active Rates View Dashboard */}
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
