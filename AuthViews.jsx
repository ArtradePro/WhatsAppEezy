import React, { useState } from 'react';
import './AuthViews.css';

export default function AuthViews() {
  const [isLogin, setIsLogin] = useState(true);
  
  // Registration and login fields state
  const [fields, setFields] = useState({
    email: '',
    password: '',
    role: 'shipper', // 'shipper' | 'carrier'
    company_name: '',
    phone: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFields((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleToggle = (status) => {
    setIsLogin(status);
    setError(null);
  };

  // Client-side validations
  const validateForm = () => {
    const { email, password, company_name, role } = fields;

    // Email regex check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return 'Please enter a valid email address.';
    }

    if (password.length < 8) {
      return 'Password must be at least 8 characters long.';
    }

    if (!isLogin) {
      if (!company_name.trim()) {
        return 'Company name is required for registration.';
      }
      if (!['shipper', 'carrier'].includes(role)) {
        return 'Please select a valid business role.';
      }
    }

    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

      const payload = isLogin 
        ? { email: fields.email.trim(), password: fields.password }
        : { 
            email: fields.email.trim(), 
            password: fields.password, 
            role: fields.role, 
            company_name: fields.company_name.trim(), 
            phone: fields.phone.trim() || undefined 
          };

      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Authentication failed. Please try again.');
      }

      // If registering only, automatically toggle to login screen with prefilled values
      if (!isLogin) {
        setIsLogin(true);
        setError(null);
        alert('Registration successful! Please login with your new credentials.');
        setFields(prev => ({ ...prev, password: '' })); // Clear password
        return;
      }

      // For Login: Save token to localStorage
      const token = result.token; // Expected Bearer format e.g. "Bearer eyJhbG..."
      localStorage.setItem('token', token);

      // Decode role from token payload
      const decodedUser = parseJwt(token.replace('Bearer ', ''));
      if (!decodedUser || !decodedUser.role) {
        throw new Error('Access token metadata is corrupt.');
      }

      // Redirect user to their respective protected workspace dashboard
      if (decodedUser.role === 'shipper') {
        window.location.href = '/shipper/quotes';
      } else if (decodedUser.role === 'carrier') {
        window.location.href = '/carrier/upload';
      } else {
        window.location.href = '/';
      }

    } catch (err) {
      setError(err.message || 'An error occurred during submission.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <header className="auth-header">
          <h2>{isLogin ? 'Sign In' : 'Create Account'}</h2>
          <p>{isLogin ? 'Access your freight dashboard' : 'Join the digital freight network'}</p>
        </header>

        {/* View Toggle tabs */}
        <div className="auth-toggle">
          <button
            type="button"
            className={`toggle-btn ${isLogin ? 'active' : ''}`}
            onClick={() => handleToggle(true)}
            disabled={loading}
          >
            Sign In
          </button>
          <button
            type="button"
            className={`toggle-btn ${!isLogin ? 'active' : ''}`}
            onClick={() => handleToggle(false)}
            disabled={loading}
          >
            Register
          </button>
        </div>

        {error && (
          <div className="auth-error-banner">
            <span>⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="auth-form-group">
            <label htmlFor="email">Email Address</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="e.g. logistics@company.co.za"
              className="auth-input"
              value={fields.email}
              onChange={handleInputChange}
              required
              disabled={loading}
            />
          </div>

          <div className="auth-form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Min. 8 characters"
              className="auth-input"
              value={fields.password}
              onChange={handleInputChange}
              required
              disabled={loading}
            />
          </div>

          {/* Registration Extra Fields */}
          {!isLogin && (
            <>
              <div className="auth-form-group">
                <label htmlFor="company_name">Company Name</label>
                <input
                  id="company_name"
                  name="company_name"
                  type="text"
                  placeholder="e.g. Fast Freight SA"
                  className="auth-input"
                  value={fields.company_name}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                />
              </div>

              <div className="auth-form-group">
                <label htmlFor="phone">Phone Number (Optional)</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  placeholder="e.g. +27110000001"
                  className="auth-input"
                  value={fields.phone}
                  onChange={handleInputChange}
                  disabled={loading}
                />
              </div>

              <div className="auth-form-group">
                <label htmlFor="role">Business Type</label>
                <select
                  id="role"
                  name="role"
                  className="auth-input"
                  value={fields.role}
                  onChange={handleInputChange}
                  required
                  disabled={loading}
                >
                  <option value="shipper">Shipper (Request Quotes)</option>
                  <option value="carrier">Carrier (Provide Rates)</option>
                </select>
              </div>
            </>
          )}

          <button
            type="submit"
            className="auth-submit-btn"
            disabled={loading}
          >
            {loading ? 'Processing...' : isLogin ? 'Sign In' : 'Register Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

/**
 * Utility helper to parse JWT claims client-side
 */
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}
