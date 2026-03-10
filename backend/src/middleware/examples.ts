/**
 * Middleware Usage Examples
 * 
 * This file demonstrates how to use the authentication and validation middleware
 * in your routes.
 */

import { Router } from "express";
import { authMiddleware } from "./auth.middleware";
import { validationMiddleware } from "./validation.middleware";

// Example DTO validation function
const exampleValidator = (data: any) => {
  const errors: string[] = [];
  if (!data.name) errors.push("Name is required");
  return { isValid: errors.length === 0, errors };
};

// ==========================================
// AUTHENTICATION MIDDLEWARE EXAMPLES
// ==========================================

/**
 * Example 1: Protected route (requires authentication)
 * 
 * Usage: User must be logged in with a valid JWT token
 */
const router1 = Router();
router1.get(
  "/protected",
  (req, res, next) => authMiddleware.requireAuth(req, res, next),
  (req, res) => {
    // req.user is available here
    res.json({ user: req.user });
  },
);

/**
 * Example 2: Optional authentication
 * 
 * Usage: Route works for both authenticated and unauthenticated users
 * If authenticated, req.user will be populated
 */
const router2 = Router();
router2.get(
  "/public-with-user",
  (req, res, next) => authMiddleware.optionalAuth(req, res, next),
  (req, res) => {
    if (req.user) {
      res.json({ message: "Welcome back!", user: req.user });
    } else {
      res.json({ message: "Welcome, guest!" });
    }
  },
);

/**
 * Example 3: Non-guest users only
 * 
 * Usage: Blocks guest users from accessing the route
 */
const router3 = Router();
router3.post(
  "/premium-action",
  (req, res, next) => authMiddleware.requireAuth(req, res, next),
  (req, res, next) => authMiddleware.requireNonGuest(req, res, next),
  (_req, res) => {
    res.json({ message: "Premium feature accessed" });
  },
);

/**
 * Example 4: Role-based access (future implementation)
 * 
 * Usage: Restrict access to users with specific roles
 */
const router4 = Router();
router4.delete(
  "/admin-only",
  (req, res, next) => authMiddleware.requireAuth(req, res, next),
  authMiddleware.requireRole(["admin"]),
  (_req, res) => {
    res.json({ message: "Admin action performed" });
  },
);

// ==========================================
// VALIDATION MIDDLEWARE EXAMPLES
// ==========================================

/**
 * Example 5: Validate request body
 * 
 * Usage: Validates POST/PUT request bodies using DTO validators
 */
const router5 = Router();
router5.post(
  "/create",
  validationMiddleware.validateBody(exampleValidator),
  (_req, res) => {
    // req.body is validated here
    res.json({ success: true });
  },
);

/**
 * Example 6: Validate query parameters
 * 
 * Usage: Validates URL query parameters
 */
const router6 = Router();
router6.get(
  "/search",
  validationMiddleware.validateQuery(exampleValidator),
  (_req, res) => {
    // req.query is validated here
    res.json({ results: [] });
  },
);

/**
 * Example 7: Validate URL parameters
 * 
 * Usage: Validates route parameters like :id
 */
const router7 = Router();
router7.get(
  "/item/:id",
  validationMiddleware.validateParams(exampleValidator),
  (req, res) => {
    // req.params is validated here
    res.json({ id: req.params.id as string });
  },
);

/**
 * Example 8: Sanitize request body
 * 
 * Usage: Remove potentially dangerous characters from input
 */
const router8 = Router();
router8.post(
  "/safe",
  validationMiddleware.sanitizeBody,
  (_req, res) => {
    res.json({ success: true });
  },
);

// ==========================================
// COMBINED MIDDLEWARE EXAMPLES
// ==========================================

/**
 * Example 9: Multiple middleware in sequence
 * 
 * Usage: Combine authentication, validation, and sanitization
 */
const router9 = Router();
router9.post(
  "/secure-create",
  (req, res, next) => authMiddleware.requireAuth(req, res, next),
  validationMiddleware.sanitizeBody,
  validationMiddleware.validateBody(exampleValidator),
  (req, res) => {
    res.json({ success: true, user: req.user });
  },
);

/**
 * Example 10: Middleware with async/await
 * 
 * Usage: Using middleware in async route handlers
 */
const router10 = Router();
router10.get(
  "/async-protected",
  (req, res, next) => authMiddleware.requireAuth(req, res, next),
  async (req, res) => {
    // Async operations here
    const data = await Promise.resolve({ userId: req.user?.id });
    res.json(data);
  },
);

// ==========================================
// CLIENT USAGE EXAMPLES
// ==========================================

/**
 * Client-side example: Making authenticated requests
 * 
 * ```javascript
 * // Store tokens after login
 * const { accessToken, refreshToken } = loginResponse.data;
 * localStorage.setItem('accessToken', accessToken);
 * localStorage.setItem('refreshToken', refreshToken);
 * 
 * // Make authenticated request
 * fetch('/api/protected', {
 *   headers: {
 *     'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
 *     'Content-Type': 'application/json'
 *   }
 * });
 * 
 * // Refresh token when access token expires
 * fetch('/api/auth/refresh', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({
 *     refreshToken: localStorage.getItem('refreshToken')
 *   })
 * });
 * ```
 */

export {
  router1,
  router2,
  router3,
  router4,
  router5,
  router6,
  router7,
  router8,
  router9,
  router10,
};
