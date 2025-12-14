document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("ingestForm");
  const resultDiv = document.getElementById("ingestResult");

  if (!form || !resultDiv) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    
    const formData = new FormData(form);
    const data = {
      zip: formData.get("zip") || undefined,
      days: Number(formData.get("days")) || 30,
      limit: Number(formData.get("limit")) || 1000
    };

    if (!data.zip) delete data.zip;

    resultDiv.style.display = "block";
    resultDiv.innerHTML = "<p>Fetching data from NYC 311 API...</p>";
    resultDiv.className = "ingest-result";

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Fetching...";

    try {
      const response = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (result.ok) {
        resultDiv.innerHTML = `
          <div>
            <p><strong>Success!</strong></p>
            <p>${result.message}</p>
            <p>Saved: ${result.saved} incident(s)</p>
            ${result.zip ? `<p>ZIP: ${result.zip}</p>` : ""}
          </div>
        `;
        resultDiv.className = "ingest-result success";
      } else {
        resultDiv.innerHTML = `
          <div>
            <p><strong>Error:</strong></p>
            <p>${result.error}</p>
          </div>
        `;
        resultDiv.className = "ingest-result error";
      }
    } catch (err) {
      resultDiv.innerHTML = `
        <div>
          <p><strong>Request Failed:</strong></p>
          <p>${err.message || "Network error. Please try again."}</p>
        </div>
      `;
      resultDiv.className = "ingest-result error";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  });
});

