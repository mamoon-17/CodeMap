import express, { Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import userRoutes from "./modules/user/user.routes";

const app = express();

app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/users", userRoutes);

// Error-handling middleware, this is where next(error) lands
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: err.message });
});

export default app;
