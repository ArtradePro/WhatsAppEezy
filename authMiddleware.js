/**
 * Auth Middleware Wrapper
 * 
 * Re-exports the authorizeRole middleware to match the project's folder structure.
 */

const { authorizeRole } = require('./auth_service');

module.exports = authorizeRole;
