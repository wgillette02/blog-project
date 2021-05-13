/*
  Server.js
  Handles the backend of the biography web application.
  Programmed by Will Gillette
  Started early January 2021
*/

/* Libraries */
const express = require('express')
const fs = require('fs')
const app = express()
const bcrypt = require('bcrypt')
const passport = require('passport')
const flash = require('express-flash')
const session = require('express-session')
const methodOverride = require('method-override')
const sqlite3 = require("better-sqlite3");
const nodemailer = require("nodemailer");
const TokenGenerator = require('uid-generator');
const upload = require('express-fileupload');

/* Variables */
const dbFile = "./.data/db10.db";
const db = new sqlite3(dbFile);
const exists = fs.existsSync(dbFile);

// Set up the email verification account
const smtpTransport = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

/* Table Setup */
if (!exists) {
  db.prepare(
    "CREATE TABLE IF NOT EXISTS UserInfo (id INTEGER PRIMARY KEY AUTOINCREMENT, username VARCHAR(50) NOT NULL, password VARCHAR(50) NOT NULL, email VARCHAR(50) NOT NULL, bio VARCHAR(50))"
  ).run();
  db.prepare(
    "CREATE TABLE IF NOT EXISTS EmailVerifications (id INTEGER PRIMARY KEY AUTOINCREMENT, email VARCHAR(50) NOT NULL, emailToken VARCHAR(50) NOT NULL)"
  ).run();
  db.prepare(
    "CREATE TABLE IF NOT EXISTS PasswordResets (id INTEGER PRIMARY KEY AUTOINCREMENT, username VARCHAR(50) NOT NULL, passwordToken VARCHAR(50) NOT NULL)"
  ).run();
  db.prepare(
    "CREATE TABLE IF NOT EXISTS BlogPosts (id INTEGER PRIMARY KEY AUTOINCREMENT, author VARCHAR(50) NOT NULL, title VARCHAR(50) NOT NULL, body VARCHAR(50) NOT NULL, date VARCHAR(50) NOT NULL)"
  ).run();
  console.log("New table UserInfo created!");
} else {
  console.log('Database "UserInfo" ready to go!');
}

/* Passport Setup */
app.set('view-engine', 'ejs')
app.use(upload())
app.use(express.static(__dirname + '/public'))
app.use(express.urlencoded({ extended: false }))
app.use(flash())
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(methodOverride('_method'))

const initializePassport = require('./passport-config')
initializePassport(
  passport,
  username => {
    let $stmt = db.prepare("SELECT * FROM UserInfo WHERE `username` = ?");
    var data = $stmt.get(username);
    return data;
  },
  id => {
    let $stmt = db.prepare("SELECT * FROM UserInfo WHERE `id` = ?");
    var data = $stmt.get(id);
    return data;
  }
)

/*
  Homepage Endpoint
  Displays the home page if the user is logged in.
*/

app.get('/', checkAuthenticated, (req, res) => {
  res.redirect(`/users/${req.user.username}`)
})

app.get('/users/:username', checkAuthenticated, (req, res) => {
  let data = {name: req.user.username, profileName: req.params.username};
  
  if (fs.existsSync(`${__dirname}/uploads/${req.user.username}/avatar.png`)){
    data.avatar = `${__dirname}/uploads/${req.user.username}/avatar.png`;
  }
  
  if (fs.existsSync(`${__dirname}/uploads/${req.params.username}/avatar.png`)){
    data.profileAvatar = `${__dirname}/uploads/${req.params.username}/avatar.png`;
  }
  
  let $stmt = db.prepare("SELECT * FROM UserInfo WHERE `username` = ?");
  let profileData = $stmt.get(req.params.username);
  
  if (profileData && profileData.bio){
    data.bio = profileData.bio;
  }
  
  $stmt = db.prepare("SELECT * FROM BlogPosts WHERE `author` = ?");
  data.posts = $stmt.all(req.params.username);
  
  res.render('index.ejs', data);
})

/*
  Search Post Request
  Retrieves users who match a search query
*/

app.post('/search', checkAuthenticated, (req, res) => {
  if (req.body.query){
    let $stmt = db.prepare("SELECT (username) FROM UserInfo WHERE `username` LIKE '%"+req.body.query+"%'");
    let results = $stmt.all();
    let data = {name: req.user.username};
  
    if (fs.existsSync(`${__dirname}/uploads/${req.user.username}/avatar.png`)){
      data.avatar = `${__dirname}/uploads/${req.user.username}/avatar.png`;
    }
    
    data.results = results;
    
    res.render('search.ejs', data);
  } else {
    res.redirect("/");
  }
})

/*
  Create Blog Post
  Creates a new blog post for a user
*/

app.post('/createPost', checkAuthenticated, (req, res) => {
  if (req.body.author && req.body.createTitle && req.body.createContent){
    let date = new Date();
    if (date){
      let $stmt = db.prepare("INSERT INTO BlogPosts (author, title, body, date) VALUES (?, ?, ?, ?)");
      $stmt.run(req.body.author, req.body.createTitle, req.body.createContent, date.toDateString());
      res.redirect("/");
    }
  }
})

/*
  Create Blog Endpoint 
  Displays the create blog page
*/

app.get('/createPost', checkAuthenticated, (req, res) => {
  let data = {name: req.user.username};
  
  if (fs.existsSync(`${__dirname}/uploads/${req.user.username}/avatar.png`)){
    data.avatar = `${__dirname}/uploads/${req.user.username}/avatar.png`;
  }
  
  res.render('createPost.ejs', data);
})


/*
  Update Settings
  Updates the user's settings
*/

app.post('/settings', checkAuthenticated, async (req, res) => {
  var $stmt;
  
  if (req.body.username){
    var mailOptions;
    
    // Update password
    if (req.body.password && req.body.confirmPassword){
      if (req.body.confirmPassword === req.body.password){
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        
        if (hashedPassword){
          $stmt = db.prepare("UPDATE UserInfo SET `password` = ? WHERE `username` = ?");
          $stmt.run(hashedPassword, req.body.username);
          
          mailOptions = {
            from: 'Will Gillette | bowens05wills03@gmail.com',
            to : req.body.email,
            subject : "William's Biography | Password Reset Notification",
            html : "Hello " + req.body.username + ",<br>This is a confirmation that your password has recently been changed.<br>If this is incorrect, please contact support (@bowens05wills03@gmail.com)."
          }

          smtpTransport.sendMail(mailOptions, function(error, response){
           if(error){
              console.log(error);
              res.end("error");
           } else {
              res.end("sent");
           }
          });
        }
      } else {
        res.redirect("/settings");
      }
    }

    // Update email
    if (req.body.email){
      $stmt = db.prepare("SELECT * FROM UserInfo WHERE `username` = ?");
      let oldEmail = $stmt.get(req.body.username);
      
      if (oldEmail){
        $stmt = db.prepare("UPDATE UserInfo SET `email` = ? WHERE `username` = ?");
        $stmt.run(req.body.email, req.body.username);

        mailOptions = {
          from: 'Will Gillette | bowens05wills03@gmail.com',
          to : oldEmail,
          subject : "William's Biography | Email Update Notification",
          html : "Hello " + req.body.username + ",<br>This is a confirmation that your email has recently been changed.<br>If this is incorrect, please contact support (@bowens05wills03@gmail.com)."
        }

        smtpTransport.sendMail(mailOptions, function(error, response){
          if(error){
            console.log(error);
            res.end("error");
          } else {
            res.end("sent");
          }
        });
      } else {
        res.redirect("/settings");
      }
    }

    // Update bio
    if (req.body.bio){
      $stmt = db.prepare("UPDATE UserInfo SET `bio` = ? WHERE `username` = ?");
      $stmt.run(req.body.bio, req.body.username);
    }

    // Update avatar
    if (req.files){
      let path = `${__dirname}/uploads/${req.body.username}`
      if (!fs.existsSync(path)){
        fs.mkdirSync(path);
      }

      let file = req.files.avatarUpload,
          avatarUpload = file.name;

      if (file){
        file.mv(`${path}/avatar.png`, function(err){
          if (err){
            console.log(err);
            res.redirect("/settings");
          } else {
            console.log("Successfully uploaded the avatar!");
          }
        })
      }
      
      res.redirect('/');
    } else {
      res.redirect("/settings");
    }
  }
})

/*
  Settings Endpoint
  Displays the settings page if the user is logged in 
*/

app.get('/settings', checkAuthenticated, (req, res) =>{
  let data = { name: req.user.username, email: req.user.email, bio: req.user.bio};
  
  if (fs.existsSync(`${__dirname}/uploads/${req.user.username}/avatar.png`)){
    data.avatar = `${__dirname}/uploads/${req.user.username}/avatar.png`;
  }
  
  res.render('settings.ejs', data);
})

/*
  Get Profile Picture
  Retrieves the user's profile picture from teh server
*/

app.get(`${__dirname}/uploads/:username/avatar.png`, (req,res) => {
  res.sendFile(req._parsedUrl.path); 
})

/*
  Login Get Endpoint
  Displays the login page if the user is not logged in.
*/

app.get("/login", checkNotAuthenticated, (req, res) => {
  res.render('login.ejs');
});

app.get("/forgotPassword", checkNotAuthenticated, (req, res) => {
  res.render('forgotPassword.ejs');
});

/*
  Register Get Endpoint
  Displays the register page if the user is not logged in.
*/

app.get("/register", checkNotAuthenticated, (req, res) => {
  res.render('register.ejs');
});

/*
  Login Endpoint
  Creates an existing session for the user's account if none exists and redirects to the homepage if successful.
*/

app.post('/login', checkNotAuthenticated, passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login',
  failureFlash: true
}))


/*
  Register Endpoint
  Encrypts the passwords and adds the user's information to the database. Afterwards, sends an email to the user's email and prompts verification.
*/

app.post('/register', checkNotAuthenticated, async (req, res) => {
  try {
    if (req.body.confirmPassword === req.body.password){
      
      /* Generate Tokens */
      const uidgen = new TokenGenerator();
      const emailTok = await uidgen.generate();
      const hashedPassword = await bcrypt.hash(req.body.password, 10)
      
      /* Add User to Database */
      var $stmt = db.prepare(`INSERT INTO UserInfo (username, password, email)
              SELECT * FROM (SELECT '` + req.body.username + `', '`+ hashedPassword + `', '`+ req.body.email + `') AS tmp
              WHERE NOT EXISTS (
                  SELECT username FROM UserInfo WHERE username = '` + req.body.username + `'
              ) LIMIT 1;
            `);
      $stmt.run();
      
      $stmt = db.prepare(`INSERT INTO EmailVerifications (email, emailToken)
              SELECT * FROM (SELECT '` + req.body.email + `', '` + emailTok + `') AS tmp
              WHERE NOT EXISTS (
                  SELECT emailToken FROM EmailVerifications WHERE emailToken = '` + emailTok + `'
              ) LIMIT 1;
            `);
      $stmt.run();
      
      
      /* Handle Avatar Upload */
      if (req.files){
        let path = `${__dirname}/uploads/${req.body.username}`
        if (!fs.existsSync(path)){
          fs.mkdirSync(path);
        }
        
        let file = req.files.avatarUpload,
            avatarUpload = file.name;
        file.mv(`${path}/avatar.png`, function(err){
          if (err){
            console.log(err);
          } else {
            console.log("Successfully uploaded the avatar!");
          }
        })
      }
      
      
      /* Email Verification */
      let link = "https://wigillette-biography.glitch.me/verify?id=" + emailTok;
      
      let mailOptions={
          from: 'Will Gillette | bowens05wills03@gmail.com',
          to : req.body.email,
          subject : "William's Biography | Please confirm your Email account",
          html : "Hello " + req.body.username + ",<br>Please click on the link to verify your email for William's biography.<br><a href="+link+">Click here to verify</a>"
      }
      
      smtpTransport.sendMail(mailOptions, function(error, response){
       if(error){
          console.log(error);
          res.end("error");
       } else {
          res.end("sent");
       }
      });
      
      /* Redirect to Login page */
      res.redirect('/login')
    } else {
      res.render("register.ejs", {error: "Your password and password confirmation do not match."});
    }
  } catch (e) {
    console.log(e);
    res.render("register.ejs", {error: "Failed to register your account due to an internal server error."});
  }
})

app.post('/requestPassReset', async (req, res) =>{
  let $stmt = db.prepare("SELECT * FROM UserInfo WHERE `username` = ?");
  let data = $stmt.get(req.body.username);
  
  if (data != null){
    const uidgen = new TokenGenerator();
    const passTok = await uidgen.generate();
    $stmt = db.prepare(`INSERT INTO PasswordResets (username, passwordToken)
                SELECT * FROM (SELECT '` + req.body.username + `', '` + passTok + `') AS tmp
                WHERE NOT EXISTS (
                    SELECT passwordToken FROM PasswordResets WHERE passwordToken = '` + passTok + `'
                ) LIMIT 1;
              `);
    $stmt.run();
    let link = "https://wigillette-biography.glitch.me/reset?id=" + passTok; 
    let mailOptions={
        from: 'Will Gillette | bowens05wills03@gmail.com',
        to : data.email,
        subject : "William's Biography | Password Reset Notification",
        html : "Hello " + req.body.username + ",<br>Please click on the link to reset your password for William's biography.<br><a href="+link+">Click here to request a password resety</a>"
    }

    smtpTransport.sendMail(mailOptions, function(error, response){
     if(error){
        res.end("error");
     } else {
        res.end("sent");
     }
    });
  } else {
    res.end("error");
  }
});

app.get('/reset', (req, res) => {
  if (req.query && req.query.id){
    let $stmt = db.prepare("SELECT * FROM PasswordResets WHERE `passwordToken` = ?");
    var data = $stmt.get(req.query.id);
    
    if(data != null)
    {
      res.render('reset.ejs')
    } else {
      res.send("Unable to reset your password | Invalid token");
    }
  } else {
    res.send("Unable to reset your password | Invalid token");
  }
});

app.post('/reset', async (req, res) => {
  if (req.headers && req.headers.referer){
    let token = req.headers.referer.substring(req.headers.referer.indexOf("=") + 1);
  
    if (token && req.body.newPassword){
      let $stmt = db.prepare("SELECT * FROM PasswordResets WHERE `passwordToken` = ?");
      let data = $stmt.get(token);
      const hashedPassword = await bcrypt.hash(req.body.newPassword, 10)
      
      if (data != null && data.username != null && hashedPassword != null){
        /* Update the database with the new password */
        $stmt = db.prepare("UPDATE UserInfo SET `password` = ? WHERE `username` = ?")
        $stmt.run(hashedPassword, data.username);
        res.render("reset.ejs", {error: "You have successfully changed your password."});

        /* Destroy the token */
        $stmt = db.prepare("DELETE FROM PasswordResets WHERE `passwordToken` = ? AND `username` = ?");
        $stmt.run(token, data.username);
      } else {
        res.send("reset.ejs", {error: "Your password could not be changed due to an invalid token."});
      }
    }
  }
});

/*
  Logout Endpoint
  Destroys the user's existing session and redirects to the login page
*/

app.delete('/logout', (req, res) => {
  req.logOut()
  res.redirect('/login')
});

/*
  Verify Endpoint
  Verifies the user's email address by comparing the token in the URL to any tokens in the database and destroys the token if it was successfully found
*/

app.get('/verify',function(req,res){
  if (req.query && req.query.id){
    let $stmt = db.prepare("SELECT * FROM EmailVerifications WHERE `emailToken` = ?");
    var data = $stmt.get(req.query.id);

    if(data != null && data.length != 0)
    {
      res.send(`Your email, ${data.email} has been successfully verified!`);

      /* Destroy the token */
      $stmt = db.prepare("DELETE FROM EmailVerifications WHERE `emailToken` = ? AND `email` = ?");
      $stmt.run(req.query.id, data.email);
    }
    else
    {
      res.send("Your email has failed to verify due to an invalid token.");
    }
  }
});

/*
  Check Authenticated Function
  Displays the home page if the user is logged in. Otherwise, displays the log in page.
*/

function checkAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return next()
  }

  res.redirect('/login')
}

/*
  Check Authenticated Function
  Displays the home page if the user is logged in. Otherwise, displays the log in/register page.
*/

function checkNotAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    return res.redirect(`/users/${req.user.username}`)
  }
  next()
}

/* Listens for requests */
var listener = app.listen(process.env.PORT, () => {
  console.log(`Your app is listening on port ${listener.address().port}`);
});