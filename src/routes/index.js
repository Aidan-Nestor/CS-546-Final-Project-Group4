import { Router } from "express";
import authRoutes from "./auth.js";
import axios from "axios";
import { saveIncidents } from "../data/incidents.js";
import { getIncidentsByZip } from "../data/incidents.js";
import { getIncidentById } from "../data/incidents.js";
import * as comments from "../data/comments.js";

const router = Router();

router.get("/", (req, res) => {
  const user = req.session.user || null;
  res.render("home", { title: "Home", user });
});

router.use("/auth", authRoutes);

// Feed page
router.get("/feed", async (req, res) => {
  const user = req.session.user || null;
  const zip = req.query.zip || null;
  const page = Number(req.query.page) || 1;
  let incidents = [];
  let hasNextPage = false;

  if (zip) {
    const PAGE_SIZE = 10;
    const skip = (page - 1) * PAGE_SIZE;

    incidents = await getIncidentsByZip(zip, skip, PAGE_SIZE + 1);
    hasNextPage = incidents.length > PAGE_SIZE;
    incidents = incidents.slice(0, PAGE_SIZE);
  }

  return res.render("home", { title: "Neighborhood Feed", user, zip, page, incidents, hasNextPage });
});

// Handle ZIP search using stable dataset fhrw-4uyv
router.post("/feed", async (req, res) => {
  try {
    const user = req.session.user || null;
    const { zip, page = 1 } = req.body;

    // Validate ZIP
    if (!zip || !/^\d{5}$/.test(zip)) {
      return res.status(400).render("home", {
        title: "Neighborhood Feed",
        error: "Please enter a valid 5-digit ZIP code.",
        user
      });
    }

    const PAGE_SIZE = 10; // Items per page
    const currentPage = Number(page) || 1;
    const skip = (currentPage - 1) * PAGE_SIZE;

    // Try to load incidents from MongoDB first
    let incidents = await getIncidentsByZip(zip, skip, PAGE_SIZE + 1);

    let hasNextPage = incidents.length > PAGE_SIZE;

    // Trim extra record used for pagination check
    incidents = incidents.slice(0, PAGE_SIZE);

    if (incidents.length > 0) {
      return res.render("home", {
        title: "Neighborhood Feed",
        incidents,
        zip,
        user,
        page: currentPage,
        hasNextPage
      });
    }

    // NYC 311 query (stable dataset)
    const apiURL =
      "https://data.cityofnewyork.us/resource/fhrw-4uyv.json?" +
      `$where=incident_zip='${zip}'` +
      "&$order=created_date DESC" +
      "&$limit=300";

    try {
      const { data } = await axios.get(apiURL);
      incidents = data;
    } catch (apiErr) {
      console.error("311 API ERROR:", apiErr?.response?.status);
      return res.status(500).render("home", {
        title: "Neighborhood Feed",
        error: "NYC 311 API is unavailable. Try again later.",
        user
      });
    }
    // Save fetched incidents into MongoDB
    await saveIncidents(incidents);

    // Apply pagination to API results (same as DB path)
    const pagedIncidents = await getIncidentsByZip(zip, skip, PAGE_SIZE + 1);
    hasNextPage = pagedIncidents.length > PAGE_SIZE;

    const incidentsToRender = pagedIncidents.slice(0, PAGE_SIZE);

    return res.render("home", {
      title: "Neighborhood Feed",
      incidents: incidentsToRender,
      zip,
      user,
      page: currentPage,
      hasNextPage
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).render("home", {
      title: "Neighborhood Feed",
      error: "Unexpected server error."
    });
  }
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
      user._id,
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

router.use((req, res) => {
  res.status(404).render("home", { title: "Not Found", error: "Page not found." });
});

export default router;