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
    resultDiv.textContent = "";
    const loadingP = document.createElement("p");
    loadingP.textContent = "Fetching data from NYC 311 API...";
    resultDiv.appendChild(loadingP);
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

      resultDiv.textContent = "";
      const container = document.createElement("div");
      
      if (result.ok) {
        const successP = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = "Success!";
        successP.appendChild(strong);
        container.appendChild(successP);
        
        const messageP = document.createElement("p");
        messageP.textContent = result.message || "";
        container.appendChild(messageP);
        
        const savedP = document.createElement("p");
        savedP.textContent = `Saved: ${result.saved} incident(s)`;
        container.appendChild(savedP);
        
        if (result.zip) {
          const zipP = document.createElement("p");
          zipP.textContent = `ZIP: ${result.zip}`;
          container.appendChild(zipP);
        }
        
        resultDiv.appendChild(container);
        resultDiv.className = "ingest-result success";
      } else {
        const errorP = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = "Error:";
        errorP.appendChild(strong);
        container.appendChild(errorP);
        
        const errorMsgP = document.createElement("p");
        errorMsgP.textContent = result.error || "Unknown error occurred.";
        container.appendChild(errorMsgP);
        
        resultDiv.appendChild(container);
        resultDiv.className = "ingest-result error";
      }
    } catch (err) {
      resultDiv.textContent = "";
      const container = document.createElement("div");
      
      const failedP = document.createElement("p");
      const strong = document.createElement("strong");
      strong.textContent = "Request Failed:";
      failedP.appendChild(strong);
      container.appendChild(failedP);
      
      const errorMsgP = document.createElement("p");
      errorMsgP.textContent = err.message || "Network error. Please try again.";
      container.appendChild(errorMsgP);
      
      resultDiv.appendChild(container);
      resultDiv.className = "ingest-result error";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  });
});

