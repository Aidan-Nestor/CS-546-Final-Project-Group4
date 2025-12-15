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
        div.style.border = "1px solid #2b3b52";
        div.style.padding = "15px";
        div.style.margin = "10px 0";
        div.style.background = "#161b22";
        const commentId = String(comment._id);
        div.id = `comment-${commentId}`;

        div.innerHTML = `
          <div><strong>${comment.username}</strong> - ${new Date(comment.createdAt).toLocaleString()}</div>
          <div style="margin: 10px 0;">${comment.content}</div>
          <div style="font-size: 0.9em; color: var(--muted);">
            Status: ${comment.status || "approved"} | 
            Reports: ${comment.reports ? comment.reports.length : 0}
            ${comment.incident ? ` | Incident: ${comment.incident.complaintType || "N/A"}` : ""}
          </div>
          <div style="margin-top: 10px;">
            <button class="mod-approve" data-comment-id="${commentId}" style="margin-right: 10px; padding: 5px 10px; cursor: pointer;">Approve</button>
            <button class="mod-reject" data-comment-id="${commentId}" style="margin-right: 10px; padding: 5px 10px; cursor: pointer;">Reject</button>
            <button class="mod-delete" data-comment-id="${commentId}" style="padding: 5px 10px; cursor: pointer;">Delete</button>
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

