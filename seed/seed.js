import dotenv from "dotenv";
dotenv.config();

import { connectDB, getDB } from "../src/config/mongoConnection.js";
import { createUser } from "../src/data/users.js";

const main = async () => {
  await connectDB();
  const db = getDB();
  await db.dropDatabase();

  console.log("Seeding users.");
  await createUser({
    email: "demo@example.com",
    username: "demoUser",
    password: "DemoPass123",
    firstName: "Demo",
    lastName: "User",
    zip: "11213",
    borough: "BROOKLYN"
  });

  console.log("Seed done.");
  process.exit(0);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
