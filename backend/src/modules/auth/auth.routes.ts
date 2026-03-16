import { Router } from "express";
import { authController } from "./auth.controller";
import { validationMiddleware } from "../../middleware/validation.middleware";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

const router = Router();

// Local authentication
router.post(
  "/register",
  validationMiddleware.validateBody(RegisterDto.validate),
  (req, res) => authController.register(req, res),
);
router.post(
  "/login",
  validationMiddleware.validateBody(LoginDto.validate),
  (req, res) => authController.login(req, res),
);
router.post("/logout", (req, res) => authController.logout(req, res));

// OAuth authentication
// OAuth routes removed — JWT-only authentication

// Guest authentication
router.post("/guest", (req, res) => authController.guestLogin(req, res));

// Token refresh
router.post("/refresh", (req, res) => authController.refreshToken(req, res));

export default router;
