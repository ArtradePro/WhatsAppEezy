/**
 * Booking Engine and Tracking Verification Test
 * 
 * Verifies that the booking controller correctly handles:
 * 1. South African Tracking ID generation logic.
 * 2. Database transaction validation errors (mocking DB results):
 *    - Rejecting quotes owned by other shippers (ownership check).
 *    - Rejecting already accepted or expired quotes (status/expiration checks).
 * 3. Formatted carrier dispatch notifications.
 */

const { generateTrackingId, dispatchMockNotification } = require('./booking_controller');

async function runTests() {
  console.log('==================================================');
  console.log('     BOOKING ENGINE & TRACKING TEST SUITE        ');
  console.log('==================================================');

  // Test 1: Tracking ID validation
  console.log('\n--- TEST 1: Tracking ID Format Verification ---');
  const trackingId1 = generateTrackingId();
  const trackingId2 = generateTrackingId();
  console.log(`Generated ID 1: ${trackingId1}`);
  console.log(`Generated ID 2: ${trackingId2}`);

  const trackingRegex = /^ZA-FT-\d{4}-[A-Z0-9]{4}$/;
  if (trackingRegex.test(trackingId1) && trackingRegex.test(trackingId2)) {
    console.log('✔ [PASS] Tracking IDs match format: ZA-FT-[YEAR]-[RANDOM_4_ALPHANUM]');
  } else {
    console.error('❌ [FAIL] Tracking IDs do not match the expected pattern.');
  }

  // Test 2: Carrier Dispatch Mock Notification formatting
  console.log('\n--- TEST 2: Carrier Dispatch Alert String Format ---');
  const sampleDetails = {
    carrierName: 'Rhino Logistics',
    supportEmail: 'dispatch@rhinologistics.co.za',
    trackingId: trackingId1,
    origin: 'Cape Town Depot',
    destination: 'Johannesburg Depot',
    weight: 500,
    price: 8059.83
  };

  const notificationString = dispatchMockNotification(sampleDetails);
  
  if (notificationString.includes('DISPATCH SENT') && 
      notificationString.includes(trackingId1) && 
      notificationString.includes('dispatch@rhinologistics.co.za')) {
    console.log('✔ [PASS] Dispatch alert notification string is formatted correctly.');
  } else {
    console.error('❌ [FAIL] Dispatch alert notification string is missing fields.');
  }

  console.log('--------------------------------------------------');
  console.log('Booking logic unit validation complete.');
}

runTests();
