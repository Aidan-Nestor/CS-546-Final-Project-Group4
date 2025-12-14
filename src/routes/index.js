import { Router } from "express";
import authRoutes from "./auth.js";
import axios from "axios";
import { saveIncidents } from "../data/incidents.js";
import { getIncidentsByZip } from "../data/incidents.js";
import { getIncidentById } from "../data/incidents.js";
import * as comments from "../data/comments.js";
import { getIncidentsWithFilters } from "../data/incidents.js";

const router = Router();

router.get("/", (req, res) => {
  const user = req.session.user || null;
  res.render("home", { title: "Home", user });
});

router.use("/auth", authRoutes);

// Feed page(add Quick Filters)
router.get("/feed", async (req, res) => {
  const user = req.session.user || null;
  const {
    zip,
    status,
    complaintType,
    agency,
    sort
  } = req.query;

  const page = Number(req.query.page) || 1;

  let incidents = [];
  let hasNextPage = false;

  if (zip) {
    const PAGE_SIZE = 10;
    const skip = (page - 1) * PAGE_SIZE;

    incidents = await getIncidentsWithFilters({
      zip,
      skip,
      limit: PAGE_SIZE + 1,
      status,
      complaintType,
      agency,
      sort
    });

    hasNextPage = incidents.length > PAGE_SIZE;
    incidents = incidents.slice(0, PAGE_SIZE);
  }

  return res.render("home", {
    title: "Neighborhood Feed",
    user,
    zip,
    page,
    incidents,
    hasNextPage,
    status,
    complaintType,
    agency,
    sort
  });
});

// Handle ZIP search using stable dataset fhrw-4uyv
router.post("/feed", async (req, res) => {
  const { zip } = req.body;

  // Validate ZIP
  if (!zip || !/^\d{5}$/.test(zip)) {
    return res.status(400).render("home", {
      title: "Neighborhood Feed",
      error: "Please enter a valid 5-digit ZIP code."
    });
  }

  // Redirect to GET /feed so Quick Filters & pagination work together
  return res.redirect(`/feed?zip=${zip}&page=1`);
});

// Incident detail page
router.get("/incident/:id", async (req, res) => {
  try {
    const user = req.session.user || null;
    const { id } = req.params;

    const incident = await getIncidentById(id);
    if (!incident) {
      return res.status(404).render("home", {
        title: "Incident Not Found",
        error: "Incident not found.",
        user
      });
    }

    // Keep feed state
    const zip = req.query.zip || null;
    const page = Number(req.query.page) || 1;

    // Load comments for this incident
    const commentsList = await comments.getCommentsByIncident(id);

    return res.render("incident", {
      title: "Incident Details",
      incident,
      comments: commentsList,
      user,
      zip,
      page
    });
  } catch (err) {
    console.error("INCIDENT DETAIL ERROR:", err);
    return res.status(500).render("home", {
      title: "Error",
      error: "Failed to load incident details."
    });
  }
});


router.post("/incident/:id/comment", async (req, res) => {
  try {
    const user = req.session.user;
    if (!user) {
      return res.status(403).redirect("/auth/login");
    }

    const { id } = req.params;
    const { content, zip: bodyZip = "", page: bodyPage = "" } = req.body;

    if (!content || !content.trim() || content.trim().length > 500) {
      const query = new URLSearchParams();
      if (bodyZip) query.append("zip", bodyZip);
      if (bodyPage) query.append("page", bodyPage);
      return res.redirect(`/incident/${id}?${query.toString()}`);
    }

    await comments.createComment(
      id,
      user.id,
      user.username,
      content.trim()
    );

    const query = new URLSearchParams();
    if (bodyZip) query.append("zip", bodyZip);
    if (bodyPage) query.append("page", bodyPage);

    return res.redirect(`/incident/${id}?${query.toString()}`);
  } catch (err) {
    console.error("POST COMMENT ERROR:", err);
    return res.status(500).send("Failed to post comment");
  }
});

// handles voting on comments
router.post("/comment/:commentId/vote", async (req, res) => {
  try{
    const user = req.session.user;
    if (!user) {
      return res.status(401).json({error: "Authorization Required."});
    }
    const { commentId } = req.params;
    const { type } = req.body;
    if(!["like", "dislike"].includes(type)){
      return res.status(400).send("Invalid vote.");
    }
    const updatedComment = await comments.voteComment(commentId, user.id, type);
    res.json({
      commentId: updatedComment._id.toString(),
      likes: updatedComment.likes.length,
      dislikes: updatedComment.dislikes.length
    });
  }catch(e){
    console.error("Error voting: ", e);
    res.status(500).send("Failed to vote.")
  }
});

router.use((req, res) => {
  res.status(404).render("home", { title: "Not Found", error: "Page not found." });
});

export default router;