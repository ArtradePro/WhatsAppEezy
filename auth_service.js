/**
 * Authentication & Authorization Service
 * 
 * Handles user registration, JWT-based login authentication,
 * and middleware for route protection and Role-Based Access Control (RBAC).
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Config parameters (should be populated from environment variables in production)
const JWT_SECRET = process.env.JWT_SECRET || 'freight_brokerage_jwt_secret_key_2026_secure';
const JWT_EXPIRATION = '24h';

let pool;
try {
  pool = require('./db');
} catch (e) {
  // db configuration offline
}

/**
 * Register a new user (Shipper or Carrier).
 */
async function register(req, res) {
  try {
    const { email, password, role, company_name, phone } = req.body;

    // 1. Basic validation
    if (!email || !password || !role || !company_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required registration fields: email, password, role, company_name.',
      });
    }

    const normalizedRole = role.trim().toLowerCase();
    if (!['shipper', 'carrier', 'admin'].includes(normalizedRole)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid role. Supported roles are: shipper, carrier.',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'Password must be at least 8 characters long.',
      });
    }

    if (!pool) {
      return res.status(500).json({
        success: false,
        error: 'Database driver not configured.',
      });
    }

    // 2. Check if user already exists
    const userCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (userCheck.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'A user with this email address already exists.',
      });
    }

    // 3. Hash password securely
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // 4. Save user to database
    const insertQuery = `
      INSERT INTO users (email, password_hash, role, company_name, phone)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, role, company_name, phone, created_at;
    `;

    const values = [
      email.trim().toLowerCase(),
      passwordHash,
      normalizedRole,
      company_name.trim(),
      phone ? phone.trim() : null,
    ];

    const result = await pool.query(insertQuery, values);
    const newUser = result.rows[0];

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        company_name: newUser.company_name,
        phone: newUser.phone,
      },
    });

  } catch (error) {
    console.error('Registration Error:', error);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during user registration.',
    });
  }
}

/**
 * Login handler returning signed JWT token.
 */
async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required.',
      });
    }

    if (!pool) {
      return res.status(500).json({
        success: false,
        error: 'Database driver not configured.',
      });
    }

    // 1. Fetch user from database
    const userResult = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials. Please verify your email and password.',
      });
    }

    const user = userResult.rows[0];

    // 2. Verify hashed password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials. Please verify your email and password.',
      });
    }

    // 3. Generate JWT containing id, email, and role
    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRATION });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token: `Bearer ${token}`,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        company_name: user.company_name,
      },
    });

  } catch (error) {
    console.error('Login Error:', error);
    return res.status(500).json({
      success: false,
      error: 'An internal error occurred during authentication.',
    });
  }
}

/**
 * Middleware: Verifies the JWT token and checks the user's role.
 */
const authorizeRole = (requiredRole) => {
  return (req, res, next) => {
    // 1. Look for the token in the Authorization header
    const authHeader = req.headers.authorization || req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    // Extract just the token string
    const token = authHeader.split(' ')[1];

    try {
      // 2. Verify the token using secret key
      const decoded = jwt.verify(token, JWT_SECRET);

      // 3. Verify the role
      if (decoded.role !== requiredRole) {
        return res.status(403).json({ error: 'Forbidden: You do not have permission to perform this action.' });
      }

      // 4. Attach the decoded user data to the request context
      req.user = decoded;
      next();
      
    } catch (error) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }
  };
};

module.exports = {
  register,
  login,
  authorizeRole,
  JWT_SECRET,
};
