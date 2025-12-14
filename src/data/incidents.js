import { getDB } from "../config/mongoConnection.js";
import axios from "axios";

// Return the incidents collection and ensure a unique index on openDataId
const getIncidentsCollection = async () => {
    const db = getDB();
    const col = db.collection("incidents");
    await col.createIndex({ openDataId: 1 }, { unique: true });
    return col;
};

// Save NYC 311 incidents into MongoDB (duplicates are skipped via unique index)
export const saveIncidents = async (rawIncidents) => {
    const col = await getIncidentsCollection();

    const docs = rawIncidents
        .filter((i) => i && i.unique_key) // Keep only records with a unique_key
        .map((i) => ({
            openDataId: String(i.unique_key),
            complaintType: i.complaint_type || null,
            descriptor: i.descriptor || null,
            incidentZip: i.incident_zip ? String(i.incident_zip).padStart(5, '0') : null,
            agency: i.agency || null,
            status: i.status || null,
            createdDate: i.created_date ? new Date(i.created_date) : null,
            latitude: i.latitude != null ? Number(i.latitude) : null,
            longitude: i.longitude != null ? Number(i.longitude) : null,
            createdAt: new Date()
        }));

    if (docs.length === 0) return;

    try {
        await col.insertMany(docs, { ordered: false });
    } catch (e) {
        // Ignore duplicate key errors; other errors should still surface
        if (e?.code !== 11000) throw e;
    }
};

// Normalize ZIP code to 5-digit string with leading zeros
const normalizeZip = (zip) => {
    if (!zip) return null;
    const zipStr = String(zip).trim();
    return zipStr.padStart(5, '0');
};

// Read recent incidents by ZIP from MongoDB
export const getIncidentsByZip = async (zip, skip = 0, limit = 50) => {
    const col = await getIncidentsCollection();
    const normalizedZip = normalizeZip(zip);
    return col
        .find({ incidentZip: normalizedZip })
        .sort({ createdDate: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
};

// Read a single incident by openDataId
export const getIncidentById = async (id) => {
    const col = await getIncidentsCollection();
    return col.findOne({ openDataId: String(id) });
};

// Filters
export async function getIncidentsWithFilters({
    zip,
    skip = 0,
    limit = 10,
    status,
    complaintType,
    agency,
    sort = "newest"
}) {
    const db = getDB();
    const col = db.collection("incidents");

    const normalizedZip = normalizeZip(zip);
    const query = {
        incidentZip: normalizedZip,
        createdDate: { $ne: null }
    };

    if (status) {
        query.status = status;
    }

    if (complaintType) {
        query.complaintType = { $regex: complaintType, $options: "i" };
    }

    if (agency) {
        query.agency = { $regex: agency, $options: "i" };
    }

    const sortOption =
        sort === "oldest"
            ? { createdDate: 1 }
            : { createdDate: -1 };

    return col
        .find(query)
        .sort(sortOption)
        .skip(skip)
        .limit(limit)
        .toArray();
}

// Fetch incidents directly from NYC 311 API (no caching)
export async function fetchIncidentsFromAPI({
    zip,
    limit = 1000,
    days = 30,
    status,
    complaintType,
    agency,
    sort = "newest"
}) {
    try {
        // Calculate date range
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - Number(days));
        startDate.setHours(0, 0, 0, 0);
        const dateStr = startDate.toISOString().split('.')[0];

        // Build Socrata API query
        const baseUrl = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";
        const params = new URLSearchParams();
        
        // Build $where clause
        // If days is very large (like 3650), don't use date filter to get all history
        let whereClause = "";
        if (days < 3650) {
            whereClause = `created_date >= '${dateStr}'`;
        }
        if (zip) {
            if (whereClause) {
                whereClause += ` AND incident_zip = '${zip}'`;
            } else {
                whereClause = `incident_zip = '${zip}'`;
            }
        }
        if (status) {
            whereClause += ` AND status = '${status}'`;
        }
        if (complaintType) {
            whereClause += ` AND complaint_type LIKE '%${complaintType}%'`;
        }
        if (agency) {
            whereClause += ` AND agency LIKE '%${agency}%'`;
        }
        
        params.append("$where", whereClause);
        params.append("$limit", String(Math.min(Number(limit), 5000)));
        params.append("$order", sort === "oldest" ? "created_date ASC" : "created_date DESC");

        const apiUrl = `${baseUrl}?${params.toString()}`;

        const response = await axios.get(apiUrl, {
            timeout: 30000,
            headers: { "Accept": "application/json" }
        });

        const rawIncidents = Array.isArray(response.data) ? response.data : [];

        // Transform API data to match our database format
        return rawIncidents.map((i) => ({
            openDataId: String(i.unique_key),
            complaintType: i.complaint_type || null,
            descriptor: i.descriptor || null,
            incidentZip: i.incident_zip ? String(i.incident_zip).padStart(5, '0') : null,
            agency: i.agency || null,
            status: i.status || null,
            createdDate: i.created_date ? new Date(i.created_date) : null,
            latitude: i.latitude != null ? Number(i.latitude) : null,
            longitude: i.longitude != null ? Number(i.longitude) : null
        }));
    } catch (err) {
        console.error("API fetch error:", err);
        throw new Error("Failed to fetch data from NYC 311 API");
    }
}