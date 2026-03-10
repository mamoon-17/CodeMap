import { Router } from "express";
import { authController } from "./auth.controller";

const router = Router();

// Local authentication
router.post("/register", (req, res) => authController.register(req, res));
router.post("/login", (req, res) => authController.login(req, res));
router.post("/logout", (req, res) => authController.logout(req, res));

// OAuth authentication
router.get("/google", (req, res) => authController.googleAuth(req, res));
router.get("/google/callback", (req, res) =>
  authController.googleCallback(req, res),
);
router.get("/github", (req, res) => authController.githubAuth(req, res));
router.get("/github/callback", (req, res) =>
  authController.githubCallback(req, res),
);

// Guest authentication
router.post("/guest", (req, res) => authController.guestLogin(req, res));

// Token refresh
router.post("/refresh", (req, res) => authController.refreshToken(req, res));

export default router;
