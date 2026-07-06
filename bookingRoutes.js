/**
 * Protected Booking Routes Module
 * 
 * Handles shipper quote bookings.
 * Enforces role authorization via authorizeRole('shipper').
 */

const express = require('express');
const authorizeRole = require('./authMiddleware'); // Gatekeeper middleware
const { createBooking } = require('./booking_controller');

const router = express.Router();

// The Route: Chained authorizeRole('shipper') and createBooking
router.post('/api/bookings', authorizeRole('shipper'), createBooking);

module.exports = router;
