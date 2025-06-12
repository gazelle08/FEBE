// src/config/passport-setup.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const AppleStrategy = require('passport-apple').Strategy;
const supabase = require('./database');
const jwt = require('jsonwebtoken');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const { data: users, error } = await supabase.from('users').select('id, username, email').eq('id', id).limit(1);
        if (error) throw error;
        done(null, users[0]);
    } catch (err) {
        done(err, null);
    }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        let { data: existingUsers, error: existingUsersError } = await supabase.from('users').select('id, username, email').eq('google_id', profile.id).limit(1);
        if (existingUsersError) throw existingUsersError;

        if (existingUsers && existingUsers.length > 0) {
            const user = existingUsers[0];
            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { id: user.id, username: user.username, token: token });
        } else {
            const userEmail = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            if (userEmail) {
                let { data: existingEmailUsers, error: existingEmailUsersError } = await supabase.from('users').select('id, username, email').eq('email', userEmail).limit(1);
                if (existingEmailUsersError) throw existingEmailUsersError;

                if (existingEmailUsers && existingEmailUsers.length > 0) {
                    const user = existingEmailUsers[0];
                    const { error: updateError } = await supabase.from('users').update({ google_id: profile.id }).eq('id', user.id);
                    if (updateError) throw updateError;
                    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
                    return done(null, { id: user.id, username: user.username, token: token });
                }
            }

            const newUser = {
                username: profile.displayName.toLowerCase().replace(/\s/g, ''),
                full_name: profile.displayName,
                email: userEmail,
                google_id: profile.id,
                education_level: 'Unknown',
                gender: 'Unknown',
                password: null, // No password for OAuth users
                date_of_birth: null // Add default value as date_of_birth is required in register
            };
            const { data: createdUserArr, error: createError } = await supabase.from('users').insert(newUser).select('id, username');
            if (createError) throw createError;

            const createdUser = createdUserArr[0];
            const token = jwt.sign({ id: createdUser.id, username: createdUser.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { ...createdUser, token: token });
        }
    } catch (err) {
        console.error('Error during Google OAuth:', err);
        return done(err, null);
    }
  }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL,
    profileFields: ['id', 'displayName', 'emails']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        let { data: existingUsers, error: existingUsersError } = await supabase.from('users').select('id, username, email').eq('facebook_id', profile.id).limit(1);
        if (existingUsersError) throw existingUsersError;

        if (existingUsers && existingUsers.length > 0) {
            const user = existingUsers[0];
            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { id: user.id, username: user.username, token: token });
        } else {
            const userEmail = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            if (userEmail) {
                let { data: existingEmailUsers, error: existingEmailUsersError } = await supabase.from('users').select('id, username, email').eq('email', userEmail).limit(1);
                if (existingEmailUsersError) throw existingEmailUsersError;

                if (existingEmailUsers && existingEmailUsers.length > 0) {
                    const user = existingEmailUsers[0];
                    const { error: updateError } = await supabase.from('users').update({ facebook_id: profile.id }).eq('id', user.id);
                    if (updateError) throw updateError;
                    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
                    return done(null, { id: user.id, username: user.username, token: token });
                }
            }

            const newUser = {
                username: profile.displayName.toLowerCase().replace(/\s/g, ''),
                full_name: profile.displayName,
                email: userEmail,
                facebook_id: profile.id,
                date_of_birth: null,
                education_level: 'Unknown',
                gender: 'Unknown',
                password: null
            };
            const { data: createdUserArr, error: createError } = await supabase.from('users').insert(newUser).select('id, username');
            if (createError) throw createError;

            const createdUser = createdUserArr[0];
            const token = jwt.sign({ id: createdUser.id, username: createdUser.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { ...createdUser, token: token });
        }
    } catch (err) {
        console.error('Error during Facebook OAuth:', err);
        return done(err, null);
    }
  }
));

passport.use(new AppleStrategy({
    clientID: process.env.APPLE_CLIENT_ID,
    teamID: process.env.APPLE_TEAM_ID,
    keyID: process.env.APPLE_KEY_ID,
    privateKeyPath: process.env.APPLE_PRIVATE_KEY_PATH,
    callbackURL: process.env.APPLE_CALLBACK_URL,
    passReqToCallback: true
  },
  async (req, accessToken, refreshToken, profile, done) => {
    try {
        const appleId = profile.id;
        const userEmail = profile.email || (profile.emails && profile.emails[0] ? profile.emails[0].value : null);
        const fullName = profile.name ? `${profile.name.firstName || ''} ${profile.name.lastName || ''}`.trim() : 'Apple User';

        let { data: existingUsers, error: existingUsersError } = await supabase.from('users').select('id, username, email').eq('apple_id', appleId).limit(1);
        if (existingUsersError) throw existingUsersError;

        if (existingUsers && existingUsers.length > 0) {
            const user = existingUsers[0];
            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { id: user.id, username: user.username, token: token });
        } else {
            if (userEmail) {
                let { data: existingEmailUsers, error: existingEmailUsersError } = await supabase.from('users').select('id, username, email').eq('email', userEmail).limit(1);
                if (existingEmailUsersError) throw existingEmailUsersError;

                if (existingEmailUsers && existingEmailUsers.length > 0) {
                    const user = existingEmailUsers[0];
                    const { error: updateError } = await supabase.from('users').update({ apple_id: appleId }).eq('id', user.id);
                    if (updateError) throw updateError;
                    const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
                    return done(null, { id: user.id, username: user.username, token: token });
                }
            }

            const newUser = {
                username: fullName.toLowerCase().replace(/\s/g, ''),
                full_name: fullName,
                email: userEmail,
                apple_id: appleId,
                date_of_birth: null,
                education_level: 'Unknown',
                gender: 'Unknown',
                password: null
            };
            const { data: createdUserArr, error: createError } = await supabase.from('users').insert(newUser).select('id, username');
            if (createError) throw createError;

            const createdUser = createdUserArr[0];
            const token = jwt.sign({ id: createdUser.id, username: createdUser.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { ...createdUser, token: token });
        }
    } catch (err) {
        console.error('Error during Apple OAuth:', err);
        return done(err, null);
    }
  }
));