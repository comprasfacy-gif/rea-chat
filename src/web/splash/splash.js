const QUOTES = [
  "Aborbing the Contents",
  "Additive Parsing the Load",
  "Commence Monosaturated Goodening",
  "Kick Off the Multi-Core Widening",
  "Bastening the Game Turkey",
  "Abstracting the Rummage Disc",
  "Undecerealenizing the Process",
  "Postrefragmenting the Widget Layer",
  "Satisfying the Constraints",
  "Abnoramalzing Some of the Matrices",
  "Optimizing the People",
  "Proclaigerizing the Network"
];

const STATUS = {
  "checking-for-updates": "Checking for updates...",
  "downloading-updates": "Downloading updates...",
  "installing-updates": "Installing updates...",
  "launching": "Starting..."
};

function quote() {
  return QUOTES[Math.floor(Math.random() * QUOTES.length)];
}

function render(state) {
  const mount = document.getElementById("splash-mount");
  if (!mount) return;
  const status = STATUS[state.status] || "Checking for updates...";
  mount.innerHTML = `
  <div id="splash">
    <div class="splash-inner">
      <video autoplay width="200" height="200" loop id="splash-video">
        <source src="./connecting.webm" type="video/webm" />
      </video>
      <div class="splash-text">
        <span class="splash-status">${status}</span>
        <div class="progress-placeholder">&nbsp;</div>
      </div>
    </div>
  </div>`;
  const video = document.getElementById("splash-video");
  if (video) video.addEventListener("loadeddata", () => video.classList.add("loaded"));
}

window.Splash = {
  render,
  status(text) {
    const el = document.querySelector(".splash-status");
    if (el) el.textContent = text;
  },
  quote
};

window.addEventListener("DOMContentLoaded", () => render({ status: "checking-for-updates" }));