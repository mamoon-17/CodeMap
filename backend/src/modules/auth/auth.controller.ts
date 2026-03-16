import { Request, Response } from "express";
import { authService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { passwordUtil } from "../../utils/password.util";
import { jwtUtil } from "../../utils/jwt.util";
import { User } from "../user/user.entity";

export class AuthController {
  private generateTokensForUser(user: User) {
    const payload = {
      userId: user.id,
      email: user.email,
      isGuest: user.isGuest,
    };

    const accessTokenResult = jwtUtil.generateAccessToken(payload);
    const refreshTokenResult = jwtUtil.generateRefreshToken(payload);

    if (accessTokenResult.isErr()) {
      return { success: false, error: accessTokenResult.error };
    }

    if (refreshTokenResult.isErr()) {
      return { success: false, error: refreshTokenResult.error };
    }

    return {
      success: true,
      accessToken: accessTokenResult.value,
      refreshToken: refreshTokenResult.value,
    };
  }

  async register(req: Request, res: Response): Promise<void> {
    const validation = RegisterDto.validate(req.body);

    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        errors: validation.errors,
      });
      return;
    }

    const dto = new RegisterDto(
      req.body.username,
      req.body.email,
      req.body.password,
    );

    // Hash password
    const hashResult = await passwordUtil.hashPassword(req.body.password);
    if (hashResult.isErr()) {
      res.status(500).json({
        success: false,
        error: hashResult.error,
      });
      return;
    }

    const result = await authService.register(dto, hashResult.value);

    result.match(
      async (user) => {
        // Generate JWT tokens
        const tokensResult = this.generateTokensForUser(user);

        if (!tokensResult.success) {
          res.status(500).json({
            success: false,
            error: tokensResult.error,
          });
          return;
        }

        // Save refresh token to database
        const updateResult = await authService.updateRefreshToken(
          user.id,
          tokensResult.refreshToken!,
        );

        if (updateResult.isErr()) {
          // Optionally log the persistence error for debugging/monitoring
          console.error("Failed to persist refresh token for user", user.id, updateResult.error);

          res.status(500).json({
            success: false,
            error: updateResult.error,
          });
          return;
        }

        res.status(201).json({
          success: true,
          message: "User registered successfully",
          data: {
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              authProvider: user.authProvider,
            },
            accessToken: tokensResult.accessToken,
            refreshToken: tokensResult.refreshToken,
          },
        });
      },
      (error) => {
        res.status(400).json({
          success: false,
          error,
        });
      },
    );
  }

  async login(req: Request, res: Response): Promise<void> {
    const validation = LoginDto.validate(req.body);

    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        errors: validation.errors,
      });
      return;
    }

    const dto = new LoginDto(req.body.email, req.body.password);
    const result = await authService.login(dto);

    result.match(
      async (user) => {
        // Verify password
        if (!user.password) {
          res.status(401).json({
            success: false,
            error: "Invalid email or password",
          });
          return;
        }

        const compareResult = await passwordUtil.comparePassword(
          req.body.password,
          user.password,
        );

        if (compareResult.isErr()) {
          res.status(500).json({
            success: false,
            error: compareResult.error,
          });
          return;
        }

        if (!compareResult.value) {
          res.status(401).json({
            success: false,
            error: "Invalid email or password",
          });
          return;
        }

        // Generate JWT tokens
        const tokensResult = this.generateTokensForUser(user);

        if (!tokensResult.success) {
          res.status(500).json({
            success: false,
            error: tokensResult.error,
          });
          return;
        }

        // Save refresh token to database
        await authService.updateRefreshToken(
          user.id,
          tokensResult.refreshToken!,
        );

        res.status(200).json({
          success: true,
          message: "Login successful",
          data: {
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              authProvider: user.authProvider,
            },
            accessToken: tokensResult.accessToken,
            refreshToken: tokensResult.refreshToken,
          },
        });
      },
      (error) => {
        res.status(401).json({
          success: false,
          error,
        });
      },
    );
  }

  async logout(req: Request, res: Response): Promise<void> {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      res.status(200).json({
        success: true,
        message: "Logout successful",
      });
      return;
    }

    // Verify token and get user
    const verifyResult = jwtUtil.verifyAccessToken(token);

    verifyResult.match(
      async (payload) => {
        // Clear refresh token from database
        const updateResult = await authService.updateRefreshToken(
          payload.userId,
          null,
        );

        if (updateResult.isErr()) {
          // If we fail to clear the refresh token, return an error so the
          // session is not reported as successfully logged out.
          console.error(
            "Failed to clear refresh token on logout for user",
            payload.userId,
            updateResult.error,
          );
          res.status(500).json({
            success: false,
            message: "Failed to logout",
            error: updateResult.error,
          });
          return;
        }

        res.status(200).json({
          success: true,
          message: "Logout successful",
        });
      },
      (_error) => {
        // Even if token is invalid, logout is successful
        res.status(200).json({
          success: true,
          message: "Logout successful",
        });
      },
    );
  }

  async guestLogin(_req: Request, res: Response): Promise<void> {
    const result = await authService.createGuestUser();

    result.match(
      async (user) => {
        // Generate JWT tokens
        const tokensResult = this.generateTokensForUser(user);

        if (!tokensResult.success) {
          res.status(500).json({
            success: false,
            error: tokensResult.error,
          });
          return;
        }

        // Save refresh token to database
        await authService.updateRefreshToken(
          user.id,
          tokensResult.refreshToken!,
        );

        res.status(201).json({
          success: true,
          message: "Guest user created successfully",
          data: {
            user: {
              id: user.id,
              username: user.username,
              isGuest: user.isGuest,
            },
            accessToken: tokensResult.accessToken,
            refreshToken: tokensResult.refreshToken,
          },
        });
      },
      (error) => {
        res.status(500).json({
          success: false,
          error,
        });
      },
    );
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    // Check both cookies and body for refresh token
    const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

    if (!refreshToken || typeof refreshToken !== "string") {
      res.status(400).json({
        success: false,
        error: "Refresh token is required",
      });
      return;
    }

    // Verify refresh token
    const verifyResult = jwtUtil.verifyRefreshToken(refreshToken);

    if (verifyResult.isErr()) {
      res.status(401).json({
        success: false,
        error: verifyResult.error,
      });
      return;
    }

    // Find user by refresh token
    const userResult = await authService.findByRefreshToken(refreshToken);

    if (userResult.isErr()) {
      res.status(401).json({
        success: false,
        error: userResult.error,
      });
      return;
    }

    const user = userResult.value;

    // Generate new tokens
    const tokensResult = this.generateTokensForUser(user);

    if (!tokensResult.success) {
      res.status(500).json({
        success: false,
        error: tokensResult.error,
      });
      return;
    }

    // Update refresh token in database
    await authService.updateRefreshToken(user.id, tokensResult.refreshToken!);

    res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        accessToken: tokensResult.accessToken,
        refreshToken: tokensResult.refreshToken,
      },
    });
  }
}

export const authController = new AuthController();
