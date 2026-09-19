const menuBtn = document.querySelector(".menu-btn");
const navLinks = document.getElementById("navLinks");
menuBtn?.addEventListener("click", () => navLinks.classList.toggle("open"));
document.querySelectorAll("#navLinks a").forEach(a => a.addEventListener("click", () => navLinks.classList.remove("open")));

const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
document.querySelectorAll(".gallery-item").forEach(item => {
  item.addEventListener("click", () => {
    lightboxImg.src = item.dataset.image;
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
  });
});
document.querySelector(".close").addEventListener("click", closeLightbox);
lightbox.addEventListener("click", e => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeLightbox(); });
function closeLightbox() {
  lightbox.classList.remove("open");
  lightbox.setAttribute("aria-hidden", "true");
}
