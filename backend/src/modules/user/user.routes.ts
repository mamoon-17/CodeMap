import { Router } from "express";
import { userController } from "./user.controller";
// import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

// Public routes (no authentication required)
router.post("/", userController.create);

// Protected routes (authentication required)
// Example: Get current user profile
// router.get("/me", 
//   (req, res, next) => authMiddleware.requireAuth(req, res, next),
//   userController.getProfile
// );

// Protected routes (non-guest users only)
// Example: Update user profile
// router.put("/:id",
//   (req, res, next) => authMiddleware.requireAuth(req, res, next),
//   (req, res, next) => authMiddleware.requireNonGuest(req, res, next),
//   userController.update
// );

export default router;
