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

  return col
    .find({ incidentId: String(incidentId) })
    .sort({ createdAt: -1 })
    .toArray();
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