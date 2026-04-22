//BLOCO DO COKKIE

const img = document.getElementById("img_cokkie");

if (localStorage.getItem("cokkie_aceito") === "true") {
  img.style.display = "block";
}