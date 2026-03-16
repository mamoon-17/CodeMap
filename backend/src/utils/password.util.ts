import bcrypt from "bcrypt";
import { ok, err, Result } from "neverthrow";

const SALT_ROUNDS = 10;

export class PasswordUtil {
  async hashPassword(password: string): Promise<Result<string, string>> {
    try {
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      return ok(hashedPassword);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to hash password: ${errorMessage}`);
    }
  }

  async comparePassword(
    plainPassword: string,
    hashedPassword: string,
  ): Promise<Result<boolean, string>> {
    try {
      const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
      return ok(isMatch);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return err(`Failed to compare password: ${errorMessage}`);
    }
  }
}

export const passwordUtil = new PasswordUtil();
