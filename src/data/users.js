import { getDB } from "../config/mongoConnection.js";
import bcrypt from "bcryptjs";

const USERS_COLL = "users";
const SALT_ROUNDS = 12;

export const createUser = async ({
  email,
  username,
  password,
  firstName = "",
  lastName = "",
  zip = "",
  borough = ""
}) => {
  const db = getDB();
  const users = db.collection(USERS_COLL);

  const emailLower = email.toLowerCase();
  const usernameLower = username.toLowerCase();

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const doc = {
    email,
    emailLower,
    username,
    usernameLower,
    passwordHash,
    role: "user",
    status: "active",
    createdAt: new Date(),
    lastLoginAt: null,
    profile: {
      firstName,
      lastName,
      zip,
      borough,
      notifyOnReplies: true
    },
    authMeta: {
      failedLoginCount: 0,
      lockedUntil: null
    }
  };

  const res = await users.insertOne(doc);
  return {
    _id: res.insertedId,
    username: doc.username,
    email: doc.email,
    role: doc.role
  };
};

export const findUserByEmailOrUsername = async (identifier) => {
  const db = getDB();
  const users = db.collection(USERS_COLL);
  const idLower = identifier.toLowerCase();
  return users.findOne({
    $or: [{ emailLower: idLower }, { usernameLower: idLower }]
  });
};

export const verifyLogin = async ({ identifier, password }) => {
  const user = await findUserByEmailOrUsername(identifier);
  if (!user) return { ok: false, reason: "Invalid credentials." };

  if (
    user.authMeta?.lockedUntil &&
    new Date(user.authMeta.lockedUntil) > new Date()
  ) {
    return { ok: false, reason: "Account locked. Try again later." };
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  return { ok: matches, user, reason: matches ? null : "Invalid credentials." };
};

export const recordLoginSuccess = async (userId) => {
  const db = getDB();
  await db.collection(USERS_COLL).updateOne(
    { _id: userId },
    {
      $set: {
        lastLoginAt: new Date(),
        "authMeta.failedLoginCount": 0,
        "authMeta.lockedUntil": null
      }
    }
  );
};

export const recordLoginFailure = async (userId) => {
  const db = getDB();
  const u = await db
    .collection(USERS_COLL)
    .findOne({ _id: userId }, { projection: { authMeta: 1 } });

  const fails = (u?.authMeta?.failedLoginCount || 0) + 1;
  const lock =
    fails >= 5 ? new Date(Date.now() + 10 * 60 * 1000) : null; // 10 min

  await db.collection(USERS_COLL).updateOne(
    { _id: userId },
    {
      $set: {
        "authMeta.failedLoginCount": fails,
        "authMeta.lockedUntil": lock
      }
    }
  );
};
