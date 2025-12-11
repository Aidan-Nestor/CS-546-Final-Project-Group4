import { Router } from "express";
import {
  validateEmail,
  validateUsername,
  validatePassword,
  isNonEmptyString
} from "../middleware/validation.js";
import {
  createUser,
  verifyLogin,
  recordLoginFailure,
  recordLoginSuccess
} from "../data/users.js";

const router = Router();

router.get("/login", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("auth/login", { title: "Login" });
});

router.get("/register", (req, res) => {
  if (req.session.user) return res.redirect("/");
  res.render("auth/register", { title: "Register" });
});

router.post("/register", async (req, res) => {
  try {
    const { email, username, password, firstName, lastName, zip, borough } = req.body;

    validateEmail(email);
    validateUsername(username);
    validatePassword(password);

    const user = await createUser({
      email,
      username,
      password,
      firstName,
      lastName,
      zip,
      borough
    });

    req.session.user = {
      id: user._id,
      username: user.username,
      email: user.email,
      role: "user"
    };
    return res.json({ ok: true, redirect: "/" });
  } catch (e) {
    if (e?.code === 11000) {
      return res
        .status(400)
        .json({ ok: false, error: "Email or username already exists (case-insensitive)." });
    }
    return res.status(400).json({ ok: false, error: e.message || "Registration failed." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!isNonEmptyString(identifier) || !isNonEmptyString(password)) {
      return res.status(400).json({ ok: false, error: "Identifier and password are required." });
    }
    const result = await verifyLogin({ identifier, password });
    if (!result.ok) {
      if (result.user?._id) await recordLoginFailure(result.user._id);
      return res.status(400).json({ ok: false, error: result.reason });
    }
    await recordLoginSuccess(result.user._id);
    req.session.user = {
      id: result.user._id,
      username: result.user.username,
      email: result.user.email,
      role: result.user.role
    };
    return res.json({ ok: true, redirect: "/" });
  } catch (e) {
    return res.status(500).json({ ok: false, error: "Login failed." });
  }
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("nw_session");
    res.redirect("/auth/login");
  });
});

export default router;
