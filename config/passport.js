const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");
const logger = require("../utils/logger");

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails[0].value;

          // Find or create user
          let user = await User.findOne({ email });

          if (user) {
            // Link Google ID if not already linked
            if (!user.googleId) {
              user.googleId = profile.id;
              await user.save();
            }
            return done(null, user);
          }

          // Create new user via Google
          user = await User.create({
            googleId: profile.id,
            name: profile.displayName,
            email,
            avatar: profile.photos[0]?.value || "",
            isEmailVerified: true, // Google verifies email
            role: "user",
          });

          return done(null, user);
        } catch (error) {
          logger.error(`Google OAuth error: ${error.message}`);
          return done(error, null);
        }
      }
    )
  );
}

module.exports = passport;
