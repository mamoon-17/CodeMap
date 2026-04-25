import { Request, Response } from "express";
import { authService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { passwordUtil } from "../../utils/password.util";
import { jwtUtil } from "../../utils/jwt.util";
import { AuthProvider, User } from "../user/user.entity";
import { config } from "../../config/config";
import crypto from "crypto";

export class AuthController {
  private buildCallbackUrl(req: Request, provider: "google" | "github"): string {
    return `${req.protocol}://${req.get("host")}/auth/${provider}/callback`;
  }

  private getFrontendBaseUrl(): string {
    return config.getFrontendUrl() || "http://localhost:5173";
  }

  private redirectOAuthSuccess(
    res: Response,
    provider: "google" | "github",
    accessToken: string,
    refreshToken: string,
  ): void {
    const redirectUrl = new URL("/oauth/callback", this.getFrontendBaseUrl());
    redirectUrl.searchParams.set("provider", provider);
    redirectUrl.searchParams.set("accessToken", accessToken);
    redirectUrl.searchParams.set("refreshToken", refreshToken);

    res.redirect(302, redirectUrl.toString());
  }

  private redirectOAuthError(
    res: Response,
    provider: "google" | "github",
    error: string,
  ): void {
    const redirectUrl = new URL("/oauth/callback", this.getFrontendBaseUrl());
    redirectUrl.searchParams.set("provider", provider);
    redirectUrl.searchParams.set("error", error);

    res.redirect(302, redirectUrl.toString());
  }

  private async completeOAuthLogin(
    user: User,
    provider: "google" | "github",
    res: Response,
  ): Promise<void> {
    const tokensResult = this.generateTokensForUser(user);

    if (!tokensResult.success) {
      this.redirectOAuthError(
        res,
        provider,
        tokensResult.error || "Failed to generate OAuth tokens",
      );
      return;
    }

    const updateResult = await authService.updateRefreshToken(
      user.id,
      tokensResult.refreshToken!,
    );

    if (updateResult.isErr()) {
      this.redirectOAuthError(res, provider, updateResult.error);
      return;
    }

    this.redirectOAuthSuccess(
      res,
      provider,
      tokensResult.accessToken!,
      tokensResult.refreshToken!,
    );
  }

  googleAuthStart(req: Request, res: Response): void {
    const clientId = config.getGoogleClientId();

    if (!clientId) {
      res.status(500).json({
        success: false,
        error: "Missing GOOGLE_CLIENT_ID configuration",
      });
      return;
    }

    const state = crypto.randomUUID();
    res.cookie("google_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });

    const callbackUrl = this.buildCallbackUrl(req, "google");
    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", clientId);
    googleAuthUrl.searchParams.set("redirect_uri", callbackUrl);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", "openid email profile");
    googleAuthUrl.searchParams.set("state", state);
    googleAuthUrl.searchParams.set("prompt", "select_account");

    res.redirect(googleAuthUrl.toString());
  }

  async googleAuthCallback(req: Request, res: Response): Promise<void> {
    const code = req.query.code;
    const state = req.query.state;
    const savedState = req.cookies?.google_oauth_state;
    res.clearCookie("google_oauth_state");

    if (typeof code !== "string") {
      this.redirectOAuthError(res, "google", "Missing Google authorization code");
      return;
    }

    if (typeof state !== "string" || !savedState || state !== savedState) {
      this.redirectOAuthError(res, "google", "Invalid Google OAuth state");
      return;
    }

    const clientId = config.getGoogleClientId();
    const clientSecret = config.getGoogleClientSecret();

    if (!clientId || !clientSecret) {
      this.redirectOAuthError(res, "google", "Google OAuth is not fully configured");
      return;
    }

    try {
      const callbackUrl = this.buildCallbackUrl(req, "google");
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: callbackUrl,
          grant_type: "authorization_code",
        }).toString(),
      });

      if (!tokenResponse.ok) {
        const tokenError = await tokenResponse.text();
        this.redirectOAuthError(
          res,
          "google",
          `Google token exchange failed: ${tokenError}`,
        );
        return;
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
      };

      if (!tokenData.access_token) {
        this.redirectOAuthError(res, "google", "Google access token missing");
        return;
      }

      const profileResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
          },
        },
      );

      if (!profileResponse.ok) {
        const profileError = await profileResponse.text();
        this.redirectOAuthError(
          res,
          "google",
          `Failed to fetch Google profile: ${profileError}`,
        );
        return;
      }

      const profile = (await profileResponse.json()) as {
        id?: string;
        email?: string;
        name?: string;
        picture?: string;
      };

      if (!profile.id || !profile.email) {
        this.redirectOAuthError(
          res,
          "google",
          "Google profile is missing required fields",
        );
        return;
      }

      const googleEmail = profile.email;
      const fallbackUsername = googleEmail.split("@")[0] || "google_user";

      const oauthResult = await authService.loginOrCreateOAuthUser({
        provider: AuthProvider.GOOGLE,
        providerId: profile.id,
        email: googleEmail,
        username: profile.name || fallbackUsername,
        avatarUrl: profile.picture,
      });

      oauthResult.match(
        async (user) => {
          await this.completeOAuthLogin(user, "google", res);
        },
        (error) => {
          this.redirectOAuthError(res, "google", error);
        },
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.redirectOAuthError(res, "google", `Google OAuth failed: ${errorMessage}`);
    }
  }

  githubAuthStart(req: Request, res: Response): void {
    const clientId = config.getGithubClientId();

    if (!clientId) {
      res.status(500).json({
        success: false,
        error: "Missing GITHUB_CLIENT_ID configuration",
      });
      return;
    }

    const state = crypto.randomUUID();
    res.cookie("github_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 10 * 60 * 1000,
    });

    const callbackUrl = this.buildCallbackUrl(req, "github");
    const githubAuthUrl = new URL("https://github.com/login/oauth/authorize");
    githubAuthUrl.searchParams.set("client_id", clientId);
    githubAuthUrl.searchParams.set("redirect_uri", callbackUrl);
    githubAuthUrl.searchParams.set("scope", "read:user user:email");
    githubAuthUrl.searchParams.set("state", state);

    res.redirect(githubAuthUrl.toString());
  }

  async githubAuthCallback(req: Request, res: Response): Promise<void> {
    const code = req.query.code;
    const state = req.query.state;
    const savedState = req.cookies?.github_oauth_state;
    res.clearCookie("github_oauth_state");

    if (typeof code !== "string") {
      this.redirectOAuthError(res, "github", "Missing GitHub authorization code");
      return;
    }

    if (typeof state !== "string" || !savedState || state !== savedState) {
      this.redirectOAuthError(res, "github", "Invalid GitHub OAuth state");
      return;
    }

    const clientId = config.getGithubClientId();
    const clientSecret = config.getGithubClientSecret();

    if (!clientId || !clientSecret) {
      this.redirectOAuthError(res, "github", "GitHub OAuth is not fully configured");
      return;
    }

    try {
      const callbackUrl = this.buildCallbackUrl(req, "github");
      const tokenResponse = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: callbackUrl,
          }).toString(),
        },
      );

      if (!tokenResponse.ok) {
        const tokenError = await tokenResponse.text();
        this.redirectOAuthError(
          res,
          "github",
          `GitHub token exchange failed: ${tokenError}`,
        );
        return;
      }

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
      };

      if (!tokenData.access_token) {
        this.redirectOAuthError(res, "github", "GitHub access token missing");
        return;
      }

      const [userResponse, emailsResponse] = await Promise.all([
        fetch("https://api.github.com/user", {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${tokenData.access_token}`,
            "User-Agent": "CodeMap",
          },
        }),
        fetch("https://api.github.com/user/emails", {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${tokenData.access_token}`,
            "User-Agent": "CodeMap",
          },
        }),
      ]);

      if (!userResponse.ok || !emailsResponse.ok) {
        const profileError = await userResponse.text();
        const emailError = await emailsResponse.text();
        this.redirectOAuthError(
          res,
          "github",
          `Failed to fetch GitHub profile (${profileError}) or emails (${emailError})`,
        );
        return;
      }

      const githubUser = (await userResponse.json()) as {
        id?: number;
        login?: string;
        name?: string | null;
      };

      const githubEmails = (await emailsResponse.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;

      const primaryVerifiedEmail = githubEmails.find(
        (email) => email.primary && email.verified,
      );

      if (!githubUser.id || !primaryVerifiedEmail?.email) {
        this.redirectOAuthError(
          res,
          "github",
          "GitHub profile is missing required fields",
        );
        return;
      }

      const oauthResult = await authService.loginOrCreateOAuthUser({
        provider: AuthProvider.GITHUB,
        providerId: String(githubUser.id),
        email: primaryVerifiedEmail.email,
        username: githubUser.name || githubUser.login || primaryVerifiedEmail.email,
      });

      oauthResult.match(
        async (user) => {
          await this.completeOAuthLogin(user, "github", res);
        },
        (error) => {
          this.redirectOAuthError(res, "github", error);
        },
      );
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      this.redirectOAuthError(res, "github", `GitHub OAuth failed: ${errorMessage}`);
    }
  }

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
        const updateRefreshTokenResult = await authService.updateRefreshToken(
          user.id,
          tokensResult.refreshToken!,
        );

        if (updateRefreshTokenResult.isErr()) {
          res.status(500).json({
            success: false,
            error: updateRefreshTokenResult.error,
          });
          return;
        }

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
        const updateResult = await authService.updateRefreshToken(
          user.id,
          tokensResult.refreshToken!,
        );

        if (updateResult.isErr()) {
          res.status(500).json({
            success: false,
            error: updateResult.error,
          });
          return;
        }

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
    const updateResult = await authService.updateRefreshToken(
      user.id,
      tokensResult.refreshToken!,
    );

    if (updateResult.isErr()) {
      res.status(500).json({
        success: false,
        error: updateResult.error,
      });
      return;
    }

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
