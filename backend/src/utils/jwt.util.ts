import jwt from "jsonwebtoken";
import { config } from "../config/config";
import { ok, err, Result } from "neverthrow";

export interface JwtPayload {
  userId: string;
  email: string;
  isGuest: boolean;
}

export class JwtUtil {
  generateAccessToken(payload: JwtPayload): Result<string, string> {
    try {
      const secret = config.getJwtAccessSecret();
      const token = jwt.sign(payload, secret, {
        expiresIn: "15m",
      });
      return ok(token);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to generate access token: ${errorMessage}`);
    }
  }

  generateRefreshToken(payload: JwtPayload): Result<string, string> {
    try {
      const secret = config.getJwtRefreshSecret();
      // Include a small nonce to ensure a newly generated refresh token
      // is different even if called within the same second.
      const refreshPayload = { ...payload, nonce: Date.now().toString() };
      const token = jwt.sign(refreshPayload, secret, {
        expiresIn: "7d",
      });
      return ok(token);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to generate refresh token: ${errorMessage}`);
    }
  }

  verifyAccessToken(token: string): Result<JwtPayload, string> {
    try {
      const secret = config.getJwtAccessSecret();
      const decoded = jwt.verify(token, secret) as JwtPayload;
      return ok(decoded);
    } catch (e) {
      if (e instanceof jwt.TokenExpiredError) {
        return err("Access token has expired");
      }
      if (e instanceof jwt.JsonWebTokenError) {
        return err("Invalid access token");
      }
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to verify access token: ${errorMessage}`);
    }
  }

  verifyRefreshToken(token: string): Result<JwtPayload, string> {
    try {
      const secret = config.getJwtRefreshSecret();
      const decoded = jwt.verify(token, secret) as JwtPayload;
      return ok(decoded);
    } catch (e) {
      if (e instanceof jwt.TokenExpiredError) {
        return err("Refresh token has expired");
      }
      if (e instanceof jwt.JsonWebTokenError) {
        return err("Invalid refresh token");
      }
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to verify refresh token: ${errorMessage}`);
    }
  }
}

export const jwtUtil = new JwtUtil();
