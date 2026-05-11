import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import userRoutes from "./modules/user/user.routes";
import authRoutes from "./modules/auth/auth.routes";
import queryRoutes from "./modules/query/query.routes";
import projectRoutes from "./modules/project/project.routes";
import reindexRoutes from "./modules/reindex/reindex.routes";

const app = express();

// CORS configuration
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "https://code-map-coral.vercel.app",
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: "50mb" }));
app.use(cookieParser());

// Routes
app.use("/users", userRoutes);
app.use("/auth", authRoutes);
app.use("/query", queryRoutes);
app.use("/projects", projectRoutes);
app.use("/reindex", reindexRoutes);

// Serve built React frontend in production (Docker monolith).
// The frontend dist is copied to /app/frontend/dist by the Dockerfile.
// In local dev this folder doesn't exist, so the block is skipped entirely.
const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  // SPA fallback — let React Router handle all non-API routes
  app.get("*", (_req: Request, res: Response) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// Error-handling middleware, this is where next(error) lands
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

export default app;
