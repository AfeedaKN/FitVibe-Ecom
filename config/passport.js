const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/userSchema");
const env = require("dotenv").config();


function generateReferralCode() {
  return "FIT" + Math.random().toString(36).substring(2, 8).toUpperCase();
}

passport.use(
  new GoogleStrategy(
    { 
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "https://www.fitvibe.world/auth/google/callback",
      passReqToCallback: true,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        
        let user = await User.findOne({ googleId: profile.id });

        if (user) {
          return done(null, user);
        } else {
          
          let existingUser = await User.findOne({ email: profile.emails[0].value });

          if (existingUser) {
            
            existingUser.googleId = profile.id;
            await existingUser.save();
            return done(null, existingUser);
          }

          
          const referralCode = generateReferralCode();

          user = new User({
            name: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            password: "", 
            referralCode,
          });

          await user.save();
          return done(null, user);
        }
      } catch (error) {
        return done(error, null);
      }
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  User.findById(id)
    .then((user) => {
      done(null, user);
    })
    .catch((err) => {
      done(err, null);
    });
});

module.exports = passport;
