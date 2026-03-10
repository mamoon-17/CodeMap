export class RegisterDto {
  username: string;
  email: string;
  password: string;

  constructor(username: string, email: string, password: string) {
    this.username = username;
    this.email = email;
    this.password = password;
  }

  static validate(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.username || typeof data.username !== "string") {
      errors.push("Username is required and must be a string");
    } else if (data.username.length < 3) {
      errors.push("Username must be at least 3 characters long");
    }

    if (!data.email || typeof data.email !== "string") {
      errors.push("Email is required and must be a string");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push("Email must be a valid email address");
    }

    if (!data.password || typeof data.password !== "string") {
      errors.push("Password is required and must be a string");
    } else if (data.password.length < 6) {
      errors.push("Password must be at least 6 characters long");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
