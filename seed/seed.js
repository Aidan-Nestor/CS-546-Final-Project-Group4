import dotenv from "dotenv";
dotenv.config();
//updated seed for testing
import { connectDB, getDB } from "../src/config/mongoConnection.js";
import { createUser } from "../src/data/users.js";

const main = async () => {
  await connectDB();
  const db = getDB();
  await db.dropDatabase();

  console.log("Seeding demo user...");
  const demo = await createUser({
    email: "demo@example.com",
    username: "demoUser",
    password: "DemoPass123!",
    firstName: "Demo",
    lastName: "User",
    zip: "11213",
    borough: "BROOKLYN"
  });

  console.log("Seeding admin user...");
  const admin = await createUser({
    email: "admin@example.com",
    username: "adminUser",
    password: "AdminPass123!",
    firstName: "Admin",
    lastName: "User",
    zip: "10001",
    borough: "MANHATTAN"
  });

  await db.collection("users").updateOne(
    { _id: admin._id },
    { $set: { role: "admin" } }
  );

  console.log("\nSeed complete!");
  console.log("Demo login:");
  console.log(" username/email:", demo.username, "/ demo@example.com");
  console.log(" password: DemoPass123!");
  console.log("\nAdmin login:");
  console.log(" username/email:", "adminUser / admin@example.com");
  console.log(" password: AdminPass123!");
  console.log("");

  process.exit(0);
};

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
