import passport from "passport";
import { Strategy as GoogleStrategy, Profile } from "passport-google-oauth20";
import { JwtPayload } from "jsonwebtoken";
import User from "../models/userModel.js";
import Admin from "../models/adminModel.js";
import { generateUSerID } from "../controllers/authControllers.js";

export interface UserJwtPayload extends JwtPayload {
  id: string;
}

export interface AdminJwtPayload extends JwtPayload {
  id: string;
}

// ─── User Strategy ────────────────────────────────────────────────────────────
passport.use(
  "google-user",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_USER_CALLBACK_URL!,
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: (error: any, user?: UserJwtPayload | false) => void,
    ) => {
      try {
        const email = profile.emails?.[0]?.value ?? "";
        const firstName =
          profile.name?.givenName ?? profile.displayName ?? "Unknown";
        const lastName = profile.name?.familyName ?? "";
        const avatar = profile.photos?.[0]?.value;

        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          user = await User.findOne({ email });

          if (user) {
            user.googleId = profile.id;
            user.oauthProviders = { google: profile.id };
            if (!user.profilePhoto?.url && avatar) {
              user.profilePhoto = { publicId: "", url: avatar };
            }
            await user.save({ validateBeforeSave: false });
          } else {
            user = await User.create({
              firstName,
              lastName,
              email,
              googleId: profile.id,
              oauthProviders: { google: profile.id },
              farmerID: generateUSerID(),
              profilePhoto: avatar ? { publicId: "", url: avatar } : undefined,
              isVerified: true,
            });
          }
        }

        if (user.status === "suspended") {
          return done(null, false);
        }

        const payload: UserJwtPayload = {
          id: user._id.toString(),
          role: "user",
          email: user.email,
          name: `${user.firstName} ${user.lastName}`.trim(),
          avatar: user.profilePhoto?.url,
        };

        return done(null, payload);
      } catch (error) {
        return done(error, false);
      }
    },
  ),
);

// ─── Admin Strategy ───────────────────────────────────────────────────────────
passport.use(
  "google-admin",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_ADMIN_CALLBACK_URL!,
    },
    async (
      _accessToken: string,
      _refreshToken: string,
      profile: Profile,
      done: (error: any, user?: AdminJwtPayload | false) => void,
    ) => {
      try {
        const email = profile.emails?.[0]?.value ?? "";
        const avatar = profile.photos?.[0]?.value;

        // Admins are NOT created via OAuth — they must already exist
        let admin = await Admin.findOne({ googleId: profile.id });

        if (!admin) {
          // Link Google to an existing admin account only — never auto-create
          admin = await Admin.findOne({ email });

          if (!admin) {
            // No admin account found — block access entirely
            return done(null, false);
          }

          // Link their existing admin account to Google
          admin.googleId = profile.id;
          admin.oauthProviders = { google: profile.id };
          if (!admin.profilePhoto?.url && avatar) {
            admin.profilePhoto = { publicId: "", url: avatar };
          }
          await admin.save({ validateBeforeSave: false });
        }

        if (admin.status === "suspended") {
          return done(null, false);
        }

        const payload: AdminJwtPayload = {
          id: admin._id.toString(),
          role: admin.role, // preserves "admin" or "super-admin" from the DB
          email: admin.email,
          name: `${admin.firstName} ${admin.lastName}`.trim(),
          avatar: admin.profilePhoto?.url,
        };

        return done(null, payload);
      } catch (error) {
        return done(error, false);
      }
    },
  ),
);

export default passport;
