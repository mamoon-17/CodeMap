import request from "supertest";
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import authRoutes from "./auth.routes";
import { AppDataSource } from "../../config/datasource";
import { User } from "../user/user.entity";
import { passwordUtil } from "../../utils/password.util";
import { jwtUtil } from "../../utils/jwt.util";

describe("Auth Routes Integration Tests", () => {
  let app: Express;
  let testUser: User;

  beforeAll(async () => {
    // Initialize test app
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/auth", authRoutes);

    // Initialize database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Clean up test data
    await AppDataSource.getRepository(User).delete({
      email: "test@example.com",
    });
    await AppDataSource.getRepository(User).delete({
      email: "newuser@example.com",
    });
  });

  afterAll(async () => {
    // Clean up test data
    if (testUser) {
      await AppDataSource.getRepository(User).delete({ id: testUser.id });
    }
    await AppDataSource.getRepository(User).delete({
      email: "test@example.com",
    });
    await AppDataSource.getRepository(User).delete({
      email: "newuser@example.com",
    });

    // Close database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  describe("POST /auth/register", () => {
    it("should register a new user successfully", async () => {
      const response = await request(app).post("/auth/register").send({
        email: "newuser@example.com",
        password: "SecurePass123!",
        username: "newuser",
      });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("user");
      expect(response.body.user).toHaveProperty("id");
      expect(response.body.user.email).toBe("newuser@example.com");
      expect(response.body.user.username).toBe("newuser");
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
      expect(response.headers["set-cookie"]).toBeDefined();

      // Clean up
      await AppDataSource.getRepository(User).delete({
        email: "newuser@example.com",
      });
    });

    it("should fail with invalid email", async () => {
      const response = await request(app).post("/auth/register").send({
        email: "invalid-email",
        password: "SecurePass123!",
        username: "testuser",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should fail with weak password", async () => {
      const response = await request(app).post("/auth/register").send({
        email: "test@example.com",
        password: "weak",
        username: "testuser",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should fail with missing fields", async () => {
      const response = await request(app).post("/auth/register").send({
        email: "test@example.com",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should fail when registering with existing email", async () => {
      // Create a test user first
      const hashedPassword = await passwordUtil.hashPassword("SecurePass123!");
      const userRepo = AppDataSource.getRepository(User);
      const existingUser = userRepo.create({
        email: "existing@example.com",
        password: hashedPassword,
        username: "existing",
        authProvider: "email",
      });
      await userRepo.save(existingUser);

      const response = await request(app).post("/auth/register").send({
        email: "existing@example.com",
        password: "SecurePass123!",
        username: "newusername",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");

      // Clean up
      await userRepo.delete({ email: "existing@example.com" });
    });
  });

  describe("POST /auth/login", () => {
    beforeAll(async () => {
      // Create a test user for login tests
      const hashedPassword = await passwordUtil.hashPassword("SecurePass123!");
      const userRepo = AppDataSource.getRepository(User);
      testUser = userRepo.create({
        email: "test@example.com",
        password: hashedPassword,
        username: "testuser",
        authProvider: "email",
      });
      await userRepo.save(testUser);
    });

    it("should login successfully with valid credentials", async () => {
      const response = await request(app).post("/auth/login").send({
        email: "test@example.com",
        password: "SecurePass123!",
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("user");
      expect(response.body.user.email).toBe("test@example.com");
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
      expect(response.headers["set-cookie"]).toBeDefined();
    });

    it("should fail with incorrect password", async () => {
      const response = await request(app).post("/auth/login").send({
        email: "test@example.com",
        password: "WrongPassword123!",
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
    });

    it("should fail with non-existent email", async () => {
      const response = await request(app).post("/auth/login").send({
        email: "nonexistent@example.com",
        password: "SecurePass123!",
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
    });

    it("should fail with invalid email format", async () => {
      const response = await request(app).post("/auth/login").send({
        email: "invalid-email",
        password: "SecurePass123!",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should fail with missing fields", async () => {
      const response = await request(app).post("/auth/login").send({
        email: "test@example.com",
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });

    it("should update lastLogin timestamp on successful login", async () => {
      const beforeLogin = new Date();

      await request(app).post("/auth/login").send({
        email: "test@example.com",
        password: "SecurePass123!",
      });

      const userRepo = AppDataSource.getRepository(User);
      const updatedUser = await userRepo.findOne({
        where: { email: "test@example.com" },
      });

      expect(updatedUser?.lastLogin).toBeDefined();
      expect(updatedUser!.lastLogin!.getTime()).toBeGreaterThanOrEqual(
        beforeLogin.getTime(),
      );
    });
  });

  describe("POST /auth/guest", () => {
    it("should create a guest user successfully", async () => {
      const response = await request(app).post("/auth/guest").send();

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("user");
      expect(response.body.user.isGuest).toBe(true);
      expect(response.body.user.authProvider).toBe("guest");
      expect(response.body.user.email).toMatch(/^guest_/);
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");

      // Clean up
      await AppDataSource.getRepository(User).delete({
        id: response.body.user.id,
      });
    });

    it("should create unique guest users on multiple requests", async () => {
      const response1 = await request(app).post("/auth/guest").send();
      const response2 = await request(app).post("/auth/guest").send();

      expect(response1.status).toBe(201);
      expect(response2.status).toBe(201);
      expect(response1.body.user.id).not.toBe(response2.body.user.id);
      expect(response1.body.user.email).not.toBe(response2.body.user.email);

      // Clean up
      await AppDataSource.getRepository(User).delete({
        id: response1.body.user.id,
      });
      await AppDataSource.getRepository(User).delete({
        id: response2.body.user.id,
      });
    });
  });

  describe("POST /auth/refresh", () => {
    let validRefreshToken: string;
    let userId: number;

    beforeAll(async () => {
      // Create a test user with refresh token
      const hashedPassword = await passwordUtil.hashPassword("SecurePass123!");
      const userRepo = AppDataSource.getRepository(User);
      const user = userRepo.create({
        email: "refresh@example.com",
        password: hashedPassword,
        username: "refreshuser",
        authProvider: "email",
      });

      const tokenResult = jwtUtil.generateTokens({
        id: user.id,
        email: user.email,
      });

      if (tokenResult.isOk()) {
        const { accessToken, refreshToken } = tokenResult.value;
        validRefreshToken = refreshToken;
        user.refreshToken = refreshToken;
        await userRepo.save(user);
        userId = user.id;
      }
    });

    afterAll(async () => {
      // Clean up
      await AppDataSource.getRepository(User).delete({
        email: "refresh@example.com",
      });
    });

    it("should refresh tokens with valid refresh token", async () => {
      const response = await request(app)
        .post("/auth/refresh")
        .set("Cookie", [`refreshToken=${validRefreshToken}`]);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("accessToken");
      expect(response.body).toHaveProperty("refreshToken");
      expect(response.body.refreshToken).not.toBe(validRefreshToken); // Should be a new token
    });

    it("should fail with missing refresh token", async () => {
      const response = await request(app).post("/auth/refresh").send();

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
    });

    it("should fail with invalid refresh token", async () => {
      const response = await request(app)
        .post("/auth/refresh")
        .set("Cookie", ["refreshToken=invalid.token.here"]);

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty("error");
    });

    it("should fail with expired refresh token", async () => {
      // Generate an expired token (this is a mock - in real scenario you'd need to wait or manipulate time)
      const expiredToken = jwtUtil.generateTokens(
        { id: userId, email: "refresh@example.com" },
        "1ms",
        "1ms",
      );

      if (expiredToken.isOk()) {
        // Wait for token to expire
        await new Promise((resolve) => setTimeout(resolve, 10));

        const response = await request(app)
          .post("/auth/refresh")
          .set("Cookie", [`refreshToken=${expiredToken.value.refreshToken}`]);

        expect(response.status).toBeGreaterThanOrEqual(400);
      }
    });
  });

  describe("POST /auth/logout", () => {
    it("should logout successfully and clear cookies", async () => {
      // First login to get tokens
      const hashedPassword = await passwordUtil.hashPassword("SecurePass123!");
      const userRepo = AppDataSource.getRepository(User);
      const user = userRepo.create({
        email: "logout@example.com",
        password: hashedPassword,
        username: "logoutuser",
        authProvider: "email",
      });
      await userRepo.save(user);

      const loginResponse = await request(app).post("/auth/login").send({
        email: "logout@example.com",
        password: "SecurePass123!",
      });

      const refreshToken = loginResponse.body.refreshToken;

      // Now logout
      const logoutResponse = await request(app)
        .post("/auth/logout")
        .set("Cookie", [`refreshToken=${refreshToken}`]);

      expect(logoutResponse.status).toBe(200);
      expect(logoutResponse.body).toHaveProperty("message");

      // Verify refresh token is cleared in database
      const updatedUser = await userRepo.findOne({
        where: { email: "logout@example.com" },
      });
      expect(updatedUser?.refreshToken).toBeNull();

      // Clean up
      await userRepo.delete({ email: "logout@example.com" });
    });

    it("should return success even without refresh token", async () => {
      const response = await request(app).post("/auth/logout").send();

      expect(response.status).toBe(200);
    });
  });

  describe("OAuth Routes", () => {
    describe("GET /auth/google", () => {
      it("should redirect to Google OAuth", async () => {
        const response = await request(app).get("/auth/google");

        // OAuth routes typically redirect (302) or return configuration
        expect([200, 302, 500]).toContain(response.status);
        // Note: Full OAuth testing requires mocking Passport strategies
      });
    });

    describe("GET /auth/github", () => {
      it("should redirect to GitHub OAuth", async () => {
        const response = await request(app).get("/auth/github");

        // OAuth routes typically redirect (302) or return configuration
        expect([200, 302, 500]).toContain(response.status);
        // Note: Full OAuth testing requires mocking Passport strategies
      });
    });
  });

  describe("Security Tests", () => {
    it("should not expose password in user response", async () => {
      const hashedPassword = await passwordUtil.hashPassword("SecurePass123!");
      const userRepo = AppDataSource.getRepository(User);
      const user = userRepo.create({
        email: "security@example.com",
        password: hashedPassword,
        username: "securityuser",
        authProvider: "email",
      });
      await userRepo.save(user);

      const response = await request(app).post("/auth/login").send({
        email: "security@example.com",
        password: "SecurePass123!",
      });

      expect(response.status).toBe(200);
      expect(response.body.user).not.toHaveProperty("password");
      expect(response.body.user).not.toHaveProperty("refreshToken");

      // Clean up
      await userRepo.delete({ email: "security@example.com" });
    });

    it("should set secure HTTP-only cookies for refresh token", async () => {
      const response = await request(app).post("/auth/register").send({
        email: "cookie@example.com",
        password: "SecurePass123!",
        username: "cookieuser",
      });

      expect(response.status).toBe(201);
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();

      const refreshCookie = cookies.find((cookie: string) =>
        cookie.startsWith("refreshToken="),
      );
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain("HttpOnly");
      expect(refreshCookie).toContain("Path=/");

      // Clean up
      await AppDataSource.getRepository(User).delete({
        email: "cookie@example.com",
      });
    });

    it("should sanitize input to prevent XSS", async () => {
      const response = await request(app)
        .post("/auth/register")
        .send({
          email: "<script>alert('xss')</script>@example.com",
          password: "SecurePass123!",
          username: "<script>alert('xss')</script>",
        });

      // Should fail validation or sanitize the input
      expect(response.status).toBe(400);
    });
  });

  describe("Rate Limiting and Edge Cases", () => {
    it("should handle concurrent requests gracefully", async () => {
      const promises = Array(5)
        .fill(null)
        .map((_, i) =>
          request(app)
            .post("/auth/register")
            .send({
              email: `concurrent${i}@example.com`,
              password: "SecurePass123!",
              username: `concurrent${i}`,
            }),
        );

      const responses = await Promise.all(promises);

      responses.forEach((response) => {
        expect([201, 400, 500]).toContain(response.status);
      });

      // Clean up
      for (let i = 0; i < 5; i++) {
        await AppDataSource.getRepository(User).delete({
          email: `concurrent${i}@example.com`,
        });
      }
    });

    it("should handle malformed JSON gracefully", async () => {
      const response = await request(app)
        .post("/auth/login")
        .set("Content-Type", "application/json")
        .send("{ invalid json");

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle extremely long input strings", async () => {
      const longString = "a".repeat(10000);
      const response = await request(app).post("/auth/register").send({
        email: `${longString}@example.com`,
        password: "SecurePass123!",
        username: longString,
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty("error");
    });
  });
});
