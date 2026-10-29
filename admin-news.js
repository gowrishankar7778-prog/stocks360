// admin-news.js
document.addEventListener("DOMContentLoaded", function () {
  const publishNewBtn = document.getElementById("publish-new-btn");
  const publishFormSection = document.getElementById("publish-form-section");
  const cancelBtn = document.getElementById("cancel-publish-btn");
  const finalPublishBtn = document.getElementById("final-publish-btn");

  // Show publish form
  if (publishNewBtn) {
    publishNewBtn.addEventListener("click", function () {
      publishFormSection.hidden = false;
      publishNewBtn.hidden = true;
      document.getElementById("news-heading").focus();
    });
  }

  // Cancel form
  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      publishFormSection.hidden = true;
      publishNewBtn.hidden = false;
      clearForm();
    });
  }

  // Publish button
  if (finalPublishBtn) {
    finalPublishBtn.addEventListener("click", function () {
      const heading = document.getElementById("news-heading").value.trim();
      const writer = document.getElementById("writer-name").value.trim();
      const body = document.getElementById("main-body").value.trim();

      if (!heading || !writer || !body) {
        alert("Please fill all required fields: Heading, Writer’s Name and Main Body.");
        return;
      }

      // For now just show success (later we will save to Firebase)
      alert("News published successfully! (This is temporary. Real saving will work after Firebase integration.)");
      
      clearForm();
      publishFormSection.hidden = true;
      publishNewBtn.hidden = false;
    });
  }

  function clearForm() {
    document.getElementById("news-heading").value = "";
    document.getElementById("writer-name").value = "";
    document.getElementById("synopsis").value = "";
    document.getElementById("main-body").value = "";
    document.getElementById("glossary").value = "";
    document.getElementById("keywords").value = "";
  }
});
