import { Repository } from "typeorm";
import { User } from "./user.entity";
import { AppDataSource } from "../../config/datasource";
import { Result, ok, err } from "neverthrow";

class UserService {
  private getRepo(): Repository<User> {
    return AppDataSource.getRepository(User);
  }

  async createUser(userData: Partial<User>): Promise<Result<User, string>> {
    try {
      const repo = this.getRepo();
      const user = repo.create(userData);
      const saved = await repo.save(user);
      return ok(saved);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to create user: ${message}`);
    }
  }
}

export const userService = new UserService();
