export const requireAdmin = (req, res, next) => {
  if (!req.session.user) {
    return res.status(403).redirect("/auth/login");
  }
  if (req.session.user.role !== "admin") {
    return res.status(403).redirect("/");
  }
  next();
};

