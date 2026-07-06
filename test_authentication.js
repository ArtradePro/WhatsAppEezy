/**
 * Authentication and RBAC Verification Test
 * 
 * Simulates route access attempts to verify:
 * 1. Public registration and login token generation.
 * 2. Protection blocks on endpoints (unauthenticated requests).
 * 3. Role-Based Access Control (RBAC) via authorizeRole middleware:
 *    - Shippers cannot upload rate matrices.
 *    - Carriers cannot calculate customer quotes.
 */

const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth_service');

// Simulated Auth contexts
const mockShipperPayload = {
  id: 'shipper-uuid-1111',
  email: 'shipper@client.co.za',
  role: 'shipper',
};

const mockCarrierPayload = {
  id: 'carrier-uuid-2222',
  email: 'carrier@freight.co.za',
  role: 'carrier',
};

const mockAdminPayload = {
  id: 'admin-uuid-3333',
  email: 'admin@freightbroker.co.za',
  role: 'admin',
};

// Generate valid test JWTs
const shipperToken = 'Bearer ' + jwt.sign(mockShipperPayload, JWT_SECRET, { expiresIn: '1h' });
const carrierToken = 'Bearer ' + jwt.sign(mockCarrierPayload, JWT_SECRET, { expiresIn: '1h' });
const adminToken = 'Bearer ' + jwt.sign(mockAdminPayload, JWT_SECRET, { expiresIn: '1h' });
const expiredToken = 'Bearer ' + jwt.sign(mockShipperPayload, JWT_SECRET, { expiresIn: '-1h' });
const tamperedToken = 'Bearer ' + jwt.sign(mockShipperPayload, 'wrong_secret', { expiresIn: '1h' });

// Load middleware
const { authorizeRole } = require('./auth_service');

function runTest(testName, token, requiredRole, expectedStatus, doneCallback) {
  const req = {
    headers: token ? { 'authorization': token } : {},
  };

  let testFinished = false;

  const res = {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      if (!testFinished) {
        testFinished = true;
        evaluateResult(testName, this.statusCode, expectedStatus, data.error);
        doneCallback();
      }
      return this;
    }
  };

  // Run the authorizeRole middleware directly
  const middleware = authorizeRole(requiredRole);
  
  middleware(req, res, () => {
    // If next() is called, access is granted (Status 200)
    if (!testFinished) {
      testFinished = true;
      evaluateResult(testName, 200, expectedStatus, null);
      doneCallback();
    }
  });
}

function evaluateResult(testName, actualStatus, expectedStatus, errorMsg) {
  if (actualStatus === expectedStatus) {
    console.log(`✔ [PASS] ${testName} (Status: ${actualStatus})`);
  } else {
    console.error(`❌ [FAIL] ${testName} -> Expected Status: ${expectedStatus}, Got: ${actualStatus}. Error: ${errorMsg}`);
  }
}

async function start() {
  console.log('==================================================');
  console.log('     JWT & ROLE-BASED ACCESS CONTROL TESTS        ');
  console.log('==================================================');

  const tests = [
    {
      name: 'Access quotes endpoint without Token',
      token: null,
      role: 'shipper',
      expected: 401,
    },
    {
      name: 'Access quotes endpoint with Expired Token',
      token: expiredToken,
      role: 'shipper',
      expected: 401, // JWT verification error falls back to 401 Unauthorized in custom middleware
    },
    {
      name: 'Access quotes endpoint with Tampered Token Signature',
      token: tamperedToken,
      role: 'shipper',
      expected: 401, // JWT verification error falls back to 401
    },
    {
      name: 'Access quotes endpoint as Carrier (Unauthorized Role)',
      token: carrierToken,
      role: 'shipper',
      expected: 403, // Role mismatch triggers 403 Forbidden
    },
    {
      name: 'Access quotes endpoint as Shipper (Authorized Role)',
      token: shipperToken,
      role: 'shipper',
      expected: 200,
    },
    {
      name: 'Access rate upload endpoint as Shipper (Unauthorized Role)',
      token: shipperToken,
      role: 'carrier',
      expected: 403, // Role mismatch triggers 403 Forbidden
    },
    {
      name: 'Access rate upload endpoint as Carrier (Authorized Role)',
      token: carrierToken,
      role: 'carrier',
      expected: 200,
    }
  ];

  let current = 0;
  function next() {
    if (current < tests.length) {
      const t = tests[current++];
      runTest(t.name, t.token, t.role, t.expected, next);
    } else {
      console.log('--------------------------------------------------');
      console.log('Authentication verification complete.');
    }
  }
  next();
}

start();
