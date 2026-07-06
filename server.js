/**
 * B2B Freight Brokerage Platform Express Server
 * 
 * Sets up the API routes, enables CORS validation for the React client,
 * integrates dotenv for environment config, and boots the HTTP server.
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const { getQuotes } = require('./rating_engine_controller');
const { upload, handleRateUpload } = require('./rate_upload_service');
const { register, login, authorizeRole } = require('./auth_service');

const app = express();
const PORT = process.env.PORT || 5000;

// 1. CORS Configuration
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:3000', // React default dev server
  'http://localhost:5173',                         // Vite default dev server
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS policy: Unauthorized origin.'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// 2. Global Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 3. API Routes

// Public Auth Endpoints
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// Protected Shipper Endpoint to calculate instant quotes (Shippers only)
app.post('/api/quotes', authorizeRole('shipper'), getQuotes);

// Load Carrier Routing Module
app.use(require('./carrierRoutes'));

// Load Booking Routing Module
app.use(require('./bookingRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.message);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: err.message
  });
});

// 4. Start Server
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`   FREIGHT PLATFORM BACKEND STARTED SUCCESSFULLY  `);
  console.log(`==================================================`);
  console.log(`🚀 Server listening on Port: ${PORT}`);
  console.log(`🔗 Allowed CORS Client URL: ${allowedOrigins.join(', ')}`);
  console.log(`==================================================`);
});
