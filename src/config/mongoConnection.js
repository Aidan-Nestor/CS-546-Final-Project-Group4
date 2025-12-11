import { MongoClient } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

const uri = process.env.MONGODB_URI;
const dbName = process.env.DB_NAME;

let _client;
let _db;

export const connectDB = async () => {
  if (_db) return _db;
  _client = new MongoClient(uri);
  await _client.connect();
  _db = _client.db(dbName);

  const users = _db.collection("users");
  await users.createIndex({ emailLower: 1 }, { unique: true });
  await users.createIndex({ usernameLower: 1 }, { unique: true });

  return _db;
};

export const getDB = () => {
  if (!_db) throw new Error("DB not initialized. Call connectDB() first.");
  return _db;
};
