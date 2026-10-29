// admin-newsletter.js
document.addEventListener("DOMContentLoaded", function () {
  const publishNewBtn = document.getElementById("publish-new-btn");
  const publishFormSection = document.getElementById("publish-form-section");
  const cancelBtn = document.getElementById("cancel-publish-btn");
  const finalPublishBtn = document.getElementById("final-publish-btn");

  if (publishNewBtn) {
    publishNewBtn.addEventListener("click", function () {
      publishFormSection.hidden = false;
      publishNewBtn.hidden = true;
      document.getElementById("newsletter-heading").focus();
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", function () {
      publishFormSection.hidden = true;
      publishNewBtn.hidden = false;
      clearForm();
    });
  }

  if (finalPublishBtn) {
    finalPublishBtn.addEventListener("click", function () {
      const heading = document.getElementById("newsletter-heading").value.trim();
      const writer = document.getElementById("writer-name").value.trim();
      const body = document.getElementById("main-body").value.trim();

      if (!heading || !writer || !body) {
        alert("Please fill all required fields: Heading, Writer’s Name and Body.");
        return;
      }

      alert("Newsletter published successfully! (Temporary message. Real saving will work after Firebase integration.)");
      clearForm();
      publishFormSection.hidden = true;
      publishNewBtn.hidden = false;
    });
  }

  function clearForm() {
    document.getElementById("newsletter-heading").value = "";
    document.getElementById("writer-name").value = "";
    document.getElementById("main-body").value = "";
    document.getElementById("glossary").value = "";
    document.getElementById("keywords").value = "";
  }
});
