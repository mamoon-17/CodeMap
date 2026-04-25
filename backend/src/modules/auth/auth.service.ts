import { Repository } from "typeorm";
import { User, AuthProvider } from "../user/user.entity";
import { AppDataSource } from "../../config/datasource";
import { ok, err, Result } from "neverthrow";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

export class AuthService {
  private getUserRepository(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  async loginOrCreateOAuthUser(params: {
    provider: AuthProvider.GOOGLE | AuthProvider.GITHUB;
    providerId: string;
    email: string;
    username: string;
    avatarUrl?: string;
    oauthAccessToken?: string;
  }): Promise<Result<User, string>> {
    const repository = this.getUserRepository();

    try {
      const providerWhere =
        params.provider === AuthProvider.GOOGLE
          ? { googleId: params.providerId }
          : { githubId: params.providerId };

      const existingByProvider = await repository.findOne({
        where: providerWhere,
      });

      if (existingByProvider) {
        if (params.avatarUrl) {
          existingByProvider.avatarUrl = params.avatarUrl;
        }
        if (params.provider === AuthProvider.GITHUB && params.oauthAccessToken) {
          existingByProvider.githubAccessToken = params.oauthAccessToken;
        }
        existingByProvider.lastLogin = new Date();
        const updatedUser = await repository.save(existingByProvider);
        return ok(updatedUser);
      }

      const existingByEmail = await repository.findOne({
        where: { email: params.email },
      });

      if (existingByEmail) {
        if (existingByEmail.authProvider !== params.provider) {
          return err(
            `This email is already registered with ${existingByEmail.authProvider} authentication.`,
          );
        }

        if (params.provider === AuthProvider.GOOGLE) {
          existingByEmail.googleId = params.providerId;
        } else {
          const linkedGithubUser = await repository.findOne({
            where: { githubId: params.providerId },
          });

          if (linkedGithubUser && linkedGithubUser.id !== existingByEmail.id) {
            return err("This GitHub account is already linked to another user.");
          }

          existingByEmail.githubId = params.providerId;
          if (params.oauthAccessToken) {
            existingByEmail.githubAccessToken = params.oauthAccessToken;
          }
        }

        if (params.avatarUrl) {
          existingByEmail.avatarUrl = params.avatarUrl;
        }

        existingByEmail.lastLogin = new Date();
        const updatedUser = await repository.save(existingByEmail);
        return ok(updatedUser);
      }

      const newOAuthUser = repository.create({
        username: params.username,
        email: params.email,
        password: null,
        authProvider: params.provider,
        googleId:
          params.provider === AuthProvider.GOOGLE ? params.providerId : null,
        githubId:
          params.provider === AuthProvider.GITHUB ? params.providerId : null,
        githubAccessToken:
          params.provider === AuthProvider.GITHUB
            ? (params.oauthAccessToken ?? null)
            : null,
        avatarUrl: params.avatarUrl || null,
        isGuest: false,
        lastLogin: new Date(),
      });

      const savedUser = await repository.save(newOAuthUser);
      return ok(savedUser);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed OAuth login: ${errorMessage}`);
    }
  }

  async register(
    dto: RegisterDto,
    hashedPassword: string,
  ): Promise<Result<User, string>> {
    const repository = this.getUserRepository();

    try {
      // Check if user already exists
      const existingUser = await repository.findOne({
        where: { email: dto.email },
      });

      if (existingUser) {
        return err("User with this email already exists");
      }

      // Create new user
      const user = repository.create({
        username: dto.username,
        email: dto.email,
        password: hashedPassword,
        authProvider: AuthProvider.LOCAL,
        isGuest: false,
      });

      const savedUser = await repository.save(user);
      return ok(savedUser);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to register user: ${errorMessage}`);
    }
  }

  async login(dto: LoginDto): Promise<Result<User, string>> {
    const repository = this.getUserRepository();

    try {
      const user = await repository.findOne({
        where: { email: dto.email },
      });

      if (!user) {
        return err("Invalid email or password");
      }

      if (user.authProvider !== AuthProvider.LOCAL) {
        return err(
          `This account uses ${user.authProvider} authentication. Please login with ${user.authProvider}.`,
        );
      }

      return ok(user);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to login: ${errorMessage}`);
    }
  }


  async createGuestUser(): Promise<Result<User, string>> {
    const repository = this.getUserRepository();

    try {
      const guestUsername = `guest_${Date.now()}`;
      const guestEmail = `${guestUsername}@guest.local`;

      const guestUser = repository.create({
        username: guestUsername,
        email: guestEmail,
        password: null,
        authProvider: AuthProvider.GUEST,
        isGuest: true,
        lastLogin: new Date(),
      });

      const savedUser = await repository.save(guestUser);
      return ok(savedUser);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to create guest user: ${errorMessage}`);
    }
  }

  async updateRefreshToken(
    userId: string,
    refreshToken: string | null,
  ): Promise<Result<void, string>> {
    const repository = this.getUserRepository();

    try {
      await repository.update(userId, { refreshToken });
      return ok(undefined);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to update refresh token: ${errorMessage}`);
    }
  }

  async findById(userId: string): Promise<Result<User, string>> {
    const repository = this.getUserRepository();

    try {
      const user = await repository.findOne({
        where: { id: userId },
      });

      if (!user) {
        return err("User not found");
      }

      return ok(user);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to find user: ${errorMessage}`);
    }
  }

  async findByRefreshToken(
    refreshToken: string,
  ): Promise<Result<User, string>> {
    const repository = this.getUserRepository();

    try {
      const user = await repository.findOne({
        where: { refreshToken },
      });

      if (!user) {
        return err("Invalid refresh token");
      }

      return ok(user);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to find user by refresh token: ${errorMessage}`);
    }
  }
}

export const authService = new AuthService();
