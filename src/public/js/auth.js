console.log("auth.js loaded");

const qs = (s) => document.querySelector(s);

const showMsg = (el, text, ok = false) => {
  if (!el) return;
  el.textContent = text;
  el.className = "form-msg" + (ok ? " ok" : " error");
};

const postJSON = async (url, data) => {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const js = await res.json().catch(() => ({}));
  if (!res.ok || !js.ok) {
    throw new Error(js.error || "Request failed.");
  }
  return js;
};

const attachLogin = () => {
  const form = qs("#loginForm");
  const msg = qs("#loginMsg");
  if (!form) return; // not on login page
  console.log("login handler attached");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const identifier = qs("#identifier").value.trim();
    const password = qs("#password").value;
    if (!identifier || !password) {
      showMsg(msg, "Please fill in all fields.");
      return;
    }
    try {
      showMsg(msg, "Signing in...");
      const out = await postJSON("/auth/login", { identifier, password });
      showMsg(msg, "Success! Redirecting...", true);
      window.location.href = out.redirect || "/";
    } catch (err) {
      showMsg(msg, err.message);
    }
  });
};

const attachRegister = () => {
  const form = qs("#registerForm");
  const msg = qs("#registerMsg");
  if (!form) return; // not on register page
  console.log("register handler attached");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = qs("#email").value.trim();
    const username = qs("#username").value.trim();
    const password = qs("#regPassword").value;

    if (!email || !username || !password) {
      showMsg(msg, "Email, username, and password are required.");
      return;
    }
    if (username.length < 3 || username.length > 20) {
      showMsg(msg, "Username must be 3-20 characters.");
      return;
    }
    if (password.length < 8) {
      showMsg(msg, "Password must be at least 8 characters.");
      return;
    }

    try {
      showMsg(msg, "Creating your account...");
      const out = await postJSON("/auth/register", { email, username, password });
      showMsg(msg, "Account created! Redirecting...", true);
      window.location.href = out.redirect || "/";
    } catch (err) {
      showMsg(msg, err.message);
    }
  });
};

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOMContentLoaded");
  attachLogin();
  attachRegister();
});
