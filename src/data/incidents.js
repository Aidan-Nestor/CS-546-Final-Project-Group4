import { getDB } from "../config/mongoConnection.js";
import axios from "axios";

const getIncidentsCollection = async () => {
    const db = getDB();
    const col = db.collection("incidents");
    await col.createIndex({ openDataId: 1 }, { unique: true });
    return col;
};

export const saveIncidents = async (rawIncidents) => {
    const col = await getIncidentsCollection();

    const docs = rawIncidents
        .filter((i) => i && i.unique_key)
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
        if (e?.code !== 11000) throw e;
    }
};

const normalizeZip = (zip) => {
    if (!zip) return null;
    const zipStr = String(zip).trim();
    return zipStr.padStart(5, '0');
};

export const getIncidentsByZip = async (zip, skip = 0, limit = 50) => {
    if (!zip) {
        throw new Error("ZIP code is required.");
    }
    if (!/^\d{5}$/.test(String(zip).trim())) {
        throw new Error("ZIP code must be 5 digits.");
    }
    
    const col = await getIncidentsCollection();
    const normalizedZip = normalizeZip(zip);
    if (!normalizedZip) {
        throw new Error("Invalid ZIP code format.");
    }
    
    return col
        .find({ incidentZip: normalizedZip })
        .sort({ createdDate: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
};

export const getIncidentById = async (id) => {
    const col = await getIncidentsCollection();
    return col.findOne({ openDataId: String(id) });
};

export async function getIncidentsWithFilters({
    zip,
    skip = 0,
    limit = 10,
    status,
    complaintType,
    agency,
    sort = "newest"
}) {
    if (!zip) {
        throw new Error("ZIP code is required.");
    }
    if (!/^\d{5}$/.test(String(zip).trim())) {
        throw new Error("ZIP code must be 5 digits.");
    }
    
    const db = getDB();
    const col = db.collection("incidents");

    const normalizedZip = normalizeZip(zip);
    if (!normalizedZip) {
        throw new Error("Invalid ZIP code format.");
    }
    
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

const escapeSoQLString = (str) => {
    if (!str) return str;
    return String(str).replace(/'/g, "''");
};

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
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - Number(days));
        startDate.setHours(0, 0, 0, 0);
        const dateStr = startDate.toISOString().split('.')[0];

        const baseUrl = "https://data.cityofnewyork.us/resource/erm2-nwe9.json";
        const params = new URLSearchParams();
        
        const conditions = [];
        
        if (days < 3650) {
            conditions.push(`created_date >= '${dateStr}'`);
        }
        if (zip) {
            const normalizedZip = normalizeZip(zip);
            conditions.push(`incident_zip = '${escapeSoQLString(normalizedZip)}'`);
        }
        if (status) {
            conditions.push(`status = '${escapeSoQLString(status)}'`);
        }
        if (complaintType) {
            conditions.push(`complaint_type LIKE '%${escapeSoQLString(complaintType)}%'`);
        }
        if (agency) {
            conditions.push(`agency LIKE '%${escapeSoQLString(agency)}%'`);
        }
        
        if (conditions.length > 0) {
            const whereClause = conditions.join(' AND ');
            params.append("$where", whereClause);
        }
        
        params.append("$limit", String(Math.min(Number(limit), 5000)));
        params.append("$order", sort === "oldest" ? "created_date ASC" : "created_date DESC");

        const apiUrl = `${baseUrl}?${params.toString()}`;

        const response = await axios.get(apiUrl, {
            timeout: 30000,
            headers: { "Accept": "application/json" }
        });

        const rawIncidents = Array.isArray(response.data) ? response.data : [];

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