import { getDB } from "../config/mongoConnection.js";
import { ObjectId } from "mongodb";
import { validateCommentContent } from "../middleware/validation.js";

export async function createComment(incidentId, userId, username, content) {
  if (!incidentId || !userId || !username) {
    throw new Error("Incident ID, user ID, and username are required.");
  }
  
  const validatedContent = validateCommentContent(content);
  
  const db = getDB();
  const col = db.collection("comments");

  const comment = {
    incidentId: String(incidentId),
    userId: String(userId),
    username: String(username).trim(),
    content: validatedContent,
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
  
  return comments.map(comment => ({
    ...comment,
    likes: comment.likes || [],
    dislikes: comment.dislikes || []
  }));
}

export async function voteComment(commentId, userId, voteType){
  if (!commentId || !userId) {
    throw new Error("Comment ID and user ID are required.");
  }
  if (!["like", "dislike"].includes(voteType)) {
    throw new Error("Vote type must be 'like' or 'dislike'.");
  }
  
  const db = getDB();
  const col = db.collection("comments");
  
  userId = String(userId);
  let commentIdObj;
  try {
    commentIdObj = new ObjectId(commentId);
  } catch (e) {
    throw new Error("Invalid comment ID format.");
  }
  
  const comment = await col.findOne({_id: commentIdObj});
  if (!comment) throw new Error("Comment not found.");
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

export async function getTrendingIncidents({ 
  type = "comments",
  period = "all",
  limit = 10 
}) {
  const db = getDB();
  const col = db.collection("comments");
  
  let startDate = null;
  if (period !== "all") {
    startDate = new Date();
    if (period === "day") {
      startDate.setDate(startDate.getDate() - 1);
    } else if (period === "week") {
      startDate.setDate(startDate.getDate() - 7);
    } else if (period === "month") {
      startDate.setDate(startDate.getDate() - 30);
    }
    startDate.setHours(0, 0, 0, 0);
  }
  
  const matchStage = startDate 
    ? { createdAt: { $gte: startDate } }
    : {};
  
  let groupField;
  let projectStage = null;
  
  if (type === "comments") {
    groupField = { $sum: 1 };
  } else if (type === "likes") {
    projectStage = {
      $project: {
        incidentId: 1,
        createdAt: 1,
        likes: { $ifNull: ["$likes", []] }
      }
    };
    groupField = { $sum: { $size: "$likes" } };
  } else if (type === "dislikes") {
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
  
  if (projectStage) {
    pipeline.push(projectStage);
  }
  
  pipeline.push(
    {
      $group: {
        _id: "$incidentId",
        count: groupField,
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