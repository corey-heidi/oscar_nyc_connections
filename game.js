"use strict";

// ---------- Puzzle definition (static, one-off) ----------

const PUZZLE = {
  date: "July 9, 2026",
  groups: [
    {
      title: "NYC Boroughs",
      colour: "yellow",
      words: ["Bronx", "Queens", "Brooklyn", "Manhattan"],
    },
    {
      title: "Classic Cocktails",
      colour: "green",
      words: ["Cosmo", "Gimlet", "Mimosa", "Negroni"],
    },
    {
      title: "Rock Bands",
      colour: "blue",
      words: ["Queen", "Blondie", "Kiss", "Eagles"],
    },
    {
      title: "___ Street",
      colour: "purple",
      words: ["Wall", "Canal", "Main", "Easy"],
    },
  ],
};

const MAX_MISTAKES = 4;
const COLOUR_EMOJI = { yellow: "🟨", green: "🟩", blue: "🟦", purple: "🟪" };

// ---------- State ----------

let tiles = []; // { word, groupIndex }
let selected = new Set(); // words
let solvedGroups = []; // group indexes in solve order
let mistakes = 0;
let guessHistory = []; // arrays of groupIndexes, one per submit
let previousGuesses = new Set(); // serialised guesses, to catch repeats
let gameOver = false;
let animating = false;

// ---------- Elements ----------

const boardEl = document.getElementById("board");
const dotsEl = document.getElementById("mistake-dots");
const mistakesBarEl = document.getElementById("mistakes-bar");
const controlsEl = document.getElementById("controls");
const shuffleBtn = document.getElementById("shuffle-btn");
const deselectBtn = document.getElementById("deselect-btn");
const submitBtn = document.getElementById("submit-btn");
const toastEl = document.getElementById("toast");
const endgameEl = document.getElementById("endgame");
const endgameMessageEl = document.getElementById("endgame-message");
const endgameResultsEl = document.getElementById("endgame-results");
const playAgainBtn = document.getElementById("play-again-btn");

// ---------- Setup ----------

function init() {
  document.getElementById("puzzle-date").textContent = PUZZLE.date;

  tiles = PUZZLE.groups.flatMap((group, groupIndex) =>
    group.words.map((word) => ({ word, groupIndex }))
  );
  shuffle(tiles);

  selected = new Set();
  solvedGroups = [];
  mistakes = 0;
  guessHistory = [];
  previousGuesses = new Set();
  gameOver = false;
  animating = false;

  endgameEl.hidden = true;
  mistakesBarEl.style.visibility = "visible";
  controlsEl.style.display = "flex";
  dotsEl.querySelectorAll(".dot").forEach((d) => d.classList.remove("spent"));

  render();
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

// ---------- Rendering ----------

function render() {
  boardEl.innerHTML = "";

  for (const groupIndex of solvedGroups) {
    boardEl.appendChild(buildSolvedRow(groupIndex));
  }

  for (const tile of tiles) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tile";
    btn.textContent = tile.word;
    btn.dataset.word = tile.word;
    if (selected.has(tile.word)) btn.classList.add("selected");
    btn.addEventListener("click", () => onTileClick(tile.word, btn));
    boardEl.appendChild(btn);
  }

  updateButtons();
}

function buildSolvedRow(groupIndex) {
  const group = PUZZLE.groups[groupIndex];
  const row = document.createElement("div");
  row.className = `solved-group solved-group--${group.colour}`;
  row.innerHTML = `
    <span class="solved-group__title">${group.title}</span>
    <span class="solved-group__words">${group.words.join(", ")}</span>
  `;
  return row;
}

function updateButtons() {
  shuffleBtn.disabled = gameOver;
  deselectBtn.disabled = selected.size === 0 || gameOver;
  submitBtn.disabled = selected.size !== 4 || gameOver || animating;
}

// ---------- Interactions ----------

function onTileClick(word, btn) {
  if (gameOver || animating) return;

  if (selected.has(word)) {
    selected.delete(word);
    btn.classList.remove("selected");
  } else if (selected.size < 4) {
    selected.add(word);
    btn.classList.add("selected");
    btn.classList.add("bounce");
    btn.addEventListener("animationend", () => btn.classList.remove("bounce"), { once: true });
  }
  updateButtons();
}

shuffleBtn.addEventListener("click", () => {
  if (gameOver || animating) return;
  shuffle(tiles);
  render();
});

deselectBtn.addEventListener("click", () => {
  if (animating) return;
  selected.clear();
  render();
});

submitBtn.addEventListener("click", onSubmit);
playAgainBtn.addEventListener("click", init);

function onSubmit() {
  if (selected.size !== 4 || gameOver || animating) return;

  const guessWords = [...selected];
  const guessGroups = guessWords.map(
    (word) => tiles.find((t) => t.word === word).groupIndex
  );

  const key = [...guessWords].sort().join("|");
  if (previousGuesses.has(key)) {
    showToast("Already guessed!");
    return;
  }
  previousGuesses.add(key);
  guessHistory.push([...guessGroups].sort());

  const counts = {};
  for (const g of guessGroups) counts[g] = (counts[g] || 0) + 1;
  const bestMatch = Math.max(...Object.values(counts));

  if (bestMatch === 4) {
    handleCorrect(guessGroups[0]);
  } else {
    handleWrong(guessWords, bestMatch === 3);
  }
}

function handleCorrect(groupIndex) {
  animating = true;
  updateButtons();

  jumpSelectedTiles(() => {
    solvedGroups.push(groupIndex);
    tiles = tiles.filter((t) => t.groupIndex !== groupIndex);
    selected.clear();
    animating = false;
    render();

    if (solvedGroups.length === 4) {
      endGame(true);
    }
  });
}

function handleWrong(guessWords, oneAway) {
  animating = true;
  updateButtons();

  jumpSelectedTiles(() => {
    if (oneAway) showToast("One away...");

    mistakes++;
    const dots = dotsEl.querySelectorAll(".dot:not(.spent)");
    if (dots.length) dots[dots.length - 1].classList.add("spent");

    const guessedTiles = [...boardEl.querySelectorAll(".tile")].filter((el) =>
      guessWords.includes(el.dataset.word)
    );
    guessedTiles.forEach((el) => el.classList.add("shake"));

    setTimeout(() => {
      guessedTiles.forEach((el) => el.classList.remove("shake"));
      animating = false;

      if (mistakes >= MAX_MISTAKES) {
        showToast("Next time!");
        revealRemainingGroups(() => endGame(false));
      } else {
        updateButtons();
      }
    }, 600);
  });
}

// Sequential little hop on each selected tile, like the NYT submit animation.
function jumpSelectedTiles(done) {
  const selectedEls = [...boardEl.querySelectorAll(".tile.selected")];
  selectedEls.forEach((el, i) => {
    setTimeout(() => {
      el.classList.add("bounce");
      el.addEventListener("animationend", () => el.classList.remove("bounce"), { once: true });
    }, i * 120);
  });
  setTimeout(done, selectedEls.length * 120 + 350);
}

function revealRemainingGroups(done) {
  selected.clear();
  const remaining = PUZZLE.groups
    .map((_, i) => i)
    .filter((i) => !solvedGroups.includes(i));

  remaining.forEach((groupIndex, i) => {
    setTimeout(() => {
      solvedGroups.push(groupIndex);
      tiles = tiles.filter((t) => t.groupIndex !== groupIndex);
      render();
      if (i === remaining.length - 1) setTimeout(done, 500);
    }, (i + 1) * 700);
  });
}

// ---------- Endgame ----------

function endGame(won) {
  gameOver = true;
  updateButtons();

  mistakesBarEl.style.visibility = "hidden";
  controlsEl.style.display = "none";

  const messages = ["Perfect!", "Great!", "Solid!", "Phew!"];
  endgameMessageEl.textContent = won ? messages[mistakes] : "Next Time!";
  endgameResultsEl.textContent = guessHistory
    .map((groups) =>
      groups.map((g) => COLOUR_EMOJI[PUZZLE.groups[g].colour]).join("")
    )
    .join("\n");
  endgameEl.hidden = false;
}

// ---------- Toast ----------

let toastTimer = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.hidden = true;
  }, 2000);
}

init();
