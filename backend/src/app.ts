import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import userRoutes from "./modules/user/user.routes";
import projectRoutes from "./modules/project/project.routes";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3000"],
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/users", userRoutes);
app.use("/projects", projectRoutes);

// Error-handling middleware, this is where next(error) lands
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

export default app;
