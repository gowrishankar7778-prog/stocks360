// admin-ask.js
document.addEventListener("DOMContentLoaded", function () {

  // Handle Reply button - automatically add @Name
  document.querySelectorAll(".reply-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const commentItem = btn.closest(".comment-item");
      const replyBox = commentItem.querySelector(".reply-box");
      const replyInput = commentItem.querySelector(".reply-input");
      const userName = btn.getAttribute("data-user") || "User";

      // Close other reply boxes
      document.querySelectorAll(".reply-box").forEach(function (box) {
        box.hidden = true;
      });

      replyBox.hidden = false;
      // Automatically add @Name
      replyInput.value = "@" + userName + " ";
      replyInput.focus();
    });
  });

  // Cancel Reply
  document.querySelectorAll(".cancel-reply-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const replyBox = btn.closest(".reply-box");
      replyBox.hidden = true;
    });
  });

  // Send Reply
  document.querySelectorAll(".send-reply-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const replyBox = btn.closest(".reply-box");
      const replyInput = replyBox.querySelector(".reply-input");
      const replyText = replyInput.value.trim();

      if (replyText === "") {
        alert("Please write a reply.");
        return;
      }

      alert("Reply sent successfully!\n\n" + replyText + "\n\n(This is temporary. Real replies will work after Firebase integration.)");
      
      replyInput.value = "";
      replyBox.hidden = true;
    });
  });

  // Delete button
  document.querySelectorAll(".delete-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (confirm("Are you sure you want to delete this comment?")) {
        const item = btn.closest(".comment-item");
        item.remove();
        alert("Comment deleted. (Temporary - real delete will work after Firebase)");
      }
    });
  });
});
