import express from "express";
import { oauth2Client, getAuthUrl } from "../utils/googleAuth.js";
import { User } from "../models/user.models.js";

const router = express.Router();

// STEP 1 — User clicks "Link Google Calendar"
router.get("/google", (req, res) => {
  const token = req.query.token;

  if (!token) return res.status(400).send("Missing user token");

  const authUrl = `${getAuthUrl()}&state=${token}`;

  res.redirect(authUrl);
});

// STEP 2 — Google redirects here after user login
router.get("/google/callback", async (req, res) => {
  try {
    const code = req.query.code;
    const userToken = req.query.state;

    if (!code || !userToken) {
      return res.status(400).send("Invalid callback data");
    }

    // VERIFY USER ID FROM JWT
    const jwt = await import("jsonwebtoken");
    const decoded = jwt.default.verify(userToken, process.env.JWT_SECRET);
    const userId = decoded._id;

    // Exchange Google auth code for tokens
    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens in user document
    await User.findByIdAndUpdate(userId, {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
    });

    return res.send(`
      <h1>Google Calendar Linked Successfully ✔</h1>
      <p>You can close this page</p>
    `);

  } catch (err) {
    console.error("Google callback failed:", err);
    res.status(500).send("Auth failed");
  }
});

export default router;
