import { Router } from "express";
import authRoutes from "./auth.js";

const router = Router();

router.get("/", (req, res) => {
  const user = req.session.user || null;
  res.render("home", { title: "Home", user });
});

router.use("/auth", authRoutes);

router.use((req, res) => {
  res.status(404).render("home", { title: "Not Found", error: "Page not found." });
});

export default router;
