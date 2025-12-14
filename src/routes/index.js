import { Router } from "express";
import authRoutes from "./auth.js";
import axios from "axios";
import { saveIncidents, getIncidentsByZip, getIncidentById, getIncidentsWithFilters, fetchIncidentsFromAPI } from "../data/incidents.js";
import * as comments from "../data/comments.js";

const router = Router();

router.get("/", (req, res) => {
  const user = req.session.user || null;
  res.render("home", { title: "Home", user });
});

// Admin page for data ingestion
router.get("/admin/ingest", (req, res) => {
  const user = req.session.user || null;
  res.render("admin", { 
    title: "Data Ingestion", 
    user,
    adminPage: true,
    scripts: '<script src="/public/js/admin.js"></script>'
  });
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
    sort,
    useAPI // New query param: if "true", query API directly instead of DB
  } = req.query;

  const page = Number(req.query.page) || 1;

  let incidents = [];
  let hasNextPage = false;
  let autoFetched = false; // Track if we auto-fetched from API

  if (zip) {
    const PAGE_SIZE = 10;
    const skip = (page - 1) * PAGE_SIZE;

    // If useAPI is true, fetch directly from API (no caching)
    if (useAPI === "true") {
      try {
        const allIncidents = await fetchIncidentsFromAPI({
          zip,
          limit: 1000,
          days: 30,
          status,
          complaintType,
          agency,
          sort
        });

        // Manual pagination for API results
        const startIdx = skip;
        const endIdx = startIdx + PAGE_SIZE;
        incidents = allIncidents.slice(startIdx, endIdx);
        hasNextPage = allIncidents.length > endIdx;
      } catch (err) {
        console.error("API fetch error:", err);
        return res.render("home", {
          title: "Neighborhood Feed",
          user,
          zip,
          page,
          incidents: [],
          hasNextPage: false,
          status,
          complaintType,
          agency,
          sort,
          error: "Failed to fetch data from API. Please try again."
        });
      }
    } else {
      // Query from database first
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

      // If no results found in DB and no filters applied (first search), auto-fetch from API
      if (incidents.length === 0 && !status && !complaintType && !agency && page === 1) {
        try {
          console.log(`Auto-fetching incidents for ZIP ${zip} from API...`);
          
          // Try to get at least PAGE_SIZE (10) records by expanding date range
          const MIN_RECORDS = PAGE_SIZE;
          let apiIncidents = [];
          let daysUsed = 30;
          const dateRanges = [30, 90, 180, 365]; // Try progressively longer ranges
          
          for (const days of dateRanges) {
            apiIncidents = await fetchIncidentsFromAPI({
              zip,
              limit: 1000,
              days: days
            });

            console.log(`Fetched ${apiIncidents.length} incidents from API for ZIP ${zip} (${days} days)`);
            
            daysUsed = days;
            
            // If we have at least MIN_RECORDS, stop searching
            if (apiIncidents.length >= MIN_RECORDS) {
              console.log(`Found ${apiIncidents.length} incidents (>= ${MIN_RECORDS}), stopping search`);
              break;
            }
            
            // If this is the last range and still no results, try without date limit
            if (days === dateRanges[dateRanges.length - 1] && apiIncidents.length === 0) {
              console.log(`No incidents found in last ${days} days, trying all historical data for ZIP ${zip}...`);
              
              // Try without date limit to get historical data
              apiIncidents = await fetchIncidentsFromAPI({
                zip,
                limit: 1000,
                days: 3650 // 10 years as a large number, but API will return all available
              });
              
              console.log(`Fetched ${apiIncidents.length} incidents from API for ZIP ${zip} (all history)`);
              daysUsed = 3650; // Mark as using all history
              break;
            }
            
            // If this is the last range and we have some results, use them
            if (days === dateRanges[dateRanges.length - 1] && apiIncidents.length > 0) {
              console.log(`Reached maximum date range (${days} days), using ${apiIncidents.length} incidents found`);
              break;
            }
            
            // Otherwise, try next range
            console.log(`Only found ${apiIncidents.length} incidents (< ${MIN_RECORDS}), trying ${dateRanges[dateRanges.indexOf(days) + 1]} days...`);
          }

          // Save to database for future queries
          // Need to fetch raw API data for saveIncidents (which expects original API format)
          if (apiIncidents.length > 0) {
            // Re-fetch raw data from API for saving
            // Use same date range as the successful API fetch
            const daysToUse = daysUsed;
            const baseUrl = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";
            const params = new URLSearchParams();
            
            // Build where clause - if daysUsed >= 3650, don't use date filter
            if (daysToUse >= 3650) {
              params.append("$where", `incident_zip = '${zip}'`);
            } else {
              const startDate = new Date();
              startDate.setDate(startDate.getDate() - daysToUse);
              startDate.setHours(0, 0, 0, 0);
              const dateStr = startDate.toISOString().split('.')[0];
              params.append("$where", `created_date >= '${dateStr}' AND incident_zip = '${zip}'`);
            }
            
            params.append("$limit", "1000");
            params.append("$order", "created_date DESC");
            
            const apiUrl = `${baseUrl}?${params.toString()}`;
            
            const rawResponse = await axios.get(apiUrl, {
              timeout: 30000,
              headers: { "Accept": "application/json" }
            });
            
            const rawIncidents = Array.isArray(rawResponse.data) ? rawResponse.data : [];
            console.log(`Raw API returned ${rawIncidents.length} incidents for ZIP ${zip}`);
            
            if (rawIncidents.length > 0) {
              await saveIncidents(rawIncidents);
              console.log(`Saved ${rawIncidents.length} incidents to database for ZIP ${zip}`);
            }
          }

          // Now query from DB again with the newly saved data
          const refreshedIncidents = await getIncidentsWithFilters({
            zip,
            skip,
            limit: PAGE_SIZE + 1,
            status,
            complaintType,
            agency,
            sort
          });

          console.log(`After save, found ${refreshedIncidents.length} incidents in DB for ZIP ${zip}`);

          hasNextPage = refreshedIncidents.length > PAGE_SIZE;
          incidents = refreshedIncidents.slice(0, PAGE_SIZE);
          autoFetched = true;
        } catch (err) {
          console.error("Auto-fetch error:", err);
          // Continue with empty results if API fetch fails
        }
      }
    }
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
    sort,
    useAPI: useAPI === "true",
    autoFetched
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

// Data ingestion endpoint: Fetch incidents from NYC 311 API and save to DB
// This is a separate, explicit step to avoid side effects in GET /feed
router.post("/api/ingest", async (req, res) => {
  try {
    const { zip, limit = 1000, days = 30 } = req.body;

    // Validate ZIP if provided
    if (zip && !/^\d{5}$/.test(zip)) {
      return res.status(400).json({ 
        ok: false, 
        error: "Please provide a valid 5-digit ZIP code." 
      });
    }

    // Calculate date range (last N days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));
    startDate.setHours(0, 0, 0, 0);
    
    // Format date for Socrata API (YYYY-MM-DDTHH:mm:ss format)
    const dateStr = startDate.toISOString().split('.')[0]; // Remove milliseconds

    // Build Socrata API query
    // NYC 311 API endpoint: https://data.cityofnewyork.us/resource/erm2-nwe9.json
    const baseUrl = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";
    const params = new URLSearchParams();
    
    // Build $where clause for date range and optional ZIP
    // Socrata uses SoQL syntax for date comparisons
    let whereClause = `created_date >= '${dateStr}'`;
    if (zip) {
      whereClause += ` AND incident_zip = '${zip}'`;
    }
    params.append("$where", whereClause);
    params.append("$limit", String(Math.min(Number(limit), 5000))); // Cap at 5000
    params.append("$order", "created_date DESC");

    const apiUrl = `${baseUrl}?${params.toString()}`;

    // Fetch data from NYC 311 API
    const response = await axios.get(apiUrl, {
      timeout: 30000, // 30 second timeout
      headers: {
        "Accept": "application/json"
      }
    });

    const rawIncidents = Array.isArray(response.data) ? response.data : [];

    if (rawIncidents.length === 0) {
      return res.json({ 
        ok: true, 
        message: "No incidents found for the specified criteria.",
        saved: 0 
      });
    }

    // Save incidents to database
    await saveIncidents(rawIncidents);

    return res.json({ 
      ok: true, 
      message: `Successfully ingested ${rawIncidents.length} incident(s).`,
      saved: rawIncidents.length,
      zip: zip || "all"
    });

  } catch (err) {
    console.error("API INGEST ERROR:", err);
    
    // Handle specific error cases
    if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
      return res.status(504).json({ 
        ok: false, 
        error: "Request to NYC 311 API timed out. Please try again with a smaller date range or limit." 
      });
    }
    
    if (err.response) {
      return res.status(502).json({ 
        ok: false, 
        error: `NYC 311 API returned an error: ${err.response.status} ${err.response.statusText}` 
      });
    }

    return res.status(500).json({ 
      ok: false, 
      error: "Failed to ingest data from NYC 311 API." 
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

// Trends page - Simple Trends feature
router.get("/trends", async (req, res) => {
  try {
    const user = req.session.user || null;
    const { type = "comments", period = "all" } = req.query;
    
    // Validate parameters
    const validTypes = ["comments", "likes", "dislikes"];
    const validPeriods = ["day", "week", "month", "all"];
    
    if (!validTypes.includes(type) || !validPeriods.includes(period)) {
      return res.status(400).render("home", {
        title: "Invalid Parameters",
        error: "Invalid trend type or period.",
        user
      });
    }
    
    // Get trending incidents
    const trending = await comments.getTrendingIncidents({
      type,
      period,
      limit: 10
    });
    
    // Fetch incident details for trending incidents
    const incidentsWithDetails = await Promise.all(
      trending.map(async (item) => {
        const incident = await getIncidentById(item.incidentId);
        return {
          ...item,
          incident
        };
      })
    );
    
    // Filter out incidents that don't exist
    const validIncidents = incidentsWithDetails.filter(item => item.incident !== null);
    
    return res.render("trends", {
      title: "Trending Incidents",
      user,
      type,
      period,
      trends: validIncidents,
      periodLabels: {
        day: "Last 24 Hours",
        week: "Last Week",
        month: "Last Month",
        all: "All Time"
      },
      typeLabels: {
        comments: "Most Commented",
        likes: "Most Liked",
        dislikes: "Most Disliked"
      }
    });
  } catch (err) {
    console.error("TRENDS ERROR:", err);
    console.error("TRENDS ERROR STACK:", err.stack);
    return res.status(500).render("trends", {
      title: "Error",
      user: req.session.user || null,
      type: req.query.type || "comments",
      period: req.query.period || "all",
      trends: [],
      error: "Failed to load trends. Please try again.",
      periodLabels: {
        day: "Last 24 Hours",
        week: "Last Week",
        month: "Last Month",
        all: "All Time"
      },
      typeLabels: {
        comments: "Most Commented",
        likes: "Most Liked",
        dislikes: "Most Disliked"
      }
    });
  }
});

router.use((req, res) => {
  res.status(404).render("home", { title: "Not Found", error: "Page not found." });
});

export default router;