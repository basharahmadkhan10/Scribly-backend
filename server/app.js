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

app.use(
  cors({
    origin: "https://scribly-frontend-j8ps.vercel.app",
    credentials: true,
  })
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());
app.use(bodyParser.json());

import userRouter from "./routes/user.routes.js";
import noteRouter from "./routes/notes.route.js";

app.use("/api/v1/users", userRouter);
app.use("/api/v1/notes", noteRouter);

// 1. Route to start Google Auth
app.get("/auth/google", (req, res) => {
  const { token } = req.query; // JWT from frontend (used to identify user)
  if (!token) return res.status(400).send("Missing user token");

  // Pass the JWT as 'state' so we know who is logging in when Google redirects back
  const url = getAuthUrl() + `&state=${encodeURIComponent(token)}`;
  res.redirect(url);
});

// 2. Callback Route (Professional UI Update)
app.get("/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  const state = req.query.state; // This is the JWT we sent earlier

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Verify the JWT to get the User ID
    const decoded = jwt.verify(state, process.env.ACCESS_TOKEN_SECRET);

    // Handle both '_id' (standard Mongoose) and 'id' just in case
    const userId = decoded._id || decoded.id;

    await User.findByIdAndUpdate(userId, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      googleTokenExpiry: tokens.expiry_date
        ? new Date(tokens.expiry_date)
        : null,
    });

    // --- Professional Success Page ---
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Connection Successful</title>
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: white;
          }
          .card {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
            border: 1px solid rgba(255, 255, 255, 0.18);
            text-align: center;
            max-width: 400px;
            width: 90%;
            animation: fadeIn 0.8s ease-out;
          }
          .icon {
            font-size: 60px;
            margin-bottom: 20px;
            display: inline-block;
          }
          h2 {
            margin: 10px 0;
            font-size: 24px;
            font-weight: 600;
            color: #fff;
          }
          p {
            color: #cbd5e1;
            font-size: 16px;
            line-height: 1.5;
            margin-bottom: 30px;
          }
          .btn {
            background: linear-gradient(90deg, #3b82f6, #8b5cf6);
            color: white;
            border: none;
            padding: 12px 28px;
            border-radius: 50px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s, box-shadow 0.2s;
            text-decoration: none;
            display: inline-block;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h2>Google Calendar Linked!</h2>
          <p>Your account has been successfully connected. You can now create notes that sync directly to your calendar.</p>
          <button class="btn" onclick="window.close()">Close Window</button>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Google Auth Error:", err);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Connection Failed</title>
        <style>
          body { margin: 0; padding: 0; font-family: sans-serif; background: #0f172a; height: 100vh; display: flex; justify-content: center; align-items: center; color: white; }
          .card { background: rgba(255, 0, 0, 0.1); padding: 40px; border-radius: 20px; border: 1px solid rgba(255, 99, 99, 0.3); text-align: center; }
        </style>
      </head>
      <body>
        <div class="card">
          <div style="font-size: 60px; margin-bottom: 20px;">❌</div>
          <h2>Connection Failed</h2>
          <p>We couldn't link your Google Calendar. Please try again.</p>
        </div>
      </body>
      </html>
    `);
  }
});

// Optional: This route is redundant if you are handling sync in createNote,
// but good to keep for testing or specific calendar actions.
app.post("/google/create-event", async (req, res) => {
  const { userId, title, description, startTime, endTime } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user || !user.googleAccessToken) {
      return res.status(400).json({ error: "Google account not linked" });
    }

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

    await calendar.events.insert({
      calendarId: "primary",
      requestBody: event,
    });

    res.json({ success: true, message: "Event added to Google Calendar!" });
  } catch (err) {
    console.error("Error creating event:", err);
    res.status(500).json({ error: "Failed to create calendar event" });
  }
});

export { app };
