import { Note } from "../models/notes.models.js";
import { User } from "../models/user.models.js"; // <--- ADDED THIS
import { asyncHandler } from "../utils/Asynchandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { google } from "googleapis";

// Create Note
const createNote = asyncHandler(async (req, res) => {
  const {
    title,
    content,
    isPublic = false,
    startTime,
    endTime,
  } = req.body;

  const userId = req.user._id;

  if (!title || !content) {
    throw new ApiError(400, "Title and content are required");
  }

  // Create the note in DB first
  const note = await Note.create({
    title,
    content,
    isPublic,
    user: userId,
    startTime,
    endTime,
  });

  // Fetch full user data (including Google tokens)
  const user = await User.findById(userId);

  // If user connected Google & times exist → sync to calendar
  if (user?.googleAccessToken && user?.googleRefreshToken && startTime && endTime) {
    try {
      const auth = new google.auth.OAuth2();

      // 🔹 Load stored tokens
      auth.setCredentials({
        access_token: user.googleAccessToken,
        refresh_token: user.googleRefreshToken,
      });

      // 🔥 REFRESH TOKEN AUTOMATICALLY
      const newTokens = await auth.refreshAccessToken();
      auth.setCredentials(newTokens.credentials);

      // 🔹 Save refreshed access token in DB
      await User.findByIdAndUpdate(userId, {
        googleAccessToken: newTokens.credentials.access_token,
        googleTokenExpiry: newTokens.credentials.expiry_date,
      });

      const calendar = google.calendar({ version: "v3", auth });

      // 🔹 Google Calendar event object
      const event = {
        summary: title,
        description: content,
        start: {
          dateTime: new Date(startTime).toISOString(),
          timeZone: "Asia/Kolkata",
        },
        end: {
          dateTime: new Date(endTime).toISOString(),
          timeZone: "Asia/Kolkata",
        },
      };

      // 🔥 Insert event
      await calendar.events.insert({
        calendarId: "primary",
        requestBody: event,
      });

      console.log("✅ Event added to Google Calendar successfully!");

    } catch (error) {
      console.error("❌ Google Calendar Sync Failed:", error.message);
      // DO NOT throw error (note is already saved)
    }
  } else {
    console.log("⚠️ Google sync skipped (missing tokens or no start/end time)");
  }

  return res
    .status(201)
    .json(new ApiResponse(201, { note }, "Note created successfully"));
});

// Get All Notes (only user's own notes)
const getMyNotes = asyncHandler(async (req, res) => {
  const notes = await Note.find({ user: req.user._id }).sort({ updatedAt: -1 });
  return res.status(200).json(new ApiResponse(200, notes));
});

// Get Public Notes
const getPublicNotes = asyncHandler(async (req, res) => {
  const notes = await Note.find({ isPublic: true }).sort({ updatedAt: -1 });
  return res.status(200).json(new ApiResponse(200, notes));
});

// Get Single Note
const getNoteById = asyncHandler(async (req, res) => {
  const note = await Note.findOne({ _id: req.params.id, user: req.user._id });

  if (!note) {
    throw new ApiError(404, "Note not found");
  }

  return res.status(200).json(new ApiResponse(200, note));
});

// Update Note
const updateNote = asyncHandler(async (req, res) => {
  const { title, content, isPublic } = req.body;

  let note = await Note.findOne({ _id: req.params.id, user: req.user._id });

  if (!note) {
    throw new ApiError(404, "Note not found");
  }

  note.title = title ?? note.title;
  note.content = content ?? note.content;
  note.isPublic = isPublic ?? note.isPublic;

  await note.save();

  return res.status(200).json({
    success: true,
    message: "Note updated successfully",
    note,
  });
});

// Delete Note
const deleteNote = asyncHandler(async (req, res) => {
  const note = await Note.findOne({ _id: req.params.id, user: req.user._id });

  if (!note) {
    throw new ApiError(404, "Note not found");
  }

  const user = await User.findById(req.user._id);


  if (user?.googleAccessToken && note.startTime) {
    try {
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: user.googleAccessToken });
      const calendar = google.calendar({ version: "v3", auth });

      const searchRes = await calendar.events.list({
        calendarId: "primary",
        q: note.title, // Look for events with this title
        timeMin: new Date(note.startTime).toISOString(), // Look starting from this time
        maxResults: 5,
        singleEvents: true,
      });

      const eventToDelete = searchRes.data.items.find((event) => {
        const eventStart = new Date(
          event.start.dateTime || event.start.date
        ).getTime();
        const noteStart = new Date(note.startTime).getTime();
        return Math.abs(eventStart - noteStart) < 2000;
      });

 
      if (eventToDelete) {
        await calendar.events.delete({
          calendarId: "primary",
          eventId: eventToDelete.id,
        });
        console.log("Found and deleted synced Google Calendar event");
      }
    } catch (err) {
    
      console.log(
        "Sync Delete Skipped (Event might not exist or token expired)"
      );
    }
  }
  await Note.findByIdAndDelete(req.params.id);

  return res.status(200).json(new ApiResponse(200, null, "Note deleted"));
});

export {
  createNote,
  getMyNotes,
  getPublicNotes,
  getNoteById,
  updateNote,
  deleteNote,
};


