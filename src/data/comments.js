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
    status: "approved",
    likes: [],
    dislikes: [],
    reports: []
  };
  await col.insertOne(comment);
}

export async function getCommentsByIncident(incidentId) {
  const db = getDB();
  const col = db.collection("comments");

  const comments = await col
    .find({ 
      incidentId: String(incidentId),
      status: "approved"
    })
    .sort({ createdAt: -1 })
    .toArray();
  
  return comments.map(comment => ({
    ...comment,
    likes: comment.likes || [],
    dislikes: comment.dislikes || [],
    reports: comment.reports || []
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
    commentIdObj = new ObjectId(String(commentId));
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

  const result = await col.findOneAndUpdate({_id: commentIdObj}, {$set: {likes, dislikes}}, { returnDocument: "after" });
  
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
    { 
      $match: {
        ...matchStage,
        status: "approved"
      }
    }
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

export async function reportComment(commentId, userId, reason) {
  if (!commentId || !userId || !reason) {
    throw new Error("Comment ID, user ID, and reason are required.");
  }
  
  const db = getDB();
  const col = db.collection("comments");
  
  userId = String(userId);
  let commentIdObj;
  try {
    commentIdObj = new ObjectId(String(commentId));
  } catch (e) {
    throw new Error("Invalid comment ID format.");
  }
  
  const comment = await col.findOne({ _id: commentIdObj });
  if (!comment) {
    throw new Error("Comment not found.");
  }
  
  const reports = comment.reports || [];
  const existingReport = reports.find(r => r.userId === userId);
  
  if (existingReport) {
    throw new Error("You have already reported this comment.");
  }
  
  const reportEntry = {
    userId: userId,
    reason: String(reason).trim(),
    createdAt: new Date()
  };
  
  const result = await col.findOneAndUpdate(
    { _id: commentIdObj },
    { 
      $push: { reports: reportEntry }
    },
    { returnDocument: "after" }
  );
  
  return result;
}

export async function getCommentsForModeration({ 
  status = null, 
  hasReports = null,
  limit = 50,
  skip = 0
} = {}) {
  const db = getDB();
  const col = db.collection("comments");
  
  const query = {};
  
  if (status) {
    query.status = status;
  }
  
  if (hasReports === true) {
    query.reports = { $exists: true, $ne: [] };
  } else if (hasReports === false) {
    query.$or = [
      { reports: { $exists: false } },
      { reports: { $size: 0 } }
    ];
  }
  
  const comments = await col
    .find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  
  return comments.map(comment => ({
    ...comment,
    likes: comment.likes || [],
    dislikes: comment.dislikes || [],
    reports: comment.reports || [],
    status: comment.status || "approved"
  }));
}

export async function moderateComment(commentId, action, adminId) {
  if (!commentId || !action || !adminId) {
    throw new Error("Missing required parameters");
  }
  
  const db = getDB();
  const col = db.collection("comments");
  
  let commentIdObj;
  try {
    commentIdObj = new ObjectId(String(commentId));
  } catch (e) {
    throw new Error("Invalid comment ID");
  }
  
  const comment = await col.findOne({ _id: commentIdObj });
  if (!comment) {
    throw new Error("Comment not found");
  }
  
  if (action === "delete") {
    await col.deleteOne({ _id: commentIdObj });
    return { deleted: true };
  }
  
  let newStatus = "approved";
  if (action === "reject") {
    newStatus = "rejected";
  }
  
  const result = await col.findOneAndUpdate(
    { _id: commentIdObj },
    { 
      $set: { 
        status: newStatus,
        moderatedAt: new Date(),
        moderatedBy: String(adminId)
      } 
    },
    { returnDocument: "after" }
  );
  
  return {
    ...result,
    likes: result.likes || [],
    dislikes: result.dislikes || [],
    reports: result.reports || []
  };
}