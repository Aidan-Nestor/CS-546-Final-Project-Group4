import express from "express";
import exphbs from "express-handlebars";
import session from "express-session";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

import { connectDB } from "./config/mongoConnection.js";
import { settings } from "./config/settings.js";
import routes from "./routes/index.js";

dotenv.config();
await connectDB();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  session({
    name: settings.sessionName,
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: settings.sessionMaxAgeMs, httpOnly: true }
  })
);

app.engine(
  "handlebars",
  exphbs.engine({
    defaultLayout: "main",
    helpers: {
      increment: (value) => Number(value) + 1,
      decrement: (value) => Number(value) - 1,
      gt: (a, b) => Number(a) > Number(b)
    }
  })
);
app.set("view engine", "handlebars");
app.set("views", path.join(__dirname, "views"));

app.use("/public", express.static(path.join(__dirname, "public")));

app.use("/", routes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Server running on http://localhost:${port}`);
});
