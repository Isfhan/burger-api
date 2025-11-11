
const button = document.querySelector("button");
button.addEventListener("click", () => {
    alert("Button clicked");
});

const input = document.querySelector("input");
input.addEventListener("input", (e) => {
    console.log(e.target.value);
});



