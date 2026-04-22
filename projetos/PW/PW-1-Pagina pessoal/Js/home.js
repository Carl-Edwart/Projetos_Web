//BLOCO DO BACKGROUND COSTUMIZADO

const bg = document.getElementById("bg");
let estado = "fixed";
let lastScroll = window.scrollY;

function vh(v) {
  return window.innerHeight * v;
}

function onScroll() {
  const scroll = window.scrollY;
  const winH = window.innerHeight;
  const pageH = document.documentElement.scrollHeight;
  const descendo = scroll > lastScroll;
  const subindo = scroll < lastScroll;
  lastScroll = scroll;
  const limite = pageH - winH - vh(1.3);

  if (estado === "fixed" && descendo && scroll >= limite) {
    const rect = bg.getBoundingClientRect();
    const topDoc = scroll + rect.top;
    bg.style.position = "absolute";
    bg.style.top = `${topDoc}px`;
    estado = "absolute";
    return;
  }

  if (estado === "absolute" && subindo && scroll < limite) {
    bg.style.position = "fixed";
    bg.style.top = "20vh";
    estado = "fixed";
    return;
  }
}

window.addEventListener("scroll", onScroll);

const fundo = document.getElementById("fundo");

document.addEventListener("mousedown", () => {
    fundo.style.filter = "blur(0px)";
});

document.addEventListener("mouseup", () => {
    fundo.style.filter = "blur(5px)";
});

//BLOCO DO COKKIE

const img = document.getElementById("img_cokkie");

if (localStorage.getItem("cokkie_aceito") === "true") {
  img.style.display = "block";
}

//BLOCO DO MOUSE

const cursor = document.getElementById("cursor-magic");

document.addEventListener("mousemove", e => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top  = e.clientY + "px";
});

const colors = [
    "#ffffff",
    "#ff4d4d",
    "#ffb84d",
    "#ffff4d",
    "#4dff4d",
    "#4dffff",
    "#4d4dff",
    "#b84dff"
];

let colorIndex = 0;

setInterval(() => {
    cursor.style.backgroundColor = colors[colorIndex];
    cursor.style.color = colors[colorIndex];
    colorIndex = (colorIndex + 1) % colors.length;
}, 1000);

document.addEventListener("click", e => {
    for(let i = 0; i < 10; i++){
        createParticle(e.clientX, e.clientY);
    }
});

function createParticle(x, y){
    const particle = document.createElement("div");
    particle.classList.add("magic-particle");

    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 40 + 10;

    particle.style.left = x + "px";
    particle.style.top  = y + "px";

    particle.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--y", `${Math.sin(angle) * distance}px`);

    // herda a cor atual do cursor
    particle.style.color = getComputedStyle(cursor).color;

    document.body.appendChild(particle);

    setTimeout(() => particle.remove(), 700);
}
let emitting = false;
let mouseX = 0;
let mouseY = 0;

document.addEventListener("mousemove", e => {
    mouseX = e.clientX;
    mouseY = e.clientY;
});

document.addEventListener("mousedown", () => {
    emitting = true;
    emitParticles();
});

document.addEventListener("mouseup", () => {
    emitting = false;
});

document.addEventListener("mouseleave", () => {
    emitting = false;
});

function emitParticles(){
    if(!emitting) return;

    for(let i = 0; i < 3; i++){
        createParticle(mouseX, mouseY);
    }

    requestAnimationFrame(emitParticles);
}