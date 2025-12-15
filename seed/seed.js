import dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { connectDB, getDB } from "../src/config/mongoConnection.js";
import { createUser } from "../src/data/users.js";

/**
 * Robust insert: tries multiple collection names so the seed still provides
 * test data even if your app uses slightly different naming.
 */
async function insertIntoAny(db, collectionNames, docs) {
  const results = [];
  for (const name of collectionNames) {
    try {
      const col = db.collection(name);
      if (Array.isArray(docs)) {
        await col.insertMany(docs, { ordered: false });
      } else {
        await col.insertOne(docs);
      }
      results.push(name);
    } catch (e) {
      //ignore duplicate key or schema mismatch issues per collection
    }
  }
  return results;
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

const main = async () => {
  //connect + wipe db
  await connectDB();
  const db = getDB();
  await db.dropDatabase();

  //seed users (2 normal + 1 admin)
  console.log("Seeding users...");

  const userA = await createUser({
    email: "demo@example.com",
    username: "demoUser",
    password: "DemoPass123!",
    firstName: "Demo",
    lastName: "User",
    zip: "11213",
    borough: "BROOKLYN"
  });

  const userB = await createUser({
    email: "tester@example.com",
    username: "testerUser",
    password: "TesterPass123!",
    firstName: "Test",
    lastName: "User",
    zip: "10001",
    borough: "MANHATTAN"
  });

  const admin = await createUser({
    email: "admin@example.com",
    username: "adminUser",
    password: "AdminPass123!",
    firstName: "Admin",
    lastName: "User",
    zip: "11101",
    borough: "QUEENS"
  });

  //promote admin
  await db.collection("users").updateOne({ _id: admin._id }, { $set: { role: "admin" } });

  //3) seed incidents/cases (so feed/detail pages have deterministic data)
  //NOTE: We store a "unique_key" style ID (NYC 311 uses unique_key).
  //Even if you pull live from NYC Open Data, these help if your app caches/stores incidents.
  console.log("Seeding incidents/cases...");

  const incidents = [
    {
      _id: new ObjectId(),
      incidentId: "SEED-100001",
      unique_key: "SEED-100001",
      complaint_type: "Noise - Residential",
      descriptor: "Loud music after midnight",
      borough: "BROOKLYN",
      incident_zip: "11213",
      status: "Open",
      latitude: 40.6693,
      longitude: -73.9425,
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1)
    },
    {
      _id: new ObjectId(),
      incidentId: "SEED-100002",
      unique_key: "SEED-100002",
      complaint_type: "Illegal Parking",
      descriptor: "Vehicle blocking driveway",
      borough: "MANHATTAN",
      incident_zip: "10001",
      status: "Closed",
      latitude: 40.7506,
      longitude: -73.9972,
      createdAt: daysAgo(8),
      updatedAt: daysAgo(7)
    },
    {
      _id: new ObjectId(),
      incidentId: "SEED-100003",
      unique_key: "SEED-100003",
      complaint_type: "Street Condition",
      descriptor: "Pothole in roadway",
      borough: "QUEENS",
      incident_zip: "11101",
      status: "Open",
      latitude: 40.7447,
      longitude: -73.9485,
      createdAt: daysAgo(20),
      updatedAt: daysAgo(18)
    }
  ];

  //Try common collection names
  await insertIntoAny(db, ["incidents", "cases", "incidentCache", "cachedIncidents"], incidents);

  //seed comments (threads) + votes (likes/dislikes)
  console.log("Seeding comments + votes...");

  //Create comment docs with a schema that is commonly used:
  // - incidentId / unique_key to link to an incident
  // - userId + username to render
  // - likes/dislikes arrays to prevent spam and support toggling
  // - createdAt for trends/time windows
  const comments = [
    {
      _id: new ObjectId(),
      incidentId: "SEED-100001",
      unique_key: "SEED-100001",
      userId: userA._id,
      username: userA.username,
      content: "Happened again last night. Please address this.",
      likes: [userB._id], //tester liked it
      dislikes: [],
      createdAt: daysAgo(1)
    },
    {
      _id: new ObjectId(),
      incidentId: "SEED-100001",
      unique_key: "SEED-100001",
      userId: userB._id,
      username: userB.username,
      content: "I heard it too around 1AM.",
      likes: [],
      dislikes: [userA._id], //demo disliked it (for testing)
      createdAt: daysAgo(1)
    },
    {
      _id: new ObjectId(),
      incidentId: "SEED-100001",
      unique_key: "SEED-100001",
      userId: admin._id,
      username: "adminUser",
      content: "Admin note: keep comments respectful; reports will be reviewed.",
      likes: [userA._id, userB._id],
      dislikes: [],
      createdAt: daysAgo(1)
    },
    {
      _id: new ObjectId(),
      incidentId: "SEED-100002",
      unique_key: "SEED-100002",
      userId: userA._id,
      username: userA.username,
      content: "This driveway gets blocked constantly.",
      likes: [userB._id],
      dislikes: [],
      createdAt: daysAgo(8)
    },
    {
      _id: new ObjectId(),
      incidentId: "SEED-100002",
      unique_key: "SEED-100002",
      userId: userB._id,
      username: userB.username,
      content: "I saw a tow truck come by earlier.",
      likes: [],
      dislikes: [],
      createdAt: daysAgo(7)
    },
    {
      _id: new ObjectId(),
      incidentId: "SEED-100003",
      unique_key: "SEED-100003",
      userId: userA._id,
      username: userA.username,
      content: "Pothole is getting worse after the rain.",
      likes: [],
      dislikes: [],
      createdAt: daysAgo(20)
    },
    {
      _id: new ObjectId(),
      incidentId: "SEED-100003",
      unique_key: "SEED-100003",
      userId: userB._id,
      username: userB.username,
      content: "Almost damaged my tire here.",
      //vote toggle scenario: userA liked then later disliked (seed as disliked to test UI/logic)
      likes: [],
      dislikes: [userA._id],
      createdAt: daysAgo(18)
    },
    {
      _id: new ObjectId(),
      incidentId: "SEED-100003",
      unique_key: "SEED-100003",
      userId: admin._id,
      username: "adminUser",
      content: "Admin: reported to DOT; keep updates coming.",
      likes: [userA._id],
      dislikes: [],
      createdAt: daysAgo(18)
    }
  ];

  await insertIntoAny(db, ["comments", "incidentComments", "threads", "discussionComments"], comments);

  //seed reports (moderation)
  console.log("Seeding reports (moderation)...");

  const reports = [
    {
      _id: new ObjectId(),
      targetType: "comment",
      commentId: comments[1]._id, //second comment
      incidentId: "SEED-100001",
      reportedBy: userA._id,
      reason: "Unhelpful / misinformation",
      status: "open",
      createdAt: daysAgo(1)
    },
    {
      _id: new ObjectId(),
      targetType: "comment",
      commentId: comments[6]._id, //pothole comment
      incidentId: "SEED-100003",
      reportedBy: userB._id,
      reason: "Rude language",
      status: "open",
      createdAt: daysAgo(18)
    }
  ];

  await insertIntoAny(db, ["reports", "commentReports", "moderationReports"], reports);

  //print testing info 
  console.log("\nSeed complete!\n");

  console.log("Logins:");
  console.log("  demo user:  demoUser / demo@example.com  | DemoPass123!");
  console.log("  tester:     testerUser / tester@example.com | TesterPass123!");
  console.log("  admin:      adminUser / admin@example.com | AdminPass123!\n");

  console.log("Seeded Incident IDs (use these in your UI/search if needed):");
  console.log("  SEED-100001  (Noise - Residential, 11213)");
  console.log("  SEED-100002  (Illegal Parking, 10001)");
  console.log("  SEED-100003  (Street Condition, 11101)\n");

  console.log("Check demo......");
  console.log("  - feed by ZIP (11213 / 10001 / 11101)");
  console.log("  - incident detail -> comments thread");
  console.log("  - like/dislike toggles");
  console.log("  - report a comment");
  console.log("  - login as admin -> moderation/reports page\n");

  process.exit(0);
};

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
