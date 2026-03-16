export class LoginDto {
  email: string;
  password: string;

  constructor(email: string, password: string) {
    this.email = email;
    this.password = password;
  }

  static validate(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.email || typeof data.email !== "string") {
      errors.push("Email is required and must be a string");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push("Email must be a valid email address");
    }

    if (!data.password || typeof data.password !== "string") {
      errors.push("Password is required and must be a string");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
