import { getDB } from "../config/mongoConnection.js";
import { ObjectId } from "mongodb";


// Explicit named exports
export async function createComment(incidentId, userId, username, content) {
  const db = getDB();
  const col = db.collection("comments");

  const comment = {
    incidentId: String(incidentId),
    userId: String(userId),
    username,
    content,
    createdAt: new Date(),
    likes: [],
    dislikes: []
  };
  await col.insertOne(comment);
}

export async function getCommentsByIncident(incidentId) {
  const db = getDB();
  const col = db.collection("comments");

  const comments = await col
    .find({ incidentId: String(incidentId) })
    .sort({ createdAt: -1 })
    .toArray();
  
  // Ensure all comments have likes and dislikes arrays
  return comments.map(comment => ({
    ...comment,
    likes: comment.likes || [],
    dislikes: comment.dislikes || []
  }));
}

export async function voteComment(commentId, userId, voteType){
  const db = getDB();
  const col = db.collection("comments");
  
  userId = String(userId);
  const comment = await col.findOne({_id: new ObjectId(commentId)});
  if (!comment) throw `Comment not found.`;
  let likes = comment.likes || [];
  let dislikes = comment.dislikes || [];
  if(voteType==="like"){
    if(likes.includes(userId)){
      likes = likes.filter(id=>id!==userId);
    } else{
      likes.push(userId);
      dislikes = dislikes.filter(id=>id!==userId)
    }
  } else if(voteType==="dislike"){
    if(dislikes.includes(userId)){
      dislikes = dislikes.filter(id=>id!==userId);
    } else{
      dislikes.push(userId);
      likes = likes.filter(id=>id!==userId)
    }
  }

  const result = await col.findOneAndUpdate({_id: new ObjectId(commentId)}, {$set: {likes, dislikes}}, { returnDocument: "after" });
  
  return result;
}

// Get trending incidents based on comments, likes, or dislikes
export async function getTrendingIncidents({ 
  type = "comments", // "comments", "likes", "dislikes"
  period = "all", // "day", "week", "month", "all"
  limit = 10 
}) {
  const db = getDB();
  const col = db.collection("comments");
  
  // Calculate date range
  let startDate = null;
  if (period !== "all") {
    const now = new Date();
    startDate = new Date();
    if (period === "day") {
      startDate.setDate(now.getDate() - 1);
    } else if (period === "week") {
      startDate.setDate(now.getDate() - 7);
    } else if (period === "month") {
      startDate.setDate(now.getDate() - 30);
    }
    startDate.setHours(0, 0, 0, 0);
  }
  
  // Build match stage for date filter
  const matchStage = startDate 
    ? { createdAt: { $gte: startDate } }
    : {};
  
  // Aggregate based on type
  let groupField;
  let projectStage = null;
  
  if (type === "comments") {
    // Count comments per incident
    groupField = { $sum: 1 };
  } else if (type === "likes") {
    // Sum likes per incident - ensure likes is always an array
    projectStage = {
      $project: {
        incidentId: 1,
        createdAt: 1,
        likes: { $ifNull: ["$likes", []] }
      }
    };
    groupField = { $sum: { $size: "$likes" } };
  } else if (type === "dislikes") {
    // Sum dislikes per incident - ensure dislikes is always an array
    projectStage = {
      $project: {
        incidentId: 1,
        createdAt: 1,
        dislikes: { $ifNull: ["$dislikes", []] }
      }
    };
    groupField = { $sum: { $size: "$dislikes" } };
  }
  
  const pipeline = [
    { $match: matchStage }
  ];
  
  // Add project stage if needed (for likes/dislikes)
  if (projectStage) {
    pipeline.push(projectStage);
  }
  
  pipeline.push(
    {
      $group: {
        _id: "$incidentId",
        count: groupField,
        // Also get comment details for reference
        latestComment: { $max: "$createdAt" }
      }
    },
    { $sort: { count: -1 } },
    { $limit: limit }
  );
  
  const results = await col.aggregate(pipeline).toArray();
  
  return results.map(r => ({
    incidentId: r._id,
    count: r.count,
    latestComment: r.latestComment
  }));
}