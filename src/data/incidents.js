import { getDB } from "../config/mongoConnection.js";

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
            incidentZip: i.incident_zip || null,
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

// Read recent incidents by ZIP from MongoDB
export const getIncidentsByZip = async (zip, skip = 0, limit = 50) => {
    const col = await getIncidentsCollection();
    return col
        .find({ incidentZip: zip })
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

    const query = {
        incidentZip: zip,
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