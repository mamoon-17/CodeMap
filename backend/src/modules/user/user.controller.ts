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

  listGithubRepos = async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        res.status(401).json({
          success: false,
          error: "Authentication required.",
        });
        return;
      }

      const includeForks =
        String(req.query.include_forks || "false").toLowerCase() === "true";
      const includeEmpty =
        String(req.query.include_empty || "false").toLowerCase() === "true";

      const result = await userService.listGithubRepos(req.user.id, {
        includeForks,
        includeEmpty,
      });

      result.match(
        (repositories) => {
          res.status(200).json({
            success: true,
            data: {
              repositories,
              count: repositories.length,
            },
          });
        },
        (error) => {
          if (
            error.includes("GitHub account not connected") ||
            error.includes("User not found")
          ) {
            res.status(400).json({ success: false, error });
            return;
          }

          next(new Error(error));
        },
      );
    } catch (error) {
      next(error);
    }
  };
}

export const userController = new UserController();
