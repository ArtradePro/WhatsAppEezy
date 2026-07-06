/**
 * Booking Transaction & Tracking Controller
 * 
 * Converts an offered quote into a confirmed shipment booking,
 * executes transaction rollbacks, generates South African tracking IDs,
 * and handles mock email notification dispatching.
 */

// Import database pool
let pool;
try {
  pool = require('./db');
} catch (e) {
  // db configuration offline
}

/**
 * Express handler to book a quote.
 * 
 * Expected Request Body:
 * {
 *   "quote_id": "YOUR-QUOTE-UUID-HERE"
 * }
 */
async function createBooking(req, res) {
  const { quote_id } = req.body;
  const shipperId = req.user.id; // Populated by authorizeRole('shipper') gatekeeper

  if (!quote_id) {
    return res.status(400).json({ success: false, error: 'quote_id is required to process bookings.' });
  }

  if (!pool) {
    return res.status(500).json({
      success: false,
      error: 'Database connection driver missing. Booking transaction aborted.',
    });
  }

  const dbClient = await pool.connect();

  try {
    // 1. Transaction Block: Lock records to prevent double-booking or booking expired quotes
    await dbClient.query('BEGIN');

    // Retrieve quote details, verify user ownership and expiration
    const quoteQuery = `
      SELECT 
        q.id AS quote_id,
        q.status AS quote_status,
        q.valid_until,
        q.final_shipper_price,
        s.id AS shipment_id,
        s.shipper_id,
        s.status AS shipment_status,
        s.origin_address,
        s.destination_address,
        s.actual_weight_kg,
        u.company_name AS carrier_name,
        cp.support_email AS carrier_support_email
      FROM quotes q
      JOIN shipments s ON q.shipment_id = s.id
      JOIN users u ON q.carrier_id = u.id
      LEFT JOIN carrier_profiles cp ON cp.user_id = u.id
      WHERE q.id = $1 FOR UPDATE;
    `;

    const quoteRes = await dbClient.query(quoteQuery, [quote_id]);

    if (quoteRes.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'The requested quote was not found.' });
    }

    const quote = quoteRes.rows[0];

    // Security Check: Verify that the booking shipper is the owner of the shipment
    if (quote.shipper_id !== shipperId) {
      await dbClient.query('ROLLBACK');
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own the shipment attached to this quote.' });
    }

    // Validation: Verify quote is not already accepted, declined, or expired
    if (quote.quote_status !== 'offered') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `This quote cannot be booked. Current status: ${quote.quote_status}` });
    }

    if (new Date(quote.valid_until) < new Date()) {
      await dbClient.query('ROLLBACK');
      return res.status(410).json({ success: false, error: 'This quote has expired. Please request a new quote.' });
    }

    // Validation: Verify shipment is still in pending quote state
    if (quote.shipment_status !== 'pending_quote' && quote.shipment_status !== 'draft') {
      await dbClient.query('ROLLBACK');
      return res.status(400).json({ success: false, error: `Shipment is already booked or completed. Current status: ${quote.shipment_status}` });
    }

    // 2. Generate South African Format Tracking ID: ZA-FT-[YEAR]-[RANDOM_4_ALPHANUM]
    const trackingId = generateTrackingId();

    // 3. Database Modifications
    // Update booking quote status to accepted
    await dbClient.query(
      "UPDATE quotes SET status = 'accepted' WHERE id = $1",
      [quote_id]
    );

    // Decline all other active quotes for this shipment
    await dbClient.query(
      "UPDATE quotes SET status = 'declined' WHERE shipment_id = $1 AND id != $2 AND status = 'offered'",
      [quote.shipment_id, quote_id]
    );

    // Update shipment status to booked and save tracking ID
    // Check if tracking_id column exists (dynamic SQL alteration or query fallback)
    await dbClient.query(
      "UPDATE shipments SET status = 'booked' WHERE id = $1",
      [quote.shipment_id]
    );

    // Write record to bookings table
    const createBookingQuery = `
      INSERT INTO bookings (quote_id, shipment_id, tracking_id, carrier_notified)
      VALUES ($1, $2, $3, TRUE)
      RETURNING id, created_at;
    `;
    const bookingRes = await dbClient.query(createBookingQuery, [quote_id, quote.shipment_id, trackingId]);
    const newBooking = bookingRes.rows[0];

    await dbClient.query('COMMIT');

    // 4. Dispatch Mock Notification Alert to Carrier Operations Email
    const carrierEmail = quote.carrier_support_email || 'dispatch@carrier.co.za';
    const notificationAlert = dispatchMockNotification({
      carrierName: quote.carrier_name,
      supportEmail: carrierEmail,
      trackingId,
      origin: quote.origin_address,
      destination: quote.destination_address,
      weight: quote.actual_weight_kg,
      price: quote.final_shipper_price
    });

    return res.status(200).json({
      success: true,
      message: 'Shipment booked successfully.',
      booking: {
        booking_id: newBooking.id,
        tracking_id: trackingId,
        shipment_id: quote.shipment_id,
        price_zar: parseFloat(quote.final_shipper_price),
        status: 'booked',
        created_at: newBooking.created_at
      },
      notification: {
        sent_to: carrierEmail,
        log_message: notificationAlert
      }
    });

  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('Booking Transaction Failed:', error.message);
    return res.status(500).json({ success: false, error: 'Transaction failed. Booking aborted.', details: error.message });
  } finally {
    dbClient.release();
  }
}

/**
 * Generates tracking ID matching pattern ZA-FT-2026-XXXX
 */
function generateTrackingId() {
  const year = new Date().getFullYear();
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let randomStr = '';
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    randomStr += chars[idx];
  }
  return `ZA-FT-${year}-${randomStr}`;
}

/**
 * Creates dispatch alert log for mock messaging integrations (like Twilio, SendGrid)
 */
function dispatchMockNotification(details) {
  const logMsg = `[NOTIFICATION ALERT] Load Confirmed!
  To: ${details.supportEmail}
  Carrier: ${details.carrierName}
  Tracking ID: ${details.trackingId}
  Route: ${details.origin} -> ${details.destination}
  Weight: ${details.weight} kg
  Revenue: R ${details.price}
  Status: DISPATCH SENT`;
  
  console.log('==================================================');
  console.log(logMsg);
  console.log('==================================================');
  
  return logMsg;
}

module.exports = {
  createBooking,
  generateTrackingId,
  dispatchMockNotification
};
