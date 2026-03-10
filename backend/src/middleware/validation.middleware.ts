import { Request, Response, NextFunction } from "express";

export type ValidationFunction = (
  data: any,
) => { isValid: boolean; errors: string[] };

export class ValidationMiddleware {
  /**
   * Validate request body using a DTO validation function
   */
  validateBody(validator: ValidationFunction) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const validation = validator(req.body);

        if (!validation.isValid) {
          res.status(400).json({
            success: false,
            errors: validation.errors,
          });
          return;
        }

        next();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        res.status(500).json({
          success: false,
          error: `Validation error: ${errorMessage}`,
        });
      }
    };
  }

  /**
   * Validate request query parameters using a validation function
   */
  validateQuery(validator: ValidationFunction) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const validation = validator(req.query);

        if (!validation.isValid) {
          res.status(400).json({
            success: false,
            errors: validation.errors,
          });
          return;
        }

        next();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        res.status(500).json({
          success: false,
          error: `Validation error: ${errorMessage}`,
        });
      }
    };
  }

  /**
   * Validate request params using a validation function
   */
  validateParams(validator: ValidationFunction) {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        const validation = validator(req.params);

        if (!validation.isValid) {
          res.status(400).json({
            success: false,
            errors: validation.errors,
          });
          return;
        }

        next();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        res.status(500).json({
          success: false,
          error: `Validation error: ${errorMessage}`,
        });
      }
    };
  }

  /**
   * Sanitize common injection attacks from request body
   */
  sanitizeBody(req: Request, res: Response, next: NextFunction): void {
    try {
      if (req.body && typeof req.body === "object") {
        req.body = this.sanitizeObject(req.body);
      }
      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      res.status(500).json({
        success: false,
        error: `Sanitization error: ${errorMessage}`,
      });
    }
  }

  /**
   * Recursively sanitize an object
   */
  private sanitizeObject(obj: any): any {
    if (typeof obj !== "object" || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    const sanitized: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        // Remove potentially dangerous keys
        if (key.startsWith("$") || key.startsWith("_")) {
          continue;
        }
        sanitized[key] = this.sanitizeObject(obj[key]);
      }
    }

    return sanitized;
  }
}

export const validationMiddleware = new ValidationMiddleware();
