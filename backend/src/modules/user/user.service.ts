import { Repository } from "typeorm";
import { User } from "./user.entity";
import { appDataSource } from "../../config/datasource";
import { Result, ok, err } from "neverthrow";

class UserService {
  private getRepo(): Result<Repository<User>, string> {
    const dataSourceResult = appDataSource.getInstance();
    if (dataSourceResult.isErr()) {
      return err(dataSourceResult.error);
    }
    return ok(dataSourceResult.value.getRepository(User));
  }

  async createUser(userData: Partial<User>): Promise<Result<User, string>> {
    const repoResult = this.getRepo();
    if (repoResult.isErr()) {
      return err(repoResult.error);
    }

    try {
      const user = repoResult.value.create(userData);
      const saved = await repoResult.value.save(user);
      return ok(saved);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(`Failed to create user: ${message}`);
    }
  }
}

export const userService = new UserService();
