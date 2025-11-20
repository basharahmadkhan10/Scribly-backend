import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import jwt from "jsonwebtoken";
import { google } from "googleapis";
import { oauth2Client, getAuthUrl } from "./googleAuth.js";
import { User } from "./models/user.models.js";

dotenv.config();
const app = express();

// --------------------
// CORS CONFIGURATION
// --------------------
const corsOptions = {
  origin: "https://scribly-frontend-j8ps.vercel.app", // frontend URL
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
// Preflight requests
app.options("*", cors(corsOptions));

// --------------------
// MIDDLEWARES
// --------------------
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());
app.use(bodyParser.json());

// --------------------
// ROUTES
// --------------------
import userRouter from "./routes/user.routes.js";
import noteRouter from "./routes/notes.route.js";

app.use("/api/v1/users", userRouter);
app.use("/api/v1/notes", noteRouter);

// --------------------
// GOOGLE OAUTH ROUTES
// --------------------

// Start Google Auth
app.get("/auth/google", (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Missing user token");

  const url = getAuthUrl() + `&state=${encodeURIComponent(token)}`;
  res.redirect(url);
});

// Google OAuth Callback
app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Verify JWT to get User ID
    const decoded = jwt.verify(state, process.env.ACCESS_TOKEN_SECRET);
    const userId = decoded._id || decoded.id;

    await User.findByIdAndUpdate(userId, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      googleTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    });

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Google Connected</title>
        <style>
          body { font-family: sans-serif; background: #0f172a; color: white; display:flex; justify-content:center; align-items:center; height:100vh; }
          .card { background: rgba(255,255,255,0.1); padding: 40px; border-radius: 20px; text-align:center; }
          button { padding: 12px 24px; border:none; border-radius: 50px; cursor:pointer; background:#3b82f6; color:white; font-weight:600; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>✅ Google Calendar Linked!</h2>
          <p>Your account is now connected to Google Calendar.</p>
          <button onclick="window.close()">Close</button>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Google Auth Error:", err);
    res.status(500).send("Google OAuth failed. Please try again.");
  }
});

// Optional route to create Google Calendar event
app.post("/google/create-event", async (req, res) => {
  const { userId, title, description, startTime, endTime } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken)
      return res.status(400).json({ error: "Google account not linked" });

    oauth2Client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const event = {
      summary: title,
      description: description || "",
      start: { dateTime: startTime, timeZone: "Asia/Kolkata" },
      end: { dateTime: endTime, timeZone: "Asia/Kolkata" },
    };

    await calendar.events.insert({ calendarId: "primary", requestBody: event });
    res.json({ success: true, message: "Event added to Google Calendar!" });
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ error: "Failed to create calendar event" });
  }
});

// --------------------
// START SERVER
// --------------------
const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app };


