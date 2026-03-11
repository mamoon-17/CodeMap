import passport from "passport";
import { Strategy as GoogleStrategy, Profile as GoogleProfile, VerifyCallback } from "passport-google-oauth20";
import { Strategy as GitHubStrategy, Profile as GitHubProfile } from "passport-github2";
import { config } from "../config/config";
import { authService } from "../modules/auth/auth.service";
import { OAuthDto } from "../modules/auth/dto/oauth.dto";

export class OAuthUtil {
  initialize(): void {
    // Google OAuth Strategy
    passport.use(
      new GoogleStrategy(
        {
          clientID: config.getGoogleClientId(),
          clientSecret: config.getGoogleClientSecret(),
          callbackURL: "/auth/google/callback",
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: GoogleProfile,
          done: VerifyCallback,
        ) => {
          try {
            const email = profile.emails?.[0]?.value;
            if (!email) {
              return done(new Error("No email provided by Google"), undefined);
            }

            const oauthDto = new OAuthDto(
              "google",
              profile.id,
              email,
              (profile.displayName || email.split("@")[0]) as string,
            );

            const result = await authService.findOrCreateOAuthUser(oauthDto);

            result.match(
              (user) => done(null, user),
              (error) => done(new Error(error), undefined),
            );
          } catch (error) {
            done(error as Error, undefined);
          }
        },
      ),
    );

    // GitHub OAuth Strategy
    passport.use(
      new GitHubStrategy(
        {
          clientID: config.getGithubClientId(),
          clientSecret: config.getGithubClientSecret(),
          callbackURL: "/auth/github/callback",
          scope: ['user:email'], // Request email access
        },
        async (
          _accessToken: string,
          _refreshToken: string,
          profile: GitHubProfile,
          done: VerifyCallback,
        ) => {
          try {
            // Try to get email from profile
            let email = profile.emails?.[0]?.value;
            
            // If no email provided, generate one based on GitHub username
            if (!email) {
              email = `${profile.username || profile.id}@github.placeholder`;
              console.warn(`GitHub user ${profile.username} has no public email, using placeholder: ${email}`);
            }

            const oauthDto = new OAuthDto(
              "github",
              profile.id,
              email,
              (profile.username || profile.displayName || email.split("@")[0]) as string,
            );

            const result = await authService.findOrCreateOAuthUser(oauthDto);

            result.match(
              (user) => done(null, user),
              (error) => done(new Error(error), undefined),
            );
          } catch (error) {
            done(error as Error, undefined);
          }
        },
      ),
    );

    // Serialize user to session
    passport.serializeUser((user: Express.User, done: (err: any, id?: any) => void) => {
      done(null, (user as any).id);
    });

    // Deserialize user from session
    passport.deserializeUser(async (id: string, done: (err: any, user?: any) => void) => {
      const result = await authService.findById(id);
      result.match(
        (user) => done(null, user),
        (error) => done(new Error(error), null),
      );
    });
  }
}

export const oauthUtil = new OAuthUtil();
