import { Request, Response, NextFunction } from "express";
import { jwtUtil } from "../utils/jwt.util";
import { authService } from "../modules/auth/auth.service";
// @ts-expect-error - Used in Express.Request type declaration below
import type { User } from "../modules/user/user.entity";

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
    interface User {
      id: string;
      username: string;
      email: string;
      isGuest: boolean;
    }
  }
}

export class AuthMiddleware {
  /**
   * Require authentication - blocks unauthenticated requests
   */
  async requireAuth(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
          success: false,
          error: "Authentication required. Please provide a valid token.",
        });
        return;
      }

      const token = authHeader.split(" ")[1];
      
      if (!token) {
        res.status(401).json({
          success: false,
          error: "Invalid authorization header format.",
        });
        return;
      }
      
      const verifyResult = jwtUtil.verifyAccessToken(token);

      if (verifyResult.isErr()) {
        res.status(401).json({
          success: false,
          error: verifyResult.error,
        });
        return;
      }

      const payload = verifyResult.value;

      // Fetch user from database
      const userResult = await authService.findById(payload.userId);

      if (userResult.isErr()) {
        res.status(401).json({
          success: false,
          error: "User not found or token is invalid.",
        });
        return;
      }

      // Attach user to request
      req.user = userResult.value;
      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: `Authentication error: ${errorMessage}`,
      });
    }
  }

  /**
   * Optional authentication - allows both authenticated and unauthenticated requests
   * If token is provided and valid, attaches user to request
   */
  async optionalAuth(
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        // No token provided, continue without user
        next();
        return;
      }

      const token = authHeader.split(" ")[1];
      
      if (!token) {
        next();
        return;
      }
      
      const verifyResult = jwtUtil.verifyAccessToken(token);

      if (verifyResult.isErr()) {
        // Invalid token, continue without user
        next();
        return;
      }

      const payload = verifyResult.value;

      // Fetch user from database
      const userResult = await authService.findById(payload.userId);

      if (userResult.isOk()) {
        // Attach user to request if found
        req.user = userResult.value;
      }

      next();
    } catch (error) {
      // On error, continue without user
      next();
    }
  }

  /**
   * Require specific role - future implementation for role-based access control
   */
  requireRole(_roles: string[]) {
    return async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      try {
        if (!req.user) {
          res.status(401).json({
            success: false,
            error: "Authentication required.",
          });
          return;
        }

        // TODO: Implement role checking when role field is added to User entity
        // For now, just check if user exists
        // const userRole = req.user.role;
        // if (!roles.includes(userRole)) {
        //   res.status(403).json({
        //     success: false,
        //     error: "Insufficient permissions.",
        //   });
        //   return;
        // }

        next();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        res.status(500).json({
          success: false,
          error: `Authorization error: ${errorMessage}`,
        });
      }
    };
  }

  /**
   * Require non-guest user - blocks guest users from accessing certain routes
   */
  async requireNonGuest(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: "Authentication required.",
        });
        return;
      }

      if (req.user.isGuest) {
        res.status(403).json({
          success: false,
          error:
            "Guest users cannot access this resource. Please create an account.",
        });
        return;
      }

      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: `Authorization error: ${errorMessage}`,
      });
    }
  }
}

export const authMiddleware = new AuthMiddleware();
