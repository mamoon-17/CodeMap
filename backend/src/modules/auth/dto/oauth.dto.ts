export class OAuthDto {
  provider: "google" | "github";
  providerId: string;
  email: string;
  username: string;

  constructor(
    provider: "google" | "github",
    providerId: string,
    email: string,
    username: string,
  ) {
    this.provider = provider;
    this.providerId = providerId;
    this.email = email;
    this.username = username;
  }

  static validate(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.provider || !["google", "github"].includes(data.provider)) {
      errors.push("Provider must be either 'google' or 'github'");
    }

    if (!data.providerId || typeof data.providerId !== "string") {
      errors.push("Provider ID is required and must be a string");
    }

    if (!data.email || typeof data.email !== "string") {
      errors.push("Email is required and must be a string");
    }

    if (!data.username || typeof data.username !== "string") {
      errors.push("Username is required and must be a string");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
