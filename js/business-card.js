(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var trigger = document.querySelector(".business-card-menu .dropbtn");
    var content = document.querySelector(".business-card-menu .dropdown-content");
    if (!trigger || !content) return;

    trigger.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      content.classList.toggle("is-open");
    });

    document.addEventListener("click", function (e) {
      if (!content.classList.contains("is-open")) return;
      if (content.contains(e.target) || trigger.contains(e.target)) return;
      content.classList.remove("is-open");
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") content.classList.remove("is-open");
    });
  });
})();
