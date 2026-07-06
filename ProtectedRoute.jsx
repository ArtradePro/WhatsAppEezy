import React from 'react';
import { Navigate } from 'react-router-dom';

/**
 * ProtectedRoute Component Wrapper
 * 
 * Enforces authentication checks and role constraints on React Router routes.
 * 
 * Usage Example:
 * <Route path="/shipper/quotes" element={
 *   <ProtectedRoute allowedRoles={['shipper', 'admin']}>
 *     <InstantQuoteDashboard />
 *   </ProtectedRoute>
 * } />
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const token = localStorage.getItem('token');

  // 1. Check if token exists
  if (!token || !token.startsWith('Bearer ')) {
    return <Navigate to="/login" replace />;
  }

  // 2. Decode the token payload
  const rawToken = token.split(' ')[1];
  const user = parseJwt(rawToken);

  if (!user) {
    // Clean up corrupt token
    localStorage.removeItem('token');
    return <Navigate to="/login" replace />;
  }

  // 3. Verify token expiration
  const currentTimestamp = Math.floor(Date.now() / 1000);
  if (user.exp && user.exp < currentTimestamp) {
    console.warn('Session expired. Redirecting to login.');
    localStorage.removeItem('token');
    return <Navigate to="/login" replace />;
  }

  // 4. Verify role authorization
  const isAuthorized = allowedRoles.includes(user.role);
  if (!isAuthorized) {
    console.error(`Access Denied: User role "${user.role}" is not authorized.`);
    return <Navigate to="/unauthorized" replace />;
  }

  // 5. If all validation checks pass, render the child component (the protected dashboard view)
  return children;
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
