import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import passport from "passport";
import userRoutes from "./modules/user/user.routes";
import authRoutes from "./modules/auth/auth.routes";
import { oauthUtil } from "./utils/oauth.util";

const app = express();

app.use(express.json());
app.use(cookieParser());

// Initialize Passport
oauthUtil.initialize();
app.use(passport.initialize());

// Routes
app.use("/users", userRoutes);
app.use("/auth", authRoutes);

// Error-handling middleware, this is where next(error) lands
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

export default app;
