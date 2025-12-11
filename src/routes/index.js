import { Router } from "express";
import authRoutes from "./auth.js";
import axios from "axios";

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
    const { zip } = req.body;

    // Validate ZIP
    if (!zip || !/^\d{5}$/.test(zip)) {
      return res.status(400).render("home", {
        title: "Neighborhood Feed",
        error: "Please enter a valid 5-digit ZIP code.",
        user
      });
    }

    // NYC 311 query (stable dataset)
    const apiURL =
      "https://data.cityofnewyork.us/resource/fhrw-4uyv.json?" +
      `$where=incident_zip='${zip}'` +
      "&$order=created_date DESC" +
      "&$limit=300";

    let incidents = [];

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

    return res.render("home", {
      title: "Neighborhood Feed",
      incidents,
      zip,
      user
    });

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).render("home", {
      title: "Neighborhood Feed",
      error: "Unexpected server error."
    });
  }
});

router.use((req, res) => {
  res.status(404).render("home", { title: "Not Found", error: "Page not found." });
});

export default router;