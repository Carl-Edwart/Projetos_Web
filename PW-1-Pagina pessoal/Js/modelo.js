//BLOCO DO COKKIE

const img = document.getElementById("img_cokkie");

if (localStorage.getItem("cokkie_aceito") === "true") {
  img.style.display = "block";
}

//BLOCO DO PROFESSOR

const img2 = document.getElementById("prof");
const foto = img2.src;
let estado = 0;

img2.addEventListener('click', () =>{
    img2.style.transition = "0.6s ease-out";
    if(estado == 0){
        estado = 1; 
        img2.style.transform = "rotateY(180deg)";
        img2.style.filter = "grayscale(1)";
    }
    else{
        estado = 0; 
        img2.style.transform = "rotateY(0deg)";
        img2.style.filter = "grayscale(0)"; 
        img2.src = foto
    }
})