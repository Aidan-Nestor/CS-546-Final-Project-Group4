import { getDB } from "../config/mongoConnection.js";

// Explicit named exports
export async function createComment(incidentId, userId, username, content) {
  const db = getDB();
  const col = db.collection("comments");

  const comment = {
    incidentId: String(incidentId),
    userId: String(userId),
    username,
    content,
    createdAt: new Date()
  };

  await col.insertOne(comment);
}

export async function getCommentsByIncident(incidentId) {
  const db = getDB();
  const col = db.collection("comments");

  return col
    .find({ incidentId: String(incidentId) })
    .sort({ createdAt: -1 })
    .toArray();
}