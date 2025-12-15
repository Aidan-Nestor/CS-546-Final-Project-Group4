import dotenv from "dotenv";
dotenv.config();

import { connectDB, getDB } from "../src/config/mongoConnection.js";
import { createUser } from "../src/data/users.js";

const main = async () => {
  console.log("Starting seed...");

  // connect and wipe database
  await connectDB();
  const db = getDB();
  await db.dropDatabase();

  // create regular user
  console.log("Creating demo user...");
  const demoUser = await createUser({
    email: "demo@example.com",
    username: "demoUser",
    password: "DemoPass123!",
    firstName: "Demo",
    lastName: "User",
    zip: "11213",
    borough: "BROOKLYN"
  });

  // create admin user
  console.log("Creating admin user...");
  const adminUser = await createUser({
    email: "admin@example.com",
    username: "adminUser",
    password: "AdminPass123!",
    firstName: "Admin",
    lastName: "User",
    zip: "10001",
    borough: "MANHATTAN"
  });

  // promote admin
  await db.collection("users").updateOne(
    { _id: adminUser._id },
    { $set: { role: "admin" } }
  );

  console.log("\nSeed complete!\n");

  console.log("Login credentials:");
  console.log("Regular user:");
  console.log("  username: demoUser");
  console.log("  email: demo@example.com");
  console.log("  password: DemoPass123!\n");

  console.log("Admin user:");
  console.log("  username: adminUser");
  console.log("  email: admin@example.com");
  console.log("  password: AdminPass123!\n");

  process.exit(0);
};

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
