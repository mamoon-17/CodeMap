import request from "supertest";
import app from "../src/app";
import { AppDataSource } from "../src/config/datasource";
import { config } from "../src/config/config";
import { User } from "../src/modules/user/user.entity";

describe("Auth Integration Tests", () => {
  beforeAll(async () => {
    const initResult = config.init();
    if (initResult.isErr()) {
      throw new Error(`Missing env: ${initResult.error.join(", ")}`);
    }

    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    // Cleanup potential leftover test users
    await AppDataSource.getRepository(User).delete({ email: "testuser@example.com" });
    await AppDataSource.getRepository(User).delete({ email: "guest_test@example.com" });
  });

  afterAll(async () => {
    try {
      await AppDataSource.getRepository(User).delete({ email: "testuser@example.com" });
      await AppDataSource.getRepository(User).delete({ email: "guest_test@example.com" });
    } finally {
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
    }
  });

  it("should register, login, refresh and logout a user", async () => {
    // Register
    const reg = await request(app)
      .post("/auth/register")
      .send({ username: "testuser", email: "testuser@example.com", password: "SecurePass123!" });

    expect(reg.status).toBe(201);
    expect(reg.body).toHaveProperty("data");
    const registeredUser = reg.body.data.user;
    const accessToken = reg.body.data.accessToken;
    const refreshToken = reg.body.data.refreshToken;
    expect(registeredUser).toBeDefined();
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();

    // Login
    const login = await request(app)
      .post("/auth/login")
      .send({ email: "testuser@example.com", password: "SecurePass123!" });

    expect(login.status).toBe(200);
    const loginAccess = login.body.data.accessToken;
    const loginRefresh = login.body.data.refreshToken;
    expect(loginAccess).toBeDefined();
    expect(loginRefresh).toBeDefined();

    // Refresh
    const refreshed = await request(app)
      .post("/auth/refresh")
      .send({ refreshToken: loginRefresh });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toBeDefined();
    expect(refreshed.body.data.refreshToken).toBeDefined();
    expect(refreshed.body.data.refreshToken).not.toBe(loginRefresh);

    // Logout (using the login access token)
    const logout = await request(app)
      .post("/auth/logout")
      .set("Authorization", `Bearer ${loginAccess}`)
      .send();

    expect(logout.status).toBe(200);

    const repo = AppDataSource.getRepository(User);
    const dbUser = await repo.findOne({ where: { id: registeredUser.id } });
    expect(dbUser?.refreshToken).toBeNull();
  });

  it("should create a guest user", async () => {
    const res = await request(app).post("/auth/guest").send();
    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("data");
    expect(res.body.data.user.isGuest).toBe(true);

    // cleanup created guest
    await AppDataSource.getRepository(User).delete({ id: res.body.data.user.id });
  });
});
