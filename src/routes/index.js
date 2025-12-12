import { Router } from "express";
import authRoutes from "./auth.js";
import axios from "axios";
import { saveIncidents } from "../data/incidents.js";
import { getIncidentsByZip } from "../data/incidents.js";
import { getIncidentById } from "../data/incidents.js";

const router = Router();

router.get("/", (req, res) => {
  const user = req.session.user || null;
  res.render("home", { title: "Home", user });
});

router.use("/auth", authRoutes);

// Feed page
router.get("/feed", async (req, res) => {
  const user = req.session.user || null;
  res.render("home", { title: "Neighborhood Feed", user });
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

    const hasNextPage = incidents.length > PAGE_SIZE;

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

    return res.render("home", {
      title: "Neighborhood Feed",
      incidents,
      zip,
      user,
      page: currentPage,
      hasNextPage: incidents.length === PAGE_SIZE
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

    return res.render("incident", {
      title: "Incident Details",
      incident,
      user
    });

  } catch (err) {
    console.error("INCIDENT DETAIL ERROR:", err);
    return res.status(500).render("home", {
      title: "Error",
      error: "Failed to load incident details."
    });
  }
});

router.use((req, res) => {
  res.status(404).render("home", { title: "Not Found", error: "Page not found." });
});

export default router;