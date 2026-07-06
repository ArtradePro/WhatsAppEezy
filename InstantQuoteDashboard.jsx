import React, { useState } from 'react';
import './InstantQuoteDashboard.css';

export default function InstantQuoteDashboard() {
  const [formData, setFormData] = useState({
    origin_postal_code: '',
    destination_postal_code: '',
    handling_unit: 'pallets', // 'pallets' | 'cartons'
    length_cm: '',
    width_cm: '',
    height_cm: '',
    weight_kg: '',
  });

  const [loading, setLoading] = useState(false);
  const [quotes, setQuotes] = useState(null);
  const [error, setError] = useState(null);
  const [bookingId, setBookingId] = useState(null);
  const [bookingLoading, setBookingLoading] = useState(false);

  // Client-side input validation
  const validateForm = () => {
    const {
      origin_postal_code,
      destination_postal_code,
      length_cm,
      width_cm,
      height_cm,
      weight_kg,
    } = formData;

    if (!/^\d{4}$/.test(origin_postal_code.trim())) {
      return 'Origin must be a valid 4-digit South African postal code.';
    }
    if (!/^\d{4}$/.test(destination_postal_code.trim())) {
      return 'Destination must be a valid 4-digit South African postal code.';
    }
    if (!weight_kg || parseFloat(weight_kg) <= 0) {
      return 'Weight must be a positive number.';
    }
    if (!length_cm || parseFloat(length_cm) <= 0 || !width_cm || parseFloat(width_cm) <= 0 || !height_cm || parseFloat(height_cm) <= 0) {
      return 'All dimensions must be positive numbers.';
    }
    return null;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleUnitChange = (unit) => {
    setFormData((prev) => ({
      ...prev,
      handling_unit: unit,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setQuotes(null);
    setBookingId(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      // API call to the backend Rating Engine Controller
      const response = await fetch('/api/quotes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          weight_kg: parseFloat(formData.weight_kg),
          length_cm: parseFloat(formData.length_cm),
          width_cm: parseFloat(formData.width_cm),
          height_cm: parseFloat(formData.height_cm),
          origin_postal_code: formData.origin_postal_code.trim(),
          destination_postal_code: formData.destination_postal_code.trim(),
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to aggregate carrier rates.');
      }

      // Add mock transit times for display aesthetics based on route distance
      const quotesWithTransit = (result.quotes || []).map((quote) => {
        let transitTime = '24 Hours';
        if (quote.route_distance_km > 1000) {
          transitTime = '48 - 72 Hours';
        } else if (quote.route_distance_km > 400) {
          transitTime = '24 - 48 Hours';
        }
        return {
          ...quote,
          transit_time: transitTime,
        };
      });

      setQuotes(quotesWithTransit);
    } catch (err) {
      setError(err.message || 'An error occurred while fetching quotes.');
    } finally {
      setLoading(false);
    }
  };

  const handleBookQuote = async (quote) => {
    setBookingLoading(true);
    setBookingId(null);
    try {
      // Simulate booking API call
      await new Promise((resolve) => setTimeout(resolve, 1500));
      setBookingId(quote.carrier_id);
    } catch (err) {
      setError('Booking failed. Please try again.');
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <h1>Instant Freight Quote</h1>
        <p>B2B rate aggregator for South African road freight network. Get instant quotes with dynamic markup pricing.</p>
      </header>

      <div className="dashboard-grid">
        {/* Input Panel */}
        <section className="quote-panel">
          <h2 className="panel-title">Shipment Details</h2>
          
          {error && (
            <div className="error-alert">
              <span>⚠</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Handling Unit</label>
              <div className="segmented-control">
                <button
                  type="button"
                  className={`segment-btn ${formData.handling_unit === 'pallets' ? 'active' : ''}`}
                  onClick={() => handleUnitChange('pallets')}
                >
                  Pallets
                </button>
                <button
                  type="button"
                  className={`segment-btn ${formData.handling_unit === 'cartons' ? 'active' : ''}`}
                  onClick={() => handleUnitChange('cartons')}
                >
                  Cartons
                </button>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="origin_postal_code">Origin Postal Code (SA)</label>
              <input
                id="origin_postal_code"
                name="origin_postal_code"
                type="text"
                placeholder="e.g. 8001 (Cape Town)"
                maxLength="4"
                className="input-field"
                value={formData.origin_postal_code}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="destination_postal_code">Destination Postal Code (SA)</label>
              <input
                id="destination_postal_code"
                name="destination_postal_code"
                type="text"
                placeholder="e.g. 2000 (Joburg)"
                maxLength="4"
                className="input-field"
                value={formData.destination_postal_code}
                onChange={handleInputChange}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="weight_kg">Total Weight</label>
              <div className="input-container-rel">
                <input
                  id="weight_kg"
                  name="weight_kg"
                  type="number"
                  placeholder="e.g. 500"
                  min="1"
                  step="any"
                  className="input-field"
                  value={formData.weight_kg}
                  onChange={handleInputChange}
                  required
                />
                <span className="unit-tag">kg</span>
              </div>
            </div>

            <div className="form-group">
              <label>Dimensions per Unit (L x W x H)</label>
              <div className="dimensions-grid">
                <div className="input-container-rel">
                  <input
                    name="length_cm"
                    type="number"
                    placeholder="L"
                    min="1"
                    className="input-field"
                    value={formData.length_cm}
                    onChange={handleInputChange}
                    required
                  />
                  <span className="unit-tag">cm</span>
                </div>
                <div className="input-container-rel">
                  <input
                    name="width_cm"
                    type="number"
                    placeholder="W"
                    min="1"
                    className="input-field"
                    value={formData.width_cm}
                    onChange={handleInputChange}
                    required
                  />
                  <span className="unit-tag">cm</span>
                </div>
                <div className="input-container-rel">
                  <input
                    name="height_cm"
                    type="number"
                    placeholder="H"
                    min="1"
                    className="input-field"
                    value={formData.height_cm}
                    onChange={handleInputChange}
                    required
                  />
                  <span className="unit-tag">cm</span>
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="submit-btn"
              disabled={loading || bookingLoading}
            >
              {loading ? 'Aggregating Rates...' : 'Get Instant Quote'}
            </button>
          </form>
        </section>

        {/* Results Panel */}
        <section className="quotes-container">
          {/* Default Placeholder State */}
          {!loading && !quotes && (
            <div className="no-quotes-placeholder">
              <div className="placeholder-icon">🚚</div>
              <h3>Ready to Calculate</h3>
              <p>Enter your freight dimensions and coordinates to fetch rates from registered carriers.</p>
            </div>
          )}

          {/* Skeleton Loading State */}
          {loading && (
            <div className="quotes-grid">
              {[1, 2, 3].map((i) => (
                <div key={i} className="skeleton-card">
                  <div className="skeleton-card-header">
                    <div style={{ width: '100%' }}>
                      <div className="skeleton-pulse skeleton-title"></div>
                      <div className="skeleton-pulse skeleton-subtitle"></div>
                    </div>
                  </div>
                  <div className="skeleton-details">
                    <div className="skeleton-pulse skeleton-text"></div>
                    <div className="skeleton-pulse skeleton-text-short"></div>
                  </div>
                  <div className="quote-pricing">
                    <div className="skeleton-pulse skeleton-price"></div>
                    <div className="skeleton-pulse skeleton-button"></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Quotes Results Grid */}
          {!loading && quotes && (
            <div className="quotes-grid">
              {quotes.length === 0 ? (
                <div className="no-quotes-placeholder">
                  <div className="placeholder-icon">⚠</div>
                  <h3>No Rates Found</h3>
                  <p>No carriers currently service this weight bracket or route radius. Try adjusting weight or depot proximity parameters.</p>
                </div>
              ) : (
                quotes.map((quote) => {
                  const isBooked = bookingId === quote.carrier_id;
                  return (
                    <div key={quote.carrier_id} className="quote-card">
                      <div className="quote-card-header">
                        <div className="carrier-info">
                          <span className="carrier-name">
                            {/* Option to white-label as 'Guaranteed Carrier' or show name */}
                            {quote.carrier_name || 'Guaranteed Carrier'}
                          </span>
                          <span className="carrier-depot">via {quote.depot_name}</span>
                        </div>
                        <span className="badge-guaranteed">Direct</span>
                      </div>

                      <div className="quote-details">
                        <div className="detail-row">
                          <span className="detail-label">Transit Time:</span>
                          <span className="detail-value" style={{ color: 'var(--success)' }}>
                            {quote.transit_time}
                          </span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Route Distance:</span>
                          <span className="detail-value">{quote.route_distance_km} km</span>
                        </div>
                        <div className="detail-row">
                          <span className="detail-label">Chargeable Weight:</span>
                          <span className="detail-value">{quote.chargeable_weight_kg} kg</span>
                        </div>
                        <div className="detail-row" style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                          <span className="detail-label">Fuel Surcharge:</span>
                          <span className="detail-value">Included</span>
                        </div>
                      </div>

                      <div className="quote-pricing">
                        <div className="price-container">
                          <span className="price-label">All-Inclusive Price</span>
                          <span className="price-amount">
                            R {quote.pricing.final_shipper_price.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <button
                          className="book-btn"
                          onClick={() => handleBookQuote(quote)}
                          disabled={bookingLoading || isBooked}
                          style={isBooked ? { background: 'var(--success)', color: '#ffffff', borderColor: 'transparent' } : {}}
                        >
                          {bookingLoading && bookingId === null ? '...' : isBooked ? 'Booked ✓' : 'Book Now'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
