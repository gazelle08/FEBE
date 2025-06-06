// src/config/passport-setup.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const AppleStrategy = require('passport-apple').Strategy;
const db = require('./database');
const jwt = require('jsonwebtoken');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const [users] = await db.execute('SELECT id, username, email FROM users WHERE id = ?', [id]);
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
    let connection;
    try {
        connection = await db.getConnection();
        const [existingUsers] = await connection.execute('SELECT id, username, email FROM users WHERE google_id = ?', [profile.id]);

        if (existingUsers.length > 0) {
            const user = existingUsers[0];
            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { id: user.id, username: user.username, token: token });
        } else {
            const [existingEmailUsers] = await connection.execute('SELECT id, username, email FROM users WHERE email = ?', [profile.emails[0].value]);
            if (existingEmailUsers.length > 0) {
                const user = existingEmailUsers[0];
                await connection.execute('UPDATE users SET google_id = ? WHERE id = ?', [profile.id, user.id]);
                const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
                return done(null, { id: user.id, username: user.username, token: token });
            }

            const newUser = {
                username: profile.displayName.toLowerCase().replace(/\s/g, ''),
                full_name: profile.displayName,
                email: profile.emails[0].value,
                google_id: profile.id,
                education_level: 'Unknown',
                gender: 'Unknown',
                password: null
            };
            const [result] = await connection.execute(
                'INSERT INTO users (username, full_name, email, google_id, date_of_birth, education_level, gender, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [newUser.username, newUser.full_name, newUser.email, newUser.google_id, newUser.date_of_birth, newUser.education_level, newUser.gender, newUser.password]
            );
            const createdUser = { id: result.insertId, username: newUser.username };
            const token = jwt.sign({ id: createdUser.id, username: createdUser.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { ...createdUser, token: token });
        }
    } catch (err) {
        console.error('Error during Google OAuth:', err);
        return done(err, null);
    } finally {
        if (connection) connection.release();
    }
  }
));

// Facebook Strategy
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: process.env.FACEBOOK_CALLBACK_URL,
    profileFields: ['id', 'displayName', 'emails']
  },
  async (accessToken, refreshToken, profile, done) => {
    let connection;
    try {
        connection = await db.getConnection();
        const [existingUsers] = await connection.execute('SELECT id, username, email FROM users WHERE facebook_id = ?', [profile.id]);

        if (existingUsers.length > 0) {
            const user = existingUsers[0];
            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { id: user.id, username: user.username, token: token });
        } else {
            const userEmail = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
            if (userEmail) {
                const [existingEmailUsers] = await connection.execute('SELECT id, username, email FROM users WHERE email = ?', [userEmail]);
                if (existingEmailUsers.length > 0) {
                    const user = existingEmailUsers[0];
                    await connection.execute('UPDATE users SET facebook_id = ? WHERE id = ?', [profile.id, user.id]);
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
            const [result] = await connection.execute(
                'INSERT INTO users (username, full_name, email, facebook_id, date_of_birth, education_level, gender, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [newUser.username, newUser.full_name, newUser.email, newUser.facebook_id, newUser.date_of_birth, newUser.education_level, newUser.gender, newUser.password]
            );
            const createdUser = { id: result.insertId, username: newUser.username };
            const token = jwt.sign({ id: createdUser.id, username: createdUser.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { ...createdUser, token: token });
        }
    } catch (err) {
        console.error('Error during Facebook OAuth:', err);
        return done(err, null);
    } finally {
        if (connection) connection.release();
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
    let connection;
    try {
        connection = await db.getConnection();
        const appleId = profile.id;
        const userEmail = profile.email || (profile.emails && profile.emails[0] ? profile.emails[0].value : null);
        const fullName = profile.name ? `${profile.name.firstName || ''} ${profile.name.lastName || ''}`.trim() : 'Apple User';

        const [existingUsers] = await connection.execute('SELECT id, username, email FROM users WHERE apple_id = ?', [appleId]);

        if (existingUsers.length > 0) {
            const user = existingUsers[0];
            const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { id: user.id, username: user.username, token: token });
        } else {
            if (userEmail) {
                const [existingEmailUsers] = await connection.execute('SELECT id, username, email FROM users WHERE email = ?', [userEmail]);
                if (existingEmailUsers.length > 0) {
                    const user = existingEmailUsers[0];
                    await connection.execute('UPDATE users SET apple_id = ? WHERE id = ?', [appleId, user.id]);
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
            const [result] = await connection.execute(
                'INSERT INTO users (username, full_name, email, apple_id, date_of_birth, education_level, gender, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [newUser.username, newUser.full_name, newUser.email, newUser.apple_id, newUser.date_of_birth, newUser.education_level, newUser.gender, newUser.password]
            );
            const createdUser = { id: result.insertId, username: newUser.username };
            const token = jwt.sign({ id: createdUser.id, username: createdUser.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
            return done(null, { ...createdUser, token: token });
        }
    } catch (err) {
        console.error('Error during Apple OAuth:', err);
        return done(err, null);
    } finally {
        if (connection) connection.release();
    }
  }
));