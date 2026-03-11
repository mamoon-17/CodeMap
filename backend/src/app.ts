import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
<<<<<<< HEAD
import passport from "passport";
import userRoutes from "./modules/user/user.routes";
import authRoutes from "./modules/auth/auth.routes";
import { oauthUtil } from "./utils/oauth.util";
=======
import cors from "cors";
import userRoutes from "./modules/user/user.routes";
import projectRoutes from "./modules/project/project.routes";
>>>>>>> feature/file-upload-ingestion

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Initialize Passport
oauthUtil.initialize();
app.use(passport.initialize());

// Routes
app.use("/users", userRoutes);
<<<<<<< HEAD
app.use("/auth", authRoutes);
=======
app.use("/projects", projectRoutes);
>>>>>>> feature/file-upload-ingestion

// Error-handling middleware, this is where next(error) lands
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

export default app;
