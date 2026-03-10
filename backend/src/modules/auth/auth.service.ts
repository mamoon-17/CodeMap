import { Repository } from "typeorm";
import { User, AuthProvider } from "../user/user.entity";
import { appDataSource } from "../../config/datasource";
import { ok, err, Result } from "neverthrow";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { OAuthDto } from "./dto/oauth.dto";

export class AuthService {
  private userRepository: Repository<User> | null = null;

  private getUserRepository(): Result<Repository<User>, string> {
    if (this.userRepository) {
      return ok(this.userRepository);
    }

    const dataSourceResult = appDataSource.getInstance();
    if (dataSourceResult.isErr()) {
      return err(dataSourceResult.error);
    }

    this.userRepository = dataSourceResult.value.getRepository(User);
    return ok(this.userRepository);
  }

  async register(
    dto: RegisterDto,
    hashedPassword: string,
  ): Promise<Result<User, string>> {
    const repoResult = this.getUserRepository();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repository = repoResult.value;

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
    const repoResult = this.getUserRepository();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repository = repoResult.value;

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

  async findOrCreateOAuthUser(dto: OAuthDto): Promise<Result<User, string>> {
    const repoResult = this.getUserRepository();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repository = repoResult.value;

    try {
      // Check by provider ID first
      const providerIdField =
        dto.provider === "google" ? "googleId" : "githubId";
      let user = await repository.findOne({
        where: { [providerIdField]: dto.providerId },
      });

      if (user) {
        // Update last login
        user.lastLogin = new Date();
        await repository.save(user);
        return ok(user);
      }

      // Check by email
      user = await repository.findOne({
        where: { email: dto.email },
      });

      if (user) {
        // Link OAuth account to existing user
        if (dto.provider === "google") {
          user.googleId = dto.providerId;
        } else {
          user.githubId = dto.providerId;
        }
        user.lastLogin = new Date();
        await repository.save(user);
        return ok(user);
      }

      // Create new user
      const newUser = repository.create({
        username: dto.username,
        email: dto.email,
        password: null,
        authProvider:
          dto.provider === "google" ? AuthProvider.GOOGLE : AuthProvider.GITHUB,
        googleId: dto.provider === "google" ? dto.providerId : null,
        githubId: dto.provider === "github" ? dto.providerId : null,
        isGuest: false,
        lastLogin: new Date(),
      });

      const savedUser = await repository.save(newUser);
      return ok(savedUser);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to process OAuth user: ${errorMessage}`);
    }
  }

  async createGuestUser(): Promise<Result<User, string>> {
    const repoResult = this.getUserRepository();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repository = repoResult.value;

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
    const repoResult = this.getUserRepository();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repository = repoResult.value;

    try {
      await repository.update(userId, { refreshToken });
      return ok(undefined);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to update refresh token: ${errorMessage}`);
    }
  }

  async findById(userId: string): Promise<Result<User, string>> {
    const repoResult = this.getUserRepository();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repository = repoResult.value;

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
    const repoResult = this.getUserRepository();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    const repository = repoResult.value;

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
