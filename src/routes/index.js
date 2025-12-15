import { Router } from "express";
import authRoutes from "./auth.js";
import axios from "axios";
import { saveIncidents, getIncidentsByZip, getIncidentById, getIncidentsWithFilters, fetchIncidentsFromAPI } from "../data/incidents.js";
import * as comments from "../data/comments.js";
import { validateCommentContent } from "../middleware/validation.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/", (req, res) => {
  const user = req.session.user || null;
  res.render("home", { title: "Home", user });
});

router.get("/admin", requireAdmin, (req, res) => {
  const user = req.session.user || null;
  res.render("admin-dashboard", { 
    title: "Admin Dashboard", 
    user,
    adminPage: true
  });
});

router.get("/admin/ingest", requireAdmin, (req, res) => {
  const user = req.session.user || null;
  res.render("admin", { 
    title: "Data Ingestion", 
    user,
    adminPage: true,
    scripts: '<script src="/public/js/admin.js"></script>'
  });
});

router.get("/admin/moderation", requireAdmin, (req, res) => {
  const user = req.session.user || null;
  res.render("admin-moderation", { 
    title: "Comment Moderation", 
    user,
    adminPage: true,
    scripts: '<script src="/public/js/moderation.js"></script>'
  });
});

router.get("/api/moderation/comments", requireAdmin, async (req, res) => {
  try {
    const status = req.query.status || null;
    const hasReports = req.query.hasReports === "true" ? true : req.query.hasReports === "false" ? false : null;
    const limit = Number(req.query.limit) || 50;
    const skip = Number(req.query.skip) || 0;
    
    const commentsList = await comments.getCommentsForModeration({
      status,
      hasReports,
      limit,
      skip
    });
    
    const commentsWithIncidents = await Promise.all(
      commentsList.map(async (comment) => {
        const incident = await getIncidentById(comment.incidentId).catch(() => null);
        return {
          ...comment,
          incident
        };
      })
    );
    
    res.json({
      ok: true,
      comments: commentsWithIncidents
    });
  } catch (err) {
    console.error("Error:", err);
    res.status(500).json({
      ok: false,
      error: err.message || "Error fetching comments"
    });
  }
});

router.post("/api/moderation/comment/:commentId/approve", requireAdmin, async (req, res) => {
  try {
    const result = await comments.moderateComment(req.params.commentId, "approve", req.session.user.id);
    res.json({ ok: true, comment: result });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/api/moderation/comment/:commentId/reject", requireAdmin, async (req, res) => {
  try {
    const result = await comments.moderateComment(req.params.commentId, "reject", req.session.user.id);
    res.json({ ok: true, comment: result });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.post("/api/moderation/comment/:commentId/delete", requireAdmin, async (req, res) => {
  try {
    await comments.moderateComment(req.params.commentId, "delete", req.session.user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ ok: false, error: err.message });
  }
});

router.use("/auth", authRoutes);

router.get("/feed", async (req, res) => {
  const user = req.session.user || null;
  const {
    zip,
    status,
    complaintType,
    agency,
    sort,
    useAPI
  } = req.query;

  const page = Number(req.query.page) || 1;

  let incidents = [];
  let hasNextPage = false;
  let autoFetched = false;

  if (zip) {
    const PAGE_SIZE = 10;
    const skip = (page - 1) * PAGE_SIZE;

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

      if (incidents.length === 0 && !status && !complaintType && !agency && page === 1) {
        try {
          const MIN_RECORDS = PAGE_SIZE;
          let apiIncidents = [];
          let daysUsed = 30;
          const dateRanges = [30, 90, 180, 365];
          
          for (const days of dateRanges) {
            apiIncidents = await fetchIncidentsFromAPI({
              zip,
              limit: 1000,
              days: days
            });

            daysUsed = days;
            
            if (apiIncidents.length >= MIN_RECORDS) {
              break;
            }
            
            if (days === dateRanges[dateRanges.length - 1] && apiIncidents.length === 0) {
              apiIncidents = await fetchIncidentsFromAPI({
                zip,
                limit: 1000,
                days: 3650
              });
              
              daysUsed = 3650;
              break;
            }
            
            if (days === dateRanges[dateRanges.length - 1] && apiIncidents.length > 0) {
              break;
            }
          }

          if (apiIncidents.length > 0) {
            const daysToUse = daysUsed;
            const baseUrl = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";
            const params = new URLSearchParams();
            
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
            
            if (rawIncidents.length > 0) {
              await saveIncidents(rawIncidents);
            }
          }

          const refreshedIncidents = await getIncidentsWithFilters({
            zip,
            skip,
            limit: PAGE_SIZE + 1,
            status,
            complaintType,
            agency,
            sort
          });

          hasNextPage = refreshedIncidents.length > PAGE_SIZE;
          incidents = refreshedIncidents.slice(0, PAGE_SIZE);
          autoFetched = true;
        } catch (err) {
          console.error("Auto-fetch error:", err);
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

router.post("/feed", async (req, res) => {
  const { zip } = req.body;

  if (!zip || !/^\d{5}$/.test(zip)) {
    return res.status(400).render("home", {
      title: "Neighborhood Feed",
      error: "Please enter a valid 5-digit ZIP code."
    });
  }

  return res.redirect(`/feed?zip=${zip}&page=1`);
});

router.post("/api/ingest", requireAdmin, async (req, res) => {
  try {
    const { zip, limit = 1000, days = 30 } = req.body;

    if (zip && !/^\d{5}$/.test(zip)) {
      return res.status(400).json({ 
        ok: false, 
        error: "Please provide a valid 5-digit ZIP code." 
      });
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));
    startDate.setHours(0, 0, 0, 0);
    
    const dateStr = startDate.toISOString().split('.')[0];

    const baseUrl = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";
    const params = new URLSearchParams();
    
    let whereClause = `created_date >= '${dateStr}'`;
    if (zip) {
      whereClause += ` AND incident_zip = '${zip}'`;
    }
    params.append("$where", whereClause);
    params.append("$limit", String(Math.min(Number(limit), 5000)));
    params.append("$order", "created_date DESC");

    const apiUrl = `${baseUrl}?${params.toString()}`;

    const response = await axios.get(apiUrl, {
      timeout: 30000,
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

    await saveIncidents(rawIncidents);

    return res.json({ 
      ok: true, 
      message: `Successfully ingested ${rawIncidents.length} incident(s).`,
      saved: rawIncidents.length,
      zip: zip || "all"
    });

  } catch (err) {
    console.error("API INGEST ERROR:", err);
    
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

    const zip = req.query.zip || null;
    const page = Number(req.query.page) || 1;

    const commentsList = await comments.getCommentsByIncident(id);

    return res.render("incident", {
      title: "Incident Details",
      incident,
      comments: commentsList,
      user,
      zip,
      page,
      error: req.query.error || null
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

    try {
      validateCommentContent(content);
    } catch (validationError) {
      const query = new URLSearchParams();
      if (bodyZip) query.append("zip", bodyZip);
      if (bodyPage) query.append("page", bodyPage);
      return res.redirect(`/incident/${id}?${query.toString()}&error=${encodeURIComponent(validationError.message)}`);
    }

    await comments.createComment(
      id,
      user.id,
      user.username,
      content
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

router.get("/trends", async (req, res) => {
  try {
    const user = req.session.user || null;
    const { type = "comments", period = "all" } = req.query;
    
    const validTypes = ["comments", "likes", "dislikes"];
    const validPeriods = ["day", "week", "month", "all"];
    
    if (!validTypes.includes(type) || !validPeriods.includes(period)) {
      return res.status(400).render("home", {
        title: "Invalid Parameters",
        error: "Invalid trend type or period.",
        user
      });
    }
    
    const trending = await comments.getTrendingIncidents({
      type,
      period,
      limit: 10
    });
    
    const incidentsWithDetails = await Promise.all(
      trending.map(async (item) => {
        const incident = await getIncidentById(item.incidentId);
        return {
          ...item,
          incident
        };
      })
    );
    
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