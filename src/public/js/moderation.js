document.addEventListener("DOMContentLoaded", () => {
  const filterForm = document.getElementById("moderationFilters");
  const loadingDiv = document.getElementById("moderationLoading");
  const errorDiv = document.getElementById("moderationError");
  const commentsDiv = document.getElementById("moderationComments");

  const loadComments = async () => {
    loadingDiv.style.display = "block";
    errorDiv.style.display = "none";
    commentsDiv.innerHTML = "";

    const status = document.getElementById("filter-status").value;
    const hasReports = document.getElementById("filter-reports").value;

    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (hasReports) params.append("hasReports", hasReports);

    try {
      const response = await fetch(`/api/moderation/comments?${params.toString()}`);
      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || "Failed to load comments");
      }

      if (data.comments.length === 0) {
        commentsDiv.innerHTML = "<p>No comments found.</p>";
        return;
      }

      data.comments.forEach(comment => {
        const div = document.createElement("div");
        div.className = "moderation-comment-item";
        const commentId = String(comment._id);
        div.id = `comment-${commentId}`;

        div.innerHTML = `
          <div class="mod-comment-header">
            <strong>${comment.username}</strong>
            <span class="mod-comment-date">${new Date(comment.createdAt).toLocaleString()}</span>
          </div>
          <div class="mod-comment-content">${comment.content}</div>
          <div class="mod-comment-meta">
            <span class="mod-status">Status: ${comment.status || "approved"}</span>
            <span class="mod-reports">Reports: ${comment.reports ? comment.reports.length : 0}</span>
            ${comment.incident ? `<span class="mod-incident">Incident: ${comment.incident.complaintType || "N/A"}</span>` : ""}
          </div>
          <div class="mod-comment-actions">
            <button class="mod-approve mod-btn" data-comment-id="${commentId}">Approve</button>
            <button class="mod-reject mod-btn" data-comment-id="${commentId}">Reject</button>
            <button class="mod-delete mod-btn" data-comment-id="${commentId}">Delete</button>
          </div>
        `;

        commentsDiv.appendChild(div);
      });
    } catch (err) {
      errorDiv.textContent = err.message;
      errorDiv.style.display = "block";
    } finally {
      loadingDiv.style.display = "none";
    }
  };

  if (filterForm) {
    filterForm.addEventListener("submit", (e) => {
      e.preventDefault();
      loadComments();
    });
  }

  commentsDiv.addEventListener("click", async (e) => {
    const commentId = e.target.getAttribute("data-comment-id");
    if (!commentId) return;

    if (e.target.classList.contains("mod-approve")) {
      try {
        const response = await fetch(`/api/moderation/comment/${commentId}/approve`, { method: "POST" });
        const data = await response.json();
        if (data.ok) {
          document.getElementById(`comment-${commentId}`).remove();
        } else {
          alert(data.error || "Failed");
        }
      } catch (err) {
        alert("Error: " + err.message);
      }
    } else if (e.target.classList.contains("mod-reject")) {
      try {
        const response = await fetch(`/api/moderation/comment/${commentId}/reject`, { method: "POST" });
        const data = await response.json();
        if (data.ok) {
          document.getElementById(`comment-${commentId}`).remove();
        } else {
          alert(data.error || "Failed");
        }
      } catch (err) {
        alert("Error: " + err.message);
      }
    } else if (e.target.classList.contains("mod-delete")) {
      if (!confirm("Delete this comment?")) return;
      try {
        const response = await fetch(`/api/moderation/comment/${commentId}/delete`, { method: "POST" });
        const data = await response.json();
        if (data.ok) {
          document.getElementById(`comment-${commentId}`).remove();
        } else {
          alert(data.error || "Failed");
        }
      } catch (err) {
        alert("Error: " + err.message);
      }
    }
  });

  loadComments();
});

