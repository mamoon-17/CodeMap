import { Request, Response, NextFunction } from "express";
import { userService } from "./user.service";

class UserController {
  create = async (req: Request, res: Response, next: NextFunction) => {
    const result = await userService.createUser(req.body);

    result.match(
      (user: unknown) => res.status(201).json(user),
      (error: unknown) => next(new Error(String(error))),
    );
  };
}

export const userController = new UserController();
